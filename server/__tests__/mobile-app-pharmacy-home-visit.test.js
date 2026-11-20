import { readFileSync } from 'node:fs';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const poolQuery = jest.fn();
const familyQuery = jest.fn();
const validateOrderCoupon = jest.fn();
const recordCouponUsage = jest.fn();

// Member pricing is not under test here (individual-plan-lineup.test.js): treat the caller as a member.
jest.unstable_mockModule('../middleware/membership.middleware.js', () => ({ isPaidMember: async () => true }));
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query: poolQuery } }));
jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
  authUser: (req, _res, next) => { req.user = { id: 41 }; next(); },
}));
jest.unstable_mockModule('../middleware/rls-context.middleware.js', () => ({
  withRlsTransaction: async (_pool, context, work) => {
    expect(context).toEqual({ orgId: 0, userId: 41 });
    return work({ query: familyQuery });
  },
}));
jest.unstable_mockModule('../services/minio-upload.service.js', () => ({ uploadToMinio: jest.fn() }));
jest.unstable_mockModule('../services/coupon-validation.service.js', () => ({
  COUPON_SCOPES: { PHARMACY_PURCHASE: 'pharmacy' }, validateOrderCoupon, recordCouponUsage,
}));

const { default: router } = await import('../routes/patient-pharmacy-orders.route.js');
const { describePack } = await import('../utils/pharmacy-pricing.js');
const { slotServesConsultation } = await import('../utils/doctorConsultationCapability.js');
const { DEMO_BLOCKED_REQUESTS } = await import('../middleware/demo-account-guard.middleware.js');

const app = express();
app.use(express.json());
app.use('/api/pharmacy-orders', router);

const MEDICINE = {
  id: 7, name: 'Example 500', brand_name: 'Example 500', generic_name: 'Example', strength: '500mg', form: 'Tablet',
  manufacturer: 'Maker', mrp: '1200.00', selling_price: '1200.00', unit_price: '1200.00',
  pack_size: 'strip of 10 tablets', schedule: 'H',
};
const ITEMS = [{ medicine_id: 7, medicine_name: 'Example 500', quantity: 2 }];
let inserted;

beforeEach(() => {
  inserted = null;
  familyQuery.mockReset();
  validateOrderCoupon.mockReset();
  recordCouponUsage.mockReset();
  poolQuery.mockReset();
  poolQuery.mockImplementation(async (sql, params) => {
    if (/FROM pharmacy_medicines/.test(sql)) return { rows: [{ ...MEDICINE, schedule: 'OTC' }] };
    if (/FROM users/.test(sql)) return { rows: [{ firstName: 'Asha', lastName: 'Rao' }] };
    if (/INSERT INTO patient_pharmacy_orders/.test(sql)) {
      inserted = params;
      return { rows: [{ order_id: 9, patient: JSON.parse(params[14]) }] };
    }
    return { rows: [] };
  });
});

describe('medicine quote', () => {
  it('returns the amounts an order is billed without placing it', async () => {
    const res = await request(app).post('/api/pharmacy-orders/quote').send({ items: ITEMS, delivery_charge: 0, discount: 999 });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      subtotal: 2400, delivery_charge: 40, discount: 360, discount_type: 'automatic', total_amount: 2080, currency: 'INR',
    });
    expect(inserted).toBeNull();
  });

  it('applies the larger offer and never uses up the coupon', async () => {
    validateOrderCoupon.mockResolvedValue({ discount: 500, coupon: { code: 'SAVE500' } });
    const res = await request(app).post('/api/pharmacy-orders/quote').send({ items: ITEMS, coupon_code: 'SAVE500' });
    expect(res.body.data).toMatchObject({ discount: 500, discount_type: 'coupon', coupon_code: 'SAVE500', total_amount: 1940 });
    expect(recordCouponUsage).not.toHaveBeenCalled();
  });
});

describe('patient on a medicine order', () => {
  const place = (extra = {}) => request(app).post('/api/pharmacy-orders').send({
    items: ITEMS, delivery_type: 'store_pickup', ...extra,
  });

  it('defaults to the account holder', async () => {
    const res = await place();
    expect(res.status).toBe(201);
    expect(res.body.data.patient).toEqual({ type: 'self', family_member_id: null, name: 'Asha Rao', relationship: 'self' });
  });

  it('stores the chosen family member', async () => {
    familyQuery.mockResolvedValue({ rows: [{ id: 5, firstName: 'Ravi', lastName: 'Rao', relationship: 'father' }] });
    const res = await place({ family_member_id: '5' });
    expect(res.status).toBe(201);
    expect(res.body.data.patient).toEqual({ type: 'family_member', family_member_id: 5, name: 'Ravi Rao', relationship: 'father' });
    expect(familyQuery.mock.calls[0][1]).toEqual([5, 41]);
  });

  it('refuses a family member who is not on this account', async () => {
    familyQuery.mockResolvedValue({ rows: [] });
    const res = await place({ family_member_id: 6 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('FAMILY_MEMBER_NOT_FOUND');
    expect(inserted).toBeNull();
  });
});

describe('catalogue, home visits and demo guard', () => {
  it('describes bare pack counts without changing real descriptions', () => {
    expect(describePack('10', 'Tablet')).toBe('Pack of 10 tablets');
    expect(describePack('1', 'Capsule')).toBe('Pack of 1 capsule');
    expect(describePack('30', 'Syrup')).toBe('Pack of 30');
    expect(describePack('strip of 15 tablets', null)).toBe('Strip of 15 tablets');
    expect(describePack('', 'Tablet')).toBeNull();
  });

  it('lets in-person hours serve home visits only', () => {
    expect(slotServesConsultation({ consultationType: 'walkIn' }, 'homeVisit')).toBe(true);
    expect(slotServesConsultation({ consultationType: 'both' }, 'homeVisit')).toBe(true);
    expect(slotServesConsultation({ consultationType: 'online' }, 'homeVisit')).toBe(false);
    expect(slotServesConsultation({ consultationType: 'walkIn' }, 'online')).toBe(false);
  });

  it('requires a visit address and keeps the doctor settings in step', () => {
    const booking = readFileSync(new URL('../routes/enhanced-appointment.route.js', import.meta.url), 'utf8');
    const settings = readFileSync(new URL('../routes/doctor.enhanced.route.js', import.meta.url), 'utf8');
    expect(booking).toContain('HOME_VISIT_ADDRESS_REQUIRED');
    expect(settings).toContain('available: doctor.offersHomeVisits === true');
  });

  it.each([
    '/api/membership/addons/12/payment-order',
    '/api/membership/addons/12/enroll',
    '/api/membership-plans/enroll',
  ])('blocks %s for the demo login', (path) => {
    expect(DEMO_BLOCKED_REQUESTS.some(([methods, pattern]) => methods.test('POST') && pattern.test(path))).toBe(true);
  });
});
