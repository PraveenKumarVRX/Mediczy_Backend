import {jest} from '@jest/globals';
const tx={},query=jest.fn(),transaction=jest.fn(async fn=>fn(tx)),upload=jest.fn(),remove=jest.fn(),ensure=jest.fn();
jest.unstable_mockModule('../db/postgres-sequelize.js',()=>({postgresSequelize:{query,transaction,QueryTypes:{SELECT:'SELECT'}}}));
jest.unstable_mockModule('../services/corporate-storage.service.js',()=>({ensureCorporateHealthReportsBucket:ensure}));
jest.unstable_mockModule('../services/minio-upload.service.js',()=>({uploadToMinio:upload}));
jest.unstable_mockModule('../services/corporate-report-storage-client.js',()=>({getCorporateReportClient:()=>({}),corporateStoredFileUrl:()=>'',deleteCorporateReportObject:remove}));
const {saveCorporateHealthReports:save}=await import('../services/corporate-health-reports.service.js');
const file={originalname:'test.pdf',mimetype:'application/pdf',buffer:Buffer.from('%PDF-test'),size:9};
const input={corporateId:45,employeeId:9,uploadedBy:7,files:Array.from({length:7},()=>({...file})),reportName:'Annual health checkup',reportType:'annual_health_checkup',reportDate:'2026-10-28',notes:'',corporateName:'Corporate',reportLabel:'Annual health checkup',checkupCompletedAt:new Date('2026-10-28'),deliveredAt:new Date('2026-10-28'),sla:{dueAt:new Date('2026-10-30'),status:'on_time'},patientReportType:()=> 'lab'};
beforeEach(()=>{
 query.mockReset();transaction.mockClear();upload.mockReset();remove.mockReset().mockResolvedValue({});ensure.mockReset().mockResolvedValue({bucket:'pacs-entity-001'});
 let id=0,index=0;query.mockImplementation(async(sql)=>sql.startsWith('INSERT')?[{id:++id}]:sql.includes('user_associations')?[{exists:1}]:[]);
 upload.mockImplementation(async()=>({key:`test-${++index}`,url:'https://storage.test/file'}));
});
test('seven files produce seven paired records in one corporate-scoped transaction',async()=>{
 const result=await save(input);expect(result).toHaveLength(7);expect(upload).toHaveBeenCalledTimes(7);expect(query.mock.calls.filter(([sql])=>sql.startsWith('INSERT'))).toHaveLength(14);
 expect(query.mock.calls.every(([,o])=>o.transaction===tx)).toBe(true);expect(query.mock.calls.slice(0,3).map(([,o])=>o.replacements)).toEqual([{orgId:'45'},{userId:'7'},{isPlatformAdmin:'false'}]);
 const patient=query.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO reports'))[1].replacements;expect(patient.corporateId).toBe(45);expect(JSON.parse(patient.metadata)).toMatchObject({storageBackend:'corporate_minio',bucket:'pacs-entity-001',source:'team_corporate_health_upload'});expect(remove).not.toHaveBeenCalled();
});
test('a later database failure rejects the whole batch and attempts cleanup only for its new objects',async()=>{
 let count=0;query.mockImplementation(async sql=>{if(sql.startsWith('INSERT INTO reports')&&++count===2)throw new Error('database unavailable');return sql.startsWith('INSERT')?[{id:1}]:sql.includes('user_associations')?[{exists:1}]:[];});
 await expect(save(input)).rejects.toThrow('database unavailable');expect(remove.mock.calls).toEqual([['test-1','pacs-entity-001'],['test-2','pacs-entity-001']]);
});
test('a storage outage returns a meaningful retryable error',async()=>{
 upload.mockRejectedValueOnce(Object.assign(new Error('UnknownError'),{$metadata:{httpStatusCode:530}}));await expect(save(input)).rejects.toMatchObject({status:503,code:'REPORT_STORAGE_UNAVAILABLE'});
});
test('antivirus rejection never inserts report records',async()=>{
 upload.mockRejectedValueOnce(Object.assign(new Error('malware'),{code:'MALWARE_DETECTED'}));await expect(save(input)).rejects.toMatchObject({code:'MALWARE_DETECTED'});expect(query.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
});
test('employees outside the corporate never trigger a storage upload',async()=>{
 query.mockResolvedValue([]);await expect(save(input)).rejects.toMatchObject({status:403});expect(upload).not.toHaveBeenCalled();
});
test.each([{reportDate:'2026-02-30'},{employeeId:0},{files:[]},{files:Array(11).fill(file)},{files:[{...file,size:51*1024*1024}]}])('validates batch before opening a transaction: %j',async patch=>{
 await expect(save({...input,...patch})).rejects.toBeDefined();expect(transaction).not.toHaveBeenCalled();
});

// Pre-employment screening has its own candidate workflow (PEME). Routing one
// through the corporate employee pipeline would file a candidate's report
// against an employee record that may not exist yet, so the service refuses it
// outright — before any upload, transaction or insert.
test('a pre-employment report is sent to the PEME workflow, not filed here', async () => {
  await expect(save({ ...input, reportType: 'pre_employment' }))
    .rejects.toMatchObject({ status: 409, code: 'peme_case_required' });
  expect(upload).not.toHaveBeenCalled();
  expect(transaction).not.toHaveBeenCalled();
});

test('the refusal matches the type however it is written', async () => {
  for (const reportType of ['pre_employment', 'PRE_EMPLOYMENT', 'candidate_pre_employment_screening']) {
    await expect(save({ ...input, reportType })).rejects.toMatchObject({ code: 'peme_case_required' });
  }
});
