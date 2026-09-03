import { postgresSequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

export const BENEFIT_CATEGORIES = new Set([
  'opd',
  'diagnostics',
  'pharmacy',
  'dental',
  'vision',
  'health_checkup',
  'mental_wellness',
  'fitness',
  'vaccination',
  'other',
]);

const money = (value, fallback = 0) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n * 100) / 100;
};

const toDateOnly = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

const safeJson = (value, fallback = {}) => {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const firstRow = (rows) => Array.isArray(rows) ? rows[0] : rows;

export function normalizeBenefitCategory(value) {
  const normalized = String(value || 'other').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return BENEFIT_CATEGORIES.has(normalized) ? normalized : 'other';
}

export async function resolveEmployeeCorporate(userId) {
  const rows = await postgresSequelize.query(
    `SELECT ce.corporate_id AS "corporateId",
            ce."employeeId" AS "employeeId",
            c."companyName" AS "companyName"
       FROM corporate_employees ce
       JOIN corporates c ON c.id = ce.corporate_id
      WHERE ce."userId" = :userId
        AND ce."isActive" = true
      ORDER BY ce."createdAt" DESC
      LIMIT 1`,
    { replacements: { userId }, type: QueryTypes.SELECT }
  );
  const ceRow = firstRow(rows);
  if (ceRow) return ceRow;

  const assocRows = await postgresSequelize.query(
    `SELECT ua."entityId" AS "corporateId",
            COALESCE(ua.metadata->>'employeeId', CAST(ua."userId" AS TEXT)) AS "employeeId",
            c."companyName" AS "companyName"
       FROM user_associations ua
       JOIN corporates c ON c.id = ua."entityId"
      WHERE ua."userId" = :userId
        AND ua."entityType" = 'corporate'
        AND ua.role = 'employee'
        AND ua.status = 'active'
      ORDER BY ua."createdAt" DESC
      LIMIT 1`,
    { replacements: { userId }, type: QueryTypes.SELECT }
  );
  return firstRow(assocRows) || null;
}

export async function getCorporateBenefitWalletSummary(corporateId) {
  const [summaryRows, categoryRows, recentAuthorizations] = await Promise.all([
    postgresSequelize.query(
      `SELECT
          (SELECT COUNT(*)::int
             FROM corporate_benefit_programs p
            WHERE p.corporate_id = :corporateId) AS "programCount",
          (SELECT COUNT(*)::int
             FROM corporate_benefit_programs p
            WHERE p.corporate_id = :corporateId
              AND p.status = 'active') AS "activePrograms",
          (SELECT COALESCE(SUM(p.annual_budget), 0)::float
             FROM corporate_benefit_programs p
            WHERE p.corporate_id = :corporateId) AS "totalBudget",
          (SELECT COUNT(w.id)::int
             FROM employee_benefit_wallets w
            WHERE w.corporate_id = :corporateId
              AND w.status = 'active') AS "activeWallets",
          (SELECT COALESCE(SUM(w.allocated_limit), 0)::float
             FROM employee_benefit_wallets w
            WHERE w.corporate_id = :corporateId
              AND w.status = 'active') AS "allocatedAmount",
          (SELECT COALESCE(SUM(w.utilized_amount), 0)::float
             FROM employee_benefit_wallets w
            WHERE w.corporate_id = :corporateId
              AND w.status = 'active') AS "utilizedAmount",
          (SELECT COALESCE(SUM(w.reserved_amount), 0)::float
             FROM employee_benefit_wallets w
            WHERE w.corporate_id = :corporateId
              AND w.status = 'active') AS "reservedAmount",
          (SELECT COALESCE(SUM(w.allocated_limit - w.utilized_amount - w.reserved_amount), 0)::float
             FROM employee_benefit_wallets w
            WHERE w.corporate_id = :corporateId
              AND w.status = 'active') AS "remainingAmount",
          (SELECT COUNT(a.id)::int
             FROM corporate_benefit_authorizations a
            WHERE a.corporate_id = :corporateId
              AND a.status IN ('submitted', 'approved')) AS "openAuthorizations"`,
      { replacements: { corporateId }, type: QueryTypes.SELECT }
    ),
    postgresSequelize.query(
      `SELECT p.category::text AS category,
              COUNT(DISTINCT p.id)::int AS "programCount",
              COUNT(w.id)::int AS "walletCount",
              COALESCE(SUM(w.allocated_limit), 0)::float AS allocated,
              COALESCE(SUM(w.utilized_amount), 0)::float AS utilized,
              COALESCE(SUM(w.reserved_amount), 0)::float AS reserved,
              COALESCE(SUM(w.allocated_limit - w.utilized_amount - w.reserved_amount), 0)::float AS remaining
         FROM corporate_benefit_programs p
         LEFT JOIN employee_benefit_wallets w
           ON w.program_id = p.id
          AND w.status = 'active'
        WHERE p.corporate_id = :corporateId
        GROUP BY p.category
        ORDER BY p.category`,
      { replacements: { corporateId }, type: QueryTypes.SELECT }
    ),
    postgresSequelize.query(
      `SELECT a.id,
              a.authorization_code AS "authorizationCode",
              a.category::text AS category,
              a.requested_amount AS "requestedAmount",
              a.approved_amount AS "approvedAmount",
              a.provider_name AS "providerName",
              a.service_type AS "serviceType",
              a.status,
              a.created_at AS "createdAt",
              COALESCE(NULLIF(TRIM(CONCAT(u."firstName", ' ', u."lastName")), ''), ce.email, a.employee_id) AS "employeeName",
              a.employee_id AS "employeeId"
         FROM corporate_benefit_authorizations a
         LEFT JOIN users u ON u.id = a.user_id
         LEFT JOIN corporate_employees ce
           ON ce.corporate_id = a.corporate_id
          AND (ce."userId" = a.user_id OR ce."employeeId" = a.employee_id)
        WHERE a.corporate_id = :corporateId
        ORDER BY a.created_at DESC
        LIMIT 10`,
      { replacements: { corporateId }, type: QueryTypes.SELECT }
    ),
  ]);

  const summary = firstRow(summaryRows) || {};
  return {
    programCount: Number(summary.programCount || 0),
    activePrograms: Number(summary.activePrograms || 0),
    totalBudget: money(summary.totalBudget),
    activeWallets: Number(summary.activeWallets || 0),
    allocatedAmount: money(summary.allocatedAmount),
    utilizedAmount: money(summary.utilizedAmount),
    reservedAmount: money(summary.reservedAmount),
    remainingAmount: money(summary.remainingAmount),
    openAuthorizations: Number(summary.openAuthorizations || 0),
    categoryBreakdown: categoryRows.map((row) => ({
      category: row.category,
      programCount: Number(row.programCount || 0),
      walletCount: Number(row.walletCount || 0),
      allocated: money(row.allocated),
      utilized: money(row.utilized),
      reserved: money(row.reserved),
      remaining: money(row.remaining),
    })),
    recentAuthorizations: recentAuthorizations.map((row) => ({
      ...row,
      requestedAmount: money(row.requestedAmount),
      approvedAmount: row.approvedAmount == null ? null : money(row.approvedAmount),
    })),
  };
}

export async function listCorporateBenefitPrograms(corporateId) {
  const rows = await postgresSequelize.query(
    `SELECT p.id,
            p.name,
            p.description,
            p.category::text AS category,
            p.funding_type AS "fundingType",
            p.annual_budget AS "annualBudget",
            p.per_employee_limit AS "perEmployeeLimit",
            p.family_coverage AS "familyCoverage",
            p.max_dependents AS "maxDependents",
            p.eligibility,
            p.coverage_rules AS "coverageRules",
            p.network_rules AS "networkRules",
            p.start_date AS "startDate",
            p.end_date AS "endDate",
            p.status,
            p.created_at AS "createdAt",
            COUNT(w.id)::int AS "walletCount",
            COALESCE(SUM(w.allocated_limit), 0)::float AS allocated,
            COALESCE(SUM(w.utilized_amount), 0)::float AS utilized,
            COALESCE(SUM(w.reserved_amount), 0)::float AS reserved,
            COALESCE(SUM(w.allocated_limit - w.utilized_amount - w.reserved_amount), 0)::float AS remaining
       FROM corporate_benefit_programs p
       LEFT JOIN employee_benefit_wallets w
         ON w.program_id = p.id
        AND w.status = 'active'
      WHERE p.corporate_id = :corporateId
      GROUP BY p.id
      ORDER BY p.created_at DESC`,
    { replacements: { corporateId }, type: QueryTypes.SELECT }
  );

  return rows.map((row) => ({
    ...row,
    annualBudget: money(row.annualBudget),
    perEmployeeLimit: money(row.perEmployeeLimit),
    walletCount: Number(row.walletCount || 0),
    allocated: money(row.allocated),
    utilized: money(row.utilized),
    reserved: money(row.reserved),
    remaining: money(row.remaining),
    eligibility: safeJson(row.eligibility),
    coverageRules: safeJson(row.coverageRules),
    networkRules: safeJson(row.networkRules),
    startDate: toDateOnly(row.startDate),
    endDate: toDateOnly(row.endDate),
  }));
}

export async function createCorporateBenefitProgram(corporateId, payload = {}, createdBy = null) {
  const name = String(payload.name || '').trim();
  if (!name) throw new Error('Benefit program name is required');

  const perEmployeeLimit = money(payload.perEmployeeLimit ?? payload.per_employee_limit);
  if (perEmployeeLimit <= 0) throw new Error('Per-employee limit must be greater than zero');

  const category = normalizeBenefitCategory(payload.category);
  const startDate = toDateOnly(payload.startDate || payload.start_date) || toDateOnly(new Date());
  const endDate = toDateOnly(payload.endDate || payload.end_date);
  const fundingType = ['employer_funded', 'co_pay', 'reimbursement', 'cashless'].includes(payload.fundingType || payload.funding_type)
    ? (payload.fundingType || payload.funding_type)
    : 'employer_funded';

  const rows = await postgresSequelize.query(
    `INSERT INTO corporate_benefit_programs (
        corporate_id,
        name,
        description,
        category,
        funding_type,
        annual_budget,
        per_employee_limit,
        family_coverage,
        max_dependents,
        eligibility,
        coverage_rules,
        network_rules,
        start_date,
        end_date,
        status,
        created_by,
        created_at,
        updated_at
     ) VALUES (
        :corporateId,
        :name,
        :description,
        CAST(:category AS corporate_benefit_category),
        :fundingType,
        :annualBudget,
        :perEmployeeLimit,
        :familyCoverage,
        :maxDependents,
        CAST(:eligibility AS jsonb),
        CAST(:coverageRules AS jsonb),
        CAST(:networkRules AS jsonb),
        :startDate,
        :endDate,
        CAST(:status AS corporate_benefit_program_status),
        :createdBy,
        NOW(),
        NOW()
     )
     RETURNING id`,
    {
      replacements: {
        corporateId,
        name,
        description: payload.description ? String(payload.description).slice(0, 2000) : null,
        category,
        fundingType,
        annualBudget: money(payload.annualBudget ?? payload.annual_budget),
        perEmployeeLimit,
        familyCoverage: Boolean(payload.familyCoverage ?? payload.family_coverage),
        maxDependents: Math.max(0, parseInt(payload.maxDependents ?? payload.max_dependents ?? 0, 10) || 0),
        eligibility: JSON.stringify(payload.eligibility || {}),
        coverageRules: JSON.stringify(payload.coverageRules || payload.coverage_rules || {}),
        networkRules: JSON.stringify(payload.networkRules || payload.network_rules || {}),
        startDate,
        endDate,
        status: ['draft', 'active', 'paused'].includes(payload.status) ? payload.status : 'active',
        createdBy,
      },
      type: QueryTypes.SELECT,
    }
  );

  const row = firstRow(rows);
  const programs = await listCorporateBenefitPrograms(corporateId);
  return programs.find((program) => String(program.id) === String(row.id));
}

export async function enrollEmployeesInBenefitProgram(corporateId, programId, payload = {}, actorId = null) {
  const tx = await postgresSequelize.transaction();
  try {
    const programs = await postgresSequelize.query(
      `SELECT id,
              corporate_id,
              per_employee_limit,
              start_date,
              end_date,
              status
         FROM corporate_benefit_programs
        WHERE id = :programId
          AND corporate_id = :corporateId
        LIMIT 1`,
      { replacements: { corporateId, programId }, type: QueryTypes.SELECT, transaction: tx }
    );
    const program = firstRow(programs);
    if (!program) throw new Error('Benefit program not found for this corporate');
    if (!['active', 'draft'].includes(program.status)) throw new Error('Only active or draft programs can enroll employees');

    const requestedEmployeeIds = Array.isArray(payload.employeeIds)
      ? payload.employeeIds.map((id) => String(id).trim()).filter(Boolean).slice(0, 500)
      : [];
    const allocatedLimit = money(payload.allocatedLimit ?? payload.allocated_limit, money(program.per_employee_limit));
    if (allocatedLimit <= 0) throw new Error('Allocated limit must be greater than zero');

    const replacements = { corporateId, employeeIds: requestedEmployeeIds };
    const rows = await postgresSequelize.query(
      `SELECT ce."employeeId" AS "employeeId",
              ce."userId" AS "userId",
              ce.email,
              ce.department,
              ce.designation,
              ce.metadata
         FROM corporate_employees ce
        WHERE ce.corporate_id = :corporateId
          AND ce."isActive" = true
          ${requestedEmployeeIds.length ? 'AND ce."employeeId" IN (:employeeIds)' : ''}
        ORDER BY ce."createdAt" DESC`,
      { replacements, type: QueryTypes.SELECT, transaction: tx }
    );

    if (rows.length === 0) throw new Error('No active employees found for enrollment');

    let enrolled = 0;
    let skipped = 0;
    const walletIds = [];

    for (const employee of rows) {
      const insertRows = await postgresSequelize.query(
        `INSERT INTO employee_benefit_wallets (
            corporate_id,
            program_id,
            user_id,
            employee_id,
            coverage_period_start,
            coverage_period_end,
            allocated_limit,
            utilized_amount,
            reserved_amount,
            status,
            metadata,
            created_at,
            updated_at
         ) VALUES (
            :corporateId,
            :programId,
            :userId,
            :employeeId,
            :startDate,
            :endDate,
            :allocatedLimit,
            0,
            0,
            'active',
            CAST(:metadata AS jsonb),
            NOW(),
            NOW()
         )
         ON CONFLICT DO NOTHING
         RETURNING id, allocated_limit`,
        {
          replacements: {
            corporateId,
            programId,
            userId: employee.userId || null,
            employeeId: employee.employeeId || null,
            startDate: toDateOnly(program.start_date),
            endDate: toDateOnly(program.end_date),
            allocatedLimit,
            metadata: JSON.stringify({
              enrolledBy: actorId,
              employeeEmail: employee.email || null,
              department: employee.department || null,
              designation: employee.designation || null,
            }),
          },
          type: QueryTypes.SELECT,
          transaction: tx,
        }
      );
      const wallet = firstRow(insertRows);
      if (!wallet) {
        skipped += 1;
        continue;
      }
      walletIds.push(wallet.id);
      enrolled += 1;

      await postgresSequelize.query(
        `INSERT INTO corporate_benefit_wallet_transactions (
            wallet_id,
            transaction_type,
            amount,
            previous_balance,
            new_balance,
            reference_type,
            reference_id,
            notes,
            metadata,
            created_by,
            created_at
         ) VALUES (
            :walletId,
            'allocation',
            :amount,
            0,
            :amount,
            'benefit_program',
            :programIdText,
            'Initial employer-funded wallet allocation',
            CAST(:metadata AS jsonb),
            :actorId,
            NOW()
         )`,
        {
          replacements: {
            walletId: wallet.id,
            amount: allocatedLimit,
            programIdText: String(programId),
            actorId,
            metadata: JSON.stringify({ corporateId, employeeId: employee.employeeId || null }),
          },
          transaction: tx,
        }
      );
    }

    await tx.commit();
    return {
      programId: Number(programId),
      attempted: rows.length,
      enrolled,
      skipped,
      walletIds,
    };
  } catch (error) {
    await tx.rollback().catch(() => {});
    throw error;
  }
}

export async function getEmployeeBenefitWalletByCorporateEmployeeId(corporateId, employeeId) {
  const rows = await postgresSequelize.query(
    `SELECT w.id,
            w.employee_id AS "employeeId",
            w.user_id AS "userId",
            w.coverage_period_start AS "coveragePeriodStart",
            w.coverage_period_end AS "coveragePeriodEnd",
            w.allocated_limit AS "allocatedLimit",
            w.utilized_amount AS "utilizedAmount",
            w.reserved_amount AS "reservedAmount",
            (w.allocated_limit - w.utilized_amount - w.reserved_amount) AS "remainingAmount",
            w.status,
            p.id AS "programId",
            p.name AS "programName",
            p.category::text AS category,
            p.funding_type AS "fundingType",
            p.family_coverage AS "familyCoverage",
            p.coverage_rules AS "coverageRules",
            p.network_rules AS "networkRules"
       FROM employee_benefit_wallets w
       JOIN corporate_benefit_programs p ON p.id = w.program_id
      WHERE w.corporate_id = :corporateId
        AND w.employee_id = :employeeId
      ORDER BY p.category, p.name`,
    { replacements: { corporateId, employeeId }, type: QueryTypes.SELECT }
  );

  return rows.map(normalizeWalletRow);
}

export async function getEmployeeBenefitWallet(userId) {
  const corp = await resolveEmployeeCorporate(userId);
  if (!corp) {
    return { isCorporateEmployee: false, corporate: null, wallets: [] };
  }

  const rows = await postgresSequelize.query(
    `SELECT w.id,
            w.employee_id AS "employeeId",
            w.user_id AS "userId",
            w.coverage_period_start AS "coveragePeriodStart",
            w.coverage_period_end AS "coveragePeriodEnd",
            w.allocated_limit AS "allocatedLimit",
            w.utilized_amount AS "utilizedAmount",
            w.reserved_amount AS "reservedAmount",
            (w.allocated_limit - w.utilized_amount - w.reserved_amount) AS "remainingAmount",
            w.status,
            p.id AS "programId",
            p.name AS "programName",
            p.description,
            p.category::text AS category,
            p.funding_type AS "fundingType",
            p.family_coverage AS "familyCoverage",
            p.max_dependents AS "maxDependents",
            p.coverage_rules AS "coverageRules",
            p.network_rules AS "networkRules",
            p.start_date AS "programStartDate",
            p.end_date AS "programEndDate"
       FROM employee_benefit_wallets w
       JOIN corporate_benefit_programs p ON p.id = w.program_id
      WHERE w.user_id = :userId
        AND w.corporate_id = :corporateId
        AND w.status = 'active'
        AND p.status = 'active'
        AND p.start_date <= CURRENT_DATE
        AND (p.end_date IS NULL OR p.end_date >= CURRENT_DATE)
      ORDER BY p.category, p.name`,
    { replacements: { userId, corporateId: corp.corporateId }, type: QueryTypes.SELECT }
  );

  return {
    isCorporateEmployee: true,
    corporate: {
      id: Number(corp.corporateId),
      name: corp.companyName,
      employeeId: corp.employeeId,
    },
    wallets: rows.map(normalizeWalletRow),
  };
}

export async function listCorporateBenefitAuthorizations(corporateId, filters = {}) {
  const status = String(filters.status || '').trim().toLowerCase();
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit || 25, 10) || 25));
  const statusClause = ['submitted', 'approved', 'declined', 'cancelled', 'settled', 'expired'].includes(status)
    ? 'AND a.status = CAST(:status AS corporate_benefit_authorization_status)'
    : '';

  const rows = await postgresSequelize.query(
    `SELECT a.id::int AS id,
            a.authorization_code AS "authorizationCode",
            a.category::text AS category,
            a.requested_amount AS "requestedAmount",
            a.approved_amount AS "approvedAmount",
            a.settlement_amount AS "settlementAmount",
            a.provider_type AS "providerType",
            a.provider_id AS "providerId",
            a.provider_name AS "providerName",
            a.service_type AS "serviceType",
            a.status,
            a.valid_from AS "validFrom",
            a.valid_to AS "validTo",
            a.settled_at AS "settledAt",
            a.cancelled_at AS "cancelledAt",
            a.created_at AS "createdAt",
            a.employee_id AS "employeeId",
            COALESCE(NULLIF(TRIM(CONCAT(u."firstName", ' ', u."lastName")), ''), ce.email, a.employee_id) AS "employeeName",
            w.allocated_limit AS "walletAllocated",
            w.utilized_amount AS "walletUtilized",
            w.reserved_amount AS "walletReserved",
            (w.allocated_limit - w.utilized_amount - w.reserved_amount) AS "walletRemaining"
       FROM corporate_benefit_authorizations a
       JOIN employee_benefit_wallets w ON w.id = a.wallet_id
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN corporate_employees ce
         ON ce.corporate_id = a.corporate_id
        AND (ce."userId" = a.user_id OR ce."employeeId" = a.employee_id)
      WHERE a.corporate_id = :corporateId
        ${statusClause}
      ORDER BY a.created_at DESC
      LIMIT :limit`,
    {
      replacements: { corporateId, status, limit },
      type: QueryTypes.SELECT,
    }
  );

  return rows.map((row) => ({
    ...row,
    requestedAmount: money(row.requestedAmount),
    approvedAmount: row.approvedAmount == null ? null : money(row.approvedAmount),
    settlementAmount: row.settlementAmount == null ? null : money(row.settlementAmount),
    walletAllocated: money(row.walletAllocated),
    walletUtilized: money(row.walletUtilized),
    walletReserved: money(row.walletReserved),
    walletRemaining: money(row.walletRemaining),
  }));
}

function normalizeWalletRow(row) {
  return {
    id: Number(row.id),
    employeeId: row.employeeId,
    userId: row.userId == null ? null : Number(row.userId),
    programId: Number(row.programId),
    programName: row.programName,
    description: row.description || null,
    category: row.category,
    fundingType: row.fundingType,
    familyCoverage: Boolean(row.familyCoverage),
    maxDependents: Number(row.maxDependents || 0),
    coveragePeriodStart: toDateOnly(row.coveragePeriodStart),
    coveragePeriodEnd: toDateOnly(row.coveragePeriodEnd),
    allocatedLimit: money(row.allocatedLimit),
    utilizedAmount: money(row.utilizedAmount),
    reservedAmount: money(row.reservedAmount),
    remainingAmount: money(row.remainingAmount),
    status: row.status,
    coverageRules: safeJson(row.coverageRules),
    networkRules: safeJson(row.networkRules),
  };
}

async function getLockedAuthorization(corporateId, authorizationId, tx) {
  const rows = await postgresSequelize.query(
    `SELECT a.id,
            a.corporate_id,
            a.wallet_id,
            a.user_id,
            a.employee_id,
            a.category::text AS category,
            a.requested_amount,
            a.approved_amount,
            a.status,
            a.authorization_code,
            w.allocated_limit,
            w.utilized_amount,
            w.reserved_amount
       FROM corporate_benefit_authorizations a
       JOIN employee_benefit_wallets w ON w.id = a.wallet_id
      WHERE a.id = :authorizationId
        AND a.corporate_id = :corporateId
      FOR UPDATE OF a, w`,
    {
      replacements: { corporateId, authorizationId },
      type: QueryTypes.SELECT,
      transaction: tx,
    }
  );
  return firstRow(rows);
}

function remainingFromWallet(row) {
  return money(Number(row.allocated_limit || 0) - Number(row.utilized_amount || 0) - Number(row.reserved_amount || 0));
}

export async function settleBenefitAuthorization(corporateId, authorizationId, payload = {}, actorId = null) {
  const tx = await postgresSequelize.transaction();
  try {
    const auth = await getLockedAuthorization(corporateId, authorizationId, tx);
    if (!auth) throw new Error('Benefit authorization not found for this corporate');
    if (auth.status !== 'approved') throw new Error(`Only approved authorizations can be settled. Current status: ${auth.status}`);

    const approvedAmount = money(auth.approved_amount ?? auth.requested_amount);
    const settlementAmount = money(payload.settlementAmount ?? payload.amount ?? approvedAmount);
    if (settlementAmount <= 0) throw new Error('Settlement amount must be greater than zero');
    if (settlementAmount > approvedAmount) {
      throw new Error(`Settlement amount cannot exceed approved amount ₹${approvedAmount}`);
    }

    const currentReserved = money(auth.reserved_amount);
    const reservedToRelease = Math.min(currentReserved, approvedAmount);
    const releaseDelta = money(Math.max(0, reservedToRelease - settlementAmount));
    const remainingBefore = remainingFromWallet(auth);
    const remainingAfter = money(remainingBefore + releaseDelta);
    const invoiceNumber = payload.invoiceNumber ? String(payload.invoiceNumber).slice(0, 100) : null;
    const settlementNotes = payload.notes ? String(payload.notes).slice(0, 1000) : null;

    await postgresSequelize.query(
      `UPDATE employee_benefit_wallets
          SET reserved_amount = GREATEST(0, reserved_amount - :reservedToRelease),
              utilized_amount = utilized_amount + :settlementAmount,
              status = CASE
                WHEN allocated_limit <= utilized_amount + :settlementAmount THEN 'exhausted'::corporate_benefit_wallet_status
                ELSE status
              END,
              updated_at = NOW()
        WHERE id = :walletId`,
      {
        replacements: {
          walletId: auth.wallet_id,
          reservedToRelease,
          settlementAmount,
        },
        transaction: tx,
      }
    );

    await postgresSequelize.query(
      `UPDATE corporate_benefit_authorizations
          SET status = 'settled',
              settlement_amount = :settlementAmount,
              settled_at = NOW(),
              settled_by = :actorId,
              metadata = COALESCE(metadata, '{}'::jsonb) || CAST(:metadata AS jsonb),
              updated_at = NOW()
        WHERE id = :authorizationId`,
      {
        replacements: {
          authorizationId,
          settlementAmount,
          actorId,
          metadata: JSON.stringify({
            settlement: {
              invoiceNumber,
              notes: settlementNotes,
              settledVia: 'corporate_hr_portal',
            },
          }),
        },
        transaction: tx,
      }
    );

    await postgresSequelize.query(
      `INSERT INTO corporate_benefit_wallet_transactions (
          wallet_id,
          transaction_type,
          amount,
          previous_balance,
          new_balance,
          reference_type,
          reference_id,
          notes,
          metadata,
          created_by,
          created_at
       ) VALUES (
          :walletId,
          'settlement',
          :settlementAmount,
          :previousBalance,
          :newBalance,
          'authorization',
          :authorizationIdText,
          'Cashless provider authorization settled',
          CAST(:metadata AS jsonb),
          :actorId,
          NOW()
       )`,
      {
        replacements: {
          walletId: auth.wallet_id,
          settlementAmount,
          previousBalance: remainingBefore,
          newBalance: remainingAfter,
          authorizationIdText: String(authorizationId),
          metadata: JSON.stringify({
            category: auth.category,
            authorizationCode: auth.authorization_code,
            approvedAmount,
            releaseDelta,
            invoiceNumber,
          }),
          actorId,
        },
        transaction: tx,
      }
    );

    if (releaseDelta > 0) {
      await postgresSequelize.query(
        `INSERT INTO corporate_benefit_wallet_transactions (
            wallet_id,
            transaction_type,
            amount,
            previous_balance,
            new_balance,
            reference_type,
            reference_id,
            notes,
            metadata,
            created_by,
            created_at
         ) VALUES (
            :walletId,
            'reservation_release',
            :releaseDelta,
            :previousBalance,
            :newBalance,
            'authorization',
            :authorizationIdText,
            'Unused reserved benefit amount released after partial settlement',
            CAST(:metadata AS jsonb),
            :actorId,
            NOW()
         )`,
        {
          replacements: {
            walletId: auth.wallet_id,
            releaseDelta,
            previousBalance: remainingBefore,
            newBalance: remainingAfter,
            authorizationIdText: String(authorizationId),
            metadata: JSON.stringify({
              category: auth.category,
              authorizationCode: auth.authorization_code,
              approvedAmount,
              settlementAmount,
            }),
            actorId,
          },
          transaction: tx,
        }
      );
    }

    await tx.commit();
    return {
      id: Number(authorizationId),
      authorizationCode: auth.authorization_code,
      status: 'settled',
      settlementAmount,
      releasedAmount: releaseDelta,
      remainingAmount: remainingAfter,
    };
  } catch (error) {
    await tx.rollback().catch(() => {});
    throw error;
  }
}

export async function cancelBenefitAuthorization(corporateId, authorizationId, payload = {}, actorId = null) {
  const tx = await postgresSequelize.transaction();
  try {
    const auth = await getLockedAuthorization(corporateId, authorizationId, tx);
    if (!auth) throw new Error('Benefit authorization not found for this corporate');
    if (!['submitted', 'approved'].includes(auth.status)) {
      throw new Error(`Only submitted or approved authorizations can be cancelled. Current status: ${auth.status}`);
    }

    const approvedAmount = money(auth.approved_amount ?? auth.requested_amount);
    const currentReserved = money(auth.reserved_amount);
    const reservedToRelease = Math.min(currentReserved, approvedAmount);
    const remainingBefore = remainingFromWallet(auth);
    const remainingAfter = money(remainingBefore + reservedToRelease);
    const cancellationNotes = payload.notes ? String(payload.notes).slice(0, 1000) : null;

    await postgresSequelize.query(
      `UPDATE employee_benefit_wallets
          SET reserved_amount = GREATEST(0, reserved_amount - :reservedToRelease),
              updated_at = NOW()
        WHERE id = :walletId`,
      {
        replacements: {
          walletId: auth.wallet_id,
          reservedToRelease,
        },
        transaction: tx,
      }
    );

    await postgresSequelize.query(
      `UPDATE corporate_benefit_authorizations
          SET status = 'cancelled',
              cancelled_at = NOW(),
              cancelled_by = :actorId,
              metadata = COALESCE(metadata, '{}'::jsonb) || CAST(:metadata AS jsonb),
              updated_at = NOW()
        WHERE id = :authorizationId`,
      {
        replacements: {
          authorizationId,
          actorId,
          metadata: JSON.stringify({
            cancellation: {
              notes: cancellationNotes,
              cancelledVia: 'corporate_hr_portal',
            },
          }),
        },
        transaction: tx,
      }
    );

    await postgresSequelize.query(
      `INSERT INTO corporate_benefit_wallet_transactions (
          wallet_id,
          transaction_type,
          amount,
          previous_balance,
          new_balance,
          reference_type,
          reference_id,
          notes,
          metadata,
          created_by,
          created_at
       ) VALUES (
          :walletId,
          'reservation_release',
          :reservedToRelease,
          :previousBalance,
          :newBalance,
          'authorization',
          :authorizationIdText,
          'Reserved benefit amount released after authorization cancellation',
          CAST(:metadata AS jsonb),
          :actorId,
          NOW()
       )`,
      {
        replacements: {
          walletId: auth.wallet_id,
          reservedToRelease,
          previousBalance: remainingBefore,
          newBalance: remainingAfter,
          authorizationIdText: String(authorizationId),
          metadata: JSON.stringify({
            category: auth.category,
            authorizationCode: auth.authorization_code,
            approvedAmount,
          }),
          actorId,
        },
        transaction: tx,
      }
    );

    await tx.commit();
    return {
      id: Number(authorizationId),
      authorizationCode: auth.authorization_code,
      status: 'cancelled',
      releasedAmount: money(reservedToRelease),
      remainingAmount: remainingAfter,
    };
  } catch (error) {
    await tx.rollback().catch(() => {});
    throw error;
  }
}

export async function requestBenefitAuthorization(userId, payload = {}) {
  const corp = await resolveEmployeeCorporate(userId);
  if (!corp) throw new Error('Benefit authorizations are available only for corporate employees');

  const category = normalizeBenefitCategory(payload.category);
  const requestedAmount = money(payload.amount ?? payload.requestedAmount);
  if (requestedAmount <= 0) throw new Error('Requested amount must be greater than zero');

  const tx = await postgresSequelize.transaction();
  try {
    const walletRows = await postgresSequelize.query(
      `SELECT w.id,
              w.allocated_limit,
              w.utilized_amount,
              w.reserved_amount,
              (w.allocated_limit - w.utilized_amount - w.reserved_amount) AS remaining,
              w.employee_id,
              p.category::text AS category
         FROM employee_benefit_wallets w
         JOIN corporate_benefit_programs p ON p.id = w.program_id
        WHERE w.user_id = :userId
          AND w.corporate_id = :corporateId
          AND w.status = 'active'
          AND p.status = 'active'
          AND p.category = CAST(:category AS corporate_benefit_category)
          AND p.start_date <= CURRENT_DATE
          AND (p.end_date IS NULL OR p.end_date >= CURRENT_DATE)
        ORDER BY remaining DESC
        LIMIT 1
        FOR UPDATE OF w`,
      {
        replacements: {
          userId,
          corporateId: corp.corporateId,
          category,
        },
        type: QueryTypes.SELECT,
        transaction: tx,
      }
    );
    const wallet = firstRow(walletRows);
    if (!wallet) throw new Error(`No active ${category.replace(/_/g, ' ')} benefit wallet is available`);

    const remaining = money(wallet.remaining);
    if (requestedAmount > remaining) {
      throw new Error(`Insufficient benefit balance. Available ₹${remaining}, requested ₹${requestedAmount}`);
    }

    const authorizationCode = `CBW-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
    const providerType = payload.providerType ? String(payload.providerType).slice(0, 40) : null;
    const providerId = Number.isFinite(Number(payload.providerId)) ? Number(payload.providerId) : null;
    const providerName = payload.providerName ? String(payload.providerName).slice(0, 255) : null;
    const serviceType = payload.serviceType ? String(payload.serviceType).slice(0, 160) : null;
    const validTo = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const authRows = await postgresSequelize.query(
      `INSERT INTO corporate_benefit_authorizations (
          corporate_id,
          wallet_id,
          user_id,
          employee_id,
          category,
          requested_amount,
          approved_amount,
          provider_type,
          provider_id,
          provider_name,
          service_type,
          status,
          authorization_code,
          valid_from,
          valid_to,
          metadata,
          created_at,
          updated_at
       ) VALUES (
          :corporateId,
          :walletId,
          :userId,
          :employeeId,
          CAST(:category AS corporate_benefit_category),
          :requestedAmount,
          :requestedAmount,
          :providerType,
          :providerId,
          :providerName,
          :serviceType,
          'approved',
          :authorizationCode,
          NOW(),
          :validTo,
          CAST(:metadata AS jsonb),
          NOW(),
          NOW()
       )
       RETURNING id, authorization_code AS "authorizationCode", status, requested_amount AS "requestedAmount", approved_amount AS "approvedAmount", valid_to AS "validTo"`,
      {
        replacements: {
          corporateId: corp.corporateId,
          walletId: wallet.id,
          userId,
          employeeId: wallet.employee_id || corp.employeeId || null,
          category,
          requestedAmount,
          providerType,
          providerId,
          providerName,
          serviceType,
          authorizationCode,
          validTo,
          metadata: JSON.stringify({
            requestedVia: 'employee_portal',
            notes: payload.notes ? String(payload.notes).slice(0, 1000) : null,
          }),
        },
        type: QueryTypes.SELECT,
        transaction: tx,
      }
    );
    const authorization = firstRow(authRows);

    await postgresSequelize.query(
      `UPDATE employee_benefit_wallets
          SET reserved_amount = reserved_amount + :requestedAmount,
              updated_at = NOW()
        WHERE id = :walletId`,
      {
        replacements: { requestedAmount, walletId: wallet.id },
        transaction: tx,
      }
    );

    await postgresSequelize.query(
      `INSERT INTO corporate_benefit_wallet_transactions (
          wallet_id,
          transaction_type,
          amount,
          previous_balance,
          new_balance,
          reference_type,
          reference_id,
          notes,
          metadata,
          created_by,
          created_at
       ) VALUES (
          :walletId,
          'reservation',
          :requestedAmount,
          :previousBalance,
          :newBalance,
          'authorization',
          :authorizationId,
          'Benefit amount reserved for cashless authorization',
          CAST(:metadata AS jsonb),
          :userId,
          NOW()
       )`,
      {
        replacements: {
          walletId: wallet.id,
          requestedAmount,
          previousBalance: remaining,
          newBalance: money(remaining - requestedAmount),
          authorizationId: String(authorization.id),
          metadata: JSON.stringify({ category, providerType, providerId, providerName, serviceType }),
          userId,
        },
        transaction: tx,
      }
    );

    await tx.commit();
    return {
      id: Number(authorization.id),
      authorizationCode: authorization.authorizationCode,
      status: authorization.status,
      category,
      requestedAmount,
      approvedAmount: money(authorization.approvedAmount),
      validTo: authorization.validTo,
      walletId: Number(wallet.id),
      remainingAmount: money(remaining - requestedAmount),
    };
  } catch (error) {
    await tx.rollback().catch(() => {});
    throw error;
  }
}
