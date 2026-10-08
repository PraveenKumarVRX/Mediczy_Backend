/**
 * WhatsApp identity linking.
 *
 * A provider-authenticated webhook proves that an event came from the
 * configured WhatsApp account.  This service separately proves control of the
 * sender's phone and links it to an existing Mediczy account.  The phone
 * match alone is deliberately never treated as permission to read PHI or
 * mutate appointments.
 */
import { cache } from '../db/redis.js';
import OTP from '../models/otp.model.intelligent.js';
import whatsAppProductionService from './whatsapp-production.service.js';
import whatsAppUserContextService from './whatsapp-user-context.service.js';
import { normalizeGupshupPhone } from './gupshup-whatsapp.service.js';

const OTP_PURPOSE = 'whatsapp-account-link';
const OTP_TTL_MINUTES = 10;
const SESSION_TTL_SECONDS = 15 * 60;
const OTP_COOLDOWN_SECONDS = 60;
const PREFIX = 'whatsapp:identity:';

function normalizedPhone(phone) {
  try {
    return normalizeGupshupPhone(phone);
  } catch {
    return null;
  }
}

function pendingKey(phone) { return `${PREFIX}pending:${phone}`; }
function sessionKey(phone) { return `${PREFIX}session:${phone}`; }
function cooldownKey(phone) { return `${PREFIX}otp-cooldown:${phone}`; }

const genericLinkMessage = 'If this WhatsApp number is linked to a Mediczy account, I’ll send a verification code here. Reply with `OTP 123456` when it arrives. The code expires in 10 minutes.';

class WhatsAppIdentityService {
  normalize(phone) { return normalizedPhone(phone); }

  async getSession(phone) {
    const normalized = normalizedPhone(phone);
    if (!normalized) return null;
    const session = await cache.get(sessionKey(normalized));
    if (!session?.verified || !session.userId) return null;
    return { ...session, phone: normalized };
  }

  async isLinked(phone, userId = null) {
    const session = await this.getSession(phone);
    return Boolean(session && (!userId || String(session.userId) === String(userId)));
  }

  async requestLink(phone) {
    const normalized = normalizedPhone(phone);
    if (!normalized) return { success: true, sent: false, message: genericLinkMessage };

    // Keep the response deliberately generic so a phone-number lookup cannot
    // be used to enumerate Mediczy accounts.
    const user = await whatsAppUserContextService.findUserByPhone(normalized);
    if (!user?.id) return { success: true, sent: false, message: genericLinkMessage };

    const cooldown = await cache.setNX(cooldownKey(normalized), true, OTP_COOLDOWN_SECONDS);
    if (cooldown !== 'OK' && cooldown !== true) {
      return { success: true, sent: true, message: 'A verification code was sent recently. Please use that code or wait a minute before requesting another.' };
    }

    try {
      const generated = await OTP.generate({
        phone: normalized,
        userId: user.id,
        purpose: OTP_PURPOSE,
        expiryMinutes: OTP_TTL_MINUTES
      });
      await cache.set(pendingKey(normalized), {
        phone: normalized,
        userId: String(user.id),
        requestedAt: new Date().toISOString()
      }, OTP_TTL_MINUTES * 60);
      await whatsAppProductionService.sendOTP({ to: normalized, otp: generated.code });
      return { success: true, sent: true, message: genericLinkMessage };
    } catch (error) {
      await cache.del(cooldownKey(normalized)).catch(() => {});
      await cache.del(pendingKey(normalized)).catch(() => {});
      throw error;
    }
  }

  async verifyLink(phone, code) {
    const normalized = normalizedPhone(phone);
    const pending = normalized ? await cache.get(pendingKey(normalized)) : null;
    if (!normalized || !pending?.userId || !/^\d{6}$/.test(String(code || '').trim())) {
      return { success: false, code: 'invalid_whatsapp_otp', message: 'That verification code is invalid or expired. Request a new code and try again.' };
    }

    const result = await OTP.verify({ phone: normalized, code: String(code).trim(), purpose: OTP_PURPOSE });
    if (!result?.success) {
      return { success: false, code: 'invalid_whatsapp_otp', message: 'That verification code is invalid or expired. Request a new code and try again.' };
    }

    const linked = {
      verified: true,
      userId: String(pending.userId),
      phone: normalized,
      verifiedAt: new Date().toISOString()
    };
    await cache.set(sessionKey(normalized), linked, SESSION_TTL_SECONDS);
    await cache.del(pendingKey(normalized));
    return { success: true, session: linked };
  }

  async clear(phone) {
    const normalized = normalizedPhone(phone);
    if (!normalized) return false;
    await Promise.all([cache.del(sessionKey(normalized)), cache.del(pendingKey(normalized))]);
    return true;
  }
}

export { genericLinkMessage, OTP_PURPOSE };
export default new WhatsAppIdentityService();
