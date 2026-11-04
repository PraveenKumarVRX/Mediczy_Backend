/**
 * start-minio.mjs — launch the local uploads MinIO server.
 * Run via the SSM loader so MINIO_ACCESS_KEY / MINIO_SECRET_KEY are in env; this wrapper maps them
 * to MinIO's root creds (so the app authenticates) and execs the server. Credentials are never
 * printed or passed on the command line.
 *
 *   node server/scripts/ssm-env-loader.mjs server/scripts/start-minio.mjs
 * (run under PM2 for persistence — see the deploy command.)
 */
import { spawn } from 'node:child_process';

const user = process.env.MINIO_ACCESS_KEY;
const pass = process.env.MINIO_SECRET_KEY;
const dataDir = process.env.MINIO_DATA_DIR || '/home/ubuntu/minio-data';
if (!user || !pass) { console.error('[start-minio] MINIO_ACCESS_KEY/MINIO_SECRET_KEY not set'); process.exit(1); }

console.log(`[start-minio] starting MinIO on :9000 (console :9001), data ${dataDir}`);
const child = spawn('/usr/local/bin/minio',
  ['server', dataDir, '--address', ':9000', '--console-address', ':9001'],
  { stdio: 'inherit', env: { ...process.env, MINIO_ROOT_USER: user, MINIO_ROOT_PASSWORD: pass } });

const forward = (sig) => process.on(sig, () => child.kill(sig));
['SIGINT', 'SIGTERM'].forEach(forward);
child.on('exit', (code) => process.exit(code == null ? 1 : code));
