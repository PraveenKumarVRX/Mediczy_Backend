import { beforeAll, afterAll, describe, it, expect } from '@jest/globals';
import { localPostgres } from '../tests/helpers/local-postgres.js';
import { CHATBOT_COMPLETION_SCHEMA,applyChatbotSchema } from '../db/chatbot-completion-schema.js';
import { createDurableChatSessions } from '../repositories/owned-chat-sessions.js';
import { createTransactionalChatBooking } from '../services/chat-appointment-transaction.js';
let instance, pool, sessions;
beforeAll(async () => {
  instance = await localPostgres(); pool = instance.pool;
  await pool.query(`CREATE TABLE appointments(id SERIAL PRIMARY KEY,"userId" INTEGER,"doctorId" INTEGER,"appointmentDate" DATE,"appointmentTime" TEXT,status TEXT,organization_id INTEGER); CREATE TABLE ai_knowledge_documents(id SERIAL PRIMARY KEY);`);
  await applyChatbotSchema(pool,{dryRun:true});
  expect((await pool.query("SELECT to_regclass('chatbot_sessions') AS name")).rows[0].name).toBeNull();
  await applyChatbotSchema(pool);
  await applyChatbotSchema(pool);
  sessions = createDurableChatSessions(pool);
}, 30000);
afterAll(async () => { if (instance) await instance.stop(); });

describe('real PostgreSQL durable chat storage', () => {
  it('atomically retains concurrent turns across repository instances and checks ownership', async () => {
    const id = await sessions.resolve(null, 'owner');
    await Promise.all(Array.from({ length: 15 }, (_, i) => sessions.append(id, 'owner', [{ role: 'user', content: String(i) }])));
    const restarted = createDurableChatSessions(pool);
    expect(await restarted.load(id, 'owner')).toHaveLength(15);
    await expect(restarted.load(id, 'other')).rejects.toMatchObject({ statusCode: 403 });
    await restarted.clear(id, 'owner');
    await expect(sessions.append(id, 'owner', [{ role: 'user', content: 'resurrect' }])).rejects.toMatchObject({ statusCode: 403 });
  });
  it('purges expired PHI while keeping an inactive owner tombstone', async () => {
    const id = await sessions.resolve(null, 'personal:owner');
    await sessions.append(id, 'personal:owner', [{ role: 'user', content: 'synthetic PHI' }]);
    await pool.query(`UPDATE chatbot_sessions SET expires_at=NOW()-INTERVAL '1 second' WHERE session_id=$1`, [id]);
    await expect(sessions.load(id, 'personal:owner')).rejects.toMatchObject({ statusCode: 403 });
    await sessions.purgeExpired();
    expect((await pool.query('SELECT messages,active FROM chatbot_sessions WHERE session_id=$1', [id])).rows[0]).toEqual({ messages: [], active: false });
  });
});

// Production transaction helper with real PostgreSQL locks and isolated model adapters.
const database = {
  async transaction(work) {
    const connection = await pool.connect();
    const transaction = { connection, LOCK: { UPDATE: 'UPDATE' } };
    try { await connection.query('BEGIN'); const result = await work(transaction); await connection.query('COMMIT'); return result; }
    catch (error) { await connection.query('ROLLBACK'); throw error; }
    finally { connection.release(); }
  },
  query(sql, options) { return options.transaction.connection.query(sql.replace(':key', '$1'), [options.replacements.key]); },
};
const Appointment = {
  async findOne({ where, transaction }) { return (await transaction.connection.query('SELECT * FROM appointments WHERE chat_request_key=$1', [where.chat_request_key])).rows[0]; },
  async create(data, { transaction }) { return (await transaction.connection.query(`INSERT INTO appointments("userId","doctorId","appointmentDate","appointmentTime",status,chat_request_key) VALUES($1,$2,$3,$4,'confirmed',$5) RETURNING *`, [data.userId,data.doctorId,data.appointmentDate,data.appointmentTime,data.chat_request_key])).rows[0]; },
};
const dependencies = {
  database, Appointment, Availability: { findAll: async () => [{ startTime: '09:00:00', endTime: '17:00:00', slotDuration: 30 }] },
  setContext: async () => {},
  checkDoctor: async (id, date, time, { transaction }) => ({ conflict: (await transaction.connection.query('SELECT 1 FROM appointments WHERE "doctorId"=$1 AND "appointmentDate"=$2 AND "appointmentTime"=$3', [id,date,time])).rowCount > 0 }),
  checkPatient: async () => ({ conflict: false }),
};
const tomorrow = new Date(Date.now()+86400000).toISOString().slice(0,10);
describe('real PostgreSQL transactional booking contention and receipts', () => {
  it('returns one committed result for simultaneous confirmations and after restart', async () => {
    const data = { userId: 7, doctorId: 22, appointmentDate: tomorrow, appointmentTime: '10:00:00' };
    const results = await Promise.all([1,2].map(() => createTransactionalChatBooking(dependencies,data,{ requestId:'same-request',organizationId:1 })));
    expect(results[0].appointment.id).toBe(results[1].appointment.id);
    expect(results.filter(r => r.replayed)).toHaveLength(1);
    expect((await createTransactionalChatBooking(dependencies,data,{ requestId:'same-request',organizationId:1 })).replayed).toBe(true);
  });
  it('rejects another patient contending for the committed slot', async () => {
    await expect(createTransactionalChatBooking(dependencies,{ userId:8,doctorId:22,appointmentDate:tomorrow,appointmentTime:'10:00:00' },{requestId:'other',organizationId:1})).rejects.toMatchObject({statusCode:409});
  });
  it('rejects withdrawn and out-of-schedule slots', async () => {
    await expect(createTransactionalChatBooking(dependencies,{userId:8,doctorId:23,appointmentDate:tomorrow,appointmentTime:'03:00:00'},{requestId:'invalid',organizationId:1})).rejects.toThrow('no longer available');
  });
});

import { createChatAppointmentActions } from '../services/chat-appointment-actions.js';
const actionRepository = {
  async findById(req,id) { return (await pool.query('SELECT * FROM appointments WHERE id=$1',[id])).rows[0]; },
  withTransaction(req,work) { return database.transaction(work); },
  async queryInTransaction(sql,params,transaction) {
    const values=[];
    const query=sql.replace(/(?<!:):([a-zA-Z]+)/g,(_,key)=>{values.push(params[key]);return `$${values.length}`;});
    const result=await transaction.connection.query(query,values); return [result.rows];
  },
  async findByIdForActorInTransaction(actor,id,transaction) { return (await transaction.connection.query('SELECT * FROM appointments WHERE id=$1 FOR UPDATE',[id])).rows[0]; },
};
const actions=createChatAppointmentActions({database:{query:(...args)=>pool.query(...args)},repository:actionRepository,
  resolveActor:async req=>({type:'patient',id:req.user.id}),owns:(appointment,actor)=>appointment.userId===actor.id,
  cancel:async(req,res)=>{const result=await req.chatTransaction.connection.query(`UPDATE appointments SET status='cancelled' WHERE id=$1 RETURNING *`,[req.params.id]);res.json({appointment:result.rows[0]});},
  reschedule:async()=>{},
});
it('commits an explicit cancellation and durable receipt once under simultaneous confirmations',async()=>{
  const req={userRole:'user',user:{id:7}};
  const {rows}=await pool.query('SELECT id FROM appointments WHERE "userId"=7 LIMIT 1');
  const proposal=await actions.propose(req,'owner',{kind:'cancel',appointmentId:rows[0].id});
  const body={...proposal,confirmed:true};
  await expect(actions.confirm(req,'other',body)).rejects.toMatchObject({statusCode:403});
  await expect(actions.confirm(req,'owner',{...body,confirmed:false})).rejects.toMatchObject({statusCode:400});
  const result=await Promise.all([actions.confirm(req,'owner',body),actions.confirm(req,'owner',body)]);
  expect(result.every(r=>r.committed)).toBe(true);
  expect(result.filter(r=>r.replayed)).toHaveLength(1);
  const receipt=(await pool.query('SELECT metadata FROM chatbot_sessions WHERE session_id=$1',[proposal.actionId])).rows[0].metadata;
  expect(receipt.delivery.status).toBe('pending');
  expect(receipt.result.status).toBe('cancelled');
});

import { reviewMedicalKnowledge,previewMedicalKnowledge } from '../services/medical-knowledge-review.js';
it('requires previewed source fingerprint, clinical authority and records revocation',async()=>{
  await pool.query(`ALTER TABLE ai_knowledge_documents ADD COLUMN title TEXT,ADD COLUMN scope TEXT DEFAULT 'global',ADD COLUMN status TEXT DEFAULT 'ready',ADD COLUMN metadata JSONB DEFAULT '{}',ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    CREATE TABLE ai_document_chunks(id SERIAL PRIMARY KEY,document_id INTEGER,chunk_index INTEGER,content TEXT);
    INSERT INTO ai_knowledge_documents(id,title) VALUES(1,'Synthetic source');
    INSERT INTO ai_document_chunks(document_id,chunk_index,content) VALUES(1,0,'Synthetic source A'),(1,1,'Synthetic source B');`);
  const preview=await previewMedicalKnowledge(pool,{id:1,role:'medical_director'});
  const input={id:1,status:'approved',version:'test-1',dueAt:'2030-01-01T00:00:00Z',reviewerUid:'D12345',role:'medical_director',expectedFingerprint:preview.fingerprint};
  await expect(reviewMedicalKnowledge(pool,{...input,role:'admin'})).rejects.toMatchObject({statusCode:403});
  expect((await reviewMedicalKnowledge(pool,input)).review_status).toBe('approved');
  await pool.query(`UPDATE ai_document_chunks SET content='Changed source' WHERE id=1`);
  await expect(reviewMedicalKnowledge(pool,input)).rejects.toMatchObject({statusCode:404});
  expect((await reviewMedicalKnowledge(pool,{...input,status:'revoked'})).review_status).toBe('revoked');
  const row=(await pool.query('SELECT metadata FROM ai_knowledge_documents WHERE id=1')).rows[0];
  expect(row.metadata.medical_review_history).toHaveLength(2);
});

import { drainChatDeliveries } from '../repositories/chat-delivery.repository.js';
it('recovers notification delivery after acknowledgement failure without repeating the mutation or in-app event',async()=>{
  await pool.query('CREATE TABLE synthetic_notifications(event_id TEXT PRIMARY KEY)');
  let calls=0;
  const notify={send:async({data})=>{
    calls++;
    await pool.query('INSERT INTO synthetic_notifications(event_id) VALUES($1) ON CONFLICT DO NOTHING',[data.eventId]);
    if(calls===1) throw new Error('Synthetic acknowledgement loss after acceptance');
    return {success:true};
  }};
  expect((await drainChatDeliveries(pool,notify)).delivered).toBe(0);
  await pool.query(`UPDATE chatbot_sessions SET metadata=jsonb_set(metadata,'{delivery,retryAt}','"2000-01-01T00:00:00Z"'::jsonb) WHERE metadata->'delivery'->>'status'='pending'`);
  expect((await drainChatDeliveries(pool,notify)).delivered).toBe(1);
  expect((await drainChatDeliveries(pool,notify)).delivered).toBe(0);
  expect((await pool.query('SELECT count(*) FROM synthetic_notifications')).rows[0].count).toBe('1');
});
