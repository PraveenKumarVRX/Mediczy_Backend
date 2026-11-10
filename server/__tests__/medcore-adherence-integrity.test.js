import { jest } from '@jest/globals';

const query = jest.fn();
const send = jest.fn();

jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query } }));
jest.unstable_mockModule('../services/notification.service.js', () => ({ default: { send } }));

const {
  createAdherencePlan,
  materializeAdherenceEvents,
  runDueAdherenceEvents,
  deliverApprovedLabExplanation,
} = await import('../services/medcore-adoption.service.js');

beforeEach(() => {
  query.mockReset();
  send.mockReset();
});

describe('adherence occurrence integrity', () => {
  it('rejects an unscheduled plan before writing a misleading successful plan', async () => {
    await expect(createAdherencePlan({ patientId: 12, medication: { name: 'Metformin' }, schedule: {} }))
      .rejects.toMatchObject({ statusCode: 422 });
    expect(query).not.toHaveBeenCalled();
  });

  it('materializes stable, unique daily occurrence keys in the selected timezone', async () => {
    query.mockResolvedValue({ rows: [{ id: 42 }] });
    const rows = await materializeAdherenceEvents({
      id: 9,
      tenant_uid: 'hospital:3',
      schedule: { timeZone: 'Asia/Kolkata', startDate: '2026-11-08', endDate: '2026-11-09', times: ['08:00', '20:00'] },
    });
    expect(rows).toHaveLength(4);
    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls[0][0]).toContain('ON CONFLICT (tenant_uid, plan_id, occurrence_key)');
    expect(query.mock.calls[0][1][3]).toBe('2026-11-08T08:00');
    expect(query.mock.calls[3][1][3]).toBe('2026-11-09T20:00');
  });

  it('claims due events with SKIP LOCKED before delivery, preventing concurrent workers from sending the same event', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 44, tenant_uid: 'hospital:3', claim_token: 'claim', patient_id: 72, channel: 'whatsapp', language: 'en', medication: { name: 'Metformin' }, quiet_hours: {}, occurrence_key: '2026-11-08T08:00' }] })
      .mockResolvedValueOnce({ rows: [] });
    send.mockResolvedValue({ success: true, notificationId: 'provider-44', channels: { whatsapp: { success: true } } });

    const result = await runDueAdherenceEvents({ now: new Date('2026-11-08T08:00:00.000Z'), limit: 1, tenantUid: 'hospital:3' });
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('sent');
    expect(query.mock.calls[0][0]).toContain('FOR UPDATE OF e SKIP LOCKED');
    expect(query.mock.calls[0][0]).toContain("SET status = 'processing'");
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventId: 'adherence:hospital:3:44', adherenceEventId: 44, adherenceOccurrenceKey: '2026-11-08T08:00' }) }));
  });

  it('defers an overnight quiet-hours event to the next local quiet-window end without sending it', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 45, claim_token: 'claim', patient_id: 72, channel: 'whatsapp', language: 'en', medication: { name: 'Metformin' }, quiet_hours: { startHour: 22, endHour: 7, timeZone: 'Asia/Kolkata' } }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await runDueAdherenceEvents({ now: new Date('2026-11-08T18:00:00.000Z'), limit: 1, tenantUid: 'hospital:3' });
    expect(result[0]).toMatchObject({ status: 'deferred', deliveryDeferred: true });
    expect(result[0].nextAttemptAt.toISOString()).toBe('2026-11-09T01:30:00.000Z');
    expect(send).not.toHaveBeenCalled();
    expect(query.mock.calls[1][0]).toContain("SET status = 'deferred'");
  });

  it('claims a lab explanation before notification delivery and uses a stable notification event key', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 61, patient_id: 72, draft: 'Reviewed explanation' }] })
      .mockResolvedValueOnce({ rows: [{ id: 61, delivered_at: '2026-11-08T09:00:00.000Z' }] });
    send.mockResolvedValue({ success: true, notificationId: 'provider-61', channels: { whatsapp: { success: true } } });

    const result = await deliverApprovedLabExplanation({ draftId: 61, tenantUid: 'hospital:3', actorId: 8, privileged: true });
    expect(result.draft.id).toBe(61);
    expect(query.mock.calls[0][0]).toContain('delivery_claim_token');
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ data: { eventId: 'lab-explainer:hospital:3:61', labExplainerDraftId: 61 } }));
  });

  it('does not call the provider when another worker already owns the lab delivery claim', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(deliverApprovedLabExplanation({ draftId: 61, tenantUid: 'hospital:3', actorId: 8, privileged: true }))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(send).not.toHaveBeenCalled();
  });
});
