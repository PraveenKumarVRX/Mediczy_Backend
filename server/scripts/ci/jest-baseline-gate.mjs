#!/usr/bin/env node
/**
 * Jest baseline gate (WP-0.6). Fails the build on any NEW failing test, tolerates the recorded baseline, and tells
 * you when a baseline failure has been fixed so the entry can be removed.
 *
 *   node scripts/ci/jest-baseline-gate.mjs <jest-results.json> [known-failures.json]
 *   node scripts/ci/jest-baseline-gate.mjs <jest-results.json> [known-failures.json] --write-baseline
 *
 * Produce the results with:  npm test -- --json --outputFile=jest-results.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [resultsPath, knownArg] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const write = process.argv.includes('--write-baseline');
if (!resultsPath) { console.error('usage: jest-baseline-gate.mjs <jest-results.json> [known-failures.json] [--write-baseline]'); process.exit(2); }
const knownPath = knownArg || path.join(here, 'known-failures.json');

const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
const rel = (f) => f.replace(/^.*[\\/]server[\\/]/, '');
const failing = new Set();
for (const suite of results.testResults || []) {
  const failed = (suite.assertionResults || []).filter((a) => a.status === 'failed');
  for (const a of failed) failing.add(`${rel(suite.name)} :: ${a.fullName}`);
  // A suite that could not even load (syntax/import error) has no assertions but is still a failure.
  if (suite.status === 'failed' && failed.length === 0) failing.add(`${rel(suite.name)} :: (suite failed to run)`);
}

if (write) {
  fs.writeFileSync(knownPath, JSON.stringify({ recordedAt: new Date().toISOString().slice(0, 10), note: 'Failures that existed when the gate was introduced. Remove entries as they are fixed; never add new ones.', failures: [...failing].sort() }, null, 2) + '\n');
  console.log(`Wrote ${failing.size} known failure(s) to ${knownPath}`);
  process.exit(0);
}

const known = new Set(JSON.parse(fs.readFileSync(knownPath, 'utf8')).failures || []);
const added = [...failing].filter((f) => !known.has(f));
const fixed = [...known].filter((f) => !failing.has(f));
console.log(`Tests: ${results.numPassedTests} passed, ${results.numFailedTests} failed (${known.size} known, ${added.length} new)`);
if (fixed.length) console.log(`\nNow passing — remove from known-failures.json:\n${fixed.map((f) => `  - ${f}`).join('\n')}`);
if (added.length) {
  console.error(`\nNEW failures (not in the baseline):\n${added.map((f) => `  - ${f}`).join('\n')}`);
  process.exit(1);
}
console.log('\nNo new failures.');
