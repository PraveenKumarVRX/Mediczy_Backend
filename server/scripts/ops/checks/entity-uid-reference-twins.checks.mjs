// Checks for migrations/20261005000200-entity-uid-reference-twins.sql (generated).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.resolve(here, '../../../migrations/20261005000200-entity-uid-reference-twins.manifest.json'), 'utf8'));
let n = 0;
const email = () => `uid-twin-${Date.now()}-${++n}@example.invalid`;

export async function behaviour({ q, ok, bad, expectError, fillInsert }) {
  const t = async (id) => (await q('SELECT unique_id FROM tenants WHERE id=$1', [id])).rows[0].unique_id;
  const c = async (id) => (await q('SELECT unique_id FROM corporates WHERE id=$1', [id])).rows[0].unique_id;
  const hospitalUid = (await q('SELECT unique_id FROM hospitals LIMIT 1')).rows[0].unique_id;

  console.log('  users.tenant_id <-> users.tenant_uid:');
  const mk = (o) => fillInsert('users', { email: email(), status: 'inactive', ...o });
  let r = await mk({ tenant_id: 58 });
  const got = (await q('SELECT tenant_uid FROM users WHERE id=$1', [r.id])).rows[0].tenant_uid;
  got === await t(58) ? ok('writing the integer fills the uid', `58 -> ${got}`) : bad('int -> uid', got);

  r = await mk({ tenant_uid: await t(7) });
  const tid = (await q('SELECT tenant_id FROM users WHERE id=$1', [r.id])).rows[0].tenant_id;
  Number(tid) === 7 ? ok('writing only the uid fills the integer', `${await t(7)} -> 7`) : bad('uid -> int', tid);

  await expectError('a uid that is not registered is refused', '23503', () => mk({ tenant_uid: 'QQQQQQ' }));
  const t7 = await t(7);
  await expectError('58 with the uid of tenant 7 is refused (integer and uid disagree)', '23514', () => mk({ tenant_id: 58, tenant_uid: t7 }));
  await expectError("a HOSPITAL's uid in a tenants reference is refused (wrong table)", '23514', () => mk({ tenant_uid: hospitalUid }));

  console.log('\n  users.corporate_id <-> users.corporate_uid, and the corporate employees:');
  r = await mk({ corporate_id: 49 });
  (await q('SELECT corporate_uid FROM users WHERE id=$1', [r.id])).rows[0].corporate_uid === await c(49)
    ? ok('users.corporate_id 49 -> the corporate uid of Ninjacart') : bad('corporate twin');
  const t58 = await t(58);
  await expectError("a tenant's uid in a corporates reference is refused (wrong table)", '23514', () => mk({ corporate_uid: t58 }));

  console.log('\n  the integer keeps working exactly as before:');
  r = await mk({ tenant_id: 58 });
  await q('UPDATE users SET "lastLoginAt" = NOW() WHERE id = $1', [r.id]);
  ok('updating an unrelated column is unaffected');
  await q('UPDATE users SET tenant_id = 7 WHERE id = $1', [r.id]);
  (await q('SELECT tenant_uid FROM users WHERE id=$1', [r.id])).rows[0].tenant_uid === t7
    ? ok('re-pointing ONLY the integer re-points the uid with it (existing code keeps working)') : bad('update int');
  await q('UPDATE users SET tenant_id = NULL WHERE id = $1', [r.id]);
  (await q('SELECT tenant_uid FROM users WHERE id=$1', [r.id])).rows[0].tenant_uid === null
    ? ok('clearing the integer clears the uid') : bad('null int');
  await q('UPDATE users SET tenant_uid = $2 WHERE id = $1', [r.id, t58]);
  Number((await q('SELECT tenant_id FROM users WHERE id=$1', [r.id])).rows[0].tenant_id) === 58
    ? ok('re-pointing ONLY the uid re-points the integer with it') : bad('update uid');
  // Changing BOTH sides to different targets is the only inconsistent write left, and it is refused.
  // (Setting the integer to the value it already has while changing the uid reads as "only the uid
  // changed": Postgres cannot tell an untouched column from one set to the same value, so the uid wins.)
  const t4 = await t(4);
  await expectError('changing BOTH sides to DIFFERENT targets is refused', '23514',
    () => q('UPDATE users SET tenant_id = $3, tenant_uid = $2 WHERE id = $1', [r.id, t7, 4]));
  await q('UPDATE users SET tenant_id = 58, tenant_uid = $2 WHERE id = $1', [r.id, t7]);
  Number((await q('SELECT tenant_id FROM users WHERE id=$1', [r.id])).rows[0].tenant_id) === 7
    ? ok('uid changed while the integer is written unchanged: the uid wins and the integer follows') : bad('uid wins');
  void t4;
}

export async function leak({ q }) {
  return { probeUsers: (await q(`SELECT count(*) n FROM users WHERE email LIKE 'uid-twin-%@example.invalid'`)).rows[0].n };
}

export async function state({ q, ok, bad }) {
  const reg = (await q('SELECT count(*) n FROM entity_uid_references')).rows[0].n;
  Number(reg) === manifest.decided.length + 1
    ? ok(`entity_uid_references records all ${manifest.decided.length} new twins plus corporates.tenant_id`) : bad('twin registry', `${reg} rows`);

  let allGood = 0; let problems = 0;
  for (const d of manifest.decided) {
    const col = (await q("SELECT data_type FROM information_schema.columns WHERE table_name=$1 AND column_name=$2", [d.table, d.uid])).rows[0];
    const fk = (await q(`SELECT count(*) n FROM pg_constraint WHERE conrelid=($1)::regclass AND contype='f' AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=($1)::regclass AND attname=$2)]`, [d.table, d.uid])).rows[0].n;
    const trg = (await q("SELECT count(*) n FROM pg_trigger WHERE tgrelid=($1)::regclass AND tgname=$2 AND NOT tgisinternal", [d.table, 'trg_uid_ref_' + d.uid])).rows[0].n;
    const unfilled = (await q(`SELECT count(*) n FROM "${d.table}" t JOIN "${d.target}" g ON g.id = t."${d.int}" WHERE t."${d.uid}" IS NULL`)).rows[0].n;
    const disagree = (await q(`SELECT count(*) n FROM "${d.table}" t LEFT JOIN entity_registry r ON r.uid = t."${d.uid}"
                                WHERE t."${d.uid}" IS NOT NULL AND (r.source_table IS DISTINCT FROM $1 OR r.source_id IS DISTINCT FROM t."${d.int}")`, [d.target])).rows[0].n;
    const why = [];
    if (col?.data_type !== 'text') why.push('column missing / not text');
    if (Number(fk) !== 1) why.push('no FK to the registry');
    if (Number(trg) !== 1) why.push('no sync trigger');
    if (Number(unfilled) > 0) why.push(`${unfilled} row(s) not filled`);
    if (Number(disagree) > 0) why.push(`${disagree} row(s) disagree with the integer`);
    if (why.length) { problems += 1; bad(`${d.table}.${d.uid}`, why.join('; ')); } else allGood += 1;
  }
  problems === 0 ? ok(`all ${allGood} twins: column, FK, trigger, every row filled, every uid agrees with its integer and its table`) : bad(`${problems} twin(s) failed`);

  const users = (await q('SELECT count(*) n FROM users')).rows[0].n;
  Number(users) === 6852 ? ok(`users unchanged (${users} rows)`) : bad('user count changed', users);
}
