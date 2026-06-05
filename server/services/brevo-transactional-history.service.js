const BREVO_API_BASE = 'https://api.brevo.com/v3';
const DEFAULT_LOOKBACK_DAYS = 90;
const MAX_WINDOW_DAYS = 30;

function getBrevoApiKey() {
  return process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY || process.env.SIB_API_KEY || '';
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function normalizeSubject(subject) {
  return String(subject || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isLikelyWelcomeSubject(subject) {
  const normalized = normalizeSubject(subject);
  if (!normalized) return false;
  if (normalized.includes('employee health portal')) return true;
  if (normalized.includes('corporate employee welcome')) return true;
  if (!normalized.includes('welcome')) return false;
  return ['mediqzy', 'smarthealth', 'health', 'portal', 'corporate', 'employee'].some((token) => normalized.includes(token));
}

function splitDateWindows(days) {
  const lookback = Math.max(1, Math.min(Number(days) || DEFAULT_LOOKBACK_DAYS, 90));
  const today = new Date();
  const windows = [];
  let end = today;
  let remaining = lookback;

  while (remaining > 0) {
    const windowDays = Math.min(MAX_WINDOW_DAYS, remaining);
    const start = addDays(end, -(windowDays - 1));
    windows.push({ startDate: formatDate(start), endDate: formatDate(end) });
    end = addDays(start, -1);
    remaining -= windowDays;
  }

  return windows;
}

async function fetchTransactionalEmails({ apiKey, email, startDate, endDate, limit = 1000 }) {
  const url = new URL('/v3/smtp/emails', BREVO_API_BASE);
  url.searchParams.set('email', email);
  url.searchParams.set('startDate', startDate);
  url.searchParams.set('endDate', endDate);
  url.searchParams.set('sort', 'desc');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', '0');

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'api-key': apiKey,
      'accept': 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Brevo history lookup failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const payload = await response.json();
  return Array.isArray(payload?.transactionalEmails) ? payload.transactionalEmails : [];
}

export function isBrevoHistoryConfigured() {
  return Boolean(getBrevoApiKey());
}

export async function findPriorBrevoWelcomeEmail({ email, subject, days = DEFAULT_LOOKBACK_DAYS }) {
  const apiKey = getBrevoApiKey();
  const recipient = String(email || '').trim().toLowerCase();
  if (!apiKey || !recipient) {
    return { enabled: Boolean(apiKey), found: false, reason: apiKey ? 'missing_recipient' : 'missing_api_key' };
  }

  const targetSubject = normalizeSubject(subject);
  const windows = splitDateWindows(days);
  let checked = 0;

  for (const window of windows) {
    const emails = await fetchTransactionalEmails({ apiKey, email: recipient, ...window });
    checked += emails.length;

    for (const item of emails) {
      const itemSubject = normalizeSubject(item.subject);
      const subjectMatches = targetSubject
        ? itemSubject === targetSubject || isLikelyWelcomeSubject(item.subject)
        : isLikelyWelcomeSubject(item.subject);

      if (!subjectMatches) continue;

      return {
        enabled: true,
        found: true,
        checked,
        email: recipient,
        date: item.date || null,
        subject: item.subject || null,
        messageId: item.messageId || null,
        uuid: item.uuid || null,
        templateId: item.templateId || null,
        source: 'brevo_transactional_emails',
      };
    }
  }

  return { enabled: true, found: false, checked };
}
