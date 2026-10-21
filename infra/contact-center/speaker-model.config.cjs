const path=require('node:path');
const cwd=process.env.VOICE_RELEASE_SERVER;
if(!cwd||!path.isAbsolute(cwd))throw new Error('Set VOICE_RELEASE_SERVER to the reviewed release server directory');
module.exports={apps:[{name:'mediqzy-speaker-model',cwd,script:'scripts/ssm-env-loader.mjs',args:'scripts/workers/speaker-model.mjs',instances:1,exec_mode:'fork',autorestart:true,kill_timeout:45000,max_memory_restart:'2G',env:{NODE_ENV:'production',SSM_REQUIRED:'true',AWS_REGION:'ap-south-1'}}]};
