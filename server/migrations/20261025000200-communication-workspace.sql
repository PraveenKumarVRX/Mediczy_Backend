CREATE TABLE IF NOT EXISTS communication_workspace_rooms (
 id uuid NOT NULL, tenant_uid text NOT NULL REFERENCES entity_registry(uid),
 name varchar(120) NOT NULL, slug text, created_by integer NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_uid,id), UNIQUE(tenant_uid,slug)
);
CREATE TABLE IF NOT EXISTS communication_workspace_members (
 tenant_uid text NOT NULL, room_id uuid NOT NULL, user_id integer NOT NULL REFERENCES users(id),
 last_read_sequence bigint NOT NULL DEFAULT 0, joined_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_uid,room_id,user_id),
 FOREIGN KEY(tenant_uid,room_id) REFERENCES communication_workspace_rooms(tenant_uid,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS communication_workspace_messages (
 sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, id uuid NOT NULL UNIQUE,
 tenant_uid text NOT NULL, room_id uuid NOT NULL, sender_id integer NOT NULL REFERENCES users(id),
 client_id uuid NOT NULL, body text NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_uid,room_id,sender_id) REFERENCES communication_workspace_members(tenant_uid,room_id,user_id),
 UNIQUE(tenant_uid,room_id,sender_id,client_id)
);
CREATE INDEX IF NOT EXISTS communication_workspace_messages_thread ON communication_workspace_messages(tenant_uid,room_id,sequence DESC);
CREATE INDEX IF NOT EXISTS communication_workspace_members_actor ON communication_workspace_members(tenant_uid,user_id);
-- These tables use explicit, mandatory tenant predicates in the service. No legacy rows are reassigned.
CREATE TABLE IF NOT EXISTS communication_workspace_attachments (
 id uuid PRIMARY KEY,tenant_uid text NOT NULL,room_id uuid NOT NULL,uploaded_by integer NOT NULL,
 name varchar(180) NOT NULL,mime varchar(100) NOT NULL,bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 8388608),
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_uid,room_id,id),
 FOREIGN KEY(tenant_uid,room_id,uploaded_by) REFERENCES communication_workspace_members(tenant_uid,room_id,user_id)
);
ALTER TABLE communication_workspace_messages ADD COLUMN IF NOT EXISTS attachment_id uuid;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='communication_workspace_message_attachment_fk' AND conrelid='communication_workspace_messages'::regclass) THEN
  ALTER TABLE communication_workspace_messages ADD CONSTRAINT communication_workspace_message_attachment_fk
   FOREIGN KEY(tenant_uid,room_id,attachment_id) REFERENCES communication_workspace_attachments(tenant_uid,room_id,id);
 END IF;
END $$;
