import { describe, expect, it, jest, beforeEach } from '@jest/globals';

const create = jest.fn();

jest.unstable_mockModule('twilio', () => ({
  default: () => ({
    messages: { create },
  }),
}));

describe('WhatsApp kiosk registration template send', () => {
  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue({ sid: 'SM123', status: 'queued' });
    process.env.TWILIO_ACCOUNT_SID = 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    process.env.TWILIO_AUTH_TOKEN = 'test-token';
    process.env.TWILIO_WHATSAPP_NUMBER = 'whatsapp:+14155238886';
    process.env.WHATSAPP_TEMPLATE_KIOSK_REGISTER = 'HXkioskregistertemplate000000000001';
    process.env.WHATSAPP_TEMPLATE_KIOSK_REGISTER_STYLE = 'text';
    jest.resetModules();
  });

  it('sends contentSid + variables for text style', async () => {
    const mod = await import('../services/whatsapp-production.service.js');
    const svc = mod.default;
    // Re-bind template from env after resetModules
    svc.templates.kioskRegister = process.env.WHATSAPP_TEMPLATE_KIOSK_REGISTER;
    svc.kioskRegisterStyle = 'text';
    svc.twilioConfigured = true;
    svc.client = { messages: { create } };
    svc.fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;

    await svc.sendKioskRegistrationInvite({
      to: '+919884089921',
      hospitalName: 'QA General Hospital',
      expiresMin: 30,
      registerUrl: 'https://app.mediqzy.com/kiosk/register/abc123token',
      token: 'abc123token',
    });

    expect(create).toHaveBeenCalledTimes(1);
    const args = create.mock.calls[0][0];
    expect(args.contentSid).toBe('HXkioskregistertemplate000000000001');
    expect(args.to).toBe('whatsapp:+919884089921');
    expect(args.from).toBe('whatsapp:+14155238886');
    const vars = JSON.parse(args.contentVariables);
    expect(vars['1']).toBe('QA General Hospital');
    expect(vars['2']).toBe('30');
    expect(vars['3']).toBe('https://app.mediqzy.com/kiosk/register/abc123token');
    expect(args.body).toBeUndefined();
  });

  it('uses token suffix for cta style', async () => {
    const mod = await import('../services/whatsapp-production.service.js');
    const svc = mod.default;
    svc.templates.kioskRegister = 'HXcta';
    svc.kioskRegisterStyle = 'cta';
    svc.twilioConfigured = true;
    svc.client = { messages: { create } };
    svc.fromNumber = '+14155238886';

    await svc.sendKioskRegistrationInvite({
      to: '+919884089921',
      hospitalName: 'City Care',
      expiresMin: 20,
      registerUrl: 'https://app.mediqzy.com/kiosk/register/tok999',
    });

    const vars = JSON.parse(create.mock.calls[0][0].contentVariables);
    expect(vars['3']).toBe('tok999');
    expect(create.mock.calls[0][0].from).toBe('whatsapp:+14155238886');
  });
});
