import axios from 'axios';

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

export default {
  ingest,
  query,
  status
};
