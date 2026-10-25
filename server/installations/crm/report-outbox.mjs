import {mkdir,writeFile,readdir,readFile,unlink,link} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {validateReport} from '../../config/dedicated-installation-profiles.js';
export class ReportOutbox {
 constructor(directory,send){this.directory=directory;this.send=send;this.draining=false;}
 async enqueue(report){
  const valid=validateReport(report,'crm');await mkdir(this.directory,{recursive:true,mode:0o700});
  const name=valid.observedAt.replace(/[^0-9]/g,'')+'-'+valid.eventId+'.json';
  const temporary=join(this.directory,'.'+randomUUID()+'.tmp');
  await writeFile(temporary,JSON.stringify(valid),{mode:0o600,flag:'wx'});
  try{await link(temporary,join(this.directory,name));}catch(error){if(error.code!=='EEXIST')throw error;}finally{await unlink(temporary);}
 }
 async drain(){
  if(this.draining)return;this.draining=true;
  try{await mkdir(this.directory,{recursive:true,mode:0o700});
   for(const name of(await readdir(this.directory)).filter(n=>/^\d+-[a-f0-9-]+\.json$/i.test(n)).sort().slice(0,100)){
    const path=join(this.directory,name),report=JSON.parse(await readFile(path,'utf8'));
    validateReport(report,'crm');await this.send(report);await unlink(path);
   }
  }finally{this.draining=false;}
 }
}
