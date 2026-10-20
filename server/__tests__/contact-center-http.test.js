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
  it('treats callbacks only as pointers to an account-verified provider record',async()=>{
    const r=await request(app).post('/api/contact-center/hooks/exotel/HOSPITAL_11').send({CallSid:'abc123abc123abc123',Status:'completed',RecordingUrl:'https://attacker.test'});
    expect(r.status).toBe(200);expect(service.reconcile).toHaveBeenCalledWith('HOSPITAL_11','abc123abc123abc123');
  });
});
