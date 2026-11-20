import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
const query = jest.fn();
let user = { id: 1, role: 'user' };
const tx = { commit: jest.fn(), rollback: jest.fn() };
// Dates are not under test here (see checkup-closed-days.test.js): every date is open.
jest.unstable_mockModule('../services/checkup-calendar.service.js',()=>({checkupDateBlock:async()=>null,closedDates:async()=>[],isSunday:()=>false}));
jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({ authUser: (req, res, next) => { req.user = user; next(); } }));
jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({ postgresSequelize: { query, QueryTypes: { SELECT: 'SELECT' }, transaction: async () => tx } }));
jest.unstable_mockModule('../services/payment-gateway.service.js', () => ({ default: { verifyRazorpaySignature: () => true, createRazorpayOrder: async () => ({ orderId: 'order-1', amount: 50, currency: 'INR' }) } }));
jest.unstable_mockModule('../services/emailService.js', () => ({ default: { sendOutboundEmail: jest.fn() } }));
jest.unstable_mockModule('../services/whatsapp-production.service.js', () => ({ default: { configured: false } }));
const { default: router } = await import('../routes/health-checkup.route.js');
const app = express();
app.use(express.json());
app.use(router);
beforeEach(() => { query.mockReset(); tx.commit.mockResolvedValue(); tx.rollback.mockResolvedValue(); user = { id: 1, role: 'user' }; });
test.each(['2026-02-30', 'abc', '2020-01-01', '2026-10-25junk'])('rejects invalid/past slot date %s before SQL', async (date) => { expect((await request(app).get('/slots').query({ date, labId: 1 })).status).toBe(400); expect(query).not.toHaveBeenCalled(); });
test('requires a lab ID before SQL', async () => { expect((await request(app).get('/slots?date=2099-01-01')).status).toBe(400); expect(query).not.toHaveBeenCalled(); });
test.each([{ role: 'admin' }, { role: 'user', isTeam: true }, { role: 'lab' }])('operational accounts cannot read employee benefits %j', async (identity) => { user = { id: 1, ...identity }; expect((await request(app).get('/packages')).status).toBe(403); expect(query).not.toHaveBeenCalled(); });
test('uses actual subscription column names for personal packages', async () => { query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 5, name: 'Health', features: { tests: ['CBC'] }, price: 50 }]); const r = await request(app).get('/packages'); expect(r.status).toBe(200); expect(r.body.packages[0].price).toBe(50); expect(query.mock.calls[1][0]).toContain('is_active=true'); expect(query.mock.calls[1][0]).toContain('annual_price'); });
test('cancellation returns the SQL row instead of a nested row array', async () => { query.mockResolvedValueOnce([{ id: 5, status: 'cancelled', package_id: 'p1' }]); const r = await request(app).post('/bookings/5/cancel').send({}); expect(r.status).toBe(200); expect(r.body.booking).toMatchObject({ id: '5', status: 'cancelled' }); expect(query.mock.calls[0][1].type).toBe('SELECT'); });
test.each(['/bookings/5/payment', '/bookings/5/payment/verify'])('cancelled bookings cannot be paid or revived: %s', async (endpoint) => { query.mockResolvedValueOnce([{ id: 5, status: 'cancelled', payment_amount: 50 }]); const r = await request(app).post(endpoint).send({}); expect(r.status).toBe(409); expect(query).toHaveBeenCalledTimes(1); });
test('missing member booking stays isolated', async () => { query.mockResolvedValueOnce([]); const r = await request(app).get('/bookings/999'); expect(r.status).toBe(404); expect(query.mock.calls[0][1].replacements.userId).toBe(1); });
test('booking returns its saved confirmation row', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 5, name: 'Health', features: { tests: ['CBC'] }, price: 0 }])
        .mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 2, name: 'Lab', metadata: { healthCheckupSlots: ['09:00'] } }])
        .mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 8, status: 'confirmed', booking_reference: 'HC-8', package_id: '5', lab_id: 2 }]);
    const r = await request(app).post('/bookings').send({ packageId: '5', labId: 2, relation:'self', date: '2099-01-01', timeSlot: '09:00', patient: { name: 'Patient', phone: '9999999999' } });
    expect(r.status).toBe(201);
    expect(r.body.booking.id).toBe('8');
    expect(r.body.confirmation.bookingReference).toBe('HC-8');
});
test('reschedule returns the updated booking row', async () => {
    query.mockResolvedValueOnce([{ id: 8, status: 'confirmed', lab_id: 2 }]).mockResolvedValueOnce([{ id: 8, status: 'confirmed', lab_id: 2 }]).mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 2, metadata: { healthCheckupSlots: ['09:00'] } }]).mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 8, status: 'rescheduled', lab_id: 2, appointment_date: '2099-01-01', time_slot: '09:00' }]);
    const r = await request(app).post('/bookings/8/reschedule').send({ date: '2099-01-01', timeSlot: '09:00' });
    expect(r.status).toBe(200);
    expect(r.body.booking).toMatchObject({ id: '8', status: 'rescheduled', date: '2099-01-01' });
});
test('verified payment returns its confirmed booking row', async () => {
    query.mockResolvedValueOnce([{ id: 8, status: 'payment_pending', payment_order_id: 'order-1' }]).mockResolvedValueOnce([{ id: 8, status: 'confirmed', payment_status: 'paid' }]);
    const r = await request(app).post('/bookings/8/payment/verify').send({ razorpayOrderId: 'order-1', razorpayPaymentId: 'payment-1', razorpaySignature: 'valid' });
    expect(r.status).toBe(200);
    expect(r.body.booking).toMatchObject({ id: '8', status: 'confirmed', payment: { status: 'paid' } });
});

test.each([undefined,'uncle','parent-in-law'])('rejects invalid beneficiary relation %s before SQL',async relation=>{expect((await request(app).post('/bookings').send({packageId:'5',labId:2,relation,date:'2099-01-01',timeSlot:'09:00',patient:{name:'Patient',phone:'9999999999'}})).status).toBe(400);expect(query).not.toHaveBeenCalled();});

describe('health-checkup production path fencing',()=>{
  let fenced,secret,jwt;
  beforeAll(async()=>{
    const {default:fence}=await import('../middleware/ringFencing.js');
    ({SECRET:secret}=(await import('../config/auth.config.js')).JWT_CONFIG);
    ({default:jwt}=await import('jsonwebtoken'));
    fenced=express();fenced.use(fence);fenced.use((_req,res)=>res.json({ok:true}));
  });
  test.each(['user','patient','employee'])('allows member role %s through the global API fence',async role=>{
    const token=jwt.sign({id:1,userType:role,role},secret);
    expect((await request(fenced).get('/api/health-checkups/packages').set('Authorization',`Bearer ${token}`)).status).toBe(200);
  });
});
