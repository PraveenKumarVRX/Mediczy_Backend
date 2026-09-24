import express from 'express';
import jwt from 'jsonwebtoken';
import { loginConsent } from '../../controllers/dept/consent.controller.js';
import { JWT_CONFIG } from '../../config/auth.config.js';
import llmProvider from '../../services/ai-brain/llm-provider.js';
import { connectPostgres } from '../../db/postgres.js';

const router = express.Router();

// ─── Auth middleware ───────────────────────────────────────────────────────────

const authConsent = (req, res, next) => {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  if (!token) return res.status(401).json({ success: false, error: 'Consent token required' });
  try {
    req.consentUser = jwt.verify(token, JWT_CONFIG.SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
};

// ─── Login ────────────────────────────────────────────────────────────────────

router.post('/login', (req, res, next) => { req.skipAuth = true; next(); }, loginConsent);

// ─── Dashboard statistics (WP-0.3d) ───────────────────────────────────────────
// Real aggregates over the live `consents` table (the only clinical consent
// store wired in this repo: consent.model.js / consent-management.route.js).
// No fabricated fallbacks: the client shows an honest empty state until rows
// exist. Schema-defensive: probes information_schema first so the endpoint
// answers 200 with real aggregates regardless of which consents-table variant
// (clinical vs legacy) is actually deployed.

router.get('/stats', authConsent, async (req, res) => {
  try {
    const db = await connectPostgres();
    const { rows: tableRows } = await db.query(`SELECT to_regclass('public.consents') AS reg`);
    if (!tableRows[0]?.reg) {
      return res.json({
        success: true,
        data: {
          totals: { total: 0, pending: 0, signed: 0, revoked: 0, expiringSoon: 0, refused: 0 },
          byStatus: [], byType: [], trend: [], recent: [], expiring: [],
          generatedAt: new Date().toISOString(),
        },
      });
    }
    const { rows: colRows } = await db.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'consents'`
    );
    const cols = new Set(colRows.map((r) => r.column_name));
    const has = (...names) => names.find((n) => cols.has(n)) || null;
    const createdCol = has('createdAt', 'created_at') || 'id';
    const updatedCol = has('updatedAt', 'updated_at', 'createdAt', 'created_at') || 'id';
    const statusCol = has('status', 'isGranted');
    const expiresCol = has('expirationDate', 'expiresAt', 'expires_at', 'expiration_date');
    const typeCol = has('consentType', 'consent_type');
    const procCol = has('procedureName', 'procedure_name', 'purpose');
    const patientCol = has('patientId', 'patient_id', 'userId');

    const run = async (sql, params = []) => (await db.query(sql, params)).rows;
    const statusExpr = !statusCol
      ? `'unknown'`
      : statusCol === 'status'
        ? `COALESCE(NULLIF(LOWER(status::text), ''), 'pending')`
        : `CASE WHEN "isGranted" IS TRUE AND "revokedAt" IS NULL THEN 'signed'
                WHEN "isGranted" IS TRUE AND "revokedAt" IS NOT NULL THEN 'revoked'
                ELSE 'pending' END`;

    const totals = await run(`
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE ${statusExpr} = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE ${statusExpr} IN ('signed','granted','completed','obtained'))::int AS signed,
        COUNT(*) FILTER (WHERE ${statusExpr} IN ('revoked','refused','declined','rejected','cancelled'))::int AS revoked
      FROM consents`);
    let expiringSoon = 0;
    if (expiresCol) {
      const r = await run(
        `SELECT COUNT(*)::int AS n FROM consents
         WHERE "${expiresCol}" IS NOT NULL AND "${expiresCol}" > NOW()
           AND "${expiresCol}" <= NOW() + INTERVAL '48 hours'`
      );
      expiringSoon = r[0]?.n ?? 0;
    }
    const byStatus = await run(
      `SELECT ${statusExpr} AS status, COUNT(*)::int AS count FROM consents GROUP BY 1 ORDER BY 2 DESC`
    );
    const byType = typeCol
      ? await run(
          `SELECT COALESCE(NULLIF("${typeCol}"::text, ''), 'Unspecified') AS type, COUNT(*)::int AS count
           FROM consents GROUP BY 1 ORDER BY 2 DESC LIMIT 8`
        )
      : [];
    const trend = createdCol === 'id' ? [] : await run(
      `SELECT to_char(date_trunc('day', "${createdCol}"), 'DD Mon') AS date,
              COUNT(*)::int AS obtained,
              COUNT(*) FILTER (WHERE ${statusExpr} = 'pending')::int AS pending,
              COUNT(*) FILTER (WHERE ${statusExpr} IN ('revoked','refused','declined','rejected','cancelled'))::int AS refused
       FROM consents
       WHERE "${createdCol}" >= date_trunc('day', NOW()) - INTERVAL '6 days'
       GROUP BY 1, date_trunc('day', "${createdCol}")
       ORDER BY date_trunc('day', "${createdCol}")`
    );
    const selectList = [
      `id`,
      typeCol ? `"${typeCol}" AS "consentType"` : `NULL AS "consentType"`,
      procCol ? `"${procCol}" AS "procedureName"` : `NULL AS "procedureName"`,
      patientCol ? `"${patientCol}" AS "patientId"` : `NULL AS "patientId"`,
      statusCol === 'status' ? `status::text AS status`
        : statusCol === 'isGranted' ? `(${statusExpr}) AS status`
        : `NULL AS status`,
      expiresCol ? `"${expiresCol}" AS "expirationDate"` : `NULL AS "expirationDate"`,
      `"${createdCol}" AS "createdAt"`,
      `"${updatedCol}" AS "updatedAt"`,
    ].join(', ');
    const recent = await run(`SELECT ${selectList} FROM consents ORDER BY "${updatedCol}" DESC NULLS LAST LIMIT 8`);
    const expiring = expiresCol
      ? await run(
          `SELECT ${selectList} FROM consents
           WHERE "${expiresCol}" IS NOT NULL AND "${expiresCol}" > NOW()
           ORDER BY "${expiresCol}" ASC LIMIT 6`
        )
      : [];

    res.json({
      success: true,
      data: {
        totals: { ...(totals[0] || { total: 0, pending: 0, signed: 0, revoked: 0 }), expiringSoon, refused: 0 },
        byStatus, byType, trend, recent, expiring,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[Consent] stats failed:', err.message);
    res.status(500).json({ success: false, message: 'Failed to load consent statistics' });
  }
});

// ─── Helper ───────────────────────────────────────────────────────────────────

const aiComplete = async (messages, { maxTokens = 900, temperature = 0.35 } = {}) => {
  const result = await llmProvider.chat({ messages, maxTokens, temperature });
  return result?.content || result?.text || result?.message || String(result || '');
};

// ─── POST /api/consent/ai/chat ────────────────────────────────────────────────
// CLIA — Consent & Legal Intelligence Assistant chat for consent staff.

router.post('/ai/chat', authConsent, async (req, res) => {
  try {
    const { message, context = '', history = [] } = req.body;
    if (!message?.trim()) return res.status(400).json({ success: false, error: 'message is required' });

    const system = `You are CLIA (Consent & Legal Intelligence Assistant), a world-class AI embedded in a hospital consent management department. You are an expert in:
- Patient consent law and ethics (Indian healthcare regulations)
- Informed consent principles and documentation standards
- NABH consent management standards (MOM chapter)
- Pre-operative consent for surgical procedures
- Consent for anaesthesia, blood transfusion, HIV testing, and high-risk procedures
- Withdrawal of consent and capacity assessment
- Consent for minors, mentally incapacitated patients, and emergency situations
- Digital consent workflows and audit trail management
- Legal documentation requirements for valid consent
- Patient rights under the Indian Medical Council Act and Consumer Protection Act

Be precise, legally accurate, and practical. Always flag high-risk or legally complex consent scenarios for escalation to the medical-legal officer. Context: ${context || 'Consent management department query.'}`;

    const messages = [
      { role: 'system', content: system },
      ...history.slice(-6).map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message },
    ];

    const reply = await aiComplete(messages, { maxTokens: 1000, temperature: 0.4 });

    res.json({ success: true, reply, assistant: 'CLIA', timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[Consent AI] chat error:', err.message);
    res.status(500).json({ success: false, error: 'CLIA is temporarily unavailable.' });
  }
});

// ─── POST /api/consent/ai/draft-consent ───────────────────────────────────────
// Generate a NABH-compliant informed consent draft for a given procedure.

router.post('/ai/draft-consent', authConsent, async (req, res) => {
  try {
    const {
      procedureName, patientName = 'Patient', doctorName, department,
      risks = [], alternatives = [], language = 'English',
    } = req.body;

    if (!procedureName) return res.status(400).json({ success: false, error: 'procedureName is required' });

    const prompt = `You are CLIA, a medical-legal AI. Generate a NABH-compliant informed consent document for the following procedure.

PROCEDURE DETAILS:
- Procedure: ${procedureName}
- Performing Doctor: ${doctorName || 'Treating Physician'}
- Department: ${department || 'Not specified'}
- Patient Name: ${patientName}
- Language: ${language}
- Specific Risks (if provided): ${risks.length ? risks.join(', ') : 'Standard procedural risks'}
- Alternatives Discussed: ${alternatives.length ? alternatives.join(', ') : 'Standard alternatives'}

Generate a structured informed consent document containing:

1. PROCEDURE DESCRIPTION: Plain-language explanation of what will be performed
2. PURPOSE & BENEFITS: Why this procedure is recommended and expected benefits
3. MATERIAL RISKS: Specific and general risks the patient must be informed of (percentage estimates where standard)
4. RARE BUT SERIOUS RISKS: Low-probability high-severity risks
5. ALTERNATIVES: Alternative treatments the patient may choose
6. CONSEQUENCES OF NOT PROCEEDING: What happens if consent is refused
7. ANAESTHESIA NOTE: Brief anaesthesia consent mention if applicable
8. CONSENT DECLARATION: Standard patient declaration paragraph (suitable for signature)
9. WITNESS REQUIREMENTS: Who must witness this consent
10. VALIDITY PERIOD: How long this consent remains valid

Write in clear, patient-friendly language. Flag any legally high-risk elements with [LEGAL REVIEW RECOMMENDED].`;

    const draft = await aiComplete([{ role: 'user', content: prompt }], { maxTokens: 1600, temperature: 0.25 });

    const parseSection = (text, header) => {
      const regex = new RegExp(`${header}[:\\s]*([\\s\\S]*?)(?=\\n[0-9]+\\.|\\n[A-Z &]{3,}:|$)`, 'i');
      const m = text.match(regex);
      return m ? m[1].trim() : '';
    };

    res.json({
      success: true,
      consent: {
        procedureName,
        patientName,
        doctorName,
        language,
        description:        parseSection(draft, 'PROCEDURE DESCRIPTION'),
        purpose:            parseSection(draft, 'PURPOSE & BENEFITS'),
        materialRisks:      parseSection(draft, 'MATERIAL RISKS'),
        seriousRisks:       parseSection(draft, 'RARE BUT SERIOUS RISKS'),
        alternatives:       parseSection(draft, 'ALTERNATIVES'),
        refusalConsequences:parseSection(draft, 'CONSEQUENCES OF NOT PROCEEDING'),
        anaesthesiaNote:    parseSection(draft, 'ANAESTHESIA NOTE'),
        declaration:        parseSection(draft, 'CONSENT DECLARATION'),
        witnessRequirements:parseSection(draft, 'WITNESS REQUIREMENTS'),
        validityPeriod:     parseSection(draft, 'VALIDITY PERIOD'),
        raw: draft,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[Consent AI] draft-consent error:', err.message);
    res.status(500).json({ success: false, error: 'Consent draft generation failed.' });
  }
});

// ─── POST /api/consent/ai/compliance-check ────────────────────────────────────
// Check consent documentation against NABH / legal requirements.

router.post('/ai/compliance-check', authConsent, async (req, res) => {
  try {
    const {
      consentType, procedureName, signatories = [], witnessPresent,
      dateObtained, timeBeforeProcedure, consentLanguage,
      patientCapacityAssessed, alternativesDiscussed, risksExplained,
    } = req.body;

    if (!procedureName) return res.status(400).json({ success: false, error: 'procedureName is required' });

    const prompt = `You are CLIA, a consent compliance AI. Evaluate whether this consent documentation meets NABH and Indian legal standards.

CONSENT DETAILS:
- Procedure: ${procedureName}
- Consent Type: ${consentType || 'Informed Consent'}
- Signatories: ${signatories.length ? signatories.join(', ') : 'Not specified'}
- Witness Present: ${witnessPresent ? 'Yes' : 'No'}
- Date Obtained: ${dateObtained || 'Not recorded'}
- Time Before Procedure: ${timeBeforeProcedure || 'Not recorded'}
- Language of Consent: ${consentLanguage || 'Not specified'}
- Patient Capacity Assessed: ${patientCapacityAssessed ? 'Yes' : 'No/Not documented'}
- Alternatives Discussed: ${alternativesDiscussed ? 'Yes' : 'No/Not documented'}
- Risks Explained: ${risksExplained ? 'Yes' : 'No/Not documented'}

Evaluate against:
- NABH MOM (Management of Medications) and patient rights standards
- Indian Medical Council (Professional Conduct) Regulations 2002
- Consumer Protection Act 2019 (medical negligence provisions)
- Transplantation of Human Organs Act (if applicable)
- Mental Health Care Act 2017 (if applicable)

Provide:
1. COMPLIANCE STATUS: COMPLIANT / NON-COMPLIANT / PARTIALLY COMPLIANT
2. CRITICAL DEFICIENCIES: Issues that make consent legally invalid
3. DOCUMENTATION GAPS: Missing elements that should be added
4. NABH INDICATORS AFFECTED: Relevant NABH standards
5. CORRECTIVE ACTIONS: Specific steps to remediate each gap
6. LEGAL RISK LEVEL: HIGH / MEDIUM / LOW with reasoning`;

    const raw = await aiComplete([{ role: 'user', content: prompt }], { maxTokens: 900, temperature: 0.2 });

    const parseSection = (text, header) => {
      const regex = new RegExp(`${header}[:\\s]*([\\s\\S]*?)(?=\\n[0-9]+\\.|\\n[A-Z &]{3,}:|$)`, 'i');
      const m = text.match(regex);
      return m ? m[1].trim() : '';
    };

    res.json({
      success: true,
      compliance: {
        procedureName,
        consentType,
        status:             parseSection(raw, 'COMPLIANCE STATUS'),
        criticalDeficiencies:parseSection(raw, 'CRITICAL DEFICIENCIES'),
        documentationGaps:  parseSection(raw, 'DOCUMENTATION GAPS'),
        nabhIndicators:     parseSection(raw, 'NABH INDICATORS AFFECTED'),
        correctiveActions:  parseSection(raw, 'CORRECTIVE ACTIONS'),
        legalRisk:          parseSection(raw, 'LEGAL RISK LEVEL'),
        raw,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[Consent AI] compliance-check error:', err.message);
    res.status(500).json({ success: false, error: 'Compliance check failed.' });
  }
});

// ─── POST /api/consent/ai/audit-summary ───────────────────────────────────────
// Generate a consent audit summary report for a given period.

router.post('/ai/audit-summary', authConsent, async (req, res) => {
  try {
    const {
      period = 'Last 30 days',
      totalConsents = 0,
      pendingConsents = 0,
      signedConsents = 0,
      refusedConsents = 0,
      expiringConsents = 0,
      departmentBreakdown = [],
      commonProcedures = [],
    } = req.body;

    const prompt = `You are CLIA, a consent audit AI. Generate a concise consent management audit summary.

PERIOD: ${period}
METRICS:
- Total Consents: ${totalConsents}
- Signed/Completed: ${signedConsents}
- Pending: ${pendingConsents}
- Refused: ${refusedConsents}
- Expiring Soon: ${expiringConsents}
- Department Breakdown: ${departmentBreakdown.length ? departmentBreakdown.map(d => `${d.dept}: ${d.count}`).join(', ') : 'Not provided'}
- Top Procedures: ${commonProcedures.length ? commonProcedures.join(', ') : 'Not provided'}

Generate:
1. PERFORMANCE SUMMARY: 2-3 sentences on overall consent management performance
2. KEY FINDINGS: 3-5 bullet points on notable trends or issues
3. COMPLIANCE RATE: Calculation and interpretation
4. AREAS OF CONCERN: Departments or procedures with high pending/refusal rates
5. RECOMMENDATIONS: 3-5 actionable improvements for the next period
6. NABH READINESS: Assessment of readiness for NABH audit based on metrics

Keep it concise, data-driven, and actionable.`;

    const summary = await aiComplete([{ role: 'user', content: prompt }], { maxTokens: 800, temperature: 0.3 });

    res.json({
      success: true,
      summary,
      period,
      metrics: { totalConsents, signedConsents, pendingConsents, refusedConsents, expiringConsents },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Consent AI] audit-summary error:', err.message);
    res.status(500).json({ success: false, error: 'Audit summary generation failed.' });
  }
});

export default router;
