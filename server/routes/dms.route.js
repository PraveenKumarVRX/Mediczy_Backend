/**
 * Document Management System (DMS) — API routes
 * =================================================================
 * Administrative document store for hospital operational documents
 * (policies, SOPs, consent forms, NABH documents, HR documents,
 * circulars, etc). Not a clinical decision surface — not SaMD.
 *
 * Files are stored via MinIO (server/services/minio-upload.service.js),
 * never on local disk. Uses express-fileupload (globally mounted in
 * server/app.js) — req.files.file gives { data, tempFilePath, mimetype, name, size }.
 */

import express from 'express';
import { authUser, requireRole, requireRoleOrHospitalAdmin } from '../middleware/auth.middleware.js';
import { requireModule } from '../middleware/moduleEntitlement.middleware.js';
import dmsService from '../services/dms.service.js';
import { uploadToMinio } from '../services/minio-upload.service.js';

const router = express.Router();

const DOCUMENT_CATEGORIES = ['policy', 'sop', 'consent_form', 'nabh_document', 'hr_document', 'circular', 'other'];

// Read access: any authenticated staff role that would need to look up a document.
const dmsRead = [authUser, requireRole(['doctor', 'nurse', 'admin', 'hospital', 'hospital_admin', 'quality', 'mrd']), requireModule('dms')];
// Write access: document custodians only (NABH/policy documents are managed by quality/MRD/admin, not clinical staff).
const dmsWrite = [authUser, requireRoleOrHospitalAdmin(['admin', 'hospital_admin', 'quality', 'mrd']), requireModule('dms')];

function orgId(req) {
  return req.user?.organization_id || req.user?.tenant_id || req.hospitalId || null;
}

const toId = (v) => (/^\d+$/.test(String(v ?? '')) && Number(v) <= 2147483647 ? Number(v) : null);

router.get('/categories', ...dmsRead, async (req, res) => {
  res.json({ success: true, data: DOCUMENT_CATEGORIES });
});

router.get('/documents', ...dmsRead, async (req, res) => {
  try {
    const org = orgId(req);
    if (!org) return res.status(400).json({ success: false, message: 'Organization context missing' });
    const { category, status } = req.query;
    const documents = await dmsService.listDocuments(org, { category: category || null, status: status || null });
    res.json({ success: true, data: documents });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to list documents', error: error.message });
  }
});

router.get('/documents/:id', ...dmsRead, async (req, res) => {
  try {
    const org = orgId(req);
    if (!org) return res.status(400).json({ success: false, message: 'Organization context missing' });
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid document id' });
    const document = await dmsService.getDocument(org, id);
    if (!document) return res.status(404).json({ success: false, message: 'Document not found' });
    res.json({ success: true, data: document });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch document', error: error.message });
  }
});

router.post('/documents', ...dmsWrite, async (req, res) => {
  try {
    const org = orgId(req);
    if (!org) return res.status(400).json({ success: false, message: 'Organization context missing' });

    const { category, title, description } = req.body;
    if (!category || !title) {
      return res.status(400).json({ success: false, message: 'category and title are required' });
    }
    if (!DOCUMENT_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, message: `category must be one of: ${DOCUMENT_CATEGORIES.join(', ')}` });
    }

    const uploadedFile = req.files?.file;
    if (!uploadedFile) {
      return res.status(400).json({ success: false, message: 'file is required' });
    }

    const uploadResult = await uploadToMinio({
      buffer: uploadedFile.data,
      filePath: uploadedFile.tempFilePath,
      originalName: uploadedFile.name,
      mimeType: uploadedFile.mimetype,
      keyPrefix: `dms/${org}`,
    });

    const document = await dmsService.createDocument({
      organizationId: org,
      category,
      title,
      description,
      uploadedBy: req.user?.id || null,
      file: {
        url: uploadResult.url,
        key: uploadResult.key,
        name: uploadedFile.name,
        mimeType: uploadedFile.mimetype,
        sizeBytes: uploadResult.size,
      },
    });

    res.status(201).json({ success: true, data: document });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create document', error: error.message });
  }
});

router.post('/documents/:id/versions', ...dmsWrite, async (req, res) => {
  try {
    const org = orgId(req);
    if (!org) return res.status(400).json({ success: false, message: 'Organization context missing' });

    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid document id' });

    const uploadedFile = req.files?.file;
    if (!uploadedFile) {
      return res.status(400).json({ success: false, message: 'file is required' });
    }

    // Ownership check before storing anything, so a foreign/missing id does not leave an orphan blob.
    if (!(await dmsService.getDocument(org, id))) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const uploadResult = await uploadToMinio({
      buffer: uploadedFile.data,
      filePath: uploadedFile.tempFilePath,
      originalName: uploadedFile.name,
      mimeType: uploadedFile.mimetype,
      keyPrefix: `dms/${org}`,
    });

    const document = await dmsService.uploadNewVersion({
      organizationId: org,
      documentId: id,
      uploadedBy: req.user?.id || null,
      changeNote: req.body.changeNote,
      file: {
        url: uploadResult.url,
        key: uploadResult.key,
        name: uploadedFile.name,
        mimeType: uploadedFile.mimetype,
        sizeBytes: uploadResult.size,
      },
    });
    if (!document) return res.status(404).json({ success: false, message: 'Document not found' });

    res.status(201).json({ success: true, data: document });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to upload new version', error: error.message });
  }
});

router.patch('/documents/:id/publish', ...dmsWrite, async (req, res) => {
  try {
    const org = orgId(req);
    if (!org) return res.status(400).json({ success: false, message: 'Organization context missing' });
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid document id' });
    const document = await dmsService.publishDocument(org, id);
    if (!document) return res.status(404).json({ success: false, message: 'Document not found' });
    res.json({ success: true, data: document });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to publish document', error: error.message });
  }
});

router.patch('/documents/:id/archive', ...dmsWrite, async (req, res) => {
  try {
    const org = orgId(req);
    if (!org) return res.status(400).json({ success: false, message: 'Organization context missing' });
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid document id' });
    const document = await dmsService.archiveDocument(org, id);
    if (!document) return res.status(404).json({ success: false, message: 'Document not found' });
    res.json({ success: true, data: document });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to archive document', error: error.message });
  }
});

router.delete('/documents/:id', ...dmsWrite, async (req, res) => {
  try {
    const org = orgId(req);
    if (!org) return res.status(400).json({ success: false, message: 'Organization context missing' });
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid document id' });
    await dmsService.deleteDocument(id, org);
    res.json({ success: true });
  } catch (error) {
    res.status(error.statusCode === 404 ? 404 : 400).json({ success: false, message: error.message, error: error.message });
  }
});

export default router;
