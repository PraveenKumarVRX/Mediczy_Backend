import { readFile } from 'node:fs/promises';
const checks=[];
const check=(name,pass)=>checks.push({name,pass:Boolean(pass)});
const secret=process.env.SIB_SERVICE_SECRET||process.env.JWT_SECRET;
check('signed_service_secret',secret&&secret.length>=32);
check('pinned_prompt_version',process.env.CHATBOT_PROMPT_VERSION&&process.env.CHATBOT_PROMPT_VERSION!=='unapproved');
check('livekit_credentials',process.env.LIVEKIT_API_KEY&&process.env.LIVEKIT_API_SECRET);
check('supported_languages_explicit',process.env.CHATBOT_SUPPORTED_LANGUAGES);
const policyIndex=process.argv.indexOf('--policy');
if(policyIndex>=0){
  const policy=JSON.parse(await readFile(process.argv[policyIndex+1],'utf8'));
  check('evaluation_policy',policy.approvalChangeId&&policy.datasetVersion&&Number.isFinite(policy.thresholds?.minimumQuality)&&Number.isInteger(policy.thresholds?.minimumCasesPerLanguage));
}else check('evaluation_policy',false);
if(process.argv.includes('--database')){
  const {default:pool}=await import('../../db/pgPool.js');
  try{
    const {rows}=await pool.query(`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=current_schema() AND
      ((table_name='chatbot_sessions' AND column_name IN ('owner_scope','expires_at')) OR (table_name='appointments' AND column_name='chat_request_key') OR (table_name='ai_knowledge_documents' AND column_name IN ('review_status','approved_content_hash')))`);
    check('additive_schema',rows.length===5);
    const sources=await pool.query(`SELECT count(*) AS count FROM ai_knowledge_documents WHERE scope='global' AND review_status='approved' AND review_due_at>NOW() AND source_version IS NOT NULL`);
    check('current_approved_sources',Number(sources.rows[0].count)>0);
  }finally{await pool.end();}
}
console.log(JSON.stringify({configurationReady:checks.every(item=>item.pass),checks},null,2));
process.exitCode=checks.every(item=>item.pass)?0:1;
