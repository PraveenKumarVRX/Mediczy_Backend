import crypto from 'node:crypto';

const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const SESSION = /^chat_[a-f0-9]{32}$/;

// Owner values come exclusively from authentication middleware, never request bodies.
export function chatOwner(req) {
  const role = String(req.userRole || req.user?.role || 'user');
  const actor = req.user?.unique_id || `${role}:${req.user?.id}`;
  if (!req.user?.id) throw fail(401, 'Authentication required');
  return JSON.stringify([actor, role, req.tenant?.unique_id || (req.tenant?.id ? `tenant:${req.tenant.id}` : null) || req.user?.organization_uid || req.user?.organization_id || null]);
}

export function createChatSessions(redis, ttl = 3600) {
  const ownerKey = id => `medical-chat:{${id}}:owner`;
  const messagesKey = id => `medical-chat:{${id}}:messages`;
  async function authorize(id, owner) {
    if (!SESSION.test(id || '')) throw fail(403, 'Invalid or expired conversation');
    if (await redis.get(ownerKey(id)) !== owner) throw fail(403, 'Invalid or expired conversation');
  }
  return {
    async resolve(requested, owner) {
      // Legacy client-generated IDs have no authoritative ownership. Start clean.
      if (!requested || /^dr_isha_[a-zA-Z0-9_]{1,100}$/.test(requested)) {
        const id = `chat_${crypto.randomBytes(16).toString('hex')}`;
        const created = await redis.set(ownerKey(id), owner, 'EX', ttl, 'NX');
        if (created !== 'OK') throw fail(503, 'Conversation store unavailable');
        return id;
      }
      await authorize(requested, owner);
      return requested;
    },
    async load(id, owner) {
      await authorize(id, owner);
      const rows = await redis.lrange(messagesKey(id), 0, -1);
      return rows.map(row => JSON.parse(row));
    },
    async append(id, owner, turns) {
      // Check ownership and append atomically; a concurrent clear cannot recreate history.
      const result = await redis.eval(`
        if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
        for i = 3, #ARGV do redis.call('RPUSH', KEYS[2], ARGV[i]) end
        redis.call('LTRIM', KEYS[2], -30, -1)
        redis.call('EXPIRE', KEYS[1], ARGV[2])
        redis.call('EXPIRE', KEYS[2], ARGV[2])
        return 1`, 2, ownerKey(id), messagesKey(id), owner, ttl,
      ...turns.map(turn => JSON.stringify({ role: turn.role, content: String(turn.content).slice(0, 4000) })));
      if (result !== 1) throw fail(403, 'Invalid or expired conversation');
    },
    async clear(id, owner) {
      const result = await redis.eval(`
        local owner = redis.call('GET', KEYS[1])
        if owner ~= ARGV[1] and owner ~= 'personal:' .. ARGV[1] then return 0 end
        redis.call('DEL', KEYS[1], KEYS[2])
        return 1`, 2, ownerKey(id), messagesKey(id), owner);
      if (result !== 1) throw fail(403, 'Invalid or expired conversation');
    },
  };
}

export function buildChatRequest({ sessionId, query, language, history, userId, context, personal = false }) {
  return {
    schema_version: '1', patient_id: sessionId, message: query, language,
    history, server_managed_history: true,
    is_patient_specific: personal,
    ...(personal ? { user_id: String(userId), patient_context: context } : {}),
  };
}

export function chatResponseMetadata(data) {
  const evidence = validatedEvidence(data);
  const emergency = data?.emergency === true || data?.is_emergency === true;
  return {
    emergency, is_emergency: emergency,
    ...(emergency ? { intentType: 'emergency', redirectUrl: '/emergency' } : {}),
    safety: { emergency, humanReviewRequired: emergency || data?.human_review_required === true },
    // Retrieval categories are provenance, not validated claim citations.
    retrieval: data?.retrieval ? {
      count: Number.isInteger(data.retrieval.count) ? data.retrieval.count : 0,
      sources: Array.isArray(data.retrieval.sources) ? data.retrieval.sources.filter(s => ['knowledge', 'ehr'].includes(s)) : [],
      patient_history_used: data.retrieval.patient_history_used === true,
      supportingSources: Array.isArray(data.retrieval.supportingSources)
        ? data.retrieval.supportingSources.slice(0, 6).filter(s => s && typeof s.documentId === 'string'
          && typeof s.chunkId === 'string' && typeof s.title === 'string' && typeof s.excerpt === 'string')
          .map(s => ({ documentId: s.documentId.slice(0, 100), chunkId: s.chunkId.slice(0, 100),
            title: s.title.slice(0, 200), excerpt: Array.from(s.excerpt).slice(0,600).join(''), version: s.version, reviewDueAt: s.reviewDueAt, kind:s.kind, verifiedAt:s.verifiedAt })) : [],
    } : null,
    claims: evidence.valid ? evidence.claims : [],
    evidenceStatus: evidence.valid ? 'extractive' : data?.retrieval?.evidence_status === 'unavailable' ? 'unavailable' : data?.retrieval?.count > 0 ? 'retrieved_unvalidated' : 'unavailable',
  };
}

export async function requireAIConsent(pool, userId) {
  const { rows } = await pool.query(`SELECT 1 FROM consent_records
    WHERE patient_id::text = $1 AND purpose = 'ai_analysis' AND status = 'active'
    AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1`, [String(userId)]);
  if (!rows.length) throw fail(403, 'AI health-history consent required');
}

// Read the existing canonical store; an unapplied OCR migration is unavailable,
// never evidence that a patient's lab findings are normal.
export async function verifiedChatObservations(pool, { userId, organizationId, organizationUid, requireOrganizationUid = false }) {
  if (requireOrganizationUid && organizationId && !organizationUid) return {status:'unavailable',items:[]};
  try {
    const { rows } = await pool.query(`
      SELECT lr.id AS observation_id, lr.verified_at, lr.canonical_name, lr.loinc_code, lr."value", lr."numericValue", lr.unit,
             lr."referenceRange", lr."reportDate", lr."reportId", lr.page, lr.source_text
        FROM lab_results lr JOIN reports r ON r.id = lr."reportId"
       WHERE lr."userId" = $1 AND r."userId" = $1
         AND r.organization_id IS NOT DISTINCT FROM $2
         ${requireOrganizationUid && organizationUid ? 'AND r.organization_uid = $3' : ''}
         AND r.status = 'active' AND lr.verification_status = 'verified' AND lr.verified_at IS NOT NULL
       ORDER BY lr."reportDate" DESC NULLS LAST, lr.id DESC LIMIT 30`,
    [userId, organizationId ?? null,...(requireOrganizationUid && organizationUid ? [organizationUid] : [])]);
    return { status: 'available', items: rows.map(row => ({
      name: row.canonical_name, code: row.loinc_code, value: row.value,
      numericValue: row.numericValue, unit: row.unit, referenceRange: row.referenceRange,
      reportDate: row.reportDate, reportId: row.reportId, page: row.page,
      sourceText: typeof row.source_text === 'string' ? row.source_text.slice(0, 600) : null,
      verificationStatus: 'verified', observationId: row.observation_id, verifiedAt: row.verified_at,
    })) };
  } catch {
    return { status: 'unavailable', items: [] };
  }
}

export function requireSibSuccess(response) {
  if (response.ok) return;
  if ([401, 403].includes(response.status)) throw fail(response.status, 'Medical AI authorization or consent denied');
  throw fail(503, 'Medical AI service temporarily unavailable');
}

export function validatedEvidence(data, now = Date.now()) {
  const retrieval = data?.retrieval;
  const sources = (Array.isArray(retrieval?.supportingSources) ? retrieval.supportingSources : []).slice(0,6)
    .filter(source => source && typeof source.documentId==='string' && typeof source.chunkId==='string'
      && typeof source.title==='string' && typeof source.excerpt==='string' && Array.from(source.excerpt).length<=600
      && typeof source.version==='string' && source.version.length<=100 && (Date.parse(source.reviewDueAt)>now || (['report','reconciliation'].includes(source.kind) && Number.isFinite(Date.parse(source.verifiedAt)) && Date.parse(source.verifiedAt)<=now)));
  const claims = Array.isArray(retrieval?.claims) ? retrieval.claims : [];
  const valid = claims.length>0 && claims.length<=30 && claims.every(claim => {
    const source = sources.find(s => s.documentId===claim.documentId && s.chunkId===claim.chunkId);
    return source && Number.isInteger(claim.start) && Number.isInteger(claim.end) && claim.start>=0 && claim.end<=Array.from(source.excerpt).length
      && claim.start<claim.end && Array.from(source.excerpt).slice(claim.start,claim.end).join('')===claim.text;
  });
  const answer = data?.response || data?.chat_answer;
  return { valid: Boolean(valid && claims.map(c=>c.text).join('\n\n')===answer), sources, claims: valid ? claims : [] };
}
