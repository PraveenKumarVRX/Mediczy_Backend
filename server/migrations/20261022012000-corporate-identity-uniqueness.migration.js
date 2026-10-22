/** Prevent new active duplicate organizations; never merge or relabel existing UIDs. */
export async function up(database) {
  await database.query(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_corporate_normalized_name
   ON corporates(LOWER(REGEXP_REPLACE("companyName",'[^a-zA-Z0-9]','','g')))
   WHERE LOWER(status) IN ('active','pending') AND LENGTH(REGEXP_REPLACE("companyName",'[^a-zA-Z0-9]','','g'))>0;
 CREATE UNIQUE INDEX IF NOT EXISTS uniq_corporate_normalized_email ON corporates(LOWER(TRIM(email))) WHERE email IS NOT NULL AND TRIM(email)<>'';`);
}
export async function down(database) {
  await database.query(
    "DROP INDEX IF EXISTS uniq_active_corporate_normalized_name; DROP INDEX IF EXISTS uniq_corporate_normalized_email",
  );
}
