process.env.NODE_ENV = 'test';

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  normalizeE164,
  resolveTwilioSmsSender,
  whatsappSenderE164,
} from '../services/sms.service.js';

describe('normalizeE164', () => {
  it('strips whatsapp: prefix', () => {
    expect(normalizeE164('whatsapp:+918098998998')).toBe('+918098998998');
  });
});

describe('resolveTwilioSmsSender', () => {
  beforeEach(() => {
    delete process.env.TWILIO_SMS_NUMBER;
    delete process.env.TWILIO_PHONE_NUMBER;
    delete process.env.TWILIO_WHATSAPP_NUMBER;
    delete process.env.TWILIO_MESSAGING_SERVICE_SID;
  });

  it('prefers TWILIO_SMS_NUMBER over WhatsApp number', async () => {
    process.env.TWILIO_WHATSAPP_NUMBER = 'whatsapp:+918098998998';
    process.env.TWILIO_PHONE_NUMBER = '+918098998998';
    const sender = await resolveTwilioSmsSender({
      smsFrom: '+919999999999',
      allowDiscover: false,
    });
    expect(sender).toEqual({ from: '+919999999999', source: 'env' });
  });

  it('rejects WhatsApp number as SMS From', async () => {
    process.env.TWILIO_WHATSAPP_NUMBER = 'whatsapp:+918098998998';
    process.env.TWILIO_PHONE_NUMBER = '+918098998998';
    await expect(
      resolveTwilioSmsSender({
        senderId: '+918098998998',
        allowDiscover: false,
      })
    ).rejects.toThrow(/TWILIO_SMS_NUMBER/);
  });

  it('uses Messaging Service SID when set', async () => {
    process.env.TWILIO_MESSAGING_SERVICE_SID = 'MGabcdef0123456789abcdef01234567';
    const sender = await resolveTwilioSmsSender({ allowDiscover: false });
    expect(sender.messagingServiceSid).toMatch(/^MG/);
    expect(sender.source).toBe('messaging_service');
  });

  it('discovers SMS-capable number excluding WhatsApp sender', async () => {
    process.env.TWILIO_WHATSAPP_NUMBER = '+918098998998';
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        incoming_phone_numbers: [
          {
            phone_number: '+918098998998',
            capabilities: { sms: false, voice: false },
          },
          {
            phone_number: '+12025551234',
            capabilities: { sms: true, voice: true },
          },
          {
            phone_number: '+919876543210',
            capabilities: { sms: true, voice: true },
          },
        ],
      }),
    });
    const sender = await resolveTwilioSmsSender({
      accountSid: 'ACxxxx',
      authToken: 'token',
      allowDiscover: true,
      fetch,
    });
    // Prefer +91 when available
    expect(sender.from).toBe('+919876543210');
    expect(sender.source).toBe('twilio_discover');
  });

  it('whatsappSenderE164 reads env', () => {
    process.env.TWILIO_WHATSAPP_NUMBER = 'whatsapp:+918098998998';
    expect(whatsappSenderE164()).toBe('+918098998998');
  });
});
