import {randomUUID,randomInt,createHmac,randomBytes} from 'node:crypto';
import {KMSClient,EncryptCommand,DecryptCommand} from '@aws-sdk/client-kms';
import {identityConsent} from './campaigns.js';
import {fail} from './policy.js';

export function spokenDigits(text){const digits={zero:'0',one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9'};return String(text).toLowerCase().replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine)\b/g,w=>digits[w]).replace(/\D/g,'');}
export function cosine(a,b){if(!Array.isArray(a)||a.length!==192||!Array.isArray(b)||b.length!==192||![...a,...b].every(Number.isFinite))throw fail(502,'INVALID_SPEAKER_VECTOR','Speaker model must return 192 finite dimensions');const length=v=>Math.sqrt(v.reduce((n,x)=>n+x*x,0));const d=length(a)*length(b);if(!d)throw fail(502,'INVALID_SPEAKER_VECTOR','Speaker embedding is empty');return Math.max(-1,Math.min(1,a.reduce((s,v,i)=>s+v*b[i],0)/d));}
export function createSpeakerModel({env=process.env,fetcher=fetch}={}){
  return async(audio,phrase)=>{
    const url=env.VOICE_BIOMETRIC_URL,secret=env.VOICE_BIOMETRIC_SECRET;
    if(!url?.startsWith('https://')||!secret||!env.VOICE_BIOMETRIC_MODEL_SHA256)throw fail(503,'BIOMETRIC_MODEL_NOT_CONFIGURED','Configure the approved speaker model endpoint and pinned model hash');
    const body=JSON.stringify({audio,phrase}),timestamp=String(Date.now()),nonce=randomBytes(16).toString('hex');
    const signature=createHmac('sha256',secret).update(`${timestamp}.${nonce}.${body}`).digest('hex');
    let r;try{r=await fetcher(new URL('/v1/embed',url),{method:'POST',redirect:'error',signal:AbortSignal.timeout(60000),headers:{'Content-Type':'application/json','X-Voice-Timestamp':timestamp,'X-Voice-Nonce':nonce,'X-Voice-Signature':signature},body});}catch{throw fail(502,'SPEAKER_INFERENCE_FAILED','Speaker inference is unavailable');}
    const value=await r.json().catch(()=>null);if(!r.ok||value?.model!==env.VOICE_BIOMETRIC_MODEL_SHA256)throw fail(502,'SPEAKER_MODEL_MISMATCH','Speaker model response did not match the approved model');
    cosine(value.embedding,value.embedding);
    if(spokenDigits(value.transcript)!==spokenDigits(phrase))throw fail(409,'CHALLENGE_FAILED','Audio does not match the fresh spoken challenge');
    return {embedding:value.embedding,model:value.model,liveness:value.liveness===true,antiSpoofModel:value.antiSpoofModel||null};
  };
}
export function createTemplateVault({env=process.env,kms=new KMSClient({region:process.env.AWS_REGION||'ap-south-1'})}={}){
  function config(){if(!env.VOICE_BIOMETRIC_KMS_KEY)throw fail(503,'BIOMETRIC_VAULT_NOT_CONFIGURED','A separate biometric KMS key is required');}
  return {
    async seal(uid,identity,value){config();const bytes=Buffer.alloc(768);value.embedding.forEach((v,i)=>bytes.writeFloatLE(v,i*4));const plaintext=Buffer.from(JSON.stringify({...value,embedding:bytes.toString('base64')}));const result=await kms.send(new EncryptCommand({KeyId:env.VOICE_BIOMETRIC_KMS_KEY,EncryptionContext:{tenant_uid:uid,identity_id:String(identity)},Plaintext:plaintext}));return Buffer.from(result.CiphertextBlob).toString('base64');},
    async open(uid,identity,value){config();const result=await kms.send(new DecryptCommand({KeyId:env.VOICE_BIOMETRIC_KMS_KEY,EncryptionContext:{tenant_uid:uid,identity_id:String(identity)},CiphertextBlob:Buffer.from(value,'base64')}));const decoded=JSON.parse(Buffer.from(result.Plaintext).toString('utf8'));const bytes=Buffer.from(decoded.embedding,'base64');if(bytes.length!==768)throw fail(502,'INVALID_SPEAKER_VECTOR','Invalid encrypted speaker template');return {...decoded,embedding:Array.from({length:192},(_,i)=>bytes.readFloatLE(i*4))};},
  };
}
export function createVoiceBiometrics({tx,model,vault,env=process.env}){
  async function challenge(uid,id,purpose){return tx(uid,async c=>{const q=(await c.query('UPDATE cc_voice_challenges SET consumed=true WHERE tenant_uid=$1 AND id=$2 AND purpose=$3 AND NOT consumed AND expires_at>now() RETURNING *',[uid,id,purpose])).rows[0];if(!q)throw fail(409,'CHALLENGE_EXPIRED','Challenge is expired or already used');await identityConsent(c,uid,q.identity_id,'voice_biometrics');return q;});}
  const api={
    async issue(uid,input){return tx(uid,async c=>{await identityConsent(c,uid,input.identity_id,'voice_biometrics');const id=randomUUID(),phrase=Array.from({length:6},()=>randomInt(10)).join(' ');await c.query("INSERT INTO cc_voice_challenges(tenant_uid,id,identity_id,purpose,phrase,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '2 minutes')",[uid,id,input.identity_id,input.purpose,phrase]);return {id,phrase,expiresIn:120};});},
    async enroll(uid,actor,input){
      if(new Set(input.samples).size!==3)throw fail(400,'DISTINCT_SAMPLES_REQUIRED','Record three distinct enrollment samples');
      const q=await challenge(uid,input.challenge_id,'enroll');const vectors=await Promise.all(input.samples.map(audio=>model(audio,q.phrase)));
      if(vectors.some(v=>v.model!==vectors[0].model))throw fail(502,'SPEAKER_MODEL_MISMATCH','Enrollment model changed during capture');
      const vector=Array.from({length:192},(_,i)=>vectors.reduce((s,v)=>s+v.embedding[i],0)/vectors.length);cosine(vector,vector);
      const ciphertext=await vault.seal(uid,q.identity_id,{embedding:vector,model:vectors[0].model});
      return tx(uid,async c=>{
        const {consent}=await identityConsent(c,uid,q.identity_id,'voice_biometrics');
        const row=(await c.query(`INSERT INTO cc_voice_enrollments(tenant_uid,id,identity_id,model,template_ciphertext,consent_ref,expires_at,created_by) VALUES($1,$2,$3,$4,$5,$6,now()+interval '90 days',$7) RETURNING id,identity_id,model,expires_at`,[uid,randomUUID(),q.identity_id,vectors[0].model,ciphertext,consent.proof_ref,String(actor.id)])).rows[0];return {...row,authenticationAllowed:false};
      });
    },
    async verify(uid,input){
      const q=await challenge(uid,input.challenge_id,'verify');
      const enrollment=await tx(uid,async c=>(await c.query('SELECT * FROM cc_voice_enrollments WHERE tenant_uid=$1 AND id=$2 AND identity_id=$3 AND revoked_at IS NULL AND expires_at>now()',[uid,input.enrollment_id,q.identity_id])).rows[0]);
      if(!enrollment?.template_ciphertext)throw fail(404,'ENROLLMENT_NOT_FOUND','Current tenant enrollment not found');
      const [template,result]=await Promise.all([vault.open(uid,q.identity_id,enrollment.template_ciphertext),model(input.audio,q.phrase)]);
      if(template.model!==result.model||result.model!==enrollment.model)throw fail(409,'REENROLLMENT_REQUIRED','Speaker model changed; enroll again');
      const score=cosine(template.embedding,result.embedding);
      let validation;try{validation=JSON.parse(env.VOICE_BIOMETRIC_VALIDATION||'null');}catch{/* remain review-only */}
      const evaluated=/^[a-f0-9]{64}$/i.test(result.antiSpoofModel||'')&&validation?.passed===true&&validation.counts?.impostor>=5000&&validation.counts?.genuine>=1000&&validation.counts?.spoof>=1000&&validation.falseAcceptUpper95<=0.001&&validation.falseRejectUpper95<=0.05&&validation.spoofAcceptUpper95<=0.01&&validation?.model===result.model&&validation.antiSpoofModel===result.antiSpoofModel&&validation.datasetEvidence&&Number.isFinite(validation.threshold)&&validation.threshold>0&&validation.threshold<1&&Number.isFinite(validation.falseAcceptRate)&&validation.falseAcceptRate<=0.001&&Number.isFinite(validation.spoofAcceptRate)&&validation.spoofAcceptRate<=0.01;
      const verdict=evaluated&&result.liveness?(score>=validation.threshold?'match_candidate':'non_match_candidate'):'review_required';
      return tx(uid,async c=>{
        await identityConsent(c,uid,q.identity_id,'voice_biometrics');
        // Re-check revocation after external inference, before persisting a result.
        const active=(await c.query('SELECT id FROM cc_voice_enrollments WHERE tenant_uid=$1 AND id=$2 AND revoked_at IS NULL AND expires_at>now() FOR UPDATE',[uid,enrollment.id])).rows[0];if(!active)throw fail(409,'ENROLLMENT_REVOKED','Enrollment was revoked during verification');
        const row=(await c.query('INSERT INTO cc_voice_verifications(tenant_uid,id,enrollment_id,challenge_id,score,liveness,verdict,model) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,score,liveness,verdict,model',[uid,randomUUID(),enrollment.id,q.id,score,result.liveness,verdict,result.model])).rows[0];return {...row,authenticationAllowed:false,secondaryVerificationRequired:true};
      });
    },
    async revoke(uid,actor,id){return tx(uid,async c=>{const row=(await c.query('UPDATE cc_voice_enrollments SET revoked_at=now(),template_ciphertext=null WHERE tenant_uid=$1 AND id=$2 RETURNING id',[uid,id])).rows[0];if(!row)throw fail(404,'ENROLLMENT_NOT_FOUND','Enrollment not found');await c.query("INSERT INTO cc_events(tenant_uid,source_key,kind,actor_id,payload) VALUES($1,$2,'voice_enrollment_revoked',$3,$4)",[uid,randomUUID(),String(actor.id),JSON.stringify({enrollmentId:id})]);return {revoked:true};});},
    async expire(uid){
      const rows=await tx(uid,async c=>(await c.query('SELECT id,identity_id,expires_at FROM cc_voice_enrollments WHERE tenant_uid=$1 AND template_ciphertext IS NOT NULL',[uid])).rows);
      let expired=0;
      for(const row of rows){let remove=Date.parse(row.expires_at)<=Date.now();if(!remove)try{await tx(uid,c=>identityConsent(c,uid,row.identity_id,'voice_biometrics'));}catch(e){if(['VOICE_CONSENT_REQUIRED','IDENTITY_NOT_FOUND'].includes(e.code))remove=true;else throw e;}
        if(remove){await api.revoke(uid,{id:'system:biometric-retention'},row.id);expired++;}}
      return {expired};
    },
  };return api;
}
