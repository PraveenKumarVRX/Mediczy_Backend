/**
 * Orthanc → HyperGrid bridge.
 * On Orthanc NewInstance webhook, forwards DICOM to Mediczy STOW-RS (S3 + hg_dicom_*).
 */
import fetch from 'node-fetch';
import FormData from 'form-data';
import logger from '../config/logger.js';
import { orthancBasicAuthHeader } from '../utils/orthanc-credentials.js';

const ORTHANC_URL = (process.env.ORTHANC_URL || 'http://127.0.0.1:8042').replace(/\/$/, '');
const MEDICZY_API_URL = process.env.MEDICZY_API_URL || process.env.API_BASE_URL || 'http://127.0.0.1:8888';
const BRIDGE_TOKEN = process.env.ORTHANC_BRIDGE_TOKEN || process.env.MEDICZY_INTERNAL_TOKEN || '';

function orthancAuthHeader() {
  return orthancBasicAuthHeader({ defaultUser: 'pacs' });
}

export async function fetchOrthancInstance(instanceId) {
  const res = await fetch(`${ORTHANC_URL}/instances/${instanceId}/file`, {
    headers: orthancAuthHeader(),
    timeout: 120000,
  });
  if (!res.ok) throw new Error(`Orthanc fetch failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function fetchOrthancInstanceMetadata(instanceId) {
  const res = await fetch(`${ORTHANC_URL}/instances/${instanceId}`, {
    headers: orthancAuthHeader(),
    timeout: 15000,
  });
  if (!res.ok) throw new Error(`Orthanc metadata failed: ${res.status}`);
  return res.json();
}

export async function fetchOrthancSeriesMetadata(seriesId) {
  const res = await fetch(`${ORTHANC_URL}/series/${seriesId}`, {
    headers: orthancAuthHeader(),
    timeout: 15000,
  });
  if (!res.ok) throw new Error(`Orthanc series metadata failed: ${res.status}`);
  return res.json();
}

/**
 * POST DICOM buffer to HyperGrid STOW-RS.
 *
 * `tenantId` must be a real, already-resolved lab id (see
 * resolveLabIdForOrthancIngest in imaging-ris-auto-ingest.service.js) — the
 * caller (handleOrthancNewInstance) is responsible for not calling this at
 * all when resolution fails. This used to silently fall back to
 * process.env.MEDICZY_IMAGING_BRIDGE_TENANT_ID whenever tenantId was falsy;
 * that env var was hardcoded to lab 2368 ("Rado Labs") and, because the
 * Orthanc webhook payload never actually carries a tenantId, fired on
 * effectively every single ingest — every other lab's studies (confirmed:
 * ICH Egmore's MRI studies, 153 of them through 2026-09-08) were silently
 * stamped into Rado Labs' tenant in hg_dicom_studies. The receiving route
 * (POST /api/hypergrid/dicom/studies, via authAnyDicom's internal-bridge
 * branch) already 400s on a missing X-Tenant-Id header, so omitting it here
 * for an unresolved tenant fails loudly instead of guessing wrong.
 */
export async function forwardToHyperGridStow(dicomBuffer, meta = {}, tenantId = null) {
  const form = new FormData();
  form.append('files', dicomBuffer, {
    filename: `${meta.sopInstanceUID || 'instance'}.dcm`,
    contentType: 'application/dicom',
  });
  if (meta.studyInstanceUID) form.append('studyInstanceUID', meta.studyInstanceUID);
  if (meta.patientId) form.append('patientId', meta.patientId);
  if (meta.patientName) form.append('patientName', meta.patientName);
  if (meta.modality) form.append('modality', meta.modality);
  if (meta.studyDate) form.append('studyDate', meta.studyDate);
  if (meta.studyDescription) form.append('studyDescription', meta.studyDescription);
  if (meta.accessionNumber) form.append('accessionNumber', meta.accessionNumber);
  if (meta.seriesInstanceUID) form.append('seriesInstanceUID', meta.seriesInstanceUID);
  if (meta.sopInstanceUID) form.append('sopInstanceUID', meta.sopInstanceUID);
  if (tenantId) form.append('tenantId', String(tenantId));

  const headers = { ...form.getHeaders() };
  if (BRIDGE_TOKEN) headers.Authorization = `Bearer ${BRIDGE_TOKEN}`;
  if (tenantId) headers['X-Tenant-Id'] = String(tenantId);

  const res = await fetch(`${MEDICZY_API_URL}/api/hypergrid/dicom/studies`, {
    method: 'POST',
    headers,
    body: form,
    timeout: 180000,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || `STOW failed: ${res.status}`);
  return body;
}

/**
 * Handle Orthanc webhook payload (NewInstance / StableStudy).
 * Forwards to HyperGrid and auto-registers the study on Lab RIS.
 */
export async function handleOrthancNewInstance(payload) {
  const instanceId = payload?.ID || payload?.id || payload?.instanceId;
  const studyId = payload?.studyId || payload?.ParentStudy || payload?.parentStudy;
  if (!instanceId && !studyId) return { skipped: true, reason: 'no instance id' };

  let meta = {};
  let buffer = null;
  let resolvedInstanceId = instanceId;
  // The Orthanc *study* resource ID (not the DICOM StudyInstanceUID) —
  // needed both for the study-tag lookup below and for fetching real
  // instance/series counts afterward. Resolving this once here, correctly,
  // replaces the old `meta?.ParentStudy` reference used further down (an
  // instance response never has that field — see the comment below), which
  // silently left orthanc_study_id null on every NewInstance-triggered row.
  let resolvedStudyId = studyId || null;

  if (instanceId) {
    meta = await fetchOrthancInstanceMetadata(instanceId);
    buffer = await fetchOrthancInstance(instanceId);
    // Orthanc's bare /instances/{id} response never includes StudyInstanceUID
    // in MainDicomTags — that's a study-level tag, only exposed via
    // /studies/{id}. Without this, every NewInstance-triggered ingest (the
    // only event type the polling bridge sends) silently produced an empty
    // studyInstanceUID, causing ensureRisStudyFromOrthancIngest() to skip
    // with reason "no_study_uid" — real studies received and stored, but
    // never becoming a visible ris_studies row. Mirrors the fetch the
    // StableStudy branch below already does for the same reason.
    //
    // An instance's direct Orthanc parent is its SERIES (ParentSeries), not
    // its study — ParentStudy is not a field on the instance resource at
    // all. Study id has to come from the series resource one hop up.
    const parentSeriesId = meta?.ParentSeries;
    if (parentSeriesId) {
      try {
        const { fetchOrthancStudy } = await import('./orthanc-pacs.service.js');
        const seriesMeta = await fetchOrthancSeriesMetadata(parentSeriesId);
        const parentStudyId = seriesMeta?.ParentStudy;
        if (parentStudyId) {
          resolvedStudyId = parentStudyId;
          const studyMeta = await fetchOrthancStudy(parentStudyId);
          if (studyMeta?.MainDicomTags) {
            meta.StudyMainDicomTags = studyMeta.MainDicomTags;
          }
        }
      } catch (_) { /* optional */ }
    }
  } else if (studyId) {
    // StableStudy — pick first instance for tags + optional STOW
    const { listOrthancStudyInstances, fetchOrthancStudy } = await import('./orthanc-pacs.service.js');
    const instances = await listOrthancStudyInstances(studyId);
    resolvedInstanceId = instances[0] || null;
    if (!resolvedInstanceId) return { skipped: true, reason: 'empty study' };
    meta = await fetchOrthancInstanceMetadata(resolvedInstanceId);
    buffer = await fetchOrthancInstance(resolvedInstanceId);
    try {
      const studyMeta = await fetchOrthancStudy(studyId);
      if (studyMeta?.MainDicomTags) {
        meta.StudyMainDicomTags = studyMeta.MainDicomTags;
      }
    } catch (_) { /* optional */ }
  }

  // Authoritative instance/series counts, straight from Orthanc — replaces
  // the old approach of trying to accumulate counts across separate
  // per-instance webhook calls (hardcoded to 1 on insert, never updated
  // after), which undercounted every multi-instance study. A single extra
  // call per ingest; failure here must never block the actual ingest.
  let orthancStats = null;
  if (resolvedStudyId) {
    try {
      const { fetchOrthancStudyStatistics } = await import('./orthanc-pacs.service.js');
      const stats = await fetchOrthancStudyStatistics(resolvedStudyId);
      orthancStats = {
        instanceCount: stats?.CountInstances ?? null,
        seriesCount: stats?.CountSeries ?? null,
      };
    } catch (_) { /* optional — falls back to per-call defaults downstream */ }
  }

  const mainTags = meta?.MainDicomTags || {};
  const studyTags = meta?.StudyMainDicomTags || meta?.ParentStudyMainDicomTags || {};
  const parsedMeta = {
    studyInstanceUID: mainTags.StudyInstanceUID || studyTags.StudyInstanceUID,
    seriesInstanceUID: mainTags.SeriesInstanceUID,
    sopInstanceUID: mainTags.SOPInstanceUID,
    patientId: mainTags.PatientID || studyTags.PatientID,
    patientName: mainTags.PatientName || studyTags.PatientName,
    modality: mainTags.Modality || studyTags.ModalitiesInStudy?.split?.('\\')?.[0],
    studyDate: mainTags.StudyDate || studyTags.StudyDate,
    studyDescription: mainTags.StudyDescription || studyTags.StudyDescription,
    accessionNumber: mainTags.AccessionNumber || studyTags.AccessionNumber,
    patientSex: mainTags.PatientSex || studyTags.PatientSex,
    patientBirthDate: mainTags.PatientBirthDate || studyTags.PatientBirthDate,
    referringPhysician: mainTags.ReferringPhysicianName || studyTags.ReferringPhysicianName,
    // InstitutionName is embedded by the scanner itself at acquisition
    // time — present on every real study regardless of how it later
    // reaches Orthanc, unlike RemoteAET (which can end up generic, e.g.
    // "ORTHANC", for studies relayed through an intermediary rather than
    // received via direct DICOM C-STORE). Used as a fallback lab-routing
    // signal in resolveLabIdForOrthancIngest.
    institutionName: mainTags.InstitutionName || studyTags.InstitutionName || null,
  };

  const { resolveLabIdForOrthancIngest, ensureRisStudyFromOrthancIngest } =
    await import('./imaging/imaging-ris-auto-ingest.service.js');
  const remoteAet = payload?.RemoteAET || payload?.remoteAet || meta?.RemoteAET || null;

  // Resolve ONCE, up front, and reuse for both the HyperGrid STOW forward
  // (hg_dicom_studies) and the RIS ingest below — real per-modality
  // (AE-title) or per-institution routing first, explicit id only as an
  // authoritative override, no single-tenant env default. See the
  // forwardToHyperGridStow doc comment above for why this was previously
  // resolved independently (and wrongly) per call site.
  const resolvedTenantId = await resolveLabIdForOrthancIngest({
    explicitLabId: payload?.tenantId || payload?.labId || null,
    remoteAet,
    institutionName: parsedMeta.institutionName,
  });

  if (!resolvedTenantId) {
    logger.warn('[OrthancBridge] study has no matching AE-title or InstitutionName — quarantined, not forwarded to any lab', {
      remoteAet: remoteAet || null,
      institutionName: parsedMeta.institutionName || null,
      studyInstanceUID: parsedMeta.studyInstanceUID || null,
    });
    return {
      success: false,
      skipped: true,
      reason: 'no_lab_id',
      message: 'Register this modality AE title or InstitutionName under PACS Settings so studies from it route to the correct lab',
    };
  }

  let result = {};
  try {
    result = await forwardToHyperGridStow(buffer, parsedMeta, resolvedTenantId);
  } catch (stowErr) {
    // Still register RIS even if HyperGrid STOW auth is misconfigured
    logger.warn('[OrthancBridge] HyperGrid STOW failed; continuing RIS auto-ingest', {
      error: stowErr.message,
    });
    result = { studyInstanceUID: parsedMeta.studyInstanceUID, stowError: stowErr.message };
  }

  let ris = null;
  try {
    ris = await ensureRisStudyFromOrthancIngest({
      labId: resolvedTenantId,
      remoteAet,
      orthancStudyId: resolvedStudyId || result.orthancStudyId || null,
      orthancInstanceId: resolvedInstanceId,
      orthancStats,
      tags: parsedMeta,
      referringDoctorId: payload?.referringDoctorId || process.env.ORTHANC_DEFAULT_REFERRING_DOCTOR_ID || null,
      fileMeta: {
        fileName: `${parsedMeta.sopInstanceUID || parsedMeta.studyInstanceUID || 'instance'}.dcm`,
        filePath: result.filePath || result.s3Key || `orthanc://${resolvedInstanceId}`,
        s3Key: result.s3Key || result.filePath || null,
        fileSize: buffer?.length || 0,
        mimeType: 'application/dicom',
      },
    });
  } catch (risErr) {
    logger.warn('[OrthancBridge] RIS auto-ingest failed', { error: risErr.message });
    ris = { success: false, error: risErr.message };
  }

  logger.info('[OrthancBridge] Instance forwarded', {
    instanceId: resolvedInstanceId,
    studyInstanceUID: result.studyInstanceUID || parsedMeta.studyInstanceUID,
    risCreated: ris?.created,
    risStudyId: ris?.study?.id,
  });

  return { success: true, instanceId: resolvedInstanceId, ...result, ris };
}

export async function syncOrthancStudy(studyId) {
  const res = await fetch(`${ORTHANC_URL}/studies/${studyId}/instances`, {
    headers: orthancAuthHeader(),
    timeout: 30000,
  });
  if (!res.ok) throw new Error(`Orthanc study list failed: ${res.status}`);
  // /studies/:id/instances returns full instance objects, not plain ID strings.
  const instances = await res.json();
  const results = [];
  for (const inst of instances) {
    const id = inst?.ID || inst;
    try {
      results.push(await handleOrthancNewInstance({ ID: id }));
    } catch (err) {
      results.push({ success: false, instanceId: id, error: err.message });
    }
  }
  return results;
}
