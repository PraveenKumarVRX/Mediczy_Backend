/**
 * insuranceEmailAI.service.js
 *
 * AI-powered parsing of TPA / insurer emails for the hospital insurance portal.
 *
 * Responsibilities:
 *  1. Classify email: payment_advice | pre_auth_approval | pre_auth_rejection |
 *                     pre_auth_query | pre_auth_partial | claim_repudiation | general
 *  2. Extract structured data: UTR, amount, NME/TDS/discount/disallowance,
 *     claim numbers, pre-auth status, insurer name
 *  3. Update InsuranceClaim / PreAuthorization tables when status changes
 *  4. Generate AI smart replies and suggested actions
 *
 * Uses Mediczy's unified LLM cascade (ai-brain/llm-provider.js — iSHA → Groq →
 * OpenAI) with regex fallback if every provider is unavailable. Per CLAUDE.md,
 * LLM calls always go through llm-provider.js rather than calling a vendor
 * SDK directly from a service/route.
 */

import InsuranceEmailInbox from '../models/postgres/insuranceEmailInbox.model.postgres.js';
import InsuranceClaim      from '../models/postgres/insuranceClaim.model.postgres.js';
import PreAuthorization    from '../models/postgres/preAuthorization.model.postgres.js';
import { Op } from 'sequelize';
import logger from '../config/logger.js';
import llmProvider from './ai-brain/llm-provider.js';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { setRlsContext } from '../middleware/rls-context.middleware.js';

// insurance_claims has row-level security keyed on organization_id (see
// current_org_id() in Postgres). This function runs from a background email
// parse, not a request, so there's no req.setSequelizeRlsContext available —
// set the same GUCs directly on a dedicated transaction instead. Without
// this, every InsuranceClaim query below silently matches zero rows.
async function withEmailClaimsRls(hospitalId, work) {
  const transaction = await postgresSequelize.transaction();
  try {
    await setRlsContext(transaction, { orgId: hospitalId, userId: 0, isPlatformAdmin: false });
    const result = await work(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// ─── LLM helper (unified cascade) ────────────────────────────────────────────
async function callLLM(prompt, maxTokens = 600, temperature = 0.1) {
  const result = await llmProvider.chat({
    messages: [{ role: 'user', content: prompt }],
    maxTokens,
    temperature,
  });
  return result.content?.trim() || '';
}

// ─── Regex-based extraction (fast fallback, no API cost) ─────────────────────

const UTR_RE = /\b(UTR|Ref(?:erence)?(?:\s+No\.?)?)[:\s]+([A-Z0-9]{12,30})\b/i;
const AMOUNT_RE = /(?:Rs\.?|INR|₹)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i;
const CLAIM_RE = /\bCLM[-\/][0-9]{4}[-\/][0-9]{4,6}\b/gi;
const PREAUTH_STATUS_RE = /\b(APPROVED|REJECTED|REPUDIATED|DENIED|QUERY|PARTIAL(?:\s*APPROVAL)?|SANCTIONED|DECLINED)\b/i;
const NME_RE   = /NME[^₹\d]*(?:Rs\.?|₹)?\s*([0-9,]+)/i;
const TDS_RE   = /TDS[^₹\d]*(?:Rs\.?|₹)?\s*([0-9,]+)/i;
const DISCOUNT_RE = /[Dd]iscount[^₹\d]*(?:Rs\.?|₹)?\s*([0-9,]+)/i;
const DISALLOW_RE = /[Dd]isallowance[^₹\d]*(?:Rs\.?|₹)?\s*([0-9,]+)/i;
const PAYMENT_MODE_RE = /\b(NEFT|RTGS|IMPS|CHEQUE|DD|EFT)\b/i;

function parseNumber(str) {
  if (!str) return null;
  const n = parseFloat(str.replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

function regexExtract(text) {
  const utrMatch    = UTR_RE.exec(text);
  const amountMatch = AMOUNT_RE.exec(text);
  const claimNos    = [...(text.match(CLAIM_RE) || [])].map(c => c.toUpperCase());
  const paStatusMatch = PREAUTH_STATUS_RE.exec(text);
  const nmeMatch    = NME_RE.exec(text);
  const tdsMatch    = TDS_RE.exec(text);
  const discMatch   = DISCOUNT_RE.exec(text);
  const disallMatch = DISALLOW_RE.exec(text);
  const modeMatch   = PAYMENT_MODE_RE.exec(text);

  // Determine category heuristically
  const lower = text.toLowerCase();
  let category = 'general';
  if (utrMatch || lower.includes('payment advice') || lower.includes('neft') || lower.includes('rtgs')) {
    category = 'payment_advice';
  } else if (lower.includes('repudiat') || lower.includes('denied') || lower.includes('declined')) {
    category = 'claim_repudiation';
  } else if (paStatusMatch) {
    const s = paStatusMatch[1].toLowerCase();
    if      (s.includes('approv') || s.includes('sanction'))    category = 'pre_auth_approval';
    else if (s.includes('reject') || s.includes('repudiat') || s.includes('declin')) category = 'pre_auth_rejection';
    else if (s.includes('query'))   category = 'pre_auth_query';
    else if (s.includes('partial')) category = 'pre_auth_partial';
  } else if (lower.includes('pre-auth') || lower.includes('pre auth') || lower.includes('preauth')) {
    category = 'pre_auth_query';
  }

  let preAuthStatus = null;
  if (paStatusMatch) {
    const s = paStatusMatch[1].toLowerCase();
    if      (s.includes('approv') || s.includes('sanction'))    preAuthStatus = 'approved';
    else if (s.includes('reject') || s.includes('repudiat') || s.includes('declin')) preAuthStatus = 'rejected';
    else if (s.includes('query'))   preAuthStatus = 'query';
    else if (s.includes('partial')) preAuthStatus = 'partial';
  }

  let label = 'general';
  if (category === 'payment_advice')                                       label = 'payment';
  else if (category.startsWith('pre_auth'))                                label = 'pre-auth';
  else if (category === 'claim_repudiation' || preAuthStatus === 'rejected') label = 'rejection';
  else if (lower.includes('query') || lower.includes('additional document')) label = 'query';

  return {
    utr:          utrMatch?.[2]?.trim() || null,
    paymentAmount: parseNumber(amountMatch?.[1]),
    paymentMode:  modeMatch?.[1]?.toUpperCase() || null,
    claimNumbers: claimNos.length ? claimNos : null,
    preAuthStatus,
    nmeAmount:          parseNumber(nmeMatch?.[1]),
    tdsAmount:          parseNumber(tdsMatch?.[1]),
    discountAmount:     parseNumber(discMatch?.[1]),
    disallowanceAmount: parseNumber(disallMatch?.[1]),
    category,
    label,
    aiConfidence: 0.6,
  };
}

// ─── Full AI parse via the LLM cascade ────────────────────────────────────────
async function aiParse(subject, body, fromEmail) {
  const snippet = `${subject}\n\n${body}`.slice(0, 3000);

  const prompt =
    `You are an expert at parsing TPA/insurer emails for Indian hospital insurance teams.\n` +
    `Analyse the email below and return ONLY a valid JSON object — no markdown, no explanation.\n\n` +
    `Extract:\n` +
    `{\n` +
    `  "category": "payment_advice|pre_auth_approval|pre_auth_rejection|pre_auth_query|pre_auth_partial|claim_repudiation|general",\n` +
    `  "insurer": "insurer or TPA organisation name, or null",\n` +
    `  "claimNumbers": ["array of claim numbers starting with CLM-, or empty array"],\n` +
    `  "utr": "UTR or transaction reference number, or null",\n` +
    `  "paymentAmount": numeric_total_amount_or_null,\n` +
    `  "paymentMode": "NEFT|RTGS|IMPS|null",\n` +
    `  "paymentDate": "YYYY-MM-DD or null",\n` +
    `  "preAuthStatus": "approved|rejected|query|partial|null",\n` +
    `  "approvedAmount": numeric_approved_amount_or_null,\n` +
    `  "nmeAmount": numeric_NME_deduction_or_null,\n` +
    `  "tdsAmount": numeric_TDS_deduction_or_null,\n` +
    `  "discountAmount": numeric_discount_or_null,\n` +
    `  "disallowanceAmount": numeric_disallowance_or_null,\n` +
    `  "tpaReference": "TPA-specific reference number or null",\n` +
    `  "summary": "One or two sentence plain-English summary for the insurance desk team",\n` +
    `  "priority": "high|medium|low",\n` +
    `  "suggestedAction": "Short action description for the team, e.g. 'Verify UTR and link to CLM-2026-0001'",\n` +
    `  "confidence": 0.0_to_1.0\n` +
    `}\n\n` +
    `Email from: ${fromEmail}\nSubject: ${subject}\n\n${snippet}`;

  const raw = await callLLM(prompt, 700, 0.05);
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('LLM returned no parseable JSON');
  return JSON.parse(jsonMatch[0]);
}

// ─── Determine UI label from category ────────────────────────────────────────
function categoryToLabel(category, preAuthStatus) {
  if (category === 'payment_advice')   return 'payment';
  if (category === 'claim_repudiation' || preAuthStatus === 'rejected') return 'rejection';
  if (category === 'pre_auth_query')   return 'query';
  if (category?.startsWith('pre_auth'))return 'pre-auth';
  return 'general';
}

// ─── Update claim/pre-auth tables based on parsed data ───────────────────────
async function applyPortalUpdates(parsed, hospitalId) {
  const log = [];
  const claimNos = parsed.claimNumbers || [];
  if (claimNos.length === 0) return log;

  try {
    await withEmailClaimsRls(hospitalId, async (transaction) => {
      // 1. Payment advice → update InsuranceClaim with UTR / settlement data
      if (parsed.category === 'payment_advice' && parsed.utr) {
        for (const claimNo of claimNos) {
          const claim = await InsuranceClaim.findOne({
            where: { claimNumber: claimNo, ...(hospitalId ? { hospital_id: hospitalId } : {}) },
            transaction,
          });
          if (claim) {
            const totalDeductions = ['nmeAmount', 'tdsAmount', 'discountAmount', 'disallowanceAmount']
              .reduce((sum, key) => sum + (Number(parsed[key]) || 0), 0);
            await claim.update({
              status: 'paid',
              settlementStatus: 'settled',
              settledAmount: parsed.paymentAmount || claim.settledAmount,
              settlementDate: parsed.paymentDate ? new Date(parsed.paymentDate) : new Date(),
              deductedAmount: totalDeductions || claim.deductedAmount,
              notes: `${claim.notes || ''}\n[EMAIL AI ${new Date().toISOString()}] Payment advice received — UTR ${parsed.utr}, amount Rs.${parsed.paymentAmount || 0}${totalDeductions ? `, deductions Rs.${totalDeductions}` : ''}.`.trim(),
            }, { transaction });
            log.push({ type: 'claim_settled', claimNumber: claimNo, utr: parsed.utr, deductions: totalDeductions });
          }
        }
      }

      // 2. Pre-auth approval → update PreAuthorization (no RLS on pre_authorizations)
      if (parsed.preAuthStatus === 'approved') {
        for (const claimNo of claimNos) {
          const preAuth = await PreAuthorization.findOne({
            where: { pre_auth_number: { [Op.iLike]: `%${claimNo}%` } },
          }).catch(() => null);
          if (preAuth) {
            await preAuth.update({
              status: 'approved',
              approvedAmount: parsed.approvedAmount || preAuth.approvedAmount,
              approvedAt: new Date(),
            });
            log.push({ type: 'preauth_approved', claimNo, amount: parsed.approvedAmount });
          }
        }
      }

      // 3. Pre-auth rejection / repudiation → update status
      if (parsed.preAuthStatus === 'rejected' || parsed.category === 'claim_repudiation') {
        for (const claimNo of claimNos) {
          const claim = await InsuranceClaim.findOne({
            where: { claimNumber: claimNo, ...(hospitalId ? { hospital_id: hospitalId } : {}) },
            transaction,
          }).catch(() => null);
          if (claim) {
            await claim.update({
              status: 'rejected',
              rejectionReason: parsed.summary || claim.rejectionReason,
            }, { transaction });
            log.push({ type: 'claim_rejected', claimNumber: claimNo });
          }
        }
      }

      // 4. Query → mark claim as "query"
      if (parsed.category === 'pre_auth_query') {
        for (const claimNo of claimNos) {
          const claim = await InsuranceClaim.findOne({
            where: { claimNumber: claimNo, ...(hospitalId ? { hospital_id: hospitalId } : {}) },
            transaction,
          }).catch(() => null);
          if (claim && ['pending', 'submitted'].includes(claim.status)) {
            await claim.update({
              status: 'query',
              queryHistory: [...(claim.queryHistory || []), {
                receivedAt: new Date(), source: 'email_ai', summary: parsed.summary || null,
              }],
            }, { transaction });
            log.push({ type: 'claim_query', claimNumber: claimNo });
          }
        }
      }
    });
  } catch (err) {
    logger.error('[InsuranceEmailAI] applyPortalUpdates error:', err.message);
    log.push({ type: 'error', message: err.message });
  }

  return log;
}

// ─── Main export: parse one email and persist it ─────────────────────────────
export async function parseAndStoreEmail({
  hospitalId,
  messageId,
  fromEmail,
  fromName,
  subject,
  bodyText,
  bodyHtml,
  attachments = [],
  receivedAt,
}) {
  // Dedup by messageId
  if (messageId) {
    const existing = await InsuranceEmailInbox.findOne({ where: { messageId } }).catch(() => null);
    if (existing) return existing;
  }

  // Try AI parse first, fallback to regex
  let parsed = {};
  let usedAI  = false;
  try {
    parsed  = await aiParse(subject, bodyText || '', fromEmail);
    usedAI  = true;
  } catch (err) {
    logger.warn('[InsuranceEmailAI] Groq failed, using regex fallback:', err.message);
    parsed = regexExtract(`${subject}\n${bodyText || ''}`);
  }

  const label = categoryToLabel(parsed.category, parsed.preAuthStatus);

  // Persist
  const record = await InsuranceEmailInbox.create({
    hospitalId:    hospitalId || 'demo-hospital-001',
    messageId,
    fromEmail,
    fromName:      fromName || fromEmail,
    fromOrg:       parsed.insurer || null,
    subject,
    bodyText,
    bodyHtml,
    attachments,
    receivedAt:    receivedAt ? new Date(receivedAt) : new Date(),
    aiCategory:    parsed.category || 'general',
    aiSummary:     parsed.summary  || null,
    aiPriority:    parsed.priority || 'medium',
    aiSuggestedAction: parsed.suggestedAction || null,
    aiConfidence:  parsed.confidence || parsed.aiConfidence || 0.7,
    utr:           parsed.utr,
    paymentAmount: parsed.paymentAmount,
    paymentDate:   parsed.paymentDate || null,
    paymentMode:   parsed.paymentMode || null,
    nmeAmount:         parsed.nmeAmount,
    tdsAmount:         parsed.tdsAmount,
    discountAmount:    parsed.discountAmount,
    disallowanceAmount:parsed.disallowanceAmount,
    preAuthStatus: parsed.preAuthStatus || null,
    approvedAmount:parsed.approvedAmount || null,
    insurerName:   parsed.insurer || null,
    claimNumbers:  parsed.claimNumbers?.length ? parsed.claimNumbers : null,
    tpaReference:  parsed.tpaReference || null,
    label,
    portalUpdated: false,
  });

  // Apply portal updates (fire and forget — non-fatal)
  applyPortalUpdates(parsed, hospitalId).then(updateLog => {
    if (updateLog.length > 0) {
      record.update({ portalUpdated: true, portalUpdateLog: updateLog });
    }
  }).catch(() => {});

  return record;
}

// ─── Re-parse a single, specific email record ────────────────────────────────
export async function reparseOne(email) {
  const parsed = await aiParse(email.subject, email.bodyText || '', email.fromEmail);
  const label = categoryToLabel(parsed.category, parsed.preAuthStatus);
  await email.update({
    aiCategory: parsed.category || 'general',
    aiSummary: parsed.summary,
    aiPriority: parsed.priority || 'medium',
    aiSuggestedAction: parsed.suggestedAction,
    aiConfidence: parsed.confidence || 0.7,
    utr: parsed.utr || email.utr,
    paymentAmount: parsed.paymentAmount || email.paymentAmount,
    preAuthStatus: parsed.preAuthStatus || email.preAuthStatus,
    insurerName: parsed.insurer || email.insurerName,
    claimNumbers: parsed.claimNumbers?.length ? parsed.claimNumbers : email.claimNumbers,
    nmeAmount: parsed.nmeAmount ?? email.nmeAmount,
    tdsAmount: parsed.tdsAmount ?? email.tdsAmount,
    discountAmount: parsed.discountAmount ?? email.discountAmount,
    disallowanceAmount: parsed.disallowanceAmount ?? email.disallowanceAmount,
    label,
  });

  const updateLog = await applyPortalUpdates(parsed, email.hospitalId);
  if (updateLog.length > 0) {
    await email.update({ portalUpdated: true, portalUpdateLog: [...(email.portalUpdateLog || []), ...updateLog] });
  }
  return email;
}

// ─── Batch: re-parse all non-AI-processed emails ─────────────────────────────
export async function batchReparse(hospitalId, limit = 20) {
  const emails = await InsuranceEmailInbox.findAll({
    where: { hospitalId, aiCategory: null },
    order: [['receivedAt', 'DESC']],
    limit,
  });

  const results = [];
  for (const email of emails) {
    try {
      const parsed = await aiParse(email.subject, email.bodyText || '', email.fromEmail);
      const label  = categoryToLabel(parsed.category, parsed.preAuthStatus);
      await email.update({
        aiCategory: parsed.category || 'general',
        aiSummary:  parsed.summary,
        aiPriority: parsed.priority || 'medium',
        aiSuggestedAction: parsed.suggestedAction,
        aiConfidence:  parsed.confidence || 0.7,
        utr:       parsed.utr || email.utr,
        paymentAmount: parsed.paymentAmount || email.paymentAmount,
        preAuthStatus: parsed.preAuthStatus || email.preAuthStatus,
        insurerName:   parsed.insurer || email.insurerName,
        claimNumbers:  parsed.claimNumbers?.length ? parsed.claimNumbers : email.claimNumbers,
        label,
      });
      results.push({ id: email.id, subject: email.subject, category: parsed.category });
    } catch (err) {
      results.push({ id: email.id, error: err.message });
    }
  }
  return results;
}

// ─── Generate AI reply draft ──────────────────────────────────────────────────
export async function generateReplyDraft(email) {
  const body = email.bodyText || '';
  const contextHints = [
    email.aiCategory && `Email category: ${email.aiCategory.replace(/_/g, ' ')}`,
    email.utr        && `UTR extracted: ${email.utr}`,
    email.claimNumbers?.length && `Claim refs: ${email.claimNumbers.join(', ')}`,
    email.preAuthStatus        && `Pre-auth status: ${email.preAuthStatus}`,
  ].filter(Boolean).join('\n');

  const prompt =
    `You are the insurance desk officer at an Indian hospital. ` +
    `Write a professional, concise reply (5-8 lines) acknowledging the email below. ` +
    `Be specific — mention the UTR, claim numbers, or pre-auth status where relevant. ` +
    `End with "Warm regards,\\nInsurance Desk\\n[Hospital Name]".\n\n` +
    `${contextHints ? `Context:\n${contextHints}\n\n` : ''}` +
    `Original email — From: ${email.fromEmail}\nSubject: ${email.subject}\n\n${body.slice(0, 2000)}`;

  return callLLM(prompt, 500, 0.55);
}

// ─── IMAP sync helper ─────────────────────────────────────────────────────────
export async function syncImapInbox({ hospitalId, email, password, imapHost, imapPort = 993, tls = true, daysBack = 30 }) {
  const Imap        = (await import('imap')).default;
  const { simpleParser } = await import('mailparser');

  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: email,
      password,
      host: imapHost,
      port: imapPort,
      tls,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 15000,
      connTimeout: 15000,
    });

    imap.once('error', reject);

    imap.once('ready', () => {
      imap.openBox('INBOX', false, async (err) => {
        if (err) { imap.end(); return reject(err); }

        const since = new Date(Date.now() - daysBack * 86400000);
        imap.search([['SINCE', since]], async (err, results) => {
          if (err || !results?.length) { imap.end(); return resolve({ synced: 0 }); }

          const toFetch = results.slice(-100); // latest 100
          const f = imap.fetch(toFetch, { bodies: '' });
          const tasks = [];

          f.on('message', (msg) => {
            const task = new Promise((res) => {
              let buffer = '';
              msg.on('body', (stream) => stream.on('data', (chunk) => { buffer += chunk.toString(); }));
              msg.once('end', async () => {
                try {
                  const parsed = await simpleParser(buffer);
                  await parseAndStoreEmail({
                    hospitalId,
                    messageId:   parsed.messageId,
                    fromEmail:   parsed.from?.value?.[0]?.address || '',
                    fromName:    parsed.from?.value?.[0]?.name    || '',
                    subject:     parsed.subject || '(no subject)',
                    bodyText:    parsed.text || '',
                    bodyHtml:    parsed.html || '',
                    attachments: (parsed.attachments || []).map(a => ({ filename: a.filename, contentType: a.contentType, size: a.size })),
                    receivedAt:  parsed.date || new Date(),
                  });
                } catch (_) {}
                res();
              });
            });
            tasks.push(task);
          });

          f.on('error', (err) => logger.warn('[InsuranceIMAPSync] fetch error:', err.message));
          f.once('end', async () => {
            await Promise.all(tasks);
            imap.end();
            resolve({ synced: tasks.length });
          });
        });
      });
    });

    imap.connect();
  });
}
