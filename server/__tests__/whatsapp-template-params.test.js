import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * WhatsApp drops a template message whose variable is empty — after the
 * provider has accepted the call, so it looks sent and never arrives. Links
 * that are optional for the caller therefore default to the app page where the
 * member finds the same thing, and the Gupshup sender refuses a blank value
 * outright instead of handing it to Meta.
 */
process.env.WHATSAPP_PROVIDER = 'gupshup';
process.env.GUPSHUP_TEMPLATE_MEMBERSHIP_RENEWAL_REMINDER = 'tpl-renewal';
process.env.GUPSHUP_TEMPLATE_MEMBERSHIP_RENEWAL_PAYMENT = 'tpl-payment';
process.env.GUPSHUP_TEMPLATE_HEALTH_REPORT = 'tpl-report';

const sendTemplate = jest.fn(async () => ({ messageId: 'm1', status: 'submitted' }));
jest.unstable_mockModule('../integrations/twilio.js', () => ({ default: jest.fn(() => ({})) }));
jest.unstable_mockModule('../services/gupshup-whatsapp.service.js', () => ({
  default: { configured: true, sendTemplate },
  normalizeGupshupPhone: (v) => String(v).replace(/\D/g, ''),
  whatsappProvider: () => 'gupshup',
}));

const { default: whatsapp } = await import('../services/whatsapp-production.service.js');

beforeEach(() => sendTemplate.mockClear());

describe('optional links never reach WhatsApp empty', () => {
  it('renewal reminder without a link points at My Plans', async () => {
    await whatsapp.sendMembershipRenewalReminder({ to: '+919800000001', name: 'Aarav', planName: 'Gold', expiryDate: '30 Nov 2026', daysRemaining: 7 });
    expect(sendTemplate).toHaveBeenCalledWith(expect.objectContaining({
      templateId: 'tpl-renewal', params: ['Aarav', 'Gold', '30 Nov 2026', '7', 'https://app.mediqzy.com/my-plans'],
    }));
  });

  it('renewal payment without a link points at My Plans', async () => {
    await whatsapp.sendMembershipPaymentLink({ to: '+919800000001', name: 'Aarav', planName: 'Gold', amount: 4999 });
    expect(sendTemplate.mock.calls[0][0].params).toEqual(['Aarav', 'Gold', '4999', 'https://app.mediqzy.com/my-plans']);
  });

  it('report-ready without a link points at the check-ups page', async () => {
    await whatsapp.sendHealthReportReady({ to: '+919800000001', patientName: 'Aarav' });
    expect(sendTemplate.mock.calls[0][0].params).toEqual(['Aarav', 'https://app.mediqzy.com/health-checkups']);
  });

  it('a real link is still used when the caller has one', async () => {
    await whatsapp.sendMembershipRenewalReminder({ to: '+919800000001', name: 'Aarav', planName: 'Gold', expiryDate: '30 Nov 2026', daysRemaining: 7, renewalUrl: 'https://rzp.io/l/AbC123' });
    expect(sendTemplate.mock.calls[0][0].params[4]).toBe('https://rzp.io/l/AbC123');
  });
});
