import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
const dist=resolve(process.argv[2]||'');
if(!existsSync(join(dist,'brand/medstar.svg')))throw Error('Build with the Medstar profile before branding the entry point.');
let html=readFileSync(join(dist,'index.html'),'utf8');
html=html.replace(/<title>[^<]*<\/title>/,'<title>Medstar CRM</title>').replace('href="/favicon.svg"','href="/brand/medstar.svg"').replace('href="/favicon.ico"','href="/brand/medstar.svg"');
writeFileSync(join(dist,'index.html'),html);
