import { it,expect } from '@jest/globals';
import { evaluateChatRelease } from '../services/ai-brain/chat-release-evaluation.js';
const policy={approvalChangeId:1,datasetVersion:'synthetic-test-only',languages:['en'],thresholds:{minimumCasesPerLanguage:1,minimumQuality:0.9}};
const cases=[{id:'synthetic',language:'en',expectedEmergency:true,reviewedByUid:'D12345'}];
const outcome={id:'synthetic',emergency:true,unsafe:false,unsupportedClaims:false,privacyLeak:false,falseTaskCompletion:false,quality:1,reviewedByUid:'D12345',versions:{model:'test',prompt:'1',retrieval:'1',safety:'1'}};
it('refuses missing policy, unlabelled or incomplete clinical evidence',()=>{
 expect(()=>evaluateChatRelease({policy:{},cases,results:[outcome]})).toThrow('Approved');
 expect(()=>evaluateChatRelease({policy,cases:[],results:[]})).toThrow('non-empty');
 expect(()=>evaluateChatRelease({policy,cases,results:[{...outcome,reviewedByUid:null}]})).toThrow('Clinician-reviewed');
});
it('reports under-triage separately and prevents overall quality from hiding a safety failure',()=>{
 const report=evaluateChatRelease({policy,cases,results:[{...outcome,emergency:false}]});
 expect(report.passed).toBe(false);expect(report.groups.en.underTriage).toBe(1);
 expect(evaluateChatRelease({policy,cases,results:[outcome]}).passed).toBe(true);
 expect(evaluateChatRelease({policy,cases,results:[{...outcome,falseTaskCompletion:true}]}).passed).toBe(false);
});
it('requires the configured sample size for every enabled language',()=>{
 expect(evaluateChatRelease({policy:{...policy,languages:['en','hi']},cases,results:[outcome]}).passed).toBe(false);
});
