import { jest } from '@jest/globals';

jest.unstable_mockModule('fs', () => ({ readFileSync: jest.fn(), writeFileSync: jest.fn(), existsSync: jest.fn(() => false), mkdirSync: jest.fn() }));

const acquireCronLease = jest.fn();
const heartbeatCronLease = jest.fn().mockResolvedValue(true);
const releaseCronLease = jest.fn().mockResolvedValue(undefined);
jest.unstable_mockModule('../services/cron-lease.service.js', () => ({ acquireCronLease, heartbeatCronLease, releaseCronLease }));

const { beginJob, tick, tickError, tickEnd, tickStart, withCron } = await import('../utils/cronRegistry.js');
const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  acquireCronLease.mockReset(); releaseCronLease.mockClear(); heartbeatCronLease.mockClear();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { for (const k of ['system_health', 'device_heartbeat']) tickEnd(k); jest.restoreAllMocks(); });

describe('audit OPS-01: beginJob combines the in-process flag and the cross-process lease', () => {
  it('runs when it wins the lease and releases it automatically on success', async () => {
    acquireCronLease.mockResolvedValue({ acquired: true, owner_id: 'pm2-1:42:ab' });
    expect(await beginJob('system_health')).toBe(true);
    tick('system_health', { processed: 1 });
    await flush();
    expect(releaseCronLease).toHaveBeenCalledWith('system_health', 'pm2-1:42:ab');
  });

  it('releases on error too, so a failed run never blocks the next tick', async () => {
    acquireCronLease.mockResolvedValue({ acquired: true, owner_id: 'o1' });
    await beginJob('system_health');
    tickError('system_health', 'boom');
    await flush();
    expect(releaseCronLease).toHaveBeenCalledWith('system_health', 'o1');
    acquireCronLease.mockResolvedValue({ acquired: true, owner_id: 'o2' });
    expect(await beginJob('system_health')).toBe(true);
  });

  it('SKIPS when another process holds the lease, and leaves no stuck "running" flag behind', async () => {
    acquireCronLease.mockResolvedValue({ acquired: false, jobKey: 'system_health', reason: 'lease_held' });
    expect(await beginJob('system_health')).toBe(false);
    expect(tickStart('system_health')).toBe(true);      // the flag was cleared, so a later tick can start
    tickEnd('system_health');
  });

  it('SKIPS a second start in the same process without touching the lease store', async () => {
    acquireCronLease.mockResolvedValue({ acquired: true, owner_id: 'o1' });
    expect(await beginJob('system_health')).toBe(true);
    acquireCronLease.mockClear();
    expect(await beginJob('system_health')).toBe(false);
    expect(acquireCronLease).not.toHaveBeenCalled();
  });

  it('FAILS OPEN: an unreachable lease store never stops a scheduled job', async () => {
    acquireCronLease.mockRejectedValue(new Error('connection refused'));
    expect(await beginJob('system_health')).toBe(true);
    tickEnd('system_health');
  });

  it('withCron honours the lease and reports why it skipped', async () => {
    acquireCronLease.mockResolvedValue({ acquired: false });
    let ran = false;
    const res = await withCron('device_heartbeat', async () => { ran = true; });
    expect(ran).toBe(false);
    expect(res).toMatchObject({ skipped: true });
  });

  it('withCron returns the job result, so callers can log it', async () => {
    acquireCronLease.mockResolvedValue({ acquired: true });
    const res = await withCron('device_heartbeat', async () => ({ pharmaciesScanned: 3, alertsCreated: 1 }));
    expect(res).toEqual({ pharmaciesScanned: 3, alertsCreated: 1 });
    tickEnd('device_heartbeat');
  });
});

describe('a stale running flag can never stop a job for good', () => {
  it('a flag older than the stale window is ignored (the job exited without calling tick/tickError)', () => {
    const realNow = Date.now;
    expect(tickStart('system_health')).toBe(true);
    expect(tickStart('system_health')).toBe(false);                       // fresh flag blocks
    Date.now = () => realNow() + 31 * 60_000;                              // 31 minutes later
    try { expect(tickStart('system_health')).toBe(true); } finally { Date.now = realNow; }
    tickEnd('system_health');
  });
});

describe('a run that never completes cannot deadlock its own job', () => {
  it('clears the stale predecessor\'s lease before acquiring, so a process cannot block itself', async () => {
    const realNow = Date.now;
    acquireCronLease.mockResolvedValueOnce({ acquired: true, owner_id: 'first-run' });
    expect(await beginJob('system_health')).toBe(true);           // ...and this run never calls tick()/tickError()
    Date.now = () => realNow() + 31 * 60_000;                       // stale window passes
    try {
      acquireCronLease.mockResolvedValueOnce({ acquired: true, owner_id: 'second-run' });
      expect(await beginJob('system_health')).toBe(true);
      expect(releaseCronLease).toHaveBeenCalledWith('system_health', 'first-run');
      // ordering: the predecessor was released before the new acquire
      expect(releaseCronLease.mock.invocationCallOrder[0]).toBeLessThan(acquireCronLease.mock.invocationCallOrder[1]);
    } finally { Date.now = realNow; }
    tickEnd('system_health');
  });
});

