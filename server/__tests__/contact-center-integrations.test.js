import {jest} from '@jest/globals';
import {createCallIntelligence,createMediaGateway,createRecordingStorage} from '../services/contact-center/integrations.js';

describe('call intelligence evidence boundary',()=>{
  const segment={segment_id:'s1',speaker:'caller',text:'Email demo@example.test for appointment'};
  it('redacts model input and produces a reviewable cited draft',async()=>{
    const chat=jest.fn(async()=>({content:JSON.stringify({summary:'Appointment requested',actionItems:['Staff to review'],citations:['s1']})}));
    const result=await createCallIntelligence({chat})('summary',[segment]);
    expect(JSON.stringify(chat.mock.calls[0])).not.toContain('demo@example.test');expect(result.requiresHumanReview).toBe(true);
  });
  it('rejects invented citations and executable output fields',async()=>{
    for(const output of [{summary:'Draft',actionItems:[],citations:['foreign-record']},{summary:'Draft',actionItems:[],citations:['s1'],execute:'prescribe'}]){
      await expect(createCallIntelligence({chat:async()=>({content:JSON.stringify(output)})})('copilot',[segment])).rejects.toMatchObject({statusCode:502});
    }
  });
});
describe('private recording storage boundary',()=>{
  const env={VOICE_RECORDINGS_BUCKET:'synthetic-bucket',VOICE_RECORDINGS_KMS_KEY:'synthetic-key-arn'};
  it('deletes exact object versions and markers without deleting neighboring keys',async()=>{
    const send=jest.fn(async command=>command.constructor.name==='ListObjectVersionsCommand'?{Versions:[{Key:'voice/tenant/call.mp3',VersionId:'v1'},{Key:'voice/tenant/call.mp3-other',VersionId:'v2'}],DeleteMarkers:[{Key:'voice/tenant/call.mp3',VersionId:'marker'}]}:{});
    await createRecordingStorage({env,s3:{send}}).remove('voice/tenant/call.mp3');
    const deleted=send.mock.calls.map(([c])=>c).filter(c=>c.constructor.name==='DeleteObjectCommand').map(c=>c.input);
    expect(deleted.map(d=>d.VersionId)).toEqual(['v1','marker',undefined]);expect(deleted.every(d=>d.Key==='voice/tenant/call.mp3')).toBe(true);
  });
  it('refuses missing storage and unapproved recording origins before fetching',async()=>{
    const fetcher=jest.fn();
    expect(()=>createRecordingStorage({env:{},s3:{}}).assertConfigured()).toThrow();
    const storage=createRecordingStorage({env,fetcher,s3:{}});
    await expect(storage.importExotel({credential_prefix:'VOICE_TEST'},{RecordingUrl:'https://unapproved.example/recording'},'voice/test.mp3')).rejects.toMatchObject({code:'INVALID_RECORDING_SOURCE'});
    expect(fetcher).not.toHaveBeenCalled();
  });
});
describe('signed external media actions',()=>{
  it('signs the tenant and call contract and strips arbitrary gateway output',async()=>{
    const fetcher=jest.fn(async()=>({ok:true,json:async()=>({accepted:true,tenantUid:'HOSPITAL_11',callId:'call-1',operationId:'operation-1',secret:'must-not-return'})}));
    const action=createMediaGateway({env:{VOICE_GATEWAY_URL:'https://media.example',VOICE_GATEWAY_EVENT_SECRET:'synthetic-key'},fetcher});
    const result=await action({tenant_uid:'HOSPITAL_11',gateway_prefix:'VOICE_GATEWAY'},{callId:'call-1',action:'hold'});
    expect(result).toEqual({accepted:true,callId:'call-1',operationId:'operation-1'});expect(fetcher.mock.calls[0][1].headers['X-Voice-Signature']).toMatch(/^[a-f0-9]{64}$/);
  });
});
