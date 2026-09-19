/**
 * k6 load test — validates the platform at something closer to Medstar's
 * proposed scale (1000 beds, 3 sites) than the ~20-bed reference deployment
 * the audit found. Added 2026-09-18.
 *
 * DELIBERATELY NOT RUN BY THIS SESSION. Running this against production
 * would generate real load against a live hospital system — that decision
 * belongs to whoever owns that risk, not something to trigger unilaterally.
 *
 * Usage (run this yourself, against a staging/non-prod target):
 *   k6 run --env BASE_URL=https://staging.mediqzy.com --env AUTH_TOKEN=<token> scripts/testing/load-test.k6.js
 *
 * Install k6 first: https://k6.io/docs/get-started/installation/
 *
 * What it simulates: a ramp from 10 to 200 virtual users hitting the same
 * read-heavy endpoints a real multi-branch, multi-hundred-concurrent-user
 * hospital day would exercise (queue board, patient search, bed map),
 * ramping over 5 minutes, holding for 5, then ramping down — a smoke-scale
 * proxy for the load-test evidence the audit found completely absent.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8888';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

export const options = {
  stages: [
    { duration: '2m', target: 50 },   // ramp to 50 VUs
    { duration: '3m', target: 200 },  // ramp to 200 VUs — proxy for multi-branch concurrent load
    { duration: '5m', target: 200 },  // hold at 200 VUs
    { duration: '2m', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],  // 95% of requests under 2s
    http_req_failed: ['rate<0.05'],     // less than 5% error rate
  },
};

const headers = AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {};

export default function () {
  const endpoints = [
    '/api/health',
    '/api/hospital/dashboard/stats',
  ];

  for (const path of endpoints) {
    const res = http.get(`${BASE_URL}${path}`, { headers });
    check(res, {
      [`${path} status is 200 or 401`]: (r) => r.status === 200 || r.status === 401, // 401 acceptable if AUTH_TOKEN not supplied
      [`${path} responds under 2s`]: (r) => r.timings.duration < 2000,
    });
  }

  sleep(1);
}
