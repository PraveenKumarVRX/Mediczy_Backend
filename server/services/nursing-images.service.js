import { randomUUID } from 'node:crypto';
import { QueryTypes } from 'sequelize';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { fromInstanceMetadata } from '@smithy/credential-provider-imds';
import { nursingQuery, nursingContext, assertAdmission, clinicalError, nursingAudit } from './nursing-context.service.js';
const client = () => new S3Client({
    region: process.env.AWS_REGION || 'ap-south-1',
    ...(process.env.NURSING_IMAGE_USE_INSTANCE_ROLE === 'true' ? { credentials: fromInstanceMetadata({ timeout: 1500, maxRetries: 1 }) } : {})
});
const bucket = () => {
    if (!process.env.NURSING_IMAGE_BUCKET)
        throw clinicalError(503, 'IMAGE_STORAGE_UNAVAILABLE', 'Private nursing image storage is not configured');
    return process.env.NURSING_IMAGE_BUCKET;
};
export async function uploadNursingImage(admissionId, file) {
    const ctx = nursingContext();
    await assertAdmission(admissionId, { active: true });
    if (!file?.buffer || file.size > 5 * 1024 * 1024)
        throw clinicalError(422, 'INVALID_IMAGE', 'A JPEG or PNG up to 5 MB is required');
    const png = file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = file.buffer[0] === 255 && file.buffer[1] === 216 && file.buffer[2] === 255;
    if (!png && !jpeg)
        throw clinicalError(422, 'INVALID_IMAGE', 'Only JPEG and PNG images are accepted');
    const id = randomUUID(), key = `nursing/${ctx.organizationId}/${admissionId}/${id}.${png ? 'png' : 'jpg'}`, type = png ? 'image/png' : 'image/jpeg';
    const s3 = client(), Bucket = bucket();
    await s3.send(new PutObjectCommand({ Bucket, Key: key, Body: file.buffer, ContentType: type, ServerSideEncryption: 'aws:kms', ...(process.env.NURSING_IMAGE_KMS_KEY ? { SSEKMSKeyId: process.env.NURSING_IMAGE_KMS_KEY } : {}) }));
    try {
        await nursingQuery('INSERT INTO nursing_images(id,organization_id,admission_id,object_key,content_type,byte_count,uploaded_by) VALUES(:id,:org,:admission,:key,:type,:bytes,:actor)', { replacements: { id, org: ctx.organizationId, admission: admissionId, key, type, bytes: file.size, actor: ctx.actorId }, type: QueryTypes.INSERT });
        await nursingAudit('wound.image.uploaded', 'nursing_image', id);
        return { id, imageRef: key };
    }
    catch (error) {
        await s3.send(new DeleteObjectCommand({ Bucket, Key: key })).catch(() => { });
        throw error;
    }
}
export async function getNursingImage(id) {
    const ctx = nursingContext();
    const [image] = await nursingQuery('SELECT * FROM nursing_images WHERE id= :id AND organization_id= :org', { replacements: { id, org: ctx.organizationId }, type: QueryTypes.SELECT });
    if (!image)
        throw clinicalError(404, 'IMAGE_NOT_FOUND', 'Image not found');
    await assertAdmission(image.admission_id);
    await nursingAudit('wound.image.viewed', 'nursing_image', id);
    return { url: await getSignedUrl(client(), new GetObjectCommand({ Bucket: bucket(), Key: image.object_key }), { expiresIn: 60 }), expiresIn: 60 };
}
