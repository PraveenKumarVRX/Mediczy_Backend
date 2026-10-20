export const TABLES=['cc_media_sessions','cc_media_members','cc_media_operations','cc_voice_campaigns','cc_voice_recipients','cc_voice_challenges','cc_voice_enrollments','cc_voice_verifications'];
export async function up(c){
  await c.query(`
    CREATE TABLE IF NOT EXISTS cc_media_sessions(
      tenant_uid text NOT NULL,call_id uuid NOT NULL,room_name text NOT NULL UNIQUE,
      state text NOT NULL DEFAULT 'preparing' CHECK(state IN('preparing','ready','held','ended','unknown')),
      caller_identity text NOT NULL DEFAULT 'caller',bot_dispatch_id text,transcription_dispatch_id text,
      language text NOT NULL DEFAULT 'en',transcribe boolean NOT NULL DEFAULT false,
      held_at timestamptz,hold_seconds integer NOT NULL DEFAULT 0,
      guest_hash text,guest_expires_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(tenant_uid,call_id),FOREIGN KEY(tenant_uid,call_id) REFERENCES cc_calls(tenant_uid,id)
    );
    CREATE TABLE IF NOT EXISTS cc_media_members(
      tenant_uid text NOT NULL,id uuid NOT NULL,call_id uuid NOT NULL,identity text NOT NULL,room_name text NOT NULL,
      mode text NOT NULL CHECK(mode IN('agent','caller','listen','whisper','barge')),actor_id text,
      expires_at timestamptz NOT NULL,revoked boolean NOT NULL DEFAULT false,
      PRIMARY KEY(tenant_uid,id),FOREIGN KEY(tenant_uid,call_id) REFERENCES cc_calls(tenant_uid,id)
    );
    CREATE TABLE IF NOT EXISTS cc_media_operations(
      tenant_uid text NOT NULL,call_id uuid NOT NULL,key text NOT NULL,request_hash text NOT NULL,
      action text NOT NULL,state text NOT NULL DEFAULT 'reserved' CHECK(state IN('reserved','succeeded','unknown','failed')),
      created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant_uid,call_id,key),
      FOREIGN KEY(tenant_uid,call_id) REFERENCES cc_calls(tenant_uid,id)
    );
    CREATE TABLE IF NOT EXISTS cc_voice_campaigns(
      tenant_uid text NOT NULL,id uuid NOT NULL,name text NOT NULL,owner_id text NOT NULL,
      transport text NOT NULL CHECK(transport IN('exotel','livekit')),bot boolean NOT NULL DEFAULT false,
      status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','active','paused','completed')),
      timezone text NOT NULL DEFAULT 'Asia/Kolkata',open_time text NOT NULL DEFAULT '09:00',close_time text NOT NULL DEFAULT '18:00',
      days integer[] NOT NULL DEFAULT '{1,2,3,4,5,6}',max_attempts integer NOT NULL DEFAULT 1 CHECK(max_attempts BETWEEN 1 AND 5),
      created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant_uid,id),
      FOREIGN KEY(tenant_uid,owner_id) REFERENCES cc_agents(tenant_uid,user_id)
    );
    CREATE TABLE IF NOT EXISTS cc_voice_recipients(
      tenant_uid text NOT NULL,id uuid NOT NULL,campaign_id uuid NOT NULL,identity_id bigint NOT NULL,
      state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','reserved','started','completed','retry','failed','unknown','suppressed')),
      call_id uuid,attempts integer NOT NULL DEFAULT 0,next_run_at timestamptz NOT NULL DEFAULT now(),
      source_key text NOT NULL,lease_until timestamptz,error_code text,
      PRIMARY KEY(tenant_uid,id),UNIQUE(tenant_uid,source_key),
      FOREIGN KEY(tenant_uid,campaign_id) REFERENCES cc_voice_campaigns(tenant_uid,id),
      FOREIGN KEY(tenant_uid,call_id) REFERENCES cc_calls(tenant_uid,id)
    );
    CREATE INDEX IF NOT EXISTS cc_voice_due ON cc_voice_recipients(tenant_uid,state,next_run_at);
    CREATE TABLE IF NOT EXISTS cc_voice_challenges(
      tenant_uid text NOT NULL,id uuid NOT NULL,identity_id bigint NOT NULL,purpose text NOT NULL CHECK(purpose IN('enroll','verify')),
      phrase text NOT NULL,expires_at timestamptz NOT NULL,consumed boolean NOT NULL DEFAULT false,
      PRIMARY KEY(tenant_uid,id)
    );
    CREATE TABLE IF NOT EXISTS cc_voice_enrollments(
      tenant_uid text NOT NULL,id uuid NOT NULL,identity_id bigint NOT NULL,model text NOT NULL,
      template_ciphertext text,consent_ref text NOT NULL,expires_at timestamptz NOT NULL,revoked_at timestamptz,
      created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant_uid,id)
    );
    CREATE TABLE IF NOT EXISTS cc_voice_verifications(
      tenant_uid text NOT NULL,id uuid NOT NULL,enrollment_id uuid NOT NULL,challenge_id uuid NOT NULL,
      score double precision NOT NULL CHECK(score BETWEEN -1 AND 1),liveness boolean NOT NULL,
      verdict text NOT NULL CHECK(verdict IN('review_required','non_match_candidate','match_candidate')),
      model text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant_uid,id),
      FOREIGN KEY(tenant_uid,enrollment_id) REFERENCES cc_voice_enrollments(tenant_uid,id),
      FOREIGN KEY(tenant_uid,challenge_id) REFERENCES cc_voice_challenges(tenant_uid,id)
    );
  `);
  for(const name of TABLES)await c.query(`ALTER TABLE ${name} ENABLE ROW LEVEL SECURITY;ALTER TABLE ${name} FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS cc_tenant ON ${name};CREATE POLICY cc_tenant ON ${name}
    USING(tenant_uid=current_setting('app.tenant_uid',true)) WITH CHECK(tenant_uid=current_setting('app.tenant_uid',true));`);
}
export async function down(){throw new Error('Retain call and biometric audit records; application-only rollback');}
