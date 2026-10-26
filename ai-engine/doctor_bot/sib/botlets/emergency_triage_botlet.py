"""
EmergencyTriageBotlet - AI-Powered Emergency Triage System
===========================================================

Handles emergency triage assessments with:
- Multi-modal input (text, voice, video context)
- SOAP-style conversational triage
- Urgency classification (RED/YELLOW/GREEN)
- Safety-first responses
- n8n automation for emergency alerts
- Ambulance dispatch integration
"""

import logging
import asyncio
import re
from typing import Dict, Any, Optional, List
from datetime import datetime
import os

logger = logging.getLogger("sib.emergencytriage")


class EmergencyTriageBotlet:
    """
    Emergency Triage Botlet for Dr. iSHA.
    
    Provides:
    - Real-time emergency assessment
    - Urgency level classification
    - Immediate action recommendations
    - Integration with emergency services
    - n8n workflow automation
    """
    
    # Urgency levels with colors
    URGENCY_LEVELS = {
        "RED": {
            "code": 1,
            "label": "CRITICAL - IMMEDIATE",
            "description": "Life-threatening emergency - Call ambulance immediately",
            "response_time": "0-5 minutes",
            "actions": ["Call 108/ambulance", "Do not wait", "Keep patient still", "Monitor breathing"]
        },
        "ORANGE": {
            "code": 2,
            "label": "VERY URGENT",
            "description": "Serious condition - Needs immediate medical attention",
            "response_time": "10-15 minutes",
            "actions": ["Go to nearest ER", "Keep patient calm", "Monitor vital signs"]
        },
        "YELLOW": {
            "code": 3,
            "label": "URGENT",
            "description": "Requires prompt attention - Visit hospital soon",
            "response_time": "30-60 minutes",
            "actions": ["Visit ER/Urgent care", "Rest", "Stay hydrated"]
        },
        "GREEN": {
            "code": 4,
            "label": "STANDARD",
            "description": "Non-urgent - Can wait for regular consultation",
            "response_time": "24-72 hours",
            "actions": ["Book appointment", "Rest", "Monitor symptoms"]
        },
        "BLUE": {
            "code": 5,
            "label": "NON-URGENT",
            "description": "Minor issue - Self-care or routine appointment",
            "response_time": "When convenient",
            "actions": ["Self-care at home", "Schedule routine checkup if persists"]
        }
    }
    
    # Critical symptoms that require immediate RED classification
    RED_FLAG_SYMPTOMS = [
        "chest pain", "heart attack", "cardiac arrest",
        "difficulty breathing", "can't breathe", "choking",
        "unconscious", "not responding", "unresponsive",
        "severe bleeding", "hemorrhage", "heavy blood loss",
        "stroke symptoms", "face drooping", "arm weakness", "speech difficulty",
        "seizure", "convulsions",
        "anaphylaxis", "severe allergic reaction", "throat swelling",
        "overdose", "poisoning",
        "severe burn", "electrocution",
        "drowning", "near drowning",
        "head injury", "skull fracture",
        "suicide", "self-harm", "want to die",
        # India-specific emergencies
        "snakebite", "snake bite", "venomous snake", "snake venom",
        "dengue hemorrhagic", "dengue shock", "dengue fever severe", "DHF",
        "status asthmaticus", "acute severe asthma", "asthma attack severe",
        "heatstroke", "heat stroke", "hyperthermia", "body temperature above 40",
        "encephalitis", "meningitis", "stiff neck with fever",
        "saans nahi aa rahi", "chest dard", "dil ka dora",  # Hindi emergency terms
        "cannot breathe", "difficulty breathing severe",
        "acute myocardial infarction", "STEMI", "NSTEMI"
    ]
    
    # Orange flag symptoms - very urgent
    ORANGE_FLAG_SYMPTOMS = [
        "high fever", "fever above 103", "fever 104",
        "severe pain", "10/10 pain", "worst pain",
        "vomiting blood", "blood in stool", "black stool",
        "confusion", "disorientation", "altered consciousness",
        "severe headache", "thunderclap headache",
        "stiff neck with fever", "meningitis",
        "diabetic emergency", "very low sugar", "very high sugar",
        "severe dehydration", "not urinating",
        "broken bone", "fracture", "bone sticking out"
    ]
    
    def __init__(self, memory, groq_client=None):
        """
        Initialize EmergencyTriageBotlet.
        
        Args:
            memory: SharedMemory instance
            groq_client: Groq API client for AI responses
        """
        self.memory = memory
        self.groq_client = groq_client
        self.triage_count = 0
        
        # Initialize n8n client for emergency alerts
        try:
            from ..utils.n8n_client import get_n8n_client
            self.n8n = get_n8n_client()
        except Exception as e:
            logger.warning(f"n8n client not available: {e}")
            self.n8n = None
        
        # Initialize Groq if not provided
        if not self.groq_client:
            self._init_groq()
        
        logger.info("🚨 EmergencyTriageBotlet initialized")
    
    def _init_groq(self):
        """Initialize Groq client"""
        try:
            from groq import Groq
            api_key = os.getenv('GROQ_API_KEY')
            if api_key:
                self.groq_client = Groq(api_key=api_key)
                logger.info("Groq client initialized for triage")
        except Exception as e:
            logger.warning(f"Groq initialization failed: {e}")
    
    async def triage(
        self,
        symptoms: str,
        description: str,
        patient_data: Optional[Dict[str, Any]] = None,
        multimodal_context: Optional[Dict[str, Any]] = None,
        language: str = 'en'
    ) -> Dict[str, Any]:
        """
        Perform emergency triage assessment.
        
        Args:
            symptoms: List or string of symptoms
            description: Patient's description of the situation
            patient_data: Optional patient information (age, conditions, etc.)
            multimodal_context: Optional context from video/audio analysis
            language: Language code
            
        Returns:
            Comprehensive triage assessment
        """
        self.triage_count += 1
        start_time = datetime.now()
        
        # Normalize input
        symptom_text = symptoms if isinstance(symptoms, str) else ", ".join(symptoms)
        full_context = f"{symptom_text}. {description}"
        
        result = {
            "timestamp": start_time.isoformat(),
            "triage_id": f"triage_{start_time.strftime('%Y%m%d%H%M%S')}_{self.triage_count}",
            "input": {
                "symptoms": symptoms,
                "description": description,
                "patient_data": patient_data
            }
        }
        
        # Step 1: Quick rule-based urgency check (RED flags)
        urgency = self._quick_urgency_check(full_context)
        result["initial_urgency"] = urgency
        
        # Step 2: If RED flag detected, return immediately
        if urgency == "RED":
            result["urgency_level"] = "RED"
            result["urgency_details"] = self.URGENCY_LEVELS["RED"]
            result["ai_assessment"] = self._generate_red_alert_response(full_context, language)
            result["requires_immediate_attention"] = True
            result["call_ambulance"] = True
            
            # Trigger emergency alert via n8n — require delivery confirmation for RED
            alert_status = {"alert_fired": False}
            if self.n8n:
                alert_status = await self._trigger_emergency_alert(result, patient_data)
            if not alert_status.get("alert_fired", False):
                logger.critical(
                    "🚨 EMERGENCY ALERT DELIVERY FAILED for triage_id=%s — n8n unreachable or errored. "
                    "Patient may not receive emergency notification.",
                    result.get("triage_id", "unknown")
                )
            result["alert_delivery_status"] = "delivered" if alert_status.get("alert_fired") else "FAILED"
            
            return result
        
        # Step 3: AI-powered detailed triage assessment
        ai_assessment = await self._ai_triage_assessment(
            symptom_text, 
            description, 
            patient_data, 
            multimodal_context,
            language
        )
        result["ai_assessment"] = ai_assessment
        
        # Step 4: Determine final urgency level
        final_urgency = self._determine_urgency(ai_assessment, urgency)
        result["urgency_level"] = final_urgency
        result["urgency_details"] = self.URGENCY_LEVELS.get(final_urgency, self.URGENCY_LEVELS["YELLOW"])
        result["requires_immediate_attention"] = final_urgency in ["RED", "ORANGE"]
        result["call_ambulance"] = final_urgency == "RED"
        
        # Step 5: Generate response and recommendations
        result["response"] = ai_assessment.get("response", "")
        result["recommended_actions"] = self._get_recommendations(final_urgency, ai_assessment)
        result["follow_up_questions"] = ai_assessment.get("follow_up_questions", [])
        
        # Step 6: Store in memory for conversation continuity
        await self._store_triage_session(result, patient_data)
        
        # Calculate processing time
        result["processing_time_ms"] = (datetime.now() - start_time).total_seconds() * 1000
        
        return result
    
    # Negation prefixes that cancel a following symptom keyword.
    # Matches phrases like "no chest pain", "denies chest pain", "without bleeding".
    _NEGATION_RE = re.compile(
        r"\b(no|not|without|denies|denying|denied|rules? out|negative for|absence of)\b",
        re.IGNORECASE,
    )

    def _symptom_present(self, symptom: str, context_lower: str) -> bool:
        """
        Return True if the symptom phrase appears in context and is NOT negated.

        Strategy: find each occurrence of the symptom phrase; look 6 words back
        for a negation token. If every occurrence is negated the symptom is absent.
        """
        pattern = re.compile(re.escape(symptom), re.IGNORECASE)
        matches = list(pattern.finditer(context_lower))
        if not matches:
            return False
        for match in matches:
            # Grab the 60 characters immediately before this match
            window_start = max(0, match.start() - 60)
            prefix = context_lower[window_start:match.start()]
            if not self._NEGATION_RE.search(prefix):
                return True  # At least one non-negated occurrence → symptom is present
        return False

    def _quick_urgency_check(self, context: str) -> str:
        """
        Quick rule-based check for RED/ORANGE flag symptoms.
        Uses negation-aware matching to avoid false positives
        (e.g. "no chest pain" must not trigger RED).
        """
        context_lower = context.lower()

        # Check RED flags first
        for symptom in self.RED_FLAG_SYMPTOMS:
            if self._symptom_present(symptom, context_lower):
                logger.warning(f"🔴 RED FLAG detected: {symptom}")
                return "RED"

        # Check ORANGE flags
        for symptom in self.ORANGE_FLAG_SYMPTOMS:
            if self._symptom_present(symptom, context_lower):
                logger.warning(f"🟠 ORANGE FLAG detected: {symptom}")
                return "ORANGE"

        return "PENDING"  # Needs AI assessment
    
    def _generate_red_alert_response(self, context: str, language: str) -> Dict[str, Any]:
        """Generate immediate response for RED alert situations."""
        if language == 'hi':
            return {
                "response": "⚠️ यह एक आपातकालीन स्थिति है! कृपया तुरंत 108 पर कॉल करें या नजदीकी अस्पताल जाएं। मरीज को हिलाएं नहीं और शांत रखें।",
                "immediate_action": "108 पर कॉल करें",
                "severity": "CRITICAL"
            }
        return {
            "response": "⚠️ This is an EMERGENCY! Please call 108/ambulance IMMEDIATELY or go to the nearest hospital. Keep the patient still and calm while help arrives.",
            "immediate_action": "Call 108 NOW",
            "severity": "CRITICAL"
        }
    
    async def _ai_triage_assessment(
        self,
        symptoms: str,
        description: str,
        patient_data: Optional[Dict[str, Any]],
        multimodal_context: Optional[Dict[str, Any]],
        language: str
    ) -> Dict[str, Any]:
        """
        Get AI-powered triage assessment using Groq.
        """
        if not self.groq_client:
            return {
                "response": "AI assessment unavailable. Based on symptoms, please consult a doctor.",
                "urgency_suggestion": "YELLOW",
                "confidence": 0.5
            }
        
        # Build context
        patient_context = ""
        if patient_data:
            patient_context = f"""
Patient Information:
- Age: {patient_data.get('age', 'Unknown')}
- Gender: {patient_data.get('gender', 'Unknown')}
- Known Conditions: {patient_data.get('conditions', 'None reported')}
- Current Medications: {patient_data.get('medications', 'None reported')}
- Allergies: {patient_data.get('allergies', 'None reported')}
"""
        
        multimodal_info = ""
        if multimodal_context:
            if multimodal_context.get('video_analysis'):
                multimodal_info += f"\nVideo Analysis: {multimodal_context['video_analysis']}"
            if multimodal_context.get('audio_analysis'):
                multimodal_info += f"\nVoice Analysis: {multimodal_context['audio_analysis']}"
        
        system_prompt = """You are Dr. iSHA, an emergency triage AI assistant. Your role is to:
1. Assess the urgency of the medical situation
2. Provide calm, clear guidance
3. Recommend appropriate action level
4. NEVER diagnose - only assess urgency and recommend next steps

URGENCY LEVELS:
- RED: Life-threatening, call ambulance immediately
- ORANGE: Very urgent, go to ER now
- YELLOW: Urgent, visit hospital within 1-2 hours
- GREEN: Standard, can wait for regular appointment
- BLUE: Non-urgent, self-care appropriate

You MUST respond with a JSON object only — no prose outside the JSON.
Schema:
{
  "urgency": "RED|ORANGE|YELLOW|GREEN|BLUE",
  "response": "<empathetic patient-facing message, ≤150 words>",
  "follow_up_questions": ["<question 1>", "<question 2>"],
  "confidence": 0.0-1.0
}
Always err on the side of caution."""

        user_prompt = f"""Emergency Triage Request:

Symptoms: {symptoms}
Description: {description}
{patient_context}
{multimodal_info}

Respond with the JSON schema only."""

        _VALID_URGENCIES = {"RED", "ORANGE", "YELLOW", "GREEN", "BLUE"}

        try:
            response = await asyncio.to_thread(
                self.groq_client.chat.completions.create,
                # llama-3.3-70b-versatile was retired by Groq; verified live against this
                # project's key. gpt-oss is a reasoning model and spends tokens on hidden
                # reasoning before the final JSON, so max_tokens is raised accordingly -
                # the rule-engine floor below still applies if this call degrades or fails.
                model="openai/gpt-oss-120b",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.2,
                max_tokens=800,
            )

            raw = response.choices[0].message.content.strip()
            # Strip accidental code-fence wrappers
            raw = re.sub(r"^```json\s*|^```\s*|\s*```$", "", raw, flags=re.MULTILINE).strip()

            import json as _json
            parsed = _json.loads(raw)

            urgency_suggestion = parsed.get("urgency", "YELLOW").upper()
            if urgency_suggestion not in _VALID_URGENCIES:
                urgency_suggestion = "YELLOW"

            return {
                "response":           parsed.get("response", ""),
                "urgency_suggestion": urgency_suggestion,
                "confidence":         float(parsed.get("confidence", 0.85)),
                "model":              "openai/gpt-oss-120b",
                "follow_up_questions": parsed.get("follow_up_questions", [])[:3],
            }

        except Exception as e:
            logger.error(f"AI triage assessment error: {e}")
            return {
                "response": "I'm having trouble processing your request. Based on your symptoms, please seek medical attention to be safe.",
                "urgency_suggestion": "YELLOW",
                "confidence": 0.5,
                "error": str(e)
            }
    
    # Urgency severity order — lower index = more severe. Never downgrade past rule-engine level.
    _URGENCY_ORDER = {"RED": 0, "ORANGE": 1, "YELLOW": 2, "GREEN": 3, "BLUE": 4, "PENDING": 5}

    def _determine_urgency(self, ai_assessment: Dict[str, Any], initial_urgency: str) -> str:
        """
        Determine final urgency from rule-based and AI assessment.
        Rule engine sets the floor — AI may escalate but never downgrade.
        """
        ai_urgency = ai_assessment.get("urgency_suggestion", "YELLOW")
        rule_rank = self._URGENCY_ORDER.get(initial_urgency, 5)
        ai_rank   = self._URGENCY_ORDER.get(ai_urgency, 5)
        # Return whichever is more severe (lower rank)
        return ai_urgency if ai_rank <= rule_rank else initial_urgency
    
    def _get_recommendations(self, urgency: str, ai_assessment: Dict[str, Any]) -> List[str]:
        """Get action recommendations based on urgency level."""
        base_actions = self.URGENCY_LEVELS.get(urgency, {}).get("actions", [])
        
        # Add AI-specific recommendations if available
        ai_response = ai_assessment.get("response", "")
        additional_actions = []
        
        if "rest" in ai_response.lower():
            additional_actions.append("Get adequate rest")
        if "hydrat" in ai_response.lower():
            additional_actions.append("Stay well hydrated")
        if "monitor" in ai_response.lower():
            additional_actions.append("Monitor symptoms closely")
        
        return list(set(base_actions + additional_actions))
    
    def _extract_follow_up_questions(self, response: str) -> List[str]:
        """Extract follow-up questions from AI response."""
        questions = []
        lines = response.split('\n')
        for line in lines:
            line = line.strip()
            if line.endswith('?') and len(line) > 10:
                questions.append(line)
        return questions[:3]  # Max 3 follow-up questions
    
    async def _trigger_emergency_alert(self, triage_result: Dict[str, Any], patient_data: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Trigger emergency alert via n8n workflow. Always returns {alert_fired, reason}."""
        if not self.n8n:
            return {"alert_fired": False, "reason": "n8n_not_configured"}

        try:
            alert_data = {
                "type": "emergency_triage",
                "urgency": triage_result.get("urgency_level"),
                "triage_id": triage_result.get("triage_id"),
                "symptoms": triage_result.get("input", {}).get("symptoms"),
                "patient_id": patient_data.get("patient_id") if patient_data else None,
                "timestamp": triage_result.get("timestamp"),
                "requires_ambulance": triage_result.get("call_ambulance", False)
            }

            await self.n8n.trigger_webhook("emergency_alert", alert_data)
            logger.info(f"🚨 Emergency alert triggered for triage {triage_result.get('triage_id')}")
            return {"alert_fired": True}
        except Exception as e:
            logger.error(f"Failed to trigger emergency alert: {e}")
            return {"alert_fired": False, "reason": str(e)}
    
    async def _store_triage_session(self, result: Dict[str, Any], patient_data: Optional[Dict[str, Any]]):
        """Store triage session in memory for continuity."""
        try:
            patient_id = patient_data.get("patient_id") if patient_data else "anonymous"
            session_key = f"triage_session_{patient_id}"
            
            await self.memory.store(session_key, {
                "triage_id": result.get("triage_id"),
                "urgency_level": result.get("urgency_level"),
                "symptoms": result.get("input", {}).get("symptoms"),
                "timestamp": result.get("timestamp")
            }, ttl=3600)  # Store for 1 hour
        except Exception as e:
            logger.warning(f"Failed to store triage session: {e}")
    
    async def get_triage_stats(self) -> Dict[str, Any]:
        """Get triage statistics."""
        return {
            "total_triages": self.triage_count,
            "urgency_levels": list(self.URGENCY_LEVELS.keys()),
            "red_flag_count": len(self.RED_FLAG_SYMPTOMS),
            "status": "operational"
        }


# Singleton instance
_emergency_triage_botlet = None

def get_emergency_triage_botlet(memory=None, groq_client=None):
    """Get or create EmergencyTriageBotlet singleton."""
    global _emergency_triage_botlet
    if _emergency_triage_botlet is None and memory is not None:
        _emergency_triage_botlet = EmergencyTriageBotlet(memory, groq_client)
    return _emergency_triage_botlet
