/**
 * Care Intelligence Mesh — registry of per-patient AI agents
 * ============================================================
 * This is NOT the conversational tool-calling agent system in
 * agent-registry.js (that's role-based chat assistants with a shared tool
 * allowlist). These are single-purpose background agents that each wrap one
 * real capability already implemented against real data in careos/ and
 * hospital-os/ — this file exists so the orchestrator and the "AI Team" UI
 * have one place to see the whole roster and its real status, instead of
 * that status being implicit in which routes happen to exist.
 *
 * `invokable: true` means there is a direct on-demand endpoint a clinician
 * can trigger from the UI. `invokable: false` means the agent's logic runs
 * automatically as a side effect of a real clinical event (admission,
 * discharge, OT completion, a chat message being sent) rather than being
 * pulled on demand — those are still real, just not "run buttons".
 */

export const CARE_INTELLIGENCE_MESH = [
  {
    id: 'clinical',
    name: 'Clinical Agent',
    icon: '🩺',
    description: 'Admission briefing from history, allergies, meds, and prior admissions.',
    status: 'active',
    invokable: true,
    trigger: 'On admission (via patient.admitted Kafka event) or on demand.',
  },
  {
    id: 'medication',
    name: 'Medication Agent',
    icon: '💊',
    description: 'Duplicate-therapy-class and renal-dosing checks on every interaction check.',
    status: 'active',
    invokable: false,
    trigger: 'Runs inside checkInteractions() for every drug order.',
  },
  {
    id: 'monitoring',
    name: 'Monitoring Agent',
    icon: '📈',
    description: 'Multi-signal vitals + labs trend correlation with LLM narrative.',
    status: 'active',
    invokable: false,
    trigger: 'Runs via the Coordinator "Analyze" action (Alerts tab).',
  },
  {
    id: 'research',
    name: 'Research Agent',
    icon: '🔬',
    description: 'Similar prior cases + matching clinical trials combined into one briefing.',
    status: 'active',
    invokable: true,
    trigger: 'On demand.',
  },
  {
    id: 'radiology',
    name: 'Radiology Agent',
    icon: '🩻',
    description: 'Summarizes imaging studies and radiology notes on file (metadata only, no pixel analysis).',
    status: 'active',
    invokable: true,
    trigger: 'On demand.',
  },
  {
    id: 'laboratory',
    name: 'Laboratory Agent',
    icon: '🧪',
    description: 'Summarizes abnormal lab results and trends across repeated tests.',
    status: 'active',
    invokable: true,
    trigger: 'On demand.',
  },
  {
    id: 'operations',
    name: 'Operations Agent',
    icon: '🗓️',
    description: 'Finds earlier OT-room slots from real booking gaps.',
    status: 'active',
    invokable: false,
    trigger: 'Room-scoped, not patient-scoped — used from OT scheduling views.',
  },
  {
    id: 'billing',
    name: 'Billing Agent',
    icon: '🧾',
    description: 'Plain-language summary of pending charges, invoices, and credit account status.',
    status: 'active',
    invokable: true,
    trigger: 'On demand.',
  },
  {
    id: 'communication',
    name: 'Communication Agent',
    icon: '📣',
    description: 'Drafts and (on approval) dispatches multichannel care-team notifications.',
    status: 'active',
    invokable: false,
    trigger: 'Draft via voice command → approval inbox → auto-sent to linked team members on approval.',
  },
  {
    id: 'family',
    name: 'Family Agent',
    icon: '👪',
    description: 'Drafts a plain-language family update from current status and pathway.',
    status: 'active',
    invokable: true,
    trigger: 'On demand — clinician reviews and edits before publishing.',
  },
  {
    id: 'documentation',
    name: 'Documentation Agent',
    icon: '📝',
    description: 'Role-tagged multi-participant scribing during ward rounds.',
    status: 'partial',
    invokable: false,
    trigger: 'Ambient scribe stream — tags chunks by an explicit speaker toggle, not true audio diarization (no speaker-embedding model available).',
  },
  {
    id: 'learning',
    name: 'Learning Agent',
    icon: '🧠',
    description: 'Feeds real outcomes (readmission within 30 days) back into similar-case matching.',
    status: 'active',
    invokable: false,
    trigger: 'Runs automatically on every new admission.',
  },
  {
    id: 'prediction',
    name: 'Prediction Agent',
    icon: '🔮',
    description: 'LOS estimate, pathway suggestion, readmission-risk scoring on admission; auto-follow-up on OT completion and discharge.',
    status: 'active',
    invokable: false,
    trigger: 'Runs automatically on admission, OT completion, and discharge.',
  },
  {
    id: 'translation',
    name: 'Translation Agent',
    icon: '🌐',
    description: 'Per-message text translation in doctor-patient chat.',
    status: 'partial',
    invokable: false,
    trigger: 'Doctor Messaging → pick a language for a patient conversation. Live voice-to-voice translation during a call is not implemented (needs a streaming ASR+TTS pipeline this platform doesn\'t run).',
  },
];

export function getCareIntelligenceMesh() {
  return CARE_INTELLIGENCE_MESH;
}

export default { CARE_INTELLIGENCE_MESH, getCareIntelligenceMesh };
