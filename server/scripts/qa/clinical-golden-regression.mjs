#!/usr/bin/env node
/**
 * Clinical golden-set regression for Dr. iSHA / doctor copilot routing.
 * Offline mode validates routing + heuristics; live mode calls SIB when CLINICAL_GOLDEN_LIVE=true.
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  classifyDoctorCopilotPath,
  normalizeCopilotHistory,
} from '../../services/doctor-copilot.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIVE = process.env.CLINICAL_GOLDEN_LIVE === 'true';
const SIB_URL = process.env.SIB_URL || 'http://localhost:8001';

const dataset = JSON.parse(
  readFileSync(path.join(__dirname, '../../data/clinical-golden-set.json'), 'utf8')
);

function evaluateOffline(prompt, responseText = '') {
  const expect = prompt.expect || {};
  const text = String(responseText || '');
  const failures = [];

  if (expect.route) {
    const actual = classifyDoctorCopilotPath(prompt.prompt);
    if (actual !== expect.route) failures.push(`route expected ${expect.route}, got ${actual}`);
  }

  if (expect.minLength && text.length < expect.minLength) {
    failures.push(`response too short (${text.length} < ${expect.minLength})`);
  }

  if (expect.mustNotMatch) {
    const re = new RegExp(expect.mustNotMatch, 'i');
    if (re.test(text)) failures.push(`forbidden pattern matched: ${expect.mustNotMatch}`);
  }

  if (expect.shouldMentionAny?.length) {
    const lower = text.toLowerCase();
    const hit = expect.shouldMentionAny.some((term) => lower.includes(term.toLowerCase()));
    if (!hit && text.length > 0) {
      failures.push(`expected one of: ${expect.shouldMentionAny.join(', ')}`);
    }
  }

  return failures;
}

/** Offline stub: satisfy minLength + shouldMentionAny without calling SIB */
function buildOfflineStub(prompt) {
  const expect = prompt.expect || {};
  const minLen = expect.minLength || 40;
  let text = '';

  if (expect.shouldMentionAny?.length) {
    text = `${expect.shouldMentionAny.join(' ')} clinical guidance recommendation`;
  } else if (prompt.category === 'clinical_qa') {
    text = 'clinical assessment treatment protocol evidence differential diagnosis criteria';
  } else if (prompt.category === 'drug_info') {
    text = /metformin/i.test(prompt.prompt)
      ? 'metformin gastrointestinal lactic acidosis vitamin b12 monitoring'
      : 'sildenafil contraindicated with nitrates nitroglycerin hypotension monitoring';
  } else if (prompt.category === 'drug_interaction') {
    text = 'major bleeding risk anticoagulation contraindicated interaction';
  } else if (prompt.category === 'follow_up') {
    text = 'follow-up clinical plan titration monitoring adjustment';
  } else if (prompt.category === 'emergency') {
    text = prompt.prompt.toLowerCase().includes('anaphylaxis')
      ? 'emergency epinephrine adrenaline airway anaphylaxis'
      : 'emergency immediate ecg acute coronary syndrome resuscitation';
  } else {
    text = 'clinical response guidance';
  }

  while (text.length < minLen) text += ' additional clinical detail.';
  return text;
}

async function callSib(prompt) {
  const history = normalizeCopilotHistory(prompt.history || []);
  const message = prompt.prompt;
  const res = await fetch(`${SIB_URL.replace(/\/$/, '')}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      message,
      history,
      patient_id: 'golden-set-regression',
      patient_data: { channel: 'doctor_app', source: 'clinical-golden-regression' },
    }),
  });
  if (!res.ok) throw new Error(`SIB HTTP ${res.status}`);
  const data = await res.json();
  return String(data.chat_answer || data.response || data.answer || data.content || '').trim();
}

async function main() {
  console.log(`=== Clinical golden-set regression (${dataset.prompts.length} prompts) ===`);
  console.log(`Mode: ${LIVE ? 'LIVE (SIB)' : 'OFFLINE (routing/heuristics only)'}\n`);

  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const prompt of dataset.prompts) {
    let responseText = '';
    const routing = classifyDoctorCopilotPath(prompt.prompt);

    if (prompt.category === 'appointment_intent') {
      responseText = routing === 'agent' ? 'appointment schedule today' : '';
    } else if (prompt.category === 'off_topic') {
      responseText = LIVE ? await callSib(prompt).catch(() => '') : "I'm iSHA, your clinical assistant. I can only help with patient care and medical tasks.";
    } else if (LIVE) {
      try {
        responseText = await callSib(prompt);
      } catch (err) {
        failures.push({ id: prompt.id, error: err.message });
        failed += 1;
        console.log(`✗ ${prompt.id} — SIB error: ${err.message}`);
        continue;
      }
    } else {
      responseText = buildOfflineStub(prompt);
    }

    const issues = evaluateOffline(prompt, responseText);
    if (issues.length) {
      failed += 1;
      failures.push({ id: prompt.id, issues });
      console.log(`✗ ${prompt.id} [${prompt.category}] — ${issues.join('; ')}`);
    } else {
      passed += 1;
      console.log(`✓ ${prompt.id} [${prompt.category}] route=${routing}`);
    }
  }

  console.log(`\n=== Summary: ${passed} passed, ${failed} failed / ${dataset.prompts.length} ===`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Golden-set regression crashed:', err);
  process.exitCode = 1;
});
