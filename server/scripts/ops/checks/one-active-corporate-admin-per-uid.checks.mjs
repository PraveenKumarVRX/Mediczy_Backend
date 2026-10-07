// Checks for migrations/20261007000100-one-active-corporate-admin-per-uid.sql
export async function behaviour({ q, ok, bad, expectError, fillInsert }) {
  const corp = (await q(`SELECT unique_id FROM corporates ORDER BY id LIMIT 1`)).rows[0];
  const base = { role: 'corporate_admin', status: 'active', organization_type: 'corporate', organization_uid: corp.unique_id, organization_id: 999001 };
  // Only meaningful when the corporate has no active admin yet; otherwise this proves nothing, so say so.
  const existing = Number((await q(`SELECT count(*) n FROM users WHERE role = 'corporate_admin' AND status = 'active' AND organization_uid = $1`, [corp.unique_id])).rows[0].n);
  const target = existing === 0 ? corp.unique_id : (await q(`SELECT c.unique_id FROM corporates c WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.role = 'corporate_admin' AND u.status = 'active' AND u.organization_uid = c.unique_id) LIMIT 1`)).rows[0]?.unique_id;
  if (!target) { bad('no corporate without an active admin to probe with'); return; }
  await fillInsert('users', { ...base, organization_uid: target, organization_id: 999001, email: 'probe-admin-1@probe.invalid', username: 'probe_admin_1' });
  await expectError('a second active corporate_admin for the same corporate uid is refused, even with a different organization_id', '23505',
    () => fillInsert('users', { ...base, organization_uid: target, organization_id: 999002, email: 'probe-admin-2@probe.invalid', username: 'probe_admin_2' }));
  await fillInsert('users', { ...base, organization_uid: target, organization_id: 999003, status: 'inactive', email: 'probe-admin-3@probe.invalid', username: 'probe_admin_3' });
  ok('an inactive corporate_admin does not count');
  await fillInsert('users', { ...base, organization_uid: target, organization_id: 999004, role: 'hr_staff', email: 'probe-hr@probe.invalid', username: 'probe_hr_1' });
  ok('hr_staff of the same corporate is unaffected');
}
export async function state({ q, ok, bad }) {
  const dup = (await q(`SELECT organization_uid, count(*) n FROM users WHERE role = 'corporate_admin' AND status = 'active' AND organization_uid IS NOT NULL GROUP BY 1 HAVING count(*) > 1`)).rows;
  dup.length === 0 ? ok('no corporate has more than one active corporate_admin') : bad('duplicate active admins', JSON.stringify(dup));
}
