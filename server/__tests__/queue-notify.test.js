import { describe, expect, it } from '@jest/globals';

describe('queue-notify SMS + WhatsApp helpers', () => {
  it('strips WhatsApp markdown for SMS plain text', async () => {
    const { toSmsPlainText, tokenSlipText } = await import('../utils/queue-message-text.js');
    expect(toSmsPlainText('Token: *A12-001*\nDoctor: Dr. Rao')).toBe(
      'Token: A12-001\nDoctor: Dr. Rao',
    );
    const slip = tokenSlipText({ tokenNumber: 'A12-001', patientName: 'Anita', doctorName: 'Dr. Rao' });
    expect(slip).toContain('*A12-001*');
    expect(toSmsPlainText(slip)).toContain('Token: A12-001');
    expect(toSmsPlainText(slip)).not.toContain('*');
  });
});
