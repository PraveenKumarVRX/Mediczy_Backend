#!/usr/bin/env node
/**
 * Prunes old hashed chunks from client/dist/assets (audit OPS-06).
 *
 * Deploys keep the previous build's chunks on purpose, so a browser tab opened before a deploy can still load its
 * lazy routes. That grows by ~700 files per deploy. This removes a file only when BOTH are true:
 *   1. it is not reachable from the current index.html (transitively, through chunk-to-chunk references), and
 *   2. it is older than the grace window (default 14 days).
 * Dry run by default; nothing is deleted without --apply.
 *
 *   node scripts/ops/prune-client-assets.mjs [--dist client/dist] [--days 14] [--apply]
 *
 * When merging old assets into a new build, copy with `cp -np` (preserve times) — a plain `cp -n` stamps every old
 * file with today's date and the grace window would then never expire.
 */
import fs from 'fs';
import path from 'path';

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : fallback; };
const dist = path.resolve(arg('--dist', 'client/dist'));
const days = Number(arg('--days', 14));
const apply = process.argv.includes('--apply');
const assetsDir = path.join(dist, 'assets');

if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error(`No index.html in ${dist} — refusing to prune.`); process.exit(2); }
if (!fs.existsSync(assetsDir)) { console.error(`No assets directory in ${dist}.`); process.exit(2); }

const files = fs.readdirSync(assetsDir).filter((f) => fs.statSync(path.join(assetsDir, f)).isFile());
const known = new Set(files);
const NAME = /[A-Za-z0-9_.$-]+\.(?:js|css|mjs|woff2?|ttf|png|jpe?g|svg|webp|gif|json|wasm)/g;
const namesIn = (text) => [...new Set(text.match(NAME) || [])].map((n) => path.basename(n)).filter((n) => known.has(n));

// Everything reachable from index.html.
const keep = new Set();
const queue = namesIn(fs.readFileSync(path.join(dist, 'index.html'), 'utf8'));
while (queue.length) {
  const f = queue.pop();
  if (keep.has(f)) continue;
  keep.add(f);
  if (/\.(js|css|mjs)$/.test(f)) queue.push(...namesIn(fs.readFileSync(path.join(assetsDir, f), 'utf8')));
}
if (keep.size === 0) { console.error('Found no assets referenced by index.html — refusing to prune (would delete everything).'); process.exit(2); }

const cutoff = Date.now() - days * 86_400_000;
const victims = files.filter((f) => !keep.has(f) && fs.statSync(path.join(assetsDir, f)).mtimeMs < cutoff);
const bytes = victims.reduce((s, f) => s + fs.statSync(path.join(assetsDir, f)).size, 0);

console.log(`assets: ${files.length} total · ${keep.size} reachable from index.html · ${victims.length} prunable (unreachable and older than ${days} days, ${(bytes / 1048576).toFixed(1)} MB)`);
if (!apply) { console.log('Dry run — pass --apply to delete.'); process.exit(0); }
for (const f of victims) fs.unlinkSync(path.join(assetsDir, f));
console.log(`Deleted ${victims.length} files.`);
