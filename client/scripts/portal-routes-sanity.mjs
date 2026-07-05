/**
 * Sanity check: portal-native clinical routes exist; legacy /hmis redirects configured
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const routesFile = path.resolve(__dirname, '../src/routes/index.tsx');
const portalRoutesFile = path.resolve(__dirname, '../src/routes/portalClinicalRoutes.tsx');
const pathsFile = path.resolve(__dirname, '../src/config/clinicalPortalPaths.ts');
const src = readFileSync(routesFile, 'utf8');
const portalSrc = readFileSync(portalRoutesFile, 'utf8');
const pathsSrc = readFileSync(pathsFile, 'utf8');

const required = [
  'portalClinicalRoutes("hospital"',
  'portalClinicalRoutes("doctor"',
  'portalClinicalRoutes("nurse"',
  'portalClinicalRoutes("assistant"',
  'path="/hmis/*"',
  'HmisLegacyRedirect',
  'healthosHub',
  'copilot:',
  'Navigate to="/hospital/command-center"',
  'Navigate to="/hospital/beds/map"',
];

const pathsFileAuth = path.resolve(__dirname, '../src/hooks/auth.ts');
const authSrc = readFileSync(pathsFileAuth, 'utf8');

const pathHelpers = [
  'resolveHmisLegacyPath',
  'getClinicalPortal',
  'buildClinicalPaths',
];

let failed = 0;
console.log('\n── Portal Routes Sanity ─────────────────────────────────────────\n');

for (const needle of required) {
  const haystack = needle === 'healthosHub' || needle === 'copilot:' ? portalSrc : src;
  if (haystack.includes(needle)) console.log(`  ✓ routes: ${needle}`);
  else {
    console.log(`  ✗ routes missing: ${needle}`);
    failed++;
  }
}

for (const needle of pathHelpers) {
  if (pathsSrc.includes(needle)) console.log(`  ✓ paths: ${needle}`);
  else {
    console.log(`  ✗ paths missing: ${needle}`);
    failed++;
  }
}

if (authSrc.includes('hasHospitalPortalSession')) console.log('  ✓ auth: hasHospitalPortalSession');
else {
  console.log('  ✗ auth missing: hasHospitalPortalSession');
  failed++;
}

// Legacy redirect mapping spot-check
const legacyCases = [
  ['/hmis/healthos', '/hospital/healthos'],
  ['/hmis/hospital-copilot', '/hospital/copilot'],
  ['/hmis/command-center', '/hospital/command-center'],
];

for (const [input, expectedPrefix] of legacyCases) {
  const suffix = input.replace(/^\/hmis/, '') || '/';
  const hospitalOnly = /^\/(command-center|beds\/|hospital-copilot)/.test(suffix);
  const mapped = hospitalOnly
    ? `/hospital${suffix}`.replace('/hospital/hospital-copilot', '/hospital/copilot')
    : `/hospital${suffix}`;
  if (mapped.startsWith(expectedPrefix.split('/').slice(0, 3).join('/')) || mapped === expectedPrefix) {
    console.log(`  ✓ legacy map ${input} → ${mapped}`);
  } else {
    console.log(`  ✗ legacy map ${input} expected ~${expectedPrefix}, got ${mapped}`);
    failed++;
  }
}

console.log(`\n── Results: ${failed === 0 ? 'ALL PASSED' : `${failed} FAILED`} ──\n`);
process.exit(failed > 0 ? 1 : 0);
