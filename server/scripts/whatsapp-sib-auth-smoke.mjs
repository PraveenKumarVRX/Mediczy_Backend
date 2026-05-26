#!/usr/bin/env node
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env.BASE_URL || 'http://localhost:8888';
const JWT_SECRET = process.env.JWT_SECRET;
const AUTH_ROLE = process.env.SIB_SMOKE_ROLE || 'admin';
const AUTH_EMAIL = process.env.SIB_SMOKE_EMAIL || 'admin@mediczy.com';
const AUTH_ID = Number(process.env.SIB_SMOKE_USER_ID || 20);
const PHONE_NUMBER = process.env.SIB_SMOKE_PHONE || '+919876543210';

const MESSAGE_1 = process.env.SIB_SMOKE_MSG1 || 'I have high BP.';
const MESSAGE_2 = process.env.SIB_SMOKE_MSG2 || 'I also feel dizziness today.';
const MESSAGE_3 = process.env.SIB_SMOKE_MSG3 || 'Can you suggest what to do next?';

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

if (!JWT_SECRET) {
  fail('JWT_SECRET is missing. Run from server directory with .env loaded or set JWT_SECRET.');
}

const token = jwt.sign(
  {
    id: AUTH_ID,
    userId: AUTH_ID,
    role: AUTH_ROLE,
    userType: AUTH_ROLE,
    email: AUTH_EMAIL,
  },
  JWT_SECRET,
  { algorithm: 'HS256', expiresIn: '2h' }
);

async function apiRequest(method, path, body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {
    // Keep raw text if response is not JSON.
  }

  return { status: response.status, data };
}

async function run() {
  console.log('Running authenticated WhatsApp-SIB smoke...');
  console.log(`Target: ${BASE_URL}`);
  console.log(`Identity: role=${AUTH_ROLE} email=${AUTH_EMAIL} id=${AUTH_ID}`);

  const health = await apiRequest('GET', '/api/whatsapp-production/sib/health');
  if (health.status !== 200 || !health.data?.success) {
    console.error('Health check failed:', JSON.stringify(health, null, 2));
    process.exit(2);
  }

  const r1 = await apiRequest('POST', '/api/whatsapp-production/sib/test', {
    phoneNumber: PHONE_NUMBER,
    message: MESSAGE_1,
  });
  const r2 = await apiRequest('POST', '/api/whatsapp-production/sib/test', {
    phoneNumber: PHONE_NUMBER,
    message: MESSAGE_2,
  });
  const r3 = await apiRequest('POST', '/api/whatsapp-production/sib/test', {
    phoneNumber: PHONE_NUMBER,
    message: MESSAGE_3,
  });

  const calls = [r1, r2, r3];
  const allOk = calls.every((result) => result.status === 200 && result.data?.success === true);

  const summary = {
    success: allOk,
    health: {
      status: health.status,
      sibHealthy: health.data?.sibBrain?.healthy ?? null,
      useSIBBrain: health.data?.configuration?.useSIBBrain ?? null,
      sibUrl: health.data?.configuration?.sibUrl ?? null,
    },
    turns: calls.map((result, idx) => ({
      step: idx + 1,
      status: result.status,
      provider: result.data?.response?.provider || null,
      shouldReply: result.data?.response?.shouldReply ?? null,
      preview: String(result.data?.response?.response || '').slice(0, 140),
    })),
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!allOk) {
    process.exit(3);
  }
}

run().catch((error) => {
  console.error('Smoke run crashed:', error?.stack || error?.message || error);
  process.exit(10);
});
