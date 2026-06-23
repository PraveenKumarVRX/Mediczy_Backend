/**
 * Orthanc DICOM modality peer registration — sync MediQzy registry ↔ Orthanc /modalities.
 */
import fetch from 'node-fetch';
import logger from '../config/logger.js';

const ORTHANC_URL = (process.env.ORTHANC_URL || 'http://127.0.0.1:8042').replace(/\/$/, '');
const ORTHANC_USER = process.env.ORTHANC_USER || 'pacs';
const ORTHANC_PASSWORD = process.env.ORTHANC_PASSWORD || 'change-this-password';

function basicAuthHeader() {
  const token = Buffer.from(`${ORTHANC_USER}:${ORTHANC_PASSWORD}`).toString('base64');
  return { Authorization: `Basic ${token}` };
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
    Manufacturer: manufacturer || 'Unknown',
    AllowEcho: allowEcho,
    AllowFind: allowFind,
    AllowFindWorklist: allowFindWorklist,
    AllowGet: allowGet,
    AllowMove: allowMove,
    AllowStore: allowStore,
    AllowTranscoding: true,
  };

  const res = await fetch(`${ORTHANC_URL}/modalities/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: {
      ...basicAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    timeout: 30000,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Orthanc modality upsert failed (${res.status}): ${text.slice(0, 200)}`);
  }

  logger.info('[OrthancModality] Registered peer', { name, host, port: body.Port, aeTitle });
  return body;
}

export async function deleteOrthancModality(name) {
  const res = await fetch(`${ORTHANC_URL}/modalities/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    headers: basicAuthHeader(),
    timeout: 15000,
  });
  if (res.status === 404) return false;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Orthanc modality delete failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return true;
}

export async function listOrthancModalities() {
  const res = await fetch(`${ORTHANC_URL}/modalities`, {
    headers: basicAuthHeader(),
    timeout: 15000,
  });
  if (!res.ok) return [];
  return res.json();
}
