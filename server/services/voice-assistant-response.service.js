/**
 * Pure response-shaping helpers for Dr. iSHA voice assistant.
 * Keeps spoken output concise and avoids redundant intros / duplicate briefings.
 */

const GREETING_RE = /^(hi|hello|hey|good\s+(morning|afternoon|evening)|namaste)\b/i;
const IDENTITY_RE = /\b(who are you|what are you|what can you do|introduce yourself|your name)\b/i;
const DOUBT_RE = /\b(are you sure|is that (right|correct)|really\??|confirm that|double check)\b/i;
const FILLER_RESPONSE_RE = /^(sure|okay|ok|got it|let me|one moment|please wait|i'll|i will)\b/i;

export function toSpokenText(text, maxSentences = 3) {
  if (!text) return '';
  const cleaned = text
    .replace(/^[•\-]\s*/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return sentences.slice(0, maxSentences).join(' ');
}

export function isIdentityOrGreeting(text) {
  const t = String(text || '').trim().toLowerCase();
  return IDENTITY_RE.test(t) || (GREETING_RE.test(t) && t.length < 40);
}

export function isDoubtFollowUp(text) {
  return DOUBT_RE.test(String(text || '').toLowerCase());
}

export function stripRedundantIshaIntro(text) {
  if (!text) return text;
  return String(text)
    .replace(/^i['']?m isha,?\s*(your\s+)?(ai\s+)?(clinical\s+)?assistant\.?\s*/i, '')
    .replace(/^i['']?m isha\.?\s*/i, '')
    .trim();
}

export function isSubstantiveAnswer(text, minLen = 60) {
  const t = stripRedundantIshaIntro(String(text || '').trim());
  if (!t || t.length < minLen) return false;
  if (FILLER_RESPONSE_RE.test(t)) return false;
  if (t.startsWith("I'm iSHA, your clinical assistant. I can only help")) return true;
  return true;
}

export function lastAssistantText(history = []) {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]?.role === 'assistant' && history[i]?.text) {
      return String(history[i].text).trim();
    }
  }
  return null;
}

export function composeBriefingResponse(briefing) {
  const { unreadNotifications, pendingRequests, upcomingSoon, pendingTasks = [] } = briefing;
  const spokenParts = [];
  if (upcomingSoon.length > 0) {
    spokenParts.push(`${upcomingSoon.length} appointment${upcomingSoon.length > 1 ? 's' : ''} in the next 2 hours.`);
  }
  if (pendingRequests.length > 0) {
    spokenParts.push(`${pendingRequests.length} pending appointment request${pendingRequests.length > 1 ? 's' : ''}.`);
  }
  const urgentNotifs = unreadNotifications.filter((n) => n.priority === 'urgent');
  const highNotifs = unreadNotifications.filter((n) => n.priority === 'high');
  if (urgentNotifs.length > 0) spokenParts.push(`Urgent: ${urgentNotifs[0].title}.`);
  else if (highNotifs.length > 0) spokenParts.push(`${highNotifs.length} high-priority notification${highNotifs.length > 1 ? 's' : ''}.`);
  else if (unreadNotifications.length > 0) spokenParts.push(`${unreadNotifications.length} unread notifications.`);
  if (pendingTasks.length > 0) {
    spokenParts.push(`${pendingTasks.length} pending task${pendingTasks.length > 1 ? 's' : ''}.`);
  }
  if (!spokenParts.length) {
    return { response: 'No new updates right now.', speak: 'No new updates right now.' };
  }
  const speak = spokenParts.join(' ');
  const detailLines = [];
  if (upcomingSoon.length) detailLines.push(`Upcoming: ${upcomingSoon.map((a) => `${a.appointmentTime} ${a.patientName}`).join(', ')}`);
  if (pendingRequests.length) detailLines.push(`Pending requests: ${pendingRequests.map((a) => a.patientName).join(', ')}`);
  if (urgentNotifs.length) detailLines.push(`Urgent: ${urgentNotifs.map((n) => n.title).join(', ')}`);
  if (pendingTasks.length) detailLines.push(`Tasks: ${pendingTasks.map((t) => t.title).join(', ')}`);
  const response = `${speak}${detailLines.length ? `\n${detailLines.join('\n')}` : ''}`;
  return { response, speak };
}

const NAV_SCREEN_ALIASES = [
  { screen: 'ai-assist', patterns: [/\bai[\s-]?assist\b/, /\bai\s+assistant\b/] },
  { screen: 'monitoring', patterns: [/\b(remote\s+)?monitoring\b/, /\bhealth\s+monitoring\b/] },
  { screen: 'templates', patterns: [/\btemplates?\b/, /\bdocument\s+templates?\b/] },
  { screen: 'queue', patterns: [/\bqueue\b/, /\bwaiting\s+room\b/] },
  { screen: 'staff', patterns: [/\bstaff\b/, /\bteam\b/, /\bsettings\b/] },
  { screen: 'appointments', patterns: [/\bappointments?\b/, /\bschedule\b/, /\bcalendar\b/] },
  { screen: 'patients', patterns: [/\bpatients?\b/] },
  { screen: 'prescriptions', patterns: [/\bprescriptions?\b/, /\brx\b/] },
  { screen: 'dashboard', patterns: [/\bdashboard\b/, /\bhome\b/] },
  { screen: 'analytics', patterns: [/\banalytics\b/, /\breports?\b/] },
  { screen: 'billing', patterns: [/\bbilling\b/, /\binvoices?\b/] },
  { screen: 'health-records', patterns: [/\bhealth[\s-]?records?\b/, /\brecords?\b/] },
  { screen: 'voice-scribe', patterns: [/\bvoice[\s-]?scribe\b/, /\bscribe\b/] },
  { screen: 'calculators', patterns: [/\bcalculators?\b/] },
  { screen: 'er-dashboard', patterns: [/\ber[\s-]?dashboard\b/, /\btriage\b/, /\bemergency\b/] },
  { screen: 'icu-dashboard', patterns: [/\bicu\b/] },
];

export function inferNavigationScreen(text) {
  const normalized = String(text || '').toLowerCase().trim();
  if (!/\b(open|go to|show|navigate|take me to)\b/.test(normalized)) return null;
  for (const { screen, patterns } of NAV_SCREEN_ALIASES) {
    if (patterns.some((pattern) => pattern.test(normalized))) return screen;
  }
  return null;
}

export function inferBriefingRequest(text) {
  return /\b(briefing|updates?|what(?:'| i)?s new|any alerts?|notifications?|what did i miss|messages?)\b/i.test(
    String(text || ''),
  );
}

export const GREETING_RESPONSE =
  "I'm iSHA, your AI clinical assistant. I can manage appointments, tasks, patient records, and drug questions.";
