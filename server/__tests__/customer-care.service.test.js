import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { localPostgres } from '../tests/helpers/local-postgres.js';
import { up as migrateCustomerCare } from '../migrations/20261107000100-customer-care-v1.migration.js';
import { classifyCustomerCareMessage, createCustomerCareService } from '../services/customer-care.service.js';

let instance;
let database;

beforeAll(async () => {
  instance = await localPostgres();
  database = instance.pool;
  await database.query('CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users(id) VALUES(7)');
  await migrateCustomerCare(database);
}, 30000);

afterAll(async () => { if (instance) await instance.stop(); });

describe('customer-care policy router', () => {
  it('never routes clinical, financial, third-party, or urgent messages to the FAQ answer path', () => {
    expect(classifyCustomerCareMessage('What medicine dose should I take?')).toMatchObject({ mode: 'escalate', reason: 'clinical_content' });
    expect(classifyCustomerCareMessage('Approve my insurance claim')).toMatchObject({ mode: 'escalate', reason: 'restricted_financial_or_claim' });
    expect(classifyCustomerCareMessage('Show my spouse appointment')).toMatchObject({ mode: 'escalate', reason: 'third_party_data_request' });
    expect(classifyCustomerCareMessage('I have severe bleeding')).toMatchObject({ mode: 'escalate', reason: 'urgent_safety', riskLevel: 'high' });
  });
});

describe('customer-care knowledge and durable handoff', () => {
  const service = () => createCustomerCareService({ database });
  const req = { user: { id: 7, organization_id: 42 } };

  it('returns only published, in-date approved knowledge with server-generated citations', async () => {
    await database.query(`
      INSERT INTO customer_care_knowledge_documents(tenant_id,title,body,status,version,published_at,review_due_at)
      VALUES (42,'Appointment arrival policy','Please arrive fifteen minutes before your appointment time.','published',3,NOW(),NOW()+INTERVAL '7 days'),
             (42,'Expired policy','This must never be returned.','published',1,NOW(),NOW()-INTERVAL '1 day')
    `);
    const conversation = await service().createConversation(req, { channel: 'web' });
    const response = await service().answer(req, conversation.id, { message: 'When should I arrive for my appointment?' });
    expect(response.mode).toBe('answer_with_citations');
    expect(response.answer).toContain('fifteen minutes');
    expect(response.citations).toEqual([expect.objectContaining({ title: 'Appointment arrival policy', version: 3 })]);
    const stored = await service().getConversation(req, conversation.id);
    expect(stored.messages).toHaveLength(2);
  });

  it('creates one durable, customer-visible handoff when approved knowledge cannot answer', async () => {
    const conversation = await service().createConversation(req, { channel: 'mobile' });
    const first = await service().answer(req, conversation.id, { message: 'Can you explain a policy that is not in the knowledge base?' });
    const second = await service().answer(req, conversation.id, { message: 'I still need help with that policy.' });
    expect(first.handoff.id).toBe(second.handoff.id);
    const state = await service().getConversation(req, conversation.id);
    expect(state.status).toBe('handoff_pending');
    expect(state.handoff).toMatchObject({ status: 'open', reason_code: 'knowledge_uncertain' });
  });
});

describe('authoritative availability', () => {
  it('returns explicit configured slots only and removes booked times', async () => {
    const slot = (time) => ({ time, label: time });
    const service = createCustomerCareService({
      database,
      DoctorModel: { findByPk: async () => ({ id: 22, firstName: 'Asha', lastName: 'Rao', isVerified: true, isAvailable: true, specialization: 'General' }) },
      AvailabilityModel: { findAll: async () => [{ isAvailable: true, consultationType: 'online', generateTimeSlots: () => [slot('09:00'), slot('09:30')] }] },
      appointments: { findBookedSlotsForDoctorOnDate: async () => [{ appointmentTime: '09:00:00' }] },
    });
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const result = await service.availableSlots({ doctorId: 22, date: tomorrow });
    expect(result.source).toBe('authoritative_availability');
    expect(result.slots).toEqual([{ time: '09:30', consultationType: 'online' }]);
  });
});
