/**
 * Mediczy AI Layer Map — programmatic registry (MED-AI-LAYER-001)
 * Keep in sync with docs/ai/MEDICZY_AI_LAYER_MAP.md
 */

export const AI_LAYERS = [
  { id: 'L1', name: 'Classical AI', description: 'Rules, workflows, validation, data truth' },
  { id: 'L2', name: 'Machine Learning', description: 'Statistical prediction, drift monitoring' },
  { id: 'L3', name: 'Neural Networks', description: 'STT, NLP classifiers, vision' },
  { id: 'L4', name: 'Deep Learning', description: 'Embeddings, representation learning' },
  { id: 'L5', name: 'Generative AI', description: 'LLM text, reasoning, content generation' },
  { id: 'L6', name: 'Agentic AI', description: 'Goal-driven, tool-using copilots' },
  { id: 'L7', name: 'AGI', description: 'Not in scope — aspirational only', inScope: false },
];

export const SERVICE_REGISTRY = [
  { layer: 'L1', service: 'doctor-availability.route.js', route: '/api/doctors/availability', function: 'Slot rules & schedule persistence', samdClass: 'Not SaMD', owner: 'Platform Eng', slo: 'API p99 < 300ms' },
  { layer: 'L1', service: 'doctor.route.js', route: '/api/doctors/my-patients/:id/vitals', function: 'Clinical data CRUD, IDOR guards', samdClass: 'Not SaMD', owner: 'Platform Eng', slo: 'POST→GET vitals parity 100%' },
  { layer: 'L1', service: 'ai-quality-gates.service.js', route: '/api/ai-governance/quality-gates', function: '8 pre-flight safety checks', samdClass: 'Safety envelope', owner: 'AI Safety Eng', slo: '100% gate execution on diagnostic outputs' },
  { layer: 'L1', service: 'ai-model-governance.service.js', route: '/api/ai-governance', function: 'PCCP, model cards, drift, change log', samdClass: 'Governance', owner: 'AI CTO + Med Director', slo: '0 unapproved model changes' },
  { layer: 'L2', service: 'ai-health-risk-cron.service.js', route: 'cron:6h', function: 'Patient risk scoring', samdClass: 'Class IIb', modelCard: 'health-risk-scoring-v2-bayesian', owner: 'AI Eng', slo: 'Cron success ≥ 99%' },
  { layer: 'L2', service: 'ai-model-governance.service.js', route: 'POST /api/ai-governance/drift/run', function: 'PSI drift monitor', samdClass: 'Surveillance', owner: 'AI Safety Eng', slo: 'PSI alert within 24h of > 0.20' },
  { layer: 'L3', service: 'voice-assistant.route.js', route: 'POST /api/voice-assistant/stt', function: 'Groq Whisper STT', samdClass: 'Not SaMD*', modelCard: 'medical-scribe-whisper-bimedix', owner: 'AI Eng', slo: 'STT p95 < 2s' },
  { layer: 'L3', service: 'intentClassifier.js', route: 'medical-ai consult', function: 'Patient intent routing', samdClass: 'Class I', owner: 'AI Eng', slo: 'Intent accuracy ≥ 95%' },
  { layer: 'L4', service: 'rag-pipeline.js', route: 'internal', function: 'Embeddings & RAG retrieval', samdClass: 'Class II', owner: 'AI Eng', slo: 'Recall@5 ≥ 0.85 on eval set' },
  { layer: 'L5', service: 'llm-provider.js', route: 'internal', function: 'SIB → Groq cascade', samdClass: 'Router', modelCard: 'isha-buzz-bimedix2', owner: 'AI Platform Eng', slo: 'Availability ≥ 99.5%' },
  { layer: 'L5', service: 'medical-ai.route.js', route: 'POST /api/medical-ai/consult', function: 'Dr. iSHA chat', samdClass: 'Class IIb', modelCard: 'isha-buzz-bimedix2', owner: 'AI Eng', slo: 'Golden-set pass ≥ 90%' },
  { layer: 'L5', service: 'ai-emergency-triage.service.js', route: 'POST /api/medical-ai/emergency-triage', function: 'ESI 5-level triage', samdClass: 'Class III', modelCard: 'emergency-triage-esi-v1', owner: 'AI Safety Eng', slo: 'ESI-1/2 sensitivity ≥ 0.95' },
  { layer: 'L5', service: 'ai-drug-interaction.service.js', route: 'internal', function: 'Drug interaction checking', samdClass: 'Class III', modelCard: 'drug-interaction-checker-v1', owner: 'AI Safety Eng', slo: '0 missed critical pairs on test set' },
  { layer: 'L6', service: 'voice-assistant.route.js', route: 'POST /api/voice-assistant/agent', function: 'Doctor copilot intent + tools', samdClass: 'Class II', owner: 'AI Eng', slo: 'Intent parse ≥ 92%' },
  { layer: 'L6', service: 'doctor-copilot.route.js', route: 'POST /api/doctor-copilot/chat', function: 'Unified doctor AI gateway (AI-PLATFORM-001)', samdClass: 'Class II', owner: 'AI Platform Eng', slo: 'Single trace ID per turn' },
  { layer: 'L6', service: 'ai-brain/orchestrator.js', route: 'POST /api/ai-brain/think', function: 'Multi-agent think pipeline', samdClass: 'Class II', owner: 'AI Eng', slo: 'End-to-end trace per request' },
  { layer: 'L6', service: 'ai-self-learning-pipeline.service.js', route: 'cron:4h', function: 'Continuous learning (governed)', samdClass: 'Governed', owner: 'AI CTO', slo: '100% changes via proposeChange()' },
];

export const SAMD_PILLAR_MAP = [
  { pillar: 'Technical interpretability', score: '5/5', layers: ['L2', 'L4', 'L5'], keyServices: ['ai-interpretability.service.js'] },
  { pillar: 'Model governance & PCCP', score: '3/3', layers: ['L1', 'L6'], keyServices: ['ai-model-governance.service.js'] },
  { pillar: 'Monitoring & surveillance', score: '2/2', layers: ['L2'], keyServices: ['runDriftMonitor', 'computeDemographicParity'] },
  { pillar: 'Safety & quality gates', score: '1/1', layers: ['L1'], keyServices: ['ai-quality-gates.service.js'] },
  { pillar: 'Clinical validation', score: '2/2*', layers: ['L2', 'L5'], keyServices: ['ai-health-risk-cron', 'ai-emergency-triage'], gap: 'External Class III study pending' },
  { pillar: 'External regulatory filing', score: '0/2', layers: [], keyServices: [], gap: 'CDSCO + FDA/CE submission' },
];

export const Q3_PRIORITIES = [
  { priority: 'P0', layer: 'L1', initiative: 'Contract tests: vitals POST→GET, availability save→reload', owner: 'Platform Eng', status: 'done' },
  { priority: 'P0', layer: 'L6', initiative: 'Unified doctor copilot gateway (AI-PLATFORM-001)', owner: 'AI Platform Eng', status: 'done' },
  { priority: 'P0', layer: 'L5', initiative: 'Clinical golden-set regression on deploy', owner: 'AI Eng', status: 'done' },
  { priority: 'P1', layer: 'L2', initiative: 'External triage validation study (≥200 cases)', owner: 'Medical Director', status: 'planned' },
  { priority: 'P1', layer: 'L1', initiative: 'ISO 14971 FMEA review vs live failure modes', owner: 'AI Safety Eng', status: 'planned' },
  { priority: 'P2', layer: 'L5', initiative: 'DPDP DPAs with SIB/Groq/OpenAI', owner: 'AI CTO', status: 'planned' },
];

export function getAiLayerMapSummary() {
  const inScopeLayers = AI_LAYERS.filter((l) => l.inScope !== false);
  const servicesByLayer = inScopeLayers.map((layer) => ({
    ...layer,
    services: SERVICE_REGISTRY.filter((s) => s.layer === layer.id),
    serviceCount: SERVICE_REGISTRY.filter((s) => s.layer === layer.id).length,
  }));

  return {
    documentId: 'MED-AI-LAYER-001',
    version: '1.0',
    updatedAt: new Date().toISOString(),
    operatingLayers: 'L1–L6',
    agiInScope: false,
    overallSamdReadiness: '22/27 (81%)',
    docPath: 'docs/ai/MEDICZY_AI_LAYER_MAP.md',
    scorecardPath: 'docs/ai/SAMD_READINESS_SCORECARD.md',
    layers: servicesByLayer,
    serviceRegistry: SERVICE_REGISTRY,
    samdPillars: SAMD_PILLAR_MAP,
    priorities: Q3_PRIORITIES,
    incidentPatterns: [
      { symptom: 'Data not showing after save', layer: 'L1', fix: 'DB read path + cache invalidation' },
      { symptom: 'Setting not persisting', layer: 'L1', fix: 'API schema + mobile/web parity' },
      { symptom: 'Wrong follow-up AI answer', layer: 'L5+L6', fix: 'SIB routing + conversation history' },
    ],
  };
}

export default { getAiLayerMapSummary, AI_LAYERS, SERVICE_REGISTRY, SAMD_PILLAR_MAP, Q3_PRIORITIES };
