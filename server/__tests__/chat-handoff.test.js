import {patientVideoAccess} from '../utils/patient-video-access.js';
import { it,expect } from '@jest/globals';
import { applyHandoffEvent,createChatHandoff } from '../services/chat-handoff.js';
import { resolveChatSubject } from '../services/chat-subject-access.js';
import { validatedEvidence } from '../services/medical-chat-contract.js';
const appointment={id:10,userId:7,doctorId:22};
it('requires both authenticated participants before reporting connected, dedupes and handles termination',()=>{
 let state=applyHandoffEvent({},appointment,{id:'1',event:'participant_joined',participant:{identity:'user-7'},createdAt:1});
 expect(state.status).toBe('offered');
 state=applyHandoffEvent(state,appointment,{id:'2',event:'participant_joined',participant:{identity:'doctor-99'},createdAt:2});
 expect(state.status).toBe('offered');
 const event={id:'3',event:'participant_joined',participant:{identity:'doctor-22'},createdAt:3};
 state=applyHandoffEvent(state,appointment,event);expect(state.status).toBe('connected');
 expect(applyHandoffEvent(state,appointment,event)).toEqual(state);
 state=applyHandoffEvent(state,appointment,{id:'4',event:'room_finished',createdAt:4});expect(state.status).toBe('completed');
 expect(applyHandoffEvent(state,appointment,{...event,id:'5',createdAt:5}).status).toBe('completed');
});
it('rejects handoff decisions from patients or unrelated doctors',async()=>{
 const service=createChatHandoff({repository:{},resolveActor:async()=>({type:'patient'}),owns:()=>false});
 await expect(service.decide({},10,'accepted')).rejects.toMatchObject({statusCode:403});
});
it('does not authorize a chart from an admin label or a different organization',async()=>{
 const pool={query:async()=>({rows:[{id:7,unique_id:'P12345',organization_id:2,organization_uid:'H12345'}]})};
 await expect(resolveChatSubject(pool,{userRole:'admin'},'P12345',async()=>true)).rejects.toMatchObject({statusCode:403});
 await expect(resolveChatSubject(pool,{userRole:'doctor',user:{organization_id:1}},'P12345',async()=>true)).rejects.toMatchObject({statusCode:403});
 await expect(resolveChatSubject(pool,{userRole:'doctor',user:{organization_id:2,organization_uid:'H12345'}},'P12345',async()=>true)).resolves.toMatchObject({id:7});
});
it('validates exact source spans and rejects expired or unsupported citations',()=>{
 const data={response:'Supported text',retrieval:{supportingSources:[{documentId:'1',chunkId:'2',title:'Guideline',excerpt:'Supported text',version:'1',reviewDueAt:'2030-01-01T00:00:00Z'}],claims:[{documentId:'1',chunkId:'2',start:0,end:14,text:'Supported text'}]}};
 expect(validatedEvidence(data).valid).toBe(true);
 expect(validatedEvidence({...data,response:'Invented clinical advice'}).valid).toBe(false);
 expect(validatedEvidence(data,Date.parse('2031-01-01')).valid).toBe(false);
});

it('never returns clinician join credentials in patient video access',()=>{
 const result=patientVideoAccess({roomId:'room',appointmentId:7,patientJoinUrl:'patient-link',livekitJoinData:{patient:{token:'patient-token'},doctor:{token:'clinician-token'}}});
 expect(JSON.stringify(result)).not.toContain('clinician-token');
 expect(result).not.toHaveProperty('doctorJoinUrl');
 expect(result.livekit.token).toBe('patient-token');
});
