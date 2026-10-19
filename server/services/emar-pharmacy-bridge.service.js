/** Administration consumption reconciliation; this is not authorization to issue stock. */
import { createHash } from 'node:crypto';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
export function buildDispenseRequestHash(input) {
    return createHash('sha256').update(JSON.stringify([input.organizationId, input.admissionId, input.patientId, input.medicationOrderId, input.administrationId, input.drugName, input.dose || null, input.route || null, input.doseUnit || null, input.outcome || 'given'])).digest('hex');
}
export async function enqueueFromAdministration(input, existingTransaction) {
    if (!['given', 'late'].includes(input.outcome || 'given'))
        return null;
    const execute = async (transaction) => {
        const replacements = { org: input.organizationId, administration: input.administrationId, order: input.medicationOrderId, admission: input.admissionId, patient: input.patientId };
        const hash = buildDispenseRequestHash(input);
        const q = (sql, extra = {}) => sequelize.query(sql, { transaction, replacements: { ...replacements, ...extra }, type: QueryTypes.SELECT });
        const check = row => {
            if (row.request_hash !== hash)
                throw fail(422, 'idempotency_key_reuse', 'The administration was already reconciled with different data');
            return row;
        };
        const [previous] = await q('SELECT * FROM pharmacy_dispense_queue WHERE organization_id= :org AND administration_id= :administration');
        if (previous)
            return check(previous);
        const [order] = await q('SELECT id FROM medication_orders WHERE id= :order AND organization_id= :org AND admission_id= :admission AND patient_id= :patient');
        if (!order)
            throw fail(404, 'not_found', 'Medication order not found');
        const [created] = await q(`INSERT INTO pharmacy_dispense_queue(organization_id,admission_id,patient_id,medication_order_id,administration_id,drug_name,dose,route,request_hash,status,created_at,updated_at)
      VALUES(:org,:admission,:patient,:order,:administration,:drug,:dose,:route,:hash,'pending',NOW(),NOW()) ON CONFLICT DO NOTHING RETURNING *`, { drug: input.drugName, dose: input.dose ? [input.dose, input.doseUnit].filter(Boolean).join(' ') : null, route: input.route || null, hash });
        if (created)
            return created;
        const [raced] = await q('SELECT * FROM pharmacy_dispense_queue WHERE organization_id= :org AND administration_id= :administration');
        if (!raced)
            throw fail(409, 'reconciliation_conflict', 'Could not reconcile this administration');
        return check(raced);
    };
    return existingTransaction ? execute(existingTransaction) : sequelize.transaction(execute);
}
export async function listPendingDispense(organizationId, { wardId } = {}) {
    return sequelize.query(`SELECT pdq.*,ia.ward_id FROM pharmacy_dispense_queue pdq JOIN ip_admissions ia ON ia.id=pdq.admission_id AND ia.organization_id=pdq.organization_id WHERE pdq.organization_id= :org AND pdq.status='pending' ${wardId ? 'AND ia.ward_id= :ward' : ''} ORDER BY pdq.created_at`, { replacements: { org: organizationId, ward: wardId || null }, type: QueryTypes.SELECT });
}
export async function markDispensed(id, organizationId, dispensedBy) {
    return sequelize.transaction(async (transaction) => {
        const replacements = { id, org: organizationId, by: dispensedBy };
        const [previous] = await sequelize.query('SELECT * FROM pharmacy_dispense_queue WHERE id= :id AND organization_id= :org FOR UPDATE', { replacements, transaction, type: QueryTypes.SELECT });
        if (!previous)
            throw fail(404, 'not_found', 'Reconciliation record not found');
        if (previous.status === 'dispensed')
            return previous;
        if (previous.status !== 'pending')
            throw fail(409, 'invalid_state', 'This reconciliation is no longer pending');
        const [row] = await sequelize.query("UPDATE pharmacy_dispense_queue SET status='dispensed',dispensed_by= :by,dispensed_at=NOW(),updated_at=NOW() WHERE id= :id AND organization_id= :org AND status = 'pending' RETURNING *", { replacements, transaction, type: QueryTypes.SELECT });
        return row;
    });
}
