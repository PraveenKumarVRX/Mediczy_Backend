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

# Try multiple whisper implementations
try:
    from faster_whisper import WhisperModel
    FASTER_WHISPER_AVAILABLE = True
except ImportError:
    FASTER_WHISPER_AVAILABLE = False
    WhisperModel = None

try:
    import whisper
    OPENAI_WHISPER_AVAILABLE = True
except ImportError:
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
        whisper_cpp_path = Path("/usr/local/bin/whisper-cpp")
        if whisper_cpp_path.exists() or self._find_whisper_cpp():
            self.backend = "whisper-cpp"
            logger.info(f"✅ whisper.cpp available (CLI)")
            return
        
        logger.error("No Whisper backend available!")
        logger.info("Install one of:")
        logger.info("  pip install faster-whisper")
        logger.info("  pip install openai-whisper")
        logger.info("  Build whisper.cpp from source")
    
    def _find_whisper_cpp(self) -> Optional[str]:
        """Find whisper.cpp binary"""
        possible_paths = [
            "/usr/local/bin/whisper",
            "/usr/bin/whisper",
            "./whisper",
            "../whisper.cpp/main",
        ]
        for path in possible_paths:
            if Path(path).exists():
                return path
        return None
    
    def transcribe(
        self,
        audio_path: str,
        language: str = "auto",
        translate: bool = False,
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
        
        start_time = time.time()
        
        try:
            # Route to appropriate backend
            if self.backend == "faster-whisper":
                result = self._transcribe_faster_whisper(audio_path, language, translate)
            elif self.backend == "openai-whisper":
                result = self._transcribe_openai_whisper(audio_path, language, translate)
            elif self.backend == "whisper-cpp":
                result = self._transcribe_whisper_cpp(audio_path, language, translate)
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
    ) -> Dict[str, Any]:
        """Transcribe using faster-whisper"""
        
        # Map language codes
        lang_code = None if language == "auto" else language
        
        segments, info = self.model.transcribe(
            audio_path,
            language=lang_code,
            task="translate" if translate else "transcribe",
            beam_size=WHISPER_CONFIG["beam_size"],
            word_timestamps=WHISPER_CONFIG["word_timestamps"],
            vad_filter=WHISPER_CONFIG["vad_filter"],
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
    ) -> Dict[str, Any]:
        """Transcribe using whisper.cpp CLI"""
        
        whisper_bin = self._find_whisper_cpp()
        if not whisper_bin:
            return {
                "success": False,
                "error": "whisper.cpp binary not found",
                "text": "",
            }
        
        # Build command
        cmd = [
            whisper_bin,
            "-m", str(WHISPER_MODEL_PATH),
            "-f", audio_path,
            "-otxt",
            "--threads", str(os.cpu_count() or 4),
        ]
        
        if language != "auto":
            cmd.extend(["-l", language])
        
        if translate:
            cmd.append("--translate")
        
        # Run whisper.cpp
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300,
            )
            
            if result.returncode == 0:
                # Read output text file
                output_file = Path(audio_path).with_suffix('.txt')
                if output_file.exists():
                    text = output_file.read_text().strip()
                    output_file.unlink()  # Clean up
                    return {
                        "success": True,
                        "text": text,
                        "language": language,
                    }
            
            return {
                "success": False,
                "error": result.stderr,
                "text": "",
            }
            
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "error": "Transcription timeout",
                "text": "",
            }
    
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
        return {
            "status": "healthy" if self.model or self.backend == "whisper-cpp" else "unhealthy",
            "backend": self.backend,
            "model_size": self.model_size,
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
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=60,
            )
            
            if result.returncode == 0 and Path(output_path).exists():
                return output_path
        except:
            pass
        
        # Try pydub as fallback
        try:
            from pydub import AudioSegment
            
            audio = AudioSegment.from_file(input_path)
            audio = audio.set_frame_rate(self.sample_rate)
            audio = audio.set_channels(self.channels)
            audio.export(output_path, format="wav")
            
            return output_path
        except:
            pass
        
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
            # If pydub not available, return original
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
