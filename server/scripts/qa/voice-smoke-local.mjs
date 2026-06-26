#!/usr/bin/env node
/**
 * Local smoke test for the doctor voice assistant after the audit fixes.
 * Mints a doctor JWT directly (doctor id=1) and exercises the voice endpoints.
 *
 * Usage: node scripts/qa/voice-smoke-local.mjs
 */
const BASE = process.env.SMOKE_BASE || 'http://localhost:8000';
const DOCTOR_ID = 1;

// Uses the built-in dev-doctor-token bypass (requires ALLOW_DEV_TOKENS=true).
// This isolates the voice-route logic under test from the full doctor-schema
// auth plumbing (irrelevant to the voice fixes being smoke-tested).
const token = process.env.SMOKE_TOKEN || 'dev-doctor-token';
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail = '') {
  results.push({ test: name, status: ok ? 'PASS' : 'FAIL', detail: String(detail).slice(0, 90) });
  ok ? pass++ : fail++;
}

async function agent(text, history = []) {
  const start = Date.now();
  const res = await fetch(`${BASE}/api/voice-assistant/agent`, {
    method: 'POST', headers: H, body: JSON.stringify({ text, history }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ms: Date.now() - start, body };
}

// Minimal valid 16kHz mono WAV (0.1s silence) for the STT contract test
function tinyWav() {
  const n = 1600; const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(16000, 24); buf.writeUInt32LE(32000, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  return buf;
}

async function main() {
  console.log(`\n🔎 Voice Assistant Smoke Test — ${BASE}  (doctor id=${DOCTOR_ID})\n`);

  // 1) Auth + status endpoint reachable
  try {
    const r = await fetch(`${BASE}/api/voice-assistant/status`, { headers: H });
    const b = await r.json().catch(() => ({}));
    check('auth + /status reachable', r.status === 200 || r.status === 503, `http ${r.status}`);
    console.log(`   STT=${b?.components?.stt?.status}  TTS=${b?.components?.tts?.provider}  LiveKit=${b?.components?.livekit?.status}`);
  } catch (e) { check('auth + /status reachable', false, e.message); }

  // 2) Deterministic intents (no LLM needed) — must work even with zero AI keys
  const det = [
    { q: 'open appointments', expect: b => b.action === 'navigate_to' && b.parameters?.screen === 'appointments' },
    { q: 'open patients', expect: b => b.action === 'navigate_to' && b.parameters?.screen === 'patients' },
    { q: 'who are you', expect: b => b.intent === 'general' && /iSHA/i.test(b.response || '') },
    { q: 'how many patients today', expect: b => b.action === 'get_today_summary' },
    { q: "show today's appointments", expect: b => b.action === 'list_appointments' },
    { q: 'any updates?', expect: b => b.action === 'get_doctor_briefing' },
  ];
  for (const c of det) {
    try {
      const { status, ms, body } = await agent(c.q);
      const ok = status === 200 && c.expect(body);
      check(`agent: "${c.q}"`, ok, `http ${status}, action=${body.action}, ${ms}ms`);
    } catch (e) { check(`agent: "${c.q}"`, false, e.message); }
  }

  // 3) Doubt follow-up restates prior answer without an LLM round-trip
  try {
    const prior = 'Metformin starting dose is 500 mg once or twice daily with meals.';
    const { status, body } = await agent('are you sure', [
      { role: 'user', text: 'dose of metformin' },
      { role: 'assistant', text: prior },
    ]);
    check('agent: doubt follow-up restates prior', status === 200 && (body.response || '').includes('Metformin'), `http ${status}`);
  } catch (e) { check('agent: doubt follow-up restates prior', false, e.message); }

  // 4) Non-deterministic command degrades gracefully when no LLM provider is configured
  try {
    const { status, body } = await agent('what is the mechanism of action of metformin');
    // Must NOT 500 — should return 200 with some response (LLM answer or graceful message)
    const graceful = status === 200 && typeof body.response === 'string' && body.response.length > 0;
    check('agent: LLM path no 500 (graceful)', graceful, `http ${status}, len=${(body.response||'').length}`);
  } catch (e) { check('agent: LLM path no 500 (graceful)', false, e.message); }

  // 5) STT structured failure contract (no Groq/OpenAI/scribe configured → 503 stt_unavailable)
  try {
    const fd = new FormData();
    fd.append('audio', new Blob([tinyWav()], { type: 'audio/wav' }), 'recording.wav');
    const r = await fetch(`${BASE}/api/voice-assistant/stt`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
    const b = await r.json().catch(() => ({}));
    // Either a provider is configured (200 text) OR structured 503 with code stt_unavailable
    const ok = (r.status === 200 && typeof b.text === 'string') || (r.status === 503 && b.code === 'stt_unavailable' && Array.isArray(b.attempted));
    check('stt: structured contract (200 text | 503 stt_unavailable)', ok, `http ${r.status}, code=${b.code}, attempted=${(b.attempted||[]).join('/')}`);
  } catch (e) { check('stt: structured contract', false, e.message); }

  // 6) STT rejects empty upload (input validation intact)
  try {
    const r = await fetch(`${BASE}/api/voice-assistant/stt`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    check('stt: rejects missing audio (400)', r.status === 400, `http ${r.status}`);
  } catch (e) { check('stt: rejects missing audio (400)', false, e.message); }

  console.table(results);
  console.log(`\n${fail ? '❌ FAILED' : '✅ PASSED'}: ${pass}/${pass + fail}\n`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
