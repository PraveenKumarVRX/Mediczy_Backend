/** Health-checkup catalog is separate from recurring membership subscriptions. */
import sharedPool from '../db/pgPool.js';
export async function up(pool) {
    await pool.query(`CREATE TABLE IF NOT EXISTS corporate_health_package_catalog (
    id VARCHAR(150) PRIMARY KEY,
    corporate_id INTEGER NOT NULL REFERENCES corporates(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(50) NOT NULL UNIQUE,
    type VARCHAR(20) NOT NULL DEFAULT 'CORPORATE',
    description TEXT NOT NULL DEFAULT '',
    price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price>=0),
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    max_users INTEGER NOT NULL CHECK (max_users>0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    features JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (metadata->>'corporateId' = corporate_id::text)
  );
  ALTER TABLE corporate_health_package_catalog ALTER COLUMN id TYPE VARCHAR(150);
  -- Preserve real assigned packages, IDs and details when introducing the catalog.
  -- Ambiguous IDs shared across corporates are not imported automatically.
  INSERT INTO corporate_health_package_catalog
    (id,corporate_id,name,slug,description,price,max_users,is_active,features,metadata)
  SELECT latest."packageId",latest.corporate_id,latest."packageName",'legacy-'||md5(latest."packageId"),
    COALESCE(latest."packageDetails"->>'description',''),
    CASE WHEN COALESCE(latest."packageDetails"->>'price',latest."packageDetails"->>'cost','0') ~ '^\\d+(\\.\\d+)?$'
      THEN COALESCE(latest."packageDetails"->>'price',latest."packageDetails"->>'cost','0')::numeric ELSE 0 END,
    counts.total,counts.active,latest."packageDetails",
    jsonb_build_object('kind','health_checkup','corporateId',latest.corporate_id::text,
      'frequency','Annual','validityPeriod','1 Year','status',CASE WHEN counts.active THEN 'Active' ELSE 'Inactive' END,'source','existing_assignments')
  FROM (SELECT DISTINCT ON (corporate_id,"packageId") * FROM user_health_packages
    WHERE corporate_id IS NOT NULL AND jsonb_typeof("packageDetails"->'tests')='array'
      AND length("packageId") BETWEEN 1 AND 150
    ORDER BY corporate_id,"packageId","updatedAt" DESC) latest
  JOIN (SELECT corporate_id,"packageId",COUNT(*)::int AS total,
    BOOL_OR(LOWER(COALESCE(status,'active'))='active') AS active FROM user_health_packages
    GROUP BY corporate_id,"packageId") counts ON counts.corporate_id=latest.corporate_id AND counts."packageId"=latest."packageId"
  WHERE NOT EXISTS (SELECT 1 FROM user_health_packages other WHERE other."packageId"=latest."packageId" AND other.corporate_id<>latest.corporate_id)
  ON CONFLICT DO NOTHING;
  CREATE INDEX IF NOT EXISTS idx_corporate_health_package_catalog_corporate ON corporate_health_package_catalog(corporate_id,is_active);
  CREATE UNIQUE INDEX IF NOT EXISTS uniq_health_checkup_active_lab_slot ON health_checkup_bookings(lab_id,appointment_date,time_slot) WHERE status IN ('payment_pending','confirmed','scheduled','rescheduled');`);
}
export async function down(pool) { await pool.query('DROP TABLE IF EXISTS corporate_health_package_catalog'); }
if (process.argv.slice(1, 3).some(arg => arg.endsWith('20261021009000-corporate-health-package-catalog.migration.js'))) {
    const db = sharedPool.pool || sharedPool;
    db.connect().then(async client => {
        try {
            await client.query('BEGIN');
            await client.query("SET LOCAL lock_timeout = '5s'");
            await client.query("SET LOCAL statement_timeout = '60s'");
            await up(client);
            await client.query('COMMIT');
            console.log('corporate-health-package-catalog migration applied');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.end());
}
