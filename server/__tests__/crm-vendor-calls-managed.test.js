/**
 * CRM modules call outside vendors (Gupshup, TeleCMI, Tata Smartflo, tenant SMTP) only through
 * server/integrations/, so every call gets the kill switch, host allow-list, timeout and circuit breaker.
 * Added when the Medstar CRM modules were merged back (Phase 1); several of them called vendors directly.
 */
import { jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query: jest.fn(), connect: jest.fn() } }));

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GLOBS = [
  ['services', /^(crm-|hospital-crm-|gupshup-control|telecmi-control).*\.js$/],
  ['services/voice-providers', /\.js$/],
  ['routes', /^(crm[-.]|voice-webhooks|voice-connector).*\.js$/],
];
// Calls to Mediqzy's own internal services, not to an outside vendor.
const INTERNAL_ONLY = new Set(['routes/crm-underwriting.route.js']);

const files = GLOBS.flatMap(([dir, pattern]) =>
  fs.readdirSync(path.join(root, dir)).filter((name) => pattern.test(name)).map((name) => `${dir}/${name}`));

describe('CRM vendor calls go through the integration layer', () => {
  it('finds the CRM modules to check', () => {
    expect(files).toEqual(expect.arrayContaining([
      'services/gupshup-control.service.js', 'services/telecmi-control.service.js',
      'services/crm-channel-delivery.service.js', 'services/voice-providers/telecmi.js',
    ]));
  });

  it.each(files)('%s imports no raw HTTP or mail client', (file) => {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    expect(source).not.toMatch(/from ['"](axios|nodemailer|node-fetch|got|undici|twilio)['"]/);
  });

  it.each(files.filter((file) => !INTERNAL_ONLY.has(file)))('%s uses the managed fetch when it calls fetch', (file) => {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    if (!/(^|[^.\w])fetch\(/m.test(source)) return;
    expect(source).toMatch(/import \{[^}]*\bmanagedFetch as fetch\b[^}]*\} from '\.\.\/(\.\.\/)?integrations\/transport\.js'/);
  });

  it('knows the CRM calling vendors', async () => {
    const { integrationForUrl } = await import('../integrations/transport.js');
    expect(integrationForUrl('https://rest.telecmi.com/v2/user/all')?.id).toBe('telecmi');
    expect(integrationForUrl('https://api-smartflo.tatateleservices.com/v1/click_to_call')?.id).toBe('tata-smartflo');
    expect(integrationForUrl('https://partner.gupshup.io/partner/app/x/templates')?.id).toBe('gupshup');
  });
});
