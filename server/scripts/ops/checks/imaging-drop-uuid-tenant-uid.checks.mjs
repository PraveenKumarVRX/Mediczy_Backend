// Checks for migrations/20261007000500-imaging-drop-uuid-tenant-uid.sql
const TABLES = ['hg_dicom_studies', 'hg_dicom_instances', 'hg_dicom_worklist', 'hg_dicom_reports', 'hg_dicom_access_log', 'ris_studies'];
export async function behaviour({ q, ok, bad, fillInsert }) {
  // after the contract, a writer that only knows the integer still gets a consistent lab_uid from the twin trigger
  const lab = (await q(`SELECT id, unique_id FROM labs WHERE id = 2368`)).rows[0];
  const row = await fillInsert('hg_dicom_worklist', { tenant_id: lab.id });
  row.lab_uid === lab.unique_id ? ok('a worklist row written with only tenant_id still gets the right lab_uid', row.lab_uid) : bad('lab_uid', row.lab_uid);
  const st = await fillInsert('hg_dicom_studies', { tenant_id: lab.id, study_instance_uid: 'PROBE-CONTRACT-1' });
  st.lab_uid === lab.unique_id ? ok('…and so does a study') : bad('study lab_uid', st.lab_uid);
}
export async function state({ q, ok, bad }) {
  const cols = (await q(`SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'tenant_uid' AND table_name = ANY($1)`, [TABLES])).rows;
  cols.length === 0 ? ok('no imaging table has a tenant_uid column any more') : bad('columns remain', cols.map((c) => c.table_name).join(','));
  const objs = (await q(`SELECT to_regclass('public.imaging_tenants') a, to_regclass('public.imaging_tenant_ambiguities') b, to_regprocedure('imaging_fill_tenant_uid()') c, to_regprocedure('imaging_fill_tenant_uid_by_lab()') d`)).rows[0];
  Object.values(objs).every((v) => v === null) ? ok('the registry, the ambiguity table and both fill functions are gone') : bad('objects remain', JSON.stringify(objs));
  const trg = (await q(`SELECT count(*)::int n FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'trg\\_%\\_tenant\\_uid' AND tgrelid::regclass::text = ANY($1)`, [TABLES])).rows[0].n;
  trg === 0 ? ok('no tenant_uid trigger remains') : bad('triggers', trg);
  const lt = (await q(`SELECT count(*)::int n FROM pg_trigger WHERE NOT tgisinternal AND tgname = 'trg_uid_ref_lab_uid' AND tgrelid::regclass::text = ANY($1)`, [TABLES])).rows[0].n;
  lt === 6 ? ok('all six lab_uid twin triggers are intact') : bad('lab_uid triggers', lt);
  const nulls = (await q(`SELECT (SELECT count(*) FROM hg_dicom_studies WHERE tenant_id IS NOT NULL AND lab_uid IS NULL)::int s, (SELECT count(*) FROM hg_dicom_instances WHERE tenant_id IS NOT NULL AND lab_uid IS NULL)::int i`)).rows[0];
  nulls.s === 0 && nulls.i === 0 ? ok('no studies or instances are missing their lab_uid (nothing depends on the dropped column to be found)') : bad('missing lab_uid', JSON.stringify(nulls));
}
