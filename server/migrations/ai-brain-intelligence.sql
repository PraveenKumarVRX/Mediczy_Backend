-- ============================================================
-- AI Brain Intelligence Layer — Database Migration
-- Mediczy Healthcare Platform
-- 16 tables for agentic AI, RAG, tools, memory, workflows
-- ============================================================
-- Ensure pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
-- ============================================================
-- 1. AI MODEL CONFIGS — LLM provider configurations
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_model_configs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    provider VARCHAR(50) NOT NULL DEFAULT 'groq',
    -- groq, openai, gemini, anthropic, local
    model_name VARCHAR(100) NOT NULL DEFAULT 'llama-3.3-70b-versatile',
    api_base_url VARCHAR(500),
    temperature FLOAT NOT NULL DEFAULT 0.4,
    max_tokens INTEGER NOT NULL DEFAULT 4096,
    top_p FLOAT DEFAULT 0.9,
    is_active BOOLEAN NOT NULL DEFAULT true,
    config JSONB NOT NULL DEFAULT '{}',
    -- extra params
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Seed default config
INSERT INTO ai_model_configs (
        name,
        provider,
        model_name,
        temperature,
        max_tokens,
        config
    )
VALUES (
        'dr-isha-primary',
        'groq',
        'llama-3.3-70b-versatile',
        0.4,
        4096,
        '{"fallback_model": "llama-3.1-8b-instant", "system_role": "Dr. iSHA - Synthetic Intelligence Health Assistant"}'::jsonb
    ) ON CONFLICT (name) DO NOTHING;
-- ============================================================
-- 2. AI PROMPT TEMPLATES — Versioned prompt templates
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_prompt_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    category VARCHAR(50) NOT NULL DEFAULT 'system',
    -- system, user, tool, rag
    template TEXT NOT NULL,
    input_schema JSONB DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(name, version)
);
-- Seed system prompt
INSERT INTO ai_prompt_templates (name, version, category, template)
VALUES (
        'brain-system-prompt',
        1,
        'system',
        'You are Dr. iSHA (Intelligent Synthetic Health Assistant), an AI-powered medical assistant for the Mediczy healthcare platform.

CAPABILITIES:
- Medical consultations and symptom assessment
- Appointment booking and management
- Prescription and lab result retrieval
- Patient health monitoring and wellness tracking
- Medical knowledge search (RAG)
- Emergency triage assessment

GUIDELINES:
1. Always be empathetic, professional, and evidence-based
2. Never diagnose definitively — suggest consultations for serious symptoms
3. Flag emergencies immediately (chest pain, breathing difficulty, stroke symptoms)
4. Respect patient privacy — only access data for the authenticated user
5. Cite medical sources when available from the knowledge base
6. Use tools to fetch real-time patient data rather than guessing

CONTEXT:
- Current date: {{current_date}}
- Patient: {{patient_name}} (ID: {{patient_id}})
- User memory: {{user_memory}}
- RAG context: {{rag_context}}
- Conversation summary: {{conversation_summary}}'
    ) ON CONFLICT (name, version) DO NOTHING;
-- ============================================================
-- 3. AI REQUEST LOGS — Every LLM call audit trail
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_request_logs (
    id SERIAL PRIMARY KEY,
    model_config_id INTEGER REFERENCES ai_model_configs(id),
    conversation_id INTEGER,
    provider VARCHAR(50) NOT NULL,
    model_name VARCHAR(100) NOT NULL,
    input_messages JSONB NOT NULL DEFAULT '[]',
    output_text TEXT,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    cost_usd FLOAT DEFAULT 0,
    latency_ms INTEGER DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'success',
    -- success, error, timeout
    error_message TEXT,
    tool_calls JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_request_logs_conv ON ai_request_logs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_request_logs_created ON ai_request_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_request_logs_provider ON ai_request_logs(provider);
-- ============================================================
-- 4. AI BRAIN CONVERSATIONS — Agentic conversation sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_brain_conversations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    user_type VARCHAR(20) NOT NULL DEFAULT 'patient',
    -- patient, doctor, admin
    title VARCHAR(255),
    summary TEXT,
    token_count INTEGER NOT NULL DEFAULT 0,
    message_count INTEGER NOT NULL DEFAULT 0,
    tool_call_count INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    -- active, archived, deleted
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_brain_conv_user ON ai_brain_conversations(user_id, user_type);
CREATE INDEX IF NOT EXISTS idx_brain_conv_status ON ai_brain_conversations(status);
-- ============================================================
-- 5. AI BRAIN MESSAGES — Messages in conversations
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_brain_messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES ai_brain_conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    -- user, assistant, system, tool_call, tool_result
    content TEXT,
    tool_name VARCHAR(100),
    tool_input JSONB,
    tool_output JSONB,
    tokens INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_brain_msg_conv ON ai_brain_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_brain_msg_role ON ai_brain_messages(role);
-- ============================================================
-- 6. AI USER MEMORY — Persistent per-user memory
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_user_memory (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    user_type VARCHAR(20) NOT NULL DEFAULT 'patient',
    facts JSONB NOT NULL DEFAULT '{}',
    -- key-value facts about the user
    notes TEXT DEFAULT '',
    -- free-form notes
    preferences JSONB NOT NULL DEFAULT '{}',
    -- user preferences
    stats JSONB NOT NULL DEFAULT '{"total_conversations": 0, "total_messages": 0, "total_tool_calls": 0}',
    last_interaction TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, user_type)
);
-- ============================================================
-- 7. AI TOOL EXECUTIONS — Audit log of every tool invocation
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_tool_executions (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER REFERENCES ai_brain_conversations(id),
    user_id INTEGER NOT NULL,
    tool_name VARCHAR(100) NOT NULL,
    tool_category VARCHAR(50),
    -- patient, appointment, lab, wellness, memory, rag, action
    input_params JSONB NOT NULL DEFAULT '{}',
    output_data JSONB,
    status VARCHAR(20) NOT NULL DEFAULT 'success',
    -- success, error, denied
    error_message TEXT,
    latency_ms INTEGER DEFAULT 0,
    is_write BOOLEAN NOT NULL DEFAULT false,
    -- true for dangerous/write tools
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tool_exec_conv ON ai_tool_executions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_tool_exec_user ON ai_tool_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_tool_exec_tool ON ai_tool_executions(tool_name);
-- ============================================================
-- 8. AI KNOWLEDGE DOCUMENTS — RAG document store
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_knowledge_documents (
    id SERIAL PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    file_type VARCHAR(20) NOT NULL DEFAULT 'pdf',
    -- pdf, txt, md, html
    file_path VARCHAR(1000),
    file_size INTEGER DEFAULT 0,
    content_text TEXT,
    -- extracted full text
    chunk_count INTEGER NOT NULL DEFAULT 0,
    scope VARCHAR(50) NOT NULL DEFAULT 'global',
    -- global, hospital, doctor
    scope_id VARCHAR(100),
    -- hospital_id or doctor_id for scoping
    category VARCHAR(100) DEFAULT 'general',
    -- clinical_guidelines, drug_info, protocol, patient_education
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- pending, processing, ready, error
    metadata JSONB DEFAULT '{}',
    uploaded_by INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_scope ON ai_knowledge_documents(scope, scope_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_status ON ai_knowledge_documents(status);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_category ON ai_knowledge_documents(category);
-- ============================================================
-- 9. AI DOCUMENT CHUNKS — pgvector chunks for RAG
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_document_chunks (
    id SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES ai_knowledge_documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL DEFAULT 0,
    content TEXT NOT NULL,
    token_count INTEGER NOT NULL DEFAULT 0,
    embedding vector(768),
    -- ClinicalBERT dimension (matches SIB)
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_doc_chunks_doc ON ai_document_chunks(document_id);
-- HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS idx_doc_chunks_embedding ON ai_document_chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
-- ============================================================
-- 10. AI RAG QUERY LOGS — RAG retrieval audit
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_rag_query_logs (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER,
    user_id INTEGER,
    query_text TEXT NOT NULL,
    chunks_retrieved INTEGER NOT NULL DEFAULT 0,
    top_score FLOAT,
    avg_score FLOAT,
    latency_ms INTEGER DEFAULT 0,
    results JSONB DEFAULT '[]',
    -- [{chunk_id, score, snippet}]
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- ============================================================
-- 11. AI HEALTH RISK SCORES — Per-patient health risk assessment
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_health_risk_scores (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL,
    overall_score FLOAT NOT NULL DEFAULT 5.0,
    -- 1-10 scale
    risk_level VARCHAR(20) NOT NULL DEFAULT 'moderate',
    -- low, moderate, high, critical
    subscores JSONB NOT NULL DEFAULT '{}',
    -- {diabetes: 3.2, cardiac: 5.1, lifestyle: 6.0, ...}
    risk_factors JSONB DEFAULT '[]',
    -- ["smoking", "obesity", "family_history"]
    recommendations JSONB DEFAULT '[]',
    -- AI-generated health recommendations
    data_sources JSONB DEFAULT '{}',
    -- what data was used for scoring
    model_version VARCHAR(50) DEFAULT 'v1',
    valid_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_health_risk_patient ON ai_health_risk_scores(patient_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_health_risk_patient_unique ON ai_health_risk_scores(patient_id);
-- ============================================================
-- 12. AI CLINICAL INSIGHTS — AI-generated insights
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_clinical_insights (
    id SERIAL PRIMARY KEY,
    insight_type VARCHAR(50) NOT NULL,
    -- trend, risk, recommendation, alert, summary
    target_type VARCHAR(20) NOT NULL DEFAULT 'patient',
    -- patient, doctor, hospital, system
    target_id INTEGER,
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    severity VARCHAR(20) DEFAULT 'info',
    -- info, warning, critical
    data JSONB DEFAULT '{}',
    is_actionable BOOLEAN NOT NULL DEFAULT false,
    action_taken BOOLEAN NOT NULL DEFAULT false,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clinical_insights_target ON ai_clinical_insights(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_clinical_insights_type ON ai_clinical_insights(insight_type);
-- ============================================================
-- 13. AI WELLNESS GOALS — Patient wellness goals
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_wellness_goals (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL,
    goal_type VARCHAR(50) NOT NULL,
    -- steps, sleep, exercise, water, meditation, nutrition, weight, screening
    title VARCHAR(255) NOT NULL,
    target_value FLOAT,
    target_unit VARCHAR(50),
    -- steps, hours, minutes, ml, kg, count
    current_value FLOAT DEFAULT 0,
    frequency VARCHAR(20) NOT NULL DEFAULT 'daily',
    -- daily, weekly, monthly
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    -- active, completed, paused, abandoned
    streak_days INTEGER NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wellness_goals_patient ON ai_wellness_goals(patient_id);
-- ============================================================
-- 14. AI WELLNESS LOGS — Daily wellness data entries
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_wellness_logs (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL,
    goal_id INTEGER REFERENCES ai_wellness_goals(id),
    log_date DATE NOT NULL DEFAULT CURRENT_DATE,
    metric_type VARCHAR(50) NOT NULL,
    -- steps, sleep_hours, water_ml, exercise_min, weight_kg, etc.
    value FLOAT NOT NULL,
    unit VARCHAR(50),
    notes TEXT,
    source VARCHAR(50) DEFAULT 'manual',
    -- manual, device, ai_bot
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wellness_logs_patient ON ai_wellness_logs(patient_id, log_date);
-- ============================================================
-- 15. AI SMART NOTIFICATIONS — AI-triggered notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_smart_notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    user_type VARCHAR(20) NOT NULL DEFAULT 'patient',
    notification_type VARCHAR(50) NOT NULL,
    -- appointment_reminder, medication_reminder, health_alert, wellness_nudge,
    -- lab_result_ready, follow_up, preventive_care, emergency
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    channel VARCHAR(20) NOT NULL DEFAULT 'in_app',
    -- in_app, email, sms, whatsapp, push
    priority VARCHAR(20) NOT NULL DEFAULT 'normal',
    -- low, normal, high, urgent
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- pending, sent, delivered, read, failed
    scheduled_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_smart_notif_user ON ai_smart_notifications(user_id, user_type);
CREATE INDEX IF NOT EXISTS idx_smart_notif_status ON ai_smart_notifications(status);
-- ============================================================
-- 16. AI PATIENT DASHBOARDS — Cached per-user AI dashboard
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_patient_dashboards (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL UNIQUE,
    health_summary TEXT,
    -- AI-generated health summary
    risk_score FLOAT,
    active_conditions JSONB DEFAULT '[]',
    upcoming_appointments JSONB DEFAULT '[]',
    active_medications JSONB DEFAULT '[]',
    wellness_progress JSONB DEFAULT '{}',
    insights JSONB DEFAULT '[]',
    -- recent AI insights
    recommendations JSONB DEFAULT '[]',
    -- personalized recommendations
    last_refreshed TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- ============================================================
-- Migration complete
-- ============================================================