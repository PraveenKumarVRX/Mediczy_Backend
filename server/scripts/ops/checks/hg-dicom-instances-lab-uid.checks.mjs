// Checks for migrations/20261007000200-hg-dicom-instances-lab-uid.sql
export async function behaviour({ q, ok, bad, expectError, fillInsert }) {
  const labs = (await q(`SELECT id, unique_id FROM labs ORDER BY id LIMIT 2`)).rows;
  const t0 = Date.now();
  const tenantUid = (await q(`SELECT uid FROM labs WHERE id = $1`, [labs[0].id])).rows[0].uid;
  const a = await fillInsert('hg_dicom_instances', { tenant_id: labs[0].id, tenant_uid: tenantUid });
  a.lab_uid === labs[0].unique_id ? ok('a new row gets lab_uid from tenant_id by trigger', a.lab_uid) : bad('lab_uid not derived', a.lab_uid);
  await expectError('a row whose lab_uid disagrees with tenant_id is refused', null,
    () => fillInsert('hg_dicom_instances', { tenant_id: labs[0].id, tenant_uid: tenantUid, lab_uid: labs[1].unique_id }));
  const corp = (await q(`SELECT uid FROM entity_registry WHERE source_table = 'corporates' LIMIT 1`)).rows[0];
  await expectError('a lab_uid that belongs to another kind of entity is refused', null,
    () => fillInsert('hg_dicom_instances', { tenant_id: labs[0].id, tenant_uid: tenantUid, lab_uid: corp.uid }));
  ok(`probe inserts ran in ${Date.now() - t0} ms`);

  // The exact statement the batched backfill runs, on one batch, inside this rolled-back transaction.
  const t1 = Date.now();
  const r = await q(`UPDATE hg_dicom_instances t SET lab_uid = g.unique_id FROM labs g
      WHERE g.id = t.tenant_id AND t.ctid IN (SELECT ctid FROM hg_dicom_instances WHERE tenant_id IS NOT NULL AND lab_uid IS NULL LIMIT 5000)`);
  r.rowCount === 5000 ? ok(`one backfill batch fills 5000 rows in ${Date.now() - t1} ms`) : bad('batch size', r.rowCount);
  const wrong = Number((await q(`SELECT count(*) n FROM hg_dicom_instances t JOIN labs g ON g.id = t.tenant_id WHERE t.lab_uid IS NOT NULL AND t.lab_uid <> g.unique_id`)).rows[0].n);
  wrong === 0 ? ok('every filled row carries its own lab\'s uid') : bad('wrong uids', wrong);
  const orphans = Number((await q(`SELECT count(*) n FROM hg_dicom_instances t WHERE t.tenant_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM labs g WHERE g.id = t.tenant_id)`)).rows[0].n);
  orphans === 0 ? ok('no hg_dicom_instances row points at a lab that does not exist (the backfill will not refuse)') : bad('orphans', orphans);
}
export async function state({ q, ok, bad }) {
  const n = (await q(`SELECT count(*)::int n, count(lab_uid)::int filled FROM hg_dicom_instances`)).rows[0];
  n.n > 400000 && n.filled === 0 ? ok(`the ${n.n} existing rows are untouched (lab_uid is filled later in batches)`) : bad('row state', JSON.stringify(n));
  const fk = (await q(`SELECT convalidated FROM pg_constraint WHERE conname = 'fk_hg_dicom_instances_lab_uid'`)).rows[0];
  fk && fk.convalidated === false ? ok('the foreign key exists NOT VALID (new rows enforced; validated after the backfill)') : bad('fk', JSON.stringify(fk));
  const reg = (await q(`SELECT 1 FROM entity_uid_references WHERE table_name = 'hg_dicom_instances' AND uid_col = 'lab_uid'`)).rows.length;
  reg === 1 ? ok('the twin is registered for the verifier') : bad('twin not registered');
}
