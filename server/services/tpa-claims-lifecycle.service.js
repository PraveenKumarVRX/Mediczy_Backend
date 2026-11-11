import { QueryTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';

import { schemaVerifier } from '../utils/schema-guard.js';
import { linkColumns, resolveCorporate } from './tpa-member-link.service.js';
const PAGE_LIMIT_MAX = 100;

const toNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const clampLimit = (limit) => Math.min(Math.max(parseInt(limit || 20, 10), 1), PAGE_LIMIT_MAX);

const normalizeStatus = (status) => String(status || '').trim().toLowerCase();

const publicClaim = (row) => ({
  id: row.claim_number,
  internalId: row.id,
  claimNumber: row.claim_number,
  employeeName: row.employee_name,
  employeeId: row.employee_id,
  memberId: row.member_id,
  corporate: row.corporate_name,
  policyNumber: row.policy_number,
  claimType: row.claim_type,
  treatmentType: row.treatment_type,
  hospitalName: row.hospital_name,
  diagnosis: row.diagnosis,
  claimAmount: Number(row.claimed_amount || 0),
  claimedAmount: Number(row.claimed_amount || 0),
  approvedAmount: Number(row.approved_amount || 0),
  deductedAmount: Number(row.deducted_amount || 0),
  settledAmount: Number(row.settled_amount || 0),
  status: row.status,
  settlementStatus: row.settlement_status,
  documentsStatus: row.documents_status,
  claimedDate: row.submitted_at,
  submittedAt: row.submitted_at,
  slaDueAt: row.sla_due_at,
  approvedAt: row.approved_at,
  rejectedAt: row.rejected_at,
  settledAt: row.settled_at,
  paidAt: row.paid_at,
  rejectionReason: row.rejection_reason,
  metadata: row.metadata || {},
});

const publicPreAuth = (row) => ({
  id: row.preauth_number,
  internalId: row.id,
  preAuthNumber: row.preauth_number,
  employeeName: row.employee_name,
  memberId: row.member_id,
  corporate: row.corporate_name,
  policyNumber: row.policy_number,
  treatmentType: row.treatment_type,
  hospitalName: row.hospital_name,
  diagnosis: row.diagnosis,
  admissionType: row.admission_type,
  estimatedAmount: Number(row.estimated_amount || 0),
  approvedAmount: Number(row.approved_amount || 0),
  requestedDate: row.created_at,
  plannedAdmissionDate: row.planned_admission_at,
  status: row.status,
  decisionReason: row.decision_reason,
  slaDueAt: row.sla_due_at,
  metadata: row.metadata || {},
});

const publicMember = (row) => {
  const coverageAmount = Number(row.coverage_amount || 0);
  const usedAmount = Number(row.used_amount || 0);
  return {
    id: row.member_id,
    internalId: row.id,
    memberId: row.member_id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    name: row.employee_name,
    relation: row.relation,
    corporate: row.corporate_name,
    policyNumber: row.policy_number,
    policyStartDate: row.policy_start_date,
    policyEndDate: row.policy_end_date,
    coverageAmount,
    usedAmount,
    availableBalance: Math.max(0, coverageAmount - usedAmount),
    roomRentLimit: Number(row.room_rent_limit || 0),
    coPayPercent: Number(row.co_pay_percent || 0),
    exclusions: row.exclusions || [],
    dependents: row.dependents || [],
    status: row.status,
    ecardVerificationCode: row.ecard_verification_code,
    metadata: row.metadata || {},
  };
};

const publicHospital = (row) => ({
  id: row.hospital_code,
  internalId: row.id,
  hospitalCode: row.hospital_code,
  name: row.hospital_name,
  hospitalName: row.hospital_name,
  city: row.city,
  state: row.state,
  pincode: row.pincode,
  address: row.address,
  specialties: row.specialties || [],
  cashlessEnabled: row.cashless_enabled,
  preferredProvider: row.preferred_provider,
  tariffMetadata: row.tariff_metadata || {},
  contactPhone: row.contact_phone,
  latitude: row.latitude ? Number(row.latitude) : null,
  longitude: row.longitude ? Number(row.longitude) : null,
  status: row.status,
});

// The 29 TPA tables are created by migration
// 20261015003500-tpa-claims-lifecycle-governance. This service only checks they
// are there: creating them here would mean a skipped migration still produced a
// working-looking claims module on tables lacking the migration's indexes and
// constraints.
const SCHEMA_TABLES = [
  'tpa_claims',
  'tpa_claim_events',
  'tpa_claim_documents',
  'tpa_claim_shortfalls',
  'tpa_preauth_requests',
  'tpa_fwa_scores',
  'tpa_members',
  'tpa_network_hospitals',
  'tpa_public_claim_access',
  'tpa_claim_files',
  'tpa_policy_rules',
  'tpa_notifications',
  'tpa_approval_requests',
  'tpa_provider_cases',
  'tpa_interop_events',
  'tpa_policy_underwriting_cases',
  'tpa_member_enrollments',
  'tpa_provider_contracts',
  'tpa_provider_soc_versions',
  'tpa_provider_blacklist',
  'tpa_cashless_forms',
  'tpa_cashless_requests',
  'tpa_claim_inward_register',
  'tpa_claim_scan_batches',
  'tpa_claim_bill_entries',
  'tpa_claim_bill_line_items',
  'tpa_claim_adjudications',
  'tpa_claim_charge_entries',
  'tpa_claim_payment_advices',
];

const verifyTpaSchema = schemaVerifier({
  sequelize,
  tables: SCHEMA_TABLES,
  code: 'SCHEMA_NOT_MIGRATED',
  message: 'Apply migration 20261015003500-tpa-claims-lifecycle-governance before using TPA claims',
});

class TPAClaimsLifecycleService {
  constructor() {
    this.schemaReady = false;
  }

  async ensureSchema() {
    if (this.schemaReady) return;
    await verifyTpaSchema();
    this.schemaReady = true;
  }

  async addClaimEvent(claimId, event) {
    await sequelize.query(
      `INSERT INTO tpa_claim_events
       (claim_id, event_type, from_status, to_status, title, description, actor_type, actor_id, payload)
       VALUES (:claimId, :eventType, :fromStatus, :toStatus, :title, :description, :actorType, :actorId, :payload::jsonb)`,
      {
        replacements: {
          claimId,
          eventType: event.eventType,
          fromStatus: event.fromStatus || null,
          toStatus: event.toStatus || null,
          title: event.title,
          description: event.description || null,
          actorType: event.actorType || 'tpa',
          actorId: event.actorId || null,
          payload: JSON.stringify(event.payload || {}),
        },
      }
    );
  }

  async seedDemoData(tpaId) {
    await this.ensureSchema();
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
      await this.addClaimEvent(inserted[0].id, {
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

  async seedReferenceData(tpaId) {
    await this.ensureSchema();
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

  async listMembers({ tpaId, search, corporate, status, page = 1, limit = 20 }) {
    await this.seedReferenceData(tpaId);
    const safeLimit = clampLimit(limit);
    const safePage = Math.max(parseInt(page || 1, 10), 1);
    const offset = (safePage - 1) * safeLimit;
    const filters = ['tpa_id = :tpaId'];
    const replacements = { tpaId, limit: safeLimit, offset };
    if (status && status !== 'all') {
      filters.push('status = :status');
      replacements.status = normalizeStatus(status);
    }
    if (corporate) {
      filters.push('corporate_name ILIKE :corporate');
      replacements.corporate = `%${String(corporate).trim()}%`;
    }
    if (search) {
      filters.push(`(member_id ILIKE :search OR employee_id ILIKE :search OR employee_name ILIKE :search OR policy_number ILIKE :search OR corporate_name ILIKE :search)`);
      replacements.search = `%${String(search).trim()}%`;
    }
    const where = filters.join(' AND ');
    const rows = await sequelize.query(
      `SELECT * FROM tpa_members WHERE ${where} ORDER BY employee_name ASC LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT }
    );
    const countRows = await sequelize.query(
      `SELECT COUNT(*)::int AS count FROM tpa_members WHERE ${where}`,
      { replacements, type: QueryTypes.SELECT }
    );
    const total = countRows[0]?.count || 0;
    return { success: true, members: rows.map(publicMember), total, page: safePage, totalPages: Math.ceil(total / safeLimit) };
  }

  async getMemberEligibility(tpaId, memberId) {
    await this.seedReferenceData(tpaId);
    const rows = await sequelize.query(
      'SELECT * FROM tpa_members WHERE tpa_id = :tpaId AND member_id = :memberId LIMIT 1',
      { replacements: { tpaId, memberId }, type: QueryTypes.SELECT }
    );
    if (!rows.length) return null;
    const member = publicMember(rows[0]);
    const today = new Date();
    const policyEnd = rows[0].policy_end_date ? new Date(rows[0].policy_end_date) : null;
    const activePolicy = member.status === 'active' && (!policyEnd || policyEnd >= today);
    return {
      success: true,
      member,
      eligibility: {
        eligible: activePolicy && member.availableBalance > 0,
        status: activePolicy ? 'active' : 'inactive_or_expired',
        availableBalance: member.availableBalance,
        coverageAmount: member.coverageAmount,
        usedAmount: member.usedAmount,
        roomRentLimit: member.roomRentLimit,
        coPayPercent: member.coPayPercent,
        exclusions: member.exclusions,
        dependents: member.dependents,
        message: activePolicy && member.availableBalance > 0
          ? 'Member is eligible for cashless/reimbursement processing subject to policy rules.'
          : 'Member is not currently eligible based on status, policy period, or balance.',
      },
    };
  }

  async generateECard(tpaId, memberId) {
    const detail = await this.getMemberEligibility(tpaId, memberId);
    if (!detail) return null;
    const member = detail.member;
    let verificationCode = member.ecardVerificationCode;
    let ecardGenerated = false;
    if (!verificationCode) {
      verificationCode = `ECARD-${member.memberId}-${Date.now()}`;
      ecardGenerated = true;
      await sequelize.query(
        `UPDATE tpa_members
         SET ecard_verification_code = :verificationCode,
             metadata = COALESCE(metadata, '{}'::jsonb) || :metadata::jsonb,
             updated_at = NOW()
         WHERE tpa_id = :tpaId AND member_id = :memberId`,
        {
          replacements: {
            tpaId,
            memberId: member.memberId,
            verificationCode,
            metadata: JSON.stringify({ ecardGeneratedAt: new Date().toISOString(), ecardGeneratedBy: 'tpa_portal' }),
          },
        }
      );
    }
    const verifyUrl = `/api/tpa/ecard/verify/${encodeURIComponent(verificationCode)}`;
    return {
      success: true,
      ecardGenerated,
      memberIdGenerated: false,
      ecard: {
        cardNumber: verificationCode,
        memberId: member.memberId,
        employeeId: member.employeeId,
        memberName: member.employeeName,
        corporate: member.corporate,
        policyNumber: member.policyNumber,
        planName: member.metadata?.plan || 'Group Health Plan',
        insurer: member.metadata?.insurer || 'Mediqzy Network',
        validFrom: member.policyStartDate,
        validTill: member.policyEndDate,
        coverageAmount: member.coverageAmount,
        availableBalance: member.availableBalance,
        dependents: member.dependents,
        qrPayload: JSON.stringify({ type: 'mediqzy_tpa_ecard', verificationCode, memberId: member.memberId, policyNumber: member.policyNumber }),
        verifyUrl,
      },
      eligibility: detail.eligibility,
    };
  }

  async verifyECard(verificationCode) {
    await this.ensureSchema();
    const rows = await sequelize.query(
      'SELECT * FROM tpa_members WHERE ecard_verification_code = :verificationCode LIMIT 1',
      { replacements: { verificationCode }, type: QueryTypes.SELECT }
    );
    if (!rows.length) return null;
    const member = publicMember(rows[0]);
    return {
      success: true,
      verified: true,
      member: {
        memberId: member.memberId,
        employeeName: member.employeeName,
        corporate: member.corporate,
        policyNumber: member.policyNumber,
        status: member.status,
        validTill: member.policyEndDate,
        availableBalance: member.availableBalance,
      },
    };
  }

  async listNetworkHospitals({ tpaId, search, city, specialty, cashless, page = 1, limit = 20 }) {
    await this.seedReferenceData(tpaId);
    const safeLimit = clampLimit(limit);
    const safePage = Math.max(parseInt(page || 1, 10), 1);
    const offset = (safePage - 1) * safeLimit;
    const filters = ['tpa_id = :tpaId', "status = 'active'"];
    const replacements = { tpaId, limit: safeLimit, offset };
    if (cashless !== undefined && cashless !== '' && cashless !== 'all') {
      filters.push('cashless_enabled = :cashless');
      replacements.cashless = ['true', '1', 'yes', true].includes(cashless);
    }
    if (city) {
      filters.push('city ILIKE :city');
      replacements.city = `%${String(city).trim()}%`;
    }
    if (specialty) {
      filters.push('specialties::text ILIKE :specialty');
      replacements.specialty = `%${String(specialty).trim()}%`;
    }
    if (search) {
      filters.push('(hospital_name ILIKE :search OR city ILIKE :search OR state ILIKE :search OR address ILIKE :search OR specialties::text ILIKE :search)');
      replacements.search = `%${String(search).trim()}%`;
    }
    const where = filters.join(' AND ');
    const rows = await sequelize.query(
      `SELECT * FROM tpa_network_hospitals WHERE ${where} ORDER BY preferred_provider DESC, hospital_name ASC LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT }
    );
    const countRows = await sequelize.query(
      `SELECT COUNT(*)::int AS count FROM tpa_network_hospitals WHERE ${where}`,
      { replacements, type: QueryTypes.SELECT }
    );
    const hospitals = rows.map(publicHospital).map((hospital) => ({
      ...hospital,
      cashlessIntelligence: {
        cashlessEligible: hospital.cashlessEnabled,
        priority: hospital.preferredProvider ? 'preferred' : 'standard',
        expectedPreAuthSlaHours: Number(hospital.tariffMetadata?.slaHours || 8),
        packageHints: hospital.tariffMetadata || {},
      },
    }));
    const total = countRows[0]?.count || 0;
    return { success: true, hospitals, total, page: safePage, totalPages: Math.ceil(total / safeLimit) };
  }

  async listClaims({ tpaId, status, search, page = 1, limit = 20 }) {
    await this.seedDemoData(tpaId);
    const safeLimit = clampLimit(limit);
    const safePage = Math.max(parseInt(page || 1, 10), 1);
    const offset = (safePage - 1) * safeLimit;
    const filters = ['tpa_id = :tpaId'];
    const replacements = { tpaId, limit: safeLimit, offset };

    if (status && status !== 'all') {
      filters.push('status = :status');
      replacements.status = normalizeStatus(status);
    }
    if (search) {
      filters.push(`(
        claim_number ILIKE :search OR employee_name ILIKE :search OR corporate_name ILIKE :search OR
        policy_number ILIKE :search OR hospital_name ILIKE :search
      )`);
      replacements.search = `%${String(search).trim()}%`;
    }

    const where = filters.join(' AND ');
    const rows = await sequelize.query(
      `SELECT * FROM tpa_claims WHERE ${where} ORDER BY submitted_at DESC LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT }
    );
    const countRows = await sequelize.query(
      `SELECT COUNT(*)::int AS count FROM tpa_claims WHERE ${where}`,
      { replacements, type: QueryTypes.SELECT }
    );
    const total = countRows[0]?.count || 0;
    return {
      success: true,
      claims: rows.map(publicClaim),
      total,
      page: safePage,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async createClaim(tpaId, body, actorId = tpaId) {
    await this.ensureSchema();
    const claimNumber = body.claimNumber || `CLM-${new Date().getFullYear()}-TPA-${Date.now()}`;
    const claimedAmount = toNumber(body.claimAmount ?? body.claimedAmount, 0);
    const rows = await sequelize.query(
      `INSERT INTO tpa_claims
       (claim_number, tpa_id, member_id, employee_id, employee_name, corporate_name, policy_number,
        claim_type, treatment_type, hospital_name, diagnosis, claimed_amount, status, documents_status,
        sla_due_at, metadata)
       VALUES (:claimNumber, :tpaId, :memberId, :employeeId, :employeeName, :corporateName, :policyNumber,
        :claimType, :treatmentType, :hospitalName, :diagnosis, :claimedAmount, 'submitted', 'incomplete',
        NOW() + interval '48 hours', :metadata::jsonb)
       RETURNING *`,
      {
        replacements: {
          claimNumber,
          tpaId,
          memberId: body.memberId || null,
          employeeId: body.employeeId || null,
          employeeName: body.employeeName || body.patientName || 'Unknown Member',
          corporateName: body.corporate || body.corporateName || null,
          policyNumber: body.policyNumber,
          claimType: body.claimType || 'reimbursement',
          treatmentType: body.treatmentType || null,
          hospitalName: body.hospitalName || null,
          diagnosis: body.diagnosis || null,
          claimedAmount,
          metadata: JSON.stringify({
            source: body.source || 'tpa_portal',
            bank: body.bank || null,
            contact: body.contact || null,
          }),
        },
        type: QueryTypes.SELECT,
      }
    );
    await this.addClaimEvent(rows[0].id, {
      eventType: 'claim_submitted',
      toStatus: 'submitted',
      title: 'Claim submitted',
      description: 'Claim was submitted through the Mediqzy TPA portal.',
      actorId,
      payload: { claimNumber },
    });
    return { success: true, claim: publicClaim(rows[0]) };
  }

  async getClaim(tpaId, claimNumber) {
    await this.seedDemoData(tpaId);
    const rows = await sequelize.query(
      'SELECT * FROM tpa_claims WHERE tpa_id = :tpaId AND claim_number = :claimNumber LIMIT 1',
      { replacements: { tpaId, claimNumber }, type: QueryTypes.SELECT }
    );
    if (!rows.length) return null;
    const claim = rows[0];
    const [events, documents, shortfalls, fwaScores, files, approvalRequests, notifications, providerCases, interopEvents] = await Promise.all([
      sequelize.query('SELECT * FROM tpa_claim_events WHERE claim_id = :claimId ORDER BY created_at ASC', {
        replacements: { claimId: claim.id },
        type: QueryTypes.SELECT,
      }),
      sequelize.query('SELECT * FROM tpa_claim_documents WHERE claim_id = :claimId ORDER BY created_at DESC', {
        replacements: { claimId: claim.id },
        type: QueryTypes.SELECT,
      }),
      sequelize.query('SELECT * FROM tpa_claim_shortfalls WHERE claim_id = :claimId ORDER BY created_at DESC', {
        replacements: { claimId: claim.id },
        type: QueryTypes.SELECT,
      }),
      sequelize.query('SELECT * FROM tpa_fwa_scores WHERE claim_id = :claimId ORDER BY created_at DESC', {
        replacements: { claimId: claim.id },
        type: QueryTypes.SELECT,
      }),
      sequelize.query('SELECT * FROM tpa_claim_files WHERE claim_id = :claimId ORDER BY created_at DESC', {
        replacements: { claimId: claim.id },
        type: QueryTypes.SELECT,
      }),
      sequelize.query('SELECT * FROM tpa_approval_requests WHERE claim_id = :claimId ORDER BY requested_at DESC', {
        replacements: { claimId: claim.id },
        type: QueryTypes.SELECT,
      }),
      sequelize.query('SELECT * FROM tpa_notifications WHERE claim_id = :claimId ORDER BY queued_at DESC', {
        replacements: { claimId: claim.id },
        type: QueryTypes.SELECT,
      }),
      sequelize.query('SELECT * FROM tpa_provider_cases WHERE claim_id = :claimId ORDER BY updated_at DESC', {
        replacements: { claimId: claim.id },
        type: QueryTypes.SELECT,
      }),
      sequelize.query('SELECT * FROM tpa_interop_events WHERE claim_id = :claimId ORDER BY created_at DESC', {
        replacements: { claimId: claim.id },
        type: QueryTypes.SELECT,
      }),
    ]);
    return {
      success: true,
      claim: publicClaim(claim),
      timeline: events,
      documents,
      shortfalls,
      fraudRisk: fwaScores[0] || null,
      files,
      approvalRequests,
      notifications,
      providerCases,
      interopEvents,
    };
  }

  async addDocument(tpaId, claimNumber, body, actorId = tpaId) {
    const detail = await this.getClaim(tpaId, claimNumber);
    if (!detail) return null;
    const score = Math.min(100, Math.max(0, parseInt(body.completenessScore ?? 82, 10)));
    const missingFields = body.missingFields || (score < 80 ? ['signature', 'gstin'] : []);
    const rows = await sequelize.query(
      `INSERT INTO tpa_claim_documents
       (claim_id, document_type, file_name, file_url, upload_status, ocr_status, completeness_score,
        extracted_fields, missing_fields, risk_signal, uploaded_by_id)
       VALUES (:claimId, :documentType, :fileName, :fileUrl, 'received', :ocrStatus, :score,
        :extractedFields::jsonb, :missingFields::jsonb, :riskSignal, :actorId)
       RETURNING *`,
      {
        replacements: {
          claimId: detail.claim.internalId,
          documentType: body.documentType || 'claim_document',
          fileName: body.fileName || 'uploaded-document.pdf',
          fileUrl: body.fileUrl || null,
          ocrStatus: body.ocrStatus || 'completed',
          score,
          extractedFields: JSON.stringify(body.extractedFields || {}),
          missingFields: JSON.stringify(missingFields),
          riskSignal: body.riskSignal || (score < 80 ? 'medium' : 'low'),
          actorId,
        },
        type: QueryTypes.SELECT,
      }
    );
    await sequelize.query(
      `UPDATE tpa_claims SET documents_status = :documentsStatus, updated_at = NOW() WHERE id = :claimId`,
      {
        replacements: {
          claimId: detail.claim.internalId,
          documentsStatus: score >= 80 ? 'pending_verification' : 'incomplete',
        },
      }
    );
    await this.addClaimEvent(detail.claim.internalId, {
      eventType: 'document_uploaded',
      title: 'Document uploaded and classified',
      description: `${body.documentType || 'Document'} uploaded with ${score}% completeness score.`,
      actorId,
      payload: rows[0],
    });
    return { success: true, document: rows[0] };
  }

  async raiseShortfall(tpaId, claimNumber, body, actorId = tpaId) {
    const detail = await this.getClaim(tpaId, claimNumber);
    if (!detail) return null;
    const previousStatus = detail.claim.status;
    const shortfallNumber = `SF-${Date.now()}`;
    const rows = await sequelize.query(
      `INSERT INTO tpa_claim_shortfalls
       (claim_id, shortfall_number, reason, required_documents, due_at, raised_by)
       VALUES (:claimId, :shortfallNumber, :reason, :requiredDocuments::jsonb, NOW() + interval '72 hours', :actorId)
       RETURNING *`,
      {
        replacements: {
          claimId: detail.claim.internalId,
          shortfallNumber,
          reason: body.reason || 'Additional documents required for claim processing.',
          requiredDocuments: JSON.stringify(body.requiredDocuments || []),
          actorId,
        },
        type: QueryTypes.SELECT,
      }
    );
    await sequelize.query(
      `UPDATE tpa_claims SET status = 'query_raised', updated_at = NOW() WHERE id = :claimId`,
      { replacements: { claimId: detail.claim.internalId } }
    );
    await this.addClaimEvent(detail.claim.internalId, {
      eventType: 'shortfall_raised',
      fromStatus: previousStatus,
      toStatus: 'query_raised',
      title: 'Shortfall/query raised',
      description: rows[0].reason,
      actorId,
      payload: rows[0],
    });
    return { success: true, shortfall: rows[0] };
  }

  async decideClaim(tpaId, claimNumber, body, actorId = tpaId) {
    const detail = await this.getClaim(tpaId, claimNumber);
    if (!detail) return null;
    const decision = normalizeStatus(body.decision || body.status || 'approved');
    const allowed = ['approved', 'rejected', 'settled', 'paid'];
    if (!allowed.includes(decision)) {
      const error = new Error('Decision must be approved, rejected, settled, or paid');
      error.statusCode = 400;
      throw error;
    }
    const claimedAmount = toNumber(detail.claim.claimedAmount, 0);
    const approvedAmount = decision === 'rejected' ? 0 : toNumber(body.approvedAmount, claimedAmount);
    const deductedAmount = Math.max(0, claimedAmount - approvedAmount);
    const settledAmount = ['settled', 'paid'].includes(decision) ? toNumber(body.settledAmount, approvedAmount) : 0;
    const timestampColumn = decision === 'approved' ? 'approved_at' : decision === 'rejected' ? 'rejected_at' : decision === 'settled' ? 'settled_at' : 'paid_at';
    const settlementStatus = decision === 'paid' || decision === 'settled' ? 'settled' : 'pending';
    const rows = await sequelize.query(
      `UPDATE tpa_claims
       SET status = :decision,
           approved_amount = :approvedAmount,
           deducted_amount = :deductedAmount,
           settled_amount = :settledAmount,
           settlement_status = :settlementStatus,
           rejection_reason = :rejectionReason,
           ${timestampColumn} = NOW(),
           updated_at = NOW()
       WHERE id = :claimId
       RETURNING *`,
      {
        replacements: {
          claimId: detail.claim.internalId,
          decision,
          approvedAmount,
          deductedAmount,
          settledAmount,
          settlementStatus,
          rejectionReason: decision === 'rejected' ? (body.reason || body.rejectionReason || 'Rejected after TPA review') : null,
        },
        type: QueryTypes.SELECT,
      }
    );
    await this.addClaimEvent(detail.claim.internalId, {
      eventType: `claim_${decision}`,
      fromStatus: detail.claim.status,
      toStatus: decision,
      title: `Claim ${decision}`,
      description: body.reason || body.notes || `Claim marked as ${decision}.`,
      actorId,
      payload: { approvedAmount, deductedAmount, settledAmount },
    });
    return { success: true, claim: publicClaim(rows[0]) };
  }

  async listPreAuths({ tpaId, status, page = 1, limit = 20 }) {
    await this.seedDemoData(tpaId);
    const safeLimit = clampLimit(limit);
    const safePage = Math.max(parseInt(page || 1, 10), 1);
    const offset = (safePage - 1) * safeLimit;
    const filters = ['tpa_id = :tpaId'];
    const replacements = { tpaId, limit: safeLimit, offset };
    if (status && status !== 'all') {
      filters.push('status = :status');
      replacements.status = normalizeStatus(status);
    }
    const where = filters.join(' AND ');
    const rows = await sequelize.query(
      `SELECT * FROM tpa_preauth_requests WHERE ${where} ORDER BY created_at DESC LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT }
    );
    const countRows = await sequelize.query(
      `SELECT COUNT(*)::int AS count FROM tpa_preauth_requests WHERE ${where}`,
      { replacements, type: QueryTypes.SELECT }
    );
    const total = countRows[0]?.count || 0;
    return {
      success: true,
      preAuths: rows.map(publicPreAuth),
      total,
      page: safePage,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async attachClaimFile(tpaId, claimNumber, body, actorId = tpaId) {
    const detail = await this.getClaim(tpaId, claimNumber);
    if (!detail) return null;
    const rows = await sequelize.query(
      `INSERT INTO tpa_claim_files
       (claim_id, document_id, storage_provider, storage_key, original_file_name, mime_type, file_size,
        checksum_sha256, consent_scope, retention_until, uploaded_by_type, uploaded_by_id)
       VALUES (:claimId, :documentId, :storageProvider, :storageKey, :originalFileName, :mimeType, :fileSize,
        :checksumSha256, :consentScope, CURRENT_DATE + (:retentionDays)::int, :uploadedByType, :actorId)
       RETURNING *`,
      {
        replacements: {
          claimId: detail.claim.internalId,
          documentId: body.documentId || null,
          storageProvider: body.storageProvider || 'local',
          storageKey: body.storageKey,
          originalFileName: body.originalFileName || body.fileName || 'claim-file.bin',
          mimeType: body.mimeType || 'application/octet-stream',
          fileSize: toNumber(body.fileSize, 0),
          checksumSha256: body.checksumSha256 || null,
          consentScope: body.consentScope || 'claim_processing',
          retentionDays: parseInt(body.retentionDays || 2555, 10),
          uploadedByType: body.uploadedByType || 'tpa',
          actorId,
        },
        type: QueryTypes.SELECT,
      }
    );
    await this.addClaimEvent(detail.claim.internalId, {
      eventType: 'file_vaulted',
      title: 'Claim file stored in secure vault',
      description: `${rows[0].original_file_name} stored with checksum and retention metadata.`,
      actorId,
      payload: rows[0],
    });
    return { success: true, file: rows[0] };
  }

  async runDocumentIntelligence(tpaId, claimNumber, body = {}, actorId = tpaId) {
    const detail = await this.getClaim(tpaId, claimNumber);
    if (!detail) return null;
    const required = body.requiredDocuments || ['claim_form', 'hospital_bill', 'discharge_summary', 'prescription', 'bank_proof'];
    const present = new Set((detail.documents || []).map((doc) => String(doc.document_type || '').toLowerCase()));
    const missing = required.filter((item) => !present.has(String(item).toLowerCase()));
    const averageCompleteness = detail.documents?.length
      ? Math.round(detail.documents.reduce((sum, doc) => sum + toNumber(doc.completeness_score, 0), 0) / detail.documents.length)
      : 0;
    const status = missing.length === 0 && averageCompleteness >= 80 ? 'complete' : 'incomplete';
    await sequelize.query(
      `UPDATE tpa_claims SET documents_status = :status, updated_at = NOW() WHERE id = :claimId`,
      { replacements: { claimId: detail.claim.internalId, status } }
    );
    const intelligence = {
      requiredDocuments: required,
      presentDocuments: Array.from(present),
      missingDocuments: missing,
      averageCompleteness,
      shortfallRecommended: missing.length > 0,
      clinicalSummary: body.clinicalSummary || `${detail.claim.treatmentType || 'Treatment'} at ${detail.claim.hospitalName || 'mapped hospital'} for ${detail.claim.diagnosis || 'documented diagnosis'}.`,
    };
    await this.addClaimEvent(detail.claim.internalId, {
      eventType: 'document_intelligence_completed',
      title: 'Document intelligence completed',
      description: missing.length ? `${missing.length} required document(s) missing.` : 'Document checklist complete.',
      actorId,
      payload: intelligence,
    });
    return { success: true, intelligence };
  }

  async calculateClaimPayable(tpaId, claimNumber, body = {}, actorId = tpaId) {
    await this.seedReferenceData(tpaId);
    const detail = await this.getClaim(tpaId, claimNumber);
    if (!detail) return null;
    const claimedAmount = toNumber(detail.claim.claimedAmount || detail.claim.claimAmount, 0);
    const memberEligibility = detail.claim.memberId ? await this.getMemberEligibility(tpaId, detail.claim.memberId) : null;
    const rules = await sequelize.query(
      `SELECT * FROM tpa_policy_rules
       WHERE tpa_id = :tpaId AND policy_number = :policyNumber AND active = TRUE
       ORDER BY priority ASC`,
      { replacements: { tpaId, policyNumber: detail.claim.policyNumber }, type: QueryTypes.SELECT }
    );
    const ruleMap = Object.fromEntries(rules.map((rule) => [rule.rule_type, rule.rule_config || {}]));
    const nonPayablePercent = toNumber(ruleMap.non_payable?.percent, 0);
    const manualNonPayable = toNumber(body.nonPayableAmount, Math.round((claimedAmount * nonPayablePercent) / 100));
    const coPayPercent = toNumber(ruleMap.copay?.percent, memberEligibility?.eligibility?.coPayPercent || 0);
    const afterNonPayable = Math.max(0, claimedAmount - manualNonPayable);
    const coPayAmount = Math.round((afterNonPayable * coPayPercent) / 100);
    const roomRentLimit = toNumber(ruleMap.room_rent_limit?.limitPerDay, memberEligibility?.eligibility?.roomRentLimit || 0);
    const roomDays = toNumber(body.roomDays, ruleMap.room_rent_limit?.defaultDays || 0);
    const roomRentClaimed = toNumber(body.roomRentClaimed, 0);
    const roomRentAllowed = roomRentLimit && roomDays ? roomRentLimit * roomDays : roomRentClaimed;
    const roomRentDeduction = roomRentClaimed ? Math.max(0, roomRentClaimed - roomRentAllowed) : 0;
    const coverageRemaining = toNumber(memberEligibility?.eligibility?.availableBalance, claimedAmount);
    const payableAmount = Math.max(0, Math.min(coverageRemaining, afterNonPayable - coPayAmount - roomRentDeduction));
    const deductionAmount = Math.max(0, claimedAmount - payableAmount);
    const estimate = {
      claimedAmount,
      payableAmount,
      deductionAmount,
      nonPayableAmount: manualNonPayable,
      coPayPercent,
      coPayAmount,
      roomRentLimit,
      roomDays,
      roomRentDeduction,
      coverageRemaining,
      rulesApplied: rules.map((rule) => ({ code: rule.rule_code, type: rule.rule_type, config: rule.rule_config })),
      recommendation: payableAmount > 200000 ? 'maker_checker_required' : 'processor_can_approve',
    };
    await this.addClaimEvent(detail.claim.internalId, {
      eventType: 'policy_payable_estimated',
      title: 'Policy rule payable estimate generated',
      description: `Estimated payable ${payableAmount} against claimed ${claimedAmount}.`,
      actorId,
      payload: estimate,
    });
    return { success: true, estimate };
  }

  async createApprovalRequest(tpaId, claimNumber, body = {}, actorId = tpaId) {
    const detail = await this.getClaim(tpaId, claimNumber);
    if (!detail) return null;
    const approvalNumber = body.approvalNumber || `APR-${Date.now()}`;
    const rows = await sequelize.query(
      `INSERT INTO tpa_approval_requests
       (approval_number, claim_id, tpa_id, action_type, requested_payload, risk_level, status, requested_by)
       VALUES (:approvalNumber, :claimId, :tpaId, :actionType, :requestedPayload::jsonb, :riskLevel, 'pending', :actorId)
       RETURNING *`,
      {
        replacements: {
          approvalNumber,
          claimId: detail.claim.internalId,
          tpaId,
          actionType: body.actionType || 'claim_approval',
          requestedPayload: JSON.stringify(body.requestedPayload || { approvedAmount: detail.claim.claimedAmount }),
          riskLevel: body.riskLevel || (toNumber(detail.claim.claimedAmount, 0) > 200000 ? 'high_value' : 'standard'),
          actorId,
        },
        type: QueryTypes.SELECT,
      }
    );
    await this.addClaimEvent(detail.claim.internalId, {
      eventType: 'maker_checker_requested',
      title: 'Maker-checker approval requested',
      description: `${rows[0].action_type} queued for checker review.`,
      actorId,
      payload: rows[0],
    });
    return { success: true, approvalRequest: rows[0] };
  }

  async decideApprovalRequest(tpaId, approvalNumber, body = {}, actorId = tpaId) {
    await this.ensureSchema();
    const status = normalizeStatus(body.status || body.decision || 'approved');
    if (!['approved', 'rejected'].includes(status)) {
      const error = new Error('Approval decision must be approved or rejected');
      error.statusCode = 400;
      throw error;
    }
    const rows = await sequelize.query(
      `UPDATE tpa_approval_requests ar
       SET status = :status, checked_by = :actorId, checked_at = NOW(), checker_notes = :checkerNotes
       FROM tpa_claims c
       WHERE ar.claim_id = c.id AND ar.tpa_id = :tpaId AND ar.approval_number = :approvalNumber
       RETURNING ar.*, c.claim_number, c.id AS claim_id`,
      {
        replacements: { tpaId, approvalNumber, status, actorId, checkerNotes: body.notes || null },
        type: QueryTypes.SELECT,
      }
    );
    if (!rows.length) return null;
    await this.addClaimEvent(rows[0].claim_id, {
      eventType: `maker_checker_${status}`,
      title: `Maker-checker ${status}`,
      description: body.notes || `Approval request ${approvalNumber} ${status}.`,
      actorId,
      payload: rows[0],
    });
    return { success: true, approvalRequest: rows[0] };
  }

  async queueClaimNotification(tpaId, claimNumber, body = {}, actorId = tpaId) {
    const detail = await this.getClaim(tpaId, claimNumber);
    if (!detail) return null;
    const channel = normalizeStatus(body.channel || 'email');
    const templateCode = body.templateCode || `claim_${detail.claim.status}_update`;
    const rows = await sequelize.query(
      `INSERT INTO tpa_notifications
       (claim_id, tpa_id, channel, recipient, template_code, payload, status, provider_message_id, delivery_receipt, sent_at, delivered_at)
       VALUES (:claimId, :tpaId, :channel, :recipient, :templateCode, :payload::jsonb, :status,
        :providerMessageId, :deliveryReceipt::jsonb, NOW(), CASE WHEN :status = 'delivered' THEN NOW() ELSE NULL END)
       RETURNING *`,
      {
        replacements: {
          claimId: detail.claim.internalId,
          tpaId,
          channel,
          recipient: body.recipient || detail.claim.employeeId || detail.claim.memberId || 'member-not-mapped',
          templateCode,
          payload: JSON.stringify(body.payload || { claimNumber, status: detail.claim.status, amount: detail.claim.claimedAmount }),
          status: body.simulateDelivery === false ? 'queued' : 'delivered',
          providerMessageId: body.providerMessageId || `SIM-${Date.now()}`,
          deliveryReceipt: JSON.stringify({ provider: body.provider || 'internal-simulator', simulated: true, channel }),
        },
        type: QueryTypes.SELECT,
      }
    );
    await this.addClaimEvent(detail.claim.internalId, {
      eventType: 'notification_queued',
      title: 'Claim notification queued',
      description: `${channel.toUpperCase()} template ${templateCode} queued for ${rows[0].recipient}.`,
      actorId,
      payload: rows[0],
    });
    return { success: true, notification: rows[0] };
  }

  async createProviderCase(tpaId, body = {}, actorId = tpaId) {
    await this.ensureSchema();
    let claimId = null;
    if (body.claimNumber) {
      const detail = await this.getClaim(tpaId, body.claimNumber);
      claimId = detail?.claim?.internalId || null;
    }
    const caseNumber = body.caseNumber || `PC-${Date.now()}`;
    const rows = await sequelize.query(
      `INSERT INTO tpa_provider_cases
       (case_number, tpa_id, claim_id, hospital_code, hospital_name, member_id, case_type, status,
        admission_type, expected_discharge_at, final_bill_amount, query_payload)
       VALUES (:caseNumber, :tpaId, :claimId, :hospitalCode, :hospitalName, :memberId, :caseType, :status,
        :admissionType, :expectedDischargeAt, :finalBillAmount, :queryPayload::jsonb)
       RETURNING *`,
      {
        replacements: {
          caseNumber,
          tpaId,
          claimId,
          hospitalCode: body.hospitalCode || null,
          hospitalName: body.hospitalName || 'Hospital not mapped',
          memberId: body.memberId || null,
          caseType: body.caseType || 'preauth',
          status: body.status || 'submitted',
          admissionType: body.admissionType || 'planned',
          expectedDischargeAt: body.expectedDischargeAt || null,
          finalBillAmount: toNumber(body.finalBillAmount, 0),
          queryPayload: JSON.stringify(body.queryPayload || {}),
        },
        type: QueryTypes.SELECT,
      }
    );
    if (claimId) {
      await this.addClaimEvent(claimId, {
        eventType: 'provider_case_created',
        title: 'Provider handoff created',
        description: `${rows[0].hospital_name} opened ${rows[0].case_type} case ${rows[0].case_number}.`,
        actorId,
        payload: rows[0],
      });
    }
    return { success: true, providerCase: rows[0] };
  }

  async updateProviderCaseStatus(tpaId, caseNumber, body = {}, actorId = tpaId) {
    await this.ensureSchema();
    const rows = await sequelize.query(
      `UPDATE tpa_provider_cases
       SET status = :status, final_bill_amount = COALESCE(:finalBillAmount, final_bill_amount),
           query_payload = query_payload || :queryPayload::jsonb, last_handoff_at = NOW(), updated_at = NOW()
       WHERE tpa_id = :tpaId AND case_number = :caseNumber
       RETURNING *`,
      {
        replacements: {
          tpaId,
          caseNumber,
          status: body.status || 'in_review',
          finalBillAmount: body.finalBillAmount === undefined ? null : toNumber(body.finalBillAmount, 0),
          queryPayload: JSON.stringify(body.queryPayload || {}),
        },
        type: QueryTypes.SELECT,
      }
    );
    if (!rows.length) return null;
    if (rows[0].claim_id) {
      await this.addClaimEvent(rows[0].claim_id, {
        eventType: 'provider_case_updated',
        title: 'Provider case updated',
        description: `${rows[0].case_number} moved to ${rows[0].status}.`,
        actorId,
        payload: rows[0],
      });
    }
    return { success: true, providerCase: rows[0] };
  }

  async listProviderCases({ tpaId, status, page = 1, limit = 20 }) {
    await this.ensureSchema();
    const safeLimit = clampLimit(limit);
    const safePage = Math.max(parseInt(page || 1, 10), 1);
    const offset = (safePage - 1) * safeLimit;
    const filters = ['tpa_id = :tpaId'];
    const replacements = { tpaId, limit: safeLimit, offset };
    if (status && status !== 'all') {
      filters.push('status = :status');
      replacements.status = normalizeStatus(status);
    }
    const where = filters.join(' AND ');
    const rows = await sequelize.query(
      `SELECT * FROM tpa_provider_cases WHERE ${where} ORDER BY updated_at DESC LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT }
    );
    const countRows = await sequelize.query(
      `SELECT COUNT(*)::int AS count FROM tpa_provider_cases WHERE ${where}`,
      { replacements, type: QueryTypes.SELECT }
    );
    return { success: true, providerCases: rows, total: countRows[0]?.count || 0, page: safePage, totalPages: Math.ceil((countRows[0]?.count || 0) / safeLimit) };
  }

  async enqueueInteropEvent(tpaId, body = {}, actorId = tpaId) {
    await this.ensureSchema();
    let claimId = null;
    if (body.claimNumber) {
      const detail = await this.getClaim(tpaId, body.claimNumber);
      claimId = detail?.claim?.internalId || null;
    }
    const eventNumber = body.eventNumber || `IOP-${Date.now()}`;
    const targetSystem = body.targetSystem || 'nhcx_gateway';
    const idempotencyKey = body.idempotencyKey || `${targetSystem}:${body.claimNumber || 'global'}:${body.eventType || 'claim_update'}`;
    const rows = await sequelize.query(
      `INSERT INTO tpa_interop_events
       (event_number, tpa_id, claim_id, event_type, target_system, idempotency_key, payload, status, next_retry_at)
       VALUES (:eventNumber, :tpaId, :claimId, :eventType, :targetSystem, :idempotencyKey, :payload::jsonb, 'queued', NOW() + interval '5 minutes')
       ON CONFLICT (target_system, idempotency_key) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      {
        replacements: {
          eventNumber,
          tpaId,
          claimId,
          eventType: body.eventType || 'claim_update',
          targetSystem,
          idempotencyKey,
          payload: JSON.stringify(body.payload || { claimNumber: body.claimNumber, source: 'mediqzy_tpa' }),
        },
        type: QueryTypes.SELECT,
      }
    );
    if (claimId) {
      await this.addClaimEvent(claimId, {
        eventType: 'interop_event_queued',
        title: 'Interoperability event queued',
        description: `${rows[0].event_type} queued for ${rows[0].target_system}.`,
        actorId,
        payload: rows[0],
      });
    }
    return { success: true, interopEvent: rows[0] };
  }

  async listInteropEvents({ tpaId, status, page = 1, limit = 20 }) {
    await this.ensureSchema();
    const safeLimit = clampLimit(limit);
    const safePage = Math.max(parseInt(page || 1, 10), 1);
    const offset = (safePage - 1) * safeLimit;
    const filters = ['tpa_id = :tpaId'];
    const replacements = { tpaId, limit: safeLimit, offset };
    if (status && status !== 'all') {
      filters.push('status = :status');
      replacements.status = normalizeStatus(status);
    }
    const where = filters.join(' AND ');
    const rows = await sequelize.query(
      `SELECT * FROM tpa_interop_events WHERE ${where} ORDER BY created_at DESC LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT }
    );
    const countRows = await sequelize.query(
      `SELECT COUNT(*)::int AS count FROM tpa_interop_events WHERE ${where}`,
      { replacements, type: QueryTypes.SELECT }
    );
    return { success: true, interopEvents: rows, total: countRows[0]?.count || 0, page: safePage, totalPages: Math.ceil((countRows[0]?.count || 0) / safeLimit) };
  }

  async getEnterpriseControls(tpaId, claimNumber) {
    const detail = await this.getClaim(tpaId, claimNumber);
    if (!detail) return null;
    return {
      success: true,
      claim: detail.claim,
      fileVault: detail.files || [],
      approvals: detail.approvalRequests || [],
      notifications: detail.notifications || [],
      providerCases: detail.providerCases || [],
      interopEvents: detail.interopEvents || [],
      documentIntelligenceReady: true,
      makerCheckerRequired: toNumber(detail.claim.claimedAmount, 0) > 200000 || (detail.fraudRisk?.risk_level === 'high'),
    };
  }

  async createUnderwritingCase(tpaId, body = {}, actorId = tpaId) {
    await this.ensureSchema();
    const caseNumber = body.caseNumber || `UW-${Date.now()}`;
    const livesCount = toNumber(body.livesCount, 0);
    const sumInsured = toNumber(body.sumInsured, 0);
    const expectedPremium = toNumber(body.expectedPremium, Math.round(livesCount * sumInsured * 0.018));
    const riskScore = Math.min(100, Math.max(0, toNumber(body.riskScore, livesCount > 1000 ? 72 : sumInsured > 700000 ? 58 : 35)));
    const rows = await sequelize.query(
      `INSERT INTO tpa_policy_underwriting_cases
       (case_number, tpa_id, corporate_name, policy_type, lives_count, sum_insured, expected_premium,
        risk_score, status, underwriting_notes, proposal_payload)
       VALUES (:caseNumber, :tpaId, :corporateName, :policyType, :livesCount, :sumInsured, :expectedPremium,
        :riskScore, :status, :underwritingNotes, :proposalPayload::jsonb)
       RETURNING *`,
      {
        replacements: {
          caseNumber,
          tpaId,
          corporateName: body.corporateName || body.corporate || 'Corporate not mapped',
          policyType: body.policyType || 'group_health',
          livesCount,
          sumInsured,
          expectedPremium,
          riskScore,
          status: body.status || 'submitted',
          underwritingNotes: body.underwritingNotes || null,
          proposalPayload: JSON.stringify(body.proposalPayload || { source: 'tpa_portal', actorId }),
        },
        type: QueryTypes.SELECT,
      }
    );
    return { success: true, underwritingCase: rows[0] };
  }

  async listUnderwritingCases({ tpaId, status, page = 1, limit = 20 }) {
    await this.ensureSchema();
    const safeLimit = clampLimit(limit);
    const safePage = Math.max(parseInt(page || 1, 10), 1);
    const offset = (safePage - 1) * safeLimit;
    const filters = ['tpa_id = :tpaId'];
    const replacements = { tpaId, limit: safeLimit, offset };
    if (status && status !== 'all') {
      filters.push('status = :status');
      replacements.status = normalizeStatus(status);
    }
    const where = filters.join(' AND ');
    const rows = await sequelize.query(`SELECT * FROM tpa_policy_underwriting_cases WHERE ${where} ORDER BY updated_at DESC LIMIT :limit OFFSET :offset`, { replacements, type: QueryTypes.SELECT });
    const countRows = await sequelize.query(`SELECT COUNT(*)::int AS count FROM tpa_policy_underwriting_cases WHERE ${where}`, { replacements, type: QueryTypes.SELECT });
    return { success: true, underwritingCases: rows, total: countRows[0]?.count || 0, page: safePage, totalPages: Math.ceil((countRows[0]?.count || 0) / safeLimit) };
  }

  async decideUnderwritingCase(tpaId, caseNumber, body = {}, actorId = tpaId) {
    await this.ensureSchema();
    const status = normalizeStatus(body.status || body.decision || 'approved');
    if (!['approved', 'rejected', 'query_raised', 'policy_issued'].includes(status)) {
      const error = new Error('Underwriting decision must be approved, rejected, query_raised, or policy_issued');
      error.statusCode = 400;
      throw error;
    }
    const rows = await sequelize.query(
      `UPDATE tpa_policy_underwriting_cases
       SET status = :status, underwriting_notes = :notes, decided_by = :actorId, decided_at = NOW(), updated_at = NOW()
       WHERE tpa_id = :tpaId AND case_number = :caseNumber
       RETURNING *`,
      { replacements: { tpaId, caseNumber, status, notes: body.notes || body.reason || null, actorId }, type: QueryTypes.SELECT }
    );
    return rows.length ? { success: true, underwritingCase: rows[0] } : null;
  }

  async createMemberEnrollment(tpaId, body = {}, actorId = tpaId) {
    await this.ensureSchema();
    const enrollmentNumber = body.enrollmentNumber || `ENR-${Date.now()}`;
    const memberIdGenerated = !body.memberId;
    const memberId = body.memberId || `MEM-${String(tpaId || 'TPA').padStart(3, '0')}-${Date.now()}`;

    // Approving an enrolment is what creates the member row, so this is where
    // a human is already deciding who this person is — the account link
    // belongs here rather than being reconstructed from a name afterwards.
    // Both columns arrive with 20261111000200; before it is applied the
    // enrolment is written exactly as it was.
    const columns = await linkColumns();
    const corporateName = body.corporateName || body.corporate || 'Corporate not mapped';
    let corporateId = Number.isSafeInteger(Number(body.corporateId)) && Number(body.corporateId) > 0
      ? Number(body.corporateId)
      : null;
    if (!corporateId && columns.enrolmentCorporate) {
      const resolved = await resolveCorporate(corporateName);
      // A name that matches two employers is left unresolved rather than
      // guessed; the desk picks one on the linking screen.
      if (resolved && !resolved.candidates) corporateId = resolved.corporateId;
    }
    const userId = Number.isSafeInteger(Number(body.userId)) && Number(body.userId) > 0 ? Number(body.userId) : null;

    const extraCols = [];
    const extraVals = [];
    if (columns.enrolmentUser) { extraCols.push('user_id'); extraVals.push(':userId'); }
    if (columns.enrolmentCorporate) { extraCols.push('corporate_id'); extraVals.push(':corporateId'); }

    const rows = await sequelize.query(
      `INSERT INTO tpa_member_enrollments
       (enrollment_number, tpa_id, corporate_name, policy_number, member_id, employee_id, employee_name,
        relation, endorsement_type, dependents, coverage_amount, status${extraCols.length ? ', ' + extraCols.join(', ') : ''})
       VALUES (:enrollmentNumber, :tpaId, :corporateName, :policyNumber, :memberId, :employeeId, :employeeName,
        :relation, :endorsementType, :dependents::jsonb, :coverageAmount, :status${extraVals.length ? ', ' + extraVals.join(', ') : ''})
       RETURNING *`,
      {
        replacements: {
          enrollmentNumber,
          tpaId,
          ...(columns.enrolmentUser ? { userId } : {}),
          ...(columns.enrolmentCorporate ? { corporateId } : {}),
          corporateName,
          policyNumber: body.policyNumber,
          memberId,
          employeeId: body.employeeId || null,
          employeeName: body.employeeName || body.memberName || 'Member not mapped',
          relation: body.relation || 'self',
          endorsementType: body.endorsementType || 'new_enrollment',
          dependents: JSON.stringify(body.dependents || []),
          coverageAmount: toNumber(body.coverageAmount, 0),
          status: body.status || 'submitted',
        },
        type: QueryTypes.SELECT,
      }
    );
    return { success: true, enrollment: rows[0], memberId, memberIdGenerated };
  }

  async listMemberEnrollments({ tpaId, status, page = 1, limit = 20 }) {
    await this.ensureSchema();
    const safeLimit = clampLimit(limit);
    const safePage = Math.max(parseInt(page || 1, 10), 1);
    const offset = (safePage - 1) * safeLimit;
    const filters = ['tpa_id = :tpaId'];
    const replacements = { tpaId, limit: safeLimit, offset };
    if (status && status !== 'all') {
      filters.push('status = :status');
      replacements.status = normalizeStatus(status);
    }
    const where = filters.join(' AND ');
    const rows = await sequelize.query(`SELECT * FROM tpa_member_enrollments WHERE ${where} ORDER BY updated_at DESC LIMIT :limit OFFSET :offset`, { replacements, type: QueryTypes.SELECT });
    const countRows = await sequelize.query(`SELECT COUNT(*)::int AS count FROM tpa_member_enrollments WHERE ${where}`, { replacements, type: QueryTypes.SELECT });
    return { success: true, enrollments: rows, total: countRows[0]?.count || 0, page: safePage, totalPages: Math.ceil((countRows[0]?.count || 0) / safeLimit) };
  }

  async decideMemberEnrollment(tpaId, enrollmentNumber, body = {}, actorId = tpaId) {
    await this.ensureSchema();
    const status = normalizeStatus(body.status || body.decision || 'approved');
    if (!['approved', 'rejected', 'query_raised'].includes(status)) {
      const error = new Error('Enrollment decision must be approved, rejected, or query_raised');
      error.statusCode = 400;
      throw error;
    }
    const rows = await sequelize.query(
      `UPDATE tpa_member_enrollments
       SET status = :status, decision_reason = :reason, decided_by = :actorId, decided_at = NOW(), updated_at = NOW()
       WHERE tpa_id = :tpaId AND enrollment_number = :enrollmentNumber
       RETURNING *`,
      { replacements: { tpaId, enrollmentNumber, status, reason: body.reason || null, actorId }, type: QueryTypes.SELECT }
    );
    if (!rows.length) return null;
    let ecardVerificationCode = null;
    if (status === 'approved') {
      const enrollment = rows[0];
      // member_id is UNIQUE across ALL tenants in tpa_members but is
      // client-controllable at enrollment-creation time and unconstrained on
      // tpa_member_enrollments — without this check, approving an enrollment
      // whose member_id collides with another TPA's existing member would
      // silently overwrite that member's status/coverage/dependents below.
      const owner = await sequelize.query(
        'SELECT tpa_id FROM tpa_members WHERE member_id = :memberId LIMIT 1',
        { replacements: { memberId: enrollment.member_id }, type: QueryTypes.SELECT }
      );
      if (owner.length && Number(owner[0].tpa_id) !== Number(tpaId)) {
        const error = new Error(`Member ID ${enrollment.member_id} is already in use by another TPA. Use a different member ID.`);
        error.statusCode = 409;
        throw error;
      }
      ecardVerificationCode = `ECARD-${enrollment.member_id}-${Date.now()}`;

      // The approved enrolment's account and corporate carry onto the member
      // row, so a membership created this way is born linked and the
      // member-facing e-card resolves without a second manual step. On a
      // re-approval an existing link is kept rather than overwritten:
      // changing who a membership belongs to is an explicit unlink.
      const columns = await linkColumns();
      const linkCols = [];
      const linkVals = [];
      const linkUpdates = [];
      if (columns.memberUser && columns.enrolmentUser) {
        linkCols.push('user_id'); linkVals.push(':linkUserId');
        linkUpdates.push('user_id = COALESCE(tpa_members.user_id, EXCLUDED.user_id)');
      }
      if (columns.memberCorporate && columns.enrolmentCorporate) {
        linkCols.push('corporate_id'); linkVals.push(':linkCorporateId');
        linkUpdates.push('corporate_id = COALESCE(tpa_members.corporate_id, EXCLUDED.corporate_id)');
      }
      if (columns.memberUser && columns.enrolmentUser && enrollment.user_id) {
        linkCols.push('link_method', 'linked_by_user_id', 'linked_at');
        linkVals.push("'enrolment'", ':actorId', 'NOW()');
        linkUpdates.push("link_method = COALESCE(tpa_members.link_method, 'enrolment')");
      }

      await sequelize.query(
        `INSERT INTO tpa_members
         (member_id, tpa_id, employee_id, employee_name, relation, corporate_name, policy_number,
          policy_start_date, policy_end_date, coverage_amount, used_amount, dependents, status, ecard_verification_code, metadata${linkCols.length ? ', ' + linkCols.join(', ') : ''})
         VALUES (:memberId, :tpaId, :employeeId, :employeeName, :relation, :corporateName, :policyNumber,
          CURRENT_DATE, CURRENT_DATE + interval '1 year', :coverageAmount, 0, :dependents::jsonb, 'active', :ecardCode, :metadata::jsonb${linkVals.length ? ', ' + linkVals.join(', ') : ''})
         ON CONFLICT (member_id) DO UPDATE SET
          ${linkUpdates.length ? linkUpdates.join(',\n          ') + ',' : ''}
          status = 'active',
          coverage_amount = EXCLUDED.coverage_amount,
          dependents = EXCLUDED.dependents,
          ecard_verification_code = COALESCE(tpa_members.ecard_verification_code, EXCLUDED.ecard_verification_code),
          metadata = COALESCE(tpa_members.metadata, '{}'::jsonb) || EXCLUDED.metadata,
          updated_at = NOW()`,
        {
          replacements: {
            memberId: enrollment.member_id,
            tpaId,
            employeeId: enrollment.employee_id,
            employeeName: enrollment.employee_name,
            relation: enrollment.relation,
            corporateName: enrollment.corporate_name,
            policyNumber: enrollment.policy_number,
            coverageAmount: enrollment.coverage_amount,
            dependents: JSON.stringify(enrollment.dependents || []),
            ecardCode: ecardVerificationCode,
            ...(columns.memberUser && columns.enrolmentUser ? { linkUserId: enrollment.user_id ?? null, actorId: actorId ?? null } : {}),
            ...(columns.memberCorporate && columns.enrolmentCorporate ? { linkCorporateId: enrollment.corporate_id ?? null } : {}),
            metadata: JSON.stringify({ enrollmentNumber, source: 'member_enrollment_decision', ecardGeneratedAt: new Date().toISOString() }),
          },
        }
      );
    }
    return {
      success: true,
      enrollment: rows[0],
      memberActivated: status === 'approved',
      memberId: rows[0].member_id,
      memberIdGenerated: Boolean(rows[0].member_id),
      ecardGenerated: status === 'approved',
      ecardVerificationCode,
    };
  }

  async upsertProviderContract(tpaId, body = {}, actorId = tpaId) {
    await this.ensureSchema();
    const providerCode = body.providerCode || `PROV-${tpaId}-${Date.now()}`;
    // provider_code is UNIQUE across ALL tenants and client-controllable via
    // body.providerCode — without this check, the ON CONFLICT below (which
    // reassigns tpa_id = EXCLUDED.tpa_id) would let one TPA hijack another
    // TPA's existing provider contract just by supplying its provider_code.
    const owner = await sequelize.query(
      'SELECT tpa_id FROM tpa_provider_contracts WHERE provider_code = :providerCode LIMIT 1',
      { replacements: { providerCode }, type: QueryTypes.SELECT }
    );
    if (owner.length && Number(owner[0].tpa_id) !== Number(tpaId)) {
      const error = new Error(`Provider code ${providerCode} is already in use by another TPA. Use a different provider code.`);
      error.statusCode = 409;
      throw error;
    }
    const rows = await sequelize.query(
      `INSERT INTO tpa_provider_contracts
       (provider_code, tpa_id, provider_name, city, state, cashless_enabled, contract_status, mou_number,
        mou_file_url, mou_valid_from, mou_valid_to, settlement_terms, contact_payload, empanelment_notes)
       VALUES (:providerCode, :tpaId, :providerName, :city, :state, :cashlessEnabled, :contractStatus, :mouNumber,
        :mouFileUrl, :mouValidFrom, :mouValidTo, :settlementTerms::jsonb, :contactPayload::jsonb, :empanelmentNotes)
       ON CONFLICT (provider_code) DO UPDATE SET
        tpa_id = EXCLUDED.tpa_id, provider_name = EXCLUDED.provider_name, city = EXCLUDED.city, state = EXCLUDED.state,
        cashless_enabled = EXCLUDED.cashless_enabled, contract_status = EXCLUDED.contract_status, mou_number = EXCLUDED.mou_number,
        mou_file_url = EXCLUDED.mou_file_url, mou_valid_from = EXCLUDED.mou_valid_from, mou_valid_to = EXCLUDED.mou_valid_to,
        settlement_terms = EXCLUDED.settlement_terms, contact_payload = EXCLUDED.contact_payload,
        empanelment_notes = EXCLUDED.empanelment_notes, updated_at = NOW()
       RETURNING *`,
      {
        replacements: {
          providerCode,
          tpaId,
          providerName: body.providerName || body.hospitalName || 'Provider not mapped',
          city: body.city || null,
          state: body.state || null,
          cashlessEnabled: body.cashlessEnabled !== false,
          contractStatus: body.contractStatus || 'active',
          mouNumber: body.mouNumber || `MOU-${providerCode}`,
          mouFileUrl: body.mouFileUrl || null,
          mouValidFrom: body.mouValidFrom || new Date().toISOString().slice(0, 10),
          mouValidTo: body.mouValidTo || `${new Date().getFullYear() + 1}-12-31`,
          settlementTerms: JSON.stringify(body.settlementTerms || { tatDays: 7, paymentMode: 'neft' }),
          contactPayload: JSON.stringify(body.contactPayload || {}),
          empanelmentNotes: body.empanelmentNotes || null,
        },
        type: QueryTypes.SELECT,
      }
    );
    await sequelize.query(
      `INSERT INTO tpa_network_hospitals
       (hospital_code, tpa_id, hospital_name, city, state, cashless_enabled, preferred_provider, tariff_metadata, status)
       VALUES (:providerCode, :tpaId, :providerName, :city, :state, :cashlessEnabled, FALSE, :tariffMetadata::jsonb, :status)
       ON CONFLICT (hospital_code) DO UPDATE SET cashless_enabled = EXCLUDED.cashless_enabled, status = EXCLUDED.status, updated_at = NOW()`,
      {
        replacements: {
          providerCode,
          tpaId,
          providerName: rows[0].provider_name,
          city: rows[0].city,
          state: rows[0].state,
          cashlessEnabled: rows[0].cashless_enabled,
          tariffMetadata: JSON.stringify({ source: 'provider_contract', providerCode }),
          status: rows[0].contract_status === 'blacklisted' ? 'suspended' : 'active',
        },
      }
    );
    return { success: true, providerContract: rows[0] };
  }

  async listProviderContracts({ tpaId, status, page = 1, limit = 20 }) {
    await this.ensureSchema();
    const safeLimit = clampLimit(limit);
    const safePage = Math.max(parseInt(page || 1, 10), 1);
    const offset = (safePage - 1) * safeLimit;
    const filters = ['tpa_id = :tpaId'];
    const replacements = { tpaId, limit: safeLimit, offset };
    if (status && status !== 'all') {
      filters.push('contract_status = :status');
      replacements.status = normalizeStatus(status);
    }
    const where = filters.join(' AND ');
    const rows = await sequelize.query(`SELECT * FROM tpa_provider_contracts WHERE ${where} ORDER BY updated_at DESC LIMIT :limit OFFSET :offset`, { replacements, type: QueryTypes.SELECT });
    const countRows = await sequelize.query(`SELECT COUNT(*)::int AS count FROM tpa_provider_contracts WHERE ${where}`, { replacements, type: QueryTypes.SELECT });
    return { success: true, providerContracts: rows, total: countRows[0]?.count || 0, page: safePage, totalPages: Math.ceil((countRows[0]?.count || 0) / safeLimit) };
  }

  async addProviderSOC(tpaId, providerCode, body = {}, actorId = tpaId) {
    await this.ensureSchema();
    const socNumber = body.socNumber || `SOC-${providerCode}-${Date.now()}`;
    const rows = await sequelize.query(
      `INSERT INTO tpa_provider_soc_versions
       (soc_number, provider_code, tpa_id, version_label, effective_from, effective_to, charge_schedule, status, approved_by, approved_at)
       VALUES (:socNumber, :providerCode, :tpaId, :versionLabel, :effectiveFrom, :effectiveTo, :chargeSchedule::jsonb, :status, :actorId, NOW())
       RETURNING *`,
      {
        replacements: {
          socNumber,
          providerCode,
          tpaId,
          versionLabel: body.versionLabel || 'v1',
          effectiveFrom: body.effectiveFrom || new Date().toISOString().slice(0, 10),
          effectiveTo: body.effectiveTo || `${new Date().getFullYear() + 1}-12-31`,
          chargeSchedule: JSON.stringify(body.chargeSchedule || [
            { code: 'ROOM_SINGLE', description: 'Single room rent per day', amount: 5000 },
            { code: 'CONSULT', description: 'Consultation', amount: 800 },
          ]),
          status: body.status || 'active',
          actorId,
        },
        type: QueryTypes.SELECT,
      }
    );
    await sequelize.query(
      `UPDATE tpa_network_hospitals SET tariff_metadata = tariff_metadata || :tariffMetadata::jsonb, updated_at = NOW()
       WHERE tpa_id = :tpaId AND hospital_code = :providerCode`,
      { replacements: { tpaId, providerCode, tariffMetadata: JSON.stringify({ activeSocNumber: socNumber, socValidTo: rows[0].effective_to }) } }
    );
    return { success: true, soc: rows[0] };
  }

  async blacklistProvider(tpaId, providerCode, body = {}, actorId = tpaId) {
    await this.ensureSchema();
    const rows = await sequelize.query(
      `INSERT INTO tpa_provider_blacklist
       (provider_code, tpa_id, reason, severity, status, effective_from, effective_to, evidence, created_by)
       VALUES (:providerCode, :tpaId, :reason, :severity, 'active', CURRENT_DATE, :effectiveTo, :evidence::jsonb, :actorId)
       RETURNING *`,
      {
        replacements: {
          providerCode,
          tpaId,
          reason: body.reason || 'Provider suspended pending audit review.',
          severity: body.severity || 'high',
          effectiveTo: body.effectiveTo || null,
          evidence: JSON.stringify(body.evidence || []),
          actorId,
        },
        type: QueryTypes.SELECT,
      }
    );
    await sequelize.query(`UPDATE tpa_provider_contracts SET contract_status = 'blacklisted', cashless_enabled = FALSE, updated_at = NOW() WHERE tpa_id = :tpaId AND provider_code = :providerCode`, { replacements: { tpaId, providerCode } });
    await sequelize.query(`UPDATE tpa_network_hospitals SET status = 'suspended', cashless_enabled = FALSE, updated_at = NOW() WHERE tpa_id = :tpaId AND hospital_code = :providerCode`, { replacements: { tpaId, providerCode } });
    return { success: true, blacklist: rows[0] };
  }

  async createCashlessForm(tpaId, body = {}) {
    await this.ensureSchema();
    const formCode = body.formCode || `CASHLESS-FORM-${Date.now()}`;
    const rows = await sequelize.query(
      `INSERT INTO tpa_cashless_forms
       (form_code, tpa_id, form_name, policy_number, procedure_category, required_documents, form_schema, status, valid_from, valid_to)
       VALUES (:formCode, :tpaId, :formName, :policyNumber, :procedureCategory, :requiredDocuments::jsonb, :formSchema::jsonb, :status, :validFrom, :validTo)
       RETURNING *`,
      {
        replacements: {
          formCode,
          tpaId,
          formName: body.formName || 'Standard Cashless Pre-Authorisation Form',
          policyNumber: body.policyNumber || null,
          procedureCategory: body.procedureCategory || 'hospitalization',
          requiredDocuments: JSON.stringify(body.requiredDocuments || ['doctor_advice', 'estimate', 'member_ecard', 'id_proof']),
          formSchema: JSON.stringify(body.formSchema || { fields: ['memberId', 'policyNumber', 'diagnosis', 'procedureName', 'estimatedAmount'] }),
          status: body.status || 'active',
          validFrom: body.validFrom || new Date().toISOString().slice(0, 10),
          validTo: body.validTo || null,
        },
        type: QueryTypes.SELECT,
      }
    );
    return { success: true, cashlessForm: rows[0] };
  }

  async listCashlessForms({ tpaId, status, page = 1, limit = 20 }) {
    await this.ensureSchema();
    const safeLimit = clampLimit(limit);
    const safePage = Math.max(parseInt(page || 1, 10), 1);
    const offset = (safePage - 1) * safeLimit;
    const filters = ['tpa_id = :tpaId'];
    const replacements = { tpaId, limit: safeLimit, offset };
    if (status && status !== 'all') {
      filters.push('status = :status');
      replacements.status = normalizeStatus(status);
    }
    const where = filters.join(' AND ');
    const rows = await sequelize.query(`SELECT * FROM tpa_cashless_forms WHERE ${where} ORDER BY updated_at DESC LIMIT :limit OFFSET :offset`, { replacements, type: QueryTypes.SELECT });
    const countRows = await sequelize.query(`SELECT COUNT(*)::int AS count FROM tpa_cashless_forms WHERE ${where}`, { replacements, type: QueryTypes.SELECT });
    return { success: true, cashlessForms: rows, total: countRows[0]?.count || 0, page: safePage, totalPages: Math.ceil((countRows[0]?.count || 0) / safeLimit) };
  }

  async createCashlessRequest(tpaId, body = {}, actorId = tpaId) {
    await this.ensureSchema();
    const requestNumber = body.requestNumber || `CLR-${Date.now()}`;
    const rows = await sequelize.query(
      `INSERT INTO tpa_cashless_requests
       (request_number, tpa_id, provider_code, provider_name, member_id, policy_number, patient_name,
        admission_type, procedure_name, diagnosis, estimated_amount, status, request_payload, valid_until)
       VALUES (:requestNumber, :tpaId, :providerCode, :providerName, :memberId, :policyNumber, :patientName,
        :admissionType, :procedureName, :diagnosis, :estimatedAmount, :status, :requestPayload::jsonb, NOW() + interval '48 hours')
       RETURNING *`,
      {
        replacements: {
          requestNumber,
          tpaId,
          providerCode: body.providerCode || null,
          providerName: body.providerName || body.hospitalName || 'Provider not mapped',
          memberId: body.memberId || null,
          policyNumber: body.policyNumber,
          patientName: body.patientName || body.employeeName || 'Patient not mapped',
          admissionType: body.admissionType || 'planned',
          procedureName: body.procedureName || body.treatmentType || null,
          diagnosis: body.diagnosis || null,
          estimatedAmount: toNumber(body.estimatedAmount, 0),
          status: body.status || 'submitted',
          requestPayload: JSON.stringify(body.requestPayload || { actorId, channel: 'provider_portal' }),
        },
        type: QueryTypes.SELECT,
      }
    );
    return { success: true, cashlessRequest: rows[0] };
  }

  async listCashlessRequests({ tpaId, status, page = 1, limit = 20 }) {
    await this.ensureSchema();
    const safeLimit = clampLimit(limit);
    const safePage = Math.max(parseInt(page || 1, 10), 1);
    const offset = (safePage - 1) * safeLimit;
    const filters = ['tpa_id = :tpaId'];
    const replacements = { tpaId, limit: safeLimit, offset };
    if (status && status !== 'all') {
      filters.push('status = :status');
      replacements.status = normalizeStatus(status);
    }
    const where = filters.join(' AND ');
    const rows = await sequelize.query(`SELECT * FROM tpa_cashless_requests WHERE ${where} ORDER BY updated_at DESC LIMIT :limit OFFSET :offset`, { replacements, type: QueryTypes.SELECT });
    const countRows = await sequelize.query(`SELECT COUNT(*)::int AS count FROM tpa_cashless_requests WHERE ${where}`, { replacements, type: QueryTypes.SELECT });
    return { success: true, cashlessRequests: rows, total: countRows[0]?.count || 0, page: safePage, totalPages: Math.ceil((countRows[0]?.count || 0) / safeLimit) };
  }

  async decideCashlessRequest(tpaId, requestNumber, body = {}, actorId = tpaId) {
    await this.ensureSchema();
    const status = normalizeStatus(body.status || body.decision || 'approved');
    if (!['approved', 'denied', 'query_raised', 'enhancement_requested'].includes(status)) {
      const error = new Error('Cashless decision must be approved, denied, query_raised, or enhancement_requested');
      error.statusCode = 400;
      throw error;
    }
    const approvedAmount = status === 'approved' ? toNumber(body.approvedAmount, body.estimatedAmount || 0) : 0;
    const rows = await sequelize.query(
      `UPDATE tpa_cashless_requests
       SET status = :status, approved_amount = :approvedAmount, query_reason = :queryReason, denial_reason = :denialReason,
           approval_letter_url = :approvalLetterUrl, decided_by = :actorId, decided_at = NOW(), updated_at = NOW()
       WHERE tpa_id = :tpaId AND request_number = :requestNumber
       RETURNING *`,
      {
        replacements: {
          tpaId,
          requestNumber,
          status,
          approvedAmount,
          queryReason: status === 'query_raised' ? (body.reason || body.queryReason || 'Additional information required') : null,
          denialReason: status === 'denied' ? (body.reason || body.denialReason || 'Denied as per policy terms') : null,
          approvalLetterUrl: status === 'approved' ? (body.approvalLetterUrl || `/api/tpa/cashless/requests/${requestNumber}/approval-letter`) : null,
          actorId,
        },
        type: QueryTypes.SELECT,
      }
    );
    return rows.length ? { success: true, cashlessRequest: rows[0] } : null;
  }

  async registerClaimInward(tpaId, claimNumber, body = {}, actorId = tpaId) {
    const detail = await this.getClaim(tpaId, claimNumber);
    if (!detail) return null;
    const inwardNumber = body.inwardNumber || `INW-${Date.now()}`;
    const rows = await sequelize.query(
      `INSERT INTO tpa_claim_inward_register
       (inward_number, claim_id, tpa_id, source, received_mode, packet_reference, documents_count, received_by, status)
       VALUES (:inwardNumber, :claimId, :tpaId, :source, :receivedMode, :packetReference, :documentsCount, :actorId, :status)
       RETURNING *`,
      {
        replacements: {
          inwardNumber,
          claimId: detail.claim.internalId,
          tpaId,
          source: body.source || 'provider_portal',
          receivedMode: body.receivedMode || 'digital',
          packetReference: body.packetReference || null,
          documentsCount: toNumber(body.documentsCount, 0),
          actorId,
          status: body.status || 'received',
        },
        type: QueryTypes.SELECT,
      }
    );
    await this.addClaimEvent(detail.claim.internalId, { eventType: 'claim_inwarded', title: 'Claim inward registered', description: `${inwardNumber} received via ${rows[0].received_mode}.`, actorId, payload: rows[0] });
    return { success: true, inward: rows[0] };
  }

  async scanClaim(tpaId, claimNumber, body = {}, actorId = tpaId) {
    const detail = await this.getClaim(tpaId, claimNumber);
    if (!detail) return null;
    const scanNumber = body.scanNumber || `SCAN-${Date.now()}`;
    const rows = await sequelize.query(
      `INSERT INTO tpa_claim_scan_batches
       (scan_number, claim_id, tpa_id, inward_id, pages_count, ocr_status, quality_score, storage_payload, scanned_by)
       VALUES (:scanNumber, :claimId, :tpaId, :inwardId, :pagesCount, :ocrStatus, :qualityScore, :storagePayload::jsonb, :actorId)
       RETURNING *`,
      {
        replacements: {
          scanNumber,
          claimId: detail.claim.internalId,
          tpaId,
          inwardId: body.inwardId || null,
          pagesCount: toNumber(body.pagesCount, 0),
          ocrStatus: body.ocrStatus || 'completed',
          qualityScore: Math.min(100, Math.max(0, toNumber(body.qualityScore, 85))),
          storagePayload: JSON.stringify(body.storagePayload || {}),
          actorId,
        },
        type: QueryTypes.SELECT,
      }
    );
    await this.addClaimEvent(detail.claim.internalId, { eventType: 'claim_scanned', title: 'Claim packet scanned', description: `${rows[0].pages_count} page(s), OCR ${rows[0].ocr_status}.`, actorId, payload: rows[0] });
    return { success: true, scan: rows[0] };
  }

  async createBillEntry(tpaId, claimNumber, body = {}, actorId = tpaId) {
    const detail = await this.getClaim(tpaId, claimNumber);
    if (!detail) return null;
    const billEntryNumber = body.billEntryNumber || `BILL-${Date.now()}`;
    const lineItems = Array.isArray(body.lineItems) && body.lineItems.length ? body.lineItems : [
      { lineCode: 'ROOM_SINGLE', description: 'Room rent', quantity: 2, unitAmount: 5000, nonPayableAmount: 0 },
      { lineCode: 'PHARMACY', description: 'Medicines and consumables', quantity: 1, unitAmount: toNumber(detail.claim.claimedAmount, 0) - 10000, nonPayableAmount: 500 },
    ];
    const grossAmount = toNumber(body.grossAmount, lineItems.reduce((sum, item) => sum + toNumber(item.grossAmount, toNumber(item.quantity, 1) * toNumber(item.unitAmount, 0)), 0));
    const nonPayableAmount = toNumber(body.nonPayableAmount, lineItems.reduce((sum, item) => sum + toNumber(item.nonPayableAmount, 0), 0));
    const netAmount = Math.max(0, grossAmount - nonPayableAmount);
    const billRows = await sequelize.query(
      `INSERT INTO tpa_claim_bill_entries
       (bill_entry_number, claim_id, tpa_id, bill_number, bill_date, gross_amount, non_payable_amount, net_amount, status, entered_by)
       VALUES (:billEntryNumber, :claimId, :tpaId, :billNumber, :billDate, :grossAmount, :nonPayableAmount, :netAmount, 'entered', :actorId)
       RETURNING *`,
      {
        replacements: {
          billEntryNumber,
          claimId: detail.claim.internalId,
          tpaId,
          billNumber: body.billNumber || billEntryNumber,
          billDate: body.billDate || new Date().toISOString().slice(0, 10),
          grossAmount,
          nonPayableAmount,
          netAmount,
          actorId,
        },
        type: QueryTypes.SELECT,
      }
    );
    const billEntry = billRows[0];
    for (const item of lineItems) {
      const quantity = toNumber(item.quantity, 1);
      const unitAmount = toNumber(item.unitAmount, 0);
      const lineGross = toNumber(item.grossAmount, quantity * unitAmount);
      const lineNonPayable = toNumber(item.nonPayableAmount, 0);
      await sequelize.query(
        `INSERT INTO tpa_claim_bill_line_items
         (bill_entry_id, line_code, description, quantity, unit_amount, gross_amount, non_payable_amount, payable_amount, soc_match_status)
         VALUES (:billEntryId, :lineCode, :description, :quantity, :unitAmount, :grossAmount, :nonPayableAmount, :payableAmount, :socMatchStatus)`,
        {
          replacements: {
            billEntryId: billEntry.id,
            lineCode: item.lineCode || null,
            description: item.description || 'Bill line item',
            quantity,
            unitAmount,
            grossAmount: lineGross,
            nonPayableAmount: lineNonPayable,
            payableAmount: Math.max(0, lineGross - lineNonPayable),
            socMatchStatus: item.socMatchStatus || 'matched',
          },
        }
      );
    }
    await this.addClaimEvent(detail.claim.internalId, { eventType: 'bill_entry_completed', title: 'Bill entry completed', description: `Bill ${billEntry.bill_number} entered for ${grossAmount}.`, actorId, payload: billEntry });
    return { success: true, billEntry };
  }

  async adjudicateClaim(tpaId, claimNumber, body = {}, actorId = tpaId) {
    const detail = await this.getClaim(tpaId, claimNumber);
    if (!detail) return null;
    const estimate = await this.calculateClaimPayable(tpaId, claimNumber, body, actorId);
    const adjudicationNumber = body.adjudicationNumber || `ADJ-${Date.now()}`;
    const rows = await sequelize.query(
      `INSERT INTO tpa_claim_adjudications
       (adjudication_number, claim_id, tpa_id, bill_entry_id, adjudication_status, claimed_amount, approved_amount,
        deducted_amount, rules_applied, adjudication_notes, adjudicated_by)
       VALUES (:adjudicationNumber, :claimId, :tpaId, :billEntryId, :adjudicationStatus, :claimedAmount, :approvedAmount,
        :deductedAmount, :rulesApplied::jsonb, :adjudicationNotes, :actorId)
       RETURNING *`,
      {
        replacements: {
          adjudicationNumber,
          claimId: detail.claim.internalId,
          tpaId,
          billEntryId: body.billEntryId || null,
          adjudicationStatus: body.adjudicationStatus || 'recommended',
          claimedAmount: estimate.estimate.claimedAmount,
          approvedAmount: estimate.estimate.payableAmount,
          deductedAmount: estimate.estimate.deductionAmount,
          rulesApplied: JSON.stringify(estimate.estimate.rulesApplied || []),
          adjudicationNotes: body.notes || 'Adjudicated using configured TPA policy rules.',
          actorId,
        },
        type: QueryTypes.SELECT,
      }
    );
    await this.addClaimEvent(detail.claim.internalId, { eventType: 'claim_adjudicated', title: 'Claim adjudicated', description: `Approved ${rows[0].approved_amount}; deducted ${rows[0].deducted_amount}.`, actorId, payload: rows[0] });
    return { success: true, adjudication: rows[0], estimate: estimate.estimate };
  }

  async createChargeEntry(tpaId, claimNumber, body = {}, actorId = tpaId) {
    const detail = await this.getClaim(tpaId, claimNumber);
    if (!detail) return null;
    const chargeEntryNumber = body.chargeEntryNumber || `CHG-${Date.now()}`;
    const rows = await sequelize.query(
      `INSERT INTO tpa_claim_charge_entries
       (charge_entry_number, claim_id, tpa_id, charge_code, charge_category, approved_amount, provider_code, soc_number, posted_by)
       VALUES (:chargeEntryNumber, :claimId, :tpaId, :chargeCode, :chargeCategory, :approvedAmount, :providerCode, :socNumber, :actorId)
       RETURNING *`,
      {
        replacements: {
          chargeEntryNumber,
          claimId: detail.claim.internalId,
          tpaId,
          chargeCode: body.chargeCode || 'APPROVED_CLAIM_PAYABLE',
          chargeCategory: body.chargeCategory || 'claim_payable',
          approvedAmount: toNumber(body.approvedAmount, detail.claim.approvedAmount || detail.claim.claimedAmount || 0),
          providerCode: body.providerCode || null,
          socNumber: body.socNumber || null,
          actorId,
        },
        type: QueryTypes.SELECT,
      }
    );
    await this.addClaimEvent(detail.claim.internalId, { eventType: 'charge_entry_posted', title: 'Charge entry posted', description: `${rows[0].charge_code} posted for ${rows[0].approved_amount}.`, actorId, payload: rows[0] });
    return { success: true, chargeEntry: rows[0] };
  }

  async createPaymentAdvice(tpaId, claimNumber, body = {}, actorId = tpaId) {
    const detail = await this.getClaim(tpaId, claimNumber);
    if (!detail) return null;
    const paymentAdviceNumber = body.paymentAdviceNumber || `PAY-${Date.now()}`;
    const payableAmount = toNumber(body.payableAmount, detail.claim.approvedAmount || detail.claim.settledAmount || detail.claim.claimedAmount || 0);
    const status = body.status || (body.utrNumber ? 'paid' : 'advice_generated');
    const rows = await sequelize.query(
      `INSERT INTO tpa_claim_payment_advices
       (payment_advice_number, claim_id, tpa_id, beneficiary_name, beneficiary_type, payable_amount, payment_mode,
        utr_number, bank_payload, status, paid_at, created_by)
       VALUES (:paymentAdviceNumber, :claimId, :tpaId, :beneficiaryName, :beneficiaryType, :payableAmount, :paymentMode,
        :utrNumber, :bankPayload::jsonb, :status, CASE WHEN :status = 'paid' THEN NOW() ELSE NULL END, :actorId)
       RETURNING *`,
      {
        replacements: {
          paymentAdviceNumber,
          claimId: detail.claim.internalId,
          tpaId,
          beneficiaryName: body.beneficiaryName || detail.claim.hospitalName || detail.claim.employeeName,
          beneficiaryType: body.beneficiaryType || (detail.claim.claimType === 'cashless' ? 'provider' : 'member'),
          payableAmount,
          paymentMode: body.paymentMode || 'neft',
          utrNumber: body.utrNumber || null,
          bankPayload: JSON.stringify(body.bankPayload || {}),
          status,
          actorId,
        },
        type: QueryTypes.SELECT,
      }
    );
    if (status === 'paid') {
      await this.decideClaim(tpaId, claimNumber, { decision: 'paid', approvedAmount: payableAmount, settledAmount: payableAmount, notes: `Paid via ${paymentAdviceNumber}` }, actorId);
    } else {
      await this.addClaimEvent(detail.claim.internalId, { eventType: 'payment_advice_generated', title: 'Payment advice generated', description: `${paymentAdviceNumber} generated for ${payableAmount}.`, actorId, payload: rows[0] });
    }
    return { success: true, paymentAdvice: rows[0] };
  }

  async submitProviderClaim(tpaId, body = {}, actorId = tpaId) {
    const created = await this.createClaim(tpaId, {
      claimNumber: body.claimNumber,
      memberId: body.memberId,
      employeeId: body.employeeId,
      employeeName: body.employeeName || body.patientName,
      corporateName: body.corporateName,
      policyNumber: body.policyNumber,
      claimType: body.claimType || 'cashless',
      treatmentType: body.treatmentType || body.procedureName,
      hospitalName: body.providerName || body.hospitalName,
      diagnosis: body.diagnosis,
      claimedAmount: body.claimedAmount || body.finalBillAmount,
      source: 'provider_portal',
    }, actorId);
    const inward = await this.registerClaimInward(tpaId, created.claim.claimNumber, {
      source: 'provider_portal',
      receivedMode: 'digital',
      packetReference: body.packetReference || body.providerReference || null,
      documentsCount: toNumber(body.documentsCount, 0),
    }, actorId);
    await this.createProviderCase(tpaId, {
      claimNumber: created.claim.claimNumber,
      hospitalCode: body.providerCode || null,
      hospitalName: body.providerName || body.hospitalName || 'Provider not mapped',
      memberId: body.memberId,
      caseType: 'claim_submission',
      status: 'claim_submitted',
      finalBillAmount: body.finalBillAmount || body.claimedAmount || 0,
    }, actorId);
    return { success: true, claim: created.claim, inward: inward?.inward || null };
  }

  async getClaimOperations(tpaId, claimNumber) {
    const detail = await this.getClaim(tpaId, claimNumber);
    if (!detail) return null;
    const claimId = detail.claim.internalId;
    const [inward, scans, bills, adjudications, charges, payments] = await Promise.all([
      sequelize.query('SELECT * FROM tpa_claim_inward_register WHERE claim_id = :claimId ORDER BY received_at DESC', { replacements: { claimId }, type: QueryTypes.SELECT }),
      sequelize.query('SELECT * FROM tpa_claim_scan_batches WHERE claim_id = :claimId ORDER BY created_at DESC', { replacements: { claimId }, type: QueryTypes.SELECT }),
      sequelize.query('SELECT * FROM tpa_claim_bill_entries WHERE claim_id = :claimId ORDER BY created_at DESC', { replacements: { claimId }, type: QueryTypes.SELECT }),
      sequelize.query('SELECT * FROM tpa_claim_adjudications WHERE claim_id = :claimId ORDER BY created_at DESC', { replacements: { claimId }, type: QueryTypes.SELECT }),
      sequelize.query('SELECT * FROM tpa_claim_charge_entries WHERE claim_id = :claimId ORDER BY posted_at DESC', { replacements: { claimId }, type: QueryTypes.SELECT }),
      sequelize.query('SELECT * FROM tpa_claim_payment_advices WHERE claim_id = :claimId ORDER BY created_at DESC', { replacements: { claimId }, type: QueryTypes.SELECT }),
    ]);
    return { success: true, claim: detail.claim, inward, scans, bills, adjudications, charges, payments };
  }

  async scoreClaimFraud(tpaId, claimNumber) {
    const detail = await this.getClaim(tpaId, claimNumber);
    if (!detail) return null;
    const amount = toNumber(detail.claim.claimedAmount, 0);
    const rules = [];
    let riskScore = 15;
    if (amount > 200000) {
      riskScore += 35;
      rules.push('High claim amount requires medical audit');
    }
    if ((detail.documents || []).some((doc) => String(doc.risk_signal).toLowerCase() !== 'low')) {
      riskScore += 25;
      rules.push('Document intelligence detected non-low risk signal');
    }
    if (String(detail.claim.hospitalName || '').toLowerCase().includes('metro')) {
      riskScore += 20;
      rules.push('Provider requires enhanced review based on historical rule set');
    }
    const riskLevel = riskScore >= 70 ? 'high' : riskScore >= 40 ? 'medium' : 'low';
    const rows = await sequelize.query(
      `INSERT INTO tpa_fwa_scores (claim_id, risk_score, risk_level, rules_fired, recommendation)
       VALUES (:claimId, :riskScore, :riskLevel, :rulesFired::jsonb, :recommendation)
       RETURNING *`,
      {
        replacements: {
          claimId: detail.claim.internalId,
          riskScore,
          riskLevel,
          rulesFired: JSON.stringify(rules),
          recommendation: riskLevel === 'high' ? 'Manual audit required before settlement' : 'Standard processing allowed with checklist completion',
        },
        type: QueryTypes.SELECT,
      }
    );
    await this.addClaimEvent(detail.claim.internalId, {
      eventType: 'fraud_score_generated',
      title: 'Fraud/waste/abuse score generated',
      description: `Risk level: ${riskLevel}; score: ${riskScore}.`,
      payload: rows[0],
    });
    return { success: true, fraudRisk: rows[0] };
  }

  /**
   * The member's own e-card.
   *
   * Resolution is by the explicit user_id link only. tpa_members otherwise
   * offers a name, an employer's own employee code and four digits of a phone
   * number, and matching on any of those collides — a collision here hands one
   * person another person's insurance card, policy number and balance. An
   * unlinked member is told their card is not linked yet; nothing is guessed.
   *
   * Returns null when there is no linked, active membership, so the caller can
   * answer 404 without leaking whether some other member matched.
   */
  async getECardForUser(userId) {
    const id = Number(userId);
    if (!Number.isSafeInteger(id) || id < 1) return null;

    let rows = [];
    try {
      rows = await sequelize.query(
        `SELECT tpa_id AS "tpaId", member_id AS "memberId"
           FROM tpa_members
          WHERE user_id = :userId AND status = 'active'
          ORDER BY updated_at DESC NULLS LAST`,
        { replacements: { userId: id }, type: QueryTypes.SELECT }
      );
    } catch (error) {
      // The link column arrives with migration 20261111000100. Until it is
      // applied there is no verified link for anyone, which is the same answer
      // as an unlinked member rather than an error page.
      if (['42703', '42P01'].includes(error?.original?.code || error?.parent?.code || error?.code)) {
        return null;
      }
      throw error;
    }

    if (!rows.length) return null;
    // The unique index makes more than one impossible per TPA; across TPAs,
    // the most recently updated membership is the current one.
    const { tpaId, memberId } = rows[0];
    return this.generateECard(tpaId, memberId);
  }
}

export const tpaClaimsLifecycleService = new TPAClaimsLifecycleService();
export default tpaClaimsLifecycleService;
