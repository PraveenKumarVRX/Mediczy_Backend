import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import MainLayout from "@/components/layout/MainLayoutdoctor";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Stethoscope,
  Eye as EyeIcon,
  Baby,
  Bone,
  Brain,
  Heart,
  Activity,
  Pill,
  Syringe,
  Scissors,
  SmilePlus,
  Ear,
  Footprints,
  Wind,
  Droplets,
  Shield,
  Dna,
  ScanFace,
  Plus,
  Download,
  Eye,
  Check,
  FileText
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/utils/api";
import { useToast } from "@/hooks/use-toast";

// Specialty definitions with their specific prescription elements
// invented-data-check: static-reference -- clinical-note template catalog, not patient records.
const specialtyTemplates = [
  {
    id: "general_practice",
    name: "General Practice",
    icon: Stethoscope,
    color: "bg-blue-500",
    description: "General medical consultation prescription",
    template: {
      header: "GENERAL PRESCRIPTION",
      sections: [
        { title: "Chief Complaint", field: "chief_complaint", type: "textarea" },
        { title: "History of Present Illness", field: "history", type: "textarea" },
        { title: "Vital Signs", field: "vitals", type: "vitals" },
        { title: "Physical Examination", field: "examination", type: "textarea" },
        { title: "Diagnosis", field: "diagnosis", type: "text" },
        { title: "Medications", field: "medications", type: "medications" },
        { title: "Advice", field: "advice", type: "textarea" },
        { title: "Follow-up", field: "followup", type: "text" }
      ],
      vitalsFields: ["Blood Pressure", "Pulse Rate", "Temperature", "SpO2", "Weight", "Height", "BMI"],
      diagram: null
    }
  },
  {
    id: "dentist",
    name: "Dentistry",
    icon: SmilePlus,
    color: "bg-cyan-500",
    description: "Dental prescription with tooth chart",
    template: {
      header: "DENTAL PRESCRIPTION",
      sections: [
        { title: "Chief Complaint", field: "chief_complaint", type: "textarea" },
        { title: "Dental History", field: "dental_history", type: "textarea" },
        { title: "Dental Chart", field: "dental_chart", type: "dental_chart" },
        { title: "Examination Findings", field: "examination", type: "textarea" },
        { title: "Diagnosis", field: "diagnosis", type: "text" },
        { title: "Treatment Plan", field: "treatment_plan", type: "textarea" },
        { title: "Procedures Done", field: "procedures", type: "textarea" },
        { title: "Medications", field: "medications", type: "medications" },
        { title: "Post-Procedure Instructions", field: "instructions", type: "textarea" },
        { title: "Next Appointment", field: "followup", type: "text" }
      ],
      diagram: "dental_formula",
      dentalNotation: {
        permanent: {
          upperRight: [18, 17, 16, 15, 14, 13, 12, 11],
          upperLeft: [21, 22, 23, 24, 25, 26, 27, 28],
          lowerLeft: [31, 32, 33, 34, 35, 36, 37, 38],
          lowerRight: [48, 47, 46, 45, 44, 43, 42, 41]
        },
        deciduous: {
          upperRight: [55, 54, 53, 52, 51],
          upperLeft: [61, 62, 63, 64, 65],
          lowerLeft: [71, 72, 73, 74, 75],
          lowerRight: [85, 84, 83, 82, 81]
        }
      },
      toothConditions: ["Caries", "Missing", "Filled", "Crown", "Bridge", "Implant", "RCT", "Extraction Indicated", "Mobility", "Periodontal Disease"]
    }
  },
  {
    id: "ophthalmologist",
    name: "Ophthalmology",
    icon: EyeIcon,
    color: "bg-purple-500",
    description: "Eye prescription with vision chart",
    template: {
      header: "OPHTHALMIC PRESCRIPTION",
      sections: [
        { title: "Chief Complaint", field: "chief_complaint", type: "textarea" },
        { title: "Ocular History", field: "ocular_history", type: "textarea" },
        { title: "Vision Assessment", field: "vision", type: "vision_chart" },
        { title: "Refraction", field: "refraction", type: "refraction" },
        { title: "Slit Lamp Examination", field: "slit_lamp", type: "eye_exam" },
        { title: "Fundus Examination", field: "fundus", type: "eye_exam" },
        { title: "Intraocular Pressure", field: "iop", type: "iop" },
        { title: "Diagnosis", field: "diagnosis", type: "text" },
        { title: "Medications", field: "medications", type: "medications" },
        { title: "Spectacle Prescription", field: "spectacles", type: "spectacle_rx" },
        { title: "Advice", field: "advice", type: "textarea" },
        { title: "Follow-up", field: "followup", type: "text" }
      ],
      diagram: "eye_diagram",
      visionFields: {
        rightEye: { unaided: "", pinhole: "", withGlasses: "" },
        leftEye: { unaided: "", pinhole: "", withGlasses: "" }
      },
      refractionFields: {
        rightEye: { sphere: "", cylinder: "", axis: "", add: "" },
        leftEye: { sphere: "", cylinder: "", axis: "", add: "" },
        pd: ""
      }
    }
  },
  {
    id: "gynecologist",
    name: "Gynecology & Obstetrics",
    icon: Baby,
    color: "bg-pink-500",
    description: "OB-GYN prescription with menstrual & obstetric charts",
    template: {
      header: "GYNECOLOGY / OBSTETRIC PRESCRIPTION",
      sections: [
        { title: "Chief Complaint", field: "chief_complaint", type: "textarea" },
        { title: "Menstrual History", field: "menstrual_history", type: "menstrual" },
        { title: "Obstetric History", field: "obstetric_history", type: "obstetric" },
        { title: "Last Menstrual Period (LMP)", field: "lmp", type: "date" },
        { title: "Expected Date of Delivery (EDD)", field: "edd", type: "date" },
        { title: "Gestational Age", field: "gestational_age", type: "text" },
        { title: "General Examination", field: "general_exam", type: "textarea" },
        { title: "Per Abdominal Examination", field: "abdominal_exam", type: "textarea" },
        { title: "Per Vaginal Examination", field: "pv_exam", type: "textarea" },
        { title: "USG Findings", field: "usg", type: "textarea" },
        { title: "Diagnosis", field: "diagnosis", type: "text" },
        { title: "Medications", field: "medications", type: "medications" },
        { title: "Advice", field: "advice", type: "textarea" },
        { title: "Follow-up", field: "followup", type: "text" }
      ],
      diagram: "obstetric_chart",
      obstetricFormula: "G_P_L_A_",
      menstrualFields: ["Menarche Age", "Cycle Length", "Duration", "Flow", "Regularity", "Dysmenorrhea", "Last 3 Cycles"]
    }
  },
  {
    id: "orthopedic",
    name: "Orthopedics",
    icon: Bone,
    color: "bg-orange-500",
    description: "Orthopedic prescription with skeletal diagram",
    template: {
      header: "ORTHOPEDIC PRESCRIPTION",
      sections: [
        { title: "Chief Complaint", field: "chief_complaint", type: "textarea" },
        { title: "History of Injury/Illness", field: "history", type: "textarea" },
        { title: "Pain Assessment", field: "pain", type: "pain_scale" },
        { title: "Site of Injury", field: "injury_site", type: "body_diagram" },
        { title: "Local Examination", field: "local_exam", type: "textarea" },
        { title: "Range of Motion", field: "rom", type: "rom" },
        { title: "Neurovascular Status", field: "neurovascular", type: "textarea" },
        { title: "Imaging Findings", field: "imaging", type: "textarea" },
        { title: "Diagnosis", field: "diagnosis", type: "text" },
        { title: "Treatment Plan", field: "treatment", type: "textarea" },
        { title: "Medications", field: "medications", type: "medications" },
        { title: "Physiotherapy Advice", field: "physiotherapy", type: "textarea" },
        { title: "Follow-up", field: "followup", type: "text" }
      ],
      diagram: "skeleton",
      painScale: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      romJoints: ["Shoulder", "Elbow", "Wrist", "Hip", "Knee", "Ankle", "Spine"]
    }
  },
  {
    id: "cardiologist",
    name: "Cardiology",
    icon: Heart,
    color: "bg-red-500",
    description: "Cardiac prescription with heart diagram",
    template: {
      header: "CARDIOLOGY PRESCRIPTION",
      sections: [
        { title: "Chief Complaint", field: "chief_complaint", type: "textarea" },
        { title: "Cardiac History", field: "cardiac_history", type: "textarea" },
        { title: "Risk Factors", field: "risk_factors", type: "cardiac_risk" },
        { title: "Vital Signs", field: "vitals", type: "cardiac_vitals" },
        { title: "Cardiovascular Examination", field: "cv_exam", type: "textarea" },
        { title: "ECG Findings", field: "ecg", type: "textarea" },
        { title: "Echo Findings", field: "echo", type: "echo" },
        { title: "Diagnosis", field: "diagnosis", type: "text" },
        { title: "Medications", field: "medications", type: "medications" },
        { title: "Lifestyle Modifications", field: "lifestyle", type: "textarea" },
        { title: "Follow-up", field: "followup", type: "text" }
      ],
      diagram: "heart",
      riskFactors: ["Hypertension", "Diabetes", "Smoking", "Dyslipidemia", "Obesity", "Family History", "Sedentary Lifestyle"],
      echoFields: ["LVEF", "LVIDd", "LVIDs", "IVS", "LVPW", "LA", "Aortic Root", "RV", "TAPSE", "Valves"]
    }
  },
  {
    id: "neurologist",
    name: "Neurology",
    icon: Brain,
    color: "bg-indigo-500",
    description: "Neurological prescription with brain/nerve diagrams",
    template: {
      header: "NEUROLOGY PRESCRIPTION",
      sections: [
        { title: "Chief Complaint", field: "chief_complaint", type: "textarea" },
        { title: "Neurological History", field: "neuro_history", type: "textarea" },
        { title: "Higher Mental Functions", field: "hmf", type: "neuro_hmf" },
        { title: "Cranial Nerves", field: "cranial_nerves", type: "cranial_nerves" },
        { title: "Motor System", field: "motor", type: "neuro_motor" },
        { title: "Sensory System", field: "sensory", type: "neuro_sensory" },
        { title: "Reflexes", field: "reflexes", type: "reflexes" },
        { title: "Coordination", field: "coordination", type: "textarea" },
        { title: "Gait", field: "gait", type: "textarea" },
        { title: "Imaging Findings", field: "imaging", type: "textarea" },
        { title: "Diagnosis", field: "diagnosis", type: "text" },
        { title: "Medications", field: "medications", type: "medications" },
        { title: "Advice", field: "advice", type: "textarea" },
        { title: "Follow-up", field: "followup", type: "text" }
      ],
      diagram: "brain_nerves",
      cranialNerves: ["I - Olfactory", "II - Optic", "III - Oculomotor", "IV - Trochlear", "V - Trigeminal", "VI - Abducens", "VII - Facial", "VIII - Vestibulocochlear", "IX - Glossopharyngeal", "X - Vagus", "XI - Accessory", "XII - Hypoglossal"],
      reflexGrades: ["0 - Absent", "1+ - Diminished", "2+ - Normal", "3+ - Brisk", "4+ - Clonus"]
    }
  },
  {
    id: "dermatologist",
    name: "Dermatology",
    icon: ScanFace,
    color: "bg-amber-500",
    description: "Dermatology prescription with skin diagram",
    template: {
      header: "DERMATOLOGY PRESCRIPTION",
      sections: [
        { title: "Chief Complaint", field: "chief_complaint", type: "textarea" },
        { title: "Dermatological History", field: "derm_history", type: "textarea" },
        { title: "Site of Lesion", field: "site", type: "body_diagram" },
        { title: "Morphology", field: "morphology", type: "skin_morphology" },
        { title: "Distribution", field: "distribution", type: "textarea" },
        { title: "Associated Features", field: "associated", type: "textarea" },
        { title: "Diagnosis", field: "diagnosis", type: "text" },
        { title: "Medications", field: "medications", type: "medications" },
        { title: "Topical Treatment", field: "topical", type: "topical" },
        { title: "Advice", field: "advice", type: "textarea" },
        { title: "Follow-up", field: "followup", type: "text" }
      ],
      diagram: "skin_body",
      lesionTypes: ["Macule", "Papule", "Nodule", "Plaque", "Vesicle", "Bulla", "Pustule", "Ulcer", "Erosion", "Crust", "Scale", "Lichenification"]
    }
  },
  {
    id: "ent",
    name: "ENT (Otolaryngology)",
    icon: Ear,
    color: "bg-teal-500",
    description: "ENT prescription with ear/nose/throat diagrams",
    template: {
      header: "ENT PRESCRIPTION",
      sections: [
        { title: "Chief Complaint", field: "chief_complaint", type: "textarea" },
        { title: "ENT History", field: "ent_history", type: "textarea" },
        { title: "Ear Examination", field: "ear_exam", type: "ear_exam" },
        { title: "Audiometry", field: "audiometry", type: "audiometry" },
        { title: "Nose Examination", field: "nose_exam", type: "nose_exam" },
        { title: "Throat Examination", field: "throat_exam", type: "throat_exam" },
        { title: "Neck Examination", field: "neck_exam", type: "textarea" },
        { title: "Diagnosis", field: "diagnosis", type: "text" },
        { title: "Medications", field: "medications", type: "medications" },
        { title: "Procedure Advised", field: "procedure", type: "textarea" },
        { title: "Follow-up", field: "followup", type: "text" }
      ],
      diagram: "ent",
      earFindings: ["TM Intact", "TM Perforated", "Congested", "Retracted", "Bulging", "Discharge", "Wax"],
      hearingTests: ["Rinne", "Weber", "Pure Tone Audiometry"]
    }
  },
  {
    id: "pediatrician",
    name: "Pediatrics",
    icon: Baby,
    color: "bg-green-500",
    description: "Pediatric prescription with growth charts",
    template: {
      header: "PEDIATRIC PRESCRIPTION",
      sections: [
        { title: "Chief Complaint", field: "chief_complaint", type: "textarea" },
        { title: "Birth History", field: "birth_history", type: "birth_history" },
        { title: "Developmental History", field: "developmental", type: "milestones" },
        { title: "Immunization Status", field: "immunization", type: "immunization" },
        { title: "Nutritional History", field: "nutrition", type: "textarea" },
        { title: "Growth Parameters", field: "growth", type: "growth_chart" },
        { title: "General Examination", field: "general_exam", type: "textarea" },
        { title: "Systemic Examination", field: "systemic_exam", type: "textarea" },
        { title: "Diagnosis", field: "diagnosis", type: "text" },
        { title: "Medications", field: "medications", type: "pediatric_medications" },
        { title: "Feeding Advice", field: "feeding", type: "textarea" },
        { title: "Follow-up", field: "followup", type: "text" }
      ],
      diagram: "growth_chart",
      milestones: {
        "2 months": ["Social smile", "Head control partial"],
        "4 months": ["Holds head", "Rolls over", "Laughs"],
        "6 months": ["Sits with support", "Transfers objects"],
        "9 months": ["Sits alone", "Crawls", "Says mama/dada"],
        "12 months": ["Stands with support", "Pincer grasp", "1-2 words"],
        "18 months": ["Walks alone", "10-20 words", "Feeds self"],
        "2 years": ["Runs", "2-word sentences", "Climbs stairs"]
      },
      vaccines: ["BCG", "OPV", "IPV", "Hepatitis B", "Pentavalent", "Rotavirus", "PCV", "MMR", "Varicella", "Hepatitis A", "Typhoid"]
    }
  },
  {
    id: "pulmonologist",
    name: "Pulmonology",
    icon: Wind,
    color: "bg-sky-500",
    description: "Respiratory prescription with lung diagrams",
    template: {
      header: "PULMONOLOGY PRESCRIPTION",
      sections: [
        { title: "Chief Complaint", field: "chief_complaint", type: "textarea" },
        { title: "Respiratory History", field: "resp_history", type: "textarea" },
        { title: "Smoking History", field: "smoking", type: "smoking" },
        { title: "Vital Signs", field: "vitals", type: "respiratory_vitals" },
        { title: "Respiratory Examination", field: "resp_exam", type: "lung_exam" },
        { title: "Pulmonary Function Test", field: "pft", type: "pft" },
        { title: "Imaging Findings", field: "imaging", type: "textarea" },
        { title: "Diagnosis", field: "diagnosis", type: "text" },
        { title: "Medications", field: "medications", type: "medications" },
        { title: "Inhalers/Nebulization", field: "inhalers", type: "inhalers" },
        { title: "Oxygen Therapy", field: "oxygen", type: "oxygen" },
        { title: "Advice", field: "advice", type: "textarea" },
        { title: "Follow-up", field: "followup", type: "text" }
      ],
      diagram: "lungs",
      pftFields: ["FEV1", "FVC", "FEV1/FVC", "PEFR", "DLCO"],
      smokingFields: ["Pack Years", "Duration", "Current/Former/Never"]
    }
  },
  {
    id: "nephrologist",
    name: "Nephrology",
    icon: Droplets,
    color: "bg-blue-600",
    description: "Renal prescription with kidney diagrams",
    template: {
      header: "NEPHROLOGY PRESCRIPTION",
      sections: [
        { title: "Chief Complaint", field: "chief_complaint", type: "textarea" },
        { title: "Renal History", field: "renal_history", type: "textarea" },
        { title: "Dialysis History", field: "dialysis", type: "dialysis" },
        { title: "Vital Signs", field: "vitals", type: "vitals" },
        { title: "Fluid Status", field: "fluid", type: "fluid_status" },
        { title: "Renal Function Tests", field: "rft", type: "rft" },
        { title: "Urine Analysis", field: "urine", type: "urine" },
        { title: "Diagnosis", field: "diagnosis", type: "text" },
        { title: "Medications", field: "medications", type: "medications" },
        { title: "Dietary Advice", field: "diet", type: "renal_diet" },
        { title: "Follow-up", field: "followup", type: "text" }
      ],
      diagram: "kidney",
      rftFields: ["Serum Creatinine", "Blood Urea", "eGFR", "Sodium", "Potassium", "Calcium", "Phosphorus", "Uric Acid"],
      ckdStages: ["Stage 1 (GFR >90)", "Stage 2 (GFR 60-89)", "Stage 3a (GFR 45-59)", "Stage 3b (GFR 30-44)", "Stage 4 (GFR 15-29)", "Stage 5 (GFR <15)"]
    }
  },
  {
    id: "psychiatrist",
    name: "Psychiatry",
    icon: Brain,
    color: "bg-violet-500",
    description: "Psychiatric prescription with mental status exam",
    template: {
      header: "PSYCHIATRY PRESCRIPTION",
      sections: [
        { title: "Chief Complaint", field: "chief_complaint", type: "textarea" },
        { title: "History of Present Illness", field: "hpi", type: "textarea" },
        { title: "Psychiatric History", field: "psych_history", type: "textarea" },
        { title: "Family History", field: "family_history", type: "textarea" },
        { title: "Personal History", field: "personal_history", type: "textarea" },
        { title: "Mental Status Examination", field: "mse", type: "mse" },
        { title: "Risk Assessment", field: "risk", type: "risk_assessment" },
        { title: "Diagnosis", field: "diagnosis", type: "text" },
        { title: "Medications", field: "medications", type: "psych_medications" },
        { title: "Psychotherapy", field: "psychotherapy", type: "textarea" },
        { title: "Follow-up", field: "followup", type: "text" }
      ],
      diagram: null,
      mseFields: ["Appearance", "Behavior", "Speech", "Mood", "Affect", "Thought Form", "Thought Content", "Perception", "Cognition", "Insight", "Judgment"],
      riskCategories: ["Suicidal Ideation", "Homicidal Ideation", "Self-harm", "Substance Use"]
    }
  },
  {
    id: "gastroenterologist",
    name: "Gastroenterology",
    icon: Activity,
    color: "bg-yellow-600",
    description: "GI prescription with digestive system diagram",
    template: {
      header: "GASTROENTEROLOGY PRESCRIPTION",
      sections: [
        { title: "Chief Complaint", field: "chief_complaint", type: "textarea" },
        { title: "GI History", field: "gi_history", type: "textarea" },
        { title: "Bowel Habits", field: "bowel", type: "bowel" },
        { title: "Abdominal Examination", field: "abdominal_exam", type: "abdominal" },
        { title: "Liver Function Tests", field: "lft", type: "lft" },
        { title: "Endoscopy Findings", field: "endoscopy", type: "textarea" },
        { title: "Imaging Findings", field: "imaging", type: "textarea" },
        { title: "Diagnosis", field: "diagnosis", type: "text" },
        { title: "Medications", field: "medications", type: "medications" },
        { title: "Dietary Advice", field: "diet", type: "textarea" },
        { title: "Follow-up", field: "followup", type: "text" }
      ],
      diagram: "gi_tract",
      lftFields: ["Total Bilirubin", "Direct Bilirubin", "SGOT/AST", "SGPT/ALT", "ALP", "GGT", "Total Protein", "Albumin"]
    }
  },
  {
    id: "endocrinologist",
    name: "Endocrinology",
    icon: Dna,
    color: "bg-emerald-500",
    description: "Endocrine prescription with hormone panels",
    template: {
      header: "ENDOCRINOLOGY PRESCRIPTION",
      sections: [
        { title: "Chief Complaint", field: "chief_complaint", type: "textarea" },
        { title: "Endocrine History", field: "endo_history", type: "textarea" },
        { title: "Diabetic Profile", field: "diabetic", type: "diabetic" },
        { title: "Thyroid Profile", field: "thyroid", type: "thyroid" },
        { title: "Growth Parameters", field: "growth", type: "textarea" },
        { title: "Hormone Panel", field: "hormones", type: "hormone_panel" },
        { title: "Diagnosis", field: "diagnosis", type: "text" },
        { title: "Medications", field: "medications", type: "medications" },
        { title: "Insulin Regimen", field: "insulin", type: "insulin" },
        { title: "Dietary Advice", field: "diet", type: "textarea" },
        { title: "Follow-up", field: "followup", type: "text" }
      ],
      diagram: "endocrine",
      diabeticFields: ["FBS", "PPBS", "HbA1c", "Fasting Insulin", "C-Peptide"],
      thyroidFields: ["T3", "T4", "TSH", "Free T3", "Free T4", "Anti-TPO", "Anti-TG"]
    }
  },
  {
    id: "urologist",
    name: "Urology",
    icon: Droplets,
    color: "bg-rose-500",
    description: "Urology prescription with urinary tract diagram",
    template: {
      header: "UROLOGY PRESCRIPTION",
      sections: [
        { title: "Chief Complaint", field: "chief_complaint", type: "textarea" },
        { title: "Urological History", field: "uro_history", type: "textarea" },
        { title: "LUTS Assessment", field: "luts", type: "ipss" },
        { title: "Urine Analysis", field: "urine", type: "urine" },
        { title: "Uroflowmetry", field: "uroflow", type: "uroflow" },
        { title: "PSA", field: "psa", type: "text" },
        { title: "Imaging Findings", field: "imaging", type: "textarea" },
        { title: "Diagnosis", field: "diagnosis", type: "text" },
        { title: "Medications", field: "medications", type: "medications" },
        { title: "Procedure Advised", field: "procedure", type: "textarea" },
        { title: "Follow-up", field: "followup", type: "text" }
      ],
      diagram: "urinary_tract",
      ipssQuestions: ["Incomplete emptying", "Frequency", "Intermittency", "Urgency", "Weak stream", "Straining", "Nocturia"]
    }
  },
  {
    id: "specialist_opinion",
    name: "Specialist Opinion",
    icon: FileText,
    color: "bg-amber-500",
    description: "Comprehensive specialist opinion report template",
    template: {
      header: "SPECIALIST OPINION REPORT",
      sections: [
        { title: "Reason for Specialist Opinion", field: "reason", type: "textarea" },
        { title: "Documents Reviewed", field: "documents_reviewed", type: "documents_checklist" },
        { title: "Original Diagnosis", field: "original_diagnosis", type: "textarea" },
        { title: "Current Symptoms", field: "current_symptoms", type: "textarea" },
        { title: "Medical History Summary", field: "medical_history", type: "textarea" },
        { title: "Current Medications", field: "current_medications", type: "medications" },
        { title: "Investigation Review", field: "investigation_review", type: "textarea" },
        { title: "Clinical Assessment", field: "clinical_assessment", type: "textarea" },
        { title: "Expert Opinion", field: "expert_opinion", type: "opinion" },
        { title: "Diagnosis Confirmation", field: "diagnosis_confirmation", type: "diagnosis_status" },
        { title: "Recommendations", field: "recommendations", type: "recommendations" },
        { title: "Treatment Modifications", field: "treatment_modifications", type: "textarea" },
        { title: "Additional Investigations", field: "additional_investigations", type: "textarea" },
        { title: "Prognosis", field: "prognosis", type: "textarea" },
        { title: "Follow-up Advice", field: "followup_advice", type: "textarea" }
      ],
      diagram: null,
      documentsChecklist: [
        "Medical Records",
        "Lab Reports",
        "Imaging Studies (X-Ray/CT/MRI/USG)",
        "Pathology Reports",
        "Previous Prescriptions",
        "Surgical Notes",
        "Discharge Summary",
        "ECG/Echo Reports",
        "Other Documents"
      ],
      diagnosisOptions: [
        "Confirmed - Agree with original diagnosis",
        "Partially Confirmed - Additional conditions identified",
        "Revised - Different diagnosis suggested",
        "Inconclusive - More investigations needed"
      ],
      validityDays: 30
    }
  }
];

// SVG Diagrams for different specialties
const SpecialtyDiagrams = {
  dental_formula: () => (
    <svg viewBox="0 0 400 200" className="w-full h-auto">
      <defs>
        <style>{`
          .tooth { fill: white; stroke: #333; stroke-width: 1; cursor: pointer; }
          .tooth:hover { fill: #e0e0e0; }
          .tooth.selected { fill: #ffcc00; }
          .tooth.caries { fill: #ff6b6b; }
          .tooth.missing { fill: #ccc; opacity: 0.3; }
          .tooth.filled { fill: #4dabf7; }
          .tooth-label { font-size: 8px; text-anchor: middle; }
        `}</style>
      </defs>
      
      {/* Upper Right Quadrant */}
      <g transform="translate(20, 30)">
        <text x="80" y="-10" className="tooth-label" fontSize="10">Upper Right</text>
        {[18, 17, 16, 15, 14, 13, 12, 11].map((num, i) => (
          <g key={num} transform={`translate(${i * 20}, 0)`}>
            <rect className="tooth" x="2" y="0" width="16" height="25" rx="2" />
            <text className="tooth-label" x="10" y="40">{num}</text>
          </g>
        ))}
      </g>
      
      {/* Upper Left Quadrant */}
      <g transform="translate(200, 30)">
        <text x="80" y="-10" className="tooth-label" fontSize="10">Upper Left</text>
        {[21, 22, 23, 24, 25, 26, 27, 28].map((num, i) => (
          <g key={num} transform={`translate(${i * 20}, 0)`}>
            <rect className="tooth" x="2" y="0" width="16" height="25" rx="2" />
            <text className="tooth-label" x="10" y="40">{num}</text>
          </g>
        ))}
      </g>
      
      {/* Lower Right Quadrant */}
      <g transform="translate(20, 120)">
        <text x="80" y="55" className="tooth-label" fontSize="10">Lower Right</text>
        {[48, 47, 46, 45, 44, 43, 42, 41].map((num, i) => (
          <g key={num} transform={`translate(${i * 20}, 0)`}>
            <text className="tooth-label" x="10" y="-5">{num}</text>
            <rect className="tooth" x="2" y="0" width="16" height="25" rx="2" />
          </g>
        ))}
      </g>
      
      {/* Lower Left Quadrant */}
      <g transform="translate(200, 120)">
        <text x="80" y="55" className="tooth-label" fontSize="10">Lower Left</text>
        {[31, 32, 33, 34, 35, 36, 37, 38].map((num, i) => (
          <g key={num} transform={`translate(${i * 20}, 0)`}>
            <text className="tooth-label" x="10" y="-5">{num}</text>
            <rect className="tooth" x="2" y="0" width="16" height="25" rx="2" />
          </g>
        ))}
      </g>
      
      {/* Center line */}
      <line x1="200" y1="20" x2="200" y2="180" stroke="#999" strokeDasharray="4" />
    </svg>
  ),

  eye_diagram: () => (
    <svg viewBox="0 0 400 150" className="w-full h-auto">
      <defs>
        <style>{`
          .eye-outline { fill: white; stroke: #333; stroke-width: 2; }
          .pupil { fill: #333; }
          .iris { fill: #6b8e23; stroke: #333; }
          .label { font-size: 10px; }
        `}</style>
      </defs>
      
      {/* Right Eye */}
      <g transform="translate(50, 50)">
        <text x="40" y="-20" textAnchor="middle" className="label" fontWeight="bold">RIGHT EYE (OD)</text>
        <ellipse className="eye-outline" cx="40" cy="30" rx="40" ry="25" />
        <circle className="iris" cx="40" cy="30" r="15" />
        <circle className="pupil" cx="40" cy="30" r="7" />
      </g>
      
      {/* Left Eye */}
      <g transform="translate(250, 50)">
        <text x="40" y="-20" textAnchor="middle" className="label" fontWeight="bold">LEFT EYE (OS)</text>
        <ellipse className="eye-outline" cx="40" cy="30" rx="40" ry="25" />
        <circle className="iris" cx="40" cy="30" r="15" />
        <circle className="pupil" cx="40" cy="30" r="7" />
      </g>
      
      {/* Vision Chart Reference */}
      <g transform="translate(160, 100)">
        <text x="40" y="20" textAnchor="middle" className="label">Vision Assessment</text>
      </g>
    </svg>
  ),

  heart: () => (
    <svg viewBox="0 0 200 200" className="w-full h-auto">
      <defs>
        <style>{`
          .heart-outline { fill: #ffcccc; stroke: #cc0000; stroke-width: 2; }
          .chamber { fill: #ff9999; stroke: #cc0000; }
          .vessel { fill: none; stroke: #cc0000; stroke-width: 3; }
          .label { font-size: 8px; }
        `}</style>
      </defs>
      
      {/* Heart shape */}
      <path className="heart-outline" d="M100,180 C60,140 20,100 20,60 C20,30 50,10 80,30 C90,38 100,50 100,50 C100,50 110,38 120,30 C150,10 180,30 180,60 C180,100 140,140 100,180 Z" />
      
      {/* Chambers labels */}
      <text x="60" y="70" className="label">RA</text>
      <text x="130" y="70" className="label">LA</text>
      <text x="60" y="120" className="label">RV</text>
      <text x="130" y="120" className="label">LV</text>
      
      {/* Major vessels */}
      <path className="vessel" d="M80,30 L80,10" />
      <path className="vessel" d="M120,30 L120,10" />
      <text x="75" y="8" className="label">SVC</text>
      <text x="115" y="8" className="label">Ao</text>
    </svg>
  ),

  lungs: () => (
    <svg viewBox="0 0 250 200" className="w-full h-auto">
      <defs>
        <style>{`
          .lung { fill: #ffcccc; stroke: #cc6666; stroke-width: 2; }
          .trachea { fill: #ffe0e0; stroke: #cc6666; stroke-width: 2; }
          .label { font-size: 9px; text-anchor: middle; }
        `}</style>
      </defs>
      
      {/* Trachea */}
      <rect className="trachea" x="115" y="10" width="20" height="50" rx="5" />
      
      {/* Right Lung */}
      <path className="lung" d="M30,60 Q20,60 20,80 L20,160 Q20,180 40,180 L90,180 Q110,180 110,160 L110,80 Q110,60 100,60 L80,60 Q70,70 60,60 Z" />
      <text x="65" y="100" className="label">Right</text>
      <text x="65" y="115" className="label">Lung</text>
      
      {/* Left Lung */}
      <path className="lung" d="M140,60 Q130,70 120,60 L100,60 Q90,60 90,80 L90,160 Q90,180 110,180 L160,180 Q180,180 180,160 L180,80 Q180,60 170,60 Z" />
      <text x="135" y="100" className="label">Left</text>
      <text x="135" y="115" className="label">Lung</text>
      
      {/* Bronchi */}
      <line x1="125" y1="60" x2="90" y2="80" stroke="#cc6666" strokeWidth="2" />
      <line x1="125" y1="60" x2="160" y2="80" stroke="#cc6666" strokeWidth="2" />
    </svg>
  ),

  skeleton: () => (
    <svg viewBox="0 0 150 300" className="w-full h-auto">
      <defs>
        <style>{`
          .bone { fill: #f5f5dc; stroke: #8b8b7a; stroke-width: 1.5; }
          .joint { fill: #ddd; stroke: #888; }
        `}</style>
      </defs>
      
      {/* Skull */}
      <ellipse className="bone" cx="75" cy="25" rx="25" ry="20" />
      
      {/* Spine */}
      <rect className="bone" x="70" y="45" width="10" height="80" rx="3" />
      
      {/* Ribcage */}
      <ellipse className="bone" cx="75" cy="90" rx="35" ry="25" fill="none" strokeWidth="2" stroke="#8b8b7a" />
      
      {/* Pelvis */}
      <ellipse className="bone" cx="75" cy="135" rx="30" ry="15" />
      
      {/* Arms */}
      <line className="bone" x1="40" y1="55" x2="20" y2="100" strokeWidth="6" stroke="#f5f5dc" />
      <line className="bone" x1="110" y1="55" x2="130" y2="100" strokeWidth="6" stroke="#f5f5dc" />
      <line className="bone" x1="20" y1="100" x2="15" y2="150" strokeWidth="5" stroke="#f5f5dc" />
      <line className="bone" x1="130" y1="100" x2="135" y2="150" strokeWidth="5" stroke="#f5f5dc" />
      
      {/* Legs */}
      <line className="bone" x1="60" y1="145" x2="50" y2="220" strokeWidth="7" stroke="#f5f5dc" />
      <line className="bone" x1="90" y1="145" x2="100" y2="220" strokeWidth="7" stroke="#f5f5dc" />
      <line className="bone" x1="50" y1="220" x2="45" y2="280" strokeWidth="6" stroke="#f5f5dc" />
      <line className="bone" x1="100" y1="220" x2="105" y2="280" strokeWidth="6" stroke="#f5f5dc" />
    </svg>
  )
};

const DoctorSpecialtyTemplates = () => {
  const { currentDoctor } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedSpecialty, setSelectedSpecialty] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [installDialogOpen, setInstallDialogOpen] = useState(false);

  // Get specialty based on doctor's specialization
  const doctorSpecialty = currentDoctor?.specialization?.toLowerCase() || "";
  
  const matchedSpecialty = specialtyTemplates.find(s => 
    doctorSpecialty.includes(s.name.toLowerCase()) || 
    s.name.toLowerCase().includes(doctorSpecialty.split(" ")[0])
  );

  // Install specialty template
  const installTemplateMutation = useMutation({
    mutationFn: async (specialty: typeof specialtyTemplates[0]) => {
      const templateContent = generateTemplateContent(specialty);
      const response = await api.post('/doctors/templates', {
        name: `${specialty.name} Prescription Template`,
        type: 'prescription',
        content: templateContent,
        isDefault: true,
        specialty: specialty.id,
        sections: specialty.template.sections,
        diagram: specialty.template.diagram
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctor-templates'] });
      setInstallDialogOpen(false);
      toast({ title: "Success", description: "Specialty template installed successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to install template", variant: "destructive" });
    }
  });

  const generateTemplateContent = (specialty: typeof specialtyTemplates[0]) => {
    let content = `═══════════════════════════════════════════════════════════════
                    ${specialty.template.header}
═══════════════════════════════════════════════════════════════

Patient Name: {{patient_name}}
Age/Gender: {{age}} / {{gender}}
Date: {{date}}
Patient ID: {{patient_id}}

───────────────────────────────────────────────────────────────
`;

    specialty.template.sections.forEach(section => {
      content += `\n${section.title.toUpperCase()}:\n{{${section.field}}}\n`;
    });

    content += `
───────────────────────────────────────────────────────────────

Doctor's Signature: _______________________

Name: {{doctor_name}}
Registration No: {{registration_no}}
`;

    return content;
  };

  const handleInstall = (specialty: typeof specialtyTemplates[0]) => {
    setSelectedSpecialty(specialty.id);
    installTemplateMutation.mutate(specialty);
  };

  return (
    <MainLayout>
      <div className="min-h-screen">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold text-brand">Specialty Prescription Templates</h1>
            <p className="text-muted mt-1">
              Pre-configured prescription templates with specialty-specific fields and diagrams
            </p>
          </div>

          {/* Recommended Template */}
          {matchedSpecialty && (
            <Card className="border-primary bg-primary/5">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-lg ${matchedSpecialty.color}`}>
                    <matchedSpecialty.icon className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      Recommended for You
                      <Badge variant="default">Based on your specialty</Badge>
                    </CardTitle>
                    <CardDescription>{matchedSpecialty.name} - {matchedSpecialty.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4">
                  <Button onClick={() => handleInstall(matchedSpecialty)}>
                    <Download className="h-4 w-4 mr-2" />
                    Install Template
                  </Button>
                  <Button variant="outline" onClick={() => {
                    setSelectedSpecialty(matchedSpecialty.id);
                    setPreviewOpen(true);
                  }}>
                    <Eye className="h-4 w-4 mr-2" />
                    Preview
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* All Specialty Templates */}
          <div>
            <h2 className="text-xl font-semibold mb-4">All Specialty Templates</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {specialtyTemplates.map((specialty) => (
                <Card key={specialty.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${specialty.color}`}>
                          <specialty.icon className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{specialty.name}</CardTitle>
                          <CardDescription className="text-xs">{specialty.description}</CardDescription>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {/* Features */}
                      <div className="flex flex-wrap gap-1">
                        {specialty.template.sections.slice(0, 4).map((section, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {section.title}
                          </Badge>
                        ))}
                        {specialty.template.sections.length > 4 && (
                          <Badge variant="outline" className="text-xs">
                            +{specialty.template.sections.length - 4} more
                          </Badge>
                        )}
                      </div>
                      
                      {/* Diagram indicator */}
                      {specialty.template.diagram && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <FileText className="h-3 w-3" />
                          Includes {specialty.template.diagram.replace('_', ' ')} diagram
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 pt-2">
                        <Button size="sm" className="flex-1" onClick={() => handleInstall(specialty)}>
                          <Download className="h-3 w-3 mr-1" />
                          Install
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => {
                            setSelectedSpecialty(specialty.id);
                            setPreviewOpen(true);
                          }}
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Preview Dialog */}
          <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
              <DialogHeader>
                <DialogTitle>
                  {specialtyTemplates.find(s => s.id === selectedSpecialty)?.name} Template Preview
                </DialogTitle>
                <DialogDescription>
                  Preview of prescription template with specialty-specific sections and diagrams
                </DialogDescription>
              </DialogHeader>
              
              {selectedSpecialty && (() => {
                const specialty = specialtyTemplates.find(s => s.id === selectedSpecialty);
                if (!specialty) return null;
                
                return (
                  <div className="space-y-4">
                    {/* Diagram Preview */}
                    {specialty.template.diagram && SpecialtyDiagrams[specialty.template.diagram as keyof typeof SpecialtyDiagrams] && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Specialty Diagram</CardTitle>
                        </CardHeader>
                        <CardContent className="flex justify-center bg-gray-50 rounded-lg p-4">
                          <div className="max-w-md">
                            {SpecialtyDiagrams[specialty.template.diagram as keyof typeof SpecialtyDiagrams]()}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Sections Preview */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Template Sections</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-3">
                          {specialty.template.sections.map((section, i) => (
                            <div key={i} className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                              <Check className="h-4 w-4 text-green-500" />
                              <span className="text-sm">{section.title}</span>
                              <Badge variant="outline" className="text-xs ml-auto">
                                {section.type}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Special Fields */}
                    {specialty.template.diagram === "dental_formula" && specialty.template.toothConditions && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Dental Conditions</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap gap-2">
                            {specialty.template.toothConditions.map((condition, i) => (
                              <Badge key={i} variant="secondary">{condition}</Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {specialty.id === "ophthalmologist" && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Vision Assessment Fields</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label className="text-xs">Right Eye (OD)</Label>
                              <div className="text-xs text-muted-foreground mt-1">
                                Unaided • Pinhole • With Glasses
                              </div>
                            </div>
                            <div>
                              <Label className="text-xs">Left Eye (OS)</Label>
                              <div className="text-xs text-muted-foreground mt-1">
                                Unaided • Pinhole • With Glasses
                              </div>
                            </div>
                            <div className="col-span-2">
                              <Label className="text-xs">Refraction</Label>
                              <div className="text-xs text-muted-foreground mt-1">
                                Sphere • Cylinder • Axis • Add • PD
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {specialty.id === "pediatrician" && specialty.template.milestones && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Developmental Milestones</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ScrollArea className="h-40">
                            <div className="space-y-2">
                              {Object.entries(specialty.template.milestones).map(([age, milestones]) => (
                                <div key={age} className="flex gap-2">
                                  <Badge variant="outline" className="w-20 justify-center">{age}</Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {(milestones as string[]).join(" • ")}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                );
              })()}

              <DialogFooter>
                <Button variant="outline" onClick={() => setPreviewOpen(false)}>
                  Close
                </Button>
                <Button onClick={() => {
                  const specialty = specialtyTemplates.find(s => s.id === selectedSpecialty);
                  if (specialty) handleInstall(specialty);
                  setPreviewOpen(false);
                }}>
                  <Download className="h-4 w-4 mr-2" />
                  Install Template
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </MainLayout>
  );
};

export default DoctorSpecialtyTemplates;
