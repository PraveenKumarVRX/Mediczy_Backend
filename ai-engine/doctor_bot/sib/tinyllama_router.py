"""
TinyLlama Intent Router for SIB
================================

Local GGUF model (Qwen) for intent classification + conversational responses.

Architecture:
    User Query → Qwen (CPU) → Intent Classification
                                    ↓
         ┌──────────────────────────┼──────────────────────────┐
         ↓                          ↓                          ↓
     QWEN (CPU)               iSHA.buzz (GPU)            Groq/Gemini
   Conversations            Medical Reasoning            (Fallback)
   - Greetings              - Symptom analysis           - Complex cases
   - Small talk             - Drug info                  - Emergency
   - Who are you            - Treatment plans
   - Capabilities           - Diagnosis

Responsibilities:
1. Intent Classification (~50ms pattern, ~500ms LLM)
2. Conversational responses via Qwen CPU (~800ms)
3. Route medical queries to iSHA.buzz GPU
4. Fallback chain: iSHA → Groq → Gemini
"""

import os
import json
import time
import logging
from typing import Dict, Any, Optional, Tuple, List
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger("sib.tinyllama_router")

# Model path configuration
MODEL_DIR = Path(__file__).parent.parent / "models" / "tinyllama"
DEFAULT_MODEL_FAST = "qwen-0.6b-medicaldataset-f16.gguf"
DEFAULT_MODEL_ACCURACY = "qwen2.5-3b-instruct-q4_k_m.gguf"


def _resolve_model_path(explicit_path: Optional[str] = None) -> str:
    """
    Resolve router model path with profile-based fallback.

    Profiles:
    - fast: prioritize low-latency (Qwen 0.6B)
    - balanced/accuracy: prioritize routing reliability (Qwen 2.5 3B)
    """
    if explicit_path:
        return explicit_path

    env_path = os.environ.get("TINYLLAMA_MODEL_PATH")
    if env_path:
        return env_path

    profile = os.environ.get("ROUTER_MODEL_PROFILE", "balanced").strip().lower()
    if profile in ("accuracy", "balanced"):
        preferred = MODEL_DIR / DEFAULT_MODEL_ACCURACY
        if preferred.exists():
            return str(preferred)

    return str(MODEL_DIR / DEFAULT_MODEL_FAST)


@dataclass
class RoutingDecision:
    """Result from intent routing"""
    intent: str
    confidence: float
    backend: str  # 'local', 'isha', 'groq', 'gemini'
    quick_response: Optional[str]  # For local Qwen handling
    entities: Dict[str, Any]
    reasoning: str
    latency_ms: float


class TinyLlamaRouter:
    """
    Qwen-based intent router with local conversation handling
    
    - Conversations → Qwen CPU (local, ~800ms)
    - Medical reasoning → iSHA.buzz GPU (~2s)
    - Fallback → Groq → Gemini
    """
    
    # Intent categories and their routing
    INTENT_ROUTING = {
        # ═══════════════════════════════════════════════════════════════
        # LOCAL (Qwen CPU) - Conversational, instant human-like responses
        # ═══════════════════════════════════════════════════════════════
        "greeting": "local",
        "small_talk": "local", 
        "thanks": "local",
        "goodbye": "local",
        "acknowledgment": "local",
        "non_medical": "local",
        "how_are_you": "local",
        "who_are_you": "local",
        "capabilities": "local",
        
        # LOCAL with RAG - Personal health data queries
        "my_health": "local",  # "my diabetes", "my conditions", "my reports"
        "patient_history": "local",  # Use RAG for patient-specific queries
        
        # ═══════════════════════════════════════════════════════════════
        # iSHA.buzz (GPU) - Medical reasoning and deep analysis
        # ═══════════════════════════════════════════════════════════════
        "medical_query": "isha",
        "symptom_check": "isha",
        "medication_info": "isha",
        "differential_diagnosis": "isha",
        "treatment_plan": "isha",
        "drug_interaction": "isha",
        "complex_medical": "isha",
        
        # Booking flows (iSHA handles with DB)
        "book_healthcheckup": "isha",
        "book_appointment": "isha",
        "appointment_status": "isha",
        "healthcheckup_status": "isha",
        "report_status": "isha",
        
        # ═══════════════════════════════════════════════════════════════
        # GROQ (Fallback 1) - Fast cloud API
        # ═══════════════════════════════════════════════════════════════
        "emergency": "groq",  # Fast response needed
        "multi_condition": "groq",
        
        # Fallback
        "unknown": "isha"
    }
        # Conversation prompts for Qwen (used for dynamic responses)
    # Tone: Short, Crisp, Neutral, Professional - Zero Drama
    CONVERSATION_PROMPTS = {
        "greeting": "You are Dr. iSHA, an AI health assistant. Greet briefly and ask how you can help with their health. One sentence only. Professional tone.",
        "how_are_you": "You are Dr. iSHA. Thank them briefly, say you're well, ask how they're feeling. Two sentences max. No drama.",
        "who_are_you": "You are Dr. iSHA, an AI health assistant. State what you help with: health questions, symptoms, appointments, medications. Brief and factual.",
        "capabilities": "You are Dr. iSHA. List capabilities briefly: health queries, symptoms, appointments, medications, reports. No fluff.",
        "thanks": "You are Dr. iSHA. Acknowledge thanks briefly. Ask if they need anything else. One sentence.",
        "goodbye": "You are Dr. iSHA. Say brief goodbye. One sentence only.",
        "small_talk": "You are Dr. iSHA. Respond briefly, redirect to health topics. One sentence.",
        "acknowledgment": "You are Dr. iSHA. Acknowledge briefly, ask if they have health questions. One sentence.",
        "non_medical": "You are Dr. iSHA, health specialist. Politely note your focus is health topics. Ask if they have health questions. Brief."
    }
    
    # Fallback static responses (used if Qwen fails)
    # Tone: Short, Crisp, Neutral, Professional - Zero Drama
    QUICK_RESPONSES = {
        "greeting": {
            "en": "Hello. I'm Dr. iSHA, your health assistant. How can I help you today?",
            "hi": "नमस्ते। मैं Dr. iSHA हूं। आज कैसे मदद करूं?"
        },
        "how_are_you": {
            "en": "I'm well, thank you. How are you feeling today?",
            "hi": "मैं ठीक हूं, धन्यवाद। आप कैसा महसूस कर रहे हैं?"
        },
        "who_are_you": {
            "en": "I'm Dr. iSHA, an AI health assistant. I can help with health questions, symptoms, appointments, medications, and reports. What do you need?",
            "hi": "मैं Dr. iSHA हूं, AI स्वास्थ्य सहायक। स्वास्थ्य प्रश्न, लक्षण, अपॉइंटमेंट, दवाइयां - इनमें मदद कर सकती हूं। क्या चाहिए?"
        },
        "capabilities": {
            "en": "I can help with: health questions, symptoms, appointments, medications, reports, and health checkups. What do you need?",
            "hi": "मैं इनमें मदद कर सकती हूं: स्वास्थ्य प्रश्न, लक्षण, अपॉइंटमेंट, दवाइयां, रिपोर्ट। क्या चाहिए?"
        },
        "thanks": {
            "en": "You're welcome. Anything else I can help with?",
            "hi": "स्वागत है। और कुछ मदद चाहिए?"
        },
        "goodbye": {
            "en": "Goodbye. Take care.",
            "hi": "अलविदा। अपना ख्याल रखें।"
        },
        "small_talk": {
            "en": "I specialize in health topics. Do you have any health questions?",
            "hi": "मैं स्वास्थ्य विषयों में विशेषज्ञ हूं। कोई स्वास्थ्य प्रश्न है?"
        },
        "acknowledgment": {
            "en": "Noted. Do you have any health questions?",
            "hi": "समझ गई। कोई स्वास्थ्य प्रश्न है?"
        },
        "non_medical": {
            "en": "I'm Dr. iSHA, focused on health topics. Do you have any health-related questions?",
            "hi": "मैं Dr. iSHA हूं, स्वास्थ्य विषयों में। कोई स्वास्थ्य संबंधी सवाल है?"
        }
    }
    
    def __init__(self, model_path: Optional[str] = None, n_ctx: int = 2048, n_threads: int = 4):
        """
        Initialize TinyLlama Router
        
        Args:
            model_path: Path to GGUF model file
            n_ctx: Context window size
            n_threads: CPU threads for inference
        """
        self.model_path = _resolve_model_path(model_path)
        self.n_ctx = int(os.environ.get("TINYLLAMA_N_CTX", n_ctx))
        self.n_threads = int(os.environ.get("TINYLLAMA_N_THREADS", n_threads))
        
        self._llm = None
        self._loaded = False
        self._load_error = None
        
        # RAG components
        self._faiss_loaded = False
        self._retriever = None
        
        logger.info(f"🦙 Qwen Router initialized")
        logger.info(f"   Model: {self.model_path}")
        logger.info(f"   Context: {self.n_ctx}, Threads: {self.n_threads}")
        
        # Preload model for instant responses
        self._load_model()
        
        # Preload pgvector for RAG
        self._load_pgvector()
    
    def _load_model(self) -> bool:
        """Lazy load the GGUF model"""
        if self._loaded:
            return True
        
        if self._load_error:
            return False
        
        try:
            from llama_cpp import Llama
            
            if not Path(self.model_path).exists():
                logger.warning(f"⚠️ TinyLlama model not found at {self.model_path}")
                logger.warning(
                    "   Place a GGUF at TINYLLAMA_MODEL_PATH or use ROUTER_MODEL_PROFILE=fast/balanced"
                )
                self._load_error = "Model file not found"
                return False
            
            logger.info(f"🔄 Loading TinyLlama from {self.model_path}...")
            start = time.time()
            
            self._llm = Llama(
                model_path=self.model_path,
                n_ctx=self.n_ctx,
                n_threads=self.n_threads,
                n_gpu_layers=0,  # CPU only
                verbose=False
            )
            
            load_time = (time.time() - start) * 1000
            self._loaded = True
            logger.info(f"✅ Qwen loaded in {load_time:.0f}ms")
            return True
            
        except ImportError:
            self._load_error = "llama-cpp-python not installed"
            logger.error("❌ llama-cpp-python not installed. Run: pip install llama-cpp-python")
            return False
        except Exception as e:
            self._load_error = str(e)
            logger.error(f"❌ Failed to load Qwen: {e}")
            return False
    
    # ==================== RAG: pgvector Retrieval ====================
    
    def _load_pgvector(self) -> bool:
        """Initialize pgvector connection for RAG"""
        if self._faiss_loaded:  # Reusing flag name for compatibility
            return True
        
        try:
            import sys
            base_dir = Path(__file__).resolve().parent.parent
            sys.path.insert(0, str(base_dir / "utils"))
            
            from pgvector_store import get_stats
            
            stats = get_stats()
            if stats.get("status") == "connected" and stats.get("total_vectors", 0) > 0:
                self._faiss_loaded = True  # Reusing flag
                logger.info(f"✅ pgvector connected: {stats.get('total_vectors')} vectors")
                return True
            else:
                logger.warning(f"⚠️ pgvector: {stats}")
                return False
                
        except Exception as e:
            logger.warning(f"⚠️ pgvector connection failed: {e}")
            return False
    
    def retrieve_context(self, query: str, patient_id: Optional[str] = None, k: int = 3) -> List[str]:
        """
        Retrieve relevant context from pgvector for RAG
        
        Falls back to keyword search if embedding model unavailable.
        
        Args:
            query: User query
            patient_id: Optional patient ID to filter results
            k: Number of results
            
        Returns:
            List of relevant context strings
        """
        # Check if PyTorch is available for embedding
        try:
            import torch
            pytorch_available = True
        except ImportError:
            pytorch_available = False
        
        # Try pgvector retrieval only if PyTorch is available
        if pytorch_available and (self._faiss_loaded or self._load_pgvector()):
            try:
                import sys
                base_dir = Path(__file__).resolve().parent.parent
                sys.path.insert(0, str(base_dir / "utils"))
                
                from pgvector_store import retrieve
                
                results = retrieve(query, k=k, patient_filter=patient_id)
                
                context_chunks = []
                for r in results:
                    if isinstance(r, dict):
                        text = r.get("text") or r.get("chunk") or str(r)
                        context_chunks.append(text)
                    else:
                        context_chunks.append(str(r))
                
                if context_chunks:
                    logger.info(f"📚 RAG: Retrieved {len(context_chunks)} chunks via pgvector")
                    return context_chunks[:k]
                    
            except ImportError:
                # PyTorch/embedding model not available - use keyword fallback silently
                pass
            except Exception as e:
                logger.debug(f"pgvector retrieval failed: {e}")
        
        # Fallback: Keyword-based search on metadata (no PyTorch needed)
        return self._keyword_retrieve(query, patient_id, k)
    
    def _keyword_retrieve(self, query: str, patient_id: Optional[str] = None, k: int = 3) -> List[str]:
        """
        Simple keyword-based retrieval fallback when FAISS embedding fails.
        
        Uses the stored chunk metadata for keyword matching.
        """
        try:
            import json as _json_safe
            with open(metadata_path, 'r', encoding='utf-8') as f:
                chunks = _json_safe.load(f)  # json is safe; was pickle (arbitrary code exec risk)
            
            # Extract keywords from query
            query_lower = query.lower()
            keywords = [w for w in query_lower.split() if len(w) > 2]
            
            # Score chunks by keyword matches
            scored = []
            for chunk in chunks:
                text = chunk.get("text", "").lower()
                chunk_patient = chunk.get("patient_id")
                
                # Filter by patient if specified
                if patient_id and chunk_patient and chunk_patient != patient_id:
                    continue
                
                # Count keyword matches
                score = sum(1 for kw in keywords if kw in text)
                if score > 0:
                    scored.append((score, chunk.get("text", "")))
            
            # Sort by score and return top-k
            scored.sort(key=lambda x: x[0], reverse=True)
            results = [text for _, text in scored[:k]]
            
            if results:
                logger.info(f"📚 RAG: Retrieved {len(results)} chunks via keyword search")
            
            return results
            
        except Exception as e:
            logger.warning(f"⚠️ Keyword retrieval failed: {e}")
            return []
    
    def _generate_conversation(self, intent: str, user_query: str, language: str = "en") -> Optional[str]:
        """
        Generate conversational response - prefer static for crisp, professional responses
        
        Args:
            intent: The classified intent
            user_query: Original user message
            language: Response language
            
        Returns:
            Generated response or None if failed
        """
        # ═══════════════════════════════════════════════════════════════
        # STATIC RESPONSES - Short, crisp, neutral, professional
        # For conversational intents, static is better (zero drama)
        # ═══════════════════════════════════════════════════════════════
        if intent in self.QUICK_RESPONSES:
            responses = self.QUICK_RESPONSES[intent]
            return responses.get(language, responses.get("en"))
        
        # For unknown intents, try Qwen
        if not self._load_model():
            return None
        
        system_prompt = "You are Dr. iSHA, an AI health assistant. Be brief, neutral, and professional. No drama."
        if language == "hi":
            system_prompt += " Reply in Hindi/Hinglish. Keep it brief."
        
        try:
            prompt = f"""{system_prompt}

User: {user_query}
Dr. iSHA:"""
            
            start = time.time()
            response = self._llm(
                prompt,
                max_tokens=30,
                temperature=0.3,
                top_p=0.9,
                stop=["\n", "User:", "<|", "Dr. iSHA:"]
            )
            
            generated = response['choices'][0]['text'].strip()
            generated = generated.replace("<think>", "").replace("</think>", "").strip()
            
            latency = (time.time() - start) * 1000
            logger.info(f"💬 Qwen: {latency:.0f}ms | '{generated[:50]}...'")
            
            return generated if generated and len(generated) >= 5 else None
            
        except Exception as e:
            logger.warning(f"⚠️ Qwen conversation failed: {e}")
            return None
    
    def generate_with_rag(self, query: str, patient_id: Optional[str] = None, language: str = "en") -> Optional[str]:
        """
        Generate response using Qwen with RAG context
        
        This method:
        1. Retrieves relevant context from FAISS
        2. Builds a context-aware prompt
        3. Generates response with Qwen
        
        Args:
            query: User query
            patient_id: Optional patient ID for personalized context
            language: Response language
            
        Returns:
            Generated response with RAG context
        """
        if not self._load_model():
            return None
        
        # Retrieve relevant context
        context_chunks = self.retrieve_context(query, patient_id, k=3)
        
        # Build context string
        context_str = ""
        if context_chunks:
            context_str = "\n\nRelevant patient information:\n" + "\n".join(f"- {c[:200]}" for c in context_chunks)
        
        system_prompt = "You are Dr. iSHA, an AI health assistant. Use the provided patient information to give personalized, accurate responses. Be brief and professional."
        if language == "hi":
            system_prompt += " Reply in Hindi/Hinglish."
        
        try:
            prompt = f"""{system_prompt}{context_str}

User: {query}
Dr. iSHA:"""
            
            start = time.time()
            response = self._llm(
                prompt,
                max_tokens=100,  # More tokens for RAG responses
                temperature=0.4,
                top_p=0.9,
                stop=["\n\n", "User:", "<|", "Dr. iSHA:"]
            )
            
            generated = response['choices'][0]['text'].strip()
            generated = generated.replace("<think>", "").replace("</think>", "").strip()
            
            latency = (time.time() - start) * 1000
            logger.info(f"📚 Qwen+RAG: {latency:.0f}ms | context={len(context_chunks)} | '{generated[:50]}...'")
            
            return generated if generated and len(generated) >= 5 else None
            
        except Exception as e:
            logger.warning(f"⚠️ Qwen+RAG failed: {e}")
            return None
    
    def _build_prompt(self, query: str, context: Optional[Dict] = None) -> str:
        """Build intent classification prompt"""
        
        # Intent options for the model
        intent_options = """
INTENTS:
- greeting: Hello, hi, namaste, good morning
- small_talk: ok, hmm, yes, alright, sure
- thanks: thank you, thanks, appreciate it
- goodbye: bye, see you, take care
- acknowledgment: got it, understood, okay
- non_medical: business, career, recipes, movies, weather (NOT health related)
- medical_query: symptoms, diseases, health conditions, medicines
- symptom_check: I have pain, fever, cough, headache
- medication_info: medicine dosage, side effects, drug info
- book_healthcheckup: book checkup, health package, full body check
- book_appointment: book doctor, appointment, consultation
- appointment_status: when is my appointment, appointment details
- healthcheckup_status: checkup status, when is my checkup
- report_status: my reports, test results, lab results
- emergency: chest pain, can't breathe, unconscious, bleeding heavily
- differential_diagnosis: complex symptoms needing analysis
- drug_interaction: multiple medications, interactions
- complex_medical: detailed treatment, multiple conditions
- unknown: unclear intent
"""
        
        prompt = f"""<|system|>
You are an intent classifier for a healthcare chatbot. Analyze the user message and return a JSON response.
{intent_options}
</s>
<|user|>
Classify this message: "{query}"

Return JSON with:
- intent: one of the intents above
- confidence: 0.0-1.0
- entities: extracted entities (symptoms, dates, etc.)
- reasoning: brief explanation
</s>
<|assistant|>
"""
        return prompt
    
    def _parse_response(self, response: str) -> Dict[str, Any]:
        """Parse LLM response to extract JSON"""
        try:
            # Try to find JSON in response
            json_match = response.find('{')
            if json_match >= 0:
                json_end = response.rfind('}') + 1
                json_str = response[json_match:json_end]
                return json.loads(json_str)
        except (json.JSONDecodeError, ValueError) as _json_err:
            logger.debug("JSON parse failed for LLM response: %s — using text fallback", _json_err)
        
        # Fallback: extract intent from text
        response_lower = response.lower()
        for intent in self.INTENT_ROUTING.keys():
            if intent.replace('_', ' ') in response_lower or intent in response_lower:
                return {
                    "intent": intent,
                    "confidence": 0.6,
                    "entities": {},
                    "reasoning": "Extracted from text response"
                }
        
        return {
            "intent": "unknown",
            "confidence": 0.3,
            "entities": {},
            "reasoning": "Could not parse response"
        }
    
    def _fallback_classify(self, query: str) -> Dict[str, Any]:
        """
        Fast pattern-based classification (~1ms)
        Prioritizes efficiency and human-like intent detection
        """
        lower = query.lower().strip()
        words = lower.split()
        
        # ═══════════════════════════════════════════════════════════════
        # EMERGENCY (highest priority for safety)
        # ═══════════════════════════════════════════════════════════════
        emergency = ['emergency', 'chest pain', "can't breathe", 'cannot breathe',
                    'difficulty breathing', 'unconscious', 'severe bleeding', 
                    'heart attack', 'stroke', 'accident', 'dying', 'suicide']
        if any(e in lower for e in emergency):
            return {"intent": "emergency", "confidence": 0.98, "entities": {}, "reasoning": "Emergency pattern"}
        
        # ═══════════════════════════════════════════════════════════════
        # SPECIFIC QUESTIONS (check before generic patterns)
        # ═══════════════════════════════════════════════════════════════
        
        # "Who are you" pattern (check BEFORE greeting)
        who_are_you = ['who are you', 'who r u', 'what are you', 'who is this',
                       'aap kaun', 'tum kaun', 'your name', "what's your name", 'whats your name']
        if any(w in lower for w in who_are_you):
            return {"intent": "who_are_you", "confidence": 0.95, "entities": {}, "reasoning": "Pattern match"}
        
        # "How are you" pattern (check BEFORE greeting)
        how_are_you = ['how are you', 'how r u', 'how are u', 'how do you do', 
                       'how you doing', "how's it going", 'kaise ho', 'kya haal']
        if any(h in lower for h in how_are_you):
            return {"intent": "how_are_you", "confidence": 0.95, "entities": {}, "reasoning": "Pattern match"}
        
        # Capabilities pattern (check before generic)
        capabilities = ['what can you do', 'how can you help', 'what do you do',
                       'your capabilities', 'what services', 'what features',
                       'help me with', 'can you help']
        if any(c in lower for c in capabilities):
            return {"intent": "capabilities", "confidence": 0.9, "entities": {}, "reasoning": "Pattern match"}
        
        # ═══════════════════════════════════════════════════════════════
        # BOOKING INTENTS (check before generic - more specific)
        # ═══════════════════════════════════════════════════════════════
        if any(b in lower for b in ['book checkup', 'health checkup', 'full body checkup', 
                                     'master health', 'health package', 'body test', 'checkup package']):
            return {"intent": "book_healthcheckup", "confidence": 0.9, "entities": {}, "reasoning": "Pattern match"}
        
        if any(b in lower for b in ['book appointment', 'doctor appointment', 'see doctor', 
                                     'consult doctor', 'meet doctor', 'schedule appointment',
                                     'book doctor', 'appointment with']):
            return {"intent": "book_appointment", "confidence": 0.9, "entities": {}, "reasoning": "Pattern match"}
        
        # Status patterns
        if any(s in lower for s in ['checkup status', 'when is my checkup', 'checkup booking']):
            return {"intent": "healthcheckup_status", "confidence": 0.85, "entities": {}, "reasoning": "Pattern match"}
        
        if any(s in lower for s in ['appointment status', 'when is my appointment', 'my appointment']):
            return {"intent": "appointment_status", "confidence": 0.85, "entities": {}, "reasoning": "Pattern match"}
        
        if any(r in lower for r in ['my report', 'test result', 'lab result', 'blood report', 'reports']):
            return {"intent": "report_status", "confidence": 0.85, "entities": {}, "reasoning": "Pattern match"}
        
        # ═══════════════════════════════════════════════════════════════
        # CONVERSATIONAL INTENTS (more generic patterns)
        # ═══════════════════════════════════════════════════════════════
        
        # Thanks patterns
        thanks_words = ['thank', 'thanks', 'thanku', 'thx', 'appreciate', 'grateful', 
                       'dhanyavaad', 'shukriya', 'thanks a lot', 'thank you']
        if any(t in lower for t in thanks_words):
            return {"intent": "thanks", "confidence": 0.95, "entities": {}, "reasoning": "Pattern match"}
        
        # Goodbye patterns
        goodbye_words = ['bye', 'goodbye', 'see you', 'take care', 'later', 'cya',
                        'good night', 'alvida', 'phir milenge', 'ttyl']
        if any(g in lower for g in goodbye_words):
            return {"intent": "goodbye", "confidence": 0.95, "entities": {}, "reasoning": "Pattern match"}
        
        # Non-medical patterns (check before greeting to catch "tell me a joke" etc)
        non_medical = ['joke', 'story', 'song', 'business', 'career', 'job', 'movie', 
                      'recipe', 'weather', 'stock', 'crypto', 'game', 'sport', 'politics',
                      'tell me a joke', 'what is the news', 'who is the president', 'when was']
        # More strict: only non_medical if NO health-related terms
        health_related = ['health', 'medical', 'doctor', 'symptom', 'disease', 'diabetes', 
                         'cancer', 'heart', 'blood', 'medicine', 'treatment', 'pain', 'fever',
                         'hospital', 'clinic', 'diagnosis', 'therapy', 'vitamin', 'diet']
        if any(n in lower for n in non_medical) and not any(m in lower for m in health_related):
            return {"intent": "non_medical", "confidence": 0.85, "entities": {}, "reasoning": "Pattern match"}
        
        # Greeting patterns (short messages with greeting words)
        greeting_words = ['hi', 'hello', 'hey', 'hii', 'hiii', 'namaste', 'namaskar', 
                         'good morning', 'good evening', 'good afternoon', 'howdy', 
                         'hola', 'greetings']
        if len(words) <= 5 and any(lower.startswith(g) or f' {g}' in f' {lower}' for g in greeting_words):
            return {"intent": "greeting", "confidence": 0.95, "entities": {}, "reasoning": "Pattern match"}
        
        # Acknowledgment (LAST - very short affirming messages only)
        ack_words = ['ok', 'okay', 'alright', 'got it', 'understood', 'i see', 
                    'hmm', 'ohh', 'accha', 'theek hai', 'sure', 'fine']
        if len(words) <= 2 and any(a == lower or lower.startswith(a) for a in ack_words):
            return {"intent": "acknowledgment", "confidence": 0.85, "entities": {}, "reasoning": "Pattern match"}
        
        # ═══════════════════════════════════════════════════════════════
        # MY HEALTH QUERIES - Personal health data (use RAG locally)
        # ═══════════════════════════════════════════════════════════════
        my_health_patterns = ['my diabetes', 'my health', 'my conditions', 'my diagnosis',
                              'my medical history', 'my prescription', 'my medications',
                              'tell me about my', 'what are my', 'show my', 'my records',
                              'do i have', 'what conditions do i']
        if any(m in lower for m in my_health_patterns):
            return {"intent": "my_health", "confidence": 0.9, "entities": {}, "reasoning": "Personal health query - use RAG"}
        
        # ═══════════════════════════════════════════════════════════════
        # MEDICAL QUERY PATTERNS (high confidence to skip LLM)
        # ═══════════════════════════════════════════════════════════════
        
        # Drug/medication info queries - "What is X", "Tell me about X medicine"
        drug_patterns = ['aspirin', 'paracetamol', 'ibuprofen', 'acetaminophen', 'tylenol',
                        'metformin', 'lisinopril', 'atorvastatin', 'omeprazole', 'losartan',
                        'azithromycin', 'amoxicillin', 'ciprofloxacin', 'dolo', 'crocin',
                        'combiflam', 'pantoprazole', 'cetirizine', 'montelukast']
        
        # Check for "what is <drug>" or "<drug> side effects" patterns
        if any(d in lower for d in drug_patterns):
            return {"intent": "medication_info", "confidence": 0.9, "entities": {}, "reasoning": "Drug name detected"}
        
        # General medical questions: "what is", "how to treat", "why does", etc.
        medical_question_starters = ['what is', 'what are', 'how to treat', 'how to cure',
                                     'why does', 'why do i', 'can i take', 'should i',
                                     'is it safe', 'tell me about', 'what causes']
        
        # Check if it's a medical question (contains medical terms)
        medical_terms = ['health', 'disease', 'illness', 'treatment', 'medicine', 'drug',
                        'symptom', 'diagnosis', 'doctor', 'hospital', 'vitamin', 'infection',
                        'diabetes', 'blood pressure', 'cholesterol', 'cancer', 'heart',
                        'liver', 'kidney', 'lung', 'brain', 'stomach', 'skin']
        
        if any(q in lower for q in medical_question_starters):
            if any(m in lower for m in medical_terms):
                return {"intent": "medical_query", "confidence": 0.85, "entities": {}, "reasoning": "Medical question pattern"}
            # Even without explicit medical terms, "what is X" could be medical
            return {"intent": "medical_query", "confidence": 0.75, "entities": {}, "reasoning": "Question pattern"}
        
        # Symptom check patterns (expanded)
        if any(m in lower for m in ['symptom', 'pain', 'ache', 'fever', 'sick', 'ill', 
                                    'disease', 'medicine', 'medication', 'doctor',
                                    'headache', 'stomach', 'nausea', 'vomit', 'cough',
                                    'cold', 'flu', 'infection', 'swelling', 'rash',
                                    'i have', 'i feel', 'suffering from', 'diagnosed']):
            return {"intent": "symptom_check", "confidence": 0.8, "entities": {}, "reasoning": "Symptom pattern match"}
        
        # Default: medical_query with moderate confidence (skip LLM for most queries)
        # This assumes users coming to a health chatbot likely have health questions
        if len(words) >= 3:  # More than 2 words, likely a real question
            return {"intent": "medical_query", "confidence": 0.7, "entities": {}, "reasoning": "Default medical"}
        
        return {"intent": "unknown", "confidence": 0.5, "entities": {}, "reasoning": "No pattern match"}
    
    def classify(self, query: str, language: str = "en", context: Optional[Dict] = None, use_rag: bool = False) -> RoutingDecision:
        """
        Classify intent and determine routing
        
        OPTIMIZED FLOW (for speed):
        1. First try fast pattern matching (~1ms)
        2. If high confidence (>0.7), use that result immediately
        3. Only use LLM for ambiguous cases
        4. Optionally use RAG for context-aware responses
        
        Args:
            query: User message
            language: Language code (en, hi, etc.)
            context: Optional context (user info, conversation history)
            use_rag: Whether to use RAG for enhanced responses
            
        Returns:
            RoutingDecision with intent, backend, and optional quick response
        """
        start_time = time.time()
        
        # Extract patient_id from context if available
        patient_id = None
        if context:
            patient_id = context.get("patient_id")
            if not patient_id:
                patient_data = context.get("patient_data") or {}
                patient_id = patient_data.get("id") or patient_data.get("patient_id")
        
        # STEP 1: Fast pattern matching first (instant)
        parsed = self._fallback_classify(query)
        confidence = parsed.get("confidence", 0.5)
        
        # STEP 2: If high confidence, use pattern result (skip LLM)
        USE_LLM_THRESHOLD = 0.6  # Only use LLM if pattern confidence < 60%
        
        if confidence >= USE_LLM_THRESHOLD:
            logger.debug(f"🚀 Fast path: pattern match confidence {confidence:.0%}")
        else:
            # STEP 3: Low confidence - try LLM for better classification
            model_available = self._load_model()
            
            if model_available and self._llm:
                try:
                    prompt = self._build_prompt(query, context)
                    
                    response = self._llm(
                        prompt,
                        max_tokens=256,
                        temperature=0.1,
                        stop=["</s>", "<|user|>"]
                    )
                    
                    raw_output = response['choices'][0]['text'].strip()
                    llm_parsed = self._parse_response(raw_output)
                    
                    # Use LLM result if it has higher confidence
                    if llm_parsed.get("confidence", 0) > confidence:
                        parsed = llm_parsed
                        
                except Exception as e:
                    logger.warning(f"Qwen inference failed: {e}, using pattern match")
        
        # Determine backend routing
        intent = parsed.get("intent", "unknown")
        confidence = parsed.get("confidence", 0.5)
        backend = self.INTENT_ROUTING.get(intent, "isha")
        
        # Auto-enable RAG for personal health queries
        if intent in ("my_health", "patient_history"):
            use_rag = True
            logger.info(f"📚 Auto-enabling RAG for personal health query: {intent}")
        
        # ═══════════════════════════════════════════════════════════════
        # Generate response for LOCAL intents using Qwen CPU
        # Optionally enhanced with RAG context
        # ═══════════════════════════════════════════════════════════════
        quick_response = None
        if backend == "local":
            # Try RAG-enhanced response if enabled or for my_health queries
            if use_rag:
                quick_response = self.generate_with_rag(query, patient_id, language)
            
            # Fallback to standard generation
            if not quick_response:
                quick_response = self._generate_conversation(intent, query, language)
            
            # Final fallback to static response
            if not quick_response and intent in self.QUICK_RESPONSES:
                responses = self.QUICK_RESPONSES[intent]
                quick_response = responses.get(language, responses.get("en"))
                logger.debug(f"Using static fallback for {intent}")
        
        latency = (time.time() - start_time) * 1000
        
        return RoutingDecision(
            intent=intent,
            confidence=confidence,
            backend=backend,
            quick_response=quick_response,
            entities=parsed.get("entities", {}),
            reasoning=parsed.get("reasoning", ""),
            latency_ms=latency
        )
    
    def should_use_local(self, decision: RoutingDecision) -> bool:
        """Check if query can be handled locally by Qwen"""
        return decision.backend == "local" and decision.quick_response is not None
    
    def get_backend_priority(self, intent: str) -> List[str]:
        """
        Get backend priority list for an intent
        
        Fallback chain:
        - Local (Qwen CPU): No fallback needed, static responses work
        - Medical (iSHA GPU): iSHA → Groq → Gemini
        """
        primary = self.INTENT_ROUTING.get(intent, "isha")
        
        # Define fallback chains
        fallback_chains = {
            "local": ["local"],  # Qwen CPU handles all conversations
            "isha": ["isha", "groq", "gemini"],  # GPU → Cloud fallbacks
            "groq": ["groq", "gemini", "isha"],
            "gemini": ["gemini", "groq", "isha"]
        }
        
        return fallback_chains.get(primary, ["isha", "groq", "gemini"])


# Singleton instance
_router_instance: Optional[TinyLlamaRouter] = None

def get_router() -> TinyLlamaRouter:
    """Get or create the TinyLlama router singleton"""
    global _router_instance
    if _router_instance is None:
        _router_instance = TinyLlamaRouter()
    return _router_instance


def get_shared_llm():
    """Return the underlying Llama model instance (shared across all consumers).
    Callers must not modify model state — use only for inference calls.
    Returns None if the model failed to load."""
    return get_router()._llm


# Quick test
if __name__ == "__main__":
    router = TinyLlamaRouter()
    
    test_queries = [
        "hi",
        "book health checkup",
        "I have fever and headache",
        "what is my appointment status",
        "tell me about entrepreneurship",
        "thank you",
        "bye"
    ]
    
    print("=" * 60)
    print("TinyLlama Intent Router Test")
    print("=" * 60)
    
    for q in test_queries:
        result = router.classify(q)
        print(f"\nQuery: {q}")
        print(f"  Intent: {result.intent} ({result.confidence:.0%})")
        print(f"  Backend: {result.backend}")
        print(f"  Latency: {result.latency_ms:.0f}ms")
        if result.quick_response:
            print(f"  Response: {result.quick_response[:50]}...")
