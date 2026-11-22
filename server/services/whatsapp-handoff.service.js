/**
 * Whether a WhatsApp conversation is with a person (a Team agent) or with the automatic assistant.
 *
 * While a hand-off is active the assistant stays silent and the Team answers from Chatwoot. It is
 * set when the member asks for a person, when the assistant cannot answer, or when an agent replies
 * in Chatwoot; it ends when the agent resolves the conversation there (or after the TTL).
 * Moved out of routes/whatsapp-production.route.js so the Chatwoot bridge can end a hand-off.
 */
import { cache } from '../db/redis.js';

export const HANDOFF_KEY_PREFIX = 'whatsapp:handoff:';
export const HANDOFF_TTL_SECONDS = parseInt(process.env.WHATSAPP_HANDOFF_TTL || '86400', 10);

export const normalizeWhatsAppNumber = (value) => {
  if (!value) return '';
  const trimmed = String(value).trim().replace(/^whatsapp:/i, '');
  if (trimmed.startsWith('+')) return trimmed;
  const digits = trimmed.replace(/[^\d]/g, '');
  if (digits.length === 10) {
    const countryCode = process.env.DEFAULT_COUNTRY_CODE || '91';
    return `+${countryCode}${digits}`;
  }
  if (digits.length >= 11) return `+${digits}`;
  return digits;
};

const keyOf = (phoneNumber) => `${HANDOFF_KEY_PREFIX}${normalizeWhatsAppNumber(phoneNumber)}`;

export async function getHandoffState(phoneNumber) {
  if (!phoneNumber) return null;
  return cache.get(keyOf(phoneNumber));
}

export async function setHandoffState(phoneNumber, payload = {}) {
  if (!phoneNumber) return null;
  const state = { active: true, updatedAt: new Date().toISOString(), ...payload };
  await cache.set(keyOf(phoneNumber), state, HANDOFF_TTL_SECONDS);
  return state;
}

export async function clearHandoffState(phoneNumber) {
  if (!phoneNumber) return false;
  await cache.del(keyOf(phoneNumber));
  return true;
}

/** "agent", "talk to a person", "customer care": the member wants a human. */
export function asksForPerson(text) {
  const t = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!t || t.length > 200) return false;
  return /^(agent|human|person|support|help desk|helpdesk|customer care|customer support|representative|executive)[.!?]*$/.test(t)
    || /\b(talk|speak|chat|connect)\b.{0,20}\b(agent|human|person|someone|somebody|executive|representative|customer care|support team|your team)\b/.test(t)
    || /\b(real|live)\s+(person|human|agent)\b/.test(t)
    || /\bcall\s+me\s+back\b/.test(t);
}

export default { getHandoffState, setHandoffState, clearHandoffState, asksForPerson, normalizeWhatsAppNumber };
