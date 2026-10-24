import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const query = jest.fn();
const client = { query: jest.fn(), release: jest.fn() };
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query, connect: async () => client } }));
const allow = (req, res, next) => { req.user = { id: 7, tenantId: 11 }; req.crmUser = { id: 8, tenantId: 11 }; next(); };
jest.unstable_mockModule('../middleware/team.middleware.js', () => ({ authTeam: allow, requirePermission: () => allow }));
jest.unstable_mockModule('../middleware/crm.middleware.js', () => ({ authCRM: allow, requireCRMCapability: () => allow }));
jest.unstable_mockModule('../models/postgres/health-camp.model.postgres.js', () => ({ default: {} }));
const { default: field } = await import('../routes/field-force.route.js');
const { default: manager } = await import('../routes/crm-field-force.route.js');
const app = express(); app.use(express.json()); app.use('/field', field); app.use('/manager', manager);
beforeEach(() => { jest.clearAllMocks(); query.mockReset(); client.query.mockReset(); query.mockResolvedValue({ rows: [] }); client.query.mockResolvedValue({ rows: [] }); });

test('approved tour plans cannot be replaced', async () => {
 const r = await request(app).post('/field/tour-plans').send({ month: '2026-10-01', notes: 'replacement' });
 expect(r.status).toBe(409);
 expect(query.mock.calls[0][0]).toContain("field_tour_plans.status IN ('draft','rejected')");
 expect(query.mock.calls[0][0]).toContain('reviewed_by=NULL');
});
test.each([-1, 'abc-5000', null, true])('invalid contract value %s is rejected before writing', async value => {
 expect((await request(app).patch('/manager/leads/1/convert').send({ contract_value: value })).status).toBe(400);
 expect(query).not.toHaveBeenCalled();
});
test.each([-1, 'abc', null, true])('invalid approval amount %s is rejected', async value => {
 expect((await request(app).patch('/manager/expenses/1/approve').send({ approved_amount: value })).status).toBe(400);
 expect(query).not.toHaveBeenCalled();
});
test('approval amount cannot exceed the claim and zero is preserved', async () => {
 query.mockResolvedValue({ rows: [{ id: 1, approved_amount: 0 }] });
 expect((await request(app).patch('/manager/expenses/1/approve').send({ approved_amount: 0 })).status).toBe(200);
 expect(query.mock.calls[0][0]).toContain('$3 <= total_amount');
 expect(query.mock.calls[0][1][2]).toBe(0);
});
test.each(['exceptions', 'tour-plans'])('manager %s decision is tenant scoped and creates notification atomically', async resource => {
 query.mockResolvedValue({ rows: [{ id: 1 }] });
 expect((await request(app).patch(`/manager/approvals/${resource}/1/approve`).send({})).status).toBe(200);
 expect(query.mock.calls[0][0]).toContain('tenant_id=$4');
 expect(query.mock.calls[0][0]).toContain('INSERT INTO field_notifications');
 expect(query.mock.calls[0][1][3]).toBe(11);
});
test('quota transfer rejects nonexistent executives without debiting targets', async () => {
 expect((await request(app).post('/manager/targets/reallocate').send({ from_user_id: 99998, to_user_id: 99999, transfer_qty: 1 })).status).toBe(400);
 expect(client.query.mock.calls).toHaveLength(3);
 expect(client.query.mock.calls[2][0]).toBe('ROLLBACK');
 expect(client.release).toHaveBeenCalled();
});
test('quota transfer rejects insufficient source balance', async () => {
 client.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 7 }, { id: 9 }] }).mockResolvedValueOnce({ rows: [] });
 expect((await request(app).post('/manager/targets/reallocate').send({ from_user_id: 7, to_user_id: 9, transfer_qty: 10 })).status).toBe(409);
 expect(client.query.mock.calls[2][0]).toContain('>= $3 RETURNING id');
 expect(client.query.mock.calls[3][0]).toBe('ROLLBACK');
});
test('past planned visits are rejected', async () => {
 expect((await request(app).post('/field/visits').send({ entity_name: 'Hospital', purpose: 'other', planned_at: '2000-01-01' })).status).toBe(400);
 expect(query).not.toHaveBeenCalled();
});
test('attendance history uses the next month boundary for February', async () => {
 query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ count: 0 }] });
 expect((await request(app).get('/field/attendance/history?month=2026-02')).status).toBe(200);
 expect(query.mock.calls[0][1]).toEqual([7, '2026-02-01', '2026-02-01', 31, 0]);
 expect(query.mock.calls[0][0]).toContain("INTERVAL '1 month'");
});
test('daily report uses actual visit totals and one daily upsert on retry', async () => {
 query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ planned: '2', completed: '1', missed: '0' }] }).mockResolvedValueOnce({ rows: [{ id: 5 }] });
 const r = await request(app).post('/field/daily-report').send({ completed_visits: 999 });
 expect(r.status).toBe(201); expect(r.body.id).toBe(5);
 expect(query.mock.calls[2][1].slice(3, 6)).toEqual([2, 1, 0]);
 expect(query.mock.calls[2][0]).toContain('ON CONFLICT (user_id, report_date)');
});
test('expense dates normalize to the seven-character database month', async () => {
 query.mockResolvedValue({ rows: [{ id: 2 }] });
 expect((await request(app).post('/field/expenses').send({ claim_date: '2026-10-24', claim_type: 'travel', total_amount: 250 })).status).toBe(201);
 expect(query.mock.calls[0][1][2]).toBe('2026-10');
});
test('documented CME speaker name is accepted', async () => {
 query.mockResolvedValue({ rows: [{ id: 2 }] });
 expect((await request(app).post('/manager/cme-events/7/speakers').send({ name: 'Test Speaker' })).status).toBe(201);
 expect(query.mock.calls[0][1][3]).toBe('Test Speaker');
});
test('lead response and executive filter reflect pipeline stage', async () => {
 query.mockResolvedValue({ rows: [{ id: 2, status: 'new', pipeline_stage: 'contacted' }] });
 const r = await request(app).patch('/manager/leads/2/stage').send({ stage: 'contacted' });
 expect(r.status).toBe(200); expect(r.body.status).toBe('contacted');
 await request(app).get('/field/leads?status=contacted');
 expect(query.mock.calls[1][0]).toContain('pipeline_stage AS status');
 expect(query.mock.calls[1][0]).toContain('pipeline_stage=$3');
});
test('planned visit cancellation restricts owner, tenant and state', async () => {
 query.mockResolvedValue({ rows: [{ id: 2, status: 'cancelled' }] });
 expect((await request(app).patch('/field/visits/2/cancel').send({})).status).toBe(200);
 expect(query.mock.calls[0][1]).toEqual(['2', 7, 11]);
 expect(query.mock.calls[0][0]).toContain("status='planned'");
});
test('manager daily reports restrict tenant and optional executive', async () => {
 expect((await request(app).get('/manager/daily-reports?exec_id=7')).status).toBe(200);
 expect(query.mock.calls[0][1]).toEqual([11, null, '7']);
 expect(query.mock.calls[0][0]).toContain('r.tenant_id=$1');
});
