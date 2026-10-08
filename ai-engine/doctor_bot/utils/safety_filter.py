"""
Safety Filter Module
====================

Medical safety filtering:
- Dosage validation
- Drug interaction detection  
- Emergency symptom detection
- Unsafe instruction filtering

Critical for production medical AI systems.
"""

import re
import logging
from typing import Dict, List, Any, Tuple, Set
from dataclasses import dataclass
from enum import Enum

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class SafetyLevel(Enum):
    """Safety alert levels"""
    SAFE = "safe"
    CAUTION = "caution"
    WARNING = "warning"
    DANGER = "danger"
    EMERGENCY = "emergency"


@dataclass
class SafetyAlert:
    """Safety alert"""
    level: SafetyLevel
    category: str
    message: str
    recommendation: str = ""


# Forbidden/unsafe patterns
FORBIDDEN_PATTERNS = [
    # CRITICAL: No prescription authority
    (r"(?:I\s+)?(?:prescribe|recommend\s+taking|suggest\s+taking|advise\s+taking)\s+(?:\d+\s*(?:mg|ml|mcg|tablets?|pills?|capsules?))", "unauthorized_prescription"),
    (r"take\s+\d+\s*(?:mg|ml|mcg|tablets?|pills?)\s+(?:of\s+)?[\w-]+(?:\s+daily|twice\s+daily|three\s+times)", "unauthorized_prescription"),
    (r"start\s+(?:taking|using)\s+[\w-]+\s+\d+\s*(?:mg|ml)", "unauthorized_prescription"),
    (r"you\s+should\s+(?:take|use)\s+[\w-]+\s+\d+\s*(?:mg|ml)", "unauthorized_prescription"),
    
    # Dangerous dosages
    (r"administer\s+1000\s*mg", "unsafe_dosage"),
    (r"inject\s+\w+\s+without\s+supervision", "unsupervised_injection"),
    (r"take\s+(\d{4,})\s*mg", "excessive_dosage"),  # 1000+mg
    (r"overdose", "overdose_mention"),
    
    # Dangerous instructions
    (r"stop\s+(all\s+)?medications?\s+(immediately|now)", "dangerous_discontinuation"),
    (r"double\s+(?:the\s+)?dose", "dose_doubling"),
    (r"mix\s+with\s+alcohol", "alcohol_interaction"),
]

# Emergency patterns - Use word boundaries (\b) to avoid false positives
EMERGENCY_PATTERNS = [
    (r"chest\s+pain.*(?:radiating|crushing|pressure)", "Possible cardiac event"),
    (r"\b(?:heart\s+attack|myocardial\s+infarction)\b", "Possible MI"),
    (r"\b(?:stroke|tia)\b", "Possible stroke"),  # \b prevents matching "negoTIAble"
    (r"(?:can'?t|cannot|unable|difficulty|trouble|shortness\s+of)\s+(?:to\s+)?breath", "Respiratory emergency"),
    (r"\b(?:severe|massive)\s+bleeding\b", "Bleeding emergency"),
    (r"\b(?:unconscious|unresponsive)\b", "Loss of consciousness"),
    (r"\b(?:suicide|suicidal|self-harm)\b", "Mental health crisis"),
    (r"\b(?:anaphylaxis|throat\s+closing)\b", "Anaphylaxis"),
    (r"(?:seizure|convulsion).*(?:prolonged|continuous)", "Status epilepticus"),
]

# Drug safety limits (simplified)
DRUG_LIMITS = {
    "acetaminophen": {"max_single": 1000, "max_daily": 4000},
    "ibuprofen": {"max_single": 800, "max_daily": 3200},
    "aspirin": {"max_single": 1000, "max_daily": 4000},
    "metformin": {"max_single": 1000, "max_daily": 2550},
    "lisinopril": {"max_single": 40, "max_daily": 80},
}

# Drug interactions
DRUG_INTERACTIONS = {
    ("warfarin", "aspirin"): "Increased bleeding risk",
    ("warfarin", "ibuprofen"): "Increased bleeding risk",
    ("lisinopril", "potassium"): "Hyperkalemia risk",
    ("metformin", "alcohol"): "Lactic acidosis risk",
    ("ssri", "maoi"): "Serotonin syndrome risk",
}


def filter_dosages(text: str) -> Tuple[str, List[SafetyAlert]]:
    """
    Filter unsafe dosage instructions and unauthorized prescriptions
    
    Args:
        text: Text to filter
        
    Returns:
        Tuple of (filtered_text, alerts)
    """
    alerts = []
    filtered = text
    
    for pattern, category in FORBIDDEN_PATTERNS:
        matches = re.finditer(pattern, text, re.IGNORECASE)
        for match in matches:
            if category == "unauthorized_prescription":
                alerts.append(SafetyAlert(
                    level=SafetyLevel.DANGER,
                    category=category,
                    message=f"🚫 Dr. iSHA cannot prescribe medications",
                    recommendation="Please consult a licensed physician for prescriptions"
                ))
                # Replace prescription with educational info
                filtered = filtered.replace(
                    match.group(0), 
                    "[I can explain what medicines are used for, but only a licensed doctor can prescribe medications. Please consult your physician]"
                )
            else:
                alerts.append(SafetyAlert(
                    level=SafetyLevel.DANGER,
                    category=category,
                    message=f"Unsafe instruction detected: {match.group(0)[:50]}",
                    recommendation="Consult healthcare provider for proper dosing"
                ))
                filtered = filtered.replace(match.group(0), "[REDACTED: unsafe instruction]")
    
    return filtered, alerts


def detect_emergencies(text: str) -> List[SafetyAlert]:
    """
    Detect emergency symptoms
    
    Args:
        text: Text to analyze
        
    Returns:
        List of emergency alerts
    """
    alerts = []
    
    for pattern, condition in EMERGENCY_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            alerts.append(SafetyAlert(
                level=SafetyLevel.EMERGENCY,
                category="emergency_symptom",
                message=f"🚨 {condition} - Call 112 (India) or local emergency services immediately",
                recommendation="Seek immediate emergency medical care"
            ))
    
    return alerts


def check_dosage_safety(drug: str, dose_mg: float, 
                        frequency: str = "once") -> List[SafetyAlert]:
    """
    Check if dosage is within safe limits
    
    Args:
        drug: Drug name
        dose_mg: Dose in mg
        frequency: Dosing frequency
        
    Returns:
        List of safety alerts
    """
    alerts = []
    drug_lower = drug.lower()
    
    if drug_lower not in DRUG_LIMITS:
        return alerts
    
    limits = DRUG_LIMITS[drug_lower]
    
    if dose_mg > limits["max_single"]:
        alerts.append(SafetyAlert(
            level=SafetyLevel.DANGER,
            category="excessive_single_dose",
            message=f"{drug}: {dose_mg}mg exceeds max single dose ({limits['max_single']}mg)",
            recommendation=f"Do not exceed {limits['max_single']}mg per dose"
        ))
    elif dose_mg > limits["max_single"] * 0.8:
        alerts.append(SafetyAlert(
            level=SafetyLevel.WARNING,
            category="high_single_dose",
            message=f"{drug}: {dose_mg}mg is near maximum single dose",
            recommendation="Verify dosage with healthcare provider"
        ))
    
    return alerts


def check_drug_interactions(medications: List[str]) -> List[SafetyAlert]:
    """
    Check for drug-drug interactions
    
    Args:
        medications: List of medication names
        
    Returns:
        List of interaction alerts
    """
    alerts = []
    meds_lower = [m.lower() for m in medications]
    checked = set()
    
    for drug1 in meds_lower:
        for drug2 in meds_lower:
            if drug1 == drug2:
                continue
            
            pair = tuple(sorted([drug1, drug2]))
            if pair in checked:
                continue
            checked.add(pair)
            
            # Check interactions
            for (d1, d2), interaction in DRUG_INTERACTIONS.items():
                if (d1 in drug1 or drug1 in d1) and (d2 in drug2 or drug2 in d2):
                    alerts.append(SafetyAlert(
                        level=SafetyLevel.WARNING,
                        category="drug_interaction",
                        message=f"⚠️ Interaction: {drug1} + {drug2}",
                        recommendation=interaction
                    ))
    
    return alerts


def validate_response(response: str) -> Tuple[str, List[SafetyAlert]]:
    """
    Validate AI response for safety
    
    Args:
        response: AI-generated response
        
    Returns:
        Tuple of (validated_response, alerts)
    """
    all_alerts = []
    
    # Check for emergencies
    emergency_alerts = detect_emergencies(response)
    all_alerts.extend(emergency_alerts)
    
    # Filter dosages
    filtered, dosage_alerts = filter_dosages(response)
    all_alerts.extend(dosage_alerts)
    
    # Add disclaimer if needed
    if all_alerts and not any(a.level == SafetyLevel.EMERGENCY for a in all_alerts):
        filtered += "\n\n⚠️ **Note**: Please consult a healthcare provider before taking any action."
    
    return filtered, all_alerts


def safety_check(text: str) -> Dict[str, Any]:
    """
    Complete safety check
    
    Args:
        text: Text to check
        
    Returns:
        Dict with safety analysis
    """
    emergency_alerts = detect_emergencies(text)
    is_emergency = len(emergency_alerts) > 0
    
    filtered, dosage_alerts = filter_dosages(text)
    
    all_alerts = emergency_alerts + dosage_alerts
    
    return {
        "is_emergency": is_emergency,
        "filtered_text": filtered,
        "alert_count": len(all_alerts),
        "alerts": [
            {
                "level": a.level.value,
                "category": a.category,
                "message": a.message,
                "recommendation": a.recommendation
            }
            for a in all_alerts
        ]
    }


# CLI interface
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Safety filter")
    parser.add_argument("text", help="Text to check")
    args = parser.parse_args()
    
    result = safety_check(args.text)
    
    print(f"\n🛡️ Safety Check")
    print("=" * 40)
    print(f"Emergency: {'🚨 YES' if result['is_emergency'] else '✅ No'}")
    print(f"Alerts: {result['alert_count']}")
    
    if result['alerts']:
        for alert in result['alerts']:
            print(f"  [{alert['level'].upper()}] {alert['message']}")
