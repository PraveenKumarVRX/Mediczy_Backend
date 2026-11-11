const bookingUrl = 'https://app.mediqzy.com/health-checkups';
const androidAppUrl = 'https://play.google.com/store/apps/details?id=com.mysmarthealth';
const iosAppUrl = 'https://apps.apple.com/in/app/smart-health/id6757312276';

/**
 * The care desk employees are told to contact. `care@mysmarthealth.in` is the
 * monitored shared mailbox (see care-team-notification.service.js) and
 * 8098998998 is the support line, which is also the WhatsApp Business number —
 * there is no separate voice line. Do not substitute a Mediqzy/Mediczy address
 * here: those are the software and the domains, while anything an employee or
 * an employer reads is branded My SmartHealth.
 */
export const AHC_SUPPORT = Object.freeze({
  email: 'care@mysmarthealth.in',
  phone: '+91 80989 98998',
  phoneDigits: '918098998998',
  whatsappUrl: 'https://wa.me/918098998998',
  signOff: 'Healthy Regards,\nTeam SmartHealth',
});

/**
 * How a corporate employee signs in to My SmartHealth.
 *
 * The app supports passwordless sign-in (`POST /api/users/login/send-otp`,
 * then `/login/verify-otp`) with either the registered email or the registered
 * 10-digit mobile, so **no password is created for these accounts and none is
 * ever put in an email**. A one-time code is the credential, it is requested
 * by the person themselves, and it expires. An emailed password would sit in a
 * mailbox forever and unlock a health record.
 *
 * WhatsApp OTP delivery is unreliable while the Gupshup templates are
 * unapproved, so the email route is named first.
 */
export const AHC_SIGN_IN = Object.freeze({
  method: 'One-time code — no password needed',
  steps: [
    'Open My SmartHealth and choose **Sign in with OTP**.',
    'Enter your registered email address or mobile number.',
    'We send you a one-time code; enter it to sign in.',
  ],
  passwordNote: 'Prefer a password? Choose **Forgot password** on the sign-in screen to set one for your account.',
});

const maskPhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 4 ? `\u2022\u2022\u2022\u2022\u2022\u2022${digits.slice(-4)}` : '';
};

/**
 * The booking journey as the product actually implements it
 * (routes/health-checkup.route.js): an employee's booking starts as `booked`,
 * the care team confirms it, instructions become visible from `confirmed`, and
 * reports appear once the care team uploads them. Keep these steps in step with
 * that lifecycle — an employee acting on a step we do not implement is worse
 * than no instructions at all.
 */
export const AHC_PROCESS_STEPS = Object.freeze([
  { title: 'Open My SmartHealth', detail: 'Sign in to the app, or go to app.mediqzy.com, and open Health Checkups.' },
  { title: 'Choose your centre, date and time', detail: 'Pick a lab or health centre from your employer\u2019s network, then a date and a slot that suit you.' },
  { title: 'Submit your booking', detail: 'Your booking is raised for confirmation. You will see it as Booked until our care team confirms it.' },
  { title: 'Get confirmed and read the instructions', detail: 'Once confirmed you will be notified, and your preparation instructions (including any fasting requirement) appear against the booking.' },
  { title: 'Visit the centre', detail: 'Please arrive 10 minutes early and carry a valid photo ID. No payment is due \u2014 your employer has sponsored this checkup.' },
  { title: 'Download your reports', detail: 'When your reports are ready they appear against the same booking in My SmartHealth, to view, download or share.' },
]);

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

/**
 * Submit this exact content to Gupshup before enabling GUPSHUP_TEMPLATE_AHC_WELCOME.
 * It deliberately has concrete eligibility/expiry language so it is suitable for
 * the Utility category; Meta/Gupshup may still recategorise it during review.
 */
export const AHC_GUPSHUP_WELCOME_TEMPLATE = Object.freeze({
  name: 'annual_health_checkup_welcome_v1',
  category: 'UTILITY',
  language: 'en',
  label: 'AHC eligibility update',
  body: 'Hello {{1}}, your {{2}} annual health checkup is now available through My SmartHealth. Your personal validity ends on {{3}}. Please complete it before this date; unused eligibility cannot be used after expiry.',
  footer: 'My SmartHealth',
  button: { type: 'URL', text: 'Book AHC', url: bookingUrl },
  samples: ['Aarav Sharma', 'Equitas Bank', '15 December 2026'],
});

/**
 * `attachmentName` is the file the Team user attached to the `corporate_ahc`
 * template, resolved by the caller BEFORE the message is built. The line
 * pointing at the attached booking manual is rendered only when a file is
 * genuinely going out — an email telling an employee to read an attachment
 * that is not there is worse than one that never mentions it.
 */
export function ahcInvitationMessage({ employeeName, corporateName, programName, validFrom, validTo, attachmentName = null, loginEmail = null, loginPhone = null }) {
  const name = String(employeeName || 'Member').trim();
  const employer = String(corporateName || programName || 'your organisation').trim();
  const programme = String(programName || 'Annual Health Checkup').trim();
  const start = String(validFrom || '').trim();
  const expiry = String(validTo || '').trim();
  if (!expiry) throw new Error('A personalised AHC expiry date is required');

  const subject = `Your ${programme} is available \u2014 complete it by ${expiry}`;
  const validityLine = start ? `${start} to ${expiry}` : `until ${expiry}`;
  const manual = String(attachmentName || '').trim();
  const signInEmail = String(loginEmail || '').trim();
  const signInPhone = maskPhone(loginPhone);
  // Deliberately does not name the file: the saved studio template is static
  // HTML, so a filename baked into the copy goes stale the moment HR replaces
  // the attachment. The sentence is identical on both paths.
  const manualLine = manual
    ? 'Please also refer to the AHC appointment booking manual attached with this email for step-by-step screens.'
    : '';

  const text = [
    `Dear ${name},`,
    '',
    `Your ${programme} is now available through My SmartHealth.`,
    '',
    `Your personal AHC validity period is ${validityLine}. Please book and complete your checkup on or before the end date. This is a one-time benefit; unused eligibility cannot be used after its expiry.`,
    '',
    'Signing in to My SmartHealth',
    `Your username is ${signInEmail || 'the email address this message was sent to'}${signInPhone ? `, or your registered mobile ending ${signInPhone}` : ''}.`,
    AHC_SIGN_IN.method,
    ...AHC_SIGN_IN.steps.map((step, index) => `  ${index + 1}. ${step.replace(/\*\*/g, '')}`),
    AHC_SIGN_IN.passwordNote.replace(/\*\*/g, ''),
    '',
    'How to use your checkup',
    ...AHC_PROCESS_STEPS.map((step, index) => `${index + 1}. ${step.title} \u2014 ${step.detail}`),
    ...(manualLine ? ['', manualLine] : []),
    '',
    `Book your AHC: ${bookingUrl}`,
    `Download the My SmartHealth app on Google Play: ${androidAppUrl}`,
    `Download the My SmartHealth app on the App Store: ${iosAppUrl}`,
    '',
    'Need help?',
    `Email: ${AHC_SUPPORT.email}`,
    `Phone / WhatsApp: ${AHC_SUPPORT.phone}`,
    `WhatsApp us: ${AHC_SUPPORT.whatsappUrl}`,
    '',
    'For eligibility questions, please contact your HR team. Do not reply with personal health information.',
    '',
    AHC_SUPPORT.signOff,
  ].join('\n');

  const validity = start ? `${escapeHtml(start)} to ${escapeHtml(expiry)}` : `Until ${escapeHtml(expiry)}`;

  const steps = AHC_PROCESS_STEPS.map((step, index) => `
    <tr>
      <td valign="top" style="padding:0 12px 14px 0;width:30px">
        <div style="width:26px;height:26px;border-radius:13px;background:#116466;color:#fff;font-size:13px;font-weight:bold;text-align:center;line-height:26px">${index + 1}</div>
      </td>
      <td valign="top" style="padding:0 0 14px">
        <strong style="font-size:14px;color:#172033">${escapeHtml(step.title)}</strong><br>
        <span style="font-size:13px;color:#4b5563;line-height:20px">${escapeHtml(step.detail)}</span>
      </td>
    </tr>`).join('');

  const html = `<!doctype html><html><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#172033">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:14px;overflow:hidden">
  <tr><td style="padding:26px 32px;background:#116466;color:#fff"><strong style="font-size:22px">My SmartHealth</strong><br><span style="font-size:14px">Annual Health Checkup</span></td></tr>
  <tr><td style="padding:32px">
    <h1 style="font-size:24px;margin:0 0 18px">Your AHC eligibility is active</h1>
    <p>Dear ${escapeHtml(name)},</p>
    <p>Your <strong>${escapeHtml(programme)}</strong> is now available through My SmartHealth, sponsored by ${escapeHtml(employer)}.</p>
    <div style="padding:18px;background:#edf8f6;border-left:4px solid #116466;border-radius:6px">
      <strong>Your personal AHC validity period</strong><br>
      <span style="font-size:20px">${validity}</span><br>
      <span style="font-size:13px">Please complete your checkup on or before the end date.</span>
    </div>
    <p>This is a one-time benefit; unused eligibility cannot be used after expiry.</p>
    <div style="margin:26px 0 0;padding:18px;background:#f4f7fb;border:1px solid #dbe4ef;border-radius:8px">
      <strong style="font-size:15px;color:#172033">Signing in to My SmartHealth</strong>
      <p style="margin:10px 0 0;font-size:13px;line-height:21px;color:#4b5563">
        Your username is <strong style="color:#116466">${escapeHtml(signInEmail) || 'the email address this message was sent to'}</strong>${signInPhone ? `, or your registered mobile ending <strong style="color:#116466">${escapeHtml(signInPhone)}</strong>` : ''}.
      </p>
      <p style="margin:10px 0 0;font-size:13px;line-height:21px;color:#4b5563">
        <strong>${escapeHtml(AHC_SIGN_IN.method)}</strong>
      </p>
      <ol style="margin:8px 0 0;padding-left:20px;font-size:13px;line-height:21px;color:#4b5563">
        ${AHC_SIGN_IN.steps.map(step => `<li>${escapeHtml(step).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</li>`).join('\n        ')}
      </ol>
      <p style="margin:10px 0 0;font-size:12px;line-height:19px;color:#6b7280">${escapeHtml(AHC_SIGN_IN.passwordNote).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</p>
      <p style="margin:10px 0 0;font-size:12px;line-height:19px;color:#6b7280">We never send a password by email. If a message ever asks you for your password or a one-time code, it is not from us.</p>
    </div>
    <h2 style="font-size:17px;margin:30px 0 14px;padding-top:18px;border-top:1px solid #e5e7eb">How to use your checkup</h2>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${steps}</table>
    ${manualLine ? `<p style="margin:18px 0 0;padding:12px 14px;background:#edf8f6;border-radius:6px;font-size:13px;line-height:20px;color:#315b55">\u{1F4CE} ${escapeHtml(manualLine)}</p>` : ''}
    <p style="margin:28px 0"><a href="${bookingUrl}" style="display:inline-block;background:#116466;color:#fff;text-decoration:none;padding:13px 20px;border-radius:6px;font-weight:bold">Book your AHC</a></p>
    <p style="margin:24px 0 0;font-weight:bold">Download the My SmartHealth app</p>
    <p style="margin:10px 0"><a href="${androidAppUrl}" style="color:#116466">Google Play</a> &nbsp;|&nbsp; <a href="${iosAppUrl}" style="color:#116466">App Store</a></p>
    <div style="margin:28px 0 0;padding:18px;background:#f7f9fc;border-radius:8px">
      <strong style="font-size:14px">Need help?</strong>
      <p style="margin:8px 0 0;font-size:13px;line-height:21px;color:#4b5563">
        Email <a href="mailto:${AHC_SUPPORT.email}" style="color:#116466">${AHC_SUPPORT.email}</a><br>
        Phone / WhatsApp <a href="tel:+${AHC_SUPPORT.phoneDigits}" style="color:#116466">${AHC_SUPPORT.phone}</a>
        &nbsp;(<a href="${AHC_SUPPORT.whatsappUrl}" style="color:#116466">message us on WhatsApp</a>)
      </p>
    </div>
    <p style="font-size:13px;color:#596579;margin-top:24px">For eligibility questions, please contact your HR team. Do not reply with personal health information.</p>
    <p style="margin:24px 0 0;font-size:14px;color:#172033">Healthy Regards,<br><strong>Team SmartHealth</strong></p>
  </td></tr>
  <tr><td style="padding:18px 32px;background:#f7f9fc;font-size:12px;color:#596579">
    My SmartHealth &nbsp;·&nbsp; <a href="mailto:${AHC_SUPPORT.email}" style="color:#596579">${AHC_SUPPORT.email}</a> &nbsp;·&nbsp; ${AHC_SUPPORT.phone}
  </td></tr>
</table>
</td></tr></table></body></html>`;

  return { subject, text, html, bookingUrl, support: AHC_SUPPORT, steps: AHC_PROCESS_STEPS, signIn: AHC_SIGN_IN, attachmentName: manual || null, whatsappParams: [name, employer, expiry] };
}
