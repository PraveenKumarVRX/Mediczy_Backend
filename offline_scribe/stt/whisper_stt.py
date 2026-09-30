"""
Speech-to-Text Service - Offline Whisper Integration

Handles audio transcription using Whisper (CPU-only):
- whisper.cpp for fast CPU inference
- OR faster-whisper for Python integration
- Support for Hindi, Tamil, Telugu, English
- Voice Activity Detection (VAD)
"""

import logging
from typing import Optional, Dict, Any, List
from pathlib import Path
import time
import tempfile
import subprocess
import json
import wave
import os
import shutil
import re

# Try multiple whisper implementations
try:
    from faster_whisper import WhisperModel
    FASTER_WHISPER_AVAILABLE = True
except Exception:
    FASTER_WHISPER_AVAILABLE = False
    WhisperModel = None

try:
    import whisper
    OPENAI_WHISPER_AVAILABLE = True
except Exception:
    OPENAI_WHISPER_AVAILABLE = False
    whisper = None

from config import (
    WHISPER_MODEL,
    WHISPER_MODEL_PATH,
    WHISPER_CONFIG,
    AUDIO_CONFIG,
    SUPPORTED_LANGUAGES,
)

logger = logging.getLogger(__name__)

VALID_WHISPER_LANGUAGES = {
    "auto", "en", "hi", "ta", "te", "kn", "ml", "mr", "bn", "gu", "pa", "ur"
}

INDIC_LANGUAGES = {"hi", "ta", "te", "kn", "ml", "mr", "bn", "gu", "pa", "ur"}

LANGUAGE_ALIASES = {
    "english": "en",
    "hindi": "hi",
    "tamil": "ta",
    "telugu": "te",
    "kannada": "kn",
    "malayalam": "ml",
    "marathi": "mr",
    "bengali": "bn",
    "gujarati": "gu",
    "punjabi": "pa",
    "urdu": "ur",
    "mixed": "auto",
    "multi": "auto",
    "multilingual": "auto",
    "code-switch": "auto",
    "codeswitch": "auto",
    "colloquial": "auto",
    "hinglish": "auto",
    "tanglish": "auto",
}


def normalize_transcription_language(language: Optional[str]) -> str:
    if not language:
        return "auto"
    normalized = str(language).strip().lower()
    normalized = LANGUAGE_ALIASES.get(normalized, normalized)
    return normalized if normalized in VALID_WHISPER_LANGUAGES else "auto"


def infer_detected_languages(text: str, primary_hint: Optional[str]) -> Dict[str, Any]:
    normalized_text = (text or "").strip()
    hint = normalize_transcription_language(primary_hint)

    script_patterns = {
        "hi": r"[\u0900-\u097F]",
        "ta": r"[\u0B80-\u0BFF]",
        "te": r"[\u0C00-\u0C7F]",
        "kn": r"[\u0C80-\u0CFF]",
        "ml": r"[\u0D00-\u0D7F]",
        "bn": r"[\u0980-\u09FF]",
        "gu": r"[\u0A80-\u0AFF]",
        "pa": r"[\u0A00-\u0A7F]",
        "ur": r"[\u0600-\u06FF]",
    }

    scores = {}
    if normalized_text:
        english_score = len(re.findall(r"[A-Za-z]", normalized_text))
        if english_score > 0:
            scores["en"] = english_score

        for lang_code, pattern in script_patterns.items():
            count = len(re.findall(pattern, normalized_text))
            if count > 0:
                scores[lang_code] = count

    detected = [code for code, _ in sorted(scores.items(), key=lambda kv: kv[1], reverse=True)]

    if hint != "auto" and hint not in detected:
        detected.insert(0, hint)

    if not detected:
        detected = [hint if hint != "auto" else "en"]

    primary_language = detected[0]
    code_switching = len(detected) > 1

    return {
        "primary_language": primary_language,
        "detected_languages": detected,
        "code_switching": code_switching,
    }


def parse_whisper_cli_detect_output(output: str) -> Dict[str, Any]:
    combined = output or ""

    lang_match = re.search(
        r"(?:detected\s+language|language)\s*[:=]\s*([a-z]{2})",
        combined,
        re.IGNORECASE,
    )
    confidence_match = re.search(
        r"(?:p|prob(?:ability)?)\s*[:=]\s*([0-9]*\.?[0-9]+)",
        combined,
        re.IGNORECASE,
    )

    language = normalize_transcription_language(lang_match.group(1)) if lang_match else "auto"
    confidence = float(confidence_match.group(1)) if confidence_match else 0.0

    return {
        "language": language,
        "confidence": confidence,
        "success": bool(lang_match),
    }


def select_whisper_model_path(language: str) -> Path:
    strategy = os.getenv("STT_MODEL_STRATEGY", "smart").strip().lower()
    if strategy not in {"smart", "default"}:
        strategy = "smart"

    default_model = WHISPER_MODEL_PATH
    small_model = Path("/home/ubuntu/models/ggml-small.bin")

    if strategy == "default":
        return default_model

    # Smart strategy:
    # - English-only hint keeps lower-latency default model
    # - Indic or auto/mixed hint uses small model for better multilingual quality if available
    if language == "en":
        return default_model

    if language in INDIC_LANGUAGES or language == "auto":
        if small_model.exists():
            return small_model

    return default_model


def describe_selected_whisper_model(language: str = "auto") -> Dict[str, Any]:
    selected = select_whisper_model_path(normalize_transcription_language(language))
    return {
        "strategy": os.getenv("STT_MODEL_STRATEGY", "smart").strip().lower() or "smart",
        "configured_model": WHISPER_MODEL,
        "configured_model_path": str(WHISPER_MODEL_PATH),
        "selected_model": selected.name,
        "selected_model_path": str(selected),
        "selected_model_exists": selected.exists(),
    }


class WhisperSTT:
    """
    Offline Speech-to-Text using Whisper.
    
    Supports multiple backends:
    1. faster-whisper (recommended for CPU)
    2. whisper.cpp (via subprocess)
    3. openai-whisper (fallback)
    """
    
    def __init__(self, model_size: str = None):
        self.model_size = model_size or WHISPER_MODEL
        self.model = None
        self.backend = None
        self._load_model()
    
    def _load_model(self):
        """Load Whisper model with best available backend"""
        preferred_backend = os.getenv("STT_BACKEND", os.getenv("WHISPER_BACKEND", "auto")).strip().lower()
        whisper_cpp_bin = self._find_whisper_cpp()

        if preferred_backend in {"whisper-cpp", "whisper_cpp", "cpp"}:
            if whisper_cpp_bin and WHISPER_MODEL_PATH.exists():
                self.backend = "whisper-cpp"
                logger.info(f"✅ whisper.cpp selected by STT_BACKEND (bin={whisper_cpp_bin})")
                return
            logger.warning(
                f"STT_BACKEND={preferred_backend} requested but whisper.cpp is unavailable "
                f"(bin={bool(whisper_cpp_bin)}, model={WHISPER_MODEL_PATH.exists()})"
            )
        
        # Try faster-whisper first (best for CPU)
        if FASTER_WHISPER_AVAILABLE:
            try:
                logger.info(f"Loading faster-whisper ({self.model_size})...")
                self.model = WhisperModel(
                    self.model_size,
                    device="cpu",
                    compute_type="int8",  # Quantized for CPU
                    cpu_threads=os.cpu_count() or 4,
                )
                self.backend = "faster-whisper"
                logger.info(f"✅ faster-whisper loaded (CPU, int8 quantized)")
                return
            except Exception as e:
                logger.warning(f"faster-whisper failed: {e}")
        
        # Try openai-whisper as fallback
        if OPENAI_WHISPER_AVAILABLE:
            try:
                logger.info(f"Loading openai-whisper ({self.model_size})...")
                self.model = whisper.load_model(self.model_size, device="cpu")
                self.backend = "openai-whisper"
                logger.info(f"✅ openai-whisper loaded (CPU)")
                return
            except Exception as e:
                logger.warning(f"openai-whisper failed: {e}")
        
        # Check for whisper.cpp binary
        if whisper_cpp_bin and WHISPER_MODEL_PATH.exists():
            self.backend = "whisper-cpp"
            logger.info(f"✅ whisper.cpp available (CLI, bin={whisper_cpp_bin})")
            return
        
        logger.error("No Whisper backend available!")
        logger.info("Install one of:")
        logger.info("  pip install faster-whisper")
        logger.info("  pip install openai-whisper")
        logger.info("  Build whisper.cpp from source")
    
    def _is_whisper_cpp_binary(self, path: str) -> bool:
        """Confirm a resolved path is actually whisper.cpp's CLI, not a same-named
        script from another package. FIX (2026-09-30): shutil.which("whisper") on this
        host resolved to the openai-whisper pip package's CLI (~/.local/bin/whisper),
        which shares the name but crashes at inference time needing torch+CUDA, which
        this CPU host does not have. self.backend was set to "whisper-cpp" (the model
        .bin file existed), so every transcription silently invoked the wrong program.
        whisper.cpp's --help prints "usage:" and mentions ggml; the pip CLI does not."""
        try:
            result = subprocess.run([path, "--help"], capture_output=True, text=True, timeout=10)
            output = (result.stdout + result.stderr).lower()
            return "ggml" in output or ("usage:" in output and "-bs" in output)
        except Exception:
            return False

    def _find_whisper_cpp(self) -> Optional[str]:
        """Find whisper.cpp binary"""
        explicit = os.getenv("WHISPER_CPP_BIN")
        if explicit and Path(explicit).exists():
            return explicit

        possible_paths = [
            "/home/ubuntu/Mediczy/whisper.cpp/build/bin/whisper-cli",
            "/usr/local/bin/whisper-cli",
            "/usr/bin/whisper-cli",
            "/usr/local/bin/whisper-cpp",
            "./whisper",
            "../whisper.cpp/main",
        ]
        for path in possible_paths:
            if Path(path).exists() and self._is_whisper_cpp_binary(path):
                return path

        # Last resort: PATH lookup, but only "whisper-cli"/"main" — never bare
        # "whisper", which collides with the openai-whisper pip package's CLI —
        # and still verified before use.
        for binary in ["whisper-cli", "main"]:
            resolved = shutil.which(binary)
            if resolved and self._is_whisper_cpp_binary(resolved):
                return resolved

        return None

    def _detect_language_whisper_cpp(self, audio_path: str, language_hint: str) -> Dict[str, Any]:
        whisper_bin = self._find_whisper_cpp()
        if not whisper_bin:
            return {"success": False, "language": language_hint, "confidence": 0.0}

        model_path = select_whisper_model_path(language_hint)
        if not model_path.exists():
            return {"success": False, "language": language_hint, "confidence": 0.0}

        timeout_seconds = 120
        try:
            with wave.open(audio_path, 'rb') as wf:
                frames = wf.getnframes()
                rate = wf.getframerate()
                duration_seconds = frames / float(rate)
                timeout_seconds = max(120, int(duration_seconds * 3))
        except Exception:
            pass

        cmd = [
            whisper_bin,
            "-m", str(model_path),
            "-f", audio_path,
            "-dl",
            "-np",
        ]

        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_seconds)
            parsed = parse_whisper_cli_detect_output(f"{proc.stdout}\n{proc.stderr}")
            if parsed.get("success"):
                return parsed
            return {"success": False, "language": language_hint, "confidence": 0.0}
        except Exception:
            return {"success": False, "language": language_hint, "confidence": 0.0}
    
    def transcribe(
        self,
        audio_path: str,
        language: str = "auto",
        translate: bool = False,
        chunk_seconds: Optional[int] = None,
        vad: Optional[bool] = None,
        beam_size: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Transcribe audio file to text.
        
        Args:
            audio_path: Path to audio file (WAV preferred)
            language: Language code (hi/ta/te/en/auto)
            translate: Whether to translate to English
        
        Returns:
            Dict with transcription result
        """
        if not self.model and self.backend != "whisper-cpp":
            return {
                "success": False,
                "error": "No Whisper model loaded",
                "text": "",
            }

        language = normalize_transcription_language(language)
        start_time = time.time()

        # Best-practice for consultation recordings: chunk long audio to avoid truncation
        # and preserve full conversation coverage.
        try:
            with wave.open(audio_path, 'rb') as wf:
                frames = wf.getnframes()
                rate = wf.getframerate()
                duration_seconds = frames / float(rate)
        except Exception:
            duration_seconds = 0.0

        chunking_enabled = os.getenv("STT_ENABLE_CHUNKING", "true").lower() == "true"
        default_chunk = int(os.getenv("STT_CHUNK_DURATION", str(AUDIO_CONFIG.get("chunk_duration", 30))))
        chunk_duration = int(chunk_seconds or default_chunk)

        # Audio pre-pass language detection (authoritative) to improve mixed Indic/English handling.
        prepass_language = language
        prepass_confidence = 0.0
        if self.backend == "whisper-cpp" and language == "auto":
            detected = self._detect_language_whisper_cpp(audio_path, language)
            if detected.get("success") and detected.get("language") in VALID_WHISPER_LANGUAGES:
                prepass_language = detected.get("language")
                prepass_confidence = detected.get("confidence", 0.0)

        if chunking_enabled and duration_seconds > (chunk_duration + 5):
            processor = AudioProcessor()
            chunk_paths = processor.chunk_audio(audio_path, chunk_duration=chunk_duration)
            chunk_texts = []

            for chunk_path in chunk_paths:
                if self.backend == "faster-whisper":
                    chunk_result = self._transcribe_faster_whisper(
                        chunk_path,
                        prepass_language,
                        translate,
                        vad_filter=vad,
                        beam_size=beam_size,
                    )
                elif self.backend == "openai-whisper":
                    chunk_result = self._transcribe_openai_whisper(chunk_path, prepass_language, translate)
                elif self.backend == "whisper-cpp":
                    chunk_result = self._transcribe_whisper_cpp(
                        chunk_path,
                        prepass_language,
                        translate,
                        beam_size=beam_size,
                    )
                else:
                    chunk_result = {"success": False, "error": "No transcription backend available", "text": ""}

                if not chunk_result.get("success"):
                    return chunk_result

                chunk_texts.append((chunk_result.get("text") or "").strip())

                if chunk_path != audio_path:
                    try:
                        os.unlink(chunk_path)
                    except Exception:
                        pass

            combined_text = " ".join([t for t in chunk_texts if t]).strip()
            language_meta = infer_detected_languages(combined_text, prepass_language)
            transcription_time = time.time() - start_time
            chunked = len(chunk_paths) > 1
            return {
                "success": True,
                "text": combined_text,
                "language": language_meta["primary_language"],
                "detected_languages": language_meta["detected_languages"],
                "code_switching": language_meta["code_switching"],
                "chunked": chunked,
                "chunks_processed": len(chunk_paths),
                "backend": self.backend,
                "language_probability": prepass_confidence,
                "audio_duration": duration_seconds,
                "transcription_time": transcription_time,
                "realtime_factor": (transcription_time / duration_seconds) if duration_seconds > 0 else 0,
            }
        
        try:
            # Route to appropriate backend
            if self.backend == "faster-whisper":
                result = self._transcribe_faster_whisper(
                    audio_path,
                    prepass_language,
                    translate,
                    vad_filter=vad,
                    beam_size=beam_size,
                )
            elif self.backend == "openai-whisper":
                result = self._transcribe_openai_whisper(audio_path, prepass_language, translate)
            elif self.backend == "whisper-cpp":
                result = self._transcribe_whisper_cpp(
                    audio_path,
                    prepass_language,
                    translate,
                    beam_size=beam_size,
                )
            else:
                return {
                    "success": False,
                    "error": "No transcription backend available",
                    "text": "",
                }
            
            transcription_time = time.time() - start_time
            result["transcription_time"] = transcription_time
            result["backend"] = self.backend
            
            # Get audio duration
            try:
                with wave.open(audio_path, 'rb') as wf:
                    frames = wf.getnframes()
                    rate = wf.getframerate()
                    duration = frames / float(rate)
                    result["audio_duration"] = duration
                    result["realtime_factor"] = transcription_time / duration if duration > 0 else 0
            except:
                pass

            language_meta = infer_detected_languages(result.get("text", ""), result.get("language", prepass_language))
            result["language"] = language_meta["primary_language"]
            result["detected_languages"] = language_meta["detected_languages"]
            result["code_switching"] = language_meta["code_switching"]
            if result.get("language_probability", 0) == 0 and prepass_confidence > 0:
                result["language_probability"] = prepass_confidence
            
            return result
            
        except Exception as e:
            logger.error(f"Transcription error: {e}")
            return {
                "success": False,
                "error": str(e),
                "text": "",
            }
    
    def _transcribe_faster_whisper(
        self,
        audio_path: str,
        language: str,
        translate: bool,
        vad_filter: Optional[bool] = None,
        beam_size: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Transcribe using faster-whisper"""
        
        # Map language codes
        lang_code = None if language == "auto" else language
        
        segments, info = self.model.transcribe(
            audio_path,
            language=lang_code,
            task="translate" if translate else "transcribe",
            beam_size=beam_size if beam_size is not None else WHISPER_CONFIG["beam_size"],
            word_timestamps=WHISPER_CONFIG["word_timestamps"],
            vad_filter=vad_filter if vad_filter is not None else WHISPER_CONFIG["vad_filter"],
        )
        
        # Collect segments
        text_parts = []
        word_timestamps = []
        
        for segment in segments:
            text_parts.append(segment.text)
            
            if hasattr(segment, 'words') and segment.words:
                for word in segment.words:
                    word_timestamps.append({
                        "word": word.word,
                        "start": word.start,
                        "end": word.end,
                        "probability": word.probability,
                    })
        
        full_text = " ".join(text_parts).strip()
        
        return {
            "success": True,
            "text": full_text,
            "language": info.language,
            "language_probability": info.language_probability,
            "word_timestamps": word_timestamps if word_timestamps else None,
        }
    
    def _transcribe_openai_whisper(
        self,
        audio_path: str,
        language: str,
        translate: bool,
    ) -> Dict[str, Any]:
        """Transcribe using openai-whisper"""
        
        options = {
            "task": "translate" if translate else "transcribe",
            "fp16": False,  # CPU mode
            "verbose": False,
        }
        
        if language != "auto":
            options["language"] = language
        
        result = self.model.transcribe(audio_path, **options)
        
        return {
            "success": True,
            "text": result["text"].strip(),
            "language": result.get("language", "unknown"),
            "segments": result.get("segments", []),
        }
    
    def _transcribe_whisper_cpp(
        self,
        audio_path: str,
        language: str,
        translate: bool,
        beam_size: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Transcribe using whisper.cpp CLI"""
        
        whisper_bin = self._find_whisper_cpp()
        if not whisper_bin:
            return {
                "success": False,
                "error": "whisper.cpp binary not found",
                "text": "",
            }

        model_path = select_whisper_model_path(language)

        if not model_path.exists():
            return {
                "success": False,
                "error": f"Whisper model not found at {model_path}",
                "text": "",
            }

        output_prefix = tempfile.mktemp(prefix="whisper_cpp_")
        
        # Build command
        cmd = [
            whisper_bin,
            "-m", str(model_path),
            "-f", audio_path,
            "-otxt",
            "-of", output_prefix,
            "--threads", str(os.cpu_count() or 4),
            "-bs", str(beam_size if beam_size is not None else WHISPER_CONFIG.get("beam_size", 5)),
        ]
        
        if language != "auto":
            cmd.extend(["-l", language])
        
        if translate:
            cmd.append("--translate")
        
        # Run whisper.cpp — always clean up temp file regardless of outcome
        output_file = Path(f"{output_prefix}.txt")
        try:
            timeout_seconds = 300
            try:
                with wave.open(audio_path, 'rb') as wf:
                    frames = wf.getnframes()
                    rate = wf.getframerate()
                    duration_seconds = frames / float(rate)
                    timeout_seconds = max(300, int(duration_seconds * 6))
            except Exception:
                pass

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
            )

            if result.returncode == 0 and output_file.exists():
                text = output_file.read_text().strip()
                return {
                    "success": True,
                    "text": text,
                    "language": language,
                    "model_used": model_path.name,
                }

            return {
                "success": False,
                "error": result.stderr or f"whisper-cli exited {result.returncode}",
                "text": "",
            }

        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "error": "Transcription timeout",
                "text": "",
            }
        finally:
            output_file.unlink(missing_ok=True)
    
    def detect_language(self, audio_path: str) -> Dict[str, Any]:
        """
        Detect language from audio without full transcription.
        
        Returns:
            Dict with detected language and confidence
        """
        if self.backend == "faster-whisper" and self.model:
            try:
                # Use first 30 seconds for detection
                _, info = self.model.transcribe(
                    audio_path,
                    language=None,
                    vad_filter=True,
                )
                
                return {
                    "success": True,
                    "language": info.language,
                    "confidence": info.language_probability,
                    "language_name": SUPPORTED_LANGUAGES.get(info.language, {}).get("name", "Unknown"),
                }
            except Exception as e:
                logger.error(f"Language detection error: {e}")
        
        return {
            "success": False,
            "language": "unknown",
            "confidence": 0.0,
        }
    
    def health_check(self) -> Dict[str, Any]:
        """Check STT service health"""
        model_info = describe_selected_whisper_model("auto")
        return {
            "status": "healthy" if self.model or self.backend == "whisper-cpp" else "unhealthy",
            "backend": self.backend,
            "model_size": self.model_size,
            "model": model_info,
            "supported_languages": [
                code for code, lang in SUPPORTED_LANGUAGES.items() 
                if lang.get("enabled", False)
            ],
        }


# =============================================================================
# AUDIO PROCESSOR (Pre-processing)
# =============================================================================

class AudioProcessor:
    """
    Audio pre-processing for optimal transcription.
    
    Features:
    - Format conversion to WAV 16kHz mono
    - Noise suppression (optional)
    - Voice Activity Detection
    - Chunking for long recordings
    """
    
    def __init__(self):
        self.sample_rate = AUDIO_CONFIG["sample_rate"]
        self.channels = AUDIO_CONFIG["channels"]
    
    def convert_to_wav(self, input_path: str, output_path: str = None) -> str:
        """
        Convert audio to WAV 16kHz mono format.
        
        Uses ffmpeg if available, otherwise pydub.
        """
        if output_path is None:
            output_path = tempfile.mktemp(suffix=".wav")
        
        # Try ffmpeg first
        try:
            cmd = [
                "ffmpeg", "-y",
                "-i", input_path,
                "-ar", str(self.sample_rate),
                "-ac", str(self.channels),
                "-acodec", "pcm_s16le",
                output_path,
            ]
            result = subprocess.run(cmd, capture_output=True, timeout=60)
            out = Path(output_path)
            if result.returncode == 0 and out.exists() and out.stat().st_size > 44:
                return output_path
            logger.warning("ffmpeg conversion failed (rc=%d): %s", result.returncode, result.stderr[:200])
        except Exception as e:
            logger.warning("ffmpeg conversion error: %s", e)

        # Try pydub as fallback
        try:
            from pydub import AudioSegment
            audio = AudioSegment.from_file(input_path)
            audio = audio.set_frame_rate(self.sample_rate)
            audio = audio.set_channels(self.channels)
            audio.export(output_path, format="wav")
            out = Path(output_path)
            if out.exists() and out.stat().st_size > 44:
                return output_path
            logger.warning("pydub produced an empty or header-only WAV file")
        except Exception as e:
            logger.warning("pydub conversion error: %s", e)

        raise RuntimeError("Could not convert audio. Install ffmpeg or pydub.")
    
    def get_duration(self, audio_path: str) -> float:
        """Get audio duration in seconds"""
        try:
            with wave.open(audio_path, 'rb') as wf:
                frames = wf.getnframes()
                rate = wf.getframerate()
                return frames / float(rate)
        except:
            return 0.0
    
    def chunk_audio(
        self,
        audio_path: str,
        chunk_duration: int = 30,
    ) -> List[str]:
        """
        Split long audio into chunks for processing.
        
        Args:
            audio_path: Path to audio file
            chunk_duration: Duration of each chunk in seconds
        
        Returns:
            List of chunk file paths
        """
        try:
            from pydub import AudioSegment

            audio = AudioSegment.from_wav(audio_path)
            duration_ms = len(audio)
            chunk_ms = chunk_duration * 1000

            chunks = []
            for i, start in enumerate(range(0, duration_ms, chunk_ms)):
                end = min(start + chunk_ms, duration_ms)
                chunk = audio[start:end]
                chunk_path = tempfile.mktemp(suffix=f"_chunk{i}.wav")
                chunk.export(chunk_path, format="wav")
                chunks.append(chunk_path)

            return chunks
        except ImportError:
            pass
        except Exception as e:
            logger.warning("pydub chunking failed: %s", e)

        # Fallback: ffmpeg-based segmentation when pydub isn't available
        try:
            chunks_dir = Path(tempfile.mkdtemp(prefix="stt_chunks_"))
            output_pattern = str(chunks_dir / "chunk_%03d.wav")
            cmd = [
                "ffmpeg", "-y",
                "-i", audio_path,
                "-f", "segment",
                "-segment_time", str(chunk_duration),
                "-ac", str(self.channels),
                "-ar", str(self.sample_rate),
                "-acodec", "pcm_s16le",
                output_pattern,
            ]
            result = subprocess.run(cmd, capture_output=True, timeout=120)
            if result.returncode == 0:
                chunks = sorted([str(path) for path in chunks_dir.glob("chunk_*.wav")])
                if chunks:
                    return chunks
            logger.warning("ffmpeg chunking failed (rc=%d): %s", result.returncode, result.stderr[:200])
        except Exception as e:
            logger.warning("ffmpeg chunking error: %s", e)

        # Both chunking strategies failed — process as single file with a clear warning
        logger.warning(
            "Audio chunking unavailable (install pydub or ffmpeg). "
            "Processing %s as a single file — long recordings may truncate.", audio_path
        )
        return [audio_path]


# =============================================================================
# SINGLETON INSTANCE
# =============================================================================
_stt_service: Optional[WhisperSTT] = None


def get_stt_service() -> WhisperSTT:
    """Get or create the STT service singleton"""
    global _stt_service
    if _stt_service is None:
        _stt_service = WhisperSTT()
    return _stt_service


# For testing
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    stt = get_stt_service()
    
    print("\n" + "=" * 60)
    print("WHISPER STT SERVICE STATUS")
    print("=" * 60)
    
    health = stt.health_check()
    print(f"Status: {health['status']}")
    print(f"Backend: {health['backend']}")
    print(f"Model: {health['model_size']}")
    print(f"Languages: {', '.join(health['supported_languages'])}")
    
    # Test with a sample if provided
    import sys
    if len(sys.argv) > 1:
        audio_file = sys.argv[1]
        print(f"\nTranscribing: {audio_file}")
        
        result = stt.transcribe(audio_file)
        
        if result["success"]:
            print(f"\nText: {result['text']}")
            print(f"Language: {result.get('language', 'unknown')}")
            print(f"Time: {result.get('transcription_time', 0):.2f}s")
        else:
            print(f"Error: {result['error']}")
