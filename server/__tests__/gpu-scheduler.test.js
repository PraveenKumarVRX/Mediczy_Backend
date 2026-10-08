import { jest } from '@jest/globals';

jest.unstable_mockModule('../db/pgPool.js', () => ({
  default: { query: jest.fn().mockResolvedValue({ rows: [{ t: null }] }) },
}));

const { schedule, slotForRequest, getMetrics, GPU, PRIORITY } = await import('../services/ai-brain/gpu-scheduler.service.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

describe('slotForRequest', () => {
  const msgs = (text) => [{ role: 'user', content: text }];

  it('puts deep clinical reasoning on the 3090 at HIGH priority', () => {
    expect(slotForRequest({ providerName: 'sib', cognitiveTier: 'deep', messages: msgs('summarise this ECG') }))
      .toEqual({ gpu: GPU.GPU3090, priority: PRIORITY.HIGH });
    expect(slotForRequest({ providerName: 'isha', cognitiveTier: 'deep', messages: msgs('sepsis workup') }).gpu).toBe(GPU.GPU3090);
  });

  it('keeps insurance and scheduling text off the 3090', () => {
    expect(slotForRequest({ providerName: 'sib', cognitiveTier: 'deep', messages: msgs('check my mediclaim coverage') }))
      .toEqual({ gpu: GPU.GPU3060, priority: PRIORITY.NORMAL });
    expect(slotForRequest({ providerName: 'isha', cognitiveTier: 'deep', messages: msgs('book an appointment') }).gpu).toBe(GPU.GPU3060);
  });

  it('uses the 3060 for standard/reflex and isha-inc, and no slot for cloud providers', () => {
    expect(slotForRequest({ providerName: 'sib', cognitiveTier: 'standard', messages: msgs('hello') }).gpu).toBe(GPU.GPU3060);
    expect(slotForRequest({ providerName: 'isha-inc', cognitiveTier: 'deep', messages: msgs('hello') }).gpu).toBe(GPU.GPU3060);
    expect(slotForRequest({ providerName: 'groq', cognitiveTier: 'deep', messages: msgs('hello') })).toBeNull();
    expect(slotForRequest({ providerName: 'openai', cognitiveTier: null, messages: msgs('hello') })).toBeNull();
  });
});

describe('schedule', () => {
  it('limits concurrency per GPU and serves higher priority first', async () => {
    // 3090 limit is 3: fill it, then queue LOW before CRITICAL and expect CRITICAL first.
    const order = [];
    const release = [];
    const hold = () => new Promise((res) => release.push(res));
    const running = [1, 2, 3].map(() => schedule(GPU.GPU3090, hold, { label: 'hold' }));
    await wait(10);
    expect(getMetrics()[GPU.GPU3090].active).toBe(3);

    const low = schedule(GPU.GPU3090, async () => { order.push('low'); }, { priority: PRIORITY.LOW });
    const crit = schedule(GPU.GPU3090, async () => { order.push('critical'); }, { priority: PRIORITY.CRITICAL });
    await wait(10);
    expect(getMetrics()[GPU.GPU3090].queued).toBe(2);

    release.shift()();
    await wait(10);
    release.splice(0).forEach((r) => r());
    await Promise.all([...running, low, crit]);
    expect(order).toEqual(['critical', 'low']);
    expect(getMetrics()[GPU.GPU3090].active).toBe(0);
  });

  it('does not let 4xx provider errors trip the circuit breaker, but does for server errors', async () => {
    for (let i = 0; i < 8; i++) {
      await schedule(GPU.CPU, async () => { throw Object.assign(new Error('consent required'), { status: 403 }); }).catch(() => {});
    }
    expect(getMetrics()[GPU.CPU].circuitOpen).toBe(false);

    for (let i = 0; i < 8; i++) {
      await schedule(GPU.CPU, async () => { throw Object.assign(new Error('bad gateway'), { status: 502 }); }).catch(() => {});
    }
    expect(getMetrics()[GPU.CPU].circuitOpen).toBe(true);
    await expect(schedule(GPU.CPU, async () => 'x')).rejects.toMatchObject({ gpuCircuitOpen: true });
  });
});
