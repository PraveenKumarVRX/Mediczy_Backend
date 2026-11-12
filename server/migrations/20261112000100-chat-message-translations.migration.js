/**
 * chat_messages.translated_content — the clinical translation cache for the
 * doctor chat.
 *
 * routes/doctor-chat.route.js created this column itself on the request path
 * (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` behind a process-local flag),
 * which is schema change at request time with the app role's privileges,
 * unversioned and unreviewed — the thing __tests__/no-request-time-ddl.test.js
 * exists to catch. The column is defined here instead; the route now probes
 * for it read-only and degrades if it is absent.
 */
export async function up(pool) {
  await pool.query(`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS translated_content JSONB`);
}

export async function down(pool) {
  // Dropping it would discard cached translations; left in place deliberately.
  await pool.query('SELECT 1');
}
