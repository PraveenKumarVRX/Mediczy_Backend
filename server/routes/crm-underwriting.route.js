import { sibFetch as fetch } from '../services/sib-client.js';
/**
 * CRM Underwriting Pipeline
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides:
 *   - Insurance product catalogue (GMC, GPA, GTL, OPD, TopUp, CI, PA)
 *   - Line-item coverage matrix per product (inclusions / exclusions / sub-limits)
 *   - AI-powered RFQ slip parser (extracts coverage requirements from RFQ data)
 *   - Full underwriting pipeline: requested coverages vs product matrix → gap
 *     analysis → AI underwriting decision → conditions + loading recommendation
 * ─────────────────────────────────────────────────────────────────────────────
 */

import express from 'express';
import { authTeam, requirePermission } from '../middleware/team.middleware.js';
import sharedPool from '../db/pgPool.js';
import llmProvider from '../services/ai-brain/llm-provider.js';
import { getS3Client, getUploadsBucket } from '../services/s3-presign.service.js';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import XLSX from '../utils/excel-compat.js';

const router = express.Router();

const SIB_URL = process.env.SIB_URL || 'http://localhost:8001';

// ─── LLM helper ──────────────────────────────────────────────────────────────
// UW chat routes through SIB first (SIB's own cascade handles node1/node2/insurance
// framing), then falls back to Groq. isha-insurance is a dead direct alias — the
// InsuranceLLM model it targeted is no longer served by isha-inc.com.

const aiComplete = async (messages, { maxTokens = 1200, temperature = 0.25, uwMode = false } = {}) => {
  if (uwMode) {
    for (const provider of ['sib', 'groq']) {
      try {
        const result = await llmProvider.chat({ messages, maxTokens, temperature, forceProvider: provider });
        const text = result?.content || result?.text || result?.message || String(result || '');
        if (text?.trim()) return text;
      } catch (err) {
        console.warn(`[UW] ${provider} failed: ${err.message}`);
      }
    }
    throw new Error('All UW providers failed');
  }
  const result = await llmProvider.chat({ messages, maxTokens, temperature, preferProvider: process.env.CRM_LLM_PROVIDER || 'sarvam' });
  return result?.content || result?.text || result?.message || String(result || '');
};

// ─── SIB RAG enrichment ───────────────────────────────────────────────────────
// Pulls real-time web results + SIB knowledge base for the user's question.
// Runs with a 5-second timeout so it never blocks the chat response.

async function sibRagContext(query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  // Detect if query is insurance-domain to decide web search phrasing
  const isInsurance = /\b(loss.?ratio|loading|premium|gwp|irdai|underwriting|claim|coverage|policy|tpa|gmc|gpa|gtl|si |sum.?insured|reinsur|deductible)\b/i.test(query);
  const webQuery = isInsurance ? `${query} IRDAI India group health insurance` : query;

  try {
    const [webRes, kbRes] = await Promise.allSettled([
      fetch(`${SIB_URL}/web/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: webQuery, max_results: 4 }),
        signal: controller.signal,
      }).then(r => r.json()),

      fetch(`${SIB_URL}/knowledge/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit: 3 }),
        signal: controller.signal,
      }).then(r => r.json()),
    ]);

    clearTimeout(timer);
    const parts = [];

    // Web search — live IRDAI/regulatory results
    if (webRes.status === 'fulfilled' && webRes.value?.results?.length) {
      const snippets = webRes.value.results
        .filter(r => r.snippet)
        .slice(0, 3)
        .map(r => `• ${r.title}: ${r.snippet}`)
        .join('\n');
      if (snippets) parts.push(`LIVE WEB CONTEXT (as of ${new Date().toISOString().slice(0, 10)}):\n${snippets}`);
    }

    // SIB KB — medical condition data useful for UW risk assessment
    if (kbRes.status === 'fulfilled' && kbRes.value?.results?.length) {
      const facts = kbRes.value.results
        .filter(r => r.data)
        .slice(0, 2)
        .map(r => `• [${r.type}: ${r.key}]: ${JSON.stringify(r.data).slice(0, 250)}`)
        .join('\n');
      if (facts) parts.push(`CLINICAL REFERENCE DATA:\n${facts}`);
    }

    if (!parts.length) return '';
    return `\n────────────────────────────────────────────────\nRAG-ENRICHED CONTEXT (retrieved for this query)\n────────────────────────────────────────────────\n${parts.join('\n\n')}`;
  } catch {
    clearTimeout(timer);
    return '';
  }
}

// ─── DB bootstrap ─────────────────────────────────────────────────────────────

async function ensureTables() {
  await sharedPool.query(`
    CREATE TABLE IF NOT EXISTS crm_insurance_products (
      id            BIGSERIAL PRIMARY KEY,
      code          VARCHAR(30)  NOT NULL UNIQUE,
      name          VARCHAR(200) NOT NULL,
      category      VARCHAR(50)  NOT NULL,
      description   TEXT,
      irdai_ref     VARCHAR(100),
      is_active     BOOLEAN NOT NULL DEFAULT true,
      sort_order    INTEGER DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ins_products_code ON crm_insurance_products(code);

    CREATE TABLE IF NOT EXISTS crm_product_coverage_matrix (
      id                BIGSERIAL PRIMARY KEY,
      product_id        BIGINT NOT NULL REFERENCES crm_insurance_products(id) ON DELETE CASCADE,
      coverage_head     VARCHAR(200) NOT NULL,
      category          VARCHAR(50)  NOT NULL DEFAULT 'hospitalization',
      status            VARCHAR(20)  NOT NULL DEFAULT 'included',
      description       TEXT,
      limit_type        VARCHAR(50),
      limit_value       VARCHAR(200),
      waiting_period    VARCHAR(100),
      sub_limit_notes   TEXT,
      regulatory_ref    VARCHAR(200),
      is_optional       BOOLEAN NOT NULL DEFAULT false,
      is_standard_excl  BOOLEAN NOT NULL DEFAULT false,
      sort_order        INTEGER DEFAULT 0,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_coverage_matrix_product ON crm_product_coverage_matrix(product_id);
    CREATE INDEX IF NOT EXISTS idx_coverage_matrix_status ON crm_product_coverage_matrix(status);

    CREATE TABLE IF NOT EXISTS crm_rfq_underwriting (
      id                  BIGSERIAL PRIMARY KEY,
      rfq_id              BIGINT NOT NULL REFERENCES crm_rfqs(id) ON DELETE CASCADE,
      product_id          BIGINT REFERENCES crm_insurance_products(id),
      product_code        VARCHAR(30),
      uw_status           VARCHAR(50) NOT NULL DEFAULT 'pending',
      risk_score          INTEGER DEFAULT 50,
      loading_pct         NUMERIC(5,2) DEFAULT 0,
      decision            VARCHAR(100),
      ai_narrative        TEXT,
      slip_parsed         JSONB DEFAULT '{}'::jsonb,
      requested_coverages JSONB DEFAULT '[]'::jsonb,
      coverage_gap        JSONB DEFAULT '[]'::jsonb,
      conditions          JSONB DEFAULT '[]'::jsonb,
      exclusions_applied  JSONB DEFAULT '[]'::jsonb,
      risk_flags          JSONB DEFAULT '[]'::jsonb,
      created_by          INTEGER,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_rfq_uw_rfq ON crm_rfq_underwriting(rfq_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_rfq_uw_rfq_product ON crm_rfq_underwriting(rfq_id, product_code);
  `);
  // Add extracted_text cache column if it doesn't exist yet
  await sharedPool.query(`
    ALTER TABLE crm_rfq_files ADD COLUMN IF NOT EXISTS extracted_text TEXT;
  `).catch(() => {});
  await seedProducts();
}

// ─── Document text extraction ─────────────────────────────────────────────────
// Fetches a file from S3 and extracts readable text. Caches result in DB.

async function extractAndCacheFileText(file) {
  if (file.extracted_text) return file.extracted_text;
  const bucket = getUploadsBucket();
  if (!bucket || !file.s3_key) return null;

  try {
    const res = await getS3Client().send(new GetObjectCommand({ Bucket: bucket, Key: file.s3_key }));
    const chunks = [];
    for await (const chunk of res.Body) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    const mime = file.mime_type || '';
    const name = (file.original_name || '').toLowerCase();
    let text = '';

    if (mime === 'application/pdf' || name.endsWith('.pdf')) {
      try {
        const pdfParse = (await import('pdf-parse')).default;
        const parsed = await pdfParse(buffer);
        text = (parsed.text || '').slice(0, 12000);
      } catch { text = ''; }
    } else if (mime.includes('spreadsheet') || mime.includes('excel') || name.endsWith('.xlsx') || name.endsWith('.xls')) {
      try {
        const wb = await XLSX.read(buffer, { type: 'buffer', cellDates: true });
        const lines = [];
        for (const sheetName of wb.SheetNames) {
          const ws = wb.Sheets[sheetName];
          const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
          lines.push(`=== ${sheetName} ===`);
          for (let r = range.s.r; r <= Math.min(range.e.r, 200); r++) {
            const row = [];
            for (let c = range.s.c; c <= range.e.c; c++) {
              const cell = ws[XLSX.utils.encode_cell({ r, c })];
              if (cell?.v !== undefined && cell.v !== null && cell.v !== '') {
                const v = cell.v instanceof Date ? cell.v.toISOString().slice(0, 10) : (cell.w || cell.v?.toString());
                if (v?.toString().trim()) row.push(v.toString().trim());
              }
            }
            if (row.length) lines.push(row.join(' | '));
          }
        }
        text = lines.join('\n').slice(0, 12000);
      } catch { text = ''; }
    } else if (mime === 'text/csv' || name.endsWith('.csv')) {
      text = buffer.toString('utf8').slice(0, 8000);
    } else if (mime === 'text/plain' || name.endsWith('.txt')) {
      text = buffer.toString('utf8').slice(0, 8000);
    }

    if (text.trim()) {
      await sharedPool.query(
        `UPDATE crm_rfq_files SET extracted_text = $1 WHERE id = $2`,
        [text, file.id]
      ).catch(() => {});
    }
    return text || null;
  } catch (e) {
    console.warn('[UW chat] doc extract failed:', e.message);
    return null;
  }
}

// ─── Seed insurance products & coverage matrix ───────────────────────────────

async function seedProducts() {
  const existing = await sharedPool.query(`SELECT COUNT(*) AS c FROM crm_insurance_products`);
  if (parseInt(existing.rows[0].c) > 0) return; // already seeded

  // Insert product catalogue
  const products = [
    { code: 'GMC',   name: 'Group Mediclaim (GMC)',               category: 'health',    sort_order: 1, irdai_ref: 'IRDAI/HLT/PROD/UIN/P-H', description: 'Standard group hospitalization cover for corporate employees and dependents under a single master policy.' },
    { code: 'GPA',   name: 'Group Personal Accident (GPA)',        category: 'accident',  sort_order: 2, irdai_ref: 'IRDAI/HLT/PROD/PA',      description: 'Covers accidental death, disability and hospitalization due to accidents for employee groups.' },
    { code: 'GTL',   name: 'Group Term Life (GTL)',                category: 'life',      sort_order: 3, irdai_ref: 'IRDAI/LIFE/PROD/GTL',     description: 'Group term life assurance providing death benefit (natural + accidental) for employee groups.' },
    { code: 'OPD',   name: 'Group OPD / Outpatient Benefits',     category: 'health',    sort_order: 4, irdai_ref: 'IRDAI/HLT/PROD/OPD',      description: 'Outpatient department benefits covering consultations, diagnostics, pharmacy, dental and vision.' },
    { code: 'TOPUP', name: 'Group Top-Up / Super Top-Up',         category: 'health',    sort_order: 5, irdai_ref: 'IRDAI/HLT/PROD/TU',       description: 'Enhances existing GMC coverage above a deductible threshold; Super Top-Up aggregates claims.' },
    { code: 'CI',    name: 'Group Critical Illness (CI)',          category: 'health',    sort_order: 6, irdai_ref: 'IRDAI/HLT/PROD/CI',       description: 'Lump-sum benefit on diagnosis of listed critical illnesses. IRDAI standardized 20 CI list.' },
    { code: 'EWS',   name: 'Employee Wellness Suite',              category: 'wellness',  sort_order: 7, irdai_ref: 'N/A',                     description: 'Preventive health checks, teleconsultation, mental health support and wellness programs.' },
  ];

  for (const p of products) {
    const { rows } = await sharedPool.query(
      `INSERT INTO crm_insurance_products (code, name, category, description, irdai_ref, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [p.code, p.name, p.category, p.description, p.irdai_ref, p.sort_order]
    );
    const pid = rows[0].id;
    await seedCoverageMatrix(pid, p.code);
  }
}

// ─── Coverage matrix seed data ────────────────────────────────────────────────

async function seedCoverageMatrix(productId, code) {
  const matrix = COVERAGE_KNOWLEDGE_BASE[code];
  if (!matrix) return;
  for (let i = 0; i < matrix.length; i++) {
    const m = matrix[i];
    await sharedPool.query(
      `INSERT INTO crm_product_coverage_matrix
        (product_id, coverage_head, category, status, description, limit_type, limit_value,
         waiting_period, sub_limit_notes, regulatory_ref, is_optional, is_standard_excl, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        productId, m.head, m.category, m.status, m.description,
        m.limitType || null, m.limitValue || null,
        m.waitingPeriod || null, m.subLimitNotes || null,
        m.regulatoryRef || null,
        m.isOptional || false, m.isStandardExcl || false, i,
      ]
    );
  }
}

// ─── AI-trained coverage knowledge base ──────────────────────────────────────
// This is the core "training data" — IRDAI-standard coverage norms for each
// product type, encoded as structured line items.

const COVERAGE_KNOWLEDGE_BASE = {

  GMC: [
    // ── INCLUSIONS ──
    { head: 'Inpatient Hospitalization (≥24 hrs)', category: 'hospitalization', status: 'included', description: 'All illness/accident requiring continuous stay of at least 24 hours in a hospital.', regulatoryRef: 'IRDAI Circular IRDA/HLT/MISC/CIR/088/04/2017' },
    { head: 'Day Care Procedures', category: 'hospitalization', status: 'included', description: 'Listed day care procedures not requiring 24-hr admission (e.g., cataract, chemotherapy, dialysis, lithotripsy). IRDAI specifies 586 day care procedures.', regulatoryRef: 'IRDAI Circular 2016 — Day Care List' },
    { head: 'Pre-Hospitalization Expenses', category: 'hospitalization', status: 'included', description: 'Medical expenses incurred 30 days before date of admission.', limitType: 'Days', limitValue: '30 days prior to admission' },
    { head: 'Post-Hospitalization Expenses', category: 'hospitalization', status: 'included', description: 'Medical expenses incurred 60 days after date of discharge.', limitType: 'Days', limitValue: '60 days after discharge' },
    { head: 'Ambulance Charges', category: 'hospitalization', status: 'included', description: 'Road ambulance for emergency hospitalization.', limitType: 'Per Event', limitValue: '₹2,000 per hospitalization (standard)' },
    { head: 'AYUSH Treatment', category: 'hospitalization', status: 'included', description: 'Ayurveda, Yoga, Unani, Siddha, Homeopathy treatment at licensed centres.', limitType: 'Sub-limit', limitValue: 'Up to 25% of Sum Insured', regulatoryRef: 'IRDAI Circular — AYUSH mandatory inclusion 2013' },
    { head: 'Organ Donor Expenses', category: 'hospitalization', status: 'included', description: 'Medical and surgical expenses of the organ donor for harvesting.', limitType: 'Up to SI', limitValue: 'Included up to Sum Insured' },
    { head: 'Mental Health Treatment', category: 'hospitalization', status: 'included', description: 'Inpatient psychiatric/mental health treatment on par with physical illness.', regulatoryRef: 'Mental Healthcare Act 2017 & IRDAI Circular 2020' },
    { head: 'Domiciliary Hospitalization', category: 'hospitalization', status: 'conditional', description: 'Treatment at home when hospitalization is not possible (bed rest >3 days). Subject to medical officer recommendation.', limitType: 'Sub-limit', limitValue: 'Up to 20% of SI (policy-specific)', isOptional: true },
    { head: 'Cancer Treatment (Chemotherapy/Radiation)', category: 'critical', status: 'included', description: 'Inpatient chemotherapy, radiotherapy, immunotherapy for cancer.' },
    { head: 'Dialysis', category: 'critical', status: 'included', description: 'Regular dialysis for end-stage renal disease (day care basis).' },
    { head: 'Hernia Surgery', category: 'surgery', status: 'included', description: 'Inguinal, umbilical, and other hernia repairs requiring hospitalization.' },
    { head: 'Joint Replacement Surgery', category: 'surgery', status: 'sub-limited', description: 'Hip/knee replacement. Typically sub-limited.', limitType: 'Sub-limit', limitValue: '₹1.5L–₹2.5L per joint (policy-specific)', subLimitNotes: "Check specific insurer's orthopaedic sub-limit. NHCX standardization pending." },
    { head: 'Cataract Surgery', category: 'surgery', status: 'sub-limited', description: 'Sub-limited per eye per policy year.', limitType: 'Sub-limit', limitValue: '₹30,000–₹50,000 per eye (policy-specific)' },
    { head: 'Physiotherapy (Inpatient)', category: 'hospitalization', status: 'conditional', description: 'Physiotherapy only as part of inpatient care; outpatient physiotherapy is excluded under GMC.' },
    { head: 'Second Medical Opinion', category: 'wellness', status: 'included', description: 'Tele/digital second medical opinion for critical diagnoses.' },
    { head: 'E-Consultation / Teleconsultation', category: 'wellness', status: 'included', description: 'Digital consultation with network doctors (₹0 co-pay if in-network).' },
    // ── ROOM RENT ──
    { head: 'Room Rent — Single Private Room', category: 'limits', status: 'sub-limited', description: 'Standard room rent capping. Proportionate deductions apply if upgraded.', limitType: 'Per Day', limitValue: '1% of SI per day (₹5,000–₹10,000 typical)', subLimitNotes: 'Proportionate deduction clause: all other expenses are reduced proportionately if room exceeds sub-limit.' },
    { head: 'ICU/ICCU Charges', category: 'limits', status: 'sub-limited', description: 'ICU room charges.', limitType: 'Per Day', limitValue: '2% of SI per day (₹10,000–₹20,000 typical)' },
    // ── OPTIONAL COVERS ──
    { head: 'Maternity — Normal Delivery', category: 'maternity', status: 'conditional', description: 'Normal/vaginal delivery expenses. Optional add-on, not standard.', limitType: 'Sub-limit', limitValue: '₹50,000–₹1,00,000 (policy-specific)', waitingPeriod: '9 months from inception', isOptional: true },
    { head: 'Maternity — Caesarean Delivery', category: 'maternity', status: 'conditional', description: 'C-section delivery expenses. Optional add-on.', limitType: 'Sub-limit', limitValue: '₹1,00,000–₹1,50,000 (policy-specific)', waitingPeriod: '9 months from inception', isOptional: true },
    { head: 'Newborn Baby Cover', category: 'maternity', status: 'conditional', description: 'Covers newborn from Day 1 if maternity is included.', waitingPeriod: 'From birth (if maternity included)', isOptional: true },
    { head: 'Infertility / IVF Treatment', category: 'maternity', status: 'excluded', description: 'IVF, IUI, ICSI and assisted reproduction treatments.', isStandardExcl: true },
    // ── WAITING PERIODS ──
    { head: 'Pre-Existing Diseases (PED)', category: 'waiting_period', status: 'conditional', description: 'Any disease/condition existing before policy inception.', waitingPeriod: '4 years continuous coverage before PED is covered', regulatoryRef: 'IRDAI Health Regulations 2016 — 48-month PED cap' },
    { head: 'Specific Disease Waiting Period', category: 'waiting_period', status: 'conditional', description: 'Named conditions (e.g., sinusitis, hernia, piles, joint disorders) listed in policy schedule.', waitingPeriod: '24 months' },
    { head: 'General Waiting Period', category: 'waiting_period', status: 'conditional', description: 'All illnesses/conditions in first 30 days of policy (accidents excluded).', waitingPeriod: '30 days' },
    // ── STANDARD EXCLUSIONS ──
    { head: 'OPD Consultations', category: 'outpatient', status: 'excluded', description: 'Outpatient doctor visits, minor treatments not requiring hospitalization are not covered under GMC.', isStandardExcl: true },
    { head: 'OPD Diagnostics / Investigations', category: 'outpatient', status: 'excluded', description: 'Outpatient lab tests, X-rays, MRI/CT scans without hospitalization.', isStandardExcl: true },
    { head: 'OPD Pharmacy / Medicines', category: 'outpatient', status: 'excluded', description: 'Outpatient prescription medicines and pharmacy.', isStandardExcl: true },
    { head: 'Dental Treatment (non-accidental)', category: 'dental', status: 'excluded', description: 'Routine dental, tooth extraction, orthodontics, implants. Dental injury due to accident is covered.', isStandardExcl: true },
    { head: 'Vision / Spectacles / Contact Lenses', category: 'optical', status: 'excluded', description: 'Spectacle frames, lenses, contact lenses and routine eye examinations. Eye injury (accident) is covered.', isStandardExcl: true },
    { head: 'Cosmetic / Plastic Surgery', category: 'cosmetic', status: 'excluded', description: 'Aesthetic, cosmetic, reconstructive surgery (unless medically necessitated by accident/injury/cancer).', isStandardExcl: true },
    { head: 'Bariatric / Weight Loss Surgery', category: 'cosmetic', status: 'excluded', description: 'Obesity surgery, gastric bypass, liposuction.', isStandardExcl: true },
    { head: 'Hearing Aids / Prosthetics (external)', category: 'dme', status: 'excluded', description: 'External prosthetics, wheelchairs, hearing aids, crutches (internal implants covered if during hospitalization).', isStandardExcl: true },
    { head: 'Experimental / Unproven Treatments', category: 'exclusion', status: 'excluded', description: 'Treatments not approved by relevant medical body or under clinical trial.', isStandardExcl: true },
    { head: 'HIV / AIDS', category: 'exclusion', status: 'excluded', description: 'HIV, AIDS and sexually transmitted diseases (standard exclusion; optional HIV cover available from some insurers).', isStandardExcl: true },
    { head: 'Self-Inflicted Injuries / Suicide Attempt', category: 'exclusion', status: 'excluded', description: 'Intentional self-harm, suicide attempts.', isStandardExcl: true },
    { head: 'War / Nuclear / Radiation', category: 'exclusion', status: 'excluded', description: 'War, invasion, civil war, nuclear/biological/chemical events.', isStandardExcl: true },
    { head: 'Alcohol / Drug Abuse', category: 'exclusion', status: 'excluded', description: 'Illness or injury arising directly from alcoholism, substance abuse, narcotics.', isStandardExcl: true },
    { head: 'Criminal Acts', category: 'exclusion', status: 'excluded', description: 'Injury/illness arising from the insured committing a criminal act.', isStandardExcl: true },
    { head: 'Adventure / Hazardous Sports', category: 'exclusion', status: 'excluded', description: 'Injuries from mountaineering, scuba diving, bungee jumping, motor racing etc. (extendable by endorsement).', isStandardExcl: true },
    { head: 'Non-Allopathic Treatments (unlicensed)', category: 'exclusion', status: 'excluded', description: 'Faith healing, spa, massage, non-AYUSH alternative therapies.', isStandardExcl: true },
    { head: 'Vaccination / Immunization', category: 'exclusion', status: 'excluded', description: 'Routine vaccinations and preventive immunization.', isStandardExcl: true },
  ],

  GPA: [
    { head: 'Accidental Death (AD)', category: 'core', status: 'included', description: '100% of Sum Insured paid to nominee on death due to accident within 12 months of the accident.' },
    { head: 'Permanent Total Disability (PTD)', category: 'core', status: 'included', description: '100% of SI for total and permanent disability: both eyes, both hands/feet, one eye + one limb, loss of speech + hearing.', limitType: '% of SI', limitValue: '100%' },
    { head: 'Permanent Partial Disability (PPD)', category: 'core', status: 'included', description: 'Specified percentage of SI per IRDAI table based on limb/organ lost.', limitType: '% of SI', limitValue: '1%–75% per IRDAI PPD schedule' },
    { head: 'Temporary Total Disability (TTD)', category: 'core', status: 'included', description: 'Weekly benefit for total inability to perform own occupation due to accident. Maximum 104 weeks.', limitType: 'Weekly', limitValue: '1% of SI per week (max 104 weeks)', isOptional: true },
    { head: 'Accidental Hospitalization Expenses', category: 'hospitalization', status: 'included', description: 'Medical expenses for hospitalization due to accident.', limitType: 'Sub-limit', limitValue: 'Up to 25% of SI or ₹5L whichever lower', isOptional: true },
    { head: 'Fracture / Dislocation Benefit', category: 'benefit', status: 'conditional', description: 'Lump sum per IRDAI fracture benefit schedule for named fractures not requiring hospitalization.', isOptional: true },
    { head: 'Ambulance Charges (Accident)', category: 'benefit', status: 'included', description: 'Road ambulance for emergency accident hospitalization.', limitType: 'Per Event', limitValue: '₹2,000 per event' },
    { head: 'Carriage of Mortal Remains', category: 'benefit', status: 'included', description: 'Actual transportation cost of body from place of death to hometown.', limitType: 'Fixed', limitValue: '₹5,000–₹10,000 (policy-specific)' },
    { head: "Children's Education Benefit", category: 'benefit', status: 'conditional', description: "Lump sum for dependent children's education on AD/PTD.", limitType: 'Fixed', limitValue: '₹10,000 per child (policy-specific)', isOptional: true },
    { head: 'OPD Due to Accident', category: 'outpatient', status: 'conditional', description: 'Outpatient medical treatment for accident injuries.', limitType: 'Sub-limit', limitValue: '₹5,000–₹10,000 (policy-specific)', isOptional: true },
    // EXCLUSIONS
    { head: 'Illness / Sickness (any kind)', category: 'exclusion', status: 'excluded', description: 'Any illness, disease, medical condition not caused by external accidental means.', isStandardExcl: true },
    { head: 'Pre-Existing Physical Disability', category: 'exclusion', status: 'excluded', description: 'Disabilities existing before policy inception.', isStandardExcl: true },
    { head: 'Suicide / Self-Harm', category: 'exclusion', status: 'excluded', description: 'Intentional self-inflicted injury or attempted suicide.', isStandardExcl: true },
    { head: 'Intoxication (Alcohol / Drugs)', category: 'exclusion', status: 'excluded', description: 'Accidents while under influence of alcohol, narcotics or drugs.', isStandardExcl: true },
    { head: 'War / Nuclear / Biological', category: 'exclusion', status: 'excluded', description: 'War, civil war, terrorism declared, nuclear/biological/chemical events.', isStandardExcl: true },
    { head: 'Aviation (Non-Commercial Flights)', category: 'exclusion', status: 'excluded', description: 'Accidents as pilot or crew/passenger of non-commercial aircraft. Commercial passenger flights are covered.', isStandardExcl: true },
    { head: 'Adventure / Hazardous Sports', category: 'exclusion', status: 'excluded', description: 'Mountain climbing, motor racing, bungee jumping, contact sports etc. (extendable).', isStandardExcl: true },
    { head: 'Pregnancy-Related Injuries', category: 'exclusion', status: 'excluded', description: 'Injuries or complications arising from pregnancy, childbirth.', isStandardExcl: true },
    { head: 'Mental Illness / Psychiatric Conditions', category: 'exclusion', status: 'excluded', description: 'Disability/death arising from mental, nervous or psychiatric disorders.', isStandardExcl: true },
    { head: 'Criminal Acts', category: 'exclusion', status: 'excluded', description: 'Injury while committing or attempting to commit a criminal offence.', isStandardExcl: true },
  ],

  GTL: [
    { head: 'Death Benefit — Natural Death', category: 'core', status: 'included', description: '100% of Sum Assured paid to nominee on death by any cause (natural or accidental).', limitType: '100% of SA', limitValue: 'Full Sum Assured' },
    { head: 'Death Benefit — Accidental Death', category: 'core', status: 'included', description: 'Accidental death included under natural death benefit; some policies offer additional AD benefit.', limitType: '100% of SA', limitValue: 'Full Sum Assured' },
    { head: 'Terminal Illness Benefit (Early Payout)', category: 'benefit', status: 'conditional', description: 'Advance payment of up to 50% of SA on diagnosis of terminal illness with <12 months life expectancy.', isOptional: true },
    { head: 'Accelerated Critical Illness Rider', category: 'rider', status: 'conditional', description: 'Advance payout of CI benefit from life cover on diagnosis of listed CI conditions.', isOptional: true },
    { head: 'Waiver of Premium on Disability', category: 'benefit', status: 'conditional', description: 'Future premiums waived if insured suffers total permanent disability.', isOptional: true },
    { head: 'Repatriation of Mortal Remains', category: 'benefit', status: 'conditional', description: 'Repatriation cost assistance for death abroad.', isOptional: true },
    { head: 'Free Look Period', category: 'regulatory', status: 'included', description: '15-day free look period from policy receipt to return without penalty.', regulatoryRef: 'IRDAI Life Regulations 2000' },
    // EXCLUSIONS
    { head: 'Suicide within First Year', category: 'exclusion', status: 'excluded', description: 'Death by suicide within 12 months of policy inception or revival.', waitingPeriod: 'After 1 year — 80% of premiums paid returned (IRDAI 2013)', isStandardExcl: true },
    { head: 'War / Civil War / Terrorism', category: 'exclusion', status: 'excluded', description: 'Death due to war, invasion, act of foreign enemy, civil war.', isStandardExcl: true },
    { head: 'Nuclear / Biological / Chemical Events', category: 'exclusion', status: 'excluded', description: 'Death from nuclear radiation, biological or chemical weapon events.', isStandardExcl: true },
    { head: 'Aviation — Non-Commercial', category: 'exclusion', status: 'excluded', description: 'Death as pilot or crew of non-commercial aircraft.', isStandardExcl: true },
    { head: 'Criminal Act', category: 'exclusion', status: 'excluded', description: 'Death while committing or attempting a criminal act.', isStandardExcl: true },
    { head: 'Misrepresentation / Non-Disclosure', category: 'exclusion', status: 'excluded', description: 'Claim voided if material facts were withheld or misrepresented at underwriting.', regulatoryRef: 'Insurance Act 1938 Section 45', isStandardExcl: true },
  ],

  OPD: [
    { head: 'Outpatient Consultation — Network Doctors', category: 'opd', status: 'included', description: 'Cashless/reimbursement for in-network doctor consultations (GP, specialist).', limitType: 'Annual Sublimit', limitValue: '₹3,000–₹10,000 per member (policy-specific)' },
    { head: 'Outpatient Consultation — Non-Network', category: 'opd', status: 'included', description: 'Reimbursement for non-network specialist consultations.', limitType: 'Per Visit', limitValue: 'Up to ₹500–₹1,500 per visit' },
    { head: 'Pathology / Lab Tests', category: 'diagnostics', status: 'included', description: 'Outpatient blood tests, urine analysis, biopsy and other laboratory investigations.', limitType: 'Annual Sublimit', limitValue: 'Included within OPD sublimit' },
    { head: 'Radiology (X-Ray, Ultrasound)', category: 'diagnostics', status: 'included', description: 'Outpatient imaging including X-ray, USG, mammography.', limitType: 'Annual Sublimit', limitValue: 'Included within OPD sublimit' },
    { head: 'Advanced Imaging (CT/MRI/PET)', category: 'diagnostics', status: 'sub-limited', description: 'CT scan, MRI, PET scan on outpatient basis.', limitType: 'Sub-limit', limitValue: '₹5,000–₹10,000 per scan (policy-specific)' },
    { head: 'Pharmacy / Prescription Medicines', category: 'pharmacy', status: 'included', description: 'Outpatient prescription medicines from licensed pharmacy.', limitType: 'Annual Sublimit', limitValue: '₹5,000–₹15,000 per member' },
    { head: 'Dental — Basic Treatment', category: 'dental', status: 'included', description: 'Basic dental: examination, scaling, extraction, simple fillings.', limitType: 'Annual Sublimit', limitValue: '₹3,000–₹5,000 per member' },
    { head: 'Dental — Major Procedures', category: 'dental', status: 'sub-limited', description: 'Root canal, crown, bridge (higher sub-limit). Implants excluded.', limitType: 'Sub-limit', limitValue: '₹5,000–₹10,000 per year' },
    { head: 'Dental — Cosmetic / Orthodontics', category: 'dental', status: 'excluded', description: 'Orthodontic braces, teeth whitening, dental implants, cosmetic dentistry.', isStandardExcl: true },
    { head: 'Optical — Prescription Lenses', category: 'optical', status: 'included', description: 'Prescription spectacle lenses (single vision/bifocal) and contact lenses.', limitType: 'Annual Sublimit', limitValue: '₹1,500–₹3,000 per member' },
    { head: 'Optical — Frames', category: 'optical', status: 'sub-limited', description: 'Spectacle frames.', limitType: 'Annual Sublimit', limitValue: '₹500–₹1,000 per member' },
    { head: 'Physiotherapy (Outpatient)', category: 'therapy', status: 'included', description: 'Outpatient physiotherapy sessions at licensed centres.', limitType: 'Per Session', limitValue: '₹500/session; max 10 sessions/year' },
    { head: 'Annual Preventive Health Checkup', category: 'preventive', status: 'included', description: 'Full body health checkup once per policy year.', limitType: 'Annual', limitValue: '₹2,000–₹5,000 per member' },
    { head: 'Mental Health / Psychiatry Consultation', category: 'mental_health', status: 'included', description: 'Outpatient psychiatric/counselling sessions (IRDAI mandate).', limitType: 'Per Session', limitValue: 'Included within OPD sublimit', regulatoryRef: 'Mental Healthcare Act 2017' },
    { head: 'Vaccination / Immunization', category: 'preventive', status: 'conditional', description: 'Adult vaccinations (flu, typhoid, hepatitis B) may be covered. Routine childhood vaccines excluded.', isOptional: true },
    { head: 'Alternative Medicine (AYUSH)', category: 'alternative', status: 'conditional', description: 'AYUSH outpatient consultations at licensed centres.', isOptional: true },
    { head: 'Telemedicine / E-Consultation', category: 'digital', status: 'included', description: 'App/phone-based doctor consultation.', limitType: 'Unlimited', limitValue: 'Covered within OPD annual limit' },
    { head: 'Cosmetic Procedures', category: 'exclusion', status: 'excluded', description: 'Aesthetic treatments, botox, fillers, cosmetic dermatology.', isStandardExcl: true },
    { head: 'Experimental Treatments', category: 'exclusion', status: 'excluded', description: 'Unproven/clinical trial treatments not approved by regulatory body.', isStandardExcl: true },
    { head: 'Inpatient Hospitalization', category: 'exclusion', status: 'excluded', description: 'Inpatient hospitalization is covered under GMC, not OPD policy.', isStandardExcl: true },
  ],

  TOPUP: [
    { head: 'Hospitalization Above Deductible (Single Claim)', category: 'core', status: 'included', description: 'Top-Up: covers single hospitalization claim exceeding the deductible. Super Top-Up: aggregate of all claims in policy year exceeding deductible.', limitType: 'Above Deductible', limitValue: 'Up to SI above deductible threshold' },
    { head: 'Deductible / Threshold', category: 'core', status: 'conditional', description: 'Insured must bear or have existing GMC cover for the deductible amount.', limitType: 'Deductible', limitValue: 'Typically ₹2L–₹5L (equals base GMC SI)' },
    { head: 'Pre/Post Hospitalization', category: 'hospitalization', status: 'included', description: 'Pre-30 days, post-60 days expenses above deductible threshold.', limitType: 'Days', limitValue: '30/60 days (same as GMC)' },
    { head: 'Day Care Procedures', category: 'hospitalization', status: 'included', description: 'Day care above deductible threshold (if single event exceeds deductible — Top-Up; or cumulative for Super Top-Up).' },
    { head: 'All GMC Standard Inclusions', category: 'hospitalization', status: 'included', description: 'AYUSH, ambulance, organ donor, mental health, room rent and ICU sub-limits apply.' },
    { head: 'Claims Below Deductible', category: 'exclusion', status: 'excluded', description: 'No benefit paid if claim(s) do not exceed the deductible threshold.', isStandardExcl: true },
    { head: 'OPD (Outpatient)', category: 'exclusion', status: 'excluded', description: 'OPD not covered under Top-Up. Requires separate OPD policy.', isStandardExcl: true },
    { head: 'All GMC Standard Exclusions', category: 'exclusion', status: 'excluded', description: 'Dental, optical, cosmetic, experimental, war, nuclear, self-harm, HIV exclusions apply.', isStandardExcl: true },
  ],

  CI: [
    { head: 'Cancer of Specified Severity', category: 'ci_condition', status: 'included', description: 'Invasive malignant tumour characterised by uncontrolled growth and spread. Excludes non-invasive (CIS), skin cancers (unless melanoma).', regulatoryRef: 'IRDAI Standardised CI Benefit 2020' },
    { head: 'First Heart Attack (Acute MI)', category: 'ci_condition', status: 'included', description: 'First occurrence of myocardial infarction with ECG + enzyme evidence + permanent damage.' },
    { head: 'Open Heart Bypass Surgery (CABG)', category: 'ci_condition', status: 'included', description: 'Coronary artery bypass graft surgery under cardiopulmonary bypass.' },
    { head: 'Open Heart Valve Repair/Replacement', category: 'ci_condition', status: 'included', description: 'Open heart surgery to repair or replace valves.' },
    { head: 'Coma of Specified Severity', category: 'ci_condition', status: 'included', description: 'State of unconsciousness with no response to external stimuli for >96 hours with GCS ≤6.' },
    { head: 'Kidney Failure (End-Stage Renal Disease)', category: 'ci_condition', status: 'included', description: 'End-stage renal disease requiring permanent dialysis or transplant.' },
    { head: 'Stroke (Resulting in Permanent Symptoms)', category: 'ci_condition', status: 'included', description: 'Cerebrovascular accident with permanent neurological deficit lasting >24 hours.' },
    { head: 'Major Organ/Bone Marrow Transplant', category: 'ci_condition', status: 'included', description: 'Recipient of heart, lung, liver, kidney, pancreas transplant, or allogeneic bone marrow transplant.' },
    { head: 'Multiple Sclerosis with Persisting Symptoms', category: 'ci_condition', status: 'included', description: 'Definitive diagnosis of MS with at least 2 documented episodes.' },
    { head: 'Motor Neuron Disease', category: 'ci_condition', status: 'included', description: 'ALS, progressive spinal muscular atrophy, progressive bulbar palsy, primary lateral sclerosis.' },
    { head: 'Permanent Paralysis of Limbs', category: 'ci_condition', status: 'included', description: 'Total and irreversible loss of function of 2 or more limbs.' },
    { head: 'Aorta Graft Surgery', category: 'ci_condition', status: 'included', description: 'Surgery for disease of the thoracic/abdominal aorta.' },
    { head: 'Primary Pulmonary Hypertension', category: 'ci_condition', status: 'included', description: 'Irreversible PPH diagnosed by cardiologist with right heart catheterisation.' },
    { head: 'Blindness (Permanent)', category: 'ci_condition', status: 'included', description: 'Total, permanent and irreversible loss of all vision in both eyes.' },
    { head: 'Deafness (Total, Permanent)', category: 'ci_condition', status: 'included', description: 'Total and irreversible loss of hearing in both ears (>90 dB loss).' },
    { head: 'Loss of Speech (Permanent)', category: 'ci_condition', status: 'included', description: 'Total and permanent loss of ability to speak.' },
    { head: 'Loss of Limbs (Permanent)', category: 'ci_condition', status: 'included', description: 'Permanent physical severance of two limbs at or above the wrist/ankle.' },
    { head: 'Third Degree Burns (Major)', category: 'ci_condition', status: 'included', description: 'Third degree burns covering ≥20% of body surface area.' },
    { head: 'Aplastic Anaemia (Severe)', category: 'ci_condition', status: 'included', description: 'Chronic persistent bone marrow failure requiring blood/marrow transfusion.' },
    { head: 'Bacterial Meningitis', category: 'ci_condition', status: 'included', description: 'Definitive diagnosis of bacterial meningitis resulting in permanent neurological deficit.' },
    { head: 'Benign Brain Tumour', category: 'ci_condition', status: 'included', description: 'Non-malignant brain tumour requiring surgery/radiation and causing permanent neurological deficit.' },
    { head: 'End Stage Liver Disease', category: 'ci_condition', status: 'included', description: 'Chronic irreversible liver failure with cirrhosis and specified complications.' },
    { head: 'End Stage Lung Disease', category: 'ci_condition', status: 'included', description: 'Chronic irreversible failure of both lungs on maximum oxygen therapy.' },
    { head: 'Fulminant Viral Hepatitis', category: 'ci_condition', status: 'included', description: 'Acute hepatic failure due to viral hepatitis resulting in coma.' },
    { head: 'Alzheimer\'s Disease / Dementia', category: 'ci_condition', status: 'included', description: 'Definitive Alzheimer\'s diagnosis with irreversible cognitive decline scored by CDR ≥2.' },
    { head: 'Parkinson\'s Disease (before age 65)', category: 'ci_condition', status: 'conditional', description: 'Parkinson\'s with permanent neurological impairment (some policies restrict to early onset <65 years).', isOptional: true },
    { head: 'Survival Period', category: 'regulatory', status: 'conditional', description: 'Insured must survive 30 days after diagnosis of CI for benefit to be payable.', waitingPeriod: '30-day survival period post-diagnosis', regulatoryRef: 'IRDAI CI Standardization 2020' },
    // EXCLUSIONS
    { head: '90-Day Initial Waiting Period', category: 'exclusion', status: 'excluded', description: 'No CI claim payable in first 90 days from inception (accidents excepted).', waitingPeriod: '90 days from inception', isStandardExcl: true },
    { head: 'Pre-Existing Critical Illness', category: 'exclusion', status: 'excluded', description: 'CI conditions diagnosed or with symptoms before policy inception.', isStandardExcl: true },
    { head: 'Non-Listed Conditions', category: 'exclusion', status: 'excluded', description: 'Any condition not in the product\'s listed critical illness schedule.', isStandardExcl: true },
    { head: 'Self-Inflicted Illness / Suicide', category: 'exclusion', status: 'excluded', description: 'CI resulting from intentional self-harm.', isStandardExcl: true },
    { head: 'War / Nuclear / Chemical', category: 'exclusion', status: 'excluded', description: 'CI arising from war, nuclear events, biological/chemical weapons.', isStandardExcl: true },
  ],

  EWS: [
    { head: 'Annual Health Checkup', category: 'preventive', status: 'included', description: 'Comprehensive annual health screening (CBC, lipid, glucose, BP, ECG) at empanelled labs.' },
    { head: 'Unlimited Teleconsultation', category: 'digital', status: 'included', description: 'App-based/phone doctor consultations 24x7 across specialties.' },
    { head: 'Mental Health Counselling', category: 'mental_health', status: 'included', description: 'Confidential EAP sessions: psychiatry, psychology, CBT — up to 6 sessions per quarter.' },
    { head: 'Nutrition / Diet Counselling', category: 'wellness', status: 'included', description: 'Registered dietitian consultations via app or in-person.' },
    { head: 'Fitness Membership Discounts', category: 'wellness', status: 'conditional', description: 'Partner gym/fitness app access or reimbursement (₹2,000–₹5,000/year).', isOptional: true },
    { head: 'Yoga / Meditation Programs', category: 'wellness', status: 'conditional', description: 'Employer-sponsored yoga/mindfulness sessions.', isOptional: true },
    { head: 'Disease Management Programs', category: 'chronic', status: 'included', description: 'Chronic condition management (diabetes, hypertension, COPD) with care coordinators.' },
    { head: 'Dental Checkup (Annual)', category: 'preventive', status: 'conditional', description: 'Annual dental examination and cleaning.', isOptional: true },
    { head: 'Vision Screening', category: 'preventive', status: 'conditional', description: 'Annual vision test with prescription.', isOptional: true },
    { head: 'Women\'s Health Program', category: 'wellness', status: 'conditional', description: 'Gynaecology consultations, PCOS management, menopause support.', isOptional: true },
    { head: 'Claims / Hospitalization Assistance', category: 'hospitalization', status: 'excluded', description: 'This is a wellness program — no hospitalization claims payable.', isStandardExcl: true },
  ],
};

// ─── iSHA — Underwriting AI system prompt ─────────────────────────────────────

const ISHA_UNDERWRITING_SYSTEM = `You are iSHA-UW (Intelligent Specialized Health Actuarial — Underwriting), an AI underwriter for Indian group health insurance. You have deep knowledge of:

PRODUCT KNOWLEDGE:
- Group Mediclaim (GMC): IRDAI health regulations 2013/2016/2020, hospitalization inclusions/exclusions, room rent sub-limits, maternity waiting periods, PED 4-year rule, day care procedures list, AYUSH mandate
- Group Personal Accident (GPA): AD/PTD/PPD/TTD benefit structures, IRDAI PPD schedule, exclusions (sickness, suicide, intoxication, war, adventure sports)
- Group Term Life (GTL): Natural + accidental death, terminal illness, suicide exclusion (1-year rule), Aviation/war exclusions
- OPD: Consultation, diagnostics, pharmacy, dental, optical sub-limits; teleconsultation; preventive checkup
- Top-Up / Super Top-Up: Deductible mechanics, single vs aggregate claims, relationship with base GMC
- Critical Illness (CI): IRDAI 2020 standard 20 CI list, 90-day waiting, 30-day survival period, pre-existing CI exclusion
- Employee Wellness Suite: Non-insurance wellness program, no hospitalization claims

UNDERWRITING PRINCIPLES (INDIA):
- Experience Rating: Where LR (Loss Ratio) > 80%, apply loading. Where LR > 120%, refer to chief underwriter or decline.
- Age Loading: Average age > 45 attracts 15%–25% loading; > 55 attracts 25%–40%
- Industry Risk: High-risk industries (mining, construction, chemicals, manufacturing) attract 10%–20% loading
- Family Composition: High dependent ratio (dependents > 2x employees) increases maternity/paediatric risk
- SI Adequacy: Sum insured < ₹2L per family is sub-optimal; > ₹10L attracts NWS scrutiny
- PED Loading: No PED declaration = 5%–10% loading; specific PED history = 10%–20% loading
- Room Rent: Removal of room rent sub-limit = 15%–25% loading on base premium
- Maternity Loading: Including maternity = 10%–15% add-on; high female ratio = additional loading
- Claims Free Bonus: 3+ years claims-free = 5%–10% discount on renewal
- Underwriting Decision Categories:
  * Acceptable (Standard): Clean risk, LR < 60%, young average age, low-risk industry
  * Acceptable with Loading: Moderate risk, 60%<LR<100%, older average age, specific enhancements
  * Refer to Chief Underwriter: LR > 100%, very high average age >55, unusual coverage requests, large SI
  * Decline: LR > 150%, catastrophic claims history, fraudulent behaviour indicators

COVERAGE GAP ANALYSIS:
When comparing requested coverages to standard product matrix:
- MATCH: Requested coverage is standard inclusion in product → no additional loading
- SUB-LIMITED MATCH: Requested coverage is included but with sub-limits → advise client on limits
- OPTIONAL ADD-ON: Coverage is available as extension → quote additional premium
- NON-STANDARD REQUEST: Coverage not typically offered but can be underwritten with loading
- EXCLUDED: Coverage is a standard/absolute exclusion → cannot be offered
- REGULATORY RESTRICTION: Coverage restricted by IRDAI regulations → explain restriction

Always cite specific IRDAI regulations, waiting period rules, and actuarial rationale in your assessments.`;

// ─── GET /api/crm/underwriting/products ──────────────────────────────────────

router.get('/products', authTeam, requirePermission('Insurance RFQ Management'), async (req, res) => {
  try {
    const { rows } = await sharedPool.query(
      `SELECT * FROM crm_insurance_products WHERE is_active = true ORDER BY sort_order`
    );
    res.json({ success: true, products: rows });
  } catch (err) {
    console.error('[UW] products error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/crm/underwriting/products/:code/matrix ─────────────────────────

router.get('/products/:code/matrix', authTeam, requirePermission('Insurance RFQ Management'), async (req, res) => {
  try {
    const { code } = req.params;
    const prod = await sharedPool.query(
      `SELECT * FROM crm_insurance_products WHERE code = $1`, [code.toUpperCase()]
    );
    if (!prod.rows.length) return res.status(404).json({ success: false, error: 'Product not found' });
    const productId = prod.rows[0].id;

    const { rows } = await sharedPool.query(
      `SELECT * FROM crm_product_coverage_matrix WHERE product_id = $1 ORDER BY sort_order`,
      [productId]
    );

    const grouped = {};
    for (const r of rows) {
      if (!grouped[r.category]) grouped[r.category] = [];
      grouped[r.category].push(r);
    }

    res.json({ success: true, product: prod.rows[0], matrix: rows, grouped });
  } catch (err) {
    console.error('[UW] matrix error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/crm/underwriting/rfqs/:rfqId ────────────────────────────────────

router.get('/rfqs/:rfqId', authTeam, requirePermission('Insurance RFQ Management'), async (req, res) => {
  try {
    const { rfqId } = req.params;
    const { rows } = await sharedPool.query(
      `SELECT u.*, p.name AS product_name, p.code AS product_code_from_product
       FROM crm_rfq_underwriting u
       LEFT JOIN crm_insurance_products p ON p.id = u.product_id
       WHERE u.rfq_id = $1
       ORDER BY u.created_at DESC`,
      [rfqId]
    );
    res.json({ success: true, assessments: rows });
  } catch (err) {
    console.error('[UW] get rfq uw error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/crm/underwriting/rfqs/:rfqId/parse-slip ───────────────────────
// AI parses the RFQ's existing_coverages / required_coverages text and
// structured fields into a normalised coverage requirement list.

router.post('/rfqs/:rfqId/parse-slip', authTeam, requirePermission('Insurance RFQ Management'), async (req, res) => {
  try {
    const { rfqId } = req.params;
    const rfqRes = await sharedPool.query(`SELECT * FROM crm_rfqs WHERE id = $1`, [rfqId]);
    if (!rfqRes.rows.length) return res.status(404).json({ success: false, error: 'RFQ not found' });
    const rfq = rfqRes.rows[0];

    const slipText = [
      rfq.existing_coverages ? `EXISTING COVERAGES:\n${rfq.existing_coverages}` : '',
      rfq.required_coverages ? `REQUIRED COVERAGES:\n${rfq.required_coverages}` : '',
      rfq.special_conditions ? `SPECIAL CONDITIONS:\n${JSON.stringify(rfq.special_conditions)}` : '',
      rfq.exclusions ? `EXCLUSIONS REQUESTED:\n${rfq.exclusions}` : '',
      rfq.terms_and_conditions ? `TERMS & CONDITIONS:\n${rfq.terms_and_conditions}` : '',
      rfq.notes ? `NOTES:\n${rfq.notes}` : '',
    ].filter(Boolean).join('\n\n');

    if (!slipText.trim()) {
      return res.json({
        success: true,
        parsed: { coverages: [], exclusions: [], specialRequests: [], productType: rfq.product_type || 'GMC', confidence: 0, rawText: '' },
        message: 'No coverage text found in RFQ — fill existing_coverages or required_coverages fields.',
      });
    }

    const prompt = `You are iSHA-UW, an insurance underwriting AI. Parse the following RFQ slip text and extract structured coverage requirements.

RFQ CONTEXT:
- Insured: ${rfq.insured_name}
- Product Type: ${rfq.product_type || 'Not specified'}
- Policy Type: ${rfq.policy_type || 'Not specified'}
- Existing Insurer: ${rfq.existing_insurer || 'Not specified'}
- Member Count: ${rfq.member_count || 'Not specified'}

SLIP TEXT:
${slipText}

Extract and return a JSON object with exactly this structure:
{
  "productType": "GMC|GPA|GTL|OPD|TOPUP|CI|MIXED",
  "requestedProducts": ["GMC", "GPA"] or empty array,
  "coverages": [
    {
      "head": "coverage name",
      "category": "hospitalization|maternity|dental|optical|opd|accident|life|ci|wellness|other",
      "status": "requested|existing|to_be_enhanced|to_be_removed",
      "value": "coverage amount/limit if specified or null",
      "notes": "any specific condition mentioned"
    }
  ],
  "exclusions": ["exclusion 1", "exclusion 2"],
  "specialRequests": ["special request 1"],
  "sumInsuredSlabs": [{"slab": "amount", "lives": number}] or [],
  "maternity": true/false,
  "opd": true/false,
  "gpa": true/false,
  "gtl": true/false,
  "topUp": true/false,
  "criticalIllness": true/false,
  "roomRentSubLimit": "value or null",
  "confidence": 0-100,
  "extractionNotes": "any ambiguities or assumptions made"
}

Return ONLY valid JSON, no other text.`;

    const raw = await aiComplete([{ role: 'user', content: prompt }], { maxTokens: 1500, temperature: 0.1 });

    let parsed;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    } catch {
      parsed = { coverages: [], exclusions: [], specialRequests: [], productType: rfq.product_type || 'GMC', confidence: 30, extractionNotes: 'Failed to parse AI output', rawText: raw };
    }

    res.json({ success: true, parsed, rfqId, insuredName: rfq.insured_name });
  } catch (err) {
    console.error('[UW] parse-slip error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/crm/underwriting/rfqs/:rfqId/analyze ──────────────────────────
// Full underwriting pipeline:
//   1. Load RFQ + member profile + claims experience
//   2. Load product coverage matrix for requested product(s)
//   3. Map requested coverages to matrix line items → gap analysis
//   4. AI underwriting decision + narrative
//   5. Save assessment to crm_rfq_underwriting

router.post('/rfqs/:rfqId/analyze', authTeam, requirePermission('Insurance RFQ Management'), async (req, res) => {
  try {
    const { rfqId } = req.params;
    const { productCode = 'GMC', requestedCoverages = [], forcedReParse = false } = req.body;
    const userId = req.teamUser?.id || 0;

    // ── 1. Fetch RFQ ──────────────────────────────────────────────────────────
    const rfqRes = await sharedPool.query(`SELECT * FROM crm_rfqs WHERE id = $1`, [rfqId]);
    if (!rfqRes.rows.length) return res.status(404).json({ success: false, error: 'RFQ not found' });
    const rfq = rfqRes.rows[0];

    // ── 2. Member profile ─────────────────────────────────────────────────────
    const [memberSummary, ageBands, claimsSummary] = await Promise.all([
      sharedPool.query(`SELECT
        COUNT(*) AS total_lives,
        COUNT(DISTINCT emp_code) AS total_employees,
        ROUND(AVG(age)) AS avg_age,
        COUNT(*) FILTER (WHERE gender ILIKE 'F%') AS female_count,
        COUNT(*) FILTER (WHERE COALESCE(NULLIF(TRIM(relationship),''), relation_type) ILIKE '%SELF%') AS self_count,
        COALESCE(AVG(COALESCE(NULLIF(si_proposed,0), si_expiring)) FILTER (WHERE COALESCE(si_proposed,si_expiring) > 0), 0) AS avg_si,
        COALESCE(MAX(COALESCE(NULLIF(si_proposed,0), si_expiring)), 0) AS max_si
        FROM crm_rfq_members WHERE rfq_id = $1`, [rfqId]),
      sharedPool.query(`SELECT
        CASE WHEN age < 25 THEN '<25'
             WHEN age < 35 THEN '25-34'
             WHEN age < 45 THEN '35-44'
             WHEN age < 55 THEN '45-54'
             WHEN age < 65 THEN '55-64'
             ELSE '65+' END AS band,
        COUNT(*) AS cnt
        FROM crm_rfq_members WHERE rfq_id = $1 AND age IS NOT NULL GROUP BY 1 ORDER BY 1`, [rfqId]),
      sharedPool.query(`SELECT
        COUNT(*) AS total_claims,
        COALESCE(SUM(claimed_amount), 0) AS total_claimed,
        COALESCE(SUM(approved_amount), 0) AS total_approved,
        COALESCE(AVG(claimed_amount), 0) AS avg_claim
        FROM crm_rfq_claims WHERE rfq_id = $1`, [rfqId]),
    ]);

    const ms = memberSummary.rows[0];
    const cs = claimsSummary.rows[0];
    const totalLives = parseInt(ms.total_lives) || 0;
    const avgAge = parseFloat(ms.avg_age) || 35;
    const femaleCount = parseInt(ms.female_count) || 0;
    const femaleRatio = totalLives > 0 ? (femaleCount / totalLives) : 0;
    const avgSI = parseFloat(ms.avg_si) || 0;

    // Premium at risk — use actual premium_paid when available, else estimate at IRDA benchmark 1.2% of total SI
    const actualPremium = rfq.premium_paid ? parseFloat(rfq.premium_paid) : 0;
    const estimatedGWP = actualPremium > 0
      ? Math.round(actualPremium)
      : (totalLives > 0 && avgSI > 0 ? Math.round(avgSI * totalLives * 0.012) : 0);
    const gwpSource = actualPremium > 0 ? 'actual' : 'estimated';
    const totalClaimed = parseFloat(cs.total_claimed) || 0;
    const totalApproved = parseFloat(cs.total_approved) || 0;
    const lossRatio = estimatedGWP > 0 ? Math.round((totalApproved / estimatedGWP) * 100) : 0;

    // ── 3. Load product coverage matrix ──────────────────────────────────────
    const prodRes = await sharedPool.query(
      `SELECT p.*, array_agg(row_to_json(m.*)) AS matrix_rows
       FROM crm_insurance_products p
       LEFT JOIN crm_product_coverage_matrix m ON m.product_id = p.id
       WHERE p.code = $1
       GROUP BY p.id`, [productCode.toUpperCase()]
    );
    if (!prodRes.rows.length) return res.status(404).json({ success: false, error: `Product ${productCode} not found` });
    const product = prodRes.rows[0];
    const matrixRows = (product.matrix_rows || []).filter(Boolean).sort((a, b) => a.sort_order - b.sort_order);

    // ── 4. Requested coverages (from body or auto-parsed from RFQ text) ───────
    let parsedRequested = requestedCoverages;
    if (!parsedRequested.length || forcedReParse) {
      // Auto-parse from RFQ text fields
      const slipText = [rfq.existing_coverages, rfq.required_coverages, rfq.special_conditions ? JSON.stringify(rfq.special_conditions) : ''].filter(Boolean).join('\n');
      if (slipText.trim()) {
        const parsePrompt = `Extract a simple JSON array of coverage names requested in this insurance RFQ slip text. Return ONLY a JSON array like: ["Maternity Cover", "OPD", "Room Rent without sub-limit"]. If nothing specific, return [].

SLIP TEXT: ${slipText.slice(0, 2000)}`;
        const parseRaw = await aiComplete([{ role: 'user', content: parsePrompt }], { maxTokens: 400, temperature: 0.1 });
        try {
          const m = parseRaw.match(/\[[\s\S]*\]/);
          parsedRequested = JSON.parse(m ? m[0] : '[]');
        } catch { parsedRequested = []; }
      }
    }

    // ── 5. Coverage gap analysis ──────────────────────────────────────────────
    const inclusions = matrixRows.filter(r => r.status === 'included');
    const exclusions = matrixRows.filter(r => r.status === 'excluded');
    const conditional = matrixRows.filter(r => ['conditional', 'sub-limited'].includes(r.status));
    const optional = matrixRows.filter(r => r.is_optional);

    // Map requested coverages to matrix
    const gapAnalysis = parsedRequested.map(req => {
      const reqLower = req.toLowerCase();
      const exactMatch = matrixRows.find(m => m.coverage_head.toLowerCase().includes(reqLower) || reqLower.includes(m.coverage_head.toLowerCase().substring(0, 15)));
      if (exactMatch) {
        return {
          requested: req,
          matrixItem: exactMatch.coverage_head,
          status: exactMatch.status,
          isOptional: exactMatch.is_optional,
          isStandardExcl: exactMatch.is_standard_excl,
          limitValue: exactMatch.limit_value,
          waitingPeriod: exactMatch.waiting_period,
          gap: exactMatch.status === 'excluded' ? 'NOT_COVERABLE'
             : exactMatch.status === 'included' ? 'STANDARD_MATCH'
             : exactMatch.is_optional ? 'OPTIONAL_ADDON'
             : 'CONDITIONAL',
          recommendation: exactMatch.status === 'excluded'
            ? `This is a standard exclusion under ${productCode}. Cannot be included.`
            : exactMatch.is_optional
            ? `Available as optional add-on. Additional premium applies.`
            : `Standard coverage with conditions: ${exactMatch.description?.slice(0, 100) || ''}`,
        };
      }
      return {
        requested: req,
        matrixItem: null,
        status: 'unknown',
        gap: 'NON_STANDARD',
        recommendation: `Not found in standard ${productCode} matrix. Requires special underwriting and additional loading (10%–20%).`,
      };
    });

    // ── 6. Risk flags ─────────────────────────────────────────────────────────
    const riskFlags = [];
    if (avgAge > 55) riskFlags.push({ flag: 'HIGH_AVG_AGE', severity: 'HIGH', detail: `Avg age ${avgAge}. Loading: 25%–40%` });
    else if (avgAge > 45) riskFlags.push({ flag: 'ELEVATED_AVG_AGE', severity: 'MEDIUM', detail: `Avg age ${avgAge}. Loading: 15%–25%` });
    if (lossRatio > 120) riskFlags.push({ flag: 'ADVERSE_LOSS_RATIO', severity: 'HIGH', detail: `LR ${lossRatio}%. Refer to Chief Underwriter` });
    else if (lossRatio > 80) riskFlags.push({ flag: 'ELEVATED_LOSS_RATIO', severity: 'MEDIUM', detail: `LR ${lossRatio}%. Loading required` });
    if (femaleRatio > 0.6) riskFlags.push({ flag: 'HIGH_FEMALE_RATIO', severity: 'MEDIUM', detail: `${(femaleRatio * 100).toFixed(0)}% female membership. Elevated maternity risk if maternity covered.` });
    if (avgSI > 1500000) riskFlags.push({ flag: 'HIGH_SUM_INSURED', severity: 'MEDIUM', detail: `Avg SI ₹${(avgSI / 100000).toFixed(1)}L. NWS review recommended.` });
    if (totalLives > 5000) riskFlags.push({ flag: 'LARGE_GROUP', severity: 'LOW', detail: `${totalLives.toLocaleString()} lives. Consider volume discount 5%–10%.` });

    // Non-coverable requested items
    const nonCoverable = gapAnalysis.filter(g => g.gap === 'NOT_COVERABLE');
    if (nonCoverable.length > 0) riskFlags.push({ flag: 'EXCLUDED_COVERAGE_REQUESTED', severity: 'MEDIUM', detail: `${nonCoverable.length} requested coverages are standard exclusions.` });

    // ── 7. Base loading calculation ───────────────────────────────────────────
    let loadingPct = 0;
    if (avgAge > 55) loadingPct += 30;
    else if (avgAge > 45) loadingPct += 18;
    if (lossRatio > 120) loadingPct += 25;
    else if (lossRatio > 80) loadingPct += 12;
    if (femaleRatio > 0.6) loadingPct += 8;

    // Optional covers requested
    const optionalRequested = gapAnalysis.filter(g => g.gap === 'OPTIONAL_ADDON').length;
    loadingPct += optionalRequested * 5;

    const nonStandard = gapAnalysis.filter(g => g.gap === 'NON_STANDARD').length;
    loadingPct += nonStandard * 12;

    // Discount for large group
    if (totalLives > 5000) loadingPct = Math.max(0, loadingPct - 8);
    else if (totalLives > 1000) loadingPct = Math.max(0, loadingPct - 4);

    // ── 8. Underwriting decision ──────────────────────────────────────────────
    let decision;
    let uwStatus;
    if (lossRatio > 150 || riskFlags.filter(f => f.severity === 'HIGH').length >= 3) {
      decision = 'Decline';
      uwStatus = 'declined';
    } else if (lossRatio > 100 || avgAge > 58 || nonStandard > 3) {
      decision = 'Refer to Chief Underwriter';
      uwStatus = 'referred';
    } else if (loadingPct > 0 || riskFlags.filter(f => f.severity !== 'LOW').length > 0) {
      decision = `Acceptable with ${loadingPct}% Loading`;
      uwStatus = 'accepted_with_loading';
    } else {
      decision = 'Acceptable (Standard Terms)';
      uwStatus = 'accepted';
    }

    // Risk score (0–100, where 100 = highest risk)
    const riskScore = Math.min(100, Math.round(
      (avgAge > 35 ? (avgAge - 35) * 1.2 : 0) +
      (lossRatio > 0 ? lossRatio * 0.3 : 10) +
      (femaleRatio * 20) +
      (nonStandard * 5) +
      (riskFlags.filter(f => f.severity === 'HIGH').length * 15)
    ));

    // ── 9. AI narrative ───────────────────────────────────────────────────────
    const narrativePrompt = `${ISHA_UNDERWRITING_SYSTEM}

Generate a professional underwriting assessment narrative for this RFQ.

RFQ SUMMARY:
- Insured: ${rfq.insured_name}
- Industry: ${rfq.industry || 'Not specified'}
- Product: ${product.name}
- Policy Period: ${rfq.policy_start || 'TBD'} to ${rfq.policy_end || 'TBD'}
- Total Lives: ${totalLives.toLocaleString()} (${ms.total_employees} employees)
- Average Age: ${avgAge} years
- Age Bands: ${ageBands.rows.map(r => `${r.band}: ${r.cnt}`).join(', ')}
- Female Ratio: ${(femaleRatio * 100).toFixed(0)}%
- Average SI: ₹${(avgSI / 100000).toFixed(1)}L
- GWP (${gwpSource}): ₹${(estimatedGWP / 100000).toFixed(1)}L
- Claims History: ${cs.total_claims || 0} claims, ₹${(totalApproved / 100000).toFixed(1)}L approved
- Loss Ratio: ${lossRatio}% (based on ${gwpSource} premium)
- Requested Coverages: ${parsedRequested.join(', ') || 'Standard GMC'}
- Coverage Gaps Found: ${gapAnalysis.filter(g => g.gap !== 'STANDARD_MATCH').length}
- Risk Flags: ${riskFlags.map(f => f.flag).join(', ') || 'None'}
- Recommended Loading: ${loadingPct}%
- Decision: ${decision}

Write a structured underwriting narrative (4–6 paragraphs) covering:
1. Risk profile summary
2. Coverage gap analysis findings
3. Key risk factors and loading rationale
4. Underwriting conditions to be attached
5. Final recommendation

Be precise, professional, and cite specific IRDAI regulations where relevant.`;

    const aiNarrative = await aiComplete(
      [{ role: 'system', content: ISHA_UNDERWRITING_SYSTEM }, { role: 'user', content: narrativePrompt }],
      { maxTokens: 1500, temperature: 0.3 }
    );

    // ── 10. Underwriting conditions ───────────────────────────────────────────
    const conditions = [];
    if (lossRatio > 80) conditions.push(`Adverse claims experience (LR ${lossRatio}%). Loading of ${Math.min(25, Math.round(lossRatio * 0.15))}% on base premium.`);
    if (avgAge > 45) conditions.push(`Elevated average age (${avgAge} yrs). Age loading of ${avgAge > 55 ? '30' : '18'}% applied.`);
    if (femaleRatio > 0.6 && parsedRequested.some(r => r.toLowerCase().includes('matern'))) conditions.push(`High female ratio (${(femaleRatio * 100).toFixed(0)}%) with maternity cover. Maternity loading of 12% applied. Waiting period: 9 months.`);
    if (nonCoverable.length > 0) conditions.push(`Standard exclusions retained: ${nonCoverable.map(g => g.requested).join(', ')}.`);
    if (nonStandard > 0) conditions.push(`Non-standard coverage requests subject to individual underwriting and medical officer approval.`);
    conditions.push(`All pre-existing diseases subject to 4-year waiting period per IRDAI Health Regulations 2016.`);
    conditions.push(`Specific illness waiting period: 24 months. General waiting period: 30 days (accidents exempt).`);
    if (avgSI > 1500000) conditions.push(`Sum Insured > ₹15L: Requires medical records for members above 45 years.`);

    // ── 11. Save to DB ────────────────────────────────────────────────────────
    await sharedPool.query(
      `INSERT INTO crm_rfq_underwriting
        (rfq_id, product_id, product_code, uw_status, risk_score, loading_pct, decision,
         ai_narrative, slip_parsed, requested_coverages, coverage_gap, conditions,
         exclusions_applied, risk_flags, created_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
       ON CONFLICT (rfq_id, product_code) DO UPDATE SET
        uw_status=$4, risk_score=$5, loading_pct=$6, decision=$7,
        ai_narrative=$8, slip_parsed=$9, requested_coverages=$10, coverage_gap=$11,
        conditions=$12, exclusions_applied=$13, risk_flags=$14, updated_at=NOW()`,
      [
        rfqId, product.id, productCode.toUpperCase(), uwStatus, riskScore, loadingPct, decision,
        aiNarrative,
        JSON.stringify({ requestedFromSlip: parsedRequested }),
        JSON.stringify(parsedRequested),
        JSON.stringify(gapAnalysis),
        JSON.stringify(conditions),
        JSON.stringify(exclusions.map(e => ({ head: e.coverage_head, reason: e.description }))),
        JSON.stringify(riskFlags),
        userId,
      ]
    );

    res.json({
      success: true,
      underwriting: {
        rfqId, insuredName: rfq.insured_name, productCode, productName: product.name,
        decision, uwStatus, riskScore, loadingPct,
        memberProfile: { totalLives, avgAge, femaleRatio: (femaleRatio * 100).toFixed(0) + '%', avgSI, estimatedGWP, gwpSource },
        claimsProfile: { totalClaims: parseInt(cs.total_claims) || 0, totalApproved, lossRatio },
        coverageMatrix: { inclusions, exclusions, conditional, optional },
        requestedCoverages: parsedRequested,
        gapAnalysis,
        riskFlags,
        conditions,
        aiNarrative,
        ageBands: ageBands.rows,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[UW] analyze error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/crm/underwriting/rfqs/:rfqId/ai-chat ──────────────────────────
// iSHA-UW conversational AI — loads full analytics so responses are specific.

router.post('/rfqs/:rfqId/ai-chat', authTeam, requirePermission('Insurance RFQ Management'), async (req, res) => {
  try {
    const { rfqId } = req.params;
    const { message, history = [], productCode = 'GMC' } = req.body;
    if (!message?.trim()) return res.status(400).json({ success: false, error: 'message required' });

    // Load full RFQ + live analytics + uploaded files in parallel
    const [rfqRes, uwRes, memberRes, claimsRes, ageBandRes, topClaimsRes, filesRes] = await Promise.all([
      sharedPool.query(`SELECT * FROM crm_rfqs WHERE id = $1`, [rfqId]),
      sharedPool.query(`SELECT * FROM crm_rfq_underwriting WHERE rfq_id = $1 AND product_code = $2 ORDER BY updated_at DESC LIMIT 1`, [rfqId, productCode.toUpperCase()]),
      sharedPool.query(`SELECT
        COUNT(*) AS total_lives,
        COUNT(DISTINCT emp_code) AS employees,
        ROUND(AVG(age)) AS avg_age,
        COUNT(*) FILTER (WHERE gender ILIKE 'F%') AS female_count,
        COUNT(*) FILTER (WHERE COALESCE(NULLIF(TRIM(relationship),''), relation_type) ILIKE '%SELF%') AS self_count,
        COALESCE(AVG(COALESCE(NULLIF(si_proposed,0), si_expiring)) FILTER (WHERE COALESCE(si_proposed,si_expiring) > 0), 0) AS avg_si
        FROM crm_rfq_members WHERE rfq_id = $1`, [rfqId]),
      sharedPool.query(`SELECT
        COUNT(*) AS total_claims,
        COALESCE(SUM(claimed_amount), 0) AS total_claimed,
        COALESCE(SUM(approved_amount), 0) AS total_approved,
        COALESCE(AVG(approved_amount) FILTER (WHERE approved_amount > 0), 0) AS avg_approved,
        COALESCE(MAX(approved_amount), 0) AS max_claim
        FROM crm_rfq_claims WHERE rfq_id = $1`, [rfqId]),
      sharedPool.query(`SELECT
        CASE WHEN age < 25 THEN 'Under 25'
             WHEN age < 35 THEN '25–34'
             WHEN age < 45 THEN '35–44'
             WHEN age < 55 THEN '45–54'
             WHEN age < 65 THEN '55–64'
             ELSE '65+' END AS band,
        COUNT(*) AS cnt
        FROM crm_rfq_members WHERE rfq_id = $1 AND age IS NOT NULL GROUP BY 1 ORDER BY 1`, [rfqId]),
      sharedPool.query(`SELECT diagnosis, COALESCE(SUM(approved_amount),0) AS paid
        FROM crm_rfq_claims WHERE rfq_id = $1 AND diagnosis IS NOT NULL
        GROUP BY diagnosis ORDER BY paid DESC LIMIT 8`, [rfqId]),
      sharedPool.query(`SELECT id, category, original_name, s3_key, mime_type, extracted_text, uploaded_at
        FROM crm_rfq_files WHERE rfq_id = $1
        AND category NOT IN ('members')
        ORDER BY uploaded_at ASC`, [rfqId]),
    ]);

    const rfq = rfqRes.rows[0] || {};
    const uw = uwRes.rows[0] || null;
    const ms = memberRes.rows[0] || {};
    const cs = claimsRes.rows[0] || {};

    const totalLives = parseInt(ms.total_lives) || 0;
    const employees = parseInt(ms.employees) || 0;
    const avgAge = parseFloat(ms.avg_age) || 0;
    const femaleCount = parseInt(ms.female_count) || 0;
    const femaleRatio = totalLives > 0 ? ((femaleCount / totalLives) * 100).toFixed(0) : 0;
    const avgSI = parseFloat(ms.avg_si) || 0;
    const dependents = totalLives - (parseInt(ms.self_count) || employees);
    const depRatio = employees > 0 ? (dependents / employees).toFixed(1) : 'N/A';

    const actualPremium = rfq.premium_paid ? parseFloat(rfq.premium_paid) : 0;
    const estimatedGWP = actualPremium > 0
      ? actualPremium
      : (totalLives > 0 && avgSI > 0 ? avgSI * totalLives * 0.012 : 0);
    const totalApproved = parseFloat(cs.total_approved) || 0;
    const lossRatio = estimatedGWP > 0 ? Math.round((totalApproved / estimatedGWP) * 100) : 0;
    const avgClaim = parseFloat(cs.avg_approved) || 0;
    const maxClaim = parseFloat(cs.max_claim) || 0;
    const claimFreq = totalLives > 0 ? ((parseInt(cs.total_claims) / totalLives) * 100).toFixed(1) : 0;

    const fmtL = n => n >= 10000000 ? `₹${(n/10000000).toFixed(2)}Cr` : n >= 100000 ? `₹${(n/100000).toFixed(1)}L` : `₹${Math.round(n).toLocaleString('en-IN')}`;

    const ageBandText = ageBandRes.rows.map(r => `${r.band}: ${r.cnt} lives`).join(', ');
    const topDxText = topClaimsRes.rows.length
      ? topClaimsRes.rows.map(r => `${r.diagnosis || 'Unspecified'} (${fmtL(r.paid)})`).join(', ')
      : 'No diagnosis data available';

    // ── Extract text from uploaded documents (parallel, with DB caching) ───────
    const docFiles = filesRes.rows || [];
    const docTexts = await Promise.all(
      docFiles.map(async f => {
        const text = await extractAndCacheFileText(f);
        return text ? { name: f.original_name, category: f.category, text } : null;
      })
    );
    const validDocs = docTexts.filter(Boolean);

    // Build document context block
    let documentContext = '';
    if (validDocs.length > 0) {
      documentContext = `\n────────────────────────────────────────────────
UPLOADED DOCUMENTS FOR THIS RFQ (${validDocs.length} files)
────────────────────────────────────────────────`;
      for (const doc of validDocs) {
        documentContext += `\n\n[${doc.category.toUpperCase()}] ${doc.name}:\n${doc.text.slice(0, 3000)}`;
      }
    }

    // ── RFQ text fields (broking slip notes, conditions etc.) ────────────────
    const rfqTextFields = [
      rfq.existing_coverages ? `EXISTING COVERAGES:\n${rfq.existing_coverages}` : '',
      rfq.required_coverages ? `REQUIRED/REQUESTED COVERAGES:\n${rfq.required_coverages}` : '',
      rfq.special_conditions ? `SPECIAL CONDITIONS:\n${typeof rfq.special_conditions === 'string' ? rfq.special_conditions : JSON.stringify(rfq.special_conditions, null, 2)}` : '',
      rfq.exclusions ? `EXCLUSIONS REQUESTED:\n${rfq.exclusions}` : '',
      rfq.terms_and_conditions ? `TERMS & CONDITIONS:\n${rfq.terms_and_conditions}` : '',
      rfq.notes ? `NOTES:\n${rfq.notes}` : '',
    ].filter(Boolean).join('\n\n');

    const rfqTextContext = rfqTextFields ? `\n────────────────────────────────────────────────
RFQ SLIP / COVERAGE NOTES
────────────────────────────────────────────────\n${rfqTextFields.slice(0, 4000)}` : '';

    // ── Parsed slip from underwriting run ────────────────────────────────────
    let parsedSlipContext = '';
    if (uw?.slip_parsed) {
      try {
        const slip = typeof uw.slip_parsed === 'string' ? JSON.parse(uw.slip_parsed) : uw.slip_parsed;
        const req = slip.requestedFromSlip || [];
        if (req.length) parsedSlipContext = `\nParsed coverage requests from slip: ${req.join(', ')}`;
      } catch { /* ignore */ }
    }

    // Underwriting assessment context (if run)
    const uwContext = uw ? `
UNDERWRITING ASSESSMENT (already run):
- Decision: ${uw.decision}
- Risk Score: ${uw.risk_score}/100
- Loading: ${uw.loading_pct}%
- Conditions: ${(() => { try { return (Array.isArray(uw.conditions) ? uw.conditions : JSON.parse(uw.conditions || '[]')).join('; '); } catch { return 'N/A'; } })()}
- Risk Flags: ${(() => { try { return (Array.isArray(uw.risk_flags) ? uw.risk_flags : JSON.parse(uw.risk_flags || '[]')).map(f => `${f.flag} (${f.severity})`).join(', ') || 'None'; } catch { return 'N/A'; } })()}` : `
UNDERWRITING ASSESSMENT: Not yet run for ${productCode}.`;

    const conversationSystem = `${ISHA_UNDERWRITING_SYSTEM}

────────────────────────────────────────────────
THIS RFQ — LIVE DATA YOU MUST USE IN YOUR ANSWERS
────────────────────────────────────────────────
INSURED: ${rfq.insured_name || 'Unknown'}
PRODUCT: ${productCode} (${rfq.product_type || productCode})
INDUSTRY: ${rfq.industry || 'Not specified'}
POLICY: ${rfq.policy_start ? rfq.policy_start.toString().slice(0,10) : 'TBD'} → ${rfq.policy_end ? rfq.policy_end.toString().slice(0,10) : 'TBD'}
EXISTING INSURER: ${rfq.existing_insurer || 'Not specified'}
EXISTING TPA: ${rfq.existing_tpa || 'Not specified'}

MEMBER PROFILE:
- Total Lives: ${totalLives.toLocaleString()} (${employees.toLocaleString()} employees + ${dependents.toLocaleString()} dependents, dependent ratio ${depRatio}:1)
- Average Age: ${avgAge || 'N/A'} years
- Age Bands: ${ageBandText || 'No data'}
- Female Ratio: ${femaleRatio}% (${femaleCount.toLocaleString()} female members)
- Average Sum Insured: ${avgSI > 0 ? fmtL(avgSI) : 'Not available'}
- Premium (${actualPremium > 0 ? 'actual' : 'estimated'}): ${estimatedGWP > 0 ? fmtL(estimatedGWP) : 'Not available'}

CLAIMS EXPERIENCE:
- Total Claims: ${parseInt(cs.total_claims || 0).toLocaleString()}
- Total Approved: ${fmtL(totalApproved)}
- Loss Ratio: ${lossRatio}%
- Avg Claim Size: ${avgClaim > 0 ? fmtL(avgClaim) : 'N/A'}
- Largest Claim: ${maxClaim > 0 ? fmtL(maxClaim) : 'N/A'}
- Claim Frequency: ${claimFreq}% (claims per 100 lives)
- Top Diagnoses by Cost: ${topDxText}
${parsedSlipContext}
${uwContext}
${rfqTextContext}
${documentContext}

────────────────────────────────────────────────
HOW TO RESPOND IN THIS CHAT
────────────────────────────────────────────────
You are a senior underwriter in a conversation with a colleague. You have the live data AND the uploaded documents above — use them.

Rules:
1. NEVER give generic bullet-point templates or assumptions — you have real data and real documents, use them.
2. When answering from a document, cite it: "from the broking slip..." or "per the uploaded PDF...".
3. Answer the specific question asked — be concise. One focused answer, not a lecture.
4. Reference actual numbers directly: "the LR is ${lossRatio}%", "${totalLives.toLocaleString()} lives", "avg age ${avgAge}".
5. If you spot something notable in the data or documents, mention it naturally — like in a meeting.
6. Ask a follow-up if you need clarification rather than guessing.
7. If a document is missing or data is unavailable, say so briefly and say what would help.
8. Keep your tone direct, informed, professional — like a CUW in a quick review call.
9. ${validDocs.length > 0 ? `You have ${validDocs.length} uploaded document(s): ${validDocs.map(d => d.name).join(', ')}. Use their content to answer questions about coverage, conditions, and terms.` : 'No documents have been uploaded yet for this RFQ. Suggest uploading the broking slip or claims statement for richer analysis.'}`;

    // Enrich with SIB RAG: live web search + knowledge base (runs in parallel, 5s timeout)
    const ragContext = await sibRagContext(message);

    const messages = [
      { role: 'system', content: conversationSystem + ragContext },
      ...history.slice(-8).map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message },
    ];

    const reply = await aiComplete(messages, { maxTokens: 800, temperature: 0.5, uwMode: true });
    res.json({ success: true, reply, assistant: 'iSHA-UW', timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[UW] ai-chat error:', err.message);
    res.status(500).json({ success: false, error: 'iSHA-UW is temporarily unavailable.' });
  }
});

// ─── POST /api/crm/underwriting/rfqs/:rfqId/generate-terms ──────────────────
// Generate formal underwriting terms letter for a completed assessment.

router.post('/rfqs/:rfqId/generate-terms', authTeam, requirePermission('Insurance RFQ Management'), async (req, res) => {
  try {
    const { rfqId } = req.params;
    const { productCode = 'GMC' } = req.body;

    const [rfqRes, uwRes] = await Promise.all([
      sharedPool.query(`SELECT * FROM crm_rfqs WHERE id = $1`, [rfqId]),
      sharedPool.query(`SELECT * FROM crm_rfq_underwriting WHERE rfq_id = $1 AND product_code = $2 ORDER BY updated_at DESC LIMIT 1`, [rfqId, productCode.toUpperCase()]),
    ]);

    if (!rfqRes.rows.length) return res.status(404).json({ success: false, error: 'RFQ not found' });
    if (!uwRes.rows.length) return res.status(404).json({ success: false, error: 'Run underwriting analysis first' });

    const rfq = rfqRes.rows[0];
    const uw = uwRes.rows[0];
    const conditions = Array.isArray(uw.conditions) ? uw.conditions : JSON.parse(uw.conditions || '[]');
    const exclusions = Array.isArray(uw.exclusions_applied) ? uw.exclusions_applied : JSON.parse(uw.exclusions_applied || '[]');

    const prompt = `Generate a formal insurance underwriting terms letter for the following group health policy.

DETAILS:
- Insured: ${rfq.insured_name}
- Product: ${productCode} (${productCode === 'GMC' ? 'Group Mediclaim' : productCode})
- Policy Period: ${rfq.policy_start ? new Date(rfq.policy_start).toISOString().slice(0, 10) : 'TBD'} to ${rfq.policy_end ? new Date(rfq.policy_end).toISOString().slice(0, 10) : 'TBD'}
- Underwriting Decision: ${uw.decision}
- Risk Score: ${uw.risk_score}/100
- Loading: ${uw.loading_pct}%
- Conditions: ${conditions.join('; ')}
- Key Exclusions: ${exclusions.slice(0, 5).map(e => e.head).join(', ')}

Generate a professional underwriting terms letter including:
1. Header / Reference number
2. Coverage being offered
3. Premium loading rationale
4. Specific conditions of acceptance
5. Standard and specific exclusions
6. Validity of this offer (30 days)
7. Next steps / acceptance procedure

Format as a formal business letter. Use clear, legally appropriate language.`;

    const termsLetter = await aiComplete([{ role: 'user', content: prompt }], { maxTokens: 1400, temperature: 0.2 });

    res.json({ success: true, termsLetter, decision: uw.decision, loadingPct: uw.loading_pct, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[UW] generate-terms error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Bootstrap tables on first load ──────────────────────────────────────────

ensureTables().catch(err => console.error('[UW] table bootstrap error:', err.message));

export default router;
