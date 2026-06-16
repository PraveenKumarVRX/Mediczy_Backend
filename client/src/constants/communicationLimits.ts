/** Channel copy limits for corporate outreach — keep in sync with server/constants/communication-limits.js */
export const CHANNEL_COMMUNICATION_LIMITS = {
  email: { words: 150, chars: 1200 },
  whatsapp: { words: 80, chars: 420 },
  sms: { words: 35, chars: 160 },
} as const;

export type CommunicationChannelKey = keyof typeof CHANNEL_COMMUNICATION_LIMITS;

export const CORPORATE_PLACEHOLDERS = [
  'companyName',
  'contactPerson',
  'corporateId',
  'employeeCount',
  'industry',
  'packageType',
] as const;

export function getChannelLimits(channel: CommunicationChannelKey | string) {
  const key = String(channel || 'email').toLowerCase() as CommunicationChannelKey;
  return CHANNEL_COMMUNICATION_LIMITS[key] || CHANNEL_COMMUNICATION_LIMITS.email;
}

export const PLACEHOLDER_PATTERN = /\{\{\s*(\w+)\s*\}\}/g;

export function findUnresolvedPlaceholders(...texts: string[]): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    let match: RegExpExecArray | null;
    const re = new RegExp(PLACEHOLDER_PATTERN.source, 'g');
    while ((match = re.exec(text)) !== null) {
      found.add(match[1]);
    }
  }
  return [...found];
}
