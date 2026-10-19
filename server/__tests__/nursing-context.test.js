import {jest,describe,it,expect,beforeEach} from '@jest/globals';
const query=jest.fn(async()=>[]);let transactionId=0;
jest.unstable_mockModule('../db/postgres-sequelize.js',()=>({postgresSequelize:{query,transaction:async work=>work({id:++transactionId})}}));
const context=await import('../services/nursing-context.service.js');
beforeEach(()=>query.mockReset().mockResolvedValue([]));
describe('nursing clinical context boundaries',()=>{
 it('normalizes the nurse tenant from the authenticated entity without a header fallback',()=>{
   expect(context.actorFromRequest({user:{id:11,role:'nurse',tenantId:5}})).toMatchObject({organizationId:5,actorId:11,role:'nurse'});
   expect(()=>context.actorFromRequest({user:{id:11,role:'nurse'},tenantId:999})).toThrow('not attached');
 });
 it.each(['patient','user','pharmacy','assistant'])('denies a %s principal',role=>expect(()=>context.actorFromRequest({user:{id:1,role,tenant_id:5}})).toThrow('Clinical staff'));
 it('never executes a clinical query without an authenticated transaction',async()=>{
   await expect(context.nursingQuery('SELECT * FROM nursing_flowsheet_entries')).rejects.toMatchObject({code:'CLINICAL_CONTEXT_REQUIRED'});expect(query).not.toHaveBeenCalled();
 });
 it('sets transaction-local scope and isolates concurrent request identities',async()=>{
   const scopes=await Promise.all([1,2].map(org=>context.withNursingContext({organizationId:org,actorId:org+10,role:'nurse'},async()=>{await Promise.resolve();await context.nursingQuery('SELECT synthetic');return context.nursingContext().organizationId;})));
   expect(scopes).toEqual([1,2]);const queries=query.mock.calls.filter(([sql])=>sql==='SELECT synthetic');expect(queries[0][1].transaction.id).not.toBe(queries[1][1].transaction.id);
   expect(query.mock.calls.filter(([sql])=>sql.includes('set_config'))).toHaveLength(2);
 });
 it('rejects changing tenant in a nested operation',async()=>{
   await expect(context.withNursingContext({organizationId:1,actorId:11},()=>context.withNursingContext({organizationId:2},()=>null))).rejects.toMatchObject({code:'TENANT_MISMATCH'});
 });
 it('fails closed with a migration readiness error',async()=>{
   await expect(context.withNursingContext({organizationId:1,actorId:11},async()=>{query.mockRejectedValueOnce({original:{code:'42P01'}});return context.nursingQuery('SELECT missing');})).rejects.toMatchObject({code:'SCHEMA_NOT_MIGRATED',status:503});
 });
 it('hashes semantically identical object key ordering consistently',()=>expect(context.payloadHash({b:2,a:{y:1,x:2}})).toBe(context.payloadHash({a:{x:2,y:1},b:2})));
 it.each([0,-1,'1.2','NaN',null])('rejects invalid admission identifier %s',id=>expect(()=>context.positiveId(id)).toThrow());
});
