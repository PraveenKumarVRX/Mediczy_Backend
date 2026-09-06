/**
 * Admin-side CRUD for saved corporate OPD/wellness wallet quotes.
 * Deliberately NOT tied to the `corporates` table (see migration
 * comment) — a quote lives here until the deal closes, at which point
 * an admin/team member creates the real corporate + benefit program
 * (reusing the same tierOptions, so nothing needs re-entering).
 */
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import { normalizeTierOptions } from './corporate-benefit-wallet.service.js';
import { calculateCorporateQuote } from './corporate-quote-calculator.service.js';

function firstRow(rows) {
  return Array.isArray(rows) ? rows[0] : rows;
}

function safeJson(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return null; }
}

const BENEFIT_CATEGORIES = new Set([
  'opd', 'diagnostics', 'pharmacy', 'dental', 'vision',
  'health_checkup', 'mental_wellness', 'fitness', 'vaccination', 'other',
]);

function normalizeCategories(input) {
  const list = Array.isArray(input) ? input : [];
  const normalized = list.map((c) => String(c).trim().toLowerCase()).filter((c) => BENEFIT_CATEGORIES.has(c));
  if (normalized.length === 0) throw new Error('At least one benefit category is required');
  return [...new Set(normalized)];
}

function normalizeRow(row) {
  return {
    id: Number(row.id),
    prospectName: row.prospectName,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    employeeCount: Number(row.employeeCount),
    categories: safeJson(row.categories) || [],
    tierOptions: safeJson(row.tierOptions) || [],
    assumedUptake: safeJson(row.assumedUptake) || {},
    adminFeePercent: Number(row.adminFeePercent),
    categoryLoadingPerEmployee: Number(row.categoryLoadingPerEmployee),
    calculation: safeJson(row.calculation) || {},
    status: row.status,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const SELECT_COLUMNS = `
  id, prospect_name AS "prospectName", contact_name AS "contactName",
  contact_email AS "contactEmail", contact_phone AS "contactPhone",
  employee_count AS "employeeCount", categories, tier_options AS "tierOptions",
  assumed_uptake AS "assumedUptake", admin_fee_percent AS "adminFeePercent",
  category_loading_per_employee AS "categoryLoadingPerEmployee",
  calculation, status, notes, created_at AS "createdAt", updated_at AS "updatedAt"
`;

function buildAndCalculate(payload) {
  const prospectName = String(payload.prospectName || '').trim();
  if (!prospectName) throw new Error('prospectName is required');

  const employeeCount = Number(payload.employeeCount);
  if (!Number.isFinite(employeeCount) || employeeCount <= 0) throw new Error('employeeCount must be greater than zero');

  const categories = normalizeCategories(payload.categories);
  const tierOptions = normalizeTierOptions(payload.tierOptions, null);
  if (tierOptions.length === 0) throw new Error('At least one tier (the base wallet amount) is required');

  const assumedUptake = payload.assumedUptake && typeof payload.assumedUptake === 'object' ? payload.assumedUptake : {};
  const adminFeePercent = Number(payload.adminFeePercent ?? 8);
  if (!Number.isFinite(adminFeePercent) || adminFeePercent < 0) throw new Error('adminFeePercent must be zero or greater');
  const categoryLoadingPerEmployee = Number(payload.categoryLoadingPerEmployee ?? 0);
  if (!Number.isFinite(categoryLoadingPerEmployee) || categoryLoadingPerEmployee < 0) throw new Error('categoryLoadingPerEmployee must be zero or greater');

  const calculation = calculateCorporateQuote({ employeeCount, tierOptions, assumedUptake, adminFeePercent, categoryLoadingPerEmployee });

  return { prospectName, employeeCount, categories, tierOptions, assumedUptake, adminFeePercent, categoryLoadingPerEmployee, calculation };
}

export async function createCorporateQuote(payload = {}, createdBy = null) {
  const built = buildAndCalculate(payload);

  const rows = await postgresSequelize.query(
    `INSERT INTO corporate_quotes (
        prospect_name, contact_name, contact_email, contact_phone, employee_count,
        categories, tier_options, assumed_uptake, admin_fee_percent,
        category_loading_per_employee, calculation, status, notes, created_by, created_at, updated_at
     ) VALUES (
        :prospectName, :contactName, :contactEmail, :contactPhone, :employeeCount,
        CAST(:categories AS jsonb), CAST(:tierOptions AS jsonb), CAST(:assumedUptake AS jsonb), :adminFeePercent,
        :categoryLoadingPerEmployee, CAST(:calculation AS jsonb), 'draft', :notes, :createdBy, NOW(), NOW()
     ) RETURNING id`,
    {
      replacements: {
        prospectName: built.prospectName,
        contactName: payload.contactName ? String(payload.contactName).slice(0, 255) : null,
        contactEmail: payload.contactEmail ? String(payload.contactEmail).slice(0, 255) : null,
        contactPhone: payload.contactPhone ? String(payload.contactPhone).slice(0, 30) : null,
        employeeCount: built.employeeCount,
        categories: JSON.stringify(built.categories),
        tierOptions: JSON.stringify(built.tierOptions),
        assumedUptake: JSON.stringify(built.assumedUptake),
        adminFeePercent: built.adminFeePercent,
        categoryLoadingPerEmployee: built.categoryLoadingPerEmployee,
        calculation: JSON.stringify(built.calculation),
        notes: payload.notes ? String(payload.notes).slice(0, 2000) : null,
        createdBy,
      },
      type: QueryTypes.SELECT,
    }
  );

  return getCorporateQuote(firstRow(rows).id);
}

export async function updateCorporateQuote(id, payload = {}) {
  const existing = await getCorporateQuote(id);
  if (!existing) throw new Error('Quote not found');

  const merged = {
    prospectName: payload.prospectName ?? existing.prospectName,
    employeeCount: payload.employeeCount ?? existing.employeeCount,
    categories: payload.categories ?? existing.categories,
    tierOptions: payload.tierOptions ?? existing.tierOptions,
    assumedUptake: payload.assumedUptake ?? existing.assumedUptake,
    adminFeePercent: payload.adminFeePercent ?? existing.adminFeePercent,
    categoryLoadingPerEmployee: payload.categoryLoadingPerEmployee ?? existing.categoryLoadingPerEmployee,
  };
  const built = buildAndCalculate(merged);

  await postgresSequelize.query(
    `UPDATE corporate_quotes SET
        prospect_name = :prospectName,
        contact_name = COALESCE(:contactName, contact_name),
        contact_email = COALESCE(:contactEmail, contact_email),
        contact_phone = COALESCE(:contactPhone, contact_phone),
        employee_count = :employeeCount,
        categories = CAST(:categories AS jsonb),
        tier_options = CAST(:tierOptions AS jsonb),
        assumed_uptake = CAST(:assumedUptake AS jsonb),
        admin_fee_percent = :adminFeePercent,
        category_loading_per_employee = :categoryLoadingPerEmployee,
        calculation = CAST(:calculation AS jsonb),
        status = COALESCE(:status, status),
        notes = COALESCE(:notes, notes),
        updated_at = NOW()
      WHERE id = :id`,
    {
      replacements: {
        id,
        prospectName: built.prospectName,
        contactName: payload.contactName ? String(payload.contactName).slice(0, 255) : null,
        contactEmail: payload.contactEmail ? String(payload.contactEmail).slice(0, 255) : null,
        contactPhone: payload.contactPhone ? String(payload.contactPhone).slice(0, 30) : null,
        employeeCount: built.employeeCount,
        categories: JSON.stringify(built.categories),
        tierOptions: JSON.stringify(built.tierOptions),
        assumedUptake: JSON.stringify(built.assumedUptake),
        adminFeePercent: built.adminFeePercent,
        categoryLoadingPerEmployee: built.categoryLoadingPerEmployee,
        calculation: JSON.stringify(built.calculation),
        status: ['draft', 'sent', 'won', 'lost'].includes(payload.status) ? payload.status : null,
        notes: payload.notes ? String(payload.notes).slice(0, 2000) : null,
      },
    }
  );

  return getCorporateQuote(id);
}

export async function listCorporateQuotes() {
  const rows = await postgresSequelize.query(
    `SELECT ${SELECT_COLUMNS} FROM corporate_quotes ORDER BY created_at DESC`,
    { type: QueryTypes.SELECT }
  );
  return rows.map(normalizeRow);
}

export async function getCorporateQuote(id) {
  const rows = await postgresSequelize.query(
    `SELECT ${SELECT_COLUMNS} FROM corporate_quotes WHERE id = :id`,
    { replacements: { id }, type: QueryTypes.SELECT }
  );
  const row = firstRow(rows);
  return row ? normalizeRow(row) : null;
}
