#!/usr/bin/env node
// PM2's standard reload retained the old script/cwd on this host. Explicitly update those fields
// using the same current_conf mechanism implemented in the installed PM2 Utility.extendExtraConfig.
const fs=require('node:fs');const path=require('node:path');
const pm2=require('/usr/lib/node_modules/pm2');
const release=path.resolve(process.argv[2]||'');
if(!release.startsWith('/home/ubuntu/mediqzy-releases/nursing-')||!fs.existsSync(path.join(release,'nursing-release-manifest.json')))throw new Error('A packaged nursing release is required');
pm2.connect(error=>{
 if(error)throw error;
 pm2.list((error,list)=>{
  if(error){pm2.disconnect();throw error;}
  const app=list.find(p=>p.name==='mediczy-server');if(!app){pm2.disconnect();throw new Error('Existing production process not found');}
  const pm_cwd=path.join(release,'server'),pm_exec_path=path.join(pm_cwd,'scripts/ssm-env-loader.mjs');
  pm2.Client.executeRemote('reloadProcessId',{id:app.pm_id,env:{current_conf:{pm_cwd,pm_exec_path,args:['index.js']}}},(error)=>{
   pm2.disconnect();if(error){console.error('Nursing release activation failed');process.exitCode=1;return;}
   console.log(JSON.stringify({process:'mediczy-server',release:pm_cwd,reload:'requested'}));
  });
 });
});
