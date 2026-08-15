/**
 * Consolidates the two parallel pre-authorization systems onto `pre_authorizations`.
 * `hmis_preauth_requests`/`hmis_preauth_documents` had no real caller (see repo audit
 * 2026-08-15) and their only writer had a column-name bug that silently failed every
 * insert — this migration adds the admission/OT linkage columns those tables offered,
 * copies forward any rows that do exist, and retires the old tables (renamed, not
 * dropped, so nothing is destroyed).
 */
export async function up(client) {
  const q = client.query.bind(client);

  await q(`ALTER TABLE pre_authorizations ADD COLUMN IF NOT EXISTS admission_id INTEGER`);
  await q(`ALTER TABLE pre_authorizations ADD COLUMN IF NOT EXISTS ot_booking_id INTEGER`);
  await q(`CREATE INDEX IF NOT EXISTS idx_preauth_admission_id ON pre_authorizations(admission_id)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_preauth_ot_booking_id ON pre_authorizations(ot_booking_id)`);

  await q(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'hmis_preauth_requests') THEN

        INSERT INTO pre_authorizations (
          pre_auth_number, patient_id, hospital_id, organization_id, policy_number,
          admission_id, ot_booking_id, admission_details, estimated_amount, approved_amount,
          diagnosis, status, approval_number, submitted_at, approved_at, rejection_reason,
          created_at, updated_at
        )
        SELECT
          COALESCE(NULLIF(h.pre_auth_number, ''), 'MIG-' || h.id),
          h.patient_id,
          h.organization_id,
          h.organization_id,
          COALESCE(NULLIF(h.policy_number, ''), 'UNKNOWN'),
          h.admission_id,
          h.ot_booking_id,
          jsonb_build_object(
            'migratedFrom', 'hmis_preauth_requests',
            'migratedAt', NOW(),
            'insurerName', h.insurer_name,
            'tpaName', h.tpa_name,
            'memberId', h.member_id,
            'corporateReferralId', h.corporate_referral_id,
            'procedureCodes', h.procedure_codes
          ),
          COALESCE(h.estimated_amount, 0),
          h.approved_amount,
          COALESCE(NULLIF(h.diagnosis_codes, ''), 'Pending clinical review'),
          CASE h.status
            WHEN 'approved' THEN 'approved'
            WHEN 'partial'  THEN 'approved'
            WHEN 'denied'   THEN 'rejected'
            WHEN 'expired'  THEN 'expired'
            ELSE 'pending'
          END,
          h.pre_auth_number,
          h.submitted_at,
          h.approved_at,
          h.denial_reason,
          h.created_at,
          h.updated_at
        FROM hmis_preauth_requests h
        WHERE h.patient_id IS NOT NULL
          AND h.organization_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM users u WHERE u.id = h.patient_id)
          AND NOT EXISTS (
            SELECT 1 FROM pre_authorizations p2
            WHERE p2.admission_id = h.admission_id
          );

        ALTER TABLE hmis_preauth_requests RENAME TO hmis_preauth_requests_deprecated_20260815;
      END IF;

      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'hmis_preauth_documents') THEN
        ALTER TABLE hmis_preauth_documents RENAME TO hmis_preauth_documents_deprecated_20260815;
      END IF;
    END $$;
  `);

  console.log('✅ Pre-authorization consolidation migration applied');
}

export async function down(client) {
  const q = client.query.bind(client);

  await q(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'hmis_preauth_requests_deprecated_20260815') THEN
        ALTER TABLE hmis_preauth_requests_deprecated_20260815 RENAME TO hmis_preauth_requests;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'hmis_preauth_documents_deprecated_20260815') THEN
        ALTER TABLE hmis_preauth_documents_deprecated_20260815 RENAME TO hmis_preauth_documents;
      END IF;
    END $$;
  `);
  // Rows copied into pre_authorizations during `up` are intentionally left in place —
  // reversing that would risk deleting legitimately-created rows created after the migration ran.
  await q(`DROP INDEX IF EXISTS idx_preauth_admission_id`);
  await q(`DROP INDEX IF EXISTS idx_preauth_ot_booking_id`);
  await q(`ALTER TABLE pre_authorizations DROP COLUMN IF EXISTS admission_id`);
  await q(`ALTER TABLE pre_authorizations DROP COLUMN IF EXISTS ot_booking_id`);
}
