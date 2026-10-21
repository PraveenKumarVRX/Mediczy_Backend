import fs from 'node:fs';
import vm from 'node:vm';
import { jest } from '@jest/globals';
const source = fs.readFileSync(new URL('../routes/corporate.route.js', import.meta.url), 'utf8');
function handler(path, query, method) {
  const marker = source.indexOf(`router.${method || ((path.includes('remind') || path.includes('send-invites')) ? 'post' : 'get')}('${path}'`);
  const start = source.indexOf('async (req, res) => {', marker);
  const end = source.indexOf('\n});', start);
  return vm.runInNewContext('(' + source.slice(start, end) + '\n})', {
    postgresSequelize: { query, transaction: fn => fn({}), QueryTypes: { SELECT: 'SELECT' } }, console, Date,
  });
}
const req = { user: { corporateId: 3 }, params: { apptId: 8, id: 9 } };
function response() { return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }; }
test('HR reminders reach the linked employee with appointment details, not HR', async () => {
  const query = jest.fn().mockResolvedValueOnce([[{ date: '2099-01-01', time: '11:30:00', status: 'scheduled', userId: 42 }]]).mockResolvedValueOnce([]);
  const res = response();
  await handler('/appointments/:apptId/remind', query)(req, res);
  expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Reminder sent' });
  const [sql, options] = query.mock.calls[1];
  expect(sql).toContain('INSERT INTO notifications');
  expect(sql).not.toContain('corporate_notifications');
  expect(options.replacements).toEqual({ userId: 42, message: 'Your health appointment is on 2099-01-01 at 11:30 IST. Please be on time.' });
});
test.each([
  [{ date: '2020-01-01', time: '11:30:00', status: 'scheduled', userId: 42 }, 400],
  [{ date: '2099-01-01', time: '11:30:00', status: 'cancelled', userId: 42 }, 400],
  [{ date: '2099-01-01', time: '11:30:00', status: 'scheduled', userId: null }, 409],
  [{ date: 'invalid', time: 'invalid', status: 'scheduled', userId: 42 }, 400],
])('does not send an undeliverable or non-upcoming reminder: %j', async (row, status) => {
  const query = jest.fn().mockResolvedValueOnce([[row]]); const res = response();
  await handler('/appointments/:apptId/remind', query)(req, res);
  expect(res.status).toHaveBeenCalledWith(status); expect(query).toHaveBeenCalledTimes(1);
});
test('participation requires completed care in both overall and department counts', async () => {
  const query = jest.fn().mockResolvedValueOnce([[{ total: '2' }]]).mockResolvedValueOnce([[{ cnt: '0' }]])
    .mockResolvedValueOnce([[{ cnt: '0' }]]).mockResolvedValueOnce([[{ cnt: '2' }]])
    .mockResolvedValueOnce([[{ department: 'General', total: '2', participating: '0' }]]);
  const res = response(); await handler('/analytics/participation', query)(req, res);
  expect(res.json.mock.calls[0][0].data).toMatchObject({ participationRate: 0, totalParticipating: 0, pendingCheckups: 2 });
  for (const i of [1, 4]) {
    expect(query.mock.calls[i][0]).toContain("LOWER(a.status) = 'completed'");
    expect(query.mock.calls[i][0]).toContain("e.status = 'completed'");
  }
});

test('all-employee wellness invites create scoped active employee RSVPs before publishing', async () => {
  const query = jest.fn().mockResolvedValueOnce([{id: 9}]).mockResolvedValueOnce([{id: 1}, {id: 2}])
    .mockResolvedValueOnce([{total: 2}]).mockResolvedValueOnce([{id: 9}]);
  const res = response();
  await handler('/wellness-calendar/activities/:id/send-invites', query)({...req, body: {participantSelection:'all'}},res);
  expect(res.json.mock.calls[0][0].data.invited).toBe(2);
  expect(query.mock.calls[1][0]).toContain('ce."isActive"=true');
  expect(query.mock.calls[1][1].replacements.corporateId).toBe(3);
  expect(query.mock.calls[3][1].replacements.total).toBe(2);
  expect(query.mock.calls.every(([,opts])=>opts.transaction)).toBe(true);
});
test('a different tenant cannot publish wellness invites', async () => {
  const query = jest.fn().mockResolvedValueOnce([]); const res=response();
  await handler('/wellness-calendar/activities/:id/send-invites',query)({...req,body:{participantSelection:'all'}},res);
  expect(res.status).toHaveBeenCalledWith(404); expect(query).toHaveBeenCalledTimes(1);
});

test('HR cannot mark doctor consultations completed even when a doctor name is assigned', async () => {
  const query = jest.fn().mockResolvedValueOnce([[{doctorName:'Synthetic Doctor',appointmentType:'Doctor Tele Consultation'}]]);
  const res=response();
  await handler('/appointments/:id',query,'put')({...req,body:{status:'completed'}},res);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(query).toHaveBeenCalledTimes(1);
});
