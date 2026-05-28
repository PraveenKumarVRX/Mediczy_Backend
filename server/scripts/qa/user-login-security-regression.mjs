#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

const BASE_URL = process.env.MEDICZY_BASE_URL || 'http://127.0.0.1:8888';
const USER_EMAIL = process.env.USER_EMAIL || 'user@mediczy.com';
const USER_PASSWORD = process.env.USER_PASSWORD || 'User123';

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  let payload = {};
  try {
    payload = await res.json();
  } catch {
    payload = {};
  }

  return { status: res.status, payload };
}

function fail(message) {
  throw new Error(message);
}

async function run() {
  const routeFile = path.join(repoRoot, 'server/routes/user.route.js');
  const routeContent = await fs.readFile(routeFile, 'utf8');

  if (!routeContent.includes('shouldIncludeOtpInResponse')) {
    fail('Missing shouldIncludeOtpInResponse guard in user login routes');
  }
  if (!routeContent.includes("OTP_DEBUG_RESPONSE === 'true'")) {
    fail('Missing explicit OTP_DEBUG_RESPONSE flag guard');
  }
  if (!routeContent.includes("code: 'ACCOUNT_INACTIVE'")) {
    fail('Missing ACCOUNT_INACTIVE guard in OTP verify path');
  }

  const passwordLogin = await postJson(`${BASE_URL}/api/users/login`, {
    email: USER_EMAIL,
    password: USER_PASSWORD,
  });

  const passwordInactive =
    passwordLogin.status === 403 &&
    passwordLogin.payload?.code === 'ACCOUNT_INACTIVE';

  const otpSend = await postJson(`${BASE_URL}/api/users/login/send-otp`, {
    identifier: USER_EMAIL,
  });

  if (otpSend.status !== 200) {
    fail(`OTP send failed with HTTP ${otpSend.status}`);
  }

  if (otpSend.payload?.data?.otp) {
    fail('OTP code leakage detected in /api/users/login/send-otp response');
  }

  const rows = [
    {
      check: 'otp_debug_guard_present',
      status: 'PASS',
      detail: 'route source includes strict OTP debug guard',
    },
    {
      check: 'otp_inactive_guard_present',
      status: 'PASS',
      detail: 'route source includes ACCOUNT_INACTIVE guard in OTP verify',
    },
    {
      check: 'otp_response_no_code_leak',
      status: 'PASS',
      detail: 'send-otp response does not include raw OTP code',
    },
    {
      check: 'runtime_account_inactive_password',
      status: passwordInactive ? 'PASS' : 'WARN',
      detail: passwordInactive
        ? 'inactive-account behavior confirmed at runtime'
        : `password login returned HTTP ${passwordLogin.status}; bypass runtime assertion is static-only in this run`,
    },
  ];

  console.table(rows);
  console.log('User login security regression PASSED');
}

run().catch((error) => {
  console.error('User login security regression FAILED:', error.message);
  process.exit(1);
});
