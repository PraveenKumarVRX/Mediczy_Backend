#!/usr/bin/env node
/**
 * Static sanity check for HealthOS frontend (Phases 0–10)
 * Validates nav ↔ router alignment, lazy imports, and service ↔ API mapping.
 * Run: node server/scripts/qa/healthos-frontend-sanity.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const CLIENT = path.join(ROOT, 'client/src');

let passed = 0;
let failed = 0;

function ok(label) {
  passed++;
  console.log(`  ✓ ${label}`);
}
function bad(label, reason) {
  failed++;
  console.log(`  ✗ ${label}: ${reason}`);
}

function read(rel) {
  return fs.readFileSync(path.join(CLIENT, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(CLIENT, rel));
}

// ── Nav ↔ Router alignment (Phases 4–10) ───────────────────────────────────
const navFile = read('../config/hospitalOsNav.config.ts'.replace('../', ''));
const routerFile = read('features/hospital-os/HospitalOSRouter.tsx');

const segments = [...navFile.matchAll(/segment:\s*'([^']+)'/g)].map((m) => m[1]);
const routePaths = [...routerFile.matchAll(/path="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((p) => !p.includes('*') && p !== '');

for (const seg of segments) {
  if (routePaths.includes(seg)) ok(`nav segment "${seg}" has route`);
  else bad(`nav segment "${seg}"`, 'missing in HospitalOSRouter');
}

for (const rp of routePaths) {
  if (segments.includes(rp) || rp === '') continue;
  if (!segments.includes(rp)) bad(`route "${rp}"`, 'not in hospitalOsNav.config');
}

// ── Page files exist ─────────────────────────────────────────────────────────
const pageImports = [...routerFile.matchAll(/from '@\/features\/hospital-os\/pages\/([^']+)'/g)].map((m) => m[1]);
for (const page of pageImports) {
  const file = `features/hospital-os/pages/${page}.tsx`;
  if (exists(file)) ok(`page file ${page}.tsx`);
  else bad(`page file ${page}.tsx`, 'missing');
}

// ── Phase 0–3 critical files ─────────────────────────────────────────────────
const critical = [
  'layouts/ClinicalShell.tsx',
  'layouts/CommandCenterShell.tsx',
  'layouts/FamilyPortalShell.tsx',
  'layouts/HospitalOSShell.tsx',
  'config/clinicalNav.config.ts',
  'features/workspace/pages/WorkspaceOverview.tsx',
  'features/workspace/pages/AICareTeamPage.tsx',
  'features/mdt/pages/MDTInboxPage.tsx',
  'features/mdt/pages/MDTRoom.tsx',
  'features/command/pages/CommandCenterOverview.tsx',
  'features/family/FamilyPortalRouter.tsx',
  'features/ecosystem/pages/FederationConsole.tsx',
  'services/hospitalOs.service.ts',
  'services/hospitalOsControl.service.ts',
  'services/workspace.service.ts',
];
for (const f of critical) {
  if (exists(f)) ok(`critical file ${f}`);
  else bad(`critical file ${f}`, 'missing');
}

// ── Routes registered in index.tsx ───────────────────────────────────────────
const routesIndex = fs.readFileSync(path.join(CLIENT, 'routes/index.tsx'), 'utf8');
const routeChecks = [
  ['/hospital/os/*', 'HospitalOSRouter'],
  ['/hospital/command-center/*', 'CommandCenter'],
  ['/hospital/mdt/inbox', 'MDTInboxPage'],
  ['/family/*', 'FamilyPortalRouter'],
  ['/hospital/federation', 'FederationConsole'],
];
for (const [route, component] of routeChecks) {
  if (routesIndex.includes(route)) ok(`route registered ${route}`);
  else bad(`route registered ${route}`, 'missing in routes/index.tsx');
  if (component && !routesIndex.includes(component)) bad(`component ${component}`, 'not lazy-loaded');
}

// ── Service functions ↔ backend routes ───────────────────────────────────────
const serviceFile = read('services/hospitalOs.service.ts');
const backendRoute = fs.readFileSync(path.join(ROOT, 'server/routes/hospital-os.route.js'), 'utf8');

const apiPairs = [
  ['/v3/hospital-os/copilot/chat', "router.post('/copilot/chat'"],
  ['/v3/hospital-os/approvals', "router.get('/approvals'"],
  ['/v3/hospital-os/twins/patient/', "router.get('/twins/patient/:patientId'"],
  ['/v3/hospital-os/twins/hospital', "router.get('/twins/hospital'"],
  ['/v3/hospital-os/simulate/hospital', "router.post('/simulate/hospital'"],
  ['/v3/hospital-os/nurse/handover', "router.post('/nurse/handover'"],
  ['/v3/hospital-os/translator', "router.post('/translator'"],
  ['/v3/hospital-os/voice/draft-lab-order', "router.post('/voice/draft-lab-order'"],
  ['/v3/hospital-os/journey/optimize', "router.post('/journey/optimize'"],
  ['/v3/hospital-os/workforce/analysis', "router.get('/workforce/analysis'"],
  ['/v3/hospital-os/research/trials/', "router.get('/research/trials/:patientId'"],
  ['/v3/hospital-os/ambient/status', "router.get('/ambient/status'"],
];
for (const [svcPath, routeDef] of apiPairs) {
  if (serviceFile.includes(svcPath) && backendRoute.includes(routeDef)) ok(`API mapping ${svcPath}`);
  else bad(`API mapping ${svcPath}`, `service=${serviceFile.includes(svcPath)} route=${backendRoute.includes(routeDef)}`);
}

const controlService = read('services/hospitalOsControl.service.ts');
const controlRoute = fs.readFileSync(path.join(ROOT, 'server/routes/hospital-os-control.route.js'), 'utf8');
if (controlService.includes('devices') && controlRoute.includes("router.get('/devices'")) ok('control plane devices API');
else bad('control plane devices API', 'mismatch');

// ── Clinical nav entry point ─────────────────────────────────────────────────
const clinicalNav = read('config/clinicalNav.config.ts');
if (clinicalNav.includes("href: '/hospital/os/voice'")) ok('clinical nav points to /hospital/os/voice');
else bad('clinical nav', 'Hospital OS 2035 href not /hospital/os/voice');

console.log(`\n── Static sanity: ${passed} passed, ${failed} failed ──\n`);
process.exit(failed > 0 ? 1 : 0);
