/** Transactional release migration. Defaults to rollback; --apply commits schema only. */
import pool from '../../db/pgPool.js';
import { up } from '../../migrations/20261028000100-health-package-eligibility.migration.js';
import { HEALTH_CHECKUP_VENUES_SQL } from '../../services/health-checkup-venues.js';
const db=pool.pool||pool;
const client=await db.connect();
try {
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s'");
  const before=(await client.query('SELECT COUNT(*)::int AS count FROM health_checkup_bookings')).rows[0].count;
  await up(client);
  await client.query(`SELECT * FROM ${HEALTH_CHECKUP_VENUES_SQL} venues LIMIT 0`);
  const {rows:[state]}=await client.query(`SELECT COUNT(*)::int AS count, COUNT(*) FILTER (WHERE beneficiary_relation IS NULL OR (lab_id IS NOT NULL)::int+(hospital_id IS NOT NULL)::int<>1)::int AS invalid FROM health_checkup_bookings`);
  if(state.count!==before||state.invalid!==0) throw new Error('Booking preservation check failed');
  const indexes=(await client.query(`SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relname IN ('uniq_health_checkup_active_hospital_slot','uniq_health_checkup_active_lab_slot') AND i.indisvalid AND i.indisunique`)).rows;
  if(indexes.length!==2) throw new Error('Expected valid unique indexes for both venue types');
  const apply=process.argv.includes('--apply');
  await client.query(apply?'COMMIT':'ROLLBACK');
  console.log(JSON.stringify({passed:true,mode:apply?'applied':'dry-run-rolled-back',bookingsPreserved:before,validVenueIndexes:indexes.length}));
} catch(error) {
  await client.query('ROLLBACK').catch(()=>{});
  console.error(JSON.stringify({passed:false,message:error.message}));process.exitCode=1;
} finally {client.release();await db.end();}
