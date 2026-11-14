import { createManagedFetch } from '../integrations/transport.js';
import { resolveSibBaseUrl } from '../config/ai-services.config.js';
import nodeFetch from 'node-fetch';
import crypto from 'node:crypto';

export function sibHeaders(url, options = {}, { secret = process.env.SIB_SERVICE_SECRET || process.env.JWT_SECRET, now = Date.now(), nonce = crypto.randomUUID() } = {}) {
  if (!secret || secret.length < 32) throw Object.assign(new Error('SIB service authentication is not configured'), { statusCode: 503 });
  const target = new URL(url);
  const method = String(options.method || 'GET').toUpperCase();
  const body = options.body || '';
  if (typeof body !== 'string' && !Buffer.isBuffer(body)) throw new Error('SIB request body must be serialized before signing');
  const timestamp = String(Math.floor(now / 1000));
  const digest = crypto.createHash('sha256').update(body).digest('hex');
  const canonical = [method, target.pathname + target.search, timestamp, nonce, digest].join('\n');
  return { ...options.headers, 'x-sib-time': timestamp, 'x-sib-nonce': nonce,
    'x-sib-signature': crypto.createHmac('sha256', secret).update(canonical).digest('hex') };
}

export function isSibUrl(url) {
  const target = new URL(url);
  const origins = [process.env.SIB_URL, process.env.SIB_API_URL, process.env.SIB_FASTAPI_URL, 'http://localhost:8001', 'http://127.0.0.1:8001'].filter(Boolean).map(value => new URL(value).origin);
  return origins.includes(target.origin);
}

export async function sibFetch(url, options = {}) {
  if (!isSibUrl(url)) return options.body?.getHeaders ? createManagedFetch(nodeFetch)(url, options) : createManagedFetch(globalThis.fetch)(url, options);
  if (options.body?.getHeaders) options = { ...options, headers: { ...options.headers,...options.body.getHeaders() }, body: options.body.getBuffer() };
  const canonical=new URL(resolveSibBaseUrl());
  const requested=new URL(url);
  url=canonical.origin+requested.pathname+requested.search;
  let serialized = options;
  if (options.body && typeof options.body !== 'string' && !Buffer.isBuffer(options.body)) {
    const request = new Request(url, options);
    serialized = { ...options, headers: Object.fromEntries(request.headers), body: Buffer.from(await request.arrayBuffer()) };
  }
  return globalThis.fetch(url, { ...serialized, headers: sibHeaders(url, serialized) });
}

export async function sibPost(url, payload, config = {}) {
  const response = await sibFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...config.headers },
    body: JSON.stringify(payload), signal: config.signal || AbortSignal.timeout(config.timeout || 30000) });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error('SIB request failed'), { response: { status: response.status, data } });
  return { data, status: response.status };
}
