import llmProvider from './ai-brain/llm-provider.js';

const RESEARCH_SOURCES = [
  {
    id: 'who-lmm-health-2025',
    title: 'WHO ethics and governance guidance for AI in health',
    url: 'https://www.who.int/publications/i/item/9789240084759',
    relevance: 'Large multimodal models in health require governance, human oversight, privacy controls, and risk management.'
  },
  {
    id: 'nist-ai-rmf',
    title: 'NIST AI Risk Management Framework',
    url: 'https://www.nist.gov/itl/ai-risk-management-framework',
    relevance: 'Use governance, mapping, measuring, and management practices before scaling AI capabilities.'
  },
  {
    id: 'hti-1-dsi',
    title: 'HHS HTI-1 algorithm transparency and decision support rule',
    url: 'https://www.federalregister.gov/documents/2024/01/09/2023-28857/health-data-technology-and-interoperability-certification-program-updates-algorithm-transparency-and',
    relevance: 'Predictive decision support needs source attributes, risk management, governance, and ongoing review.'
  },
  {
    id: 'fda-cds-2026',
    title: 'FDA Clinical Decision Support Software guidance',
    url: 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents/clinical-decision-support-software',
    relevance: 'Clinician-facing recommendations should preserve independent review of the basis for recommendations.'
  }
];

const OPPORTUNITY_MATRIX = [
  {
    id: 'documentation-charting',
    quadrant: 'implement_first',
    label: 'Documentation & Charting',
    value: 'high',
    difficulty: 'moderate',
    currentImplementation: [
      'SOAP draft generation from consultation text',
      'Encounter summary generation',
      'Signed-note lock and coding suggestion review'
    ],
    guardrails: [
      'Draft only until clinician signs',
      'No autonomous diagnosis',
      'Provider and model metadata returned for audit'
    ]
  },
  {
    id: 'clinical-decision-support',
    quadrant: 'build_next',
    label: 'Clinical Decision Support',
    value: 'high',
    difficulty: 'difficult',
    currentImplementation: [
      'CDS Hooks endpoints for patient view, prescribing, order signing, and encounter start',
      'Governance dashboard, model cards, drift monitor, and quality-gate logs'
    ],
    guardrails: [
      'Show basis for every recommendation',
      'Clinician remains final decision maker',
      'Track feedback and periodic validation before broad rollout'
    ]
  },
  {
    id: 'diagnostics-imaging',
    quadrant: 'build_next',
    label: 'Diagnostics & Imaging',
    value: 'high',
    difficulty: 'very_difficult',
    currentImplementation: [
      'Medical image storage/access routes',
      'AI vision route for report/image analysis'
    ],
    guardrails: [
      'Do not present model output as diagnosis',
      'Require radiologist/doctor confirmation',
      'Separate research/assistive mode from regulated diagnostic claims'
    ]
  },
  {
    id: 'revenue-cycle-claims',
    quadrant: 'build_next',
    label: 'Revenue Cycle & Claims',
    value: 'high',
    difficulty: 'moderate_difficult',
    currentImplementation: [
      'Claim documentation completeness review',
      'Denial-risk signal extraction',
      'Missing-evidence checklist for claim desk review'
    ],
    guardrails: [
      'Billing team reviews before submission',
      'No automatic claim submission',
      'Capture explicit rationale for recommendations'
    ]
  },
  {
    id: 'population-health-intelligence',
    quadrant: 'build_next',
    label: 'Population Health Intelligence',
    value: 'high',
    difficulty: 'difficult',
    currentImplementation: [
      'Health risk scoring and corporate population risk dashboards exist',
      'Governance should be applied before predictive outreach at scale'
    ],
    guardrails: [
      'Aggregate where possible',
      'Avoid demographic bias amplification',
      'Monitor performance and fairness drift'
    ]
  },
  {
    id: 'administrative-copilots',
    quadrant: 'quick_wins',
    label: 'Administrative Copilots',
    value: 'moderate',
    difficulty: 'easy',
    currentImplementation: [
      'Reusable draft/review pattern for staff workflows',
      'Patient instructions draft generation'
    ],
    guardrails: [
      'Staff approval before external communication',
      'No hidden automation of patient-facing advice'
    ]
  },
  {
    id: 'patient-engagement',
    quadrant: 'quick_wins',
    label: 'Patient Engagement',
    value: 'moderate',
    difficulty: 'easy_moderate',
    currentImplementation: [
      'Patient-friendly post-visit instruction drafts',
      'Existing multi-channel notification send path'
    ],
    guardrails: [
      'Doctor review before send',
      'Include warning signs and escalation instructions',
      'Avoid over-specific medication changes unless supplied by doctor'
    ]
  }
];

const DEFAULT_SOAP_DRAFT = {
  chiefComplaint: '',
  subjective: '',
  objective: '',
  assessment: '',
  plan: '',
  followUp: '',
  redFlags: [],
  documentationGaps: [],
  suggestedIcd10SearchTerms: [],
  suggestedCptSearchTerms: []
};

function normaliseText(value, maxLength = 12000) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function safeJsonObject(raw, fallback) {
  if (!raw || typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    try {
      return JSON.parse(match[0]);
    } catch {
      return fallback;
    }
  }
}

function baseGovernance(useCase, llmResult = null, fallbackReason = null) {
  return {
    useCase,
    mode: 'assistive_draft',
    requiresHumanReview: true,
    autonomousAction: false,
    basisAvailable: true,
    sources: RESEARCH_SOURCES.map(({ id, title, url }) => ({ id, title, url })),
    model: llmResult?.model || 'deterministic-fallback',
    provider: llmResult?.provider || 'local-rules',
    latencyMs: llmResult?.latencyMs || 0,
    fallbackReason
  };
}

async function generateJsonDraft({ useCase, system, user, fallback, maxTokens = 900 }) {
  try {
    const result = await llmProvider.chat({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: 0.2,
      maxTokens,
      responseFormat: { type: 'json_object' },
      skipCache: true,
      cognitiveTier: 'standard'
    });

    return {
      data: safeJsonObject(result.content, fallback),
      governance: baseGovernance(useCase, result)
    };
  } catch (error) {
    return {
      data: fallback,
      governance: baseGovernance(useCase, null, error.message)
    };
  }
}

function buildSoapFallback(transcript, context = {}) {
  const cleaned = normaliseText(transcript, 5000);
  const complaint = normaliseText(context.chiefComplaint || cleaned.split(/[.?!]/)[0], 160);
  return {
    ...DEFAULT_SOAP_DRAFT,
    chiefComplaint: complaint,
    subjective: cleaned,
    objective: normaliseText(context.vitals ? `Vitals/context supplied: ${JSON.stringify(context.vitals)}` : '', 1200),
    assessment: 'Clinician review required before assessment is finalized.',
    plan: 'Clinician to review transcript, complete assessment, orders, medications, and follow-up.',
    documentationGaps: [
      'Confirm diagnosis and differential',
      'Confirm medication dose, frequency, and duration',
      'Confirm allergies, vitals, examination findings, and follow-up timeline'
    ]
  };
}

export async function draftSoapNote({ transcript, context = {} }) {
  const cleanedTranscript = normaliseText(transcript);
  if (cleanedTranscript.length < 10) {
    const error = new Error('At least 10 characters of consultation text are required');
    error.status = 400;
    throw error;
  }

  const fallback = buildSoapFallback(cleanedTranscript, context);
  return generateJsonDraft({
    useCase: 'documentation-charting',
    fallback,
    maxTokens: 1100,
    system: [
      'You are a medical documentation assistant for clinicians.',
      'Return only valid JSON.',
      'Create a draft SOAP note from supplied encounter text.',
      'Do not invent diagnoses, vitals, medications, tests, or procedures.',
      'Mark uncertainty in documentationGaps.',
      'The output is draft documentation that requires clinician review.'
    ].join(' '),
    user: JSON.stringify({
      requiredSchema: DEFAULT_SOAP_DRAFT,
      context,
      transcript: cleanedTranscript
    })
  });
}

function claimFallback(payload = {}) {
  const requiredDocs = ['doctor order', 'diagnosis', 'itemized bill', 'discharge summary or visit note'];
  const supplied = new Set((payload.documents || []).map(doc => String(doc).toLowerCase()));
  const missingDocuments = requiredDocs.filter(doc =>
    !Array.from(supplied).some(item => item.includes(doc.split(' ')[0]))
  );

  const claimAmount = Number(payload.claimAmount || payload.chargedAmount || 0);
  const riskSignals = [];
  if (missingDocuments.length) riskSignals.push('Missing supporting documentation');
  if (!payload.diagnosis && !payload.icd10Codes?.length) riskSignals.push('Diagnosis or ICD-10 code not supplied');
  if (claimAmount > 0 && !payload.policyNumber) riskSignals.push('Policy number missing for billed claim');

  return {
    denialRisk: riskSignals.length >= 2 ? 'high' : riskSignals.length === 1 ? 'moderate' : 'low',
    missingDocuments,
    riskSignals,
    recommendedActions: [
      'Verify patient, policy, and encounter identifiers',
      'Attach clinical note, investigation reports, and itemized bill',
      'Review coding and tariff alignment before submission'
    ],
    reviewerChecklist: [
      'Clinical necessity documented',
      'Diagnosis/procedure codes match note',
      'Amounts match itemized bill',
      'Insurer-specific pre-auth rules checked'
    ],
    rationale: 'Rule-based review of claim completeness and denial-risk signals.'
  };
}

export async function reviewClaimDocumentation(payload = {}) {
  const fallback = claimFallback(payload);
  return generateJsonDraft({
    useCase: 'revenue-cycle-claims',
    fallback,
    maxTokens: 900,
    system: [
      'You are a revenue-cycle documentation assistant.',
      'Return only valid JSON.',
      'Review claim documentation completeness and denial-risk signals.',
      'Do not approve, deny, submit, or adjudicate claims.',
      'Give a concise rationale and a reviewer checklist.'
    ].join(' '),
    user: JSON.stringify({
      requiredSchema: fallback,
      claim: payload
    })
  });
}

function patientInstructionsFallback(payload = {}) {
  const diagnosis = normaliseText(payload.diagnosis || payload.reason || 'your visit', 160);
  return {
    title: `Post-visit instructions for ${diagnosis}`,
    instructions: normaliseText(payload.plan || payload.instructions || 'Follow the care plan explained by your doctor.', 1200),
    medications: Array.isArray(payload.medications) ? payload.medications : [],
    warningSigns: Array.isArray(payload.warningSigns) && payload.warningSigns.length
      ? payload.warningSigns
      : ['Symptoms worsen', 'Breathing difficulty', 'Severe pain', 'New confusion', 'High fever'],
    followUp: normaliseText(payload.followUp || 'Follow up as advised by your doctor.', 400),
    patientFriendlySummary: 'Please follow these reviewed instructions and contact the clinic if you are unsure about any step.',
    reviewNotes: ['Doctor must review before sending to the patient.']
  };
}

export async function draftPatientInstructions(payload = {}) {
  const fallback = patientInstructionsFallback(payload);
  return generateJsonDraft({
    useCase: 'patient-engagement',
    fallback,
    maxTokens: 900,
    system: [
      'You are a patient education assistant.',
      'Return only valid JSON.',
      'Write clear post-visit instructions at an accessible reading level.',
      'Only include medications, doses, restrictions, and timelines that were supplied.',
      'Include warning signs and follow-up instructions.',
      'The doctor must review the draft before sending.'
    ].join(' '),
    user: JSON.stringify({
      requiredSchema: fallback,
      visit: payload
    })
  });
}

export function getOpportunityMatrix() {
  return {
    generatedAt: new Date().toISOString(),
    strategy: 'Prioritize high-value assistive workflows first, then scale validated decision support and analytics with governance.',
    quadrants: {
      implement_first: OPPORTUNITY_MATRIX.filter(item => item.quadrant === 'implement_first'),
      build_next: OPPORTUNITY_MATRIX.filter(item => item.quadrant === 'build_next'),
      quick_wins: OPPORTUNITY_MATRIX.filter(item => item.quadrant === 'quick_wins'),
      deprioritize: [
        {
          id: 'robotics-physical-automation',
          label: 'Robotics & Physical Automation',
          value: 'low_moderate',
          difficulty: 'very_difficult',
          reason: 'High capital, safety, integration, and operational burden.'
        },
        {
          id: 'experimental-autonomous-ai',
          label: 'Experimental & Autonomous AI',
          value: 'uncertain',
          difficulty: 'very_difficult',
          reason: 'Requires formal validation, safety case, and regulatory posture before production.'
        }
      ]
    },
    sources: RESEARCH_SOURCES
  };
}

export default {
  draftSoapNote,
  reviewClaimDocumentation,
  draftPatientInstructions,
  getOpportunityMatrix
};
