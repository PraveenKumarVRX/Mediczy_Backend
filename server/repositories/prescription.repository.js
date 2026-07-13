/**
 * PrescriptionRepository — single place that touches the `prescriptions` table.
 *
 * prescriptions enforces FORCE ROW LEVEL SECURITY: every read/write must run
 * inside a transaction with the session GUCs set (req.setSequelizeRlsContext),
 * or Sequelize silently sees zero rows (reads) / gets rejected (writes) with
 * "new row violates row-level security policy". That rule was previously
 * re-implemented as an identical local withPrescriptionsRls() helper pasted
 * into five different route files — this repository is the one place it's
 * implemented now.
 */
import { Prescription } from '../models/index.js';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { setRlsContext } from '../middleware/rls-context.middleware.js';

/**
 * Run `work(transaction)` inside a request-scoped RLS transaction.
 * Escape hatch for operations this repository doesn't yet name explicitly —
 * prefer adding a named method below over calling this from route code.
 */
export async function withTransaction(req, work) {
  const transaction = await postgresSequelize.transaction();
  try {
    await req.setSequelizeRlsContext?.(transaction);
    const result = await work(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  }
}

/**
 * Platform-admin bypass, for the token-based public share endpoints
 * (GET /:id/html, /:id/pdf) that have no authUser/authDoctor middleware —
 * identity is decoded from a bearer/query/cookie token *after* the row is
 * fetched (see canAccessPrescriptionPdf in prescription.route.js). Real
 * authorization happens in the caller; this only makes the row visible.
 */
export async function withTransactionBypass(work) {
  const transaction = await postgresSequelize.transaction();
  try {
    await setRlsContext(transaction, { orgId: 0, userId: 0, isPlatformAdmin: true });
    const result = await work(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  }
}

/** id may be a numeric PK or a prescriptionId string (e.g. "RX-ABC123-XYZ"). */
function idWhere(id) {
  return isNaN(id) ? { prescriptionId: id } : { id: parseInt(id, 10) };
}

export async function findById(req, id, { include } = {}) {
  return withTransaction(req, (transaction) => Prescription.findOne({ where: idWhere(id), include, transaction }));
}

/**
 * Escape hatch for multi-step operations (fetch + authorize + update) that
 * must share ONE already-open transaction — findById() above opens and
 * commits its own. Use inside a withTransaction(req, ...) block.
 */
export async function findByIdInTransaction(id, transaction, { include } = {}) {
  return Prescription.findOne({ where: idWhere(id), include, transaction });
}

/** For the public share-link endpoints — see withTransactionBypass. */
export async function findByIdBypass(id, { include } = {}) {
  return withTransactionBypass((transaction) => Prescription.findOne({ where: idWhere(id), include, transaction }));
}

export async function findByAppointmentId(req, appointmentId) {
  return withTransaction(req, (transaction) => Prescription.findOne({
    where: { appointmentId: parseInt(appointmentId, 10) },
    transaction,
  }));
}

export async function findAllForDoctor(req, doctorId, { order = [['createdAt', 'DESC']], limit } = {}) {
  return withTransaction(req, (transaction) => Prescription.findAll({
    where: { doctorId: parseInt(doctorId, 10) },
    order,
    ...(limit ? { limit } : {}),
    transaction,
  }));
}

export async function findAndCountAllForDoctor(req, doctorId, { order = [['createdAt', 'DESC']], limit, offset } = {}) {
  return withTransaction(req, (transaction) => Prescription.findAndCountAll({
    where: { doctorId: parseInt(doctorId, 10) },
    order,
    limit,
    offset,
    transaction,
  }));
}

export async function findAllForPatient(req, patientId, { status, order = [['createdAt', 'DESC']], limit } = {}) {
  return withTransaction(req, (transaction) => Prescription.findAll({
    where: { patientId: parseInt(patientId, 10), ...(status ? { status } : {}) },
    order,
    ...(limit ? { limit } : {}),
    transaction,
  }));
}

export async function create(req, data) {
  return withTransaction(req, (transaction) => Prescription.create(data, { transaction }));
}

export async function update(req, prescription, updates) {
  return withTransaction(req, (transaction) => prescription.update(updates, { transaction }));
}
