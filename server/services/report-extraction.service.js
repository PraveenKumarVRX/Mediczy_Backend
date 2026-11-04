/**
 * report-extraction.service.js  (Step 3 — shared document→observations extractor)
 * ================================================================================
 * One extractor for both the email and app-upload paths (replaces the regex parser in
 * emailAutoProcess and the ad-hoc path in report-analysis at WP3 cutover). It is PURE: it
 * returns candidate observations; it does NOT write clinical rows. Persistence + verification
 * are separate (WP3/WP4).
 *
 * Fixes the defects the CTO review called out:
 *  - numeric ZERO preserved (never coerced to '');
 *  - no silent 12k truncation — long text is chunked, and a truncated/empty result is a
 *    `partial`/`failed` status, not success;
 *  - page-aware extraction with page + source_text grounding;
 *  - NO binary-as-UTF-8 fallback — a PDF with no text layer goes to OCR, not garbage decode;
 *  - output validated against the frozen observation contract
 *    (docs/ai/REPORT_OCR_STEP1_IDENTITY_AND_CONTRACT.md §3).
 *
 * OCR is a replaceable adapter (Tesseract now; PaddleOCR/cloud later), selected by benchmark.
 */

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { writeFile, readFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pool from '../db/pgPool.js';

const execFileP = promisify(execFile);
export const EXTRACTION_VERSION = 'rx-extract@1';
const MIN_TEXT_CHARS = 200;      // below this a PDF is treated as scanned → OCR
const LLM_CHUNK_CHARS = 4500;    // chunk size; kept modest so weaker models stay reliable. Chunks are
                                 // processed concurrently and never dropped. Tune up with a stronger model.

// ── Text extraction ─────────────────────────────────────────────────────────

/** Extract page-aware text. Returns { pages: [{page, text}], method, truncated:false }. No binary fallback. */
async function extractText(buffer, mime) {
  if (mime === 'application/pdf') {
    try {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: buffer });
      await parser.load();
      const res = await parser.getText();
      const total = res.totalPages || 0;
      // pdf-parse v2 exposes per-page text when available; fall back to one blob.
      const pages = Array.isArray(res.pages) && res.pages.length
        ? res.pages.map((p, i) => ({ page: i + 1, text: String(p.text || p || '') }))
        : [{ page: 1, text: String(res.text || '') }];
      await parser.destroy();
      const joined = pages.map((p) => p.text).join('').trim();
      if (joined.length >= MIN_TEXT_CHARS) return { pages, method: 'pdf-text', totalPages: total };
      // Thin/absent text layer → OCR (NOT a UTF-8 decode of the binary).
      return await ocrPdf(buffer);
    } catch {
      return await ocrPdf(buffer);
    }
  }
  if (mime && mime.startsWith('image/')) {
    const text = await ocrImageBuffer(buffer, mime);
    return { pages: [{ page: 1, text }], method: 'tesseract-image', totalPages: 1 };
  }
  // Only decode as text when the type actually IS text.
  if (mime && (mime.startsWith('text/') || mime === 'application/json')) {
    return { pages: [{ page: 1, text: buffer.toString('utf-8') }], method: 'text', totalPages: 1 };
  }
  return { pages: [], method: 'unsupported', totalPages: 0 };
}

// ── OCR adapter (replaceable) ─────────────────────────────────────────────────

async function ocrImageBuffer(buffer, mime) {
  const dir = await mkdtemp(join(tmpdir(), 'rx-ocr-'));
  const ext = (mime && mime.split('/')[1]) || 'png';
  const img = join(dir, `in.${ext}`);
  try {
    await writeFile(img, buffer);
    // tesseract <img> stdout  → text on stdout
    const { stdout } = await execFileP('tesseract', [img, 'stdout', '--psm', '6'], { maxBuffer: 10 * 1024 * 1024 });
    return String(stdout || '');
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** PDF → OCR. Requires a rasterizer (pdftoppm). If absent, returns an explicit ocr_unavailable state. */
async function ocrPdf(buffer) {
  const dir = await mkdtemp(join(tmpdir(), 'rx-pdf-'));
  const pdf = join(dir, 'in.pdf');
  try {
    await writeFile(pdf, buffer);
    try {
      await execFileP('pdftoppm', ['-png', '-r', '200', pdf, join(dir, 'pg')], { maxBuffer: 50 * 1024 * 1024 });
    } catch {
      // Rasterizer not installed — be explicit, never guess.
      return { pages: [], method: 'ocr_unavailable', totalPages: 0, note: 'pdftoppm (poppler-utils) not installed' };
    }
    const { readdir } = await import('node:fs/promises');
    const files = (await readdir(dir)).filter((f) => f.endsWith('.png')).sort();
    const pages = [];
    for (let i = 0; i < files.length; i++) {
      const png = await readFile(join(dir, files[i]));
      pages.push({ page: i + 1, text: await ocrImageBuffer(png, 'image/png') });
    }
    return { pages, method: 'tesseract-pdf', totalPages: pages.length };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ── LLM structuring ───────────────────────────────────────────────────────────

const PROMPT = `You extract laboratory values from a medical report. Return ONLY a JSON array (no prose, no code fences). One object per analyte result, using EXACTLY these keys:
[{"raw_name":"", "raw_value":"", "unit_original":"", "reference_range_source":"", "flag_source":"", "qualifier":null, "page":1, "source_text":"", "confidence":0.0}]
Rules:
- Copy raw_name, raw_value, unit and reference range VERBATIM from the report. Do not invent, normalise, or compute.
- Preserve a value of 0 as "0" (never blank).
- qualifier is one of "<", ">", "positive", "negative", "trace", "detected", "not detected", or null.
- flag_source is the lab's own flag (e.g. H, L, HIGH, LOW) or null.
- confidence 0..1 is YOUR certainty you read it correctly.
- Include every analyte, including repeats. If none, return [].`;

// Extraction uses a capable model pinned to Groq (Llama 3.3 70B) — the weaker default fallback
// returned empty content on medical chunks. Overridable via env.
const EXTRACTION_PROVIDER = process.env.REPORT_EXTRACTION_PROVIDER || 'groq';
const EXTRACTION_MODEL = process.env.REPORT_EXTRACTION_MODEL || 'llama-3.3-70b-versatile';

async function structureChunk(text, pageHint) {
  const { default: llm } = await import('./ai-brain/llm-provider.js');
  const resp = await llm.chat({
    messages: [
      { role: 'system', content: PROMPT },
      { role: 'user', content: `Report text (page ${pageHint}):\n\n${text}` },
    ],
    temperature: 0,
    maxTokens: 4000,
    forceProvider: EXTRACTION_PROVIDER,
    model: EXTRACTION_MODEL,
    skipCache: true,
  });
  const raw = typeof resp === 'string' ? resp : (resp?.content || resp?.text || '');
  const m = raw.match(/\[[\s\S]*\]/);
  if (!m) return { items: [], parseFailed: true };
  try { return { items: JSON.parse(m[0]), parseFailed: false }; }
  catch { return { items: [], parseFailed: true }; }
}

// ── Canonicalisation (subordinate to HyperGrid; catalog is reviewable seed) ────

async function canonicalise(items, db, ctx = {}) {
  // Resolve through the HyperGrid-backed authority (seeded from lab_parameter_catalog).
  // Threshold-gated: an unconfident name returns null and is routed to review, never guessed.
  const { resolveLabConcepts } = await import('./lab-terminology.service.js');
  const rawNames = items.map((i) => (i.raw_name ? String(i.raw_name) : null)).filter(Boolean);
  const resolved = await resolveLabConcepts(rawNames, { tenantId: ctx.tenantId || null }, db);
  return items.map((i) => {
    const concept = i.raw_name ? resolved.get(String(i.raw_name)) : null;
    const hit = concept ? { canonical_name: concept.canonical, loinc_code: concept.loinc } : null;
    const rawVal = i.raw_value;
    const num = rawVal !== null && rawVal !== undefined && String(rawVal).trim() !== '' && !isNaN(Number(rawVal))
      ? Number(rawVal) : null;   // preserves 0; null for non-numeric/qualitative
    return {
      raw_name: i.raw_name ?? null,
      canonical_name: hit?.canonical_name ?? null,     // null when not confidently mapped — never guessed
      loinc_code: hit?.loinc_code ?? null,              // only from a validated catalog/HyperGrid hit
      raw_value: rawVal ?? null,
      typed_value: num,
      qualifier: i.qualifier ?? null,
      unit_original: i.unit_original ?? null,
      unit_normalized: null,
      reference_range_source: i.reference_range_source ?? null,  // the lab's range — preserved, never substituted
      flag_source: i.flag_source ?? null,
      interpretation_normalized: null,
      interpretation_rule: null,
      confidence: typeof i.confidence === 'number' ? i.confidence : null,
      page: Number.isInteger(i.page) ? i.page : null,
      source_text: i.source_text ?? null,
      extraction_version: EXTRACTION_VERSION,
      verification_status: 'pending',
    };
  });
}

// ── Orchestration ──────────────────────────────────────────────────────────────

/**
 * @returns {Promise<{status:'extracted'|'partial'|'failed', observations:Array, meta:object}>}
 */
export async function extractReportObservations(buffer, mime, ctx = {}, db = pool) {
  const started = Date.now();
  const document_hash = createHash('sha256').update(buffer).digest('hex');
  const meta = { ocr_method: null, pages: 0, textLength: 0, truncated: false, chunks: 0, parseFailures: 0, errors: [], document_hash };
  try {
    const ex = await extractText(buffer, mime);
    meta.ocr_method = ex.method;
    meta.pages = ex.totalPages || ex.pages.length;
    const fullText = ex.pages.map((p) => p.text || '').join('\n').trim();
    meta.textLength = fullText.length;

    if (ex.method === 'ocr_unavailable') { meta.errors.push(ex.note); meta.latency_ms = Date.now() - started; return { status: 'failed', observations: [], meta }; }
    if (!fullText) { meta.latency_ms = Date.now() - started; return { status: 'failed', observations: [], meta }; }

    // Pack pages into as few chunks as possible (≤ LLM_CHUNK_CHARS each) so NOTHING is
    // dropped (the old path truncated at 12k) WITHOUT making one LLM call per page.
    const chunks = [];
    let buf = '', bufPage = null;
    const flush = () => { if (buf) { chunks.push({ page: bufPage, text: buf }); buf = ''; bufPage = null; } };
    for (const p of ex.pages) {
      const t = (p.text || '').trim();
      if (!t) continue;
      if (t.length > LLM_CHUNK_CHARS) {                 // a single huge page: flush, then split it
        flush();
        for (let o = 0; o < t.length; o += LLM_CHUNK_CHARS) chunks.push({ page: p.page, text: t.slice(o, o + LLM_CHUNK_CHARS) });
        continue;
      }
      if (buf && buf.length + t.length + 1 > LLM_CHUNK_CHARS) flush();
      if (!buf) bufPage = p.page;
      buf += (buf ? '\n' : '') + t;
    }
    flush();
    meta.chunks = chunks.length;

    // Bounded concurrency so a multi-chunk report doesn't run fully serially.
    const CONCURRENCY = 3;
    const items = [];
    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
      const batch = chunks.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map((c) => structureChunk(c.text, c.page)));
      results.forEach((res, j) => {
        if (res.parseFailed) meta.parseFailures++;
        for (const it of res.items) { if (it && it.page == null) it.page = batch[j].page; items.push(it); }
      });
    }

    const observations = await canonicalise(items.filter((x) => x && (x.raw_name || x.raw_value != null)), db, ctx);
    meta.latency_ms = Date.now() - started;

    // Completeness: parse failures or zero observations from non-empty text ⇒ partial, not success.
    const status = (meta.parseFailures > 0 || observations.length === 0) ? 'partial' : 'extracted';
    return { status, observations, meta };
  } catch (err) {
    meta.errors.push(String(err.message || err));
    meta.latency_ms = Date.now() - started;
    return { status: 'failed', observations: [], meta };
  }
}

export default { extractReportObservations, EXTRACTION_VERSION };
