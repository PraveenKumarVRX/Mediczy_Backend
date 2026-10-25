import { createHash } from 'node:crypto';
const fail=message=>Object.assign(new Error(message),{statusCode:409});
function stableUuid(value){const h=createHash('sha256').update(value).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;}
/** Explicit reviewed mapping only. Unowned, cross-tenant and media records remain quarantined in legacy storage. */
export async function migrateLegacyRoom({db,room,legacyMessages,tenantUid}) {
 if(!['team_internal','channel'].includes(room?.type)||!room?.id||!tenantUid||!Array.isArray(room.participants)||!room.participants.length)throw fail('Room ownership is unverified');
 const participants=[...new Set(room.participants.map(Number))];
 if(participants.some(id=>!Number.isSafeInteger(id)||id<1))throw fail('Participant identity is unverified');
 const {rows}=await db.query(`SELECT id FROM users WHERE id=ANY($1::int[]) AND organization_uid=$2`,[participants,tenantUid]);
 if(rows.length!==participants.length)throw fail('Cross-tenant or unowned participants require reconciliation');
 for(const message of legacyMessages){
  if(!['team','admin','super_admin'].includes(message.userRole)||message.type!=='text'||!participants.includes(Number(message.userId))||typeof message.message!=='string'||!message.message.trim()||message.message.trim().length>4000||!Number.isFinite(Date.parse(message.timestamp)))throw fail('Unsupported message ownership or content requires reconciliation');
 }
 const roomId=stableUuid(`room:${tenantUid}:${room.id}`);
 await db.query(`INSERT INTO communication_workspace_rooms(id,tenant_uid,name,created_by) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[roomId,tenantUid,String(room.title||room.id).slice(0,120),participants[0]]);
 await db.query(`INSERT INTO communication_workspace_members(tenant_uid,room_id,user_id) SELECT $1,$2,unnest($3::int[]) ON CONFLICT DO NOTHING`,[tenantUid,roomId,participants]);
 for(const [index,message] of legacyMessages.entries()){
  const id=stableUuid(`message:${tenantUid}:${room.id}:${message.id||index}`);
  await db.query(`INSERT INTO communication_workspace_messages(id,tenant_uid,room_id,sender_id,client_id,body,created_at) VALUES($1,$2,$3,$4,$1,$5,$6) ON CONFLICT DO NOTHING`,[id,tenantUid,roomId,Number(message.userId),message.message.trim(),message.timestamp]);
 }
 return {roomId,messages:legacyMessages.length};
}
