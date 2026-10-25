import { createHash,randomUUID } from 'node:crypto';
import { mkdir,writeFile,unlink } from 'node:fs/promises';
import { resolve,join } from 'node:path';
const fail=(statusCode,message)=>Object.assign(new Error(message),{statusCode});
export function attachmentMime(buffer) {
 if(buffer.subarray(0,5).toString()==='%PDF-')return 'application/pdf';
 if(buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(buffer[0]===255&&buffer[1]===216&&buffer[2]===255)return 'image/jpeg';
 if(/^GIF8[79]a/.test(buffer.subarray(0,6).toString()))return 'image/gif';
 if(buffer.subarray(0,4).toString()==='RIFF'&&buffer.subarray(8,12).toString()==='WEBP')return 'image/webp';
 try {const text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);if(!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))return 'text/plain';}catch{}
 throw fail(400,'Use a PDF, PNG, JPEG, GIF, WebP or UTF-8 text file');
}
export class WorkspaceAttachments {
 constructor(workspace,root){this.workspace=workspace;this.root=root?resolve(root):null;}
 path(tenantUid,id){if(!this.root)throw fail(503,'Attachment storage is not configured');if(!/^[a-f0-9-]{36}$/.test(id))throw fail(404,'Attachment not found');return join(this.root,createHash('sha256').update(tenantUid).digest('hex'),id);}
 async upload(ctx,roomId,file){
  await this.workspace.member(this.workspace.pool,ctx,roomId);
  if(!file?.buffer?.length||file.buffer.length>8388608)throw fail(400,'Choose a file up to 8 MB');
  const mime=attachmentMime(file.buffer),id=randomUUID(),path=this.path(ctx.tenantUid,id);
  const name=String(file.originalname||'attachment').replace(/[\x00-\x1f\x7f/\\]/g,'_').slice(0,180);
  await mkdir(resolve(path,'..'),{recursive:true,mode:0o700});await writeFile(path,file.buffer,{flag:'wx',mode:0o600});
  try{await this.workspace.pool.query(`INSERT INTO communication_workspace_attachments(id,tenant_uid,room_id,uploaded_by,name,mime,bytes) VALUES($1,$2,$3,$4,$5,$6,$7)`,[id,ctx.tenantUid,roomId,ctx.userId,name,mime,file.buffer.length]);}
  catch(error){await unlink(path).catch(()=>{});throw error;}
  return {id,name,mime,bytes:file.buffer.length};
 }
 async download(ctx,roomId,id){
  await this.workspace.member(this.workspace.pool,ctx,roomId);const path=this.path(ctx.tenantUid,id);
  const {rows:[file]}=await this.workspace.pool.query(`SELECT name,mime,bytes FROM communication_workspace_attachments WHERE tenant_uid=$1 AND room_id=$2 AND id=$3`,[ctx.tenantUid,roomId,id]);
  if(!file)throw fail(404,'Attachment not found');return {...file,path};
 }
}
