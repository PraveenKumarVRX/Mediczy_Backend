/** Migration-owned bedside chart. SCHEMA_NOT_MIGRATED fails closed in nursingQuery. */
import { QueryTypes } from 'sequelize';
import { requireIndividualNurse, nursingQuery, nursingContext, assertAdmission, boundedNumber, validTime, requireText, clinicalError, withNursingReplay, nursingAudit, nursingOutbox } from './nursing-context.service.js';
import { saveVitals } from './vitals-ews.service.js';
import { verifyNursingProof } from './nursing-verification.service.js';
const ranges = { bpSystolic: [20, 300], bpDiastolic: [10, 200], heartRate: [0, 300], spo2: [0, 100], respiratoryRate: [0, 100], temperature: [20, 45], gcsEye: [1, 4], gcsVerbal: [1, 5], gcsMotor: [1, 6], painScore: [0, 10], fallRiskScore: [0, 125], bradenScore: [6, 23], ioVolumeMl: [0, 100000] };
const fields = { bpSystolic: 'bp_systolic', bpDiastolic: 'bp_diastolic', heartRate: 'heart_rate', spo2: 'spo2', respiratoryRate: 'respiratory_rate', temperature: 'temperature', temperatureSite: 'temperature_site', gcsEye: 'gcs_eye', gcsVerbal: 'gcs_verbal', gcsMotor: 'gcs_motor', painScore: 'pain_score', painLocation: 'pain_location', ioType: 'io_type', ioDescription: 'io_description', ioVolumeMl: 'io_volume_ml', observationText: 'observation_text', fallRiskScore: 'fall_risk_score', bradenScore: 'braden_score', skinIntegrity: 'skin_integrity', pupilLeft: 'pupil_left', pupilRight: 'pupil_right' };
export async function recordEntry(input) {
    requireIndividualNurse();
    const ctx = nursingContext();
    return withNursingReplay('nursing.entry', input.idempotencyKey, input, async () => {
        const admission = await assertAdmission(input.admissionId, { active: true, patientId: input.patientId });
        if (input.amendsId) {
            const [original] = await nursingQuery('SELECT * FROM nursing_flowsheet_entries WHERE id= :id AND organization_id= :org AND admission_id= :admission FOR SHARE', { replacements: { id: input.amendsId, org: ctx.organizationId, admission: admission.id }, type: QueryTypes.SELECT });
            if (!original?.signed_at)
                throw clinicalError(409, 'SIGNED_ENTRY_REQUIRED', 'Amendments must reference a signed entry in this admission');
            requireText(input.amendmentReason, 'Amendment reason', 2000);
        }
        const entryType = input.entryType || 'vitals';
        if (!['vitals', 'io', 'observation', 'note', 'assessment', 'procedure'].includes(entryType))
            throw clinicalError(422, 'INVALID_ENTRY_TYPE', 'Invalid chart entry type');
        const values = Object.fromEntries(Object.keys(fields).map(k => [k, input[k] ?? null]));
        for (const [key, [min, max]] of Object.entries(ranges))
            if (values[key] != null)
                values[key] = boundedNumber(values[key], min, max, key);
        if (entryType === 'io') {
            if (!['intake', 'output'].includes(input.ioType))
                throw clinicalError(422, 'INVALID_IO_TYPE', 'Select intake or output');
            boundedNumber(input.ioVolumeMl, 0, 100000, 'Volume (mL)');
        }
        if (['note', 'observation'].includes(entryType))
            values.observationText = requireText(input.observationText, 'Observation');
        const at = validTime(input.recordedAt || new Date(), 'Observation time');
        if (new Date(at) > new Date(Date.now() + 300000))
            throw clinicalError(422, 'FUTURE_OBSERVATION', 'Observation time cannot be in the future');
        const [settings] = await nursingQuery('SELECT timezone FROM nursing_facility_settings WHERE organization_id= :org', { replacements: { org: ctx.organizationId }, type: QueryTypes.SELECT });
        const timezone = settings?.timezone || 'Asia/Kolkata';
        let vital = null;
        if (entryType === 'vitals')
            vital = await saveVitals({ organizationId: ctx.organizationId, admissionId: admission.id, patientId: admission.patient_id, recordedBy: ctx.actorId, recordedAt: at, temperature: values.temperature, pulse: values.heartRate, bpSystolic: values.bpSystolic, bpDiastolic: values.bpDiastolic, spo2: values.spo2, respiratoryRate: values.respiratoryRate, onOxygen: Boolean(input.onOxygen), consciousness: input.consciousness, notes: values.observationText });
        const columns = Object.values(fields).join(',');
        const parameters = Object.keys(fields).map(k => ':' + k).join(',');
        const [row] = await nursingQuery(`INSERT INTO nursing_flowsheet_entries(admission_id,organization_id,recorded_by,entry_type,recorded_at,clinical_day,status,amends_id,amendment_reason,vital_record_id,entry_data,${columns}) VALUES(:admission,:org,:actor,:type,:at,(:at::timestamptz AT TIME ZONE :timezone)::date,:status,:amends,:reason,:vital,:data::jsonb,${parameters}) RETURNING *`, { replacements: { ...values, admission: admission.id, org: ctx.organizationId, actor: ctx.actorId, type: entryType, at, timezone, status: entryType === 'note' ? 'draft' : 'recorded', amends: input.amendsId || null, reason: input.amendmentReason || null, vital: vital?.id || null, data: JSON.stringify({ onOxygen: Boolean(input.onOxygen), consciousness: input.consciousness || null, amendmentBaseId: input.amendmentBaseId || null, news2: vital ? { score: vital.news2_score, complete: vital.news2_complete, band: vital.news2_band, missing: vital.news2_missing } : null }) }, type: QueryTypes.SELECT });
        await nursingAudit(input.amendsId ? 'chart.amendment.created' : 'chart.entry.created', 'nursing_entry', row.id, { admissionId: admission.id, amendsId: input.amendsId || null });
        return row;
    });
}
export async function getFlowsheet(admissionId, { entryType, from, to, limit = 100 } = {}) {
    const ctx = nursingContext();
    await assertAdmission(admissionId);
    return nursingQuery(`SELECT * FROM nursing_flowsheet_entries WHERE organization_id= :org AND admission_id= :id AND (:type::text IS NULL OR entry_type= :type) AND (:from::timestamptz IS NULL OR recorded_at>= :from) AND (:to::timestamptz IS NULL OR recorded_at<= :to) ORDER BY recorded_at DESC,id DESC LIMIT :limit`, { replacements: { org: ctx.organizationId, id: admissionId, type: entryType || null, from: from ? validTime(from) : null, to: to ? validTime(to) : null, limit: Math.trunc(boundedNumber(limit, 1, 1000, 'Limit')) }, type: QueryTypes.SELECT });
}
export async function getLatestVitals(admissionId) { return (await getFlowsheet(admissionId, { entryType: 'vitals', limit: 1 }))[0] || null; }
export async function getVitalsTrend(admissionId, hours = 24) { return getFlowsheet(admissionId, { entryType: 'vitals', from: new Date(Date.now() - boundedNumber(hours, 1, 720, 'Hours') * 3600000).toISOString(), limit: 1000 }); }
export async function getIOSummary(admissionId, days = 3) {
    const ctx = nursingContext();
    await assertAdmission(admissionId);
    // Rebuild from events, choosing the latest signed amendment. No incremental totals can drift.
    return nursingQuery(`WITH effective AS (SELECT DISTINCT ON(COALESCE(amends_id,id)) * FROM nursing_flowsheet_entries WHERE organization_id= :org AND admission_id= :id AND entry_type='io' AND (amends_id IS NULL OR signed_at IS NOT NULL) ORDER BY COALESCE(amends_id,id),signed_at DESC NULLS LAST,created_at DESC,id DESC), totals AS (SELECT clinical_day AS summary_date,COALESCE(SUM(io_volume_ml) FILTER(WHERE io_type='intake'),0) AS total_intake_ml,COALESCE(SUM(io_volume_ml) FILTER(WHERE io_type='output'),0) AS total_output_ml FROM effective WHERE clinical_day >= (NOW() AT TIME ZONE COALESCE((SELECT timezone FROM nursing_facility_settings WHERE organization_id= :org),'Asia/Kolkata'))::date - :days::integer GROUP BY clinical_day) SELECT *,total_intake_ml-total_output_ml AS net_balance_ml FROM totals ORDER BY summary_date DESC`, { replacements: { org: ctx.organizationId, id: admissionId, days: Math.trunc(boundedNumber(days, 1, 365, 'Days')) }, type: QueryTypes.SELECT });
}
export async function updateNursingDraft(id, input) {
    requireIndividualNurse();
    const ctx = nursingContext();
    const [entry] = await nursingQuery('SELECT * FROM nursing_flowsheet_entries WHERE id= :id AND organization_id= :org FOR UPDATE', { replacements: { id, org: ctx.organizationId }, type: QueryTypes.SELECT });
    if (!entry)
        throw clinicalError(404, 'ENTRY_NOT_FOUND', 'Entry not found');
    await assertAdmission(entry.admission_id, { active: true });
    if (entry.signed_at || entry.status !== 'draft' || Number(entry.recorded_by) !== ctx.actorId)
        throw clinicalError(409, 'ENTRY_IMMUTABLE', 'Only your unsigned draft can be edited');
    if (Number(input.version) !== entry.version)
        throw clinicalError(409, 'STALE_VERSION', 'The draft changed; refresh before editing');
    const [row] = await nursingQuery('UPDATE nursing_flowsheet_entries SET observation_text= :text,version=version+1 WHERE id= :id RETURNING *', { replacements: { id, text: requireText(input.observationText, 'Note') }, type: QueryTypes.SELECT });
    await nursingAudit('chart.draft.updated', 'nursing_entry', id);
    return row;
}
export async function signNursingEntry(id, input) {
    requireIndividualNurse();
    const ctx = nursingContext();
    const [entry] = await nursingQuery('SELECT * FROM nursing_flowsheet_entries WHERE id= :id AND organization_id= :org FOR UPDATE', { replacements: { id, org: ctx.organizationId }, type: QueryTypes.SELECT });
    if (!entry)
        throw clinicalError(404, 'ENTRY_NOT_FOUND', 'Entry not found');
    await assertAdmission(entry.admission_id, { active: true });
    if (entry.signed_at || Number(entry.recorded_by) !== ctx.actorId || Number(input.version) !== entry.version)
        throw clinicalError(409, 'STALE_VERSION', 'Only your current unsigned entry may be signed');
    if (entry.amends_id) {
        await nursingQuery('SELECT id FROM nursing_flowsheet_entries WHERE id=:root AND organization_id=:org FOR UPDATE', { replacements: { root: entry.amends_id, org: ctx.organizationId }, type: QueryTypes.SELECT });
        const [latest] = await nursingQuery('SELECT id FROM nursing_flowsheet_entries WHERE organization_id=:org AND (id=:root OR amends_id=:root) AND signed_at IS NOT NULL ORDER BY signed_at DESC,id DESC LIMIT 1', { replacements: { org: ctx.organizationId, root: entry.amends_id }, type: QueryTypes.SELECT });
        if (Number(latest?.id) !== Number(entry.entry_data.amendmentBaseId))
            throw clinicalError(409, 'STALE_AMENDMENT', 'Another amendment was signed; review the latest record before correcting it');
    }
    await verifyNursingProof(input.verificationToken, 'note.sign', id, entry.admission_id);
    const [row] = await nursingQuery("UPDATE nursing_flowsheet_entries SET status='signed',signed_by= :actor,signed_at=NOW(),version=version+1 WHERE id= :id RETURNING *", { replacements: { actor: ctx.actorId, id }, type: QueryTypes.SELECT });
    await nursingAudit('chart.signed', 'nursing_entry', id);
    await nursingOutbox('nursing.entry.signed', id, { admissionId: entry.admission_id });
    return row;
}
export async function amendNursingEntry(id, input) {
    requireIndividualNurse();
    const ctx = nursingContext();
    const [entry] = await nursingQuery('SELECT * FROM nursing_flowsheet_entries WHERE id= :id AND organization_id= :org', { replacements: { id, org: ctx.organizationId }, type: QueryTypes.SELECT });
    if (!entry?.signed_at)
        throw clinicalError(409, 'SIGNED_ENTRY_REQUIRED', 'Only a signed entry can be amended');
    const [latest] = await nursingQuery('SELECT id FROM nursing_flowsheet_entries WHERE organization_id=:org AND (id=:root OR amends_id=:root) AND signed_at IS NOT NULL ORDER BY signed_at DESC,id DESC LIMIT 1', { replacements: { org: ctx.organizationId, root: entry.amends_id || entry.id }, type: QueryTypes.SELECT });
    if (Number(latest?.id) !== Number(entry.id))
        throw clinicalError(409, 'STALE_AMENDMENT', 'Amend the most recently signed record');
    const inherited = Object.fromEntries(Object.entries(fields).map(([key, col]) => [key, entry[col]]));
    // Amend the original root so projections do not count an amendment chain twice.
    return recordEntry({ ...inherited, ...input, admissionId: entry.admission_id, entryType: entry.entry_type, recordedAt: entry.recorded_at, amendsId: entry.amends_id || entry.id, amendmentBaseId: entry.id, amendmentReason: requireText(input.reason, 'Amendment reason', 2000) });
}
