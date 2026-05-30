#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

const BASE_URL = process.env.MEDICZY_BASE_URL || 'http://127.0.0.1:8888';
const DOCTOR_EMAIL = process.env.DOCTOR_EMAIL || 'doctor@mediczy.com';
const DOCTOR_PASSWORD = process.env.DOCTOR_PASSWORD || 'Doctor123';

const TEST_CASES = [
  { command: 'open ai assist', expectedScreen: 'ai-assist' },
  { command: 'open monitoring', expectedScreen: 'monitoring' },
  { command: 'open templates', expectedScreen: 'templates' },
  { command: 'open queue', expectedScreen: 'queue' },
  { command: 'open staff', expectedScreen: 'staff' },
];

function parseScreenMap(content) {
  const mapMatch = content.match(/const\s+SCREEN_PATHS\s*:\s*Record<string,\s*string>\s*=\s*\{([\s\S]*?)\};/);
  if (!mapMatch) {
    throw new Error('Could not find SCREEN_PATHS map in DoctorVoiceAssistant.tsx');
  }

  const entries = mapMatch[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//'));

  const map = {};
  for (const line of entries) {
    const pair = line.match(/^"?([a-zA-Z0-9-]+)"?\s*:\s*"([^"]+)"\s*,?$/);
    if (pair) {
      map[pair[1]] = pair[2];
    }
  }
  return map;
}

function parseDoctorRoutes(content) {
  const routes = new Set();
  const regex = /<Route\s+path="(\/doctor\/[^"]+)"/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    routes.add(match[1]);
  }
  return routes;
}

async function loginDoctor() {
  const response = await fetch(`${BASE_URL}/api/doctors/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: DOCTOR_EMAIL, password: DOCTOR_PASSWORD }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.token) {
    throw new Error(`Doctor login failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload.token;
}

async function runAgentCommand(token, text) {
  const response = await fetch(`${BASE_URL}/api/voice-assistant/agent`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });

  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
}

function row(status, command, expected, actual, mappedPath, routeExists, detail = '') {
  return {
    status,
    command,
    expectedScreen: expected,
    actualScreen: actual || '-',
    mappedPath: mappedPath || '-',
    routeExists: routeExists === null ? '-' : routeExists ? 'yes' : 'no',
    detail,
  };
}

async function main() {
  const voicePath = path.join(repoRoot, 'client/src/pages/doctor/DoctorVoiceAssistant.tsx');
  const routesPath = path.join(repoRoot, 'client/src/routes/index.tsx');

  const [voiceContent, routesContent] = await Promise.all([
    fs.readFile(voicePath, 'utf8'),
    fs.readFile(routesPath, 'utf8'),
  ]);

  const screenMap = parseScreenMap(voiceContent);
  const routeSet = parseDoctorRoutes(routesContent);
  const token = await loginDoctor();

  const results = [];
  let failures = 0;

  for (const testCase of TEST_CASES) {
    const { command, expectedScreen } = testCase;
    try {
      const { status, payload } = await runAgentCommand(token, command);

      if (status !== 200) {
        failures += 1;
        results.push(
          row('FAIL', command, expectedScreen, null, null, null, `HTTP ${status}: ${JSON.stringify(payload)}`)
        );
        continue;
      }

      const action = payload?.action;
      const actualScreen = payload?.parameters?.screen;
      const mappedPath = screenMap[actualScreen];
      const routeExists = Boolean(mappedPath && routeSet.has(mappedPath));

      const pass =
        action === 'navigate_to' &&
        actualScreen === expectedScreen &&
        Boolean(mappedPath) &&
        routeExists;

      if (!pass) {
        failures += 1;
      }

      const detail = !pass
        ? `action=${String(action)} payload=${JSON.stringify(payload)}`
        : 'ok';

      results.push(row(pass ? 'PASS' : 'FAIL', command, expectedScreen, actualScreen, mappedPath, routeExists, detail));
    } catch (error) {
      failures += 1;
      results.push(row('FAIL', command, expectedScreen, null, null, null, error.message));
    }
  }

  console.table(results);

  if (failures > 0) {
    console.error(`Doctor assistant navigation regression FAILED (${failures}/${TEST_CASES.length})`);
    process.exit(1);
  }

  console.log(`Doctor assistant navigation regression PASSED (${TEST_CASES.length}/${TEST_CASES.length})`);
}

main().catch((error) => {
  console.error('Regression script failed:', error.message);
  process.exit(1);
});
