import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';
import ringFencing from '../middleware/ringFencing.js';

const paths = ['/api/v1/nursing/patients','/api/v1/nursing-ipd/context','/api/v1/echart/flowsheet/3','/api/v1/nursing-echart/flowsheet/3','/api/v1/emar/due','/api/v1/vitals/alerts'];
const app = express();
app.use(ringFencing);
app.use((_req,res)=>res.sendStatus(204));
const token = role => jwt.sign({id:6,role,userType:role,tenant_id:11},JWT_CONFIG.SECRET,{expiresIn:'1m'});
describe('nursing APIs cross the global role fence before admission authorization',()=>{
  it.each(paths)('allows the nurse role to reach %s',async path=>{
    const response=await request(app).get(path).set('Authorization',`Bearer ${token('nurse')}`);
    expect(response.status).toBe(204);
  });
  it.each(paths)('continues denying a patient role at %s',async path=>{
    const response=await request(app).get(path).set('Authorization',`Bearer ${token('user')}`);
    expect(response.status).toBe(403);
  });
  it.each(['/api/v1/nursing-admin','/api/v1/hr','/api/v1/echart-admin'])('does not open adjacent route %s',async path=>{
    const response=await request(app).get(path).set('Authorization',`Bearer ${token('nurse')}`);
    expect(response.status).toBe(403);
  });
});
