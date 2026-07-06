#!/usr/bin/env node
/**
 * Wire doctor copilot into msh_d_app (when repo is available locally).
 *
 * Usage:
 *   MSH_D_APP_PATH=/path/to/msh_d_app node scripts/integrate-msh-d-app-copilot.mjs
 *   MSH_D_APP_PATH=/path/to/msh_d_app node scripts/integrate-msh-d-app-copilot.mjs --dry-run
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'shared/doctor-mobile-api');
const DRY = process.argv.includes('--dry-run');

const appPath = process.env.MSH_D_APP_PATH;
if (!appPath) {
  console.error('Set MSH_D_APP_PATH to your msh_d_app checkout, e.g.:');
  console.error('  MSH_D_APP_PATH=../msh_d_app node scripts/integrate-msh-d-app-copilot.mjs');
  process.exit(1);
}

if (!existsSync(appPath)) {
  console.error(`MSH_D_APP_PATH does not exist: ${appPath}`);
  process.exit(1);
}

const destCandidates = [
  path.join(appPath, 'app/api/mediczy/doctor-mobile-api'),
  path.join(appPath, 'src/api/mediczy/doctor-mobile-api'),
];

const dest = destCandidates.find((d) => {
  const parent = path.dirname(d);
  return existsSync(parent) || existsSync(path.dirname(parent));
}) || destCandidates[0];

const filesToCopy = [
  'doctorCopilot.client.js',
  'doctorCopilot.client.ts',
  'types.ts',
  'ishaCopilot.service.js',
  'screenPaths.js',
  'useDoctorIshaCopilot.js',
  'index.ts',
  'README.md',
];

console.log(`=== msh_d_app copilot integration ${DRY ? '(dry-run)' : ''} ===`);
console.log(`Source: ${SRC}`);
console.log(`Dest:   ${dest}\n`);

if (!DRY) {
  mkdirSync(dest, { recursive: true });
  for (const file of filesToCopy) {
    const from = path.join(SRC, file);
    if (existsSync(from)) cpSync(from, path.join(dest, file), { force: true });
  }
  console.log(`✓ Copied doctor-mobile-api → ${dest}`);
}

const searchRoots = [
  path.join(appPath, 'app'),
  path.join(appPath, 'src'),
].filter(existsSync);

const LEGACY_PATTERNS = [
  /\/voice-assistant\/agent/g,
  /['"]\/voice-assistant\/agent['"]/g,
  /api\.post\(\s*['"]\/voice-assistant\/agent['"]/g,
  /\/medical-ai\/consult/g,
];

let hits = [];

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) {
      const text = readFileSync(full, 'utf8');
      for (const re of LEGACY_PATTERNS) {
        if (re.test(text)) {
          hits.push({ file: full, pattern: re.source });
          re.lastIndex = 0;
        }
      }
    }
  }
}

for (const root of searchRoots) walk(root);

console.log('\nLegacy endpoint references:');
if (!hits.length) {
  console.log('  (none found — may already be migrated or paths differ)');
} else {
  const byFile = new Map();
  for (const h of hits) {
    if (!byFile.has(h.file)) byFile.set(h.file, []);
    byFile.get(h.file).push(h.pattern);
  }
  for (const [file, patterns] of byFile) {
    console.log(`  ${path.relative(appPath, file)}`);
    for (const p of [...new Set(patterns)]) console.log(`    - ${p}`);
  }
}

const apiJsCandidates = [
  path.join(appPath, 'app/Utils/api.js'),
  path.join(appPath, 'src/Utils/api.js'),
  path.join(appPath, 'app/utils/api.js'),
].filter(existsSync);

console.log('\napi.js candidates:', apiJsCandidates.map((f) => path.relative(appPath, f)).join(', ') || '(not found)');

const snippetSrc = path.join(SRC, 'msh-d-app/api.isha.snippet.js');
if (apiJsCandidates.length && existsSync(snippetSrc)) {
  for (const apiJs of apiJsCandidates) {
    const text = readFileSync(apiJs, 'utf8');
    if (text.includes('/voice-assistant/agent')) {
      console.log(`\n⚠ Manual edit required: ${path.relative(appPath, apiJs)}`);
      console.log('  Replace Isha/VoiceAssistant module with shared/doctor-mobile-api/msh-d-app/api.isha.snippet.js');
      console.log('  Or change agent calls to: Isha.chat({ message, context, history })');
    } else if (text.includes('doctor-copilot/chat') || text.includes('ishaCopilot')) {
      console.log(`\n✓ ${path.relative(appPath, apiJs)} already references copilot`);
    }
  }
}

console.log('\nNext steps:');
console.log('1. Import ensureIshaCopilotInitialized() after doctor login');
console.log('2. Replace api.post("/voice-assistant/agent") → Isha.chat({ message, context, history })');
console.log('3. See docs/doctor/MSH_D_APP_ISHA_COPILOT_MIGRATION.md');
