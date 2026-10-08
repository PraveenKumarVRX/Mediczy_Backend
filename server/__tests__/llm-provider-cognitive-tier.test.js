import { jest } from '@jest/globals';

jest.unstable_mockModule('../db/pgPool.js', () => ({
  default: { query: jest.fn().mockResolvedValue({ rows: [] }) },
}));

const sibBodies = [];

async function loadWith(env) {
  jest.resetModules();
  Object.assign(process.env, { SIB_URL: 'http://sib.test', ...env });
  global.fetch = jest.fn(async (url, init) => {
    if (String(url).startsWith('http://sib.test')) {
      sibBodies.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ chat_answer: 'ok from sib' }), text: async () => '' };
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  return (await import('../services/ai-brain/llm-provider.js')).default;
}

afterEach(() => {
  delete process.env.AI_GPU_SCHEDULER_ENABLED;
  sibBodies.length = 0;
});

describe('cognitive tier threading', () => {
  it('sends cognitive_tier to SIB so it can pick the GPU node', async () => {
    const llm = await loadWith({});
    const res = await llm.chat({ messages: [{ role: 'user', content: 'explain this ECG' }], cognitiveTier: 'deep' });
    expect(res.content).toBe('ok from sib');
    expect(sibBodies[0].cognitive_tier).toBe('deep');
  });

  it('sends null when no tier was given', async () => {
    const llm = await loadWith({});
    await llm.chat({ messages: [{ role: 'user', content: 'hello there' }] });
    expect(sibBodies[0].cognitive_tier ?? null).toBeNull();
  });

  it('routes through the GPU scheduler only when AI_GPU_SCHEDULER_ENABLED=true', async () => {
    const llm = await loadWith({ AI_GPU_SCHEDULER_ENABLED: 'true' });
    const sched = (await import('../services/ai-brain/gpu-scheduler.service.js')).default;
    const before = sched.getMetrics().gpu3090.totalRequests;
    await llm.chat({ messages: [{ role: 'user', content: 'explain this ECG' }], cognitiveTier: 'deep' });
    expect(sched.getMetrics().gpu3090.totalRequests).toBe(before + 1);
  });

  it('leaves the scheduler untouched when disabled', async () => {
    const llm = await loadWith({});
    const sched = (await import('../services/ai-brain/gpu-scheduler.service.js')).default;
    const before = sched.getMetrics().gpu3090.totalRequests;
    await llm.chat({ messages: [{ role: 'user', content: 'explain this ECG' }], cognitiveTier: 'deep' });
    expect(sched.getMetrics().gpu3090.totalRequests).toBe(before);
  });
});
