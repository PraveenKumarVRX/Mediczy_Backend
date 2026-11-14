import axios from '../integrations/axios.js';

const INTELLIGENT_DB_URL = process.env.INTELLIGENT_DB_URL || 'http://localhost:5001/api/intelligent-db';

function buildUrl(path) {
  return `${INTELLIGENT_DB_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

export async function ingest(collection, payload) {
  const url = buildUrl('/ingest');
  const body = { collection, payload };
  const response = await axios.post(url, body, { timeout: 5000 });
  return response.data;
}

export async function query(collection, filter) {
  const url = buildUrl('/query');
  const body = { collection, filter };
  const response = await axios.post(url, body, { timeout: 5000 });
  return response.data;
}

export async function status() {
  const url = buildUrl('/status');
  const response = await axios.get(url, { timeout: 3000 });
  return response.data;
}

export async function update(collection, id, payload) {
  try {
    const url = buildUrl('/update');
    const body = { collection, id, payload };
    const response = await axios.post(url, body, { timeout: 5000 });
    return response.data;
  } catch {
    // update endpoint may not exist — no-op silently
    return { success: false, reason: 'update_not_supported' };
  }
}

export async function search(collection, { filter = {}, limit = 100 } = {}) {
  try {
    return await query(collection, filter);
  } catch {
    return [];
  }
}

export default {
  ingest,
  query,
  status,
  update,
  search
};
