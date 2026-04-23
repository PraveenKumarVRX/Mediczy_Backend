/**
 * Feature Extractor — Structured Query Analysis
 * ==============================================
 * Part of the HAIS "Cost-Aware Routing Brain" (Part 2.2 of AI OS blueprint).
 *
 * Extracts a normalized feature vector from each user query.
 * Pure CPU — no LLM calls. Target latency: <2ms.
 *
 * Output feature vector is consumed by:
 *   - scoring-model.js  → route selection (slm/llm/agent/dag)
 *   - cognitive-router.js → tier selection (reflex/standard/deep)
 *
 * Feature dimensions:
 *   complexityScore    — 0.0–1.0 (linguistic/structural complexity)
 *   ambiguityScore     — 0.0–1.0 (how uncertain/ambiguous is the request)
 *   riskLevel          — 'low'|'medium'|'high' (potential for harm/irreversibility)
 *   needsTools         — bool (does this require API calls or DB writes)
 *   needsMultiAgent    — bool (spans multiple domains / requires parallel work)
 *   latencyCategory    — 'realtime'|'interactive'|'batch'
 *   taskType           — extraction|classification|generation|reasoning|planning|action|retrieval|conversation
 *   domain             — clinical|insurance|scheduling|analytics|admin|research|general
 *   costBudget         — 'economy'|'standard'|'premium'
 *   tokenEstimate      — rough token count (words × 1.3)
 */

// ─── Task + Domain Enums ──────────────────────────────────────────────────────

export const TASK_TYPES = {
  extraction:     'extraction',     // pull specific facts
  classification: 'classification', // label/categorize
  generation:     'generation',     // write/draft/compose
  reasoning:      'reasoning',      // analyze/infer/explain
  planning:       'planning',       // multi-step plans/protocols
  action:         'action',         // book/cancel/update/send
  retrieval:      'retrieval',      // find/fetch/look up
  conversation:   'conversation',   // general chat/clarify
};

export const DOMAINS = {
  clinical:    'clinical',
  insurance:   'insurance',
  scheduling:  'scheduling',
  analytics:   'analytics',
  admin:       'admin',
  research:    'research',
  general:     'general',
};

// ─── Signal Pattern Library ───────────────────────────────────────────────────

const P = {
  // ── Complexity ──────────────────────────────────────────────────────────────
  highComplexity: [
    /\b(differential diagnosis|treatment plan|clinical decision|comprehensive|detailed analysis|step.?by.?step)\b/i,
    /\b(complication|contraindication|drug interaction|clinical guideline|evidence.?based|systematic review)\b/i,
    /\b(multifactorial|holistic|overall assessment|multi.?step|multi.?modal|cross.?specialty)\b/i,
  ],
  lowComplexity: [
    /^(yes|no|ok|okay|thanks|correct|wrong|confirm|cancel|done)\b/i,
    /^(what is|when is|where is|who is|show me|give me|list|status|check)\b/i,
  ],

  // ── Ambiguity ────────────────────────────────────────────────────────────────
  ambiguous: [
    /\b(could be|might be|possibly|unclear|uncertain|maybe|perhaps|not sure|confused|unsure)\b/i,
    /\b(or something|i think|i believe|i guess|approximately|roughly|around|about)\b/i,
    /\b(either|alternatively|but also|however|despite|even though|it depends)\b/i,
  ],

  // ── Risk ─────────────────────────────────────────────────────────────────────
  highRisk: [
    /\b(delete|remove|drop|terminate|revoke|override|purge|wipe|destroy)\b/i,
    /\b(emergency|critical|urgent|life.?threatening|cardiac|stroke|seizure|ambulance)\b/i,
    /\b(fraud|legal|liability|audit|investigate|escalate|deploy|reset)\b/i,
  ],
  mediumRisk: [
    /\b(update|modify|change|transfer|payment|claim|prescription|discharge|surgery|procedure)\b/i,
    /\b(authorize|approve|reject|sign|submit|finalize|publish)\b/i,
  ],

  // ── Tool / Action need ───────────────────────────────────────────────────────
  needsTools: [
    /\b(book|schedule|cancel|reschedule|create|send|submit|upload|fetch|query|run|execute|look up|search for|find patient|get report)\b/i,
    /\b(call api|trigger|notify|register|enroll|assign|allocate)\b/i,
  ],

  // ── Multi-agent / Parallelism ────────────────────────────────────────────────
  needsMultiAgent: [
    /\b(and also|in addition|both|as well as|simultaneously|plus|along with)\b/i,
    /\b(report and|analysis and|schedule and|diagnose and|check and|get me the .* and the)\b/i,
  ],

  // ── Latency ──────────────────────────────────────────────────────────────────
  realtime:    [/\b(now|immediately|urgent|asap|quick|fast|instant|right now|emergency)\b/i],
  batch:       [/\b(report|export|bulk|all patients|entire|weekly|monthly|analyze all|generate all)\b/i],

  // ── Task type ────────────────────────────────────────────────────────────────
  taskExtraction:     [/\b(extract|parse|pull out|get the|find the|what (is|are) the)\b/i],
  taskClassification: [/\b(classify|categorize|is this a|label|type of|kind of|identify)\b/i],
  taskReasoning:      [/\b(analyze|explain|understand|why|how does|reason|cause|effect|implication|interpret)\b/i],
  taskPlanning:       [/\b(plan|steps|how to|procedure|protocol|workflow|process|roadmap|strategy)\b/i],
  taskAction:         [/\b(book|schedule|cancel|update|create|send|submit|approve|reject|register)\b/i],
  taskGeneration:     [/\b(write|generate|draft|compose|summarize|describe|format|document)\b/i],
  taskRetrieval:      [/\b(find|search|look up|get|fetch|show me|list|what are)\b/i],

  // ── Domain ───────────────────────────────────────────────────────────────────
  domainClinical:   [/\b(patient|diagnosis|treatment|drug|symptom|clinical|doctor|prescription|lab|vital|fever|pain|medicine|dose|allergy)\b/i],
  domainInsurance:  [/\b(insurance|claim|tpa|preauth|cashless|policy|premium|billing|invoice|reimbursement)\b/i],
  domainScheduling: [/\b(appointment|book|slot|schedule|reminder|follow.?up|visit|calendar|timing)\b/i],
  domainAnalytics:  [/\b(report|analytics|trend|statistics|dashboard|kpi|metric|performance|revenue|count)\b/i],
  domainAdmin:      [/\b(system|config|admin|deploy|user|role|permission|audit|setting|tenant)\b/i],
  domainResearch:   [/\b(research|guideline|evidence|literature|protocol|study|pubmed|journal|reference)\b/i],
};

// ─── Core Extract Function ────────────────────────────────────────────────────

function _matchAny(patterns, text) {
  return patterns.some(p => p.test(text));
}

/**
 * Extract normalized feature vector from a user query.
 *
 * @param {string}  message
 * @param {Object}  [opts]
 * @param {string}  [opts.role]               - identity role for cost_budget
 * @param {string[]} [opts.conversationHistory] - recent messages
 * @returns {Object} Feature vector (see module header)
 */
export function extract(message, opts = {}) {
  const msg        = message || '';
  const wordCount  = msg.split(/\s+/).filter(Boolean).length;

  // ── Complexity score ─────────────────────────────────────────────────────
  let complexityScore = 0.30;
  if (_matchAny(P.highComplexity, msg)) complexityScore += 0.40;
  if (_matchAny(P.lowComplexity,  msg)) complexityScore -= 0.20;
  if (wordCount > 60)  complexityScore += 0.15;
  if (wordCount > 120) complexityScore += 0.15;
  if (wordCount < 10)  complexityScore -= 0.20;
  // Multi-condition clinical: e.g. "diabetes AND hypertension"
  const medConditions = (msg.match(/\b(diabetes|hypertension|cardiac|renal|hepatic|pulmonary|neurological|sepsis|stroke|heart failure|cancer)\b/gi) || []).length;
  if (medConditions >= 2) complexityScore += 0.20;
  complexityScore = Math.max(0, Math.min(1, complexityScore));

  // ── Ambiguity score ──────────────────────────────────────────────────────
  let ambiguityScore = 0.10;
  if (_matchAny(P.ambiguous, msg)) ambiguityScore += 0.40;
  if (wordCount > 80) ambiguityScore += 0.10;
  ambiguityScore = Math.max(0, Math.min(1, ambiguityScore));

  // ── Risk level ───────────────────────────────────────────────────────────
  let riskLevel = 'low';
  if (_matchAny(P.highRisk,   msg)) riskLevel = 'high';
  else if (_matchAny(P.mediumRisk, msg)) riskLevel = 'medium';

  // ── Tool / action need ───────────────────────────────────────────────────
  const needsTools = _matchAny(P.needsTools, msg);

  // ── Multi-agent need ─────────────────────────────────────────────────────
  const needsMultiAgent = _matchAny(P.needsMultiAgent, msg)
    || (wordCount > 100 && complexityScore > 0.6);

  // ── Latency category ─────────────────────────────────────────────────────
  let latencyCategory = 'interactive';
  if (_matchAny(P.realtime, msg)) latencyCategory = 'realtime';
  else if (_matchAny(P.batch, msg)) latencyCategory = 'batch';

  // ── Task type (priority order: most specific first) ──────────────────────
  let taskType = TASK_TYPES.conversation;
  if      (_matchAny(P.taskPlanning,        msg)) taskType = TASK_TYPES.planning;
  else if (_matchAny(P.taskReasoning,       msg)) taskType = TASK_TYPES.reasoning;
  else if (_matchAny(P.taskAction,          msg)) taskType = TASK_TYPES.action;
  else if (_matchAny(P.taskGeneration,      msg)) taskType = TASK_TYPES.generation;
  else if (_matchAny(P.taskExtraction,      msg)) taskType = TASK_TYPES.extraction;
  else if (_matchAny(P.taskClassification,  msg)) taskType = TASK_TYPES.classification;
  else if (_matchAny(P.taskRetrieval,       msg)) taskType = TASK_TYPES.retrieval;

  // ── Domain ───────────────────────────────────────────────────────────────
  let domain = DOMAINS.general;
  if      (_matchAny(P.domainClinical,   msg)) domain = DOMAINS.clinical;
  else if (_matchAny(P.domainInsurance,  msg)) domain = DOMAINS.insurance;
  else if (_matchAny(P.domainScheduling, msg)) domain = DOMAINS.scheduling;
  else if (_matchAny(P.domainAnalytics,  msg)) domain = DOMAINS.analytics;
  else if (_matchAny(P.domainAdmin,      msg)) domain = DOMAINS.admin;
  else if (_matchAny(P.domainResearch,   msg)) domain = DOMAINS.research;

  // ── Token estimate ───────────────────────────────────────────────────────
  const tokenEstimate = Math.round(wordCount * 1.3);

  // ── Cost budget (role + complexity driven) ───────────────────────────────
  let costBudget = 'standard';
  const { role } = opts;
  if (role === 'patient' || role === 'viewer') costBudget = 'economy';
  if (role === 'platform_admin' || role === 'hospital_admin') costBudget = 'premium';
  if (complexityScore > 0.70) costBudget = 'premium';
  else if (complexityScore < 0.25 && costBudget === 'standard') costBudget = 'economy';

  return {
    wordCount,
    tokenEstimate,
    complexityScore,
    ambiguityScore,
    riskLevel,
    needsTools,
    needsMultiAgent,
    latencyCategory,
    taskType,
    domain,
    costBudget,
  };
}

export default { extract, TASK_TYPES, DOMAINS };
