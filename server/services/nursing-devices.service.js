/** Signed device observations are queued for nurse review; devices never sign or finalize charts. */
import { createPublicKey, verify, randomUUID } from 'node:crypto';
import { QueryTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { nursingQuery, nursingContext, withNursingContext, assertAdmission, requireSupervisor, positiveId, validTime, requireText, clinicalError, payloadHash, withNursingReplay, nursingAudit } from './nursing-context.service.js';
import { recordEntry } from './nursing-echart.service.js';
export async function registerNursingDevice(input) {
    requireSupervisor();
    const ctx = nursingContext();
    await assertAdmission(input.admissionId, { active: true });
    let key;
    try {
        key = createPublicKey(input.publicKey);
    }
    catch {
        throw clinicalError(422, 'INVALID_DEVICE_KEY', 'Supply an Ed25519 public key');
    }
    if (key.asymmetricKeyType !== 'ed25519')
        throw clinicalError(422, 'INVALID_DEVICE_KEY', 'Only Ed25519 keys are supported');
    const [row]=await nursingQuery('INSERT INTO nursing_devices(id,organization_id,public_key,registered_by) VALUES(:id,:org,:key,:actor) RETURNING id,revoked_at',{replacements:{id:randomUUID(),org:ctx.organizationId,key:key.export({type:'spki',format:'pem'}).toString(),actor:ctx.actorId},type:QueryTypes.SELECT});
    const label=requireText(input.label,'Device label',100);
    await nursingQuery('INSERT INTO nursing_device_bindings(device_id,organization_id,admission_id,label) VALUES(:id,:org,:admission,:label)',{replacements:{id:row.id,org:ctx.organizationId,admission:positiveId(input.admissionId),label},type:QueryTypes.INSERT});
    await nursingAudit('device.registered', 'nursing_device', row.id);
    return row;
}
export async function revokeNursingDevice(id) {
    requireSupervisor();
    const ctx = nursingContext();
    const [row] = await nursingQuery('UPDATE nursing_devices SET revoked_at=NOW() WHERE id= :id AND organization_id= :org RETURNING id,revoked_at', { replacements: { id, org: ctx.organizationId }, type: QueryTypes.SELECT });
    if (!row)
        throw clinicalError(404, 'DEVICE_NOT_FOUND', 'Device not found');
    await nursingAudit('device.revoked', 'nursing_device', id);
    return row;
}
export async function ingestNursingObservation(body, signature) {
    if (!body || JSON.stringify(body).length > 10000 || !signature)
        throw clinicalError(422, 'INVALID_DEVICE_OBSERVATION', 'A signed observation up to 10 KB is required');
    const when = validTime(body.sentAt, 'Device message time');
    if (Math.abs(Date.now() - new Date(when)) > 300000)
        throw clinicalError(403, 'DEVICE_MESSAGE_EXPIRED', 'Device message timestamp is outside the allowed window');
    // Registry contains public keys and routing only; no private credential or clinical payload is exposed.
    const [device] = await sequelize.query('SELECT id,organization_id,public_key FROM nursing_devices WHERE id= :id AND revoked_at IS NULL', { replacements: { id: body.deviceId }, type: QueryTypes.SELECT });
    if (!device)
        throw clinicalError(403, 'DEVICE_AUTH_FAILED', 'Device authentication failed');
    let valid = false;
    try {
        valid = verify(null, Buffer.from(payloadHash(body), 'utf8'), device.public_key, Buffer.from(signature, 'base64'));
    }
    catch { }
    if (!valid)
        throw clinicalError(403, 'DEVICE_AUTH_FAILED', 'Device authentication failed');
    return withNursingContext({ organizationId: Number(device.organization_id), actorId: 0, role: 'device' }, async () => {
        const [binding]=await nursingQuery('SELECT admission_id FROM nursing_device_bindings WHERE organization_id=:org AND device_id=:id',{replacements:{org:device.organization_id,id:device.id},type:QueryTypes.SELECT});
        if(!binding)throw clinicalError(403,'DEVICE_BINDING_REQUIRED','Device binding is unavailable');
        await assertAdmission(binding.admission_id, { active: true });
        return withNursingReplay('nursing.device', body.observationKey, { deviceId: body.deviceId, observedAt: body.observedAt, values: body.values }, async () => {
            const [row] = await nursingQuery('INSERT INTO nursing_device_observations(organization_id,admission_id,device_id,observed_at,payload) VALUES(:org,:admission,:device,:at,:payload::jsonb) RETURNING id,status,observed_at', { replacements: { org: device.organization_id, admission: binding.admission_id, device: device.id, at: validTime(body.observedAt, 'Observation time'), payload: JSON.stringify(body.values || {}) }, type: QueryTypes.SELECT });
            return row;
        });
    });
}
export async function listDeviceObservations(admissionId) {
    const ctx = nursingContext();
    await assertAdmission(admissionId);
    return nursingQuery('SELECT o.*,d.label FROM nursing_device_observations o JOIN nursing_device_bindings d ON d.device_id=o.device_id AND d.organization_id=o.organization_id WHERE o.organization_id= :org AND o.admission_id= :admission ORDER BY o.observed_at DESC LIMIT 200', { replacements: { org: ctx.organizationId, admission: admissionId }, type: QueryTypes.SELECT });
}
export async function reviewDeviceObservation(id, input) {
    const ctx = nursingContext();
    if (ctx.role !== 'nurse')
        throw clinicalError(403, 'NURSE_REVIEW_REQUIRED', 'An assigned nurse must review device observations');
    const [row] = await nursingQuery('SELECT * FROM nursing_device_observations WHERE id= :id AND organization_id= :org FOR UPDATE', { replacements: { id: positiveId(id), org: ctx.organizationId }, type: QueryTypes.SELECT });
    if (!row)
        throw clinicalError(404, 'OBSERVATION_NOT_FOUND', 'Device observation not found');
    await assertAdmission(row.admission_id, { active: true });
    if (row.status !== 'pending')
        throw clinicalError(409, 'OBSERVATION_ALREADY_REVIEWED', 'This observation was already reviewed');
    if (!['accepted', 'rejected'].includes(input.decision))
        throw clinicalError(422, 'REVIEW_DECISION_REQUIRED', 'Accept or reject the observation');
    let entry = null;
    if (input.decision === 'accepted')
        entry = await recordEntry({ ...row.payload, admissionId: row.admission_id, entryType: 'vitals', amendsId: null, recordedAt: row.observed_at, idempotencyKey: `device-review-${row.id}` });
    const [result] = await nursingQuery('UPDATE nursing_device_observations SET status= :status,reviewed_by= :actor,reviewed_at=NOW(),review_note= :note,entry_id= :entry WHERE id= :id RETURNING *', { replacements: { status: input.decision, actor: ctx.actorId, note: requireText(input.note, 'Review note'), entry: entry?.id || null, id: row.id }, type: QueryTypes.SELECT });
    await nursingAudit('device.observation.reviewed', 'nursing_device_observation', row.id, { decision: input.decision });
    return result;
}
