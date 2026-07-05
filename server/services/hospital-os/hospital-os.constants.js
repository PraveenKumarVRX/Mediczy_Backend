/** Hospital OS capability registry — no heavy imports */
export const HOSPITAL_OS_PILLARS = [
  'unified_copilot',
  'patient_twin',
  'hospital_twin',
  'what_if_simulator',
  'approval_inbox',
  'nurse_handover',
  'command_center_ai',
  'translator',
  'voice_drafts',
  'ed_forecast',
  'journey_optimizer',
  'research_hub',
  'knowledge_graph',
  'ambient_documentation',
];

export const HOSPITAL_OS_VERSION = '1.0.0';

export function getCapabilitiesMeta() {
  return { pillars: HOSPITAL_OS_PILLARS, version: HOSPITAL_OS_VERSION };
}
