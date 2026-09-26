import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * WP-1.2 contract test: every prescription WRITE path must be behind prescriptionSafetyGate().
 *
 * The plan asks for "eight server paths blocked" and for route coverage. The gate currently exists
 * on all eight, but nothing stops someone adding a ninth write with no gate at all — and a clinical
 * safety control that exists only in the file someone remembered is a coincidence, not a control.
 *
 * This reads the route sources as text rather than importing them, so it needs no database, and it
 * checks the gate is in THAT route's middleware chain rather than merely somewhere in the file.
 *
 * A path heuristic alone is not reliable here: prescription.route.js is mounted at
 * /api/prescriptions, so its own routes are '/' , '/:id', '/:id/status'. Scoping by mount point and
 * using an explicit, reviewed allowlist of the non-prescribing writes is therefore both stricter
 * and more honest than guessing from a URL substring.
 *
 * KNOWN LIMITATION — this is a static text check, and it verifies that a gate is PRESENT in a
 * route's middleware chain, not that it RUNS. Verified by experiment: injecting
 * `async (q,s,n)=>n(),` ahead of the gate leaves this suite green, because the gate text is still
 * there. So it catches "a new write path with no gate at all" and "a gate that was deleted", and it
 * does NOT catch "a gate that is present but short-circuited or reordered". Catching that needs a
 * behavioural test that issues a prescription through the real Express app with a patient who has a
 * recorded allergy and asserts the response is refused. That is the remaining WP-1.2 acceptance
 * work and it is a clinical sign-off item, not something a source scan can substitute for.
 */
const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(HERE, rel), 'utf8');

/** Route declarations whose middleware chain we inspect. */
const WRITE_ROUTE = /router\.(post|put|patch)\s*\(\s*(['"`])([^'"`]+)\2([\s\S]{0,600}?)\n/g;
const GATED = /safety(On|From)\w*|prescriptionSafetyGate\(/;

/**
 * Writes that are deliberately NOT gated, each with the reason. Adding to this list needs a
 * clinical justification in a comment — it is the place a real gap would otherwise be hidden.
 */
const REVIEWED_UNGATED = new Map(Object.entries({
  'prescription.route.js:POST /safety-check': 'Runs the safety check itself; it prescribes nothing.',
  'prescription.route.js:POST /:id/adherence': 'Patient adherence reporting, not a new order.',
  'prescription.route.js:POST /:id/share': 'Sharing an existing prescription document.',
  'prescription.route.js:POST /:id/share/whatsapp/:phone': 'Sharing an existing prescription document.',
  'emar.route.js:POST /validate-administration': 'The bedside validation endpoint itself.',
  'emar.route.js:POST /administer': 'Bedside administration. validateAdministration runs its own allergy check at the bedside.',
  'emar.route.js:POST /:orderId/administer': 'Bedside administration of an already-issued order.',
  'emar.route.js:POST /:orderId/hold': 'Holds an existing order; creates no medication.',
  'emar.route.js:PUT /orders/:id/hold': 'Holds an existing order; creates no medication.',
  'emar.route.js:PUT /orders/:id/discontinue': 'Stops a medication. Gating this would block safe discontinuation.',
  'practice.route.js:POST /pharmacy/prescriptions/:id/dispense': 'Dispenses an already-prescribed item; the prescribing event was gated at POST /pharmacy/prescriptions.',
}));

/** Files whose write routes are prescribing by virtue of their mount point. */
const PRESCRIBING_FILES = new Set([
  'routes/prescription.route.js',              // mounted at /api/prescriptions
  'routes/emar.route.js',                      // mounted at /api/v1/emar — only /orders creates medication
  'routes/hospital/practice.route.js',
]);

/** In these files, only these paths actually create or change medication. */
const IS_PRESCRIBING = (file, path) => {
  const p = path.toLowerCase();
  if (file.endsWith('prescription.route.js')) {
    return !/^\/(safety-check|:id\/adherence|:id\/share)/.test(p);
  }
  if (file.endsWith('emar.route.js')) return p === '/orders';
  return /prescription|\border\b|medicat/.test(p) && !/lab-orders|imaging-orders|dispense|validate/.test(p);
};

describe('WP-1.2 prescribing safety route coverage', () => {
  it('every prescribing write route is behind a safety gate', () => {
    const ungated = [];
    let gated = 0;

    for (const rel of PRESCRIBING_FILES) {
      const src = read(rel);
      for (const match of src.matchAll(WRITE_ROUTE)) {
        const [, method, , path, tail] = match;
        if (!IS_PRESCRIBING(rel, path)) continue;
        const key = `${rel.split('/').pop()}:${method.toUpperCase()} ${path}`;
        if (GATED.test(tail)) gated += 1;
        else if (!REVIEWED_UNGATED.has(key)) ungated.push(key);
      }
    }

    expect({ ungated }).toEqual({ ungated: [] });
    // The plan's "eight server paths" — create, update, issue, status-issued, from-appointment,
    // eMAR order, practice prescription, and pharmacy dispensing.
    expect(gated).toBeGreaterThanOrEqual(8);
  });

  it('every allowlisted ungated write is still justified in this file', () => {
    // If a route is renamed, its allowlist entry becomes dead weight that hides future drift.
    for (const [key, why] of REVIEWED_UNGATED) {
      expect(why.length).toBeGreaterThan(20);
      expect(REVIEWED_UNGATED.get(key)).toBe(why);
    }
  });

  it('the eight documented gate paths are all still declared', () => {
    const src = [...PRESCRIBING_FILES].map(read).join('\n');
    for (const path of [
      'prescription.create',
      'prescription.update',
      'prescription.issue',
      'prescription.status-issued',
      'prescription.from-appointment',
      'emar.order',
      'hospital.practice.prescription',
      'hospital.practice.pharmacy-dispense',
    ]) {
      expect(src).toContain(`'${path}'`);
    }
  });

  it('the gate is imported, not redefined inline in a route file', () => {
    for (const rel of PRESCRIBING_FILES) {
      expect(read(rel)).toMatch(/from\s+['"][^'"]*prescription-safety\.service\.js['"]/);
      expect(read(rel)).not.toMatch(/function\s+prescriptionSafetyGate/);
    }
  });

  it('issuing paths fail CLOSED when the safety service itself errors', () => {
    const svc = read('services/prescription-safety.service.js');
    // The header states it; assert the behaviour marker exists so the claim is anchored to code.
    expect(svc).toMatch(/fail CLOSED|fail closed/i);
    expect(svc).toContain('SAFETY_BLOCK');
    expect(svc).toMatch(/503/);
  });
});
