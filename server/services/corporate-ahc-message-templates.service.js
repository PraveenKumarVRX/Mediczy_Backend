const bookingUrl = 'https://app.mediqzy.com/health-checkups';
const androidAppUrl = 'https://play.google.com/store/apps/details?id=com.mysmarthealth';
const iosAppUrl = 'https://apps.apple.com/in/app/smart-health/id6757312276';

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

export function ahcInvitationMessage({ employeeName, corporateName, programName, validFrom, validTo }) {
  const name = String(employeeName || 'Member').trim();
  const employer = String(corporateName || programName || 'your organisation').trim();
  const programme = String(programName || 'Annual Health Checkup').trim();
  const start = String(validFrom || '').trim();
  const expiry = String(validTo || '').trim();
  if (!expiry) throw new Error('A personalised AHC expiry date is required');

  const subject = `Your ${employer} Annual Health Checkup is ready — use it by ${expiry}`;
  const text = [
    `Dear ${name},`,
    '',
    `Your ${programme} is now available through My SmartHealth.`,
    '',
    `Your personal AHC validity period is ${start ? `${start} to ${expiry}` : `until ${expiry}`}. Please book and complete your checkup on or before the end date. This is a one-time benefit; unused eligibility cannot be used after its expiry.`,
    '',
    `Book your AHC: ${bookingUrl}`,
    `Download the My SmartHealth app on Google Play: ${androidAppUrl}`,
    `Download the My SmartHealth app on the App Store: ${iosAppUrl}`,
    '',
    'For eligibility questions, please contact your HR team. Do not reply with personal health information.',
    '',
    'My SmartHealth',
  ].join('\n');

  const validity = start ? `${escapeHtml(start)} to ${escapeHtml(expiry)}` : `Until ${escapeHtml(expiry)}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#172033"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px"><tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:14px;overflow:hidden"><tr><td style="padding:26px 32px;background:#116466;color:#fff"><strong style="font-size:22px">My SmartHealth</strong><br><span style="font-size:14px">Annual Health Checkup</span></td></tr><tr><td style="padding:32px"><h1 style="font-size:24px;margin:0 0 18px">Your AHC eligibility is active</h1><p>Dear ${escapeHtml(name)},</p><p>Your <strong>${escapeHtml(programme)}</strong> is now available through My SmartHealth.</p><div style="padding:18px;background:#edf8f6;border-left:4px solid #116466;border-radius:6px"><strong>Your personal AHC validity period</strong><br><span style="font-size:20px">${validity}</span><br><span style="font-size:13px">Please complete your checkup on or before the end date.</span></div><p>This is a one-time benefit; unused eligibility cannot be used after expiry.</p><p style="margin:28px 0"><a href="${bookingUrl}" style="display:inline-block;background:#116466;color:#fff;text-decoration:none;padding:13px 20px;border-radius:6px;font-weight:bold">Book your AHC</a></p><p style="margin:24px 0 0;font-weight:bold">Download the My SmartHealth app</p><p style="margin:10px 0"><a href="${androidAppUrl}" style="color:#116466">Google Play</a> &nbsp;|&nbsp; <a href="${iosAppUrl}" style="color:#116466">App Store</a></p><p style="font-size:13px;color:#596579">For eligibility questions, please contact your HR team. Do not reply with personal health information.</p></td></tr><tr><td style="padding:18px 32px;background:#f7f9fc;font-size:12px;color:#596579">My SmartHealth</td></tr></table></td></tr></table></body></html>`;

  return { subject, text, html, bookingUrl, whatsappParams: [name, employer, expiry] };
}
