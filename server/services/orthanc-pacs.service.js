/**
 * Orthanc PACS client — STOW-RS ingest and UID resolution.
 * MediQzy stores metadata; Orthanc is the DICOM source of truth for OHIF.
 */
import dicomParser from 'dicom-parser';
import fetch from '../integrations/fetch.js';
import fs from 'fs';
import logger from '../config/logger.js';
import { orthancBasicAuthHeader } from '../utils/orthanc-credentials.js';

const ORTHANC_URL = (process.env.ORTHANC_URL || 'http://127.0.0.1:8042').replace(/\/$/, '');

function basicAuthHeader() {
  return orthancBasicAuthHeader();
}

/** Parse real DICOM UIDs from file buffer using dicom-parser. */
export function parseDicomUids(buffer) {
  try {
    const byteArray = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const dataSet = dicomParser.parseDicom(byteArray);
    const get = (tag) => dataSet.string(tag)?.trim() || null;
    const studyInstanceUID = get('x0020000d');
    const seriesInstanceUID = get('x0020000e');
    const sopInstanceUID = get('x00080018');
    const patientId = get('x00100020');
    const patientName = get('x00100010');
    const modality = get('x00080060');
    const studyDate = get('x00080020');
    const studyDescription = get('x00081030');
    const accessionNumber = get('x00080050');
    const patientSex = get('x00100040');
    const patientBirthDate = get('x00100030');
    const referringPhysician = get('x00080090');
    const isDicom = Boolean(studyInstanceUID && sopInstanceUID);
    return {
      isDicom,
      studyInstanceUID,
      seriesInstanceUID,
      sopInstanceUID,
      patientId,
      patientName,
      modality,
      studyDate,
      studyDescription,
      accessionNumber,
      patientSex,
      patientBirthDate,
      referringPhysician,
    };
  } catch (err) {
    return { isDicom: false, error: err.message };
  }
}

export function parseDicomUidsFromFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  return parseDicomUids(buffer);
}

export function formatDicomStudyDate(raw) {
  if (!raw) return null;
  const s = String(raw).replace(/\D/g, '');
  if (s.length === 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) return String(raw);
  return null;
}

/** DICOMweb STOW-RS — multipart/related to Orthanc. */
export async function stowDicomToOrthanc(buffer, filename = 'instance.dcm') {
  const boundary = `----Mediczy${Date.now()}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/dicom; transfer-syntax=*\r\nContent-Location: ${filename}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const res = await fetch(`${ORTHANC_URL}/dicom-web/studies`, {
    method: 'POST',
    headers: {
      ...basicAuthHeader(),
      'Content-Type': `multipart/related; type="application/dicom"; boundary=${boundary}`,
      Accept: 'application/dicom+json',
    },
    body,
    timeout: 180000,
  });

  const text = await res.text();
  if (!res.ok) {
    logger.warn('[OrthancPACS] STOW-RS failed, trying REST /instances', { status: res.status, body: text.slice(0, 200) });
    return stowDicomViaRest(buffer);
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }

  return resolveUidsAfterStow(parsed, buffer);
}

/** Fallback: Orthanc REST POST /instances */
async function stowDicomViaRest(buffer) {
  const res = await fetch(`${ORTHANC_URL}/instances`, {
    method: 'POST',
    headers: {
      ...basicAuthHeader(),
      'Content-Type': 'application/dicom',
    },
    body: buffer,
    timeout: 180000,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Orthanc ingest failed (${res.status}): ${errText.slice(0, 200)}`);
  }
  const meta = await res.json();
  return resolveUidsFromOrthancIds(meta, buffer);
}

async function resolveUidsFromOrthancIds(meta, buffer) {
  const tags = parseDicomUids(buffer);
  const instanceId = meta.ID;
  let studyUid = tags.studyInstanceUID;
  let seriesUid = tags.seriesInstanceUID;
  let sopUid = tags.sopInstanceUID;

  if (meta.ParentStudy) {
    try {
      const studyRes = await fetch(`${ORTHANC_URL}/studies/${meta.ParentStudy}`, { headers: basicAuthHeader() });
      if (studyRes.ok) {
        const study = await studyRes.json();
        studyUid = study?.MainDicomTags?.StudyInstanceUID || studyUid;
      }
    } catch { /* keep parsed tags */ }
  }

  if (meta.ParentSeries) {
    try {
      const seriesRes = await fetch(`${ORTHANC_URL}/series/${meta.ParentSeries}`, { headers: basicAuthHeader() });
      if (seriesRes.ok) {
        const series = await seriesRes.json();
        seriesUid = series?.MainDicomTags?.SeriesInstanceUID || seriesUid;
      }
    } catch { /* keep parsed tags */ }
  }

  if (instanceId) {
    try {
      const instRes = await fetch(`${ORTHANC_URL}/instances/${instanceId}`, { headers: basicAuthHeader() });
      if (instRes.ok) {
        const inst = await instRes.json();
        sopUid = inst?.MainDicomTags?.SOPInstanceUID || sopUid;
      }
    } catch { /* keep parsed tags */ }
  }

  if (!studyUid || !sopUid) {
    throw new Error('Could not resolve StudyInstanceUID / SOPInstanceUID after Orthanc ingest');
  }

  return {
    orthancInstanceId: instanceId,
    orthancStudyId: meta.ParentStudy || null,
    orthancSeriesId: meta.ParentSeries || null,
    studyInstanceUID: studyUid,
    seriesInstanceUID: seriesUid || `2.25.${Date.now()}.1`,
    sopInstanceUID: sopUid,
    patientId: tags.patientId,
    patientName: tags.patientName,
    modality: tags.modality,
    studyDate: tags.studyDate,
    studyDescription: tags.studyDescription,
    accessionNumber: tags.accessionNumber,
    method: 'rest',
  };
}

async function resolveUidsAfterStow(stowResponse, buffer) {
  const tags = parseDicomUids(buffer);
  if (tags.studyInstanceUID && tags.sopInstanceUID) {
    return {
      orthancInstanceId: null,
      orthancStudyId: null,
      orthancSeriesId: null,
      studyInstanceUID: tags.studyInstanceUID,
      seriesInstanceUID: tags.seriesInstanceUID || `2.25.${Date.now()}.1`,
      sopInstanceUID: tags.sopInstanceUID,
      patientId: tags.patientId,
      patientName: tags.patientName,
      modality: tags.modality,
      studyDate: tags.studyDate,
      studyDescription: tags.studyDescription,
      accessionNumber: tags.accessionNumber,
      method: 'stow-rs',
      stowResponse,
    };
  }
  return resolveUidsFromOrthancIds({}, buffer);
}

export async function getOrthancHealth() {
  try {
    const res = await fetch(`${ORTHANC_URL}/system`, { headers: basicAuthHeader(), timeout: 5000 });
    if (!res.ok) return { ok: false, status: res.status };
    const body = await res.json();
    return { ok: true, name: body.Name, version: body.Version };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** Look up Orthanc study resource by StudyInstanceUID. */
export async function fetchOrthancStudyByUid(studyInstanceUID) {
  const uid = String(studyInstanceUID || '').trim();
  if (!uid) return null;
  const res = await fetch(`${ORTHANC_URL}/tools/find`, {
    method: 'POST',
    headers: { ...basicAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Level: 'Study',
      Query: { StudyInstanceUID: uid },
      Expand: true,
    }),
    timeout: 30000,
  });
  if (!res.ok) throw new Error(`Orthanc find failed: ${res.status}`);
  const rows = await res.json();
  if (Array.isArray(rows) && rows.length) {
    return typeof rows[0] === 'string'
      ? fetchOrthancStudy(rows[0])
      : rows[0];
  }
  return null;
}

export async function fetchOrthancStudy(studyId) {
  const res = await fetch(`${ORTHANC_URL}/studies/${studyId}`, {
    headers: basicAuthHeader(),
    timeout: 30000,
  });
  if (!res.ok) throw new Error(`Orthanc study fetch failed: ${res.status}`);
  return res.json();
}

/** Authoritative instance/series counts for a study, straight from Orthanc
 * — used instead of trying to accumulate counts across separate
 * per-instance webhook calls, which is what silently undercounted every
 * multi-instance study before this existed (see imaging-ris-auto-ingest
 * .service.js's use of this). */
export async function fetchOrthancStudyStatistics(studyId) {
  const res = await fetch(`${ORTHANC_URL}/studies/${studyId}/statistics`, {
    headers: basicAuthHeader(),
    timeout: 30000,
  });
  if (!res.ok) throw new Error(`Orthanc study statistics failed: ${res.status}`);
  return res.json();
}

export async function listOrthancStudyInstances(studyId) {
  const res = await fetch(`${ORTHANC_URL}/studies/${studyId}/instances`, {
    headers: basicAuthHeader(),
    timeout: 30000,
  });
  if (!res.ok) throw new Error(`Orthanc study instances failed: ${res.status}`);
  const rows = await res.json();
  return Array.isArray(rows) ? rows.map((r) => (typeof r === 'string' ? r : r.ID)).filter(Boolean) : [];
}

/** List recent Orthanc studies (for RIS backfill / sync). */
export async function listOrthancStudies({ limit = 100 } = {}) {
  const capped = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
  const res = await fetch(`${ORTHANC_URL}/tools/find`, {
    method: 'POST',
    headers: { ...basicAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Level: 'Study',
      Query: {},
      Expand: true,
      Limit: capped,
    }),
    timeout: 60000,
  });
  if (!res.ok) throw new Error(`Orthanc study list failed: ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const row of rows) {
    if (typeof row === 'string') {
      try {
        out.push(await fetchOrthancStudy(row));
      } catch (_) { /* skip bad id */ }
    } else if (row?.ID || row?.MainDicomTags) {
      out.push(row);
    }
  }
  return out;
}

/** STOW multiple DICOM instances (series / batch upload). */
export async function stowMultipleDicomFiles(fileEntries) {
  const results = [];
  for (const entry of fileEntries) {
    const buffer = entry.buffer instanceof Buffer ? entry.buffer : Buffer.from(entry.buffer);
    const result = await stowDicomToOrthanc(buffer, entry.filename || 'instance.dcm');
    results.push(result);
  }
  if (!results.length) {
    throw new Error('No DICOM files to ingest');
  }
  const primary = results[0];
  const studyUids = new Set(results.map((r) => r.studyInstanceUID).filter(Boolean));
  if (studyUids.size > 1) {
    throw new Error(`Batch contains ${studyUids.size} different StudyInstanceUIDs — upload one study per batch`);
  }
  return {
    ...primary,
    instanceCount: results.length,
    instances: results,
    method: 'stow-rs-batch',
  };
}
