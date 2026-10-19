/** Additive nursing workflow schema. No clinical records are deleted on rollback. */
export async function up(queryInterface, Sequelize) {
  const db = queryInterface.sequelize;
  await db.transaction(async transaction => {
    const q = sql => db.query(sql, { transaction });
    await q(`
      CREATE TABLE IF NOT EXISTS nursing_facility_settings (
        organization_id BIGINT PRIMARY KEY, timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
        barcode_required BOOLEAN NOT NULL DEFAULT true, ai_enabled BOOLEAN NOT NULL DEFAULT false, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS nursing_staff_links (
        organization_id BIGINT NOT NULL, actor_role TEXT NOT NULL, actor_id BIGINT NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id), linked_by BIGINT NOT NULL, linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY(organization_id,actor_role,actor_id)
      );
      CREATE TABLE IF NOT EXISTS nursing_assignments (
        id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL, nurse_id BIGINT NOT NULL,
        ward_id BIGINT NOT NULL REFERENCES wards(id), shift_name TEXT NOT NULL,
        starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ NOT NULL CHECK(ends_at>starts_at),
        assigned_by BIGINT NOT NULL, revoked_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS nursing_assignment_scope ON nursing_assignments(organization_id,nurse_id,ward_id,ends_at);
      CREATE TABLE IF NOT EXISTS nursing_audit_events (
        id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL, actor_id BIGINT NOT NULL,
        actor_role TEXT NOT NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
        data JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS nursing_outbox (
        id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL, event_type TEXT NOT NULL,
        entity_id TEXT NOT NULL, payload JSONB NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
        processed_at TIMESTAMPTZ, last_error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS nursing_outbox_pending ON nursing_outbox(organization_id,id) WHERE processed_at IS NULL;
      CREATE TABLE IF NOT EXISTS nursing_images (
        id UUID PRIMARY KEY, organization_id BIGINT NOT NULL, admission_id BIGINT NOT NULL REFERENCES ip_admissions(id),
        object_key TEXT NOT NULL UNIQUE, content_type TEXT NOT NULL, byte_count INTEGER NOT NULL,
        uploaded_by BIGINT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS nursing_notifications (
        id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL, event_id BIGINT NOT NULL REFERENCES nursing_outbox(id),
        nurse_id BIGINT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(event_id,nurse_id)
      );
      CREATE TABLE IF NOT EXISTS nursing_devices (
        id UUID PRIMARY KEY, organization_id BIGINT NOT NULL,
        public_key TEXT NOT NULL, registered_by BIGINT NOT NULL, revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS nursing_device_bindings (
        device_id UUID PRIMARY KEY REFERENCES nursing_devices(id), organization_id BIGINT NOT NULL,
        admission_id BIGINT NOT NULL REFERENCES ip_admissions(id), label TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS nursing_device_observations (
        id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL, admission_id BIGINT NOT NULL REFERENCES ip_admissions(id),
        device_id UUID NOT NULL REFERENCES nursing_devices(id), observed_at TIMESTAMPTZ NOT NULL, payload JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected')), reviewed_by BIGINT,
        reviewed_at TIMESTAMPTZ, review_note TEXT, entry_id BIGINT REFERENCES nursing_flowsheet_entries(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS nursing_replays (
        organization_id BIGINT NOT NULL, operation TEXT NOT NULL, request_key TEXT NOT NULL,
        request_hash TEXT NOT NULL, result JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY(organization_id,operation,request_key)
      );
      ALTER TABLE nursing_flowsheet_entries
        ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'recorded',
        ADD COLUMN IF NOT EXISTS signed_by BIGINT, ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS amends_id BIGINT REFERENCES nursing_flowsheet_entries(id),
        ADD COLUMN IF NOT EXISTS amendment_reason TEXT,
        ADD COLUMN IF NOT EXISTS clinical_day DATE,
        ADD COLUMN IF NOT EXISTS vital_record_id BIGINT,
        ADD COLUMN IF NOT EXISTS entry_data JSONB NOT NULL DEFAULT '{}';
      UPDATE nursing_flowsheet_entries SET clinical_day=(recorded_at AT TIME ZONE 'Asia/Kolkata')::date WHERE clinical_day IS NULL;
      ALTER TABLE nursing_tasks ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS template_key TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS nursing_task_template_unique ON nursing_tasks(organization_id,admission_id,template_key) WHERE template_key IS NOT NULL;
      ALTER TABLE nursing_assessments ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS template_version TEXT NOT NULL DEFAULT '1';
      ALTER TABLE medication_orders ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS prn_min_hours NUMERIC,
        ADD COLUMN IF NOT EXISTS prn_max_24h INTEGER,
        ADD COLUMN IF NOT EXISTS infusion_rate_ml_hr NUMERIC;
      CREATE TABLE IF NOT EXISTS nursing_infusion_events (
        id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL, admission_id BIGINT NOT NULL REFERENCES ip_admissions(id),
        order_id BIGINT NOT NULL, administration_id BIGINT NOT NULL, event_type TEXT NOT NULL CHECK(event_type IN ('start','rate_change','stop')),
        rate_ml_hr NUMERIC, reason TEXT NOT NULL, recorded_by BIGINT NOT NULL, witness_id BIGINT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE medication_administrations
        ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS terminal_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS dose_unit_given TEXT,
        ADD COLUMN IF NOT EXISTS verification_data JSONB NOT NULL DEFAULT '{}';
      UPDATE medication_administrations SET terminal_at=administered_time WHERE administered_time IS NOT NULL AND terminal_at IS NULL;
      ALTER TABLE medication_administrations ALTER COLUMN outcome DROP DEFAULT;
      ALTER TABLE pharmacy_dispense_queue ADD COLUMN IF NOT EXISTS request_hash TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS nursing_dispense_administration_unique ON pharmacy_dispense_queue(organization_id,administration_id) WHERE administration_id IS NOT NULL;
      CREATE TABLE IF NOT EXISTS nursing_handovers (
        id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL, ward_id BIGINT NOT NULL,
        shift_name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sent','accepted')),
        version INTEGER NOT NULL DEFAULT 1, created_by BIGINT NOT NULL, receiver_id BIGINT,
        snapshot JSONB NOT NULL, sbar JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        sent_at TIMESTAMPTZ, accepted_at TIMESTAMPTZ
      );
      ALTER TABLE wound_tracking_records ADD COLUMN IF NOT EXISTS admission_id BIGINT,
        ADD COLUMN IF NOT EXISTS episode_id UUID,
        ADD COLUMN IF NOT EXISTS body_site TEXT,
        ADD COLUMN IF NOT EXISTS reviewed_by BIGINT,
        ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS measurements JSONB NOT NULL DEFAULT '{}';
      CREATE INDEX IF NOT EXISTS nursing_wound_episode ON wound_tracking_records(tenant_id,admission_id,episode_id);
      CREATE TABLE IF NOT EXISTS nursing_interventions (
        id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL, admission_id BIGINT NOT NULL REFERENCES ip_admissions(id),
        wound_record_id BIGINT REFERENCES wound_tracking_records(id), procedure_type TEXT NOT NULL,
        details JSONB NOT NULL, performed_by BIGINT NOT NULL, performed_at TIMESTAMPTZ NOT NULL,
        reassess_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS nursing_care_goals (
        id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL, admission_id BIGINT NOT NULL REFERENCES ip_admissions(id),
        care_plan_id INTEGER, problem TEXT NOT NULL, goal TEXT NOT NULL,
        intervention TEXT NOT NULL, due_at TIMESTAMPTZ, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','met','unmet','cancelled')),
        version INTEGER NOT NULL DEFAULT 1, created_by BIGINT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS nursing_goal_evaluations (
        id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL, goal_id BIGINT NOT NULL REFERENCES nursing_care_goals(id),
        status TEXT NOT NULL, note TEXT NOT NULL, evaluated_by BIGINT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE OR REPLACE FUNCTION nursing_immutable_event() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'Clinical history is append-only' USING ERRCODE='23514'; END $$;
      DROP TRIGGER IF EXISTS nursing_audit_immutable ON nursing_audit_events;
      CREATE TRIGGER nursing_audit_immutable BEFORE UPDATE OR DELETE ON nursing_audit_events FOR EACH ROW EXECUTE FUNCTION nursing_immutable_event();
      DROP TRIGGER IF EXISTS nursing_goal_evaluation_immutable ON nursing_goal_evaluations;
      CREATE TRIGGER nursing_goal_evaluation_immutable BEFORE UPDATE OR DELETE ON nursing_goal_evaluations FOR EACH ROW EXECUTE FUNCTION nursing_immutable_event();
      DROP TRIGGER IF EXISTS nursing_infusion_immutable ON nursing_infusion_events;
      CREATE TRIGGER nursing_infusion_immutable BEFORE UPDATE OR DELETE ON nursing_infusion_events FOR EACH ROW EXECUTE FUNCTION nursing_immutable_event();
      CREATE OR REPLACE FUNCTION nursing_protect_terminal_dose() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF OLD.terminal_at IS NOT NULL THEN RAISE EXCEPTION 'A recorded dose cannot be overwritten' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
      DROP TRIGGER IF EXISTS nursing_terminal_dose_immutable ON medication_administrations;
      CREATE TRIGGER nursing_terminal_dose_immutable BEFORE UPDATE OR DELETE ON medication_administrations FOR EACH ROW EXECUTE FUNCTION nursing_protect_terminal_dose();
      CREATE OR REPLACE FUNCTION nursing_protect_signed_entry() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF OLD.signed_at IS NOT NULL THEN RAISE EXCEPTION 'Signed clinical entries require an amendment' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
      DROP TRIGGER IF EXISTS nursing_signed_entry_immutable ON nursing_flowsheet_entries;
      CREATE TRIGGER nursing_signed_entry_immutable BEFORE UPDATE OR DELETE ON nursing_flowsheet_entries FOR EACH ROW EXECUTE FUNCTION nursing_protect_signed_entry();
    `);
    // Deliberately fail on historical duplicate slots; resolve them without deleting clinical history.
    await q(`CREATE UNIQUE INDEX IF NOT EXISTS nursing_medication_slot_unique ON medication_administrations(order_id,scheduled_time)`);
    for (const table of ['nursing_device_bindings','nursing_device_observations','nursing_infusion_events','nursing_staff_links','nursing_notifications','nursing_images','nursing_facility_settings','nursing_assignments','nursing_audit_events','nursing_outbox','nursing_replays','nursing_handovers','nursing_interventions','nursing_care_goals','nursing_goal_evaluations','nursing_flowsheet_entries','nursing_tasks','nursing_assessments']) {
      await q(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY; ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS nursing_tenant_policy ON ${table};
        CREATE POLICY nursing_tenant_policy ON ${table} USING (organization_id = NULLIF(current_setting('app.current_org_id',true),'')::bigint) WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id',true),'')::bigint)`);
    }
  });
}
export async function down() { throw new Error('Nursing clinical history requires a forward migration; destructive rollback is disabled'); }
