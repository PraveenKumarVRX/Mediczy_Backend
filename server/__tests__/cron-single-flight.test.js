import { jest } from '@jest/globals';

jest.unstable_mockModule('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  existsSync: jest.fn(() => false),
  mkdirSync: jest.fn(),
}));

const { tickStart, tickEnd, withCron } = await import('../utils/cronRegistry.js');

describe('cron single-flight', () => {
  it('rejects a second start for the same task while it is running', () => {
    expect(tickStart('system_health')).toBe(true);
    expect(tickStart('system_health')).toBe(false);
    tickEnd('system_health');
    expect(tickStart('system_health')).toBe(true);
    tickEnd('system_health');
  });

  it('does not execute a wrapped job twice concurrently', async () => {
    let resolve;
    const gate = new Promise((r) => { resolve = r; });
    let runs = 0;
    const first = withCron('device_heartbeat', async () => { runs += 1; await gate; return { processed: 1 }; });
    const second = await withCron('device_heartbeat', async () => { runs += 1; return { processed: 2 }; });
    expect(second).toMatchObject({ skipped: true, reason: 'already_running' });
    resolve();
    await first;
    expect(runs).toBe(1);
  });
});
