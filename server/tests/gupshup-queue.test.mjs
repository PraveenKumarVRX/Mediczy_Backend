import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import Redis from 'ioredis';

// Dedicated disposable Redis only. Never uses the repository's Redis/DB endpoints.
test('Gupshup durable inbox, callback deduplication, failure retention and ordered delivery status', { timeout: 15000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gupshup-redis-test-'));
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const password = crypto.randomBytes(24).toString('hex');
  const child = spawn('redis-server', ['--bind', '127.0.0.1', '--port', String(port), '--dir', dir,
    '--save', '', '--appendonly', 'no', '--requirepass', password], { stdio: ['ignore', 'pipe', 'pipe'] });
  let client, queueModule;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Isolated Redis did not start')), 3000);
      child.on('error', e => { clearTimeout(timer); reject(e); });
      child.stdout.on('data', data => { if (data.toString().includes('Ready to accept connections')) { clearTimeout(timer); resolve(); } });
      child.on('exit', () => { clearTimeout(timer); reject(new Error('Isolated Redis exited')); });
    });
    process.env.REDIS_URL = `redis://:${password}@127.0.0.1:${port}/0`;
    process.env.WHATSAPP_PROVIDER = 'gupshup';
    process.env.NODE_ENV = 'gupshup-isolated-test';
    client = new Redis(process.env.REDIS_URL);
    queueModule = await import('../services/gupshup-inbound-queue.service.js');
    const { statusKey } = await import('../services/gupshup-whatsapp.service.js');
    const { gupshupJobId } = await import('../services/gupshup-webhook.service.js');
    const event = { app: 'isolated-test', id: 'inbound-1', message: { Body: 'synthetic test' } };
    await queueModule.enqueueGupshupInbound(event);
    await queueModule.enqueueGupshupInbound(event);
    // Disconnect and reopen before processing: queued inbound work survives an API-process restart.
    await queueModule.closeGupshupInbound();
    let calls = 0;
    queueModule.startGupshupInboundWorker(async job => { calls++; if (job.id === 'failed-2') throw new Error('uncertain provider outcome'); });
    const wait = async check => {
      const deadline = Date.now() + 5000;
      while (!(await check())) { if (Date.now() > deadline) throw new Error('Queue condition timed out'); await new Promise(r => setTimeout(r, 20)); }
    };
    await wait(async () => await client.get(`gupshup:processing:${gupshupJobId(event)}`) === 'completed');
    assert.equal(calls, 1);
    await queueModule.enqueueGupshupInbound(event);
    await new Promise(r => setTimeout(r, 100));
    assert.equal(calls, 1, 'duplicate callback must not repeat clinical work/reply');
    await queueModule.enqueueGupshupInbound({ ...event, id: 'failed-2' });
    await wait(async () => Number(await client.zcard('bull:gupshup-whatsapp-inbound:failed')) === 1);
    assert.equal(calls, 2);
    const base = { sid: 'gs-test', timestamp: 1000, errorCode: null };
    await queueModule.recordGupshupStatus({ ...base, status: 'delivered' });
    await queueModule.recordGupshupStatus({ ...base, timestamp: 2000, status: 'enqueued' });
    assert.equal(JSON.parse(await client.get(statusKey('gs-test'))).status, 'delivered');
    await queueModule.recordGupshupStatus({ ...base, timestamp: 3000, status: 'read' });
    await queueModule.recordGupshupStatus({ ...base, timestamp: 4000, status: 'failed' });
    assert.equal(JSON.parse(await client.get(statusKey('gs-test'))).status, 'read');
  } finally {
    await queueModule?.closeGupshupInbound();
    await client?.quit();
    child.kill('SIGTERM');
    await new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', resolve); });
    await rm(dir, { recursive: true, force: true });
  }
});
