const bookingUrl = 'https://app.mediqzy.com/health-checkups';

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
  body: 'Hello {{1}}, your {{2}} annual health checkup is now available through Mediczy. Your personal validity ends on {{3}}. Please complete it before this date; unused eligibility cannot be used after expiry.',
  footer: 'Mediczy Healthcare',
  button: { type: 'URL', text: 'Book AHC', url: bookingUrl },
  samples: ['Aarav Sharma', 'Equitas Bank', '15 December 2026'],
});

export function ahcInvitationMessage({ employeeName, corporateName, programName, validTo }) {
  const name = String(employeeName || 'Member').trim();
  const employer = String(corporateName || programName || 'your organisation').trim();
  const programme = String(programName || 'Annual Health Checkup').trim();
  const expiry = String(validTo || '').trim();
  if (!expiry) throw new Error('A personalised AHC expiry date is required');

  const subject = `Your ${employer} Annual Health Checkup is ready — use it by ${expiry}`;
  const text = [
    `Dear ${name},`,
    '',
    `Your ${programme} is now available through Mediczy.`,
    '',
    `Your personal AHC validity ends on ${expiry}. Please book and complete your checkup on or before this date. This is a one-time benefit; unused eligibility cannot be used after its expiry.`,
    '',
    `Book your AHC: ${bookingUrl}`,
    '',
    'For eligibility questions, please contact your HR team. Do not reply with personal health information.',
    '',
    'Mediczy Healthcare',
  ].join('\n');

  const html = `<!doctype html><html><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#172033"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px"><tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:14px;overflow:hidden"><tr><td style="padding:26px 32px;background:#116466;color:#fff"><strong style="font-size:22px">Mediczy</strong><br><span style="font-size:14px">Annual Health Checkup</span></td></tr><tr><td style="padding:32px"><h1 style="font-size:24px;margin:0 0 18px">Your AHC eligibility is active</h1><p>Dear ${escapeHtml(name)},</p><p>Your <strong>${escapeHtml(programme)}</strong> is now available through Mediczy.</p><div style="padding:18px;background:#edf8f6;border-left:4px solid #116466;border-radius:6px"><strong>Your personal expiry date</strong><br><span style="font-size:20px">${escapeHtml(expiry)}</span></div><p>Please book and complete your health checkup on or before this date. This is a one-time benefit; unused eligibility cannot be used after expiry.</p><p style="margin:28px 0"><a href="${bookingUrl}" style="display:inline-block;background:#116466;color:#fff;text-decoration:none;padding:13px 20px;border-radius:6px;font-weight:bold">Book your AHC</a></p><p style="font-size:13px;color:#596579">For eligibility questions, please contact your HR team. Do not reply with personal health information.</p></td></tr><tr><td style="padding:18px 32px;background:#f7f9fc;font-size:12px;color:#596579">Mediczy Healthcare</td></tr></table></td></tr></table></body></html>`;

  return { subject, text, html, bookingUrl, whatsappParams: [name, employer, expiry] };
}
