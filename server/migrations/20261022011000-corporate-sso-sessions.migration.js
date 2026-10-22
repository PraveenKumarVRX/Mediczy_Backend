export async function up(database) {
  await database.query(`CREATE TABLE IF NOT EXISTS corporate_sso_sessions(
  id UUID PRIMARY KEY,
  corporate_uid TEXT NOT NULL REFERENCES corporates(unique_id) ON DELETE CASCADE,
  user_uid TEXT REFERENCES users(unique_id) ON DELETE CASCADE,
  phase TEXT NOT NULL DEFAULT 'started' CHECK(phase IN('started','verified','consumed')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 ); CREATE INDEX IF NOT EXISTS idx_corporate_sso_expiry ON corporate_sso_sessions(expires_at);`);
}
export async function down(database) {
  await database.query("DROP TABLE IF EXISTS corporate_sso_sessions");
}
