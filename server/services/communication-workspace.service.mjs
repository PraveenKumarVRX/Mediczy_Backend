import { randomUUID } from 'node:crypto';
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export class CommunicationWorkspace {
 constructor(pool) { this.pool = pool; }
 context(ctx) {
  if (!ctx?.tenantUid || !Number.isSafeInteger(Number(ctx.userId)) || Number(ctx.userId) < 1) throw fail(403, 'Authenticated organisation and actor required');
  return [ctx.tenantUid, Number(ctx.userId)];
 }
 async transaction(work) {
  const db = await this.pool.connect();
  try { await db.query('BEGIN'); const result = await work(db); await db.query('COMMIT'); return result; }
  catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
 }
 async member(db, ctx, roomId) {
  const [tenantUid,userId] = this.context(ctx);
  if (!uuid(roomId)) throw fail(404, 'Conversation not found');
  const { rows } = await db.query(`SELECT r.* FROM communication_workspace_rooms r JOIN communication_workspace_members m
   ON m.tenant_uid=r.tenant_uid AND m.room_id=r.id WHERE r.tenant_uid=$1 AND r.id=$2 AND m.user_id=$3`, [tenantUid,roomId,userId]);
  if (!rows[0]) throw fail(404, 'Conversation not found'); return rows[0];
 }
 async directory(ctx) {
  const [tenantUid] = this.context(ctx);
  return (await this.pool.query(`SELECT id, COALESCE(NULLIF(concat_ws(' ',"firstName","lastName"),''),email) AS name
   FROM users WHERE organization_uid=$1 AND status='active' ORDER BY "firstName",id LIMIT 200`,[tenantUid])).rows;
 }
 async ensureGeneral(ctx) {
  const [tenantUid,userId] = this.context(ctx);
  return this.transaction(async db => {
   const {rows:[room]} = await db.query(`INSERT INTO communication_workspace_rooms(id,tenant_uid,name,slug,created_by) VALUES($1,$2,'Team Chat','general',$3)
    ON CONFLICT(tenant_uid,slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id`,[randomUUID(),tenantUid,userId]);
   await db.query(`INSERT INTO communication_workspace_members(tenant_uid,room_id,user_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[tenantUid,room.id,userId]);
   return room.id;
  });
 }
 async list(ctx) {
  const [tenantUid,userId] = this.context(ctx); await this.ensureGeneral(ctx);
  return (await this.pool.query(`SELECT r.id,r.name,r.slug,r.created_by,r.created_at,
   last.body AS last_message,last.created_at AS last_message_at,
   (SELECT count(*)::int FROM communication_workspace_messages unread WHERE unread.tenant_uid=r.tenant_uid AND unread.room_id=r.id
    AND unread.sequence>m.last_read_sequence AND unread.sender_id<>$2) AS unread
   FROM communication_workspace_rooms r JOIN communication_workspace_members m ON m.tenant_uid=r.tenant_uid AND m.room_id=r.id AND m.user_id=$2
   LEFT JOIN LATERAL(SELECT body,created_at FROM communication_workspace_messages WHERE tenant_uid=r.tenant_uid AND room_id=r.id ORDER BY sequence DESC LIMIT 1) last ON true
   WHERE r.tenant_uid=$1 ORDER BY COALESCE(last.created_at,r.created_at) DESC,r.id LIMIT 200`,[tenantUid,userId])).rows;
 }
 async create(ctx, input) {
  const [tenantUid,userId] = this.context(ctx);
  const name = String(input.name || '').trim();
  if (!name || name.length>120) throw fail(400,'Conversation name must contain 1–120 characters');
  if (!Array.isArray(input.members) || input.members.length>50 || input.members.some(id=>!Number.isSafeInteger(Number(id)) || Number(id)<1)) throw fail(400,'Select up to 50 organisation members');
  const members = [...new Set(input.members.map(Number))].filter(id=>id!==userId);
  return this.transaction(async db => {
   if (members.length) {
    const owned=await db.query(`SELECT id FROM users WHERE id=ANY($1::int[]) AND organization_uid=$2 AND status='active' FOR SHARE`,[members,tenantUid]);
    if (owned.rows.length!==members.length) throw fail(400,'All participants must belong to this organisation');
   }
   const {rows:[room]}=await db.query(`INSERT INTO communication_workspace_rooms(id,tenant_uid,name,created_by) VALUES($1,$2,$3,$4) RETURNING *`,[randomUUID(),tenantUid,name,userId]);
   await db.query(`INSERT INTO communication_workspace_members(tenant_uid,room_id,user_id) SELECT $1,$2,unnest($3::int[])`,[tenantUid,room.id,[userId,...members]]);
   return room;
  });
 }
 async thread(ctx,roomId,{before,limit=50}={}) {
  await this.member(this.pool,ctx,roomId);
  if (before!==undefined && !/^[1-9][0-9]*$/.test(String(before))) throw fail(400,'Invalid message cursor');
  const size=Math.min(100,Math.max(1,Math.trunc(Number(limit))||50));
  const rows=(await this.pool.query(`SELECT m.id,m.sequence::text,m.sender_id,m.body,m.created_at,m.attachment_id,att.name AS attachment_name,att.bytes AS attachment_bytes,
   COALESCE(NULLIF(concat_ws(' ',u."firstName",u."lastName"),''),'Team member') AS sender_name
   FROM communication_workspace_messages m JOIN users u ON u.id=m.sender_id
   LEFT JOIN communication_workspace_attachments att ON att.id=m.attachment_id AND att.tenant_uid=m.tenant_uid AND att.room_id=m.room_id
   WHERE m.tenant_uid=$1 AND m.room_id=$2 AND ($3::bigint IS NULL OR m.sequence<$3::bigint)
   ORDER BY m.sequence DESC LIMIT $4`,[ctx.tenantUid,roomId,before||null,size+1])).rows;
  const hasMore=rows.length>size; if(hasMore)rows.pop();
  return { messages:rows.reverse(),hasMore,nextCursor:hasMore?rows[0]?.sequence:null };
 }
 async send(ctx,roomId,input) {
  const [tenantUid,userId]=this.context(ctx); const body=String(input.body||'').trim();
  if(!uuid(input.clientId)||!body||body.length>4000)throw fail(400,'A request UUID and message of 1–4000 characters are required');
  return this.transaction(async db=>{
   await this.member(db,ctx,roomId);
   if(input.attachmentId){
    if(!uuid(input.attachmentId))throw fail(400,'Invalid attachment');
    const {rows}=await db.query('SELECT id FROM communication_workspace_attachments WHERE tenant_uid=$1 AND room_id=$2 AND id=$3 AND uploaded_by=$4',[tenantUid,roomId,input.attachmentId,userId]);
    if(!rows.length)throw fail(404,'Attachment not found');
   }
   const {rows:[message]}=await db.query(`INSERT INTO communication_workspace_messages(id,tenant_uid,room_id,sender_id,client_id,body,attachment_id) VALUES($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT(tenant_uid,room_id,sender_id,client_id) DO UPDATE SET client_id=EXCLUDED.client_id RETURNING id,sequence::text,sender_id,body,created_at,attachment_id`,[randomUUID(),tenantUid,roomId,userId,input.clientId,body,input.attachmentId||null]);
   if(message.body!==body||message.attachment_id!==(input.attachmentId||null))throw fail(409,'Request identity already used with different content');
   return message;
  });
 }
 async read(ctx,roomId,sequence) {
  const [tenantUid,userId]=this.context(ctx); await this.member(this.pool,ctx,roomId);
  if(!/^[0-9]+$/.test(String(sequence)))throw fail(400,'Invalid read cursor');
  await this.pool.query(`UPDATE communication_workspace_members SET last_read_sequence=GREATEST(last_read_sequence,
   LEAST($4::bigint,COALESCE((SELECT max(sequence) FROM communication_workspace_messages WHERE tenant_uid=$1 AND room_id=$2),0)))
   WHERE tenant_uid=$1 AND room_id=$2 AND user_id=$3`,[tenantUid,roomId,userId,sequence]);
  return {read:true};
 }
}
