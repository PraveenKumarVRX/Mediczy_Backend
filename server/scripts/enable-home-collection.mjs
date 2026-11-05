/**
 * One-off: enable home sample collection for the vetted corporate-network labs.
 *
 * Root cause of "selected lab does not provide home collection": every active lab had
 * homeSampleCollection=false. This flags the labs that are actual corporate-network partners
 * (the ones employees book from) as home-collection capable. Reversible — re-run with
 * ENABLE=false to turn it back off for the same set.
 *
 * Run:  node server/scripts/ssm-env-loader.mjs server/scripts/enable-home-collection.mjs
 */
import pool from '../db/pgPool.js';

const enable = String(process.env.ENABLE ?? 'true').toLowerCase() !== 'false';

const { rows: before } = await pool.query(
  `SELECT count(*) n FROM labs WHERE "homeSampleCollection"=true AND LOWER(COALESCE(status,'active'))='active'`
);
console.log(`active labs offering home collection (before): ${before[0].n}`);

const { rows: scope } = await pool.query(
  `SELECT count(DISTINCT partner_id) n FROM corporate_network_assignments WHERE partner_type='lab'`
);
console.log(`distinct corporate-network labs to flag: ${scope[0].n}`);

const res = await pool.query(
  `UPDATE labs SET "homeSampleCollection"=$1
     WHERE id IN (SELECT DISTINCT partner_id FROM corporate_network_assignments WHERE partner_type='lab')
       AND LOWER(COALESCE(status,'active'))='active'`,
  [enable]
);
console.log(`labs updated (homeSampleCollection=${enable}): ${res.rowCount}`);

const { rows: after } = await pool.query(
  `SELECT count(*) n FROM labs WHERE "homeSampleCollection"=true AND LOWER(COALESCE(status,'active'))='active'`
);
console.log(`active labs offering home collection (after): ${after[0].n}`);

process.exit(0);
