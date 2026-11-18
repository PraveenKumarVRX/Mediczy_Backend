import { readFileSync } from 'node:fs';
import { jest } from '@jest/globals';

const dbQuery = jest.fn();
const sendMail = jest.fn();
const sesSend = jest.fn();
const mailAttachmentsForTemplate = jest.fn();

jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({
  postgresSequelize: { query: dbQuery, QueryTypes: { SELECT: 'SELECT', INSERT: 'INSERT', UPDATE: 'UPDATE' } },
}));
jest.unstable_mockModule('../integrations/nodemailer.js', () => ({
  default: { createTransport: () => ({ sendMail }), createTransporter: () => ({ sendMail }) },
}));

jest.unstable_mockModule('../integrations/ses.js', () => ({
  SESv2Client: class { send(command) { return sesSend(command.input); } },
  SendEmailCommand: class { constructor(input) { this.input = input; } },
}));
jest.unstable_mockModule('../services/team-email-template-attachments.service.js', () => ({
  mailAttachmentsForTemplate,
}));

const service = await import('../services/welcome-email.service.js');
const { MISSING_AHC_ENTITLEMENT_MESSAGE, buildCorporateEmployeeTemplateVars } =
  await import('../services/welcome-email-template.util.js');

const templateHtml = readFileSync(new URL('../templates/emails/equitas-ahc-welcome.html', import.meta.url), 'utf8');
const adminRoute = readFileSync(new URL('../routes/admin.route.js', import.meta.url), 'utf8');
const SUBJECT = 'Your Complimentary Health Checkup | Book by {{ahcValidUntil}}';
const EMPLOYEE = {
  userId: 41, email: 'asha@example.invalid', firstName: 'Asha', lastName: 'Rao',
  companyName: 'Example Bank', employeeId: 'E1',
};

const arm = (entitlement, corporateUid = 'C9TV9Y') => {
  dbQuery.mockReset();
  sendMail.mockReset();
  sesSend.mockReset();
  mailAttachmentsForTemplate.mockReset();
  dbQuery.mockImplementation(async (sql) => {
    if (sql.includes('email_event_assignments')) return [{ subject: SUBJECT, html_content: templateHtml }];
    if (sql.includes('user_health_packages')) return entitlement ? [entitlement] : [];
    if (sql.includes('FROM corporates')) return [{ unique_id: corporateUid }];
    return [];
  });
};

describe('corporate welcome email with a health checkup expiry date', () => {
  test('uses the employee\'s own expiry date and credentials', async () => {
    arm({ packageName: 'Example AHC', validUntil: '27/12/2026' });
    const msg = await service.buildCorporateEmployeeWelcomeEmail(EMPLOYEE, 'Temp-Pass$&1', { teamUserId: 9, corporateId: 5 });

    expect(msg.subject).toBe('Your Complimentary Health Checkup | Book by 27/12/2026');
    expect(msg.html).toContain('Dear Asha Rao,');
    expect(msg.html).toContain('>E1</td>');
    expect(msg.html).toContain('27/12/2026');
    expect(msg.html).toContain('Temp-Pass$&1');
    expect(msg.html).not.toMatch(/\{\{\s*\w+\s*\}\}/);
    expect(msg.missingAhcEntitlement).toBeUndefined();

    const lookup = dbQuery.mock.calls.find(([sql]) => sql.includes('user_health_packages'));
    expect(lookup[1].replacements).toEqual({ userId: 41, corporateId: 5 });
  });

  test('Equitas employee mail comes from the care desk, other corporates are unchanged', async () => {
    arm({ packageName: 'Example AHC', validUntil: '27/12/2026' });
    const equitas = await service.buildCorporateEmployeeWelcomeEmail(EMPLOYEE, 'x', { corporateId: 5 });
    expect(equitas.from).toEqual({ email: 'care@mysmarthealth.in', name: 'My SmartHealth' });
    const reminder = await service.buildCorporateEmployeeReminderEmail(EMPLOYEE, 'x', { corporateId: 5 });
    expect(reminder.from.email).toBe('care@mysmarthealth.in');

    arm({ packageName: 'Example AHC', validUntil: '27/12/2026' }, 'C0THER');
    const other = await service.buildCorporateEmployeeWelcomeEmail(EMPLOYEE, 'x', { corporateId: 49 });
    expect(other.from.email).not.toBe('care@mysmarthealth.in');
  });

  test('the Equitas welcome carries the stored guide and is not sent without it', async () => {
    arm({ packageName: 'Example AHC', validUntil: '27/12/2026' });
    const file = { filename: 'guide.pdf', contentType: 'application/pdf', content: Buffer.from('%PDF') };
    mailAttachmentsForTemplate.mockResolvedValue([file]);
    const msg = await service.buildCorporateEmployeeWelcomeEmail(EMPLOYEE, 'x', { corporateId: 5 });
    await service.sendPreparedCorporateEmployeeWelcomeEmail({ ...msg, to: EMPLOYEE.email }, { provider: 'ses' });

    const sent = sesSend.mock.calls[0][0];
    expect(sent.FromEmailAddress).toContain('care@mysmarthealth.in');
    expect(sent.Content.Simple.Attachments).toEqual([expect.objectContaining({
      FileName: 'guide.pdf', ContentType: 'application/pdf', ContentDisposition: 'ATTACHMENT', RawContent: file.content,
    })]);

    sesSend.mockClear();
    mailAttachmentsForTemplate.mockResolvedValue([]);
    await expect(service.sendPreparedCorporateEmployeeWelcomeEmail({ ...msg, to: EMPLOYEE.email }, { provider: 'ses' }))
      .rejects.toThrow('attachment');
    expect(sesSend).not.toHaveBeenCalled();

    const reminder = await service.buildCorporateEmployeeReminderEmail(EMPLOYEE, 'x', { corporateId: 5 });
    expect(reminder.attachmentTemplateId).toBeUndefined();
  });

  test('never sends a blank date when the employee has no open checkup', async () => {
    arm(null);
    const msg = await service.buildCorporateEmployeeWelcomeEmail(EMPLOYEE, 'x', { corporateId: 5 });
    expect(msg.missingAhcEntitlement).toBe(true);

    await expect(service.sendCorporateEmployeeWelcomeEmail(EMPLOYEE, 'x', { corporateId: 5 }))
      .rejects.toThrow(MISSING_AHC_ENTITLEMENT_MESSAGE);
    expect(sendMail).not.toHaveBeenCalled();
  });

  test('the template only uses placeholders the renderer fills', () => {
    const known = buildCorporateEmployeeTemplateVars(EMPLOYEE, 'x');
    const used = [...new Set(templateHtml.match(/\{\{\s*\w+\s*\}\}/g))];
    expect(used.length).toBeGreaterThan(4);
    for (const token of used) expect(known).toHaveProperty([token]);
    expect(templateHtml).not.toMatch(/<script/i);
    expect(templateHtml).not.toMatch(/\[[A-Z][^\]]*\]/);
  });

  test('the real send uses the corporate template and allows the care desk address', () => {
    const sendRoute = adminRoute.slice(adminRoute.indexOf('router.post("/corporate-employee-welcome-emails/send"'));
    const build = sendRoute.slice(sendRoute.indexOf('buildCorporateEmployeeWelcomeEmail('), sendRoute.indexOf('findMismatchedCredentialEmails('));
    expect(build).toContain('{ teamUserId, corporateId }');
    expect(build).toContain('assertAhcEntitlementForTemplate(message)');
    expect(sendRoute).toContain('attachmentTemplateId: message.attachmentTemplateId }');
    expect(adminRoute).toContain("'care@mysmarthealth.in'");
    expect(templateHtml).toContain('care@mysmarthealth.in');
  });

  test('a test send fills the new placeholders and uses the real mail path', () => {
    const route = readFileSync(new URL('../routes/welcomeEmailTemplates.route.js', import.meta.url), 'utf8');
    for (const token of ['{{ahcValidUntil}}', '{{loginUrl}}', '{{loginIdentifier}}', '{{temporaryPassword}}']) {
      expect(route).toContain(`'${token}':`);
    }
    expect(route).toContain('await sendPreparedCorporateEmployeeWelcomeEmail(');
    expect(route).not.toContain('createTransporter');
  });
});
