#!/usr/bin/env node
/** GAP-QA-003 — Hospital portal smoke */
const BASE = process.env.API_BASE || 'http://127.0.0.1:5000';

const checks = [
  { name: 'health', url: '/api/health' },
  { name: 'display-queue', url: '/api/display/queue' },
  { name: 'kiosk-wayfinding', url: '/api/display/kiosk/wayfinding', method: 'POST', body: { query: 'opd' } },
  { name: 'hmis-openapi', url: '/api/docs/hospital-openapi.json' },
];

let failed = 0;
for (const c of checks) {
  try {
    const res = await fetch(`${BASE}${c.url}`, {
      method: c.method || 'GET',
      headers: c.body ? { 'Content-Type': 'application/json' } : {},
      body: c.body ? JSON.stringify(c.body) : undefined,
    });
    const ok = res.status < 500;
    console.log(ok ? '✓' : '✗', c.name, res.status);
    if (!ok) failed += 1;
  } catch (e) {
    console.log('✗', c.name, e.message);
    failed += 1;
  }
}
process.exit(failed ? 1 : 0);
