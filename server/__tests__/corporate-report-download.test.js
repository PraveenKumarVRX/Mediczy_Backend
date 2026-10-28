import {jest} from '@jest/globals';
import express from 'express';import request from 'supertest';
const findOne=jest.fn(),findAll=jest.fn(),count=jest.fn(),create=jest.fn(),sign=jest.fn(),decrypt=jest.fn(),encryptedUpload=jest.fn(),writeFile=jest.fn();
const client={};let userId=9;
jest.unstable_mockModule('../middleware/auth.middleware.js',()=>({authUser:(req,_res,next)=>{req.user={id:userId,role:'user'};next();}}));
jest.unstable_mockModule('../models/index.js',()=>({Report:{findOne,findAll,count,create}}));
jest.unstable_mockModule('../services/corporate-report-storage-client.js',()=>({corporateReportDownloadUrl:sign,getCorporateReportClient:()=>client,corporateStoredFileUrl:()=>''}));
jest.unstable_mockModule('../services/minio-upload.service.js',()=>({uploadEncryptedReport:encryptedUpload,downloadDecryptedReport:decrypt}));
jest.unstable_mockModule('../services/n8n.service.js',()=>({default:{healthReportReady:jest.fn().mockResolvedValue({})}}));
jest.unstable_mockModule('../services/health-diary.service.js',()=>({default:{logHealthEvent:jest.fn()}}));
jest.unstable_mockModule('../services/report-analysis.service.js',()=>({analyzeReport:jest.fn().mockResolvedValue({analysis:{}})}));
jest.unstable_mockModule('fs/promises',()=>({default:{mkdir:jest.fn(),writeFile}}));
const {default:router}=await import('../routes/reports.route.js');const app=express();app.use(express.json());app.use(router);
const report={id:1,userId:9,fileName:'report.pdf',filePath:'health-reports/corp-45/emp-9/report.pdf',fileUrl:'https://storage/private/report.pdf',mimeType:'application/pdf',metadata:{storageBackend:'corporate_minio',bucket:'pacs-entity-001'}};
beforeEach(()=>{userId=9;for(const f of [findOne,findAll,count,create,sign,decrypt,encryptedUpload,writeFile])f.mockReset();sign.mockResolvedValue('https://storage.example/signed-report');});
test('owner download gets a fresh signed URL for the private PACS object',async()=>{
 findOne.mockResolvedValue(report);const result=await request(app).get('/download/1');expect(result.status).toBe(302);expect(result.headers.location).toBe('https://storage.example/signed-report');expect(findOne.mock.calls[0][0].where).toEqual({id:'1',userId:9});expect(sign).toHaveBeenCalledWith(report.filePath,'pacs-entity-001');
});
test('encrypted PACS reports use the PACS client and are decrypted before responding',async()=>{
 findOne.mockResolvedValue({...report,metadata:{...report.metadata,encryption:{iv:'iv',authTag:'tag'}}});decrypt.mockResolvedValue({buffer:Buffer.from('decrypted'),mimeType:'application/pdf'});
 const result=await request(app).get('/download/1');expect(result.status).toBe(200);expect(decrypt.mock.calls[0][0].client).toBe(client);expect(sign).not.toHaveBeenCalled();
});
test('a different employee cannot obtain a download link',async()=>{
 userId=10;findOne.mockImplementation(async({where})=>where.userId===report.userId?report:null);expect((await request(app).get('/download/1')).status).toBe(404);expect(sign).not.toHaveBeenCalled();
});
test('employee listing signs new private reports and keeps legacy links unchanged',async()=>{
 findAll.mockResolvedValue([report,{...report,id:2,metadata:{},fileUrl:'https://legacy.example/report.pdf'}]);count.mockResolvedValue(2);
 const result=await request(app).get('/');expect(result.status).toBe(200);expect(result.body.data[0].fileUrl).toBe('https://storage.example/signed-report');expect(result.body.data[1].fileUrl).toBe('https://legacy.example/report.pdf');
});
test.each([['MALWARE_DETECTED',400],['AV_SCAN_UNAVAILABLE',503]])('antivirus failure %s cannot fall through to a local plaintext save',async(code,status)=>{
 encryptedUpload.mockRejectedValue(Object.assign(new Error('scan rejected'),{code}));const result=await request(app).post('/').field('reportType','lab').attach('file',Buffer.from('%PDF-synthetic'),'synthetic.pdf');expect(result.status).toBe(status);expect(writeFile).not.toHaveBeenCalled();expect(create).not.toHaveBeenCalled();
});

test('storage outages do not create local plaintext report fallbacks',async()=>{encryptedUpload.mockRejectedValue(new Error('Storage offline'));const result=await request(app).post('/').field('reportType','lab').attach('file',Buffer.from('%PDF-synthetic'),'synthetic.pdf');expect(result.status).toBe(503);expect(writeFile).not.toHaveBeenCalled();expect(create).not.toHaveBeenCalled();});

test('new employee uploads select the PACS client and retain encryption metadata',async()=>{const previousEndpoint=process.env.PACS_ARCHIVE_MINIO_ENDPOINT,previousBucket=process.env.PACS_ARCHIVE_MINIO_BUCKET;process.env.PACS_ARCHIVE_MINIO_ENDPOINT='https://storage.example';process.env.PACS_ARCHIVE_MINIO_BUCKET='pacs-entity-001';try{encryptedUpload.mockResolvedValue({key:'uploads/reports/9/report.enc',url:'https://storage.example/private/report.enc',bucket:'pacs-entity-001',encryption:{iv:'iv',authTag:'tag'},size:12,originalSize:10,compressedSize:10,compressionMethod:'none'});create.mockImplementation(async data=>({...data,id:1}));const result=await request(app).post('/').field('reportType','lab').attach('file',Buffer.from('%PDF-synthetic'),'synthetic.pdf');expect(result.status).toBe(201);expect(encryptedUpload.mock.calls[0][0]).toMatchObject({bucket:'pacs-entity-001',client});expect(create.mock.calls[0][0].metadata).toMatchObject({storageBackend:'corporate_minio',encryption:{iv:'iv',authTag:'tag'},fallbackStorage:false});}finally{if(previousEndpoint===undefined)delete process.env.PACS_ARCHIVE_MINIO_ENDPOINT;else process.env.PACS_ARCHIVE_MINIO_ENDPOINT=previousEndpoint;if(previousBucket===undefined)delete process.env.PACS_ARCHIVE_MINIO_BUCKET;else process.env.PACS_ARCHIVE_MINIO_BUCKET=previousBucket;}});
