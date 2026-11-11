/**
 * Files attached to a Team email template.
 *
 * A Team/HR user uploads the file once against the template; every send of that
 * template carries it as a real mail attachment. Nothing is generated at send
 * time — the file that goes out is the file that was uploaded, byte for byte.
 *
 * Every read probes information_schema first, so the feature is inert (and the
 * existing send paths keep working) until 20261111000600 has been applied.
 */
import crypto from 'crypto';
import pool from '../db/pgPool.js';
import { scanOnly } from './minio-upload.service.js';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_TEMPLATE = 5;

/** What a Team user may attach to a template. Office files are zips, so the signature is PK. */
const ALLOWED_TYPES = Object.freeze({
  'application/pdf': { ext: 'pdf', magic: ['25504446'] },
  'image/png': { ext: 'png', magic: ['89504e47'] },
  'image/jpeg': { ext: 'jpg', magic: ['ffd8ff'] },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', magic: ['504b0304'] },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: 'xlsx', magic: ['504b0304'] },
});

export const ALLOWED_ATTACHMENT_TYPES = Object.freeze(Object.keys(ALLOWED_TYPES));

let tableReadyPromise = null;

/** Memoised — the probe runs once per process, not once per send. */
export async function attachmentsTableReady() {
  if (!tableReadyPromise) {
    tableReadyPromise = pool
      .query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'team_email_template_attachments' LIMIT 1`)
      .then(({ rowCount }) => rowCount > 0)
      .catch(() => false);
  }
  return tableReadyPromise;
}

/** Test seam — forget the probe result so a fixture can change the schema underneath. */
export function __resetAttachmentsSchemaCache() {
  tableReadyPromise = null;
}

/** Strip any directory part and anything that would confuse a mail client. */
export function safeFilename(name, contentType) {
  const base = String(name || '').split(/[\\/]/).pop() || '';
  const cleaned = base.replace(/[^A-Za-z0-9 ._()\-]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (cleaned && cleaned !== '.' && cleaned !== '..') return cleaned;
  const ext = ALLOWED_TYPES[contentType]?.ext || 'bin';
  return `attachment.${ext}`;
}

function signatureMatches(buffer, contentType) {
  const expected = ALLOWED_TYPES[contentType]?.magic;
  if (!expected) return false;
  const head = buffer.subarray(0, 8).toString('hex');
  return expected.some((prefix) => head.startsWith(prefix));
}

const metaColumns = `id, template_id AS "templateId", filename, content_type AS "contentType",
  byte_size AS "byteSize", checksum, uploaded_by_user_id AS "uploadedByUserId",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

/** Attachment metadata for one template, oldest first. Never returns the bytes. */
export async function listTemplateAttachments(templateId) {
  if (!templateId || !(await attachmentsTableReady())) return [];
  const { rows } = await pool.query(
    `SELECT ${metaColumns} FROM team_email_template_attachments WHERE template_id = $1 ORDER BY created_at, filename`,
    [templateId],
  );
  return rows;
}

/** Attachment counts for many templates at once, as { [templateId]: count }. */
export async function attachmentCountsByTemplate(templateIds = []) {
  const ids = [...new Set(templateIds.filter(Boolean).map(String))];
  if (!ids.length || !(await attachmentsTableReady())) return {};
  const { rows } = await pool.query(
    `SELECT template_id AS "templateId", COUNT(*)::int AS count
       FROM team_email_template_attachments WHERE template_id = ANY($1::uuid[]) GROUP BY template_id`,
    [ids],
  );
  return Object.fromEntries(rows.map((row) => [String(row.templateId), row.count]));
}

/**
 * Store an uploaded file against a template.
 * The buffer is virus-scanned (fail-closed) and its signature must match the
 * declared type, so a renamed binary cannot be posted to employees as a PDF.
 * Re-uploading the same filename replaces it.
 */
export async function saveTemplateAttachment({ templateId, filename, contentType, buffer, uploadedByUserId = null }) {
  if (!(await attachmentsTableReady())) {
    const error = new Error('Template attachments are not available yet on this environment');
    error.code = 'ATTACHMENTS_NOT_MIGRATED';
    error.status = 503;
    throw error;
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    const error = new Error('The uploaded file is empty');
    error.code = 'EMPTY_FILE';
    error.status = 400;
    throw error;
  }
  if (buffer.length > MAX_ATTACHMENT_BYTES) {
    const error = new Error('Attachments must be 10 MB or smaller');
    error.code = 'FILE_TOO_LARGE';
    error.status = 413;
    throw error;
  }
  const declared = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_TYPES[declared]) {
    const error = new Error('Only PDF, PNG, JPEG, DOCX and XLSX files can be attached to a template');
    error.code = 'UNSUPPORTED_FILE_TYPE';
    error.status = 415;
    throw error;
  }
  if (!signatureMatches(buffer, declared)) {
    const error = new Error('The file contents do not match its type');
    error.code = 'FILE_SIGNATURE_MISMATCH';
    error.status = 415;
    throw error;
  }

  const scan = await scanOnly(buffer);
  if (!scan?.clean) {
    const error = new Error('The uploaded file failed a virus scan and was rejected');
    error.code = 'AV_SCAN_FAILED';
    error.status = 422;
    throw error;
  }

  const name = safeFilename(filename, declared);
  const { rows: existing } = await pool.query(
    `SELECT 1 FROM team_email_template_attachments WHERE template_id = $1 AND lower(filename) <> lower($2)`,
    [templateId, name],
  );
  if (existing.length >= MAX_ATTACHMENTS_PER_TEMPLATE) {
    const error = new Error(`A template can carry at most ${MAX_ATTACHMENTS_PER_TEMPLATE} attachments`);
    error.code = 'TOO_MANY_ATTACHMENTS';
    error.status = 409;
    throw error;
  }

  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  const { rows } = await pool.query(
    `INSERT INTO team_email_template_attachments
       (template_id, filename, content_type, byte_size, checksum, content, uploaded_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (template_id, lower(filename)) DO UPDATE
       SET content_type = EXCLUDED.content_type, byte_size = EXCLUDED.byte_size,
           checksum = EXCLUDED.checksum, content = EXCLUDED.content,
           uploaded_by_user_id = EXCLUDED.uploaded_by_user_id, updated_at = NOW()
     RETURNING ${metaColumns}`,
    [templateId, name, declared, buffer.length, checksum, buffer, uploadedByUserId],
  );
  return rows[0];
}

/** One attachment with its bytes, for download or preview. */
export async function readTemplateAttachment(templateId, attachmentId) {
  if (!(await attachmentsTableReady())) return null;
  const { rows } = await pool.query(
    `SELECT ${metaColumns}, content FROM team_email_template_attachments WHERE template_id = $1 AND id = $2`,
    [templateId, attachmentId],
  );
  return rows[0] || null;
}

export async function deleteTemplateAttachment(templateId, attachmentId) {
  if (!(await attachmentsTableReady())) return false;
  const { rowCount } = await pool.query(
    `DELETE FROM team_email_template_attachments WHERE template_id = $1 AND id = $2`,
    [templateId, attachmentId],
  );
  return rowCount > 0;
}

/** The template's files, shaped for nodemailer. */
export async function mailAttachmentsForTemplate(templateId) {
  if (!templateId || !(await attachmentsTableReady())) return [];
  const { rows } = await pool.query(
    `SELECT filename, content_type AS "contentType", content
       FROM team_email_template_attachments WHERE template_id = $1 ORDER BY created_at, filename`,
    [templateId],
  );
  return rows.map((row) => ({
    filename: row.filename,
    content: row.content,
    contentType: row.contentType,
  }));
}

/**
 * The files to send with an automated message of a given template category —
 * the AHC welcome email reads its attachments this way.
 *
 * An ambiguous category is refused rather than resolved: if two templates of
 * the same category both carry files we cannot tell which employer's document
 * the employee should receive, so none is attached and the caller is told why.
 * Same precedent as the TPA member link — guessing posts the wrong employer's
 * document to an employee.
 */
export async function mailAttachmentsForCategory(category) {
  if (!category || !(await attachmentsTableReady())) return { attachments: [], templateId: null, reason: 'unavailable' };
  const { rows } = await pool.query(
    `SELECT t.id
       FROM team_email_templates t
       JOIN team_email_template_attachments a ON a.template_id = t.id
      WHERE t.category = $1
      GROUP BY t.id`,
    [category],
  );
  if (rows.length === 0) return { attachments: [], templateId: null, reason: 'no_attachments' };
  if (rows.length > 1) {
    console.warn(`[template-attachments] ${rows.length} "${category}" templates carry attachments — sending none, as the right one is ambiguous`);
    return { attachments: [], templateId: null, reason: 'ambiguous_template' };
  }
  const templateId = rows[0].id;
  return { attachments: await mailAttachmentsForTemplate(templateId), templateId, reason: 'ok' };
}

export default {
  attachmentsTableReady,
  listTemplateAttachments,
  attachmentCountsByTemplate,
  saveTemplateAttachment,
  readTemplateAttachment,
  deleteTemplateAttachment,
  mailAttachmentsForTemplate,
  mailAttachmentsForCategory,
  safeFilename,
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_TEMPLATE,
};
