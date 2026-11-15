import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Audit M22: consent must be versioned, timestamped and provable, recorded
 * only when actually given, and the AI assistant needs its own consent.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query: jest.fn() } }));
const consent = await import('../services/patient-consent.service.js');
const { requireAiAssistantConsent } = await import('../middleware/ai-consent.middleware.js');

const db = (rows = []) => {
  const calls = [];
  return { calls, query: jest.fn(async (sql, params) => { calls.push({ sql: sql.replace(/\s+/g, ' '), params }); return { rows: typeof rows === 'function' ? rows(sql) : rows, rowCount: 1 }; }) };
};

describe('recording consent', () => {
  it('a grant is explicit, digital, versioned and timestamped in patient_consents', async () => {
    const d = db([{ id: 'c1' }]);
    await consent.recordConsent({ userId: 7, consentType: 'marketing', granted: true, policyVersion: 'privacy-2026-11', ip: '1.2.3.4' }, d);
    const { sql, params } = d.calls[0];
    expect(sql).toMatch(/INSERT INTO patient_consents/);
    expect(sql).toMatch(/'explicit', TRUE, NOW\(\)/);
    expect(sql).toMatch(/'digital'/);
    expect(params.slice(0, 4)).toEqual([7, 'MARKETING', 'privacy-2026-11', '1.2.3.4']);
  });

  it('a withdrawal closes the open grants, it does not delete them', async () => {
    const d = db([]);
    await consent.recordConsent({ userId: 7, consentType: 'AI_ASSISTANT', granted: false }, d);
    expect(d.calls[0].sql).toMatch(/UPDATE patient_consents SET consented = FALSE, withdrawn_at = NOW\(\)/);
    expect(d.calls[0].sql).not.toMatch(/DELETE/);
  });

  it('refuses a consent type it does not know', async () => {
    await expect(consent.recordConsent({ userId: 7, consentType: 'everything', granted: true }, db())).rejects.toMatchObject({ code: 'CONSENT_TYPE_UNKNOWN' });
  });
});

describe('sign-up', () => {
  it('records nothing unless the person accepted', async () => {
    const d = db([{ id: 'x' }]);
    await expect(consent.recordSignupConsent({ userId: 7, req: { body: {} }, source: 'register' }, d)).resolves.toBe(false);
    await expect(consent.recordSignupConsent({ userId: 7, req: { body: { consent: { accepted: 'yes' } } }, source: 'register' }, d)).resolves.toBe(false);
    expect(d.calls).toHaveLength(0);
  });

  it('records account and health-data consent, with the version the app showed', async () => {
    const d = db([{ id: 'x' }]);
    const req = { body: { consent: { accepted: true, version: 'privacy-2026-11' } }, ip: '5.6.7.8', get: () => 'okhttp' };
    await expect(consent.recordSignupConsent({ userId: 7, req, source: 'apple' }, d)).resolves.toBe(true);
    expect(d.calls.map((c) => c.params[1])).toEqual(['DATA_PROCESSING', 'SENSITIVE_DATA']);
    expect(d.calls.every((c) => c.params[2] === 'privacy-2026-11')).toBe(true);
    expect(JSON.parse(d.calls[0].params[5])).toMatchObject({ source: 'signup:apple' });
  });

  it('never fails the sign-up', async () => {
    const broken = { query: jest.fn(async () => { throw new Error('db down'); }) };
    await expect(consent.recordSignupConsent({ userId: 7, req: { body: { consentAccepted: true } }, source: 'register' }, broken)).resolves.toBe(false);
  });
});

describe('status', () => {
  it('asks again when a consent was given for an older policy version', async () => {
    const d = db([
      { consent_type: 'DATA_PROCESSING', policy_version: consent.CURRENT_POLICY_VERSION },
      { consent_type: 'SENSITIVE_DATA', policy_version: 'privacy-2025-01' },
    ]);
    const s = await consent.consentStatus(7, d);
    expect(s.required).toEqual(['SENSITIVE_DATA']);
    expect(s.complete).toBe(false);
    expect(s.consents).toMatchObject({ DATA_PROCESSING: true, SENSITIVE_DATA: false, AI_ASSISTANT: false });
  });

  it('a Google/Facebook account with no consent is told to ask for both', async () => {
    const s = await consent.consentStatus(7, db([]));
    expect(s.required).toEqual(['DATA_PROCESSING', 'SENSITIVE_DATA']);
  });
});

describe('the AI assistant gate', () => {
  afterEach(() => { delete process.env.AI_CONSENT_REQUIRED; });
  const res = () => ({ status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });

  it('is off by default, so the live assistant keeps working until the app can ask', async () => {
    const next = jest.fn();
    await requireAiAssistantConsent({ user: { id: 7 } }, res(), next);
    expect(next).toHaveBeenCalled();
  });

  it('when on, refuses without consent and says what to ask for', async () => {
    process.env.AI_CONSENT_REQUIRED = 'true';
    const r = res();
    const next = jest.fn();
    await requireAiAssistantConsent({ user: { id: 7 } }, r, next);
    expect(next).not.toHaveBeenCalled();
    expect(r.code).toBe(403);
    expect(r.body).toMatchObject({ code: 'AI_CONSENT_REQUIRED', consentType: 'AI_ASSISTANT' });
  });
});

describe('wiring', () => {
  it('the privacy endpoint accepts the app\'s { consentType, granted }', () => {
    const r = readFileSync(join(ROOT, 'routes/privacy.route.js'), 'utf8');
    expect(r).toMatch(/typeof granted === 'boolean'/);
    expect(r).toMatch(/router\.get\('\/consents\/status'/);
  });
  it('every sign-up path records consent when given', () => {
    for (const f of ['controller/user.controller.js', 'routes/user.route.js', 'controller/apple-auth.controller.js']) {
      expect([f, readFileSync(join(ROOT, f), 'utf8').includes('recordSignupConsent({')]).toEqual([f, true]);
    }
  });
  it('the AI consult and symptom routes pass through the gate', () => {
    const m = readFileSync(join(ROOT, 'routes/medical-ai.route.js'), 'utf8');
    expect(m).toMatch(/router\.post\('\/consult', authUser, requireAiAssistantConsent/);
    expect(m).toMatch(/router\.post\('\/analyze-symptoms', authUser, requireAiAssistantConsent/);
  });
});
