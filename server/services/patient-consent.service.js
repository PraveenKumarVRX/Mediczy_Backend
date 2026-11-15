/**
 * Versioned, timestamped, provable consent (audit M22; DPDP Act 2023).
 *
 * Records go to patient_consents (type, explicit/implicit, method, policy
 * version, time, IP, user agent). Before this, sign-up wrote only a type and a
 * time into the older `consents` table, Google/Facebook/Apple sign-up recorded
 * nothing, and the app's consent calls were rejected for missing fields.
 *
 * Rule: a consent is recorded as given only when the person actually gave it —
 * the client sends { consent: { accepted: true, version } }. Nothing is
 * inferred. Accounts without a current consent are reported by
 * consentStatus() so the app can ask before continuing.
 */
import pool from '../db/pgPool.js';

/** The privacy notice version members agree to. Bump it to ask everyone again. */
export const CURRENT_POLICY_VERSION = process.env.PRIVACY_POLICY_VERSION || 'privacy-2026-11';
export const AI_POLICY_VERSION = process.env.AI_ASSISTANT_POLICY_VERSION || 'ai-assistant-2026-11';

/** Needed to use the service at all: account data, and health data (sensitive under DPDP). */
export const REQUIRED_TYPES = ['DATA_PROCESSING', 'SENSITIVE_DATA'];

/** patient_consents.consent_type CHECK values (AI_ASSISTANT added by 20261115000100). */
export const CONSENT_TYPES = new Set([
  'DATA_PROCESSING', 'SENSITIVE_DATA', 'TELEMEDICINE', 'RESEARCH', 'MARKETING',
  'DATA_SHARING', 'AI_TRAINING', 'ABHA_LINKING', 'EMERGENCY_OVERRIDE', 'AI_ASSISTANT',
]);

/** App/legacy spellings -> the stored type. */
const ALIASES = {
  data_processing: 'DATA_PROCESSING', essential: 'DATA_PROCESSING',
  sensitive_data: 'SENSITIVE_DATA', health_data: 'SENSITIVE_DATA',
  telemedicine: 'TELEMEDICINE', research: 'RESEARCH', marketing: 'MARKETING',
  data_sharing: 'DATA_SHARING', ai_training: 'AI_TRAINING', abha_linking: 'ABHA_LINKING',
  ai_assistant: 'AI_ASSISTANT', ai: 'AI_ASSISTANT',
};

export function normaliseConsentType(value) {
  const raw = String(value || '').trim();
  const type = ALIASES[raw.toLowerCase()] || raw.toUpperCase();
  return CONSENT_TYPES.has(type) ? type : null;
}

const versionFor = (type) => (type === 'AI_ASSISTANT' ? AI_POLICY_VERSION : CURRENT_POLICY_VERSION);

/**
 * Records a grant (a new row) or a withdrawal (closes the open grants).
 * @returns {{ recorded: boolean, id?: string, withdrawn?: number }}
 */
export async function recordConsent({
  userId, consentType, granted = true, policyVersion, ip = null, userAgent = null, source = 'app', metadata = {},
}, db = pool) {
  const type = normaliseConsentType(consentType);
  const id = Number(userId);
  if (!type) throw Object.assign(new Error(`Unknown consent type: ${consentType}`), { status: 400, code: 'CONSENT_TYPE_UNKNOWN' });
  if (!Number.isSafeInteger(id) || id <= 0) throw Object.assign(new Error('Unknown user'), { status: 400 });

  if (granted !== true) {
    const { rowCount } = await db.query(
      `UPDATE patient_consents SET consented = FALSE, withdrawn_at = NOW(), updated_at = NOW()
        WHERE user_id = $1 AND consent_type = $2 AND consented = TRUE AND withdrawn_at IS NULL`,
      [id, type]
    );
    return { recorded: true, withdrawn: rowCount };
  }

  const { rows: [row] } = await db.query(
    `INSERT INTO patient_consents
       (id, user_id, consent_type, consent_category, consented, consented_at, policy_version,
        ip_address, user_agent, consent_method, metadata, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 'explicit', TRUE, NOW(), $3, $4, $5, 'digital', $6::jsonb, NOW(), NOW())
     RETURNING id`,
    [id, type, String(policyVersion || versionFor(type)).slice(0, 60),
      ip ? String(ip).slice(0, 64) : null, userAgent ? String(userAgent).slice(0, 500) : null,
      JSON.stringify({ source, ...metadata })]
  );
  return { recorded: true, id: row.id };
}

/**
 * At sign-up: records DATA_PROCESSING and SENSITIVE_DATA only if the request
 * carries the person's acceptance. Never throws (sign-up must not fail on it).
 * @returns {Promise<boolean>} whether consent was recorded
 */
export async function recordSignupConsent({ userId, req, source }, db = pool) {
  try {
    const body = req?.body || {};
    const accepted = body.consent?.accepted === true || body.consentAccepted === true;
    if (!accepted) return false;
    const version = String(body.consent?.version || body.consentVersion || CURRENT_POLICY_VERSION).slice(0, 60);
    for (const consentType of REQUIRED_TYPES) {
      await recordConsent({
        userId, consentType, granted: true, policyVersion: version,
        ip: req?.ip, userAgent: req?.get?.('user-agent'), source: `signup:${source}`,
      }, db);
    }
    return true;
  } catch (error) {
    console.error(`[consent] sign-up consent not recorded for user ${userId}: ${error.message}`);
    return false;
  }
}

/** Latest open grant per type. */
async function openGrants(userId, db) {
  const { rows } = await db.query(
    `SELECT DISTINCT ON (consent_type) consent_type, policy_version, consented_at
       FROM patient_consents
      WHERE user_id = $1 AND consented = TRUE AND withdrawn_at IS NULL
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY consent_type, consented_at DESC`,
    [Number(userId)]
  );
  return new Map(rows.map((r) => [r.consent_type, r]));
}

export async function hasConsent(userId, consentType, db = pool) {
  const type = normaliseConsentType(consentType);
  if (!type) return false;
  const grant = (await openGrants(userId, db)).get(type);
  return Boolean(grant && grant.policy_version === versionFor(type));
}

/**
 * What the app should ask for: required consents missing or given for an older
 * policy version, plus the state of every type as a simple map.
 */
export async function consentStatus(userId, db = pool) {
  const grants = await openGrants(userId, db);
  const current = (type) => {
    const g = grants.get(type);
    return Boolean(g && g.policy_version === versionFor(type));
  };
  const missing = REQUIRED_TYPES.filter((t) => !current(t));
  const consents = Object.fromEntries([...CONSENT_TYPES].map((t) => [t, current(t)]));
  return {
    policyVersion: CURRENT_POLICY_VERSION,
    aiAssistantPolicyVersion: AI_POLICY_VERSION,
    required: missing,
    complete: missing.length === 0,
    consents,
  };
}

export default {
  CURRENT_POLICY_VERSION, AI_POLICY_VERSION, REQUIRED_TYPES, normaliseConsentType,
  recordConsent, recordSignupConsent, hasConsent, consentStatus,
};
