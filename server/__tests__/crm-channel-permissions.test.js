import {jest} from '@jest/globals';
import express from 'express';
import request from 'supertest';
const saved=jest.fn(async()=>({channel:'email'}));
const checked=jest.fn(async()=>({channel:'email'}));
const changed=jest.fn(async()=>({channel:'email'}));
jest.unstable_mockModule('../middleware/crm.middleware.js',()=>({authCRM:(req,res,next)=>{req.crmUser={id:1,tenantId:11,crmRole:req.headers['x-test-role'],isAdmin:false};next();}}));
jest.unstable_mockModule('../services/chatwoot-bridge.service.js',()=>({chatwootBridge:{}}));
jest.unstable_mockModule('../services/crm-channel-integrations.service.js',()=>({listCrmChannelIntegrations:async()=>[],upsertCrmChannelIntegration:saved,testCrmChannelIntegration:checked,changeCrmChannelIntegration:changed}));
const hubNames=['acknowledgeCommunicationHubAlert','createCommunicationHubCampaign','createCommunicationHubTemplate','getCommunicationHubDashboard','getConversationThread','listCommunicationHubCampaigns','listCommunicationHubTemplates','listCrmCallActivity','listCrmCommunicationLog','recordCommunicationIntegrationHealth','sendCrmMessage','updateCommunicationHubCampaignStatus'];
jest.unstable_mockModule('../services/hospital-crm-communication-hub.service.js',()=>Object.fromEntries(hubNames.map(name=>[name,async()=>({})])));
const {default:router}=await import('../routes/hospital-crm-communication-hub.route.js');
const app=express();app.use(express.json());app.use('/hub',router);
afterEach(()=>jest.clearAllMocks());
for(const role of ['business_head','marketing_head','admin','marketing','telecaller','conversion','sales_rep'])describe(role,()=>{
 const allowed=['business_head','marketing_head','admin'].includes(role);
 test.each([['put','/integrations/email'],['post','/integrations/email/test'],['post','/integrations/email/disable'],['delete','/integrations/email'],['patch','/integrations/1/health']])('%s %s enforces configuration capability',async(method,path)=>{const r=await request(app)[method]('/hub'+path).set('X-Test-Role',role).send({});expect(r.status).toBe(allowed?200:403);if(!allowed){expect(saved).not.toHaveBeenCalled();expect(checked).not.toHaveBeenCalled();expect(changed).not.toHaveBeenCalled();}});
 test('inventory read remains available',async()=>{expect((await request(app).get('/hub/integrations').set('X-Test-Role',role)).status).toBe(200);});
});
