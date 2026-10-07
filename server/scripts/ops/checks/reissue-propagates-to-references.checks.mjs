// Checks for migrations/20261005000400-reissue-propagates-to-references.sql
export async function behaviour({ q, ok, bad, fillInsert }) {
  // A probe twin pointing at lab #2403 (one of the prefix-less labs awaiting re-issue) and a probe user.
  await q('CREATE TABLE _probe_twin (id serial PRIMARY KEY, lab_id int, lab_uid text)');
  await q("SELECT attach_uid_reference('_probe_twin', 'lab_id', 'lab_uid', 'labs')");
  const old = (await q('SELECT unique_id FROM labs WHERE id = 2403')).rows[0].unique_id;
  const row = (await q('INSERT INTO _probe_twin (lab_id) VALUES (2403) RETURNING id, lab_uid')).rows[0];
  row.lab_uid === old ? ok('the probe twin holds the lab\'s current uid', old) : bad('twin fill', row.lab_uid);

  const nw = (await q("SELECT reissue_entity_uid('labs', 2403, 'probe') AS u")).rows[0].u;
  nw !== old && nw[0] === 'L' ? ok('the lab got a new L… uid', `${old} -> ${nw}`) : bad('reissue', nw);
  const after = (await q('SELECT lab_uid, lab_id FROM _probe_twin WHERE id = $1', [row.id])).rows[0];
  after.lab_uid === nw && Number(after.lab_id) === 2403 ? ok('the referencing twin FOLLOWED the re-issue and still points at the same lab', `${after.lab_uid} / lab #${after.lab_id}`)
                                                       : bad('twin did not follow', JSON.stringify(after));
  (await q('SELECT resolve_entity_uid($1) u', [old])).rows[0].u === nw ? ok('the old uid still resolves to the new one') : bad('alias');

  // users.organization_uid is a plain column with a foreign key, not a twin pair: it must follow too.
  const corp = (await q("SELECT unique_id FROM corporates WHERE id = 49")).rows[0].unique_id;
  const u = await fillInsert('users', { email: `reissue-probe-${Date.now()}@example.invalid`, status: 'inactive', organization_type: 'corporate', role: 'hr_staff', organization_uid: corp });
  const newCorp = (await q("SELECT reissue_entity_uid('corporates', 49, 'probe') AS u")).rows[0].u;
  (await q('SELECT organization_uid FROM users WHERE id = $1', [u.id])).rows[0].organization_uid === newCorp
    ? ok('users.organization_uid followed a corporate re-issue', `${corp} -> ${newCorp}`) : bad('org uid did not follow');
  const stale = (await q('SELECT count(*) n FROM users WHERE organization_uid = $1', [corp])).rows[0].n;
  Number(stale) === 0 ? ok('no user is left pointing at the retired corporate uid') : bad('stale org uids', stale);
}

export async function leak({ q }) {
  return {
    probeTable: (await q("SELECT count(*) n FROM pg_class WHERE relname = '_probe_twin'")).rows[0].n,
    probeUsers: (await q("SELECT count(*) n FROM users WHERE email LIKE 'reissue-probe-%'")).rows[0].n,
    aliases: (await q("SELECT count(*) n FROM entity_uid_aliases WHERE reason = 'probe'")).rows[0].n,
    labs: (await q("SELECT count(*) n FROM labs WHERE id = 2403 AND left(unique_id,1) = 'L'")).rows[0].n,
  };
}

export async function state({ q, ok, bad }) {
  const labs = (await q("SELECT count(*) n FROM labs WHERE left(unique_id,1) <> 'L'")).rows[0].n;
  Number(labs) === 13 ? ok('the 13 prefix-less labs are untouched (the probe was rolled back)') : bad('labs changed', labs);
  const al = (await q('SELECT count(*) n FROM entity_uid_aliases')).rows[0].n;
  Number(al) === 547 ? ok('aliases unchanged (547, the clinics)') : bad('alias count', al);
}
