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

/**
 * POST DICOM buffer to HyperGrid STOW-RS.
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
 * Handle Orthanc webhook payload (NewInstance).
 */
export async function handleOrthancNewInstance(payload) {
  const instanceId = payload?.ID || payload?.id;
  if (!instanceId) return { skipped: true, reason: 'no instance id' };

  const meta = await fetchOrthancInstanceMetadata(instanceId);
  const mainTags = meta?.MainDicomTags || {};
  const parsedMeta = {
    studyInstanceUID: mainTags.StudyInstanceUID,
    seriesInstanceUID: mainTags.SeriesInstanceUID,
    sopInstanceUID: mainTags.SOPInstanceUID,
    patientId: mainTags.PatientID,
    patientName: mainTags.PatientName,
    modality: mainTags.Modality,
    studyDate: mainTags.StudyDate,
    studyDescription: mainTags.StudyDescription,
    accessionNumber: mainTags.AccessionNumber,
  };

  const buffer = await fetchOrthancInstance(instanceId);
  const result = await forwardToHyperGridStow(buffer, parsedMeta);

  logger.info('[OrthancBridge] Instance forwarded to HyperGrid', {
    instanceId,
    studyInstanceUID: result.studyInstanceUID,
  });

  return { success: true, instanceId, ...result };
}

export async function syncOrthancStudy(studyId) {
  const res = await fetch(`${ORTHANC_URL}/studies/${studyId}/instances`, {
    headers: orthancAuthHeader(),
    timeout: 30000,
  });
  if (!res.ok) throw new Error(`Orthanc study list failed: ${res.status}`);
  const instanceIds = await res.json();
  const results = [];
  for (const id of instanceIds) {
    try {
      results.push(await handleOrthancNewInstance({ ID: id }));
    } catch (err) {
      results.push({ success: false, instanceId: id, error: err.message });
    }
  }
  return results;
}
