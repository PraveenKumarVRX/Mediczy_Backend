CREATE TABLE IF NOT EXISTS crm_chatwoot_accounts (
  tenant_id BIGINT PRIMARY KEY CHECK (tenant_id > 0),
  account_id BIGINT NOT NULL UNIQUE CHECK (account_id > 0),
  api_token_env VARCHAR(120) NOT NULL,
  webhook_secret_env VARCHAR(120) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_chatwoot_inboxes (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES crm_chatwoot_accounts(tenant_id),
  inbox_id BIGINT NOT NULL CHECK (inbox_id > 0),
  channel VARCHAR(30) NOT NULL CHECK (channel IN ('whatsapp', 'sms', 'email', 'in_app')),
  channel_address VARCHAR(320) NOT NULL,
  provider VARCHAR(30) NOT NULL CHECK (provider IN ('twilio', 'smtp', 'internal')),
  credentials_prefix VARCHAR(100) NOT NULL,
  inbound_webhook_url TEXT,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (tenant_id, inbox_id),
  UNIQUE (channel, channel_address),
  UNIQUE (id, tenant_id),
  CHECK ((channel IN ('whatsapp', 'sms') AND provider = 'twilio')
      OR (channel = 'email' AND provider = 'smtp')
      OR (channel = 'in_app' AND provider = 'internal'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_conversations_id_tenant ON crm_conversations (id, tenant_id);

CREATE TABLE IF NOT EXISTS crm_chatwoot_conversations (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  integration_id BIGINT NOT NULL,
  customer_id VARCHAR(320) NOT NULL,
  customer_name VARCHAR(240),
  crm_conversation_id BIGINT NOT NULL,
  contact_id BIGINT,
  conversation_id BIGINT,
  FOREIGN KEY (integration_id, tenant_id) REFERENCES crm_chatwoot_inboxes(id, tenant_id),
  FOREIGN KEY (crm_conversation_id, tenant_id) REFERENCES crm_conversations(id, tenant_id),
  UNIQUE (integration_id, customer_id),
  UNIQUE (tenant_id, conversation_id),
  UNIQUE (id, tenant_id)
);

CREATE TABLE IF NOT EXISTS crm_chatwoot_jobs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  bridge_conversation_id BIGINT NOT NULL,
  direction VARCHAR(20) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  external_id VARCHAR(240) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'uncertain')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  last_error TEXT,
  provider_message_id VARCHAR(240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (bridge_conversation_id, tenant_id) REFERENCES crm_chatwoot_conversations(id, tenant_id),
  UNIQUE (bridge_conversation_id, direction, external_id)
);
CREATE INDEX IF NOT EXISTS idx_chatwoot_jobs_pending
  ON crm_chatwoot_jobs (available_at, id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_chatwoot_jobs_conversation_active
  ON crm_chatwoot_jobs (bridge_conversation_id, id) WHERE status IN ('pending', 'processing', 'uncertain');
