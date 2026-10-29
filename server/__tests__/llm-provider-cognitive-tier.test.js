import { jest } from '@jest/globals';

jest.unstable_mockModule('../db/pgPool.js', () => ({
  default: { query: jest.fn().mockResolvedValue({ rows: [] }) },
}));

const sibBodies = [];

async function loadWith(env) {
  jest.resetModules();
  // These tests exercise sib/isha cascade routing specifically, independent of
  // today's production ISHA_INFRA_DOWN default (ai.isha.buzz's domain expired
  // 2026-10-29) — force it back on here so the assertions below still cover
  // the normal-operation behavior that applies once the domain is renewed.
  Object.assign(process.env, { SIB_URL: 'http://sib.test', ISHA_INFRA_DOWN: 'false', ...env });
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
  delete process.env.ROUTE_FORCED_SIB_TO_ISHA;
  sibBodies.length = 0;
});

describe('cognitive tier threading', () => {
  it('redacts provider-bound text and audit output without changing the user response',async()=>{
    const llm=await loadWith({ROUTE_FORCED_SIB_TO_ISHA:'false'});
    global.fetch=jest.fn(async(url,init)=>{sibBodies.push(JSON.parse(init.body));return {ok:true,json:async()=>({chat_answer:'Email demo@example.test'}),text:async()=>''};});
    const result=await llm.chat({messages:[{role:'user',content:'Patient name: Example Person, email demo@example.test, phone +91 9876543210'}],forceProvider:'sib',skipCache:true});
    expect(result.content).toBe('Email demo@example.test');
    expect(JSON.stringify(sibBodies)).not.toContain('demo@example.test');expect(JSON.stringify(sibBodies)).not.toContain('9876543210');expect(JSON.stringify(sibBodies)).not.toContain('Example Person');
    const {default:pool}=await import('../db/pgPool.js');
    const logs=pool.query.mock.calls.filter(([sql])=>sql.includes('INSERT INTO ai_request_logs'));
    expect(logs.length).toBeGreaterThan(0);expect(JSON.stringify(logs.at(-1)[1])).not.toContain('demo@example.test');
  });
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
