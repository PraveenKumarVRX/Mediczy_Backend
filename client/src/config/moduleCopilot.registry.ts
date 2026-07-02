/**
 * Module Copilot Registry — maps every hospital module to copilot config
 */
export type ModuleCopilotId =
  | 'admin' | 'billing' | 'accounts' | 'clinical' | 'emr' | 'adt' | 'nursing'
  | 'lab' | 'pharmacy' | 'insurance' | 'ot' | 'icu' | 'er' | 'mrd' | 'quality'
  | 'hr' | 'scm' | 'security' | 'ambulance' | 'dietary' | 'biomedical' | 'consent'
  | 'bloodbank' | 'cssd' | 'cfo' | 'patient';

export interface ModuleCopilotConfig {
  id: ModuleCopilotId;
  label: string;
  icon: string;
  samd?: boolean;
  quickPrompts: string[];
}

export const MODULE_COPILOT_REGISTRY: Record<ModuleCopilotId, ModuleCopilotConfig> = {
  admin:      { id: 'admin',      label: 'Ops Copilot',           icon: '⚙️', quickPrompts: ['System status', 'Recent audit logs', 'Open governance items'] },
  billing:    { id: 'billing',    label: 'Revenue Copilot',       icon: '💰', quickPrompts: ['Show AR aging summary', 'Explain this patient balance', 'ERA posting steps'] },
  accounts:   { id: 'accounts',   label: 'Accounts Copilot',      icon: '📒', quickPrompts: ['Today\'s collections', 'Pending invoices', 'GL export help'] },
  clinical:   { id: 'clinical',   label: 'Clinical Copilot',      icon: '🩺', samd: true, quickPrompts: ['Draft differential', 'ICD suggestions', 'Drug interaction check'] },
  emr:        { id: 'emr',        label: 'Clinical Copilot',      icon: '🩺', samd: true, quickPrompts: ['Summarize this admission', 'Suggest plan', 'Coding from note'] },
  adt:        { id: 'adt',        label: 'Admit Copilot',         icon: '🛏️', quickPrompts: ['Discharge clearance status', 'Bed availability', 'Admission checklist'] },
  nursing:    { id: 'nursing',    label: 'Nurse Copilot',         icon: '💉', samd: true, quickPrompts: ['Active deterioration alerts', 'eMAR due now', 'Vitals trend'] },
  lab:        { id: 'lab',        label: 'Lab Copilot',           icon: '🔬', quickPrompts: ['Pending orders', 'Critical value protocol', 'TAT bottlenecks'] },
  pharmacy:   { id: 'pharmacy',   label: 'Pharma Copilot',        icon: '💊', quickPrompts: ['Interaction check', 'Generic alternative', 'Stock for Rx'] },
  insurance:  { id: 'insurance',  label: 'Claims Copilot',        icon: '🏥', quickPrompts: ['Denial appeal draft', 'Pre-auth checklist', 'Claims pending'] },
  ot:         { id: 'ot',         label: 'Theatre Copilot',       icon: '🏥', samd: true, quickPrompts: ['WHO safety checklist', 'Implant trace', 'Schedule conflicts'] },
  icu:        { id: 'icu',        label: 'Critical Care Copilot', icon: '🚨', samd: true, quickPrompts: ['NEWS2 alerts', 'Ventilator summary', 'Sepsis bundle'] },
  er:         { id: 'er',         label: 'ER Copilot',            icon: '🚑', samd: true, quickPrompts: ['Triage queue', 'ESI guidance', 'Red flags'] },
  mrd:        { id: 'mrd',        label: 'Records Copilot',       icon: '📁', quickPrompts: ['ICD coding help', 'ROI request', 'Record completeness'] },
  quality:    { id: 'quality',    label: 'Compliance Copilot',    icon: '✅', quickPrompts: ['NABH KPI gaps', 'Open incidents', 'Audit prep'] },
  hr:         { id: 'hr',         label: 'People Copilot',        icon: '👥', quickPrompts: ['Credential expiry', 'Shift gaps', 'Leave balance'] },
  scm:        { id: 'scm',        label: 'Supply Copilot',        icon: '📦', quickPrompts: ['Low stock items', 'Indent status', 'Implant trace'] },
  security:   { id: 'security',   label: 'Security Copilot',      icon: '🔒', quickPrompts: ['Open incidents', 'Visitor log', 'Access violations'] },
  ambulance:  { id: 'ambulance',  label: 'Dispatch Copilot',      icon: '🚑', quickPrompts: ['Nearest unit', 'ETA estimate', 'Triage on arrival'] },
  dietary:    { id: 'dietary',    label: 'Nutrition Copilot',     icon: '🥗', quickPrompts: ['Renal diet limits', 'Allergy cross-check', 'Kitchen forecast'] },
  biomedical: { id: 'biomedical', label: 'Biomed Copilot',        icon: '🔧', quickPrompts: ['PM due devices', 'Breakdown triage', 'Calibration schedule'] },
  consent:    { id: 'consent',    label: 'Consent Copilot',       icon: '📋', quickPrompts: ['Procedure consent draft', 'Language simplify', 'Missing signatures'] },
  bloodbank:  { id: 'bloodbank',  label: 'Blood Bank Copilot',    icon: '🩸', quickPrompts: ['Stock by group', 'Cross-match pending', 'Expiry alerts'] },
  cssd:       { id: 'cssd',       label: 'CSSD Copilot',          icon: '♨️', quickPrompts: ['Sterilization cycle', 'Instrument trace', 'OT set readiness'] },
  cfo:        { id: 'cfo',        label: 'CFO Copilot',           icon: '📊', quickPrompts: ['Cash position', 'AR vs target', 'Claims settlement MTD'] },
  patient:    { id: 'patient',    label: 'Dr. iSHA',              icon: '💚', quickPrompts: ['Explain my bill', 'Prep for visit', 'Medication reminder'] },
};

export function getModuleCopilotConfig(id: ModuleCopilotId): ModuleCopilotConfig {
  return MODULE_COPILOT_REGISTRY[id] || MODULE_COPILOT_REGISTRY.clinical;
}
