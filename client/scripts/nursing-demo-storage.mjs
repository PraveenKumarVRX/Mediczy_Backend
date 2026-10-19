#!/usr/bin/env node
import {readFileSync,writeFileSync} from 'node:fs';import {resolve,join} from 'node:path';import assert from 'node:assert/strict';
const base=process.env.NURSING_LIVE_BASE_URL,dir=resolve(process.env.NURSING_DEMO_EVIDENCE_DIR||'');
if(!base||new URL(base).protocol!=='https:'||!process.env.NURSING_DEMO_EVIDENCE_DIR)throw new Error('Explicit demo URL and private evidence directory required');
const demo=JSON.parse(readFileSync(join(dir,'demo-provisioning.json'))),[account]=JSON.parse(readFileSync(join(dir,'demo-access.private.json')));assert.equal(demo.simulationOnly,true);
const record={at:new Date().toISOString(),simulationOnly:true,clinicalAcceptance:false,status:'failed'};
try{
 const login=await fetch(base+'/api/nurse/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(account)});assert.equal(login.status,200);const auth=await login.json();
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z5WkAAAAASUVORK5CYII=','base64');
 const form=new FormData();form.set('admissionId',String(demo.admissionId));form.set('image',new Blob([bytes],{type:'image/png'}),'SIMULATION-ONLY-one-pixel.png');
 const upload=await fetch(base+'/api/v1/nursing/images',{method:'POST',headers:{Authorization:`Bearer ${auth.token}`},body:form});const image=await upload.json();assert.equal(upload.status,201,`Image upload failed: ${image.code||image.message}`);
 const read=await fetch(base+`/api/v1/nursing/images/${image.data.id}`,{headers:{Authorization:`Bearer ${auth.token}`}});assert.equal(read.status,200);const signed=await read.json();assert.equal(signed.data.expiresIn,60);
 const object=await fetch(signed.data.url);assert.equal(object.status,200);assert.deepEqual(Buffer.from(await object.arrayBuffer()),bytes);
 const unsigned=new URL(signed.data.url);unsigned.search='';const denied=await fetch(unsigned);assert.equal(denied.status,403);
 record.imageId=image.data.id;record.checks=['Real nurse API uploaded one synthetic PNG to private storage','Authorized API issued a 60-second signed read','Signed read returned the exact synthetic bytes','Unsigned object read was denied'];record.status='passed';
}catch(error){record.error=error.message;process.exitCode=1;}
finally{writeFileSync(join(dir,'demo-live-storage-walkthrough.json'),JSON.stringify(record,null,2)+'\n',{mode:0o600});}
console.log(JSON.stringify(record,null,2));
