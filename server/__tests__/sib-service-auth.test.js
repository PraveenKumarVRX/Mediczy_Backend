import { beforeAll, afterAll, it, expect } from '@jest/globals';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { sibHeaders } from '../services/sib-client.js';
let child, url;
const secret = 'isolated-integration-test-service-secret-123456';
beforeAll(async () => {
  child = spawn('python3', [resolve('tests/helpers/sib-auth-fixture.py')], {
    env: { ...process.env, PYTHONPATH: resolve('../ai-engine/doctor_bot'), SIB_SERVICE_SECRET: secret }, stdio: ['ignore','pipe','pipe'],
  });
  const port = await new Promise((resolve,reject) => {
    const timer=setTimeout(()=>reject(new Error('ASGI fixture timeout')),10000);
    child.stdout.once('data',chunk=>{clearTimeout(timer);resolve(Number(String(chunk).trim()));});
    child.once('exit',code=>reject(new Error(`ASGI exited ${code}`)));
  });
  url=`http://127.0.0.1:${port}/chat`;
  for (let i=0;i<50;i++) {
    try { if ((await fetch(url.replace('/chat','/health'))).ok) return; } catch {}
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  throw new Error('ASGI did not become ready');
},15000);
afterAll(async()=>{ if(child && child.exitCode===null){const ended=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await ended;} });

it('sends the Node contract through the actual Python HMAC middleware',async()=>{
  const options={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({schema_version:'1',message:'synthetic question',history:[],server_managed_history:true})};
  options.headers=sibHeaders(url,options,{secret});
  const response=await fetch(url,options);
  expect(response.status).toBe(200);
  expect((await response.json()).payload).toMatchObject({schema_version:'1',server_managed_history:true});
  expect((await fetch(url,options)).status).toBe(409);
});
it('rejects missing, tampered, stale and wrong-key requests before application execution',async()=>{
  expect((await fetch(url,{method:'POST',body:'{}'})).status).toBe(401);
  const base={method:'POST',body:'{}'};
  expect((await fetch(url,{...base,headers:sibHeaders(url,base,{secret:'incorrect-key-that-is-at-least-32-characters'})})).status).toBe(401);
  expect((await fetch(url,{...base,body:'{"tampered":true}',headers:sibHeaders(url,base,{secret})})).status).toBe(401);
  expect((await fetch(url,{...base,headers:sibHeaders(url,base,{secret,now:Date.now()-120000})})).status).toBe(401);
});
