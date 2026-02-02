"""
Clinical Templates Engine - Hospital-Grade Document Templates

Provides structured templates for:
- OPD Prescriptions
- OPD Notes
- IPD Daily Progress Notes
- Discharge Summaries
- Lab Report Interpretations

The LLM fills ONLY these defined sections - no freestyle generation.
"""

from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field
from enum import Enum
import json
from datetime import datetime


class DocumentType(Enum):
    """Supported clinical document types"""
    PRESCRIPTION = "prescription"
    OPD_NOTES = "opd_notes"
    IPD_NOTES = "ipd_notes"
    DISCHARGE_SUMMARY = "discharge_summary"
    LAB_REPORT = "lab_report"


@dataclass
class TemplateField:
    """Represents a single field in a template"""
    name: str
    label: str
    field_type: str  # text, textarea, list, medication_list, vital_list
    required: bool = False
    placeholder: str = ""
    default: Any = None
    options: List[str] = field(default_factory=list)  # For select fields
    min_length: int = 0
    max_length: int = 0


@dataclass
class ClinicalTemplate:
    """Represents a complete clinical document template"""
    doc_type: DocumentType
    name: str
    description: str
    sections: List[Dict[str, Any]]
    header_fields: List[TemplateField]
    footer_text: str = ""
    ai_badge: bool = True


class TemplateEngine:
    """
    Clinical Templates Engine for hospital documents.
    
    This engine:
    1. Defines strict templates
    2. Validates LLM output against templates
    3. Ensures compliance with medical documentation standards
    """
    
    def __init__(self):
        self._templates = {}
        self._load_templates()
    
    def _load_templates(self):
        """Load all clinical templates"""
        
        # =====================================================================
        # OPD PRESCRIPTION TEMPLATE
        # =====================================================================
        self._templates[DocumentType.PRESCRIPTION] = {
            "name": "OPD Prescription",
            "description": "Standard outpatient prescription format",
            "header": {
                "hospital_name": {"type": "text", "label": "Hospital/Clinic Name"},
                "doctor_name": {"type": "text", "label": "Doctor Name"},
                "qualification": {"type": "text", "label": "Qualification"},
                "registration_no": {"type": "text", "label": "Registration No."},
                "date": {"type": "date", "label": "Date"},
            },
            "patient_info": {
                "patient_name": {"type": "text", "label": "Patient Name", "required": True},
                "age": {"type": "text", "label": "Age"},
                "gender": {"type": "select", "label": "Gender", "options": ["Male", "Female", "Other"]},
                "uhid": {"type": "text", "label": "UHID/MRN"},
            },
            "sections": [
                {
                    "id": "vitals",
                    "name": "Vitals",
                    "fields": [
                        {"name": "bp", "label": "Blood Pressure", "type": "text", "unit": "mmHg"},
                        {"name": "pulse", "label": "Pulse", "type": "text", "unit": "/min"},
                        {"name": "temp", "label": "Temperature", "type": "text", "unit": "°F"},
                        {"name": "spo2", "label": "SpO2", "type": "text", "unit": "%"},
                        {"name": "weight", "label": "Weight", "type": "text", "unit": "kg"},
                    ],
                    "required": False,
                },
                {
                    "id": "chief_complaints",
                    "name": "Chief Complaints",
                    "fields": [
                        {"name": "complaints", "label": "Complaints", "type": "textarea"},
                    ],
                    "required": True,
                },
                {
                    "id": "diagnosis",
                    "name": "Diagnosis",
                    "fields": [
                        {"name": "primary_diagnosis", "label": "Primary Diagnosis", "type": "text"},
                        {"name": "secondary_diagnosis", "label": "Secondary Diagnosis", "type": "text"},
                        {"name": "icd_code", "label": "ICD-10 Code", "type": "text"},
                    ],
                    "required": True,
                },
                {
                    "id": "medications",
                    "name": "Rx",
                    "fields": [
                        {
                            "name": "medicines",
                            "label": "Medicines",
                            "type": "medication_list",
                            "columns": ["Drug Name", "Dose", "Frequency", "Duration", "Instructions"],
                        },
                    ],
                    "required": True,
                },
                {
                    "id": "investigations",
                    "name": "Investigations",
                    "fields": [
                        {"name": "lab_tests", "label": "Lab Tests", "type": "list"},
                        {"name": "imaging", "label": "Imaging", "type": "list"},
                    ],
                    "required": False,
                },
                {
                    "id": "advice",
                    "name": "Advice",
                    "fields": [
                        {"name": "general_advice", "label": "General Advice", "type": "list"},
                        {"name": "diet_advice", "label": "Diet Advice", "type": "list"},
                    ],
                    "required": False,
                },
                {
                    "id": "followup",
                    "name": "Follow-up",
                    "fields": [
                        {"name": "followup_date", "label": "Follow-up Date", "type": "date"},
                        {"name": "followup_instructions", "label": "Instructions", "type": "text"},
                    ],
                    "required": False,
                },
            ],
            "footer": {
                "doctor_signature": {"type": "signature", "label": "Doctor's Signature"},
                "disclaimer": "AI-assisted documentation. Verified by clinician.",
            },
        }
        
        # =====================================================================
        # OPD NOTES TEMPLATE
        # =====================================================================
        self._templates[DocumentType.OPD_NOTES] = {
            "name": "OPD Clinical Notes",
            "description": "Outpatient clinical documentation",
            "sections": [
                {
                    "id": "chief_complaint",
                    "name": "Chief Complaint",
                    "fields": [
                        {"name": "complaint", "label": "Chief Complaint", "type": "textarea"},
                        {"name": "duration", "label": "Duration", "type": "text"},
                    ],
                },
                {
                    "id": "hopi",
                    "name": "History of Present Illness",
                    "fields": [
                        {"name": "history", "label": "History", "type": "textarea"},
                        {"name": "onset", "label": "Onset", "type": "text"},
                        {"name": "progression", "label": "Progression", "type": "text"},
                        {"name": "associated_symptoms", "label": "Associated Symptoms", "type": "list"},
                        {"name": "relieving_factors", "label": "Relieving Factors", "type": "list"},
                        {"name": "aggravating_factors", "label": "Aggravating Factors", "type": "list"},
                    ],
                },
                {
                    "id": "past_history",
                    "name": "Past History",
                    "fields": [
                        {"name": "medical_history", "label": "Medical History", "type": "textarea"},
                        {"name": "surgical_history", "label": "Surgical History", "type": "textarea"},
                        {"name": "drug_history", "label": "Drug History", "type": "textarea"},
                        {"name": "allergy_history", "label": "Allergies", "type": "list"},
                        {"name": "family_history", "label": "Family History", "type": "textarea"},
                    ],
                },
                {
                    "id": "examination",
                    "name": "General Examination",
                    "fields": [
                        {"name": "general_condition", "label": "General Condition", "type": "text"},
                        {"name": "pallor", "label": "Pallor", "type": "select", "options": ["Absent", "Present"]},
                        {"name": "icterus", "label": "Icterus", "type": "select", "options": ["Absent", "Present"]},
                        {"name": "cyanosis", "label": "Cyanosis", "type": "select", "options": ["Absent", "Present"]},
                        {"name": "clubbing", "label": "Clubbing", "type": "select", "options": ["Absent", "Present"]},
                        {"name": "edema", "label": "Edema", "type": "select", "options": ["Absent", "Present"]},
                        {"name": "lymphadenopathy", "label": "Lymphadenopathy", "type": "select", "options": ["Absent", "Present"]},
                    ],
                },
                {
                    "id": "vitals",
                    "name": "Vital Signs",
                    "fields": [
                        {"name": "bp", "label": "Blood Pressure", "type": "text", "unit": "mmHg"},
                        {"name": "pulse", "label": "Pulse", "type": "text", "unit": "/min"},
                        {"name": "rr", "label": "Respiratory Rate", "type": "text", "unit": "/min"},
                        {"name": "temp", "label": "Temperature", "type": "text", "unit": "°F"},
                        {"name": "spo2", "label": "SpO2", "type": "text", "unit": "%"},
                        {"name": "height", "label": "Height", "type": "text", "unit": "cm"},
                        {"name": "weight", "label": "Weight", "type": "text", "unit": "kg"},
                        {"name": "bmi", "label": "BMI", "type": "text", "unit": "kg/m²"},
                    ],
                },
                {
                    "id": "systemic",
                    "name": "Systemic Examination",
                    "fields": [
                        {"name": "cvs", "label": "Cardiovascular System", "type": "textarea"},
                        {"name": "rs", "label": "Respiratory System", "type": "textarea"},
                        {"name": "git", "label": "Gastrointestinal System", "type": "textarea"},
                        {"name": "cns", "label": "Central Nervous System", "type": "textarea"},
                    ],
                },
                {
                    "id": "diagnosis",
                    "name": "Diagnosis",
                    "fields": [
                        {"name": "provisional_diagnosis", "label": "Provisional Diagnosis", "type": "textarea"},
                        {"name": "differential_diagnosis", "label": "Differential Diagnosis", "type": "list"},
                    ],
                },
                {
                    "id": "plan",
                    "name": "Plan",
                    "fields": [
                        {"name": "investigations", "label": "Investigations", "type": "list"},
                        {"name": "treatment", "label": "Treatment Plan", "type": "textarea"},
                    ],
                },
            ],
        }
        
        # =====================================================================
        # DISCHARGE SUMMARY TEMPLATE
        # =====================================================================
        self._templates[DocumentType.DISCHARGE_SUMMARY] = {
            "name": "Discharge Summary",
            "description": "Hospital discharge documentation",
            "sections": [
                {
                    "id": "admission_details",
                    "name": "Admission Details",
                    "fields": [
                        {"name": "admission_date", "label": "Admission Date", "type": "date"},
                        {"name": "discharge_date", "label": "Discharge Date", "type": "date"},
                        {"name": "ward", "label": "Ward/Room", "type": "text"},
                        {"name": "admitting_doctor", "label": "Admitting Doctor", "type": "text"},
                        {"name": "consultant", "label": "Consultant", "type": "text"},
                    ],
                },
                {
                    "id": "chief_complaint",
                    "name": "Chief Complaint at Admission",
                    "fields": [
                        {"name": "complaint", "label": "Chief Complaint", "type": "textarea"},
                    ],
                },
                {
                    "id": "history",
                    "name": "History",
                    "fields": [
                        {"name": "presenting_illness", "label": "History of Present Illness", "type": "textarea"},
                        {"name": "past_history", "label": "Past Medical History", "type": "textarea"},
                    ],
                },
                {
                    "id": "admission_vitals",
                    "name": "Vitals at Admission",
                    "fields": [
                        {"name": "bp", "label": "Blood Pressure", "type": "text"},
                        {"name": "pulse", "label": "Pulse", "type": "text"},
                        {"name": "temp", "label": "Temperature", "type": "text"},
                        {"name": "spo2", "label": "SpO2", "type": "text"},
                    ],
                },
                {
                    "id": "investigations",
                    "name": "Investigations",
                    "fields": [
                        {"name": "lab_reports", "label": "Laboratory Reports", "type": "textarea"},
                        {"name": "imaging", "label": "Imaging Studies", "type": "textarea"},
                        {"name": "other_investigations", "label": "Other Investigations", "type": "textarea"},
                    ],
                },
                {
                    "id": "hospital_course",
                    "name": "Hospital Course",
                    "fields": [
                        {"name": "course", "label": "Course During Admission", "type": "textarea"},
                    ],
                },
                {
                    "id": "procedures",
                    "name": "Procedures Performed",
                    "fields": [
                        {"name": "procedures", "label": "Procedures", "type": "list"},
                    ],
                },
                {
                    "id": "diagnosis",
                    "name": "Final Diagnosis",
                    "fields": [
                        {"name": "primary_diagnosis", "label": "Primary Diagnosis", "type": "text"},
                        {"name": "secondary_diagnosis", "label": "Secondary Diagnosis", "type": "list"},
                        {"name": "icd_codes", "label": "ICD-10 Codes", "type": "list"},
                    ],
                },
                {
                    "id": "discharge_condition",
                    "name": "Condition at Discharge",
                    "fields": [
                        {"name": "condition", "label": "General Condition", "type": "text"},
                        {"name": "discharge_vitals", "label": "Vitals at Discharge", "type": "text"},
                    ],
                },
                {
                    "id": "discharge_medications",
                    "name": "Discharge Medications",
                    "fields": [
                        {
                            "name": "medicines",
                            "label": "Medicines",
                            "type": "medication_list",
                            "columns": ["Drug Name", "Dose", "Frequency", "Duration", "Instructions"],
                        },
                    ],
                },
                {
                    "id": "advice",
                    "name": "Advice on Discharge",
                    "fields": [
                        {"name": "general_advice", "label": "General Advice", "type": "list"},
                        {"name": "diet_advice", "label": "Diet Instructions", "type": "list"},
                        {"name": "activity_advice", "label": "Activity Restrictions", "type": "list"},
                    ],
                },
                {
                    "id": "followup",
                    "name": "Follow-up",
                    "fields": [
                        {"name": "followup_date", "label": "Follow-up Date", "type": "date"},
                        {"name": "followup_with", "label": "Follow-up With", "type": "text"},
                        {"name": "followup_investigations", "label": "Investigations Before Follow-up", "type": "list"},
                    ],
                },
                {
                    "id": "emergency",
                    "name": "Emergency Instructions",
                    "fields": [
                        {"name": "warning_signs", "label": "Warning Signs to Watch For", "type": "list"},
                        {"name": "emergency_contact", "label": "Emergency Contact", "type": "text"},
                    ],
                },
            ],
            "footer": {
                "prepared_by": {"type": "text", "label": "Prepared By"},
                "verified_by": {"type": "text", "label": "Verified By"},
                "consultant_signature": {"type": "signature", "label": "Consultant Signature"},
            },
        }
        
        # =====================================================================
        # IPD PROGRESS NOTES TEMPLATE
        # =====================================================================
        self._templates[DocumentType.IPD_NOTES] = {
            "name": "IPD Daily Progress Notes",
            "description": "Daily progress notes for admitted patients",
            "sections": [
                {
                    "id": "header",
                    "name": "Note Details",
                    "fields": [
                        {"name": "date", "label": "Date", "type": "date"},
                        {"name": "time", "label": "Time", "type": "time"},
                        {"name": "day_of_admission", "label": "Day of Admission", "type": "text"},
                    ],
                },
                {
                    "id": "subjective",
                    "name": "Subjective",
                    "description": "Patient's complaints and feelings",
                    "fields": [
                        {"name": "complaints_today", "label": "Today's Complaints", "type": "textarea"},
                        {"name": "sleep", "label": "Sleep", "type": "text"},
                        {"name": "appetite", "label": "Appetite", "type": "text"},
                        {"name": "bowel", "label": "Bowel", "type": "text"},
                        {"name": "urine", "label": "Urine", "type": "text"},
                    ],
                },
                {
                    "id": "objective",
                    "name": "Objective",
                    "description": "Examination findings",
                    "fields": [
                        {"name": "general", "label": "General Condition", "type": "text"},
                        {"name": "vitals", "label": "Vitals", "type": "textarea"},
                        {"name": "systemic", "label": "Systemic Examination", "type": "textarea"},
                        {"name": "drains", "label": "Drains/Tubes", "type": "text"},
                        {"name": "wound", "label": "Wound Status", "type": "text"},
                    ],
                },
                {
                    "id": "assessment",
                    "name": "Assessment",
                    "fields": [
                        {"name": "status", "label": "Current Status", "type": "text"},
                        {"name": "progress", "label": "Progress", "type": "select", "options": ["Improving", "Stable", "Deteriorating"]},
                    ],
                },
                {
                    "id": "plan",
                    "name": "Plan",
                    "fields": [
                        {"name": "medications", "label": "Medication Changes", "type": "textarea"},
                        {"name": "investigations", "label": "Investigations Today", "type": "list"},
                        {"name": "procedures", "label": "Procedures Planned", "type": "list"},
                        {"name": "consults", "label": "Consultations", "type": "list"},
                        {"name": "other", "label": "Other Orders", "type": "textarea"},
                    ],
                },
            ],
        }
    
    def get_template(self, doc_type: DocumentType) -> Dict[str, Any]:
        """Get template by document type"""
        return self._templates.get(doc_type, {})
    
    def get_all_templates(self) -> Dict[DocumentType, Dict[str, Any]]:
        """Get all templates"""
        return self._templates
    
    def validate_document(self, doc_type: DocumentType, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate a document against its template.
        
        Returns:
            Dict with validation result and any errors
        """
        template = self.get_template(doc_type)
        if not template:
            return {"valid": False, "errors": ["Unknown document type"]}
        
        errors = []
        warnings = []
        
        # Check required sections
        for section in template.get("sections", []):
            if section.get("required", False):
                section_id = section["id"]
                if section_id not in data or not data[section_id]:
                    errors.append(f"Required section missing: {section['name']}")
        
        # Validate medications if present
        if "medications" in data:
            for i, med in enumerate(data["medications"]):
                if not med.get("name"):
                    errors.append(f"Medication {i+1}: Drug name is required")
                if not med.get("dose"):
                    warnings.append(f"Medication {i+1}: Dose not specified")
                if not med.get("frequency"):
                    warnings.append(f"Medication {i+1}: Frequency not specified")
        
        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings,
        }
    
    def render_template(self, doc_type: DocumentType, data: Dict[str, Any]) -> str:
        """
        Render a completed template to text format.
        
        Args:
            doc_type: Type of document
            data: Data to fill in template
        
        Returns:
            Formatted text document
        """
        template = self.get_template(doc_type)
        if not template:
            return ""
        
        lines = []
        
        # Header
        lines.append("=" * 60)
        lines.append(template["name"].upper())
        lines.append("=" * 60)
        lines.append("")
        
        # Render each section
        for section in template.get("sections", []):
            section_id = section["id"]
            section_data = data.get(section_id, {})
            
            if section_data:
                lines.append(f"### {section['name']}")
                lines.append("")
                
                for field in section.get("fields", []):
                    field_name = field["name"]
                    field_label = field["label"]
                    field_value = section_data.get(field_name, "")
                    
                    if field_value:
                        if field["type"] == "list":
                            lines.append(f"**{field_label}:**")
                            for item in field_value:
                                lines.append(f"  • {item}")
                        elif field["type"] == "medication_list":
                            lines.append(f"**{field_label}:**")
                            for med in field_value:
                                med_line = f"  • {med.get('name', '')}"
                                if med.get("dose"):
                                    med_line += f" {med['dose']}"
                                if med.get("frequency"):
                                    med_line += f" {med['frequency']}"
                                if med.get("duration"):
                                    med_line += f" for {med['duration']}"
                                if med.get("instructions"):
                                    med_line += f" ({med['instructions']})"
                                lines.append(med_line)
                        else:
                            unit = field.get("unit", "")
                            lines.append(f"**{field_label}:** {field_value}{' ' + unit if unit else ''}")
                
                lines.append("")
        
        # Footer
        lines.append("-" * 60)
        lines.append("AI-assisted documentation. Verified by clinician.")
        lines.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
        lines.append("-" * 60)
        
        return "\n".join(lines)


# =============================================================================
# SINGLETON INSTANCE
# =============================================================================
template_engine = TemplateEngine()


def get_template_engine() -> TemplateEngine:
    """Get the template engine singleton"""
    return template_engine


# For testing
if __name__ == "__main__":
    engine = get_template_engine()
    
    print("Available Templates:")
    for doc_type in DocumentType:
        template = engine.get_template(doc_type)
        if template:
            print(f"  • {template['name']}")
    
    # Test rendering
    print("\n" + "=" * 60)
    print("SAMPLE PRESCRIPTION RENDER")
    print("=" * 60)
    
    sample_data = {
        "vitals": {
            "bp": "130/90",
            "pulse": "82",
            "temp": "99.2",
        },
        "chief_complaints": {
            "complaints": "Chest pain since 2 days, worse on exertion",
        },
        "diagnosis": {
            "primary_diagnosis": "Angina Pectoris",
            "icd_code": "I20.9",
        },
        "medications": {
            "medicines": [
                {"name": "Aspirin", "dose": "75mg", "frequency": "OD", "duration": "long term", "instructions": "after food"},
                {"name": "Atorvastatin", "dose": "20mg", "frequency": "HS", "duration": "long term"},
                {"name": "Metoprolol", "dose": "25mg", "frequency": "BD", "duration": "long term"},
            ]
        },
        "advice": {
            "general_advice": ["Avoid strenuous activity", "Regular BP monitoring", "Low salt diet"],
        },
        "followup": {
            "followup_date": "2026-02-08",
            "followup_instructions": "Come with ECG and lipid profile",
        },
    }
    
    rendered = engine.render_template(DocumentType.PRESCRIPTION, sample_data)
    print(rendered)
