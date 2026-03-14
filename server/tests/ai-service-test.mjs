/**
 * ═══════════════════════════════════════════════════════════════
 *  Mediczy AI Service — Comprehensive Response Efficiency Test
 * ═══════════════════════════════════════════════════════════════
 *
 *  Tests every AI capability through the centralized llm-provider:
 *
 *    Text   → iSHA (BiMediX2) → Groq (Llama 3.3 70B) → OpenAI (GPT-3.5)
 *    Vision → Anthropic Claude 3.5 → Groq Llama 4 Scout
 *    STT    → Groq Whisper → OpenAI Whisper
 *
 *  Usage:  cd server && node tests/ai-service-test.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Dynamic import of the centralized provider
const llmProvider = (await import('../services/ai-brain/llm-provider.js')).default;

// ─── Helpers ─────────────────────────────────────────────────

const clr = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', magenta: '\x1b[35m', white: '\x1b[37m',
  bgGreen: '\x1b[42m', bgRed: '\x1b[41m', bgYellow: '\x1b[43m',
  bgCyan: '\x1b[46m',
};

const results = [];

function addResult(name, provider, model, latencyMs, status, details = {}) {
  results.push({ name, provider, model, latencyMs, status, ...details });
}

function fmtMs(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function statusIcon(s) {
  switch (s) {
    case 'pass': return `${clr.green}✅ PASS${clr.reset}`;
    case 'fail': return `${clr.red}❌ FAIL${clr.reset}`;
    case 'skip': return `${clr.yellow}⏭️  SKIP${clr.reset}`;
    case 'warn': return `${clr.yellow}⚠️  WARN${clr.reset}`;
  }
}

function heading(title) {
  console.log(`\n${clr.cyan}${'─'.repeat(65)}${clr.reset}`);
  console.log(`${clr.bold}${clr.cyan}  ${title}${clr.reset}`);
  console.log(`${clr.cyan}${'─'.repeat(65)}${clr.reset}`);
}

// ─── TEST 1: iSHA Direct (Primary) ──────────────────────────

async function testIshaChat() {
  heading('TEST 1: iSHA Chat (Primary — BiMediX2 GPU)');
  try {
    const r = await llmProvider.chat({
      messages: [
        { role: 'system', content: 'You are Dr. iSHA, a medical AI. Be concise.' },
        { role: 'user', content: 'What is the normal blood pressure range for adults? Reply in 2 sentences.' }
      ],
      temperature: 0.3,
      maxTokens: 150,
      forceProvider: 'isha',
    });
    console.log(`  Provider : ${clr.green}${r.provider}${clr.reset}`);
    console.log(`  Model    : ${r.model}`);
    console.log(`  Latency  : ${clr.bold}${fmtMs(r.latencyMs)}${clr.reset}`);
    console.log(`  Tokens   : in=${r.usage.inputTokens}, out=${r.usage.outputTokens}, total=${r.usage.totalTokens}`);
    console.log(`  Response : ${r.content?.substring(0, 200)}`);
    console.log(`  Cascade  : ${JSON.stringify(r.cascade)}`);
    addResult('iSHA Chat (BiMediX2)', r.provider, r.model, r.latencyMs, 'pass', { tokens: r.usage.totalTokens, snippet: r.content?.substring(0, 100) });
  } catch (e) {
    console.log(`  ${clr.red}ERROR: ${e.message}${clr.reset}`);
    addResult('iSHA Chat (BiMediX2)', '-', '-', 0, 'fail', { error: e.message });
  }
}

// ─── TEST 2: Groq Fallback (Forced) ─────────────────────────

async function testGroqChat() {
  heading('TEST 2: Groq Chat (Forced Fallback — Llama 3.3 70B)');
  try {
    const r = await llmProvider.chat({
      messages: [
        { role: 'system', content: 'You are a medical AI assistant. Be concise.' },
        { role: 'user', content: 'List the 3 most common symptoms of Type 2 Diabetes. Brief bullet points.' }
      ],
      temperature: 0.3,
      maxTokens: 200,
      forceProvider: 'groq',
    });
    console.log(`  Provider : ${clr.green}${r.provider}${clr.reset}`);
    console.log(`  Model    : ${r.model}`);
    console.log(`  Latency  : ${clr.bold}${fmtMs(r.latencyMs)}${clr.reset}`);
    console.log(`  Tokens   : in=${r.usage.inputTokens}, out=${r.usage.outputTokens}, total=${r.usage.totalTokens}`);
    console.log(`  Response : ${r.content?.substring(0, 250)}`);
    addResult('Groq Chat (Llama 3.3 70B)', r.provider, r.model, r.latencyMs, 'pass', { tokens: r.usage.totalTokens, snippet: r.content?.substring(0, 100) });
  } catch (e) {
    console.log(`  ${clr.red}ERROR: ${e.message}${clr.reset}`);
    addResult('Groq Chat (Llama 3.3 70B)', '-', '-', 0, 'fail', { error: e.message });
  }
}

// ─── TEST 3: OpenAI Fallback (Forced) ────────────────────────

async function testOpenAIChat() {
  heading('TEST 3: OpenAI Chat (Forced Fallback — GPT-3.5-turbo)');
  try {
    const r = await llmProvider.chat({
      messages: [
        { role: 'system', content: 'You are a medical AI. Be concise.' },
        { role: 'user', content: 'What are the warning signs of a heart attack? 3 bullet points.' }
      ],
      temperature: 0.3,
      maxTokens: 200,
      forceProvider: 'openai',
    });
    console.log(`  Provider : ${clr.green}${r.provider}${clr.reset}`);
    console.log(`  Model    : ${r.model}`);
    console.log(`  Latency  : ${clr.bold}${fmtMs(r.latencyMs)}${clr.reset}`);
    console.log(`  Tokens   : in=${r.usage.inputTokens}, out=${r.usage.outputTokens}, total=${r.usage.totalTokens}`);
    console.log(`  Response : ${r.content?.substring(0, 250)}`);
    addResult('OpenAI Chat (GPT-3.5)', r.provider, r.model, r.latencyMs, 'pass', { tokens: r.usage.totalTokens, snippet: r.content?.substring(0, 100) });
  } catch (e) {
    console.log(`  ${clr.red}ERROR: ${e.message}${clr.reset}`);
    addResult('OpenAI Chat (GPT-3.5)', '-', '-', 0, 'fail', { error: e.message });
  }
}

// ─── TEST 4: Full Cascade (natural flow) ─────────────────────

async function testCascade() {
  heading('TEST 4: Full Cascade (iSHA → Groq → OpenAI)');
  try {
    const r = await llmProvider.chat({
      messages: [
        { role: 'user', content: 'What is Metformin used for? One sentence.' }
      ],
      temperature: 0.3,
      maxTokens: 100,
    });
    console.log(`  Winner   : ${clr.green}${clr.bold}${r.provider}${clr.reset}`);
    console.log(`  Model    : ${r.model}`);
    console.log(`  Latency  : ${clr.bold}${fmtMs(r.latencyMs)}${clr.reset}`);
    console.log(`  Cascade  : ${JSON.stringify(r.cascade)}`);
    console.log(`  Response : ${r.content?.substring(0, 200)}`);
    addResult('Full Cascade (auto)', r.provider, r.model, r.latencyMs, 'pass', { cascade: r.cascade, snippet: r.content?.substring(0, 100) });
  } catch (e) {
    console.log(`  ${clr.red}ERROR: ${e.message}${clr.reset}`);
    addResult('Full Cascade (auto)', '-', '-', 0, 'fail', { error: e.message });
  }
}

// ─── TEST 5: JSON Mode (structured output) ───────────────────

async function testJsonMode() {
  heading('TEST 5: JSON Mode (Structured Medical Output)');
  try {
    const r = await llmProvider.chat({
      messages: [
        { role: 'system', content: 'You are a medical AI that outputs only valid JSON.' },
        { role: 'user', content: 'Analyze symptoms: headache, fever 101F, body ache. Respond with JSON: {"diagnosis":"","severity":"low|medium|high","advice":""}' }
      ],
      temperature: 0.2,
      maxTokens: 300,
      responseFormat: { type: 'json_object' },
    });
    console.log(`  Provider : ${clr.green}${r.provider}${clr.reset}`);
    console.log(`  Latency  : ${clr.bold}${fmtMs(r.latencyMs)}${clr.reset}`);
    let parsed;
    try {
      parsed = JSON.parse(r.content);
      console.log(`  JSON     : ${clr.green}Valid ✅${clr.reset}`);
      console.log(`  Output   : ${JSON.stringify(parsed, null, 2).substring(0, 300)}`);
    } catch {
      console.log(`  JSON     : ${clr.red}Invalid ❌${clr.reset}`);
      console.log(`  Raw      : ${r.content?.substring(0, 200)}`);
    }
    addResult('JSON Mode', r.provider, r.model, r.latencyMs, parsed ? 'pass' : 'warn', { validJson: !!parsed });
  } catch (e) {
    console.log(`  ${clr.red}ERROR: ${e.message}${clr.reset}`);
    addResult('JSON Mode', '-', '-', 0, 'fail', { error: e.message });
  }
}

// ─── TEST 6: AI Vision — Cascade (Anthropic → Groq) ─────────

async function testVision() {
  heading('TEST 6: AI Vision — Auto Cascade (Anthropic → Groq Llama 4 Scout)');

  // Use the Mediqzy logo (real JPEG) as test image
  const testImagePath = path.resolve(__dirname, '../../client/logo/Mediqzy_logo.jpeg');
  if (!fs.existsSync(testImagePath)) {
    console.log(`  ${clr.yellow}No test image found at ${testImagePath}${clr.reset}`);
    addResult('Vision Auto-Cascade', '-', '-', 0, 'skip', { reason: 'No test image' });
    return;
  }

  const imageBuffer = fs.readFileSync(testImagePath);
  const base64Image = imageBuffer.toString('base64');
  const fileSizeKB = (imageBuffer.length / 1024).toFixed(1);
  console.log(`  Image    : Mediqzy_logo.jpeg (${fileSizeKB}KB)`);

  try {
    const r = await llmProvider.vision({
      base64Image,
      mimeType: 'image/jpeg',
      prompt: 'Describe what you see in this image. What text or logo is shown? Keep it brief.',
      maxTokens: 150,
    });
    console.log(`  Provider : ${clr.green}${r.provider}${clr.reset}`);
    console.log(`  Model    : ${r.model}`);
    console.log(`  Latency  : ${clr.bold}${fmtMs(r.latencyMs)}${clr.reset}`);
    console.log(`  Tokens   : in=${r.usage?.input_tokens || r.usage?.prompt_tokens || '?'}, out=${r.usage?.output_tokens || r.usage?.completion_tokens || '?'}`);
    console.log(`  Cascade  : ${JSON.stringify(r.cascade)}`);
    console.log(`  Response : ${r.content?.substring(0, 200)}`);
    addResult('Vision Auto-Cascade', r.provider, r.model, r.latencyMs, 'pass', { snippet: r.content?.substring(0, 80), cascade: r.cascade });
  } catch (e) {
    console.log(`  ${clr.red}ERROR: ${e.message}${clr.reset}`);
    addResult('Vision Auto-Cascade', '-', '-', 0, 'fail', { error: e.message });
  }
}

// ─── TEST 6b: Groq Vision Forced ─────────────────────────────

async function testGroqVision() {
  heading('TEST 6b: Groq Vision (Forced — Llama 4 Scout 17B)');

  // Use the Mediqzy logo (real JPEG) as test image
  const testImagePath = path.resolve(__dirname, '../../client/logo/Mediqzy_logo.jpeg');
  if (!fs.existsSync(testImagePath)) {
    console.log(`  ${clr.yellow}No test image found${clr.reset}`);
    addResult('Groq Vision (Llama 4)', '-', '-', 0, 'skip', { reason: 'No test image' });
    return;
  }

  const imageBuffer = fs.readFileSync(testImagePath);
  const base64Image = imageBuffer.toString('base64');

  try {
    const r = await llmProvider.vision({
      base64Image,
      mimeType: 'image/jpeg',
      prompt: 'You are a medical image analysis AI. Describe this image in detail. What colors and shapes do you see? What text is shown?',
      maxTokens: 200,
      forceProvider: 'groq',
    });
    console.log(`  Provider : ${clr.green}${r.provider}${clr.reset}`);
    console.log(`  Model    : ${r.model}`);
    console.log(`  Latency  : ${clr.bold}${fmtMs(r.latencyMs)}${clr.reset}`);
    console.log(`  Cascade  : ${JSON.stringify(r.cascade)}`);
    console.log(`  Response : ${r.content?.substring(0, 250)}`);
    addResult('Groq Vision (Llama 4)', r.provider, r.model, r.latencyMs, 'pass', { snippet: r.content?.substring(0, 80) });
  } catch (e) {
    console.log(`  ${clr.red}ERROR: ${e.message}${clr.reset}`);
    addResult('Groq Vision (Llama 4)', '-', '-', 0, 'fail', { error: e.message });
  }
}

// ─── TEST 7: Speech-to-Text (Whisper Cascade) ────────────────

async function testSTT() {
  heading('TEST 7: Speech-to-Text (Groq Whisper → OpenAI Whisper)');

  // Use JFK audio sample from whisper.cpp if available
  const audioFiles = [
    path.resolve(__dirname, '../../whisper.cpp/samples/jfk.wav'),
    path.resolve(__dirname, '../../whisper.cpp/samples/jfk.mp3'),
  ];

  let audioPath = null;
  for (const f of audioFiles) {
    if (fs.existsSync(f)) { audioPath = f; break; }
  }

  if (!audioPath) {
    console.log(`  ${clr.yellow}No test audio file found — creating synthetic test${clr.reset}`);
    // Create a minimal WAV file (silence, 0.1s, 16kHz mono 16-bit)
    const sampleRate = 16000;
    const duration = 0.1;
    const numSamples = Math.floor(sampleRate * duration);
    const dataSize = numSamples * 2; // 16-bit = 2 bytes per sample
    const headerSize = 44;
    const buffer = Buffer.alloc(headerSize + dataSize);

    // WAV header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(headerSize + dataSize - 8, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // data chunk size
    buffer.writeUInt16LE(1, 20);  // PCM
    buffer.writeUInt16LE(1, 22);  // mono
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
    buffer.writeUInt16LE(2, 32);  // block align
    buffer.writeUInt16LE(16, 34); // bits per sample
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);
    // Silence data (zeros)

    audioPath = path.resolve(__dirname, '../uploads/_test_silence.wav');
    fs.mkdirSync(path.dirname(audioPath), { recursive: true });
    fs.writeFileSync(audioPath, buffer);
    console.log(`  Created minimal WAV (${dataSize} bytes silence)`);
  }

  const fileSizeKB = (fs.statSync(audioPath).size / 1024).toFixed(1);
  console.log(`  Audio    : ${path.basename(audioPath)} (${fileSizeKB}KB)`);

  try {
    const fileStream = fs.createReadStream(audioPath);
    const r = await llmProvider.transcribe(fileStream, { language: 'en' });

    if (r.success) {
      console.log(`  Provider : ${clr.green}${r.provider}${clr.reset}`);
      console.log(`  Latency  : ${clr.bold}(in logs)${clr.reset}`);
      console.log(`  Duration : ${r.duration || '?'}s`);
      console.log(`  Language : ${r.language || '?'}`);
      console.log(`  Text     : "${r.text?.substring(0, 200)}"`);
      addResult('STT (Whisper)', r.provider, r.provider === 'groq-whisper' ? 'whisper-large-v3' : 'whisper-1', 0, 'pass', { text: r.text?.substring(0, 80) });
    } else {
      console.log(`  ${clr.red}FAILED: ${r.error}${clr.reset}`);
      addResult('STT (Whisper)', 'none', '-', 0, 'fail', { error: r.error });
    }
  } catch (e) {
    console.log(`  ${clr.red}ERROR: ${e.message}${clr.reset}`);
    addResult('STT (Whisper)', '-', '-', 0, 'fail', { error: e.message });
  }

  // Cleanup synthetic file
  if (audioPath.includes('_test_silence')) {
    fs.unlinkSync(audioPath);
  }
}

// ─── TEST 8: Translation via Cascade ─────────────────────────

async function testTranslation() {
  heading('TEST 8: Medical Translation (iSHA Cascade)');
  try {
    const r = await llmProvider.chat({
      messages: [
        { role: 'system', content: 'You are a professional translator specializing in medical and healthcare communications.' },
        { role: 'user', content: 'Translate the following medical text to Hindi while preserving medical terminology:\n\n"Take Metformin 500mg twice daily after meals. Monitor blood sugar levels regularly."' }
      ],
      temperature: 0.3,
      maxTokens: 200,
    });
    console.log(`  Provider : ${clr.green}${r.provider}${clr.reset}`);
    console.log(`  Model    : ${r.model}`);
    console.log(`  Latency  : ${clr.bold}${fmtMs(r.latencyMs)}${clr.reset}`);
    console.log(`  Output   : ${r.content?.substring(0, 250)}`);
    addResult('Translation (Hindi)', r.provider, r.model, r.latencyMs, 'pass', { snippet: r.content?.substring(0, 80) });
  } catch (e) {
    console.log(`  ${clr.red}ERROR: ${e.message}${clr.reset}`);
    addResult('Translation (Hindi)', '-', '-', 0, 'fail', { error: e.message });
  }
}

// ─── TEST 8b: Translation via Forced Groq ────────────────────

async function testTranslationGroq() {
  heading('TEST 8b: Medical Translation (Forced Groq — Llama 3.3 70B)');
  try {
    const r = await llmProvider.chat({
      messages: [
        { role: 'system', content: 'You are a professional translator specializing in medical translations.' },
        { role: 'user', content: 'Translate to Tamil:\n\n"Your prescription includes Amoxicillin 500mg three times daily for 7 days. Complete the full course."' }
      ],
      temperature: 0.3,
      maxTokens: 200,
      forceProvider: 'groq',
    });
    console.log(`  Provider : ${clr.green}${r.provider}${clr.reset}`);
    console.log(`  Model    : ${r.model}`);
    console.log(`  Latency  : ${clr.bold}${fmtMs(r.latencyMs)}${clr.reset}`);
    console.log(`  Output   : ${r.content?.substring(0, 250)}`);
    addResult('Translation (Tamil/Groq)', r.provider, r.model, r.latencyMs, 'pass', { snippet: r.content?.substring(0, 80) });
  } catch (e) {
    console.log(`  ${clr.red}ERROR: ${e.message}${clr.reset}`);
    addResult('Translation (Tamil/Groq)', '-', '-', 0, 'fail', { error: e.message });
  }
}

// ─── TEST 9: CDSS Structured Query ───────────────────────────

async function testCDSS() {
  heading('TEST 9: CDSS-style Structured Query (JSON output)');
  try {
    const r = await llmProvider.chat({
      messages: [
        { role: 'system', content: `You are a clinical decision support AI. Respond ONLY in valid JSON with this structure:
{
  "summary": "brief clinical summary",
  "differentialDiagnosis": ["diagnosis1", "diagnosis2"],
  "labTests": ["test1", "test2"],
  "warnings": ["warning if any"],
  "icd10Codes": [{"code": "J06.9", "description": "Upper respiratory infection"}]
}` },
        { role: 'user', content: 'Patient: 45M, presents with persistent dry cough for 2 weeks, low-grade fever 99.5F, fatigue, no weight loss. Non-smoker.' }
      ],
      temperature: 0.3,
      maxTokens: 800,
      responseFormat: { type: 'json_object' },
    });
    console.log(`  Provider : ${clr.green}${r.provider}${clr.reset}`);
    console.log(`  Latency  : ${clr.bold}${fmtMs(r.latencyMs)}${clr.reset}`);
    let parsed;
    try {
      parsed = JSON.parse(r.content);
      console.log(`  JSON     : ${clr.green}Valid ✅${clr.reset}`);
      console.log(`  Diagnosis: ${JSON.stringify(parsed.differentialDiagnosis || [])}`);
      console.log(`  Labs     : ${JSON.stringify(parsed.labTests || [])}`);
      console.log(`  ICD-10   : ${JSON.stringify(parsed.icd10Codes || [])}`);
    } catch {
      console.log(`  JSON     : ${clr.red}Invalid ❌${clr.reset}`);
    }
    addResult('CDSS Query', r.provider, r.model, r.latencyMs, parsed ? 'pass' : 'warn', { validJson: !!parsed });
  } catch (e) {
    console.log(`  ${clr.red}ERROR: ${e.message}${clr.reset}`);
    addResult('CDSS Query', '-', '-', 0, 'fail', { error: e.message });
  }
}

// ─── TEST 10: Provider Availability ──────────────────────────

async function testProviders() {
  heading('TEST 10: Provider Availability');
  const providers = llmProvider.listProviders();
  for (const p of providers) {
    const icon = p.available ? `${clr.green}✅` : `${clr.red}❌`;
    console.log(`  ${icon} ${p.label}${clr.reset} (${p.model}) — Priority ${p.priority}`);
  }
  const allAvail = providers.filter(p => p.available).length;
  addResult('Provider Status', '-', '-', 0, allAvail >= 2 ? 'pass' : 'warn', {
    available: `${allAvail}/${providers.length}`,
    details: providers.map(p => `${p.name}:${p.available}`).join(', ')
  });
}

// ─── Summary Report ──────────────────────────────────────────

function printSummary() {
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const skipped = results.filter(r => r.status === 'skip').length;
  const warned = results.filter(r => r.status === 'warn').length;
  const total = results.length;

  console.log('\n');
  console.log(`${clr.bold}${clr.cyan}╔${'═'.repeat(77)}╗${clr.reset}`);
  console.log(`${clr.bold}${clr.cyan}║${clr.reset}${clr.bold}     MEDICZY AI SERVICE — COMPREHENSIVE TEST REPORT                         ${clr.cyan}║${clr.reset}`);
  console.log(`${clr.bold}${clr.cyan}║${clr.reset}${clr.dim}     Date: ${new Date().toISOString().split('T')[0]}  |  Hub: llm-provider.js  |  Primary: iSHA          ${clr.cyan}║${clr.reset}`);
  console.log(`${clr.bold}${clr.cyan}╠${'═'.repeat(77)}╣${clr.reset}`);

  // Table header
  console.log(`${clr.cyan}║${clr.reset} ${clr.bold}${'Test'.padEnd(28)} ${'Provider'.padEnd(14)} ${'Model'.padEnd(18)} ${'Latency'.padEnd(9)} Status${clr.reset} ${clr.cyan}║${clr.reset}`);
  console.log(`${clr.cyan}╠${'─'.repeat(77)}╣${clr.reset}`);

  for (const r of results) {
    const stat = r.status === 'pass' ? `${clr.green}PASS${clr.reset}` :
                 r.status === 'fail' ? `${clr.red}FAIL${clr.reset}` :
                 r.status === 'skip' ? `${clr.yellow}SKIP${clr.reset}` :
                 `${clr.yellow}WARN${clr.reset}`;
    const latStr = r.latencyMs > 0 ? fmtMs(r.latencyMs) : '-';
    console.log(`${clr.cyan}║${clr.reset} ${r.name.padEnd(28)} ${(r.provider || '-').padEnd(14)} ${(r.model || '-').substring(0,17).padEnd(18)} ${latStr.padEnd(9)} ${stat}   ${clr.cyan}║${clr.reset}`);
  }

  console.log(`${clr.cyan}╠${'═'.repeat(77)}╣${clr.reset}`);

  // Score bar
  const scoreColor = failed === 0 ? clr.green : failed <= 2 ? clr.yellow : clr.red;
  const scoreBg = failed === 0 ? clr.bgGreen : failed <= 2 ? clr.bgYellow : clr.bgRed;
  const scoreText = `${passed} PASS | ${failed} FAIL | ${skipped} SKIP | ${warned} WARN`;
  console.log(`${clr.cyan}║${clr.reset}  ${clr.bold}Results: ${scoreColor}${scoreText}${clr.reset}${''.padEnd(77 - 12 - scoreText.length)}${clr.cyan}║${clr.reset}`);

  // Latency summary
  const passedWithLatency = results.filter(r => r.status === 'pass' && r.latencyMs > 0);
  if (passedWithLatency.length > 0) {
    const avgMs = Math.round(passedWithLatency.reduce((s, r) => s + r.latencyMs, 0) / passedWithLatency.length);
    const minMs = Math.min(...passedWithLatency.map(r => r.latencyMs));
    const maxMs = Math.max(...passedWithLatency.map(r => r.latencyMs));
    console.log(`${clr.cyan}║${clr.reset}  ${clr.bold}Latency: ${clr.reset}avg=${fmtMs(avgMs)}, min=${fmtMs(minMs)}, max=${fmtMs(maxMs)}${''.padEnd(77 - 40)}${clr.cyan}║${clr.reset}`);
  }

  // Architecture
  console.log(`${clr.cyan}╠${'═'.repeat(77)}╣${clr.reset}`);
  console.log(`${clr.cyan}║${clr.reset}  ${clr.bold}Architecture:${clr.reset}                                                              ${clr.cyan}║${clr.reset}`);
  console.log(`${clr.cyan}║${clr.reset}  ${clr.dim}Text  : iSHA (BiMediX2 8B) → Groq (Llama 3.3 70B) → OpenAI (GPT-3.5)${clr.reset}     ${clr.cyan}║${clr.reset}`);
  console.log(`${clr.cyan}║${clr.reset}  ${clr.dim}Vision: Anthropic Claude 3.5 → Groq Llama 4 Scout 17B (cascade)${clr.reset}            ${clr.cyan}║${clr.reset}`);
  console.log(`${clr.cyan}║${clr.reset}  ${clr.dim}STT   : Groq Whisper (large-v3) → OpenAI Whisper (whisper-1)${clr.reset}                ${clr.cyan}║${clr.reset}`);
  console.log(`${clr.cyan}║${clr.reset}  ${clr.dim}JSON  : Cascade validates JSON output, auto-falls to next provider${clr.reset}          ${clr.cyan}║${clr.reset}`);
  console.log(`${clr.cyan}║${clr.reset}  ${clr.dim}Hub   : server/services/ai-brain/llm-provider.js${clr.reset}                             ${clr.cyan}║${clr.reset}`);
  console.log(`${clr.cyan}╚${'═'.repeat(77)}╝${clr.reset}`);
  console.log();

  // Exit code
  process.exit(failed > 0 ? 1 : 0);
}

// ─── Run All Tests ───────────────────────────────────────────

console.log(`\n${clr.bold}${clr.magenta}`);
console.log('  ╔═══════════════════════════════════════════════════════════════╗');
console.log('  ║      MEDICZY AI SERVICE — COMPREHENSIVE TEST SUITE          ║');
console.log('  ║      Testing all AI capabilities through llm-provider       ║');
console.log('  ║      Text · Vision · Audio · JSON · Translation · CDSS      ║');
console.log('  ╚═══════════════════════════════════════════════════════════════╝');
console.log(clr.reset);

const startTime = Date.now();

await testIshaChat();
await testGroqChat();
await testOpenAIChat();
await testCascade();
await testJsonMode();
await testVision();
await testGroqVision();
await testSTT();
await testTranslation();
await testTranslationGroq();
await testCDSS();
await testProviders();

const totalTime = Date.now() - startTime;
console.log(`\n  ${clr.dim}Total test time: ${fmtMs(totalTime)}${clr.reset}`);

printSummary();
