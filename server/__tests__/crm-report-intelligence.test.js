import { jest, describe, it, expect } from '@jest/globals';
jest.unstable_mockModule('../services/ai-brain/llm-provider.js', () => ({ default: { chat: jest.fn(async () => ({ content: '{}' })) } }));
const { forecastRevenue, bulkScoreLeads, scoreLead, analyzePipelineHealth } = await import('../services/ai-crm.service.js');

describe('CRM report intelligence regressions', () => {
  it('uses the probability shown in the pipeline, preserving zero', () => {
    expect(forecastRevenue([{ value:5000, stage:'discovery', probability:50 }]).weighted).toBe(2500);
    expect(forecastRevenue([{ value:5000, stage:'qualification', probability:0 }]).weighted).toBe(0);
  });
  it('handles won and lost deal stages consistently', () => {
    expect(forecastRevenue([{ value:5000, stage:'won', probability:10 }, { value:8000, stage:'lost', probability:80 }]).weighted).toBe(0);
  });
  it('does not invent hot engagement or a demo for untouched new leads', async () => {
    const lead = { id:1, name:'QA', status:'new', source:'manual', email:'qa@example.invalid', phone:'9000000000', company:'Test', createdAt:new Date().toISOString() };
    const [score] = await bulkScoreLeads([lead]);
    expect(score.score).toBeLessThan(70); expect(score.tier).not.toBe('Hot'); expect(score.nextAction).toBe('Make first contact');
    expect((await scoreLead(lead, [])).score).toBe(score.score);
    expect((await scoreLead(lead, [{type:'note',title:'Lead created: QA'}])).score).toBe(score.score);
    const health = await analyzePipelineHealth([score], []);
    expect(health.opportunities).toContain('0 hot leads ready for outreach.');
  });
});

it('forecasts only open deals using numeric PostgreSQL values and the same monthly totals', () => {
 const result=forecastRevenue([
  {value:'5000.00',stage:'discovery',probability:'50',expectedCloseDate:'2026-11-30'},
  {value:'1000.00',stage:'won',probability:100,expectedCloseDate:'2026-11-30'},
  {value:'1000.00',stage:'lost',probability:0,expectedCloseDate:'2026-11-30'}
 ]);
 expect(result.weighted).toBe(2500);expect(result.dealCount).toBe(1);
 expect(result.monthly).toEqual([{month:'2026-11',amount:2500}]);
});
