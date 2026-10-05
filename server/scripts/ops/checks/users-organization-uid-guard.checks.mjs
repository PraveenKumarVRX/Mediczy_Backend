// Checks for migrations/20261005000100-users-organization-uid-guard.sql
let n = 0;
const email = () => `uid-guard-${Date.now()}-${++n}@example.invalid`;

export async function behaviour({ q, ok, bad, expectError, fillInsert }) {
  // Inactive: there is already an active corporate_admin under several of these organisation ids and
  // idx_one_active_corporate_admin_per_org allows only one.
  const mk = (overrides) => fillInsert('users', { email: email(), status: 'inactive', ...overrides });
  const uidOf = async (row) => (await q('SELECT organization_uid FROM users WHERE id=$1', [row.id])).rows[0].organization_uid;
  const expectUid = async (label, overrides, want) => {
    const row = await mk(overrides);
    const got = await uidOf(row);
    got === want ? ok(label, got ?? 'NULL') : bad(label, `got ${got ?? 'NULL'}, wanted ${want ?? 'NULL'}`);
    return row;
  };
  const uidFor = async (sql, p) => (await q(sql, p)).rows[0].unique_id;
  const corp = (id) => uidFor('SELECT unique_id FROM corporates WHERE id=$1', [id]);
  const tenant = (id) => uidFor('SELECT unique_id FROM tenants WHERE id=$1', [id]);

  console.log('  derivation, by the kind of the user\'s organisation:');
  await expectUid('corporate user, organization_id 49 is a CORPORATES id (tenants 49 is a hospital) -> Ninjacart', { organization_id: 49, organization_type: 'corporate', role: 'corporate_admin', status: 'inactive' }, await corp(49));
  await expectUid('corporate user, organization_id 58 is a corporate-type TENANT -> its one Active corporate', { organization_id: 58, organization_type: 'corporate', role: 'hr_staff' }, await corp(49));
  await expectUid('Dairy Day (tenant 57) -> the single Active corporate #45, now that #52 is cleared', { organization_id: 57, organization_type: 'corporate', role: 'user' }, await corp(45));
  await expectUid('hospital user, organization_id 11 -> the hospital tenant', { organization_id: 11, organization_type: 'hospital', role: 'hr_staff' }, await tenant(11));
  await expectUid('individual, organization_id 7 (a tenant, not a corporates id) -> the tenant', { organization_id: 7, organization_type: 'individual', role: 'user' }, await tenant(7));
  await expectUid('individual, organization_id 1 is BOTH a tenant and a corporates id -> left NULL, not guessed', { organization_id: 1, organization_type: 'individual', role: 'user' }, null);
  await expectUid('hospital user whose tenant is NOT a hospital -> left NULL', { organization_id: 7, organization_type: 'hospital', role: 'user' }, null);
  await expectUid('no organization_id -> nothing derived', { organization_type: 'individual', role: 'user' }, null);

  console.log('\n  an explicit uid wins over derivation:');
  const explicit = await mk({ organization_id: 49, organization_type: 'corporate', role: 'hr_staff', organization_uid: await corp(45) });
  (await uidOf(explicit)) === (await corp(45)) ? ok('an explicitly supplied uid is kept (the writer knows better than the integer)') : bad('explicit uid overwritten');
  await expectError('an unregistered uid is refused', '23503', () => mk({ organization_type: 'corporate', role: 'user', organization_uid: 'QQQQQQ' }));

  console.log('\n  hospital HRMS vs corporate wellness: the kind must agree with the role:');
  const hosp = await tenant(11);
  const ninja = await corp(49);
  await expectError('hr_staff of a HOSPITAL cannot belong to a corporate', '23514', () => mk({ organization_type: 'hospital', role: 'hr_staff', organization_uid: ninja }));
  await expectError('hr_staff of a CORPORATE cannot belong to a hospital', '23514', () => mk({ organization_type: 'corporate', role: 'hr_staff', organization_uid: hosp }));
  await expectError('corporate_admin cannot belong to a hospital', '23514', () => mk({ organization_type: 'corporate', role: 'corporate_admin', organization_uid: hosp }));
  const ok1 = await mk({ organization_type: 'corporate', role: 'hr_staff', organization_uid: ninja });
  ok1 ? ok('corporate hr_staff -> corporate is accepted') : bad('corporate hr_staff');
  const ok2 = await mk({ organization_type: 'hospital', role: 'hr_staff', organization_uid: hosp });
  ok2 ? ok('hospital hr_staff -> hospital is accepted') : bad('hospital hr_staff');
  await expectError('changing a corporate hr_staff into a corporate_admin of a hospital is refused on UPDATE', '23514',
    () => q(`UPDATE users SET role='corporate_admin', organization_uid=$1 WHERE id=$2`, [hosp, ok1.id]));
  await q(`UPDATE users SET role='corporate_admin' WHERE id=$1`, [ok1.id]);  // still inactive, so the one-active-admin index is not involved
  ok('promoting a corporate hr_staff to corporate_admin within the corporate is accepted (transferSuperHr)');

  console.log('\n  the trigger does not tax ordinary updates:');
  await q(`UPDATE users SET "lastLoginAt" = NOW() WHERE id = $1`, [ok2.id]);
  ok('updating an unrelated column is unaffected');
}

export async function leak({ q }) {
  return { probeUsers: (await q(`SELECT count(*) n FROM users WHERE email LIKE 'uid-guard-%@example.invalid'`)).rows[0].n };
}

export async function state({ q, ok, bad }) {
  const t = (await q(`SELECT count(*) n FROM pg_trigger WHERE tgrelid='users'::regclass AND tgname='trg_users_organization_uid' AND NOT tgisinternal`)).rows[0].n;
  Number(t) === 1 ? ok('trg_users_organization_uid is installed on users') : bad('trigger missing');
  const u = (await q('SELECT count(*) n FROM users')).rows[0].n;
  Number(u) === 6852 ? ok(`users unchanged (${u} rows)`) : bad('user count changed', u);
  const conflict = (await q(`
    SELECT count(*) n FROM users u JOIN entity_registry r ON r.uid = u.organization_uid
     WHERE (u.role IN ('corporate_admin','corporate_cmo','corporate_ohc') AND r.kind <> 'corporate')
        OR (u.role='hr_staff' AND u.organization_type='corporate' AND r.kind <> 'corporate')
        OR (u.role='hr_staff' AND u.organization_type<>'corporate' AND r.kind = 'corporate')`)).rows[0].n;
  Number(conflict) === 0 ? ok('every existing user already satisfies the role/kind rule (the trigger rejects nobody retroactively)') : bad('existing conflicts', conflict);
}
