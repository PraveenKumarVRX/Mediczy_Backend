"""
Medical AI Pipeline - Dr. iSHA Core Processing
===============================================

Full medical NLP pipeline:
1. MedSpaCy → NER, negation, sectioning
2. ClinicalBERT → embeddings  
3. FAISS → vector retrieval
4. Bayesian Network → risk inference
5. LLM (Llama-3.1-8B / Groq) → response generation
6. Safety Filter → output validation

Pipeline flow:
User Query → NER Extraction → Embed → Retrieve Context → 
Bayesian Risk → LLM Generation → Safety Filter → Response
"""

import os
import time
import logging
import re
from typing import Dict, Any, Optional, List, Tuple
from dataclasses import dataclass
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sib.medical_pipeline")


@dataclass
class PipelineResult:
    """Result from the medical pipeline"""
    response: str
    entities: List[Dict[str, Any]]
    risk_assessment: Dict[str, Any]
    context_chunks: List[str]
    safety_alerts: List[Dict[str, Any]]
    provider: str
    latency_ms: float
    is_emergency: bool = False


class MedicalPipeline:
    """
    Full medical NLP + RAG + LLM pipeline
    
    Components:
    - TinyLlama Router for intent classification & backend routing
    - MedSpaCy for NER/negation
    - ClinicalBERT for embeddings
    - pgvector for retrieval
    - Bayesian Network for risk
    - Llama/Groq/Gemini for generation
    - Safety filter for output validation
    """
    
    def __init__(self, config: Optional[Dict] = None):
        self.config = config or {}
        self._nlp = None
        self._embed_model = None
        self._pgvector_connected = False
        self._llm = None
        self._groq_client = None
        self._intent_router = None
        
        # API keys (loaded from environment — no hardcoded fallbacks)
        self.groq_api_key = os.environ.get("GROQ_API_KEY", "")
        self.gemini_api_key = os.environ.get("GEMINI_API_KEY", "")
        
        logger.info("🏥 Medical Pipeline initialized")
    
    # ==================== Component 0: TinyLlama Intent Router ====================
    
    def _load_intent_router(self):
        """Lazy load TinyLlama intent router"""
        if self._intent_router is not None:
            return self._intent_router
        
        try:
            # Try relative import first (when used as module)
            from .tinyllama_router import TinyLlamaRouter
            self._intent_router = TinyLlamaRouter()
            logger.info("✅ TinyLlama Intent Router loaded")
        except ImportError:
            try:
                # Fallback for direct script execution
                from tinyllama_router import TinyLlamaRouter
                self._intent_router = TinyLlamaRouter()
                logger.info("✅ TinyLlama Intent Router loaded (direct)")
            except Exception as e:
                logger.warning(f"⚠️ TinyLlama Router not available: {e}")
                self._intent_router = None
        except Exception as e:
            logger.warning(f"⚠️ TinyLlama Router not available: {e}")
            self._intent_router = None
        
        return self._intent_router
    
    def route_query(self, query: str, language: str = "en", context: Optional[Dict] = None, use_rag: bool = False):
        """
        Route query using TinyLlama intent classifier
        
        Args:
            query: User message
            language: Language code
            context: Optional context with patient_id, conversation history
            use_rag: Whether to use RAG for context-aware responses
        
        Returns:
            RoutingDecision with intent, backend, and optional quick response
        """
        router = self._load_intent_router()
        if router:
            return router.classify(query, language, context, use_rag=use_rag)
        
        # Fallback if router not available
        return None
    
    # ==================== Component 1: MedSpaCy NER ====================
    
    def _load_medspacy(self):
        """Lazy load MedSpaCy"""
        if self._nlp is not None:
            return self._nlp
        
        try:
            import medspacy
            self._nlp = medspacy.load()
            
            # Add additional components if available
            try:
                from medspacy.ner import TargetMatcher
                target_matcher = TargetMatcher(self._nlp)
                self._nlp.add_pipe("medspacy_target_matcher")
            except:
                pass
            
            logger.info("✅ MedSpaCy loaded with clinical NER")
        except ImportError:
            try:
                import spacy
                self._nlp = spacy.load("en_core_web_sm")
                logger.info("✅ SpaCy fallback loaded")
            except:
                logger.warning("⚠️ No NLP model available")
                self._nlp = None
        
        return self._nlp
    
    def extract_entities(self, text: str) -> Dict[str, Any]:
        """
        Extract medical entities using MedSpaCy
        
        Returns:
            Dict with entities, sections, negations
        """
        nlp = self._load_medspacy()
        
        if nlp is None:
            return self._fallback_entity_extraction(text)
        
        doc = nlp(text)
        
        # Extract entities
        entities = []
        for ent in doc.ents:
            entity = {
                "text": ent.text,
                "label": ent.label_,
                "start": ent.start_char,
                "end": ent.end_char
            }
            
            # Check for negation (MedSpaCy)
            if hasattr(ent, 'is_negated'):
                entity["is_negated"] = ent.is_negated
            elif hasattr(ent, 'negation'):
                entity["is_negated"] = ent.negation
            else:
                entity["is_negated"] = False
            
            entities.append(entity)
        
        # Section detection
        sections = {}
        current_section = "Chief Complaint"
        section_headers = [
            "history of present illness", "past medical history", 
            "medications", "allergies", "physical exam", "assessment",
            "plan", "social history", "family history", "review of systems"
        ]
        
        for sent in doc.sents:
            sent_lower = sent.text.lower().strip()
            
            # Check for section headers
            for header in section_headers:
                if header in sent_lower:
                    current_section = header.title()
                    break
            
            sections.setdefault(current_section, []).append(sent.text.strip())
        
        return {
            "entities": entities,
            "sections": sections,
            "sentence_count": len(list(doc.sents)),
            "has_negations": any(e.get("is_negated", False) for e in entities)
        }
    
    def _fallback_entity_extraction(self, text: str) -> Dict[str, Any]:
        """Regex-based entity extraction fallback"""
        entities = []
        
        # Symptom patterns
        symptom_patterns = [
            r'\b(headache|fever|pain|cough|nausea|vomiting|diarrhea|fatigue|dizziness)\b',
            r'\b(shortness of breath|chest pain|abdominal pain|back pain)\b',
            r'\b(sore throat|runny nose|congestion|chills|sweating)\b'
        ]
        
        for pattern in symptom_patterns:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                entities.append({
                    "text": match.group(0),
                    "label": "SYMPTOM",
                    "start": match.start(),
                    "end": match.end(),
                    "is_negated": self._check_negation(text, match.start())
                })
        
        # Medication patterns
        med_patterns = [
            r'\b(aspirin|ibuprofen|acetaminophen|tylenol|advil|motrin)\b',
            r'\b(metformin|lisinopril|atorvastatin|omeprazole|losartan)\b',
            r'\b(\d+\s*mg|\d+\s*ml)\b'
        ]
        
        for pattern in med_patterns:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                entities.append({
                    "text": match.group(0),
                    "label": "MEDICATION",
                    "start": match.start(),
                    "end": match.end(),
                    "is_negated": False
                })
        
        return {
            "entities": entities,
            "sections": {"General": [text]},
            "sentence_count": len(text.split('.')),
            "has_negations": any(e.get("is_negated", False) for e in entities)
        }
    
    def _check_negation(self, text: str, position: int) -> bool:
        """Check if term is negated using simple patterns"""
        # Look at 50 chars before the term
        prefix = text[max(0, position-50):position].lower()
        
        negation_patterns = [
            r'\bno\b', r'\bnot\b', r'\bnone\b', r'\bnever\b',
            r'\bdenies\b', r'\bwithout\b', r'\babsence\b', r'\bnegative\b'
        ]
        
        for pattern in negation_patterns:
            if re.search(pattern, prefix):
                return True
        return False
    
    # ==================== Component 2: ClinicalBERT Embeddings ====================
    
    def _load_embed_model(self):
        """Lazy load ClinicalBERT"""
        if self._embed_model is not None:
            return self._embed_model
        
        try:
            from sentence_transformers import SentenceTransformer
            self._embed_model = SentenceTransformer("emilyalsentzer/Bio_ClinicalBERT")
            logger.info("✅ ClinicalBERT loaded")
        except Exception as e:
            try:
                from sentence_transformers import SentenceTransformer
                self._embed_model = SentenceTransformer("all-MiniLM-L6-v2")
                logger.info("✅ MiniLM fallback loaded")
            except:
                logger.warning(f"⚠️ No embedding model available: {e}")
                self._embed_model = None
        
        return self._embed_model
    
    def embed_text(self, text: str) -> Optional[List[float]]:
        """Generate embedding for text"""
        model = self._load_embed_model()
        if model is None:
            return None
        
        embedding = model.encode([text], convert_to_numpy=True)
        return embedding[0].tolist()
    
    # ==================== Component 3: pgvector Retrieval ====================
    
    def retrieve_context(self, query: str, k: int = 5) -> List[Dict[str, Any]]:
        """Retrieve relevant context from pgvector"""
        try:
            import sys
            base_dir = Path(__file__).resolve().parent.parent
            sys.path.insert(0, str(base_dir / "utils"))
            
            from pgvector_store import retrieve, get_stats
            
            if not self._pgvector_connected:
                stats = get_stats()
                if stats.get("status") == "connected":
                    self._pgvector_connected = True
                    logger.info(f"✅ pgvector: {stats.get('total_vectors')} vectors")
            
            results = retrieve(query, k=k)
            return results
        except Exception as e:
            logger.warning(f"⚠️ pgvector retrieval failed: {e}")
            return []
    
    # ==================== Component 4: Bayesian Risk ====================
    
    def assess_risk(self, patient_data: Dict[str, Any]) -> Dict[str, Any]:
        """Assess cardiovascular risk using Bayesian Network"""
        try:
            from utils.bayesian_network import get_full_assessment
            return get_full_assessment(patient_data)
        except Exception as e:
            logger.warning(f"⚠️ Bayesian assessment failed: {e}")
            return {
                "CardioRisk": -1,
                "CardioRisk_label": "Unknown",
                "TreatmentPriority": -1,
                "TreatmentPriority_label": "Unknown",
                "recommendations": [],
                "error": str(e)
            }
    
    def extract_patient_data_from_text(self, text: str) -> Dict[str, Any]:
        """Extract patient data for Bayesian inference"""
        patient_data = {}
        
        # Age extraction
        age_match = re.search(r'(\d{1,2})\s*(?:year|yr|y/o|yo)', text, re.IGNORECASE)
        if age_match:
            patient_data['age'] = int(age_match.group(1))
        
        # Blood pressure
        bp_match = re.search(r'(?:BP|blood pressure)[:\s]*(\d{2,3})\s*/\s*(\d{2,3})', text, re.IGNORECASE)
        if bp_match:
            patient_data['systolic_bp'] = int(bp_match.group(1))
        
        # Cholesterol
        chol_match = re.search(r'(?:cholesterol|chol)[:\s]*(\d{2,3})', text, re.IGNORECASE)
        if chol_match:
            patient_data['cholesterol'] = int(chol_match.group(1))
        
        # Diabetes
        if re.search(r'\b(diabetic|diabetes|dm|type\s*[12]\s*diabetes)\b', text, re.IGNORECASE):
            patient_data['diabetic'] = True
        else:
            patient_data['diabetic'] = False
        
        return patient_data
    
    def _build_patient_context(self, patient_data: Dict[str, Any]) -> str:
        """
        Build a human-readable context string from patient data.
        
        This includes:
        - User info (name, age, etc.)
        - Upcoming appointments
        - Recent appointments
        - Active medications
        - Recent prescriptions
        """
        parts = []
        
        # User info
        user = patient_data.get('user') or {}
        if user:
            name = user.get('name') or user.get('firstName') or 'Unknown'
            parts.append(f"Patient Name: {name}")
            if user.get('age'):
                parts.append(f"Age: {user['age']}")
            if user.get('gender'):
                parts.append(f"Gender: {user['gender']}")
            if user.get('bloodGroup'):
                parts.append(f"Blood Group: {user['bloodGroup']}")
        
        # Appointments
        appointments = patient_data.get('appointments') or {}
        upcoming = appointments.get('upcoming') or []
        recent = appointments.get('recent') or []
        
        if upcoming:
            parts.append(f"\n=== UPCOMING APPOINTMENTS ({len(upcoming)}) ===")
            for apt in upcoming[:5]:  # Limit to 5
                doc = apt.get('doctorName') or apt.get('doctor_name') or 'Unknown Doctor'
                date = apt.get('appointmentDate') or apt.get('appointment_date') or 'TBD'
                time = apt.get('appointmentTime') or apt.get('appointment_time') or ''
                status = apt.get('status') or 'Scheduled'
                consult_type = apt.get('consultationType') or apt.get('consultation_type') or 'In-person'
                parts.append(f"- {doc} on {date} {time} ({consult_type}) - Status: {status}")
        
        if recent:
            parts.append(f"\n=== RECENT APPOINTMENTS ({len(recent)}) ===")
            for apt in recent[:3]:  # Limit to 3
                doc = apt.get('doctorName') or apt.get('doctor_name') or 'Unknown Doctor'
                date = apt.get('appointmentDate') or apt.get('appointment_date') or 'Unknown'
                status = apt.get('status') or 'Completed'
                specialization = apt.get('specialization') or ''
                parts.append(f"- {doc} ({specialization}) on {date} - Status: {status}")
        
        # Active medications
        medications = patient_data.get('activeMedications') or []
        if medications:
            parts.append(f"\n=== ACTIVE MEDICATIONS ({len(medications)}) ===")
            for med in medications[:5]:
                name = med.get('name') or med.get('medicineName') or str(med)
                dosage = med.get('dosage') or ''
                parts.append(f"- {name} {dosage}".strip())
        
        # Prescriptions
        prescriptions = patient_data.get('prescriptions') or {}
        recent_rx = prescriptions.get('recent') if isinstance(prescriptions, dict) else prescriptions
        if recent_rx and isinstance(recent_rx, list):
            parts.append(f"\n=== RECENT PRESCRIPTIONS ({len(recent_rx)}) ===")
            for rx in recent_rx[:3]:
                doc = rx.get('doctorName') or rx.get('doctor_name') or 'Unknown'
                date = rx.get('prescriptionDate') or rx.get('prescription_date') or 'Recent'
                parts.append(f"- Prescribed by {doc} on {date}")
        
        # Summary if available
        if patient_data.get('summary'):
            parts.append(f"\n=== SUMMARY ===")
            parts.append(patient_data['summary'])
        
        return "\n".join(parts) if parts else ""
    
    # ==================== Component 5: LLM Generation ====================
    
    def generate_response(self, query: str, context: List[str] = None, 
                         system_prompt: str = "You are Dr. iSHA, a helpful medical AI assistant.",
                         patient_data: Dict = None) -> Tuple[str, str]:
        """
        Generate response using LLM (Groq primary, then fallbacks)
        
        Args:
            query: User query
            context: Retrieved context chunks
            system_prompt: Optional custom system prompt
            patient_data: Patient's health data (appointments, prescriptions, user info)
        
        Returns:
            Tuple of (response, provider)
        """
        # Build context-augmented prompt
        context_text = "\n".join(context) if context else ""
        
        # Build patient context string from patient_data
        patient_context = ""
        if patient_data:
            patient_context = self._build_patient_context(patient_data)
        
        default_system = """You are Dr. iSHA 🩺, a friendly AI health assistant at Mediczy.

PERSONALITY: Warm, concise, conversational — like a knowledgeable friend who happens to be a doctor. Never cold, never robotic.

RESPONSE RULES (NON-NEGOTIABLE):
- MAXIMUM 3 sentences per reply. No essays, no bullet lists unless absolutely needed.
- One idea at a time. Ask ONE follow-up question if needed — never two.
- Use plain language. No medical jargon unless the user used it first.
- NEVER repeat what the user just said back to them.
- NEVER start with "Great question!" or hollow filler phrases.
- End with a short, natural follow-up like "Want me to book a doctor for you?" or "Does that help?"

PRESCRIPTION RULE: Never name specific medications to treat the user. If asked "what medicine for X", say: "That one really needs a doctor's call — want me to book you an appointment?" (one sentence, done).

PATIENT CONTEXT: If patient data is provided, use their name and reference their actual appointments/prescriptions naturally.

EMERGENCIES: "Please call 108 / 911 immediately." — nothing more needed.

NON-HEALTH QUESTIONS: "I'm only set up for health topics — what's going on health-wise?"

EXAMPLES of good replies:
User: "I have a headache since morning"
You: "How bad is it on a scale of 1–10, and is it throbbing or more of a pressure feeling?"

User: "When is my next appointment?"
You: "Your next appointment is with Dr. Sharma on Feb 5 at 10:30 AM. Need to reschedule?"

User: "Thanks"
You: "Anytime! Anything else on your mind?"
"""
        
        system_prompt = system_prompt or default_system
        
        # Build the full prompt with patient context
        prompt_parts = []
        
        if patient_context:
            prompt_parts.append(f"""=== PATIENT CONTEXT (from database) ===
{patient_context}
=== END PATIENT CONTEXT ===
""")
        
        if context_text:
            prompt_parts.append(f"""Based on the following medical reference context:
{context_text}
""")
        
        prompt_parts.append(f"Patient query: {query}")
        prompt_parts.append("\nProvide a helpful, empathetic response. If the patient asks about their appointments or prescriptions, use the PATIENT CONTEXT information provided above.")
        
        full_prompt = "\n".join(prompt_parts)
        
        # Try local GPU first (HIGHEST PRIORITY)
        try:
            response = self._generate_with_local_gpu(full_prompt, system_prompt, user_query=query)
            if response:
                return response, "local-gpu"
        except Exception as e:
            logger.warning(f"⚠️ Local GPU failed: {e}, falling back to Groq")
        
        # Fallback to Groq
        try:
            response = self._generate_with_groq(full_prompt, system_prompt)
            if response:
                return response, "groq"
        except Exception as e:
            logger.warning(f"⚠️ Groq failed: {e}")
        
        # Try Gemini
        try:
            response = self._generate_with_gemini(full_prompt, system_prompt)
            if response:
                return response, "gemini"
        except Exception as e:
            logger.warning(f"⚠️ Gemini failed: {e}")
        
        # Fallback response
        return self._get_fallback_response(query), "fallback"
    
    def _select_gpu_model(self, prompt: str, context: List[str] = None) -> tuple:
        """
        Select the best GPU model based on query content.
        
        Available models on 3090 GPU server (updated):
        - Port 8080: BiMediX2-8B (best clinical AI Doctor)
        - Port 8082: Qwen-0.6B (fast/scribe)
        - Port 8083: OpenInsurance-8B (billing, claims)
        
        Returns: (port, model_name, agent_type)
        """
        prompt_lower = prompt.lower()
        
        # Insurance/billing keywords → OpenInsurance (8083)
        insurance_keywords = ['insurance', 'claim', 'billing', 'coverage', 'policy', 
                             'premium', 'deductible', 'copay', 'reimbursement', 
                             'pre-authorization', 'network', 'hmo', 'ppo']
        if any(kw in prompt_lower for kw in insurance_keywords):
            return 8083, "openinsurancellm-llama3-8b", "Billing"
        
        # Default: Use BiMediX2 (8080) for all medical queries - best clinical AI
        return 8080, "BiMediX2-8B", "Clinical"
    
    def _generate_with_local_gpu(self, prompt: str, system_prompt: str, user_query: str = None) -> str:
        """Generate with iSHA AI GPU via https://ai.isha.buzz (Cloudflare tunnel to GPU servers)"""
        import requests
        
        # Select the best model based on USER QUERY only (not full prompt with context)
        # This prevents patient context keywords from affecting model selection
        query_for_routing = user_query if user_query else prompt
        port, model_name, agent_type = self._select_gpu_model(query_for_routing)
        
        # Use ai.isha.buzz which tunnels to GPU servers
        gpu_url = os.environ.get("ISHA_AI_URL", "https://ai.isha.buzz")
        
        logger.info(f"🧠 Routing to {model_name} (port {port}) for agent_type: {agent_type}")
        
        start = time.time()
        response = requests.post(
            f"{gpu_url}/v1/chat/completions",
            json={
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ],
                "max_tokens": 300,
                "temperature": 0.75,
                "agent_type": agent_type,
                "model_port": port  # Hint for backend routing
            },
            timeout=60
        )
        response.raise_for_status()
        data = response.json()
        
        latency = (time.time() - start) * 1000
        model = data.get("model", model_name)
        logger.info(f"✅ iSHA AI GPU inference: {latency:.2f}ms (model: {model})")
        
        return data["choices"][0]["message"]["content"]
    
    def _generate_with_groq(self, prompt: str, system_prompt: str) -> str:
        """Generate with Groq API (FALLBACK)"""
        if not self.groq_api_key:
            return ""
        
        try:
            from groq import Groq
            
            if self._groq_client is None:
                self._groq_client = Groq(api_key=self.groq_api_key)
            
            # Ensure system_prompt is a string
            if not isinstance(system_prompt, str):
                system_prompt = str(system_prompt) if system_prompt else "You are Dr. iSHA, a helpful medical AI assistant."
            
            start = time.time()
            response = self._groq_client.chat.completions.create(
                model="llama-3.1-8b-instant",  # Using available model (70b blocked at project level)
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.75,
                max_tokens=300  # Short conversational replies
            )
            
            latency = (time.time() - start) * 1000
            logger.info(f"✅ Groq API inference: {latency:.2f}ms")
            
            return response.choices[0].message.content
        except Exception as e:
            raise e
    
    def _generate_with_llama(self, prompt: str, system_prompt: str) -> str:
        """Generate with local Llama model"""
        try:
            from llama_cpp import Llama
            
            if self._llm is None:
                model_path = Path(__file__).parent.parent / "models" / "Llama-3.1-8B-Instruct-Q4_K_M.gguf"
                if not model_path.exists():
                    return ""
                
                logger.info(f"🚀 Loading Llama model...")
                self._llm = Llama(
                    model_path=str(model_path),
                    n_ctx=4096,
                    n_threads=4,
                    verbose=False
                )
            
            start = time.time()
            response = self._llm.create_chat_completion(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=300,  # Short conversational replies
                temperature=0.75
            )
            
            latency = (time.time() - start) * 1000
            logger.info(f"✅ Llama inference: {latency:.2f}ms")
            
            return response["choices"][0]["message"]["content"]
        except Exception as e:
            raise e
    
    def _generate_with_gemini(self, prompt: str, system_prompt: str) -> str:
        """Generate with Gemini API"""
        if not self.gemini_api_key:
            return ""
        
        try:
            import google.generativeai as genai
            
            genai.configure(api_key=self.gemini_api_key)
            model = genai.GenerativeModel("gemini-1.5-flash")
            
            full_prompt = f"{system_prompt}\n\n{prompt}"
            response = model.generate_content(full_prompt)
            
            return response.text
        except Exception as e:
            raise e
    
    def _get_fallback_response(self, query: str) -> str:
        """Static fallback response"""
        return """🔍 **Understanding Your Concern**

Thank you for sharing your health concern with me.

🏥 **Recommended Actions**
- If symptoms are severe or persistent, please consult a healthcare provider
- Keep track of your symptoms
- Stay hydrated and get adequate rest

📞 **For Emergencies**
- Call emergency services (911 or 108) immediately

⚕️ *This is general guidance. Please consult qualified healthcare professionals for proper diagnosis and treatment.*"""
    
    # ==================== Component 6: Safety Filter ====================
    
    def apply_safety_filter(self, response: str) -> Tuple[str, List[Dict], bool]:
        """
        Apply safety filter to response
        
        Returns:
            Tuple of (filtered_response, alerts, is_emergency)
        """
        try:
            from utils.safety_filter import safety_check
            result = safety_check(response)
            return result["filtered_text"], result["alerts"], result["is_emergency"]
        except Exception as e:
            logger.warning(f"⚠️ Safety filter failed: {e}")
            return response, [], False
    
    # ==================== Full Pipeline ====================
    
    async def process_async(self, query: str, patient_data: Optional[Dict] = None,
                            user_id: Optional[int] = None,
                            include_risk: bool = True, include_retrieval: bool = True) -> PipelineResult:
        """
        Async version: Run full medical AI pipeline with Mediczy DB access
        
        Args:
            query: User query
            patient_data: Optional patient health data for risk assessment
            user_id: If provided, fetches full context from Mediczy database
            include_risk: Whether to include Bayesian risk assessment
            include_retrieval: Whether to include FAISS context retrieval
            
        Returns:
            PipelineResult with response and metadata
        """
        start_time = time.time()
        
        # If user_id provided, fetch full context from Mediczy DB
        if user_id and not patient_data:
            try:
                from sib.database import get_mediczy_data
                mediczy = get_mediczy_data()
                patient_data = await mediczy.get_full_patient_context(user_id)
                logger.info(f"✅ Loaded full patient context for user {user_id} from Mediczy DB")
            except Exception as e:
                logger.warning(f"⚠️ Could not fetch Mediczy context for user {user_id}: {e}")
        
        # Delegate to sync process
        return self.process(query, patient_data, include_risk, include_retrieval)
    
    def process(self, query: str, patient_data: Optional[Dict] = None,
                include_risk: bool = True, include_retrieval: bool = True,
                language: str = "en", fast_mode: bool = True, use_rag: bool = False,
                conversation_history: Optional[List[Dict]] = None) -> PipelineResult:
        """
        Run medical AI pipeline with TinyLlama routing
        
        OPTIMIZED Flow (fast_mode=True, default):
        1. TinyLlama classifies intent → decides backend
        2. If LOCAL: return quick response immediately (~0ms)
        3. If MEDICAL: Skip NER/FAISS, call iSHA directly (~2s)
        
        RAG-Enhanced Flow (use_rag=True):
        - Qwen retrieves patient context from FAISS
        - Generates personalized responses using RAG
        
        Full Flow (fast_mode=False):
        1. TinyLlama routing
        2. MedSpaCy NER extraction
        3. Bayesian risk assessment
        4. FAISS context retrieval
        5. LLM generation
        
        Args:
            query: User query
            patient_data: Optional patient health data for risk assessment
            include_risk: Whether to include Bayesian risk assessment
            include_retrieval: Whether to include FAISS context retrieval
            language: Language code for responses
            fast_mode: Skip NER/FAISS for speed (default True)
            use_rag: Use RAG for context-aware responses (default False)
            
        Returns:
            PipelineResult with response and metadata
        """
        start_time = time.time()
        
        # Build context with patient_id for RAG
        context = {"patient_data": patient_data}
        if patient_data:
            context["patient_id"] = patient_data.get("id") or patient_data.get("patient_id")
        
        # ═══════════════════════════════════════════════════════════════
        # Step 0: TinyLlama Intent Classification & Routing
        # With optional RAG for context-aware responses
        # ═══════════════════════════════════════════════════════════════
        routing_decision = self.route_query(query, language, context, use_rag=use_rag)
        
        if routing_decision:
            logger.info(f"🦙 TinyLlama routing: intent={routing_decision.intent}, "
                       f"backend={routing_decision.backend}, "
                       f"confidence={routing_decision.confidence:.0%}")
            
            # Handle LOCAL responses immediately (~0ms)
            if routing_decision.backend == "local" and routing_decision.quick_response:
                latency = (time.time() - start_time) * 1000
                return PipelineResult(
                    response=routing_decision.quick_response,
                    entities=[],
                    risk_assessment={},
                    context_chunks=[],
                    safety_alerts=[],
                    provider="local-tinyllama",
                    latency_ms=round(latency, 2),
                    is_emergency=False
                )
            
            # Store routing decision for backend selection
            preferred_backend = routing_decision.backend
            intent = routing_decision.intent
        else:
            preferred_backend = "isha"
            intent = "unknown"
        
        # ═══════════════════════════════════════════════════════════════
        # FAST PATH: Skip NER/FAISS for simple medical queries (~2s)
        # ═══════════════════════════════════════════════════════════════
        if fast_mode and intent in ("symptom_check", "medical_query", "medication_info"):
            logger.info("⚡ Fast path: Direct API call (skipping NER/FAISS)")
            
            # Call iSHA API directly
            response = self._call_isha(query, None, patient_data, conversation_history=conversation_history)
            
            if response:
                # Quick safety check
                filtered_response, safety_alerts, is_emergency = self.apply_safety_filter(response)
                latency = (time.time() - start_time) * 1000
                
                return PipelineResult(
                    response=filtered_response,
                    entities=[],  # Skip NER for speed
                    risk_assessment={},
                    context_chunks=[],
                    safety_alerts=safety_alerts,
                    provider="isha-fast",
                    latency_ms=round(latency, 2),
                    is_emergency=is_emergency
                )
            
            # Fall through to full pipeline if API fails
            logger.warning("⚠️ Fast path failed, using full pipeline")
        
        # ═══════════════════════════════════════════════════════════════
        # FULL PIPELINE: NER + Risk + FAISS + LLM
        # ═══════════════════════════════════════════════════════════════
        ner_result = self.extract_entities(query)
        entities = ner_result["entities"]
        
        # Extract patient data from query if not provided
        if patient_data is None:
            patient_data = self.extract_patient_data_from_text(query)
        
        # Bayesian risk assessment (only if needed)
        risk_assessment = {}
        if include_risk and patient_data:
            risk_assessment = self.assess_risk(patient_data)
        
        # Step 4: FAISS retrieval
        context_chunks = []
        if include_retrieval:
            retrieved = self.retrieve_context(query, k=5)
            context_chunks = [r["text"] for r in retrieved]
        
        # ═══════════════════════════════════════════════════════════════
        # Step 5: LLM generation with routed backend
        # ═══════════════════════════════════════════════════════════════
        response, provider = self.generate_response_routed(
            query,
            context=context_chunks if context_chunks else None,
            patient_data=patient_data,
            preferred_backend=preferred_backend,
            conversation_history=conversation_history
        )
        
        # Step 6: Safety filter
        filtered_response, safety_alerts, is_emergency = self.apply_safety_filter(response)
        
        # Add risk info to response if high risk detected
        if risk_assessment.get("CardioRisk") == 1:
            risk_note = f"\n\n⚠️ **Risk Alert**: {risk_assessment.get('CardioRisk_label', 'Elevated')} cardiovascular risk detected. Priority: {risk_assessment.get('TreatmentPriority_label', 'Unknown')}."
            filtered_response += risk_note
        
        latency = (time.time() - start_time) * 1000
        
        return PipelineResult(
            response=filtered_response,
            entities=entities,
            risk_assessment=risk_assessment,
            context_chunks=context_chunks,
            safety_alerts=safety_alerts,
            provider=provider,
            latency_ms=round(latency, 2),
            is_emergency=is_emergency
        )
    
    def generate_response_routed(self, query: str, context: Optional[List[str]] = None,
                                  patient_data: Optional[Dict] = None,
                                  preferred_backend: str = "isha",
                                  conversation_history: Optional[List[Dict]] = None) -> Tuple[str, str]:
        """
        Generate response using the routed backend
        
        Backend priority based on TinyLlama routing:
        - isha: iSHA.buzz API (medical RAG)
        - groq: Groq Llama-3.1 (fast reasoning)
        - gemini: Google Gemini (complex analysis)
        """
        
        # Define backend order based on preference
        backend_order = {
            "isha": ["isha", "groq", "gemini"],
            "groq": ["groq", "gemini", "isha"],
            "gemini": ["gemini", "groq", "isha"]
        }
        
        backends = backend_order.get(preferred_backend, ["isha", "groq", "gemini"])
        
        for backend in backends:
            try:
                if backend == "isha":
                    response = self._call_isha(query, context, patient_data, conversation_history=conversation_history)
                    if response:
                        return response, "isha-api"
                        
                elif backend == "groq":
                    response = self._call_groq(query, context, patient_data, conversation_history=conversation_history)
                    if response:
                        return response, "groq-llama"
                        
                elif backend == "gemini":
                    response = self._call_gemini(query, context, patient_data, conversation_history=conversation_history)
                    if response:
                        return response, "gemini"
                        
            except Exception as e:
                logger.warning(f"⚠️ Backend {backend} failed: {e}")
                continue
        
        # Final fallback to standard generate_response
        return self.generate_response(query, context, patient_data)
    
    def _get_isha_token(self) -> Optional[str]:
        """Get a valid iSHA bearer token, refreshing if expired."""
        import time
        import requests

        isha_url = os.environ.get("ISHA_AI_URL", "https://ai.isha.buzz")
        username = os.environ.get("ISHA_AUTH_USERNAME", "admin")
        password = os.environ.get("ISHA_AUTH_PASSWORD", "admin123")

        # Return cached token if still valid (with 5-minute buffer)
        if hasattr(self, '_isha_token') and self._isha_token:
            if time.time() < getattr(self, '_isha_token_exp', 0) - 300:
                return self._isha_token

        try:
            resp = requests.post(
                f"{isha_url}/auth/login",
                json={"username": username, "password": password},
                timeout=8
            )
            if resp.status_code == 200:
                data = resp.json()
                token = data.get("access_token")
                # Decode expiry from JWT payload (middle segment)
                import base64, json as _json
                payload_b64 = token.split(".")[1]
                payload_b64 += "=" * (4 - len(payload_b64) % 4)
                payload = _json.loads(base64.b64decode(payload_b64))
                self._isha_token = token
                self._isha_token_exp = payload.get("exp", time.time() + 3600)
                logger.info("🔑 iSHA token refreshed")
                return token
        except Exception as e:
            logger.warning(f"⚠️ iSHA token refresh failed: {e}")
        return None

    def _call_isha(self, query: str, context: Optional[List[str]], 
                   patient_data: Optional[Dict],
                   conversation_history: Optional[List[Dict]] = None) -> Optional[str]:
        """Call iSHA.buzz API via /v1/chat/completions endpoint with connection pooling"""
        try:
            import requests
            from requests.adapters import HTTPAdapter
            from urllib3.util.retry import Retry
            
            # Use connection pooling (singleton session)
            if not hasattr(self, '_isha_session'):
                self._isha_session = requests.Session()
                retry = Retry(total=2, backoff_factor=0.1)
                adapter = HTTPAdapter(pool_connections=10, pool_maxsize=10, max_retries=retry)
                self._isha_session.mount('https://', adapter)
            
            # Get auth token
            token = self._get_isha_token()
            if not token:
                logger.warning("⚠️ iSHA token unavailable, skipping")
                return None
            
            # Build concise system prompt
            system_prompt = """You are Dr. iSHA 🩺, a friendly AI health assistant at Mediczy. MAXIMUM 3 sentences per reply. Ask ONE follow-up question if needed — never two. No bullet lists. No filler phrases. End naturally like 'Want me to book a doctor?' Never name medications for treatment."""
            if context:
                system_prompt += f"\n\nContext:\n" + "\n".join(context[:2])
            
            # Build messages array: system + last 6 history turns + current user message
            messages = [{"role": "system", "content": system_prompt}]
            if conversation_history:
                for turn in conversation_history[-6:]:
                    role = turn.get("role", "user")
                    content = turn.get("content", "")
                    if role in ("user", "assistant") and content:
                        messages.append({"role": role, "content": content})
            messages.append({"role": "user", "content": query})
            
            isha_url = os.environ.get("ISHA_AI_URL", "https://ai.isha.buzz")
            # Use the correct endpoint with agent_type
            response = self._isha_session.post(
                f"{isha_url}/v1/chat/completions",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "agent_type": "Clinical",
                    "messages": messages,
                    "max_tokens": 300,
                    "temperature": 0.75,
                    "stream": False
                },
                timeout=15
            )
            
            if response.status_code == 200:
                data = response.json()
                return data.get("choices", [{}])[0].get("message", {}).get("content")
            
            logger.warning(f"⚠️ iSHA API returned {response.status_code}: {response.text[:100]}")
            return None
        except Exception as e:
            logger.warning(f"⚠️ iSHA API call failed: {e}")
            return None
    
    def _call_groq(self, query: str, context: Optional[List[str]], 
                   patient_data: Optional[Dict],
                   conversation_history: Optional[List[Dict]] = None) -> Optional[str]:
        """Call Groq API (Fallback 1) - Fast cloud inference"""
        try:
            from groq import Groq
            
            if not self.groq_api_key:
                logger.warning("⚠️ Groq API key not configured")
                return None
            
            # Build system prompt
            system_prompt = """STRICT RULE: Reply in 2 sentences maximum, then ONE question. No paragraphs. No bullet lists. No filler like "I'm so sorry."

You are Dr. iSHA 🩺, a friendly AI health assistant. Be warm but ultra-brief. Only reference patient context if the user directly asks about it. Never name medications for treatment. Never list multiple questions."""
            if context:
                system_prompt += f"\n\nBackground (use only if asked):\n" + "\n".join(context[:1])
            
            # Build messages array: system + last 6 history turns + current user message
            messages = [{"role": "system", "content": system_prompt}]
            if conversation_history:
                for turn in conversation_history[-6:]:
                    role = turn.get("role", "user")
                    content = turn.get("content", "")
                    if role in ("user", "assistant") and content:
                        messages.append({"role": role, "content": content})
            messages.append({"role": "user", "content": query})
            
            client = Groq(api_key=self.groq_api_key)
            
            response = client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=messages,
                max_tokens=300,
                temperature=0.75
            )
            
            return response.choices[0].message.content
            
        except Exception as e:
            logger.warning(f"⚠️ Groq API call failed: {e}")
            return None
    
    def _call_gemini(self, query: str, context: Optional[List[str]], 
                     patient_data: Optional[Dict],
                     conversation_history: Optional[List[Dict]] = None) -> Optional[str]:
        """Call Gemini API (Fallback 2) - Google's AI"""
        try:
            import google.generativeai as genai
            
            if not self.gemini_api_key:
                logger.warning("⚠️ Gemini API key not configured")
                return None
            
            genai.configure(api_key=self.gemini_api_key)
            model = genai.GenerativeModel('gemini-1.5-flash')
            
            # Build prompt with history
            system_context = "You are Dr. iSHA 🩺, a friendly AI health assistant at Mediczy. MAXIMUM 3 sentences per reply. Ask ONE follow-up question if needed — never two. No bullet lists. End naturally.\n\n"
            if context:
                system_context += f"Context:\n" + "\n".join(context[:2]) + "\n\n"
            
            # Inline history into prompt since Gemini uses a flat prompt
            history_text = ""
            if conversation_history:
                for turn in conversation_history[-6:]:
                    role = turn.get("role", "user")
                    content = turn.get("content", "")
                    if role in ("user", "assistant") and content:
                        label = "Patient" if role == "user" else "Dr. iSHA"
                        history_text += f"{label}: {content}\n"
            
            full_prompt = system_context
            if history_text:
                full_prompt += f"Previous conversation:\n{history_text}\n"
            full_prompt += f"Patient: {query}\n\nDr. iSHA:"
            
            response = model.generate_content(full_prompt)
            return response.text
            
        except Exception as e:
            logger.warning(f"⚠️ Gemini API call failed: {e}")
            return None


# Singleton instance
_pipeline = None

def get_pipeline() -> MedicalPipeline:
    """Get or create pipeline singleton"""
    global _pipeline
    if _pipeline is None:
        _pipeline = MedicalPipeline()
    return _pipeline


# CLI interface
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Medical AI Pipeline")
    parser.add_argument("query", help="Medical query")
    parser.add_argument("--no-risk", action="store_true", help="Skip risk assessment")
    parser.add_argument("--no-retrieval", action="store_true", help="Skip context retrieval")
    args = parser.parse_args()
    
    pipeline = get_pipeline()
    result = pipeline.process(
        args.query,
        include_risk=not args.no_risk,
        include_retrieval=not args.no_retrieval
    )
    
    print(f"\n🩺 Dr. iSHA ({result.provider})")
    print("=" * 50)
    print(result.response)
    print(f"\n📊 Stats:")
    print(f"  Latency: {result.latency_ms}ms")
    print(f"  Entities: {len(result.entities)}")
    print(f"  Context chunks: {len(result.context_chunks)}")
    print(f"  Safety alerts: {len(result.safety_alerts)}")
    print(f"  Emergency: {'🚨 YES' if result.is_emergency else '✅ No'}")
