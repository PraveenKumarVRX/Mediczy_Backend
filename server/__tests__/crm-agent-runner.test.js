import { describe, expect, jest, test } from '@jest/globals';

const poolQuery = jest.fn();
const connect = jest.fn();
const chat = jest.fn();

jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query: poolQuery, connect } }));
jest.unstable_mockModule('../services/ai-brain/llm-provider.js', () => ({ default: { chat } }));

const { runCrmAgent, applyCrmAgentAction } = await import('../services/crm-agent/agent-runner.js');

const admin = { id: 42, role: 'admin', crmRole: 'admin', tenantId: 7, tenantUid: 'HOSP-UAT' };

describe('AgenticCRM runner safety', () => {
  test('fails closed when a read audit row cannot be written', async () => {
    chat.mockResolvedValueOnce({
      provider: 'test', content: '', toolCalls: [{ id: 'tc-1', function: { name: 'search_leads', arguments: '{}' } }],
    });
    poolQuery.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(new Error('audit database unavailable'));

    await expect(runCrmAgent({ crmUser: admin, messages: [{ role: 'user', content: 'list leads' }] }))
      .rejects.toMatchObject({ code: 'CRM_AUDIT_WRITE_FAILED' });
  });

  test('rolls back a confirmed write when its audit insert fails', async () => {
    const tx = { query: jest.fn(), release: jest.fn() };
    connect.mockResolvedValueOnce(tx);
    tx.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'proposal-1', tenant_uid: 'HOSP-UAT', actor_user_id: 42, tool_name: 'update_lead_status', args: { leadId: 9, status: 'paused' }, preview: {}, status: 'confirmed', expires_at: '2099-01-01T00:00:00Z' }] })
      .mockResolvedValueOnce({ rows: [{ id: 9, status: 'paused' }] }) // tool.apply
      .mockRejectedValueOnce(new Error('audit database unavailable')) // audit insert
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    await expect(applyCrmAgentAction({
      crmUser: admin, proposalId: 'proposal-1', toolName: 'update_lead_status', args: { leadId: 9, status: 'paused' },
    })).rejects.toMatchObject({ code: 'CRM_AUDIT_WRITE_FAILED' });
    expect(tx.query.mock.calls.at(-1)[0]).toBe('ROLLBACK');
    expect(tx.query.mock.calls.some(([sql]) => String(sql).includes('COMMIT'))).toBe(false);
    expect(tx.release).toHaveBeenCalled();
  });
});
