import { describe, expect, it } from '@jest/globals';

/**
 * Meta drops a template message whose variable is empty after Gupshup has
 * accepted the call, so it would look sent and never arrive. The sender
 * refuses a blank value before anything is submitted.
 */
process.env.GUPSHUP_API_KEY = 'k';
process.env.GUPSHUP_APP_NAME = 'app';
process.env.GUPSHUP_SOURCE_NUMBER = '919800000000';
const { default: gupshup } = await import('../services/gupshup-whatsapp.service.js');

describe('Gupshup template parameters', () => {
  it('refuses an empty or whitespace parameter before submitting', () => {
    expect(() => gupshup.sendTemplate({ to: '919800000001', templateId: 'tpl', params: ['Aarav', '  ', 'x'] })).toThrow(/needs a value/);
    expect(() => gupshup.sendTemplate({ to: '919800000001', templateId: 'tpl', params: ['Aarav', ''] })).toThrow(/needs a value/);
  });

  it('still refuses a Twilio Content SID or a missing template', () => {
    expect(() => gupshup.sendTemplate({ to: '919800000001', templateId: 'HX123', params: ['a'] })).toThrow(/approved Gupshup template ID/);
    expect(() => gupshup.sendTemplate({ to: '919800000001', params: ['a'] })).toThrow(/approved Gupshup template ID/);
  });
});
