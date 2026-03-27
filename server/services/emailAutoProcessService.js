/**
 * emailAutoProcessService.js
 *
 * Three core tasks triggered for every inbound email:
 *  1. Auto-create a support ticket (once per email, no duplicates)
 *  2. Detect & save health-report PDFs to the reports table
 *  3. Update the employee's real work email if it differs from the portal email
 */

import { postgresSequelize } from '../db/postgres-sequelize.js';
import EmailInbox from '../models/emailInbox.model.js';
import { createAutoTicket } from './autoTicketService.js';
import logger from '../config/logger.js';
import whatsappProductionService from './whatsapp-production.service.js';

// Lazy imports for AI QC (avoid startup cost)
let _llmProvider = null;
const getLLM = async () => {
  if (!_llmProvider) _llmProvider = (await import('./ai-brain/llm-provider.js')).default;
  return _llmProvider;
};
let _pdfParse = null;
const getPdfParse = async () => {
  if (!_pdfParse) _pdfParse = (await import('pdf-parse')).default;
  return _pdfParse;
};

// ─── Constants ────────────────────────────────────────────────────────────────

/** Known diagnostic / labs domains whose emails carry health reports */
const LAB_DOMAINS = new Set([
  'medall.in', 'thyrocare.com', 'lal.in', 'srl.com',
  'neubergdiagnostics.com', 'agilus.in', 'metropolisindia.com',
  'drmohans.com', 'neuberg.in', 'labindia.com', 'healthspring.in',
  'dianovalabs.com', 'healthians.com', 'redcliffe.in', 'vijayapath.in',
  'vijayapath.com', 'pulseimagingcentre.com', 'pulseimagingcentre.gmail.com',
]);

/** Regexes that indicate subject / filename looks like a health report */
const REPORT_SUBJECT_RE = /\b(health\s*report|lab\s*report|mhc|master\s*health|test\s*result|diagnostic\s*report|blood\s*report|checkup\s*report|medical\s*report|jitul|health\s*check)\b/i;
const REPORT_FILE_RE    = /^(Rpt_|Report|HReport|Lab|Result|MHC|health|Diag)/i;

/** Suffixes stripped from lab report PDF filenames to extract employee name */
const LAB_FILENAME_NOISE_RE = /\s*(MAYDEN|MER|ECG|USG|REPORT|REPORTS|BLOOD\s*REPORTS?|AND\s+ECG|LAB|MEDICAL\s*FITNESS)\s*/gi;

/** Map aiEmailProcessor intent → ticket category */
const INTENT_TO_CATEGORY = {
  appointment_request:    'health-checkup',
  appointment_cancellation: 'appointment-cancellation',
  appointment_reschedule: 'appointment-reschedule',
  test_result:            'health-report',
  prescription:           'prescription',
  billing:                'billing',
  complaint:              'complaint',
  feedback:               'general',
  patient_query:          'doctor-consultation',
  other:                  'general',
};

/** Priority per intent */
const INTENT_TO_PRIORITY = {
  appointment_cancellation: 'high',
  billing:                  'high',
  complaint:                'high',
  test_result:              'high',
  appointment_request:      'medium',
  prescription:             'medium',
  patient_query:            'medium',
  appointment_reschedule:   'medium',
  feedback:                 'low',
  other:                    'low',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parse RFC 2822 from field → { name, email }
 * Handles: "Name" <email@domain>, Name <email@domain>, email@domain alone
 */
function parseSender(rawFrom) {
  if (!rawFrom) return { name: '', email: '' };
  const match = rawFrom.match(/^"?([^"<]+?)"?\s*<([^>]+)>/);
  if (match) {
    return {
      name: match[1].trim().replace(/^"|"$/g, ''),
      email: match[2].trim().toLowerCase(),
    };
  }
  const bare = rawFrom.trim().toLowerCase();
  return { name: '', email: bare };
}

/** Extract the domain part of an email address */
function emailDomain(addr) {
  const parts = addr.split('@');
  return parts.length === 2 ? parts[1].toLowerCase() : '';
}

/**
 * Look up a user in the `users` table by exact email.
 */
async function findUserByEmail(email) {
  if (!email) return null;
  try {
    const [rows] = await postgresSequelize.query(
      `SELECT id, "firstName", "lastName", email, "phoneNumber", organization_id
       FROM users
       WHERE LOWER(email) = LOWER(:email)
       LIMIT 1`,
      { replacements: { email } }
    );
    return rows[0] || null;
  } catch (e) {
    logger.warn('[emailAutoProcess] findUserByEmail error:', e.message);
    return null;
  }
}

/**
 * Look up a user by full name (case-insensitive).
 * Supports "JITUL SHETH" → firstName=JITUL lastName=SHETH
 */
async function findUserByName(fullName, corporateId = null) {
  if (!fullName || fullName.length < 3) return null;
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return null;

  const firstName = parts[0];
  const lastName  = parts.slice(1).join(' ');

  try {
    // Always scope to corporate employees — prevents matching random users
    let corpFilter = `
      AND u.id IN (
        SELECT ua."userId" FROM user_associations ua
        WHERE ua."entityType" = 'corporate' AND ua.role = 'employee'`;
    const replacements = { firstName, lastName };
    if (corporateId) {
      corpFilter += ` AND ua."entityId" = :corporateId`;
      replacements.corporateId = corporateId;
    }
    corpFilter += `)`;

    const [rows] = await postgresSequelize.query(
      `SELECT u.id, u."firstName", u."lastName", u.email, u."phoneNumber", u.organization_id
       FROM users u
       WHERE LOWER(u."firstName") = LOWER(:firstName)
         AND LOWER(u."lastName")  = LOWER(:lastName)
         ${corpFilter}
       LIMIT 1`,
      { replacements }
    );
    if (rows[0]) return rows[0];

    // Second try: full concatenated match (e.g., "Kanagaraj Palanisamy")
    replacements.full = fullName.trim();
    const [rows2] = await postgresSequelize.query(
      `SELECT u.id, u."firstName", u."lastName", u.email, u."phoneNumber", u.organization_id
       FROM users u
       WHERE LOWER(u."firstName" || ' ' || COALESCE(u."lastName",'')) = LOWER(:full)
         ${corpFilter}
       LIMIT 1`,
      { replacements }
    );
    return rows2[0] || null;
  } catch (e) {
    logger.warn('[emailAutoProcess] findUserByName error:', e.message);
    return null;
  }
}

/**
 * Look up a corporate employee by employeeId, scoped to corporateId if provided.
 * Returns user data + empId + corporateId for cross-validation.
 * Handles duplicate empId records by picking the one with a complete name.
 */
async function findUserByEmployeeId(empId, corporateId = null) {
  if (!empId) return null;
  const normalised = empId.trim().toUpperCase();
  try {
    let query = `
      SELECT u.id, u."firstName", u."lastName", u.email, u."phoneNumber", u.organization_id,
             ua."entityId" AS "corporateId",
             ua.metadata->>'employeeId' AS "employeeId"
      FROM user_associations ua
      JOIN users u ON u.id = ua."userId"
      WHERE ua."entityType" = 'corporate'
        AND ua.role = 'employee'
        AND UPPER(ua.metadata->>'employeeId') = :empId`;
    const replacements = { empId: normalised };

    if (corporateId) {
      query += ` AND ua."entityId" = :corporateId`;
      replacements.corporateId = corporateId;
    }
    // Prefer records where lastName is populated (deduplicates split vs combined names)
    query += ` ORDER BY (CASE WHEN u."lastName" IS NOT NULL AND u."lastName" != '' THEN 0 ELSE 1 END) ASC LIMIT 1`;

    const [rows] = await postgresSequelize.query(query, { replacements });
    return rows[0] || null;
  } catch (e) {
    logger.warn('[emailAutoProcess] findUserByEmployeeId error:', e.message);
    return null;
  }
}

/**
 * Verify a user is a corporate employee and return their employee metadata.
 */
async function getCorporateEmployeeMeta(userId) {
  if (!userId) return null;
  try {
    const [rows] = await postgresSequelize.query(
      `SELECT ua."entityId" AS "corporateId", ua.metadata->>'employeeId' AS "employeeId"
       FROM user_associations ua
       WHERE ua."userId" = :userId
         AND ua."entityType" = 'corporate'
         AND ua.role = 'employee'
       LIMIT 1`,
      { replacements: { userId } }
    );
    return rows[0] || null;
  } catch (e) {
    logger.warn('[emailAutoProcess] getCorporateEmployeeMeta error:', e.message);
    return null;
  }
}

// ─── 2-Level Validation Helpers ──────────────────────────────────────────────

/**
 * Normalise a name for fuzzy comparison: lowercase, strip punctuation, collapse spaces.
 */
function normaliseName(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cross-validate two names. Returns a confidence score:
 *   'exact'   — full match (after normalisation)
 *   'strong'  — one name contains the other, or first+last tokens match
 *   'partial' — first name token matches
 *   'none'    — no match
 */
function crossValidateName(nameA, nameB) {
  const a = normaliseName(nameA);
  const b = normaliseName(nameB);
  if (!a || !b) return 'none';

  // Exact
  if (a === b) return 'exact';

  // Containment (handles split firstName/lastName vs combined)
  if (a.includes(b) || b.includes(a)) return 'strong';

  // First + last token comparison
  const tokA = a.split(' ');
  const tokB = b.split(' ');
  const firstMatch = tokA[0] === tokB[0];
  const lastMatch  = tokA[tokA.length - 1] === tokB[tokB.length - 1];
  if (firstMatch && lastMatch && tokA.length >= 2 && tokB.length >= 2) return 'strong';
  if (firstMatch && (tokA.length === 1 || tokB.length === 1)) return 'partial';

  return 'none';
}

/**
 * 2-Level Validated Employee Lookup.
 *
 * Level 1 (Identity Match) — finds the user via the strongest available identifier.
 * Level 2 (Cross-Validation) — verifies the match against independent data.
 *
 * @param {object} opts
 * @param {string} [opts.empId]        — Employee ID from booking table (strongest)
 * @param {string} [opts.name]         — Employee name from table/filename
 * @param {string} [opts.email]        — Employee email from table
 * @param {string} [opts.phone]        — Employee phone from table
 * @param {number} [opts.corporateId]  — Corporate entity ID for scoping
 * @param {string} opts.source         — Where this data came from (for audit)
 * @returns {{ user, confidence, matchMethod, validationDetails } | null}
 */
async function findEmployeeValidated({ empId, name, email, phone, corporateId, source }) {
  let user = null;
  let matchMethod = '';
  const validationChecks = [];

  // ── Level 1: Identity Match ──────────────────────────────────────
  // Employee ID + Corporate is ALWAYS the primary identity.
  // Name/email lookups are fallbacks ONLY when empId is unavailable.

  // Priority 1: employeeId + corporate (authoritative — unique per corporate)
  if (empId) {
    // First try with corporate scope (strongest)
    if (corporateId) {
      user = await findUserByEmployeeId(empId, corporateId);
      if (user) matchMethod = 'employeeId+corporate';
    }
    // If no corporateId was provided, or scoped lookup found nothing, try unscoped
    if (!user) {
      user = await findUserByEmployeeId(empId);
      if (user) matchMethod = 'employeeId';
    }
  }

  // Priority 2: corporate email (only if empId was not available)
  if (!user && !empId && email) {
    user = await findUserByEmail(email);
    if (user) matchMethod = 'email';
  }

  // Priority 3: name match scoped to corporate employees (only if empId was not available)
  if (!user && !empId && name) {
    user = await findUserByName(name, corporateId);
    if (user) matchMethod = 'name';
  }

  if (!user) {
    if (empId) {
      logger.debug(`[emailAutoProcess] IDENTITY MISS: empId ${empId} not found in corporate ${corporateId || 'any'} (source: ${source})`);
    }
    return null;
  }

  // ── Level 2: Cross-Validation ────────────────────────────────────
  // Every match MUST pass at least one cross-validation check.

  let crossValidated = false;

  // Check 1: Name cross-validation (if we have a name to compare)
  if (name) {
    const userFullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
    const nameConf = crossValidateName(name, userFullName);
    validationChecks.push({ check: 'name', expected: name, actual: userFullName, result: nameConf });
    if (nameConf === 'exact' || nameConf === 'strong') {
      crossValidated = true;
    } else if (nameConf === 'partial' && matchMethod === 'employeeId') {
      // Partial name match is OK if empId was the primary match — empId is authoritative
      crossValidated = true;
    }
  }

  // Check 2: Verify user is a corporate employee
  const corpMeta = await getCorporateEmployeeMeta(user.id);
  if (corpMeta) {
    validationChecks.push({ check: 'isCorporateEmployee', result: 'pass', corporateId: corpMeta.corporateId, empId: corpMeta.employeeId });

    // If we matched by name/email, verify the empId matches the table row
    if (empId && corpMeta.employeeId) {
      const empIdMatch = corpMeta.employeeId.toUpperCase() === empId.toUpperCase();
      validationChecks.push({ check: 'employeeIdMatch', expected: empId, actual: corpMeta.employeeId, result: empIdMatch ? 'pass' : 'FAIL' });
      if (empIdMatch) crossValidated = true;
      if (!empIdMatch && !matchMethod.startsWith('employeeId')) {
        // Name/email matched a user but their empId is different — REJECT
        logger.warn(`[emailAutoProcess] VALIDATION FAIL: ${matchMethod} matched user ${user.id} but empId mismatch: expected ${empId}, got ${corpMeta.employeeId} (source: ${source})`);
        return null;
      }
    }

    // If we matched by empId (+corporate), corporate scoping is auto-validated
    if (matchMethod.startsWith('employeeId')) crossValidated = true;

    // Verify corporate scope if provided
    if (corporateId && corpMeta.corporateId !== corporateId) {
      validationChecks.push({ check: 'corporateScope', expected: corporateId, actual: corpMeta.corporateId, result: 'FAIL' });
      logger.warn(`[emailAutoProcess] VALIDATION FAIL: user ${user.id} belongs to corporate ${corpMeta.corporateId}, not ${corporateId} (source: ${source})`);
      return null;
    }
  } else {
    validationChecks.push({ check: 'isCorporateEmployee', result: 'FAIL' });
    // User is NOT a corporate employee — reject for profile updates
    if (source === 'profile-update') {
      logger.warn(`[emailAutoProcess] VALIDATION FAIL: user ${user.id} is not a corporate employee (source: ${source})`);
      return null;
    }
  }

  // Check 3: Phone cross-validation (optional strengthener)
  if (phone && user.phoneNumber) {
    const normalPhone = phone.replace(/[^0-9]/g, '');
    const userPhone = (user.phoneNumber || '').replace(/[^0-9]/g, '');
    const phoneMatch = normalPhone.length >= 10 && userPhone.length >= 10 &&
      (normalPhone === userPhone || normalPhone.endsWith(userPhone.slice(-10)) || userPhone.endsWith(normalPhone.slice(-10)));
    validationChecks.push({ check: 'phone', result: phoneMatch ? 'pass' : 'mismatch' });
    if (phoneMatch) crossValidated = true;
  }

  // If no cross-validation passed, reject the match
  if (!crossValidated) {
    logger.warn(`[emailAutoProcess] VALIDATION FAIL: no cross-validation passed for user ${user.id} (match: ${matchMethod}, source: ${source}, checks: ${JSON.stringify(validationChecks)})`);
    return null;
  }

  // Determine overall confidence
  let confidence = 'low';
  const passedChecks = validationChecks.filter(c => c.result === 'pass' || c.result === 'exact' || c.result === 'strong');
  if (matchMethod.startsWith('employeeId') && passedChecks.length >= 2) confidence = 'high';
  else if (matchMethod.startsWith('employeeId') || passedChecks.length >= 2) confidence = 'high';
  else if (passedChecks.length >= 1) confidence = 'medium';

  return {
    user,
    confidence,
    matchMethod,
    validationDetails: validationChecks,
    corporateId: corpMeta?.corporateId || null,
    employeeId: corpMeta?.employeeId || empId || null,
  };
}

/**
 * Extract employee name from a lab-report PDF filename.
 * Strips common suffixes: MAYDEN, MER, ECG, REPORT, etc.
 * Returns cleaned name or null.
 *
 * Examples:
 *   "UMA KANNAN MAYDEN MER.pdf"  → "UMA KANNAN"
 *   "SHANKAR MAYDEN.pdf"         → "SHANKAR"
 *   "GAURAV SINGH BHADOURIA.pdf" → "GAURAV SINGH BHADOURIA"
 *   "Rpt_2602202619240952.PDF"   → null (no extractable name)
 */
function extractNameFromFilename(filename) {
  if (!filename) return null;
  let name = filename.replace(/\.pdf$/i, '').trim();
  // Skip filenames that are just report codes (Rpt_xxxx, 0278ZB001633_...)
  if (/^(Rpt_|[0-9])/i.test(name)) return null;
  // Strip leading "MR." / "MR " / "MRS." / "MS."
  name = name.replace(/^(MR\.?\s*|MRS\.?\s*|MS\.?\s*)/i, '');
  // Strip lab-related suffixes
  name = name.replace(LAB_FILENAME_NOISE_RE, ' ').trim();
  // Clean up  multiple spaces
  name = name.replace(/\s+/g, ' ').trim();
  // Need at least 2 characters of a real name
  if (name.length < 2) return null;
  // Must contain letters
  if (!/[A-Za-z]/.test(name)) return null;
  return name;
}

/**
 * Parse HTML tables from email bodies that contain employee data columns.
 * Looks for tables with headers: empid, empname, contact no, email id
 *
 * Returns array of { empId, name, phone, email } objects.
 */
function parseEmployeeTableFromHtml(html) {
  if (!html) return [];
  const results = [];

  // Simple HTML table parser — extract all <tr> rows
  const tableMatch = html.match(/<table[^>]*>[\s\S]*?<\/table>/gi);
  if (!tableMatch) return [];

  for (const tableHtml of tableMatch) {
    const rows = tableHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi);
    if (!rows || rows.length < 2) continue;

    // Parse header row to find column indices
    const headerCells = (rows[0].match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || [])
      .map(cell => {
        let text = cell.replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').trim().toLowerCase();
        // normalise: "contact no" → "contact no", "email id" → "email id"
        return text;
      });

    const idxEmpId   = headerCells.findIndex(h => /emp\s*id/i.test(h));
    const idxEmpName = headerCells.findIndex(h => /emp\s*name/i.test(h));
    const idxPhone   = headerCells.findIndex(h => /contact/i.test(h));
    const idxEmail   = headerCells.findIndex(h => /email/i.test(h));

    // Must have at least name column to be useful
    if (idxEmpName < 0) continue;

    // Parse data rows (skip header)
    for (let r = 1; r < rows.length; r++) {
      const dataCells = (rows[r].match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || [])
        .map(cell => cell.replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim());

      const empName = idxEmpName >= 0 ? (dataCells[idxEmpName] || '').trim() : '';
      if (!empName) continue;

      const empId  = idxEmpId >= 0 ? (dataCells[idxEmpId] || '').trim() : '';
      const phone  = idxPhone >= 0 ? (dataCells[idxPhone] || '').replace(/[^0-9+]/g, '').trim() : '';
      const rawEmail = idxEmail >= 0 ? (dataCells[idxEmail] || '').trim() : '';

      // email field may have "work@example.com / personal@gmail.com" — take the corporate one
      let email = '';
      if (rawEmail) {
        const emailParts = rawEmail.split(/[\/,;|]/).map(e => e.trim().toLowerCase()).filter(e => e.includes('@'));
        // Prefer corporate domain emails
        email = emailParts.find(e => CORPORATE_DOMAINS.has(emailDomain(e))) || emailParts[0] || '';
      }

      results.push({ empId, name: empName, phone, email });
    }
  }

  return results;
}

// ─── 1. Ticket Creation ───────────────────────────────────────────────────────

/**
 * Create a support ticket for this email (skip if already created).
 * Records ticket_id back onto the email_inboxes row.
 *
 * @param {object} email  EmailInbox model instance
 * @returns {string|null} ticketId created or null if skipped
 */
export async function createTicketFromEmail(email) {
  // Skip if ticket already created for this email
  if (email.ticketId) return null;

  try {
    const sender  = parseSender(email.from);
    const intent  = email.aiIntent || 'other';
    const category = INTENT_TO_CATEGORY[intent] || 'general';
    const priority = INTENT_TO_PRIORITY[intent] || 'medium';

    const requesterName  = email.fromName || sender.name || sender.email || 'Unknown';
    const requesterEmail = sender.email || `${requesterName.toLowerCase().replace(/\s+/g,'')}@email.local`;

    // Build a human-readable description
    const body = email.aiSummary
      || email.body?.slice(0, 500)
      || email.htmlBody?.replace(/<[^>]+>/g, ' ').replace(/\s+/g,' ').trim().slice(0, 500)
      || `Email from ${requesterEmail} regarding: ${email.subject}`;

    const ticket = await createAutoTicket({
      source: 'email',
      requester: { name: requesterName, email: requesterEmail },
      intentLabel: category.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      category,
      priority,
      title: `[Email] ${email.subject || `Email from ${requesterName}`}`,
      description: `From: ${email.from}\nSubject: ${email.subject}\nReceived: ${email.receivedAt || email.createdAt}\n\n${body}`,
      tags: ['email', 'auto-created'],
    });

    if (ticket?.ticketId) {
      await email.update({ ticketId: ticket.ticketId });
      logger.info(`[emailAutoProcess] Ticket ${ticket.ticketId} created for email ${email.id}`);
      return ticket.ticketId;
    }

    return null;
  } catch (err) {
    logger.error(`[emailAutoProcess] createTicketFromEmail error for ${email.id}: ${err.message}`);
    return null;
  }
}

// ─── 2. Health Report Detection & Saving ────────────────────────────────────

/**
 * Detect whether an email represents a health / lab report.
 * Returns { isReport, labName, pdfAttachments, subjectIsPatientName, patientName }
 * or { isReport: false }
 */
export function detectLabReport(email) {
  const sender   = parseSender(email.from || '');
  const domain   = emailDomain(sender.email);
  const fromLab  = LAB_DOMAINS.has(domain);

  // Collect ALL PDF attachments (not just those matching REPORT_FILE_RE)
  const attachments = Array.isArray(email.attachments) ? email.attachments : [];
  const pdfAttachments = attachments.filter(a =>
    (a.mimeType === 'application/pdf' || a.filename?.toLowerCase().endsWith('.pdf'))
  );

  // Also check for legacy-named report files even from non-lab senders
  const legacyReportAtt = pdfAttachments.find(a => REPORT_FILE_RE.test(a.filename || ''));

  // Require either: (a) email from a known lab domain with PDFs, or (b) a legacy report-named PDF
  if (!fromLab && !legacyReportAtt) {
    return { isReport: false };
  }

  // If from lab but no PDFs, not a report
  if (fromLab && pdfAttachments.length === 0) {
    return { isReport: false };
  }

  // Determine lab name
  const labName = email.fromName || sender.name || domain || 'Unknown Lab';

  // Sometimes the subject IS the patient name (e.g. "JITUL SHETH" pattern from labs)
  const trimmedSubject = (email.subject || '').trim();
  const subjectWords   = trimmedSubject.split(/\s+/);
  const subjectIsPatientName =
    subjectWords.length >= 2 && subjectWords.length <= 4 &&
    subjectWords.every(w => /^[A-Za-z.]{2,}$/.test(w));

  return {
    isReport: true,
    labName,
    pdfAttachments: fromLab ? pdfAttachments : (legacyReportAtt ? [legacyReportAtt] : []),
    subjectIsPatientName,
    patientName: subjectIsPatientName ? trimmedSubject : null,
  };
}

/**
 * AI Quality Control for a health report PDF attachment.
 *
 * 1. Blocks low-confidence patient matches outright.
 * 2. Extracts text from the PDF (if bytes available) and asks the LLM to
 *    pull the patient name directly from the document.
 * 3. Cross-verifies the AI-extracted name against the matched user.
 *
 * @param {object} opts
 * @param {string} opts.confidence    - 'low'|'medium'|'high'
 * @param {object} opts.user          - matched user object { firstName, lastName }
 * @param {object} opts.att           - attachment object (may have contentBase64)
 * @param {string} opts.matchMethod   - for logging
 * @returns {{ passed: boolean, reason: string, aiPatientName: string|null }}
 */
async function aiQcReport({ confidence, user, att, matchMethod }) {
  // ── Gate 1: reject low confidence immediately ─────────────────────────────
  if (confidence === 'low') {
    return {
      passed: false,
      reason: `Confidence too low (${confidence}) for match method "${matchMethod}" — report blocked to avoid misdelivery`,
      aiPatientName: null,
    };
  }

  // ── Gate 2: AI PDF name extraction + cross-verify ──────────────────────────
  // PDF bytes must have been stored at parse time
  if (!att.contentBase64) {
    // No bytes available — fall back to confidence-only gate (medium/high passes)
    logger.info('[QC] No PDF bytes available for AI verification — passing on confidence alone');
    return { passed: true, reason: 'no-pdf-bytes;confidence-gate-passed', aiPatientName: null };
  }

  try {
    const pdfParse = await getPdfParse();
    const buffer = Buffer.from(att.contentBase64, 'base64');
    let rawText = '';

    try {
      const parsed = await pdfParse(buffer, { max: 3 }); // first 3 pages only
      rawText = parsed.text || '';
    } catch (pdfErr) {
      logger.warn(`[QC] pdf-parse failed for "${att.filename}": ${pdfErr.message}`);
      // Cannot extract text — pass on confidence
      return { passed: true, reason: 'pdf-parse-failed;confidence-gate-passed', aiPatientName: null };
    }

    if (rawText.trim().length < 20) {
      logger.info('[QC] PDF text too short for AI verification — confidence gate passed');
      return { passed: true, reason: 'pdf-too-short;confidence-gate-passed', aiPatientName: null };
    }

    // Truncate to ~4000 chars (enough for the header / patient info section)
    const snippet = rawText.substring(0, 4000);

    const llm = await getLLM();
    const result = await llm.chat({
      messages: [
        {
          role: 'system',
          content: 'You are a medical document QC AI. Extract ONLY the patient name from the report text. Return JSON: {"patientName":"<name or null>"}. No markdown, no other keys.'
        },
        {
          role: 'user',
          content: `Extract the patient name from this medical report text:\n\n${snippet}`
        }
      ],
      temperature: 0,
      maxTokens: 80,
    });

    let aiPatientName = null;
    try {
      const cleaned = result.content.replace(/```json\n?|```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);
      aiPatientName = parsed.patientName || null;
    } catch {
      // Non-JSON fallback: try to grab quoted name
      const match = result.content.match(/"patientName"\s*:\s*"([^"]+)"/);
      aiPatientName = match ? match[1] : null;
    }

    if (!aiPatientName) {
      logger.info('[QC] AI could not extract patient name — confidence gate passed');
      return { passed: true, reason: 'ai-name-not-found;confidence-gate-passed', aiPatientName: null };
    }

    // Cross-verify AI-extracted name vs. matched user
    const userFullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
    const nameMatch = crossValidateName(aiPatientName, userFullName);

    logger.info(`[QC] AI name="${aiPatientName}" vs user="${userFullName}" → ${nameMatch}`);

    if (nameMatch === 'none') {
      return {
        passed: false,
        reason: `AI extracted patient name "${aiPatientName}" does not match user "${userFullName}" — report blocked`,
        aiPatientName,
      };
    }

    return {
      passed: true,
      reason: `AI name match: ${nameMatch} ("${aiPatientName}" ↔ "${userFullName}")`,
      aiPatientName,
    };
  } catch (err) {
    // AI service failure — fail open (pass) to not block legitimate reports
    logger.warn(`[QC] AI QC error (non-blocking): ${err.message}`);
    return { passed: true, reason: `ai-error-fail-open: ${err.message}`, aiPatientName: null };
  }
}

/**
 * Save health-report PDFs from lab emails to the `reports` table.
 * Uses 2-level validation to match each PDF to the correct employee.
 *
 * Identity priority: empId + corporate (primary) → name scoped to corporate (fallback)
 *
 * @param {object} email  EmailInbox model instance
 * @returns {boolean} true if at least one report saved
 */
export async function saveHealthReportFromEmail(email) {
  if (email.healthReportSaved) return false;

  const meta = detectLabReport(email);
  if (!meta.isReport) return false;

  try {
    // Resolve corporate context from the email (subject, sender domain, CC)
    const corporateId = resolveCorporateFromEmail(email);
    const reportDate = email.receivedAt || email.createdAt || new Date();

    // Avoid duplicate report entries for the same email
    const [existingRows] = await postgresSequelize.query(
      `SELECT id FROM reports WHERE metadata->>'emailId' = :emailId LIMIT 1`,
      { replacements: { emailId: email.id } }
    );
    if (existingRows.length > 0) {
      await email.update({ healthReportSaved: true });
      return false;
    }

    // Parse employee table from HTML body (ours or quoted in lab reply)
    const htmlBody = email.htmlBody || email.body || '';
    const employeeRows = parseEmployeeTableFromHtml(htmlBody);

    // Build a name→tableRow lookup for cross-referencing
    const tableUserCache = new Map();
    for (const row of employeeRows) {
      if (row.name) tableUserCache.set(normaliseName(row.name), row);
    }

    let savedCount = 0;

    // Process each PDF attachment separately
    for (const att of meta.pdfAttachments) {
      if (att.filename && /\.(jpg|jpeg|png|gif|bmp)$/i.test(att.filename)) continue;

      const nameFromFile = extractNameFromFilename(att.filename);
      let matchResult = null;

      // ── Level 1+2: Try to match via HTML table cross-reference ────
      if (nameFromFile && tableUserCache.size > 0) {
        const normName = normaliseName(nameFromFile);

        // Find the best matching table row by name similarity
        let bestTableRow = null;
        let bestNameConf = 'none';
        for (const [tableName, tableRow] of tableUserCache) {
          const conf = crossValidateName(nameFromFile, tableRow.name);
          if (conf === 'exact' || conf === 'strong') {
            bestTableRow = tableRow;
            bestNameConf = conf;
            if (conf === 'exact') break; // perfect match, stop searching
          }
        }

        // If we found a matching table row, use its empId for validated lookup
        if (bestTableRow) {
          matchResult = await findEmployeeValidated({
            empId: bestTableRow.empId,
            name: nameFromFile,
            email: bestTableRow.email,
            phone: bestTableRow.phone,
            corporateId,
            source: `report-filename:${att.filename}`,
          });
        }
      }

      // ── Fallback: Direct validated name lookup ────────────────────
      if (!matchResult && nameFromFile) {
        matchResult = await findEmployeeValidated({
          name: nameFromFile,
          corporateId,
          source: `report-filename-direct:${att.filename}`,
        });
      }

      // ── Fallback: Subject as patient name (single-attachment only) ─
      if (!matchResult && meta.patientName && meta.pdfAttachments.length === 1) {
        matchResult = await findEmployeeValidated({
          name: meta.patientName,
          corporateId,
          source: `report-subject:${meta.patientName}`,
        });
      }

      if (!matchResult) {
        logger.debug(`[emailAutoProcess] saveHealthReport: VALIDATION BLOCKED — no validated match for "${att.filename}" in email ${email.id}`);
        continue;
      }

      const { user, confidence, matchMethod, validationDetails, employeeId: matchedEmpId } = matchResult;

      // ── AI QC Gate ──────────────────────────────────────────────────────────
      const qc = await aiQcReport({ confidence, user, att, matchMethod });
      if (!qc.passed) {
        logger.warn(`[emailAutoProcess] AI QC BLOCKED "${att.filename}" for user ${user.id}: ${qc.reason}`);
        continue; // skip this attachment — do not save or notify
      }
      logger.info(`[emailAutoProcess] AI QC PASSED "${att.filename}": ${qc.reason}`);
      // ────────────────────────────────────────────────────────────────────────

      const fileName = att.filename || 'Health Report.pdf';
      const filePath = att.downloadUrl || `/api/team/emails/${email.id}/attachment`;
      const reportName = (nameFromFile || att.filename?.replace(/\.pdf$/i, '') || 'Health Report');

      await postgresSequelize.query(
        `INSERT INTO reports
           ("userId", "fileName", "filePath", "fileUrl", "fileSize", "mimeType",
            "reportType", "testName", "labName", "reportDate", status,
            "organization_id", metadata, "uploadedAt", "createdAt", "updatedAt")
         VALUES
           (:userId, :fileName, :filePath, :fileUrl, :fileSize, :mimeType,
            'lab', :testName, :labName, :reportDate, 'active',
            :orgId, :metadata::jsonb, NOW(), NOW(), NOW())`,
        {
          replacements: {
            userId:   user.id,
            fileName,
            filePath,
            fileUrl:  att.downloadUrl || filePath,
            fileSize: att.size || 0,
            mimeType: att.mimeType || 'application/pdf',
            testName: reportName,
            labName:  meta.labName,
            reportDate,
            orgId:    user.organization_id || null,
            metadata: JSON.stringify({
              emailId:      email.id,
              subject:      email.subject,
              from:         email.from,
              receivedAt:   email.receivedAt,
              attachmentId: att.contentId || null,
              // Audit trail
              matchMethod,
              confidence,
              employeeId:   matchedEmpId,
              validation:   validationDetails,
              // AI QC audit
              aiQc: {
                passed:        qc.passed,
                reason:        qc.reason,
                aiPatientName: qc.aiPatientName,
              },
            }),
          },
        }
      );

      savedCount++;
      logger.info(`[emailAutoProcess] Report "${fileName}" → user ${user.id} [${confidence}/${matchMethod}] (email ${email.id})`);

      // Send WhatsApp notification with report download link
      try {
        const phone = user.phoneNumber || user.phone;
        if (phone) {
          const patientName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Patient';
          const reportUrl = att.downloadUrl || '';
          await whatsappProductionService.sendHealthReportReady({ to: phone, patientName, reportUrl });
          logger.info(`[emailAutoProcess] WhatsApp report notification sent to ${phone} for "${fileName}"`);
        }
      } catch (waErr) {
        logger.warn(`[emailAutoProcess] WhatsApp notification skipped for user ${user.id}: ${waErr.message}`);
      }
    }

    if (savedCount > 0) {
      await email.update({ healthReportSaved: true });
      logger.info(`[emailAutoProcess] ${savedCount} report(s) saved from email ${email.id}`);
    }

    return savedCount > 0;
  } catch (err) {
    logger.error(`[emailAutoProcess] saveHealthReportFromEmail error for ${email.id}: ${err.message}`);
    return false;
  }
}

// ─── 3. Employee Email Update ─────────────────────────────────────────────────

/**
 * Known corporate email domains whose employees have portal accounts.
 * Add more as needed.
 */
const CORPORATE_DOMAINS = new Set([
  'equitasbank.com',
  'equitas.in',
  'healthplus.com',
  // Add more corporate client domains here as needed
]);

/**
 * Mapping of keywords (lowercased) found in email subjects / from fields → corporateId.
 * Used by resolveCorporateFromEmail() to determine which corporate the email belongs to.
 */
const CORPORATE_SUBJECT_KEYWORDS = [
  { keywords: ['equitas'], corporateId: 5 },
  { keywords: ['tcs', 'tata consultancy'], corporateId: 1 },
  // Add new corporate keyword → ID mappings here
];

/**
 * Resolve the corporateId from the email's subject line and sender domain.
 * Returns the corporateId (number) or null.
 */
function resolveCorporateFromEmail(email) {
  // Strategy 1: Match subject keywords
  const subject = (email.subject || '').toLowerCase();
  for (const entry of CORPORATE_SUBJECT_KEYWORDS) {
    if (entry.keywords.some(kw => subject.includes(kw))) return entry.corporateId;
  }

  // Strategy 2: Match sender domain → corporate
  const sender = parseSender(email.from || '');
  const domain = emailDomain(sender.email);
  if (domain === 'equitasbank.com' || domain === 'equitas.in') return 5;

  // Strategy 3: Check CC/BCC for corporate domain
  const allAddresses = [email.to, email.cc, email.bcc].filter(Boolean).join(' ').toLowerCase();
  if (allAddresses.includes('equitasbank.com') || allAddresses.includes('equitas.in')) return 5;

  return null;
}

/**
 * Extract employee info from the email (HTML booking tables or sender domain)
 * and update their user profile: email and phone number.
 *
 * 2-Level Validation:
 *   Level 1: Match by employeeId + corporate (primary) → email → name (scoped to corporate)
 *   Level 2: Cross-validate name + verify corporate employee status + phone check
 *
 * @param {object} email  EmailInbox model instance
 * @returns {boolean} true if any user was updated
 */
export async function updateEmployeeEmailFromInbox(email) {
  if (email.employeeEmailUpdated) return false;

  try {
    let updatedCount = 0;
    let processedRows = 0;

    // Resolve corporate context from the email
    const corporateId = resolveCorporateFromEmail(email);

    // ── Strategy 1: Parse HTML table for employee data ──────────────
    const htmlBody = email.htmlBody || email.body || '';
    const employeeRows = parseEmployeeTableFromHtml(htmlBody);

    if (employeeRows.length > 0) {
      for (const row of employeeRows) {
        if (!row.name) continue;
        processedRows++;

        // 2-Level validated lookup — empId + corporate is the primary identity
        const matchResult = await findEmployeeValidated({
          empId: row.empId,
          name: row.name,
          email: row.email,
          phone: row.phone,
          corporateId,
          source: 'profile-update',
        });

        if (!matchResult) {
          logger.debug(`[emailAutoProcess] profileUpdate BLOCKED: validation failed for "${row.name}" (empId: ${row.empId}, email: ${row.email})`);
          continue;
        }

        const { user, confidence, matchMethod, validationDetails } = matchResult;

        // Only proceed with high or medium confidence
        if (confidence === 'low') {
          logger.warn(`[emailAutoProcess] profileUpdate SKIPPED: low confidence for user ${user.id} "${row.name}" (${matchMethod})`);
          continue;
        }

        // Build update fields
        const updates = [];
        const replacements = { userId: user.id };

        // Update email if we have a better one
        if (row.email && user.email?.toLowerCase() !== row.email.toLowerCase()) {
          const currentEmail = (user.email || '').toLowerCase();
          const isAutoEmail = /^(e\d+@|pending\+)/i.test(currentEmail);
          if (isAutoEmail || !currentEmail) {
            updates.push('email = :newEmail');
            replacements.newEmail = row.email;
          }
        }

        // Update phone if we have one and it differs
        if (row.phone && row.phone.length >= 10) {
          const currentPhone = (user.phoneNumber || '').replace(/[^0-9]/g, '');
          const newPhone = row.phone.replace(/[^0-9]/g, '');
          if (currentPhone !== newPhone) {
            updates.push('"phoneNumber" = :newPhone');
            replacements.newPhone = row.phone;
          }
        }

        if (updates.length > 0) {
          updates.push('"updatedAt" = NOW()');
          try {
            await postgresSequelize.query(
              `UPDATE users SET ${updates.join(', ')} WHERE id = :userId`,
              { replacements }
            );
            updatedCount++;

            const changesDesc = updates.filter(u => u !== '"updatedAt" = NOW()').join(', ');
            logger.info(
              `[emailAutoProcess] profileUpdate user ${user.id} [${confidence}/${matchMethod}]: ${changesDesc} (empId: ${row.empId})`
            );
          } catch (updateErr) {
            logger.warn(`[emailAutoProcess] profileUpdate FAILED user ${user.id}: ${updateErr.message} (empId: ${row.empId}, email: ${row.email})`);
          }
        }
      }
    }

    // ── Strategy 2: Legacy — sender from corporate domain ───────────
    if (updatedCount === 0 && employeeRows.length === 0) {
      const sender = parseSender(email.from || '');
      if (sender.email) {
        const domain = emailDomain(sender.email);
        if (CORPORATE_DOMAINS.has(domain)) {
          // Validate: find user AND verify they are a corporate employee
          const matchResult = await findEmployeeValidated({
            email: sender.email,
            name: email.fromName || sender.name,
            corporateId,
            source: 'profile-update-legacy',
          });

          if (matchResult && matchResult.confidence !== 'low') {
            const { user } = matchResult;
            if (user.email?.toLowerCase() !== sender.email.toLowerCase()) {
              try {
                await postgresSequelize.query(
                  `UPDATE users SET email = :newEmail, "updatedAt" = NOW() WHERE id = :userId`,
                  { replacements: { newEmail: sender.email, userId: user.id } }
                );
                updatedCount++;
                logger.info(`[emailAutoProcess] profileUpdate (legacy) user ${user.id}: email → ${sender.email} [${matchResult.confidence}/${matchResult.matchMethod}]`);
              } catch (updateErr) {
                logger.warn(`[emailAutoProcess] profileUpdate (legacy) FAILED user ${user.id}: ${updateErr.message}`);
              }
            }
          }
        }
      }
    }

    // Mark processed when we attempted to parse rows, even if no updates were made
    // This prevents infinite retries on emails that will never succeed
    if (updatedCount > 0 || processedRows > 0) {
      await email.update({ employeeEmailUpdated: true });
    }

    return updatedCount > 0;
  } catch (err) {
    logger.error(`[emailAutoProcess] updateEmployeeEmailFromInbox error for ${email.id}: ${err.message}`);
    return false;
  }
}

// ─── Full Processing Pipeline ────────────────────────────────────────────────

/**
 * Run all three tasks on a single email.
 * Safe to call multiple times (each task is idempotent).
 *
 * @param {object} email  EmailInbox model instance
 * @returns {object}  { ticketId, reportSaved, emailUpdated }
 */
export async function processEmailFull(email) {
  const [ticketId, reportSaved, emailUpdated] = await Promise.allSettled([
    createTicketFromEmail(email),
    saveHealthReportFromEmail(email),
    updateEmployeeEmailFromInbox(email),
  ]);

  return {
    emailId: email.id,
    ticketId:     ticketId.value     || null,
    reportSaved:  reportSaved.value  || false,
    emailUpdated: emailUpdated.value || false,
  };
}

/**
 * Batch-process ALL emails for a team member:
 *   - create tickets for any email not yet ticketed
 *   - save health reports from lab emails
 *   - update employee emails from corporate domains
 *
 * @param {number} teamMemberId
 * @param {{ limit?: number }} options
 * @returns {object} stats
 */
export async function batchProcessInbox(teamMemberId, { limit = 500 } = {}) {
  logger.info(`[emailAutoProcess] Batch processing inbox for team member ${teamMemberId}`);

  const emails = await EmailInbox.findAll({
    where: { teamMemberId },
    order: [['receivedAt', 'DESC']],
    limit,
  });

  const stats = {
    total: emails.length,
    ticketsCreated: 0,
    reportsSaved: 0,
    emailsUpdated: 0,
    errors: 0,
  };

  for (const email of emails) {
    try {
      const result = await processEmailFull(email);
      if (result.ticketId)     stats.ticketsCreated++;
      if (result.reportSaved)  stats.reportsSaved++;
      if (result.emailUpdated) stats.emailsUpdated++;
    } catch (err) {
      stats.errors++;
      logger.error(`[emailAutoProcess] batchProcess error for email ${email.id}: ${err.message}`);
    }
  }

  logger.info(`[emailAutoProcess] Batch done for team ${teamMemberId}:`, stats);
  return stats;
}
