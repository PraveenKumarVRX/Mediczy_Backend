// Checks for migrations/20261007000300-queue-organization-uid-twins.sql
const TABLES = ['display_devices', 'hospital_queue_entries', 'hospital_queue_token_sequences', 'hospital_uhid_sequences', 'kiosk_registration_invites'];
export async function behaviour({ q, ok, bad, expectError, fillInsert }) {
  // 1. the queue module writes whatever organization_id the logged-in user has: the trigger must follow it, never block it
  const t11 = (await q(`SELECT unique_id FROM tenants WHERE id = 11`)).rows[0].unique_id;
  const a = await fillInsert('hospital_queue_entries', { organization_id: 11 });
  a.organization_uid === t11 ? ok('a queue entry for tenant 11 gets that tenant\'s uid', a.organization_uid) : bad('uid not derived', a.organization_uid);
  const b = await fillInsert('hospital_queue_entries', { organization_id: 2368 });
  b.organization_uid === null ? ok('an entry whose organization_id matches no tenant (QA/lab id 2368) is still accepted, with a NULL uid') : bad('dangling integer', b.organization_uid);
  const u = await q(`UPDATE hospital_queue_entries SET organization_id = 4 WHERE id = $1 RETURNING organization_uid`, [a.id]);
  u.rows[0].organization_uid === (await q(`SELECT unique_id FROM tenants WHERE id = 4`)).rows[0].unique_id ? ok('changing the integer moves the uid with it') : bad('uid did not follow', u.rows[0].organization_uid);
  const lab = (await q(`SELECT unique_id FROM labs ORDER BY id LIMIT 1`)).rows[0].unique_id;
  await expectError('a uid of another kind of entity (a lab) cannot be written to organization_uid', '23514',
    () => q(`UPDATE hospital_queue_entries SET organization_uid = $2 WHERE id = $1`, [a.id, lab]));
  await expectError('an integer and a uid that disagree are refused', '23514',
    () => fillInsert('hospital_queue_entries', { organization_id: 11, organization_uid: 'H82RR5' }));
}
export async function state({ q, ok, bad }) {
  const expected = { display_devices: [3, 8], hospital_queue_entries: [15, 27], hospital_queue_token_sequences: [1, 5], hospital_uhid_sequences: [4, 5], kiosk_registration_invites: [5, 19] };
  for (const t of TABLES) {
    const r = (await q(`SELECT count(*)::int n, count(organization_uid)::int filled FROM ${t}`)).rows[0];
    const bogus = Number((await q(`SELECT count(*) n FROM ${t} x JOIN tenants g ON g.id = x.organization_id WHERE x.organization_uid IS DISTINCT FROM g.unique_id`)).rows[0].n);
    const [f, n] = expected[t];
    r.n === n && r.filled === f && bogus === 0 ? ok(`${t}: ${f} of ${n} rows twinned to their tenant, the rest (no such tenant) left NULL`) : bad(t, JSON.stringify({ ...r, bogus, expected: [f, n] }));
  }
  const reg = Number((await q(`SELECT count(*) n FROM entity_uid_references WHERE table_name = ANY($1) AND uid_col = 'organization_uid'`, [TABLES])).rows[0].n);
  reg === 5 ? ok('all five twins are registered for the verifier') : bad('registered twins', reg);
}
