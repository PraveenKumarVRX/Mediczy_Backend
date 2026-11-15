import express from 'express';
import request from 'supertest';
import ringFencing from '../middleware/ringFencing.js';
const app=express();app.use(ringFencing);app.use((_req,res)=>res.sendStatus(204));
describe('dedicated installation connector global fence',()=>{
  it('passes only the exact report POST and config GET to machine-credential authentication',async()=>{
    expect((await request(app).post('/api/admin/dedicated-installations/reports')).status).toBe(204);
    expect((await request(app).get('/api/admin/dedicated-installations/config')).status).toBe(204);
  });
  it.each([
    ['get','/api/admin/dedicated-installations/reports'],
    ['post','/api/admin/dedicated-installations/reports/extra'],
    ['post','/api/admin/dedicated-installations/reports-extra'],
    ['post','/api/admin/dedicated-installations/config'],
    ['get','/api/admin/dedicated-installations/config/extra'],
    ['get','/api/admin/dedicated-installations/config-extra'],
    ['get','/api/admin/dedicated-installations'],
    ['post','/api/admin/dedicated-installations'],
    ['post','/api/admin/dedicated-installations/32ebb22b-8299-4174-8d42-83fb7b076c0d/connector/rotate'],
  ])('keeps %s %s behind user authentication',async(method,path)=>{
    expect((await request(app)[method](path)).status).toBe(401);
  });
});
