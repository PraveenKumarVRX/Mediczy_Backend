process.env.NODE_ENV = 'test';

/**
 * MED-MIND-001 Phase 3 — the lane boundary.
 *
 * Two wellness lanes exist in this codebase and must never meet:
 *
 *   individual patient mental health  ->  /api/programs  +  health_programs,
 *                                         program_enrollments,
 *                                         program_assessment_responses
 *   corporate / HR wellness           ->  /api/corporate/*  +  wellness_* tables
 *
 * An employer must not be able to learn that an employee took a PHQ-9, let alone
 * what they scored. The design makes that structural rather than conditional:
 * `program_assessment_responses` has no `corporate_id` and no join path to one,
 * so there is no query an HR endpoint could write to reach it — a reviewer does
 * not have to audit every corporate route to be sure.
 *
 * These tests guard that structure against the ordinary way it would erode: a
 * later migration adding a convenient `corporate_id`, or a corporate route
 * joining the table "just for reporting". They read source files rather than
 * hitting the database, so they run in CI with no credentials and they fail at
 * review time instead of after a privacy incident.
 */

import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MENTAL_HEALTH_TABLES = ['program_assessment_responses'];

/** Files allowed to mention the mental-health response table at all. */
const ALLOWED_REFERENCES = [
  'migrations/20261110000100-mental-wellness-instruments.migration.js',
  'routes/health-programs.route.js',
  'services/ai-health-risk-cron.service.js', // reads the patient's OWN score for their risk subscore
  'scripts/seed-mental-wellness-programs.mjs',
  'scripts/verify-mind-insert-path.mjs',
  'scripts/verify-mind-seeded.mjs',
  'scripts/verify-mind-preflight.mjs',
  '__tests__/mental-wellness-api.test.js',
  '__tests__/mental-wellness-lane-boundary.test.js',
  'utils/mentalHealthSubscore.js',
];

/** Directories to sweep for source that could reach the table. */
const SWEPT_DIRS = ['routes', 'services', 'controllers', 'repositories', 'models', 'middleware', 'utils', 'migrations', 'scripts', '__tests__'];

function listSourceFiles() {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        walk(full);
      } else if (/\.(js|mjs|cjs|ts)$/.test(e.name)) {
        out.push(full);
      }
    }
  };
  for (const d of SWEPT_DIRS) walk(path.join(SERVER_ROOT, d));
  return out;
}

const SOURCE_FILES = listSourceFiles();

const relative = (f) => path.relative(SERVER_ROOT, f);

describe('lane boundary — who may touch program_assessment_responses', () => {
  it('sweeps a meaningful number of files (guards against a broken sweep)', () => {
    // A test that silently stops looking is worse than no test.
    expect(SOURCE_FILES.length).toBeGreaterThan(200);
  });

  it('is referenced only by the allow-listed files', () => {
    const offenders = [];
    for (const file of SOURCE_FILES) {
      const rel = relative(file);
      if (ALLOWED_REFERENCES.includes(rel)) continue;
      const src = fs.readFileSync(file, 'utf8');
      for (const table of MENTAL_HEALTH_TABLES) {
        if (src.includes(table)) offenders.push(`${rel} mentions ${table}`);
      }
    }
    // If this fails, the new file either belongs on the allow list (and its
    // scoping needs reviewing) or it is the leak this test exists to catch.
    expect(offenders).toEqual([]);
  });

  it('no corporate, employer, HR or wellness-lane file references it', () => {
    // The corporate lane by filename — minus this module's own files, whose
    // names also contain "wellness" but which ARE the individual lane.
    const corporateLane = SOURCE_FILES.filter((f) => {
      const rel = relative(f);
      if (/mental-wellness|mentalHealth|mind-wellness|\bmind\b/i.test(rel)) return false;
      return /corporate|employer|\bhr\b|wellness|ohc|cmo/i.test(rel);
    });
    expect(corporateLane.length).toBeGreaterThan(5); // the lane exists to be checked

    const offenders = corporateLane
      .filter((f) => {
        const src = fs.readFileSync(f, 'utf8');
        return MENTAL_HEALTH_TABLES.some((t) => src.includes(t));
      })
      .map(relative);
    expect(offenders).toEqual([]);
  });
});

describe('lane boundary — the table has no path to an employer', () => {
  const migrationPath = path.join(
    SERVER_ROOT,
    'migrations/20261110000100-mental-wellness-instruments.migration.js',
  );

  it('the migration exists', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  it('declares no corporate, employer or tenant column', () => {
    const src = fs.readFileSync(migrationPath, 'utf8');
    // Isolate the CREATE TABLE body so the file's explanatory comments (which
    // legitimately discuss corporates) do not trip the assertion.
    const match = src.match(/CREATE TABLE IF NOT EXISTS program_assessment_responses\s*\(([\s\S]*?)\n\s*\)/i);
    expect(match).not.toBeNull();
    const body = match[1];
    for (const forbidden of ['corporate_id', 'corporate_employee_id', 'employer_id', 'tenant_id', 'organization_id', 'hr_']) {
      expect(body.toLowerCase()).not.toContain(forbidden);
    }
  });

  it('its only foreign keys are the enrollment and the assessment', () => {
    const src = fs.readFileSync(migrationPath, 'utf8');
    const match = src.match(/CREATE TABLE IF NOT EXISTS program_assessment_responses\s*\(([\s\S]*?)\n\s*\)/i);
    const referenced = [...match[1].matchAll(/REFERENCES\s+([a-z_]+)/gi)].map((m) => m[1].toLowerCase());
    expect([...new Set(referenced)].sort()).toEqual(['program_assessments', 'program_enrollments']);
  });
});

describe('lane boundary — reads are scoped to the signed-in person', () => {
  const routeSrc = fs.readFileSync(path.join(SERVER_ROOT, 'routes/health-programs.route.js'), 'utf8');

  it('every assessment endpoint resolves the enrollment through loadOwnEnrollment', () => {
    // loadOwnEnrollment is the single place that binds enrollment -> user_id.
    // A handler that queries program_assessment_responses without going through
    // it would be reading by a caller-supplied id.
    const handlers = [...routeSrc.matchAll(
      /router\.(get|post)\(\s*'([^']*assessments[^']*)'[\s\S]*?\n\}\);/g,
    )];
    expect(handlers.length).toBeGreaterThanOrEqual(2);
    for (const m of handlers) {
      const [body, , routePath] = m;
      expect(body).toContain('loadOwnEnrollment');
      expect(routePath).toContain('assessments');
    }
  });

  it('loadOwnEnrollment filters on user_id, not only on the enrollment id', () => {
    const fn = routeSrc.match(/async function loadOwnEnrollment[\s\S]*?\n\}/);
    expect(fn).not.toBeNull();
    expect(fn[0]).toMatch(/e\.id\s*=\s*\$1\s+AND\s+e\.user_id\s*=\s*\$2/i);
  });

  it('a missing enrollment and someone else\'s enrollment return the same message', () => {
    // Different responses would make the endpoint an oracle for enrollment ids.
    const notFound = [...routeSrc.matchAll(/message:\s*'Enrollment not found'/g)];
    expect(notFound.length).toBeGreaterThanOrEqual(2);
  });
});

describe('lane boundary — crisis detection notifies nobody', () => {
  const crisisSrc = fs.readFileSync(path.join(SERVER_ROOT, 'utils/crisis-detection.js'), 'utf8');
  const diarySrc = fs.readFileSync(path.join(SERVER_ROOT, 'routes/health-diary.route.js'), 'utf8');

  it('the detector imports nothing — no db, no mailer, no notifier', () => {
    const imports = [...crisisSrc.matchAll(/^import\s.*$/gm)].map((m) => m[0]);
    expect(imports).toEqual([]);
  });

  it('the diary route does not notify or escalate on a detection', () => {
    // Guard against a later "while we are here, let us alert the care team".
    const withCrisis = diarySrc.match(/function withCrisisSupport[\s\S]*?\n\}/);
    expect(withCrisis).not.toBeNull();
    // Guards against a later "while we are here, let us alert the care team".
    for (const forbidden of ['sendEmail', 'notify', 'sendSMS', 'whatsapp', 'INSERT', 'alert']) {
      expect(withCrisis[0].toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});
