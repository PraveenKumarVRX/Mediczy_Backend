#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db/pgPool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const SIB_URL = process.env.SIB_URL || 'http://localhost:8001';
const DEFAULT_QUERY = 'latest IRDAI group mediclaim policy claim rules India';
const QUERY = process.env.RAG_AUDIT_QUERY || DEFAULT_QUERY;
const TOP_K = Number(process.env.RAG_AUDIT_TOP_K || 5);

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

async function postJson(url, body = undefined) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {
    // Keep raw response when non-JSON.
  }
  return { status: res.status, data };
}

async function ragSearch(query, topK) {
  const url = `${SIB_URL}/rag/search?query=${encodeURIComponent(query)}&top_k=${topK}`;
  return postJson(url);
}

async function getKbCounts() {
  const q1 = await pool.query(
    "SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='ready')::int AS ready FROM ai_knowledge_documents"
  );
  const q2 = await pool.query(
    "SELECT COUNT(*)::int AS chunks, COALESCE(SUM(token_count),0)::bigint AS tokens FROM ai_document_chunks"
  );
  const q3 = await pool.query(
    "SELECT metadata->>'source' AS source, COUNT(*)::int AS docs FROM ai_knowledge_documents GROUP BY 1 ORDER BY 2 DESC NULLS LAST LIMIT 10"
  );

  return {
    documents: q1.rows[0],
    chunks: q2.rows[0],
    topSources: q3.rows,
  };
}

function summarizeRag(result) {
  const rows = result?.data?.results || [];
  return {
    status: result?.status ?? null,
    retrieved: result?.data?.retrieved ?? null,
    topScore: rows[0]?.score ?? null,
    topResultTitle: rows[0]?.doc_title ?? rows[0]?.title ?? null,
  };
}

async function run() {
  const startedAt = new Date().toISOString();
  const beforeCounts = await getKbCounts();
  const ragBefore = await ragSearch(QUERY, TOP_K);
  const refresh = await postJson(`${SIB_URL}/kb/refresh`);
  const ragAfter = await ragSearch(QUERY, TOP_K);
  const afterCounts = await getKbCounts();

  const report = {
    startedAt,
    finishedAt: new Date().toISOString(),
    sibUrl: SIB_URL,
    query: QUERY,
    topK: TOP_K,
    refresh: {
      status: refresh.status,
      ingested: refresh.data?.ingested ?? null,
      errors: refresh.data?.errors ?? null,
      documents: refresh.data?.documents ?? null,
    },
    ragBefore: summarizeRag(ragBefore),
    ragAfter: summarizeRag(ragAfter),
    kbCountsBefore: beforeCounts,
    kbCountsAfter: afterCounts,
  };

  const logsDir = path.join(repoRoot, 'logs', 'rag');
  await fs.mkdir(logsDir, { recursive: true });
  const fileName = `rag-refresh-audit-${nowStamp()}.json`;
  const reportPath = path.join(logsDir, fileName);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');

  console.log(JSON.stringify({
    success: true,
    reportPath,
    refresh: report.refresh,
    ragBefore: report.ragBefore,
    ragAfter: report.ragAfter,
    kbCountsAfter: report.kbCountsAfter,
  }, null, 2));

  const hasErrors = Array.isArray(report.refresh.errors) && report.refresh.errors.length > 0;
  if (hasErrors) {
    process.exitCode = 2;
  }
}

run()
  .catch((err) => {
    console.error('RAG_REFRESH_AUDIT_FAILED', err?.stack || err?.message || String(err));
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
