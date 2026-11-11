import { AHC_GUPSHUP_WELCOME_TEMPLATE, ahcInvitationMessage } from '../services/corporate-ahc-message-templates.service.js';

describe('corporate AHC invitation templates', () => {
  it('keeps Gupshup variables ordered and provides representative samples', () => {
    expect(AHC_GUPSHUP_WELCOME_TEMPLATE.name).toBe('annual_health_checkup_welcome_v1');
    expect(AHC_GUPSHUP_WELCOME_TEMPLATE.body).toContain('{{1}}');
    expect(AHC_GUPSHUP_WELCOME_TEMPLATE.body).toContain('{{2}}');
    expect(AHC_GUPSHUP_WELCOME_TEMPLATE.body).toContain('{{3}}');
    expect(AHC_GUPSHUP_WELCOME_TEMPLATE.samples).toHaveLength(3);
  });

  it('renders the employee-specific expiry consistently across channels', () => {
    const message = ahcInvitationMessage({ employeeName: 'Aarav', corporateName: 'Equitas Bank', programName: 'Equitas Bank Managers AHC 2026', validFrom: '1 November 2026', validTo: '15 December 2026' });
    expect(message.subject).toContain('15 December 2026');
    expect(message.text).toContain('one-time benefit');
    expect(message.html).toContain('Book your AHC');
    expect(message.text).toContain('1 November 2026 to 15 December 2026');
    expect(message.html).toContain('Google Play');
    expect(message.html).toContain('App Store');
    expect(message.text).toContain('My SmartHealth');
    expect(message.html).toContain('My SmartHealth');
    expect(message.html).not.toContain('through Mediczy');
    expect(message.html).not.toContain('Mediczy Healthcare');
    expect(message.whatsappParams).toEqual(['Aarav', 'Equitas Bank', '15 December 2026']);
  });
});
