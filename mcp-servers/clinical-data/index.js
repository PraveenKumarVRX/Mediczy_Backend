#!/usr/bin/env node
/**
 * Mediczy clinical-data MCP server.
 *
 * The clinical counterpart to mcp-servers/internal-ops — but this one
 * touches patient-linked imaging report data, so every tool call is
 * authenticated and authorized through the exact same mechanisms the live
 * app uses (see lib/auth.js), and every tool wraps an already-governed,
 * already-tested function rather than raw table access:
 *
 *   - getReportDraft / getAnalysisStatus / checkReportAgainstEvidence all
 *     read the SAME persisted imaging_ai_report_drafts row the real API
 *     serves, and run it through the SAME compileClinicalFactModel /
 *     computeAnalysisStatus / buildClinicalClaims / checkClaimsAgainstReport
 *     pipeline built and tested earlier this session — not a parallel or
 *     re-derived implementation.
 *   - No tool accepts raw SQL, a table name, or an unscoped patient query.
 *     Every tool takes a specific studyId, and every response is exactly
 *     what that study's own authorized report-draft data actually is.
 *   - No LLM call happens anywhere in this file. These are read/inspect
 *     tools over already-generated, already-gated reports — generating a
 *     NEW report (which does call an LLM, behind the assertion/RAG-gating
 *     layer) stays the live app's job, not this server's.
 *
 * Transport: stdio, same posture as internal-ops. The caller must supply
 * a real, currently-valid session token (the exact JWT issued by the
 * normal Mediczy login) as a tool argument — this server has no login
 * flow of its own and mints no identity; it only verifies one already
 * issued by the real app.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// server/.env only, deliberately — real, live-verified finding: the repo's
// root .env and server/.env carry two DIFFERENT JWT_SECRET values, and the
// actual live mediczy-server process (checked via its real pm2 env) uses
// server/.env's. dotenv never overrides an already-set var, so loading
// root .env first (as an earlier version of this file did) would silently
// win with the WRONG secret and reject every real, currently-valid session
// token — caught by testing against a real token, not just a syntax check.
dotenv.config({ path: join(__dirname, '..', '..', 'server', '.env') });

// Dynamic imports, deliberately — lib/auth.js pulls in server/config/
// auth.config.js, which does a hard process.exit(1) at MODULE-EVALUATION
// TIME if JWT_SECRET isn't already set. Static imports are hoisted and
// evaluate before any of this file's own top-level code runs, so a static
// import here would run auth.config.js's check BEFORE the dotenv.config()
// calls above ever executed — real bug, caught by actually running this
// against a spawned server process, not just a syntax check.
const { authorizeStudyAccess } = await import('./lib/auth.js');
const { getReportDraft, getAnalysisStatus, checkReportAgainstEvidence } = await import('./lib/reports.js');

const server = new McpServer({
  name: 'mediczy-clinical-data',
  version: '0.1.0',
});

function textResult(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function errorResult(err) {
  const prefix = err.status ? `[${err.status}] ` : '';
  return { content: [{ type: 'text', text: `${prefix}Error: ${err.message}` }], isError: true };
}

const tokenSchema = z.string().describe('A real, currently-valid Mediczy session JWT for the acting user (the same token their normal login issues) — not a role name or user ID.');
const studyIdSchema = z.number().int().positive().describe('The ris_studies.id of the study to look up.');

server.registerTool(
  'get_report_draft',
  {
    title: 'Get the latest AI report draft for a study',
    description: 'Returns the radiologist-facing report (TECHNIQUE/FINDINGS/IMPRESSION) separately from the AI governance detail (QA gate result, confidence, model version) — the same two-layer split the live app\'s AI Evidence panel uses. Requires the caller to be authorized for this specific study (same rules as the real API: lab owns it, doctor was referred it, or an admin/hospital/medical_director role).',
    inputSchema: { token: tokenSchema, studyId: studyIdSchema },
  },
  async ({ token, studyId }) => {
    try {
      const { study, tenantId } = await authorizeStudyAccess(token, studyId);
      return textResult(await getReportDraft(study, tenantId));
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  'get_analysis_status',
  {
    title: 'Get a study\'s ANALYZED/ABSTAIN status and why',
    description: 'Returns whether real AI analysis ran on this study (ANALYZED) or the pipeline abstained, and if so the specific, real reason: GOVERNANCE_LOCK (a real applicable model exists but is not yet clinically approved), NO_APPLICABLE_MODEL (no model covers this anatomy at all), MODEL_UNAVAILABLE, or NO_PIXEL_ANALYSIS. This is the exact structured reason built this session to stop those two cases from being indistinguishable.',
    inputSchema: { token: tokenSchema, studyId: studyIdSchema },
  },
  async ({ token, studyId }) => {
    try {
      const { study, tenantId } = await authorizeStudyAccess(token, studyId);
      return textResult(await getAnalysisStatus(study, tenantId));
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  'check_report_against_evidence',
  {
    title: 'Fact-check a candidate report against a study\'s real evidence',
    description: 'Runs the P9 fact-checker (laterality + paired-measurement checking, clause-boundary-aware) against a candidate report text — e.g. a radiologist\'s edited version, before they sign it. Builds fresh clinical claims from the study\'s own persisted findings and checks the given text against them; returns PASS or BLOCK with the specific issues found. Does not call an LLM — this is the same deterministic check the live app runs before allowing a report to be finalized.',
    inputSchema: {
      token: tokenSchema,
      studyId: studyIdSchema,
      reportText: z.string().min(1).describe('The candidate report text to check — e.g. a radiologist\'s edited draft, not necessarily the stored AI draft verbatim.'),
    },
  },
  async ({ token, studyId, reportText }) => {
    try {
      const { study, tenantId } = await authorizeStudyAccess(token, studyId);
      return textResult(await checkReportAgainstEvidence(study, tenantId, reportText));
    } catch (err) {
      return errorResult(err);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
