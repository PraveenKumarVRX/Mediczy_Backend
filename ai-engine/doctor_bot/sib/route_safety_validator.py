"""
Routing Safety Validator
========================

Ensures high-risk routing decisions are conservative and deterministic.

Design goals:
- Keep hard safety rules outside model outputs
- Prevent local lightweight models from finalizing risky medical actions
- Fail safe to medical-capable backends (iSHA/Groq) under ambiguity
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional
import re


@dataclass
class SafetyRoutingDecision:
    """Result of safety validation on top of model/router decision."""

    backend: str
    intent: str
    force_non_local: bool = False
    reason: Optional[str] = None


EMERGENCY_PATTERNS = [
    r"\b(chest pain|heart attack|stroke|seizure|unconscious|not breathing)\b",
    r"\b(suicid|self harm|overdose|poison)\b",
    r"\b(heavy bleeding|bleeding heavily|severe bleeding)\b",
]

HIGH_RISK_INTENTS = {
    "symptom_check",
    "medical_query",
    "medication_info",
    "differential_diagnosis",
    "treatment_plan",
    "drug_interaction",
    "complex_medical",
    "emergency",
}


def _is_emergency_text(query: str) -> bool:
    q = (query or "").lower()
    return any(re.search(p, q) for p in EMERGENCY_PATTERNS)


def _is_multi_intent(query: str) -> bool:
    q = (query or "").lower()
    # Practical signal for mixed workflow queries: "and", "also", commas, multi-domain keywords.
    has_joiners = (" and " in q) or (" also " in q) or ("," in q)
    has_medical = any(k in q for k in ["symptom", "pain", "fever", "doctor", "medicine", "treatment"])
    has_admin = any(k in q for k in ["insurance", "claim", "policy", "report", "scan", "ocr", "appointment", "book"])
    return has_joiners and has_medical and has_admin


def validate_routing(query: str, intent: str, backend: str, confidence: float) -> SafetyRoutingDecision:
    """
    Validate and adjust routing decision with conservative safety policy.

    Policy:
    1. Emergency signals always avoid local lightweight handling.
    2. High-risk intents never stay local under low confidence.
    3. Ambiguous multi-intent prompts fail over to orchestrator-capable backend.
    """

    current_intent = intent or "unknown"
    current_backend = backend or "isha"
    score = float(confidence or 0.0)

    if _is_emergency_text(query):
        return SafetyRoutingDecision(
            backend="groq",
            intent="emergency",
            force_non_local=True,
            reason="Emergency keyword override",
        )

    if current_intent in HIGH_RISK_INTENTS and current_backend == "local":
        return SafetyRoutingDecision(
            backend="isha",
            intent=current_intent,
            force_non_local=True,
            reason="High-risk intent cannot be finalized by local router",
        )

    if current_intent in HIGH_RISK_INTENTS and score < 0.75:
        return SafetyRoutingDecision(
            backend="isha",
            intent=current_intent,
            force_non_local=True,
            reason="Low-confidence high-risk route escalated",
        )

    if _is_multi_intent(query) and score < 0.85:
        return SafetyRoutingDecision(
            backend="isha",
            intent=current_intent,
            force_non_local=True,
            reason="Ambiguous multi-intent query escalated",
        )

    return SafetyRoutingDecision(backend=current_backend, intent=current_intent)
