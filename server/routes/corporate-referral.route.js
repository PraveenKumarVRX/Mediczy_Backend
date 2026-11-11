/**
 * Corporate HR → lab authorised referral letters (corporate login surface).
 *
 * Team login remains the source of truth for the AHC plan/catalog; this is an HR
 * document-issuance surface only. HR edits one reusable template per corporate, then
 * issues per-employee letters whose test list is prefilled from the employee's entitled
 * AHC package. Every query is scoped to the authenticated corporate (req.user.corporateId),
 * and the employee is resolved strictly inside that corporate's roster.
 *
 * Mounted under /api/corporate (alongside corporate.route.js).
 */
import express from 'express';
import fs from 'fs';
import { randomUUID } from 'node:crypto';
import { authCorporate } from '../middleware/corporate.middleware.js';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { getEmployeeAhcTests, testNames } from '../utils/health-package-tests.js';
import { generateReferralLetterPdf, referralLetterPdfPath } from '../services/corporate-referral-letter-pdf.service.js';
import emailServiceModule from '../services/emailService.js';
import whatsappProductionService from '../services/whatsapp-production.service.js';
import { recordAutomatedSend } from '../services/team-sent-folder.service.js';

const router = express.Router();
const Q = postgresSequelize.QueryTypes;

const DEFAULT_TEMPLATE = {
  name: 'Default',
  header_text: '',
  intro_paragraph: '',
  body_note: '',
  footer_text: 'This referral is issued solely for the authorised tests named above and is valid only within the stated period. Please verify the employee’s identity with a valid photo ID before collection.',
  signatory_name: '',
  signatory_title: 'HR / Wellness Team',
};

const corpId = (req) => Number(req.user?.corporateId || req.user?.organization_id);
const hrUserId = (req) => Number(req.user?.userId || req.user?.id) || null;
const clip = (v, n = 4000) => (v == null ? null : String(v).slice(0, n));

/** Resolve one roster employee strictly within this corporate. `key` = company employeeId or ce.id. */
async function resolveEmployee(corporateId, key) {
  const [row] = await postgresSequelize.query(
    `SELECT ce.id, ce."employeeId", ce.department, ce.designation, ce.email AS on_file_email,
            ce."userId", u."firstName", u."lastName", u.email AS user_email, u."phoneNumber"
       FROM corporate_employees ce
       LEFT JOIN users u ON u.id = ce."userId"
      WHERE ce.corporate_id = :corporateId
        AND (ce."employeeId" = :key OR ce.id::text = :key)
      LIMIT 1`,
    { replacements: { corporateId, key: String(key) }, type: Q.SELECT }
  );
  return row || null;
}

function employeeSnapshot(emp) {
  return {
    name: [emp.firstName, emp.lastName].filter(Boolean).join(' ') || emp.user_email || emp.on_file_email || emp.employeeId,
    employeeId: emp.employeeId || null,
    department: emp.department || null,
    designation: emp.designation || null,
    email: emp.user_email || emp.on_file_email || null,
    phone: emp.phoneNumber || null,
  };
}

async function activeTemplate(corporateId) {
  const [row] = await postgresSequelize.query(
    `SELECT * FROM corporate_referral_templates WHERE corporate_id = :corporateId AND is_active = TRUE ORDER BY updated_at DESC LIMIT 1`,
    { replacements: { corporateId }, type: Q.SELECT }
  );
  return row;
}

const templateView = (t) => ({
  id: t?.id ?? null,
  name: t?.name || DEFAULT_TEMPLATE.name,
  headerText: t?.header_text ?? DEFAULT_TEMPLATE.header_text,
  introParagraph: t?.intro_paragraph ?? DEFAULT_TEMPLATE.intro_paragraph,
  bodyNote: t?.body_note ?? DEFAULT_TEMPLATE.body_note,
  footerText: t?.footer_text ?? DEFAULT_TEMPLATE.footer_text,
  signatoryName: t?.signatory_name ?? DEFAULT_TEMPLATE.signatory_name,
  signatoryTitle: t?.signatory_title ?? DEFAULT_TEMPLATE.signatory_title,
  updatedAt: t?.updated_at ?? null,
});

const letterView = (r) => ({
  id: String(r.id),
  referenceNumber: r.reference_number,
  status: r.status,
  employee: r.employee_snapshot || {},
  lab: r.lab_snapshot || {},
  tests: Array.isArray(r.tests) ? r.tests.map((t) => (typeof t === 'string' ? t : t?.name)).filter(Boolean) : [],
  validFrom: r.valid_from || null,
  validUntil: r.valid_until || null,
  notes: r.notes || null,
  issuedAt: r.created_at,
  revokedAt: r.revoked_at || null,
  revokedReason: r.revoked_reason || null,
});

const templateSnapshotFrom = (t) => ({
  header_text: t?.header_text ?? DEFAULT_TEMPLATE.header_text,
  intro_paragraph: t?.intro_paragraph ?? DEFAULT_TEMPLATE.intro_paragraph,
  body_note: t?.body_note ?? DEFAULT_TEMPLATE.body_note,
  footer_text: t?.footer_text ?? DEFAULT_TEMPLATE.footer_text,
  signatory_name: t?.signatory_name ?? DEFAULT_TEMPLATE.signatory_name,
  signatory_title: t?.signatory_title ?? DEFAULT_TEMPLATE.signatory_title,
});

/** Best-effort employee notification that a letter was issued/revoked. Never throws. */
async function notifyEmployee(letter, kind = 'issued') {
  try {
    const emp = letter.employee_snapshot || {};
    const name = emp.name || 'Member';
    const ref = letter.reference_number;
    const labName = letter.lab_snapshot?.name || 'the diagnostic centre';
    const line = kind === 'revoked'
      ? `your health checkup referral letter (${ref}) has been withdrawn by your HR team.`
      : `your HR team has issued your authorised health checkup referral letter (${ref}) for ${labName}. You can download and share it from the app.`;
    if (emp.email) {
      const subject = kind === 'revoked' ? `Health checkup referral withdrawn — ${ref}` : `Your health checkup referral letter — ${ref}`;
      const htmlContent = `<p>Dear ${name},</p><p>${line}</p>`;
      await emailServiceModule.sendOutboundEmail(1, { to: emp.email, subject, htmlContent })
        .then(sent => recordAutomatedSend({ to: emp.email, subject, htmlBody: htmlContent, messageId: sent?.messageId || null, labels: ['sent', 'referral', kind] }))
        .catch(() => {});
    }
    const digits = String(emp.phone || '').replace(/\D/g, '');
    if (digits.length >= 10 && whatsappProductionService?.configured) {
      const to = digits.startsWith('91') ? `+${digits}` : `+91${digits}`;
      await whatsappProductionService.sendSessionMessage({ to, body: `Dear ${name}, ${line}\n— My SmartHealth` }).catch(() => {});
    }
  } catch (e) {
    console.error('[corporate-referral] notify failed:', e.message);
  }
}

// ── Template ──────────────────────────────────────────────────────────────────
router.get('/referral-template', authCorporate, async (req, res) => {
  try {
    return res.json({ success: true, template: templateView(await activeTemplate(corpId(req))) });
  } catch (e) {
    console.error('[corporate-referral] GET template', e);
    return res.status(500).json({ success: false, message: 'Unable to load referral template' });
  }
});

router.put('/referral-template', authCorporate, async (req, res) => {
  const corporateId = corpId(req);
  const b = req.body || {};
  try {
    const [row] = await postgresSequelize.query(
      `INSERT INTO corporate_referral_templates
         (corporate_id, name, header_text, intro_paragraph, body_note, footer_text, signatory_name, signatory_title, created_by_user_id, updated_at)
       VALUES (:corporateId, 'Default', :header, :intro, :bodyNote, :footer, :signName, :signTitle, :hr, NOW())
       ON CONFLICT (corporate_id, name) DO UPDATE SET
         header_text = EXCLUDED.header_text, intro_paragraph = EXCLUDED.intro_paragraph,
         body_note = EXCLUDED.body_note, footer_text = EXCLUDED.footer_text,
         signatory_name = EXCLUDED.signatory_name, signatory_title = EXCLUDED.signatory_title,
         is_active = TRUE, updated_at = NOW()
       RETURNING *`,
      { replacements: {
          corporateId, hr: hrUserId(req),
          header: clip(b.headerText, 400), intro: clip(b.introParagraph, 4000), bodyNote: clip(b.bodyNote, 4000),
          footer: clip(b.footerText, 2000), signName: clip(b.signatoryName, 160), signTitle: clip(b.signatoryTitle, 160),
        }, type: Q.SELECT }
    );
    return res.json({ success: true, template: templateView(row) });
  } catch (e) {
    console.error('[corporate-referral] PUT template', e);
    return res.status(500).json({ success: false, message: 'Unable to save referral template' });
  }
});

// ── Prefill: an employee's entitled AHC tests ───────────────────────────────────
router.get('/employees/:employeeId/ahc-tests', authCorporate, async (req, res) => {
  const corporateId = corpId(req);
  try {
    const emp = await resolveEmployee(corporateId, req.params.employeeId);
    if (!emp) return res.status(404).json({ success: false, message: 'Employee not found in your organisation' });
    const ahc = emp.userId ? await getEmployeeAhcTests(emp.userId, corporateId) : null;
    return res.json({
      success: true,
      employee: employeeSnapshot(emp),
      hasLogin: !!emp.userId,
      package: ahc ? { id: ahc.packageId, name: ahc.packageName, validFrom: ahc.validFrom, validTo: ahc.validTo } : null,
      tests: ahc?.tests || [],
    });
  } catch (e) {
    console.error('[corporate-referral] ahc-tests', e);
    return res.status(500).json({ success: false, message: 'Unable to load the employee’s checkup tests' });
  }
});

// ── Issue / list / detail / pdf / revoke ────────────────────────────────────────
router.post('/referral-letters', authCorporate, async (req, res) => {
  const corporateId = corpId(req);
  const b = req.body || {};
  const tests = testNames(b.tests);
  if (!b.employeeId) return res.status(400).json({ success: false, message: 'employeeId is required' });
  if (!tests.length) return res.status(400).json({ success: false, message: 'At least one test is required' });
  const lab = b.lab || {};
  const labName = String(lab.name || b.labName || '').trim();
  if (!labName) return res.status(400).json({ success: false, message: 'A target lab/diagnostic centre is required' });
  try {
    const emp = await resolveEmployee(corporateId, b.employeeId);
    if (!emp) return res.status(404).json({ success: false, message: 'Employee not found in your organisation' });

    // If a network partner was named, confirm it belongs to this corporate's approved network.
    let partnerType = lab.partnerType || null, partnerId = lab.partnerId ? Number(lab.partnerId) : null;
    if (partnerType && partnerId) {
      const [ok] = await postgresSequelize.query(
        `SELECT 1 FROM corporate_network_assignments WHERE corporate_id = :corporateId AND partner_type = :partnerType AND partner_id = :partnerId LIMIT 1`,
        { replacements: { corporateId, partnerType, partnerId }, type: Q.SELECT }
      );
      if (!ok) { partnerType = null; partnerId = null; } // keep as free-text lab if not in network
    }

    const tpl = await activeTemplate(corporateId);
    const [corp] = await postgresSequelize.query(`SELECT id, "companyName" FROM corporates WHERE id = :corporateId LIMIT 1`, { replacements: { corporateId }, type: Q.SELECT });
    const reference = `REF-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;

    const [row] = await postgresSequelize.query(
      `INSERT INTO corporate_referral_letters
         (reference_number, corporate_id, template_id, issued_by_user_id, employee_user_id, corporate_employee_id,
          employee_snapshot, target_lab_partner_type, target_lab_partner_id, lab_snapshot, package_id, tests,
          valid_from, valid_until, notes, template_snapshot)
       VALUES (:reference, :corporateId, :templateId, :hr, :employeeUserId, :rosterId,
          CAST(:employeeSnapshot AS JSONB), :partnerType, :partnerId, CAST(:labSnapshot AS JSONB), :packageId, CAST(:tests AS JSONB),
          :validFrom, :validUntil, :notes, CAST(:templateSnapshot AS JSONB))
       RETURNING *`,
      { replacements: {
          reference, corporateId, templateId: tpl?.id || null, hr: hrUserId(req),
          employeeUserId: emp.userId || null, rosterId: emp.id,
          employeeSnapshot: JSON.stringify(employeeSnapshot(emp)),
          partnerType, partnerId,
          labSnapshot: JSON.stringify({ name: labName, address: lab.address || b.labAddress || null, phone: lab.phone || null }),
          packageId: b.packageId ? String(b.packageId) : null,
          tests: JSON.stringify(tests.map((name) => ({ name }))),
          validFrom: b.validFrom || null, validUntil: b.validUntil || null, notes: clip(b.notes, 4000),
          templateSnapshot: JSON.stringify(templateSnapshotFrom(tpl)),
        }, type: Q.SELECT }
    );

    // Generate the PDF (await so HR gets an immediately-downloadable letter), then store the path.
    try {
      const { filepath } = await generateReferralLetterPdf({ ...row, corporate: { id: corp?.id, companyName: corp?.companyName } });
      await postgresSequelize.query(`UPDATE corporate_referral_letters SET pdf_path = :p, updated_at = NOW() WHERE id = :id`, { replacements: { p: filepath, id: row.id }, type: Q.UPDATE });
    } catch (pdfErr) {
      console.error('[corporate-referral] PDF generation failed (letter still created):', pdfErr.message);
    }

    void notifyEmployee(row, 'issued');
    return res.status(201).json({ success: true, letter: letterView(row) });
  } catch (e) {
    if (e?.original?.code === '23505') return res.status(409).json({ success: false, message: 'A letter with this reference already exists. Please retry.' });
    console.error('[corporate-referral] POST letter', e);
    return res.status(500).json({ success: false, message: 'Unable to issue the referral letter' });
  }
});

router.get('/referral-letters', authCorporate, async (req, res) => {
  const corporateId = corpId(req);
  const status = String(req.query.status || '').trim();
  const employeeId = String(req.query.employeeId || '').trim();
  try {
    const rows = await postgresSequelize.query(
      `SELECT * FROM corporate_referral_letters
        WHERE corporate_id = :corporateId
          AND (:status = '' OR status = :status)
          AND (:employeeId = '' OR employee_snapshot->>'employeeId' = :employeeId)
        ORDER BY created_at DESC LIMIT 200`,
      { replacements: { corporateId, status, employeeId }, type: Q.SELECT }
    );
    return res.json({ success: true, letters: rows.map(letterView) });
  } catch (e) {
    console.error('[corporate-referral] GET letters', e);
    return res.status(500).json({ success: false, message: 'Unable to load referral letters' });
  }
});

async function loadLetterForCorporate(corporateId, id) {
  const [row] = await postgresSequelize.query(
    `SELECT * FROM corporate_referral_letters WHERE id = :id AND corporate_id = :corporateId LIMIT 1`,
    { replacements: { id, corporateId }, type: Q.SELECT }
  );
  return row || null;
}

router.get('/referral-letters/:id', authCorporate, async (req, res) => {
  try {
    const row = await loadLetterForCorporate(corpId(req), req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Letter not found' });
    return res.json({ success: true, letter: letterView(row) });
  } catch (e) {
    console.error('[corporate-referral] GET letter', e);
    return res.status(500).json({ success: false, message: 'Unable to load referral letter' });
  }
});

router.get('/referral-letters/:id/pdf', authCorporate, async (req, res) => {
  try {
    const corporateId = corpId(req);
    const row = await loadLetterForCorporate(corporateId, req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Letter not found' });
    let filepath = row.pdf_path && fs.existsSync(row.pdf_path) ? row.pdf_path : null;
    if (!filepath) {
      const [corp] = await postgresSequelize.query(`SELECT id, "companyName" FROM corporates WHERE id = :corporateId LIMIT 1`, { replacements: { corporateId }, type: Q.SELECT });
      ({ filepath } = await generateReferralLetterPdf({ ...row, corporate: { id: corp?.id, companyName: corp?.companyName } }));
      await postgresSequelize.query(`UPDATE corporate_referral_letters SET pdf_path = :p WHERE id = :id`, { replacements: { p: filepath, id: row.id }, type: Q.UPDATE });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${row.reference_number}.pdf"`);
    return fs.createReadStream(filepath).pipe(res);
  } catch (e) {
    console.error('[corporate-referral] GET letter pdf', e);
    if (!res.headersSent) return res.status(500).json({ success: false, message: 'Unable to generate the letter PDF' });
  }
});

router.post('/referral-letters/:id/revoke', authCorporate, async (req, res) => {
  try {
    const [row] = await postgresSequelize.query(
      `UPDATE corporate_referral_letters SET status = 'revoked', revoked_reason = :reason, revoked_at = NOW(), updated_at = NOW()
        WHERE id = :id AND corporate_id = :corporateId AND status = 'issued' RETURNING *`,
      { replacements: { id: req.params.id, corporateId: corpId(req), reason: clip(req.body?.reason, 500) || 'Withdrawn by HR' }, type: Q.SELECT }
    );
    if (!row) return res.status(409).json({ success: false, message: 'Letter cannot be revoked in its current state' });
    void notifyEmployee(row, 'revoked');
    return res.json({ success: true, letter: letterView(row) });
  } catch (e) {
    console.error('[corporate-referral] revoke', e);
    return res.status(500).json({ success: false, message: 'Unable to revoke referral letter' });
  }
});

export default router;
