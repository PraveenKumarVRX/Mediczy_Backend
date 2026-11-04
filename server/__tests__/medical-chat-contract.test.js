import { beforeAll, afterAll, describe, it, expect } from '@jest/globals';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import Redis from 'ioredis';
import { chatOwner, createChatSessions, buildChatRequest, chatResponseMetadata,
  requireAIConsent, requireSibSuccess, verifiedChatObservations } from '../services/medical-chat-contract.js';

let redis, process, directory, sessions;
beforeAll(async () => {
  directory = await mkdtemp(`${tmpdir()}/medical-chat-test-`);
  const socket = `${directory}/redis.sock`;
  process = spawn('redis-server', ['--port', '0', '--unixsocket', socket, '--save', '', '--appendonly', 'no'], { stdio: 'ignore' });
  redis = new Redis({ path: socket, retryStrategy: n => n < 50 ? 20 : null });
  redis.on('error', () => {});
  await new Promise((resolve, reject) => { redis.once('ready', resolve); redis.once('end', () => reject(new Error('Test Redis did not start'))); });
  sessions = createChatSessions(redis);
});
afterAll(async () => {
  if (redis) await redis.quit();
  if (process) { const exited = new Promise(resolve => process.once('exit', resolve)); process.kill(); await exited; }
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe('real Redis conversation authorization and concurrency', () => {
  it('issues opaque sessions; rejects different users, roles and organizations', async () => {
    const owner = chatOwner({ user: { id: 7, organization_id: 1 }, userRole: 'user' });
    const id = await sessions.resolve(null, owner);
    expect(id).toMatch(/^chat_[a-f0-9]{32}$/);
    for (const req of [
      { user: { id: 8, organization_id: 1 }, userRole: 'user' },
      { user: { id: 7, organization_id: 2 }, userRole: 'user' },
      { user: { id: 7, organization_id: 1 }, userRole: 'doctor' },
    ]) {
      await expect(sessions.load(id, chatOwner(req))).rejects.toMatchObject({ statusCode: 403 });
      await expect(sessions.clear(id, chatOwner(req))).rejects.toMatchObject({ statusCode: 403 });
    }
  });
  it('retains concurrent appends and cannot resurrect a cleared session', async () => {
    const id = await sessions.resolve(null, 'owner');
    await Promise.all(Array.from({ length: 10 }, (_, i) => sessions.append(id, 'owner', [{ role: 'user', content: `turn ${i}` }])));
    expect(await sessions.load(id, 'owner')).toHaveLength(10);
    await sessions.clear(id, 'owner');
    await expect(sessions.append(id, 'owner', [{ role: 'user', content: 'resurrect' }])).rejects.toMatchObject({ statusCode: 403 });
  });
  it('does not adopt client legacy history or permit personal history in generic mode', async () => {
    const id = await sessions.resolve('dr_isha_123_random', 'personal:owner');
    expect(await sessions.load(id, 'personal:owner')).toEqual([]);
    await expect(sessions.resolve(id, 'owner')).rejects.toMatchObject({ statusCode: 403 });
    await sessions.clear(id, 'owner');
    await expect(sessions.load(id, 'personal:owner')).rejects.toMatchObject({ statusCode: 403 });
    await expect(sessions.resolve('mediczy_7', 'owner')).rejects.toMatchObject({ statusCode: 403 });
  });
  it('bounds history and rejects expired sessions', async () => {
    const id = await sessions.resolve(null, 'owner');
    await sessions.append(id, 'owner', Array.from({ length: 40 }, (_, i) => ({ role: 'user', content: String(i) })));
    expect(await sessions.load(id, 'owner')).toHaveLength(30);
    await redis.del(`medical-chat:{${id}}:owner`);
    await expect(sessions.load(id, 'owner')).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('actual channel contract and consent boundary', () => {
  it('omits identity/context for general education and separates it for personal requests', () => {
    const generic = buildChatRequest({ sessionId: 'session', query: 'question', history: [], userId: 7, context: { secret: true } });
    expect(generic).not.toHaveProperty('user_id');
    expect(generic).not.toHaveProperty('patient_context');
    const personal = buildChatRequest({ sessionId: 'session', query: 'question', history: [], userId: 7, context: { age: 20 }, personal: true });
    expect(personal).toMatchObject({ patient_id: 'session', user_id: '7', is_patient_specific: true, patient_context: { age: 20 }, server_managed_history: true });
  });
  it('preserves urgency and labels retrieval as unvalidated', () => {
    expect(chatResponseMetadata({ emergency: true, retrieval: { count: 1, sources: ['knowledge', 'https://invented'] } })).toMatchObject({
      intentType: 'emergency', redirectUrl: '/emergency', retrieval: { sources: ['knowledge'] }, evidenceStatus: 'retrieved_unvalidated',
    });
    expect(chatResponseMetadata({ is_emergency: true }).safety.emergency).toBe(true);
    expect(chatResponseMetadata({}).evidenceStatus).toBe('unavailable');
  });
  it('fails closed on denied consent and database outage', async () => {
    await expect(requireAIConsent({ query: async () => ({ rows: [] }) }, 7)).rejects.toMatchObject({ statusCode: 403 });
    await expect(requireAIConsent({ query: async () => { throw new Error('outage'); } }, 7)).rejects.toThrow('outage');
    await expect(requireAIConsent({ query: async () => ({ rows: [{}] }) }, 7)).resolves.toBeUndefined();
  });
  it('reads only verified owned observations and reports unavailable schema explicitly', async () => {
    let captured;
    const pool = { query: async (sql, params) => { captured = { sql, params }; return { rows: [{ value: '0', numericValue: 0, unit: 'mg/dL', reportId: 9, page: 2 }] }; } };
    const result = await verifiedChatObservations(pool, { userId: 7, organizationId: 4 });
    expect(captured.params).toEqual([7, 4]);
    expect(captured.sql).toContain("verification_status = 'verified'");
    expect(captured.sql).toContain('r.organization_id IS NOT DISTINCT FROM $2');
    expect(result.items[0]).toMatchObject({ numericValue: 0, unit: 'mg/dL', reportId: 9, page: 2, verificationStatus: 'verified' });
    expect(await verifiedChatObservations({ query: async () => { throw new Error('migration unavailable'); } }, { userId: 7 })).toEqual({ status: 'unavailable', items: [] });
  });
  it('preserves policy denial instead of retrying a different provider', () => {
    for (const status of [401, 403]) expect(() => requireSibSuccess({ status, ok: false })).toThrow('denied');
    expect(() => requireSibSuccess({ status: 503, ok: false })).toThrow('unavailable');
  });
});
