import { jest,it,expect } from '@jest/globals';
jest.unstable_mockModule('../models/postgres/health-reading.model.postgres.js',()=>({default:{}}));
const {freshReading}=await import('../services/patient-wearable-context.service.js');
it('uses timestamped recent vitals and never presents stale or future data as current',()=>{
 const now=Date.parse('2026-11-04T12:00:00Z');
 expect(freshReading({value:0,unit:'bpm',recorded_at:'2026-11-04T11:59:00Z'},'heart_rate',now)).toMatchObject({status:'fresh',value:0,unit:'bpm'});
 expect(freshReading({value:100,recorded_at:'2026-11-03T12:00:00Z'},'heart_rate',now)).not.toHaveProperty('value');
 expect(freshReading({value:100,recorded_at:'2026-11-05T12:00:00Z'},'heart_rate',now)).not.toHaveProperty('value');
 expect(freshReading({value:100},'heart_rate',now).status).toBe('unknown');
});
