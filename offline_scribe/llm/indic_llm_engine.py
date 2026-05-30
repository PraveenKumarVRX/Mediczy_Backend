"""
Indic LLM Engine - CPU-Only Inference with Indic-Gemma-2B-Navarasa

Hospital-grade medical document generation using:
- Indic-Gemma-2B-Navarasa (Q4_K_M quantized)
- llama.cpp for CPU inference
- Strict prompts for medical safety

IMPORTANT: This LLM does NOT:
- Make diagnoses
- Recommend treatments
- Prescribe medications

It ONLY:
- Formats text
- Structures documents
- Cleans up language
"""

import logging
from typing import Optional, Dict, Any, List
from pathlib import Path
import time
import json
import re

# llama-cpp-python for local inference
try:
    from llama_cpp import Llama
    LLAMA_AVAILABLE = True
except ImportError:
    LLAMA_AVAILABLE = False
    Llama = None

from config import (
    INDIC_GEMMA_MODEL,
    LLM_CONFIG,
    GENERATION_CONFIG,
    COMPLIANCE_DISCLAIMER,
)

logger = logging.getLogger(__name__)


class IndicLLMEngine:
    """
    CPU-only LLM engine using Indic-Gemma-2B-Navarasa.
    
    Features:
    - Fully offline operation
    - Indian language support (Hindi, Tamil, Telugu + English)
    - Medical document formatting
    - Strict safety prompts
    """
    
    def __init__(self):
        self.model: Optional[Llama] = None
        self.model_loaded = False
        self.model_path = INDIC_GEMMA_MODEL
        self._load_model()
    
    def _load_model(self):
        """Load the Indic-Gemma model (CPU-only)"""
        if not LLAMA_AVAILABLE:
            logger.error("llama-cpp-python not installed. Run: pip install llama-cpp-python")
            return
        
        if not self.model_path.exists():
            logger.error(f"Model not found: {self.model_path}")
            logger.info("Download with: ./scripts/download_models.sh")
            return
        
        try:
            logger.info(f"Loading Indic-Gemma-2B-Navarasa (CPU-only)...")
            logger.info(f"Model path: {self.model_path}")
            logger.info(f"Threads: {LLM_CONFIG['n_threads']}")
            
            start = time.time()
            
            self.model = Llama(
                model_path=str(self.model_path),
                n_ctx=LLM_CONFIG["n_ctx"],
                n_threads=LLM_CONFIG["n_threads"],
                n_batch=LLM_CONFIG["n_batch"],
                n_gpu_layers=LLM_CONFIG["n_gpu_layers"],  # 0 = CPU only
                verbose=LLM_CONFIG["verbose"],
                seed=LLM_CONFIG["seed"],
            )
            
            load_time = time.time() - start
            self.model_loaded = True
            logger.info(f"✅ Model loaded in {load_time:.2f}s")
            
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            self.model = None
            self.model_loaded = False
    
    def generate(
        self,
        prompt: str,
        system_prompt: str = None,
        max_tokens: int = None,
        temperature: float = None,
        stop_sequences: List[str] = None,
    ) -> Dict[str, Any]:
        """
        Generate text completion.
        
        Args:
            prompt: User prompt
            system_prompt: System instructions
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature (lower = more deterministic)
            stop_sequences: Stop generation at these sequences
        
        Returns:
            Dict with generated text and metadata
        """
        if not self.model_loaded or self.model is None:
            return {
                "success": False,
                "error": "Model not loaded",
                "text": ""
            }
        
        # Use defaults if not specified — note: `or` is intentionally avoided for temperature
        # because temperature=0 (fully deterministic) is a valid, falsy value.
        max_tokens = max_tokens if max_tokens is not None else GENERATION_CONFIG["max_tokens"]
        temperature = temperature if temperature is not None else GENERATION_CONFIG["temperature"]
        # Common stop sequences for instruction-tuned models
        stop_sequences = stop_sequences or ["\n\n\n", "###", "<end_of_turn>", "<start_of_turn>user", "<start_of_turn>model"]
        
        # Build prompt - use completion-style for this model
        # If no system prompt, just use the raw prompt (completion-style)
        if system_prompt:
            full_prompt = f"""{system_prompt}

{prompt}"""
        else:
            # For completion-style, use the prompt as-is
            full_prompt = prompt
        
        try:
            start = time.time()
            
            response = self.model(
                full_prompt,
                max_tokens=max_tokens,
                temperature=temperature,
                top_p=GENERATION_CONFIG["top_p"],
                top_k=GENERATION_CONFIG["top_k"],
                repeat_penalty=GENERATION_CONFIG["repeat_penalty"],
                stop=stop_sequences,
                echo=False,
            )
            
            generation_time = time.time() - start
            
            generated_text = response["choices"][0]["text"].strip()
            tokens_generated = response["usage"]["completion_tokens"]
            
            return {
                "success": True,
                "text": generated_text,
                "tokens": tokens_generated,
                "generation_time": generation_time,
                "tokens_per_second": tokens_generated / generation_time if generation_time > 0 else 0,
            }
            
        except Exception as e:
            logger.error(f"Generation error: {e}")
            return {
                "success": False,
                "error": str(e),
                "text": ""
            }
    
    def format_prescription(self, transcript: str, patient_info: Dict = None) -> Dict[str, Any]:
        """
        Format transcript into structured OPD prescription.
        
        IMPORTANT: LLM only formats - does NOT add medications.
        """
        prompt = f"""<start_of_turn>user
You are a medical documentation formatter. Extract ONLY the details explicitly present in the transcript.

CRITICAL SAFETY RULES:
- Do not copy examples. There are no examples in this prompt.
- Do not add, infer, substitute, or recommend any medicine.
- Medicine names, dose, frequency, and duration must be copied exactly from the transcript after normalization.
- If diagnosis is not stated, write: Not documented.
- If a section is not stated, leave it blank.

Output exactly this format:
DIAGNOSIS: <only stated diagnosis or Not documented>
MEDICINES:
1. <drug name> | <dose> | <frequency> | <duration> | <instructions>
ADVICE:
- <only stated advice>
FOLLOW-UP: <only stated follow-up>

TRANSCRIPT: {transcript}<end_of_turn>
<start_of_turn>model
DIAGNOSIS: """

        result = self.generate(
            prompt=prompt,
            system_prompt=None,
            max_tokens=400,
            temperature=0.1,
        )
        
        if result["success"]:
            # Prepend the prompt-primed prefix so the parser can find DIAGNOSIS:
            parse_text = "DIAGNOSIS: " + result["text"]
            structured = self._parse_prescription(parse_text)
            result["structured"] = structured
        
        return result
    
    def format_opd_notes(self, transcript: str, patient_info: Dict = None) -> Dict[str, Any]:
        """
        Format transcript into OPD clinical notes.
        """
        system_prompt = """You are a medical documentation assistant for Indian hospitals.

YOUR ROLE:
- Format the doctor's dictation into clean OPD notes
- DO NOT add clinical findings not mentioned
- DO NOT make diagnoses
- Output in English only

RULES:
1. Extract ONLY information from the transcript
2. If information is missing, leave that section blank
3. Be factual and precise
4. Use standard medical terminology"""

        user_prompt = f"""<start_of_turn>user
You are a medical documentation assistant for Indian hospitals. Convert consultation transcript into structured OPD notes. Fill in only what is mentioned.

SAFETY RULE: The example below is for FORMAT ONLY. Never copy drug names, diagnoses, findings, or vitals from the example into your output. Use ONLY what is in the TRANSCRIPT section.

EXAMPLE FORMAT:
TRANSCRIPT: [doctor dictation goes here]
CHIEF COMPLAINT: [from transcript only]
HISTORY: [from transcript only]
VITALS: [from transcript only]
EXAMINATION: [from transcript only]
DIAGNOSIS: [from transcript only]
PLAN: [from transcript only]
FOLLOW-UP: [from transcript only]

NOW EXTRACT:
TRANSCRIPT: {transcript}<end_of_turn>
<start_of_turn>model
CHIEF COMPLAINT:"""

        result = self.generate(
            prompt=user_prompt,
            system_prompt=None,
            max_tokens=768,
            temperature=0.1,
        )
        
        return result
    
    def format_discharge_summary(self, transcript: str, patient_info: Dict = None) -> Dict[str, Any]:
        """
        Format transcript into discharge summary.
        """
        user_prompt = f"""<start_of_turn>user
You are a medical documentation assistant. Convert this discharge dictation into a structured discharge summary. Fill in only what is mentioned.

SAFETY RULE: The example below is for FORMAT ONLY. Never copy drug names, diagnoses, findings, or any clinical data from the example into your output. Use ONLY what is in the TRANSCRIPT section.

EXAMPLE FORMAT:
TRANSCRIPT: [doctor dictation goes here]
ADMISSION DIAGNOSIS: [from transcript only]
HOSPITAL COURSE: [from transcript only]
INVESTIGATIONS: [from transcript only]
CONDITION AT DISCHARGE: [from transcript only]
DISCHARGE MEDICATIONS: [from transcript only — name | dose | frequency | duration]
ADVICE: [from transcript only]
FOLLOW-UP: [from transcript only]

NOW EXTRACT:
TRANSCRIPT: {transcript}<end_of_turn>
<start_of_turn>model
ADMISSION DIAGNOSIS: """

        result = self.generate(
            prompt=user_prompt,
            system_prompt=None,
            max_tokens=1024,
            temperature=0.1,
        )
        
        return result
    
    def format_ipd_notes(self, transcript: str, patient_info: Dict = None) -> Dict[str, Any]:
        """
        Format transcript into IPD daily progress notes.
        """
        system_prompt = """You are a medical documentation assistant for Indian hospitals.

YOUR ROLE:
- Format the doctor's rounds notes into IPD progress notes
- DO NOT add findings not mentioned
- Output in English only

RULES:
1. Extract ONLY information from the transcript
2. Use SOAP format if appropriate
3. Be concise and factual"""

        user_prompt = f"""<start_of_turn>user
You are a medical documentation assistant. Convert this IPD round dictation into SOAP progress notes. Fill in only what is mentioned.

SAFETY RULE: The example below is for FORMAT ONLY. Never copy vitals, drug names, or clinical findings from the example into your output. Use ONLY what is in the TRANSCRIPT section.

EXAMPLE FORMAT:
TRANSCRIPT: [doctor dictation goes here]
SUBJECTIVE: [from transcript only]
OBJECTIVE: [from transcript only]
ASSESSMENT: [from transcript only]
PLAN: [from transcript only]

NOW EXTRACT:
TRANSCRIPT: {transcript}<end_of_turn>
<start_of_turn>model
SUBJECTIVE:"""

        result = self.generate(
            prompt=user_prompt,
            system_prompt=None,
            max_tokens=512,
            temperature=0.1,
        )
        
        return result
    
    def _parse_prescription(self, text: str) -> Dict[str, Any]:
        """Parse generated prescription into structured format"""
        structured = {
            "diagnosis": "",
            "medications": [],
            "advice": [],
            "follow_up": "",
        }
        
        try:
            # Extract diagnosis — strip leading bullet/dash noise (e.g. "- Viral fever")
            diag_match = re.search(r"DIAGNOSIS:\s*\n?(.*?)(?=\nMEDICINES|\nMEDICATION|\Z)", text, re.DOTALL | re.IGNORECASE)
            if diag_match:
                diag = diag_match.group(1).strip()
                diag = re.sub(r"^[-•\*]\s*", "", diag).strip()
                structured["diagnosis"] = diag
            
            # Extract medications
            med_section = re.search(r"MEDICINES?[^:]*:\s*\n?(.*?)(?=\nADVICE|\nFOLLOW[- ]?UP:|\Z)", text, re.DOTALL | re.IGNORECASE)
            if med_section:
                med_lines = med_section.group(1).strip().split("\n")
                for line in med_lines:
                    line = line.strip()
                    if line and not line.startswith("-"):
                        # Remove numbering
                        line = re.sub(r"^\d+\.\s*", "", line)
                        parts = [p.strip() for p in line.split("|")]
                        if len(parts) >= 2:
                            structured["medications"].append({
                                "name": parts[0],
                                "dose": parts[1] if len(parts) > 1 else "",
                                "frequency": parts[2] if len(parts) > 2 else "",
                                "duration": parts[3] if len(parts) > 3 else "",
                            })
            
            # Extract advice — use \nFOLLOW-UP: as boundary to avoid cutting "Follow up" sentences
            advice_match = re.search(r"ADVICE[^:]*:\s*\n?(.*?)(?=\nFOLLOW[- ]?UP:|\Z)", text, re.DOTALL | re.IGNORECASE)
            advice_lines_raw = []
            if advice_match:
                advice_lines_raw = advice_match.group(1).strip().split("\n")
                for line in advice_lines_raw:
                    line = line.strip()
                    if line:
                        cleaned = re.sub(r"^[-•\*\d\.]\s*", "", line).strip()
                        # If a line looks like a follow-up instruction, defer it
                        if re.match(r"^follow.?up", cleaned, re.IGNORECASE):
                            if not structured["follow_up"]:
                                structured["follow_up"] = cleaned
                        else:
                            structured["advice"].append(cleaned)
            
            # Extract follow-up
            followup_match = re.search(r"FOLLOW[- ]?UP[^:]*:\s*\n?(.*?)$", text, re.DOTALL | re.IGNORECASE)
            if followup_match:
                followup = followup_match.group(1).strip()
                # Strip trailing noise like "END OF SCRIPT", "NOTE:", etc.
                followup = re.split(r'\n\s*(?:END|NOTE|DISCLAIMER|IMPORTANT|\*{3})', followup, flags=re.IGNORECASE)[0].strip()
                if followup:
                    structured["follow_up"] = followup
            
        except Exception as e:
            logger.error(f"Error parsing prescription: {e}")
        
        return structured
    
    def health_check(self) -> Dict[str, Any]:
        """Check LLM engine health"""
        return {
            "status": "healthy" if self.model_loaded else "unhealthy",
            "model_loaded": self.model_loaded,
            "model_path": str(self.model_path),
            "model_exists": self.model_path.exists(),
            "llama_available": LLAMA_AVAILABLE,
            "config": {
                "n_ctx": LLM_CONFIG["n_ctx"],
                "n_threads": LLM_CONFIG["n_threads"],
                "n_gpu_layers": LLM_CONFIG["n_gpu_layers"],
            }
        }


# =============================================================================
# SINGLETON INSTANCE
# =============================================================================
_llm_engine: Optional[IndicLLMEngine] = None


def get_llm_engine() -> IndicLLMEngine:
    """Get or create the LLM engine singleton"""
    global _llm_engine
    if _llm_engine is None:
        _llm_engine = IndicLLMEngine()
    return _llm_engine


# For testing
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    engine = get_llm_engine()
    
    if engine.model_loaded:
        print("\n" + "=" * 70)
        print("TESTING INDIC LLM ENGINE")
        print("=" * 70)
        
        # Test prescription formatting
        test_transcript = """
        Patient ko chest pain hai since two days. 
        ECG normal hai. BP 130/90.
        Give Ecosprin 75 mg OD, Pan 40 BD for 5 days.
        Advice rest for 2 days, avoid oily food.
        Follow up after 1 week.
        """
        
        print("\nTest Transcript:")
        print(test_transcript)
        print("\nGenerating Prescription...")
        
        result = engine.format_prescription(test_transcript)
        
        if result["success"]:
            print("\n--- GENERATED PRESCRIPTION ---")
            print(result["text"])
            print(f"\nGeneration time: {result['generation_time']:.2f}s")
            print(f"Tokens: {result['tokens']}")
            print(f"Speed: {result['tokens_per_second']:.1f} tokens/sec")
        else:
            print(f"Error: {result['error']}")
    else:
        print("Model not loaded. Please download the model first.")
