import { AHC_GUPSHUP_WELCOME_TEMPLATE, ahcInvitationMessage, AHC_SUPPORT, AHC_PROCESS_STEPS } from '../services/corporate-ahc-message-templates.service.js';

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

describe('the invitation explains the process and signs off with the care desk', () => {
  const message = () => ahcInvitationMessage({
    employeeName: 'Shiva', corporateName: 'Equitas Bank Ltd',
    programName: 'Equitas AHC 2026', validFrom: '12-11-2026', validTo: '25-12-2026',
  });

  it('numbers every step in both the HTML and the plain text', () => {
    const { html, text } = message();
    expect(AHC_PROCESS_STEPS.length).toBeGreaterThanOrEqual(5);
    AHC_PROCESS_STEPS.forEach((step, index) => {
      expect(html).toContain(step.title);
      expect(text).toContain(`${index + 1}. ${step.title}`);
      expect(text).toContain(step.detail);
    });
    expect(html).toContain('How to use your checkup');
  });

  it('describes the lifecycle the product actually implements', () => {
    // routes/health-checkup.route.js: an employee booking starts `booked`, the
    // care team confirms it, and instructions appear from `confirmed`.
    const { text } = message();
    expect(text).toMatch(/Booked until our care team confirms/);
    expect(text).toMatch(/instructions.*appear against the booking/i);
    expect(text).toMatch(/reports are ready/i);
  });

  it('tells the employee no payment is due', () => {
    expect(message().text).toMatch(/No payment is due/);
  });

  it('carries the care desk address, phone and WhatsApp', () => {
    const { html, text } = message();
    for (const channel of [AHC_SUPPORT.email, AHC_SUPPORT.phone]) {
      expect(html).toContain(channel);
      expect(text).toContain(channel);
    }
    expect(html).toContain(`mailto:${AHC_SUPPORT.email}`);
    expect(html).toContain(`tel:+${AHC_SUPPORT.phoneDigits}`);
    expect(html).toContain(AHC_SUPPORT.whatsappUrl);
    expect(text).toContain(AHC_SUPPORT.whatsappUrl);
  });

  it('uses the monitored care mailbox, not a Mediqzy support address', () => {
    // care@mysmarthealth.in is the mailbox that is actually watched; the
    // customer-facing brand is My SmartHealth, never Mediqzy/Mediczy.
    expect(AHC_SUPPORT.email).toBe('care@mysmarthealth.in');
    const { html, text } = message();
    expect(html).not.toContain('support@mediqzy.com');
    expect(text).not.toContain('support@mediqzy.com');
    expect(html).not.toMatch(/Mediczy|Mediqzy Healthcare/);
    // the booking and app links are technical and stay as they are
    expect(html).toContain('https://app.mediqzy.com/health-checkups');
  });

  it('signs off as Team SmartHealth', () => {
    const { html, text } = message();
    expect(html).toContain('Healthy Regards,');
    expect(html).toContain('Team SmartHealth');
    expect(text.trimEnd().endsWith('Healthy Regards,\nTeam SmartHealth')).toBe(true);
  });

  it('escapes a name that contains markup, so the footer cannot be forged', () => {
    const { html } = ahcInvitationMessage({
      employeeName: '<script>alert(1)</script>', corporateName: 'A & B "Ltd"',
      programName: 'AHC', validTo: '25-12-2026',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A &amp; B &quot;Ltd&quot;');
  });

  it('survives being rendered with the template studio placeholders', () => {
    // The saved corporate_ahc template is this same body with {{...}} tokens;
    // escaping must leave them intact or the studio cannot personalise it.
    const { html } = ahcInvitationMessage({
      employeeName: '{{employee_name}}', corporateName: '{{corporate_name}}',
      programName: '{{program_name}}', validFrom: '{{valid_from}}', validTo: '{{valid_to}}',
    });
    for (const token of ['employee_name', 'corporate_name', 'program_name', 'valid_from', 'valid_to']) {
      expect(html).toContain(`{{${token}}}`);
    }
  });

  it('points at the attached booking manual only when a file is really attached', () => {
    const withFile = ahcInvitationMessage({
      employeeName: 'Shiva', programName: 'AHC', validTo: '25-12-2026',
      attachmentName: 'AHC Appointment Booking Manual.pdf',
    });
    expect(withFile.html).toContain('AHC appointment booking manual attached with this email');
    expect(withFile.text).toContain('AHC appointment booking manual attached with this email');
    expect(withFile.attachmentName).toBe('AHC Appointment Booking Manual.pdf');
    // The copy must NOT name the file — the saved studio template is static
    // HTML and a baked-in filename goes stale when HR replaces the attachment.
    expect(withFile.html).not.toContain('AHC Appointment Booking Manual.pdf');

    // No attachment resolved -> the email must not tell the employee to read one.
    for (const name of [null, undefined, '', '   ']) {
      const without = ahcInvitationMessage({ employeeName: 'Shiva', programName: 'AHC', validTo: '25-12-2026', attachmentName: name });
      expect(without.html).not.toMatch(/attached with this email/);
      expect(without.text).not.toMatch(/attached with this email/);
      expect(without.attachmentName).toBeNull();
    }
  });

  it('never echoes the attachment filename into the body', () => {
    const { html } = ahcInvitationMessage({
      employeeName: 'Shiva', programName: 'AHC', validTo: '25-12-2026',
      attachmentName: '<img src=x onerror=alert(1)>.pdf',
    });
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('onerror');
    expect(html).toContain('AHC appointment booking manual attached with this email');
  });

  it('still refuses to send without a personalised expiry', () => {
    expect(() => ahcInvitationMessage({ employeeName: 'Shiva', programName: 'AHC' })).toThrow(/expiry date is required/);
  });
});
