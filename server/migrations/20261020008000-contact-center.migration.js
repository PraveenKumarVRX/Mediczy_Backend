import { pathToFileURL } from 'node:url';

export const TABLES = ['cc_configs', 'cc_agents', 'cc_queues', 'cc_flows', 'cc_calls', 'cc_events', 'cc_transcripts', 'cc_recordings', 'cc_callbacks', 'cc_artifacts', 'cc_jobs', 'cc_suppressions','cc_knowledge','cc_embeddings'];
export async function up(client) {
  await client.query('CREATE EXTENSION IF NOT EXISTS vector');
  await client.query(`
    CREATE TABLE IF NOT EXISTS cc_configs (
      tenant_uid TEXT PRIMARY KEY, provider TEXT NOT NULL DEFAULT 'exotel' CHECK (provider='exotel'),
      credential_prefix TEXT NOT NULL, number TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT false,
      recording_enabled BOOLEAN NOT NULL DEFAULT false, retention_days INTEGER NOT NULL DEFAULT 30 CHECK(retention_days BETWEEN 1 AND 3650),
      gateway_prefix TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS cc_agents (
      tenant_uid TEXT NOT NULL, user_id TEXT NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'agent' CHECK(role IN ('agent','supervisor','admin')),
      presence TEXT NOT NULL DEFAULT 'offline' CHECK(presence IN ('offline','available','busy','wrap_up')),
      skills TEXT[] NOT NULL DEFAULT '{}', languages TEXT[] NOT NULL DEFAULT '{}', priority INTEGER NOT NULL DEFAULT 1 CHECK(priority BETWEEN 0 AND 100),
      active_call_id UUID, last_call_end TIMESTAMPTZ, wrap_until TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY(tenant_uid,user_id)
    );
    CREATE TABLE IF NOT EXISTS cc_queues (
      tenant_uid TEXT NOT NULL, id UUID NOT NULL, name TEXT NOT NULL,
      skills TEXT[] NOT NULL DEFAULT '{}', languages TEXT[] NOT NULL DEFAULT '{}',
      wrap_seconds INTEGER NOT NULL DEFAULT 60 CHECK(wrap_seconds BETWEEN 0 AND 1800),
      timeout_seconds INTEGER NOT NULL DEFAULT 120 CHECK(timeout_seconds BETWEEN 15 AND 3600),
      PRIMARY KEY(tenant_uid,id), UNIQUE(tenant_uid,name)
    );
    CREATE TABLE IF NOT EXISTS cc_flows (
      tenant_uid TEXT NOT NULL, id UUID NOT NULL, version INTEGER NOT NULL, name TEXT NOT NULL,
      graph JSONB NOT NULL, published BOOLEAN NOT NULL DEFAULT false, created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(tenant_uid,id,version)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS cc_one_published_flow ON cc_flows(tenant_uid,id) WHERE published;
    CREATE TABLE IF NOT EXISTS cc_calls (
      tenant_uid TEXT NOT NULL, id UUID NOT NULL, idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'exotel', provider_sid TEXT, direction TEXT NOT NULL CHECK(direction IN ('inbound','outbound')),
      state TEXT NOT NULL DEFAULT 'submitting' CHECK(state IN ('submitting','unknown','queued','ringing','answered','completed','failed','busy','no-answer','canceled')), agent_id TEXT, queue_id UUID, destination TEXT NOT NULL,
      consent JSONB NOT NULL DEFAULT '{}', recording_requested BOOLEAN NOT NULL DEFAULT false,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(), answered_at TIMESTAMPTZ, ended_at TIMESTAMPTZ,
      provider_duration_seconds INTEGER CHECK(provider_duration_seconds >= 0),
      disposition TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY(tenant_uid,id), UNIQUE(tenant_uid,idempotency_key), UNIQUE(tenant_uid,provider,provider_sid),
      FOREIGN KEY(tenant_uid,agent_id) REFERENCES cc_agents(tenant_uid,user_id),
      FOREIGN KEY(tenant_uid,queue_id) REFERENCES cc_queues(tenant_uid,id)
    );
    CREATE INDEX IF NOT EXISTS cc_calls_timeline ON cc_calls(tenant_uid,started_at DESC);
    CREATE TABLE IF NOT EXISTS cc_events (
      tenant_uid TEXT NOT NULL, id BIGSERIAL, call_id UUID, source_key TEXT NOT NULL,
      kind TEXT NOT NULL, actor_id TEXT, payload JSONB NOT NULL DEFAULT '{}',
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(tenant_uid,id), UNIQUE(tenant_uid,source_key),
      FOREIGN KEY(tenant_uid,call_id) REFERENCES cc_calls(tenant_uid,id)
    );
    CREATE TABLE IF NOT EXISTS cc_transcripts (
      tenant_uid TEXT NOT NULL, call_id UUID NOT NULL, segment_id TEXT NOT NULL,
      speaker TEXT NOT NULL CHECK(speaker IN ('caller','agent')), start_ms INTEGER NOT NULL CHECK(start_ms>=0),
      end_ms INTEGER NOT NULL CHECK(end_ms>=start_ms), final BOOLEAN NOT NULL DEFAULT false,
      text TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
      PRIMARY KEY(tenant_uid,call_id,segment_id), FOREIGN KEY(tenant_uid,call_id) REFERENCES cc_calls(tenant_uid,id)
    );
    CREATE TABLE IF NOT EXISTS cc_recordings (
      tenant_uid TEXT NOT NULL, id UUID NOT NULL, call_id UUID NOT NULL, object_key TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('stored','deleting','deleted')), expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(tenant_uid,id),
      UNIQUE(tenant_uid,call_id), FOREIGN KEY(tenant_uid,call_id) REFERENCES cc_calls(tenant_uid,id)
    );
    CREATE TABLE IF NOT EXISTS cc_callbacks (
      tenant_uid TEXT NOT NULL, id UUID NOT NULL, call_id UUID NOT NULL, owner_id TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved')),
      due_at TIMESTAMPTZ NOT NULL DEFAULT now()+interval '1 hour', attempts INTEGER NOT NULL DEFAULT 0,
      resolution TEXT, PRIMARY KEY(tenant_uid,id), UNIQUE(tenant_uid,call_id),
      FOREIGN KEY(tenant_uid,call_id) REFERENCES cc_calls(tenant_uid,id),
      FOREIGN KEY(tenant_uid,owner_id) REFERENCES cc_agents(tenant_uid,user_id)
    );
    CREATE TABLE IF NOT EXISTS cc_artifacts (
      tenant_uid TEXT NOT NULL, call_id UUID NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('summary','copilot','qa')),
      content JSONB NOT NULL, reviewed_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY(tenant_uid,call_id,kind), FOREIGN KEY(tenant_uid,call_id) REFERENCES cc_calls(tenant_uid,id)
    );
    CREATE TABLE IF NOT EXISTS cc_jobs (
      tenant_uid TEXT NOT NULL, id UUID NOT NULL, kind TEXT NOT NULL, call_id UUID,
      state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','running','done','failed')),
      attempts INTEGER NOT NULL DEFAULT 0, available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      error_code TEXT, generation INTEGER NOT NULL DEFAULT 1, lease_until TIMESTAMPTZ,
      PRIMARY KEY(tenant_uid,id), UNIQUE(tenant_uid,call_id,kind), FOREIGN KEY(tenant_uid,call_id) REFERENCES cc_calls(tenant_uid,id)
    );
    CREATE TABLE IF NOT EXISTS cc_suppressions (
      tenant_uid TEXT NOT NULL, phone TEXT NOT NULL, reason TEXT NOT NULL,
      created_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(tenant_uid,phone)
    );
    CREATE TABLE IF NOT EXISTS cc_knowledge (
      tenant_uid TEXT NOT NULL,id UUID NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,
      published BOOLEAN NOT NULL DEFAULT false,approved_by TEXT,updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(tenant_uid,id)
    );
    CREATE TABLE IF NOT EXISTS cc_embeddings (
      tenant_uid TEXT NOT NULL,call_id UUID NOT NULL,embedding vector(768) NOT NULL,
      model TEXT NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(tenant_uid,call_id),
      FOREIGN KEY(tenant_uid,call_id) REFERENCES cc_calls(tenant_uid,id)
    );
    CREATE INDEX IF NOT EXISTS cc_transcript_search ON cc_transcripts USING gin(to_tsvector('simple',text));
    CREATE INDEX IF NOT EXISTS cc_knowledge_search ON cc_knowledge USING gin(to_tsvector('simple',title||' '||body));
  `);
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS cc_unique_exophone ON cc_configs(number)');
  await client.query(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='cc_agents'::regclass AND conname='cc_agent_active_call') THEN
    ALTER TABLE cc_agents ADD CONSTRAINT cc_agent_active_call FOREIGN KEY(tenant_uid,active_call_id) REFERENCES cc_calls(tenant_uid,id) DEFERRABLE INITIALLY DEFERRED;
    END IF; END $$;`);
  for (const table of TABLES) {
    await client.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY; ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS cc_tenant ON ${table};
      CREATE POLICY cc_tenant ON ${table} USING(tenant_uid=current_setting('app.tenant_uid',true)) WITH CHECK(tenant_uid=current_setting('app.tenant_uid',true));`);
  }
  await client.query(`CREATE OR REPLACE FUNCTION cc_immutable_event() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'Call events are append only'; END; $$;
    DROP TRIGGER IF EXISTS cc_events_immutable ON cc_events;
    CREATE TRIGGER cc_events_immutable BEFORE UPDATE OR DELETE ON cc_events FOR EACH ROW EXECUTE FUNCTION cc_immutable_event();`);
}
export async function withMigrationOwner(client,work) {
  const admin=(await client.query('SELECT current_user AS name')).rows[0].name;
  const quote=name=>'"'+name.replaceAll('"','""')+'"';
  const owner=(await client.query("SELECT oid FROM pg_roles WHERE rolname='mediqzy_voice_owner'")).rows[0];
  const inherited=owner&&(await client.query('SELECT pg_has_role(current_user,$1::oid,\'MEMBER\') AS member',[owner.oid])).rows[0].member;
  await client.query("DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mediqzy_voice_owner') THEN CREATE ROLE mediqzy_voice_owner NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT; END IF; END $$;");
  await client.query(`GRANT mediqzy_voice_owner TO ${quote(admin)}`);
  // Callers must run in a transaction. A failed SQL statement requires a
  // rollback, which also removes a temporary grant; preserve its original error.
  let failed=false;
  try{return await work();}catch(error){failed=true;throw error;}finally{
    if(!inherited){const cleanup=client.query(`REVOKE mediqzy_voice_owner FROM ${quote(admin)}`);if(failed)await cleanup.catch(()=>{});else await cleanup;}
  }
}
export async function harden(client,runtimeRole,tables=TABLES) {
  if(!/^[a-z_][a-z0-9_]{0,62}$/.test(runtimeRole||''))throw new Error('A valid explicit runtime database role is required');
  const quote=name=>'"'+name.replaceAll('"','""')+'"';
  return withMigrationOwner(client,async()=>{
  await client.query('GRANT USAGE,CREATE ON SCHEMA public TO mediqzy_voice_owner');
  for(const table of tables){
    if(!/^cc_[a-z_]+$/.test(table))throw new Error('Invalid voice table');
    await client.query(`ALTER TABLE ${table} OWNER TO mediqzy_voice_owner; REVOKE ALL ON ${table} FROM PUBLIC,${quote(runtimeRole)}; GRANT SELECT,INSERT${table==='cc_events'?'':',UPDATE,DELETE'} ON ${table} TO ${quote(runtimeRole)}`);
  }
  await client.query(`ALTER SEQUENCE cc_events_id_seq OWNER TO mediqzy_voice_owner; GRANT USAGE,SELECT ON SEQUENCE cc_events_id_seq TO ${quote(runtimeRole)};
    ALTER FUNCTION cc_immutable_event() OWNER TO mediqzy_voice_owner;REVOKE ALL ON FUNCTION cc_immutable_event() FROM PUBLIC;`);
  });
}
export async function down() { throw new Error('Contact-center rollback is application-only; call events must be retained'); }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if(!process.argv.includes('--check'))throw new Error('Run scripts/ops/migrate-contact-center.mjs with the separate database administrator; application credentials must not own these tables');
  const {default:pool}=await import('../db/pgPool.js');
  const {TABLES:mediaTables}=await import('./20261020008100-contact-center-livekit.migration.js');
  const requiredTables=[...TABLES,...mediaTables];
  try{
    const {rows}=await pool.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,r.rolname FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.relnamespace='public'::regnamespace AND c.relname=ANY($1)`,[requiredTables]);
    if(rows.length!==requiredTables.length||rows.some(r=>!r.relrowsecurity||!r.relforcerowsecurity||r.rolname!=='mediqzy_voice_owner'))throw new Error('Contact-center schema requires the administrator migration and ownership hardening');
    console.log('Contact-center schema ownership and forced tenant RLS verified');
  }finally{await pool.end();}
}
