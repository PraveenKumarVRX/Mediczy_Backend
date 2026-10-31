/**
 * Shared "welcome notification" dispatch for an admin/HR-provisioned corporate
 * employee account — a temp password + login identifier, delivered by whichever
 * channels are available (email always attempted; SMS/WhatsApp when a phone is
 * on file). Originally private to server/routes/admin.route.js; extracted so the
 * corporate-admin-facing flow (server/routes/corporate.route.js) can reuse the
 * exact same, already-proven email logic instead of duplicating it, and so a
 * single SMS/WhatsApp addition benefits both callers at once.
 */
import welcomeEmailService from './welcome-email.service.js';
import notificationService from './notification.service.js';

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
        welcomeEmailData,
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
      welcomeEmailData,
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

export default { dispatchCorporateEmployeeWelcomeEmail };
