/** Isolated audit of deployed service source. Synthetic key and in-memory SQL only. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import crypto from 'node:crypto';
import {hasCRMCapability} from '../../server/config/crm-roles.config.js';
const output=process.argv[2];if(!output)throw new Error('Evidence path required');
const source=readFileSync(new URL('../../server/services/crm-channel-integrations.service.js',import.meta.url),'utf8');
const importLine="import sharedPool from '../db/pgPool.js';";
if(!source.includes(importLine))throw new Error('Service pool import changed; audit must be reviewed');
const originalKey=process.env.CRM_CREDENTIAL_ENCRYPTION_KEY;
process.env.CRM_CREDENTIAL_ENCRYPTION_KEY='ab'.repeat(32);
let row;const queries=[];
globalThis.__settingsAuditPool={async query(sql,p){queries.push(sql.trim().split(/\s+/).slice(0,3).join(' '));
 if(sql.includes('INSERT INTO crm_marketing_integrations')){row={id:1,provider:p[1],integration_type:'communication',status:p[2],account_ref:p[3],config:JSON.parse(p[5]),encrypted_credentials:p[6]||row?.encrypted_credentials,health_message:p[8]};return {rows:[row]};}
 if(sql.includes('UPDATE crm_marketing_integrations')){row={...row,status:'configured',health_score:null,health_message:p[0],last_health_check_at:new Date().toISOString()};return {rows:[row]};}
 if(sql.includes('SELECT'))return {rows:row?[row]:[]};throw new Error('Unexpected query');
}};
const result={at:new Date().toISOString(),method:'Exact workspace service source with pool import replaced by in-memory query stub; synthetic AES key; no network or production SQL',observations:[],productionMutations:0};
try{
const service=await import('data:text/javascript;base64,'+Buffer.from(source.replace(importLine,'const sharedPool=globalThis.__settingsAuditPool;')).toString('base64'));
function storedKeys(){const [iv,tag,data]=row.encrypted_credentials.split(':');const d=crypto.createDecipheriv('aes-256-gcm',Buffer.from(process.env.CRM_CREDENTIAL_ENCRYPTION_KEY,'hex'),Buffer.from(iv,'hex'));d.setAuthTag(Buffer.from(tag,'hex'));return Object.keys(JSON.parse(Buffer.concat([d.update(Buffer.from(data,'hex')),d.final()]).toString())).sort();}
await service.upsertCrmChannelIntegration(11,'google_ads',{provider:'google_ads',credentials:{clientSecret:'SYNTHETIC_CLIENT',refreshToken:'SYNTHETIC_REFRESH'}},1);
const before=storedKeys();await service.upsertCrmChannelIntegration(11,'google_ads',{provider:'google_ads',credentials:{clientSecret:'SYNTHETIC_ROTATION'}},1);
result.observations.push({id:'SET-04',beforeKeys:before,afterPartialRotationKeys:storedKeys(),omittedRefreshTokenRetained:storedKeys().includes('refreshToken')});
row=undefined;await service.upsertCrmChannelIntegration(11,'email',{provider:'not-a-supported-provider',config:{fromEmail:'not-an-email',smtpPort:'not-a-port'},credentials:{password:'SYNTHETIC_BAD'}},1);
const tested=await service.testCrmChannelIntegration(11,'email');result.observations.push({id:'SET-09',unsupportedProviderAccepted:tested.provider==='not-a-supported-provider',invalidEmailAccepted:tested.config.fromEmail==='not-an-email',invalidPortAccepted:tested.config.smtpPort==='not-a-port'});
result.observations.push({id:'SET-05',testSucceedsWithSyntheticInvalidCredentials:tested.status==='configured',testHealthMessage:tested.healthMessage,providerNetworkCalls:0,healthScore:tested.healthScore});
result.observations.push({id:'SET-02',credentialRoutesUseCapability:'communication:write',roles:['business_head','marketing_head','marketing','telecaller','conversion','sales_rep'].map(crmRole=>({crmRole,serverAllows:hasCRMCapability({crmRole,isAdmin:false},'communication:write')}))});
result.completed=true;
}finally{delete globalThis.__settingsAuditPool;if(originalKey===undefined)delete process.env.CRM_CREDENTIAL_ENCRYPTION_KEY;else process.env.CRM_CREDENTIAL_ENCRYPTION_KEY=originalKey;mkdirSync(dirname(output),{recursive:true,mode:0o700});writeFileSync(output,JSON.stringify(result,null,2)+'\n',{mode:0o600});}
console.log(JSON.stringify(result));
