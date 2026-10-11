/**
 * Corporate HR hierarchy — one super-HR (corporate_admin) per corporate,
 * who can invite/remove their own team of hr_staff, corporate_cmo (Chief
 * Medical Officer), and corporate_ohc (OHC — a day-care clinic owned and
 * run by the corporate itself) accounts self-service.
 *
 * The DB-level invariant (at most one active corporate_admin per
 * organization_id) lives in migrations/corporate-hr-hierarchy.migration.js
 * — this file is the application-level enforcement on top of it: only the
 * active corporate_admin may invite or remove team members, non-admin
 * members can never remove/promote anyone, and ownership transfer is an
 * explicit, atomic swap rather than "create a second admin and hope."
 *
 * corporate_cmo and corporate_ohc are distinct from hr_staff: both exist to
 * scrutinize/decide insurance claims and benefit-wallet authorizations on
 * the corporate's behalf, as an alternative to routing them through an
 * external TPA — see requireClaimsAdjudicator in corporate.route.js and
 * requireClinicalIssuer in corporate-hmis.route.js. Neither can become
 * super-HR via transferSuperHr (that stays hr_staff -> corporate_admin
 * only) since clinical/claims scrutiny and HR-team administration are
 * deliberately kept separate.
 */
import User from '../models/postgres/user.model.postgres.js';
import Corporate from '../models/postgres/corporate.model.postgres.js';
import welcomeEmailService from './welcome-email.service.js';
import organizationUid from './organization-uid.service.js';

const MAX_HR_STAFF_PER_CORPORATE = 15;
const INVITABLE_ROLES = ['hr_staff', 'corporate_cmo', 'corporate_ohc'];
// Everyone who belongs on the corporate's HR team: the super-HR plus the roles it can invite.
const HR_TEAM_ROLES = ['corporate_admin', ...INVITABLE_ROLES];

/**
 * The ids of a corporate's HR-team members, resolved by UID.
 *
 * This service used to compare users.organization_id with the CORPORATES id. But organization_id holds
 * a TENANTS id for the users hrms.route.js created, so the two groups never met: Dairy Day's super-HR
 * saw an empty team (its users sit under tenant 57, the corporate is #45), Ninjacart's team was split
 * across 49 and 58, and Ninjacart's own super-HR was refused for corporate 49. users.organization_uid
 * names the corporate unambiguously. Returns null when there is no uid to use (a database without the
 * column), and the caller falls back to the legacy integer comparison.
 */
async function hrTeamIds(corporateId, { activeOnly = true } = {}) {
  const uid = await organizationUid.corporateUid(corporateId);
  if (!uid || !(await organizationUid.hasColumn())) return null;
  const [rows] = await User.sequelize.query(
    `SELECT id FROM users
      WHERE organization_type = 'corporate' AND organization_uid = :uid
        AND role IN (:roles) ${activeOnly ? "AND status = 'active'" : ''}`,
    { replacements: { uid, roles: HR_TEAM_ROLES } });
  return rows.map((r) => r.id);
}

function genTempPassword() {
  const raw = [...Array(12)].map(() => Math.random().toString(36)[2] || '0').join('');
  return `Hr${raw}@1`;
}

async function requireActiveSuperAdmin(corporateId, actingUserId) {
  const actor = await User.findByPk(actingUserId);
  if (!actor) throw new Error('Acting user not found');
  if (
    actor.role !== 'corporate_admin' ||
    actor.organization_type !== 'corporate' ||
    !(await organizationUid.userBelongsToCorporate(actor, corporateId)) ||
    actor.status !== 'active'
  ) {
    const err = new Error('Only the corporate super-HR (corporate_admin) can perform this action');
    err.statusCode = 403;
    throw err;
  }
  return actor;
}

export async function listHrTeam(corporateId) {
  const ids = await hrTeamIds(corporateId);
  const rows = await User.findAll({
    where: ids
      ? { id: ids }
      : { organization_type: 'corporate', organization_id: corporateId, status: 'active', role: HR_TEAM_ROLES },
    attributes: ['id', 'firstName', 'lastName', 'email', 'role', 'invited_by', 'lastLoginAt', 'createdAt'],
    order: [['role', 'ASC'], ['createdAt', 'ASC']],
  });
  return rows;
}

export async function inviteHrStaff({ corporateId, invitedByUserId, firstName, lastName, email, phoneNumber, registrationNumber, role = 'hr_staff' }) {
  await requireActiveSuperAdmin(corporateId, invitedByUserId);

  if (!INVITABLE_ROLES.includes(role)) {
    throw new Error(`role must be one of: ${INVITABLE_ROLES.join(', ')}`);
  }

  const normalizedEmail = String(email || '').toLowerCase().trim();
  if (!normalizedEmail) throw new Error('email is required');

  const existing = await User.findOne({ where: { email: normalizedEmail } });
  if (existing) {
    const err = new Error('A user with this email already exists');
    err.statusCode = 409;
    throw err;
  }

  const teamIds = await hrTeamIds(corporateId);
  const currentCount = teamIds
    ? teamIds.length
    : await User.count({
        where: { organization_type: 'corporate', organization_id: corporateId, status: 'active', role: HR_TEAM_ROLES },
      });
  if (currentCount >= MAX_HR_STAFF_PER_CORPORATE) {
    const err = new Error(`This corporate has reached the maximum of ${MAX_HR_STAFF_PER_CORPORATE} HR accounts — remove an inactive one or contact support to raise the limit`);
    err.statusCode = 409;
    throw err;
  }

  const corporate = await Corporate.findByPk(corporateId);
  if (!corporate) throw new Error('Corporate not found');

  const ROLE_LABELS = { corporate_cmo: 'Chief Medical Officer', corporate_ohc: 'OHC Staff', hr_staff: 'HR staff' };
  const ROLE_DEFAULT_NAMES = {
    corporate_cmo: ['Chief Medical', 'Officer'],
    corporate_ohc: ['OHC', 'Staff'],
    hr_staff: ['HR', 'Staff'],
  };
  const roleLabel = ROLE_LABELS[role];
  const medicalRegistration = role === 'corporate_cmo' && registrationNumber ? String(registrationNumber).trim().slice(0, 60) : null;

  const tempPassword = genTempPassword();
  const created = await User.create({
    firstName: firstName || ROLE_DEFAULT_NAMES[role][0],
    lastName: lastName || ROLE_DEFAULT_NAMES[role][1],
    email: normalizedEmail,
    password: tempPassword, // hashed by the model's beforeCreate hook
    dateOfBirth: '1990-01-01', // placeholder — not meaningful for an HR/CMO/OHC account
    gender: 'Other',
    phoneNumber: phoneNumber || '0000000000',
    role,
    organization_type: 'corporate',
    organization_id: corporateId,
    status: 'active',
    invited_by: invitedByUserId,
    ...(medicalRegistration ? { metadata: { registrationNumber: medicalRegistration } } : {}),
  });
  // organization_id above stays the corporates id this service has always written; the UID is what
  // names the corporate unambiguously, and what the sign-in gate and the team queries use.
  await organizationUid.setUserOrganizationUid(created.id, await organizationUid.corporateUid(corporateId));

  let emailStatus = 'skipped';
  try {
    const frontendUrl = process.env.FRONTEND_URL || 'https://app.mediqzy.com';
    // Every corporate-portal role (hr_staff, corporate_cmo, corporate_ohc) signs in at the same
    // corporate login — corporate_cmo's separate /ohc/login was retired so the CMO has one login,
    // not two; /ohc/login is for ohc_doctor/ohc_staff, who have no corporate account at all.
    const primaryLoginUrl = `${frontendUrl}/corporate/login`;
    await welcomeEmailService.sendTransactionalEmail({
      to: normalizedEmail,
      subject: `You've been added as ${roleLabel} for ${corporate.companyName}`,
      html: `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
        <h2 style="color:#0f766e;margin:0 0 12px;">Welcome, ${firstName || 'there'}!</h2>
        <p>You've been added as ${roleLabel} for <b>${corporate.companyName}</b> on the Mediqzy corporate wellness portal.</p>
        <div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;padding:16px;margin:16px 0;">
          <p style="margin:4px 0;"><strong>Login URL:</strong> <a href="${primaryLoginUrl}">${primaryLoginUrl}</a></p>
          <p style="margin:4px 0;"><strong>Email:</strong> ${normalizedEmail}</p>
          <p style="margin:4px 0;"><strong>Temporary password:</strong> ${tempPassword}</p>
        </div>
        <p style="color:#64748b;font-size:13px;">Please change your password after your first login.</p>
      </div>`,
      text: `Welcome! You've been added as ${roleLabel} for ${corporate.companyName}. Login: ${primaryLoginUrl}  Email: ${normalizedEmail}  Temporary password: ${tempPassword}`,
      fromName: 'Mediqzy Corporate Wellness',
    });
    emailStatus = 'sent';
  } catch (err) {
    emailStatus = 'failed';
    console.error(`[CorporateHR] Invite email failed for ${normalizedEmail}:`, err.message);
  }

  return {
    id: created.id,
    email: created.email,
    firstName: created.firstName,
    lastName: created.lastName,
    role: created.role,
    emailStatus,
    // Returned once, here, for the inviting admin to relay if the email
    // failed — never logged, never stored in plaintext anywhere else.
    tempPassword: emailStatus === 'sent' ? undefined : tempPassword,
  };
}

export async function removeHrStaff({ corporateId, requestedByUserId, targetUserId }) {
  const admin = await requireActiveSuperAdmin(corporateId, requestedByUserId);

  if (Number(targetUserId) === Number(admin.id)) {
    throw new Error('The super-HR cannot remove themselves — transfer ownership first');
  }

  const target = await User.findByPk(targetUserId);
  if (
    !target ||
    target.organization_type !== 'corporate' ||
    !(await organizationUid.userBelongsToCorporate(target, corporateId)) ||
    !INVITABLE_ROLES.includes(target.role)
  ) {
    throw new Error('Target is not an HR staff, CMO, or OHC member of this corporate');
  }

  await target.update({ status: 'inactive' });
  return { id: target.id, email: target.email, status: 'inactive' };
}

/**
 * Hand off super-HR ownership to another existing hr_staff member.
 * Atomic: the DB-level unique index (at most one active corporate_admin
 * per org) means this MUST demote the old admin before promoting the
 * new one within the same transaction, or the promotion will fail.
 */
export async function transferSuperHr({ corporateId, requestedByUserId, newAdminUserId }) {
  const admin = await requireActiveSuperAdmin(corporateId, requestedByUserId);

  const successor = await User.findByPk(newAdminUserId);
  if (
    !successor ||
    successor.organization_type !== 'corporate' ||
    !(await organizationUid.userBelongsToCorporate(successor, corporateId)) ||
    successor.role !== 'hr_staff' ||
    successor.status !== 'active'
  ) {
    throw new Error('Successor must be an active hr_staff member of this corporate');
  }

  const sequelize = User.sequelize;
  return sequelize.transaction(async (t) => {
    await admin.update({ role: 'hr_staff' }, { transaction: t });
    await successor.update({ role: 'corporate_admin' }, { transaction: t });
    return {
      previousAdmin: { id: admin.id, email: admin.email, role: 'hr_staff' },
      newAdmin: { id: successor.id, email: successor.email, role: 'corporate_admin' },
    };
  });
}

export default { listHrTeam, inviteHrStaff, removeHrStaff, transferSuperHr, MAX_HR_STAFF_PER_CORPORATE };
