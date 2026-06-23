#!/usr/bin/env node
/**
 * Production smoke test for Dr. iSHA voice assistant.
 * Usage: MEDICZY_BASE_URL=https://mediqzy.com node scripts/qa/voice-assistant-prod-smoke.mjs
 */

const BASE = process.env.MEDICZY_BASE_URL || 'https://mediqzy.com';
const DOCTOR_EMAIL = process.env.DOCTOR_EMAIL || 'doctor@mediczy.com';
const DOCTOR_PASSWORD = process.env.DOCTOR_PASSWORD || 'Doctor123';

const AGENT_CASES = [
  { q: 'hello', expect: { intent: 'general', maxMs: 500 }, label: 'greeting' },
  { q: 'who are you', expect: { intent: 'general', maxMs: 500 }, label: 'identity' },
  { q: 'open ai assist', expect: { action: 'navigate_to', screen: 'ai-assist', maxMs: 500 }, label: 'nav-ai-assist' },
  { q: 'open monitoring', expect: { action: 'navigate_to', screen: 'monitoring', maxMs: 500 }, label: 'nav-monitoring' },
  { q: 'open queue', expect: { action: 'navigate_to', screen: 'queue', maxMs: 500 }, label: 'nav-queue' },
  { q: 'give me my briefing', expect: { action: 'get_doctor_briefing', maxMs: 3000 }, label: 'briefing' },
  { q: 'show today appointments', expect: { action: 'list_appointments', maxMs: 3000 }, label: 'list-appointments' },
  { q: 'how many patients today', expect: { action: 'get_today_summary', maxMs: 3000 }, label: 'today-summary' },
  { q: 'what is the dose of metformin', expect: { action: 'get_drug_info', minSpeakLen: 40, maxMs: 15000 }, label: 'drug-info' },
  { q: 'interaction between aspirin and warfarin', expect: { action: 'check_drug_interactions', minSpeakLen: 40, maxMs: 15000 }, label: 'drug-interactions' },
];

const PLACEHOLDER_RE = /health intelligence request|please confirm before i take action/i;

async function login() {
  const res = await fetch(`${BASE}/api/doctors/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: DOCTOR_EMAIL, password: DOCTOR_PASSWORD }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.token) throw new Error(`Login failed (${res.status})`);
  return body.token;
}

async function agent(token, text, history = []) {
  const start = Date.now();
  const res = await fetch(`${BASE}/api/voice-assistant/agent`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, history }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ms: Date.now() - start, body };
}

function checkCase(label, payload, expect, ms) {
  const issues = [];
  if (PLACEHOLDER_RE.test(payload.speak || payload.response || '')) {
    issues.push('SIB placeholder response');
  }
  if (expect.intent && payload.intent !== expect.intent) issues.push(`intent=${payload.intent}`);
  if (expect.action && payload.action !== expect.action) issues.push(`action=${payload.action}`);
  if (expect.screen && payload.parameters?.screen !== expect.screen) {
    issues.push(`screen=${payload.parameters?.screen}`);
  }
  if (expect.minSpeakLen && String(payload.speak || '').length < expect.minSpeakLen) {
    issues.push(`speak too short (${(payload.speak || '').length})`);
  }
  if (expect.maxMs && ms > expect.maxMs) issues.push(`slow ${ms}ms`);
  return issues;
}

async function main() {
  console.log(`Voice assistant prod smoke — ${BASE}\n`);
  const token = await login();

  const statusRes = await fetch(`${BASE}/api/voice-assistant/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const status = await statusRes.json().catch(() => ({}));
  console.log('Stack:', status.service, '| STT:', status.components?.stt?.status, '| TTS:', status.components?.tts?.provider);

  const briefingRes = await fetch(`${BASE}/api/voice-assistant/briefing`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const briefing = await briefingRes.json().catch(() => ({}));
  console.log('Briefing poll:', briefing.hasUpdates ? 'updates' : 'none', '| speak:', (briefing.speakText || '').slice(0, 80));
  console.log('');

  const priorAnswer = 'Typical starting dose of metformin is 500 mg once or twice daily with meals.';
  const doubtRes = await agent(token, 'are you sure', [
    { role: 'user', text: 'dose of metformin' },
    { role: 'assistant', text: priorAnswer },
  ]);

  const results = [];
  let failures = 0;

  for (const testCase of AGENT_CASES) {
    const { status, ms, body } = await agent(token, testCase.q);
    const issues = status !== 200 ? [`HTTP ${status}`] : checkCase(testCase.label, body, testCase.expect, ms);
    const pass = issues.length === 0;
    if (!pass) failures += 1;
    results.push({
      status: pass ? 'PASS' : 'FAIL',
      test: testCase.label,
      ms,
      intent: body.intent || '-',
      action: body.action || '-',
      speak: String(body.speak || '').slice(0, 70),
      issues: issues.join('; ') || 'ok',
    });
  }

  const doubtIssues = checkCase('doubt-followup', doubtRes.body, { intent: 'general', maxMs: 500 }, doubtRes.ms);
  if (doubtIssues.length) failures += 1;
  results.push({
    status: doubtIssues.length ? 'FAIL' : 'PASS',
    test: 'doubt-followup',
    ms: doubtRes.ms,
    intent: doubtRes.body.intent || '-',
    action: doubtRes.body.action || '-',
    speak: String(doubtRes.body.speak || '').slice(0, 70),
    issues: doubtIssues.join('; ') || 'ok',
  });

  console.table(results);
  console.log(`\n${failures ? 'FAILED' : 'PASSED'}: ${results.length - failures}/${results.length}`);

  if (PLACEHOLDER_RE.test(JSON.stringify(results))) {
    console.log('\n⚠️  SIB placeholder detected — deploy branch with voice-assistant-response.service.js fixes.');
  }

  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
