/**
 * One-shot migration runner — imports a migration file and calls up(pool).
 * Usage: node scripts/ssm-env-loader.mjs scripts/run-one-migration.mjs <migration-file>
 *
 * The migration file path is relative to server/.
 */
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(__dirname, '..');

const migrationArg = process.argv[3]; // argv[0]=node argv[1]=ssm-env-loader argv[2]=this-file argv[3]=migration
if (!migrationArg) {
  console.error('Usage: node ssm-env-loader.mjs run-one-migration.mjs <migration-path-relative-to-server/>');
  process.exit(1);
}

const migrationPath = path.resolve(SERVER, migrationArg);
const { up } = await import(pathToFileURL(migrationPath).href);

if (typeof up !== 'function') {
  console.error(`No up() export found in ${migrationPath}`);
  process.exit(1);
}

const { default: pool } = await import(pathToFileURL(path.join(SERVER, 'db/pgPool.js')).href);
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await up(client);
  await client.query('COMMIT');
  console.log(`Migration applied: ${path.basename(migrationPath)}`);
} catch (err) {
  await client.query('ROLLBACK');
  console.error('Migration failed:', err.message);
  throw err;
} finally {
  client.release();
  await pool.end();
}
