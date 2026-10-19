import {jest,beforeEach,it,expect,describe} from '@jest/globals';
const wardSnapshot=jest.fn();const query=jest.fn();const chat=jest.fn();
jest.unstable_mockModule('../services/nursing-context.service.js',()=>({withNursingContext:async(_ctx,work)=>work(),nursingQuery:query}));
jest.unstable_mockModule('../services/nursing-workflow.service.js',()=>({wardSnapshot}));
jest.unstable_mockModule('../services/ai-brain/llm-provider.js',()=>({default:{chat}}));
const {generateShiftHandover}=await import('../services/hospital-os/nurse-handover.service.js');
const run=()=>generateShiftHandover({organizationId:1,actorId:11,role:'nurse',wardId:10});
beforeEach(()=>{chat.mockReset();query.mockReset().mockResolvedValue([{ai_enabled:false}]);wardSnapshot.mockReset().mockResolvedValue({patientCount:31,patients:Array.from({length:31},(_,i)=>({id:i+1,patient_name:'Synthetic identity',pending:[],medications:[],vitals:null})),coverage:'complete'});});
describe('governed SBAR drafts',()=>{
 it('keeps the complete census and never calls a model without facility opt-in',async()=>{const r=await run();expect(r.patientCount).toBe(31);expect(r.patients).toHaveLength(31);expect(r.reviewRequired).toBe(true);expect(r.canSign).toBe(false);expect(chat).not.toHaveBeenCalled();});
 it('propagates unavailable clinical data instead of reporting an empty safe ward',async()=>{wardSnapshot.mockRejectedValue(new Error('Database unavailable'));await expect(run()).rejects.toThrow('Database unavailable');expect(chat).not.toHaveBeenCalled();});
 it('retains a deterministic handover when the provider fails',async()=>{query.mockResolvedValue([{ai_enabled:true}]);chat.mockRejectedValue(new Error('Provider unavailable'));const r=await run();expect(r.aiUnavailable).toBe(true);expect(r.provider).toBe('deterministic');expect(r.patients).toHaveLength(31);});
 it('rejects an incomplete model response',async()=>{query.mockResolvedValue([{ai_enabled:true}]);chat.mockResolvedValue({content:'{"sbar":{"situation":"partial"}}'});expect((await run()).provider).toBe('deterministic');});
 it('filters invented priority IDs and sends no structural patient names',async()=>{query.mockResolvedValue([{ai_enabled:true}]);chat.mockResolvedValue({provider:'fixture',content:JSON.stringify({sbar:{situation:'Reviewed',background:'Reviewed',assessment:'Reviewed',recommendation:'Reviewed'},priorityPatients:[1,999]})});const r=await run();expect(r.handover.priorityPatients).toEqual([1]);expect(chat.mock.calls[0][0].messages[1].content).not.toContain('Synthetic identity');expect(r.canSign).toBe(false);});
});
