import { describe, expect, jest, test, beforeEach } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const client = { query: jest.fn(), release: jest.fn() };
const pool = { query: jest.fn(), connect: jest.fn() };
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: pool }));
const content = await import('../services/crm-social-content.service.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const user = { id: 24, tenantUid: 'HOSP01' };

describe('CRM social content workflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pool.connect.mockResolvedValue(client);
    client.query.mockImplementation(async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (String(sql).includes('SELECT status, created_by')) return { rows: [{ status: 'draft', created_by: 17 }] };
      if (String(sql).includes('UPDATE crm_social_posts')) return { rows: [{ status: 'pending_approval' }] };
      if (String(sql).includes('SELECT id, unique_id AS')) {
        return { rows: [{ id: '5', uniqueId: 'QAAAAA', tenantUid: 'HOSP01', status: 'pending_approval' }] };
      }
      return { rows: [] };
    });
  });

  test('submits a tenant-scoped draft and records the transition in the same transaction', async () => {
    const result = await content.submitPost('HOSP01', '5', user);
    expect(result).toMatchObject({ id: '5', status: 'pending_approval' });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE tenant_uid=$1 AND id=$2 FOR UPDATE'),
      ['HOSP01', '5'],
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO crm_social_post_events'),
      expect.arrayContaining(['HOSP01', '5', 'submitted', 'draft', 'pending_approval']),
    );
    expect(client.query.mock.calls.at(-1)[0]).toBe('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  test('creates a draft without accepting an application-minted UID', async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      if (String(sql).includes('INSERT INTO crm_social_posts')) return { rows: [{ id: '5' }] };
      if (String(sql).includes('SELECT id, unique_id AS')) return { rows: [{ id: '5', uniqueId: 'QAAAAA', status: 'draft' }] };
      return { rows: [] };
    });
    const result = await content.createPost('HOSP01', {
      caption: 'A health awareness post',
      platforms: ['instagram', 'linkedin'],
      platformCaptions: { linkedin: 'A professional version' },
    }, user);
    expect(result).toMatchObject({ id: '5', status: 'draft' });
    const insert = client.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO crm_social_posts'));
    expect(insert[0]).not.toContain('unique_id');
    expect(insert[1]).toEqual(expect.arrayContaining(['HOSP01', 'A health awareness post', ['instagram', 'linkedin']]));
  });

  test('does not allow the author to approve their own post', async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
      if (String(sql).includes('SELECT status, created_by')) return { rows: [{ status: 'pending_approval', created_by: 24 }] };
      return { rows: [] };
    });
    await expect(content.approvePost('HOSP01', '5', user)).rejects.toMatchObject({ statusCode: 403 });
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE crm_social_posts'))).toBe(false);
    expect(client.query.mock.calls.at(-1)[0]).toBe('ROLLBACK');
  });

  test('rejects unsafe channels, malformed content, and malformed post identifiers', async () => {
    await expect(content.createPost('HOSP01', { caption: '', platforms: ['instagram'] }, user)).rejects.toMatchObject({ statusCode: 400 });
    await expect(content.createPost('HOSP01', { caption: 'A post', platforms: ['unknown'] }, user)).rejects.toMatchObject({ statusCode: 400 });
    await expect(content.submitPost('HOSP01', '5 OR 1=1', user)).rejects.toMatchObject({ statusCode: 400 });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('keeps reads tenant-scoped and includes unplanned posts for the review queue', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await expect(content.getPost('HOSP02', '5')).resolves.toBeNull();
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('WHERE tenant_uid=$1 AND id=$2'), ['HOSP02', '5']);

    pool.query.mockResolvedValueOnce({ rows: [] });
    await content.listPosts('HOSP01', { from: '2026-10-01T00:00:00Z', to: '2026-11-01T00:00:00Z' });
    expect(pool.query).toHaveBeenLastCalledWith(
      expect.stringContaining('planned_at IS NULL'),
      ['HOSP01', new Date('2026-10-01T00:00:00Z'), new Date('2026-11-01T00:00:00Z'), null, 200],
    );
  });

  test('migration provisions the UID-backed tenant content, comments and audit trail', () => {
    const migration = read('migrations/20261015007000-crm-social-content.migration.js');
    for (const table of ['crm_social_posts', 'crm_social_post_comments', 'crm_social_post_events']) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(migration).toContain("attach_entity_uid_rule('crm_social_posts', 'crm_social_post', 'unique_id', false)");
    expect(migration).toContain('tenant_uid TEXT NOT NULL');
  });

  test('content routes remain authenticated, capability-gated and feature-flagged', () => {
    const route = read('routes/crm-social-growth.route.js');
    expect(route).toContain("router.use(enabled)");
    expect(route).toContain("router.post('/posts/:id/approve', authCRM, requireCRMCapability('foundation:write')");
    expect(route).toContain("router.get('/posts', authCRM, requireCRMCapability('foundation:read')");
  });
});
