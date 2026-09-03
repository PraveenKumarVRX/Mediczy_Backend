/**
 * Corporate HR hierarchy — one super-HR (corporate_admin) per corporate,
 * who can invite/remove their own hr_staff team self-service.
 *
 * The DB-level invariant (at most one active corporate_admin per
 * organization_id) lives in migrations/corporate-hr-hierarchy.migration.js
 * — this file is the application-level enforcement on top of it: only the
 * active corporate_admin may invite or remove hr_staff, hr_staff can
 * never remove/promote anyone, and ownership transfer is an explicit,
 * atomic swap rather than "create a second admin and hope."
 */
import User from '../models/postgres/user.model.postgres.js';
import Corporate from '../models/postgres/corporate.model.postgres.js';
import welcomeEmailService from './welcome-email.service.js';

const MAX_HR_STAFF_PER_CORPORATE = 15;

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
    Number(actor.organization_id) !== Number(corporateId) ||
    actor.status !== 'active'
  ) {
    const err = new Error('Only the corporate super-HR (corporate_admin) can perform this action');
    err.statusCode = 403;
    throw err;
  }
  return actor;
}

export async function listHrTeam(corporateId) {
  const rows = await User.findAll({
    where: { organization_type: 'corporate', organization_id: corporateId, status: 'active' },
    attributes: ['id', 'firstName', 'lastName', 'email', 'role', 'invited_by', 'lastLoginAt', 'createdAt'],
    order: [['role', 'ASC'], ['createdAt', 'ASC']],
  });
  return rows;
}

export async function inviteHrStaff({ corporateId, invitedByUserId, firstName, lastName, email, phoneNumber }) {
  await requireActiveSuperAdmin(corporateId, invitedByUserId);

  const normalizedEmail = String(email || '').toLowerCase().trim();
  if (!normalizedEmail) throw new Error('email is required');

  const existing = await User.findOne({ where: { email: normalizedEmail } });
  if (existing) {
    const err = new Error('A user with this email already exists');
    err.statusCode = 409;
    throw err;
  }

  const currentCount = await User.count({
    where: { organization_type: 'corporate', organization_id: corporateId, status: 'active' },
  });
  if (currentCount >= MAX_HR_STAFF_PER_CORPORATE) {
    const err = new Error(`This corporate has reached the maximum of ${MAX_HR_STAFF_PER_CORPORATE} HR accounts — remove an inactive one or contact support to raise the limit`);
    err.statusCode = 409;
    throw err;
  }

  const corporate = await Corporate.findByPk(corporateId);
  if (!corporate) throw new Error('Corporate not found');

  const tempPassword = genTempPassword();
  const created = await User.create({
    firstName: firstName || 'HR',
    lastName: lastName || 'Staff',
    email: normalizedEmail,
    password: tempPassword, // hashed by the model's beforeCreate hook
    dateOfBirth: '1990-01-01', // placeholder — not meaningful for an HR account
    gender: 'Other',
    phoneNumber: phoneNumber || '0000000000',
    role: 'hr_staff',
    organization_type: 'corporate',
    organization_id: corporateId,
    status: 'active',
    invited_by: invitedByUserId,
  });

  let emailStatus = 'skipped';
  try {
    const frontendUrl = process.env.FRONTEND_URL || 'https://app.mediqzy.com';
    await welcomeEmailService.sendTransactionalEmail({
      to: normalizedEmail,
      subject: `You've been added as HR staff for ${corporate.companyName}`,
      html: `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
        <h2 style="color:#0f766e;margin:0 0 12px;">Welcome, ${firstName || 'there'}!</h2>
        <p>You've been added as HR staff for <b>${corporate.companyName}</b> on the Mediqzy corporate wellness portal.</p>
        <div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;padding:16px;margin:16px 0;">
          <p style="margin:4px 0;"><strong>Login URL:</strong> <a href="${frontendUrl}/corporate/login">${frontendUrl}/corporate/login</a></p>
          <p style="margin:4px 0;"><strong>Email:</strong> ${normalizedEmail}</p>
          <p style="margin:4px 0;"><strong>Temporary password:</strong> ${tempPassword}</p>
        </div>
        <p style="color:#64748b;font-size:13px;">Please change your password after your first login.</p>
      </div>`,
      text: `Welcome! You've been added as HR staff for ${corporate.companyName}. Login: ${frontendUrl}/corporate/login  Email: ${normalizedEmail}  Temporary password: ${tempPassword}`,
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
    Number(target.organization_id) !== Number(corporateId) ||
    target.role !== 'hr_staff'
  ) {
    throw new Error('Target is not an hr_staff member of this corporate');
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
    Number(successor.organization_id) !== Number(corporateId) ||
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
