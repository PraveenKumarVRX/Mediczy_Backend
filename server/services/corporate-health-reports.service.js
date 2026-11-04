import {postgresSequelize as db} from '../db/postgres-sequelize.js';
import {setRlsContext} from '../middleware/rls-context.middleware.js';
import {ensureCorporateHealthReportsBucket} from './corporate-storage.service.js';
import {uploadToMinio} from './minio-upload.service.js';
import {getCorporateReportClient,corporateStoredFileUrl,deleteCorporateReportObject} from './corporate-report-storage-client.js';
const issue=(message,status=400)=>Object.assign(new Error(message),{status});
export async function saveCorporateHealthReports(input){
  const uploaded=[];
  if(String(input.reportType||'').toLowerCase().includes('pre_employment')){
    throw Object.assign(new Error('Pre-employment reports belong to the candidate PEME workflow, not corporate employee health reports'),{status:409,code:'peme_case_required'});
  }
  const corporateId=Number(input.corporateId),employeeId=Number(input.employeeId);
  if(!Number.isSafeInteger(corporateId)||corporateId<1||!Number.isSafeInteger(employeeId)||employeeId<1)throw issue('A valid corporate and employee are required');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(input.reportDate)||Number.isNaN(Date.parse(input.reportDate))||new Date(input.reportDate).toISOString().slice(0,10)!==input.reportDate)throw issue('Provide a valid report date');
  if(!Array.isArray(input.files)||!input.files.length||input.files.length>10)throw issue('Select between 1 and 10 reports');
  if(input.files.reduce((total,f)=>total+f.size,0)>50*1024*1024)throw issue('The combined reports must be 50 MB or smaller',413);
  try{
    return await db.transaction(async transaction=>{
      const q=(sql,replacements={})=>db.query(sql,{replacements,transaction,type:db.QueryTypes.SELECT});
      await setRlsContext(transaction,{orgId:corporateId,userId:input.uploadedBy,isPlatformAdmin:false});
      const [member]=await q(`SELECT 1 FROM user_associations WHERE "userId"=:employeeId AND "entityId"=:corporateId AND "entityType"='corporate' AND role='employee' AND status='active' LIMIT 1 FOR SHARE`,{employeeId,corporateId});
      if(!member)throw issue('Employee is not assigned to this corporate',403);
      if(input.labOrderId){const [order]=await q('SELECT id FROM lab_orders WHERE id=:id AND patient_id=:employeeId AND organization_id=:corporateId',{id:input.labOrderId,employeeId,corporateId});if(!order)throw issue('Lab order does not belong to this employee and corporate');}
      const {bucket}=await ensureCorporateHealthReportsBucket(corporateId);
      for(const file of input.files){
        const name=(input.files.length===1?input.reportName:`${input.reportName} — ${file.originalname.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ')}`).slice(0,255);
        const stored=await uploadToMinio({buffer:file.buffer,originalName:file.originalname,mimeType:file.mimetype,keyPrefix:`health-reports/corp-${corporateId}/emp-${employeeId}`,bucket,client:getCorporateReportClient(),buildUrl:corporateStoredFileUrl});
        uploaded.push({key:stored.key,bucket});
        const [corporateReport]=await q(`INSERT INTO corporate_health_reports (corporate_id,employee_id,lab_order_id,report_name,report_type,report_date,s3_key,report_url,file_size_bytes,mime_type,notes,uploaded_by,checkup_type,checkup_completed_at,report_due_at,report_delivered_at,sla_status,created_at,updated_at)
          VALUES (:corporateId,:employeeId,:labOrderId,:name,:reportType,:reportDate,:key,:url,:size,:mimeType,:notes,:uploadedBy,:reportType,:completedAt,:dueAt,:deliveredAt,:slaStatus,NOW(),NOW()) RETURNING id,report_due_at,sla_status`,
          {corporateId,employeeId,labOrderId:input.labOrderId||null,name,reportType:input.reportType,reportDate:input.reportDate,key:stored.key,url:stored.url,size:file.size,mimeType:file.mimetype,notes:input.notes,uploadedBy:input.uploadedBy,completedAt:input.checkupCompletedAt,dueAt:input.sla.dueAt,deliveredAt:input.deliveredAt,slaStatus:input.sla.status});
        const [patientReport]=await q(`INSERT INTO reports ("userId",organization_id,"fileName","fileSize","mimeType","filePath","fileUrl","reportType",description,"testName","labName","reportDate",status,"uploadedAt","analysisStatus",metadata,"createdAt","updatedAt")
          VALUES (:employeeId,:corporateId,:fileName,:size,:mimeType,:key,:url,:patientReportType,:description,:name,:labName,:reportDate,'active',NOW(),'pending',CAST(:metadata AS JSONB),NOW(),NOW()) RETURNING id`,
          {employeeId,corporateId,fileName:file.originalname,size:file.size,mimeType:file.mimetype,key:stored.key,url:stored.url,patientReportType:input.patientReportType(file.mimetype),description:input.notes||`${input.reportLabel} uploaded by ${input.corporateName||'corporate health team'}`,name,labName:input.corporateName||'Corporate health check-up',reportDate:input.reportDate,metadata:JSON.stringify({source:'team_corporate_health_upload',corporateId,corporateHealthReportId:corporateReport.id,corporateReportType:input.reportType,checkupType:input.reportType,uploadedByTeamUserId:input.uploadedBy,labOrderId:input.labOrderId||null,bucket,s3Key:stored.key,storageBackend:'corporate_minio'})});
        Object.assign(uploaded.at(-1),{id:corporateReport.id,patientReportId:patientReport.id,reportName:name,reportUrl:stored.url,mimeType:file.mimetype,reportDueAt:corporateReport.report_due_at||input.sla.dueAt,slaStatus:corporateReport.sla_status||input.sla.status});
      }
      return uploaded;
    });
  }catch(error){
    const cleanup=await Promise.allSettled(uploaded.map(f=>deleteCorporateReportObject(f.key,f.bucket)));
    if(cleanup.some(r=>r.status==='rejected'))console.error('[corp-reports] Storage cleanup requires retry for failed upload batch',{objects:uploaded.length,failed:cleanup.filter(r=>r.status==='rejected').length});
    if(error.status||error.code==='MALWARE_DETECTED'||error.code==='AV_SCAN_UNAVAILABLE')throw error;
    if(error.$metadata)throw Object.assign(new Error('Report storage is temporarily unavailable. No reports were saved. Please retry.'),{status:503,code:'REPORT_STORAGE_UNAVAILABLE',cause:error});
    throw error;
  }
}
