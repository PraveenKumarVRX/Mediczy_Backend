/**
 * eMAR — Electronic Medication Administration Record
 *
 * Manages IP medication orders and nurse administration charting.
 *
 * B3 Safety:
 *   - 5-right checks enforced at every administration attempt
 *   - Allergy / contraindication hard-stop (emergency override allowed)
 *   - High-alert drugs require dual nurse/doctor co-sign
 */
import { requireIndividualNurse, nursingQuery, nursingContext, assertAdmission, positiveId, boundedNumber, validTime, requireText, clinicalError, withNursingReplay, nursingAudit, nursingOutbox, assertNursingPrescriber } from './nursing-context.service.js';
import { verifyNursingProof } from './nursing-verification.service.js';
import { enqueueFromAdministration } from './emar-pharmacy-bridge.service.js';
import { QueryTypes } from 'sequelize';
import { matchAllergy } from './prescription-safety.service.js';
import { resolveGenerics, classesOfGenerics } from './drug-class.service.js';
import { getAllergyStatus } from './allergy.service.js';
// ── High-alert drug list (generic name / class fragments, lower-cased) ────────
const HIGH_ALERT_DRUGS = new Set([
    'insulin', 'heparin', 'warfarin', 'methotrexate', 'morphine', 'fentanyl',
    'midazolam', 'propofol', 'ketamine', 'potassium chloride', 'concentrated potassium',
    'neuromuscular blocking', 'vecuronium', 'succinylcholine', 'digoxin',
    'amiodarone', 'lithium', 'phenytoin', 'vancomycin', 'chemotherapy',
]);
function isHighAlert(drugName = '') {
    const lower = drugName.toLowerCase();
    for (const term of HIGH_ALERT_DRUGS) {
        if (lower.includes(term))
            return true;
    }
    return false;
}
// ── eMAR safety audit table bootstrap ────────────────────────────────────────
// SCHEMA_NOT_MIGRATED is returned by the shared query adapter; schema is migration-owned.
export async function createMedicationOrder(input) {
    const ctx = nursingContext();
    await assertNursingPrescriber();
    const admission = await assertAdmission(input.admissionId, { active: true, patientId: input.patientId });
    const start = validTime(input.startDatetime || new Date());
    const end = input.endDatetime ? validTime(input.endDatetime) : new Date(new Date(start).getTime() + 7 * 86400000).toISOString();
    if (new Date(end) < new Date(start) || new Date(end) - new Date(start) > 31 * 86400000)
        throw clinicalError(422, 'INVALID_SCHEDULE', 'Medication schedules must span no more than 31 days');
    if (input.prn && !Number.isInteger(Number(input.prnMax24h)))
        throw clinicalError(422, 'INVALID_PRN_LIMIT', 'PRN daily limit must be an integer');
    if (input.prn) {
        boundedNumber(input.prnMinHours, 0.25, 168, 'PRN minimum hours');
        boundedNumber(input.prnMax24h, 1, 96, 'PRN maximum doses in 24 hours');
    }
    if (input.infusionRateMlHr != null)
        boundedNumber(input.infusionRateMlHr, 0.01, 5000, 'Infusion rate');
    const hours = input.prn ? null : boundedNumber(input.frequencyHours, 0.25, 168, 'Frequency hours');
    const [order] = await nursingQuery(`INSERT INTO medication_orders(organization_id,admission_id,patient_id,prescribed_by,drug_name,drug_code,dose,dose_unit,route,frequency,frequency_hours,start_datetime,end_datetime,prn,special_instructions,order_status,created_at,updated_at,prn_min_hours,prn_max_24h,infusion_rate_ml_hr)
    VALUES(:org,:admission,:patient,:actor,:drug,:code,:dose,:unit,:route,:frequency,:hours,:start,:end,:prn,:notes,'active',NOW(),NOW(),:prnMin,:prnMax,:infusionRate) RETURNING *`, { replacements: { org: ctx.organizationId, admission: admission.id, patient: admission.patient_id, actor: ctx.actorId, drug: requireText(input.drugName, 'Drug', 200), code: input.drugCode || null, dose: String(boundedNumber(input.dose, 0.000001, 1000000, 'Dose')), unit: requireText(input.doseUnit, 'Dose unit', 20), route: requireText(input.route, 'Route', 30), frequency: input.frequency || null, hours, start, end, prn: Boolean(input.prn), notes: input.specialInstructions || null, prnMin: input.prn ? Number(input.prnMinHours) : null, prnMax: input.prn ? Number(input.prnMax24h) : null, infusionRate: input.infusionRateMlHr ?? null }, type: QueryTypes.SELECT });
    if (!input.prn)
        await nursingQuery(`INSERT INTO medication_administrations(order_id,admission_id,scheduled_time,outcome,created_at) SELECT :id,:admission,t,NULL,NOW() FROM generate_series(:start::timestamptz,:end::timestamptz,:hours * INTERVAL '1 hour') t ON CONFLICT(order_id,scheduled_time) DO NOTHING`, { replacements: { id: order.id, admission: admission.id, start, end, hours }, type: QueryTypes.INSERT });
    await nursingAudit('medication.order.created', 'medication_order', order.id);
    return order;
}
// ── Allergy check (WP-0.8 interim hotfix; the full design is WP-1.1) ─────────────────────────────
// patient_allergies is keyed by users.id. In production, admissions and medication orders carry the user id
// as patient_id (verified against ip_admissions), so the order's patient_id is the lookup key.
// EMAR_ALLERGY_UNKNOWN_POLICY: 'require_ack' (default) blocks until the nurse acknowledges that no allergy
// status is recorded; 'warn' only records it — a rollout aid for the first week on a ward.
const allergyUnknownPolicy = () => (String(process.env.EMAR_ALLERGY_UNKNOWN_POLICY || 'require_ack').toLowerCase() === 'warn' ? 'warn' : 'require_ack');
const NON_DRUG_ALLERGEN_TYPES = new Set(['food', 'environmental', 'latex']); // never matched against a drug name
const ALLERGY_MATCH_NOTE = 'Allergies are checked against generic substances and approved drug-class definitions; unavailable clinical content requires supervised review.';
/**
 * Thin wrapper over allergy.service's getAllergyStatus (WP-1.1's single allergy read/write path) shaped for eMAR's
 * own return contract: an array of active allergies, or a thrown error for "could not be checked" (never "none").
 * Throws on any database error: callers must treat a failed lookup as "unknown", never as "no allergies".
 */
export async function lookupPatientAllergies(patientId, organizationId = null) {
    const { status, allergies } = await getAllergyStatus(patientId, organizationId);
    return { status, allergies };
}
const hasOverrideReason = (r) => typeof r === 'string' && r.trim().length >= 5;
async function evaluateAllergy({ order, drugName, overrideReason, allergyAcknowledged, blocks }) {
    const info = { status: 'unchecked', note: ALLERGY_MATCH_NOTE };
    let status, allergies;
    try {
        ({ status, allergies } = await lookupPatientAllergies(order.patient_id ?? order.adm_patient_id, order.organization_id));
    }
    catch (e) {
        console.error('[eMAR] allergy lookup failed:', e.message);
        info.status = 'lookup_failed';
        if (hasOverrideReason(overrideReason))
            info.overridden = true;
        else
            blocks.push('Allergy status could not be checked, so this administration is blocked. A supervising nurse may record an overrideReason to proceed.');
        return info;
    }
    if (status === 'no_known_allergy') {
        info.status = 'checked_no_match';
        return info;
    }
    if (status === 'unknown') {
        // No recorded status is unknown, not "no allergies" — the chart may simply never have been asked.
        info.status = 'unknown';
        info.acknowledged = Boolean(allergyAcknowledged);
        if (allergyUnknownPolicy() === 'require_ack' && !allergyAcknowledged) {
            blocks.push('No allergy status is recorded for this patient. Ask the patient or check the chart, then set allergyAcknowledged to proceed.');
        }
        return info;
    }
    const definitions = await nursingQuery("SELECT payload FROM clinical_knowledge_rules WHERE domain_key='drug_class_map' AND rule_type='drug_class' AND status='approved' AND payload IS NOT NULL", { type: QueryTypes.SELECT });
    const classes = definitions.map(r => r.payload).filter(p => p?.classKey && Array.isArray(p.members));
    const generics = resolveGenerics(drugName);
    const drug = { name: drugName, generics, classes: classesOfGenerics(generics, classes) };
    const matches = allergies.filter(a => !NON_DRUG_ALLERGEN_TYPES.has(a.allergen_type) && matchAllergy(a, drug, classes));
    if (matches.length === 0) {
        if (classes.length === 0 && allergies.some(a => !NON_DRUG_ALLERGEN_TYPES.has(a.allergen_type))) {
            info.status = 'class_data_unavailable';
            if (hasOverrideReason(overrideReason))
                info.overridden = true;
            else
                blocks.push('Allergy drug-class checks are unavailable. Record a supervised override or restore approved clinical content.');
        }
        else
            info.status = 'checked_no_match';
        return info;
    }
    info.status = 'matched';
    info.matches = matches.map((a) => a.allergen_name);
    if (hasOverrideReason(overrideReason)) {
        info.overridden = true;
    }
    else {
        for (const a of matches) {
            blocks.push(`Allergy alert: patient has documented allergy to '${a.allergen_name}' (${a.reaction_type || 'unknown reaction'}${a.severity && a.severity !== 'UNKNOWN' ? `, ${String(a.severity).toLowerCase()}` : ''}). Provide overrideReason to bypass.`);
        }
    }
    return info;
}
export async function validateAdministration(input) {
    const ctx = nursingContext();
    const admission = await assertAdmission(input.admissionId, { active: true, patientId: positiveId(input.patientId, 'Patient') });
    const [order] = await nursingQuery(`SELECT * FROM medication_orders WHERE id= :id AND admission_id= :admission AND organization_id= :org FOR SHARE`, { replacements: { id: positiveId(input.orderId, 'Order'), admission: admission.id, org: ctx.organizationId }, type: QueryTypes.SELECT });
    if (!order)
        throw clinicalError(404, 'ORDER_NOT_FOUND', 'Medication order not found');
    if(String(order.patient_id)!==String(admission.patient_id))throw clinicalError(409,'ORDER_IDENTITY_MISMATCH','The medication order needs prescriber reconciliation with this admission');
    const blocks = [];
    if (order.start_datetime && new Date(order.start_datetime) > new Date())
        blocks.push('The medication order has not started');
    if (order.end_datetime && new Date(order.end_datetime) < new Date())
        blocks.push('The medication order has expired');
    if (order.order_status !== 'active')
        blocks.push('The medication order is no longer active');
    const outcome = input.outcome || 'given';
    if (!['given', 'late', 'refused', 'held', 'not_given'].includes(outcome))
        throw clinicalError(422, 'INVALID_OUTCOME', 'Invalid administration outcome');
    if (!['given', 'late'].includes(outcome))
        requireText(input.notGivenReason, 'Reason for not administering', 2000);
    if (['given', 'late'].includes(outcome)) {
        const dose = boundedNumber(input.doseGiven, 0.000001, 1000000, 'Administered dose');
        if (dose !== Number(order.dose) || String(input.doseUnitGiven || '').toLowerCase() !== String(order.dose_unit || '').toLowerCase())
            blocks.push('Dose or unit mismatch: verify the authorized order');
        if (String(input.routeUsed || '').toLowerCase() !== String(order.route).toLowerCase())
            blocks.push('Route mismatch: verify the authorized order');
    }
    if (input.timingReason)
        requireText(input.timingReason, 'Timing exception reason', 2000);
    const when = validTime(input.administeredTime || new Date(), 'Administration time');
    if (new Date(when) > new Date(Date.now() + 300000))
        blocks.push('Administration time is in the future');
    if (input.scheduledTime && !order.prn && Math.abs(new Date(when) - new Date(validTime(input.scheduledTime))) > 120 * 60000 && !input.timingReason)
        blocks.push('Outside the administration window: document a timing exception');
    let allergy = null, witness = null;
    if (['given', 'late'].includes(outcome)) {
        allergy = await evaluateAllergy({ order, drugName: order.drug_name, overrideReason: input.overrideReason, allergyAcknowledged: input.allergyAcknowledged, blocks });
        const [settings] = await nursingQuery('SELECT barcode_required FROM nursing_facility_settings WHERE organization_id= :org', { replacements: { org: ctx.organizationId }, type: QueryTypes.SELECT });
        const scanPatient = String(input.scannedPatientId || '') === String(admission.patient_id);
        const scanDrug = Boolean(order.drug_code) && String(input.scannedDrugCode || '') === String(order.drug_code);
        if ((settings?.barcode_required !== false) && (!scanPatient || !scanDrug)) {
            if (!input.barcodeExceptionReason)
                blocks.push('Patient wristband and medication barcode verification are required');
            else
                requireText(input.barcodeExceptionReason, 'Barcode exception reason', 2000);
        }
        if (isHighAlert(order.drug_name) || input.overrideReason || input.barcodeExceptionReason) {
            try {
                witness = await verifyNursingProof(input.witnessToken, 'emar.cosign', input.scheduleId, admission.id);
                if (Number(witness.orderVersion) !== order.version)
                    blocks.push('The medication order changed after witness verification');
            }
            catch (e) {
                blocks.push(e.message);
            }
        }
    }
    return { blocked: blocks.length > 0, reasons: blocks, highAlert: isHighAlert(order.drug_name), allergy, order, admission, witness };
}
export async function recordAdministration(input) {
    requireIndividualNurse();
    const ctx = nursingContext();
    return withNursingReplay('emar.administer', input.idempotencyKey, input, async () => {
        await assertAdmission(input.admissionId, { active: true, patientId: input.patientId });
        const [slot] = await nursingQuery(`SELECT ma.*,mo.version AS order_version,mo.prn FROM medication_administrations ma JOIN medication_orders mo ON mo.id=ma.order_id WHERE ma.id= :slot AND ma.order_id= :order AND ma.admission_id= :admission AND mo.organization_id= :org FOR UPDATE OF ma,mo`, { replacements: { slot: positiveId(input.scheduleId, 'Dose slot'), order: positiveId(input.orderId), admission: positiveId(input.admissionId), org: ctx.organizationId }, type: QueryTypes.SELECT });
        if (!slot)
            throw clinicalError(404, 'SLOT_NOT_FOUND', 'Scheduled dose not found');
        if (slot.terminal_at || slot.administered_time)
            throw clinicalError(409, 'DOSE_ALREADY_RECORDED', 'This dose already has a recorded outcome');
        if (Number(input.version) !== slot.version || Number(input.orderVersion) !== slot.order_version)
            throw clinicalError(409, 'STALE_VERSION', 'The order or dose changed; refresh before proceeding');
        const validation = await validateAdministration({ ...input, scheduledTime: slot.scheduled_time });
        if (validation.blocked)
            throw Object.assign(clinicalError(403, 'ADMINISTRATION_BLOCKED', validation.reasons.join(' | ')), { blocked: true, reasons: validation.reasons });
        if (validation.highAlert && ['given', 'late'].includes(input.outcome || 'given')) {
            // Some deployed databases retain the platform's camelCase consent table. A generic
            // isGranted record is not signed hospital treatment consent; fail with CONSENT_REQUIRED
            // rather than treating that different schema as permission or a missing migration.
            const [consent] = await nursingQuery(`SELECT id FROM consents c
              WHERE COALESCE(to_jsonb(c)->>'patient_id',to_jsonb(c)->>'patientId')= :patient
              AND COALESCE(to_jsonb(c)->>'consent_type',to_jsonb(c)->>'consentType')='treatment'
              AND to_jsonb(c)->>'status'='signed'
              AND COALESCE(to_jsonb(c)->>'signed_at',to_jsonb(c)->>'patientSignedAt') IS NOT NULL
              AND (COALESCE(to_jsonb(c)->>'expires_at',to_jsonb(c)->>'expiresAt') IS NULL
                OR COALESCE(to_jsonb(c)->>'expires_at',to_jsonb(c)->>'expiresAt')::timestamptz>NOW())
              AND COALESCE(to_jsonb(c)->>'organization_id',to_jsonb(c)->>'tenant_id')= :org
              LIMIT 1`, { replacements: { patient: String(validation.admission.patient_id), org: String(ctx.organizationId) }, type: QueryTypes.SELECT });
            if (!consent)
                throw clinicalError(403, 'CONSENT_REQUIRED', 'A signed treatment consent for this hospital is required');
        }
        const outcome = input.outcome || 'given';
        const given = ['given', 'late'].includes(outcome);
        const proof = validation.witness;
        const [row] = await nursingQuery(`UPDATE medication_administrations SET administered_by= :actor,administered_time= :at,dose_given= :dose,dose_unit_given= :unit,route_used= :route,outcome= :outcome,not_given_reason= :reason,nurse_notes= :notes,barcode_verified= :barcode,cosign_by= :cosign,cosign_at= :cosignAt,override_reason= :override,validation_result= :validation::jsonb,verification_data= :proof::jsonb,terminal_at=NOW(),version=version+1 WHERE id= :id AND terminal_at IS NULL AND version= :version RETURNING *`, { replacements: { actor: ctx.actorId, at: given ? validTime(input.administeredTime || new Date()) : null, dose: given ? String(input.doseGiven) : null, unit: given ? input.doseUnitGiven : null, route: given ? input.routeUsed : null, outcome, reason: input.notGivenReason || null, notes: input.nurseNotes || null, barcode: given && String(input.scannedPatientId) === String(input.patientId) && Boolean(validation.order.drug_code) && input.scannedDrugCode === validation.order.drug_code, cosign: proof ? String(proof.actorId) : null, cosignAt: proof ? new Date() : null, override: input.overrideReason || null, validation: JSON.stringify({ allergy: validation.allergy, highAlert: validation.highAlert, timingReason: input.timingReason || null, barcodeExceptionReason: input.barcodeExceptionReason || null }), proof: JSON.stringify(proof ? { actorId: proof.actorId, jti: proof.jti } : {}), id: slot.id, version: slot.version }, type: QueryTypes.SELECT });
        if (!row)
            throw clinicalError(409, 'DOSE_CONFLICT', 'Another clinician recorded this dose');
        await enqueueFromAdministration({ organizationId: ctx.organizationId, admissionId: validation.admission.id, patientId: validation.admission.patient_id, medicationOrderId: validation.order.id, administrationId: row.id, drugName: validation.order.drug_name, dose: row.dose_given, doseUnit: row.dose_unit_given, route: row.route_used, outcome }, ctx.transaction);
        await nursingAudit('medication.outcome.recorded', 'medication_administration', row.id, { outcome });
        await nursingOutbox('medication.outcome.recorded', row.id, { admissionId: validation.admission.id, patientId: validation.admission.patient_id, outcome });
        return row;
    });
}
export async function getActiveOrders(admissionId, organizationId) {
    const ctx = nursingContext();
    await assertAdmission(admissionId);
    return nursingQuery(`SELECT * FROM medication_orders WHERE admission_id= :id AND organization_id= :org AND order_status='active' ORDER BY drug_name`, { replacements: { id: admissionId, org: ctx.organizationId }, type: QueryTypes.SELECT });
}
export async function getAdministrationHistory(admissionId) {
    const ctx = nursingContext();
    await assertAdmission(admissionId);
    return nursingQuery(`SELECT ma.*,mo.drug_name,mo.dose_unit,mo.order_status,mo.version AS order_version,mo.infusion_rate_ml_hr FROM medication_administrations ma JOIN medication_orders mo ON mo.id=ma.order_id WHERE mo.organization_id= :org AND ma.admission_id= :admission AND ma.terminal_at IS NOT NULL ORDER BY ma.terminal_at DESC`, { replacements: { org: ctx.organizationId, admission: admissionId }, type: QueryTypes.SELECT });
}
export async function getDueMedications(organizationId, { wardId, admissionId, windowMinutes = 120 } = {}) {
    const ctx = nursingContext();
    if (Number(organizationId) !== ctx.organizationId)
        throw clinicalError(403, 'TENANT_MISMATCH', 'Clinical tenant mismatch');
    if (admissionId)
        await assertAdmission(admissionId);
    const rows = await nursingQuery(`SELECT ma.id AS schedule_id,ma.version,ma.scheduled_time,mo.id AS order_id,mo.version AS order_version,mo.drug_name,mo.drug_code,mo.dose,mo.dose_unit,mo.route,mo.admission_id,mo.patient_id,b.ward_id,b.bed_number,w.name AS ward_name,
    COALESCE(to_jsonb(u)->>'firstName',to_jsonb(u)->>'first_name',to_jsonb(u)->>'name','Patient') AS patient_name, ma.scheduled_time<NOW() AS is_overdue
    FROM medication_administrations ma JOIN medication_orders mo ON mo.id=ma.order_id JOIN ip_admissions a ON a.id=ma.admission_id AND a.organization_id=mo.organization_id LEFT JOIN beds b ON b.id=a.bed_id LEFT JOIN wards w ON w.id=COALESCE(a.ward_id,b.ward_id) LEFT JOIN users u ON u.id=a.patient_id
    WHERE mo.organization_id= :org AND mo.order_status='active' AND a.status::text IN ('active','admitted','in_icu','in_ot') AND ma.terminal_at IS NULL AND ma.administered_time IS NULL AND ma.scheduled_time<=NOW()+ :minutes *INTERVAL '1 minute'
    AND (:ward::bigint IS NULL OR COALESCE(a.ward_id,b.ward_id)= :ward) AND (:admission::bigint IS NULL OR a.id= :admission)
    AND (:role !='nurse' OR EXISTS(SELECT 1 FROM nursing_assignments na WHERE na.organization_id= :org AND na.nurse_id= :actor AND na.ward_id=COALESCE(a.ward_id,b.ward_id) AND na.starts_at<=NOW() AND na.ends_at>NOW() AND na.revoked_at IS NULL)) ORDER BY ma.scheduled_time,ma.id`, { replacements: { org: ctx.organizationId, minutes: boundedNumber(windowMinutes, 1, 1440, 'Window minutes'), ward: wardId ? positiveId(wardId) : null, admission: admissionId ? positiveId(admissionId) : null, role: ctx.role, actor: ctx.actorId }, type: QueryTypes.SELECT });
    return rows.map(r => ({ ...r, scheduleId: r.schedule_id, orderId: r.order_id, orderVersion: r.order_version, admissionId: r.admission_id, patientId: r.patient_id, patientName: r.patient_name, drugName: r.drug_name, drugCode: r.drug_code, doseUnit: r.dose_unit, scheduledTime: r.scheduled_time, wardId: r.ward_id, ward: r.ward_name || '', status: r.is_overdue ? 'late' : 'due' }));
}
export async function updateOrderStatus(organizationId, orderId, status, reason) {
    const ctx = nursingContext();
    await assertNursingPrescriber();
    if (!['active', 'on_hold', 'discontinued', 'completed'].includes(status))
        throw clinicalError(422, 'INVALID_STATUS', 'Invalid order state');
    const [order] = await nursingQuery('SELECT * FROM medication_orders WHERE id= :id AND organization_id= :org FOR UPDATE', { replacements: { id: positiveId(orderId), org: ctx.organizationId }, type: QueryTypes.SELECT });
    if (!order)
        throw clinicalError(404, 'ORDER_NOT_FOUND', 'Order not found');
    await assertAdmission(order.admission_id, { active: true });
    const [row] = await nursingQuery('UPDATE medication_orders SET order_status= :status,stop_reason= :reason,version=version+1,updated_at=NOW() WHERE id= :id AND organization_id= :org RETURNING *', { replacements: { id: order.id, org: ctx.organizationId, status, reason: requireText(reason, 'Reason', 2000) }, type: QueryTypes.SELECT });
    await nursingAudit('medication.order.status', 'medication_order', order.id, { status });
    return row;
}
export async function preparePrnDose(orderId, input) {
    requireIndividualNurse();
    const ctx = nursingContext();
    return withNursingReplay('emar.prn', input.idempotencyKey, { orderId, input }, async () => {
        const [order] = await nursingQuery("SELECT * FROM medication_orders WHERE id= :id AND organization_id= :org AND prn=true AND order_status='active' FOR UPDATE", { replacements: { id: positiveId(orderId), org: ctx.organizationId }, type: QueryTypes.SELECT });
        if (!order)
            throw clinicalError(404, 'PRN_ORDER_NOT_FOUND', 'Active PRN order not found');
        await assertAdmission(order.admission_id, { active: true });
        if (!order.prn_min_hours || !order.prn_max_24h)
            throw clinicalError(409, 'PRN_POLICY_REQUIRED', 'The prescriber must define the minimum interval and daily limit');
        const [recent] = await nursingQuery(`SELECT COUNT(*) FILTER(WHERE terminal_at IS NOT NULL AND outcome IN ('given','late') AND administered_time>NOW()-INTERVAL '24 hours') AS given_24h,
        COUNT(*) FILTER(WHERE terminal_at IS NULL) AS pending,
        MAX(administered_time) FILTER(WHERE outcome IN ('given','late')) AS last_given FROM medication_administrations WHERE order_id= :id`, { replacements: { id: order.id }, type: QueryTypes.SELECT });
        if (Number(recent.pending) > 0 || Number(recent.given_24h) >= Number(order.prn_max_24h) || (recent.last_given && Date.now() - new Date(recent.last_given) < Number(order.prn_min_hours) * 3600000))
            throw clinicalError(409, 'PRN_LIMIT', 'A PRN dose is pending or the interval/daily limit has not been met');
        const [slot] = await nursingQuery('INSERT INTO medication_administrations(order_id,admission_id,scheduled_time,nurse_notes,outcome,created_at) VALUES(:order,:admission,NOW(),:reason,NULL,NOW()) RETURNING *', { replacements: { order: order.id, admission: order.admission_id, reason: requireText(input.indication, 'PRN indication', 2000) }, type: QueryTypes.SELECT });
        await nursingAudit('prn.dose.prepared', 'medication_administration', slot.id, { indication: input.indication });
        return slot;
    });
}
export async function recordInfusionEvent(input) {
    requireIndividualNurse();
    const ctx = nursingContext();
    return withNursingReplay('emar.infusion', input.idempotencyKey, input, async () => {
        const [order] = await nursingQuery('SELECT * FROM medication_orders WHERE id= :id AND organization_id= :org FOR UPDATE', { replacements: { id: positiveId(input.orderId), org: ctx.organizationId }, type: QueryTypes.SELECT });
        if (!order)
            throw clinicalError(404, 'ORDER_NOT_FOUND', 'Order not found');
        await assertAdmission(order.admission_id, { active: true });
        if (!['start', 'rate_change', 'stop'].includes(input.eventType))
            throw clinicalError(422, 'INVALID_INFUSION_EVENT', 'Select start, rate change or stop');
        if (!order.infusion_rate_ml_hr)
            throw clinicalError(409, 'INFUSION_ORDER_REQUIRED', 'The prescriber must authorize an infusion rate');
        if (Number(input.orderVersion) !== order.version)
            throw clinicalError(409, 'STALE_VERSION', 'The medication order changed; refresh first');
        if (input.eventType !== 'stop' && (order.order_status !== 'active' || Number(input.rateMlHr) !== Number(order.infusion_rate_ml_hr)))
            throw clinicalError(403, 'INFUSION_RATE_MISMATCH', 'Use the current prescriber-authorized infusion rate');
        const [dose] = await nursingQuery("SELECT id FROM medication_administrations WHERE id= :slot AND order_id= :order AND terminal_at IS NOT NULL AND outcome IN ('given','late')", { replacements: { slot: positiveId(input.scheduleId), order: order.id }, type: QueryTypes.SELECT });
        if (!dose)
            throw clinicalError(409, 'ADMINISTRATION_REQUIRED', 'Document this dose in eMAR before recording infusion events');
        const [previous] = await nursingQuery('SELECT * FROM nursing_infusion_events WHERE organization_id= :org AND administration_id= :slot ORDER BY id DESC LIMIT 1', { replacements: { org: ctx.organizationId, slot: dose.id }, type: QueryTypes.SELECT });
        if ((!previous && input.eventType !== 'start') || (previous && input.eventType === 'start') || previous?.event_type === 'stop')
            throw clinicalError(409, 'INFUSION_STATE_CONFLICT', 'The infusion state changed; refresh the chart');
        const witness = isHighAlert(order.drug_name) ? await verifyNursingProof(input.witnessToken, 'emar.cosign', dose.id, order.admission_id, `infusion.${input.eventType}`) : null;
        if (witness && Number(witness.orderVersion) !== order.version)
            throw clinicalError(409, 'STALE_VERIFICATION', 'The infusion order changed after verification');
        const [event] = await nursingQuery('INSERT INTO nursing_infusion_events(organization_id,admission_id,order_id,administration_id,event_type,rate_ml_hr,reason,recorded_by,witness_id) VALUES(:org,:admission,:order,:slot,:type,:rate,:reason,:actor,:witness) RETURNING *', { replacements: { org: ctx.organizationId, admission: order.admission_id, order: order.id, slot: dose.id, type: input.eventType, rate: input.eventType === 'stop' ? null : boundedNumber(input.rateMlHr, 0.01, 5000, 'Rate'), reason: requireText(input.reason, 'Infusion assessment/reason'), actor: ctx.actorId, witness: witness?.actorId || null }, type: QueryTypes.SELECT });
        await nursingAudit('infusion.event.recorded', 'nursing_infusion', event.id);
        return event;
    });
}
export async function listInfusionEvents(admissionId) {
    const ctx = nursingContext();
    await assertAdmission(admissionId);
    return nursingQuery('SELECT * FROM nursing_infusion_events WHERE organization_id= :org AND admission_id= :admission ORDER BY id', { replacements: { org: ctx.organizationId, admission: admissionId }, type: QueryTypes.SELECT });
}
export async function authorizeInfusionRate(orderId, input) {
    await assertNursingPrescriber();
    const ctx = nursingContext();
    const [order] = await nursingQuery('SELECT * FROM medication_orders WHERE id= :id AND organization_id= :org FOR UPDATE', { replacements: { id: positiveId(orderId), org: ctx.organizationId }, type: QueryTypes.SELECT });
    if (!order)
        throw clinicalError(404, 'ORDER_NOT_FOUND', 'Order not found');
    await assertAdmission(order.admission_id, { active: true });
    if (order.version !== Number(input.version))
        throw clinicalError(409, 'STALE_VERSION', 'The order changed');
    const [result] = await nursingQuery('UPDATE medication_orders SET infusion_rate_ml_hr= :rate,version=version+1,updated_at=NOW() WHERE id= :id RETURNING *', { replacements: { id: order.id, rate: boundedNumber(input.rateMlHr, 0.01, 5000, 'Authorized rate') }, type: QueryTypes.SELECT });
    await nursingAudit('infusion.rate.authorized', 'medication_order', order.id, { rate: result.infusion_rate_ml_hr, reason: requireText(input.reason, 'Reason') });
    return result;
}
