import { setTimeout as delay } from 'node:timers/promises';
import { contactCenterService,contactMedia,voiceCampaigns,voiceBiometrics } from '../../services/contact-center/runtime.js';
import pool from '../../db/pgPool.js';
import { tenant } from '../../services/contact-center/policy.js';

// Explicit tenant allowlist; this worker never disables RLS or scans another
// tenant's jobs through a privileged maintenance connection.
const tenants=JSON.parse(process.env.VOICE_TENANT_UIDS||'[]').map(tenant);
if(!tenants.length)throw new Error('VOICE_TENANT_UIDS must list the enabled tenant UIDs');
let stopped=false;
process.once('SIGTERM',()=>{stopped=true;});process.once('SIGINT',()=>{stopped=true;});
try {
  do {
    for(const uid of tenants) {
      const operations={textRetention:()=>contactCenterService.expireText(uid,{id:'system:retention'}),recordingRetention:()=>contactCenterService.expireRecordings(uid,{id:'system:retention'}),biometricRetention:()=>voiceBiometrics.expire(uid),mediaExpiry:()=>contactMedia.expire(uid),intelligence:()=>contactCenterService.runJobs(uid),campaign:()=>voiceCampaigns.tick(uid)};
      for(const [operation,run] of Object.entries(operations))try{const result=await run();if(result?.processed)console.log(JSON.stringify({event:'contact_center_job',tenantUid:uid,operation,...result}));}catch(error){if(error.code!=='RECORDING_STORAGE_UNAVAILABLE')console.error(JSON.stringify({event:'contact_center_worker_error',tenantUid:uid,operation,code:error.code||'WORKER_FAILED'}));}
    }
    if(process.argv.includes('--once'))break;
    if(!stopped)await delay(10000);
  }while(!stopped);
}finally{await pool.end();}
