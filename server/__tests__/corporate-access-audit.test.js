import fs from 'node:fs';
import vm from 'node:vm';
import { jest } from '@jest/globals';
import { corporateAccessAudit } from '../services/corporate-access-audit.service.js';

const req = { user: { role: 'corporate', corporateId: 3, id: 3, userId: 3, email: 'hr@example.invalid' }, ip: '127.0.0.1' };
const source = fs.readFileSync(new URL('../routes/corporate.route.js', import.meta.url), 'utf8');
function handler(method, path, database, extra = {}) {
  const marker = source.indexOf(`router.${method}('${path}'`);
  const start = source.indexOf('async (req, res) => {', marker);
  const end = source.indexOf('\n});', start);
  return vm.runInNewContext(`(${source.slice(start, end)}\n})`, {
    postgresSequelize: database, accessAudit: corporateAccessAudit(database),
    console: { error() {} }, ...extra,
  });
}
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });

test('a direct corporate credential does not impersonate the colliding users-table ID', async () => {
  const query = jest.fn().mockResolvedValue([]);
  const transaction = {};
  await corporateAccessAudit({ query }).record(req, { resourceId: 8, title: 'MIS', action: 'download' }, transaction);
  expect(query.mock.calls[0][1]).toMatchObject({ transaction, replacements: { corporateId: 3, userId: null, actorType: 'corporate', action: 'download' } });
});
test('invited staff are attributed to their user ID rather than the corporate ID', async () => {
  const query = jest.fn().mockResolvedValue([]);
  await corporateAccessAudit({ query }).record({ ...req, user: { ...req.user, role: 'hr_staff', userId: 42 } }, { resourceId: 8, action: 'view' });
  expect(query.mock.calls[0][1].replacements).toMatchObject({ userId: 42, corporateId: 3, actorType: 'hr' });
});
test('consent uses the resolved roster employee ID and current corporate', async () => {
  const query = jest.fn().mockResolvedValue([[{ '?column?': 1 }]]);
  await corporateAccessAudit({ query }).requireHealthConsent(req, { employeeId: 'EMP-1', userId: 42 });
  expect(query.mock.calls[0][1].replacements).toEqual({ corporateId: 3, employeeId: 'EMP-1' });
  expect(query.mock.calls[0][0]).toContain('revoked_at IS NULL');
});
test('missing, revoked, wrong-purpose or another corporate consent cannot authorize a dossier', async () => {
  const query = jest.fn().mockResolvedValue([[]]);
  await expect(corporateAccessAudit({ query }).requireHealthConsent(req, { employeeId: 'EMP-1' })).rejects.toMatchObject({ statusCode: 403, code: 'health_consent_required' });
  expect(query.mock.calls[0][0]).toContain("consent_type = 'health_data'");
});
test('unrecognized roles fail before querying consent', async () => {
  const query = jest.fn();
  await expect(corporateAccessAudit({ query }).requireHealthConsent({ user: { role: 'patient' } }, { employeeId: 'EMP-1' })).rejects.toMatchObject({ statusCode: 403 });
  expect(query).not.toHaveBeenCalled();
});
test('audit failures propagate rather than silently dropping evidence', async () => {
  const query = jest.fn().mockRejectedValue(new Error('database unavailable'));
  await expect(corporateAccessAudit({ query }).record(req, { resourceId: 8, action: 'view' })).rejects.toThrow('database unavailable');
});
test('bulk status mutation and evidence share a transaction and respond only after commit', async () => {
  const transaction = {};
  let committed = false;
  const query = jest.fn().mockResolvedValueOnce([[{ employeeId: 'EMP-1' }]]).mockResolvedValueOnce([]);
  const database = { query, transaction: async callback => { const result = await callback(transaction); committed = true; return result; } };
  const res = response();
  res.json.mockImplementation(() => { expect(committed).toBe(true); return res; });
  await handler('patch', '/employees/bulk-status', database)({ ...req, body: { employeeIds: ['EMP-1'], action: 'deactivate' } }, res);
  expect(query.mock.calls).toHaveLength(2);
  expect(query.mock.calls.every(([, options]) => options.transaction === transaction)).toBe(true);
  expect(query.mock.calls[1][1].replacements.action).toBe('deactivate');
  expect(res.status).toHaveBeenCalledWith(200);
});
test('an audit failure rolls back the status transaction and returns failure', async () => {
  let committed = false;
  const query = jest.fn().mockResolvedValueOnce([[{ employeeId: 'EMP-1' }]]).mockRejectedValueOnce(new Error('audit failed'));
  const database = { query, transaction: async callback => { const result = await callback({}); committed = true; return result; } };
  const res = response();
  await handler('patch', '/employees/bulk-status', database)({ ...req, body: { employeeIds: ['EMP-1'], action: 'activate' } }, res);
  expect(committed).toBe(false);
  expect(res.status).toHaveBeenCalledWith(500);
});
test('consent rejects string booleans without accessing the database', async () => {
  const query = jest.fn(); const res = response();
  await handler('post', '/consent/record', { query })({ ...req, body: { employeeId: 'EMP-1', granted: 'false' } }, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(query).not.toHaveBeenCalled();
});
test('consent cannot be recorded for a missing or foreign employee', async () => {
  const query = jest.fn().mockResolvedValue([[]]); const res = response();
  await handler('post', '/consent/record', { query, transaction: callback => callback({}) })({ ...req, body: { employeeId: 'FOREIGN', granted: true } }, res);
  expect(res.status).toHaveBeenCalledWith(404);
  expect(query).toHaveBeenCalledTimes(1);
  expect(query.mock.calls[0][1].replacements).toEqual({ corporateId: 3, employeeId: 'FOREIGN' });
});
test.each(['-1', 'abc', '1.5'])('audit pagination rejects invalid limit %s', async limit => {
  const query = jest.fn(); const res = response();
  await handler('get', '/audit-log', { query })({ ...req, query: { limit } }, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(query).not.toHaveBeenCalled();
});
test('direct generated-report download records access without a browser callback', async () => {
  const query = jest.fn().mockResolvedValueOnce([[{ id: 8, title: 'Roster', category: 'employees', format: 'csv' }]])
    .mockResolvedValueOnce([[{ employeeId: 'EMP-1' }]]).mockResolvedValueOnce([]);
  const res = { ...response(), setHeader: jest.fn(), send: jest.fn() };
  res.status.mockReturnValue(res);
  await handler('get', '/reports/:id/download', { query }, { resolveCorporateIdFromUser: user => user.corporateId, toCsv: () => 'employeeId\nEMP-1' })({ ...req, params: { id: 8 }, query: {} }, res);
  expect(query.mock.calls[2][1].replacements).toMatchObject({ resourceId: '8', action: 'download', corporateId: 3 });
  expect(res.send).toHaveBeenCalledWith('employeeId\nEMP-1');
});
test('generated-report export fails closed when evidence cannot be stored', async () => {
  const query = jest.fn().mockResolvedValueOnce([[{ id: 8, title: 'Roster', category: 'employees' }]])
    .mockResolvedValueOnce([[]]).mockRejectedValueOnce(new Error('audit unavailable'));
  const res = { ...response(), setHeader: jest.fn(), send: jest.fn() };
  await handler('get', '/reports/:id/download', { query }, { resolveCorporateIdFromUser: user => user.corporateId })({ ...req, params: { id: 8 }, query: {} }, res);
  expect(res.status).toHaveBeenCalledWith(500);
  expect(res.send).not.toHaveBeenCalled();
  expect(res.setHeader).not.toHaveBeenCalledWith('Content-Disposition', expect.anything());
});
