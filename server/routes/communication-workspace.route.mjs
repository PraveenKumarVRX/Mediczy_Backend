import express from 'express';
import multer from 'multer';
import { WorkspaceAttachments } from '../services/communication-workspace-attachments.mjs';
import { CommunicationWorkspace } from '../services/communication-workspace.service.mjs';

/** Authenticator and scope resolver are portal-specific, never selected from JWT claims. */
export function buildCommunicationWorkspaceRouter({ pool, authenticate, resolveScope, canWrite=()=>true, enabledTenants=()=>process.env.COMMUNICATION_WORKSPACE_ENABLED_TENANTS||'', attachmentRoot=process.env.COMMUNICATION_WORKSPACE_UPLOAD_DIR,channelWorkspace }) {
 const router=express.Router(), workspace=new CommunicationWorkspace(pool);
 const attachments=new WorkspaceAttachments(workspace,attachmentRoot), upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8388608,files:1,fields:0}});
 router.use(authenticate);
 router.use(async(req,res,next)=>{
  try {
   req.workspace=await resolveScope(req);
   if(!req.workspace?.tenantUid||!req.workspace?.userId)return res.status(403).json({success:false,message:'Select an authorised organisation to open communication'});
   const allowed=new Set(enabledTenants().split(',').map(value=>value.trim()).filter(Boolean));
   if(!allowed.has(req.workspace.tenantUid)){
    if(req.method==='GET'&&req.path==='/capabilities')return res.json({success:true,data:{enabled:false}});
    return res.status(404).json({success:false,message:'Workspace is not enabled for this organisation'});
   }
   next();
  }catch(error){next(error);}
 });
 const action=handler=>async(req,res,next)=>{try{res.json({success:true,data:await handler(req)});}catch(error){next(error);}};
 router.get('/capabilities',action(req=>({enabled:true,tenantUid:req.workspace.tenantUid,userId:req.workspace.userId,canWrite:canWrite(req),channels:{chat:true},attachments:Boolean(attachmentRoot)})));
 if(channelWorkspace)for(const [path,health] of [['/chatwoot',false],['/chatwoot/health',true]])router.get(path,action(req=>channelWorkspace(req.workspace,health)));
 router.get('/members',action(req=>workspace.directory(req.workspace)));
 router.get('/rooms',action(req=>workspace.list(req.workspace)));
 router.get('/rooms/:id/messages',action(req=>workspace.thread(req.workspace,req.params.id,req.query)));
 router.get('/rooms/:id/attachments/:file',async(req,res,next)=>{try{const file=await attachments.download(req.workspace,req.params.id,req.params.file);res.set('X-Content-Type-Options','nosniff');res.set('Cache-Control','private, no-store');res.download(file.path,file.name,error=>{if(error&&!res.headersSent)next(error);});}catch(error){next(error);}});
 router.post('/rooms/:id/read',action(req=>workspace.read(req.workspace,req.params.id,req.body.sequence)));
 router.use((req,res,next)=>req.method==='GET'||canWrite(req)?next():res.status(403).json({success:false,message:'Communication write permission is required'}));
 router.post('/rooms/:id/attachments',upload.single('file'),action(req=>attachments.upload(req.workspace,req.params.id,req.file)));
 router.post('/rooms',action(req=>workspace.create(req.workspace,req.body)));
 router.post('/rooms/:id/messages',action(req=>workspace.send(req.workspace,req.params.id,req.body)));
 router.use((error,_req,res,_next)=>res.status(error.code==='LIMIT_FILE_SIZE'?413:error.statusCode||503).json({success:false,message:error.statusCode?error.message:'Communication workspace unavailable'}));
 return router;
}
