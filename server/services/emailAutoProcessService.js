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
import { tick, tickError } from '../utils/cronRegistry.js';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';

// Shared SMTP transporter for system report notifications
let _smtpTransporter = null;
const getSmtpTransporter = () => {
  if (!_smtpTransporter) {
    _smtpTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '465'),
      secure: parseInt(process.env.SMTP_PORT || '465') === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    });
  }
  return _smtpTransporter;
};

// Lazy imports for AI QC (avoid startup cost)
let _llmProvider = null;
const getLLM = async () => {
  if (!_llmProvider) _llmProvider = (await import('./ai-brain/llm-provider.js')).default;
  return _llmProvider;
};
let _PDFParse = null;
const getPdfParse = async () => {
  // pdf-parse v2 exports PDFParse class (not a default function)
  if (!_PDFParse) _PDFParse = (await import('pdf-parse')).PDFParse;
  return _PDFParse;
};

/**
 * Extract raw text from a PDF buffer using pdf-parse v2 PDFParse class.
 * Returns empty string on failure.
 */
async function extractPdfText(buffer) {
  try {
    const PDFParse_ = await getPdfParse();
    const parser = new PDFParse_({ verbosity: -1, data: buffer });
    await parser.load();
    const result = await parser.getText();
    // getText() returns { pages: [{text: string}] }
    const pages = Array.isArray(result?.pages) ? result.pages : [];
    return pages.map(p => p.text || '').join('\n');
  } catch {
    return '';
  }
}

/**
 * Extract the lab's own patient ID from PDF text.
 * Agilus/similar labs print a PATIENT ID field (e.g. SACHM2803750).
 * This is NOT the corporate employee ID, but serves as a persistent
 * cross-reference: once mapped to a userId, future reports match definitively.
 *
 * Also checks for CLNT.PATIENT ID which SHOULD contain the corporate employee ID
 * if the lab fills it in correctly.
 */
function extractLabPatientId(pdfText) {
  if (!pdfText) return { labPatientId: null, clientPatientId: null };

  // CLNT.PATIENT ID — the corporate/client reference (e.g. Equitas employee ID)
  const clientMatch = pdfText.match(/CLNT\.?\s*PATIENT\s*ID\s*:?\s*([A-Z0-9]{3,20})(?:\s|$)/i);
  const clientPatientId = clientMatch?.[1]?.trim() || null;

  // PATIENT ID — lab's own internal patient code (e.g. SACHM2803750)
  // Exclude generic codes like accession numbers
  const labMatch = pdfText.match(/(?<!CLNT\.?\s*)(?<!CLNT\s)PATIENT\s+ID\s*:?\s*([A-Z][A-Z0-9]{4,19})(?:\s|$)/i);
  const labPatientId = labMatch?.[1]?.trim() || null;

  return { labPatientId, clientPatientId };
}

/**
 * Parse individual lab test results from Agilus-format PDF text.
 * Returns array of { testName, section, value, numericValue, unit, referenceRange, flag, isAbnormal }
 */
function extractLabResults(pdfText) {
  if (!pdfText) return [];

  // Known units — mg/dL, μg/dL etc. MUST come before g/dL to avoid partial match on endsWith
  const UNITS = [
    'mil/μL', 'thou/μL', 'μIU/mL', 'mIU/mL', 'ng/mL', 'pg/mL', 'μg/dL', 'μmol/L',
    'mmol/L', 'mEq/L', 'mm at 1 hr', 'kg/sqmts', 'MM HG', 'mm/Hg', 'mg/dL', 'g/dL',
    'U/L', 'IU/L', '/HPF', '/LPF', 'fL', 'pg', 'mts', 'Kgs', 'RATIO', 'sec', 'INR', '%',
  ];

  // Sections that contain actual test results
  const EXTRACT_SECTIONS = new Set([
    'Haematology', 'Immunohaematology', 'Biochemistry', 'Lipid Profile',
    'Urinalysis', 'Hormones', 'Specialised Chemistry', 'Anthropometric', 'Clinical Examination',
  ]);

  const SECTION_MAP = [
    [/HAEMATOLOGY|HEMATOLOGY/i,             'Haematology'],
    [/IMMUNOHAEMATOLOGY/i,                  'Immunohaematology'],
    [/BIOCHEMISTRY.*LIPID|LIPID PROFILE/i,  'Lipid Profile'],
    [/BIOCHEMISTRY/i,                       'Biochemistry'],
    [/URINALYSIS/i,                         'Urinalysis'],
    [/SPECIALISED CHEMISTRY|HORMONE/i,      'Hormones'],
    [/ANTHROPOMETRIC/i,                     'Anthropometric'],
    [/GENERAL EXAMINATION|CARDIOVASCULAR/i, 'Clinical Examination'],
  ];

  const SKIP_RE = [
    /^METHOD\s*:/i, /^Interpretation\s*\(/i, /^View Details/i,
    /^Page \d+\s+Of/i, /^Dr\.\s/i, /^ULR No\./i, /Agilus Diagnostics/i,
    /^PERFORMED AT/i, /^PATIENT NAME\s*:/i, /^PATIENT ID\s*:/i,
    /^ACCESSION NO\s*:/i, /^ABHA NO/i, /^DRAWN\s*:/i, /^RECEIVED\s*:/i,
    /^REPORTED\s*:/i, /^REF\. DOCTOR/i, /^CLNT\.PATIENT ID/i, /^CODE\/NAME/i,
    /^DIAGNOSTIC REPORT/i, /^GLOBAL HEALTH/i, /^Final Results/i,
    /^Tel\s*:/i, /^Email\s*:/i, /^Fax\s*:/i, /^\*+/, /^\*\*End Of Report/i,
    /CONDITIONS OF LABORATORY/i, /Please visit www\./i,
    /^\d+\.\s+(It|All|Result|A\s+requested|Specimen|Incorrect|Discrepancy)/i,
    /^NO\.10\/1/i, /^ARUMBAKKAM/i, /^Grand Mall/i, /^Fortis Hospital/i,
    // Panel sub-headers
    /^BLOOD COUNTS,/i, /^RBC AND PLATELET INDICES/i, /^WBC DIFFERENTIAL COUNT/i,
    /^MORPHOLOGY \(MICROSCOPY\)/i, /^ERYTHROCYTE SEDIMENTATION RATE/i,
    /^ABO GROUP & RH TYPE/i, /^GLUCOSE FASTING \(FBS\)/i, /^GLUCOSE POST-PRANDIAL/i,
    /^LIVER FUNCTION PROFILE/i, /^BLOOD UREA NITROGEN \(BUN\)/i,
    /^CREATININE, SERUM/i, /^URIC ACID, SERUM/i, /^LIPID PROFILE WITH/i,
    /^TSH 3RD GENERATION/i, /^PHYSICAL EXAMINATION, URINE/i,
    /^CHEMICAL EXAMINATION, URINE/i, /^MICROSCOPIC EXAMINATION, URINE/i,
    /^ULTRASOUND ABDOMEN/i, /^ECG$/i, /^XRAY-CHEST/i, /^IMPRESSION /i,
    // Reference-range continuation lines (classification labels with comparison operators)
    /^(Very\s+)?(High|Low|Borderline|Desirable|Normal|Optimal|Adequate)\s*[>:<\/=]/i,
    /^(Near\s+Optimal|High\s+Risk|Low\s+Risk|Borderline\s+[Hh]igh)\s*[>:<\/=]/i,
    // Classification labels followed directly by a number (no colon) e.g. "High 200-499"
    /^(High|Low|Normal)\s+\d/i,
    /^(Below|Above)\s+\d/i,
  ];

  const SKIP_ZONE_RE = [
    /^MEDICAL HISTORY/i, /^RELEVANT .+ HISTORY/i, /^HISTORY OF MEDICATIONS/i,
    /^SUMMARY$/i, /^REMARKS\s*\/\s*RECOMMENDATION/i, /^Comments$/i,
    /^OUR PANEL DOCTORS/i, /^CHECK UP DONE BY/i, /^REPORT REVIEWED BY/i,
    /^RADIOLOGIST/i, /Interpretation\(s\)/i,
  ];

  // NUM_PAT: slash-fraction first, then decimal, then integer-or-dash-range
  const NUM_PAT = '(?:\\d+(?:\\.\\d+)?\\/\\d+(?:\\.\\d+)?|\\d+\\.\\d+|\\d+(?:-\\d+)?)';
  const RESULT_RE = new RegExp(`^(.+?)\\s+(${NUM_PAT})\\s*(High|Low|H|L)?\\s*(.*)$`, 'i');

  const results = [];
  const seen    = new Set();
  let currentSection = 'General';
  let inSkipZone     = false;
  const allLines = pdfText.split('\n');

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i].trim();
    if (!line) continue;

    if (SKIP_ZONE_RE.some(p => p.test(line))) { inSkipZone = true; continue; }

    for (const [pat, name] of SECTION_MAP) {
      if (pat.test(line)) { currentSection = name; inSkipZone = false; break; }
    }

    if (inSkipZone) continue;
    if (!EXTRACT_SECTIONS.has(currentSection)) continue; // only extract in medical sections
    if (SKIP_RE.some(p => p.test(line))) continue;
    if (line.length > 160) continue;
    if (/[a-z]{4,}\s+[a-z]{4,}\s+[a-z]{4,}/.test(line)) continue; // prose

    // Find unit at end of line; if not found, peek at next line for standalone unit
    let unit = null;
    let core = line;
    for (const u of UNITS) {
      if (line.endsWith(u)) { unit = u; core = line.slice(0, line.length - u.length).trim(); break; }
    }
    if (!unit && i + 1 < allLines.length) {
      const nextLine = allLines[i + 1].trim();
      for (const u of UNITS) {
        if (nextLine === u) { unit = u; i++; break; } // consume the standalone unit line
      }
    }

    const m = core.match(RESULT_RE);
    if (m) {
      let testName   = m[1].trim().replace(/\s+/g, ' ');
      const rawValue = m[2];
      const flagRaw  = m[3];
      const refRange = m[4].trim() || null;

      // If lazy regex absorbed "NOT DETECTED" into testName, re-emit as qualitative
      const ndIdx = testName.toUpperCase().indexOf('NOT DETECTED');
      if (ndIdx > 0) {
        testName = testName.slice(0, ndIdx).trim();
        const key = `${testName.toLowerCase()}|not detected`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({ testName, section: currentSection, value: 'NOT DETECTED', numericValue: null, unit, referenceRange: refRange, flag: null, isAbnormal: false });
        }
        continue;
      }

      if (testName.length < 2) continue;
      if (!/^[A-Z]/.test(testName)) continue;         // must start with uppercase (screens phone/address fragments)
      if (/^\d/.test(testName)) continue;
      if (/[a-z]{3,}/.test(testName)) continue;       // testNames in Agilus are ALL CAPS; ≥3 consecutive lowercase = noise
      if (!unit && /^\d{5,}$/.test(rawValue)) continue; // postcode-like values (e.g. 600106) without a unit
      if (/^(NO\.|C\d{3}|CHECK UP|OUR|REPORT|RADIOLOGIST)/i.test(testName)) continue;

      const flag = flagRaw ? (flagRaw.match(/^H/i) ? 'High' : 'Low') : null;
      const numericValue = parseFloat(rawValue.replace(/-\d+$/, ''));
      const key = `${testName.toLowerCase()}|${rawValue}`;
      if (seen.has(key)) continue;
      seen.add(key);

      results.push({
        testName, section: currentSection,
        value: rawValue, numericValue: isNaN(numericValue) ? null : numericValue,
        unit, referenceRange: refRange || null, flag, isAbnormal: !!flag,
      });
      continue;
    }

    // Qualitative results using multi-space column alignment
    const QUAL_RE = /^(NOT DETECTED|POSITIVE|NEGATIVE|NORMAL|ABSENT|PRESENT|ADEQUATE|CLEAR|YELLOW|AMBER|PALE YELLOW|O|A|B|AB)$/i;
    const cols = line.split(/\s{2,}|\t/);
    if (cols.length >= 2) {
      const testName = cols[0].trim();
      const value    = cols[1].trim();
      if (testName.length >= 3 && /^[A-Z]/.test(testName) && !/[a-z]{3,}/.test(testName) && QUAL_RE.test(value)) {
        const key = `${testName.toLowerCase()}|${value.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({ testName: testName.replace(/\s+/g, ' '), section: currentSection, value, numericValue: null, unit: null, referenceRange: cols[2]?.trim() || null, flag: null, isAbnormal: false });
        }
      }
    }
  }

  return results;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Known diagnostic / labs domains whose emails carry health reports */
const LAB_DOMAINS = new Set([
  'medall.in', 'thyrocare.com', 'lal.in', 'srl.com',
  'neubergdiagnostics.com', 'agilus.in', 'metropolisindia.com',
  'drmohans.com', 'neuberg.in', 'labindia.com', 'healthspring.in',
  'dianovalabs.com', 'healthians.com', 'redcliffe.in', 'vijayapath.in',
  'vijayapath.com', 'pulseimagingcentre.com', 'pulseimagingcentre.gmail.com',
  'radolabs.in', 'medalldiagnostics.com',
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
    if (rows2[0]) return rows2[0];

    // Third try: partial last name match for cases where the queried name omits a middle name
    // e.g. "SACHIN MODI" matches user with lastName "RASIKLAL MODI" (last token matches)
    // Also handles reversed prefix (e.g. "K JOSHI" where lastName contains the token "JOSHI")
    const lastToken = parts[parts.length - 1];
    if (lastToken && lastToken.length >= 3) {
      const [rows3] = await postgresSequelize.query(
        `SELECT u.id, u."firstName", u."lastName", u.email, u."phoneNumber", u.organization_id
         FROM users u
         WHERE LOWER(u."firstName") LIKE LOWER(:firstPat)
           AND (LOWER(u."lastName") LIKE LOWER(:lastPat)
                OR LOWER(u."firstName") LIKE LOWER(:combinedPat))
           ${corpFilter}
         ORDER BY length(u."lastName") ASC
         LIMIT 1`,
        { replacements: { ...replacements, firstPat: `${firstName}%`, lastPat: `%${lastToken}`, combinedPat: `%${lastToken}` } }
      );
      if (rows3[0]) return rows3[0];
    }

    return null;
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
      JOIN corporates c ON c.id = ua."entityId" AND LOWER(c.status) = 'active'
      WHERE ua."entityType" = 'corporate'
        AND ua.role = 'employee'
        AND ua.status = 'active'
        AND UPPER(ua.metadata->>'employeeId') = :empId`;
    const replacements = { empId: normalised };

    if (corporateId) {
      query += ` AND ua."entityId" = :corporateId`;
      replacements.corporateId = corporateId;
    }
    // Prefer records where lastName is populated (deduplicates split vs combined names),
    // then most-recent association as a deterministic tiebreak for genuine multi-corp cases.
    query += ` ORDER BY (CASE WHEN u."lastName" IS NOT NULL AND u."lastName" != '' THEN 0 ELSE 1 END) ASC, ua."createdAt" DESC LIMIT 1`;

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
       JOIN corporates c ON c.id = ua."entityId" AND LOWER(c.status) = 'active'
       WHERE ua."userId" = :userId
         AND ua."entityType" = 'corporate'
         AND ua.role = 'employee'
         AND ua.status = 'active'
       ORDER BY ua."createdAt" DESC
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
/** Common honorifics to strip when comparing names */
const HONORIFICS_RE = /^(mr\.?|mrs\.?|ms\.?|miss\.?|dr\.?|prof\.?|shri\.?|smt\.?|sh\.?)\s*/i;

function normaliseName(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(HONORIFICS_RE, '')   // strip leading honorific (MR., DR., SHRI, etc.)
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cross-validate two names. Returns a confidence score:
 *   'exact'   — full match (after normalisation)
 *   'strong'  — one name contains the other, first+last match, or all tokens of shorter name appear in longer
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

  // All tokens of the SHORTER name appear in the LONGER name
  // Handles "SACHIN MODI" matching "SACHIN RASIKLAL MODI" (middle name omitted)
  const [shorter, longer] = tokA.length <= tokB.length ? [tokA, tokB] : [tokB, tokA];
  if (shorter.length >= 2 && shorter.every(t => longer.includes(t))) return 'strong';

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

  // Also handle "REPORTS - SACHIN MODI" / "Reports_Mr Vasim Pathan" patterns
  // common in Agilus & similar labs where subject = "REPORTS - <NAME>"
  let subjectExtractedName = null;
  if (!subjectIsPatientName) {
    // Pattern: "REPORTS - NAME" or "Reports – NAME" or "Report: NAME"
    const reportsPrefix = trimmedSubject.match(/^Reports?[\s_-]+(?:Mr\.?\s*|Mrs\.?\s*|Ms\.?\s*)?(.{4,})$/i);
    if (reportsPrefix) {
      // Strip anything after "//" or "|" (often a secondary description)
      let candidate = reportsPrefix[1].replace(/\s*[\/|].*$/, '').trim();
      // Remove stray leading/trailing punctuation
      candidate = candidate.replace(/^[-–\s]+|[-–\s]+$/g, '').trim();
      if (candidate.length >= 4 && /[A-Za-z]{2}/.test(candidate)) {
        subjectExtractedName = candidate;
      }
    }
  }

  const patientName = subjectIsPatientName
    ? trimmedSubject
    : (subjectExtractedName || null);

  return {
    isReport: true,
    labName,
    pdfAttachments: fromLab ? pdfAttachments : (legacyReportAtt ? [legacyReportAtt] : []),
    subjectIsPatientName: subjectIsPatientName || !!subjectExtractedName,
    patientName,
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
async function aiQcReport({ confidence, user, att, matchMethod, preExtractedText }) {
  // ── Gate 1: reject low confidence immediately ─────────────────────────────
  if (confidence === 'low') {
    return {
      passed: false,
      reason: `Confidence too low (${confidence}) for match method "${matchMethod}" — report blocked to avoid misdelivery`,
      aiPatientName: null,
      labPatientId: null,
      clientPatientId: null,
    };
  }

  // ── Gate 2: AI PDF name extraction + cross-verify ──────────────────────────
  if (!att.contentBase64) {
    logger.info('[QC] No PDF bytes available for AI verification — passing on confidence alone');
    return { passed: true, reason: 'no-pdf-bytes;confidence-gate-passed', aiPatientName: null, labPatientId: null, clientPatientId: null };
  }

  const buffer = Buffer.from(att.contentBase64, 'base64');
  // Re-use pre-extracted text if already done during Level-0 lookup
  const rawText = (preExtractedText && preExtractedText.length > 20)
    ? preExtractedText
    : await extractPdfText(buffer);

  try {
    // Extract lab patient ID fields from PDF for audit + caching
    const { labPatientId, clientPatientId } = extractLabPatientId(rawText);
    if (labPatientId) logger.info(`[QC] Lab patient ID extracted: "${labPatientId}" (clientPatientId: "${clientPatientId || 'none'}") from "${att.filename}"`);
    if (clientPatientId) logger.info(`[QC] CLNT.PATIENT ID found: "${clientPatientId}" — this may be the corporate employee ID`);

    if (rawText.trim().length < 20) {
      logger.info('[QC] PDF text too short for AI verification — confidence gate passed');
      return { passed: true, reason: 'pdf-too-short;confidence-gate-passed', aiPatientName: null, labPatientId: labPatientId || null, clientPatientId: clientPatientId || null };
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
      return { passed: true, reason: 'ai-name-not-found;confidence-gate-passed', aiPatientName: null, labPatientId: labPatientId || null, clientPatientId: clientPatientId || null };
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
        labPatientId: labPatientId || null,
        clientPatientId: clientPatientId || null,
      };
    }

    return {
      passed: true,
      reason: `AI name match: ${nameMatch} ("${aiPatientName}" ↔ "${userFullName}")`,
      aiPatientName,
      labPatientId: labPatientId || null,
      clientPatientId: clientPatientId || null,
    };
  } catch (err) {
    logger.warn(`[QC] AI QC error (non-blocking): ${err.message}`);
    return { passed: true, reason: `ai-error-fail-open: ${err.message}`, aiPatientName: null, labPatientId: null, clientPatientId: null };
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

    // Check how many PDFs from this email were already saved
    // (handles partial saves caused by worker restarts mid-loop)
    const [savedFileNames] = await postgresSequelize.query(
      `SELECT "fileName" FROM reports WHERE metadata->>'emailId' = :emailId`,
      { replacements: { emailId: email.id } }
    );
    const alreadySavedFiles = new Set(savedFileNames.map(r => r.fileName));
    // If every PDF attachment already has a saved report, mark done and skip
    const allPdfs = meta.pdfAttachments.filter(a => !/\.(jpg|jpeg|png|gif|bmp)$/i.test(a.filename || ''));
    if (allPdfs.length > 0 && allPdfs.every(a => alreadySavedFiles.has(a.filename))) {
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

      // ── Level 0: Lab Patient ID cache lookup (fastest, most definitive) ───
      // Extract patient ID from PDF bytes — Agilus-style PATIENT ID field
      // Once a labPatientId is mapped to a userId (stored in report metadata),
      // future reports with the same ID match definitively without name guessing.
      let pdfText = '';
      let labPatientId = null;
      let clientPatientId = null;
      if (att.contentBase64) {
        pdfText = await extractPdfText(Buffer.from(att.contentBase64, 'base64'));
        ({ labPatientId, clientPatientId } = extractLabPatientId(pdfText));

        // If the lab filled in CLNT.PATIENT ID with the corporate employee ID, use it directly
        if (clientPatientId) {
          matchResult = await findEmployeeValidated({
            empId: clientPatientId,
            name: nameFromFile || meta.patientName,
            corporateId,
            source: `clnt-patient-id:${clientPatientId}`,
          });
          if (matchResult) logger.info(`[emailAutoProcess] Level-0 match via CLNT.PATIENT ID "${clientPatientId}" → user ${matchResult.user.id}`);
        }

        // If not matched yet, check if this labPatientId was mapped before in prior reports
        if (!matchResult && labPatientId) {
          const [prevReports] = await postgresSequelize.query(
            `SELECT "userId" FROM reports WHERE metadata->>'labPatientId' = :labPatientId LIMIT 1`,
            { replacements: { labPatientId } }
          );
          if (prevReports[0]) {
            const prevUserId = prevReports[0].userId;
            const [userRows] = await postgresSequelize.query(
              `SELECT id, "firstName", "lastName", email, "phoneNumber", organization_id FROM users WHERE id = :id LIMIT 1`,
              { replacements: { id: prevUserId } }
            );
            if (userRows[0]) {
              matchResult = {
                user: userRows[0],
                confidence: 'high',
                matchMethod: 'lab-patient-id-cache',
                validationDetails: [{ check: 'labPatientIdCache', labPatientId, cachedUserId: prevUserId, result: 'pass' }],
                employeeId: null,
              };
              logger.info(`[emailAutoProcess] Level-0 cache hit: labPatientId "${labPatientId}" → user ${prevUserId} (previously matched)`);
            }
          }
        }
      }

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
      const qc = await aiQcReport({ confidence, user, att, matchMethod, preExtractedText: pdfText || undefined });
      if (!qc.passed) {
        logger.warn(`[emailAutoProcess] AI QC BLOCKED "${att.filename}" for user ${user.id}: ${qc.reason}`);
        continue; // skip this attachment — do not save or notify
      }
      logger.info(`[emailAutoProcess] AI QC PASSED "${att.filename}": ${qc.reason}`);
      // ────────────────────────────────────────────────────────────────────────

      const fileName = att.filename || 'Health Report.pdf';

      // Skip attachments already saved in a previous (interrupted) run
      if (alreadySavedFiles.has(fileName)) {
        savedCount++;
        logger.info(`[emailAutoProcess] Report "${fileName}" already saved (recovery skip) for email ${email.id}`);
        continue;
      }

      // Generate a signed time-limited download token (7 days) for the public download URL
      const downloadToken = jwt.sign(
        { emailId: email.id, contentId: att.contentId, fileName },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      const publicReportUrl = `https://app.mediqzy.com/api/public/report-download/${downloadToken}`;
      const filePath = publicReportUrl;
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
            fileUrl:  publicReportUrl,
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
              labPatientId: labPatientId,
              clientPatientId: clientPatientId,
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

      // ── Get new report ID for EHR storage ───────────────────────────────────
      const [[newReport]] = await postgresSequelize.query(
        `SELECT id FROM reports WHERE "userId" = :userId AND metadata->>'emailId' = :emailId AND "fileName" = :fileName LIMIT 1`,
        { replacements: { userId: user.id, emailId: email.id, fileName } }
      );
      const newReportId = newReport?.id || null;

      // ── Extract & store structured lab results (EHR) ─────────────────────
      // Stage E: extract via the canonical LLM+OCR extractor (replaces the regex parser) and write
      // through the single canonical writer. Observations land as verification_status='pending'
      // (they reach the verify queue, then the CRM), not the old messy regex rows.
      if (newReportId && att?.contentBase64) {
        try {
          const { extractReportObservations } = await import('./report-extraction.service.js');
          const { persistObservations } = await import('./report-persistence.service.js');
          const buf = Buffer.from(att.contentBase64, 'base64');
          const ex = await extractReportObservations(buf, att.mimeType || 'application/pdf', { reportId: newReportId });
          if (ex.observations?.length) {
            const { written } = await persistObservations({
              reportId: newReportId, userId: user.id,
              corporateId: user.corporate_id || null, tenantId: user.tenant_id || null,
              documentHash: ex.meta.document_hash, observations: ex.observations, meta: ex.meta,
              reportDate,
            });
            const abnormalCount = ex.observations.filter(o => o.flag_source).length;
            await postgresSequelize.query(
              `UPDATE reports SET "aiAnalysis" = :aiAnalysis::jsonb WHERE id = :id`,
              { replacements: { id: newReportId, aiAnalysis: JSON.stringify({
                  extractedAt: new Date().toISOString(), testCount: written, abnormalCount,
                  method: ex.meta.ocr_method, status: ex.status }) } }
            );
            logger.info(`[emailAutoProcess] EHR: stored ${written} canonical observations (${ex.status}) for report ${newReportId}`);
          } else {
            logger.info(`[emailAutoProcess] EHR: no observations extracted for report ${newReportId} (status ${ex.status})`);
          }
        } catch (ehrErr) {
          logger.warn(`[emailAutoProcess] EHR extraction failed for report ${newReportId}: ${ehrErr.message}`);
        }
      }
      // ────────────────────────────────────────────────────────────────────────

      savedCount++;
      logger.info(`[emailAutoProcess] Report "${fileName}" → user ${user.id} [${confidence}/${matchMethod}] (email ${email.id})`);

      // Send WhatsApp notification with report download link
      try {
        const phone = user.phoneNumber || user.phone;
        if (phone) {
          const patientName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Patient';
          const reportUrl = publicReportUrl;
          await whatsappProductionService.sendHealthReportReady({ to: phone, patientName, reportUrl });
          logger.info(`[emailAutoProcess] WhatsApp report notification sent to ${phone} for "${fileName}"`);
          tick('whatsapp_report', { patient: patientName, file: fileName });
        }
      } catch (waErr) {
        logger.warn(`[emailAutoProcess] WhatsApp notification skipped for user ${user.id}: ${waErr.message}`);
      }

      // Send email notification with report download link
      try {
        const patientEmail = user.email || user.workEmail;
        if (patientEmail) {
          const patientName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Patient';
          const transporter = getSmtpTransporter();
          await transporter.sendMail({
            from: `"SmartHealth Care" <${process.env.SMTP_USER}>`,
            to: patientEmail,
            subject: `Your Health Report is Ready — ${fileName.replace(/\.pdf$/i, '')}`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                <div style="background:linear-gradient(135deg,#0ea5e9,#6366f1);padding:30px;text-align:center;border-radius:12px 12px 0 0;">
                  <h1 style="color:#fff;margin:0;font-size:22px;">Your Health Report is Ready</h1>
                </div>
                <div style="background:#f8fafc;padding:30px;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
                  <p style="font-size:16px;color:#334155;">Dear <strong>${patientName}</strong>,</p>
                  <p style="color:#475569;">Your health report <strong>${fileName}</strong> has been uploaded to your Mediqzy health portal and is ready to view.</p>
                  ${publicReportUrl ? `<div style="text-align:center;margin:24px 0;">
                    <a href="${publicReportUrl}" style="background:#0ea5e9;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">Download Report</a>
                  </div>` : ''}
                  <p style="color:#64748b;font-size:13px;">You can also view all your reports by logging in to <a href="https://app.mediqzy.com" style="color:#0ea5e9;">app.mediqzy.com</a>.</p>
                  <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">
                  <p style="color:#94a3b8;font-size:12px;text-align:center;">Team Mediqzy &nbsp;|&nbsp; support@mediqzy.com</p>
                </div>
              </div>`,
          });
          logger.info(`[emailAutoProcess] Email report notification sent to ${patientEmail} for "${fileName}"`);
          tick('email_report', { patient: patientName, file: fileName });
        }
      } catch (emailErr) {
        logger.warn(`[emailAutoProcess] Email notification skipped for user ${user.id}: ${emailErr.message}`);
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
