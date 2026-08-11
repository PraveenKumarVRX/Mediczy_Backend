/**
 * DICOM modality device registry — lab/clinic-managed scanner peers synced to Orthanc.
 *
 * GET    /api/dicom/health
 * GET    /api/dicom/presets
 * GET    /api/dicom/modalities
 * POST   /api/dicom/modalities
 * GET    /api/dicom/modalities/:name
 * PUT    /api/dicom/modalities/:name
 * DELETE /api/dicom/modalities/:name
 * POST   /api/dicom/modalities/:name/echo      — C-ECHO
 * POST   /api/dicom/modalities/:name/query     — C-FIND
 * POST   /api/dicom/modalities/:name/retrieve  — C-MOVE pull into Orthanc
 */
import express from 'express';
import pool from '../db/pgPool.js';
import { authLabOrClinicImaging as authLab } from '../middleware/authLabOrClinicImaging.middleware.js';
import {
  upsertOrthancModality,
  deleteOrthancModality,
  listOrthancModalities,
  getOrthancSystem,
  echoOrthancModality,
  queryOrthancModality,
  retrieveOrthancModality,
  MODALITY_PRESETS,
} from '../services/orthanc-modality.service.js';

const router = express.Router();

function tenantId(req) {
  return req.lab?.id;
}

function normalizePort(port) {
  const n = parseInt(String(port), 10);
  if (!Number.isFinite(n) || n < 1 || n > 65535) {
    throw new Error('port must be an integer between 1 and 65535');
  }
  return n;
}

function rowToModality(row) {
  return {
    id: row.id,
    name: row.name,
    ae_title: row.ae_title,
    host: row.host,
    port: Number(row.port),
    modality_type: row.modality_type,
    manufacturer: row.manufacturer,
    model: row.model,
    location: row.location,
    status: row.status,
    orthanc_synced: row.orthanc_synced,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function assertOwnedModality(tid, name) {
  const r = await pool.query(
    `SELECT * FROM dicom_modalities WHERE tenant_id = $1 AND name = $2 LIMIT 1`,
    [tid, name],
  );
  return r.rows[0] || null;
}

/** Public-ish health for lab UI (requires lab or clinic auth). */
router.get('/health', authLab, async (_req, res) => {
  try {
    const system = await getOrthancSystem();
    res.json({ success: true, pacs: system });
  } catch (err) {
    res.status(503).json({
      success: false,
      message: 'PACS (Orthanc) is not reachable. Start docker/imaging Orthanc or set ORTHANC_URL.',
      error: err.message,
      pacs: { online: false, url: process.env.ORTHANC_URL || 'http://127.0.0.1:8042' },
    });
  }
});

router.get('/presets', authLab, (_req, res) => {
  res.json({
    success: true,
    presets: MODALITY_PRESETS,
    local_aet: process.env.ORTHANC_AET || 'MEDICZY',
    local_port: Number(process.env.ORTHANC_DICOM_PORT || 4242),
    note: 'Configure each CT/MRI/USG/DX machine to C-STORE to this AE, or register the machine here and pull via C-MOVE.',
  });
});

router.use(authLab);

router.get('/modalities', async (req, res) => {
  try {
    const tid = tenantId(req);
    const r = await pool.query(
      `SELECT * FROM dicom_modalities
       WHERE tenant_id = $1
       ORDER BY name ASC`,
      [tid],
    );
    const orthancPeers = await listOrthancModalities().catch(() => []);
    res.json({
      success: true,
      modalities: r.rows.map(rowToModality),
      orthanc_peers: orthancPeers,
    });
  } catch (err) {
    console.error('[DicomModality] list error:', err);
    res.status(500).json({ success: false, message: 'Failed to list modalities' });
  }
});

router.get('/modalities/:name', async (req, res) => {
  try {
    const tid = tenantId(req);
    const row = await assertOwnedModality(tid, req.params.name);
    if (!row) {
      return res.status(404).json({ success: false, message: 'Modality not found' });
    }
    return res.json({ success: true, modality: rowToModality(row) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch modality' });
  }
});

router.post('/modalities', async (req, res) => {
  try {
    const tid = tenantId(req);
    const {
      name,
      ae_title: aeTitle,
      host,
      port,
      modality_type: modalityType,
      manufacturer,
      model,
      location,
    } = req.body || {};

    if (!name || !aeTitle || !host || port == null || !modalityType) {
      return res.status(400).json({
        success: false,
        message: 'name, ae_title, host, port, modality_type required',
      });
    }

    const portNum = normalizePort(port);

    const r = await pool.query(
      `INSERT INTO dicom_modalities
         (tenant_id, name, ae_title, host, port, modality_type, manufacturer, model, location, status, orthanc_synced)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', false)
       RETURNING *`,
      [tid, name, aeTitle, host, portNum, modalityType, manufacturer || null, model || null, location || null],
    );

    let modality = r.rows[0];
    try {
      await upsertOrthancModality({
        name,
        aeTitle,
        host,
        port: portNum,
        manufacturer,
      });
      const synced = await pool.query(
        `UPDATE dicom_modalities SET orthanc_synced = true, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [modality.id],
      );
      modality = synced.rows[0];
    } catch (orthancErr) {
      console.warn('[DicomModality] Orthanc sync failed (DB row kept):', orthancErr.message);
    }

    return res.status(201).json({ success: true, modality: rowToModality(modality) });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'Modality name already registered' });
    }
    console.error('[DicomModality] create error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to register modality' });
  }
});

router.put('/modalities/:name', async (req, res) => {
  try {
    const tid = tenantId(req);
    const existing = await assertOwnedModality(tid, req.params.name);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Modality not found' });
    }

    const row = existing;
    const aeTitle = req.body.ae_title ?? row.ae_title;
    const host = req.body.host ?? row.host;
    const portNum = req.body.port != null ? normalizePort(req.body.port) : Number(row.port);
    const modalityType = req.body.modality_type ?? row.modality_type;
    const manufacturer = req.body.manufacturer ?? row.manufacturer;
    const model = req.body.model ?? row.model;
    const location = req.body.location ?? row.location;

    const r = await pool.query(
      `UPDATE dicom_modalities
       SET ae_title = $3, host = $4, port = $5, modality_type = $6,
           manufacturer = $7, model = $8, location = $9, updated_at = NOW(), orthanc_synced = false
       WHERE tenant_id = $1 AND name = $2
       RETURNING *`,
      [tid, req.params.name, aeTitle, host, portNum, modalityType, manufacturer, model, location],
    );

    let modality = r.rows[0];
    try {
      await upsertOrthancModality({
        name: req.params.name,
        aeTitle,
        host,
        port: portNum,
        manufacturer,
      });
      const synced = await pool.query(
        `UPDATE dicom_modalities SET orthanc_synced = true, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [modality.id],
      );
      modality = synced.rows[0];
    } catch (orthancErr) {
      console.warn('[DicomModality] Orthanc sync failed on update:', orthancErr.message);
    }

    return res.json({ success: true, modality: rowToModality(modality) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to update modality' });
  }
});

router.delete('/modalities/:name', async (req, res) => {
  try {
    const tid = tenantId(req);
    const r = await pool.query(
      `DELETE FROM dicom_modalities WHERE tenant_id = $1 AND name = $2 RETURNING *`,
      [tid, req.params.name],
    );
    if (!r.rows[0]) {
      return res.status(404).json({ success: false, message: 'Modality not found' });
    }
    await deleteOrthancModality(req.params.name).catch((err) => {
      console.warn('[DicomModality] Orthanc delete failed:', err.message);
    });
    return res.json({ success: true, deleted: req.params.name });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete modality' });
  }
});

/** C-ECHO connectivity test */
router.post('/modalities/:name/echo', async (req, res) => {
  try {
    const tid = tenantId(req);
    const row = await assertOwnedModality(tid, req.params.name);
    if (!row) return res.status(404).json({ success: false, message: 'Modality not found' });

    // Ensure Orthanc peer is synced before echo
    if (!row.orthanc_synced) {
      await upsertOrthancModality({
        name: row.name,
        aeTitle: row.ae_title,
        host: row.host,
        port: row.port,
        manufacturer: row.manufacturer,
      });
      await pool.query(
        `UPDATE dicom_modalities SET orthanc_synced = true, updated_at = NOW() WHERE id = $1`,
        [row.id],
      );
    }

    const result = await echoOrthancModality(req.params.name);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(502).json({ success: false, message: err.message || 'C-ECHO failed' });
  }
});

/** C-FIND — query remote modality for studies (CT/MR/US/DX …) */
router.post('/modalities/:name/query', async (req, res) => {
  try {
    const tid = tenantId(req);
    const row = await assertOwnedModality(tid, req.params.name);
    if (!row) return res.status(404).json({ success: false, message: 'Modality not found' });

    const {
      patient_name: patientName,
      patient_id: patientId,
      study_date: studyDate,
      accession_number: accessionNumber,
      modalities_in_study: modalitiesInStudy,
      study_description: studyDescription,
      study_instance_uid: studyInstanceUID,
      level,
    } = req.body || {};

    // Default to this device's modality type when not specified
    const mods = modalitiesInStudy
      || (row.modality_type ? String(row.modality_type).toUpperCase() : '');

    const result = await queryOrthancModality(req.params.name, {
      level: level || 'Study',
      query: {
        ...(patientName != null ? { PatientName: patientName } : {}),
        ...(patientId != null ? { PatientID: patientId } : {}),
        ...(studyDate != null ? { StudyDate: studyDate } : {}),
        ...(accessionNumber != null ? { AccessionNumber: accessionNumber } : {}),
        ...(mods ? { ModalitiesInStudy: mods } : {}),
        ...(studyDescription != null ? { StudyDescription: studyDescription } : {}),
        ...(studyInstanceUID != null ? { StudyInstanceUID: studyInstanceUID } : {}),
      },
    });

    res.json({ success: true, modality: req.params.name, ...result });
  } catch (err) {
    res.status(502).json({ success: false, message: err.message || 'C-FIND failed' });
  }
});

/** C-MOVE — pull selected studies into local Orthanc PACS */
router.post('/modalities/:name/retrieve', async (req, res) => {
  try {
    const tid = tenantId(req);
    const row = await assertOwnedModality(tid, req.params.name);
    if (!row) return res.status(404).json({ success: false, message: 'Modality not found' });

    const uids = req.body?.study_instance_uids
      || req.body?.studyInstanceUIDs
      || (req.body?.study_instance_uid ? [req.body.study_instance_uid] : []);

    if (!Array.isArray(uids) || !uids.length) {
      return res.status(400).json({
        success: false,
        message: 'study_instance_uids array is required',
      });
    }

    const result = await retrieveOrthancModality(req.params.name, {
      studyInstanceUIDs: uids.map(String),
      targetAet: req.body?.target_aet || null,
    });

    // Register pulled studies on Lab RIS worklist (does not wait for webhook alone)
    let risResults = [];
    try {
      const { ensureRisStudiesForStudyUids } = await import('../services/imaging/imaging-ris-auto-ingest.service.js');
      // Give Orthanc a moment to index C-MOVE objects
      await new Promise((r) => setTimeout(r, 1500));
      risResults = await ensureRisStudiesForStudyUids({
        labId: tid,
        studyInstanceUIDs: uids.map(String),
        referringDoctorId: req.body?.referring_doctor_id || req.body?.referringDoctorId || null,
      });
    } catch (risErr) {
      risResults = [{ success: false, error: risErr.message }];
    }

    const risCreated = risResults.filter((r) => r.created).length;
    const risUpdated = risResults.filter((r) => r.success && !r.created).length;

    res.json({
      success: true,
      message: `Retrieved ${uids.length} study(ies) into Orthanc. RIS worklist: ${risCreated} new, ${risUpdated} updated.`,
      ris: risResults,
      ...result,
    });
  } catch (err) {
    res.status(502).json({ success: false, message: err.message || 'C-MOVE retrieve failed' });
  }
});

export default router;
