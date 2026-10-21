/** Isolated CPU inference process. TLS binds only to loopback. */
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
const required=['VOICE_BIOMETRIC_SECRET','VOICE_SPEAKER_MODEL_DIR','VOICE_BIOMETRIC_MODEL_SHA256','VOICE_SPEAKER_CONFIG_SHA256','GROQ_API_KEY','VOICE_MODEL_TLS_CERT','VOICE_MODEL_TLS_KEY','VOICE_MODEL_PYTHON'];
if(required.some(key=>!process.env[key]))throw new Error('Speaker service configuration is incomplete');
if(['VOICE_MODEL_TLS_CERT','VOICE_MODEL_TLS_KEY','VOICE_MODEL_PYTHON'].some(key=>!existsSync(process.env[key])))throw new Error('Speaker service TLS or interpreter files are missing');
const keys=['PATH','HOME','LANG','SSL_CERT_FILE','VOICE_ANTISPOOF_MODEL_PATH','VOICE_ANTISPOOF_MODEL_SHA256','VOICE_ANTISPOOF_THRESHOLD',...required];
const env=Object.fromEntries(keys.filter(key=>process.env[key]).map(key=>[key,process.env[key]]));
env.HF_HUB_OFFLINE='1';env.HF_HUB_DISABLE_TELEMETRY='1';env.VOICE_SPEAKER_DEVICE='cpu';env.OMP_NUM_THREADS='2';
const child=spawn(process.env.VOICE_MODEL_PYTHON,['-m','uvicorn','service:app','--host','127.0.0.1','--port','9447','--workers','1','--no-access-log','--ssl-certfile',process.env.VOICE_MODEL_TLS_CERT,'--ssl-keyfile',process.env.VOICE_MODEL_TLS_KEY],{cwd:fileURLToPath(new URL('../../voice-biometrics/',import.meta.url)),env,stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>child.kill(signal));
child.on('error',()=>{console.error('Speaker service failed to start');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code||0;});
