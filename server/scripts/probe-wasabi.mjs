#!/usr/bin/env node
/**
 * Live Wasabi probe using the same client as mediczy-server.
 * Run from repo: node server/scripts/probe-wasabi.mjs
 * Or via: ./scripts/imaging/check-wasabi.sh
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(serverRoot, '..');

function loadWasabiEnvFromFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^WASABI_([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = `WASABI_${m[1]}`;
    if (process.env[key]) continue; // already exported wins
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

// Never inherit ambient AWS region for this process — EC2 in ap-southeast-1
// would otherwise poison SigV4 if anything falls through to AWS_REGION.
delete process.env.AWS_REGION;
delete process.env.AWS_DEFAULT_REGION;
delete process.env.AWS_PROFILE;
delete process.env.AWS_ACCESS_KEY_ID;
delete process.env.AWS_SECRET_ACCESS_KEY;
delete process.env.AWS_SESSION_TOKEN;
process.env.AWS_EC2_METADATA_DISABLED = 'true';
// Belt-and-suspenders for AWS SDK >= 3.729 vs Wasabi/MinIO
process.env.AWS_REQUEST_CHECKSUM_CALCULATION = 'WHEN_REQUIRED';
process.env.AWS_RESPONSE_CHECKSUM_VALIDATION = 'WHEN_REQUIRED';

if (!process.env.WASABI_ENDPOINT || !process.env.WASABI_ACCESS_KEY || !process.env.WASABI_SECRET_KEY) {
  loadWasabiEnvFromFile(path.join(serverRoot, '.env'));
  loadWasabiEnvFromFile(path.join(repoRoot, '.env'));
}

const { probeWasabiConnectivity, describeArchiveBackends } = await import(
  '../services/imaging/imaging-archive-client.service.js'
);

const backends = describeArchiveBackends();
console.log('[wasabi] strategy=', backends.strategy);
console.log('[wasabi] endpoint=', backends.wasabi.endpoint);
console.log('[wasabi] region=', backends.wasabi.region || 'us-east-1');
console.log('[wasabi] bucket=', backends.wasabi.sharedBucket);
console.log(
  '[wasabi] access_key=',
  process.env.WASABI_ACCESS_KEY
    ? `${process.env.WASABI_ACCESS_KEY.slice(0, 4)}…${process.env.WASABI_ACCESS_KEY.slice(-4)}`
    : '(missing)',
);

const result = await probeWasabiConnectivity();
if (result.ok) {
  console.log(`[wasabi] OK — ListObjects (objects≈${result.objectCount})`);
  process.exit(0);
}

console.error('[wasabi] FAIL:', result.error);
if (result.hint) {
  console.error('[wasabi] FIX:', result.hint);
}
if (result.detail) {
  console.error('[wasabi] detail:', JSON.stringify(result.detail));
}
console.error('[wasabi] Wasabi Singapore → WASABI_REGION=ap-southeast-1 WASABI_ENDPOINT=https://s3.ap-southeast-1.wasabisys.com');
process.exit(1);
