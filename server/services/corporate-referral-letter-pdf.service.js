/**
 * Renders a corporate HR → lab **authorised referral letter** to PDF.
 *
 * Pure renderer (same shape as corporate-quote-pdf.service.js): takes a normalised
 * letter object (with frozen employee / lab / template snapshots) and lays it out on
 * the corporate letterhead. No corporate-specific data is hard-coded here.
 *
 *   generateReferralLetterPdf(letter) -> { filename, filepath }   (writes the file)
 *   referralLetterPdfPath(letter)     -> absolute path it would write to
 */
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PDF_DIR = path.join(__dirname, '../public/pdfs/corporate-referrals');

/** Filesystem-safe filename component (employee/reference strings are externally supplied). */
function filePart(value, fallback) {
  const cleaned = String(value ?? '').trim().replace(/[^A-Za-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return cleaned || fallback;
}

function obj(v) {
  if (!v) return {};
  if (typeof v === 'object' && !Array.isArray(v)) return v;
  try { const x = JSON.parse(v); return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; } catch { return {}; }
}

function testName(t) { return typeof t === 'string' ? t : String(t?.name ?? '').trim(); }

function addressLine(address) {
  if (!address) return '';
  if (typeof address === 'string') return address;
  const a = obj(address);
  return [a.line1 || a.address, a.line2, a.city, a.state, a.pincode || a.pin || a.zip].filter(Boolean).join(', ');
}

function fmtDate(value) {
  if (!value) return '';
  const raw = String(value).trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = m ? new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`) : new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function referralLetterPdfFileName(letter) {
  return `referral-${filePart(letter.reference_number || letter.referenceNumber, 'LETTER')}.pdf`;
}
export function referralLetterPdfPath(letter) {
  return path.join(PDF_DIR, referralLetterPdfFileName(letter));
}

export function generateReferralLetterPdf(letter) {
  return new Promise((resolve, reject) => {
    try {
      if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });
      const filename = referralLetterPdfFileName(letter);
      const filepath = path.join(PDF_DIR, filename);

      const tpl = obj(letter.template_snapshot || letter.template);
      const emp = obj(letter.employee_snapshot || letter.employee);
      const lab = obj(letter.lab_snapshot || letter.lab);
      const corp = obj(letter.corporate);
      const tests = Array.isArray(letter.tests) ? letter.tests.map(testName).filter(Boolean) : [];

      const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 56, left: 54, right: 54 } });
      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      const INK = '#0f172a', MUTE = '#475569', LINE = '#cbd5e1', ACCENT = '#0e7490';

      // Letterhead
      if (letter.logoDataUri) {
        try { doc.image(Buffer.from(String(letter.logoDataUri).split(',').pop(), 'base64'), 54, 46, { fit: [120, 48] }); } catch { /* ignore bad logo */ }
      }
      doc.fontSize(16).font('Helvetica-Bold').fillColor(INK)
        .text(tpl.header_text || corp.companyName || letter.corporateName || 'Corporate Health Programme', 54, 52, { align: 'right' });
      doc.moveDown(0.2);
      doc.fontSize(9).font('Helvetica').fillColor(MUTE)
        .text('Authorised Health Checkup Referral', { align: 'right' });
      doc.moveTo(54, doc.y + 8).lineTo(541, doc.y + 8).strokeColor(LINE).lineWidth(1).stroke();
      doc.moveDown(1.2);

      // Reference + date row
      doc.fillColor(MUTE).fontSize(9.5).font('Helvetica');
      const refY = doc.y;
      doc.text(`Ref: ${letter.reference_number || letter.referenceNumber || '—'}`, 54, refY);
      doc.text(`Date: ${fmtDate(letter.created_at || letter.issuedAt || new Date().toISOString())}`, 54, refY, { align: 'right' });
      doc.moveDown(1);

      // Addressed to the lab
      doc.fillColor(INK).fontSize(10.5).font('Helvetica-Bold').text('To,');
      doc.font('Helvetica').fillColor(INK).text(lab.name || letter.labName || 'The Diagnostic Centre');
      const labAddr = addressLine(lab.address || letter.labAddress);
      if (labAddr) doc.fillColor(MUTE).fontSize(9.5).text(labAddr);
      if (lab.phone) doc.fillColor(MUTE).fontSize(9.5).text(`Phone: ${lab.phone}`);
      doc.moveDown(1);

      // Subject
      doc.fillColor(INK).fontSize(10.5).font('Helvetica-Bold')
        .text(`Subject: Authorisation for Annual Health Checkup — ${emp.name || 'Employee'}`);
      doc.moveDown(0.8);

      // Intro
      doc.font('Helvetica').fillColor(INK).fontSize(10.5)
        .text(tpl.intro_paragraph
          || `This is to authorise the below-named employee of ${corp.companyName || letter.corporateName || 'our organisation'} to undergo the Annual Health Checkup comprising the tests listed below, at your centre, under our corporate health programme. Kindly extend the agreed corporate billing arrangement.`,
          { align: 'justify', lineGap: 2 });
      doc.moveDown(1);

      // Employee block
      section(doc, ACCENT, 'Employee Details');
      row(doc, MUTE, INK, 'Name', emp.name);
      if (emp.employeeId) row(doc, MUTE, INK, 'Employee ID', emp.employeeId);
      if (emp.department) row(doc, MUTE, INK, 'Department', emp.department);
      if (emp.designation) row(doc, MUTE, INK, 'Designation', emp.designation);
      row(doc, MUTE, INK, 'Valid', [fmtDate(letter.valid_from || letter.validFrom), fmtDate(letter.valid_until || letter.validUntil)].filter(Boolean).join(' to ') || 'As per programme');
      doc.moveDown(0.8);

      // Tests
      section(doc, ACCENT, `Authorised Tests (${tests.length})`);
      doc.font('Helvetica').fillColor(INK).fontSize(10);
      if (tests.length) {
        tests.forEach((t, i) => doc.text(`${i + 1}.  ${t}`, { lineGap: 1.5 }));
      } else {
        doc.fillColor(MUTE).text('As per the employee’s entitled Annual Health Checkup package.');
      }
      doc.moveDown(0.8);

      if (tpl.body_note || letter.notes) {
        section(doc, ACCENT, 'Notes');
        doc.font('Helvetica').fillColor(INK).fontSize(10).text([tpl.body_note, letter.notes].filter(Boolean).join('\n'), { lineGap: 2 });
        doc.moveDown(0.8);
      }

      // Signatory
      doc.moveDown(1.2);
      doc.font('Helvetica').fillColor(INK).fontSize(10).text('For ' + (corp.companyName || letter.corporateName || 'the organisation'));
      doc.moveDown(1.6);
      doc.font('Helvetica-Bold').fillColor(INK).text(tpl.signatory_name || 'Authorised Signatory');
      if (tpl.signatory_title) doc.font('Helvetica').fillColor(MUTE).fontSize(9.5).text(tpl.signatory_title);
      doc.font('Helvetica-Oblique').fillColor(MUTE).fontSize(8.5).text('(This letter is system-generated and authorised electronically.)');

      // Footer disclaimer
      const footer = tpl.footer_text
        || 'This referral is issued solely for the authorised tests named above and is valid only within the stated period. Please verify the employee’s identity with a valid photo ID before collection.';
      doc.fontSize(8).font('Helvetica').fillColor(MUTE)
        .text(footer, 54, 782, { width: 487, align: 'center', lineGap: 1 });

      doc.end();
      stream.on('finish', () => resolve({ filename, filepath }));
      stream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
}

function section(doc, accent, title) {
  doc.moveDown(0.2);
  doc.fillColor(accent).fontSize(11).font('Helvetica-Bold').text(title);
  doc.moveTo(54, doc.y + 2).lineTo(541, doc.y + 2).strokeColor('#e2e8f0').lineWidth(0.8).stroke();
  doc.moveDown(0.5);
}
function row(doc, mute, ink, label, value) {
  if (value === undefined || value === null || value === '') return;
  const y = doc.y;
  doc.fillColor(mute).fontSize(9.5).font('Helvetica').text(`${label}`, 54, y, { width: 120 });
  doc.fillColor(ink).fontSize(10).font('Helvetica').text(String(value), 178, y, { width: 363 });
  doc.moveDown(0.2);
}

export default { generateReferralLetterPdf, referralLetterPdfPath, referralLetterPdfFileName };
