#!/usr/bin/env node
/**
 * App-store reviewer account — dedicated, isolated, never the shared QA login.
 * =============================================================================
 * Google Play (and App Store) require working credentials for any app behind a
 * login, entered in Play Console under **App content -> App access**. Reviewers
 * keep them on file and reuse them for every future release and every policy
 * re-review.
 *
 * WHY NOT THE SHARED QA ACCOUNT (user@mediczy.com)
 * -----------------------------------------------
 * 1. It cannot sign in to the mobile app at all. `/api/patient/login` requires
 *    `role = 'patient'` AND `organization_id = <clinic>`; that account is
 *    `role = 'user'` with `organization_id = NULL`, so the mobile endpoint
 *    returns 401 for it no matter which clinic is supplied.
 * 2. Its password is rewritten by `scripts/qa/reset-user-qa-account.mjs`, which
 *    is run by hand during QA. A reset mid-review makes the reviewer's
 *    credentials fail, and "cannot sign in" is a rejection, not a retry.
 * 3. Its credentials are published in `docs/testing/TEST_CREDENTIALS.md`, so
 *    they are not a secret and are shared by everyone doing QA. Concurrent use
 *    also burns the per-email login throttle (5 attempts / 15 min) that the
 *    reviewer needs.
 *
 * WHICH ORGANISATION IT LIVES IN
 * ------------------------------
 * Patient mobile sessions are bound to exactly one clinic (`tenants.id`), so the
 * reviewer account has to be a patient OF that clinic. It therefore defaults to
 * the tenant already flagged `metadata.demo = 'true'` (today: 11, Smart
 * Hospital), which holds no real patient records. Pointing a reviewer at a live
 * hospital tenant would expose that hospital's data to a third party, so a
 * non-demo tenant requires an explicit --force.
 *
 * NO PHI, EVER. The account is seeded with an obviously synthetic identity. Do
 * not attach real reports, prescriptions or appointments to it.
 *
 * USAGE
 *   node scripts/ssm-env-loader.mjs scripts/qa/ensure-play-reviewer-account.mjs
 *   ... --clinic 7              # bind to a different tenant (must be active)
 *   ... --clinic 7 --force      # allow a tenant not flagged demo
 *   ... --rotate                # issue a fresh password
 *   PLAY_REVIEWER_PASSWORD=...  # set an exact password instead of generating one
 *   PLAY_REVIEWER_EMAIL=...     # override the address
 *
 * It is idempotent: re-running leaves the existing password alone unless
 * --rotate or PLAY_REVIEWER_PASSWORD is given, so it is safe in a deploy script.
 */

import path from 'node:path';
import { randomInt } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import dotenv from 'dotenv';

// ORTHANC_*-style vars and the DB password live in server/.env, which
// ssm-env-loader.mjs does NOT read. Load it before touching the pool.
dotenv.config();

const DEFAULT_EMAIL = 'play.reviewer@mysmarthealth.in';
const DEFAULT_CLINIC_ID = 11; // tenants.metadata->>'demo' = 'true'

/**
 * Deliberately excludes characters that get mangled between a shell, a Play
 * Console form field and an on-screen keyboard: quotes, backslash, backtick,
 * space, and the l/1/I, O/0 lookalikes a reviewer would have to retype.
 */
const PASSWORD_ALPHABET = {
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  lower: 'abcdefghijkmnopqrstuvwxyz',
  digit: '23456789',
  symbol: '@#%*-_=+:.?',
};

export function generatePassword(length = 20) {
  const pools = Object.values(PASSWORD_ALPHABET);
  const all = pools.join('');
  // One from each pool first, so the result always satisfies a mixed-class
  // policy, then fill and shuffle with a CSPRNG (never Math.random).
  const chars = pools.map((pool) => pool[randomInt(pool.length)]);
  while (chars.length < length) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function parseArgs(argv) {
  const flag = (name) => argv.includes(`--${name}`);
  const value = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const rawClinic = value('clinic') ?? process.env.PLAY_REVIEWER_CLINIC_ID;
  if (rawClinic !== undefined && !/^[1-9][0-9]*$/.test(String(rawClinic))) {
    throw new Error(`--clinic must be a positive integer tenant id (received ${JSON.stringify(rawClinic)})`);
  }
  return {
    email: (value('email') || process.env.PLAY_REVIEWER_EMAIL || DEFAULT_EMAIL).toLowerCase().trim(),
    clinicId: rawClinic === undefined ? DEFAULT_CLINIC_ID : Number(rawClinic),
    force: flag('force'),
    rotate: flag('rotate'),
    explicitPassword: process.env.PLAY_REVIEWER_PASSWORD || undefined,
  };
}

export async function ensurePlayReviewerAccount(options, deps) {
  const { User, Tenant } = deps;
  const { email, clinicId, force, rotate, explicitPassword } = options;

  const tenant = await Tenant.findByPk(clinicId);
  if (!tenant) throw new Error(`Tenant ${clinicId} does not exist.`);
  // findClinicByIdentifier() in unified-patient.controller.js filters on
  // status='active', so a pending/suspended tenant yields "Clinic not found".
  if (tenant.status !== 'active') {
    throw new Error(`Tenant ${clinicId} (${tenant.name}) is '${tenant.status}', not 'active' — patient login would return 404 "Clinic not found".`);
  }
  const isDemo = String(tenant.metadata?.demo) === 'true';
  if (!isDemo && !force) {
    throw new Error(
      `Tenant ${clinicId} (${tenant.name}) is not flagged metadata.demo='true'. An app-store reviewer `
      + 'placed in a live organisation can reach that organisation\'s data. Re-run with --force if this is intended.',
    );
  }

  const existing = await User.findOne({ where: { email } });

  // Keep the password stable across re-runs: a deploy script that silently
  // rotated it would break the credentials already filed in Play Console.
  const password = explicitPassword || (existing && !rotate ? null : generatePassword());

  const identity = {
    role: 'patient',
    status: 'active',
    organization_id: tenant.id,
    // 'individual' is what every other patient row uses, and it routes
    // users_organization_uid_guard() down its generic branch, which derives
    // organization_uid from tenants.unique_id itself. organization_uid is left
    // unset on purpose: the trigger owns the uid twin (CLAUDE.md rule 5).
    organization_type: 'individual',
    tenant_id: tenant.id,
    emailVerified: true,
    isVerified: true,
    isAdmin: false,
    isTeam: false,
    isCorporate: false,
    metadata: {
      ...(existing?.metadata || {}),
      purpose: 'app-store-review',
      managedBy: 'scripts/qa/ensure-play-reviewer-account.mjs',
      doNotDelete: true,
      syntheticIdentity: true,
      note: 'Google Play / App Store reviewer login. Not a QA account, not a real patient. No PHI.',
    },
  };

  if (!existing) {
    // unique_id is omitted on purpose: the trg_entity_uid_* triggers mint it,
    // register it in entity_registry and guarantee global uniqueness (CLAUDE.md
    // entity-ID rule 1). Never supply one from application code.
    const created = await User.create({
      email,
      password,
      firstName: 'App',
      lastName: 'Reviewer',
      // phoneNumber/dateOfBirth/gender are NOT NULL on the model. Synthetic
      // values only — this account must never carry a real person's details.
      // +919999000088 was verified unused; +919999000007 is the shared QA
      // account's and +919999000099 already belongs to another row.
      phoneNumber: process.env.PLAY_REVIEWER_PHONE || '+919999000088',
      dateOfBirth: '1990-01-01',
      gender: 'Other',
      ...identity,
    });
    return { action: 'created', id: created.id, uniqueId: created.unique_id, password, tenant };
  }

  await existing.update(password ? { ...identity, password } : identity);
  await existing.reload();
  return { action: password ? 'updated+password' : 'updated', id: existing.id, uniqueId: existing.unique_id, password, tenant };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const { default: User } = await import('../../models/postgres/user.model.postgres.js');
  const { default: Tenant } = await import('../../models/postgres/tenant.model.postgres.js');
  const { connectToPostgresDB, postgresSequelize } = await import('../../db/postgres-sequelize.js');
  await connectToPostgresDB();

  try {
    const result = await ensurePlayReviewerAccount(options, { User, Tenant });

    // Prove the stored hash actually verifies, rather than trusting the write.
    const check = await User.findOne({
      where: { email: options.email, organization_id: result.tenant.id, role: 'patient', status: 'active' },
    });
    if (!check) throw new Error('Account was written but is not selectable by the login query.');
    const verified = result.password ? await check.verifyPassword(result.password) : null;
    if (result.password && !verified) throw new Error('Stored password hash does not verify.');

    console.log(`\n  action        : ${result.action}`);
    console.log(`  user id       : ${result.id}  (uid ${result.uniqueId})`);
    console.log(`  organisation  : ${result.tenant.id} — ${result.tenant.name}`);
    console.log(`  login query   : matches (role=patient, status=active, organization_id=${result.tenant.id})`);
    console.log(`  hash verifies : ${result.password ? 'yes' : 'unchanged (re-run with --rotate to reissue)'}`);
    console.log('\n  ── Play Console › App content › App access ──────────────────');
    console.log(`  Server URL : https://<the origin whose tenant is ${result.tenant.id}>`);
    console.log(`  Username   : ${options.email}`);
    console.log(`  Password   : ${result.password || '(unchanged — not stored anywhere by this script)'}`);
    console.log('  ─────────────────────────────────────────────────────────────');
    console.log('\n  This password is printed once and is not recoverable. Put it in Play');
    console.log('  Console now; --rotate issues a new one.\n');
  } finally {
    try { await postgresSequelize.close(); } catch { /* already closed */ }
  }
}

/**
 * scripts/ssm-env-loader.mjs runs its target with `await import()` without
 * rewriting process.argv, so argv[1] is the loader and argv[2] is this file.
 * The usual argv[1]-only guard never fires under it and the script silently
 * does nothing.
 */
function invokedAsScript() {
  for (const candidate of [process.argv[1], process.argv[2]]) {
    if (!candidate) continue;
    try {
      if (pathToFileURL(path.resolve(process.cwd(), candidate)).href === import.meta.url) return true;
    } catch { /* not a path */ }
  }
  return false;
}

if (invokedAsScript()) {
  main().catch((error) => {
    console.error(`\nFailed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
