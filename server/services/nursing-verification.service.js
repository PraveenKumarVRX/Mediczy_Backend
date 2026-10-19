import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { QueryTypes } from 'sequelize';
import { JWT_CONFIG } from '../config/auth.config.js';
import { nursingQuery, nursingContext, positiveId, clinicalError, assertAdmission } from './nursing-context.service.js';
export async function issueNursingProof({ email, password, purpose, targetId, admissionId, action }) {
    const ctx = nursingContext();
    if (!['note.sign', 'emar.cosign'].includes(purpose))
        throw clinicalError(422, 'INVALID_PURPOSE', 'Invalid verification purpose');
    await assertAdmission(admissionId, { active: true });
    // Identity spaces are explicit: only the nurses table can issue a nursing proof.
    const [row] = await nursingQuery(`SELECT id,password,tenant_id,to_jsonb(n) AS profile FROM nurses n WHERE ${email ? 'lower(email)= :email' : 'id= :id'} AND tenant_id= :org`, { replacements: { id: ctx.actorId, email: String(email || '').toLowerCase(), org: ctx.organizationId }, type: QueryTypes.SELECT });
    if (!row || !password || !await bcrypt.compare(String(password), row.password) || row.profile.isActive === false || (row.profile.status && row.profile.status !== 'active'))
        throw clinicalError(403, 'VERIFICATION_FAILED', 'The nurse credentials could not be verified');
    if (purpose === 'note.sign' && (ctx.role !== 'nurse' || Number(row.id) !== ctx.actorId))
        throw clinicalError(403, 'AUTHOR_VERIFICATION_REQUIRED', 'Sign using your own nurse account');
    if (purpose === 'emar.cosign' && Number(row.id) === ctx.actorId)
        throw clinicalError(403, 'DISTINCT_WITNESS_REQUIRED', 'A different nurse must verify this dose');
    const [assigned] = await nursingQuery(`SELECT na.id FROM nursing_assignments na JOIN ip_admissions a ON a.ward_id=na.ward_id AND a.organization_id=na.organization_id WHERE a.id= :admission AND na.organization_id= :org AND na.nurse_id= :id AND na.starts_at<=NOW() AND na.ends_at>NOW() AND na.revoked_at IS NULL`, { replacements: { admission: admissionId, org: ctx.organizationId, id: row.id }, type: QueryTypes.SELECT });
    if (!assigned)
        throw clinicalError(403, 'WARD_ASSIGNMENT_REQUIRED', 'The verifying nurse needs an active ward assignment');
    const verificationAction = purpose === 'note.sign' ? 'chart.sign' : (action || 'administer');
    if (purpose === 'emar.cosign' && !['administer', 'infusion.start', 'infusion.rate_change', 'infusion.stop'].includes(verificationAction))
        throw clinicalError(422, 'INVALID_VERIFICATION_ACTION', 'Invalid medication verification action');
    let orderVersion = null;
    if (purpose === 'emar.cosign') {
        const [order] = await nursingQuery('SELECT mo.version FROM medication_orders mo JOIN medication_administrations ma ON ma.order_id=mo.id WHERE ma.id=:slot AND ma.admission_id=:admission AND mo.organization_id=:org', { replacements: { slot: targetId, admission: admissionId, org: ctx.organizationId }, type: QueryTypes.SELECT });
        if (!order)
            throw clinicalError(404, 'SLOT_NOT_FOUND', 'Dose slot not found');
        orderVersion = order.version;
    }
    return { token: jwt.sign({ purpose, action: verificationAction, orderVersion, targetId: positiveId(targetId), admissionId: positiveId(admissionId), actorId: Number(row.id), organizationId: ctx.organizationId, jti: randomUUID() }, JWT_CONFIG.SECRET, { expiresIn: '3m', audience: 'nursing-verification', issuer: 'mediqzy' }), expiresIn: 180 };
}
export async function verifyNursingProof(token, purpose, targetId, admissionId, expectedAction = purpose === 'note.sign' ? 'chart.sign' : 'administer') {
    let proof;
    try {
        proof = jwt.verify(token, JWT_CONFIG.SECRET, { audience: 'nursing-verification', issuer: 'mediqzy', algorithms: ['HS256'] });
    }
    catch {
        throw clinicalError(403, 'VERIFICATION_REQUIRED', 'Fresh nurse verification is required');
    }
    const ctx = nursingContext();
    if (proof.action !== expectedAction)
        throw clinicalError(403, 'VERIFICATION_SCOPE_MISMATCH', 'Verification is for a different action');
    if (proof.purpose !== purpose || Number(proof.targetId) !== Number(targetId) || Number(proof.admissionId) !== Number(admissionId) || Number(proof.organizationId) !== ctx.organizationId)
        throw clinicalError(403, 'VERIFICATION_SCOPE_MISMATCH', 'Verification is for a different action');
    const [nurse] = await nursingQuery(`SELECT n.id FROM nurses n JOIN nursing_assignments na ON na.nurse_id=n.id AND na.organization_id=n.tenant_id JOIN ip_admissions a ON a.ward_id=na.ward_id AND a.organization_id=na.organization_id WHERE n.id= :id AND n.tenant_id= :org AND a.id= :admission AND na.revoked_at IS NULL AND na.starts_at<=NOW() AND na.ends_at>NOW() AND COALESCE(to_jsonb(n)->>'status','active')='active' AND COALESCE(to_jsonb(n)->>'isActive','true')!='false'`, { replacements: { id: proof.actorId, org: ctx.organizationId, admission: admissionId }, type: QueryTypes.SELECT });
    if (!nurse)
        throw clinicalError(403, 'VERIFICATION_REVOKED', 'The verifying nurse is no longer active or assigned');
    if (purpose === 'emar.cosign' && Number(proof.actorId) === ctx.actorId)
        throw clinicalError(403, 'DISTINCT_WITNESS_REQUIRED', 'Self verification is not permitted');
    if (purpose === 'note.sign' && (Number(proof.actorId) !== ctx.actorId || ctx.role !== 'nurse'))
        throw clinicalError(403, 'AUTHOR_VERIFICATION_REQUIRED', 'Only the author may sign');
    return proof;
}
