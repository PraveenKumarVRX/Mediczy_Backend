/**
 * medstar-crm 1c37423, merged in Phase 1: Business Heads invite the front line only, call-centre scripts are
 * edited by managers only, and the call-centre / field migration gives every new user reference its uid twin.
 */
import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const query = jest.fn(async () => ({ rows: [], rowCount: 0 }));
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query, connect: jest.fn() } }));

// Tenant 11's team: 2 = admin (crmRole set), 3 = older admin login (isAdmin flag, no crmRole),
// 4 = another Business Head, 5 = field executive, 6 = the calling Business Head.
const TEAM = {
  2: { id: 2, isAdmin: false, metadata: { isCRM: true, tenantId: 11, crmRole: 'admin' } },
  3: { id: 3, isAdmin: true, metadata: { isCRM: true, tenantId: 11 } },
  4: { id: 4, isAdmin: false, metadata: { isCRM: true, tenantId: 11, crmRole: 'business_head' } },
  5: { id: 5, isAdmin: false, metadata: { isCRM: true, tenantId: 11, crmRole: 'sales_rep' } },
  6: { id: 6, isAdmin: false, metadata: { isCRM: true, tenantId: 11, crmRole: 'business_head' } },
};
const updated = jest.fn(async () => {});
const created = jest.fn(async (row) => ({ id: 99, ...row, metadata: row.metadata }));
jest.unstable_mockModule('../models/user.model.intelligent.js', () => ({ default: {
  findOne: jest.fn(async ({ where }) => {
    if (where.email) return null;
    const u = TEAM[where.id];
    return u ? { ...u, status: 'active', update: updated, toJSON: () => u } : null;
  }),
  findAll: jest.fn(async () => Object.values(TEAM)),
  create: created,
} }));
jest.unstable_mockModule('../middleware/crm.middleware.js', () => ({
  authCRM: (req, _res, next) => {
    const role = req.get('x-role');
    req.crmUser = { id: role === 'admin' ? 2 : 6, tenantId: 11, tenantUid: 'H11AAA', crmRole: role, isAdmin: role === 'admin' };
    next();
  },
  requireCRMCapability: () => (_req, _res, next) => next(),
}));
jest.unstable_mockModule('../services/password-reset.service.js', () => ({ default: { requestReset: jest.fn(async () => ({})) } }));

const { default: teamRouter } = await import('../routes/crm-team.route.js');
const cc = await import('../services/crm-call-centre.service.js');
const migration = await import('../migrations/20261116000200-crm-call-centre-and-field.migration.js');

const app = express();
app.use(express.json());
app.use('/team', teamRouter);
const as = (role) => ({
  patch: (id, body) => request(app).patch(`/team/users/${id}`).set('x-role', role).send(body),
  post: (body) => request(app).post('/team/users').set('x-role', role).send({ email: 'new.person@example.test', firstName: 'New', lastName: 'Person', phone: '+910000000000', ...body }),
});

afterEach(() => jest.clearAllMocks());

describe('Business Heads manage the front line only', () => {
  it('may change a field executive', async () => {
    expect((await as('business_head').patch(5, { status: 'inactive' })).status).toBe(200);
    expect(updated).toHaveBeenCalled();
  });

  it.each([[2, 'an admin'], [3, 'an older admin login with no crmRole'], [4, 'another Business Head'], [6, 'their own login']])(
    'may not change user %s (%s)', async (id) => {
      expect((await as('business_head').patch(id, { status: 'inactive' })).status).toBe(403);
      expect(updated).not.toHaveBeenCalled();
    });

  it('may not promote a field executive to Business Head or admin', async () => {
    expect((await as('business_head').patch(5, { crmRole: 'business_head' })).status).toBe(403);
    expect((await as('business_head').patch(5, { crmRole: 'admin' })).status).toBe(403);
    expect(updated).not.toHaveBeenCalled();
  });

  it('may not invite admins or Business Heads', async () => {
    expect((await as('business_head').post({ crmRole: 'admin' })).status).toBe(403);
    expect((await as('business_head').post({ crmRole: 'business_head' })).status).toBe(403);
    expect(created).not.toHaveBeenCalled();
    expect((await as('business_head').post({ crmRole: 'telecaller' })).status).not.toBe(403); // the front line is fine
  });

  it('admins still manage everyone', async () => {
    expect((await as('admin').patch(4, { status: 'inactive' })).status).toBe(200);
    expect((await as('admin').patch(3, { status: 'inactive' })).status).toBe(200);
  });

  it('other roles cannot reach team management', async () => {
    for (const role of ['marketing_head', 'marketing', 'telecaller', 'conversion', 'sales_rep']) {
      expect((await request(app).get('/team/users').set('x-role', role)).status).toBe(403);
    }
  });
});

describe('call-centre scripts and quick answers', () => {
  const user = (crmRole) => ({ id: 9, tenantId: 11, tenantUid: 'H11AAA', crmRole, isAdmin: crmRole === 'admin' });
  it.each(['telecaller', 'conversion', 'marketing', 'sales_rep'])('%s cannot add, edit or delete them', async (role) => {
    await expect(cc.saveQuickAnswer(user(role), { title: 't', body: 'b' })).rejects.toMatchObject({ statusCode: 403 });
    await expect(cc.saveQuickAnswer(user(role), { title: 't', body: 'b' }, 4)).rejects.toMatchObject({ statusCode: 403 });
    await expect(cc.deleteQuickAnswer(user(role), 4)).rejects.toMatchObject({ statusCode: 403 });
    expect(query).not.toHaveBeenCalled();
  });
  it('a manager edits only their own tenant\'s answers', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 4 }] });
    await cc.saveQuickAnswer(user('business_head'), { title: 't', body: 'b' }, 4);
    expect(query.mock.calls[0][0]).toMatch(/WHERE id=\$8 AND tenant_id=\$9/);
    expect(query.mock.calls[0][1].slice(-1)).toEqual([11]);
  });
});

describe('call-centre and field migration', () => {
  const run = async () => {
    const client = { query: jest.fn(async (sql) => (/AS present/.test(sql) ? { rows: [{ present: true }] } : { rows: [] })) };
    await migration.up(client);
    return client.query.mock.calls.map(([sql, params]) => ({ sql: sql.replace(/\s+/g, ' ').trim(), params }));
  };

  it('is idempotent and runs inside the caller\'s transaction (Medstar already applied the SQL by hand)', async () => {
    const sqls = await run();
    expect(sqls.some(({ sql }) => /^(BEGIN|COMMIT)/.test(sql))).toBe(false);
    for (const { sql } of sqls) if (/^(ALTER TABLE \S+ ADD|CREATE (UNIQUE )?INDEX|CREATE TABLE)/.test(sql)) expect(sql).toMatch(/IF NOT EXISTS/);
  });

  it('gives every new user reference its uid twin, after the column exists', async () => {
    const sqls = await run();
    const attached = sqls.filter(({ sql }) => sql.startsWith('SELECT attach_uid_reference')).map(({ params }) => params);
    expect(attached).toEqual(migration.USER_REFERENCES.map(([t, i, u]) => [t, i, u, 'users']));
    const lastDdl = Math.max(...sqls.map(({ sql }, i) => (/^(CREATE|ALTER)/.test(sql) ? i : -1)));
    expect(sqls.findIndex(({ sql }) => sql.startsWith('SELECT attach_uid_reference'))).toBeGreaterThan(lastDdl);
  });

  it('covers every integer user column the SQL adds', async () => {
    const sqls = (await run()).map(({ sql }) => sql).join('\n');
    for (const col of ['user_id', 'created_by', 'updated_by', 'from_user_id', 'to_user_id', 'moved_by', 'reviewed_by', 'assigned_to']) {
      expect(sqls).toContain(col);
      expect(migration.USER_REFERENCES.some(([, c]) => c === col)).toBe(true);
    }
  });
});
