#!/usr/bin/env node
/**
 * WP-0.3a: static check for the exact anti-pattern documented in docs/WP0.3_INVENTED_DATA_INVENTORY.md
 * — a top-level array of five or more hardcoded object literals that look like patient/person records,
 * declared under client/src/pages, presented to a screen as if it might be live data.
 *
 * Like server/scripts/ci/check-tenant-isolation-statics.mjs, this is a trip-wire built from plain text
 * scanning, not a real parser: it cannot tell a seed array meant as a *fallback for a failed fetch*
 * (the actual bug) from one that's genuinely just local UI config that happens to have 5+ objects with
 * a "name" field. That's exactly why it ships with an allow-list (ALLOWLIST_FILE below) rather than a
 * blanket ban — every file already flagged here was individually reviewed once, and only *new* files
 * (not on the list) fail the build. The plan's own acceptance criterion is "the lint rule passes with
 * an empty allow-list" — i.e. the list is meant to shrink to zero over time, not grow.
 *
 * Usage: node client/scripts/ci/check-invented-data-statics.mjs
 *   Exits 1 on any finding not already in the allow-list — unlike the tenant-isolation check, this
 *   one is a real gate, not advisory, since the plan's own acceptance criterion is "the lint rule
 *   fails the build."
 *
 *   --report            print every current finding as JSON without consulting the allow-list
 *   --update-allowlist   rewrite the allow-list file with exactly the files currently flagged. Use
 *                        this once, when a human has actually reviewed a *new* finding and decided
 *                        it's acceptable for now — never run it blindly to silence a real violation,
 *                        and never run it to shrink the list (remove entries from the JSON by hand
 *                        once a file's been fixed, so the "still pending" count stays honest).
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const CLIENT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PAGES_DIR = path.join(CLIENT_DIR, 'src', 'pages');
const ALLOWLIST_FILE = path.join(CLIENT_DIR, 'scripts', 'ci', 'invented-data-allowlist.json');

const UPDATE_ALLOWLIST = process.argv.includes('--update-allowlist');
const REPORT_FINDINGS = process.argv.includes('--report');


const PERSON_LIKE_KEY_RE = /\b(name|patientName|patient|mrn|uhid)\s*:/i;
// A const/array declared at 0-2 leading spaces — module scope, or right at the top of a component
// function body, which is where every real example found this session lived. Deeper indentation
// usually means a value built inside a callback/conditional, not a static seed.
const TOP_LEVEL_CONST_ARRAY_RE = /^[ \t]{0,2}const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?::[^=]+)?=\s*\[/gm;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** Given the index of a `[`, returns the index just past its matching `]` (bracket-depth aware,
 * naively skipping over string/template contents so a `]` inside a string doesn't end the scan
 * early — good enough for source that round-trips through a formatter, not a full tokenizer). */
function findMatchingBracket(text, openIdx) {
  let depth = 0;
  let inString = null; // one of ', ", ` while inside a string/template literal
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') { i++; continue; }
      if (c === inString) inString = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { inString = c; continue; }
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Counts top-level object-literal elements directly inside an array span (arraySpan[0] is the
 * array's own opening `[`, so depth is already 1 by the time we reach its direct children — an
 * object literal element sits at depth 1, not 0), by tracking bracket depth so nested objects/arrays
 * inside each element don't get double-counted. */
function countTopLevelObjectElements(arraySpan) {
  let depth = 0;
  let inString = null;
  let count = 0;
  for (let i = 0; i < arraySpan.length; i++) {
    const c = arraySpan[i];
    if (inString) {
      if (c === '\\') { i++; continue; }
      if (c === inString) inString = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { inString = c; continue; }
    if (c === '{' || c === '[' || c === '(') {
      if (c === '{' && depth === 1) count++;
      depth++;
    } else if (c === '}' || c === ']' || c === ')') {
      depth--;
    }
  }
  return count;
}

const findings = [];

/** Static-reference annotations are deliberately narrow: the comment must be the immediately
 * preceding line of the declaration and must include a human-readable reason. */
function isAnnotatedStaticReference(text, declarationIndex) {
  const linesBeforeDeclaration = text.slice(0, declarationIndex).split('\n');
  const previous = linesBeforeDeclaration[linesBeforeDeclaration.length - 2]?.trim() ?? '';
  return /^\/\/\s*invented-data-check: static-reference -- .+/.test(previous);
}

let files;
try { files = walk(PAGES_DIR); } catch (err) {
  console.error(`Could not walk ${PAGES_DIR}: ${err.message}`);
  process.exit(1);
}

for (const file of files) {
  const rel = path.relative(CLIENT_DIR, file);
  const text = readFileSync(file, 'utf8');

  for (const m of text.matchAll(TOP_LEVEL_CONST_ARRAY_RE)) {
    const openIdx = m.index + m[0].length - 1; // position of the `[`
    const closeIdx = findMatchingBracket(text, openIdx);
    if (closeIdx === -1) continue;
    const arraySpan = text.slice(openIdx, closeIdx + 1);

    const objectCount = countTopLevelObjectElements(arraySpan);
    if (objectCount < 5) continue;
    if (!PERSON_LIKE_KEY_RE.test(arraySpan)) continue;

    if (isAnnotatedStaticReference(text, m.index)) continue;

    const lineNo = text.slice(0, m.index).split('\n').length;
    findings.push({ file: rel, line: lineNo, identifier: m[1], objectCount });
  }
}

if (REPORT_FINDINGS) {
  console.log(JSON.stringify(findings, null, 2));
  process.exit(0);
}

const foundFiles = [...new Set(findings.map((f) => f.file))].sort();

if (UPDATE_ALLOWLIST) {
  const existing = (() => {
    try { return JSON.parse(readFileSync(ALLOWLIST_FILE, 'utf8')); } catch { return []; }
  })();
  const existingReasons = new Map(existing.map((e) => [e.file, e.reason]));
  const entries = foundFiles.map((file) => ({
    file,
    reason: existingReasons.get(file) ?? 'TODO: review and replace this with a real reason',
  }));
  writeFileSync(ALLOWLIST_FILE, JSON.stringify(entries, null, 2) + '\n');
  console.log(`Wrote ${entries.length} file(s) to ${path.relative(CLIENT_DIR, ALLOWLIST_FILE)}`);
  const todo = entries.filter((e) => e.reason.startsWith('TODO')).length;
  if (todo > 0) console.log(`⚠ ${todo} of them need a real reason filled in by hand before this is a meaningful record.`);
  process.exit(0);
}

/** Allow-list entries are `{file, reason}` — a reason is required so the list stays a record of what
 * was actually reviewed, not just a growing list of paths nobody remembers checking. */
let allowlist = [];
try {
  allowlist = JSON.parse(readFileSync(ALLOWLIST_FILE, 'utf8'));
} catch {
  console.warn(`⚠ Could not read ${ALLOWLIST_FILE} — treating the allow-list as empty.`);
}
const allowSet = new Set(allowlist.map((e) => (typeof e === 'string' ? e : e.file)));

const newViolations = findings.filter((f) => !allowSet.has(f.file));
const stillOnAllowlist = foundFiles.filter((f) => allowSet.has(f));
const nowClean = allowlist.filter((e) => !foundFiles.includes(typeof e === 'string' ? e : e.file));

if (nowClean.length > 0) {
  console.log(`ℹ ${nowClean.length} allow-listed file(s) no longer match the invented-data pattern —`);
  console.log('  remove them from the allow-list so it keeps shrinking toward zero (WP-0.3a acceptance criterion):');
  for (const e of nowClean) console.log(`    - ${typeof e === 'string' ? e : e.file}`);
  console.log();
}

if (newViolations.length === 0) {
  console.log(`✓ No new invented-data seed arrays found (${stillOnAllowlist.length} known, allow-listed file(s) still pending WP-0.3b/c/d).`);
  process.exit(0);
}

console.log(`❌ ${newViolations.length} new file(s) with a seed array of 5+ person-like object literals, not on the allow-list:\n`);
for (const f of newViolations) {
  console.log(`  ${f.file}:${f.line}  const ${f.identifier} = [...]  (${f.objectCount} objects)`);
}
console.log('\nEither this is a genuine invented-data bug (see docs/WP0.3_INVENTED_DATA_INVENTORY.md — wire the');
console.log('screen to a real API call, or use DataState + PlaceholderBanner from client/src/components/ui to');
console.log('label it honestly), or it is a false positive (e.g. static UI config, not seed data presented as');
console.log('live) — if so, place an `// invented-data-check: static-reference -- <reason>` comment immediately');
console.log('before that array declaration after a human has actually looked at it.');

process.exit(1);
