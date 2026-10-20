import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
const directory=await mkdtemp(join(tmpdir(),'mediqzy-cc-disposable-')),name='mediqzy-cc-tests-'+randomBytes(4).toString('hex'),password=randomBytes(32).toString('hex');
try{
 const envfile=join(directory,'database.env');await writeFile(envfile,`POSTGRES_PASSWORD=${password}\nPOSTGRES_DB=contact_center_test\n`,{mode:0o600});
 execFileSync('docker',['run','--pull=never','--rm','-d','--name',name,'--env-file',envfile,'-p','127.0.0.1::5432','pgvector/pgvector:pg16'],{stdio:['ignore','pipe','pipe']});
 let ready=false;for(let n=0;n<40;n++){try{execFileSync('docker',['exec',name,'pg_isready','-U','postgres'],{stdio:'ignore'});ready=true;break;}catch{await delay(250);}}
 if(!ready)throw new Error('Disposable PostgreSQL did not become ready');
 const inspect=JSON.parse(execFileSync('docker',['inspect',name],{encoding:'utf8'}))[0];const port=Number(inspect.NetworkSettings.Ports['5432/tcp'][0].HostPort);
 const cfg=join(directory,'connection.private.json');await writeFile(cfg,JSON.stringify({database:'contact_center_test',port,password}),{mode:0o600});
 execFileSync(process.execPath,[new URL('./contact-center-integration.mjs',import.meta.url).pathname,cfg,'--reset'],{env:process.env,stdio:'inherit'});
}finally{try{execFileSync('docker',['rm','-f',name],{stdio:'ignore'});}catch{}await rm(directory,{recursive:true,force:true});}
