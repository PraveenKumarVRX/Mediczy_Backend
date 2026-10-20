import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {SSMClient,GetParametersCommand} from '@aws-sdk/client-ssm';
import {createLiveKitTransport} from '../../services/contact-center/livekit.js';
const env={...process.env};
const names=['LIVEKIT_URL','LIVEKIT_API_KEY','LIVEKIT_API_SECRET'];
const response=await new SSMClient({region:env.AWS_REGION||'ap-south-1'}).send(new GetParametersCommand({Names:names.map(n=>'/mediczy/prod/'+n),WithDecryption:true}));
for(const p of response.Parameters||[])env[p.Name.split('/').at(-1)]=p.Value;
if(names.some(n=>!env[n]))throw new Error('Existing LiveKit configuration is incomplete');
const media=createLiveKitTransport({env}),room='cc-synthetic-'+randomUUID(),directory=await mkdtemp(join(tmpdir(),'mediqzy-livekit-qa-'));
try{
 await media.create(room,{purpose:'synthetic-contact-center-media-test'});
 const tokens={agent:await media.token(room,'agent-qa',{publish:true}),caller:await media.token(room,'caller',{publish:true}),coach:await media.token(room+'-coach','agent-qa',{publish:true}),supervisor:await media.token(room+'-coach','supervisor-qa',{publish:true})};
 const file=join(directory,'tokens.private.json');await writeFile(file,JSON.stringify(tokens),{mode:0o600});
 const completed=new Promise((resolve,reject)=>execFile('/home/ubuntu/Mediczy/.venv/bin/python',[new URL('./livekit-contact-media.py',import.meta.url).pathname,file,directory],{encoding:'utf8',timeout:90000},(error,stdout)=>error?reject(error):resolve(stdout)));
 completed.catch(()=>{});
 let result;for(let i=0;i<350;i++){try{result=JSON.parse(await readFile(join(directory,'ready.json'),'utf8'));break;}catch{await delay(100);}}
 if(!result)throw new Error('Synthetic media did not become ready');
 await media.hold(room,true);let caller=(await media.participants(room)).find(p=>p.identity==='caller');
 if(caller.permission.canSubscribe||caller.permission.canPublish)throw new Error('Hold did not disable caller audio');
 await media.hold(room,false);caller=(await media.participants(room)).find(p=>p.identity==='caller');
 if(!caller.permission.canSubscribe||!caller.permission.canPublish)throw new Error('Resume did not restore caller audio');
 result.checks.push('Server-enforced caller hold','Resume restores caller permissions');
 await writeFile(join(directory,'stop.signal'),'done');await completed;
 result.livekitServer=env.LIVEKIT_URL;result.phoneCalls=0;result.productionDatabaseChanges=0;
 const evidence=process.argv[2]||'/tmp/mediqzy-livekit-real-media.json';await writeFile(evidence,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}catch(error){console.error(JSON.stringify({result:'failed',code:error.code||'LIVEKIT_REAL_MEDIA_FAILED',message:error.message?.includes('not found')?'Participant already disconnected':undefined}));process.exitCode=1;}
finally{await media.end(room).catch(()=>{});await rm(directory,{recursive:true,force:true});}
