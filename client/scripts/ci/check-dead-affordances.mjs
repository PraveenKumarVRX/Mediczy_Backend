#!/usr/bin/env node
/**
 * WP-0.3: dead-affordance check.
 *
 * A control that LOOKS live but does nothing is the most dangerous class of UI defect in a
 * clinical system, because it converts a missing capability into a false assurance. Real examples
 * found and fixed in this repository:
 *
 *   <Switch defaultChecked />  labelled "Two-Factor Authentication" — MFA did not exist, so every
 *                              admin account read as protected by a second factor.
 *   <Switch defaultChecked />  labelled "Driver SOS" — emergency alerts from drivers, not wired.
 *   <Switch defaultChecked />  labelled "Fraud Detection" — no monitoring configured.
 *   <Button>Enable 2FA</Button>  with no onClick at all.
 *   <Button>Regenerate API Keys</Button> with no onClick — a credential operation.
 *
 * This flags two specific, mechanical patterns. It is NOT a general dead-code detector:
 *   - a Switch rendered ON (defaultChecked, or checked={true}) with no change handler, and
 *   - a Button in a security/settings/finance context with no onClick and no `disabled`.
 *
 * A switch with only `defaultChecked` and no handler cannot change anything AND cannot report its
 * state anywhere, so it is always wrong. A button without a handler is either decorative or a
 * regression; in a settings surface that is worth failing on.
 *
 * Deliberately noisy about what it does NOT know: a control may be genuinely decorative, or wired
 * through a form submit. Findings are therefore listed with file:line for a human to judge, and the
 * baseline mechanism keeps the build green while the list is worked down.
 *
 *   node client/scripts/ci/check-dead-affordances.mjs
 *   node client/scripts/ci/check-dead-affordances.mjs --json
 *   node client/scripts/ci/check-dead-affordances.mjs --fail-on-new <baseline.json>
 */
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const SCAN = join(ROOT, 'client/src');
const BASELINE = join(dirname(fileURLToPath(import.meta.url)), 'dead-affordances-baseline.json');

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const fIdx = args.indexOf('--fail-on-new');
const failOnNew = fIdx !== -1 ? args[fIdx + 1] : null;

const walk = (dir, out = []) => {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(name)) out.push(full);
  }
  return out;
};

// A dead button is only dangerous where it claims a security or credential capability. A dead
// icon button in a chat dashboard is cosmetic; a dead "Enable 2FA" tells a doctor their account
// is protected when it is not. Restricting the rule to these labels keeps the signal high enough
// that people read the output instead of disabling the check.
const CREDENTIAL_ACTION = /\b(2fa|mfa|two[- ]?factor|regenerate|rotate|revoke|verify|enable|disable|password|api key|recovery|backup)\b/i;

// A JSX element can span many lines, so props must be read from the WHOLE element. Matching a
// single line produces hundreds of false positives wherever <Button ...> opens on one line and
// onClick arrives three lines later — and a check that cries wolf is one people disable.
const element = (text, start) => {
  const open = text.indexOf('>', start);
  if (open === -1) return { end: text.length, body: text.slice(start) };
  // Self-closing ends at the matching '/>'.
  const selfClose = /\/\s*>$/.test(text.slice(start, open + 1));
  const end = selfClose ? open + 2 : (text.indexOf('</Button>', open) !== -1 ? text.indexOf('</Button>', open) + 9 : open + 1);
  return { end, body: text.slice(start, end) };
};

const findings = [];
for (const file of walk(SCAN)) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { continue; }
  const rel = relative(ROOT, file);
  const lineOf = (idx) => text.slice(0, idx).split('\n').length;

  // Comments are blanked (same length, newlines kept) before matching, so a documented past
  // offender like `{/* Was <Switch defaultChecked /> ... */}` is not re-reported as live code.
  // Matching before masking this way produced false positives on the very comments that explain
  // the fix, which would make the check actively harmful.
  const scannable = text
    .replace(/\{[\s]*\/\*[\s\S]*?\*\/[\s]*\}/g, (b) => b.replace(/[^\n]/g, ' '))
    .replace(/\/\*[\s\S]*?\*\//g, (b) => b.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (b) => b.replace(/[^\n]/g, ' '));

  // Walk elements left to right, advancing past each one so nested tags are not re-examined.
  let cursor = 0;
  while (cursor < text.length) {
    const m = /<(Switch|Button)\b/g;
    m.lastIndex = cursor;
    const hit = m.exec(scannable);
    if (!hit) break;
    const tag = hit[1];
    const { end, body } = element(scannable, hit.index);

    // A JSX comment documenting this occurrence usually sits ABOVE the element, not inside it,
    // so both the preceding lines and the element body have to be consulted.
    const preceding = scannable.slice(Math.max(0, hit.index - 500), hit.index);
    const documented = /Was <|This was|was <Switch|was a Switch|previously a/i.test(body) || /Was <|This was|was <Switch|was a Switch/i.test(preceding);
    if (!documented && !/disabled/.test(body)) {
      if (tag === 'Switch') {
        if (!/onCheckedChange/.test(body) && (/defaultChecked/.test(body) || /checked=\{true\}/.test(body))) {
          findings.push({ file: rel, line: lineOf(hit.index), kind: 'switch-rendered-on-no-handler', source: body.replace(/\s+/g, ' ').trim().slice(0, 120) });
        }
      } else {
        // A submit button inside a <form> legitimately has no onClick.
        const before = scannable.slice(Math.max(0, hit.index - 500), hit.index);
        const isFormSubmit = /type=\"submit\"/.test(body) && /<form\b/.test(before);
        const label = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        if (!isFormSubmit && !/onClick/.test(body) && CREDENTIAL_ACTION.test(label)) {
          findings.push({ file: rel, line: lineOf(hit.index), kind: 'credential-button-with-no-handler', source: label.slice(0, 100) });
        }
      }
    }
    cursor = Math.max(end, hit.index + 1);
  }
}

const byKind = findings.reduce((acc, f) => ({ ...acc, [f.kind]: (acc[f.kind] || 0) + 1 }), {});

if (asJson) {
  process.stdout.write(`${JSON.stringify({
    generatedAt: new Date().toISOString(),
    total: findings.length,
    byKind,
    findings,
  }, null, 2)}\n`);
} else {
  console.log('WP-0.3 dead-affordance check');
  console.log('='.repeat(58));
  console.log(`findings: ${findings.length}`);
  for (const [k, v] of Object.entries(byKind)) console.log(`  ${k}: ${v}`);
  console.log('');
  for (const f of findings.slice(0, 25)) console.log(`  ${f.file}:${f.line}  [${f.kind}]  ${f.source}`);
  if (findings.length > 25) console.log(`  …and ${findings.length - 25} more`);
}

if (failOnNew) {
  let baseline = null;
  if (existsSync(failOnNew)) {
    try {
      const raw = readFileSync(failOnNew, 'utf8').trim();
      baseline = raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error(`FAIL: baseline ${failOnNew} is not valid JSON: ${e.message}`);
      process.exit(1);
    }
  } else {
    console.error(`FAIL: baseline ${failOnNew} does not exist. Generate it with:`);
    console.error('  node client/scripts/ci/check-dead-affordances.mjs');
    process.exit(1);
  }
  const current = new Set(findings.map((f) => `${f.file}:${f.line}:${f.kind}`));
  const known = new Set((baseline?.findings || []).map((f) => `${f.file}:${f.line}:${f.kind}`));
  const added = [...current].filter((k) => !known.has(k));
  if (added.length) {
    console.error(`\nFAIL: ${added.length} new dead affordance(s) introduced:`);
    added.slice(0, 20).forEach((k) => console.error(`  ${k}`));
    console.error('\nA control that looks live but does nothing turns a missing capability into a false assurance.');
    process.exit(1);
  }
  console.log(`\nOK: no new dead affordances (baseline ${known.size}, current ${current.size}).`);
}

if (!existsSync(BASELINE) && !failOnNew) {
  writeFileSync(BASELINE, `${JSON.stringify({ generatedAt: new Date().toISOString(), findings }, null, 2)}\n`);
  console.log(`\nWrote baseline: ${relative(ROOT, BASELINE)}`);
}
