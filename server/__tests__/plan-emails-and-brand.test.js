import { readFileSync } from 'node:fs';
import { jest } from '@jest/globals';

// Plan purchase emails + My SmartHealth branding (owner rule, 2026-11-22).

let prior = 0;
jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({
  postgresSequelize: { query: jest.fn(async () => [{ n: prior }]), QueryTypes: { SELECT: 'SELECT' } },
}));
const sendTransactionalEmail = jest.fn(async () => ({ success: true }));
jest.unstable_mockModule('../services/welcome-email.service.js', () => ({ sendTransactionalEmail }));
const notifyMembershipPurchase = jest.fn(async () => {});
jest.unstable_mockModule('../services/purchase-notification.service.js', () => ({ default: { notifyMembershipPurchase } }));

const { onPlanActivated, buildWelcomeEmail, planHighlights } = await import('../services/plan-emails.service.js');
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const user = { id: 42, firstName: 'Asha', lastName: 'Rao', email: 'asha@example.org', phoneNumber: '9000000001' };
const plan = { id: 45, name: 'One', benefits: ['4 doctor consultations a year', 'Annual health check-up'], features: {} };
const userPlan = { id: 900, startDate: '2026-11-22', endDate: '2027-11-22', paidAmount: '999.00' };

beforeEach(() => { prior = 0; sendTransactionalEmail.mockClear(); notifyMembershipPurchase.mockClear(); });

describe('plan activation emails', () => {
  test('a first paid plan gets the payment receipt and the welcome email from My SmartHealth', async () => {
    const out = await onPlanActivated({ user, plan, userPlan, paymentId: 'pay_1', amount: 999, kind: 'subscribe' });
    expect(out).toEqual({ receipt: true, welcome: true });
    expect(notifyMembershipPurchase).toHaveBeenCalledWith(expect.objectContaining({ amountDue: 999, kind: 'subscribe', payment: { paymentId: 'pay_1', method: 'razorpay' } }));
    const mail = sendTransactionalEmail.mock.calls[0][0];
    expect(mail).toMatchObject({ to: 'asha@example.org', fromName: 'My SmartHealth', provider: 'ses', subject: 'Welcome to My SmartHealth, Asha' });
    expect(mail.html).toContain('care@mysmarthealth.in');
    expect(mail.html).toContain('One');
    expect(mail.html).toContain('Annual health check-up');
    expect(mail.html).toContain('22 November 2026');
    expect(mail.html).not.toMatch(/Medi[cq]zy/);
  });

  test('a second plan gets the receipt but no second welcome', async () => {
    prior = 1;
    expect(await onPlanActivated({ user, plan, userPlan, paymentId: 'pay_2', amount: 999 })).toEqual({ receipt: true, welcome: false });
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  test('a free coupon plan gets no receipt; a placeholder address gets no email', async () => {
    expect(await onPlanActivated({ user, plan, userPlan, amount: 0, kind: 'coupon' })).toEqual({ receipt: false, welcome: true });
    expect(notifyMembershipPurchase).not.toHaveBeenCalled();
    sendTransactionalEmail.mockClear();
    expect(await onPlanActivated({ user: { ...user, email: 'noemail.103761@mediczy.in' }, plan, userPlan, amount: 0 })).toEqual({ receipt: false, welcome: false });
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  test('an email failure never throws back into the activation', async () => {
    sendTransactionalEmail.mockRejectedValueOnce(new Error('SES down'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(onPlanActivated({ user, plan, userPlan, amount: 0 })).resolves.toEqual({ receipt: false, welcome: false });
    spy.mockRestore();
  });

  test('highlights come from the benefits list, else from enabled features', () => {
    expect(planHighlights(plan)).toEqual(['4 doctor consultations a year', 'Annual health check-up']);
    expect(planHighlights({ benefits: [], features: { teleConsult: 4, labDiscount: true, gym: false } })).toEqual(['Tele Consult: 4', 'Lab Discount']);
    expect(buildWelcomeEmail({ user: { firstName: '' }, plan: { name: 'Start' }, userPlan: {} }).subject).toBe('Welcome to My SmartHealth, there');
  });
});

describe('wiring', () => {
  test('subscribe and coupon activations send the plan emails; receipts are branded and labelled', () => {
    const route = read('routes/membership.route.js');
    expect(route).toContain("void onPlanActivated({ user: req.user, plan, userPlan, paymentId: verifiedPaymentId");
    expect(route).toContain("void onPlanActivated({ user, plan, userPlan, amount: 0, kind: 'coupon' });");
    const receipts = read('services/purchase-notification.service.js');
    expect(receipts).not.toMatch(/Medi[cq]zy/);
    expect(receipts).toContain("subjectNoun: 'payment receipt'");
  });

  test('the Razorpay checkout says My SmartHealth', () => {
    expect(read('services/payment.service.js')).toMatch(/name: BRAND_NAME,/);
  });
});

describe('My SmartHealth branding in member email', () => {
  const files = ['services/purchase-notification.service.js', 'services/password-reset.service.js', 'services/signup-verification.service.js',
    'services/email.service.js', 'services/notification.service.js', 'templates/emails/welcome-email.html', 'templates/emails/forgot-password-email.html',
    'routes/admin/pending-registrations.route.js', 'routes/superadmin-clinic.routes.js', 'routes/prescription.route.js'];
  test.each(files)('%s has no Mediqzy/Mediczy in email copy and no @mediqzy.com sender or contact', (f) => {
    const lines = read(f).split('\n').filter((l) => !/^\s*(\*|\/\/)|X-Mediqzy|senderId|SMS_SENDER_ID|DLT|admin@mediczy\.com|smsMessage|sendSMS|message: `Mediczy:/.test(l));
    expect(lines.filter((l) => /Medi[cq]zy|@medi[cq]zy\.com/.test(l))).toEqual([]);
  });

  test('SMS wording stays as registered with the telecom regulator (DLT)', () => {
    expect(read('services/password-reset.service.js')).toContain('`Your Mediczy password reset OTP is: ${otpCode}.');
    expect(read('services/notification.service.js')).toContain('message: `Mediczy: ${message}`');
  });

  test('a Mediqzy sender name is rewritten on the way out', () => {
    expect(read('services/welcome-email.service.js')).toContain(`replace(/"?Medi[cq]zy[^"<]*"?\\s*(?=<)/i, '"My SmartHealth" ')`);
  });
});

describe('member notification email', () => {
  test('goes through the shared SES path as My SmartHealth (hello@), not the dead Brevo login or noreply@mediqzy.com', () => {
    const src = read('services/notification.service.js');
    const body = src.slice(src.indexOf('async sendEmail(userId'), src.indexOf('_logChannelActivity(\n        `Email sent'));
    expect(body).toContain("sendTransactionalEmail({ ...mailOptions, fromName: 'My SmartHealth', provider: 'ses' })");
    expect(body).not.toMatch(/createTransport|SMTP_FROM|SMTP_USER/);
    expect(read('services/welcome-email.service.js')).toContain('...(attachments?.length ? { attachments } : {}),');
  });
});
