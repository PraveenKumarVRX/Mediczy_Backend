import { jest } from '@jest/globals';

const sendOutboundEmail = jest.fn();
const dbQuery = jest.fn();
const sendWhatsApp = jest.fn();
const mailAttachmentsForCategory = jest.fn();

jest.unstable_mockModule('../services/emailService.js', () => ({ default: { sendOutboundEmail } }));
jest.unstable_mockModule('../services/notification.service.js', () => ({ default: { sendWhatsApp } }));
jest.unstable_mockModule('../services/whatsapp-production.service.js', () => ({
  default: { provider: 'twilio', sendAhcWelcome: jest.fn() },
}));
jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({
  postgresSequelize: { query: dbQuery, QueryTypes: { SELECT: 'SELECT', UPDATE: 'UPDATE' } },
}));
jest.unstable_mockModule('../services/team-email-template-attachments.service.js', () => ({
  mailAttachmentsForCategory,
}));

const { notifyAhcEntitlement } = await import('../services/corporate-ahc-entitlement-notification.service.js');

const MEMBER = {
  firstName: 'Aarav', lastName: 'Sharma', email: 'aarav@example.invalid',
  phoneNumber: null, name: 'Equitas AHC 2026-27', corporateName: 'Equitas Bank', validFrom: '2026-11-01',
};
const LETTER = { filename: 'Equitas-AHC-Letter.pdf', content: Buffer.from('%PDF-1.7 letter'), contentType: 'application/pdf' };

const arm = (member = MEMBER) => {
  dbQuery.mockReset();
  dbQuery
    .mockImplementationOnce(async () => [{ id: 11 }])   // the idempotency claim
    .mockImplementationOnce(async () => (member ? [member] : []))
    .mockImplementation(async () => []);                 // the status UPDATE
};

beforeEach(() => {
  sendOutboundEmail.mockReset().mockResolvedValue({ messageId: 'm1' });
  sendWhatsApp.mockReset();
  mailAttachmentsForCategory.mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { console.warn.mockRestore?.(); });

describe('the AHC welcome email carries the file attached to the template', () => {
  it('sends the uploaded file as a real attachment, unchanged', async () => {
    arm();
    mailAttachmentsForCategory.mockResolvedValue({ attachments: [LETTER], templateId: 't1', reason: 'ok' });
    const result = await notifyAhcEntitlement({ packageId: 'pkg-1', userId: 7641, eventType: 'invitation', validTo: '2026-12-15' });

    expect(mailAttachmentsForCategory).toHaveBeenCalledWith('corporate_ahc');
    const [, payload] = sendOutboundEmail.mock.calls[0];
    expect(payload.attachments).toEqual([LETTER]);
    expect(payload.attachments[0].content.equals(LETTER.content)).toBe(true);
    expect(result).toMatchObject({ sent: true, emailStatus: 'sent', attachments: ['Equitas-AHC-Letter.pdf'] });
  });

  it('records the downgrade rather than hiding it when no file is attached to the template', async () => {
    arm();
    mailAttachmentsForCategory.mockResolvedValue({ attachments: [], templateId: null, reason: 'no_attachments' });
    const result = await notifyAhcEntitlement({ packageId: 'pkg-1', userId: 7641, eventType: 'invitation', validTo: '2026-12-15' });

    const [, payload] = sendOutboundEmail.mock.calls[0];
    expect(payload.attachments).toBeUndefined();
    expect(result.emailStatus).toBe('sent_no_file');
    expect(result.sent).toBe(true);           // the employee is still told about their AHC
    const update = dbQuery.mock.calls.find(([sql]) => /UPDATE corporate_ahc_entitlement_notifications/.test(sql));
    expect(update[1].replacements.emailStatus).toBe('sent_no_file');
  });

  it('still delivers the notice when the attachment lookup throws', async () => {
    arm();
    mailAttachmentsForCategory.mockRejectedValue(new Error('relation does not exist'));
    const result = await notifyAhcEntitlement({ packageId: 'pkg-1', userId: 7641, eventType: 'invitation', validTo: '2026-12-15' });
    expect(sendOutboundEmail).toHaveBeenCalledTimes(1);
    expect(result.emailStatus).toBe('sent_no_file');
  });

  it('attaches nothing to a reminder — only the welcome email carries the file', async () => {
    arm();
    const result = await notifyAhcEntitlement({ packageId: 'pkg-1', userId: 7641, eventType: 'reminder_7', validTo: '2026-12-15' });
    expect(mailAttachmentsForCategory).not.toHaveBeenCalled();
    const [, payload] = sendOutboundEmail.mock.calls[0];
    expect(payload.attachments).toBeUndefined();
    expect(result.emailStatus).toBe('sent');
  });

  it('carries the validity period and both app-store links in the body', async () => {
    arm();
    mailAttachmentsForCategory.mockResolvedValue({ attachments: [LETTER], templateId: 't1', reason: 'ok' });
    await notifyAhcEntitlement({ packageId: 'pkg-1', userId: 7641, eventType: 'invitation', validTo: '2026-12-15' });
    const [, payload] = sendOutboundEmail.mock.calls[0];
    expect(payload.htmlContent).toContain('1 November 2026 to 15 December 2026');
    expect(payload.htmlContent).toContain('play.google.com');
    expect(payload.htmlContent).toContain('apps.apple.com');
    expect(payload.htmlContent).toContain('My SmartHealth');
  });

  it('names the attached manual in the body, and only when one is attached', async () => {
    arm();
    mailAttachmentsForCategory.mockResolvedValue({ attachments: [{ ...LETTER, filename: 'AHC Appointment Booking Manual.pdf' }], templateId: 't1', reason: 'ok' });
    await notifyAhcEntitlement({ packageId: 'pkg-1', userId: 7641, eventType: 'invitation', validTo: '2026-12-15' });
    let [, payload] = sendOutboundEmail.mock.calls[0];
    expect(payload.htmlContent).toContain('AHC appointment booking manual attached with this email');
    expect(payload.htmlContent).not.toContain('AHC Appointment Booking Manual.pdf');

    // Without a file the same body must not mention an attachment.
    sendOutboundEmail.mockClear();
    arm();
    mailAttachmentsForCategory.mockResolvedValue({ attachments: [], templateId: null, reason: 'no_attachments' });
    await notifyAhcEntitlement({ packageId: 'pkg-1', userId: 7641, eventType: 'invitation', validTo: '2026-12-15' });
    [, payload] = sendOutboundEmail.mock.calls[0];
    expect(payload.htmlContent).not.toMatch(/attached with this email/);
  });

  it('resolves the attachment before composing the body', async () => {
    // If the order flipped, the body could never name the file.
    const order = [];
    arm();
    mailAttachmentsForCategory.mockImplementation(async () => { order.push('resolve'); return { attachments: [LETTER], templateId: 't1', reason: 'ok' }; });
    sendOutboundEmail.mockImplementation(async () => { order.push('send'); return { messageId: 'm1' }; });
    await notifyAhcEntitlement({ packageId: 'pkg-1', userId: 7641, eventType: 'invitation', validTo: '2026-12-15' });
    expect(order).toEqual(['resolve', 'send']);
  });

  it('carries the process steps and the care desk sign-off', async () => {
    arm();
    mailAttachmentsForCategory.mockResolvedValue({ attachments: [], templateId: null, reason: 'no_attachments' });
    await notifyAhcEntitlement({ packageId: 'pkg-1', userId: 7641, eventType: 'invitation', validTo: '2026-12-15' });
    const [, payload] = sendOutboundEmail.mock.calls[0];
    expect(payload.htmlContent).toContain('How to use your checkup');
    expect(payload.htmlContent).toContain('care@mysmarthealth.in');
    expect(payload.htmlContent).toContain('Team SmartHealth');
  });

  it('stays idempotent — a duplicate claim sends nothing', async () => {
    dbQuery.mockReset();
    dbQuery.mockImplementationOnce(async () => []);
    const result = await notifyAhcEntitlement({ packageId: 'pkg-1', userId: 7641, eventType: 'invitation', validTo: '2026-12-15' });
    expect(result).toEqual({ sent: false, duplicate: true });
    expect(sendOutboundEmail).not.toHaveBeenCalled();
    expect(mailAttachmentsForCategory).not.toHaveBeenCalled();
  });

  it('reads the employer name from corporates, not from the package table', async () => {
    // corporate_health_package_catalog has no "corporateName" column; selecting
    // one threw 42703 on every send and the notifications table stayed empty.
    arm();
    mailAttachmentsForCategory.mockResolvedValue({ attachments: [], templateId: null, reason: 'no_attachments' });
    await notifyAhcEntitlement({ packageId: 'pkg-1', userId: 7641, eventType: 'invitation', validTo: '2026-12-15' });
    const [memberSql] = dbQuery.mock.calls.find(([sql]) => /FROM users u/.test(sql));
    expect(memberSql).toContain('LEFT JOIN corporates c ON c.id=p.corporate_id');
    expect(memberSql).toContain('c."companyName" AS "corporateName"');
    expect(memberSql).not.toContain('p."corporateName"');
  });

  it('releases the claim when the member lookup fails, so a retry can still send', async () => {
    // Claiming first gives idempotency, but a claim left behind after a failure
    // makes the unique guard refuse every later attempt as a duplicate — which
    // is exactly what happened to the first Equitas batch.
    dbQuery.mockReset();
    dbQuery
      .mockImplementationOnce(async () => [{ id: 11 }])                       // claim
      .mockImplementationOnce(async () => { throw new Error('column p.corporateName does not exist'); })
      .mockImplementation(async () => []);
    await expect(notifyAhcEntitlement({ packageId: 'pkg-1', userId: 7641, eventType: 'invitation', validTo: '2026-12-15' }))
      .rejects.toThrow(/corporateName/);
    const release = dbQuery.mock.calls.find(([sql]) => /DELETE FROM corporate_ahc_entitlement_notifications/.test(sql));
    expect(release).toBeDefined();
    expect(release[1].replacements).toEqual({ id: 11 });
    expect(sendOutboundEmail).not.toHaveBeenCalled();
  });

  it('releases the claim when the member row is missing', async () => {
    arm(null);
    const result = await notifyAhcEntitlement({ packageId: 'pkg-1', userId: 7641, eventType: 'invitation', validTo: '2026-12-15' });
    expect(result).toEqual({ sent: false, missing: true });
    expect(dbQuery.mock.calls.some(([sql]) => /DELETE FROM corporate_ahc_entitlement_notifications/.test(sql))).toBe(true);
  });

  it('does not lose a delivered send when the status row cannot be written', async () => {
    // The status column was VARCHAR(20) while the code writes a 25-character
    // value, so this UPDATE threw AFTER five real employees had been emailed.
    arm();
    mailAttachmentsForCategory.mockResolvedValue({ attachments: [LETTER], templateId: 't1', reason: 'ok' });
    dbQuery.mockImplementation(async (sql) => {
      if (/UPDATE corporate_ahc_entitlement_notifications/.test(sql)) throw new Error('value too long for type character varying(20)');
      return [];
    });
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const result = await notifyAhcEntitlement({ packageId: 'pkg-1', userId: 7641, eventType: 'invitation', validTo: '2026-12-15' });
    expect(sendOutboundEmail).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ sent: true, emailStatus: 'sent' });   // the send is still reported
    expect(error).toHaveBeenCalledWith(expect.stringContaining('SENT but NOT RECORDED'));
    error.mockRestore();
  });

  it('clamps a status value to what the column holds', async () => {
    arm();
    mailAttachmentsForCategory.mockResolvedValue({ attachments: [], templateId: null, reason: 'no_attachments' });
    await notifyAhcEntitlement({ packageId: 'pkg-1', userId: 7641, eventType: 'invitation', validTo: '2026-12-15' });
    const update = dbQuery.mock.calls.find(([sql]) => /UPDATE corporate_ahc_entitlement_notifications/.test(sql));
    expect(update[1].replacements.emailStatus.length).toBeLessThanOrEqual(40);
    expect(update[1].replacements.whatsappStatus.length).toBeLessThanOrEqual(40);
  });

  it('reports a provider failure instead of throwing', async () => {
    arm();
    mailAttachmentsForCategory.mockResolvedValue({ attachments: [LETTER], templateId: 't1', reason: 'ok' });
    sendOutboundEmail.mockRejectedValue(new Error('SMTP 554'));
    const result = await notifyAhcEntitlement({ packageId: 'pkg-1', userId: 7641, eventType: 'invitation', validTo: '2026-12-15' });
    expect(result).toMatchObject({ sent: false, emailStatus: 'failed' });
  });
});
