import { describe, expect, test, jest } from '@jest/globals';
import { TOOLS, toolDefinitions } from '../services/crm-agent/tool-registry.js';
import { canonicalJson, isProposalExpired, proposalMatches } from '../services/crm-agent/guardrails.js';

describe('Agentic CRM operator registry', () => {
  test('exposes the administrative tool surface without clinical tools', () => {
    expect(Object.keys(TOOLS)).toEqual(expect.arrayContaining([
      'search_leads', 'search_contacts', 'create_lead', 'search_deals', 'get_deal',
      'create_task', 'add_lead_note', 'update_deal_stage', 'get_conversation_history', 'escalate_to_human',
      'recall_agent_memory', 'remember_agent_memory',
      'bulk_update_lead_status', 'bulk_assign_leads',
    ]));
    expect(Object.keys(TOOLS).some((name) => /diagnos|triage|treat|prescrib/i.test(name))).toBe(false);
    expect(toolDefinitions().every((tool) => tool.type === 'function' && tool.function.parameters)).toBe(true);
  });

  test('write tools are preview/apply gated', () => {
    for (const [name, tool] of Object.entries(TOOLS)) {
      if (tool.write) {
        expect(tool.preview).toEqual(expect.any(Function));
        expect(tool.apply).toEqual(expect.any(Function));
      }
    }
  });

  test('memory preview rejects sensitive identifiers', async () => {
    await expect(TOOLS.remember_agent_memory.preview({ key: 'patient_phone', value: 'x' })).resolves.toEqual({ error: 'sensitive_memory_key' });
  });

  test('bulk tools reject over-sized or malformed batches before touching the database', async () => {
    const tooMany = Array.from({ length: 51 }, (_, i) => i + 1);
    await expect(TOOLS.bulk_update_lead_status.preview({ leadIds: tooMany, status: 'open' }, { pool: { query: jest.fn() }, tenantUid: 'T' })).resolves.toEqual({ error: 'lead_ids_required', max: 50 });
    await expect(TOOLS.bulk_assign_leads.preview({ leadIds: ['oops'], ownerUserId: 2 }, { pool: { query: jest.fn() }, tenantUid: 'T' })).resolves.toEqual({ error: 'invalid_args', max: 50 });
  });

  test('legacy task and conversation tools scope by tenant UID', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 4, status: 'open', channel: 'web' }] })
      .mockResolvedValueOnce({ rows: [{ id: 7 }] });
    const pool = { query };

    await TOOLS.list_tasks.handler({}, { pool, tenantUid: 'HOSP-A' });
    await TOOLS.get_conversation_history.handler({ leadId: 9 }, { pool, tenantUid: 'HOSP-A' });
    await TOOLS.escalate_to_human.preview({ conversationId: 4, reason: 'operator requested' }, { pool, tenantUid: 'HOSP-A' });
    await TOOLS.create_task.apply({ leadId: 9, title: 'Call patient', priority: 'medium' }, { pool, tenantUid: 'HOSP-A', crmUser: { id: 12 } });

    expect(query.mock.calls[0][0]).toMatch(/tenant_uid=\$1/);
    expect(query.mock.calls[0][1][0]).toBe('HOSP-A');
    expect(query.mock.calls[1][0]).toMatch(/e\.tenant_uid=\$1/);
    expect(query.mock.calls[1][1][0]).toBe('HOSP-A');
    expect(query.mock.calls[2][0]).toMatch(/tenant_uid=\$1/);
    expect(query.mock.calls[2][1][0]).toBe('HOSP-A');
    expect(query.mock.calls[3][0]).toMatch(/INSERT INTO crm_tasks \(tenant_uid/);
    expect(query.mock.calls[3][1][0]).toBe('HOSP-A');

    const createQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [{ id: 11, name: 'UAT contact' }] })
      .mockResolvedValueOnce({ rows: [{ id: 12, contact_id: 11 }] });
    await TOOLS.create_lead.apply({ name: 'UAT contact' }, { pool: { query: createQuery }, tenantUid: 'HOSP-A', crmUser: { id: 12 } });
    expect(createQuery.mock.calls[0][0]).toMatch(/INSERT INTO crm_contacts_v2 \(tenant_uid/);
    expect(createQuery.mock.calls[0][1][0]).toBe('HOSP-A');
    expect(createQuery.mock.calls[1][0]).toMatch(/INSERT INTO crm_leads_v2 \(tenant_uid/);
    expect(createQuery.mock.calls[1][1][0]).toBe('HOSP-A');
  });

  test('corporate CRM contexts add the corporate UID sub-filter to reads and writes', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [{ id: 21, status: 'open' }] })
      .mockResolvedValueOnce({ rows: [{ id: 21, status: 'paused' }] });
    const ctx = { pool: { query }, tenantUid: 'HOSP-A', corporateUid: 'CORP-A' };

    await TOOLS.bulk_update_lead_status.preview({ leadIds: [21], status: 'paused' }, ctx);
    await TOOLS.bulk_update_lead_status.apply({ leadIds: [21], status: 'paused' }, ctx);

    expect(query.mock.calls[0][0]).toMatch(/corporate_uid\s*=\s*\$3/);
    expect(query.mock.calls[0][1]).toEqual(['HOSP-A', [21], 'CORP-A']);
    expect(query.mock.calls[1][0]).toMatch(/corporate_uid\s*=\s*\$4/);
    expect(query.mock.calls[1][1]).toEqual(['HOSP-A', [21], 'paused', 'CORP-A']);
  });
});

describe('Agentic CRM proposal guardrails', () => {
  test('canonicalizes object key order and binds proposal to tenant and actor', () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe(canonicalJson({ a: 1, b: 2 }));
    const proposal = { tenant_uid: 'HOSP1', actor_user_id: 7, tool_name: 'create_task', args: { title: 'Call', leadId: 9 } };
    expect(proposalMatches(proposal, { tenantUid: 'HOSP1', actorUserId: 7, toolName: 'create_task', args: { leadId: 9, title: 'Call' } })).toBe(true);
    expect(proposalMatches(proposal, { tenantUid: 'HOSP2', actorUserId: 7, toolName: 'create_task', args: proposal.args })).toBe(false);
  });

  test('expires proposals at the persisted expiry boundary', () => {
    expect(isProposalExpired({ expires_at: '2020-01-01T00:00:00Z' })).toBe(true);
    expect(isProposalExpired({ expires_at: '2099-01-01T00:00:00Z' })).toBe(false);
  });
});
