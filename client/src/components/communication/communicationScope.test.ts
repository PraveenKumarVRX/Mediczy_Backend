import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), resolve: vi.fn(), email: vi.fn() }));
vi.mock('../../../../server/db/pgPool.js', () => ({ default: { query: mocks.query } }));
vi.mock('../../../../server/services/welcome-email.service.js', () => ({ sendTransactionalEmail: mocks.email }));
vi.mock('../../../../server/services/whatsapp-production.service.js', () => ({ default: {} }));
vi.mock('../../../../server/services/sms.service.js', () => ({ SMSService: {} }));
vi.mock('../../../../server/services/crm-v2-sync.service.js', () => ({ resolveV2LeadByLegacyId: mocks.resolve, CRM_V2_DEFAULT_TENANT_ID: 1 }));
import { sendCrmMessage, listCrmCallActivity, listCrmCommunicationLog } from '../../../../server/services/hospital-crm-communication-hub.service.js';
beforeEach(() => { vi.resetAllMocks(); mocks.query.mockResolvedValue({ rows: [] }); mocks.resolve.mockResolvedValue(null); });
describe('communication tenant scope', () => {
  it('rejects missing tenant identity before reading', async () => {
    await expect(listCrmCallActivity({})).rejects.toMatchObject({ statusCode: 403 });
    await expect(listCrmCommunicationLog({ tenantId: 70 })).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it('filters calls and legacy history by tenant UID', async () => {
    await listCrmCallActivity({ tenantUid: 'MEDSTAR' });
    await listCrmCommunicationLog({ tenantUid: 'MEDSTAR', tenantId: 70 });
    for (const [sql, params] of mocks.query.mock.calls) {
      expect(sql).toContain('a.tenant_uid=$1'); expect(params[0]).toBe('MEDSTAR');
    }
  });
  it.each(['leadId', 'dealId', 'contactId'])('rejects a foreign %s before provider dispatch', async field => {
    await expect(sendCrmMessage({ channel: 'email', message: 'hello', [field]: 99, userId: 5, tenantId: 70, tenantUid: 'MEDSTAR' })).rejects.toMatchObject({ statusCode: 404 });
    const [sql, params] = mocks.query.mock.calls[0];
    expect(sql).toContain('tenant_uid = $2'); expect(params).toEqual([99, 'MEDSTAR']); expect(mocks.email).not.toHaveBeenCalled();
    if (field === 'leadId') expect(mocks.resolve).toHaveBeenCalledWith(99, 70);
  });
  it('preserves own contact send and tenant-scoped activity logging', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: 99, name: 'Owned contact', email: 'owned@example.test' }] }).mockResolvedValue({ rows: [] });
    mocks.email.mockResolvedValue({});
    const result = await sendCrmMessage({ channel: 'email', message: 'hello', contactId: 99, userId: 5, tenantId: 70, tenantUid: 'MEDSTAR' });
    expect(result.status).toBe('sent'); expect(mocks.email).toHaveBeenCalledOnce();
    const [sql, params] = mocks.query.mock.calls[1]; expect(sql).toContain('tenant_uid'); expect(params.at(-1)).toBe('MEDSTAR');
  });
});
