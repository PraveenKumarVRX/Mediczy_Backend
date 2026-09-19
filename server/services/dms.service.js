/**
 * Document Management Service (DMS)
 * =================================================================
 * Small, real DMS for hospital operational documents (policies, SOPs,
 * consent forms, NABH documents, HR documents, circulars, etc).
 *
 * Every document keeps an append-only version history in
 * dms_document_version — dms_document itself always reflects the
 * latest version's file + current_version number.
 *
 * Administrative / document-storage module only — no clinical decision
 * content, not SaMD. See migrations/dms.migration.js for schema.
 */

import pool from '../db/pgPool.js';

class DmsService {
  async createDocument({ organizationId, category, title, description, uploadedBy, file }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `INSERT INTO dms_document
           (organization_id, category, title, description, current_version, status,
            file_url, file_key, file_name, mime_type, size_bytes, uploaded_by)
         VALUES ($1, $2, $3, $4, 1, 'draft', $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          organizationId, category, title, description || null,
          file?.url || null, file?.key || null, file?.name || null,
          file?.mimeType || null, file?.sizeBytes || null, uploadedBy || null,
        ]
      );
      const document = rows[0];

      await client.query(
        `INSERT INTO dms_document_version
           (document_id, version_no, file_url, file_key, file_name, mime_type, size_bytes, uploaded_by, change_note)
         VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          document.id, file?.url || null, file?.key || null, file?.name || null,
          file?.mimeType || null, file?.sizeBytes || null, uploadedBy || null, 'Initial upload',
        ]
      );

      await client.query('COMMIT');
      return document;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Returns null when the document does not exist in organizationId (a
  // document of another org is indistinguishable from a missing one).
  async uploadNewVersion({ organizationId, documentId, uploadedBy, changeNote, file }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: existingRows } = await client.query(
        `SELECT * FROM dms_document WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [documentId, organizationId]
      );
      const existing = existingRows[0];
      if (!existing) {
        await client.query('ROLLBACK');
        return null;
      }

      const nextVersion = existing.current_version + 1;

      const { rows } = await client.query(
        `UPDATE dms_document
         SET current_version = $2, file_url = $3, file_key = $4, file_name = $5,
             mime_type = $6, size_bytes = $7, updated_at = NOW()
         WHERE id = $1 AND organization_id = $8
         RETURNING *`,
        [
          documentId, nextVersion, file?.url || null, file?.key || null,
          file?.name || null, file?.mimeType || null, file?.sizeBytes || null, organizationId,
        ]
      );

      await client.query(
        `INSERT INTO dms_document_version
           (document_id, version_no, file_url, file_key, file_name, mime_type, size_bytes, uploaded_by, change_note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          documentId, nextVersion, file?.url || null, file?.key || null, file?.name || null,
          file?.mimeType || null, file?.sizeBytes || null, uploadedBy || null, changeNote || null,
        ]
      );

      await client.query('COMMIT');
      return rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async listDocuments(organizationId, { category = null, status = null } = {}) {
    const conditions = ['organization_id = $1'];
    const params = [organizationId];

    if (category) {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    const { rows } = await pool.query(
      `SELECT * FROM dms_document WHERE ${conditions.join(' AND ')} ORDER BY updated_at DESC`,
      params
    );
    return rows;
  }

  // Returns null when the document does not exist in organizationId.
  async getDocument(organizationId, documentId) {
    const { rows: docRows } = await pool.query(
      `SELECT * FROM dms_document WHERE id = $1 AND organization_id = $2`,
      [documentId, organizationId]
    );
    const document = docRows[0];
    if (!document) return null;

    const { rows: versions } = await pool.query(
      `SELECT * FROM dms_document_version WHERE document_id = $1 ORDER BY version_no DESC`,
      [documentId]
    );

    return { ...document, versions };
  }

  // publish/archive return undefined when the document is not in organizationId.
  async publishDocument(organizationId, documentId) {
    const { rows } = await pool.query(
      `UPDATE dms_document SET status = 'published', updated_at = NOW() WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [documentId, organizationId]
    );
    return rows[0];
  }

  async archiveDocument(organizationId, documentId) {
    const { rows } = await pool.query(
      `UPDATE dms_document SET status = 'archived', updated_at = NOW() WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [documentId, organizationId]
    );
    return rows[0];
  }

  /** Hard delete — only allowed for draft documents belonging to the caller's organization. */
  async deleteDocument(documentId, organizationId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `SELECT * FROM dms_document WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [documentId, organizationId]
      );
      const document = rows[0];
      // Another org's document is reported exactly like a missing one.
      if (!document) throw Object.assign(new Error('Document not found'), { statusCode: 404 });
      if (document.status !== 'draft') {
        throw new Error('Only draft documents can be deleted — publish/archive workflow does not allow hard delete');
      }

      await client.query(`DELETE FROM dms_document_version WHERE document_id = $1`, [documentId]);
      await client.query(`DELETE FROM dms_document WHERE id = $1 AND organization_id = $2`, [documentId, organizationId]);

      await client.query('COMMIT');
      return { success: true };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

export default new DmsService();
