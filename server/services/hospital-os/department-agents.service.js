/**
 * Hospital OS — per-department AI agents (Radiology, Laboratory)
 *
 * These summarize what's actually recorded in the system — DICOM study
 * metadata + any radiology-tagged clinical notes for Radiology, and
 * lab_results rows for Laboratory. Neither does image-pixel analysis or
 * report-text extraction beyond what's already stored as structured data —
 * there is no radiology report free-text table in this codebase to mine
 * beyond DICOM metadata and manually authored clinical notes.
 */
import pool from '../../db/pgPool.js';
import { listPatientImagingStudies } from '../careos/healthos-integration.service.js';
import { ensureClinicalNoteColumns } from '../clinical-notes.service.js';
import { aggregatePatientAccount } from '../hospital-billing.service.js';
import llmProvider from '../ai-brain/llm-provider.js';

export async function summarizeRadiology({ patientId, tenantId = 'default' }) {
  await ensureClinicalNoteColumns();
  const studies = await listPatientImagingStudies(patientId, tenantId).catch(() => []);

  // note_type is a snake_case column added by ensureClinicalNoteColumns();
  // chiefComplaint/assessment/createdAt are the real Sequelize columns.
  const { rows: radiologyNotes } = await pool.query(
    `SELECT note_type, "chiefComplaint" AS chief_complaint, assessment AS diagnosis, plan, "createdAt"
     FROM clinical_notes
     WHERE "patientId" = $1 AND (note_type ILIKE '%radiology%' OR note_type ILIKE '%imaging%')
     ORDER BY "createdAt" DESC LIMIT 10`,
    [patientId]
  ).catch(() => ({ rows: [] }));

  if (!studies.length && !radiologyNotes.length) {
    return { patientId, summary: 'No imaging studies or radiology notes on file.', studies: [], notes: [] };
  }

  let summary = `${studies.length} imaging study/studies on file${radiologyNotes.length ? `, ${radiologyNotes.length} radiology note(s)` : ''}.`;
  try {
    const llm = await llmProvider.chat({
      messages: [
        {
          role: 'system',
          content: `You are a radiology coordination assistant. Summarize what imaging has been done for this patient and what's documented — in 2-3 sentences. You are NOT analyzing image pixels; only summarize the metadata and notes provided. Do not invent findings not present in the data.`,
        },
        { role: 'user', content: `Studies: ${JSON.stringify(studies)}\nRadiology notes: ${JSON.stringify(radiologyNotes)}` },
      ],
      temperature: 0.2,
      maxTokens: 300,
      skipCache: true,
    });
    summary = (llm.content || '').trim() || summary;
  } catch (err) {
    console.warn('[department-agents] radiology summary LLM failed:', err.message);
  }

  return { patientId, summary, studies, notes: radiologyNotes };
}

export async function summarizeLabTrends({ patientId, organizationId }) {
  // lab_results is keyed by userId (== patientId) — no admission scoping
  // exists on this table.
  const { rows: labs } = await pool.query(
    `SELECT "testName" AS test_name, value AS result_value, unit, "referenceRange" AS reference_range, "isAbnormal" AS is_abnormal, "reportDate" AS reported_at
     FROM lab_results
     WHERE "userId" = $1
     ORDER BY "reportDate" DESC LIMIT 40`,
    [patientId]
  ).catch(() => ({ rows: [] }));

  const abnormal = labs.filter((l) => l.is_abnormal);
  if (!labs.length) {
    return { patientId, summary: 'No lab results on file.', labs: [], abnormalCount: 0 };
  }

  let summary = `${labs.length} lab result(s) on file, ${abnormal.length} flagged abnormal.`;
  if (abnormal.length) {
    try {
      const llm = await llmProvider.chat({
        messages: [
          {
            role: 'system',
            content: `You are a laboratory results assistant. Summarize the abnormal lab findings and any notable trend across repeated tests, in 2-3 sentences for the treating clinician. Do not invent values not present in the data.`,
          },
          { role: 'user', content: `All recent labs: ${JSON.stringify(labs)}\nFlagged abnormal: ${JSON.stringify(abnormal)}` },
        ],
        temperature: 0.2,
        maxTokens: 300,
        skipCache: true,
      });
      summary = (llm.content || '').trim() || summary;
    } catch (err) {
      console.warn('[department-agents] lab summary LLM failed:', err.message);
    }
  }

  return { patientId, summary, labs, abnormalCount: abnormal.length };
}

/**
 * Billing Agent: plain-language explanation of a patient's real hospital
 * account (charges/invoices/credit account from hospital-billing.service.js)
 * for the clinician or front-desk to relay — not a financial decision, just
 * a summary of numbers already in the ledger.
 */
export async function summarizeBillingAccount({ patientId, hospitalId, admissionId }) {
  const account = await aggregatePatientAccount(hospitalId, { patientId, admissionId }).catch(() => null);
  if (!account) return { patientId, summary: 'Billing account unavailable.', account: null };

  const { summary: totals, invoices, creditAccount } = account;
  let summary = `Pending charges: ₹${totals.pendingCharges.toFixed(2)}. Open invoices: ${totals.openInvoices}. Total due: ₹${totals.totalDue.toFixed(2)}.`;
  if (creditAccount) summary += ` Credit account status: ${creditAccount.status || 'active'}, limit ₹${creditAccount.approved_limit || 0}.`;

  if (totals.totalDue > 0 || totals.openInvoices > 0) {
    try {
      const llm = await llmProvider.chat({
        messages: [
          {
            role: 'system',
            content: `You are a hospital billing assistant. In 2-3 plain-language sentences, explain this patient's current account status to the clinical/front-desk team — pending charges, open invoices, anything needing action (e.g. preauth gap, overdue invoice). Do not invent amounts not present in the data.`,
          },
          { role: 'user', content: JSON.stringify({ totals, invoices: invoices.slice(0, 10), creditAccount }) },
        ],
        temperature: 0.2,
        maxTokens: 250,
        skipCache: true,
      });
      summary = (llm.content || '').trim() || summary;
    } catch (err) {
      console.warn('[department-agents] billing summary LLM failed:', err.message);
    }
  }

  return { patientId, summary, totals, invoiceCount: invoices.length };
}

export default { summarizeRadiology, summarizeLabTrends, summarizeBillingAccount };
