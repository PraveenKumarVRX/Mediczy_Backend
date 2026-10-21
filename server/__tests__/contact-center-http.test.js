import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import { createContactCenterRouter, createContactCenterHooks } from '../routes/contact-center-http.js';
import { hasCRMCapability } from '../config/crm-roles.config.js';
describe('contact-center HTTP access boundary',()=>{
  let app,service;
  beforeEach(()=>{
    service={overview:jest.fn(async()=>({ok:true})),dial:jest.fn(async()=>({id:'call'})),configure:jest.fn(async()=>({ok:true})),reconcile:jest.fn(async()=>({ok:true})),ingest:jest.fn(async()=>({ok:true}))};
    app=express();app.use(express.json());
    app.use('/api/crm/contact-center',createContactCenterRouter({service,
      authenticate:(req,res,next)=>{if(!req.get('X-Test-Role'))return res.sendStatus(401);req.crmUser={id:1,tenantUid:req.get('X-Test-Tenant')||'HOSPITAL_11',crmRole:req.get('X-Test-Role')};next();},
      authorize:cap=>(req,res,next)=>hasCRMCapability(req.crmUser,cap)?next():res.sendStatus(403)}));
    app.use('/api/contact-center/hooks',createContactCenterHooks({service}));
  });
  it('requires authentication and an explicit contact-center role',async()=>{
    expect((await request(app).get('/api/crm/contact-center')).status).toBe(401);
    expect((await request(app).get('/api/crm/contact-center').set('X-Test-Role','sales_rep')).status).toBe(403);
    expect(service.overview).not.toHaveBeenCalled();
  });
  it('uses the authenticated tenant, never a caller-supplied query tenant',async()=>{
    const r=await request(app).get('/api/crm/contact-center?tenantUid=OTHER').set('X-Test-Role','telecaller');
    expect(r.status).toBe(200);expect(service.overview).toHaveBeenCalledWith('HOSPITAL_11');
  });
  it('denies a telecaller permission to configure provider credentials',async()=>{
    expect((await request(app).put('/api/crm/contact-center/config').set('X-Test-Role','telecaller').send({})).status).toBe(403);expect(service.configure).not.toHaveBeenCalled();
  });
  it('rejects caller-supplied tenant/agent overrides on dial',async()=>{
    const r=await request(app).post('/api/crm/contact-center/calls').set('X-Test-Role','telecaller').send({to:'+919876543210',tenantUid:'OTHER',agent_id:'another'});
    expect(r.status).toBe(400);expect(service.dial).not.toHaveBeenCalled();
  });
  it('requires and forwards a follow-up time for callback-required outcomes',async()=>{
    service.disposition=jest.fn(async()=>({ok:true}));const path='/api/crm/contact-center/calls/11111111-1111-4111-8111-111111111111/disposition';
    expect((await request(app).post(path).set('X-Test-Role','telecaller').send({disposition:'callback_required'})).status).toBe(400);
    const followup_at=new Date(Date.now()+86400000).toISOString();expect((await request(app).post(path).set('X-Test-Role','telecaller').send({disposition:'callback_required',followup_at})).status).toBe(200);expect(service.disposition).toHaveBeenCalledWith('HOSPITAL_11',expect.objectContaining({id:1}),expect.any(String),{disposition:'callback_required',followup_at});
  });
  it('dispatches native reconciliation to the media service without Exotel',async()=>{
    const media={reconcile:jest.fn(async()=>({state:'ready'}))};service.getCall=jest.fn(async()=>({id:'11111111-1111-4111-8111-111111111111',provider:'livekit',provider_sid:'cc-room'}));
    const scoped=express();scoped.use(express.json());scoped.use(createContactCenterRouter({service,media,authenticate:(req,res,next)=>{req.crmUser={id:1,tenantUid:'HOSPITAL_11'};next();},authorize:()=>(req,res,next)=>next()}));
    const response=await request(scoped).post('/calls/11111111-1111-4111-8111-111111111111/reconcile').send({});expect(response.status).toBe(200);expect(media.reconcile).toHaveBeenCalledWith('HOSPITAL_11','11111111-1111-4111-8111-111111111111');expect(service.reconcile).not.toHaveBeenCalled();
  });
  it('treats callbacks only as pointers to an account-verified provider record',async()=>{
    const r=await request(app).post('/api/contact-center/hooks/exotel/HOSPITAL_11').send({CallSid:'abc123abc123abc123',Status:'completed',RecordingUrl:'https://attacker.test'});
    expect(r.status).toBe(200);expect(service.reconcile).toHaveBeenCalledWith('HOSPITAL_11','abc123abc123abc123');
  });
});
