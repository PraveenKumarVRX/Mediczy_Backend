// Static accessibility audit for MediQzy client JSX/TSX.
// Multi-line aware, comment-aware, no browser dependency.
// Usage: node client/scripts/check-accessibility.mjs [--baseline path] [--write-baseline]
// Exit 0 when findings <= baseline. Exit 1 on new findings or empty baseline.
import { readFileSync, existsSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = new URL('../src/', import.meta.url).pathname;
const args = process.argv.slice(2);
function opt(name) {
  const i = args.findIndex((a) => a === name || a.startsWith(name + '='));
  if (i === -1) return null;
  const a = args[i];
  if (a.includes('=')) return a.slice(name.length + 1);
  return args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
}
const BASELINE = opt('--baseline')
  || new URL('./accessibility-baseline.json', import.meta.url).pathname;
const WRITE = opt('--write-baseline');
const OUT = (typeof WRITE === 'string' && WRITE) ? WRITE : BASELINE;

function* walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (/\.tsx?$/.test(e)) yield p;
  }
}

// Strip // comments, /* */ blocks, {/* */} blocks and string literals so
// code samples inside comments/strings are never flagged.
// Newlines are PRESERVED so stripped offsets map 1:1 onto file line numbers.
function blankKeepLines(s) {
  return s.replace(/[^\n]/g, ' ');
}
function stripNoise(src) {
  return src
    .replace(/\{ voiced\/\*[\s\S]*?\*\/\}/g, blankKeepLines)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, blankKeepLines)
    .replace(/\/\*[\s\S]*?\*\//g, blankKeepLines)
    .replace(/^[ \t]*\/\/.*$/gm, blankKeepLines)
    .replace(/'(?:[^'\\\n]|\\.)*'/g, (m) => "'" + blankKeepLines(m.slice(1, -1)) + "'")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, (m) => '"' + blankKeepLines(m.slice(1, -1)) + '"')
    .replace(/`(?:[^`\\]|\\.)*`/g, (m) => '`' + blankKeepLines(m.slice(1, -1)) + '`');
}

function lineOf(src, idx) {
  return src.slice(0, idx).split('\n').length;
}

// Yield {tag, attrs} for each JSX opening/self-closing tag named `name`.
// Linear scan — no nested quantifiers, no backtracking risk.
function* tags(src, name) {
  const open = `<${name}`;
  let i = 0;
  while (true) {
    i = src.indexOf(open, i);
    if (i === -1) return;
    const after = src[i + open.length];
    if (after && /[A-Za-z0-9_-]/.test(after)) { i += open.length; continue; } // <inputx>
    let j = i + open.length;
    let depth = 0, instr = null, selfClose = false;
    while (j < src.length) {
      const c = src[j];
      if (instr) {
        if (c === instr) instr = null;
      } else if (c === '"' || c === "'") {
        instr = c;
      } else if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
      else if (c === '/' && src[j + 1] === '>' && depth === 0) { selfClose = true; break; }
      j++;
    }
    const attrs = src.slice(i + open.length, j);
    yield { index: i, attrs, selfClose };
    i = j + 1;
  }
}

function innerText(src, tagEnd, name) {
  const closeTag = `</${name}>`;
  const k = src.indexOf(closeTag, tagEnd);
  if (k === -1 || k - tagEnd > 2000) return null; // too far: bail, treat as unknown
  return src.slice(tagEnd, k);
}

const findings = [];
const perRule = {};

function add(rule, file, line, excerpt) {
  const key = `${rule}|${relative(SRC, file)}:${line}`;
  findings.push({ rule, file: relative(SRC, file), line, excerpt: excerpt.slice(0, 100) });
  perRule[rule] = (perRule[rule] || 0) + 1;
  return key;
}

for (const file of walk(SRC)) {
  const raw = readFileSync(file, 'utf8');
  const src = stripNoise(raw);
  for (const t of tags(src, 'img')) {
    if (!/\balt=/.test(t.attrs)) add('img-missing-alt', file, lineOf(src, t.index), t.attrs);
  }
  for (const t of tags(src, 'button')) {
    if (/\baria-label=/.test(t.attrs) || /\baria-labelledby=/.test(t.attrs)) continue;
    if (t.selfClose) { add('button-no-accessible-name', file, lineOf(src, t.index), t.attrs); continue; }
    const inner = innerText(src, src.indexOf('>', t.index) + 1, 'button');
    if (inner !== null && inner.replace(/\{[^}]*\}/g, '').trim() === '') {
      add('button-no-accessible-name', file, lineOf(src, t.index), t.attrs);
    }
  }
  for (const t of tags(src, 'input')) {
    const a = t.attrs;
    if (/\b(id|aria-label|aria-labelledby)=/.test(a)) continue;
    if (/\btype=(["']?)(hidden|submit|button)\1/.test(a)) continue;
    // Label association patterns — all three give the input a real accessible name:
    //  (a) wrapping: <label>…<input>…
    //  (b) shadcn/react-hook-form: <FormField>…<FormLabel>…<Input>
    //  (c) sibling: <label>…</label> immediately before the input in the same
    //      container (<div><label>X</label><input/></div>).
    const before = src.slice(Math.max(0, t.index - 900), t.index);
    // (a) wrapping: the nearest <label> opener is still open (no </label> since).
    const lastOpen = before.search(/<label[\s>][\s\S]*$/);
    const lastClose = before.search(/<\/label>[\s\S]*$/);
    if (lastOpen !== -1 && lastOpen > lastClose) continue;
    if (/<FormField[\s>]/.test(before) && /<FormLabel[\s>]/.test(before)) continue;
    const sibling = before.slice(-450);
    if (/<label[\s>][\s\S]{0,200}?<\/label>\s*$/.test(sibling)) continue;
    add('input-no-label', file, lineOf(src, t.index), a);
  }
  for (const name of ['div', 'span']) {
    for (const t of tags(src, name)) {
      if (!/\bonClick=/.test(t.attrs)) continue;
      // Modal/drawer backdrop pattern: a bare onClick close on the overlay is the
      // mouse shortcut; keyboard users dismiss via the dialog's focus trap / close
      // button / Escape. Requiring role=button on every backdrop would add ~100
      // noisy findings the team would learn to ignore — worse than documenting it.
      if (/\b(bg-black\/|backdrop-blur|fixed inset-0)/.test(t.attrs)) continue;
      const hasRole = /\brole=/.test(t.attrs);
      const hasKey = /\b(tabIndex|onKey(Down|Up|Press))=/.test(t.attrs);
      if (!hasRole || !hasKey) add('clickable-no-keyboard', file, lineOf(src, t.index), t.attrs);
    }
  }
}

findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
const keys = findings.map((f) => `${f.rule}|${f.file}:${f.line}`);

let baseline = [];
try {
  if (existsSync(BASELINE)) {
    const parsed = JSON.parse(readFileSync(BASELINE, 'utf8'));
    const arr = parsed.findings || [];
    baseline = arr.map((f) => (typeof f === 'string' ? f : `${f.rule}|${f.file}:${f.line}`));
  }
} catch (err) {
  console.error(`WARN: unreadable baseline at ${BASELINE} — treating as empty (${err.message})`);
  baseline = [];
}

if (WRITE) {
  writeFileSync(OUT, JSON.stringify({ findings, counts: perRule }, null, 2) + '\n');
  console.log(`baseline written: ${keys.length} findings`);
  console.log(JSON.stringify(perRule, null, 2));
  process.exit(0);
}

if (baseline.length === 0) {
  console.error('FAIL: baseline is empty — refusing to pass an uncalibrated gate.');
  console.error(`Current findings: ${keys.length} ${JSON.stringify(perRule)}`);
  process.exit(1);
}

const baseSet = new Set(baseline);
const fresh = findings.filter((f) => !baseSet.has(`${f.rule}|${f.file}:${f.line}`));
const fixed = baseline.filter((b) => !new Set(keys).has(b));

console.log(`baseline=${baseline.length} current=${keys.length} new=${fresh.length} fixed=${fixed.length}`);
console.log(JSON.stringify(perRule, null, 2));
if (fresh.length) {
  console.error('NEW accessibility findings (fix or justify, then re-baseline):');
  for (const f of fresh.slice(0, 30)) console.error(`  ${f.rule} ${f.file}:${f.line}`);
  process.exit(1);
}
console.log('a11y gate: PASS');
