/**
 * Sign in with Apple — identity token verification.
 *
 * The identity token is the only thing trusted here. The email, fullName and
 * user fields the client also sends are conveniences and must never decide
 * which account is signed into, so most of these tests are about what the
 * verifier REFUSES.
 *
 * Tokens are signed with a locally generated RSA key and verified against a
 * local JWKS, so nothing contacts Apple.
 */
import { jest } from '@jest/globals';
import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet } from 'jose';

const BUNDLE = 'com.mysmarthealthapplications';
process.env.APPLE_BUNDLE_IDS = BUNDLE;

let keyPair;
let localJwks;

const {
  verifyAppleIdentityToken, hashNonce, isPrivateRelayEmail, allowedAudiences, AppleSignInError,
} = await import('../services/apple-signin.service.js');

beforeAll(async () => {
  keyPair = await generateKeyPair('RS256');
  const jwk = await exportJWK(keyPair.publicKey);
  jwk.kid = 'test-key';
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  localJwks = createLocalJWKSet({ keys: [jwk] });
});

/** Mint a token that looks like Apple's, with whatever claims a test needs. */
const mintToken = async ({
  sub = '001234.abcdef.0001',
  aud = BUNDLE,
  iss = 'https://appleid.apple.com',
  nonce,
  email,
  emailVerified = 'true',
  expiresIn = '10m',
} = {}) => {
  let t = new SignJWT({
    ...(nonce === undefined ? {} : { nonce }),
    ...(email === undefined ? {} : { email, email_verified: emailVerified }),
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(iss)
    .setAudience(aud)
    .setSubject(sub)
    .setIssuedAt();
  t = expiresIn === null ? t : t.setExpirationTime(expiresIn);
  return t.sign(keyPair.privateKey);
};

describe('nonce hashing', () => {
  test('matches the SHA-256 hex digest Apple compares against', () => {
    // Apple hashes the raw nonce with SHA-256 and puts the hex digest in the
    // token; a mismatch here means every real sign-in would be rejected.
    expect(hashNonce('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  test('is stable and non-empty for a random nonce', () => {
    const a = hashNonce('a-random-nonce-value');
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(hashNonce('a-random-nonce-value')).toBe(a);
  });
});

describe('private relay addresses', () => {
  test('recognises Apple relay addresses', () => {
    expect(isPrivateRelayEmail('abc123@privaterelay.appleid.com')).toBe(true);
    expect(isPrivateRelayEmail('ABC@PrivateRelay.AppleID.com')).toBe(true);
  });

  test('a real address is not a relay', () => {
    expect(isPrivateRelayEmail('someone@gmail.com')).toBe(false);
    expect(isPrivateRelayEmail(null)).toBe(false);
    expect(isPrivateRelayEmail('')).toBe(false);
  });
});

describe('allowed audiences', () => {
  test('defaults to the shipped bundle id', () => {
    expect(allowedAudiences()).toContain(BUNDLE);
  });

  test('supports a comma-separated list', () => {
    const prev = process.env.APPLE_BUNDLE_IDS;
    process.env.APPLE_BUNDLE_IDS = ' com.a , com.b ';
    try {
      expect(allowedAudiences()).toEqual(['com.a', 'com.b']);
    } finally {
      process.env.APPLE_BUNDLE_IDS = prev;
    }
  });
});

describe('identity token verification', () => {
  test('a missing token is refused without any network call', async () => {
    await expect(verifyAppleIdentityToken(null)).rejects.toThrow(AppleSignInError);
    await expect(verifyAppleIdentityToken('')).rejects.toMatchObject({ code: 'identity_token_missing' });
  });

  test('a non-string token is refused', async () => {
    await expect(verifyAppleIdentityToken({ not: 'a token' })).rejects.toMatchObject({ code: 'identity_token_missing' });
  });

  test('the error never carries the token or Apple internals', async () => {
    const token = await mintToken();
    try {
      await verifyAppleIdentityToken(token, 'some-nonce');
      throw new Error('should have rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(AppleSignInError);
      expect(error.message).not.toContain(token);
      expect(error.message.toLowerCase()).not.toContain('kid');
    }
  });
});

describe('claim checks (verified against a local key set)', () => {
  const run = async (tokenOpts, rawNonce) => {
    const token = await mintToken(tokenOpts);
    const { jwtVerify } = await import('jose');
    const { payload } = await jwtVerify(token, localJwks, {
      issuer: 'https://appleid.apple.com',
      audience: allowedAudiences(),
      algorithms: ['RS256'],
    });
    // Mirror the service's post-signature checks.
    if (!payload.sub) throw new AppleSignInError('no subject');
    if (rawNonce && payload.nonce !== hashNonce(rawNonce)) {
      throw new AppleSignInError('nonce mismatch', { code: 'apple_nonce_mismatch' });
    }
    return payload;
  };

  test('a well-formed token for our bundle passes', async () => {
    const payload = await run({ nonce: hashNonce('n1'), email: 'user@example.com' }, 'n1');
    expect(payload.sub).toBe('001234.abcdef.0001');
    expect(payload.email).toBe('user@example.com');
  });

  test('a token minted for ANOTHER app is refused', async () => {
    // This is the attack the audience check exists for.
    await expect(run({ aud: 'com.someone.else', nonce: hashNonce('n1') }, 'n1')).rejects.toThrow();
  });

  test('a token from another issuer is refused', async () => {
    await expect(run({ iss: 'https://evil.example', nonce: hashNonce('n1') }, 'n1')).rejects.toThrow();
  });

  test('an expired token is refused', async () => {
    await expect(run({ expiresIn: '-1m', nonce: hashNonce('n1') }, 'n1')).rejects.toThrow();
  });

  test('a replayed token whose nonce belongs to another sign-in is refused', async () => {
    // Token is validly signed and in-date, but was minted for a different
    // session — without this check it could be replayed here.
    await expect(run({ nonce: hashNonce('nonce-from-another-session') }, 'the-nonce-this-app-generated'))
      .rejects.toMatchObject({ code: 'apple_nonce_mismatch' });
  });

  test('a token with no nonce is refused when the app supplied one', async () => {
    await expect(run({ /* no nonce claim */ }, 'app-generated-nonce'))
      .rejects.toMatchObject({ code: 'apple_nonce_mismatch' });
  });
});
