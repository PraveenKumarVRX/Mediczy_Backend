/**
 * Shared pieces of the Medstar CRM merge (Phase 1): runtime branding for crm-web, the exact-match Team
 * permission fix, and the migration that replaces Medstar's hand-run SQL.
 */
import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

process.env.JWT_SECRET ||= 'test-only-secret-for-crm-merge-suite-0123456789';
const query = jest.fn(async () => ({ rows: [] }));
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query, connect: jest.fn() } }));
jest.unstable_mockModule('../models/user.model.intelligent.js', () => ({ default: {} }));
jest.unstable_mockModule('../services/mobile-tenant-membership.service.js', () => ({ mobileUserBelongsToTenant: jest.fn() }));

const { buildCrmBrandingRouter, whatsappTemplatePrefix } = await import('../routes/crm-branding.route.js');
const migration = await import('../migrations/20261116000100-crm-medstar-modules.migration.js');
const { requirePermission } = await import('../middleware/team.middleware.js');

afterEach(() => jest.clearAllMocks());

describe('GET /api/branding for the CRM web app', () => {
  const serve = (tenant, templatePrefix) => {
    const app = express();
    app.use('/api/branding', buildCrmBrandingRouter(tenant, templatePrefix ? { templatePrefix } : undefined));
    return request(app).get('/api/branding');
  };

  it('returns the installation\'s name, logo, support address and template prefix', async () => {
    const res = await serve({ id: 70, name: 'Medstar Hospitals', branding: { logo_url: '/brand/m.svg', support_email: 'help@example.test' } },
      async (tenantId) => (tenantId === 70 ? 'medstar_' : ''));
    expect(res.body).toEqual({ name: 'Medstar Hospitals', logoUrl: '/brand/m.svg', faviconUrl: null, primaryColor: null,
      secondaryColor: null, supportEmail: 'help@example.test', templatePrefix: 'medstar_' });
  });

  it('prefers a display name and falls back to the settings support address', async () => {
    const res = await serve({ id: 3, name: 'Legal Name Pvt Ltd', branding: { display_name: 'Rado Labs' }, settings: { supportEmail: 's@example.test' } }, async () => '');
    expect(res.body).toMatchObject({ name: 'Rado Labs', supportEmail: 's@example.test', templatePrefix: '' });
  });

  it('still answers when the template prefix cannot be read', async () => {
    const res = await serve({ id: 3, name: 'X' }, async () => { throw new Error('db down'); });
    expect(res.status).toBe(200);
    expect(res.body.templatePrefix).toBe('');
  });

  it('derives the prefix from the configured Gupshup app name only', async () => {
    query.mockResolvedValueOnce({ rows: [{ config: { provider: 'gupshup', appName: 'Medstar Hospitals' } }] });
    expect(await whatsappTemplatePrefix(70)).toBe('medstar_hospitals_');
    query.mockResolvedValueOnce({ rows: [{ config: JSON.stringify({ provider: 'meta', appName: 'X' }) }] });
    expect(await whatsappTemplatePrefix(70)).toBe('');
    query.mockResolvedValueOnce({ rows: [] });
    expect(await whatsappTemplatePrefix(70)).toBe('');
    expect(query.mock.calls[0][0]).not.toMatch(/encrypted_credentials/);
  });
});

describe('Team named permissions match exactly', () => {
  const run = async (permissions, required) => {
    const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
    const next = jest.fn();
    await requirePermission(required)({ teamUser: { role: 'team', permissions } }, res, next);
    return next.mock.calls.length === 1;
  };

  it('a narrower grant no longer satisfies a broader requirement', async () => {
    expect(await run(['Field Force'], 'Field Force Manager')).toBe(false);
    expect(await run(['Field Force Manager'], 'Field Force')).toBe(false);
    expect(await run(['Audit'], ['Audit Access', 'Audit Logs'])).toBe(false);
  });

  it('exact grants still pass, ignoring case and surrounding spaces', async () => {
    expect(await run(['Field Force Manager'], 'Field Force Manager')).toBe(true);
    expect(await run([' field force '], 'Field Force')).toBe(true);
    expect(await run(['Audit Logs'], ['Audit Access', 'Audit Logs'])).toBe(true);
  });
});

describe('CRM Medstar modules migration', () => {
  const statements = async (present = true) => {
    const client = { query: jest.fn(async (sql) => (/attach_uid_reference'\) AS present/.test(sql) ? { rows: [{ present }] } : { rows: [] })) };
    await migration.up(client);
    return client.query.mock.calls.map(([sql, params]) => ({ sql: sql.replace(/\s+/g, ' ').trim(), params }));
  };

  it('refuses to run without the entity uid rule', async () => {
    await expect(statements(false)).rejects.toThrow(/attach_uid_reference\(\) is missing/);
  });

  it('runs inside the caller\'s transaction and is idempotent', async () => {
    const sqls = await statements();
    expect(sqls.some(({ sql }) => /^(BEGIN|COMMIT|ROLLBACK)/.test(sql))).toBe(false);
    sqls.forEach(({ sql }, i) => {
      const constraint = /^ALTER TABLE (\S+) ADD CONSTRAINT (\S+)/.exec(sql);
      // A replaced check constraint is dropped (IF EXISTS) right before it is added again.
      if (constraint) return expect(sqls[i - 1].sql).toBe(`ALTER TABLE ${constraint[1]} DROP CONSTRAINT IF EXISTS ${constraint[2]}`);
      if (/^(ALTER TABLE \S+ ADD|CREATE (UNIQUE )?INDEX|CREATE TABLE)/.test(sql)) expect(sql).toMatch(/IF NOT EXISTS/);
    });
  });

  it('gives the referring user its uid twin (entity uid rule 5)', async () => {
    const sqls = await statements();
    expect(sqls).toContainEqual({ sql: 'SELECT attach_uid_reference($1, $2, $3, $4)', params: ['crm_leads_v2', 'referred_by_user_id', 'referred_by_user_uid', 'users'] });
    const addCol = sqls.findIndex(({ sql }) => /ADD COLUMN IF NOT EXISTS referred_by_user_id/.test(sql));
    const attach = sqls.findIndex(({ sql }) => /attach_uid_reference\(\$1/.test(sql));
    expect(addCol).toBeGreaterThan(-1);
    expect(attach).toBeGreaterThan(addCol);
  });

  it('creates the channel event log without message bodies', async () => {
    const create = (await statements()).find(({ sql }) => /CREATE TABLE IF NOT EXISTS crm_channel_events/.test(sql)).sql;
    expect(create).not.toMatch(/\b(body|message_text|content)\b/);
  });
});
