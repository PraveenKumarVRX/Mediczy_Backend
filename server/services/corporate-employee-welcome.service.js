/**
 * Shared "welcome notification" dispatch for an admin/HR-provisioned corporate
 * employee account — a temp password + login identifier, delivered by whichever
 * channels are available (email always attempted; SMS/WhatsApp when a phone is
 * on file). Originally private to server/routes/admin.route.js; extracted so the
 * corporate-admin-facing flow (server/routes/corporate.route.js) can reuse the
 * exact same, already-proven email logic instead of duplicating it, and so a
 * single SMS/WhatsApp addition benefits both callers at once.
 */
import bcrypt from 'bcrypt';
import welcomeEmailService from './welcome-email.service.js';
import notificationService from './notification.service.js';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { reactivateCorporateEmployeeAccount } from './corporate-employee-activation.service.js';

const WELCOME_DRAFT_PASSWORD_PLACEHOLDER = '[generated securely at send time]';

/**
 * @param {Object} params
 * @param {'draft'|'prepare'|'send'|'skip'} [params.welcomeEmailMode]
 * @param {Object} params.welcomeEmailData - see buildCorporateEmployeeWelcomeEmail's shape; include `loginUid` for the real login identifier
 * @param {string} params.temporaryPassword
 * @param {number} [params.userId] - when given, also attempts SMS/WhatsApp via the user's phone on file
 * @param {number} [params.teamUserId]
 * @param {number} [params.corporateId]
 * @param {boolean} [params.throwOnSendFailure]
 * @param {boolean} [params.sendSms=true]
 * @param {boolean} [params.sendWhatsapp=true]
 */
export async function dispatchCorporateEmployeeWelcomeEmail({
  welcomeEmailMode = 'draft',
  welcomeEmailData,
  temporaryPassword,
  userId = null,
  teamUserId,
  corporateId,
  throwOnSendFailure = false,
  sendSms = true,
  sendWhatsapp = true,
}) {
  const normalizedMode = welcomeEmailMode === 'send'
    ? 'send'
    : (welcomeEmailMode === 'prepare' ? 'draft' : welcomeEmailMode);

  if (!temporaryPassword || !welcomeEmailData?.email) {
    return {
      emailStatus: 'not_applicable',
      emailSent: false,
      emailError: null,
      welcomeEmailDraft: null,
      smsStatus: 'not_applicable',
      whatsappStatus: 'not_applicable',
    };
  }

  const emailOptions = { teamUserId, corporateId };
  const emailData = { ...welcomeEmailData, userId: welcomeEmailData.userId ?? userId };
  const loginIdentifier = welcomeEmailData.loginUid || welcomeEmailData.email || welcomeEmailData.employeeId || '';

  let smsStatus = 'not_applicable';
  let whatsappStatus = 'not_applicable';

  // SMS/WhatsApp only make sense alongside an actual send (a draft/preview has no
  // real password yet, and nothing should be texted to the employee for that).
  if (normalizedMode === 'send' && userId) {
    const credentialMessage = `Your ${welcomeEmailData.companyName || 'corporate'} health portal login is ready. Login ID: ${loginIdentifier} | Temporary password: ${temporaryPassword} | You'll be asked to set a new password on first login.`;
    if (sendSms) {
      try {
        const result = await notificationService.sendSMS(userId, 'patient', credentialMessage);
        smsStatus = result?.success ? 'sent' : (result?.error === 'No phone number found' ? 'not_applicable' : 'failed');
      } catch (error) {
        console.warn('[corporate-employee-welcome] SMS dispatch failed:', error?.message || error);
        smsStatus = 'failed';
      }
    }
    if (sendWhatsapp) {
      try {
        const result = await notificationService.sendWhatsApp(userId, 'patient', 'Your health portal login', credentialMessage);
        whatsappStatus = result?.success ? 'sent' : (result?.error === 'No phone number found' ? 'not_applicable' : 'failed');
      } catch (error) {
        console.warn('[corporate-employee-welcome] WhatsApp dispatch failed:', error?.message || error);
        whatsappStatus = 'failed';
      }
    }
  }

  if (normalizedMode === 'send') {
    try {
      await welcomeEmailService.sendCorporateEmployeeWelcomeEmail(
        emailData,
        temporaryPassword,
        emailOptions
      );
      return {
        emailStatus: 'queued',
        emailSent: true,
        emailError: null,
        welcomeEmailDraft: null,
        smsStatus,
        whatsappStatus,
      };
    } catch (error) {
      if (throwOnSendFailure) {
        throw error;
      }
      return {
        emailStatus: 'failed',
        emailSent: false,
        emailError: error?.message || 'Failed to send welcome email',
        welcomeEmailDraft: null,
        smsStatus,
        whatsappStatus,
      };
    }
  }

  if (normalizedMode === 'draft') {
    const draft = await welcomeEmailService.buildCorporateEmployeeWelcomeEmail(
      emailData,
      WELCOME_DRAFT_PASSWORD_PLACEHOLDER,
      emailOptions
    );
    return {
      emailStatus: 'draft',
      emailSent: false,
      emailError: null,
      welcomeEmailDraft: {
        to: draft.to,
        subject: draft.subject,
        html: draft.html,
      },
      smsStatus: 'not_applicable',
      whatsappStatus: 'not_applicable',
    };
  }

  return {
    emailStatus: 'skipped',
    emailSent: false,
    emailError: null,
    welcomeEmailDraft: null,
    smsStatus: 'not_applicable',
    whatsappStatus: 'not_applicable',
  };
}

/**
 * Provision a login account for a roster employee who was added to corporate_employees
 * (self-registration, bulk upload, or a legacy path) but never got a `users` row - the
 * only reason "Prepare Welcome Email Batch" could never reach them: isWelcomeEmailEligible
 * hard-requires a numeric user id, and no UI path in the Team portal ever created one
 * retroactively. Mirrors the account-creation block in corporate.route.js POST /employees
 * (new-employee path) exactly, just targeting an existing roster row instead of inserting
 * a new one, so the two flows can never drift apart on fields/columns again.
 *
 * @param {Object} params
 * @param {number} params.corporateEmployeeRowId - corporate_employees.id (NOT the public employee ID)
 * @param {number} params.corporateId
 * @returns {Promise<{success:boolean, reason?:string, userId?:number, employeeUid?:string, welcomeDispatch?:object}>}
 */
export async function provisionAccountForRosterEmployee({ corporateEmployeeRowId, corporateId }) {
  if (!corporateEmployeeRowId || !corporateId) return { success: false, reason: 'missing_ids' };

  const [roster] = await postgresSequelize.query(
    `SELECT id, "userId", "employeeId", email, metadata, unique_id, "joiningDate"
       FROM corporate_employees
      WHERE id = :id AND corporate_id = :corporateId AND "isActive" = true
      LIMIT 1`,
    { replacements: { id: corporateEmployeeRowId, corporateId }, type: postgresSequelize.QueryTypes.SELECT }
  );
  if (!roster) return { success: false, reason: 'employee_not_found' };
  if (roster.userId) return { success: false, reason: 'already_has_account', userId: roster.userId };

  const meta = typeof roster.metadata === 'string' ? JSON.parse(roster.metadata || '{}') : (roster.metadata || {});
  const firstName = meta.firstName || '';
  const lastName = meta.lastName || '';

  const normalizedEmail = String(roster.email || '').trim().toLowerCase();
  // corporate_employees has no phone column of its own; some bulk-upload metadata carries
  // one under these keys. Login ID is email, falling back to phone only when HR provided
  // one and no email exists — per instruction, never the UID for the login ID itself.
  const normalizedPhone = String(meta.phone || meta.phoneNumber || meta.mobile || '').trim();
  if (!normalizedEmail && !normalizedPhone) return { success: false, reason: 'missing_contact' };
  const loginIdentifier = normalizedEmail || normalizedPhone;

  const [corporateRecord] = await postgresSequelize.query(
    `SELECT id, "companyName", aggregator_id, aggregator_type, tenant_id FROM corporates WHERE id = :id AND status = 'Active' LIMIT 1`,
    { replacements: { id: corporateId }, type: postgresSequelize.QueryTypes.SELECT }
  );
  if (!corporateRecord) return { success: false, reason: 'corporate_not_found_or_inactive' };

  // Per instruction: temporary password is the employee's own entity UID
  // (corporate_employees.unique_id) - already guaranteed unique per employee by the
  // entity-UID-rule triggers, so unlike a date-derived password no two employees (even
  // from the same HR upload batch) ever share one. Login ID is email/phone (above), not
  // this UID - the account still forces a password change on first login regardless.
  const temporaryPassword = roster.unique_id;
  const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
  const [newUser] = await postgresSequelize.query(
    `INSERT INTO users (email, "phoneNumber", password, "firstName", "lastName", "emailVerified", "phoneVerified",
       status, "isVerified", "isCorporate", organization_id, organization_type, tenant_id,
       aggregator_id, aggregator_type, metadata, "createdAt", "updatedAt")
     VALUES (:email, :phoneNumber, :password, :firstName, :lastName, :emailVerified, :phoneVerified,
       'active', true, true, :corporateId, 'corporate', :tenantId,
       :aggregatorId, :aggregatorType, '{"requirePasswordChange": true}'::jsonb, NOW(), NOW())
     RETURNING id`,
    {
      replacements: {
        email: normalizedEmail || null, phoneNumber: normalizedPhone || '', password: hashedPassword,
        firstName: firstName || roster.employeeId || 'Employee', lastName,
        emailVerified: Boolean(normalizedEmail), phoneVerified: Boolean(normalizedPhone),
        corporateId, tenantId: corporateRecord.tenant_id || null,
        aggregatorId: corporateRecord.aggregator_id || null, aggregatorType: corporateRecord.aggregator_type || null,
      },
      type: postgresSequelize.QueryTypes.SELECT,
    }
  );
  const userId = newUser?.id;
  if (!userId) return { success: false, reason: 'account_creation_failed' };

  await postgresSequelize.query(
    `UPDATE corporate_employees SET "userId" = :userId, "updatedAt" = NOW() WHERE id = :id`,
    { replacements: { userId, id: roster.id } }
  );
  await postgresSequelize.query(
    `INSERT INTO user_associations ("userId", "entityType", "entityId", role, status, metadata, corporate_unique_id, "createdAt", "updatedAt")
     SELECT :userId, 'corporate', :corporateId, 'employee', 'active',
            jsonb_build_object('employeeId', :employeeId::text, 'profileActivation', 'active'),
            (SELECT unique_id FROM corporates WHERE id = :corporateId), NOW(), NOW()
     WHERE NOT EXISTS (
       SELECT 1 FROM user_associations WHERE "userId" = :userId AND "entityType" = 'corporate' AND "entityId" = :corporateId AND role = 'employee'
     )`,
    { replacements: { userId, corporateId, employeeId: roster.employeeId } }
  );
  await reactivateCorporateEmployeeAccount(userId);

  let welcomeDispatch = null;
  try {
    welcomeDispatch = await dispatchCorporateEmployeeWelcomeEmail({
      welcomeEmailMode: 'send',
      welcomeEmailData: {
        email: normalizedEmail,
        firstName,
        lastName,
        companyName: corporateRecord.companyName || '',
        employeeId: roster.employeeId,
        // Login ID shown to the employee is their email/phone, never the UID (which is
        // now the temporary password instead) - see dispatchCorporateEmployeeWelcomeEmail's
        // loginIdentifier resolution (welcomeEmailData.loginUid || .email || .employeeId).
        loginUid: loginIdentifier,
      },
      temporaryPassword,
      userId,
      corporateId,
    });
  } catch (dispatchError) {
    welcomeDispatch = { emailStatus: 'failed', emailError: dispatchError.message };
  }

  return { success: true, userId, employeeUid: roster.unique_id, loginIdentifier, welcomeDispatch };
}

export default { dispatchCorporateEmployeeWelcomeEmail };
