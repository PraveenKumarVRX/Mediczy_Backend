/**
 * Unit sanity: ring-fencing allows hospital/doctor/nurse on HealthOS API paths
 */
import { hasAccess } from '../middleware/ringFencing.js';

const cases = [
  ['hospital', '/api/v3/healthos/health', true],
  ['hospital', '/api/v3/careos/health', true],
  ['hospital', '/api/v3/hospital-os/health', true],
  ['hospital', '/api/hypergrid/dicom/studies', true],
  ['hospital', '/api/v1/analytics/command-center', true],
  ['doctor', '/api/v3/healthos/workspace/1', true],
  ['nurse', '/api/v3/healthos/timeline/1', true],
  ['assistant', '/api/v3/careos/health', true],
  ['user', '/api/v3/healthos/health', false],
  ['hospital', '/api/admin/users', false],
];

let failed = 0;
console.log('\n── Ring-Fencing Sanity (HealthOS paths) ───────────────────────\n');
for (const [role, path, expected] of cases) {
  const got = hasAccess(role, path);
  if (got === expected) console.log(`  ✓ ${role} ${path} → ${got}`);
  else {
    console.log(`  ✗ ${role} ${path} expected ${expected}, got ${got}`);
    failed++;
  }
}
console.log(`\n── Results: ${failed === 0 ? 'ALL PASSED' : `${failed} FAILED`} ──\n`);
process.exit(failed > 0 ? 1 : 0);
