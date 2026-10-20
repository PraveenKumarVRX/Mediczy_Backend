import express from 'express';
import request from 'supertest';
import ringFencing from '../middleware/ringFencing.js';
const app=express();app.use(ringFencing);app.use((_req,res)=>res.sendStatus(204));
describe('contact-center global fence exceptions',()=>{
  it.each(['exotel','gateway','livekit','agent','guest'])('only passes exact POST %s hooks to their own verifier',async provider=>{
    expect((await request(app).post(`/api/contact-center/hooks/${provider}/HOSPITAL_11`)).status).toBe(204);
    expect((await request(app).get(`/api/contact-center/hooks/${provider}/HOSPITAL_11`)).status).toBe(401);
    expect((await request(app).post(`/api/contact-center/hooks/${provider}/HOSPITAL_11/admin`)).status).toBe(401);
  });
  it('continues fencing the operator API',async()=>{
    expect((await request(app).get('/api/crm/contact-center')).status).toBe(401);
  });
});
