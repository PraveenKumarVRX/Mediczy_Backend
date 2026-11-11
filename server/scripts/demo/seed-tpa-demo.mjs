#!/usr/bin/env node
/**
 * Demo data for the TPA portal.
 *
 * These three members and three claims used to be inserted by the TPA service
 * itself, on a READ — listClaims, getClaim, listPreAuths, listMembers,
 * getMemberEligibility, listNetworkHospitals and calculateClaimPayable each
 * called a seeder first, guarded only by "does this TPA have rows yet". The
 * intent was a portal that never looks empty. The effect in production was
 * that any TPA opening its portal for the first time was given three invented
 * members carrying invented policy numbers, coverage amounts, used balances,
 * exclusions and a non-existent insurer ("Mediqzy Health Assurance") — and
 * once the member-facing e-card shipped, those would have rendered to a real
 * person as their own insurance card, complete with a QR code and a
 * verification URL.
 *
 * Found 2026-11-11: all six TPA memberships in production were fabricated —
 * three from this seeder and three left behind by scripts/smoke-tpa-login.mjs.
 *
 * So it lives here instead, as something a human runs deliberately against a
 * database that is meant to hold demo data.
 *
 *   node scripts/ssm-env-loader.mjs scripts/demo/seed-tpa-demo.mjs --tpa=3
 *   ... --claims-only | --members-only
 *
 * It refuses to run against a database whose name looks like production
 * unless --allow-production is passed, because inventing a member there is
 * exactly the failure this file exists to prevent.
 */
import { QueryTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

/** The claim timeline helper the seeder below needs; mirrors the service's own. */
async function addClaimEvent(claimId, event) {
  await sequelize.query(
    `INSERT INTO tpa_claim_events (claim_id, from_status, to_status, title, description, actor_id, payload)
     VALUES (:claimId, :fromStatus, :toStatus, :title, :description, :actorId, :payload::jsonb)`,
    {
      replacements: {
        claimId,
        fromStatus: event.fromStatus || null,
        toStatus: event.toStatus || null,
        title: event.title,
        description: event.description || null,
        actorId: event.actorId || null,
        payload: JSON.stringify(event.payload || {}),
      },
    }
  );
}

export async function seedDemoClaims(tpaId) {
  const rows = await sequelize.query(
    'SELECT COUNT(*)::int AS count FROM tpa_claims WHERE tpa_id = :tpaId',
    { replacements: { tpaId }, type: QueryTypes.SELECT }
  );
  if ((rows[0]?.count || 0) > 0) return;

  // Natural keys are namespaced with tpaId — tpa_claims.claim_number and
  // tpa_preauth_requests.preauth_number are UNIQUE across ALL tenants, so
  // unqualified demo literals here would let one TPA's seed pass steal or
  // pollute another TPA's already-seeded rows via ON CONFLICT.
  const demoClaims = [
    [`CLM-2026-TPA-${tpaId}-001`, `MEM-${tpaId}-001`, 'EMP-001', 'Rajesh Kumar', 'Tech Solutions Pvt Ltd', 'POL-2026-001', 'reimbursement', 'Hospitalization', 'Apollo Hospital', 'Cardiac procedure', 125000, 0, 0, 0, 'submitted', 'pending', 'incomplete', '48 hours'],
    [`CLM-2026-TPA-${tpaId}-002`, `MEM-${tpaId}-002`, 'EMP-002', 'Priya Sharma', 'Digital Marketing Inc', 'POL-2026-002', 'cashless', 'OPD', 'Max Healthcare', 'Orthopedic treatment', 5000, 5000, 0, 5000, 'approved', 'settled', 'complete', '24 hours'],
    [`CLM-2026-TPA-${tpaId}-003`, `MEM-${tpaId}-003`, 'EMP-003', 'Amit Patel', 'Manufacturing Corp', 'POL-2026-003', 'reimbursement', 'Diagnostic Tests', 'Fortis Hospital', 'Diagnostics', 8500, 8200, 300, 8200, 'paid', 'settled', 'complete', '24 hours'],
  ];

  for (const claim of demoClaims) {
    const inserted = await sequelize.query(
      `INSERT INTO tpa_claims
       (claim_number, tpa_id, member_id, employee_id, employee_name, corporate_name, policy_number,
        claim_type, treatment_type, hospital_name, diagnosis, claimed_amount, approved_amount,
        deducted_amount, settled_amount, status, settlement_status, documents_status, sla_due_at, metadata)
       VALUES (:claimNumber, :tpaId, :memberId, :employeeId, :employeeName, :corporateName, :policyNumber,
        :claimType, :treatmentType, :hospitalName, :diagnosis, :claimedAmount, :approvedAmount,
        :deductedAmount, :settledAmount, :status, :settlementStatus, :documentsStatus, NOW() + (:slaWindow)::interval,
        :metadata::jsonb)
       ON CONFLICT (claim_number) DO UPDATE SET updated_at = NOW()
       RETURNING id, status`,
      {
        replacements: {
          claimNumber: claim[0],
          tpaId,
          memberId: claim[1],
          employeeId: claim[2],
          employeeName: claim[3],
          corporateName: claim[4],
          policyNumber: claim[5],
          claimType: claim[6],
          treatmentType: claim[7],
          hospitalName: claim[8],
          diagnosis: claim[9],
          claimedAmount: claim[10],
          approvedAmount: claim[11],
          deductedAmount: claim[12],
          settledAmount: claim[13],
          status: claim[14],
          settlementStatus: claim[15],
          documentsStatus: claim[16],
          slaWindow: claim[17],
          metadata: JSON.stringify({ seeded: true, channel: 'tpa_portal' }),
        },
        type: QueryTypes.SELECT,
      }
    );
    await addClaimEvent(inserted[0].id, {
      eventType: 'claim_seeded',
      toStatus: inserted[0].status,
      title: 'Claim available in TPA lifecycle queue',
      description: 'Seeded claim used as a working lifecycle example.',
      actorId: tpaId,
    });
  }

  await sequelize.query(
    `INSERT INTO tpa_preauth_requests
     (preauth_number, tpa_id, member_id, employee_name, corporate_name, policy_number, hospital_name,
      admission_type, treatment_type, diagnosis, estimated_amount, approved_amount, planned_admission_at,
      status, decision_reason, sla_due_at, metadata)
     VALUES
     (:preauthNumber1, :tpaId, :memberId1, 'Rajesh Kumar', 'Tech Solutions Pvt Ltd', 'POL-2026-001',
      'Apollo Hospital', 'planned', 'Cardiac Surgery', 'Cardiac procedure', 350000, 0, NOW() + interval '5 days',
      'submitted', NULL, NOW() + interval '4 hours', '{"seeded": true}'::jsonb),
     (:preauthNumber2, :tpaId, :memberId2, 'Priya Sharma', 'Digital Marketing Inc', 'POL-2026-002',
      'Max Healthcare', 'emergency', 'Orthopedic Surgery', 'Trauma', 180000, 180000, NOW() + interval '1 day',
      'approved', 'Covered under policy terms', NOW() + interval '2 hours', '{"seeded": true}'::jsonb)
     ON CONFLICT (preauth_number) DO UPDATE SET updated_at = NOW()`,
    {
      replacements: {
        tpaId,
        preauthNumber1: `PA-2026-TPA-${tpaId}-001`,
        preauthNumber2: `PA-2026-TPA-${tpaId}-002`,
        memberId1: `MEM-${tpaId}-001`,
        memberId2: `MEM-${tpaId}-002`,
      },
    }
  );
}

export async function seedDemoMembers(tpaId) {
  // member_id/hospital_code/ecard_verification_code are UNIQUE across ALL
  // tenants, so demo literals must be namespaced with tpaId — otherwise the
  // ON CONFLICT DO UPDATE SET tpa_id = EXCLUDED.tpa_id below reassigns a
  // previously-seeded tenant's rows to whichever tenant calls this next.
  const existing = await sequelize.query(
    'SELECT COUNT(*)::int AS count FROM tpa_members WHERE tpa_id = :tpaId',
    { replacements: { tpaId }, type: QueryTypes.SELECT }
  );
  if ((existing[0]?.count || 0) > 0) return;

  const memberId1 = `MEM-${tpaId}-001`;
  const memberId2 = `MEM-${tpaId}-002`;
  const memberId3 = `MEM-${tpaId}-003`;
  await sequelize.query(
    `INSERT INTO tpa_members
     (member_id, tpa_id, employee_id, employee_name, relation, corporate_name, policy_number,
      policy_start_date, policy_end_date, coverage_amount, used_amount, room_rent_limit, co_pay_percent,
      exclusions, dependents, phone_last4, status, ecard_verification_code, metadata)
     VALUES
     (:memberId1, :tpaId, 'EMP-001', 'Rajesh Kumar', 'self', 'Tech Solutions Pvt Ltd', 'POL-2026-001',
      DATE '2026-01-01', DATE '2026-12-31', 500000, 125000, 5000, 10,
      '["Cosmetic treatment", "Non-prescribed consumables"]'::jsonb,
      (:dependents1)::jsonb,
      '3210', 'active', :ecard1, '{"plan":"Gold Floater","insurer":"Mediqzy Health Assurance"}'::jsonb),
     (:memberId2, :tpaId, 'EMP-002', 'Priya Sharma', 'self', 'Digital Marketing Inc', 'POL-2026-002',
      DATE '2026-01-01', DATE '2026-12-31', 300000, 5000, 3500, 0,
      '["Dental unless accidental", "Experimental therapies"]'::jsonb,
      (:dependents2)::jsonb,
      '3211', 'active', :ecard2, '{"plan":"Silver Family","insurer":"Mediqzy Health Assurance"}'::jsonb),
     (:memberId3, :tpaId, 'EMP-003', 'Amit Patel', 'self', 'Manufacturing Corp', 'POL-2026-003',
      DATE '2026-01-01', DATE '2026-12-31', 700000, 8200, 7000, 15,
      '["Maternity waiting period", "External prosthetics"]'::jsonb,
      '[]'::jsonb,
      '3212', 'active', :ecard3, '{"plan":"Platinum","insurer":"Mediqzy Health Assurance"}'::jsonb)
     ON CONFLICT (member_id) DO UPDATE SET
       tpa_id = EXCLUDED.tpa_id,
       employee_name = EXCLUDED.employee_name,
       coverage_amount = EXCLUDED.coverage_amount,
       used_amount = EXCLUDED.used_amount,
       status = EXCLUDED.status,
       updated_at = NOW()`,
    {
      replacements: {
        tpaId,
        memberId1,
        memberId2,
        memberId3,
        ecard1: `ECARD-${memberId1}-2026`,
        ecard2: `ECARD-${memberId2}-2026`,
        ecard3: `ECARD-${memberId3}-2026`,
        dependents1: JSON.stringify([
          { memberId: `${memberId1}-SPOUSE`, name: 'Anita Kumar', relation: 'spouse', status: 'active' },
          { memberId: `${memberId1}-CHILD`, name: 'Aarav Kumar', relation: 'child', status: 'active' },
        ]),
        dependents2: JSON.stringify([
          { memberId: `${memberId2}-PARENT`, name: 'Meena Sharma', relation: 'parent', status: 'active' },
        ]),
      },
    }
  );

  const hospitalCode1 = `HOSP-APL-CHN-${tpaId}`;
  const hospitalCode2 = `HOSP-MAX-DEL-${tpaId}`;
  const hospitalCode3 = `HOSP-FOR-BLR-${tpaId}`;
  const hospitalCode4 = `HOSP-QA-NET-${tpaId}`;
  await sequelize.query(
    `INSERT INTO tpa_network_hospitals
     (hospital_code, tpa_id, hospital_name, city, state, pincode, address, specialties,
      cashless_enabled, preferred_provider, tariff_metadata, contact_phone, latitude, longitude, status)
     VALUES
     (:hospitalCode1, :tpaId, 'Apollo Hospital', 'Chennai', 'Tamil Nadu', '600006',
      'Greams Road, Chennai', '["Cardiology", "Neurology", "Orthopedics", "Emergency"]'::jsonb,
      TRUE, TRUE, '{"cardiacPackage":350000,"roomCategories":["single","deluxe","icu"],"slaHours":4}'::jsonb,
      '+91-44-28293333', 13.0632, 80.2514, 'active'),
     (:hospitalCode2, :tpaId, 'Max Healthcare', 'Delhi', 'Delhi', '110017',
      'Saket, New Delhi', '["Orthopedics", "Trauma", "Oncology", "OPD"]'::jsonb,
      TRUE, TRUE, '{"orthopedicPackage":180000,"roomCategories":["twin","single","icu"],"slaHours":3}'::jsonb,
      '+91-11-26515050', 28.5276, 77.2127, 'active'),
     (:hospitalCode3, :tpaId, 'Fortis Hospital', 'Bengaluru', 'Karnataka', '560076',
      'Bannerghatta Road, Bengaluru', '["Diagnostics", "Cardiology", "Gastroenterology"]'::jsonb,
      TRUE, FALSE, '{"diagnosticsDiscount":12,"roomCategories":["single","suite"],"slaHours":6}'::jsonb,
      '+91-80-66214444', 12.8956, 77.5996, 'active'),
     (:hospitalCode4, :tpaId, 'QA Network Hospital', 'Hyderabad', 'Telangana', '500081',
      'Madhapur, Hyderabad', '["General Medicine", "Emergency", "Surgery"]'::jsonb,
      TRUE, FALSE, '{"generalPackage":50000,"roomCategories":["general","single"],"slaHours":8}'::jsonb,
      '+91-40-40000000', 17.4483, 78.3915, 'active')
     ON CONFLICT (hospital_code) DO UPDATE SET
       tpa_id = EXCLUDED.tpa_id,
       hospital_name = EXCLUDED.hospital_name,
       cashless_enabled = EXCLUDED.cashless_enabled,
       preferred_provider = EXCLUDED.preferred_provider,
       tariff_metadata = EXCLUDED.tariff_metadata,
       updated_at = NOW()`,
    { replacements: { tpaId, hospitalCode1, hospitalCode2, hospitalCode3, hospitalCode4 } }
  );


  await sequelize.query(
    `INSERT INTO tpa_policy_rules
     (tpa_id, policy_number, rule_code, rule_type, rule_config, priority, active)
     VALUES
     (:tpaId, 'POL-2026-001', 'COPAY_10', 'copay', '{"percent":10,"appliesTo":["hospitalization","reimbursement"]}'::jsonb, 10, TRUE),
     (:tpaId, 'POL-2026-001', 'ROOM_RENT_5000', 'room_rent_limit', '{"limitPerDay":5000,"defaultDays":3}'::jsonb, 20, TRUE),
     (:tpaId, 'POL-2026-001', 'NON_PAYABLE_DEFAULT', 'non_payable', '{"percent":3,"minimum":0}'::jsonb, 30, TRUE),
     (:tpaId, 'POL-2026-002', 'NO_COPAY', 'copay', '{"percent":0}'::jsonb, 10, TRUE),
     (:tpaId, 'POL-2026-003', 'COPAY_15', 'copay', '{"percent":15}'::jsonb, 10, TRUE)
     ON CONFLICT (tpa_id, policy_number, rule_code) DO UPDATE SET
       rule_config = EXCLUDED.rule_config,
       active = EXCLUDED.active,
       updated_at = NOW()`,
    { replacements: { tpaId } }
  );
}

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const main = async () => {
  const tpaId = Number(arg('tpa'));
  if (!Number.isSafeInteger(tpaId) || tpaId < 1) {
    console.error('Usage: seed-tpa-demo.mjs --tpa=<tpa id> [--claims-only|--members-only] [--allow-production]');
    return 1;
  }

  const [{ db }] = await sequelize.query('SELECT current_database() AS db', { type: QueryTypes.SELECT });
  if (/prod/i.test(db) && !process.argv.includes('--allow-production')) {
    console.error(`Refusing to seed demo data into "${db}". Pass --allow-production if that is genuinely what you want.`);
    return 1;
  }

  const members = !process.argv.includes('--claims-only');
  const claims = !process.argv.includes('--members-only');
  console.log(`Seeding TPA ${tpaId} demo data into ${db}: ${[members && 'members', claims && 'claims'].filter(Boolean).join(' + ')}`);

  if (members) { await seedDemoMembers(tpaId); console.log('  members, network hospitals and pre-auths seeded'); }
  if (claims) { await seedDemoClaims(tpaId); console.log('  claims seeded'); }
  return 0;
};

main()
  .then(async (code) => { await sequelize.close().catch(() => {}); process.exit(code); })
  .catch(async (error) => { console.error(error); await sequelize.close().catch(() => {}); process.exit(1); });
