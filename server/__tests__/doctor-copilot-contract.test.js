import {jest,beforeAll,it,expect} from '@jest/globals';
import express from 'express';
import request from 'supertest';
const medical=express.Router();medical.post('/consult',(req,res)=>res.json({received:req.body}));
const voice=express.Router();voice.post('/agent',(req,res)=>res.json({agent:true,received:req.body}));
jest.unstable_mockModule('../routes/medical-ai.route.js',()=>({default:medical}));
jest.unstable_mockModule('../routes/voice-assistant.route.js',()=>({default:voice}));
jest.unstable_mockModule('../services/patient-access.service.js',()=>({canAccessPatient:async()=>true}));
jest.unstable_mockModule('../db/pgPool.js',()=>({default:{query:async()=>({rows:[{unique_id:'P12345'}]})}}));
jest.unstable_mockModule('../services/ai-quality-gates.service.js',()=>({default:{logCopilotConversation:async()=>{}}}));
jest.unstable_mockModule('../middleware/auth.middleware.js',()=>({authUser:(req,res,next)=>{req.user={id:7,role:req.get('x-role')||'doctor'};req.userRole=req.user.role;next();},requireRole:()=> (req,res,next)=>next()}));
let app;beforeAll(async()=>{app=express().use(express.json()).use((await import('../routes/doctor-copilot.route.js')).default);});
it('uses registered chart scope and lets the canonical service issue a fresh session',async()=>{
 const result=await request(app).post('/chat').send({message:'Drug side effects',mode:'clinical',context:{currentPatient:{id:12},userRole:'admin'},sessionId:'copilot_legacy'});
 expect(result.status).toBe(200);
 expect(result.body.received.userContext).toEqual({patientUid:'P12345',channel:'doctor_copilot'});
 expect(result.body.received).not.toHaveProperty('sessionId');
});
it('does not give administrative users clinical authority',async()=>{
 const result=await request(app).post('/chat').set('x-role','admin').send({message:'Drug side effects',mode:'clinical'});
 expect(result.body.agent).toBe(true);
});
