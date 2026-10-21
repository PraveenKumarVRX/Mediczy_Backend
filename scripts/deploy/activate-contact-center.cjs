#!/usr/bin/env node
// Explicit cwd/script replacement: PM2 reload otherwise retains the previous release path.
const fs=require('node:fs'),path=require('node:path'),pm2=require('/usr/lib/node_modules/pm2');
const release=path.resolve(process.argv[2]||'');
if(!release.startsWith('/home/ubuntu/mediqzy-releases/contact-center-')||!fs.existsSync(path.join(release,'contact-center-release-manifest.json')))throw new Error('An isolated packaged contact-center release is required');
const manifest=JSON.parse(fs.readFileSync(path.join(release,'contact-center-release-manifest.json'),'utf8'));
if(!manifest.commit||!manifest.parentRelease)throw new Error('Release provenance is missing');
pm2.connect(error=>{if(error)throw error;pm2.list((error,list)=>{if(error){pm2.disconnect();throw error;}const app=list.find(p=>p.name==='mediczy-server');if(!app){pm2.disconnect();throw new Error('Existing production process not found');}const pm_cwd=path.join(release,'server'),pm_exec_path=path.join(pm_cwd,'scripts/ssm-env-loader.mjs');pm2.Client.executeRemote('reloadProcessId',{id:app.pm_id,env:{current_conf:{pm_cwd,pm_exec_path,args:['index.js']}}},error=>{pm2.disconnect();if(error){console.error('Contact-center activation failed');process.exitCode=1;}else console.log(JSON.stringify({process:'mediczy-server',release:pm_cwd,reload:'requested'}));});});});
