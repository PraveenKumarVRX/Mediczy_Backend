/** Run through the standard environment loader; default rolls all candidate copies back. */
import { readFileSync } from 'node:fs';
import pool from '../../db/pgPool.js';
import { closeRedis,connectRedis } from '../../db/redis.js';
import { migrateLegacyRoom } from '../../services/communication-workspace-legacy.mjs';
const apply=process.argv.includes('--apply'),manifestPath=process.argv.find(arg=>arg.startsWith('--manifest='))?.slice(11);
const manifest=manifestPath?JSON.parse(readFileSync(manifestPath,'utf8')):{};
const report={mode:apply?'apply':'audit',migrated:0,quarantined:0,items:[]};
try{
 const redis=await connectRedis();if(!redis)throw Error('Legacy Redis unavailable; refuse an empty migration report');
 const roomIds=JSON.parse(await redis.get('chat:rooms:list')||'[]');
 if(!Array.isArray(roomIds)||roomIds.some(id=>typeof id!=='string'))throw Error('Legacy room index cannot be verified');
 for(const id of roomIds){
  const tenantUid=manifest[id];
  if(typeof tenantUid!=='string'||!tenantUid){report.quarantined++;report.items.push({legacyRoom:id,state:'ownership_unverified'});continue;}
  const db=await pool.connect();
  try{
   await db.query('BEGIN');await db.query("SELECT pg_advisory_xact_lock(hashtext('communication-legacy-migration'))");
   const room=JSON.parse(await redis.get('chat:room:'+id)||'null');
   const legacyMessages=JSON.parse(await redis.get('chat:messages:'+id)||'[]');
   if(!Array.isArray(legacyMessages))throw Error('Legacy message list cannot be verified');
   const result=await migrateLegacyRoom({db,room,legacyMessages,tenantUid});
   await db.query(apply?'COMMIT':'ROLLBACK');report.migrated++;report.items.push({legacyRoom:id,state:apply?'copied':'eligible',...result});
  }catch(error){await db.query('ROLLBACK');report.quarantined++;report.items.push({legacyRoom:id,state:'reconciliation_required',reason:error.statusCode?error.message:'Migration unavailable'});}
  finally{db.release();}
 }
 console.log(JSON.stringify(report));
}finally{await pool.end();await closeRedis();}
