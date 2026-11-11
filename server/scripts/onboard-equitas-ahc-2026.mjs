/**
 * Onboard a batch of Equitas Bank employees onto the 2026 AHC package and send
 * each one a personalised welcome email with the template's attachment.
 *
 * Every step is idempotent and the script is a report unless given --apply:
 *   1. copy Equitas_MHC_2025 -> Equitas_AHC_2026 (active, with a corporate
 *      validity window; without that window no welcome email fires at all)
 *   2. resolve or create the employee's user account
 *   3. put them on the corporate roster and give them an active employee link
 *   4. assign the package through the same service the HR screen calls, then
 *      send the invitation through notifyAhcEntitlement
 *
 * The invitation is personalised per employee (name, employer, programme and
 * that person's own validity window) and idempotent: a second run sends nothing
 * because corporate_ahc_entitlement_notifications is unique on
 * (package, user, event, valid_to).
 *
 *   node scripts/ssm-env-loader.mjs scripts/onboard-equitas-ahc-2026.mjs
 *   node scripts/ssm-env-loader.mjs scripts/onboard-equitas-ahc-2026.mjs --apply
 */
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import pool from '../db/pgPool.js';
import { ahcWindow } from '../services/corporate-ahc-entitlement-policy.service.js';
import { updatePackageEmployeeAssignments } from '../services/health-package-employee-assignments.service.js';
import { notifyAhcEntitlement } from '../services/corporate-ahc-entitlement-notification.service.js';
import { mailAttachmentsForCategory } from '../services/team-email-template-attachments.service.js';

const CORPORATE_ID = 5;                    // Equitas Bank Ltd, uid C9TV9Y
const SOURCE_PACKAGE = 'Equitas_MHC_2025';
const NEW_PACKAGE = { id: 'Equitas_AHC_2026', name: 'Equitas AHC 2026' };
const WINDOW = Object.freeze({
  corporateValidFrom: '2026-11-12',
  corporateValidTo: '2027-03-31',          // the programme's own cap
  individualValidityPeriod: '45 Days',     // 45 days from the day each employee is added
  maxExtensionDays: 15,
});

/** As supplied by HR. `firstName`/`lastName` split at the first space. */
const EMPLOYEES = [
  { code: 'E106011', name: 'YASHASWI HARAMURALI', email: 'yashaswi.haramurali@equitas.bank.in', phone: '9884361137' },
  { code: 'E121760', name: 'S Vivek',             email: 's.vivek@equitas.bank.in',             phone: '9032479087' },
  { code: 'E130265', name: 'NETHAJI T',           email: 'nethaji.t@equitas.bank.in',           phone: '7397647672' },
  { code: 'E46112',  name: 'Narasimhan S L',      email: 'narasimhans@equitas.bank.in',         phone: '6382354789' },
  { code: 'E96591',  name: 'Joseph Peter',        email: 'joseph.peter@equitas.bank.in',        phone: '9072058112' },
];

const APPLY = process.argv.includes('--apply');
const q = async (sql, params = []) => (await pool.query(sql, params)).rows;
const digits = (v) => String(v || '').replace(/\D/g, '').slice(-10);
const splitName = (full) => {
  const parts = String(full).trim().split(/\s+/);
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') || parts[0] };
};
const log = (...a) => console.log(...a);

async function ensurePackage() {
  const [existing] = await q(`SELECT id, name, is_active, max_users, metadata FROM corporate_health_package_catalog WHERE id=$1`, [NEW_PACKAGE.id]);
  if (existing) {
    const meta = typeof existing.metadata === 'string' ? JSON.parse(existing.metadata) : existing.metadata || {};
    const armed = meta.corporateValidFrom === WINDOW.corporateValidFrom && meta.corporateValidTo === WINDOW.corporateValidTo;
    log(`package  : ${existing.id} already exists — active=${existing.is_active}, window ${armed ? 'correct' : 'DIFFERENT: ' + JSON.stringify({ from: meta.corporateValidFrom, to: meta.corporateValidTo })}`);
    if (!existing.is_active || !armed) throw new Error('The 2026 package exists but is inactive or has a different window — resolve by hand rather than letting this script change terms');
    return existing.id;
  }

  const [src] = await q(`SELECT * FROM corporate_health_package_catalog WHERE id=$1 AND corporate_id=$2`, [SOURCE_PACKAGE, CORPORATE_ID]);
  if (!src) throw new Error(`source package ${SOURCE_PACKAGE} not found`);
  const srcMeta = typeof src.metadata === 'string' ? JSON.parse(src.metadata) : src.metadata || {};
  const srcFeatures = typeof src.features === 'string' ? JSON.parse(src.features) : src.features || {};

  const metadata = { ...srcMeta, ...WINDOW, status: 'Active', copiedFrom: SOURCE_PACKAGE, copiedAt: new Date().toISOString() };
  log(`package  : copying ${SOURCE_PACKAGE} -> ${NEW_PACKAGE.id} "${NEW_PACKAGE.name}"`);
  log(`           price ${src.price} ${src.currency} · capacity ${src.max_users} · ${(srcFeatures.tests || []).length} tests · active=true`);
  log(`           window ${WINDOW.corporateValidFrom} -> ${WINDOW.corporateValidTo}, ${WINDOW.individualValidityPeriod} per employee`);
  if (!APPLY) return null;

  await q(`INSERT INTO corporate_health_package_catalog
             (id, corporate_id, name, slug, type, description, price, currency, max_users, is_active, features, metadata, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10,$11,NOW(),NOW())`,
    [NEW_PACKAGE.id, CORPORATE_ID, NEW_PACKAGE.name,
     `equitas-ahc-2026-${crypto.randomBytes(8).toString('hex')}`,
     src.type, src.description, src.price, src.currency, src.max_users,
     JSON.stringify({ ...srcFeatures, name: NEW_PACKAGE.name }), JSON.stringify(metadata)]);
  log(`           created`);
  return NEW_PACKAGE.id;
}

/** Find this person's existing account, by email then by employee code then by phone. */
async function findUser(emp) {
  const [byEmail] = await q(`SELECT id, email, "firstName", "lastName", "phoneNumber" FROM users WHERE lower(email)=lower($1)`, [emp.email]);
  if (byEmail) return { user: byEmail, matchedBy: 'email' };
  const [byCode] = await q(`SELECT id, email, "firstName", "lastName", "phoneNumber" FROM users WHERE lower(email) LIKE $1`, [`%${emp.code.toLowerCase()}%`]);
  if (byCode) return { user: byCode, matchedBy: 'employee code in email' };
  const byPhone = await q(`SELECT id, email, "firstName", "lastName", "phoneNumber" FROM users WHERE regexp_replace(COALESCE("phoneNumber",''),'\\D','','g') LIKE $1`, [`%${digits(emp.phone)}`]);
  if (byPhone.length === 1) return { user: byPhone[0], matchedBy: 'phone' };
  if (byPhone.length > 1) throw new Error(`${emp.code}: ${byPhone.length} accounts share phone ${emp.phone} — refusing to guess`);
  return { user: null, matchedBy: null };
}

async function ensureUser(emp) {
  const { user, matchedBy } = await findUser(emp);
  const { firstName, lastName } = splitName(emp.name);

  if (user) {
    const needsEmail = String(user.email || '').toLowerCase() !== emp.email.toLowerCase();
    log(`  account: ${user.id} (matched by ${matchedBy})${needsEmail ? ` — email ${user.email} -> ${emp.email}` : ' — email already correct'}`);
    if (needsEmail && APPLY) {
      const clash = await q(`SELECT id FROM users WHERE lower(email)=lower($1) AND id<>$2`, [emp.email, user.id]);
      if (clash.length) throw new Error(`${emp.code}: ${emp.email} already belongs to user ${clash[0].id}`);
      await q(`UPDATE users SET email=$1, "updatedAt"=NOW() WHERE id=$2`, [emp.email, user.id]);
    }
    return user.id;
  }

  log(`  account: creating — ${firstName} ${lastName} <${emp.email}> ${emp.phone}`);
  if (!APPLY) return null;
  // A random password nobody is told: the employee signs in through the
  // password-reset / OTP flow. Never printed, never stored anywhere but here.
  const password = await bcrypt.hash(crypto.randomBytes(24).toString('base64url'), 10);
  // unique_id is deliberately omitted — trg_entity_uid_* mints and registers it.
  const [created] = await q(
    `INSERT INTO users ("firstName","lastName",email,"phoneNumber",password,role,status,"createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,$5,'patient','active',NOW(),NOW()) RETURNING id, unique_id`,
    [firstName, lastName, emp.email, digits(emp.phone), password]);
  log(`           created user ${created.id} (uid ${created.unique_id})`);
  return created.id;
}

async function ensureRosterAndLink(emp, userId) {
  const [roster] = await q(`SELECT id, "userId", "isActive", email FROM corporate_employees WHERE corporate_id=$1 AND "employeeId"=$2`, [CORPORATE_ID, emp.code]);
  if (roster) {
    const fix = roster.userId !== userId || !roster.isActive || String(roster.email || '').toLowerCase() !== emp.email.toLowerCase();
    log(`  roster : row ${roster.id}${fix ? ' — updating link/email/active' : ' — already correct'}`);
    if (fix && APPLY) await q(`UPDATE corporate_employees SET "userId"=$1, email=$2, "isActive"=true, "updatedAt"=NOW() WHERE id=$3`, [userId, emp.email, roster.id]);
  } else {
    log(`  roster : adding ${emp.code}`);
    if (APPLY) await q(
      `INSERT INTO corporate_employees (corporate_id,"userId","employeeId",email,"isActive","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,true,NOW(),NOW())
       ON CONFLICT (corporate_id,"employeeId") DO UPDATE SET "userId"=EXCLUDED."userId", email=EXCLUDED.email, "isActive"=true, "updatedAt"=NOW()`,
      [CORPORATE_ID, userId, emp.code, emp.email]);
  }

  const [assoc] = await q(`SELECT id, status FROM user_associations WHERE "userId"=$1 AND "entityType"='corporate' AND "entityId"=$2 AND role='employee'`, [userId, CORPORATE_ID]);
  if (assoc) {
    log(`  link   : association ${assoc.id} (${assoc.status})${assoc.status !== 'active' ? ' — activating' : ''}`);
    if (assoc.status !== 'active' && APPLY) await q(`UPDATE user_associations SET status='active', "updatedAt"=NOW() WHERE id=$1`, [assoc.id]);
  } else {
    log(`  link   : adding employee association to corporate ${CORPORATE_ID}`);
    if (APPLY) await q(
      `INSERT INTO user_associations ("userId","entityType","entityId",role,status,"createdAt","updatedAt")
       VALUES ($1,'corporate',$2,'employee','active',NOW(),NOW())
       ON CONFLICT ("userId","entityType","entityId",role) DO UPDATE SET status='active', "updatedAt"=NOW()`,
      [userId, CORPORATE_ID]);
  }
}

// ── run ──────────────────────────────────────────────────────────────────────
log(APPLY ? '*** APPLYING ***\n' : '*** DRY RUN — pass --apply to write and to send mail ***\n');

const attachment = await mailAttachmentsForCategory('corporate_ahc');
log(`attachment: ${attachment.reason === 'ok' ? attachment.attachments.map(a => `${a.filename} (${(a.content.length / 1048576).toFixed(2)} MB)`).join(', ') : `NONE — ${attachment.reason}`}`);
if (attachment.reason !== 'ok') log('            the welcome email will be sent WITHOUT an attachment and recorded as sent_no_file');

const packageId = (await ensurePackage()) || NEW_PACKAGE.id;
const window = ahcWindow({
  assignedOn: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()),
  validityPeriod: WINDOW.individualValidityPeriod,
  corporateValidFrom: WINDOW.corporateValidFrom,
  corporateValidTo: WINDOW.corporateValidTo,
});
log(`\nvalidity : each employee gets ${window.validFrom} -> ${window.validTo} (${window.validityDays} days)\n`);

const resolved = [];
for (const emp of EMPLOYEES) {
  log(`${emp.code}  ${emp.name}`);
  const userId = await ensureUser(emp);
  if (userId) await ensureRosterAndLink(emp, userId);
  resolved.push({ ...emp, userId });
  log('');
}

const userIds = resolved.map(r => r.userId).filter(Boolean);
if (!APPLY) {
  log(`would assign ${EMPLOYEES.length} employee(s) to ${packageId} and send ${EMPLOYEES.length} personalised welcome email(s)`);
  await pool.end();
  process.exit(0);
}

log(`assigning ${userIds.length} employee(s) to ${packageId} …`);
const result = await updatePackageEmployeeAssignments(packageId, { addEmployeeIds: userIds });
log(`  added ${result.added}, enrolled total ${result.enrolled}\n`);

log('sending personalised welcome emails …');
for (const r of resolved) {
  if (!r.userId) { log(`  ${r.code}: no account — skipped`); continue; }
  try {
    const out = await notifyAhcEntitlement({ packageId, userId: r.userId, eventType: 'invitation', validTo: window.validTo });
    log(`  ${r.code.padEnd(8)} ${r.email.padEnd(40)} email=${out.emailStatus || (out.duplicate ? 'duplicate (already sent)' : out.missing ? 'member row missing' : '?')} whatsapp=${out.whatsappStatus || '-'} files=${(out.attachments || []).join(',') || 'none'}`);
  } catch (error) {
    log(`  ${r.code.padEnd(8)} ${r.email.padEnd(40)} FAILED: ${error.message}`);
  }
}

log('\n--- what was recorded');
for (const row of await q(
  `SELECT n.user_id, u.email, n.event_type, n.email_status, n.whatsapp_status, n.valid_to
     FROM corporate_ahc_entitlement_notifications n JOIN users u ON u.id=n.user_id
    WHERE n.package_id=$1 ORDER BY n.user_id`, [packageId]))
  log(`  ${String(row.user_id).padEnd(6)} ${String(row.email).padEnd(40)} ${row.event_type} email=${row.email_status} whatsapp=${row.whatsapp_status} validTo=${String(row.valid_to).slice(0,10)}`);

await pool.end();
