/**
 * Migration: Specialty Module Expansion — full specialty roster + prescription templates
 * Upgrade Plan Track B, Phase B5 (extended per hospital direction: multi
 * super-specialty deployment, compliance/specialist sign-off owned by the
 * hospital's own clinical staff).
 *
 * Two things happen here:
 *
 * 1. A new specialty_prescription_templates table — specialty-wise
 *    prescription layout: pre-printed patient health information, standard
 *    precautions, and diagram REFERENCES for patient understanding.
 *
 *    diagramType is a controlled identifier (e.g. 'dental_chart_adult_
 *    permanent', 'cardiac_diagram') that the frontend maps to a real,
 *    licensed/verified anatomical diagram asset. This migration does not
 *    generate, embed, or claim to produce the diagram images themselves —
 *    only the reference data saying which diagram belongs on which
 *    specialty's prescription and what it's for (annotation vs. patient
 *    education). Sourcing the actual artwork is an asset task, not a data
 *    task, and is out of scope here.
 *
 * 2. Extends the specialty roster from {cardiology, oncology} to the full
 *    set a multi super-specialty hospital would run, with explicit depth
 *    on physiotherapy, nephrology/dialysis, and dentistry per hospital
 *    direction, plus standard-depth coverage (order set, CDS rule,
 *    documentation template, prescription template) for the remaining
 *    common super-specialty departments.
 *
 * Same review gate as every other specialty-module row: everything here
 * is seeded at status='draft'. It becomes visible to a clinician-facing
 * endpoint only after the hospital's own credentialed staff call
 * approve() with their reviewerCredential (see specialty-module.service.js
 * and specialty-module.migration.js's header for why that step stays
 * human even though the draft content itself is AI-assisted).
 */
import pool from '../db/pgPool.js';

// ── Prescription templates for the two specialties seeded earlier ──────────
const existingSpecialtyPrescriptions = {
  cardiology: {
    name: 'Cardiology Prescription',
    patientEducationText: 'Take heart medications at the same time each day as prescribed. Do not stop medications such as blood thinners or beta-blockers abruptly without consulting your cardiologist. Monitor for chest pain, shortness of breath, swelling, or palpitations and seek care promptly if these occur or worsen.',
    diagramRefs: [
      { diagramType: 'cardiac_diagram', label: 'Heart Diagram — for patient education on your condition', purpose: 'education' },
    ],
    standardPrecautions: [
      'Monitor blood pressure/weight at home if instructed',
      'Follow dietary sodium/fluid restrictions as advised',
      'Attend follow-up and cardiac rehabilitation as scheduled',
    ],
  },
  oncology: {
    name: 'Oncology Prescription',
    patientEducationText: 'Take chemotherapy or oral cancer medications exactly as scheduled — do not adjust doses without consulting your oncology team. Report fever, unusual bleeding or bruising, or signs of infection immediately, especially during periods of low blood counts.',
    diagramRefs: [
      { diagramType: 'treatment_cycle_calendar', label: 'Treatment Cycle Calendar — track cycle days and appointments', purpose: 'annotation' },
    ],
    standardPrecautions: [
      'Monitor temperature daily during chemotherapy cycles',
      'Avoid crowds/sick contacts during periods of low immunity if advised',
      'Keep all lab and imaging follow-up appointments',
    ],
  },
};

// ── Full specialty definitions ──────────────────────────────────────────────
// Each: orderSets[], cdsRules[], docTemplates[], prescriptionTemplates[]
const specialties = {
  physiotherapy: {
    orderSets: [{
      name: 'Low Back Pain — Initial Physiotherapy Assessment & Plan',
      items: [
        { type: 'assessment', description: 'Lumbar spine range-of-motion assessment', rationale: 'Baseline functional measure' },
        { type: 'assessment', description: 'Neurological screen — dermatomes, myotomes, reflexes', rationale: 'Rule out radiculopathy/neurological involvement' },
        { type: 'assessment', description: 'Validated functional outcome measure (e.g. Oswestry Disability Index)', rationale: 'Track outcomes objectively over the course of care' },
        { type: 'screening', description: 'Red-flag screen: saddle anesthesia, bowel/bladder dysfunction, unexplained weight loss, fever', rationale: 'Identify cauda equina or other conditions requiring urgent medical referral before continuing physiotherapy' },
        { type: 'treatment', description: 'Therapeutic exercise program — core stabilization', rationale: 'First-line conservative management' },
        { type: 'treatment', description: 'Manual therapy as clinically indicated', rationale: 'Adjunct to exercise therapy per assessment findings' },
        { type: 'education', description: 'Posture and body mechanics education', rationale: 'Reduce recurrence risk' },
      ],
      evidenceReference: 'APTA Clinical Practice Guidelines — Low Back Pain (Journal of Orthopaedic & Sports Physical Therapy)',
    }],
    cdsRules: [{
      name: 'Red flag symptoms present',
      triggerCondition: { field: 'red_flag_symptoms_present', operator: 'eq', value: true },
      recommendation: 'Red flag symptoms present (e.g. saddle anesthesia, bowel/bladder dysfunction, unexplained weight loss) — refer for urgent medical evaluation before continuing physiotherapy.',
      evidenceReference: 'APTA Clinical Practice Guidelines — Low Back Pain',
      severity: 'critical',
    }],
    docTemplates: [{
      name: 'Physiotherapy Initial Assessment Note',
      sections: [
        { section: 'Chief Complaint', guidance: '' },
        { section: 'History', guidance: 'Mechanism of injury/onset, duration' },
        { section: 'Pain Assessment', guidance: 'Location, severity (NRS 0-10), aggravating/relieving factors' },
        { section: 'Objective Findings', guidance: 'ROM, strength, special tests' },
        { section: 'Functional Outcome Measure Score', guidance: '' },
        { section: 'Red Flag Screen', guidance: '' },
        { section: 'Clinical Impression', guidance: '' },
        { section: 'Treatment Plan', guidance: 'Frequency, duration, goals' },
        { section: 'Home Exercise Program', guidance: '' },
      ],
    }],
    prescriptionTemplates: [{
      name: 'Physiotherapy Treatment Prescription',
      patientEducationText: 'Physiotherapy is most effective when combined with your home exercise program. Report any increase in pain, numbness, tingling, or weakness to your therapist immediately. Avoid activities specifically restricted by your therapist until cleared.',
      diagramRefs: [
        { diagramType: 'musculoskeletal_body_outline_anterior', label: 'Body Diagram (Anterior) — mark areas of pain/treatment focus', purpose: 'annotation' },
        { diagramType: 'musculoskeletal_body_outline_posterior', label: 'Body Diagram (Posterior) — mark areas of pain/treatment focus', purpose: 'annotation' },
        { diagramType: 'spine_diagram_lateral', label: 'Spine Diagram (Lateral) — mark level of involvement', purpose: 'annotation' },
      ],
      standardPrecautions: [
        'Perform home exercises only as demonstrated/instructed',
        'Stop and report if pain increases significantly during exercise',
        'Apply ice/heat only as instructed by your therapist',
        'Attend all scheduled sessions for best outcomes',
      ],
    }],
  },

  nephrology_dialysis: {
    orderSets: [{
      name: 'Hemodialysis — Pre-Session Assessment & Standing Orders Framework',
      items: [
        { type: 'assessment', description: 'Pre-dialysis weight vs. dry weight/estimated fluid gain', rationale: 'Determine ultrafiltration target' },
        { type: 'assessment', description: 'Pre-dialysis vital signs', rationale: 'Baseline before treatment' },
        { type: 'assessment', description: 'Vascular access site inspection (bruit, thrill, infection signs)', rationale: 'Confirm access is safe to cannulate' },
        { type: 'lab', description: 'Pre-dialysis labs per schedule (electrolytes, BUN/creatinine per protocol)', rationale: 'Adequacy and safety monitoring' },
        { type: 'procedure', description: 'Dialysis per individualized prescription (duration, blood flow rate, dialysate composition)', rationale: 'Per nephrologist-specified parameters — not standardized here' },
        { type: 'monitoring', description: 'Intra-dialytic blood pressure/symptom monitoring', rationale: 'Detect intradialytic hypotension or other complications early' },
        { type: 'assessment', description: 'Post-dialysis weight and vital signs', rationale: 'Confirm target achieved, document tolerance' },
      ],
      evidenceReference: 'KDIGO Clinical Practice Guidelines; KDOQI Clinical Practice Guideline for Hemodialysis Adequacy',
    }],
    cdsRules: [
      {
        name: 'High interdialytic weight gain',
        triggerCondition: { field: 'interdialytic_weight_gain_pct', operator: 'gt', value: 4 },
        recommendation: 'Interdialytic weight gain exceeds 4% of dry weight — assess for fluid overload, review dietary/fluid counseling, consider dry weight reassessment.',
        evidenceReference: 'KDOQI Clinical Practice Guideline for Hemodialysis Adequacy',
        severity: 'warning',
      },
      {
        name: 'Vascular access infection signs',
        triggerCondition: { field: 'access_site_infection_signs', operator: 'eq', value: true },
        recommendation: 'Signs of vascular access infection present — do not cannulate through the affected site; urgent nephrology/vascular access evaluation required.',
        evidenceReference: 'KDOQI Clinical Practice Guideline for Vascular Access',
        severity: 'critical',
      },
    ],
    docTemplates: [{
      name: 'Hemodialysis Session Note',
      sections: [
        { section: 'Pre-Dialysis Assessment', guidance: 'Weight, vitals, access site check' },
        { section: 'Dialysis Prescription Parameters', guidance: 'Duration, blood flow rate, dialysate' },
        { section: 'Intra-Dialytic Events', guidance: '' },
        { section: 'Complications', guidance: 'Hypotension, cramping, etc., if any' },
        { section: 'Post-Dialysis Assessment', guidance: '' },
        { section: 'Plan / Next Session', guidance: '' },
      ],
    }],
    prescriptionTemplates: [{
      name: 'Dialysis / Nephrology Prescription',
      patientEducationText: 'Follow your prescribed fluid and dietary restrictions between dialysis sessions. Monitor your access site daily for redness, swelling, warmth, or drainage and report changes immediately. Weigh yourself daily at the same time to track fluid gain.',
      diagramRefs: [
        { diagramType: 'renal_dialysis_access_sites', label: 'Vascular Access Diagram — mark access type and site (AV fistula/graft/catheter)', purpose: 'annotation' },
        { diagramType: 'renal_anatomy_diagram', label: 'Kidney Anatomy Diagram — for patient education', purpose: 'education' },
      ],
      standardPrecautions: [
        'Do not allow blood pressure checks or blood draws on the access arm',
        'Keep the access site clean and dry',
        'Report fever, chills, or access site changes immediately',
        'Follow your prescribed fluid restriction between sessions',
      ],
    }],
  },

  dentistry: {
    orderSets: [{
      name: 'Routine Dental Examination & Prophylaxis',
      items: [
        { type: 'assessment', description: 'Full mouth clinical examination (soft tissue, hard tissue, occlusion)', rationale: 'Baseline oral health assessment' },
        { type: 'assessment', description: 'Periodontal charting (probing depths, bleeding on probing)', rationale: 'Detect periodontal disease' },
        { type: 'imaging', description: 'Radiographs as clinically indicated (bitewing/periapical/panoramic), following the ALARA principle', rationale: 'Detect interproximal caries and other findings not visible clinically' },
        { type: 'procedure', description: 'Scaling and polishing (prophylaxis) as indicated', rationale: 'Routine preventive care' },
        { type: 'education', description: 'Oral hygiene instruction', rationale: 'Prevention' },
      ],
      evidenceReference: 'American Dental Association (ADA) Clinical Practice Guidelines; ADA/FDA Dental Radiographic Examination Recommendations',
    }],
    cdsRules: [
      {
        name: 'Deep periodontal pocket',
        triggerCondition: { field: 'periodontal_pocket_depth_mm', operator: 'gte', value: 5 },
        recommendation: 'Periodontal pocket depth ≥5mm detected — consider periodontal evaluation/referral, scaling and root planing as indicated.',
        evidenceReference: 'American Academy of Periodontology Classification Guidelines',
        severity: 'warning',
      },
      {
        name: 'Suspicious oral lesion',
        triggerCondition: { field: 'suspicious_oral_lesion_present', operator: 'eq', value: true },
        recommendation: 'Suspicious oral lesion noted — biopsy or specialist (oral pathology/oral surgery) referral indicated for lesions persisting beyond 2 weeks.',
        evidenceReference: 'ADA Oral Cancer Screening Guidelines',
        severity: 'critical',
      },
    ],
    docTemplates: [{
      name: 'Dental Examination Note',
      sections: [
        { section: 'Chief Complaint', guidance: '' },
        { section: 'Dental/Medical History Review', guidance: '' },
        { section: 'Extraoral Examination', guidance: '' },
        { section: 'Intraoral Soft Tissue Examination', guidance: '' },
        { section: 'Periodontal Charting', guidance: '' },
        { section: 'Hard Tissue/Caries Charting', guidance: '' },
        { section: 'Radiographic Findings', guidance: '' },
        { section: 'Diagnosis', guidance: '' },
        { section: 'Treatment Plan', guidance: '' },
        { section: 'Patient Consent Notes', guidance: '' },
      ],
    }],
    prescriptionTemplates: [{
      name: 'Dental Prescription / Treatment Plan',
      patientEducationText: 'Maintain regular brushing (twice daily with fluoride toothpaste) and flossing. Avoid chewing on the treated side until numbness resolves after procedures involving local anesthesia. Attend follow-up visits as scheduled for treatment plan completion.',
      diagramRefs: [
        { diagramType: 'dental_chart_adult_permanent', label: 'Adult Dental Chart (32 teeth) — mark affected/treated teeth', purpose: 'annotation' },
        { diagramType: 'dental_chart_pediatric_primary', label: 'Pediatric Dental Chart (primary teeth) — for pediatric patients', purpose: 'annotation' },
        { diagramType: 'dental_periodontal_chart', label: 'Periodontal Charting Grid', purpose: 'annotation' },
      ],
      standardPrecautions: [
        'Avoid hot/cold or hard foods on treated teeth as instructed',
        'Take prescribed medications as directed; complete the full antibiotic course if prescribed',
        'Contact the clinic for severe pain, swelling, or fever after a procedure',
      ],
    }],
  },

  neurology: {
    orderSets: [{
      name: 'Acute Stroke — Initial Assessment Workup',
      items: [
        { type: 'assessment', description: 'NIHSS assessment', rationale: 'Standardized stroke severity scoring' },
        { type: 'imaging', description: 'CT head, non-contrast, STAT', rationale: 'Rule out hemorrhage before any thrombolysis consideration' },
        { type: 'lab', description: 'Blood glucose check', rationale: 'Hypoglycemia can mimic stroke' },
        { type: 'lab', description: 'Basic metabolic panel, coagulation panel', rationale: 'Thrombolysis eligibility screening' },
        { type: 'diagnostic', description: 'ECG', rationale: 'Screen for atrial fibrillation as an embolic source' },
        { type: 'assessment', description: 'Confirm last-known-well time', rationale: 'Determines thrombolysis/thrombectomy eligibility window' },
      ],
      evidenceReference: 'AHA/ASA Guidelines for Early Management of Acute Ischemic Stroke',
    }],
    cdsRules: [{
      name: 'Within thrombolysis window',
      triggerCondition: { field: 'last_known_well_within_hours', operator: 'lte', value: 4.5 },
      recommendation: 'Patient within thrombolysis window (last known well ≤4.5 hours) — evaluate eligibility for IV thrombolysis urgently.',
      evidenceReference: 'AHA/ASA Guidelines for Early Management of Acute Ischemic Stroke',
      severity: 'critical',
    }],
    docTemplates: [{
      name: 'Neurology Consultation Note',
      sections: [
        { section: 'Chief Complaint', guidance: '' },
        { section: 'History of Present Illness', guidance: '' },
        { section: 'Neurological Exam', guidance: 'Mental status, cranial nerves, motor, sensory, reflexes, coordination, gait' },
        { section: 'Relevant Imaging/Labs', guidance: '' },
        { section: 'Assessment', guidance: '' },
        { section: 'Plan', guidance: '' },
      ],
    }],
    prescriptionTemplates: [{
      name: 'Neurology Prescription',
      patientEducationText: 'Take anti-seizure or other neurological medications exactly as prescribed and do not stop abruptly without medical advice. Report new weakness, numbness, vision changes, severe headache, or confusion immediately.',
      diagramRefs: [
        { diagramType: 'nervous_system_diagram', label: 'Nervous System Diagram — for patient education', purpose: 'education' },
        { diagramType: 'brain_lobes_diagram', label: 'Brain Diagram — for explaining findings', purpose: 'education' },
      ],
      standardPrecautions: [
        'Do not drive if advised against it by your neurologist',
        'Keep a symptom diary if instructed',
        'Avoid identified triggers for seizures/migraines',
      ],
    }],
  },

  orthopedics: {
    orderSets: [{
      name: 'Acute Fracture — Initial Management',
      items: [
        { type: 'imaging', description: 'X-ray of affected area, minimum two views', rationale: 'Confirm and characterize fracture' },
        { type: 'assessment', description: 'Neurovascular assessment distal to injury', rationale: 'Rule out compromise requiring emergency management' },
        { type: 'procedure', description: 'Immobilization/splinting', rationale: 'Stabilize before definitive management' },
        { type: 'medication', description: 'Pain assessment and analgesia per protocol', rationale: 'Symptom control' },
        { type: 'referral', description: 'Orthopedic referral for definitive management', rationale: 'Determine conservative vs. surgical treatment' },
      ],
      evidenceReference: 'AAOS (American Academy of Orthopaedic Surgeons) Clinical Practice Guidelines',
    }],
    cdsRules: [{
      name: 'Neurovascular compromise',
      triggerCondition: { field: 'neurovascular_compromise_present', operator: 'eq', value: true },
      recommendation: 'Neurovascular compromise distal to injury — orthopedic emergency; urgent evaluation required to prevent compartment syndrome/limb ischemia.',
      evidenceReference: 'AAOS Guidelines — Acute Compartment Syndrome',
      severity: 'critical',
    }],
    docTemplates: [{
      name: 'Orthopedics Consultation Note',
      sections: [
        { section: 'Chief Complaint', guidance: '' },
        { section: 'Mechanism of Injury', guidance: '' },
        { section: 'Physical Exam', guidance: 'Inspection, palpation, ROM, neurovascular status' },
        { section: 'Imaging Findings', guidance: '' },
        { section: 'Diagnosis', guidance: '' },
        { section: 'Treatment Plan', guidance: 'Conservative vs. surgical' },
        { section: 'Follow-Up', guidance: '' },
      ],
    }],
    prescriptionTemplates: [{
      name: 'Orthopedics Prescription',
      patientEducationText: 'Keep the cast/splint dry and do not insert objects inside it. Elevate the injured limb to reduce swelling. Report increasing pain, numbness, or discoloration immediately (possible compartment syndrome).',
      diagramRefs: [
        { diagramType: 'joint_diagram_knee', label: 'Knee Diagram', purpose: 'annotation' },
        { diagramType: 'joint_diagram_shoulder', label: 'Shoulder Diagram', purpose: 'annotation' },
        { diagramType: 'skeletal_body_outline', label: 'Skeletal Body Outline — mark fracture site', purpose: 'annotation' },
      ],
      standardPrecautions: [
        'Use crutches/mobility aids as instructed',
        'Do not bear weight until cleared',
        'Attend follow-up X-ray/casting appointments',
      ],
    }],
  },

  gastroenterology: {
    orderSets: [{
      name: 'Upper GI Bleed — Initial Assessment',
      items: [
        { type: 'lab', description: 'CBC, coagulation panel', rationale: 'Assess bleeding severity and correctability' },
        { type: 'lab', description: 'Type and screen/crossmatch', rationale: 'Prepare for possible transfusion' },
        { type: 'procedure', description: 'IV access x2, large bore', rationale: 'Resuscitation readiness' },
        { type: 'monitoring', description: 'Vital sign monitoring, NPO status', rationale: 'Hemodynamic monitoring, prepare for possible endoscopy' },
        { type: 'assessment', description: 'Risk stratification (e.g. Glasgow-Blatchford score)', rationale: 'Guide triage/urgency of endoscopy' },
        { type: 'referral', description: 'Upper endoscopy referral', rationale: 'Diagnostic and therapeutic' },
      ],
      evidenceReference: 'ACG (American College of Gastroenterology) Clinical Guideline — Upper GI and Ulcer Bleeding',
    }],
    cdsRules: [{
      name: 'Hemodynamic instability with GI bleed',
      triggerCondition: { field: 'hemodynamic_instability_present', operator: 'eq', value: true },
      recommendation: 'Hemodynamic instability with GI bleed — initiate resuscitation, urgent GI consultation for endoscopy.',
      evidenceReference: 'ACG Clinical Guideline — Upper GI Bleeding',
      severity: 'critical',
    }],
    docTemplates: [{
      name: 'Gastroenterology Consultation Note',
      sections: [
        { section: 'Chief Complaint', guidance: '' },
        { section: 'History of Present Illness', guidance: '' },
        { section: 'Relevant History', guidance: 'NSAID/anticoagulant use, prior GI history' },
        { section: 'Physical Exam', guidance: 'Abdominal exam' },
        { section: 'Labs/Imaging', guidance: '' },
        { section: 'Endoscopy Findings', guidance: '' },
        { section: 'Assessment', guidance: '' },
        { section: 'Plan', guidance: '' },
      ],
    }],
    prescriptionTemplates: [{
      name: 'Gastroenterology Prescription',
      patientEducationText: 'Take proton pump inhibitors or other prescribed medications as directed, typically before meals. Avoid NSAIDs unless specifically approved by your physician. Report black/tarry stools, blood in vomit, or severe abdominal pain immediately.',
      diagramRefs: [
        { diagramType: 'gi_tract_diagram', label: 'GI Tract Diagram — for marking findings/explaining condition', purpose: 'education' },
      ],
      standardPrecautions: [
        'Follow dietary modifications as advised',
        'Avoid alcohol if instructed',
        'Complete the full course of prescribed medication',
      ],
    }],
  },

  pulmonology: {
    orderSets: [{
      name: 'Acute Asthma Exacerbation — Initial Management',
      items: [
        { type: 'assessment', description: 'Peak flow/spirometry assessment', rationale: 'Objective severity measure' },
        { type: 'monitoring', description: 'Pulse oximetry', rationale: 'Assess oxygenation' },
        { type: 'medication', description: 'Nebulized bronchodilator therapy per protocol', rationale: 'First-line acute treatment' },
        { type: 'assessment', description: 'Severity classification per guideline criteria (mild/moderate/severe)', rationale: 'Guides escalation decisions' },
        { type: 'imaging', description: 'Chest X-ray if indicated', rationale: 'Rule out complications (pneumothorax, pneumonia) if clinically suspected' },
        { type: 'medication', description: 'Consider systemic corticosteroids per protocol', rationale: 'Reduce airway inflammation in moderate-severe exacerbations' },
      ],
      evidenceReference: 'GINA (Global Initiative for Asthma) Guidelines',
    }],
    cdsRules: [{
      name: 'Low oxygen saturation in asthma exacerbation',
      triggerCondition: { field: 'spo2_pct', operator: 'lt', value: 92 },
      recommendation: 'SpO2 below 92% in the setting of asthma exacerbation indicates a severe exacerbation — escalate care urgently.',
      evidenceReference: 'GINA Global Strategy for Asthma Management and Prevention',
      severity: 'critical',
    }],
    docTemplates: [{
      name: 'Pulmonology Consultation Note',
      sections: [
        { section: 'Chief Complaint', guidance: '' },
        { section: 'History of Present Illness', guidance: '' },
        { section: 'Respiratory Exam', guidance: '' },
        { section: 'Spirometry/PFT Results', guidance: '' },
        { section: 'Imaging Review', guidance: '' },
        { section: 'Assessment', guidance: '' },
        { section: 'Plan', guidance: 'Medications, inhaler technique review' },
      ],
    }],
    prescriptionTemplates: [{
      name: 'Pulmonology Prescription',
      patientEducationText: 'Use inhalers exactly as demonstrated — correct technique matters as much as the medication itself. Keep your rescue inhaler accessible at all times. Track peak flow readings if instructed and follow your asthma action plan.',
      diagramRefs: [
        { diagramType: 'respiratory_diagram', label: 'Lungs/Airway Diagram — for patient education', purpose: 'education' },
        { diagramType: 'inhaler_technique_diagram', label: 'Inhaler Technique Steps Diagram', purpose: 'education' },
      ],
      standardPrecautions: [
        'Avoid known triggers (smoke, allergens) as identified',
        'Seek care if the rescue inhaler is needed more than twice a week',
        'Attend follow-up for asthma control review',
      ],
    }],
  },

  endocrinology: {
    orderSets: [{
      name: 'New Diabetes Diagnosis — Initial Workup',
      items: [
        { type: 'lab', description: 'HbA1c', rationale: 'Confirm diagnosis and baseline control' },
        { type: 'lab', description: 'Fasting/random glucose confirmation', rationale: 'Diagnostic confirmation' },
        { type: 'lab', description: 'Lipid panel', rationale: 'Cardiovascular risk assessment' },
        { type: 'lab', description: 'Renal function (metformin eligibility, nephropathy screening)', rationale: 'Guides medication choice and monitors complications' },
        { type: 'lab', description: 'Urine albumin-creatinine ratio', rationale: 'Nephropathy screening' },
        { type: 'referral', description: 'Dilated eye exam referral', rationale: 'Retinopathy screening' },
        { type: 'assessment', description: 'Foot exam', rationale: 'Neuropathy/vascular screening' },
        { type: 'referral', description: 'Diabetes self-management education referral', rationale: 'Improves long-term outcomes' },
      ],
      evidenceReference: 'ADA (American Diabetes Association) Standards of Medical Care in Diabetes',
    }],
    cdsRules: [{
      name: 'Significantly uncontrolled diabetes',
      triggerCondition: { field: 'hba1c_pct', operator: 'gte', value: 9 },
      recommendation: 'HbA1c ≥9% indicates significantly uncontrolled diabetes — consider intensified therapy and a closer follow-up interval.',
      evidenceReference: 'ADA Standards of Medical Care in Diabetes',
      severity: 'warning',
    }],
    docTemplates: [{
      name: 'Endocrinology Consultation Note',
      sections: [
        { section: 'Chief Complaint', guidance: '' },
        { section: 'History of Present Illness', guidance: '' },
        { section: 'Review of Systems', guidance: 'Polyuria/polydipsia/weight changes' },
        { section: 'Physical Exam', guidance: 'Including foot exam' },
        { section: 'Labs Review', guidance: '' },
        { section: 'Assessment', guidance: '' },
        { section: 'Plan', guidance: 'Medication, lifestyle, referrals' },
      ],
    }],
    prescriptionTemplates: [{
      name: 'Endocrinology Prescription',
      patientEducationText: 'Take diabetes medications at consistent times as prescribed. Monitor blood glucose as instructed and keep a log. Inspect your feet daily for cuts, blisters, or sores. Follow the dietary plan discussed with your care team.',
      diagramRefs: [
        { diagramType: 'endocrine_system_diagram', label: 'Endocrine System Diagram — for patient education', purpose: 'education' },
        { diagramType: 'foot_exam_diagram', label: 'Foot Diagram — for documenting foot exam findings', purpose: 'annotation' },
      ],
      standardPrecautions: [
        'Recognize and treat hypoglycemia symptoms promptly',
        'Do not skip meals if on insulin/sulfonylureas',
        'Attend scheduled eye and foot exams',
      ],
    }],
  },

  dermatology: {
    orderSets: [{
      name: 'Suspicious Skin Lesion — Initial Assessment',
      items: [
        { type: 'assessment', description: 'Full skin examination', rationale: 'Detect additional lesions of concern' },
        { type: 'assessment', description: 'Dermoscopy if available', rationale: 'Improves diagnostic accuracy for pigmented lesions' },
        { type: 'assessment', description: 'Lesion documentation using ABCDE criteria (Asymmetry, Border, Color, Diameter, Evolution)', rationale: 'Standardized melanoma risk assessment' },
        { type: 'procedure', description: 'Photography for monitoring', rationale: 'Track change over time' },
        { type: 'procedure', description: 'Biopsy if indicated', rationale: 'Histological confirmation' },
      ],
      evidenceReference: 'AAD (American Academy of Dermatology) Guidelines of Care for Melanoma',
    }],
    cdsRules: [{
      name: 'Lesion meets ABCDE criteria',
      triggerCondition: { field: 'abcde_criteria_positive', operator: 'eq', value: true },
      recommendation: 'Lesion meets ABCDE criteria suspicious for melanoma — biopsy indicated; consider urgent dermatology/oncology referral.',
      evidenceReference: 'AAD Guidelines of Care for Melanoma',
      severity: 'critical',
    }],
    docTemplates: [{
      name: 'Dermatology Consultation Note',
      sections: [
        { section: 'Chief Complaint', guidance: '' },
        { section: 'History of Present Illness', guidance: '' },
        { section: 'Skin Exam Findings', guidance: 'Location, morphology, distribution' },
        { section: 'Dermoscopy Findings', guidance: '' },
        { section: 'Assessment', guidance: '' },
        { section: 'Plan', guidance: 'Biopsy/treatment/follow-up' },
      ],
    }],
    prescriptionTemplates: [{
      name: 'Dermatology Prescription',
      patientEducationText: 'Apply topical medications only to affected areas as directed. Use broad-spectrum SPF 30+ sun protection daily. Monitor lesions for changes and report new or changing moles promptly.',
      diagramRefs: [
        { diagramType: 'skin_body_map_anterior_posterior', label: 'Body Map — mark lesion locations', purpose: 'annotation' },
      ],
      standardPrecautions: [
        'Avoid scratching or picking at lesions',
        'Complete the full course of topical/oral treatment',
        'Follow up as scheduled for lesion monitoring',
      ],
    }],
  },

  ent: {
    orderSets: [{
      name: 'Acute Sinusitis — Initial Assessment',
      items: [
        { type: 'assessment', description: 'History and physical exam, nasal endoscopy if available', rationale: 'Localize findings' },
        { type: 'assessment', description: 'Assess duration/severity criteria to differentiate viral vs. bacterial etiology', rationale: 'Guides antibiotic decision per guideline' },
        { type: 'imaging', description: 'Imaging only if complications suspected', rationale: 'Not routinely indicated for uncomplicated sinusitis' },
        { type: 'treatment', description: 'Symptomatic management', rationale: 'First-line for most cases' },
      ],
      evidenceReference: 'AAO-HNS Clinical Practice Guideline — Adult Sinusitis',
    }],
    cdsRules: [{
      name: 'Orbital or intracranial complication signs',
      triggerCondition: { field: 'orbital_or_intracranial_complication_signs', operator: 'eq', value: true },
      recommendation: 'Signs suggestive of orbital or intracranial complication of sinusitis — urgent imaging and ENT/emergency evaluation required.',
      evidenceReference: 'AAO-HNS Clinical Practice Guideline — Adult Sinusitis',
      severity: 'critical',
    }],
    docTemplates: [{
      name: 'ENT Consultation Note',
      sections: [
        { section: 'Chief Complaint', guidance: '' },
        { section: 'History of Present Illness', guidance: '' },
        { section: 'ENT Exam', guidance: 'Ear, nose, throat, neck' },
        { section: 'Endoscopy Findings', guidance: '' },
        { section: 'Audiometry/Other Testing', guidance: 'If performed' },
        { section: 'Assessment', guidance: '' },
        { section: 'Plan', guidance: '' },
      ],
    }],
    prescriptionTemplates: [{
      name: 'ENT Prescription',
      patientEducationText: 'Complete the full course of antibiotics if prescribed, even if symptoms improve early. Use saline nasal irrigation as instructed. Report worsening facial swelling, vision changes, or severe headache immediately.',
      diagramRefs: [
        { diagramType: 'ear_diagram', label: 'Ear Diagram — for patient education', purpose: 'education' },
        { diagramType: 'sinus_diagram', label: 'Sinus Diagram — for patient education', purpose: 'education' },
      ],
      standardPrecautions: [
        'Avoid air travel with active severe sinus congestion if advised',
        'Stay well hydrated',
        'Follow up if symptoms persist beyond 10 days',
      ],
    }],
  },

  psychiatry: {
    orderSets: [{
      name: 'New Psychiatric Evaluation — Initial Assessment',
      items: [
        { type: 'assessment', description: 'Mental status examination', rationale: 'Core psychiatric assessment' },
        { type: 'assessment', description: 'Suicide/self-harm risk assessment using a structured tool (e.g. Columbia Suicide Severity Rating Scale)', rationale: 'Standardized risk stratification' },
        { type: 'assessment', description: 'Substance use screening', rationale: 'Common comorbidity affecting diagnosis and treatment' },
        { type: 'assessment', description: 'Collateral history if available', rationale: 'Improves diagnostic accuracy' },
        { type: 'planning', description: 'Safety planning if indicated', rationale: 'Evidence-based suicide prevention intervention' },
        { type: 'lab', description: 'Baseline labs if starting psychotropic medication (per medication-specific requirements)', rationale: 'Medication safety monitoring' },
      ],
      evidenceReference: 'APA (American Psychiatric Association) Practice Guidelines',
    }],
    cdsRules: [{
      name: 'High suicide risk identified',
      triggerCondition: { field: 'suicide_risk_level', operator: 'eq', value: 'high' },
      recommendation: 'High suicide risk identified — implement safety plan, consider need for a higher level of care (crisis intervention/inpatient); do not leave patient unsupervised pending safety assessment.',
      evidenceReference: 'APA Practice Guideline for the Assessment and Treatment of Patients with Suicidal Behaviors',
      severity: 'critical',
    }],
    docTemplates: [{
      name: 'Psychiatric Evaluation Note',
      sections: [
        { section: 'Chief Complaint', guidance: '' },
        { section: 'History of Present Illness', guidance: '' },
        { section: 'Psychiatric History', guidance: '' },
        { section: 'Mental Status Exam', guidance: '' },
        { section: 'Risk Assessment', guidance: 'Suicide/self-harm/violence' },
        { section: 'Substance Use History', guidance: '' },
        { section: 'Assessment', guidance: '' },
        { section: 'Plan', guidance: 'Therapy, medication, safety plan, follow-up' },
      ],
    }],
    prescriptionTemplates: [{
      name: 'Psychiatry Prescription',
      patientEducationText: 'Take psychiatric medications consistently as prescribed — do not stop abruptly without consulting your provider, as this can cause withdrawal or symptom rebound. Reach out to your care team or a crisis line immediately if you have thoughts of harming yourself.',
      diagramRefs: [],
      standardPrecautions: [
        'Avoid alcohol/recreational drug interactions with prescribed medications',
        'Attend scheduled therapy/follow-up appointments',
        'Keep emergency/crisis contact numbers accessible',
      ],
    }],
  },

  pediatrics: {
    orderSets: [{
      name: 'Well-Child Visit — Age-Appropriate Screening Framework',
      items: [
        { type: 'assessment', description: 'Growth parameters (height/weight/head circumference), plotted on growth chart', rationale: 'Screen for growth abnormalities' },
        { type: 'assessment', description: 'Developmental milestone screening', rationale: 'Early detection of developmental delay' },
        { type: 'assessment', description: 'Vision/hearing screening as age-appropriate', rationale: 'Per periodicity schedule' },
        { type: 'review', description: 'Immunization status review and update per schedule', rationale: 'Ensure age-appropriate protection' },
        { type: 'education', description: 'Anticipatory guidance discussion', rationale: 'Age-appropriate safety and development counseling' },
      ],
      evidenceReference: 'AAP (American Academy of Pediatrics) Bright Futures Guidelines',
    }],
    cdsRules: [{
      name: 'Growth trajectory crossing percentile lines',
      triggerCondition: { field: 'growth_percentile_crossing_two_major_lines', operator: 'eq', value: true },
      recommendation: 'Growth trajectory crossing two major percentile lines — evaluate for underlying cause (nutritional, endocrine, or other); consider referral.',
      evidenceReference: 'AAP Bright Futures Guidelines',
      severity: 'warning',
    }],
    docTemplates: [{
      name: 'Pediatric Well-Child Note',
      sections: [
        { section: 'Chief Complaint/Visit Reason', guidance: '' },
        { section: 'Interval History', guidance: '' },
        { section: 'Growth Parameters', guidance: '' },
        { section: 'Developmental Screening', guidance: '' },
        { section: 'Immunization Review', guidance: '' },
        { section: 'Physical Exam', guidance: '' },
        { section: 'Anticipatory Guidance', guidance: '' },
        { section: 'Plan', guidance: '' },
      ],
    }],
    prescriptionTemplates: [{
      name: 'Pediatrics Prescription',
      patientEducationText: 'Give medications using the dosing device provided (not household spoons) and follow weight-based dosing exactly as prescribed. Complete the full antibiotic course if prescribed. Contact your pediatrician for high fever, difficulty breathing, or reduced activity/feeding.',
      diagramRefs: [
        { diagramType: 'growth_chart_boys', label: 'Growth Chart (Boys) — for plotting growth parameters', purpose: 'annotation' },
        { diagramType: 'growth_chart_girls', label: 'Growth Chart (Girls) — for plotting growth parameters', purpose: 'annotation' },
      ],
      standardPrecautions: [
        "Keep all medications out of children's reach",
        "Verify dose against the child's current weight before each administration",
        'Follow up per immunization schedule',
      ],
    }],
  },

  obstetrics_gynecology: {
    orderSets: [{
      name: 'Antenatal — Routine Visit Framework',
      items: [
        { type: 'assessment', description: 'Blood pressure and weight check', rationale: 'Screen for hypertensive disorders of pregnancy and appropriate weight gain' },
        { type: 'assessment', description: 'Fundal height measurement (after appropriate gestational age)', rationale: 'Screen for growth abnormalities' },
        { type: 'assessment', description: 'Fetal heart rate assessment', rationale: 'Confirm fetal wellbeing' },
        { type: 'lab', description: 'Urine protein/glucose dipstick', rationale: 'Preeclampsia and gestational diabetes screening' },
        { type: 'review', description: 'Review of pregnancy danger signs', rationale: 'Patient safety education each visit' },
        { type: 'screening', description: 'Gestational-age-appropriate screening per trimester protocol', rationale: 'Per standard antenatal care schedule' },
      ],
      evidenceReference: 'ACOG (American College of Obstetricians and Gynecologists) Guidelines for Perinatal Care',
    }],
    cdsRules: [{
      name: 'Elevated blood pressure in pregnancy',
      triggerCondition: { field: 'bp_systolic', operator: 'gte', value: 140 },
      recommendation: 'Systolic BP ≥140 in pregnancy — evaluate for preeclampsia (check proteinuria and symptoms) per ACOG hypertension-in-pregnancy criteria.',
      evidenceReference: 'ACOG Guidelines — Hypertension in Pregnancy',
      severity: 'critical',
    }],
    docTemplates: [{
      name: 'Antenatal Visit Note',
      sections: [
        { section: 'Gestational Age', guidance: '' },
        { section: 'Chief Complaint/Concerns', guidance: '' },
        { section: 'Vital Signs', guidance: '' },
        { section: 'Fundal Height', guidance: '' },
        { section: 'Fetal Heart Rate', guidance: '' },
        { section: 'Urine Dipstick', guidance: '' },
        { section: 'Danger Sign Review', guidance: '' },
        { section: 'Assessment', guidance: '' },
        { section: 'Plan/Next Visit', guidance: '' },
      ],
    }],
    prescriptionTemplates: [{
      name: 'Obstetrics & Gynecology Prescription',
      patientEducationText: 'Take prenatal vitamins as prescribed. Attend all scheduled antenatal visits and screening tests. Seek immediate care for severe headache, visual changes, severe abdominal pain, reduced fetal movement, or vaginal bleeding.',
      diagramRefs: [
        { diagramType: 'female_reproductive_diagram', label: 'Reproductive Anatomy Diagram — for patient education', purpose: 'education' },
        { diagramType: 'fundal_height_tracking_chart', label: 'Fundal Height Growth Chart', purpose: 'annotation' },
      ],
      standardPrecautions: [
        'Avoid contraindicated medications/substances discussed with your provider',
        'Report decreased fetal movement immediately',
        'Attend all scheduled screenings',
      ],
    }],
  },

  general_surgery: {
    orderSets: [{
      name: 'Pre-Operative Assessment — Elective Surgery Framework',
      items: [
        { type: 'assessment', description: 'Pre-anesthesia assessment', rationale: 'Anesthesia risk stratification' },
        { type: 'lab', description: 'Relevant labs (CBC, coagulation, renal function per procedure/age)', rationale: 'Surgical safety screening' },
        { type: 'diagnostic', description: 'ECG if age/risk-factor indicated', rationale: 'Cardiac risk screening' },
        { type: 'procedure', description: 'Informed consent documentation', rationale: 'Legal and ethical requirement' },
        { type: 'instruction', description: 'NPO instructions', rationale: 'Aspiration risk reduction' },
        { type: 'review', description: 'Medication reconciliation — hold anticoagulants per protocol as directed by surgeon/anesthesiologist', rationale: 'Bleeding risk management' },
      ],
      evidenceReference: 'ACS / ASA Preoperative Evaluation Guidelines',
    }],
    cdsRules: [{
      name: 'Anticoagulant not confirmed held',
      triggerCondition: { field: 'anticoagulant_not_held_per_protocol', operator: 'eq', value: true },
      recommendation: 'Anticoagulant medication status not confirmed/held per protocol before scheduled surgery — verify with the surgical/anesthesia team before proceeding; bleeding risk.',
      evidenceReference: 'ASA Practice Advisory for Preanesthesia Evaluation',
      severity: 'critical',
    }],
    docTemplates: [{
      name: 'Surgical Consultation / Pre-Op Note',
      sections: [
        { section: 'Chief Complaint', guidance: '' },
        { section: 'History of Present Illness', guidance: '' },
        { section: 'Relevant Surgical/Medical History', guidance: '' },
        { section: 'Physical Exam', guidance: '' },
        { section: 'Labs/Imaging Review', guidance: '' },
        { section: 'Diagnosis', guidance: '' },
        { section: 'Planned Procedure', guidance: '' },
        { section: 'Informed Consent Discussion', guidance: '' },
        { section: 'Pre-Op Instructions', guidance: '' },
      ],
    }],
    prescriptionTemplates: [{
      name: 'General Surgery Prescription',
      patientEducationText: 'Follow NPO (nothing by mouth) instructions exactly as given before surgery. Arrange for someone to accompany you home after the procedure. Keep the surgical site clean and dry per post-operative instructions and report fever, increasing redness, or wound discharge.',
      diagramRefs: [
        { diagramType: 'surgical_site_body_outline', label: 'Body Outline — mark planned surgical site', purpose: 'annotation' },
      ],
      standardPrecautions: [
        'Stop eating/drinking per NPO instructions before surgery',
        'Disclose all current medications and supplements to the surgical team',
        'Attend post-operative follow-up as scheduled',
      ],
    }],
  },

  urology: {
    orderSets: [{
      name: 'Acute Urinary Retention — Initial Management',
      items: [
        { type: 'assessment', description: 'Bladder scan/assessment for retention volume', rationale: 'Confirm and quantify retention' },
        { type: 'procedure', description: 'Urinary catheterization per protocol', rationale: 'Relieve retention' },
        { type: 'lab', description: 'Urinalysis and culture', rationale: 'Evaluate for infection' },
        { type: 'lab', description: 'Renal function assessment', rationale: 'Assess for obstructive uropathy impact' },
        { type: 'review', description: 'Review medications that may contribute (e.g. anticholinergics)', rationale: 'Identify reversible causes' },
        { type: 'referral', description: 'Urology referral for underlying cause evaluation', rationale: 'Definitive management' },
      ],
      evidenceReference: 'AUA (American Urological Association) Guidelines',
    }],
    cdsRules: [{
      name: 'Significant post-void residual',
      triggerCondition: { field: 'post_void_residual_ml', operator: 'gt', value: 300 },
      recommendation: 'Post-void residual >300mL — significant urinary retention; catheterization and urology evaluation indicated.',
      evidenceReference: 'AUA Guideline on Management of Benign Prostatic Hyperplasia/Urinary Retention',
      severity: 'warning',
    }],
    docTemplates: [{
      name: 'Urology Consultation Note',
      sections: [
        { section: 'Chief Complaint', guidance: '' },
        { section: 'History of Present Illness', guidance: '' },
        { section: 'Relevant History', guidance: 'Voiding symptoms, prior urologic history' },
        { section: 'Physical Exam', guidance: '' },
        { section: 'Bladder Scan/Imaging', guidance: '' },
        { section: 'Labs', guidance: '' },
        { section: 'Assessment', guidance: '' },
        { section: 'Plan', guidance: '' },
      ],
    }],
    prescriptionTemplates: [{
      name: 'Urology Prescription',
      patientEducationText: 'If you have a catheter, keep the drainage bag below bladder level and empty it regularly. Watch for signs of urinary tract infection (fever, cloudy/foul-smelling urine, flank pain) and report promptly. Take prescribed medications as directed.',
      diagramRefs: [
        { diagramType: 'urinary_system_diagram', label: 'Urinary System Diagram — for patient education', purpose: 'education' },
      ],
      standardPrecautions: [
        'Maintain adequate fluid intake unless restricted',
        'Keep the catheter site/bag clean if applicable',
        'Follow up for catheter removal/voiding trial as scheduled',
      ],
    }],
  },

  ophthalmology: {
    orderSets: [{
      name: 'Acute Red Eye — Initial Assessment',
      items: [
        { type: 'assessment', description: 'Visual acuity assessment', rationale: 'Baseline and red-flag screening' },
        { type: 'assessment', description: 'External eye examination', rationale: 'Localize pathology' },
        { type: 'assessment', description: 'Pupillary examination', rationale: 'Screen for intraocular pathology' },
        { type: 'assessment', description: 'Intraocular pressure check if indicated', rationale: 'Rule out acute angle-closure glaucoma' },
        { type: 'diagnostic', description: 'Fluorescein staining if corneal involvement suspected', rationale: 'Detect corneal abrasion/ulcer' },
        { type: 'screening', description: 'Assess for red flags: pain, photophobia, vision loss, trauma history', rationale: 'Determines urgency of referral' },
      ],
      evidenceReference: 'AAO (American Academy of Ophthalmology) Preferred Practice Patterns',
    }],
    cdsRules: [{
      name: 'Acute vision loss with red eye',
      triggerCondition: { field: 'acute_vision_loss_present', operator: 'eq', value: true },
      recommendation: 'Acute vision loss with red eye — ophthalmologic emergency; urgent same-day ophthalmology evaluation required.',
      evidenceReference: 'AAO Preferred Practice Pattern — Conjunctivitis/Red Eye',
      severity: 'critical',
    }],
    docTemplates: [{
      name: 'Ophthalmology Consultation Note',
      sections: [
        { section: 'Chief Complaint', guidance: '' },
        { section: 'History of Present Illness', guidance: '' },
        { section: 'Visual Acuity', guidance: '' },
        { section: 'External/Slit Lamp Exam Findings', guidance: '' },
        { section: 'Intraocular Pressure', guidance: '' },
        { section: 'Fundoscopy', guidance: 'If performed' },
        { section: 'Assessment', guidance: '' },
        { section: 'Plan', guidance: '' },
      ],
    }],
    prescriptionTemplates: [{
      name: 'Ophthalmology Prescription',
      patientEducationText: 'Use eye drops exactly as prescribed, including proper technique (avoid touching the dropper tip to the eye). Do not rub the affected eye. Report worsening pain, vision changes, or increased redness immediately.',
      diagramRefs: [
        { diagramType: 'eye_diagram', label: 'Eye Diagram — for patient education / marking findings', purpose: 'education' },
      ],
      standardPrecautions: [
        'Complete the full course of prescribed eye drops',
        'Avoid contact lens use until cleared',
        'Wear protective eyewear if advised',
      ],
    }],
  },
};

export async function runSpecialtyPrescriptionsExpansionMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS specialty_prescription_templates (
        id                  SERIAL PRIMARY KEY,
        specialty           VARCHAR(100) NOT NULL,
        organization_id     INTEGER,
        name                VARCHAR(255) NOT NULL,
        patient_education_text TEXT,
        diagram_refs        JSONB        NOT NULL DEFAULT '[]'::jsonb,
        standard_precautions JSONB       NOT NULL DEFAULT '[]'::jsonb,
        status              VARCHAR(20)  NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'retired')),
        created_by          INTEGER,
        reviewed_by         INTEGER,
        reviewer_credential TEXT,
        reviewed_at         TIMESTAMPTZ,
        created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_specialty_prescription_templates_lookup ON specialty_prescription_templates (specialty, status)`);

    // See specialty-module.migration.js for why every $1/$2 needs an
    // explicit ::varchar cast here — same "inconsistent types deduced for
    // parameter $1" bug, caught live on first deploy.
    const seedOrderSet = async (specialty, { name, items, evidenceReference }) => {
      await client.query(
        `INSERT INTO specialty_order_sets (specialty, name, items, evidence_reference, status)
         SELECT $1::varchar, $2::varchar, $3::jsonb, $4::text, 'draft'
         WHERE NOT EXISTS (SELECT 1 FROM specialty_order_sets WHERE specialty = $1::varchar AND name = $2::varchar)`,
        [specialty, name, JSON.stringify(items), evidenceReference]
      );
    };
    const seedCdsRule = async (specialty, { name, triggerCondition, recommendation, evidenceReference, severity }) => {
      await client.query(
        `INSERT INTO specialty_cds_rules (specialty, name, trigger_condition, recommendation, evidence_reference, severity, status)
         SELECT $1::varchar, $2::varchar, $3::jsonb, $4::text, $5::text, $6::varchar, 'draft'
         WHERE NOT EXISTS (SELECT 1 FROM specialty_cds_rules WHERE specialty = $1::varchar AND name = $2::varchar)`,
        [specialty, name, JSON.stringify(triggerCondition), recommendation, evidenceReference, severity]
      );
    };
    const seedDocTemplate = async (specialty, { name, sections }) => {
      await client.query(
        `INSERT INTO specialty_documentation_templates (specialty, name, sections, status)
         SELECT $1::varchar, $2::varchar, $3::jsonb, 'draft'
         WHERE NOT EXISTS (SELECT 1 FROM specialty_documentation_templates WHERE specialty = $1::varchar AND name = $2::varchar)`,
        [specialty, name, JSON.stringify(sections)]
      );
    };
    const seedPrescriptionTemplate = async (specialty, { name, patientEducationText, diagramRefs, standardPrecautions }) => {
      await client.query(
        `INSERT INTO specialty_prescription_templates (specialty, name, patient_education_text, diagram_refs, standard_precautions, status)
         SELECT $1::varchar, $2::varchar, $3::text, $4::jsonb, $5::jsonb, 'draft'
         WHERE NOT EXISTS (SELECT 1 FROM specialty_prescription_templates WHERE specialty = $1::varchar AND name = $2::varchar)`,
        [specialty, name, patientEducationText, JSON.stringify(diagramRefs), JSON.stringify(standardPrecautions)]
      );
    };

    // Prescription templates for the two specialties seeded by the earlier migration
    for (const [specialty, tpl] of Object.entries(existingSpecialtyPrescriptions)) {
      await seedPrescriptionTemplate(specialty, tpl);
    }

    // Full roster
    for (const [specialty, def] of Object.entries(specialties)) {
      for (const os of def.orderSets || []) await seedOrderSet(specialty, os);
      for (const rule of def.cdsRules || []) await seedCdsRule(specialty, rule);
      for (const tpl of def.docTemplates || []) await seedDocTemplate(specialty, tpl);
      for (const tpl of def.prescriptionTemplates || []) await seedPrescriptionTemplate(specialty, tpl);
    }

    await client.query('COMMIT');
    console.log(`✅ specialty-prescriptions-expansion migration complete — ${Object.keys(specialties).length + 2} specialties covered`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ specialty-prescriptions-expansion migration failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}
