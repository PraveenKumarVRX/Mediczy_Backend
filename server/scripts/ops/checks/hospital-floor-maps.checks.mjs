// Checks for migrations/20261008000200-hospital-floor-maps.sql
// (hospital_floor_maps and wayfinding_queries already exist in production; hospital_id is the TENANT id.)
export async function behaviour({ q, ok, bad, expectError }) {
  const t3 = (await q(`SELECT unique_id FROM tenants WHERE id = 3`)).rows[0].unique_id;
  const a = (await q(`INSERT INTO hospital_floor_maps (hospital_id, floor_number, floor_name, departments, updated_by)
                      VALUES (3, 0, 'Ground', '[{"id":"lab","name":"Laboratory"}]', 77) RETURNING hospital_uid, updated_by`)).rows[0];
  a.hospital_uid === t3 ? ok('a floor map for tenant 3 is twinned to that tenant\'s uid', a.hospital_uid) : bad('uid not derived', a.hospital_uid);
  await expectError('one map per tenant and floor', '23505',
    () => q(`INSERT INTO hospital_floor_maps (hospital_id, floor_number) VALUES (3, 0)`));
  const lab = (await q(`SELECT unique_id FROM labs ORDER BY id LIMIT 1`)).rows[0].unique_id;
  await expectError('a uid of another kind of entity (a lab) cannot be written to hospital_uid', '23514',
    () => q(`INSERT INTO hospital_floor_maps (hospital_id, floor_number, hospital_uid) VALUES (3, 1, $1)`, [lab]));
  const w = (await q(`INSERT INTO wayfinding_queries (hospital_id, device_id, query_text, matched) VALUES (3, 9, 'pharmacy', 'Pharmacy') RETURNING hospital_uid, device_id, matched`)).rows[0];
  w.hospital_uid === t3 && w.device_id == 9 && w.matched === 'Pharmacy' ? ok('a wayfinding query records device and match and is twinned') : bad('query row', JSON.stringify(w));
}
export async function state({ q, ok, bad }) {
  const maps = Number((await q(`SELECT count(*) n FROM hospital_floor_maps`)).rows[0].n);
  maps === 0 ? ok('hospital_floor_maps is empty, as in production before any hospital configures a floor') : bad('floor maps present', maps);
  const reg = (await q(`SELECT table_name FROM entity_uid_references WHERE table_name IN ('hospital_floor_maps','wayfinding_queries') AND uid_col = 'hospital_uid' ORDER BY 1`)).rows.map((r) => r.table_name);
  reg.length === 2 ? ok('both tables are twinned to tenants and registered for the verifier') : bad('registered twins', reg.join(','));
  const cols = (await q(`SELECT column_name FROM information_schema.columns WHERE table_name = 'wayfinding_queries' AND column_name IN ('device_id','matched')`)).rows.length;
  cols === 2 ? ok('wayfinding_queries has device_id and matched') : bad('columns', cols);
}
