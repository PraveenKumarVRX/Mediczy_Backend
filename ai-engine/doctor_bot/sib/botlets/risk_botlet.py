"""
RiskBotlet - Bayesian Network Risk Assessment
==============================================

Handles probabilistic health risk scoring:
- Bayesian Network inference (CardioRisk, TreatmentPriority)
- Framingham and ASCVD risk scores
- Treatment prioritization
- Risk factor analysis
- n8n alert automation for high-risk cases
"""

import logging
import asyncio
from typing import Dict, Any, Optional, List
from datetime import datetime

logger = logging.getLogger("sib.riskbotlet")


class RiskBotlet:
    """
    Bayesian Network risk assessment botlet.
    
    Integrates with:
    - utils/bayesian_network.py for probabilistic inference
    - utils/risk_scoring.py for clinical risk scores
    """
    
    # Risk thresholds (upper bounds; very_high has no upper bound)
    RISK_THRESHOLDS = {
        "low":       0.10,  # <10%
        "moderate":  0.20,  # 10–20%
        "high":      0.30,  # 20–30%
        "very_high": 0.40,  # >=30% (threshold to enter very_high band)
    }
    
    def __init__(self, memory):
        """
        Initialize RiskBotlet.
        
        Args:
            memory: SharedMemory instance
        """
        self.memory = memory
        self.assessment_count = 0
        
        # Initialize n8n client for alert automation
        from ..utils.n8n_client import get_n8n_client
        self.n8n = get_n8n_client()
        
        logger.info("📊 RiskBotlet initialized (with n8n automation)")
    
    def evaluate(self, patient_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Perform comprehensive risk assessment.
        
        Args:
            patient_data: Patient health data
                - age: int
                - sex: str ('male' or 'female')
                - systolic_bp: float
                - total_cholesterol: float (optional)
                - hdl_cholesterol: float (optional)
                - smoker: bool
                - diabetic: bool
                - on_bp_treatment: bool (optional)
                
        Returns:
            Comprehensive risk assessment
        """
        self.assessment_count += 1
        
        result = {
            "timestamp": datetime.now().isoformat(),
            "patient_data": patient_data
        }
        
        # Bayesian Network inference
        try:
            bn_result = self._bayesian_inference(patient_data)
            result["bayesian"] = bn_result
            result["cardio_risk"] = bn_result.get("CardioRisk_label", "unknown")
            result["treatment_priority"] = bn_result.get("TreatmentPriority_label", "unknown")
        except Exception as e:
            logger.warning(f"Bayesian inference failed: {e}")
            result["bayesian_error"] = str(e)
        
        # Clinical risk scores
        try:
            clinical_scores = self._clinical_risk_scores(patient_data)
            result["clinical_scores"] = clinical_scores
            result["framingham_score"] = clinical_scores.get("framingham", {}).get("risk_percent")
            result["ascvd_score"] = clinical_scores.get("ascvd", {}).get("risk_percent")
        except Exception as e:
            logger.warning(f"Clinical scoring failed: {e}")
            result["clinical_error"] = str(e)
        
        # Risk categorization
        result["risk_category"] = self._categorize_risk(result)
        
        # Risk factors analysis
        result["risk_factors"] = self._analyze_risk_factors(patient_data)
        
        # Store in patient context
        patient_id = patient_data.get("patient_id")
        if patient_id:
            self.memory.set_patient_context(patient_id, {
                "latest_risk_assessment": result,
                "risk_assessed_at": datetime.now().isoformat()
            })
            
            # Create alert if high risk
            if result["risk_category"] in ["high", "very_high"]:
                self.memory.create_alert({
                    "patient_id": patient_id,
                    "type": "high_risk",
                    "severity": result["risk_category"],
                    "message": f"High cardiovascular risk detected: {result.get('framingham_score', 'N/A')}%",
                    "data": result
                })
                
                # Trigger n8n risk alert workflow
                try:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        asyncio.create_task(self._trigger_risk_alert(patient_id, result))
                        # Auto-appointment booking for very_high risk
                        if result["risk_category"] == "very_high":
                            asyncio.create_task(self._trigger_appointment_booking(patient_id, result))
                        # Escalation if critical
                        if result.get("framingham_score", 0) >= 25:
                            asyncio.create_task(self._trigger_escalation(patient_id, result))
                    else:
                        loop.run_until_complete(self._trigger_risk_alert(patient_id, result))
                        if result["risk_category"] == "very_high":
                            loop.run_until_complete(self._trigger_appointment_booking(patient_id, result))
                        if result.get("framingham_score", 0) >= 25:
                            loop.run_until_complete(self._trigger_escalation(patient_id, result))
                except Exception as e:
                    logger.warning(f"Failed to trigger n8n risk alert: {e}")
        
        return result
    
    def _bayesian_inference(self, patient_data: Dict) -> Dict[str, Any]:
        """Perform Bayesian Network inference"""
        try:
            from utils.bayesian_network import bn_inference, get_full_assessment
            
            # Try full assessment first
            try:
                return get_full_assessment(patient_data)
            except Exception as _full_err:
                logger.warning("get_full_assessment failed (%s), using bn_inference", _full_err)
                return bn_inference(patient_data)
        
        except ImportError:
            # Fallback: simple rule-based inference
            return self._fallback_bn_inference(patient_data)
    
    def _fallback_bn_inference(self, data: Dict) -> Dict[str, Any]:
        """Fallback Bayesian inference using simple rules"""
        age = data.get("age") or 50  # Handle None values
        diabetic = data.get("diabetic") or False
        smoker = data.get("smoker") or False
        systolic_bp = data.get("systolic_bp") or 120
        
        # Simple risk scoring
        risk_score = 0
        
        if age > 55:
            risk_score += 0.2
        if age > 65:
            risk_score += 0.15
        if diabetic:
            risk_score += 0.25
        if smoker:
            risk_score += 0.2
        if systolic_bp > 140:
            risk_score += 0.2
        if systolic_bp > 160:
            risk_score += 0.15
        
        risk_score = min(risk_score, 1.0)
        
        # South Asian population adjustment (INTERHEART Lancet 2004)
        # Indian/South Asian populations have 1.5x higher CVD risk at same risk-factor levels.
        ethnicity = data.get("ethnicity", "").lower()
        if ethnicity in ("south_asian", "indian", "sri_lankan", "pakistani", "bangladeshi"):
            risk_score = min(risk_score * 1.5, 1.0)
        
        # Determine labels
        if risk_score < 0.3:
            risk_label = "low"
            priority_label = "routine"
        elif risk_score < 0.5:
            risk_label = "medium"
            priority_label = "moderate"
        else:
            risk_label = "high"
            priority_label = "urgent"
        
        return {
            "CardioRisk": risk_score,
            "CardioRisk_label": risk_label,
            "CardioRisk_prob": risk_score,
            "TreatmentPriority": 2 if priority_label == "urgent" else (1 if priority_label == "moderate" else 0),
            "TreatmentPriority_label": priority_label,
            "method": "fallback_rules"
        }
    
    def _clinical_risk_scores(self, patient_data: Dict) -> Dict[str, Any]:
        """Calculate clinical risk scores (Framingham, ASCVD)"""
        try:
            from utils.risk_scoring import calculate_all_risks, from_dict
            
            profile = from_dict(patient_data)
            return calculate_all_risks(profile)
        
        except ImportError:
            # Fallback scoring
            return self._fallback_clinical_scores(patient_data)
    
    def _fallback_clinical_scores(self, data: Dict) -> Dict[str, Any]:
        """Fallback clinical risk scoring"""
        age = data.get("age") or 50  # Handle None values
        sex = data.get("sex") or "male"
        systolic_bp = data.get("systolic_bp") or 120
        total_cholesterol = data.get("total_cholesterol") or 200
        hdl = data.get("hdl_cholesterol") or 50
        smoker = data.get("smoker") or False
        diabetic = data.get("diabetic") or False
        
        # Simplified Framingham-like calculation
        base_risk = 0.05  # 5% base
        
        # Age factor
        if sex == "male":
            age_factor = (age - 30) * 0.01 if age > 30 else 0
        else:
            age_factor = (age - 35) * 0.008 if age > 35 else 0
        
        # Other factors
        bp_factor = max(0, (systolic_bp - 120) * 0.002)
        chol_factor = max(0, (total_cholesterol - 200) * 0.001)
        hdl_factor = max(0, (50 - hdl) * 0.002) if hdl < 50 else 0
        smoke_factor = 0.10 if smoker else 0
        diabetes_factor = 0.08 if diabetic else 0
        
        risk = base_risk + age_factor + bp_factor + chol_factor + hdl_factor + smoke_factor + diabetes_factor
        risk = min(max(risk, 0), 0.50)  # Cap at 50%
        
        return {
            "framingham": {
                "risk_percent": round(risk * 100, 1),
                "category": "high" if risk > 0.20 else ("moderate" if risk > 0.10 else "low"),
                "method": "fallback"
            },
            "ascvd": {
                "risk_percent": round(risk * 100, 1),
                "category": "high" if risk > 0.20 else ("moderate" if risk > 0.10 else "low"),
                "method": "fallback"
            }
        }
    
    def _categorize_risk(self, result: Dict) -> str:
        """Categorize overall risk level"""
        # Use Framingham score as primary
        framingham = result.get("framingham_score")
        
        if framingham is None:
            # Use Bayesian result
            bn_risk = result.get("cardio_risk", "unknown")
            return bn_risk
        
        framingham_pct = framingham / 100.0
        
        if framingham_pct < self.RISK_THRESHOLDS["low"]:
            return "low"
        elif framingham_pct < self.RISK_THRESHOLDS["moderate"]:
            return "moderate"
        elif framingham_pct < self.RISK_THRESHOLDS["high"]:
            return "high"
        else:
            return "very_high"
    
    def _analyze_risk_factors(self, patient_data: Dict) -> List[Dict]:
        """Analyze individual risk factors"""
        factors = []
        
        age = patient_data.get("age") or 0  # Handle None values
        if age > 55:
            factors.append({
                "factor": "age",
                "value": age,
                "impact": "high" if age > 65 else "moderate",
                "note": "Age is a non-modifiable risk factor"
            })
        
        if patient_data.get("smoker"):
            factors.append({
                "factor": "smoking",
                "value": True,
                "impact": "high",
                "note": "Smoking cessation can significantly reduce risk"
            })
        
        if patient_data.get("diabetic"):
            factors.append({
                "factor": "diabetes",
                "value": True,
                "impact": "high",
                "note": "Blood sugar control is important"
            })
        
        systolic_bp = patient_data.get("systolic_bp", 0)
        if systolic_bp > 140:
            factors.append({
                "factor": "hypertension",
                "value": systolic_bp,
                "impact": "high" if systolic_bp > 160 else "moderate",
                "note": "Blood pressure management recommended"
            })
        
        total_chol = patient_data.get("total_cholesterol", 0)
        if total_chol > 240:
            factors.append({
                "factor": "high_cholesterol",
                "value": total_chol,
                "impact": "moderate",
                "note": "Dietary changes and medication may help"
            })
        
        hdl = patient_data.get("hdl_cholesterol", 100)
        if hdl < 40:
            factors.append({
                "factor": "low_hdl",
                "value": hdl,
                "impact": "moderate",
                "note": "Exercise can help raise HDL levels"
            })
        
        return factors
    
    async def _trigger_risk_alert(self, patient_id: str, risk_assessment: Dict[str, Any]) -> Dict[str, Any]:
        """
        Trigger n8n workflow for high-risk alert automation.
        
        Args:
            patient_id: Patient identifier
            risk_assessment: Complete risk assessment data
            
        Returns:
            n8n trigger result
        """
        result = await self.n8n.trigger_risk_alert({
            "patient_id": patient_id,
            "risk_category": risk_assessment.get("risk_category"),
            "cardio_risk": risk_assessment.get("cardio_risk"),
            "framingham_score": risk_assessment.get("framingham_score"),
            "ascvd_score": risk_assessment.get("ascvd_score"),
            "risk_factors": risk_assessment.get("risk_factors", []),
            "treatment_priority": risk_assessment.get("treatment_priority"),
            "timestamp": risk_assessment.get("timestamp"),
            "actions_required": [
                "Notify care team",
                "Schedule follow-up appointment",
                "Send patient education materials",
                "Initiate care plan"
            ]
        })
        
        if result.get("success"):
            logger.info(f"✅ Risk alert workflow triggered for patient: {patient_id}")
        else:
            logger.warning(f"⚠️ Risk alert workflow failed: {patient_id} - {result.get('error')}")
        
        return result
    
    async def _trigger_appointment_booking(self, patient_id: str, risk_assessment: Dict[str, Any]) -> Dict[str, Any]:
        """
        Trigger auto-appointment booking for high-risk patients.
        
        Args:
            patient_id: Patient identifier
            risk_assessment: Risk assessment data
            
        Returns:
            n8n trigger result
        """
        result = await self.n8n.trigger_appointment_booking({
            "patient_id": patient_id,
            "trigger_type": "high_risk",
            "risk_category": risk_assessment.get("risk_category"),
            "risk_score": risk_assessment.get("framingham_score", 0) / 100,
            "risk_factors": [f["factor"] for f in risk_assessment.get("risk_factors", [])]
        })
        
        if result.get("success"):
            logger.info(f"📅 Auto-appointment booking triggered for patient: {patient_id}")
        else:
            logger.warning(f"⚠️ Appointment booking failed: {patient_id}")
        
        return result
    
    async def _trigger_escalation(self, patient_id: str, risk_assessment: Dict[str, Any]) -> Dict[str, Any]:
        """
        Trigger critical case escalation for very high-risk patients.
        
        Args:
            patient_id: Patient identifier
            risk_assessment: Risk assessment data
            
        Returns:
            n8n trigger result
        """
        result = await self.n8n.trigger_escalation({
            "patient_id": patient_id,
            "risk_category": risk_assessment.get("risk_category"),
            "risk_score": risk_assessment.get("framingham_score", 0) / 100,
            "symptoms": [],  # Could be extracted from EHR
            "vitals": {}  # Could include BP, HR from assessment
        })
        
        if result.get("success"):
            logger.info(f"⚠️ Critical escalation triggered for patient: {patient_id}")
        else:
            logger.warning(f"⚠️ Escalation failed: {patient_id}")
        
        return result
    
    def get_risk_history(self, patient_id: str) -> List[Dict]:
        """Get risk assessment history for a patient"""
        ctx = self.memory.get_patient_context(patient_id)
        if ctx and "latest_risk_assessment" in ctx:
            return [ctx["latest_risk_assessment"]]
        return []
    
    def get_stats(self) -> Dict[str, Any]:
        """Get RiskBotlet statistics"""
        return {
            "assessment_count": self.assessment_count
        }
