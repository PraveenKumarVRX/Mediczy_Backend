import {jest} from '@jest/globals';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
let role='admin';const query=jest.fn();
jest.unstable_mockModule('../middleware/auth.middleware.js',()=>({authUser:(req,res,next)=>{
  if(role==='anonymous')return res.sendStatus(401);
  req.user={id:7,role,isAdmin:role==='admin',isTeam:role==='team'};req.userRole=role;req.userType=role;next();
}}));
jest.unstable_mockModule('../middleware/authLab.middleware.js',()=>({authLab:(req,res,next)=>{req.lab={id:81};next();}}));
jest.unstable_mockModule('../db/postgres-sequelize.js',()=>({postgresSequelize:{query,QueryTypes:{SELECT:'SELECT'}}}));
jest.unstable_mockModule('../routes/admin-health-packages.route.js',()=>({default:(req,res)=>res.status(201).json({delegated:true})}));
const {default:router}=await import('../routes/health-package-kits.route.js');
const app=express();app.use(express.json());for(const path of ['/api/kits','/api/checkup-kits','/api/lab/kits'])app.use(path,router);
const plan={id:'hc-test',corporate_id:45,name:'AHC',features:{tests:['CBC']},price:50,currency:'INR',max_users:10,is_active:true,metadata:{status:'Active'}};
beforeEach(()=>{role='admin';query.mockReset();});
test.each(['/api/kits','/api/checkup-kits','/api/lab/kits'])('admin can list real packages through %s',async path=>{query.mockResolvedValueOnce([plan]);const r=await request(app).get(path);expect(r.status).toBe(200);expect(r.body.kits[0]).toMatchObject({corporateId:'45',tests:['CBC']});expect(r.body.packages).toEqual(r.body.kits);});
test.each(['user','anonymous'])('normal users remain denied: %s',async type=>{role=type;expect((await request(app).get('/api/kits')).status).toBe(type==='anonymous'?401:403);expect(query).not.toHaveBeenCalled();});
test('team requires an explicit corporate',async()=>{role='team';expect((await request(app).get('/api/kits')).status).toBe(400);expect(query).not.toHaveBeenCalled();});
test('unassigned team cannot list another corporate packages',async()=>{role='team';query.mockResolvedValueOnce([{id:45,companyName:'Dairy Day'}]).mockResolvedValueOnce([]);expect((await request(app).get('/api/kits?corporateId=45')).status).toBe(403);expect(query).toHaveBeenCalledTimes(2);});
test('assigned team package details stay corporate-scoped',async()=>{role='team';query.mockResolvedValueOnce([{id:45,companyName:'Dairy Day'}]).mockResolvedValueOnce([{allowed:1}]).mockResolvedValueOnce([plan]);const r=await request(app).get('/api/kits/hc-test?corporateId=45');expect(r.status).toBe(200);expect(query.mock.calls[2][1].replacements).toMatchObject({corporateId:45,id:'hc-test'});expect(query.mock.calls[2][0]).toContain('p.is_active=true');});
test('lab only sees packages from its mapped corporates',async()=>{query.mockResolvedValueOnce([plan]);const token=jwt.sign({role:'lab',id:81},'test-only-secret');const r=await request(app).get('/api/lab/kits').set('Authorization',`Bearer ${token}`);expect(r.status).toBe(200);expect(query.mock.calls[0][1].replacements.labId).toBe(81);expect(query.mock.calls[0][0]).toContain('a.partner_id=:labId');expect(query.mock.calls[0][0]).toContain('l."isVerified"=true');});
test('unmapped package detail is not disclosed',async()=>{query.mockResolvedValueOnce([]);expect((await request(app).get('/api/kits/missing')).status).toBe(404);});
test('admin mutations reuse existing package transaction API',async()=>{expect((await request(app).post('/api/checkup-kits').send({})).body.delegated).toBe(true);});
test('lab cannot mutate the catalog',async()=>{const token=jwt.sign({role:'lab',id:81},'test-only-secret');expect((await request(app).post('/api/lab/kits').set('Authorization',`Bearer ${token}`).send({})).status).toBe(403);expect(query).not.toHaveBeenCalled();});

describe('kit path fencing',()=>{
  let fenced,secret;
  beforeAll(async()=>{
    const {default:fence}=await import('../middleware/ringFencing.js');
    ({SECRET:secret}=(await import('../config/auth.config.js')).JWT_CONFIG);
    fenced=express();fenced.use(fence);fenced.use((req,res)=>res.json({ok:true}));
  });
  test.each(['admin','team','lab'])('allows %s through each kit alias',async role=>{
    const token=jwt.sign({id:7,userType:role,role},secret);
    for(const path of ['/api/kits','/api/checkup-kits','/api/lab/kits'])expect((await request(fenced).get(path).set('Authorization',`Bearer ${token}`)).status).toBe(200);
  });
  test('continues to deny ordinary employees',async()=>{
    const token=jwt.sign({id:7,userType:'user',role:'user'},secret);
    for(const path of ['/api/kits','/api/checkup-kits','/api/lab/kits'])expect((await request(fenced).get(path).set('Authorization',`Bearer ${token}`)).status).toBe(403);
  });
});
