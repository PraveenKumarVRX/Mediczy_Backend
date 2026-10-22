/** Explicit doctor identity for HR schedules; legacy name-only records remain unchanged. */
export async function up(database) {
  await database.query(`ALTER TABLE corporate_scheduled_appointments ADD COLUMN IF NOT EXISTS doctor_uid TEXT REFERENCES doctors(unique_id);
 CREATE UNIQUE INDEX IF NOT EXISTS uniq_corporate_doctor_scheduled_time ON corporate_scheduled_appointments(corporate_id,doctor_uid,date,time) WHERE doctor_uid IS NOT NULL AND status='scheduled';`);
}
export async function down(database) {
  await database.query(
    "DROP INDEX IF EXISTS uniq_corporate_doctor_scheduled_time; ALTER TABLE corporate_scheduled_appointments DROP COLUMN IF EXISTS doctor_uid",
  );
}
