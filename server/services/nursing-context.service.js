import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { QueryTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { resolveTenantId } from '../utils/tenant-identity.js';
const storage = new AsyncLocalStorage();
export const clinicalError = (status, code, message) => Object.assign(new Error(message), { status, code });
export const positiveId = (value, label = 'ID') => {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0)
        throw clinicalError(422, 'INVALID_ID', `${label} must be a positive integer`);
    return id;
};
export function boundedNumber(value, min, max, label) {
    const n = Number(value);
    if (value === '' || value == null || !Number.isFinite(n) || n < min || n > max)
        throw clinicalError(422, 'INVALID_VALUE', `${label} must be between ${min} and ${max}`);
    return n;
}
export function validTime(value, label = 'Time') {
    const d = new Date(value);
    if (!Number.isFinite(d.getTime()))
        throw clinicalError(422, 'INVALID_TIME', `${label} is invalid`);
    return d.toISOString();
}
export function requireText(value, label, max = 10000) {
    if (typeof value !== 'string' || !value.trim() || value.length > max)
        throw clinicalError(422, 'INVALID_VALUE', `${label} is required (maximum ${max} characters)`);
    return value.trim();
}
export function requestKey(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]{8,128}$/.test(value))
        throw clinicalError(422, 'INVALID_IDEMPOTENCY_KEY', 'An 8–128 character Idempotency-Key is required');
    return value;
}
export const payloadHash = (value) => {
    const canonical = (v) => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => [k, canonical(v[k])])) : v;
    return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
};
export const currentNursingContext = () => storage.getStore();
export const nursingContext = () => {
    const ctx = storage.getStore();
    if (!ctx)
        throw clinicalError(403, 'CLINICAL_CONTEXT_REQUIRED', 'An authenticated clinical context is required');
    return ctx;
};
export async function nursingQuery(sql, options = {}) {
    const ctx = nursingContext();
    try {
        return await sequelize.query(sql, { ...options, transaction: ctx.transaction });
    }
    catch (error) {
        if (['42P01', '42703'].includes(error.original?.code || error.parent?.code || error.code))
            throw clinicalError(503, 'SCHEMA_NOT_MIGRATED', 'Apply the nursing migrations before enabling this workflow');
        throw error;
    }
}
export async function withNursingContext(context, callback) {
    const existing = storage.getStore();
    if (existing) {
        if (context?.organizationId && Number(context.organizationId) !== existing.organizationId)
            throw clinicalError(403, 'TENANT_MISMATCH', 'Clinical tenant mismatch');
        return callback(existing);
    }
    const organizationId = positiveId(context.organizationId, 'Hospital');
    return sequelize.transaction(async (transaction) => {
        const ctx = { ...context, organizationId, actorId: Number(context.actorId) || 0, transaction };
        return storage.run(ctx, async () => {
            await nursingQuery("SELECT set_config('app.current_org_id', :org, true), set_config('app.current_user_id', :actor, true), set_config('app.is_platform_admin', 'false', true)", { replacements: { org: String(organizationId), actor: String(ctx.actorId) }, type: QueryTypes.SELECT });
            return callback(ctx);
        });
    });
}
const CLINICAL = new Set(['nurse', 'doctor', 'hospital_doctor', 'hospital', 'hospital_admin', 'admin', 'medical_superintendent', 'ms', 'icu_staff', 'ot_staff']);
export function actorFromRequest(req) {
    const role = req.user?.role || req.userRole;
    if (!CLINICAL.has(role))
        throw clinicalError(403, 'ROLE_NOT_PERMITTED', 'Clinical staff access is required');
    const organizationId = resolveTenantId({ ...req.user, tenant_id: req.user?.tenant_id || req.user?.tenantId });
    if (!organizationId)
        throw clinicalError(403, 'TENANT_CONTEXT_REQUIRED', 'This account is not attached to a hospital');
    return { organizationId, actorId: positiveId(req.user.id, 'Staff ID'), role, principal: req.user };
}
export function requireSupervisor() {
    if (!['hospital', 'hospital_admin', 'admin', 'ms', 'medical_superintendent'].includes(nursingContext().role))
        throw clinicalError(403, 'SUPERVISOR_REQUIRED', 'A hospital supervisor is required');
}
export async function assertAdmission(admissionId, { active = false, patientId } = {}) {
    const ctx = nursingContext();
    const [admission] = await nursingQuery(`SELECT a.*, COALESCE(a.ward_id,b.ward_id) AS current_ward_id FROM ip_admissions a LEFT JOIN beds b ON b.id=a.bed_id WHERE a.id= :id AND a.organization_id= :org FOR SHARE OF a`, { replacements: { id: positiveId(admissionId, 'Admission'), org: ctx.organizationId }, type: QueryTypes.SELECT });
    if (!admission || (patientId != null && String(patientId) !== String(admission.patient_id)))
        throw clinicalError(404, 'ADMISSION_NOT_FOUND', 'Admission not found');
    if (active && !['active', 'admitted', 'in_ot', 'in_icu'].includes(admission.status))
        throw clinicalError(409, 'ADMISSION_CLOSED', 'The admission is no longer active');
    if (ctx.principal?.metadata?.nursing_simulation_only === true) {
        const [patient] = await nursingQuery(`SELECT id FROM users u WHERE id= :patient
          AND to_jsonb(u)->'metadata'->>'nursing_simulation_only'='true'
          AND to_jsonb(u)->'metadata'->>'source'='nursing-release-demo'`, { replacements: { patient: admission.patient_id }, type: QueryTypes.SELECT });
        if (!patient || !String(admission.notes || '').startsWith('SIMULATION ONLY'))
            throw clinicalError(403, 'SIMULATION_ONLY_ACCOUNT', 'This demo account may access only dedicated synthetic nursing admissions');
    }
    if (ctx.role === 'nurse') {
        const [assignment] = await nursingQuery(`SELECT id FROM nursing_assignments WHERE organization_id= :org AND nurse_id= :actor AND ward_id= :ward AND starts_at <= NOW() AND ends_at > NOW() AND revoked_at IS NULL LIMIT 1`, { replacements: { org: ctx.organizationId, actor: ctx.actorId, ward: admission.current_ward_id }, type: QueryTypes.SELECT });
        if (!assignment)
            throw clinicalError(403, 'WARD_ASSIGNMENT_REQUIRED', 'An active assignment to this ward is required');
    }
    return admission;
}
export async function nursingAudit(action, entityType, entityId, data = {}) {
    const ctx = nursingContext();
    await nursingQuery(`INSERT INTO nursing_audit_events(organization_id,actor_id,actor_role,action,entity_type,entity_id,data) VALUES(:org,:actor,:role,:action,:type,:id,:data::jsonb)`, { replacements: { org: ctx.organizationId, actor: ctx.actorId, role: ctx.role || 'service', action, type: entityType, id: String(entityId), data: JSON.stringify(data) }, type: QueryTypes.INSERT });
}
export async function nursingOutbox(eventType, entityId, payload) {
    const ctx = nursingContext();
    const [row] = await nursingQuery(`INSERT INTO nursing_outbox(organization_id,event_type,entity_id,payload) VALUES(:org,:type,:id,:data::jsonb) RETURNING *`, { replacements: { org: ctx.organizationId, type: eventType, id: String(entityId), data: JSON.stringify(payload) }, type: QueryTypes.SELECT });
    return row;
}
export async function withNursingReplay(operation, key, payload, callback) {
    const ctx = nursingContext();
    requestKey(key);
    const hash = payloadHash({ actorId: ctx.actorId, payload });
    await nursingQuery('SELECT pg_advisory_xact_lock(hashtextextended(:key,0))', { replacements: { key: `${ctx.organizationId}:${operation}:${key}` }, type: QueryTypes.SELECT });
    const replacements = { org: ctx.organizationId, operation, key, hash };
    const [previous] = await nursingQuery('SELECT * FROM nursing_replays WHERE organization_id= :org AND operation= :operation AND request_key= :key', { replacements, type: QueryTypes.SELECT });
    if (previous) {
        if (previous.request_hash !== hash)
            throw clinicalError(422, 'idempotency_key_reuse', 'This request key was used with different data');
        return previous.result;
    }
    const result = await callback();
    await nursingQuery('INSERT INTO nursing_replays(organization_id,operation,request_key,request_hash,result) VALUES(:org,:operation,:key,:hash,:result::jsonb)', { replacements: { ...replacements, result: JSON.stringify(result) }, type: QueryTypes.INSERT });
    return result;
}
/** A doctor ID is never silently treated as the HR users.id identity. */
export async function assertNursingPrescriber() {
    const ctx = nursingContext();
    if (!['doctor', 'hospital_doctor'].includes(ctx.role))
        throw clinicalError(403, 'PRESCRIBER_REQUIRED', 'Only an authorized prescriber may issue or change medication orders');
    const [grant] = await nursingQuery(`SELECT p.id FROM nursing_staff_links l
      JOIN hr_staff_privileges p ON p.staff_user_id=l.user_id AND p.tenant_id=l.organization_id
      LEFT JOIN hr_staff_qualifications q ON q.id=p.qualification_id AND q.tenant_id=p.tenant_id
      WHERE l.organization_id= :org AND l.actor_role= :role AND l.actor_id= :actor
      AND p.privilege_code='prescribe' AND p.status='active' AND p.valid_from<=CURRENT_DATE AND (p.valid_until IS NULL OR p.valid_until>=CURRENT_DATE)
      AND q.status='active' AND q.verification_status='verified' AND (q.expires_at IS NULL OR q.expires_at>=CURRENT_DATE) LIMIT 1`, { replacements: { org: ctx.organizationId, role: ctx.role, actor: ctx.actorId }, type: QueryTypes.SELECT });
    if (!grant)
        throw clinicalError(403, 'CLINICAL_PRIVILEGE_REQUIRED', 'An explicit staff identity link and active verified prescribing qualification are required');
}
export function requireIndividualNurse() {
    if (nursingContext().role !== 'nurse')
        throw clinicalError(403, 'INDIVIDUAL_NURSE_REQUIRED', 'Sign in with an individual nurse account to document bedside care');
}
