/**
 * HyperGrid DICOMweb API — OHIF-compatible subset
 *
 * QIDO-RS  GET  /studies | /series | /instances  (Accept: application/dicom+json)
 * WADO-RS  GET  /studies/:uid/series/:uid/instances/:uid[/frames/1]
 * STOW-RS  POST /studies
 * Worklist GET  /worklist
 * Report   POST /studies/:studyUID/report
 */

import express from 'express';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { authLab } from '../middleware/authLab.middleware.js';
import { JWT_CONFIG } from '../config/auth.config.js';
import { connectPostgres } from '../db/postgres.js';
import { publishEvent } from '../services/hypergrid-event-bus.service.js';
import { s3Storage, s3PresignedUrl, s3GetObjectBuffer } from '../utils/s3-storage.js';
import {
  wantsDicomJson,
  studyToDicomJson,
  seriesToDicomJson,
  instanceToDicomJson,
  groupInstancesBySeries,
  parseDicomBuffer,
  extractFramePixelData,
  renderFramePreviewJpeg,
  buildMultipartRelated,
  imagePixelTagsFromBuffer,
  buildAdaptiveDicomPolicy,
  DEFAULT_SERIES_UID,
} from '../services/dicomweb-ohif.service.js';
import { recordMetric } from '../services/imaging/imaging-observability.service.js';
import {
  fetchOrthancStudyByUid,
  formatDicomStudyDate,
  listOrthancStudyInstances,
} from '../services/orthanc-pacs.service.js';
import {
  fetchOrthancInstance,
  fetchOrthancInstanceMetadata,
  fetchOrthancSeriesMetadata,
} from '../services/orthanc-hypergrid-bridge.service.js';

const router = express.Router();
const PIXEL_TAG_CACHE_MAX = parseInt(process.env.OHIF_PIXEL_TAG_CACHE_MAX || '3000', 10);
const OHIF_METADATA_CONCURRENCY = Math.max(1, parseInt(process.env.OHIF_METADATA_CONCURRENCY || '12', 10));
const pixelTagCache = new Map();
const upload = multer({
  storage: s3Storage('dicom', {
    resolveTenant: (req) => req.user?.tenantId || req.user?.id || req.lab?.id,
  }),
  limits: { fileSize: 512 * 1024 * 1024 },
});

function setDicomCacheHeaders(res, scope = 'metadata', policy = null) {
  const adaptivePolicy = policy || buildAdaptiveDicomPolicy();
  const maxAgeByScope = {
    list: 60,
    metadata: adaptivePolicy.metadataCacheSeconds,
    frame: adaptivePolicy.frameCacheSeconds,
    instance: adaptivePolicy.frameCacheSeconds,
    rendered: adaptivePolicy.frameCacheSeconds,
  };
  const maxAge = maxAgeByScope[scope] || maxAgeByScope.metadata;
  res.setHeader('Cache-Control', `private, max-age=${maxAge}, stale-while-revalidate=300`);
  res.setHeader('Vary', 'Authorization, Cookie, Accept');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Mediqzy-Imaging-Mode', adaptivePolicy.mode);
  res.setHeader('X-Mediqzy-Low-Bandwidth', adaptivePolicy.lowBandwidth ? 'true' : 'false');
  res.setHeader('X-Mediqzy-Prefetch-Window', String(adaptivePolicy.prefetchWindow));
  if (scope === 'frame' || scope === 'rendered') {
    res.setHeader('Accept-Ranges', 'none');
  }
}

function dicomPolicyForRequest(req) {
  return buildAdaptiveDicomPolicy(req.headers || {}, req.query || {});
}

function setServerTiming(res, name, startedAt) {
  res.setHeader('Server-Timing', `${name};dur=${Math.max(0, Date.now() - startedAt)}`);
}

function recordDicomMetric(metricName, value, labels = {}) {
  recordMetric(metricName, value, labels).catch(() => {});
}

router.use((req, res, next) => {
  const origin = process.env.OHIF_CORS_ORIGIN || req.headers.origin || '*';
  res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Expose-Headers', [
    'Accept-Ranges',
    'Cache-Control',
    'Server-Timing',
    'X-Mediqzy-Frame-Bytes',
    'X-Mediqzy-Imaging-Mode',
    'X-Mediqzy-Low-Bandwidth',
    'X-Mediqzy-Metadata-Instances',
    'X-Mediqzy-Prefetch-Window',
    'X-Mediqzy-Rendered-Jpeg-Quality',
    'X-Mediqzy-Rendered-Max-Width',
    'X-Mediqzy-Source-Columns',
    'X-Mediqzy-Source-Rows',
  ].join(', '));
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});

const authDicomAccess = (req, res, next) => {
  authLab(req, res, () => {
    req.user = {
      ...(req.user || {}),
      ...(req.lab || {}),
      id: req.lab?.id,
      tenantId: req.lab?.id,
      role: 'lab',
    };
    req.userRole = 'lab';
    next();
  });
};

// Trusted machine-to-machine callers (the Orthanc→HyperGrid bridge) present a static
// shared secret, not a signed JWT — same trust boundary as orthanc-webhook.route.js's
// verifyWebhook. Tenant comes from a header since this runs before multer parses the body.
const BRIDGE_TOKEN = process.env.ORTHANC_BRIDGE_TOKEN || process.env.MEDICZY_INTERNAL_TOKEN || '';

const authAnyDicom = (req, res, next) => {
  const authHeader0 = req.headers.authorization || '';
  if (BRIDGE_TOKEN && authHeader0 === `Bearer ${BRIDGE_TOKEN}`) {
    const tid = parseInt(req.headers['x-tenant-id'], 10);
    if (!tid) {
      return res.status(400).json({ success: false, message: 'X-Tenant-Id header required for internal bridge auth' });
    }
    req.user = { id: 0, tenantId: tid, role: 'internal-bridge' };
    return next();
  }
  const queryToken = req.query.access_token || req.query.token;
  if (queryToken && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${queryToken}`;
  }
  const authHeader = req.headers.authorization || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_CONFIG.SECRET);
      if (decoded?.role === 'lab') {
        return authDicomAccess(req, res, next);
      }
      req.user = { ...decoded, id: decoded.id || decoded.userId, tenantId: decoded.tenantId || decoded.id };
      return next();
    } catch {
      // Fall through to regular authUser handling.
    }
  }
  // The OHIF viewer's own DICOMweb (QIDO/WADO) fetches carry no Authorization header —
  // imagingViewer.ts's openOhifViewer() relies entirely on the pacs_session HttpOnly
  // cookie (imaging-session.route.js), which until now only gated nginx's auth_request
  // on the static /ohif/ shell, never the actual study-data API calls the shell makes.
  const pacsToken = req.cookies?.pacs_session;
  if (pacsToken) {
    try {
      const decoded = jwt.verify(pacsToken, JWT_CONFIG.SECRET);
      if (decoded?.purpose === 'pacs') {
        req.user = { id: decoded.sub, tenantId: decoded.tenantId, role: decoded.role };
        return next();
      }
    } catch {
      // Fall through to regular authUser handling.
    }
  }
  return authUser(req, res, next);
};

function tenantId(req) {
  return req.user?.tenantId || req.user?.id;
}

function cleanDicomUid(value) {
  return String(value || '')
    .trim()
    .replace(/,+$/g, '')
    .trim();
}

function isOrthancFilePath(filePath) {
  return String(filePath || '').startsWith('orthanc://');
}

function orthancInstanceIdFromPath(filePath) {
  return String(filePath || '').replace(/^orthanc:\/\//, '').trim();
}

function shouldExposeInstanceToOhif(pixelTags) {
  return pixelTags?._hasPixelData !== false;
}

function firstTagValue(tags, tagId) {
  const value = tags?.[tagId]?.Value;
  return Array.isArray(value) ? value[0] : undefined;
}

function modalityIsVolumetric(modality) {
  return ['CT', 'MR', 'MRI'].includes(String(modality || '').toUpperCase());
}

async function getDicomInstanceBuffer(inst) {
  if (isOrthancFilePath(inst.file_path)) {
    const instanceId = inst.orthanc_instance_id || orthancInstanceIdFromPath(inst.file_path);
    if (!instanceId) throw new Error('Orthanc instance id missing');
    return fetchOrthancInstance(instanceId);
  }
  return s3GetObjectBuffer(inst.file_path);
}

async function getPixelTagsForInstance(inst) {
  const key = inst.orthanc_instance_id || inst.file_path || inst.sop_instance_uid;
  if (key && pixelTagCache.has(key)) {
    const cached = pixelTagCache.get(key);
    pixelTagCache.delete(key);
    pixelTagCache.set(key, cached);
    return cached;
  }
  const buf = await getDicomInstanceBuffer(inst);
  const tags = imagePixelTagsFromBuffer(buf);
  if (key && PIXEL_TAG_CACHE_MAX > 0) {
    pixelTagCache.set(key, tags);
    while (pixelTagCache.size > PIXEL_TAG_CACHE_MAX) {
      const oldest = pixelTagCache.keys().next().value;
      pixelTagCache.delete(oldest);
    }
  }
  return tags;
}

async function mapWithConcurrency(items, limit, mapper) {
  const out = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      out[current] = await mapper(items[current], current);
    }
  });
  await Promise.all(workers);
  return out;
}

function resolveStudyModality(risStudy, orthancStudy, seriesRows) {
  const risModality = risStudy?.modality && risStudy.modality !== 'OT' ? risStudy.modality : null;
  const modalitiesInStudy = orthancStudy?.MainDicomTags?.ModalitiesInStudy?.split?.('\\')?.[0];
  const firstSeriesModality = seriesRows.find((s) => s.modality)?.modality;
  return risModality || modalitiesInStudy || firstSeriesModality || 'OT';
}

async function loadRisStudyForTenant(pool, studyUID, tid) {
  const r = await pool.query(
    `SELECT * FROM ris_studies
     WHERE study_instance_uid = $1
       AND ($2::bigint IS NULL OR lab_id = $2 OR tenant_id = $2)
     ORDER BY created_at DESC
     LIMIT 1`,
    [studyUID, tid || null],
  );
  return r.rows[0] || null;
}

async function ensureStudyIndexedFromOrthanc(pool, studyUID, tid) {
  const uid = cleanDicomUid(studyUID);
  if (!uid || !tid) return null;

  const risStudy = await loadRisStudyForTenant(pool, uid, tid);
  if (!risStudy) return null;

  const orthancStudy = await fetchOrthancStudyByUid(uid).catch(() => null);
  if (!orthancStudy?.ID) return null;

  const orthancInstanceIds = await listOrthancStudyInstances(orthancStudy.ID).catch(() => []);
  if (!orthancInstanceIds.length) return null;

  const seriesCache = new Map();
  const instanceRows = [];

  for (const instanceId of orthancInstanceIds) {
    try {
      const meta = await fetchOrthancInstanceMetadata(instanceId);
      const mainTags = meta?.MainDicomTags || {};
      const seriesId = meta?.ParentSeries;
      let seriesTags = {};
      if (seriesId) {
        if (!seriesCache.has(seriesId)) {
          const seriesMeta = await fetchOrthancSeriesMetadata(seriesId).catch(() => null);
          seriesCache.set(seriesId, seriesMeta?.MainDicomTags || {});
        }
        seriesTags = seriesCache.get(seriesId) || {};
      }
      const sopUid = mainTags.SOPInstanceUID;
      if (!sopUid) continue;
      instanceRows.push({
        orthancInstanceId: instanceId,
        sopInstanceUid: sopUid,
        seriesInstanceUid: seriesTags.SeriesInstanceUID || mainTags.SeriesInstanceUID || DEFAULT_SERIES_UID,
        modality: seriesTags.Modality || mainTags.Modality || risStudy.modality || 'OT',
        instanceNumber: parseInt(mainTags.InstanceNumber || '1', 10) || 1,
      });
    } catch (err) {
      console.warn('[DICOM] Orthanc lazy index instance skipped:', err?.message || err);
    }
  }

  if (!instanceRows.length) return null;
  const modality = resolveStudyModality(risStudy, orthancStudy, instanceRows);
  const studyTags = orthancStudy.MainDicomTags || {};
  const patientTags = orthancStudy.PatientMainDicomTags || {};

  const studyRes = await pool.query(
    `INSERT INTO hg_dicom_studies
       (study_instance_uid, patient_id, patient_name, modality, study_date, study_description,
        accession_number, tenant_id, created_by, num_instances, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
     ON CONFLICT (study_instance_uid, tenant_id)
     DO UPDATE SET patient_name = COALESCE(EXCLUDED.patient_name, hg_dicom_studies.patient_name),
                   modality = COALESCE(EXCLUDED.modality, hg_dicom_studies.modality),
                   study_date = COALESCE(EXCLUDED.study_date, hg_dicom_studies.study_date),
                   study_description = COALESCE(EXCLUDED.study_description, hg_dicom_studies.study_description),
                   accession_number = COALESCE(EXCLUDED.accession_number, hg_dicom_studies.accession_number),
                   num_instances = EXCLUDED.num_instances,
                   updated_at = NOW()
     RETURNING *`,
    [
      uid,
      patientTags.PatientID || risStudy.patient_id || null,
      patientTags.PatientName || risStudy.patient_name || null,
      modality,
      formatDicomStudyDate(studyTags.StudyDate) || risStudy.study_date || null,
      studyTags.StudyDescription || risStudy.study_description || null,
      studyTags.AccessionNumber || risStudy.accession_number || null,
      tid,
      tid,
      instanceRows.length,
    ],
  );

  const values = [];
  const placeholders = [];
  instanceRows.forEach((row, idx) => {
    const base = idx * 9;
    placeholders.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},NOW())`);
    values.push(
      row.sopInstanceUid,
      uid,
      row.seriesInstanceUid,
      `orthanc://${row.orthancInstanceId}`,
      'application/dicom',
      row.modality,
      row.instanceNumber,
      tid,
      row.orthancInstanceId,
    );
  });

  await pool.query(
    `INSERT INTO hg_dicom_instances
       (sop_instance_uid, study_instance_uid, series_instance_uid, file_path, content_type,
        modality, instance_number, tenant_id, orthanc_instance_id, created_at)
     VALUES ${placeholders.join(',')}
     ON CONFLICT (sop_instance_uid, tenant_id)
     DO UPDATE SET study_instance_uid = EXCLUDED.study_instance_uid,
                   series_instance_uid = EXCLUDED.series_instance_uid,
                   file_path = CASE
                     WHEN hg_dicom_instances.file_path IS NULL
                       OR hg_dicom_instances.file_path = ''
                       OR hg_dicom_instances.file_path LIKE 'orthanc://%'
                     THEN EXCLUDED.file_path
                     ELSE hg_dicom_instances.file_path
                   END,
                   content_type = EXCLUDED.content_type,
                   modality = EXCLUDED.modality,
                   instance_number = EXCLUDED.instance_number,
                   orthanc_instance_id = EXCLUDED.orthanc_instance_id,
                   updated_at = NOW()`,
    values,
  );

  await pool.query(
    `UPDATE ris_studies
     SET modality = CASE WHEN modality IS NULL OR modality = 'OT' THEN $3 ELSE modality END,
         series_count = GREATEST(COALESCE(series_count, 0), $4),
         image_count = GREATEST(COALESCE(image_count, 0), $5),
         updated_at = NOW()
     WHERE id = $1 AND lab_id = $2`,
    [risStudy.id, tid, modality, seriesCache.size || 1, instanceRows.length],
  ).catch(() => {});

  return studyRes.rows[0] || null;
}

async function loadStudy(pool, studyUID, tid) {
  const uid = cleanDicomUid(studyUID);
  const r = await pool.query(
    `SELECT * FROM hg_dicom_studies WHERE study_instance_uid = $1 AND tenant_id = $2`,
    [uid, tid],
  );
  return r.rows[0] || await ensureStudyIndexedFromOrthanc(pool, uid, tid);
}

async function loadInstances(pool, studyUID, tid, seriesUID = null) {
  const uid = cleanDicomUid(studyUID);
  const series = cleanDicomUid(seriesUID);
  const r = await pool.query(
    `SELECT * FROM hg_dicom_instances
     WHERE study_instance_uid = $1 AND tenant_id = $2
       AND ($3::text IS NULL OR series_instance_uid = $3)
     ORDER BY instance_number NULLS LAST, created_at ASC`,
    [uid, tid, series || null],
  );
  return r.rows;
}

// ── STOW-RS ───────────────────────────────────────────────────────────────────
router.post('/studies', authAnyDicom, upload.array('files'), async (req, res) => {
  try {
    const pool = await connectPostgres();
    const tid = tenantId(req);
    let studyUID = req.body.studyInstanceUID || null;
    let patientId = req.body.patientId || null;
    let patientName = req.body.patientName || null;
    let modality = req.body.modality || null;
    let studyDate = req.body.studyDate || null;
    let studyDescription = req.body.studyDescription || null;
    let accessionNumber = req.body.accessionNumber || null;

    const instances = [];
    for (const file of req.files || []) {
      let buffer = file.buffer;
      if (!buffer && file.key) {
        try { buffer = await s3GetObjectBuffer(file.key); } catch { /* uploaded via multer-s3 */ }
      }
      const tags = buffer ? parseDicomBuffer(buffer) : null;
      studyUID = studyUID || tags?.studyInstanceUID || `2.25.${Date.now()}`;
      patientId = patientId || tags?.patientId;
      patientName = patientName || tags?.patientName;
      modality = modality || tags?.modality;
      studyDate = studyDate || tags?.studyDate;
      studyDescription = studyDescription || tags?.studyDescription;
      accessionNumber = accessionNumber || tags?.accessionNumber;

      const sopUID = req.body.sopInstanceUID || tags?.sopInstanceUID || `2.25.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
      const seriesUID = req.body.seriesInstanceUID || tags?.seriesInstanceUID || DEFAULT_SERIES_UID;

      await pool.query(
        `INSERT INTO hg_dicom_instances
           (sop_instance_uid, study_instance_uid, series_instance_uid, file_path, file_size,
            content_type, modality, instance_number, tenant_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
         ON CONFLICT (sop_instance_uid, tenant_id) DO UPDATE
           SET file_path = EXCLUDED.file_path, file_size = EXCLUDED.file_size`,
        [sopUID, studyUID, seriesUID, file.key, file.size, file.mimetype || 'application/dicom',
         modality, tags?.instanceNumber || 1, tid],
      );
      instances.push({ sopInstanceUID: sopUID, seriesInstanceUID: seriesUID, s3Key: file.key });
    }

    if (!studyUID) studyUID = `2.25.${Date.now()}`;

    const studyRes = await pool.query(
      `INSERT INTO hg_dicom_studies
         (study_instance_uid, patient_id, patient_name, modality, study_date, study_description,
          accession_number, tenant_id, created_by, num_instances, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
       ON CONFLICT (study_instance_uid, tenant_id)
       DO UPDATE SET modality = COALESCE($4, hg_dicom_studies.modality),
                     study_description = COALESCE($6, hg_dicom_studies.study_description),
                     num_instances = $10, updated_at = NOW()
       RETURNING *`,
      [studyUID, patientId, patientName, modality, studyDate, studyDescription, accessionNumber,
       tid, req.user.id, instances.length],
    );

    await publishEvent({
      type: 'ImagingStudyStored',
      source: 'dicom',
      tenantId: tid,
      patientId: patientId || null,
      payload: { studyInstanceUID: studyUID, modality, instanceCount: instances.length },
    });

    if (wantsDicomJson(req)) {
      return res.status(200).json([studyToDicomJson(studyRes.rows[0], instances.length)]);
    }
    res.status(200).json({
      success: true,
      studyInstanceUID: studyUID,
      study: studyRes.rows[0],
      instances,
    });
  } catch (err) {
    console.error('[DICOM] Store error:', err);
    res.status(500).json({ success: false, message: 'Failed to store DICOM study' });
  }
});

// ── QIDO-RS: studies ──────────────────────────────────────────────────────────
router.get('/studies', authAnyDicom, async (req, res) => {
  try {
    const startedAt = Date.now();
    const policy = dicomPolicyForRequest(req);
    const { PatientID, patientId, Modality, modality, StudyDate, studyDate, limit = 50, page = 1 } = req.query;
    const pid = PatientID || patientId;
    const mod = Modality || modality;
    const sdate = StudyDate || studyDate;
    const tid = tenantId(req);
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const pool = await connectPostgres();
    const r = await pool.query(
      `SELECT s.*, COUNT(i.id)::int AS instance_count
       FROM hg_dicom_studies s
       LEFT JOIN hg_dicom_instances i
         ON i.study_instance_uid = s.study_instance_uid AND i.tenant_id = s.tenant_id
       WHERE s.tenant_id = $1
         AND ($2::text IS NULL OR s.patient_id::text = $2 OR s.patient_name ILIKE '%' || $2 || '%')
         AND ($3::text IS NULL OR s.modality = $3)
         AND ($4::text IS NULL OR s.study_date::text = $4)
       GROUP BY s.id
       ORDER BY s.created_at DESC
       LIMIT $5 OFFSET $6`,
      [tid, pid || null, mod || null, sdate || null, parseInt(limit, 10), offset],
    );

    if (wantsDicomJson(req)) {
      setDicomCacheHeaders(res, 'list', policy);
      setServerTiming(res, 'dicomweb-studies', startedAt);
      res.setHeader('Content-Type', 'application/dicom+json');
      return res.json(r.rows.map((row) => studyToDicomJson(row, row.instance_count)));
    }
    setDicomCacheHeaders(res, 'list', policy);
    setServerTiming(res, 'dicomweb-studies', startedAt);
    res.json({ success: true, studies: r.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to query studies' });
  }
});

// ── QIDO-RS: series (all tenants studies) ───────────────────────────────────
router.get('/series', authAnyDicom, async (req, res) => {
  try {
    const startedAt = Date.now();
    const policy = dicomPolicyForRequest(req);
    const { StudyInstanceUID, studyUID } = req.query;
    const uid = StudyInstanceUID || studyUID;
    if (!uid) return res.status(400).json({ success: false, message: 'StudyInstanceUID required' });
    const pool = await connectPostgres();
    const tid = tenantId(req);
    const study = await loadStudy(pool, uid, tid);
    if (!study) return res.status(404).json([]);
    const instances = await loadInstances(pool, uid, tid);
    const grouped = groupInstancesBySeries(instances);
    const series = [...grouped.entries()].map(([seriesUid, insts]) =>
      seriesToDicomJson(study, seriesUid, insts),
    );
    if (wantsDicomJson(req)) {
      setDicomCacheHeaders(res, 'list', policy);
      setServerTiming(res, 'dicomweb-series', startedAt);
      res.setHeader('Content-Type', 'application/dicom+json');
      return res.json(series);
    }
    setDicomCacheHeaders(res, 'list', policy);
    setServerTiming(res, 'dicomweb-series', startedAt);
    return res.json({ success: true, series });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to query series' });
  }
});

// ── QIDO-RS: instances ────────────────────────────────────────────────────────
router.get('/instances', authAnyDicom, async (req, res) => {
  try {
    const startedAt = Date.now();
    const policy = dicomPolicyForRequest(req);
    const { StudyInstanceUID, SeriesInstanceUID } = req.query;
    if (!StudyInstanceUID) return res.status(400).json({ success: false, message: 'StudyInstanceUID required' });
    const pool = await connectPostgres();
    const tid = tenantId(req);
    const study = await loadStudy(pool, StudyInstanceUID, tid);
    if (!study) return res.status(404).json([]);
    const instances = await loadInstances(pool, StudyInstanceUID, tid, SeriesInstanceUID || null);
    const payload = instances.map((inst) => instanceToDicomJson(study, inst));
    if (wantsDicomJson(req)) {
      setDicomCacheHeaders(res, 'metadata', policy);
      setServerTiming(res, 'dicomweb-instances', startedAt);
      res.setHeader('Content-Type', 'application/dicom+json');
      return res.json(payload);
    }
    setDicomCacheHeaders(res, 'metadata', policy);
    setServerTiming(res, 'dicomweb-instances', startedAt);
    return res.json({ success: true, instances });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to query instances' });
  }
});

// ── WADO-RS: study metadata (legacy + OHIF) ───────────────────────────────────
router.get('/studies/:studyUID', authAnyDicom, async (req, res) => {
  try {
    const startedAt = Date.now();
    const policy = dicomPolicyForRequest(req);
    const pool = await connectPostgres();
    const tid = tenantId(req);
    const study = await loadStudy(pool, req.params.studyUID, tid);
    if (!study) return res.status(404).json({ success: false, message: 'Study not found' });
    const instances = await loadInstances(pool, req.params.studyUID, tid);
    if (wantsDicomJson(req)) {
      setDicomCacheHeaders(res, 'metadata', policy);
      setServerTiming(res, 'dicomweb-study', startedAt);
      res.setHeader('Content-Type', 'application/dicom+json');
      return res.json([studyToDicomJson(study, instances.length)]);
    }
    setDicomCacheHeaders(res, 'metadata', policy);
    setServerTiming(res, 'dicomweb-study', startedAt);
    res.json({ success: true, study, instances });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to retrieve study' });
  }
});

// ── QIDO-RS: series for study ─────────────────────────────────────────────────
router.get('/studies/:studyUID/series', authAnyDicom, async (req, res) => {
  try {
    const startedAt = Date.now();
    const policy = dicomPolicyForRequest(req);
    const pool = await connectPostgres();
    const tid = tenantId(req);
    const study = await loadStudy(pool, req.params.studyUID, tid);
    if (!study) return res.status(404).json([]);
    const instances = await loadInstances(pool, req.params.studyUID, tid);
    const grouped = groupInstancesBySeries(instances);
    const series = [...grouped.entries()].map(([seriesUid, insts]) =>
      seriesToDicomJson(study, seriesUid, insts),
    );
    if (wantsDicomJson(req)) {
      setDicomCacheHeaders(res, 'list', policy);
      setServerTiming(res, 'dicomweb-series', startedAt);
      res.setHeader('Content-Type', 'application/dicom+json');
      return res.json(series);
    }
    setDicomCacheHeaders(res, 'list', policy);
    setServerTiming(res, 'dicomweb-series', startedAt);
    return res.json({ success: true, series });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to retrieve series' });
  }
});

// ── QIDO-RS: instances for series ─────────────────────────────────────────────
router.get('/studies/:studyUID/series/:seriesUID/instances', authAnyDicom, async (req, res) => {
  try {
    const startedAt = Date.now();
    const policy = dicomPolicyForRequest(req);
    const pool = await connectPostgres();
    const tid = tenantId(req);
    const study = await loadStudy(pool, req.params.studyUID, tid);
    if (!study) return res.status(404).json([]);
    const instances = await loadInstances(pool, req.params.studyUID, tid, req.params.seriesUID);
    const payload = instances.map((inst) => instanceToDicomJson(study, inst));
    if (wantsDicomJson(req)) {
      setDicomCacheHeaders(res, 'metadata', policy);
      setServerTiming(res, 'dicomweb-instances', startedAt);
      res.setHeader('Content-Type', 'application/dicom+json');
      return res.json(payload);
    }
    setDicomCacheHeaders(res, 'metadata', policy);
    setServerTiming(res, 'dicomweb-instances', startedAt);
    return res.json({ success: true, instances });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to retrieve instances' });
  }
});

// ── WADO-RS: series metadata — OHIF's dicomweb-client fetches this per series before
// it knows what instances/frames to render; was entirely missing, causing every series
// to fail to load despite the study and series lists themselves resolving correctly.
router.get('/studies/:studyUID/series/:seriesUID/metadata', authAnyDicom, async (req, res) => {
  try {
    const startedAt = Date.now();
    const policy = dicomPolicyForRequest(req);
    const pool = await connectPostgres();
    const tid = tenantId(req);
    const study = await loadStudy(pool, req.params.studyUID, tid);
    if (!study) return res.status(404).json([]);
    const instances = await loadInstances(pool, req.params.studyUID, tid, req.params.seriesUID);
    // Rows/Columns/BitsAllocated/PhotometricInterpretation etc. aren't stored in
    // hg_dicom_instances — parsed from each real file so cornerstone can actually
    // interpret the pixel bytes returned by the frames endpoint (see imagePixelTagsFromBuffer).
    const payload = (await mapWithConcurrency(instances, OHIF_METADATA_CONCURRENCY, async (inst) => {
      let pixelTags = null;
      try {
        pixelTags = await getPixelTagsForInstance(inst);
      } catch { /* fall back to metadata without pixel tags */ }
      if (!shouldExposeInstanceToOhif(pixelTags)) return null;
      return instanceToDicomJson(study, inst, pixelTags);
    })).filter(Boolean);
    const elapsed = Date.now() - startedAt;
    recordDicomMetric('dicomweb_metadata_requests', 1, {
      mode: policy.mode,
      modality: study.modality || 'OT',
      status: 'ok',
    });
    recordDicomMetric('dicomweb_metadata_latency_ms', elapsed, {
      mode: policy.mode,
      modality: study.modality || 'OT',
    });
    setDicomCacheHeaders(res, 'metadata', policy);
    setServerTiming(res, 'dicomweb-metadata', startedAt);
    res.setHeader('X-Mediqzy-Metadata-Instances', String(payload.length));
    res.setHeader('Content-Type', 'application/dicom+json');
    return res.json(payload);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to retrieve series metadata' });
  }
});

router.get('/studies/:studyUID/ai-readiness', authAnyDicom, async (req, res) => {
  const startedAt = Date.now();
  const policy = dicomPolicyForRequest(req);
  try {
    const pool = await connectPostgres();
    const tid = tenantId(req);
    const study = await loadStudy(pool, req.params.studyUID, tid);
    if (!study) return res.status(404).json({ success: false, message: 'Study not found' });
    const instances = await loadInstances(pool, req.params.studyUID, tid);
    const grouped = groupInstancesBySeries(instances);
    const series = [];

    for (const [seriesUid, insts] of grouped.entries()) {
      const sampledTags = (await mapWithConcurrency(insts.slice(0, Math.min(insts.length, 8)), 4, async (inst) => {
        try {
          return await getPixelTagsForInstance(inst);
        } catch {
          return { _parseFailed: true };
        }
      })).filter((tags) => shouldExposeInstanceToOhif(tags));

      const imageInstances = sampledTags.length ? insts.length : 0;
      const first = sampledTags[0] || {};
      const modality = insts[0]?.modality || study.modality || 'OT';
      const rows = firstTagValue(first, '00280010');
      const columns = firstTagValue(first, '00280011');
      const pixelSpacing = firstTagValue(first, '00280030');
      const imagePosition = firstTagValue(first, '00200032');
      const imageOrientation = firstTagValue(first, '00200037');
      const sliceThickness = firstTagValue(first, '00180050');
      const transferSyntaxUID = firstTagValue(first, '00020010');
      const warnings = [];
      if (!imageInstances) warnings.push('no_pixel_instances');
      if (modalityIsVolumetric(modality) && imageInstances < 8) warnings.push('low_slice_count_for_volume_ai');
      if (!rows || !columns) warnings.push('missing_rows_or_columns');
      if (!pixelSpacing) warnings.push('missing_pixel_spacing');
      if (modalityIsVolumetric(modality) && (!imagePosition || !imageOrientation)) warnings.push('missing_position_or_orientation');
      if (modalityIsVolumetric(modality) && !sliceThickness && !imagePosition) warnings.push('unverified_slice_spacing');
      if (!transferSyntaxUID) warnings.push('missing_transfer_syntax');

      series.push({
        seriesInstanceUID: seriesUid,
        modality,
        instanceCount: insts.length,
        sampledImageInstances: sampledTags.length,
        imageInstances,
        transferSyntaxUID: transferSyntaxUID || null,
        geometry: {
          rows: rows ? Number(rows) : null,
          columns: columns ? Number(columns) : null,
          pixelSpacing: pixelSpacing || null,
          hasImagePosition: Boolean(imagePosition),
          hasImageOrientation: Boolean(imageOrientation),
          sliceThickness: sliceThickness || null,
        },
        gpuReady: warnings.length === 0,
        warnings,
      });
    }

    const volumetricSeries = series.filter((s) => modalityIsVolumetric(s.modality) && s.imageInstances > 1);
    const readySeries = series.filter((s) => s.gpuReady);
    const elapsed = Date.now() - startedAt;
    recordDicomMetric('dicomweb_ai_readiness_requests', 1, {
      mode: policy.mode,
      status: 'ok',
      modality: study.modality || 'OT',
    });
    setDicomCacheHeaders(res, 'metadata', policy);
    setServerTiming(res, 'dicomweb-ai-readiness', startedAt);
    return res.json({
      success: true,
      studyInstanceUID: cleanDicomUid(req.params.studyUID),
      modality: study.modality || 'OT',
      elapsedMs: elapsed,
      summary: {
        seriesCount: series.length,
        readySeriesCount: readySeries.length,
        volumetricSeriesCount: volumetricSeries.length,
        gpuReady: readySeries.length > 0,
      },
      series,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to assess AI readiness' });
  }
});

async function streamInstance(req, res) {
  const startedAt = Date.now();
  const policy = dicomPolicyForRequest(req);
  const pool = await connectPostgres();
  const tid = tenantId(req);
  const studyUID = cleanDicomUid(req.params.studyUID);
  const seriesUID = cleanDicomUid(req.params.seriesUID);
  const sopUID = cleanDicomUid(req.params.sopUID);
  const r = await pool.query(
    `SELECT i.* FROM hg_dicom_instances i
     WHERE i.sop_instance_uid = $1 AND i.study_instance_uid = $2 AND i.tenant_id = $3
       AND ($4::text IS NULL OR i.series_instance_uid = $4)`,
    [sopUID, studyUID, tid, seriesUID || null],
  );
  if (!r.rows[0]) return res.status(404).json({ success: false, message: 'Instance not found' });
  const inst = r.rows[0];
  const { logImagingPhiAccess } = await import('../services/imaging/imaging-phi-access-log.service.js');
  await logImagingPhiAccess({
    actorId: req.user?.id || req.lab?.id,
    actorRole: req.userRole || req.user?.role || 'unknown',
    actorEmail: req.user?.email || req.lab?.email || null,
    resourceType: 'dicom_instance',
    resourceId: String(inst.id || sopUID),
    studyInstanceUid: studyUID,
    seriesInstanceUid: seriesUID || inst.series_instance_uid,
    sopInstanceUid: sopUID,
    path: req.path,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  }).catch(() => {});
  if (req.path.includes('/frames/')) {
    // WADO-RS frame retrieval must return the raw pixel payload for the requested
    // frame (correctly split by transfer syntax), not the whole .dcm file — the
    // cornerstone image loader can't decode a full DICOM P10 buffer as if it were
    // bare pixel data (was returning `content-type: application/dicom` for the
    // entire file here, which decoded as garbage/undefined in the browser).
    const buf = await getDicomInstanceBuffer(inst);
    const frameNumber = parseInt(req.params.frame, 10) || 1;
    if (req.path.endsWith('/rendered')) {
      try {
        const rendered = await renderFramePreviewJpeg(buf, frameNumber, {
          maxWidth: req.query.maxWidth || policy.renderedMaxWidth,
          quality: req.query.jpegQuality || req.query.renderQuality || policy.renderedJpegQuality,
        });
        if (!rendered) return res.status(404).json({ success: false, message: 'Rendered frame not found' });
        const elapsed = Date.now() - startedAt;
        recordDicomMetric('dicomweb_rendered_frame_requests', 1, {
          mode: policy.mode,
          modality: inst.modality || 'OT',
          status: 'ok',
        });
        recordDicomMetric('dicomweb_rendered_frame_latency_ms', elapsed, {
          mode: policy.mode,
          modality: inst.modality || 'OT',
        });
        recordDicomMetric('dicomweb_rendered_frame_bytes', rendered.bytes.length, {
          mode: policy.mode,
          modality: inst.modality || 'OT',
        });
        setDicomCacheHeaders(res, 'rendered', policy);
        setServerTiming(res, 'dicomweb-rendered-frame', startedAt);
        res.setHeader('Content-Type', rendered.contentType);
        res.setHeader('X-Mediqzy-Source-Rows', String(rendered.sourceRows));
        res.setHeader('X-Mediqzy-Source-Columns', String(rendered.sourceColumns));
        res.setHeader('X-Mediqzy-Rendered-Max-Width', String(rendered.maxWidth));
        res.setHeader('X-Mediqzy-Rendered-Jpeg-Quality', String(rendered.quality));
        return res.send(rendered.bytes);
      } catch (err) {
        console.warn('[DICOM] Rendered frame failed:', {
          studyUID,
          seriesUID: seriesUID || inst.series_instance_uid,
          sopUID,
          message: err?.message || String(err),
        });
        recordDicomMetric('dicomweb_rendered_frame_requests', 1, {
          mode: policy.mode,
          modality: inst.modality || 'OT',
          status: 'unsupported',
        });
        return res.status(415).json({
          success: false,
          message: 'Rendered preview is unsupported for this transfer syntax',
        });
      }
    }

    let frame;
    try {
      frame = extractFramePixelData(buf, frameNumber);
    } catch (err) {
      console.warn('[DICOM] Frame extraction failed:', {
        studyUID,
        seriesUID: seriesUID || inst.series_instance_uid,
        sopUID,
        message: err?.message || String(err),
      });
      recordDicomMetric('dicomweb_frame_requests', 1, {
        mode: policy.mode,
        modality: inst.modality || 'OT',
        status: 'unsupported',
      });
      return res.status(415).json({
        success: false,
        message: 'Frame transfer syntax is unsupported or pixel data is malformed',
      });
    }
    if (!frame) return res.status(404).json({ success: false, message: 'Frame not found' });
    const { body, boundary } = buildMultipartRelated([{
      bytes: frame.bytes,
      contentType: frame.contentType,
      transferSyntaxUID: frame.transferSyntaxUID,
    }]);
    // transfer-syntax tells cornerstone's WADO-RS loader how to interpret the raw bytes
    // (uncompressed vs. which compression codec) — application/octet-stream alone is
    // ambiguous and the loader silently mis-decodes without it (PS3.18 requirement).
    const elapsed = Date.now() - startedAt;
    recordDicomMetric('dicomweb_frame_requests', 1, {
      mode: policy.mode,
      modality: inst.modality || 'OT',
      status: 'ok',
      transferSyntaxUID: frame.transferSyntaxUID,
    });
    recordDicomMetric('dicomweb_frame_latency_ms', elapsed, {
      mode: policy.mode,
      modality: inst.modality || 'OT',
      transferSyntaxUID: frame.transferSyntaxUID,
    });
    recordDicomMetric('dicomweb_frame_bytes', body.length, {
      mode: policy.mode,
      modality: inst.modality || 'OT',
      transferSyntaxUID: frame.transferSyntaxUID,
    });
    setDicomCacheHeaders(res, 'frame', policy);
    setServerTiming(res, 'dicomweb-frame', startedAt);
    res.setHeader('X-Mediqzy-Frame-Bytes', String(body.length));
    res.setHeader('Content-Type', `multipart/related; type="${frame.contentType}"; transfer-syntax="${frame.transferSyntaxUID}"; boundary="${boundary}"`);
    return res.send(body);
  }
  const accept = String(req.headers.accept || '').toLowerCase();
  if (accept.includes('application/dicom')) {
    const buf = await getDicomInstanceBuffer(inst);
    setDicomCacheHeaders(res, 'instance', policy);
    setServerTiming(res, 'dicomweb-instance', startedAt);
    res.setHeader('Content-Type', inst.content_type || 'application/dicom');
    return res.send(buf);
  }
  if (isOrthancFilePath(inst.file_path)) {
    const buf = await getDicomInstanceBuffer(inst);
    setDicomCacheHeaders(res, 'instance', policy);
    setServerTiming(res, 'dicomweb-instance', startedAt);
    res.setHeader('Content-Type', inst.content_type || 'application/dicom');
    return res.send(buf);
  }
  const url = await s3PresignedUrl(inst.file_path, 3600);
  return res.redirect(302, url);
}

// ── WADO-RS: retrieve instance (OHIF standard path) ───────────────────────────
router.get('/studies/:studyUID/series/:seriesUID/instances/:sopUID', authAnyDicom, streamInstance);
router.get('/studies/:studyUID/series/:seriesUID/instances/:sopUID/frames/:frame', authAnyDicom, streamInstance);
router.get('/studies/:studyUID/series/:seriesUID/instances/:sopUID/frames/:frame/rendered', authAnyDicom, streamInstance);

// ── Legacy instance file redirect ─────────────────────────────────────────────
router.get('/studies/:studyUID/instances/:sopUID/file', authAnyDicom, async (req, res) => {
  req.params.seriesUID = null;
  return streamInstance(req, res);
});

// ── Modality Worklist ─────────────────────────────────────────────────────────
router.get('/worklist', authAnyDicom, async (req, res) => {
  try {
    const { modality, date } = req.query;
    const pool = await connectPostgres();
    const r = await pool.query(
      `SELECT * FROM hg_dicom_worklist
       WHERE tenant_id = $1
         AND ($2::text IS NULL OR modality = $2)
         AND ($3::date IS NULL OR scheduled_date = $3::date)
         AND status NOT IN ('completed','cancelled')
       ORDER BY scheduled_date ASC, scheduled_time ASC NULLS LAST`,
      [tenantId(req), modality || null, date || null],
    );
    res.json({ success: true, worklist: r.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch worklist' });
  }
});

router.post('/worklist', authAnyDicom, requireRole(['admin', 'hospital', 'doctor']), async (req, res) => {
  try {
    const { patientId, patientName, modality, scheduledDate, scheduledTime, requestedProcedure, accessionNumber } = req.body;
    if (!patientId || !modality || !scheduledDate) {
      return res.status(400).json({ success: false, message: 'patientId, modality, scheduledDate required' });
    }
    const pool = await connectPostgres();
    const r = await pool.query(
      `INSERT INTO hg_dicom_worklist
         (patient_id, patient_name, modality, scheduled_date, scheduled_time,
          requested_procedure, accession_number, tenant_id, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'scheduled',NOW()) RETURNING *`,
      [patientId, patientName || null, modality, scheduledDate, scheduledTime || null,
       requestedProcedure || null, accessionNumber || null, tenantId(req)],
    );
    res.status(201).json({ success: true, item: r.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to add worklist item' });
  }
});

router.post('/studies/:studyUID/report', authAnyDicom, requireRole(['admin', 'hospital', 'doctor']), async (req, res) => {
  try {
    const { findings, impression, reportedBy } = req.body;
    if (!findings) return res.status(400).json({ success: false, message: 'findings required' });
    const pool = await connectPostgres();
    const r = await pool.query(
      `INSERT INTO hg_dicom_reports
         (study_instance_uid, findings, impression, reported_by, tenant_id, reported_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (study_instance_uid, tenant_id)
       DO UPDATE SET findings=$2, impression=$3, reported_by=$4, updated_at=NOW()
       RETURNING *`,
      [req.params.studyUID, findings, impression || null, reportedBy || req.user.id, tenantId(req)],
    );
    res.json({ success: true, report: r.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to save report' });
  }
});

export default router;
