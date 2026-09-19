#!/usr/bin/env node
/**
 * RFID reader simulator for the Asset Tracking module.
 *
 * Posts batches of scans to POST /api/asset-tracking/reader/events using a
 * registered reader's API key (X-Reader-Key). Node 20 built-ins only.
 *
 * Usage:
 *   node scripts/simulate-rfid-reader.js \
 *     --url http://localhost:5000/api/asset-tracking/reader/events \
 *     --key <apiKey> --tags UID1,UID2 [--interval 2000] [--count 10]
 *
 * Exits non-zero on the first non-2xx response or network error.
 */

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq !== -1) {
      args[a.slice(2, eq)] = a.slice(eq + 1);
    } else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) {
      args[a.slice(2)] = argv[++i];
    } else {
      args[a.slice(2)] = true;
    }
  }
  return args;
}

function usage(msg) {
  if (msg) console.error(`Error: ${msg}\n`);
  console.error(
    'Usage: node scripts/simulate-rfid-reader.js --url <url> --key <apiKey> --tags UID1,UID2 [--interval 2000] [--count 10]'
  );
  process.exit(2);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomRssi = () => -(40 + Math.floor(Math.random() * 41)); // -40 .. -80

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) usage();
  const url = args.url;
  const key = args.key;
  const tags = String(args.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
  const interval = Number(args.interval ?? 2000);
  const count = Number(args.count ?? 10);

  if (!url || typeof url !== 'string') usage('--url is required');
  if (!key || typeof key !== 'string') usage('--key is required');
  if (tags.length === 0) usage('--tags must list at least one tag UID');
  if (!Number.isFinite(interval) || interval < 0) usage('--interval must be a non-negative number (ms)');
  if (!Number.isInteger(count) || count < 1) usage('--count must be a positive integer');

  for (let i = 1; i <= count; i++) {
    // A real reader typically sees a random subset of tags in range each cycle.
    const seen = tags.filter(() => Math.random() > 0.3);
    const batch = (seen.length ? seen : [tags[Math.floor(Math.random() * tags.length)]]).map((tagUid) => ({
      tagUid,
      eventType: 'location_update',
      rssi: randomRssi(),
      scannedAt: new Date().toISOString(),
    }));

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Reader-Key': key },
        body: JSON.stringify({ scans: batch }),
      });
    } catch (err) {
      console.error(`[${i}/${count}] request failed: ${err.message}`);
      process.exit(1);
    }

    const text = await res.text();
    console.log(`[${i}/${count}] ${res.status} sent=${batch.length} ${text}`);
    if (!res.ok) process.exit(1);

    if (i < count) await sleep(interval);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
