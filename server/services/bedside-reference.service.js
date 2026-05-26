/**
 * Bedside Clinical Reference Service
 *
 * Provides unified access to:
 *   1. Drug formulary (CIMS) — search, dosing, renal adjustment, pregnancy category
 *   2. Clinical knowledge search (vector store) — differential diagnosis, guidelines, procedures
 *   3. Procedure checklists — common procedures with safety steps
 *   4. Renal dose adjustments — by CKD stage (BNF / KDIGO-aligned)
 */

import cimsService from './cims.service.js';
import pdfKnowledgeService from './pdfKnowledge.service.js';

// ── Renal dose adjustment table ───────────────────────────────────────────────
// eGFR cut-offs from BNF (British National Formulary) / Renal Drug Handbook (UK).
// Maps drug class / generic name → CKD stage adjustments.
const RENAL_ADJUSTMENTS = {
  metformin:         { g1: 'Normal', g2: 'Normal', g3a: 'Reduce dose, monitor', g3b: 'Avoid (lactic acidosis risk)', g4: 'Contraindicated', g5: 'Contraindicated', ref: 'BNF / MHRA guidance' },
  metformin_1000:    { g1: 'Normal', g2: 'Normal', g3a: 'Reduce dose, monitor', g3b: 'Avoid (lactic acidosis risk)', g4: 'Contraindicated', g5: 'Contraindicated', ref: 'BNF / MHRA guidance' },
  acei:              { g1: 'Normal', g2: 'Normal — renoprotective', g3a: 'Normal — monitor K⁺, Cr', g3b: 'Reduce dose — monitor K⁺, Cr', g4: 'Reduce dose significantly', g5: 'Use with caution / specialist', ref: 'BNF / NICE NG28' },
  ramipril:          { g1: 'Normal', g2: 'Normal', g3a: 'Normal — monitor', g3b: 'Reduce dose', g4: 'Reduce dose significantly', g5: 'Specialist supervision', ref: 'BNF / NICE NG28' },
  lisinopril:        { g1: 'Normal', g2: 'Normal', g3a: 'Normal — monitor', g3b: 'Reduce dose', g4: 'Reduce dose significantly', g5: 'Specialist supervision', ref: 'BNF / NICE NG28' },
  gentamicin:        { g1: 'Normal', g2: 'Extend dosing interval', g3a: 'Extend interval — monitor levels', g3b: 'Use with caution — monitor levels closely', g4: 'Avoid if possible', g5: 'Avoid / specialist', ref: 'BNF — Aminoglycoside TDM guideline' },
  vancomycin:        { g1: 'Normal', g2: 'Reduce dose / extend interval', g3a: 'Reduce dose — monitor AUC', g3b: 'Reduce dose significantly', g4: 'Monitor AUC/MIC — specialist', g5: 'Specialist / haemodialysis dosing', ref: 'ASHP/SIDP Vancomycin Guideline 2020' },
  digoxin:           { g1: 'Normal', g2: 'Reduce dose', g3a: 'Reduce dose — monitor levels', g3b: 'Reduce dose significantly', g4: 'Avoid or use with extreme caution', g5: 'Avoid', ref: 'BNF' },
  gabapentin:        { g1: 'Normal', g2: 'Normal — monitor', g3a: 'Reduce dose to 600-1800 mg/day', g3b: 'Reduce dose to 300-900 mg/day', g4: 'Reduce dose to 150-600 mg/day', g5: '150-300 mg/day (supplement after HD)', ref: 'BNF / Renal Drug Handbook' },
  pregabalin:        { g1: 'Normal', g2: 'Normal', g3a: 'Reduce to max 300 mg/day', g3b: 'Reduce to max 150 mg/day', g4: 'Reduce to max 75 mg/day', g5: '25-75 mg/day (supplement after HD)', ref: 'BNF / Renal Drug Handbook' },
  nsaid:             { g1: 'Use with caution', g2: 'Use with caution', g3a: 'Avoid if possible — can worsen AKI', g3b: 'Avoid', g4: 'Contraindicated', g5: 'Contraindicated', ref: 'NICE NG35 / BNF' },
  ibuprofen:         { g1: 'Use with caution', g2: 'Use with caution', g3a: 'Avoid if possible', g3b: 'Avoid', g4: 'Contraindicated', g5: 'Contraindicated', ref: 'BNF / NICE' },
  naproxen:          { g1: 'Use with caution', g2: 'Use with caution', g3a: 'Avoid', g3b: 'Avoid', g4: 'Contraindicated', g5: 'Contraindicated', ref: 'BNF' },
  furosemide:        { g1: 'Normal', g2: 'Normal', g3a: 'May need higher doses for efficacy', g3b: 'Higher doses required', g4: 'High-dose loop diuretic / specialist', g5: 'Limited efficacy (dialysis preferred for fluid overload)', ref: 'BNF' },
  spironolactone:    { g1: 'Normal', g2: 'Normal — monitor K⁺', g3a: 'Monitor K⁺ closely', g3b: 'Avoid or reduce dose — hyperK⁺ risk', g4: 'Avoid', g5: 'Avoid', ref: 'BNF / NICE NG35' },
  warfarin:          { g1: 'Normal — INR monitoring', g2: 'Normal — more frequent INR', g3a: 'Increased bleeding risk — frequent INR', g3b: 'Increased bleeding risk — frequent INR', g4: 'Consider DOAC alternatives', g5: 'Specialist — DOAC/warfarin risk-benefit', ref: 'BCSH/NICE NG196' },
  apixaban:          { g1: 'Normal', g2: 'Normal', g3a: 'Normal', g3b: 'Reduce dose (AF: 2.5 mg bd if ≥2 of: age≥80, Cr≥133, weight≤60 kg)', g4: 'Use with caution — limited data', g5: 'Not recommended', ref: 'ESC AF Guideline 2020 / SPC' },
  rivaroxaban:       { g1: 'Normal', g2: 'Normal', g3a: 'Normal (15 mg bd AF if CrCl 15-49 for some indications)', g3b: 'CrCl-based dosing — specialist', g4: 'Avoid if CrCl <15 mL/min', g5: 'Contraindicated', ref: 'ESC AF Guideline 2020 / BNF' },
  allopurinol:       { g1: 'Normal', g2: 'Normal', g3a: 'Max 100-200 mg/day', g3b: 'Max 100 mg/day or less', g4: 'Max 50-100 mg/day', g5: '100 mg 3× per week (HD days)', ref: 'BNF / BSR Gout Guideline' },
  colchicine:        { g1: 'Normal', g2: 'Normal', g3a: 'Reduce dose — toxicity risk', g3b: 'Use with caution — halve dose', g4: 'Use with extreme caution', g5: 'Avoid', ref: 'BNF / ACR Gout Guideline' },
};

// ── Procedure checklists ─────────────────────────────────────────────────────
const PROCEDURE_CHECKLISTS = {
  central_venous_catheter: {
    name: 'Central Venous Catheter (CVC) Insertion',
    guideline: 'NICE NG25 / CDC CLABSI Prevention Bundle',
    steps: [
      { phase: 'Pre-procedure', items: ['Verify indication and consent', 'Check INR <1.5, platelets >50', 'Choose site (subclavian preferred for CLABSI risk)', 'Confirm ultrasound guidance available', 'Maximal barrier precautions: sterile gown, gloves, mask, cap, large drape'] },
      { phase: 'Procedure', items: ['Chlorhexidine 2% skin prep — allow to dry', 'Ultrasound guidance for vascular access', 'Seldinger technique — confirm guidewire position', 'Dilator then catheter insertion', 'Aspirate blood from all lumens', 'Secure catheter — suture or adhesive device'] },
      { phase: 'Post-procedure', items: ['CXR to confirm tip position (cavo-atrial junction)', 'Check for pneumothorax (subclavian/IJV)', 'Document tip position before use', 'Daily review for continued necessity (NICE NG25)', 'Chlorhexidine-impregnated dressing'] },
    ],
  },
  lumbar_puncture: {
    name: 'Lumbar Puncture (LP)',
    guideline: 'BNF / NICE / Royal College of Physicians guidance',
    steps: [
      { phase: 'Pre-procedure', items: ['Exclude raised ICP: papilloedema, focal neurology, GCS <14, immune compromise → CT head first', 'Check INR <1.4, platelets >80, no anticoagulation within 12h (LMWH) or 24h (therapeutic)', 'Consent — headache (10-40%), back pain, infection risk'] },
      { phase: 'Procedure', items: ['Patient: lateral decubitus or sitting — flexion maximises interspinous space', 'L3-L4 or L4-L5 interspace (below conus at L1/L2)', 'Sterile field — chlorhexidine prep', 'Spinal needle — atraumatic (pencil-point) preferred to reduce PDPH', 'Measure opening pressure with manometer (normal <20 cmCSF)', 'Collect 4 bottles: MC&S (×2), biochemistry (protein/glucose), cytology'] },
      { phase: 'Post-procedure', items: ['Send CSF urgently if meningitis suspected', 'Compare CSF glucose with simultaneous plasma glucose', 'Bed rest does not prevent PDPH — encourage hydration', 'Monitor for signs of herniation (Babinski, posturing, GCS drop)'] },
    ],
  },
  intubation: {
    name: 'Rapid Sequence Intubation (RSI)',
    guideline: 'Difficult Airway Society (DAS) 2015 / FICM Guidelines',
    steps: [
      { phase: 'Pre-oxygenation', items: ['High-flow O₂ ×3 min or 8 vital capacity breaths', 'Position: 20° head-up (ramped if obese)', 'Equipment check: laryngoscope, tube sizes (7.0/7.5/8.0), suction, BVM, CO₂ monitor, rescue airway (LMA)', 'Drugs drawn: induction + paralytic', 'IV access — large bore', 'Call for help if predicted difficult airway (LEMON assessment)'] },
      { phase: 'Induction', items: ['Fentanyl 1-2 µg/kg IV if haemodynamically stable (attenuates laryngoscopy response)', 'Ketamine 1-2 mg/kg IV (haemodynamically unstable) OR propofol 1-2 mg/kg', 'Suxamethonium 1.5 mg/kg IV (RSI) OR rocuronium 1.2 mg/kg IV (if sux contraindicated)', 'Cricoid pressure until tube confirmed (controversial — remove if obstructing)'] },
      { phase: 'Intubation & Confirmation', items: ['Direct/video laryngoscopy — C-MAC / McGrath preferred', 'BURP manoeuvre if poor grade view', 'Cuff inflation + ventilation', 'Waveform capnography confirmation (gold standard)', 'CXR to confirm tip position (2-4 cm above carina)', 'Document Cormack-Lehane grade', 'Initiate lung-protective ventilation: TV 6-8 mL/kg IBW, PEEP 5-8 cmH₂O'] },
    ],
  },
  arterial_line: {
    name: 'Arterial Line Insertion (Radial)',
    guideline: 'FICM / AAGBI Guidelines',
    steps: [
      { phase: 'Pre-procedure', items: ['Modified Allen test — confirm ulnar collateral flow', 'Explain procedure and obtain consent', 'Equipment: 20G or 22G arterial cannula, transducer set, heparinised flush'] },
      { phase: 'Procedure', items: ['Wrist extended 30-60° over roll', 'Ultrasound guidance improves first-pass success', 'Sterile technique — chlorhexidine prep', 'Seldinger (guidewire) or direct cannulation', 'Secure with suture or adhesive'] },
      { phase: 'Post-procedure', items: ['Level transducer at phlebostatic axis (mid-axilla)', 'Calibrate to atmosphere (zero)', 'Confirm waveform morphology and damping', 'Inspect distal limb hourly — ischaemia, infection', 'Remove at earliest opportunity'] },
    ],
  },
  chest_drain: {
    name: 'Intercostal Chest Drain Insertion',
    guideline: 'BTS Pleural Disease Guidelines 2010 / NICE NG195',
    steps: [
      { phase: 'Pre-procedure', items: ['Confirm indication: large pneumothorax / pleural effusion / haemothorax / empyema', 'Imaging: CXR / ultrasound marking (BTS: USS-guided for fluid)', 'INR <1.5, platelets >50 (avoid if coagulopathic without correction)', 'Consent — pain, bleeding, infection, malposition, re-expansion pulmonary oedema'] },
      { phase: 'Procedure', items: ['Triangle of safety: anterior axillary line — 4th/5th ICS — lateral pectoral border', 'USS marking of effusion / pneumothorax confirmed entry', 'Infiltrate 1% lidocaine — skin to pleura (over superior rib border)', 'Seldinger or blunt dissection technique', 'Drain directed posteriorly/basally for effusion, anteriorly/apically for pneumothorax', 'Secure with silk suture and occlusive dressing', 'Connect to underwater seal drain'] },
      { phase: 'Post-procedure', items: ['CXR to confirm position and lung re-expansion', 'Monitor drainage — if >1.5 L immediately, clamp and release slowly (risk re-expansion OE)', 'Mark fluid level and monitor hourly initially', 'Removal when bubbling stops AND drainage <200 mL/24h'] },
    ],
  },
};

// ── Drug formulary search ─────────────────────────────────────────────────────

/**
 * Search drug formulary via CIMS.
 * Returns brand, generic, class, usual dose, pregnancy category, renal notes.
 */
export async function searchDrug(query, limit = 10) {
  const results = await cimsService.searchMedicines(query, limit);
  return results.map(m => ({
    id: m.cimsId,
    brand: m.brand,
    generic: m.generic,
    composition: m.composition,
    category: m.category,
    strength: m.dosage,
    renalAdjustment: getRenalAdjustment(m.generic),
    pregnancyCategory: getPregnancyCategory(m.generic),
  }));
}

/**
 * Get a drug by ID from CIMS.
 */
export async function getDrugById(id) {
  const med = await cimsService.getMedicineById(id);
  if (!med) return null;
  return {
    ...med,
    renalAdjustment: getRenalAdjustment(med.generic),
    pregnancyCategory: getPregnancyCategory(med.generic),
  };
}

/**
 * Lookup renal dose adjustment for a drug generic name.
 * Fuzzy-matches against the RENAL_ADJUSTMENTS table.
 */
export function getRenalAdjustment(genericName) {
  if (!genericName) return null;
  const key = genericName.toLowerCase().replace(/\s+/g, '_');
  if (RENAL_ADJUSTMENTS[key]) return RENAL_ADJUSTMENTS[key];
  // Partial match — e.g. "ramipril 5mg" → "ramipril"
  const match = Object.keys(RENAL_ADJUSTMENTS).find(k => key.includes(k) || k.includes(key.split('_')[0]));
  return match ? RENAL_ADJUSTMENTS[match] : null;
}

// Simplified FDA pregnancy category mapping (common drugs — not exhaustive)
const PREGNANCY_CATEGORIES = {
  aspirin: { category: 'C (D at ≥30 weeks)', note: 'Low-dose safe in T1/T2; avoid high-dose in T3 (premature ductus closure)', ref: 'ACOG / BNF' },
  ibuprofen: { category: 'C (D ≥30 weeks)', note: 'Avoid after 20 weeks (oligohydramnios risk); contraindicated in T3', ref: 'FDA / MHRA 2020' },
  naproxen: { category: 'C (D ≥30 weeks)', note: 'Avoid after 20 weeks', ref: 'FDA / MHRA 2020' },
  metformin: { category: 'B', note: 'Generally safe — preferred oral agent in gestational DM', ref: 'NICE NG3 / ACOG' },
  warfarin: { category: 'X (T1, T3) / D (T2)', note: 'Fetotoxic T1 (embryopathy), T3 (haemorrhage). Use LMWH in pregnancy.', ref: 'RCOG / ACOG' },
  heparin: { category: 'B (UFH)', note: 'Preferred anticoagulant in pregnancy — does not cross placenta', ref: 'RCOG Green-top 37' },
  enoxaparin: { category: 'B', note: 'LMWH — preferred over UFH for DVT/PE prophylaxis and treatment in pregnancy', ref: 'RCOG Green-top 37' },
  lisinopril: { category: 'D (T2/T3)', note: 'ACE inhibitors contraindicated in T2/T3 — renal dysgenesis, skull defects', ref: 'BNF / MHRA' },
  ramipril: { category: 'D (T2/T3)', note: 'ACE inhibitors contraindicated in T2/T3', ref: 'BNF / MHRA' },
  atorvastatin: { category: 'X', note: 'Statins contraindicated in pregnancy', ref: 'FDA / MHRA' },
  simvastatin: { category: 'X', note: 'Statins contraindicated in pregnancy', ref: 'FDA / MHRA' },
  methotrexate: { category: 'X', note: 'Teratogenic and abortifacient — strict contraception required', ref: 'BNF / RCOG' },
  phenytoin: { category: 'D', note: 'Fetal hydantoin syndrome — neonatal folate supplementation needed', ref: 'NICE CG137' },
  carbamazepine: { category: 'D', note: 'Neural tube defects, folate supplementation; monitor serum levels', ref: 'NICE CG137' },
  valproate: { category: 'X', note: 'High teratogenicity — spina bifida, ASD, NTD. Avoid in women of childbearing potential (MHRA 2018).', ref: 'MHRA 2018 safety alert / RCOG' },
  amoxicillin: { category: 'B', note: 'Safe in all trimesters', ref: 'BNF' },
  clarithromycin: { category: 'C', note: 'Avoid in T1 (animal studies show teratogenicity); use with caution T2/T3', ref: 'BNF / MHRA' },
  azithromycin: { category: 'B', note: 'Generally safe — preferred macrolide in pregnancy if needed', ref: 'BNF' },
  gentamicin: { category: 'D', note: 'VIII nerve toxicity in fetus — avoid unless no alternative; monitor levels', ref: 'BNF' },
  fluconazole: { category: 'D (high dose)', note: 'Single 150 mg dose probably safe; prolonged high-dose teratogenic', ref: 'MHRA / BNF' },
  omeprazole: { category: 'C', note: 'No proven harm; use only if clinically needed', ref: 'BNF' },
  ondansetron: { category: 'B', note: 'No clear teratogenicity; cleft palate signal in early data (FDA 2019) — use if severe N&V', ref: 'FDA 2019 / BNF' },
  dexamethasone: { category: 'C', note: 'For fetal lung maturation 24-34 weeks (NICE); systemic maternal use — risk/benefit', ref: 'NICE / RCOG' },
  methyldopa: { category: 'B', note: 'Safe and well-established in pregnancy hypertension', ref: 'NICE NG133 / BNF' },
  labetalol: { category: 'C', note: 'Widely used for hypertension in pregnancy — monitor fetal growth', ref: 'NICE NG133 / BNF' },
  nifedipine: { category: 'C', note: 'Used for hypertension and tocolysis in pregnancy', ref: 'NICE NG133' },
};

export function getPregnancyCategory(genericName) {
  if (!genericName) return null;
  const key = genericName.toLowerCase().split(' ')[0];
  return PREGNANCY_CATEGORIES[key] || null;
}

// ── Clinical knowledge search ─────────────────────────────────────────────────

/**
 * Semantic search in the vector knowledge base (Gale Encyclopedia + ingested guidelines).
 * Falls back gracefully if pgvector is not available.
 */
export async function searchKnowledge(query, limit = 5) {
  try {
    const results = await pdfKnowledgeService.search(query, { limit, minSimilarity: 0.3 });
    return results.map(r => ({
      title: r.document_name || 'Clinical Reference',
      content: r.content,
      similarity: r.similarity,
      source: r.document_name,
    }));
  } catch (err) {
    return [{ title: 'Knowledge base unavailable', content: err.message, similarity: 0, source: null }];
  }
}

// ── Procedure checklists ──────────────────────────────────────────────────────

export function listProcedures() {
  return Object.entries(PROCEDURE_CHECKLISTS).map(([id, p]) => ({ id, name: p.name, guideline: p.guideline }));
}

export function getProcedure(id) {
  return PROCEDURE_CHECKLISTS[id] || null;
}

// ── Renal adjustment table export ─────────────────────────────────────────────

export function listRenalAdjustments() {
  return Object.entries(RENAL_ADJUSTMENTS).map(([drug, adj]) => ({ drug, ...adj }));
}
