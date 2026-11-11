import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';
import ringFencing from '../middleware/ringFencing.js';

const paths = ['/api/v1/nursing/patients','/api/v1/nursing-ipd/context','/api/v1/echart/flowsheet/3','/api/v1/nursing-echart/flowsheet/3','/api/v1/emar/due','/api/v1/vitals/alerts'];
const adjacent = ['/api/v1/nursing-admin','/api/v1/hr','/api/v1/echart-admin'];

// A stub router per prefix, rather than one root-level catch-all. The fence
// now answers 404 for a path no router serves — it used to call that
// "insufficient privileges", which is how a never-written endpoint got filed
// as a permissions defect. A root catch-all is mounted at '/', so every prefix
// below would read as unmounted and these cases would stop testing the fence.
const app = express();
app.use(ringFencing);
for (const prefix of ['/api/v1/nursing','/api/v1/nursing-ipd','/api/v1/echart','/api/v1/nursing-echart','/api/v1/emar','/api/v1/vitals', ...adjacent]) {
  const stub = express.Router();
  stub.use((_req,res)=>res.sendStatus(204));
  app.use(prefix, stub);
}
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
  it.each(adjacent)('does not open adjacent route %s',async path=>{
    const response=await request(app).get(path).set('Authorization',`Bearer ${token('nurse')}`);
    expect(response.status).toBe(403);
  });
  it('answers not-found, not denied, for a path no router serves',async()=>{
    // Otherwise a missing endpoint is indistinguishable from a missing grant.
    const response=await request(app).get('/api/v1/not-a-real-module').set('Authorization',`Bearer ${token('nurse')}`);
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('ENDPOINT_NOT_FOUND');
  });
});
