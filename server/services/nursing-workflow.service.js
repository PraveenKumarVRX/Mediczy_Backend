import { randomUUID } from 'node:crypto';
import { QueryTypes } from 'sequelize';
import { requireIndividualNurse, nursingQuery, nursingContext, assertAdmission, requireSupervisor, positiveId, requireText, validTime, boundedNumber, clinicalError, nursingAudit, nursingOutbox, withNursingReplay } from './nursing-context.service.js';
import { createNursingTask } from './nursing-ipd.service.js';
export async function listNursingPatients({ wardId } = {}) {
    const ctx = nursingContext();
    return nursingQuery(`SELECT a.*,COALESCE(a.ward_id,b.ward_id) AS ward_id,b.bed_number,w.name AS ward_name,
    COALESCE(to_jsonb(u)->>'firstName',to_jsonb(u)->>'first_name',to_jsonb(u)->>'name','Patient') AS patient_name,
    COALESCE(to_jsonb(u)->>'lastName',to_jsonb(u)->>'last_name','') AS patient_last_name
    FROM ip_admissions a LEFT JOIN beds b ON b.id=a.bed_id LEFT JOIN wards w ON w.id=COALESCE(a.ward_id,b.ward_id) LEFT JOIN users u ON u.id=a.patient_id
    WHERE a.organization_id= :org AND a.status::text IN ('active','admitted','in_ot','in_icu') AND (:ward::bigint IS NULL OR COALESCE(a.ward_id,b.ward_id)= :ward)
    AND (:role !='nurse' OR EXISTS(SELECT 1 FROM nursing_assignments na WHERE na.organization_id= :org AND na.nurse_id= :actor AND na.ward_id=COALESCE(a.ward_id,b.ward_id) AND na.starts_at<=NOW() AND na.ends_at>NOW() AND na.revoked_at IS NULL)) ORDER BY w.name,b.bed_number,a.id`, { replacements: { org: ctx.organizationId, ward: wardId ? positiveId(wardId) : null, role: ctx.role, actor: ctx.actorId }, type: QueryTypes.SELECT });
}
export async function getNursingAssignments() {
    const ctx = nursingContext();
    return nursingQuery(`SELECT na.*,w.name AS ward_name FROM nursing_assignments na JOIN wards w ON w.id=na.ward_id WHERE na.organization_id= :org AND (:role !='nurse' OR na.nurse_id= :actor) ORDER BY na.starts_at DESC`, { replacements: { org: ctx.organizationId, role: ctx.role, actor: ctx.actorId }, type: QueryTypes.SELECT });
}
export async function createNursingAssignment(input) {
    requireSupervisor();
    const ctx = nursingContext();
    const [nurse] = await nursingQuery("SELECT id,to_jsonb(n)->'metadata' AS metadata FROM nurses n WHERE id= :nurse AND tenant_id= :org", { replacements: { nurse: positiveId(input.nurseId), org: ctx.organizationId }, type: QueryTypes.SELECT });
    const [ward] = await nursingQuery('SELECT id,name FROM wards WHERE id= :ward AND organization_id= :org', { replacements: { ward: positiveId(input.wardId), org: ctx.organizationId }, type: QueryTypes.SELECT });
    if (!nurse || !ward)
        throw clinicalError(404, 'ASSIGNMENT_TARGET_NOT_FOUND', 'Nurse or ward not found in this hospital');
    if (nurse.metadata?.nursing_simulation_only === true && ward.name !== 'Nursing Simulation Ward')
        throw clinicalError(403, 'SIMULATION_ONLY_ACCOUNT', 'Demo nurses may be assigned only to the dedicated simulation ward');
    const start = validTime(input.startsAt), end = validTime(input.endsAt);
    if (new Date(end) <= new Date(start) || new Date(end) - new Date(start) > 86400000)
        throw clinicalError(422, 'INVALID_SHIFT', 'A shift must be greater than zero and no more than 24 hours');
    const [row] = await nursingQuery('INSERT INTO nursing_assignments(organization_id,nurse_id,ward_id,shift_name,starts_at,ends_at,assigned_by) VALUES(:org,:nurse,:ward,:shift,:start,:end,:actor) RETURNING *', { replacements: { org: ctx.organizationId, nurse: nurse.id, ward: ward.id, shift: requireText(input.shiftName, 'Shift', 80), start, end, actor: ctx.actorId }, type: QueryTypes.SELECT });
    await nursingAudit('assignment.created', 'nursing_assignment', row.id);
    return row;
}
export async function revokeNursingAssignment(id) {
    requireSupervisor();
    const ctx = nursingContext();
    const [row] = await nursingQuery('UPDATE nursing_assignments SET revoked_at=NOW() WHERE id= :id AND organization_id= :org AND revoked_at IS NULL RETURNING *', { replacements: { id: positiveId(id), org: ctx.organizationId }, type: QueryTypes.SELECT });
    if (!row)
        throw clinicalError(404, 'ASSIGNMENT_NOT_FOUND', 'Assignment not found');
    await nursingAudit('assignment.revoked', 'nursing_assignment', id);
    return row;
}
export async function facilitySettings(input) {
    const ctx = nursingContext();
    if (input) {
        requireSupervisor();
        requireText(input.timezone, 'Facility timezone', 80);
        try {
            new Intl.DateTimeFormat('en', { timeZone: input.timezone });
        }
        catch {
            throw clinicalError(422, 'INVALID_TIMEZONE', 'Select a valid facility timezone');
        }
        if (typeof input.barcodeRequired !== 'boolean')
            throw clinicalError(422, 'INVALID_POLICY', 'Barcode requirement must be a boolean');
        await nursingQuery('INSERT INTO nursing_facility_settings(organization_id,timezone,barcode_required,ai_enabled) VALUES(:org,:tz,:barcode,:ai) ON CONFLICT(organization_id) DO UPDATE SET timezone= :tz,barcode_required= :barcode,ai_enabled= :ai,updated_at=NOW()', { replacements: { org: ctx.organizationId, tz: input.timezone, barcode: input.barcodeRequired, ai: input.aiEnabled === true }, type: QueryTypes.INSERT });
        await nursingAudit('facility.nursing.policy', 'facility', ctx.organizationId, input);
    }
    return (await nursingQuery('SELECT * FROM nursing_facility_settings WHERE organization_id= :org', { replacements: { org: ctx.organizationId }, type: QueryTypes.SELECT }))[0] || { organization_id: ctx.organizationId, timezone: 'Asia/Kolkata', barcode_required: true };
}
export async function listCareGoals(admissionId) {
    const ctx = nursingContext();
    await assertAdmission(admissionId);
    return nursingQuery(`SELECT g.*,COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.created_at) FROM nursing_goal_evaluations e WHERE e.goal_id=g.id AND e.organization_id=g.organization_id),'[]') AS evaluations FROM nursing_care_goals g WHERE g.organization_id= :org AND g.admission_id= :admission ORDER BY g.created_at`, { replacements: { org: ctx.organizationId, admission: admissionId }, type: QueryTypes.SELECT });
}
export async function createCareGoal(input) {
    requireIndividualNurse();
    const ctx = nursingContext();
    const admission = await assertAdmission(input.admissionId, { active: true });
    return withNursingReplay('nursing.goal', input.idempotencyKey, input, async () => {
        if (input.carePlanId) {
            const [plan] = await nursingQuery('SELECT id FROM care_plans WHERE id= :id AND "patientId"= :patient', { replacements: { id: positiveId(input.carePlanId), patient: admission.patient_id }, type: QueryTypes.SELECT });
            if (!plan)
                throw clinicalError(404, 'CARE_PLAN_NOT_FOUND', 'Care plan not found for this patient');
        }
        const [row] = await nursingQuery('INSERT INTO nursing_care_goals(organization_id,admission_id,care_plan_id,problem,goal,intervention,due_at,created_by) VALUES(:org,:admission,:plan,:problem,:goal,:intervention,:due,:actor) RETURNING *', { replacements: { org: ctx.organizationId, admission: admission.id, plan: input.carePlanId || null, problem: requireText(input.problem, 'Nursing problem', 2000), goal: requireText(input.goal, 'Goal', 2000), intervention: requireText(input.intervention, 'Intervention', 2000), due: input.dueAt ? validTime(input.dueAt) : null, actor: ctx.actorId }, type: QueryTypes.SELECT });
        await createNursingTask({ admissionId: admission.id, taskType: 'care_plan', title: row.intervention, dueAt: row.due_at, templateKey: `goal:${row.id}` });
        await nursingAudit('care.goal.created', 'nursing_goal', row.id);
        return row;
    });
}
export async function evaluateCareGoal(id, input) {
    requireIndividualNurse();
    const ctx = nursingContext();
    const [goal] = await nursingQuery('SELECT * FROM nursing_care_goals WHERE id= :id AND organization_id= :org FOR UPDATE', { replacements: { id: positiveId(id), org: ctx.organizationId }, type: QueryTypes.SELECT });
    if (!goal)
        throw clinicalError(404, 'GOAL_NOT_FOUND', 'Goal not found');
    await assertAdmission(goal.admission_id, { active: true });
    if (goal.version !== Number(input.version))
        throw clinicalError(409, 'STALE_VERSION', 'The goal changed; refresh first');
    if (!['active', 'met', 'unmet', 'cancelled'].includes(input.status))
        throw clinicalError(422, 'INVALID_STATUS', 'Invalid evaluation status');
    await nursingQuery('INSERT INTO nursing_goal_evaluations(organization_id,goal_id,status,note,evaluated_by) VALUES(:org,:id,:status,:note,:actor)', { replacements: { org: ctx.organizationId, id: goal.id, status: input.status, note: requireText(input.note, 'Evaluation'), actor: ctx.actorId }, type: QueryTypes.INSERT });
    const [row] = await nursingQuery('UPDATE nursing_care_goals SET status= :status,version=version+1 WHERE id= :id RETURNING *', { replacements: { id: goal.id, status: input.status }, type: QueryTypes.SELECT });
    await nursingAudit('care.goal.evaluated', 'nursing_goal', goal.id);
    return row;
}
export async function listWounds(admissionId) {
    const ctx = nursingContext();
    await assertAdmission(admissionId);
    return nursingQuery('SELECT * FROM wound_tracking_records WHERE tenant_id= :org AND admission_id= :admission ORDER BY created_at,id', { replacements: { org: ctx.organizationId, admission: admissionId }, type: QueryTypes.SELECT });
}
export async function recordWound(input) {
    requireIndividualNurse();
    const ctx = nursingContext();
    const admission = await assertAdmission(input.admissionId, { active: true });
    return withNursingReplay('nursing.wound', input.idempotencyKey, input, async () => {
        if (input.reviewed !== true)
            throw clinicalError(422, 'HUMAN_REVIEW_REQUIRED', 'A nurse must review wound measurements and staging before recording');
        let episode = input.episodeId || randomUUID();
        if (input.episodeId) {
            const [existing] = await nursingQuery('SELECT id FROM wound_tracking_records WHERE episode_id= :episode AND tenant_id= :org AND admission_id= :admission', { replacements: { episode, org: ctx.organizationId, admission: admission.id }, type: QueryTypes.SELECT });
            if (!existing)
                throw clinicalError(404, 'WOUND_EPISODE_NOT_FOUND', 'Wound episode not found');
        }
        if (input.imageRef && (!/^nursing\/[A-Za-z0-9/_\.:-]+$/.test(input.imageRef) || input.imageRef.includes('..')))
            throw clinicalError(422, 'INVALID_IMAGE_REFERENCE', 'Use an authenticated nursing image upload reference');
        if (input.imageRef) {
            const [image] = await nursingQuery('SELECT id FROM nursing_images WHERE organization_id= :org AND admission_id= :admission AND object_key= :key', { replacements: { org: ctx.organizationId, admission: admission.id, key: input.imageRef }, type: QueryTypes.SELECT });
            if (!image)
                throw clinicalError(404, 'IMAGE_NOT_FOUND', 'Image does not belong to this admission');
        }
        const measurements = { lengthCm: boundedNumber(input.lengthCm, 0, 100, 'Length (cm)'), widthCm: boundedNumber(input.widthCm, 0, 100, 'Width (cm)'), depthCm: boundedNumber(input.depthCm || 0, 0, 100, 'Depth (cm)') };
        const [row] = await nursingQuery('INSERT INTO wound_tracking_records(tenant_id,patient_id,admission_id,episode_id,wound_type,body_site,stage,area_cm2,note,image_ref,measurements,reviewed_by,reviewed_at) VALUES(:org,:patient,:admission,:episode,:type,:site,:stage,:area,:note,:image,:measurements::jsonb,:actor,NOW()) RETURNING *', { replacements: { org: ctx.organizationId, patient: admission.patient_id, admission: admission.id, episode, type: requireText(input.woundType, 'Wound type', 80), site: requireText(input.bodySite, 'Body site', 200), stage: input.stage || null, area: measurements.lengthCm * measurements.widthCm, note: requireText(input.note, 'Wound assessment'), image: input.imageRef || null, measurements: JSON.stringify(measurements), actor: ctx.actorId }, type: QueryTypes.SELECT });
        await nursingAudit('wound.reviewed', 'wound_record', row.id);
        return row;
    });
}
export async function listInterventions(admissionId) {
    const ctx = nursingContext();
    await assertAdmission(admissionId);
    return nursingQuery('SELECT * FROM nursing_interventions WHERE organization_id= :org AND admission_id= :admission ORDER BY performed_at DESC', { replacements: { org: ctx.organizationId, admission: admissionId }, type: QueryTypes.SELECT });
}
export async function recordIntervention(input) {
    requireIndividualNurse();
    const ctx = nursingContext();
    const admission = await assertAdmission(input.admissionId, { active: true });
    return withNursingReplay('nursing.intervention', input.idempotencyKey, input, async () => {
        if (input.woundRecordId) {
            const [wound] = await nursingQuery('SELECT id FROM wound_tracking_records WHERE id= :id AND tenant_id= :org AND admission_id= :admission', { replacements: { id: input.woundRecordId, org: ctx.organizationId, admission: admission.id }, type: QueryTypes.SELECT });
            if (!wound)
                throw clinicalError(404, 'WOUND_NOT_FOUND', 'Wound not found');
        }
        const [row] = await nursingQuery('INSERT INTO nursing_interventions(organization_id,admission_id,wound_record_id,procedure_type,details,performed_by,performed_at,reassess_at) VALUES(:org,:admission,:wound,:type,:details::jsonb,:actor,:at,:reassess) RETURNING *', { replacements: { org: ctx.organizationId, admission: admission.id, wound: input.woundRecordId || null, type: requireText(input.procedureType, 'Procedure', 200), details: JSON.stringify({ note: requireText(input.note, 'Procedure details'), device: input.device || null }), actor: ctx.actorId, at: validTime(input.performedAt || new Date()), reassess: input.reassessAt ? validTime(input.reassessAt) : null }, type: QueryTypes.SELECT });
        if (input.reassessAt)
            await createNursingTask({ admissionId: admission.id, taskType: 'assessment', title: `Reassess ${row.procedure_type}`, dueAt: row.reassess_at, templateKey: `intervention:${row.id}` });
        await nursingAudit('procedure.recorded', 'nursing_intervention', row.id);
        return row;
    });
}
export async function wardSnapshot(wardId) {
    const ctx = nursingContext();
    const [ward] = await nursingQuery('SELECT id FROM wards WHERE id= :ward AND organization_id= :org', { replacements: { ward: positiveId(wardId), org: ctx.organizationId }, type: QueryTypes.SELECT });
    if (!ward)
        throw clinicalError(404, 'WARD_NOT_FOUND', 'Ward not found');
    const patients = await listNursingPatients({ wardId });
    if (ctx.role === 'nurse') {
        const [assigned] = await nursingQuery('SELECT id FROM nursing_assignments WHERE organization_id= :org AND ward_id= :ward AND nurse_id= :actor AND starts_at<=NOW() AND ends_at>NOW() AND revoked_at IS NULL', { replacements: { org: ctx.organizationId, ward: positiveId(wardId), actor: ctx.actorId }, type: QueryTypes.SELECT });
        if (!assigned)
            throw clinicalError(403, 'WARD_ASSIGNMENT_REQUIRED', 'An active ward assignment is required');
    }
    const snapshot = [];
    for (const patient of patients) {
        const replacements = { org: ctx.organizationId, admission: patient.id };
        const pending = await nursingQuery("SELECT id,title,due_at,priority FROM nursing_tasks WHERE organization_id= :org AND admission_id= :admission AND status IN ('pending','in_progress') ORDER BY due_at NULLS LAST", { replacements, type: QueryTypes.SELECT });
        const medications = await nursingQuery("SELECT ma.id,mo.drug_name,ma.scheduled_time FROM medication_administrations ma JOIN medication_orders mo ON mo.id=ma.order_id WHERE mo.organization_id= :org AND ma.admission_id= :admission AND mo.order_status='active' AND ma.terminal_at IS NULL AND ma.scheduled_time<=NOW()+INTERVAL '12 hours' ORDER BY ma.scheduled_time", { replacements, type: QueryTypes.SELECT });
        const vitals = (await nursingQuery('SELECT * FROM vital_records WHERE organization_id= :org AND admission_id= :admission ORDER BY recorded_at DESC LIMIT 1', { replacements, type: QueryTypes.SELECT }))[0] || null;
        snapshot.push({ ...patient, pending, medications, vitals });
    }
    return { wardId: Number(wardId), patientCount: snapshot.length, patients: snapshot, generatedAt: new Date().toISOString(), coverage: 'complete', reviewRequired: true };
}
export async function listHandovers(wardId) {
    const ctx = nursingContext();
    await wardSnapshot(wardId);
    return nursingQuery('SELECT * FROM nursing_handovers WHERE organization_id= :org AND ward_id= :ward ORDER BY created_at DESC LIMIT 100', { replacements: { org: ctx.organizationId, ward: wardId }, type: QueryTypes.SELECT });
}
export async function createHandover(input) {
    requireIndividualNurse();
    const ctx = nursingContext();
    return withNursingReplay('nursing.handover', input.idempotencyKey, input, async () => {
        const snapshot = await wardSnapshot(positiveId(input.wardId));
        const [row] = await nursingQuery('INSERT INTO nursing_handovers(organization_id,ward_id,shift_name,created_by,receiver_id,snapshot,sbar) VALUES(:org,:ward,:shift,:actor,:receiver,:snapshot::jsonb,:sbar::jsonb) RETURNING *', { replacements: { org: ctx.organizationId, ward: input.wardId, shift: requireText(input.shiftName, 'Shift', 80), actor: ctx.actorId, receiver: input.receiverId ? positiveId(input.receiverId) : null, snapshot: JSON.stringify(snapshot), sbar: JSON.stringify(input.sbar || {}) }, type: QueryTypes.SELECT });
        await nursingAudit('handover.created', 'nursing_handover', row.id);
        return row;
    });
}
export async function transitionHandover(id, input, action) {
    requireIndividualNurse();
    const ctx = nursingContext();
    const [row] = await nursingQuery('SELECT * FROM nursing_handovers WHERE id= :id AND organization_id= :org FOR UPDATE', { replacements: { id: positiveId(id), org: ctx.organizationId }, type: QueryTypes.SELECT });
    if (!row)
        throw clinicalError(404, 'HANDOVER_NOT_FOUND', 'Handover not found');
    const current = await wardSnapshot(row.ward_id);
    if (Number(input.version) !== row.version)
        throw clinicalError(409, 'STALE_VERSION', 'The handover changed; refresh first');
    if (action === 'send') {
        if (row.status !== 'draft' || Number(row.created_by) !== ctx.actorId)
            throw clinicalError(403, 'HANDOVER_AUTHOR_REQUIRED', 'Only the outgoing author may send a draft');
        const sbar = input.sbar || row.sbar;
        for (const p of current.patients)
            for (const key of ['situation', 'background', 'assessment', 'recommendation'])
                requireText(sbar[p.id]?.[key], `Admission ${p.id} ${key}`, 10000);
        if (!input.receiverId || Number(input.receiverId) === ctx.actorId)
            throw clinicalError(422, 'RECEIVER_REQUIRED', 'Select a different incoming nurse');
        const [receiver] = await nursingQuery('SELECT n.id FROM nurses n JOIN nursing_assignments na ON na.nurse_id=n.id AND na.organization_id=n.tenant_id WHERE n.id= :id AND n.tenant_id= :org AND na.ward_id= :ward AND na.revoked_at IS NULL AND na.starts_at<=NOW()+INTERVAL \'12 hours\' AND na.ends_at>NOW()', { replacements: { id: input.receiverId, org: ctx.organizationId, ward: row.ward_id }, type: QueryTypes.SELECT });
        if (!receiver)
            throw clinicalError(403, 'RECEIVER_ASSIGNMENT_REQUIRED', 'The incoming nurse needs a ward assignment');
        const [sent] = await nursingQuery("UPDATE nursing_handovers SET status='sent',receiver_id= :receiver,snapshot= :snapshot::jsonb,sbar= :sbar::jsonb,sent_at=NOW(),version=version+1 WHERE id= :id RETURNING *", { replacements: { id: row.id, receiver: input.receiverId, snapshot: JSON.stringify(current), sbar: JSON.stringify(sbar) }, type: QueryTypes.SELECT });
        await nursingAudit('handover.sent', 'nursing_handover', row.id);
        const event = await nursingOutbox('nursing.handover.sent', row.id, { receiverId: input.receiverId });
        await nursingQuery('INSERT INTO nursing_notifications(organization_id,event_id,nurse_id,title,body) VALUES(:org,:event,:nurse,:title,:body) ON CONFLICT(event_id,nurse_id) DO NOTHING', { replacements: { org: ctx.organizationId, event: event.id, nurse: input.receiverId, title: 'Shift handover ready', body: `Review and accept handover ${row.id}` }, type: QueryTypes.INSERT });
        return sent;
    }
    if (action !== 'accept' || row.status !== 'sent' || Number(row.receiver_id) !== ctx.actorId)
        throw clinicalError(403, 'HANDOVER_RECEIVER_REQUIRED', 'Only the assigned incoming nurse may accept');
    const before = row.snapshot.patients.map(p => Number(p.id)).sort().join(',');
    const after = current.patients.map(p => Number(p.id)).sort().join(',');
    if (before !== after)
        throw clinicalError(409, 'CENSUS_CHANGED', 'The ward census changed; the outgoing nurse must prepare a new handover');
    const [accepted] = await nursingQuery("UPDATE nursing_handovers SET status='accepted',accepted_at=NOW(),version=version+1 WHERE id= :id RETURNING *", { replacements: { id: row.id }, type: QueryTypes.SELECT });
    await nursingAudit('handover.accepted', 'nursing_handover', row.id);
    return accepted;
}
