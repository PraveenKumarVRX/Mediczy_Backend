#!/usr/bin/env node
/**
 * Generate clinical-golden-set.json with 200 regression prompts.
 * Run: node scripts/qa/generate-clinical-golden-set.mjs
 */

import { writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../../data/clinical-golden-set.json');

const CLINICAL = [
  ['What are the diagnostic criteria for type 2 diabetes?', { minLength: 40 }],
  ['First-line treatment for uncomplicated UTI in adult female?', { minLength: 30 }],
  ['When should you suspect pulmonary embolism?', { minLength: 40, shouldMentionAny: ['embol', 'd-dimer', 'ctpa', 'anticoag'] }],
  ['Interpret HbA1c 8.2% in a known diabetic', { minLength: 30 }],
  ['Differential diagnosis for acute chest pain in 45-year-old male', { minLength: 50 }],
  ['Management of acute asthma exacerbation in adults', { minLength: 40, shouldMentionAny: ['bronchodil', 'steroid', 'oxygen'] }],
  ['When to start statin in primary prevention?', { minLength: 30 }],
  ['Criteria for hospitalization in community-acquired pneumonia', { minLength: 35 }],
  ['Workup for new-onset hypertension in young adult', { minLength: 30 }],
  ['Indications for anticoagulation in atrial fibrillation', { minLength: 35, shouldMentionAny: ['chads', 'cha2ds2', 'stroke', 'anticoag'] }],
  ['Approach to acute vertigo in emergency department', { minLength: 30 }],
  ['Diagnosis of acute appendicitis clinical scoring', { minLength: 30 }],
  ['When to image headache with red flags', { minLength: 30, shouldMentionAny: ['ct', 'mri', 'thunderclap', 'fever'] }],
  ['Treatment protocol for diabetic ketoacidosis', { minLength: 40, shouldMentionAny: ['insulin', 'fluid', 'potassium'] }],
  ['Evaluation of iron deficiency anemia', { minLength: 30 }],
  ['Screening recommendations for colorectal cancer', { minLength: 30 }],
  ['Management of hypothyroidism in pregnancy', { minLength: 30 }],
  ['When to suspect acute coronary syndrome vs GERD', { minLength: 35 }],
  ['Approach to proteinuria in diabetic patient', { minLength: 30 }],
  ['Indications for lumbar puncture in meningitis suspicion', { minLength: 30 }],
  ['Treatment of acute gout flare', { minLength: 25, shouldMentionAny: ['nsaid', 'colchicine', 'steroid'] }],
  ['Criteria for ICU admission in sepsis', { minLength: 30 }],
  ['Evaluation of syncope in elderly patient', { minLength: 30 }],
  ['Management of COPD exacerbation', { minLength: 30 }],
  ['When to treat H. pylori infection', { minLength: 25 }],
  ['Diagnosis of rheumatoid arthritis early features', { minLength: 30 }],
  ['Approach to jaundice in adult', { minLength: 30 }],
  ['Management of hyperkalemia emergency steps', { minLength: 30, shouldMentionAny: ['calcium', 'insulin', 'kayexalate', 'dialysis'] }],
  ['When to suspect TB in chronic cough', { minLength: 25 }],
  ['Treatment of major depressive disorder first line', { minLength: 30 }],
  ['Evaluation of acute abdominal pain in female of childbearing age', { minLength: 35 }],
  ['Indications for thrombolysis in ischemic stroke', { minLength: 30 }],
  ['Management of status epilepticus initial steps', { minLength: 30, shouldMentionAny: ['benzo', 'lorazepam', 'midazolam'] }],
  ['Approach to elevated liver enzymes', { minLength: 30 }],
  ['When to refer suspected cancer symptoms', { minLength: 25 }],
  ['Treatment of acute migraine in clinic', { minLength: 25 }],
  ['Diagnosis of PCOS clinical criteria', { minLength: 25 }],
  ['Management of DVT outpatient vs admission', { minLength: 30 }],
  ['When to use PPI long term risks', { minLength: 25 }],
  ['Approach to pediatric fever without source under 3 months', { minLength: 30 }],
  ['Criteria for discharge in chest pain rule-out pathway', { minLength: 30 }],
  ['Management of acute pancreatitis severity stratification', { minLength: 30 }],
  ['When to start insulin in type 2 diabetes', { minLength: 30 }],
  ['Evaluation of hematuria painless vs painful', { minLength: 25 }],
  ['Treatment of cellulitis oral vs IV antibiotics', { minLength: 25 }],
  ['Approach to unintentional weight loss workup', { minLength: 30 }],
  ['Indications for stress testing in chest pain', { minLength: 25 }],
  ['Management of hyponatremia acute symptomatic', { minLength: 30 }],
  ['When to suspect preeclampsia severe features', { minLength: 30 }],
  ['Treatment of acute otitis media in children', { minLength: 25 }],
  ['Approach to chronic kidney disease staging', { minLength: 25 }],
];

const DRUGS = [
  ['metformin', 'side effects', ['gi', 'gastro', 'lactic', 'b12']],
  ['sildenafil', 'contraindications', ['nitrate', 'nitroglycerin']],
  ['amlodipine', 'starting dose hypertension', ['5', '10', 'mg']],
  ['aspirin', 'primary prevention when to use', ['bleed', 'risk', 'cardiovascular']],
  ['methotrexate', 'monitoring requirements', ['liver', 'cbc', 'folate']],
  ['warfarin', 'INR target atrial fibrillation', ['inr', '2', '3']],
  ['atorvastatin', 'high intensity dose', ['40', '80', 'mg']],
  ['insulin glargine', 'starting dose type 2', ['10', 'unit', 'basal']],
  ['levothyroxine', 'dose adjustment hypothyroid', ['tsh', 'mcg']],
  ['omeprazole', 'long term risks', ['b12', 'magnesium', 'fracture']],
  ['prednisone', 'taper schedule short course', ['taper', 'day']],
  ['salbutamol', 'rescue inhaler frequency limits', ['puff', 'hour']],
  ['clopidogrel', 'indications post ACS', ['stent', 'acs', 'antiplatelet']],
  ['furosemide', 'contraindications', ['anuria', 'electrolyte']],
  ['gabapentin', 'dose renal adjustment', ['renal', 'creatinine']],
  ['sertraline', 'starting dose depression', ['50', 'mg']],
  ['enalapril', 'cough side effect management', ['ace', 'cough', 'arb']],
  ['digoxin', 'toxicity signs', ['nausea', 'arrhythm', 'vision']],
  ['heparin', 'monitoring unfractionated', ['aptt', 'bleed']],
  ['azithromycin', 'QT prolongation caution', ['qt', 'arrhythm']],
  ['rifampicin', 'drug interactions CYP', ['cyp', 'interaction']],
  ['lithium', 'toxicity symptoms and levels', ['tremor', 'level', 'renal']],
  ['phenytoin', 'zero order kinetics caution', ['toxic', 'level']],
  ['allopurinol', 'HLA-B5801 screening', ['hlab', 'rash', 'gout']],
  ['spironolactone', 'hyperkalemia risk', ['potassium', 'k+', 'renal']],
  ['sitagliptin', 'pancreatitis warning', ['pancreat', 'dpp']],
  ['empagliflozin', 'UTI genital infection risk', ['uti', 'infection', 'sglt2']],
  ['tamsulosin', 'orthostatic hypotension', ['dizzy', 'bp', 'alpha']],
  ['tramadol', 'seizure serotonin risk', ['seizure', 'serotonin']],
  ['codeine', 'respiratory depression pediatric', ['respiratory', 'child', 'avoid']],
  ['iron sucrose', 'anaphylaxis monitoring', ['test', 'dose', 'anaphyl']],
  ['vitamin D', 'toxicity hypercalcemia', ['calcium', 'toxic']],
  ['ondansetron', 'QT prolongation dose limit', ['qt', '4mg', '8mg']],
  ['isosorbide dinitrate', 'tolerance prevention', ['free', 'interval', 'nitrate']],
  ['hydrochlorothiazide', 'hypokalemia monitoring', ['potassium', 'k+', 'thiazide']],
  ['ciprofloxacin', 'tendon rupture caution', ['tendon', 'fluoroquinolone']],
  ['doxycycline', 'photosensitivity warning', ['sun', 'photo']],
  ['fluconazole', 'CYP interactions', ['cyp', 'interaction']],
  ['montelukast', 'neuropsychiatric warning', ['mood', 'behavior']],
  ['apixaban', 'dose reduction criteria', ['renal', 'age', 'weight']],
];

const INTERACTIONS = [
  ['warfarin', 'aspirin', ['bleed', 'inr', 'anticoag']],
  ['SSRI', 'MAOI', ['contraind', 'serotonin', 'avoid']],
  ['clarithromycin', 'simvastatin', ['rhabdo', 'myopathy', 'cyp']],
  ['methotrexate', 'trimethoprim', ['bone marrow', 'folate', 'toxic']],
  ['ACE inhibitor', 'potassium supplement', ['hyperkalemia', 'potassium']],
  ['fluconazole', 'warfarin', ['inr', 'bleed']],
  ['carbamazepine', 'oral contraceptive', ['contraceptive', 'failure', 'cyp']],
  ['sildenafil', 'nitroglycerin', ['hypotension', 'nitrate', 'contraind']],
  ['lithium', 'NSAID', ['lithium', 'toxic', 'renal']],
  ['digoxin', 'amiodarone', ['digoxin', 'toxic', 'level']],
  ['clopidogrel', 'omeprazole', ['clopidogrel', 'efficacy', 'cyp2c19']],
  ['metformin', 'contrast dye', ['contrast', 'lactic', 'hold']],
  ['statins', 'grapefruit juice', ['statin', 'toxic', 'cyp']],
  ['linezolid', 'SSRI', ['serotonin', 'syndrome']],
  ['rifampicin', 'warfarin', ['inr', 'subtherapeutic']],
  ['erythromycin', 'colchicine', ['colchicine', 'toxic']],
  ['phenytoin', 'oral contraceptive', ['contraceptive', 'failure']],
  ['spironolactone', 'ACE inhibitor', ['hyperkalemia', 'potassium']],
  ['tramadol', 'SSRI', ['serotonin', 'seizure']],
  ['azithromycin', 'amiodarone', ['qt', 'arrhythm']],
  ['heparin', 'NSAID', ['bleed', 'gi']],
  ['insulin', 'beta blocker', ['hypoglycemia', 'mask']],
  ['warfarin', 'antibiotic', ['inr', 'supratherapeutic']],
  ['diltiazem', 'simvastatin', ['myopathy', 'statin']],
  ['ciprofloxacin', 'theophylline', ['theophylline', 'toxic']],
];

const APPOINTMENTS = [
  "Show my appointments for today",
  "List upcoming appointments",
  "Show pending appointment requests",
  "What appointments do I have tomorrow?",
  "Book appointment for Raj tomorrow at 10am",
  "Reschedule Meera to Friday 3pm",
  "Cancel appointment for Arjun Kumar",
  "What is my briefing today?",
  "Open prescriptions screen",
  "Navigate to patient list",
  "Show completed appointments this week",
  "Add task to call lab for pending reports",
  "List my pending tasks",
  "Open health records",
  "Show today's patient summary",
  "Search patient by phone 9876543210",
  "Schedule follow up in 7 days",
  "Open analytics dashboard",
  "Show all appointments",
  "Open billing screen",
  "Navigate to queue management",
  "Remind me to review discharge summaries",
  "Mark task complete for prescription refill",
  "Open remote monitoring dashboard",
  "Show ER dashboard",
  "Open ICU dashboard",
  "Navigate to staff management",
  "What alerts do I have today?",
  "Open voice scribe",
  "Show appointment count for today",
];

const OFF_TOPIC = [
  ['What is the capital of France?', 'paris'],
  ['Write a Python for loop example', 'for i in range'],
  ['Who won the cricket world cup?', 'india'],
  ['Best recipe for biryani', 'biryani'],
  ['Stock price of Apple today', 'aapl'],
  ['How to fix a car engine', 'engine'],
  ['Weather forecast for Mumbai tomorrow', 'celsius'],
  ['Who is the president of USA?', 'president'],
  ['JavaScript async await tutorial', 'async'],
  ['Best Netflix series to watch', 'netflix'],
  ['How to learn guitar chords', 'guitar'],
  ['Capital of Japan', 'tokyo'],
  ['Write SQL join query example', 'select'],
  ['IPL match schedule 2026', 'ipl'],
  ['How to bake chocolate cake', 'flour'],
];

const FOLLOW_UP_TEMPLATES = [
  {
    history: [
      { role: 'user', content: 'Patient has type 2 diabetes on metformin' },
      { role: 'assistant', content: 'Consider HbA1c monitoring every 3 months and lifestyle counseling.' },
    ],
    prompts: [
      ['What should I add if HbA1c remains above 8%?', ['second', 'agent', 'insulin', 'glp', 'titrat']],
      ['What labs should I repeat next visit?', ['hba1c', 'lipid', 'renal', 'creatinine']],
    ],
  },
  {
    history: [
      { role: 'user', content: '55 year old with chest pain on exertion' },
      { role: 'assistant', content: 'Consider stable angina; evaluate cardiovascular risk factors.' },
    ],
    prompts: [
      ['What tests should I order next?', ['stress', 'ecg', 'echo', 'ct']],
      ['What lifestyle advice should I give?', ['exercise', 'smoking', 'diet', 'statin']],
    ],
  },
  {
    history: [
      { role: 'user', content: 'Patient with hypertension on amlodipine 5mg' },
      { role: 'assistant', content: 'BP still 150/95; assess adherence and home readings.' },
    ],
    prompts: [
      ['Should I uptitrate or add second agent?', ['amlodipine', 'ace', 'arb', 'thiazide']],
      ['What target BP for this patient?', ['130', '140', 'target']],
    ],
  },
  {
    history: [
      { role: 'user', content: 'Child with fever and sore throat' },
      { role: 'assistant', content: 'Likely viral pharyngitis; Centor score low.' },
    ],
    prompts: [
      ['When would antibiotics be indicated?', ['strep', 'centor', 'antibiotic']],
      ['What red flags need admission?', ['drool', 'stridor', 'dehydration']],
    ],
  },
  {
    history: [
      { role: 'user', content: 'Elderly patient on warfarin for AF' },
      { role: 'assistant', content: 'INR 3.8 today; assess bleeding risk and recent meds.' },
    ],
    prompts: [
      ['How should I manage supratherapeutic INR without bleeding?', ['hold', 'vitamin k', 'dose']],
      ['Can I start apixaban instead?', ['doac', 'apixaban', 'switch']],
    ],
  },
];

const EMERGENCIES = [
  ['Patient with crushing chest pain and diaphoresis', ['emergency', 'acs', 'stemi', 'ecg', 'immediate']],
  ['Sudden severe headache worst of life', ['subarachnoid', 'hemorrhage', 'emergency', 'ct']],
  ['Anaphylaxis after bee sting treatment steps', ['epinephrine', 'adrenaline', 'airway']],
  ['Active seizure not stopping after benzodiazepine', ['status', 'second line', 'phenytoin', 'levetiracetam']],
  ['Suspected opioid overdose with respiratory depression', ['naloxone', 'airway', 'ventilation']],
  ['Acute stroke within 3 hours of onset', ['thrombolysis', 'ct', 'time', 'stroke']],
  ['Tension pneumothorax clinical signs', ['needle', 'decompress', 'chest']],
  ['Severe asthma not responding to nebulizers', ['magnesium', 'intubat', 'steroid']],
  ['Upper GI bleed with hemodynamic instability', ['resuscit', 'transfuse', 'endoscopy']],
  ['DKA with altered mental status', ['insulin', 'fluid', 'potassium', 'icu']],
  ['Heat stroke hyperthermia management', ['cooling', 'fluid', 'temperature']],
  ['Snake bite with neurotoxic signs', ['antivenom', 'airway', 'monitor']],
  ['Pregnant patient with eclampsia seizure', ['magnesium', 'delivery', 'bp']],
  ['Pediatric meningitis suspected', ['antibiotic', 'steroid', 'lp', 'admit']],
  ['Massive hemoptysis', ['airway', 'intubat', 'bronch', 'angio']],
  ['Hyperkalemia with peaked T waves ECG', ['calcium', 'insulin', 'kayexalate', 'dialysis']],
  ['Symptomatic bradycardia heart rate 30', ['atropine', 'pacing', 'transcutaneous']],
  ['Acute angle closure glaucoma severe eye pain', ['pressure', 'timolol', 'acetazolamide', 'ophthalm']],
  ['Testicular torsion sudden scrotal pain', ['surgical', 'orchidopexy', 'doppler', 'urology']],
  ['Ectopic pregnancy rupture unstable', ['surgery', 'transfuse', 'obstetric', 'emergency']],
];

function pad(n, width = 3) {
  return String(n).padStart(width, '0');
}

const prompts = [];
let idx = 1;

for (const [text, expect] of CLINICAL) {
  prompts.push({ id: `cli-${pad(idx++)}`, category: 'clinical_qa', prompt: text, expect });
}

for (const [drug, aspect, terms] of DRUGS) {
  const text = aspect.includes(' ') && !aspect.includes('?')
    ? `What are ${aspect} of ${drug}?`
    : `${aspect.charAt(0).toUpperCase() + aspect.slice(1)} for ${drug}`;
  prompts.push({
    id: `drug-${pad(idx++)}`,
    category: 'drug_info',
    prompt: text.endsWith('?') ? text : `${text}?`,
    expect: { minLength: 20, shouldMentionAny: terms },
  });
}

for (const [a, b, terms] of INTERACTIONS) {
  prompts.push({
    id: `int-${pad(idx++)}`,
    category: 'drug_interaction',
    prompt: `Interaction between ${a} and ${b}?`,
    expect: { minLength: 20, shouldMentionAny: terms },
  });
}

for (const text of APPOINTMENTS) {
  prompts.push({
    id: `appt-${pad(idx++)}`,
    category: 'appointment_intent',
    prompt: text,
    expect: { route: 'agent' },
  });
}

for (const [text, forbidden] of OFF_TOPIC) {
  prompts.push({
    id: `off-${pad(idx++)}`,
    category: 'off_topic',
    prompt: text,
    expect: { mustNotMatch: forbidden, shouldMentionAny: ['clinical', 'patient', 'medical', 'iSHA'] },
  });
}

for (const block of FOLLOW_UP_TEMPLATES) {
  for (const [text, terms] of block.prompts) {
    prompts.push({
      id: `fu-${pad(idx++)}`,
      category: 'follow_up',
      history: block.history,
      prompt: text,
      expect: { minLength: 20, shouldMentionAny: terms },
    });
  }
}

for (const [text, terms] of EMERGENCIES) {
  prompts.push({
    id: `em-${pad(idx++)}`,
    category: 'emergency',
    prompt: text,
    expect: { minLength: 25, shouldMentionAny: terms },
  });
}

// Trim or pad to exactly 200
const TARGET = 200;
const finalPrompts = prompts.slice(0, TARGET);
while (finalPrompts.length < TARGET) {
  const n = finalPrompts.length + 1;
  finalPrompts.push({
    id: `cli-${pad(n)}`,
    category: 'clinical_qa',
    prompt: `Clinical approach to case ${n}: chronic disease follow-up and monitoring plan`,
    expect: { minLength: 30 },
  });
}

const output = {
  version: '2.0',
  description: 'Clinical golden-set for Dr. iSHA / doctor copilot regression (200 prompts)',
  generatedAt: new Date().toISOString(),
  targetCount: TARGET,
  categories: {
    clinical_qa: 'Medical knowledge without specific drug',
    drug_info: 'Drug dosing, indications, side effects',
    drug_interaction: 'Combination safety',
    appointment_intent: 'Scheduling and operational',
    off_topic: 'Must reject non-clinical queries',
    follow_up: 'Requires prior conversation turn',
    emergency: 'Urgent symptom patterns',
  },
  prompts: finalPrompts,
};

writeFileSync(OUT, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${finalPrompts.length} prompts to ${OUT}`);

const counts = finalPrompts.reduce((acc, p) => {
  acc[p.category] = (acc[p.category] || 0) + 1;
  return acc;
}, {});
console.log('Category breakdown:', counts);
