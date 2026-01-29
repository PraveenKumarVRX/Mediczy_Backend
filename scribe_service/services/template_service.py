"""
Medical Specialty-Specific Templates
Provides templates for different hospital departments
"""

from typing import Dict, List, Optional
from dataclasses import dataclass
from enum import Enum

class MedicalSpecialty(Enum):
    CARDIOLOGY = "cardiology"
    ORTHOPEDICS = "orthopedics"
    NEUROLOGY = "neurology"
    RESPIRATORY = "respiratory"
    GASTROENTEROLOGY = "gastroenterology"
    NEPHROLOGY = "nephrology"
    ENDOCRINOLOGY = "endocrinology"
    GENERAL_MEDICINE = "general_medicine"
    SURGERY = "surgery"
    PEDIATRICS = "pediatrics"
    OBSTETRICS = "obstetrics"
    PSYCHIATRY = "psychiatry"
    ONCOLOGY = "oncology"
    INTENSIVE_CARE = "intensive_care"

@dataclass
class DischargeSummaryTemplate:
    specialty: MedicalSpecialty
    sections: Dict[str, str]
    key_investigations: List[str]
    common_diagnoses: List[str]
    common_medications: List[str]
    discharge_precautions: List[str]
    follow_up_timeline: str

class SpecialtyTemplateManager:
    def __init__(self):
        self.templates = self._initialize_templates()
    
    def _initialize_templates(self) -> Dict[MedicalSpecialty, DischargeSummaryTemplate]:
        """Initialize all specialty templates"""
        return {
            MedicalSpecialty.CARDIOLOGY: self._cardiology_template(),
            MedicalSpecialty.ORTHOPEDICS: self._orthopedics_template(),
            MedicalSpecialty.NEUROLOGY: self._neurology_template(),
            MedicalSpecialty.RESPIRATORY: self._respiratory_template(),
            MedicalSpecialty.GASTROENTEROLOGY: self._gastroenterology_template(),
            MedicalSpecialty.NEPHROLOGY: self._nephrology_template(),
            MedicalSpecialty.ENDOCRINOLOGY: self._endocrinology_template(),
            MedicalSpecialty.GENERAL_MEDICINE: self._general_medicine_template(),
            MedicalSpecialty.SURGERY: self._surgery_template(),
            MedicalSpecialty.INTENSIVE_CARE: self._intensive_care_template(),
        }
    
    def _cardiology_template(self) -> DischargeSummaryTemplate:
        return DischargeSummaryTemplate(
            specialty=MedicalSpecialty.CARDIOLOGY,
            sections={
                "chief_complaint": "Chest pain / Palpitations / Dyspnea / Syncope",
                "presentation": "Acute coronary syndrome presentation / Arrhythmia / Heart failure decompensation",
                "exam_findings": "Vital signs (BP, HR, RR, SpO2), Cardiac examination, Peripheral edema, JVD, Pulmonary findings",
                "investigations_key": "ECG (rhythm, ischemic changes), Troponin levels, BNP/NT-proBNP, Echocardiography findings",
                "diagnosis": "Acute MI (STEMI/NSTEMI) / Unstable Angina / Arrhythmia / Heart failure",
                "treatment": "Dual antiplatelet therapy / Anticoagulation / Beta-blockers / ACE inhibitors / Statins",
                "complications": "Cardiogenic shock / Heart failure / Arrhythmias / Mechanical complications",
                "discharge_plan": "Cardiology follow-up in 1-2 weeks / Stress testing if indicated / ICD evaluation if needed",
            },
            key_investigations=[
                "12-lead ECG",
                "Troponin I/T",
                "BNP/NT-proBNP",
                "Complete blood count",
                "Lipid profile",
                "Liver and renal function",
                "Echocardiography",
                "Coronary angiography",
                "Stress test",
                "Holter monitor"
            ],
            common_diagnoses=[
                "Acute myocardial infarction (STEMI)",
                "Acute myocardial infarction (NSTEMI)",
                "Unstable angina pectoris",
                "Acute decompensated heart failure",
                "Acute arrhythmia",
                "Hypertensive crisis",
                "Acute pericarditis",
                "Acute myocarditis"
            ],
            common_medications=[
                "Aspirin", "Clopidogrel/Ticagrelor", "Heparin/LMWH", "Nitroglycerin",
                "Beta-blockers", "ACE inhibitors", "Statins", "Loop diuretics"
            ],
            discharge_precautions=[
                "Seek immediate care for chest pain, severe dyspnea, or syncope",
                "Avoid strenuous activities for 4-6 weeks post-MI",
                "Monitor blood pressure and heart rate daily",
                "Strict adherence to antiplatelet therapy",
                "Cardiac rehabilitation enrollment"
            ],
            follow_up_timeline="Cardiology follow-up within 7-10 days, Repeat ECG/Troponin as indicated"
        )
    
    def _orthopedics_template(self) -> DischargeSummaryTemplate:
        return DischargeSummaryTemplate(
            specialty=MedicalSpecialty.ORTHOPEDICS,
            sections={
                "chief_complaint": "Trauma / Fracture / Joint dislocation / Pain",
                "injury_type": "Specify bone/joint affected, Mechanism of injury, Associated injuries",
                "exam_findings": "Swelling, Ecchymosis, Deformity, Range of motion, Neurovascular status, Associated soft tissue injury",
                "imaging": "X-rays (minimum 2 views), CT/MRI as needed, Post-reduction images",
                "diagnosis": "Specific fracture type with anatomical location and classification",
                "treatment": "Conservative (immobilization) vs Operative (ORIF/arthroscopy), Details of procedure performed",
                "fixation": "Type of fixation (cast, splint, plate, rod, screw), Immobilization period",
                "complications": "Any intraoperative/immediate postoperative complications",
                "discharge_plan": "Immobilization instructions, Weight-bearing status, Physical therapy schedule"
            },
            key_investigations=[
                "X-ray affected area (2-3 views)",
                "CT scan (for complex fractures)",
                "MRI (for soft tissue injuries)",
                "Neurovascular assessment",
                "Complete blood count",
                "Coagulation profile"
            ],
            common_diagnoses=[
                "Fracture of femur (shaft, neck, intertrochanteric)",
                "Fracture of tibia",
                "Fracture of humerus",
                "Spinal fracture",
                "Pelvic fracture",
                "Ankle fracture",
                "Wrist fracture",
                "Shoulder dislocation"
            ],
            common_medications=[
                "Analgesia (Paracetamol, NSAIDs, Opioids)",
                "Antibiotics (for open fractures)",
                "Muscle relaxants",
                "Anticoagulation (DVT prophylaxis)"
            ],
            discharge_precautions=[
                "Strict immobilization compliance",
                "Neurovascular check frequently",
                "Watch for signs of DVT/PE",
                "Avoid weight-bearing unless instructed",
                "Swelling control with elevation and ice",
                "Signs of infection or compartment syndrome"
            ],
            follow_up_timeline="Orthopedic follow-up in 2 weeks for wound check and X-ray"
        )
    
    def _neurology_template(self) -> DischargeSummaryTemplate:
        return DischargeSummaryTemplate(
            specialty=MedicalSpecialty.NEUROLOGY,
            sections={
                "chief_complaint": "Stroke / Seizure / Weakness / Altered consciousness",
                "presentation": "Time of onset, Acute neurological deficit, Focal vs diffuse findings",
                "neuro_exam": "GCS score, Cranial nerves, Motor and sensory examination, Reflexes, Gait assessment",
                "imaging": "CT/MRI brain findings, Stroke territory if applicable, Hemorrhage vs infarction",
                "diagnosis": "Ischemic stroke (territory) / Hemorrhagic stroke / Status epilepticus / Intracranial hemorrhage",
                "treatment": "Thrombolysis / Thrombectomy / Anticonvulsants / Hemostasis management",
                "complications": "Brain edema / Aspiration / Secondary seizures / Increased ICP",
                "discharge_plan": "Antiplatelet/anticoagulation therapy, Seizure precautions if applicable"
            },
            key_investigations=[
                "CT head (non-contrast)",
                "MRI brain with DWI/PWI",
                "Carotid ultrasound",
                "CT angiography",
                "EEG (if seizure)",
                "Blood glucose",
                "Coagulation profile"
            ],
            common_diagnoses=[
                "Ischemic stroke",
                "Hemorrhagic stroke (ICH)",
                "Subarachnoid hemorrhage",
                "Status epilepticus",
                "Acute meningitis",
                "Acute encephalitis",
                "Transient ischemic attack"
            ],
            common_medications=[
                "Aspirin", "Clopidogrel", "Warfarin", "Novel anticoagulants",
                "Anticonvulsants", "Antihypertensives", "Thrombolytics"
            ],
            discharge_precautions=[
                "Fall prevention - seizure precautions if applicable",
                "Aspiration precautions if dysphagia present",
                "Monitor for signs of recurrent stroke",
                "Continue antiplatelet/anticoagulation therapy strictly",
                "Rehabilitation initiation"
            ],
            follow_up_timeline="Neurology follow-up in 1 week, Ophthalmology if visual deficit"
        )
    
    def _respiratory_template(self) -> DischargeSummaryTemplate:
        return DischargeSummaryTemplate(
            specialty=MedicalSpecialty.RESPIRATORY,
            sections={
                "chief_complaint": "Cough / Dyspnea / Fever / Hemoptysis",
                "presentation": "Acute vs insidious onset, Fever pattern, Sputum characteristics, Risk factors",
                "exam_findings": "Respiratory rate, SpO2, Breath sounds, Adventitious sounds, Signs of respiratory distress",
                "imaging": "CXR findings, HRCT chest if indicated, Location and distribution of infiltrates",
                "diagnosis": "Community-acquired pneumonia / HAP / TB / COPD exacerbation / Asthma",
                "treatment": "Antibiotics (duration), Bronchodilators, Corticosteroids, Oxygen therapy requirement",
                "complications": "Respiratory failure / ARDS / Empyema / Bronchiectasis",
                "discharge_plan": "Antibiotic course completion, Respiratory physiotherapy, Activity level"
            },
            key_investigations=[
                "Chest X-ray",
                "HRCT chest",
                "Sputum examination",
                "AFB smear (if TB suspected)",
                "Complete blood count",
                "Liver and renal function",
                "ABG analysis",
                "Spirometry"
            ],
            common_diagnoses=[
                "Community-acquired pneumonia",
                "Hospital-acquired pneumonia",
                "Tuberculosis",
                "COPD exacerbation",
                "Asthma attack",
                "Pneumothorax",
                "Pulmonary embolism",
                "Acute respiratory distress syndrome"
            ],
            common_medications=[
                "Antibiotics (Amoxicillin, Cephalosporin, Fluoroquinolone)",
                "Bronchodilators", "Corticosteroids", "Antitussives", "Mucolytics",
                "Anti-TB drugs"
            ],
            discharge_precautions=[
                "Complete antibiotic course even if asymptomatic",
                "Isolation if infectious (TB, COVID-19)",
                "Smoking cessation",
                "Avoid respiratory irritants",
                "Watch for respiratory deterioration",
                "Respiratory physiotherapy exercises"
            ],
            follow_up_timeline="Respiratory follow-up in 2-3 weeks, Repeat CXR to confirm resolution"
        )
    
    def _gastroenterology_template(self) -> DischargeSummaryTemplate:
        return DischargeSummaryTemplate(
            specialty=MedicalSpecialty.GASTROENTEROLOGY,
            sections={
                "chief_complaint": "Abdominal pain / Vomiting / Hematemesis / Melena / Diarrhea",
                "presentation": "Onset, Pain character, Associated symptoms, GI bleed history",
                "exam_findings": "Abdominal distension, Tenderness, Rebound, Liver size, Ascites",
                "imaging": "Ultrasound abdomen, CT abdomen, OGD/Colonoscopy findings if done",
                "diagnosis": "GERD / PUD / Acute hepatitis / Cirrhosis / IBD / Acute gastroenteritis",
                "treatment": "PPI/H2 antagonists, Antibiotics if indicated, Antiemetics, Supportive care",
                "complications": "GI bleeding / Perforation / Peritonitis / Hepatic encephalopathy",
                "discharge_plan": "Dietary modifications, Medication adherence, Activity level"
            },
            key_investigations=[
                "Complete blood count",
                "Liver function tests",
                "Renal function tests",
                "Serum amylase/lipase",
                "Coagulation profile",
                "Blood culture (if febrile)",
                "Upper endoscopy findings",
                "Colonoscopy findings"
            ],
            common_diagnoses=[
                "Gastroesophageal reflux disease",
                "Peptic ulcer disease",
                "Acute hepatitis",
                "Liver cirrhosis",
                "Inflammatory bowel disease",
                "Acute pancreatitis",
                "Acute gastroenteritis",
                "GI bleeding"
            ],
            common_medications=[
                "Omeprazole/Pantoprazole", "Metoclopramide", "Ondansetron", 
                "Loperamide", "Sulfasalazine", "5-ASA compounds"
            ],
            discharge_precautions=[
                "Strict dietary modifications (low fat, avoid spicy)",
                "Avoid alcohol and NSAIDs",
                "Medication compliance",
                "Watch for hematemesis or melena",
                "Signs of peritonitis or perforation",
                "Alcohol cessation if indicated"
            ],
            follow_up_timeline="Gastroenterology follow-up in 2 weeks if needed, Repeat endoscopy in 6 weeks if ulcer"
        )
    
    def _nephrology_template(self) -> DischargeSummaryTemplate:
        return DischargeSummaryTemplate(
            specialty=MedicalSpecialty.NEPHROLOGY,
            sections={
                "chief_complaint": "Oliguria / Dysuria / Hematuria / Edema / Hypertension",
                "presentation": "Acute vs chronic renal disease, Urine output, Edema pattern, BP readings",
                "exam_findings": "Hypertension, Edema (location), Pallor, Uremic signs, Renal bruits",
                "imaging": "Ultrasound kidneys, CT abdomen, Renal function trend",
                "diagnosis": "AKI / CKD / ESRD / GN / Diabetic nephropathy / Hypertensive nephrosclerosis",
                "treatment": "Fluid management, Electrolyte correction, Antiproteinuric therapy, HD/PD if needed",
                "complications": "Hyperkalemia / Pulmonary edema / Uremia / Renal replacement need",
                "discharge_plan": "Dialysis schedule if on RRT, Medication adherence, Fluid restriction"
            },
            key_investigations=[
                "Renal function tests",
                "Serum electrolytes",
                "Urine routine and microscopy",
                "24-hour urine protein",
                "Blood pressure monitoring",
                "Ultrasound abdomen",
                "Renal biopsy (if indicated)"
            ],
            common_diagnoses=[
                "Acute kidney injury",
                "Chronic kidney disease",
                "End-stage renal disease",
                "Glomerulonephritis",
                "Diabetic nephropathy",
                "Hypertensive nephrosclerosis",
                "Obstructive nephropathy",
                "Acute tubular necrosis"
            ],
            common_medications=[
                "ACE inhibitors", "ARBs", "Diuretics", "Phosphate binders",
                "Calcium supplements", "Vitamin D", "Erythropoietin"
            ],
            discharge_precautions=[
                "Strict fluid restriction (500 mL/day if ESRD)",
                "Potassium restriction",
                "Protein restriction (per nephrologist)",
                "Dialysis schedule adherence",
                "Monitor fluid status daily",
                "Continue antihypertensive therapy"
            ],
            follow_up_timeline="Nephrology follow-up within 1 week, Repeat renal function in 3-5 days"
        )
    
    def _endocrinology_template(self) -> DischargeSummaryTemplate:
        return DischargeSummaryTemplate(
            specialty=MedicalSpecialty.ENDOCRINOLOGY,
            sections={
                "chief_complaint": "Hyperglycemia / Hypoglycemia / Thyroid disease / Adrenal crisis",
                "presentation": "Symptom onset, Glucose readings, Weight change, Hormonal symptoms",
                "exam_findings": "Vital signs, BMI, Skin findings, Lymph nodes, Signs of metabolic disease",
                "lab_findings": "HbA1c, Fasting glucose, Thyroid profile, Cortisol, Hormone levels",
                "diagnosis": "Type 1 DM / Type 2 DM / DKA / HHS / Hyperthyroidism / Hypothyroidism",
                "treatment": "Insulin / Oral hypoglycemic agents / Thyroid replacement / Steroid therapy",
                "complications": "DKA / HHS / Thyroid storm / Adrenal insufficiency",
                "discharge_plan": "Diabetes education, Medication adherence, Regular monitoring"
            },
            key_investigations=[
                "Fasting blood glucose",
                "Post-prandial glucose",
                "HbA1c",
                "Thyroid profile (TSH, T3, T4)",
                "Serum electrolytes",
                "Liver and renal function",
                "Lipid profile",
                "Cortisol level"
            ],
            common_diagnoses=[
                "Type 2 diabetes mellitus",
                "Type 1 diabetes mellitus",
                "Diabetic ketoacidosis",
                "Hyperosmolar hyperglycemic state",
                "Hyperthyroidism",
                "Hypothyroidism",
                "Thyroid nodule",
                "Adrenal insufficiency"
            ],
            common_medications=[
                "Insulin glargine/rapid-acting", "Metformin", "Sulfonylurea", "DPP-4 inhibitors",
                "GLP-1 agonists", "Levothyroxine", "Antithyroid drugs", "Corticosteroids"
            ],
            discharge_precautions=[
                "Blood glucose monitoring 4 times daily",
                "Hypoglycemia awareness and management",
                "Foot care and neuropathy screening",
                "Ophthalmology for retinopathy screening",
                "Regular HbA1c monitoring",
                "Dietary counseling and exercise"
            ],
            follow_up_timeline="Endocrinology follow-up in 2 weeks, Repeat HbA1c in 3 months"
        )
    
    def _general_medicine_template(self) -> DischargeSummaryTemplate:
        return DischargeSummaryTemplate(
            specialty=MedicalSpecialty.GENERAL_MEDICINE,
            sections={
                "chief_complaint": "Fever / Weakness / Generalized complaints",
                "presentation": "Symptom onset, Associated complaints, Risk factors, Comorbidities",
                "exam_findings": "General appearance, Vital signs, Systemic examination",
                "investigations": "Basic blood tests, Imaging as clinically indicated",
                "diagnosis": "Infectious disease / Metabolic disorder / Multisystem involvement",
                "treatment": "Symptomatic management, Disease-specific therapy, Supportive care",
                "complications": "Sepsis / MOF / Dehydration",
                "discharge_plan": "Medication adherence, Rest, Dietary modifications"
            },
            key_investigations=[
                "Complete blood count",
                "Liver function tests",
                "Renal function tests",
                "Blood glucose",
                "Blood culture",
                "Chest X-ray",
                "ECG",
                "Thyroid profile"
            ],
            common_diagnoses=[
                "Fever of unknown origin",
                "Sepsis",
                "Dehydration",
                "Anemia",
                "Malnutrition",
                "Hyponatremia",
                "Hyperglycemia",
                "Acute gastroenteritis"
            ],
            common_medications=[
                "Antipyretics", "Antibiotics", "Antiemetics", "Supportive fluids",
                "Vitamins", "Electrolyte replacement"
            ],
            discharge_precautions=[
                "Rest and hydration",
                "Monitor temperature",
                "Medication adherence",
                "Dietary modifications",
                "Watch for warning signs",
                "Regular follow-up"
            ],
            follow_up_timeline="Follow-up in 3-5 days, Earlier if symptoms persist"
        )
    
    def _surgery_template(self) -> DischargeSummaryTemplate:
        return DischargeSummaryTemplate(
            specialty=MedicalSpecialty.SURGERY,
            sections={
                "chief_complaint": "Surgical emergency / Elective surgery / Trauma",
                "preop_findings": "Indication for surgery, Comorbidities, Preop labs",
                "surgery_details": "Procedure performed, Approach, Findings intraoperatively, Specimens sent",
                "intraop_events": "Anesthesia type, Complications, Estimated blood loss, Fluids received",
                "postop_course": "Wound status, Drain output, Oral intake, Mobility",
                "complications": "Bleeding / Infection / Dehiscence / Ileus",
                "discharge_plan": "Wound care, Activity level, Medications, Follow-up"
            },
            key_investigations=[
                "Complete blood count (pre and post-op)",
                "Coagulation profile",
                "Group and cross-match",
                "Imaging (CT/X-ray as indicated)",
                "Pathology report",
                "Blood glucose"
            ],
            common_diagnoses=[
                "Acute abdomen requiring surgery",
                "Trauma with organ injury",
                "Acute appendicitis",
                "Acute cholecystitis",
                "Bowel obstruction",
                "Perforated viscus",
                "Inguinal hernia",
                "Breast lesion"
            ],
            common_medications=[
                "Antibiotics (prophylactic and therapeutic)",
                "Analgesics", "Antiemetics", "DVT prophylaxis",
                "Fluid and electrolyte replacement"
            ],
            discharge_precautions=[
                "Strict wound care and dressing protocol",
                "Monitor for signs of infection",
                "Adequate analgesia",
                "Gradual mobilization",
                "Avoid heavy lifting (weight restriction)",
                "Drain management if applicable",
                "Report unusual symptoms immediately"
            ],
            follow_up_timeline="Surgical follow-up in 7-10 days for wound check, Suture removal in 10-14 days"
        )
    
    def _intensive_care_template(self) -> DischargeSummaryTemplate:
        return DischargeSummaryTemplate(
            specialty=MedicalSpecialty.INTENSIVE_CARE,
            sections={
                "chief_complaint": "Critical illness requiring ICU admission",
                "icu_admission_reason": "Acute organ dysfunction, Sepsis, Hemodynamic instability",
                "icu_course": "Duration in ICU, Organ support required, Complications during stay",
                "investigations": "Serial labs, Imaging, Microbiological findings",
                "treatment": "Ventilatory support, Vasopressors, Medications, Procedures",
                "discharge_from_icu": "Reason for ICU discharge, Current status, Outstanding issues",
                "discharge_plan": "Ward management, Continued monitoring, Rehabilitation needs"
            },
            key_investigations=[
                "Serial complete blood count",
                "Daily liver and renal function",
                "Daily electrolytes and lactate",
                "Blood cultures",
                "Daily chest X-ray",
                "CT as indicated",
                "Echocardiography",
                "Microbiology reports"
            ],
            common_diagnoses=[
                "Sepsis/septic shock",
                "ARDS",
                "Acute myocardial infarction",
                "Acute liver failure",
                "Acute kidney injury",
                "Hemorrhagic shock",
                "Anaphylaxis",
                "Status epilepticus"
            ],
            common_medications=[
                "Vasopressors (Noradrenaline, Dopamine)",
                "Inotropes (Dobutamine)", "Sedatives", "Analgesics",
                "Antibiotics", "DVT prophylaxis", "Stress ulcer prophylaxis"
            ],
            discharge_precautions=[
                "Careful step-down from critical care",
                "Monitor vital parameters closely on ward",
                "Continue antimicrobials as planned",
                "Physical rehabilitation",
                "Psychological support for ICU-related stress",
                "Close communication with family"
            ],
            follow_up_timeline="Follow-up with specialty teams as needed, Rehabilitation consultation"
        )
    
    def get_template(self, specialty: str) -> Optional[DischargeSummaryTemplate]:
        """Get template by specialty name"""
        try:
            spec = MedicalSpecialty(specialty.lower())
            return self.templates.get(spec)
        except ValueError:
            return None
    
    def get_template_sections(self, specialty: str) -> Dict[str, str]:
        """Get template sections for a specialty"""
        template = self.get_template(specialty)
        if template:
            return template.sections
        return {}
    
    def get_all_specialties(self) -> List[str]:
        """Get list of all available specialties"""
        return [spec.value for spec in MedicalSpecialty]
    
    def generate_template_structure(self, specialty: str) -> Dict:
        """Generate structured template for discharge summary"""
        template = self.get_template(specialty)
        if not template:
            return {}
        
        return {
            "specialty": template.specialty.value,
            "sections": template.sections,
            "key_investigations": template.key_investigations,
            "common_diagnoses": template.common_diagnoses,
            "common_medications": template.common_medications,
            "discharge_precautions": template.discharge_precautions,
            "follow_up_timeline": template.follow_up_timeline
        }
