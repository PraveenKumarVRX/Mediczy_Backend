/** Explicit owner-only additive upgrade. Never run from normal API startup. */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { postgresTls } from '../../db/postgres-tls.js';
const password=readFileSync(join(process.env.CRM_BOOTSTRAP_SECRET_DIRECTORY||'/run/bootstrap','owner-password'),'utf8').trim();
const db=new pg.Client({host:process.env.POSTGRES_HOST,port:Number(process.env.POSTGRES_PORT),database:process.env.POSTGRES_DATABASE,user:'medstar_owner',password,ssl:postgresTls()});
try{
 await db.connect();await db.query('BEGIN');await db.query("SELECT pg_advisory_xact_lock(hashtext('communication-workspace-upgrade'))");
 if(process.env.CRM_TENANT_UID!=='H98VG4'||process.env.CRM_TENANT_ID!=='70')throw Error('Unexpected installation identity');
 await db.query(readFileSync(new URL('../../migrations/20261025000200-communication-workspace.sql',import.meta.url),'utf8'));
 await db.query('GRANT SELECT,INSERT,UPDATE,DELETE ON communication_workspace_rooms,communication_workspace_members,communication_workspace_messages,communication_workspace_attachments TO medstar_app');
 await db.query('GRANT USAGE,SELECT ON SEQUENCE communication_workspace_messages_sequence_seq TO medstar_app');
 await db.query('COMMIT');console.log('Communication workspace upgrade applied');
}catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{await db.end();}
