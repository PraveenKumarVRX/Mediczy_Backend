import { QueryTypes } from 'sequelize';
import { nursingQuery, nursingContext, requireSupervisor, positiveId, clinicalError, assertAdmission, nursingAudit } from './nursing-context.service.js';
import { wardSnapshot } from './nursing-workflow.service.js';
export async function nursingDirectory() {
    requireSupervisor();
    const ctx = nursingContext();
    const nurses = await nursingQuery(`SELECT id,email,COALESCE(to_jsonb(n)->>'firstName','') AS name FROM nurses n WHERE tenant_id= :org ORDER BY id`, { replacements: { org: ctx.organizationId }, type: QueryTypes.SELECT });
    const wards = await nursingQuery('SELECT id,name FROM wards WHERE organization_id= :org ORDER BY name', { replacements: { org: ctx.organizationId }, type: QueryTypes.SELECT });
    return { nurses, wards };
}
export async function clinicalAlerts() {
    const ctx = nursingContext();
    return nursingQuery(`SELECT e.* FROM early_warning_alerts e JOIN ip_admissions a ON a.id=e.admission_id AND a.organization_id=e.organization_id WHERE e.organization_id= :org AND e.resolved=false AND (:role !='nurse' OR EXISTS(SELECT 1 FROM nursing_assignments na WHERE na.organization_id= :org AND na.nurse_id= :actor AND na.ward_id=a.ward_id AND na.starts_at<=NOW() AND na.ends_at>NOW() AND na.revoked_at IS NULL)) ORDER BY e.triggered_at DESC`, { replacements: { org: ctx.organizationId, actor: ctx.actorId, role: ctx.role }, type: QueryTypes.SELECT });
}
export async function acknowledgeNursingAlert(id) {
    const ctx = nursingContext();
    const [alert] = await nursingQuery('SELECT * FROM early_warning_alerts WHERE id= :id AND organization_id= :org FOR UPDATE', { replacements: { id: positiveId(id), org: ctx.organizationId }, type: QueryTypes.SELECT });
    if (!alert)
        throw clinicalError(404, 'ALERT_NOT_FOUND', 'Alert not found');
    await assertAdmission(alert.admission_id);
    const [row] = await nursingQuery('UPDATE early_warning_alerts SET acknowledged_by= :actor,acknowledged_at=NOW() WHERE id= :id RETURNING *', { replacements: { id: alert.id, actor: ctx.actorId }, type: QueryTypes.SELECT });
    await nursingAudit('clinical.alert.acknowledged', 'early_warning_alert', alert.id);
    return row;
}
export async function nursingMetrics() {
    requireSupervisor();
    const ctx = nursingContext();
    const [metrics] = await nursingQuery(`SELECT
    (SELECT COUNT(*) FROM nursing_outbox WHERE organization_id= :org AND processed_at IS NULL) AS pending_events,
    (SELECT COUNT(*) FROM nursing_outbox WHERE organization_id= :org AND last_error IS NOT NULL AND processed_at IS NULL) AS failed_events,
    (SELECT COUNT(*) FROM nursing_handovers WHERE organization_id= :org AND status='sent') AS unacknowledged_handovers,
    (SELECT COUNT(*) FROM early_warning_alerts WHERE organization_id= :org AND resolved=false AND acknowledged_at IS NULL) AS unacknowledged_alerts,
    (SELECT COUNT(*) FROM nursing_flowsheet_entries WHERE organization_id= :org AND status='draft') AS unsigned_drafts,
    (SELECT COUNT(*) FROM medication_administrations ma JOIN medication_orders mo ON mo.id=ma.order_id WHERE mo.organization_id= :org AND mo.order_status='active' AND ma.terminal_at IS NULL AND ma.scheduled_time<NOW()) AS overdue_doses`, { replacements: { org: ctx.organizationId }, type: QueryTypes.SELECT });
    return { ...metrics, asOf: new Date().toISOString() };
}
export async function dispatchNursingEvents() {
    requireSupervisor();
    const ctx = nursingContext();
    const rows = await nursingQuery('SELECT * FROM nursing_outbox WHERE organization_id= :org AND processed_at IS NULL ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 100', { replacements: { org: ctx.organizationId }, type: QueryTypes.SELECT });
    for (const event of rows) {
        // Inbox delivery is local, durable and idempotent. External transport can consume the same envelope later.
        if (event.event_type === 'nursing.handover.sent')
            await nursingQuery('INSERT INTO nursing_notifications(organization_id,event_id,nurse_id,title,body) VALUES(:org,:event,:nurse,:title,:body) ON CONFLICT(event_id,nurse_id) DO NOTHING', { replacements: { org: ctx.organizationId, event: event.id, nurse: positiveId(event.payload.receiverId), title: 'Shift handover ready', body: `Review and accept handover ${event.entity_id}` }, type: QueryTypes.INSERT });
        await nursingQuery('UPDATE nursing_outbox SET processed_at=NOW(),attempts=attempts+1,last_error=NULL WHERE id= :id', { replacements: { id: event.id }, type: QueryTypes.UPDATE });
    }
    return { processed: rows.length };
}
export async function nursingNotifications() {
    const ctx = nursingContext();
    return nursingQuery('SELECT * FROM nursing_notifications WHERE organization_id= :org AND nurse_id= :actor ORDER BY created_at DESC LIMIT 100', { replacements: { org: ctx.organizationId, actor: ctx.actorId }, type: QueryTypes.SELECT });
}
export async function markNursingNotification(id) {
    const ctx = nursingContext();
    const [row] = await nursingQuery('UPDATE nursing_notifications SET read_at=NOW() WHERE id= :id AND organization_id= :org AND nurse_id= :actor RETURNING *', { replacements: { id: positiveId(id), org: ctx.organizationId, actor: ctx.actorId }, type: QueryTypes.SELECT });
    if (!row)
        throw clinicalError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found');
    return row;
}
export async function nursingDowntimePack(wardId) {
    const data = await wardSnapshot(positiveId(wardId));
    await nursingAudit('downtime.pack.exported', 'ward', wardId, { patientCount: data.patientCount });
    return { ...data, mode: 'read_only', requiresReconciliation: true, instructions: 'This is a dated snapshot. Follow hospital downtime procedures and reconcile all administrations, orders, transfers and observations before resuming electronic documentation.' };
}
export async function linkClinicalStaff(input) {
    requireSupervisor();
    const ctx = nursingContext();
    if (!['doctor', 'hospital_doctor'].includes(input.role))
        throw clinicalError(422, 'INVALID_ROLE', 'Select a doctor identity');
    const [doctor] = await nursingQuery("SELECT id FROM doctors d WHERE id= :actor AND COALESCE((to_jsonb(d)->>'organization_id')::bigint,(to_jsonb(d)->>'hospital_id')::bigint)= :org", { replacements: { actor: positiveId(input.actorId), org: ctx.organizationId }, type: QueryTypes.SELECT });
    const [user] = await nursingQuery('SELECT id FROM users WHERE id= :user AND organization_id= :org', { replacements: { user: positiveId(input.userId), org: ctx.organizationId }, type: QueryTypes.SELECT });
    if (!doctor || !user)
        throw clinicalError(404, 'STAFF_IDENTITY_NOT_FOUND', 'Doctor and HR identity must belong to this hospital');
    const [row] = await nursingQuery('INSERT INTO nursing_staff_links(organization_id,actor_role,actor_id,user_id,linked_by) VALUES(:org,:role,:actor,:user,:by) ON CONFLICT(organization_id,actor_role,actor_id) DO UPDATE SET user_id=EXCLUDED.user_id,linked_by=EXCLUDED.linked_by,linked_at=NOW() RETURNING *', { replacements: { org: ctx.organizationId, role: input.role, actor: doctor.id, user: user.id, by: ctx.actorId }, type: QueryTypes.SELECT });
    await nursingAudit('staff.identity.linked', 'clinical_actor', doctor.id, { role: input.role, userId: user.id });
    return row;
}
