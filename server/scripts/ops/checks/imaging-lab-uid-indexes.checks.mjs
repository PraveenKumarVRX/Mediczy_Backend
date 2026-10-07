// Checks for migrations/20261007000400-imaging-lab-uid-indexes.sql
export async function behaviour({ q, ok, bad }) {
  const plan = async (sql) => (await q(`EXPLAIN ${sql}`)).rows.map((r) => r['QUERY PLAN']).join('\n');
  const lab = (await q(`SELECT lab_uid FROM hg_dicom_instances WHERE lab_uid IS NOT NULL LIMIT 1`)).rows[0]?.lab_uid;
  if (!lab) { bad('no hg_dicom_instances.lab_uid to plan with'); return; }
  const p = await plan(`SELECT 1 FROM hg_dicom_instances WHERE study_instance_uid = '1.2.3' AND tenant_id = 2368 AND lab_uid = '${lab}'`);
  /idx_hg_dicom_instances_(labuid_study|study)|Index/i.test(p) ? ok('the instance lookup by (study, lab_uid) is index-backed') : bad('instance lookup plan', p);
}
export async function state({ q, ok, bad }) {
  const have = (await q(`SELECT indexname FROM pg_indexes WHERE indexname IN ('idx_hg_dicom_studies_labuid_study','idx_hg_dicom_instances_labuid_study','idx_hg_dicom_instances_lab_uid')`)).rows.map((r) => r.indexname);
  have.length === 3 ? ok('lab_uid indexes present on studies and instances') : bad('indexes', have.join(','));
}
