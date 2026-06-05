#!/usr/bin/env node

import { execSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '../..');

const PM2_PROCESS = process.env.PM2_PROCESS || 'mediczy-server';
const LOCAL_BASE_URL = (process.env.LOCAL_BASE_URL || 'http://127.0.0.1:8888').replace(/\/$/, '');
const BASE_URL = (process.env.BASE_URL || 'https://app.mediqzy.com').replace(/\/$/, '');
const RESTART_PM2 = ['1', 'true', 'yes'].includes((process.env.RESTART_PM2 || '').toLowerCase());
const LOG_LINES = Number.parseInt(process.env.PM2_LOG_LINES || '120', 10);
const DOCTOR_EMAIL = process.env.DOCTOR_EMAIL || '';
const DOCTOR_PASSWORD = process.env.DOCTOR_PASSWORD || '';
const RUN_REVIEW_POLICY_SMOKE = ['1', 'true', 'yes'].includes(
  (process.env.RUN_REVIEW_POLICY_SMOKE || (DOCTOR_EMAIL && DOCTOR_PASSWORD ? 'true' : 'false')).toLowerCase()
);

function run(command, { allowFailure = false } = {}) {
  try {
    return execSync(command, {
      cwd: serverRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    }).trim();
  } catch (error) {
    if (allowFailure) {
      return (error.stdout || '').toString().trim();
    }
    const stderr = (error.stderr || '').toString().trim();
    throw new Error(`Command failed: ${command}\n${stderr}`);
  }
}

function logStep(message) {
  console.log(`\n[STEP] ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitForHealth(url, attempts = 20, delayMs = 1000) {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return;
      }
    } catch {
      // Keep retrying while the service boots.
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error(`Health check did not become ready: ${url}`);
}

function getPm2ProcessStatus(name) {
  const raw = run('pm2 jlist');
  const list = JSON.parse(raw);
  const proc = list.find((item) => item.name === name);
  if (!proc) {
    return null;
  }

  return {
    name: proc.name,
    pid: proc.pid,
    status: proc.pm2_env?.status,
    restarts: proc.pm2_env?.restart_time,
  };
}

function runDoctorAuthSmoke(baseUrl) {
  const smokePath = path.join(__dirname, 'doctor-auth-smoke.mjs');
  const result = spawnSync(process.execPath, [smokePath], {
    cwd: serverRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      BASE_URL: baseUrl,
    },
  });

  if (result.status !== 0) {
    throw new Error(`Doctor auth smoke failed with exit code ${result.status ?? 1}`);
  }
}

function runDoctorReviewPolicySmoke(baseUrl) {
  const smokePath = path.join(__dirname, 'doctor-review-policy-smoke.mjs');
  const result = spawnSync(process.execPath, [smokePath], {
    cwd: serverRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      BASE_URL: baseUrl,
      DOCTOR_EMAIL,
      DOCTOR_PASSWORD,
    },
  });

  if (result.status !== 0) {
    throw new Error(`Doctor review policy smoke failed with exit code ${result.status ?? 1}`);
  }
}

async function main() {
  console.log('Doctor deploy health check starting...');
  console.log(`PM2 process: ${PM2_PROCESS}`);
  console.log(`Local base URL: ${LOCAL_BASE_URL}`);
  console.log(`Smoke base URL: ${BASE_URL}`);
  console.log(`Review policy smoke: ${RUN_REVIEW_POLICY_SMOKE ? 'enabled' : 'skipped'}`);

  logStep('Checking listener ports for backend and MQTT');
  const ports = run("ss -ltnp | grep -E ':1883|:8888' || true", { allowFailure: true });
  console.log(ports || '(no matching ports found)');

  logStep('Verifying PM2 process status');
  const before = getPm2ProcessStatus(PM2_PROCESS);
  assert(before, `PM2 process not found: ${PM2_PROCESS}`);
  assert(before.status === 'online', `PM2 process is not online: ${before.status}`);
  console.log(`Status=${before.status} PID=${before.pid} Restarts=${before.restarts}`);

  if (RESTART_PM2) {
    logStep('Restarting PM2 process (crash-safe release check)');
    const restartOutput = run(`pm2 restart ${PM2_PROCESS} --update-env`);
    console.log(restartOutput.split('\n').slice(-8).join('\n'));
  }

  logStep('Waiting for local health endpoint');
  await waitForHealth(`${LOCAL_BASE_URL}/api/health`);
  console.log('Local health endpoint is healthy');

  logStep('Running doctor auth production smoke');
  runDoctorAuthSmoke(BASE_URL);

  if (RUN_REVIEW_POLICY_SMOKE) {
    assert(DOCTOR_EMAIL && DOCTOR_PASSWORD, 'DOCTOR_EMAIL and DOCTOR_PASSWORD are required for review policy smoke');
    logStep('Running doctor review policy smoke');
    runDoctorReviewPolicySmoke(BASE_URL);
  }

  logStep('Scanning recent PM2 logs for crash signatures');
  const crashLines = run(
    `pm2 logs ${PM2_PROCESS} --lines ${LOG_LINES} --nostream | grep -E 'EADDRINUSE|Error: listen|Unhandled|crash' -i || true`,
    { allowFailure: true }
  );
  assert(!crashLines, `Crash signatures detected in logs:\n${crashLines}`);
  console.log('No crash signatures found in recent logs');

  console.log('\nDoctor deploy health check PASSED');
}

main().catch((error) => {
  console.error(`\nDoctor deploy health check FAILED: ${error.message}`);
  process.exitCode = 1;
});
