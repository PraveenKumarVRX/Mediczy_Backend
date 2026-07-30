/**
 * Orthanc DICOM modality peer registration — sync MediQzy registry ↔ Orthanc /modalities.
 * Also supports C-ECHO, C-FIND (query), and C-MOVE (retrieve/pull) against scanners.
 */
import fetch from 'node-fetch';
import logger from '../config/logger.js';
import { orthancBasicAuthHeader } from '../utils/orthanc-credentials.js';

const ORTHANC_URL = (process.env.ORTHANC_URL || 'http://127.0.0.1:8042').replace(/\/$/, '');

function basicAuthHeader() {
  return orthancBasicAuthHeader();
}

async function orthancFetch(path, { method = 'GET', body, timeout = 60000 } = {}) {
  const res = await fetch(`${ORTHANC_URL}${path}`, {
    method,
    headers: {
      ...basicAuthHeader(),
      ...(body != null ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
    timeout,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json, text };
}

export async function getOrthancSystem() {
  const res = await orthancFetch('/system', { timeout: 10000 });
  if (!res.ok) {
    throw new Error(`Orthanc unreachable (${res.status}): ${(res.text || '').slice(0, 160)}`);
  }
  return {
    online: true,
    url: ORTHANC_URL,
    name: res.json?.Name || res.json?.DicomAet || 'Orthanc',
    aet: res.json?.DicomAet || process.env.ORTHANC_AET || 'MEDICZY',
    version: res.json?.Version || null,
    dicomPort: res.json?.DicomPort || 4242,
  };
}

export async function upsertOrthancModality({
  name,
  aeTitle,
  host,
  port,
  manufacturer,
  allowStore = true,
  allowEcho = true,
  allowFind = true,
  allowMove = true,
  allowGet = true,
  allowFindWorklist = true,
}) {
  const body = {
    AET: aeTitle,
    Host: host,
    Port: Number(port),
    Manufacturer: manufacturer || 'Generic',
    AllowEcho: allowEcho,
    AllowFind: allowFind,
    AllowFindWorklist: allowFindWorklist,
    AllowGet: allowGet,
    AllowMove: allowMove,
    AllowStore: allowStore,
    AllowTranscoding: true,
  };

  const res = await orthancFetch(`/modalities/${encodeURIComponent(name)}`, {
    method: 'PUT',
    body,
    timeout: 30000,
  });

  if (!res.ok) {
    throw new Error(`Orthanc modality upsert failed (${res.status}): ${(res.text || '').slice(0, 200)}`);
  }

  logger.info('[OrthancModality] Registered peer', { name, host, port: body.Port, aeTitle });
  return body;
}

export async function deleteOrthancModality(name) {
  const res = await orthancFetch(`/modalities/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    timeout: 15000,
  });
  if (res.status === 404) return false;
  if (!res.ok) {
    throw new Error(`Orthanc modality delete failed (${res.status}): ${(res.text || '').slice(0, 200)}`);
  }
  return true;
}

export async function listOrthancModalities() {
  const res = await orthancFetch('/modalities', { timeout: 15000 });
  if (!res.ok) return [];
  return Array.isArray(res.json) ? res.json : [];
}

/** C-ECHO — verify DICOM connectivity to a registered modality. */
export async function echoOrthancModality(name) {
  const res = await orthancFetch(`/modalities/${encodeURIComponent(name)}/echo`, {
    method: 'POST',
    body: {},
    timeout: 30000,
  });
  if (!res.ok) {
    throw new Error(`C-ECHO failed (${res.status}): ${(res.text || '').slice(0, 200)}`);
  }
  return { success: true, modality: name };
}

/**
 * C-FIND — query studies on a remote modality / PACS peer.
 * @param {string} name Orthanc modality peer name
 * @param {object} query DICOM query keys (PatientName, PatientID, StudyDate, ModalitiesInStudy, …)
 */
export async function queryOrthancModality(name, {
  level = 'Study',
  query = {},
  expand = true,
} = {}) {
  const res = await orthancFetch(`/modalities/${encodeURIComponent(name)}/query`, {
    method: 'POST',
    body: {
      Level: level,
      Query: {
        PatientName: '',
        PatientID: '',
        StudyDate: '',
        StudyInstanceUID: '',
        AccessionNumber: '',
        StudyDescription: '',
        ModalitiesInStudy: '',
        ...query,
      },
    },
    timeout: 120000,
  });

  if (!res.ok) {
    throw new Error(`C-FIND failed (${res.status}): ${(res.text || '').slice(0, 200)}`);
  }

  const queryId = res.json?.ID;
  if (!queryId) {
    return { queryId: null, answers: [], raw: res.json };
  }

  if (!expand) {
    return { queryId, answers: [], raw: res.json };
  }

  const answersRes = await orthancFetch(`/queries/${encodeURIComponent(queryId)}/answers`, {
    timeout: 60000,
  });
  const answerIds = Array.isArray(answersRes.json) ? answersRes.json : [];

  const answers = [];
  for (const answerId of answerIds.slice(0, 200)) {
    const content = await orthancFetch(
      `/queries/${encodeURIComponent(queryId)}/answers/${encodeURIComponent(answerId)}/content`,
      { timeout: 30000 },
    );
    if (content.ok && content.json) {
      answers.push({
        answerId,
        patientName: content.json.PatientName || content.json['0010,0010'],
        patientId: content.json.PatientID || content.json['0010,0020'],
        studyDate: content.json.StudyDate || content.json['0008,0020'],
        studyTime: content.json.StudyTime || content.json['0008,0030'],
        accessionNumber: content.json.AccessionNumber || content.json['0008,0050'],
        studyDescription: content.json.StudyDescription || content.json['0008,1030'],
        modalitiesInStudy: content.json.ModalitiesInStudy || content.json['0008,0061'],
        studyInstanceUID: content.json.StudyInstanceUID || content.json['0020,000d'],
        numberOfStudyRelatedSeries: content.json.NumberOfStudyRelatedSeries,
        numberOfStudyRelatedInstances: content.json.NumberOfStudyRelatedInstances,
        raw: content.json,
      });
    }
  }

  return { queryId, answers, count: answers.length };
}

/**
 * C-MOVE — pull studies from a remote modality into local Orthanc.
 * Resources: list of StudyInstanceUID strings or Orthanc-style resource objects.
 */
export async function retrieveOrthancModality(name, {
  studyInstanceUIDs = [],
  resources = null,
  level = 'Study',
  targetAet = null,
} = {}) {
  const resourceList = resources || studyInstanceUIDs.map((uid) => ({
    StudyInstanceUID: uid,
  }));

  if (!resourceList.length) {
    throw new Error('At least one StudyInstanceUID is required to retrieve');
  }

  const body = {
    Level: level,
    Resources: resourceList,
  };
  if (targetAet) body.TargetAet = targetAet;

  const res = await orthancFetch(`/modalities/${encodeURIComponent(name)}/move`, {
    method: 'POST',
    body,
    timeout: 300000,
  });

  if (!res.ok) {
    throw new Error(`C-MOVE failed (${res.status}): ${(res.text || '').slice(0, 240)}`);
  }

  logger.info('[OrthancModality] C-MOVE retrieve', {
    name,
    studies: resourceList.length,
  });

  return {
    success: true,
    modality: name,
    retrieved: resourceList.length,
    result: res.json,
  };
}

export const MODALITY_PRESETS = [
  { type: 'CT', label: 'CT Scanner', defaultPort: 104, manufacturer: 'Generic' },
  { type: 'MR', label: 'MRI Scanner', defaultPort: 104, manufacturer: 'Generic' },
  { type: 'US', label: 'Ultrasound (USG)', defaultPort: 104, manufacturer: 'Generic' },
  { type: 'DX', label: 'Digital X-ray', defaultPort: 104, manufacturer: 'Generic' },
  { type: 'CR', label: 'Computed Radiography', defaultPort: 104, manufacturer: 'Generic' },
  { type: 'MG', label: 'Mammography', defaultPort: 104, manufacturer: 'Generic' },
  { type: 'XA', label: 'X-ray Angiography', defaultPort: 104, manufacturer: 'Generic' },
  { type: 'PT', label: 'PET', defaultPort: 104, manufacturer: 'Generic' },
  { type: 'NM', label: 'Nuclear Medicine', defaultPort: 104, manufacturer: 'Generic' },
];

export default {
  getOrthancSystem,
  upsertOrthancModality,
  deleteOrthancModality,
  listOrthancModalities,
  echoOrthancModality,
  queryOrthancModality,
  retrieveOrthancModality,
  MODALITY_PRESETS,
};
