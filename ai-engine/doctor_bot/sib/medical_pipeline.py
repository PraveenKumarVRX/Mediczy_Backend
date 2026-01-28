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
    - MedSpaCy for NER/negation
    - ClinicalBERT for embeddings
    - FAISS for retrieval
    - Bayesian Network for risk
    - Llama/Groq/Gemini for generation
    - Safety filter for output validation
    """
    
    def __init__(self, config: Optional[Dict] = None):
        self.config = config or {}
        self._nlp = None
        self._embed_model = None
        self._faiss_loaded = False
        self._llm = None
        self._groq_client = None
        
        # API keys
        self.groq_api_key = os.environ.get(
            "GROQ_API_KEY",
            "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"
        )
        self.gemini_api_key = os.environ.get(
            "GEMINI_API_KEY", 
            "AIzaSyCVa8eKHpCzWvyFrd4jKKxkomxHI8iAp48"
        )
        
        logger.info("🏥 Medical Pipeline initialized")
    
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
    
    # ==================== Component 3: FAISS Retrieval ====================
    
    def retrieve_context(self, query: str, k: int = 5) -> List[Dict[str, Any]]:
        """Retrieve relevant context from FAISS index"""
        try:
            import sys
            # Add parent directory to path for utils import
            base_dir = Path(__file__).resolve().parent.parent
            sys.path.insert(0, str(base_dir))
            
            from utils.embed_store import retrieve, load_index
            
            if not self._faiss_loaded:
                # Use absolute paths for FAISS files
                faiss_path = base_dir / "embeddings" / "faiss_index.bin"
                metadata_path = base_dir / "embeddings" / "chunk_metadata.pkl"
                load_index(str(faiss_path), str(metadata_path))
                self._faiss_loaded = True
            
            results = retrieve(query, k=k)
            return results
        except Exception as e:
            logger.warning(f"⚠️ FAISS retrieval failed: {e}")
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
                         system_prompt: str = None, patient_data: Dict = None) -> Tuple[str, str]:
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
        
        default_system = """You are Dr. iSHA 👨‍⚕️, a warm, compassionate AI medical assistant at Mediczy.

CONVERSATION STYLE:
- Be conversational and ask questions to understand the patient's needs
- DON'T immediately give treatment options - first understand the problem
- Ask 1-2 clarifying questions before providing medical guidance
- Build a dialogue, not a monologue

CONVERSATION FLOW:
1. FIRST MESSAGE: Ask clarifying questions about symptoms, duration, severity
2. SUBSEQUENT MESSAGES: Based on responses, either:
   - Ask more questions if needed, OR
   - Provide guidance and suggest doctor consultation

EXAMPLE FIRST RESPONSE (for "I have stomach ache"):
"I'm sorry to hear you're having stomach discomfort! 😟

To help you better, could you tell me:
• How long have you been experiencing this pain?
• Where exactly do you feel it - upper, lower, left, or right side?
• Is the pain constant or does it come and go?

This will help me understand your situation better and guide you appropriately. 💙"

DOCTOR CONSULTATION OPTIONS:
When user needs to see a doctor, ALWAYS offer these options:
- 👨‍⚕️ **General Physician** - Available immediately for quick consultation
- 🏥 **Specialist Doctor** - Based on their specific complaint (e.g., Gastroenterologist for stomach issues)

Example:
"Based on what you've described, I recommend consulting a doctor:

👨‍⚕️ **Immediate Option:** Our General Physicians are available now for a quick consultation
🏥 **Specialist Option:** A Gastroenterologist can provide specialized care for digestive issues

Would you like me to help you book an appointment? Just say 'Book appointment' and I'll assist you! 📅"

APPOINTMENT BOOKING:
If user says "book appointment", "fix appointment", "schedule", "I want to see a doctor":
- Confirm the type of doctor they want
- Confirm their preferred date/time
- Say: "I'm setting up your appointment now..." 
- Use trigger word: [BOOK_APPOINTMENT:{specialist_type}]

IMPORTANT RULES:
1. ASK QUESTIONS FIRST - Don't jump to conclusions or treatments
2. Be warm and empathetic, not clinical
3. For emergencies (chest pain, difficulty breathing) → IMMEDIATELY advise emergency services
4. Always offer doctor consultation when medical advice is needed
5. End with a question or call-to-action (e.g., "Would you like to book an appointment?")"""
        
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
                "max_tokens": 150,
                "temperature": 0.7,
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
            
            start = time.time()
            response = self._groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=150
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
                max_tokens=150,
                temperature=0.7
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
                include_risk: bool = True, include_retrieval: bool = True) -> PipelineResult:
        """
        Run full medical AI pipeline
        
        Args:
            query: User query
            patient_data: Optional patient health data for risk assessment
            include_risk: Whether to include Bayesian risk assessment
            include_retrieval: Whether to include FAISS context retrieval
            
        Returns:
            PipelineResult with response and metadata
        """
        start_time = time.time()
        
        # Step 1: NER extraction
        ner_result = self.extract_entities(query)
        entities = ner_result["entities"]
        
        # Step 2: Extract patient data from query if not provided
        if patient_data is None:
            patient_data = self.extract_patient_data_from_text(query)
        
        # Step 3: Bayesian risk assessment
        risk_assessment = {}
        if include_risk and patient_data:
            risk_assessment = self.assess_risk(patient_data)
        
        # Step 4: FAISS retrieval
        context_chunks = []
        if include_retrieval:
            retrieved = self.retrieve_context(query, k=5)
            context_chunks = [r["text"] for r in retrieved]
        
        # Step 5: LLM generation with context AND patient data
        response, provider = self.generate_response(
            query,
            context=context_chunks if context_chunks else None,
            patient_data=patient_data  # Pass patient context to LLM
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
