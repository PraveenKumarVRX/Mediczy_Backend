/**
 * The app-store review path: a demo tenant bound to a review-only origin, and
 * the reviewer patient account that signs in against it.
 *
 * These assertions are what stand in for applying the production write — the
 * configuration `scripts/qa/provision-review-mobile-origin.mjs` would store is
 * checked here against the server's own validator, the discovery projection the
 * HTTP endpoint uses, and the exact rules the mobile client enforces on the
 * payload it receives.
 */
import { describe, test, expect } from '@jest/globals';

import { validateMobileApps, tenantMobileDiscovery, mobileOrigin } from '../services/tenant-mobile-apps.service.js';
import { buildTenantMobileContext } from '../middleware/tenant-mobile-context.js';
import { buildConfiguration } from '../scripts/qa/provision-review-mobile-origin.mjs';
import { generatePassword } from '../scripts/qa/ensure-play-reviewer-account.mjs';

const REVIEW_ORIGIN = 'https://demo.mediqzy.com';

/** Tenant 11 ("Smart Hospital", metadata.demo = 'true') as the DB holds it. */
function demoTenant(overrides = {}) {
  const config = validateMobileApps(buildConfiguration(REVIEW_ORIGIN));
  return {
    id: 11,
    name: 'Smart Hospital',
    status: 'active',
    metadata: { demo: 'true' },
    settings: { mobileApps: config },
    ...overrides,
  };
}

/**
 * `validateDiscovery` from mobile/src/connection/core.ts, transcribed. The app
 * throws "This server does not support this app version or product" on any
 * failure, so a server-side change that trips one of these is a dead first
 * screen for the reviewer — the exact outcome this test exists to prevent.
 */
function clientAcceptsDiscovery(d, product) {
  return Boolean(
    d && d.product === 'mediczy-mobile' && d.mobileApiVersion === 1 && d.apiBasePath === '/api'
    && typeof d.deploymentId === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(d.deploymentId)
    && typeof d.displayName === 'string' && d.displayName.trim() && d.displayName.length <= 100
    && Array.isArray(d.products)
    && d.products.some((p) => p?.id === product && ['disabled', 'open'].includes(p.registration)),
  );
}

describe('app-store review mobile origin', () => {
  test('the configuration we would write passes the server validator', () => {
    const config = validateMobileApps(buildConfiguration(REVIEW_ORIGIN));
    expect(config.enabled).toBe(true);
    expect(config.origin).toBe(REVIEW_ORIGIN);
    expect(config.apps).toEqual([{
      product: 'patient',
      name: 'Mediczy',
      appId: 'com.mysmarthealthtech.mediczy',
      registration: 'disabled',
    }]);
    // deploymentId is minted by the validator, never by the script.
    expect(config.deploymentId).toMatch(/^[0-9a-f-]{36}$/);
    expect(config.revision).toBe(1);
  });

  test('the appId matches the shipped Android package and iOS bundle id', () => {
    // mobile/app.json: android.package === ios.bundleIdentifier === this value.
    // A mismatch is invisible server-side but means the store listing and the
    // configured app are different artefacts.
    expect(buildConfiguration(REVIEW_ORIGIN).apps[0].appId).toBe('com.mysmarthealthtech.mediczy');
  });

  test('discovery projects a payload the mobile client accepts for patient', () => {
    const discovery = tenantMobileDiscovery(demoTenant());
    expect(discovery).not.toBeNull();
    expect(discovery.displayName).toBe('Smart Hospital');
    expect(discovery.products).toEqual([{ id: 'patient', registration: 'disabled' }]);
    expect(clientAcceptsDiscovery(discovery, 'patient')).toBe(true);
    // Only the patient app is bound, so the other products stay unavailable.
    for (const product of ['phlebo', 'crm', 'smart-force']) {
      expect(clientAcceptsDiscovery(discovery, product)).toBe(false);
    }
  });

  test('a non-active tenant stays dark — the medstar.mediqzy.com failure mode', () => {
    // Tenant 70 is configured and enabled but status='pending', which is why
    // that origin answers 503. Provisioning alone is not sufficient.
    expect(tenantMobileDiscovery(demoTenant({ status: 'pending' }))).toBeNull();
    expect(tenantMobileDiscovery(demoTenant({ status: 'suspended' }))).toBeNull();
  });

  test('binding the review origin cannot affect any other host', async () => {
    const resolve = async (origin) => (origin === REVIEW_ORIGIN ? demoTenant() : null);
    const context = buildTenantMobileContext(resolve);

    const run = (host, path) => new Promise((resolve2) => {
      const req = { path, get: (h) => (h.toLowerCase() === 'host' ? host : undefined) };
      const res = {
        statusCode: null,
        status(code) { this.statusCode = code; return this; },
        json() { resolve2({ req, status: this.statusCode }); return this; },
      };
      context(req, res, () => resolve2({ req, status: null }));
    });

    // The live host is untouched: no mobile tenant is attached, so patient,
    // team and CRM logins keep their existing contracts.
    for (const path of ['/api/patient/login', '/api/team/login', '/api/crm/login']) {
      const { req, status } = await run('app.mediqzy.com', path);
      expect(status).toBeNull();
      expect(req.mobileTenant).toBeUndefined();
    }

    // On the review origin the patient product binds...
    const patient = await run('demo.mediqzy.com', '/api/patient/login');
    expect(patient.status).toBeNull();
    expect(patient.req.mobileTenant).toMatchObject({ id: 11, product: 'patient' });

    // ...and the products that are NOT configured are refused there. This is
    // precisely why the review origin must not be app.mediqzy.com.
    for (const path of ['/api/team/login', '/api/crm/login', '/api/phlebotomy/auth/login']) {
      expect((await run('demo.mediqzy.com', path)).status).toBe(403);
    }
  });

  test('the bound origin forces the demo clinic and ignores a client-supplied one', async () => {
    const { buildMobilePatientBinding } = await import('../middleware/mobile-patient-binding.js');
    const binding = buildMobilePatientBinding({});
    const req = {
      path: '/login',
      mobileTenant: { id: 11, product: 'patient', config: demoTenant().settings.mobileApps },
      body: { clinic_id: '49', clinic_slug: 'madras-medical-mission', clinic_domain: 'evil.example', email: 'play.reviewer@mysmarthealth.in' },
    };
    await new Promise((resolve) => binding(req, { status: () => ({ json: () => resolve() }) }, resolve));
    // A reviewer (or anyone holding those credentials) cannot pivot to another
    // tenant by editing the request body.
    expect(req.body).toEqual({ clinic_id: '11', email: 'play.reviewer@mysmarthealth.in' });
  });

  test('self-registration stays closed on the demo organisation', async () => {
    const { buildMobilePatientBinding } = await import('../middleware/mobile-patient-binding.js');
    const binding = buildMobilePatientBinding({});
    const statuses = [];
    const req = { path: '/signup', mobileTenant: { id: 11, product: 'patient', config: demoTenant().settings.mobileApps }, body: {} };
    await new Promise((resolve) => {
      binding(req, { status(code) { statuses.push(code); return { json: () => resolve() }; } }, resolve);
    });
    expect(statuses).toEqual([403]);
  });

  test('mobileOrigin refuses anything that is not a bare https origin', () => {
    expect(mobileOrigin('https://demo.mediqzy.com')).toBe(REVIEW_ORIGIN);
    expect(mobileOrigin('https://demo.mediqzy.com/')).toBe(REVIEW_ORIGIN);
    for (const bad of [
      'http://demo.mediqzy.com',          // the app requires https
      'https://demo.mediqzy.com/api',     // path
      'https://demo.mediqzy.com?x=1',     // query
      'https://user:pw@demo.mediqzy.com', // credentials
      'demo.mediqzy.com',
    ]) expect(() => mobileOrigin(bad)).toThrow();
  });
});

describe('reviewer account password', () => {
  test('is long, mixed-class and free of characters that break retyping', () => {
    for (let i = 0; i < 200; i++) {
      const password = generatePassword();
      expect(password).toHaveLength(20);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[@#%*\-_=+:.?]/);
      // Quotes, backslash, backtick and whitespace would be mangled somewhere
      // between a shell, the Play Console form and an on-screen keyboard.
      expect(password).not.toMatch(/['"`\\\s]/);
      // l/1/I and O/0 are the characters a reviewer mistypes.
      expect(password).not.toMatch(/[lI1O0]/);
    }
  });

  test('does not repeat', () => {
    const seen = new Set(Array.from({ length: 500 }, () => generatePassword()));
    expect(seen.size).toBe(500);
  });
});
