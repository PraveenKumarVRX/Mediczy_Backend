import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';

let schemaReady = false;

function schemaError() {
  const error = new Error('Hospital tariff schema is not migrated');
  error.code = 'SCHEMA_NOT_MIGRATED';
  error.status = 503;
  return error;
}

export async function ensureHospitalTariffReady() {
  if (schemaReady) return;
  try {
    const [rows] = await sequelize.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_name = 'hospital_tariffs'
    `);
    if (!rows.some((row) => row.table_name === 'hospital_tariffs')) throw schemaError();
    schemaReady = true;
  } catch (error) {
    if (error.code === 'SCHEMA_NOT_MIGRATED') throw error;
    const wrapped = schemaError();
    wrapped.cause = error;
    throw wrapped;
  }
}

function normalise(input = {}) {
  const code = String(input.code || '').trim();
  const itemName = String(input.itemName || '').trim();
  const category = String(input.category || '').trim();
  const unit = String(input.unit || '').trim();
  const rate = Number(input.rate);
  const gst = Number(input.gst ?? 0);
  const effectiveFrom = String(input.effectiveFrom || '').trim();
  const effectiveTo = input.effectiveTo ? String(input.effectiveTo).trim() : null;
  if (!code || !itemName || !category || !unit || !effectiveFrom || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
    const error = new Error('code, itemName, category, unit and a YYYY-MM-DD effectiveFrom are required');
    error.code = 'VALIDATION_FAILED'; error.status = 400; throw error;
  }
  if (effectiveTo && !/^\d{4}-\d{2}-\d{2}$/.test(effectiveTo)) {
    const error = new Error('effectiveTo must use YYYY-MM-DD');
    error.code = 'VALIDATION_FAILED'; error.status = 400; throw error;
  }
  if (!Number.isFinite(rate) || rate < 0 || !Number.isFinite(gst) || gst < 0 || gst > 100) {
    const error = new Error('rate must be non-negative and gst must be between 0 and 100');
    error.code = 'VALIDATION_FAILED'; error.status = 400; throw error;
  }
  return {
    code, itemName, category, unit, roomCategory: input.roomCategory ? String(input.roomCategory).trim() : null,
    payerType: input.payerType ? String(input.payerType).trim() : null,
    packageCode: input.packageCode ? String(input.packageCode).trim() : null,
    rate, gst, effectiveFrom, effectiveTo,
  };
}

export async function listHospitalTariffs(hospitalId) {
  await ensureHospitalTariffReady();
  const [rows] = await sequelize.query(`
    SELECT * FROM hospital_tariffs
    WHERE hospital_id = :hospitalId AND active = TRUE
    ORDER BY category, item_name, effective_from DESC
  `, { replacements: { hospitalId } });
  return rows;
}

export async function createHospitalTariff(hospitalId, input, actorId = null) {
  await ensureHospitalTariffReady();
  const data = normalise(input);
  const [overlap] = await sequelize.query(`
    SELECT id FROM hospital_tariffs
    WHERE hospital_id = :hospitalId AND code = :code AND active = TRUE
      AND room_category IS NOT DISTINCT FROM :roomCategory
      AND payer_type IS NOT DISTINCT FROM :payerType
      AND package_code IS NOT DISTINCT FROM :packageCode
      AND effective_from <= COALESCE(:effectiveTo::date, '9999-12-31'::date)
      AND (effective_to IS NULL OR effective_to >= :effectiveFrom::date)
    LIMIT 1
  `, { replacements: { hospitalId, ...data } });
  if (overlap[0]) {
    const error = new Error('An active tariff with the same code and payer/room scope overlaps this effective period');
    error.code = 'TARIFF_OVERLAP'; error.status = 409; throw error;
  }
  const [rows] = await sequelize.query(`
    INSERT INTO hospital_tariffs
      (hospital_id, code, item_name, category, unit, room_category, payer_type, package_code,
       rate, gst, effective_from, effective_to, created_by)
    VALUES (:hospitalId,:code,:itemName,:category,:unit,:roomCategory,:payerType,:packageCode,
      :rate,:gst,:effectiveFrom,:effectiveTo,:actorId)
    RETURNING *
  `, { replacements: { hospitalId, ...data, actorId } });
  return rows[0];
}

export async function lookupHospitalTariff(hospitalId, { code, roomCategory = null, payerType = null, onDate }) {
  await ensureHospitalTariffReady();
  if (!code) { const error = new Error('code is required'); error.code = 'VALIDATION_FAILED'; error.status = 400; throw error; }
  const [rows] = await sequelize.query(`
    SELECT * FROM hospital_tariffs
    WHERE hospital_id = :hospitalId AND code = :code AND active = TRUE
      AND effective_from <= :onDate::date AND (effective_to IS NULL OR effective_to >= :onDate::date)
      AND (room_category IS NULL OR room_category = :roomCategory)
      AND (payer_type IS NULL OR payer_type = :payerType)
    ORDER BY
      CASE WHEN payer_type = :payerType THEN 0 ELSE 1 END,
      CASE WHEN room_category = :roomCategory THEN 0 ELSE 1 END,
      effective_from DESC
    LIMIT 1
  `, { replacements: { hospitalId, code: String(code).trim(), roomCategory, payerType, onDate: onDate || new Date().toISOString().slice(0, 10) } });
  if (!rows[0]) { const error = new Error('No active tariff found'); error.code = 'NOT_FOUND'; error.status = 404; throw error; }
  return rows[0];
}

export async function deactivateHospitalTariff(hospitalId, id, actorId = null) {
  await ensureHospitalTariffReady();
  const [rows] = await sequelize.query(`
    UPDATE hospital_tariffs SET active = FALSE, updated_at = NOW()
    WHERE id = :id AND hospital_id = :hospitalId AND active = TRUE
    RETURNING *
  `, { replacements: { id, hospitalId } });
  if (!rows[0]) { const error = new Error('Active tariff not found'); error.code = 'NOT_FOUND'; error.status = 404; throw error; }
  return { ...rows[0], deactivatedBy: actorId };
}

export function resetHospitalTariffReadinessForTests() { schemaReady = false; }
