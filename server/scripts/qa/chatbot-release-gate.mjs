import { readFile } from 'node:fs/promises';
import { evaluateChatRelease,evaluationFingerprint } from '../../services/ai-brain/chat-release-evaluation.js';
const fingerprintOnly=process.argv.includes('--fingerprint');
const [policyPath,casesPath,resultsPath]=process.argv.slice(2).filter(arg=>arg!=='--fingerprint');
let database;
try {
  if (!policyPath||!casesPath||!resultsPath) throw new Error('Usage: node chatbot-release-gate.mjs [--fingerprint] <policy.json> <cases.json> <reviewed-results.json>');
  const [policy,cases,results]=await Promise.all([policyPath,casesPath,resultsPath].map(async path=>JSON.parse(await readFile(path,'utf8'))));
  const fingerprint=await evaluationFingerprint({policy,cases,results});
  if(fingerprintOnly) console.log(fingerprint);
  else {
    const report=evaluateChatRelease({policy,cases,results});
    const {default:pool}=await import('../../db/pgPool.js');database=pool;
    const {rows}=await pool.query(`SELECT c.id FROM ai_model_change_log c JOIN users u ON u.unique_id=c.approved_by
      WHERE c.id=$1 AND c.status IN ('approved','applied') AND c.model_component='medical-chat-approved-extractive-v1'
      AND u.role='medical_director' AND c.new_config->>'evaluationFingerprint'=$2 AND c.new_config->>'datasetVersion'=$3`,[policy.approvalChangeId,fingerprint,policy.datasetVersion]);
    if (!rows.length) throw new Error('Medical Director approval for this exact evaluation evidence not found');
    console.log(JSON.stringify({...report,fingerprint},null,2));process.exitCode=report.passed?0:1;
  }
} catch(error) { console.error(error.message);process.exitCode=1; }
finally {if(database) await database.end();}
