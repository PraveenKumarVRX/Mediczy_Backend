import React, { useState } from 'react';
import { Calculator, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import api from '@/utils/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CalcResult {
  [key: string]: unknown;
}

type CalcFields = Record<string, { label: string; type: 'number' | 'boolean' | 'select'; options?: string[]; required?: boolean; hint?: string }>;

interface CalcDef {
  id: string;
  name: string;
  category: string;
  guideline: string;
  description: string;
  fields: CalcFields;
}

// ── Calculator definitions ────────────────────────────────────────────────────

const CALCS: CalcDef[] = [
  // Cardiology
  {
    id: 'chadsVasc', name: 'CHA₂DS₂-VASc', category: 'Cardiology',
    guideline: 'ESC 2020 AF Guidelines',
    description: 'Stroke risk score in atrial fibrillation — guides OAC initiation',
    fields: {
      age:              { label: 'Age (years)', type: 'number', required: true },
      female:           { label: 'Female sex', type: 'boolean' },
      chf:              { label: 'Congestive heart failure / LV dysfunction', type: 'boolean' },
      hypertension:     { label: 'Hypertension', type: 'boolean' },
      diabetes:         { label: 'Diabetes mellitus', type: 'boolean' },
      stroke:           { label: 'Previous stroke / TIA / thromboembolism', type: 'boolean' },
      vascularDisease:  { label: 'Vascular disease (prior MI, PAD, aortic plaque)', type: 'boolean' },
    },
  },
  {
    id: 'hasBleed', name: 'HAS-BLED', category: 'Cardiology',
    guideline: 'ESC 2020 AF Guidelines',
    description: 'Bleeding risk in AF patients on anticoagulation',
    fields: {
      age:                        { label: 'Age ≥65 years', type: 'boolean' },
      hypertensionUncontrolled:   { label: 'Uncontrolled hypertension (SBP >160 mmHg)', type: 'boolean' },
      renalDisease:               { label: 'Renal disease (dialysis / Cr >200 µmol/L)', type: 'boolean' },
      liverDisease:               { label: 'Liver disease (cirrhosis / elevated LFTs)', type: 'boolean' },
      strokeHistory:              { label: 'Prior stroke', type: 'boolean' },
      bleedingHistory:            { label: 'Prior bleeding / bleeding predisposition', type: 'boolean' },
      inrLabile:                  { label: 'Labile INR (TTR <60%)', type: 'boolean' },
      drugs:                      { label: 'Antiplatelet / NSAID use', type: 'boolean' },
      alcohol:                    { label: 'Alcohol (≥8 units/week)', type: 'boolean' },
    },
  },
  {
    id: 'heartScore', name: 'HEART Score', category: 'Cardiology',
    guideline: 'ACC/AHA 2021 Chest Pain Guideline',
    description: 'Risk stratification for MACE in chest pain — guides early discharge vs. admission',
    fields: {
      age:         { label: 'Age', type: 'select', options: ['<45 → 0', '45–64 → 1', '≥65 → 2'], hint: 'Scores 0/1/2' },
      history:     { label: 'History', type: 'select', options: ['Slightly suspicious → 0', 'Moderately suspicious → 1', 'Highly suspicious → 2'] },
      ecg:         { label: 'ECG', type: 'select', options: ['Normal → 0', 'Non-specific repolarisation → 1', 'Significant ST deviation → 2'] },
      riskFactors: { label: 'Risk factors', type: 'select', options: ['None / unknown → 0', '1–2 risk factors → 1', '≥3 or known atherosclerosis → 2'] },
      troponin:    { label: 'Troponin', type: 'select', options: ['≤normal limit → 0', '1–3× normal → 1', '>3× normal → 2'] },
    },
  },
  {
    id: 'graceScore', name: 'GRACE Score', category: 'Cardiology',
    guideline: 'ESC NSTE-ACS 2020 / Fox 2006',
    description: 'In-hospital and 6-month mortality in NSTE-ACS',
    fields: {
      age:               { label: 'Age (years)', type: 'number', required: true },
      heartRate:         { label: 'Heart rate (bpm)', type: 'number', required: true },
      sbp:               { label: 'Systolic BP (mmHg)', type: 'number', required: true },
      creatinine:        { label: 'Creatinine (µmol/L)', type: 'number' },
      killipClass:       { label: 'Killip class', type: 'select', options: ['I (no HF)', 'II (crackles)', 'III (pulmonary oedema)', 'IV (cardiogenic shock)'] },
      cardiacArrest:     { label: 'Cardiac arrest at admission', type: 'boolean' },
      stDeviation:       { label: 'ST deviation', type: 'boolean' },
      elevatedMarkers:   { label: 'Elevated cardiac markers', type: 'boolean' },
    },
  },
  // Sepsis / Critical Care
  {
    id: 'qsofa', name: 'qSOFA', category: 'Critical Care',
    guideline: 'ESICM/SCCM Sepsis-3 (JAMA 2016)',
    description: 'Bedside sepsis screening — ≥2/3 criteria → assess for organ dysfunction',
    fields: {
      respiratoryRate:       { label: 'Respiratory rate ≥22/min', type: 'boolean' },
      sbp:                   { label: 'Systolic BP ≤100 mmHg', type: 'number', hint: 'Enter actual SBP value', required: true },
      alteredMentalStatus:   { label: 'Altered mental status (GCS <15)', type: 'boolean' },
    },
  },
  {
    id: 'sofaScore', name: 'SOFA Score', category: 'Critical Care',
    guideline: 'ESICM/SCCM Sepsis-3 (JAMA 2016)',
    description: 'Sequential Organ Failure Assessment — defines organ dysfunction in sepsis',
    fields: {
      pao2FiO2Ratio:         { label: 'PaO₂/FiO₂ ratio (mmHg)', type: 'number' },
      onMechanicalVentilation: { label: 'On mechanical ventilation', type: 'boolean' },
      platelets:             { label: 'Platelets (×10³/µL)', type: 'number' },
      bilirubinUmolL:        { label: 'Bilirubin (µmol/L)', type: 'number' },
      map:                   { label: 'Mean arterial pressure (mmHg)', type: 'number' },
      gcs:                   { label: 'Glasgow Coma Scale total', type: 'number' },
      creatinineUmolL:       { label: 'Creatinine (µmol/L)', type: 'number' },
      urineOutputMlDay:      { label: 'Urine output (mL/day)', type: 'number' },
    },
  },
  // Nephrology
  {
    id: 'kdigoAki', name: 'KDIGO AKI Staging', category: 'Nephrology',
    guideline: 'KDIGO 2012 AKI Guideline',
    description: 'Acute Kidney Injury staging by creatinine rise',
    fields: {
      baselineCr:    { label: 'Baseline creatinine (µmol/L)', type: 'number', required: true },
      currentCr:     { label: 'Current creatinine (µmol/L)', type: 'number', required: true },
      urineOutputMlKgHr: { label: 'Urine output (mL/kg/h)', type: 'number' },
      oliguriaHours: { label: 'Hours of oliguria', type: 'number' },
    },
  },
  {
    id: 'egfrCkdEpi', name: 'CKD-EPI eGFR', category: 'Nephrology',
    guideline: 'NKF/KDIGO 2021 (race-free 2021 equation)',
    description: 'Estimated glomerular filtration rate for CKD staging',
    fields: {
      creatinineUmolL: { label: 'Creatinine (µmol/L)', type: 'number', required: true },
      age:             { label: 'Age (years)', type: 'number', required: true },
      female:          { label: 'Female sex', type: 'boolean' },
    },
  },
  // Pulmonology
  {
    id: 'curb65', name: 'CURB-65', category: 'Pulmonology',
    guideline: 'BTS CAP Guidelines / NICE NG138',
    description: 'Pneumonia severity — guides admission vs. outpatient treatment',
    fields: {
      confusion:       { label: 'Confusion (AMTS ≤8 or new disorientation)', type: 'boolean' },
      urea:            { label: 'Blood urea nitrogen (mmol/L)', type: 'number', required: true, hint: '>7 mmol/L scores 1' },
      respiratoryRate: { label: 'Respiratory rate (breaths/min)', type: 'number', required: true },
      sbp:             { label: 'Systolic BP (mmHg)', type: 'number', required: true },
      dbp:             { label: 'Diastolic BP (mmHg)', type: 'number' },
      age:             { label: 'Age (years)', type: 'number', required: true },
    },
  },
  // Neurology
  {
    id: 'nihss', name: 'NIHSS', category: 'Neurology',
    guideline: 'AHA/ASA 2019 Stroke Guideline',
    description: 'NIH Stroke Scale — stroke severity and IV tPA eligibility guidance',
    fields: {
      consciousness:  { label: '1a. Level of consciousness (0-3)', type: 'number' },
      locQuestions:   { label: '1b. LOC questions (0-2)', type: 'number' },
      locCommands:    { label: '1c. LOC commands (0-2)', type: 'number' },
      gaze:           { label: '2. Best gaze (0-2)', type: 'number' },
      visual:         { label: '3. Visual (0-3)', type: 'number' },
      facialPalsy:    { label: '4. Facial palsy (0-3)', type: 'number' },
      motorArmLeft:   { label: '5a. Motor arm left (0-4)', type: 'number' },
      motorArmRight:  { label: '5b. Motor arm right (0-4)', type: 'number' },
      motorLegLeft:   { label: '6a. Motor leg left (0-4)', type: 'number' },
      motorLegRight:  { label: '6b. Motor leg right (0-4)', type: 'number' },
      limbAtaxia:     { label: '7. Limb ataxia (0-2)', type: 'number' },
      sensory:        { label: '8. Sensory (0-2)', type: 'number' },
      language:       { label: '9. Best language (0-3)', type: 'number' },
      dysarthria:     { label: '10. Dysarthria (0-2)', type: 'number' },
      extinction:     { label: '11. Extinction / inattention (0-2)', type: 'number' },
    },
  },
  // Emergency
  {
    id: 'wellsDvt', name: 'Wells DVT', category: 'Emergency',
    guideline: 'ACCP 2016 VTE Guideline / NICE NG158',
    description: 'Pre-test probability of DVT — guides D-dimer vs. ultrasound ordering',
    fields: {
      activeCancer:                    { label: 'Active cancer (treatment within 6 months)', type: 'boolean' },
      paralysisParesisPlasterImmobilisation: { label: 'Paralysis / paresis / plaster immobilisation of leg', type: 'boolean' },
      bedriddenRecently:               { label: 'Recently bedridden ≥3 days OR major surgery within 12 weeks', type: 'boolean' },
      localizedTendernessDeepVein:     { label: 'Localised tenderness along deep vein', type: 'boolean' },
      entireLegSwollen:                { label: 'Entire leg swollen', type: 'boolean' },
      calfSwelling3cmMore:             { label: 'Calf swelling ≥3 cm greater than asymptomatic side', type: 'boolean' },
      pittingOedema:                   { label: 'Pitting oedema (symptomatic leg)', type: 'boolean' },
      collateralSuperficialVeins:      { label: 'Collateral superficial veins (non-varicose)', type: 'boolean' },
      previousDvt:                     { label: 'Previously documented DVT', type: 'boolean' },
      alternativeDiagnosisAsLikely:    { label: 'Alternative diagnosis as or more likely (−2 points)', type: 'boolean' },
    },
  },
  {
    id: 'percRule', name: 'PERC Rule', category: 'Emergency',
    guideline: 'ACEP / Kline 2004 Ann Emerg Med',
    description: 'PE Rule-Out Criteria — excludes PE without D-dimer in low pre-test probability',
    fields: {
      age:                     { label: 'Age (years)', type: 'number', required: true },
      heartRate:               { label: 'Heart rate (bpm)', type: 'number', required: true },
      spo2:                    { label: 'SpO₂ (%)', type: 'number', required: true },
      unilateralLegSwelling:   { label: 'Unilateral leg swelling', type: 'boolean' },
      haemoptysis:             { label: 'Haemoptysis', type: 'boolean' },
      recentTraumaOrSurgery4Weeks: { label: 'Recent trauma or surgery within 4 weeks', type: 'boolean' },
      previousDvtPe:           { label: 'Previous DVT / PE', type: 'boolean' },
      exogenousEstrogen:       { label: 'Exogenous oestrogen use', type: 'boolean' },
    },
  },
  // Hepatology
  {
    id: 'childPugh', name: 'Child-Pugh', category: 'Hepatology',
    guideline: 'AASLD / EASL Cirrhosis Guidelines',
    description: 'Cirrhosis severity and prognosis',
    fields: {
      bilirubinUmolL: { label: 'Bilirubin (µmol/L)', type: 'number', required: true },
      albuminGl:      { label: 'Albumin (g/L)', type: 'number', required: true },
      inr:            { label: 'INR', type: 'number' },
      ascites:        { label: 'Ascites', type: 'select', options: ['none', 'mild', 'moderate'] },
      encephalopathy: { label: 'Hepatic encephalopathy', type: 'select', options: ['none', 'grade1-2', 'grade3-4'] },
    },
  },
  {
    id: 'meldScore', name: 'MELD / MELD-Na', category: 'Hepatology',
    guideline: 'AASLD 2021 / UNOS liver allocation',
    description: '90-day mortality in liver disease — liver transplant listing score',
    fields: {
      bilirubinUmolL:  { label: 'Bilirubin (µmol/L)', type: 'number', required: true },
      creatinineUmolL: { label: 'Creatinine (µmol/L)', type: 'number', required: true },
      inr:             { label: 'INR', type: 'number', required: true },
      sodiumMmolL:     { label: 'Sodium (mmol/L)', type: 'number', hint: 'For MELD-Na calculation' },
    },
  },
  // Surgical / Perioperative
  {
    id: 'rcri', name: 'RCRI (Lee Index)', category: 'Surgical',
    guideline: 'ACC/AHA 2014 Perioperative Guideline',
    description: 'Revised Cardiac Risk Index — MACE risk before non-cardiac surgery',
    fields: {
      highRiskSurgery:          { label: 'High-risk surgery (suprainguinal vascular / intrathoracic / intraperitoneal)', type: 'boolean' },
      ischemicHeartDisease:     { label: 'Ischaemic heart disease (history of MI / Q waves / angina / nitrate use)', type: 'boolean' },
      congestiveHeartFailure:   { label: 'Congestive heart failure', type: 'boolean' },
      cerebrovascularDisease:   { label: 'Cerebrovascular disease (TIA / stroke)', type: 'boolean' },
      insulinDependentDiabetes: { label: 'Insulin-dependent diabetes mellitus', type: 'boolean' },
      preopCreatinine:          { label: 'Preoperative creatinine (µmol/L)', type: 'number', hint: '>177 µmol/L (>2 mg/dL) scores 1' },
    },
  },
  // Obstetrics
  {
    id: 'bishopScore', name: 'Bishop Score', category: 'Obstetrics',
    guideline: 'ACOG Practice Bulletin 107',
    description: 'Cervical favourability for induction of labour',
    fields: {
      dilationCm:    { label: 'Cervical dilation (cm)', type: 'number', required: true },
      effacementPct: { label: 'Cervical effacement (%)', type: 'number', required: true },
      station:       { label: 'Fetal station (−3 to +2)', type: 'number', required: true, hint: 'e.g. -3, -2, -1, 0, +1, +2' },
      consistency:   { label: 'Cervical consistency', type: 'select', options: ['firm', 'medium', 'soft'] },
      position:      { label: 'Cervical position', type: 'select', options: ['posterior', 'mid', 'anterior'] },
    },
  },
];

const CATEGORIES = [...new Set(CALCS.map(c => c.category))];

// ── Severity badge ────────────────────────────────────────────────────────────

function severityColor(val: string) {
  const v = String(val).toLowerCase();
  if (['high', 'high risk', 'severe', 'critical'].some(k => v.includes(k))) return 'bg-red-100 text-red-700';
  if (['moderate', 'intermediate'].some(k => v.includes(k))) return 'bg-amber-100 text-amber-700';
  if (['low', 'minor', 'mild'].some(k => v.includes(k))) return 'bg-green-100 text-green-700';
  return 'bg-blue-100 text-blue-700';
}

// ── Result renderer ──────────────────────────────────────────────────────────

function ResultView({ result }: { result: CalcResult }) {
  const priorityKeys = ['score', 'meld', 'meldNa', 'egfr', 'stage', 'class', 'risk', 'severity', 'probability', 'threeLevel', 'peExcluded', 'highRisk', 'favourable', 'xrayRequired', 'ankleXrayRequired'];
  const descKeys = ['recommendation', 'label', 'interpretation', 'action', 'inhospitalMortality', 'oneYearSurvival', 'mortality90d', 'estimatedMortality30d', 'dvtPrevalence', 'eventRisk14d', 'macePct', 'note', 'tpaEligibilityNote'];

  const renderVal = (v: unknown): React.ReactNode => {
    if (v === null || v === undefined) return <span className="text-gray-400">—</span>;
    if (typeof v === 'boolean') return v ? <CheckCircle2 className="inline w-4 h-4 text-green-500" /> : <span className="text-gray-400">No</span>;
    if (typeof v === 'object') return <pre className="text-xs bg-gray-50 rounded p-1 mt-1 overflow-auto">{JSON.stringify(v, null, 2)}</pre>;
    const strV = String(v);
    if (['high', 'critical', 'severe'].some(k => strV.toLowerCase().includes(k))) return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${severityColor(strV)}`}>{strV}</span>;
    if (['low', 'mild', 'minor'].some(k => strV.toLowerCase().includes(k))) return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${severityColor(strV)}`}>{strV}</span>;
    if (['moderate', 'intermediate'].some(k => strV.toLowerCase().includes(k))) return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${severityColor(strV)}`}>{strV}</span>;
    return <span className="font-medium">{strV}</span>;
  };

  const scoreVal = result.score ?? result.meld ?? result.egfr;

  return (
    <div className="mt-4 border border-blue-200 rounded-lg bg-blue-50 p-4 space-y-3">
      {scoreVal !== undefined && (
        <div className="flex items-center gap-3">
          <span className="text-4xl font-bold text-blue-700">{String(scoreVal)}</span>
          {result.meldNa && <span className="text-lg text-gray-600">MELD-Na: {String(result.meldNa)}</span>}
          {result.unit && <span className="text-sm text-gray-500">{String(result.unit)}</span>}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {priorityKeys.filter(k => k in result && k !== 'score' && k !== 'meld' && k !== 'meldNa').map(k => (
          <div key={k} className="flex items-center gap-2">
            <span className="text-xs text-gray-500 capitalize">{k.replace(/([A-Z])/g, ' $1')}:</span>
            {renderVal(result[k])}
          </div>
        ))}
      </div>
      {descKeys.filter(k => k in result && result[k]).map(k => (
        <div key={k} className="text-sm text-gray-700 flex gap-2">
          <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <span>{String(result[k])}</span>
        </div>
      ))}
      {result.criteria && typeof result.criteria === 'object' && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Criteria</p>
          {Object.entries(result.criteria as Record<string, boolean>).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 text-sm">
              {v ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <span className="w-3.5 h-3.5 rounded-full border border-gray-300 inline-block" />}
              <span className={v ? 'text-gray-800' : 'text-gray-400'}>{k.replace(/([A-Z])/g, ' $1')}</span>
            </div>
          ))}
        </div>
      )}
      {result.guideline && (
        <p className="text-xs text-gray-400 border-t border-blue-200 pt-2">Guideline: {String(result.guideline)}</p>
      )}
    </div>
  );
}

// ── Field renderer ────────────────────────────────────────────────────────────

function FieldInput({ fieldKey, def, value, onChange }: {
  fieldKey: string;
  def: CalcFields[string];
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (def.type === 'boolean') {
    return (
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600"
          checked={!!value}
          onChange={e => onChange(e.target.checked)}
        />
        <span className="text-sm text-gray-700">{def.label}</span>
      </label>
    );
  }
  if (def.type === 'select' && def.options) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{def.label}</label>
        <select
          className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          value={value as string ?? ''}
          onChange={e => {
            const raw = e.target.value;
            // Extract numeric score from "Label → N" pattern
            const match = raw.match(/→\s*(\d+)/);
            onChange(match ? parseInt(match[1]) : raw.split(' ')[0].toLowerCase());
          }}
        >
          <option value="">Select…</option>
          {def.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        {def.hint && <p className="text-xs text-gray-400 mt-0.5">{def.hint}</p>}
      </div>
    );
  }
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {def.label}{def.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        type="number"
        step="any"
        className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        value={value as number ?? ''}
        onChange={e => onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))}
      />
      {def.hint && <p className="text-xs text-gray-400 mt-0.5">{def.hint}</p>}
    </div>
  );
}

// ── Calculator card ────────────────────────────────────────────────────────────

function CalcCard({ calc }: { calc: CalcDef }) {
  const [open, setOpen] = useState(false);
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<CalcResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const resp = await api.post(`/scores/${calc.id}`, params);
      setResult(resp.data.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setError(e?.response?.data?.message || e?.message || 'Calculation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg bg-white shadow-sm">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div>
          <span className="font-semibold text-gray-800">{calc.name}</span>
          <span className="ml-2 text-xs text-gray-400">{calc.guideline}</span>
          <p className="text-xs text-gray-500 mt-0.5">{calc.description}</p>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(calc.fields).map(([key, def]) => (
              <FieldInput
                key={key}
                fieldKey={key}
                def={def}
                value={params[key]}
                onChange={v => setParams(p => ({ ...p, [key]: v }))}
              />
            ))}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
              <AlertTriangle className="w-4 h-4" />
              {error}
            </div>
          )}

          <button
            onClick={run}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Calculating…' : 'Calculate'}
          </button>

          {result && <ResultView result={result} />}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ClinicalCalculators() {
  const [activeCategory, setActiveCategory] = useState<string>('All');

  const filtered = activeCategory === 'All' ? CALCS : CALCS.filter(c => c.category === activeCategory);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <Calculator className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Clinical Calculators</h1>
            <p className="text-sm text-gray-500">{CALCS.length} validated scores — UK (NICE/NHS), European (ESC/ESICM), US (ACC/AHA/ACEP/AASLD/ACOG) guidelines</p>
          </div>
        </div>

        {/* Category filter */}
        <div className="flex flex-wrap gap-2 mb-5">
          {['All', ...CATEGORIES].map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${activeCategory === cat ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300'}`}
            >
              {cat}
              {cat !== 'All' && (
                <span className="ml-1 text-xs opacity-70">({CALCS.filter(c => c.category === cat).length})</span>
              )}
            </button>
          ))}
        </div>

        {/* Calculator list */}
        <div className="space-y-2">
          {filtered.map(calc => (
            <CalcCard key={calc.id} calc={calc} />
          ))}
        </div>

        <p className="text-xs text-gray-400 text-center mt-6">
          For clinical decision support only. Always apply clinical judgement. Scores should not replace clinical assessment.
        </p>
      </div>
    </div>
  );
}
