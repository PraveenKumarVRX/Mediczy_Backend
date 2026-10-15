import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeInboundEvent } from '../services/crm-brightbean-chat.service.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

describe('clean-room CRM chat adoption', () => {
  test('migration owns inbox rules, reminders, template lifecycle and erasure tables', () => {
    const migration = read('migrations/20261015006900-crm-brightbean-chat-adoption.migration.js');
    for (const table of ['crm_social_inbox_rules', 'crm_social_inbox_reminders', 'crm_whatsapp_templates', 'crm_social_erasure_requests']) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
      expect(migration).toContain(`entity_uid TEXT NOT NULL UNIQUE`);
      expect(migration).toContain('tenant_uid TEXT NOT NULL');
    }
    expect(migration).toContain('uq_social_inbox_tenant_identity');
  });

  test('CRM route is authenticated and capability-gated', () => {
    const route = read('routes/crm-brightbean-chat.route.js');
    expect(route).toContain('router.use(authCRM)');
    expect(route).toContain("requireCRMCapability('foundation:read')");
    expect(route).toContain("requireCRMCapability('foundation:write')");
    expect(route).not.toMatch(/CREATE TABLE|ALTER TABLE|CREATE INDEX/i);
  });

  test('normalizes official Meta comment, story and follow changes', () => {
    const events = normalizeInboundEvent({
      object: 'instagram',
      entry: [{
        id: 'page-1',
        changes: [
          { field: 'comments', value: { comment_id: 'c-1', from: { id: 'u-1' }, text: 'BOOK' } },
          { field: 'story_mentions', value: { media_id: 'm-1', sender: { id: 'u-2' } } },
          { field: 'followers', value: { from: { id: 'u-3' } } },
        ],
      }],
    });
    expect(events.map((event) => event.eventType)).toEqual(['comment_to_dm', 'story_mention', 'follow']);
    expect(events[0]).toMatchObject({ channel: 'instagram', triggerKey: 'c-1', externalUserId: 'u-1', text: 'BOOK' });
  });

  test('normalizes inbound message text for keyword rule evaluation', () => {
    const events = normalizeInboundEvent({ object: 'page', entry: [{ id: 'page-1', messaging: [{ sender: { id: 'u-1' }, message: { text: 'hello there' } }] }] });
    expect(events).toEqual([expect.objectContaining({ eventType: 'message', channel: 'facebook', triggerKey: 'hello there', text: 'hello there', externalUserId: 'u-1' })]);
  });
});
