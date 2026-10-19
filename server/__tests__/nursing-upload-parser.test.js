import express from 'express';
import request from 'supertest';
import fileUpload from 'express-fileupload';
import multer from 'multer';
import { NURSING_IMAGE_UPLOAD_PATHS } from '../utils/nursing-upload-paths.js';

const app=express();
const shared=fileUpload({useTempFiles:false});
app.use((req,res,next)=>NURSING_IMAGE_UPLOAD_PATHS.some(p=>req.path===p||req.path.startsWith(p+'/'))?next():shared(req,res,next));
const nursing=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1,fields:1}}).single('image');
for(const path of NURSING_IMAGE_UPLOAD_PATHS)app.post(path,(req,res)=>nursing(req,res,error=>error?res.status(422).json({code:'INVALID_UPLOAD'}):res.status(201).json({admissionId:req.body.admissionId,bytes:req.file.buffer.length})));
app.post('/api/legacy-upload',(req,res)=>res.json({bytes:req.files.image.data.length}));
describe('nursing multipart stream ownership',()=>{
  it.each(NURSING_IMAGE_UPLOAD_PATHS)('retains the image stream for the protected parser at %s',async path=>{
    const response=await request(app).post(path).field('admissionId','3').attach('image',Buffer.from([137,80,78,71]),'synthetic.png');
    expect(response.status).toBe(201);expect(response.body).toEqual({admissionId:'3',bytes:4});
  });
  it('rejects more than one image',async()=>{
    const response=await request(app).post(NURSING_IMAGE_UPLOAD_PATHS[0]).attach('image',Buffer.from('one'),'one.png').attach('image',Buffer.from('two'),'two.png');
    expect(response.status).toBe(422);
  });
  it('preserves ownership of legacy express-fileupload routes',async()=>{
    const response=await request(app).post('/api/legacy-upload').attach('image',Buffer.from('old'),'synthetic.png');
    expect(response.status).toBe(200);expect(response.body.bytes).toBe(3);
  });
});
