import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';

/**
 * Audit M20: social login used to hand the app a 30-day token and a refresh
 * token inside mysmarthealth://oauth-callback?token=…, a link any Android app
 * can claim. With PKCE the link carries only a one-time code that is useless
 * without the verifier, which never leaves the phone.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-oauth-state';

const store = new Map();
const fakeRedis = {
  set: async (k, v, _ex, _ttl, nx) => { if (nx === 'NX' && store.has(k)) return null; store.set(k, v); return 'OK'; },
  multi() {
    const ops = [];
    const m = {
      get(k) { ops.push(['get', k]); return m; },
      del(k) { ops.push(['del', k]); return m; },
      exec: async () => ops.map(([op, k]) => (op === 'get' ? [null, store.get(k) ?? null] : [null, store.delete(k) ? 1 : 0])),
    };
    return m;
  },
};
jest.unstable_mockModule('../config/redis.js', () => ({ default: fakeRedis, redisClient: fakeRedis }));
jest.unstable_mockModule('../middleware/rateLimiter.middleware.js', () => ({ authLimiter: (req, res, next) => next() }));
jest.unstable_mockModule('../api/v2/auth.utils.js', () => ({ generateRefreshToken: () => 'refresh-token-xyz' }));
jest.unstable_mockModule('passport', () => ({
  default: {
    authenticate: (provider, options, callback) => (req, res) => {
      if (callback) return callback(null, { user: { id: 9, email: 'p@example.invalid', role: 'patient' } });
      return res.json({ provider, options });
    },
  },
}));

const handoff = await import('../services/oauth-handoff.service.js');
const { default: oauthRouter } = await import('../routes/oauth.route.js');
const app = express();
app.use(express.json());
app.use('/api/auth', oauthRouter);

const VERIFIER = crypto.randomBytes(48).toString('base64url');            // 64 chars
const CHALLENGE = crypto.createHash('sha256').update(VERIFIER).digest('base64url');
const SCHEME = 'mysmarthealth://oauth-callback';

async function startMobile(query) {
  const res = await request(app).get('/api/auth/google').query({ mobile_redirect_uri: SCHEME, ...query });
  return res;
}
async function signInVia(state) {
  const res = await request(app).get('/api/auth/google/callback').query({ state, code: 'provider-code' });
  return res.headers.location || '';
}
const params = (location) => new URL(location.replace(/^mysmarthealth:\/\//, 'https://app/')).searchParams;

beforeEach(() => { store.clear(); delete process.env.OAUTH_REQUIRE_PKCE; });
afterEach(() => { delete process.env.OAUTH_REQUIRE_PKCE; });

describe('the PKCE hand-off', () => {
  it('the link back to the app carries a one-time code and the app\'s state, never a token', async () => {
    const start = await startMobile({ state: 'app-state-1', code_challenge: CHALLENGE, code_challenge_method: 'S256' });
    const location = await signInVia(start.body.options.state);
    expect(location.startsWith(SCHEME)).toBe(true);
    const q = params(location);
    expect(q.get('code')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(q.get('state')).toBe('app-state-1');
    expect(location).not.toMatch(/token=|refreshToken=|refresh-token-xyz/);
  });

  it('the code plus the verifier gets the tokens, exactly once', async () => {
    const start = await startMobile({ state: 's', code_challenge: CHALLENGE });
    const code = params(await signInVia(start.body.options.state)).get('code');
    const first = await request(app).post('/api/auth/oauth/exchange').send({ code, code_verifier: VERIFIER });
    expect(first.status).toBe(200);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(first.body).toMatchObject({ success: true, refreshToken: 'refresh-token-xyz', userType: 'patient', provider: 'google' });
    expect(first.body.token.split('.')).toHaveLength(3);
    const again = await request(app).post('/api/auth/oauth/exchange').send({ code, code_verifier: VERIFIER });
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('INVALID_GRANT');
  });

  it('an app that intercepted the link cannot redeem it — and its attempt burns the code', async () => {
    const start = await startMobile({ state: 's', code_challenge: CHALLENGE });
    const code = params(await signInVia(start.body.options.state)).get('code');
    const thief = await request(app).post('/api/auth/oauth/exchange').send({ code, code_verifier: crypto.randomBytes(48).toString('base64url') });
    expect(thief.status).toBe(400);
    const owner = await request(app).post('/api/auth/oauth/exchange').send({ code, code_verifier: VERIFIER });
    expect(owner.status).toBe(400);
  });

  it('a tampered state never sends anything to the app scheme', async () => {
    const start = await startMobile({ state: 's', code_challenge: CHALLENGE });
    const [body, mac] = start.body.options.state.split('.');
    const forged = JSON.parse(Buffer.from(body, 'base64url').toString());
    forged.codeChallenge = crypto.createHash('sha256').update('attacker-verifier-attacker-verifier-attacker').digest('base64url');
    const location = await signInVia(`${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${mac}`);
    expect(location.startsWith(SCHEME)).toBe(false);
  });

  it('refuses a malformed challenge, a non-S256 method, and a challenge without state', async () => {
    expect(params((await startMobile({ state: 's', code_challenge: 'short' })).headers.location).get('error')).toBe('invalid_pkce');
    expect(params((await startMobile({ state: 's', code_challenge: CHALLENGE, code_challenge_method: 'plain' })).headers.location).get('error')).toBe('invalid_pkce');
    expect(params((await startMobile({ code_challenge: CHALLENGE })).headers.location).get('error')).toBe('state_required');
  });
});

describe('the legacy hand-off, until the app is updated', () => {
  it('still works while OAUTH_REQUIRE_PKCE is off (so the current app keeps signing in)', async () => {
    const start = await startMobile({ state: 'old-app' });
    const location = await signInVia(start.body.options.state);
    expect(location.startsWith(SCHEME)).toBe(true);
    expect(params(location).get('refreshToken')).toBe('refresh-token-xyz');
  });

  it('is refused once OAUTH_REQUIRE_PKCE=true, at the start and at the callback', async () => {
    const before = await startMobile({ state: 'old-app' });
    process.env.OAUTH_REQUIRE_PKCE = 'true';
    expect(params((await startMobile({ state: 'old-app' })).headers.location).get('error')).toBe('pkce_required');
    const location = await signInVia(before.body.options.state);
    expect(location).not.toMatch(/token=/);
    expect(params(location).get('error')).toBe('pkce_required');
  });
});

describe('the hand-off service', () => {
  it('rejects a state older than 15 minutes, and a bad signature', () => {
    const state = handoff.signState({ mobileRedirectUri: SCHEME });
    expect(handoff.verifyState(state)).toMatchObject({ mobileRedirectUri: SCHEME });
    expect(handoff.verifyState(state, { maxAgeSeconds: -1 })).toBeNull();
    expect(handoff.verifyState(`${state.split('.')[0]}.AAAA`)).toBeNull();
    expect(handoff.verifyState('not-a-state')).toBeNull();
  });

  it('refuses a malformed code or verifier without touching storage', async () => {
    await expect(handoff.redeemHandoff({ code: 'x', codeVerifier: VERIFIER }, fakeRedis)).resolves.toEqual({ ok: false, code: 'INVALID_GRANT' });
    await expect(handoff.redeemHandoff({ code: 'a'.repeat(43), codeVerifier: 'too-short' }, fakeRedis)).resolves.toEqual({ ok: false, code: 'INVALID_VERIFIER' });
  });
});
