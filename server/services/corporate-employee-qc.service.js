/**
 * Corporate Employee QC Service
 * ================================
 * Daily 3 AM data-integrity sweep across all active corporates.
 *
 * Checks performed:
 *   1. INACTIVE_USER        — users.status != 'active' despite active corporate link
 *   2. MISSING_PLAN         — employee has no ACTIVE user_subscription for their corporate plan
 *   3. STALE_CE_INACTIVE    — corporate_employees.isActive = false despite active association
 *   4. ORPHAN_ASSOCIATION   — user_associations row with no matching corporate_employees row
 *   5. EXPIRED_PLAN         — user_subscription end_date < TODAY (sets it INACTIVE automatically)
 *   6. NEVER_LOGGED_IN      — employees who have never logged in get an approved reminder email
 *
 * Auto-fixes:
 *   - Sets users.status = 'active' for INACTIVE_USER cases
 *   - Assigns active corporate plan for MISSING_PLAN cases
 *   - Syncs corporate_employees.isActive = true for STALE_CE_INACTIVE cases
 *   - Sets expired user_subscriptions to INACTIVE for EXPIRED_PLAN cases
 *   - Sends approved reminder email (corporate_employee_reminder template) to NEVER_LOGGED_IN,
 *     respecting 275/day bulk quota and a 14-day per-recipient cooldown
 *
 * Writes a full audit row to corporate_employee_qc_log after every run.
 * Schedule: Daily 03:00 IST (21:30 UTC previous day → adjusted: 03:00 server-local time)
 */

import cron from 'node-cron';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { getCronPool } from '../db/pgPool.js';
import { tick, tickError, tickStart } from '../utils/cronRegistry.js';
import { checkQuota, recordSent } from '../utils/emailQuota.js';
import {
  generateSecurePassword,
  buildCorporateEmployeeReminderEmail,
  sendPreparedCorporateEmployeeWelcomeEmail,
} from './welcome-email.service.js';

const pool = getCronPool();

// ── ensure audit table exists ─────────────────────────────────────────────────
async function ensureQcTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS corporate_employee_qc_log (
      id              SERIAL PRIMARY KEY,
      run_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      duration_ms     INTEGER,
      corporates_scanned INTEGER,
      checks_run      INTEGER,
      issues_found    INTEGER,
      issues_fixed    INTEGER,
      issues_failed   INTEGER,
      summary         JSONB,
      errors          JSONB
    )
  `);
}

// ── helpers ───────────────────────────────────────────────────────────────────
function log(msg) {
  console.log(`[CorpEmpQC] ${new Date().toISOString()} ${msg}`);
}

function parseJsonSafe(val, fallback = {}) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

function buildEmployeeEmailData(emp, corporate) {
  const userMeta = parseJsonSafe(emp.user_metadata, {});
  const assocMeta = parseJsonSafe(emp.assoc_metadata, {});
  const merged = { ...userMeta, ...assocMeta };
  return {
    email: (emp.email || '').trim() || null,
    firstName: emp.firstName || merged.firstName || 'Employee',
    lastName: emp.lastName || merged.lastName || '',
    companyName: corporate.companyName,
    employeeId: emp.corporate_employee_id || emp.employee_id || merged.employeeId || '',
    department: emp.department_name || merged.department || '',
    planName: merged.planName || merged.insurancePlan || corporate.packageType || 'Corporate Employee Health Plan',
    coverageAmount: merged.coverageAmount || merged.sumInsured,
    planStartDate: merged.planStartDate,
    planEndDate: merged.planEndDate,
    planValidity: merged.planValidity,
    planBenefits: merged.planBenefits,
    sponsor: merged.sponsor,
    copay: merged.copay,
  };
}

// ── core sweep ────────────────────────────────────────────────────────────────
async function runQcSweep() {
  const started = Date.now();
  const errors = [];

  let corporatesScanned = 0;
  let checksRun = 0;
  let issuesFound = 0;
  let issuesFixed = 0;
  let issuesFailed = 0;

  // per-corporate breakdown for the summary JSONB
  const corporateSummaries = [];

  try {
    // ── 0. Ensure table ─────────────────────────────────────────────────────
    await ensureQcTable();

    // ── 1. Fetch all active corporates ────────────────────────────────────
    const { rows: corporates } = await pool.query(`
      SELECT id, "companyName", "assignedTo", "packageType"
      FROM corporates
      WHERE LOWER(COALESCE(status, 'active')) = 'active'
      ORDER BY id
    `);

    corporatesScanned = corporates.length;
    log(`Scanning ${corporatesScanned} active corporates…`);

    for (const corp of corporates) {
      const corpId = corp.id;
      const corpName = corp.companyName || `Corporate #${corpId}`;
      const corpResult = {
        corporateId: corpId,
        companyName: corpName,
        inactiveUsers: 0,
        inactiveUsersFixed: 0,
        missingPlans: 0,
        missingPlansFixed: 0,
        staleCeInactive: 0,
        staleCeFixed: 0,
        expiredPlans: 0,
        expiredPlansFixed: 0,
        orphanAssociations: 0,
        neverLoggedIn: 0,
        remindersQueued: 0,
        remindersSent: 0,
      };

      try {
        // ── CHECK 1: users.status != 'active' but active corp link ──────────
        const { rows: inactiveUsers } = await pool.query(`
          SELECT DISTINCT u.id AS user_id, u.email, u.status
          FROM users u
          JOIN user_associations ua
            ON ua."userId" = u.id
            AND ua."entityId" = $1
            AND ua."entityType" = 'corporate'
            AND ua.role = 'employee'
            AND ua.status = 'active'
          JOIN corporate_employees ce
            ON ce."userId" = u.id
            AND ce.corporate_id = $1
            AND ce."isActive" = true
          WHERE u.status != 'active'
        `, [corpId]);

        checksRun++;
        corpResult.inactiveUsers = inactiveUsers.length;

        if (inactiveUsers.length > 0) {
          issuesFound += inactiveUsers.length;
          log(`  [${corpName}] CHECK 1 — ${inactiveUsers.length} inactive users found`);

          const ids = inactiveUsers.map(r => r.user_id);
          try {
            await pool.query(`
              UPDATE users SET status = 'active', "updatedAt" = NOW()
              WHERE id = ANY($1::int[])
            `, [ids]);
            corpResult.inactiveUsersFixed = inactiveUsers.length;
            issuesFixed += inactiveUsers.length;
            log(`  [${corpName}] CHECK 1 — fixed ${inactiveUsers.length} users → status='active'`);
          } catch (fixErr) {
            issuesFailed += inactiveUsers.length;
            errors.push(`[${corpName}] CHECK1 fix failed: ${fixErr.message}`);
          }
        }

        // ── CHECK 2: stale corporate_employees.isActive = false ─────────────
        const { rows: staleCe } = await pool.query(`
          SELECT DISTINCT ce."userId" AS user_id
          FROM corporate_employees ce
          JOIN user_associations ua
            ON ua."userId" = ce."userId"
            AND ua."entityId" = $1
            AND ua."entityType" = 'corporate'
            AND ua.role = 'employee'
            AND ua.status = 'active'
          WHERE ce.corporate_id = $1
            AND ce."isActive" = false
        `, [corpId]);

        checksRun++;
        corpResult.staleCeInactive = staleCe.length;

        if (staleCe.length > 0) {
          issuesFound += staleCe.length;
          const ids = staleCe.map(r => r.user_id);
          try {
            await pool.query(`
              UPDATE corporate_employees SET "isActive" = true, "updatedAt" = NOW()
              WHERE corporate_id = $1 AND "userId" = ANY($2::int[])
            `, [corpId, ids]);
            corpResult.staleCeFixed = staleCe.length;
            issuesFixed += staleCe.length;
            log(`  [${corpName}] CHECK 2 — fixed ${staleCe.length} corporate_employees.isActive`);
          } catch (fixErr) {
            issuesFailed += staleCe.length;
            errors.push(`[${corpName}] CHECK2 fix failed: ${fixErr.message}`);
          }
        }

        // ── CHECK 3: no active plan subscription ────────────────────────────
        // Find the active plan for this corporate first
        const { rows: planRows } = await pool.query(`
          SELECT id, price, currency, billing_cycle, metadata
          FROM subscription_plans
          WHERE type = 'CORPORATE'
            AND is_active = true
            AND (metadata->>'corporateId')::int = $1
          ORDER BY updated_at DESC, id DESC
          LIMIT 1
        `, [corpId]);

        checksRun++;

        if (planRows.length > 0) {
          const plan = planRows[0];
          const meta = parseJsonSafe(plan.metadata, {});
          const planStartDate = meta.validFrom || new Date().toISOString().slice(0, 10);
          const planEndDate = meta.validTo || null;
          const price = Number(plan.price || meta.premiumPerEmployee || 0);
          const currency = String(plan.currency || 'INR').toUpperCase();
          const cycle = String(plan.billing_cycle || 'ANNUAL').toUpperCase();

          const { rows: unsubscribed } = await pool.query(`
            SELECT DISTINCT ua."userId" AS user_id
            FROM user_associations ua
            JOIN corporate_employees ce
              ON ce."userId" = ua."userId"
              AND ce.corporate_id = $1
              AND ce."isActive" = true
            WHERE ua."entityId" = $1
              AND ua."entityType" = 'corporate'
              AND ua.role = 'employee'
              AND ua.status = 'active'
              AND NOT EXISTS (
                SELECT 1 FROM user_subscriptions us
                WHERE us.user_id = ua."userId"
                  AND us.plan_id = $2
                  AND us.status = 'ACTIVE'
              )
          `, [corpId, plan.id]);

          corpResult.missingPlans = unsubscribed.length;

          if (unsubscribed.length > 0) {
            issuesFound += unsubscribed.length;
            log(`  [${corpName}] CHECK 3 — ${unsubscribed.length} employees missing plan subscription`);

            let fixed = 0;
            for (const row of unsubscribed) {
              try {
                // Deactivate any stale corporate plan subs for this user
                await pool.query(`
                  UPDATE user_subscriptions us
                  SET status = 'INACTIVE', updated_at = NOW()
                  WHERE us.user_id = $1 AND us.status = 'ACTIVE'
                    AND EXISTS (
                      SELECT 1 FROM subscription_plans sp
                      WHERE sp.id = us.plan_id AND sp.type = 'CORPORATE'
                        AND (sp.metadata->>'corporateId')::int = $2
                    )
                `, [row.user_id, corpId]);

                // Insert/activate correct plan
                await pool.query(`
                  INSERT INTO user_subscriptions
                    (user_id, plan_id, status, start_date, end_date, auto_renew, billing_cycle, price, currency, created_at, updated_at)
                  VALUES ($1, $2, 'ACTIVE', $3::date, $4::date, false, $5, $6, $7, NOW(), NOW())
                  ON CONFLICT (user_id, plan_id) DO UPDATE SET
                    status      = 'ACTIVE',
                    start_date  = COALESCE(user_subscriptions.start_date, $3::date),
                    end_date    = COALESCE(user_subscriptions.end_date, $4::date),
                    updated_at  = NOW()
                `, [row.user_id, plan.id, planStartDate, planEndDate, cycle, price, currency]);

                fixed++;
              } catch (fixErr) {
                issuesFailed++;
                errors.push(`[${corpName}] CHECK3 fix user ${row.user_id}: ${fixErr.message}`);
              }
            }
            corpResult.missingPlansFixed = fixed;
            issuesFixed += fixed;
            log(`  [${corpName}] CHECK 3 — enrolled ${fixed}/${unsubscribed.length} employees in plan`);
          }

          // CHECK 3b: backfill NULL end_dates on existing active subs where plan has a validTo
          if (planEndDate) {
            const { rowCount: backfilled } = await pool.query(`
              UPDATE user_subscriptions us
              SET end_date = $1::date, updated_at = NOW()
              WHERE us.plan_id = $2
                AND us.status = 'ACTIVE'
                AND us.end_date IS NULL
            `, [planEndDate, plan.id]);
            if (backfilled > 0) {
              issuesFound += backfilled;
              issuesFixed += backfilled;
              log(`  [${corpName}] CHECK 3b — backfilled end_date for ${backfilled} subscriptions from plan validTo`);
            }
          }
        }

        // ── CHECK 4: expired plan subscriptions ─────────────────────────────
        const { rows: expired } = await pool.query(`
          SELECT us.id AS sub_id, us.user_id
          FROM user_subscriptions us
          JOIN subscription_plans sp ON sp.id = us.plan_id
          WHERE us.status = 'ACTIVE'
            AND us.end_date IS NOT NULL
            AND us.end_date < CURRENT_DATE
            AND sp.type = 'CORPORATE'
            AND (sp.metadata->>'corporateId')::int = $1
        `, [corpId]);

        checksRun++;
        corpResult.expiredPlans = expired.length;

        if (expired.length > 0) {
          issuesFound += expired.length;
          const ids = expired.map(r => r.sub_id);
          try {
            await pool.query(`
              UPDATE user_subscriptions SET status = 'EXPIRED', updated_at = NOW()
              WHERE id = ANY($1::int[])
            `, [ids]);
            corpResult.expiredPlansFixed = expired.length;
            issuesFixed += expired.length;
            log(`  [${corpName}] CHECK 4 — deactivated ${expired.length} expired subscriptions`);
          } catch (fixErr) {
            issuesFailed += expired.length;
            errors.push(`[${corpName}] CHECK4 fix failed: ${fixErr.message}`);
          }
        }

        // ── CHECK 5: orphan associations (no corporate_employees row) ────────
        const { rows: orphans } = await pool.query(`
          SELECT ua."userId" AS user_id
          FROM user_associations ua
          WHERE ua."entityId" = $1
            AND ua."entityType" = 'corporate'
            AND ua.role = 'employee'
            AND ua.status = 'active'
            AND NOT EXISTS (
              SELECT 1 FROM corporate_employees ce
              WHERE ce."userId" = ua."userId" AND ce.corporate_id = $1
            )
        `, [corpId]);

        checksRun++;
        corpResult.orphanAssociations = orphans.length;
        if (orphans.length > 0) {
          issuesFound += orphans.length;
          // Log only — inserting a corporate_employees row without employeeId could create bad data
          log(`  [${corpName}] CHECK 5 — ${orphans.length} orphan associations (no corporate_employees row) — logged, manual review needed`);
          errors.push(`[${corpName}] ${orphans.length} orphan user_associations need manual review (userIds: ${orphans.map(r => r.user_id).join(',')})`);
        }

        // ── CHECK 6: never-logged-in employees — send approved reminder email ─
        const { rows: neverLoggedIn } = await pool.query(`
          SELECT
            u.id, u.email, u."firstName", u."lastName",
            u.password, u.metadata AS user_metadata, u.status AS user_status,
            ua.metadata AS assoc_metadata,
            ce."employeeId" AS corporate_employee_id
          FROM users u
          JOIN user_associations ua ON ua."userId" = u.id
            AND ua."entityId" = $1 AND ua."entityType" = 'corporate'
            AND ua.role = 'employee' AND ua.status = 'active'
          JOIN corporate_employees ce ON ce."userId" = u.id
            AND ce.corporate_id = $1 AND ce."isActive" = true
          WHERE u."lastLoginAt" IS NULL
            AND u.status = 'active'
            AND u."isVerified" = true
            AND u.email IS NOT NULL AND u.email != ''
            AND NOT EXISTS (
              SELECT 1 FROM corporate_welcome_email_deliveries d
              WHERE d.user_id = u.id AND d.corporate_id = $1
                AND d.status = 'sent'
                AND d.created_at > NOW() - INTERVAL '14 days'
            )
        `, [corpId]);

        checksRun++;
        corpResult.neverLoggedIn = neverLoggedIn.length;

        if (neverLoggedIn.length > 0) {
          issuesFound += neverLoggedIn.length;
          const quota = await checkQuota('bulk');

          if (!quota.allowed || quota.remaining <= 0) {
            log(`  [${corpName}] CHECK 6 — ${neverLoggedIn.length} never-logged-in employees, daily quota exhausted — skipping`);
          } else {
            const toSend = neverLoggedIn.slice(0, quota.remaining);
            corpResult.remindersQueued = toSend.length;
            log(`  [${corpName}] CHECK 6 — ${neverLoggedIn.length} never-logged-in, sending ${toSend.length} reminder(s) (quota remaining: ${quota.remaining})`);

            const corporate = { companyName: corpName, packageType: corp.packageType || '' };
            const teamUserId = corp.assignedTo || null;
            const dayBucket = new Date().toISOString().slice(0, 10);
            let sent = 0;

            for (const emp of toSend) {
              try {
                const q2 = await checkQuota('bulk');
                if (!q2.allowed || q2.remaining <= 0) break;

                const emailData = buildEmployeeEmailData(emp, corporate);
                if (!emailData.email) continue;

                const tempPassword = generateSecurePassword();
                const hashedPassword = await bcrypt.hash(tempPassword, 10);

                const message = await buildCorporateEmployeeReminderEmail(emailData, tempPassword, { teamUserId, corporateId: corpId });

                // Reset password so the reminder email credentials are valid
                await pool.query(`
                  UPDATE users SET
                    password = $1,
                    "isVerified" = true,
                    status = 'active',
                    metadata = COALESCE(metadata, '{}'::jsonb) || '{"requirePasswordChange":true}'::jsonb,
                    "updatedAt" = NOW()
                  WHERE id = $2
                `, [hashedPassword, emp.id]);

                // Supersede any active delivery record for this recipient (prevents unique constraint violation)
                await pool.query(`
                  UPDATE corporate_welcome_email_deliveries
                  SET status = 'duplicate', error_message = 'Superseded by QC reminder', updated_at = NOW()
                  WHERE corporate_id = $1 AND LOWER(recipient_email) = LOWER($2)
                    AND status IN ('queued', 'sent')
                `, [corpId, emailData.email]);

                // Create delivery record
                const idempotencyKey = crypto.createHash('sha256')
                  .update(`qc-rem|${corpId}|${emp.id}|${emailData.email}|${dayBucket}`)
                  .digest('hex').slice(0, 24);

                const { rows: [dr] } = await pool.query(`
                  INSERT INTO corporate_welcome_email_deliveries
                    (corporate_id, user_id, employee_id, recipient_email, subject, idempotency_key,
                     request_scope, status, attempts, metadata, created_by, created_at, updated_at)
                  VALUES ($1, $2, $3, $4, $5, $6, 'qc_reminder', 'queued', 1,
                    '{"source":"qc_sweep"}'::jsonb, NULL, NOW(), NOW())
                  ON CONFLICT DO NOTHING
                  RETURNING id
                `, [corpId, emp.id, emp.corporate_employee_id || '', emailData.email, message.subject, idempotencyKey]);

                // Skip if idempotency key already exists (same-day re-run)
                if (!dr?.id) continue;

                // Send email
                await sendPreparedCorporateEmployeeWelcomeEmail(
                  { to: message.to, subject: message.subject, html: message.html },
                  { teamUserId }
                );

                await pool.query(`
                  UPDATE corporate_welcome_email_deliveries SET status = 'sent', updated_at = NOW()
                  WHERE id = $1
                `, [dr.id]);

                await recordSent('bulk', 1);
                sent++;
              } catch (sendErr) {
                issuesFailed++;
                errors.push(`[${corpName}] CHECK6 reminder to user ${emp.id}: ${sendErr.message}`);
              }
            }

            corpResult.remindersSent = sent;
            issuesFixed += sent;
            log(`  [${corpName}] CHECK 6 — sent ${sent}/${toSend.length} reminder emails`);
          }
        }

      } catch (corpErr) {
        errors.push(`[${corpName}] Sweep error: ${corpErr.message}`);
        log(`  ERROR scanning ${corpName}: ${corpErr.message}`);
      }

      corporateSummaries.push(corpResult);
    }

    const durationMs = Date.now() - started;

    // ── Write audit row ──────────────────────────────────────────────────────
    await pool.query(`
      INSERT INTO corporate_employee_qc_log
        (run_at, duration_ms, corporates_scanned, checks_run, issues_found, issues_fixed, issues_failed, summary, errors)
      VALUES (NOW(), $1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      durationMs,
      corporatesScanned,
      checksRun,
      issuesFound,
      issuesFixed,
      issuesFailed,
      JSON.stringify(corporateSummaries),
      JSON.stringify(errors),
    ]);

    log(`✅ QC sweep done in ${durationMs}ms — ${issuesFound} issues found, ${issuesFixed} fixed, ${issuesFailed} failed`);

    return {
      durationMs,
      corporatesScanned,
      checksRun,
      issuesFound,
      issuesFixed,
      issuesFailed,
      errors: errors.length,
    };

  } catch (fatalErr) {
    const durationMs = Date.now() - started;
    log(`❌ Fatal error: ${fatalErr.message}`);
    try {
      await pool.query(`
        INSERT INTO corporate_employee_qc_log
          (run_at, duration_ms, corporates_scanned, checks_run, issues_found, issues_fixed, issues_failed, summary, errors)
        VALUES (NOW(), $1, $2, $3, $4, $5, $6, $7, $8)
      `, [durationMs, corporatesScanned, checksRun, issuesFound, issuesFixed, issuesFailed, JSON.stringify([]), JSON.stringify([fatalErr.message])]);
    } catch { /* best-effort */ }
    throw fatalErr;
  }
}

// ── Service class (matches project pattern) ───────────────────────────────────
class CorporateEmployeeQcService {
  constructor() {
    this.isRunning = false;
    this.cronJob = null;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    // Daily 03:00 server-local time
    this.cronJob = cron.schedule('0 3 * * *', async () => {
      tickStart('corp_employee_qc');
      try {
        const details = await runQcSweep();
        tick('corp_employee_qc', details);
      } catch (err) {
        tickError('corp_employee_qc', err.message);
      }
    }, { timezone: 'Asia/Kolkata' });

    log('✅ Corporate Employee QC cron started — runs daily at 03:00 IST');
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.isRunning = false;
      log('🛑 Corporate Employee QC cron stopped');
    }
  }

  /** Manual trigger — callable from admin API */
  async runNow() {
    return runQcSweep();
  }
}

const corporateEmployeeQcService = new CorporateEmployeeQcService();
export default corporateEmployeeQcService;
export { runQcSweep };
