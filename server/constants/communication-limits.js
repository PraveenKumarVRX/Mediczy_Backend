/** Channel copy limits for corporate outreach (email, WhatsApp, SMS). */
export const CHANNEL_COMMUNICATION_LIMITS = {
  email: { words: 150, chars: 1200 },
  whatsapp: { words: 80, chars: 420 },
  sms: { words: 35, chars: 160 },
};

export const CORPORATE_PLACEHOLDERS = [
  'companyName',
  'contactPerson',
  'corporateId',
  'employeeCount',
  'industry',
  'packageType',
];

export function getChannelLimits(channel = 'email') {
  const key = String(channel || 'email').toLowerCase();
  return CHANNEL_COMMUNICATION_LIMITS[key] || CHANNEL_COMMUNICATION_LIMITS.email;
}
