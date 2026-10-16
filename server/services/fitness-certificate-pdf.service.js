/**
 * Renders a printable Medical Examination Report / Fitness Certificate PDF
 * for a corporate occupational-health record (fitness_certificates table —
 * see corporate-hmis.service.js), on the SmartHealth Clinic letterhead
 * (server/templates/documents/fitness-certificate-template.html — kept in
 * visual sync with prescription-template.html).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDoctorSignatureDataUri } from './doctor-signature.service.js';
import { getClinicLogoDataUri } from './clinic-branding.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PDF_DIR = path.join(__dirname, '../public/pdfs/fitness-certificates');
const TEMPLATE_PATH = path.join(__dirname, '../templates/documents/fitness-certificate-template.html');

function ensureDir() {
  if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });
}

/**
 * Keep filename components filesystem-safe. Employee IDs are supplied by a
 * corporate and may contain spaces, slashes, or punctuation; none of those
 * should be allowed to change the directory in which a PDF is written.
 */
function filePart(value, fallback) {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/[^A-Za-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return cleaned || fallback;
}

function issuedDatePart(cert) {
  const source = cert?.issued_date || cert?.issuedDate || cert?.signed_at || cert?.created_at;
  if (!source) return 'UNKNOWN-DATE';
  const raw = String(source).trim();
  // DATE values are already unambiguous and should not be shifted by a
  // server timezone conversion.
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) return `${dateOnly[1]}${dateOnly[2]}${dateOnly[3]}`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? filePart(raw, 'UNKNOWN-DATE') : parsed.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * The FC number is derived from the database BIGSERIAL id. PostgreSQL does
 * not reuse sequence values after deletes, so this remains unique even when a
 * certificate is removed. The resulting format is:
 *   FC-000123_EMP-0042_20261017.pdf
 */
export function fitnessCertificateNumber(certificateOrId, metadata = {}) {
  const cert = certificateOrId && typeof certificateOrId === 'object'
    ? certificateOrId
    : { id: certificateOrId, ...metadata };
  const id = Number(cert.id);
  return Number.isSafeInteger(id) && id > 0 ? `FC-${String(id).padStart(6, '0')}` : `FC-${filePart(cert.id, 'UNKNOWN')}`;
}

export function fitnessCertificatePdfFileName(certificateOrId, metadata = {}) {
  const cert = certificateOrId && typeof certificateOrId === 'object'
    ? certificateOrId
    : { id: certificateOrId, ...metadata };
  const fcNumber = fitnessCertificateNumber(cert);
  const employeeId = filePart(cert.employee_id ?? cert.employeeId, `PATIENT-${filePart(cert.patient_id ?? cert.patientId, 'UNKNOWN')}`);
  return `${fcNumber}_${employeeId}_${issuedDatePart(cert)}.pdf`;
}

export function fitnessCertificatePdfPath(certificateOrId, metadata = {}) {
  return path.join(PDF_DIR, fitnessCertificatePdfFileName(certificateOrId, metadata));
}

/** The pre-sequence name used by certificates issued before this change. */
export function legacyFitnessCertificatePdfPath(certificateId) {
  return path.join(PDF_DIR, `fitness-cert-${certificateId}.pdf`);
}

/**
 * Prefer the descriptive name, but keep old PDFs available while certificates
 * issued before the naming change are being retained.
 */
export function resolveFitnessCertificatePdfPath(certificateOrId, metadata = {}) {
  const current = fitnessCertificatePdfPath(certificateOrId, metadata);
  if (fs.existsSync(current)) return current;
  const id = certificateOrId && typeof certificateOrId === 'object' ? certificateOrId.id : certificateOrId;
  const legacy = legacyFitnessCertificatePdfPath(id);
  return fs.existsSync(legacy) ? legacy : current;
}

const STATUS_LABEL = {
  fit: 'FIT FOR DUTY',
  fit_with_restrictions: 'FIT FOR DUTY — WITH RESTRICTIONS',
  temporarily_unfit: 'TEMPORARILY UNFIT FOR DUTY',
  unfit: 'UNFIT FOR DUTY',
};

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function renderConditionalBlock(template, key, value) {
  const blockRe = new RegExp(`\\{\\{#${key}\\}\\}([\\s\\S]*?)\\{\\{/${key}\\}\\}`, 'g');
  if (!value) return template.replace(blockRe, '');
  return template.replace(blockRe, (_m, inner) => inner.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value));
}

/**
 * @param {object} cert - a row from fitness_certificates (as returned by issueFitnessCertificate)
 * @param {object} [letterhead] - issuer context not stored flat on the cert row:
 *   { doctorQualifications, doctorSpecialty, clinicName, clinicAddress, clinicPhone, doctorId, tenantId }
 */
export async function generateFitnessCertificatePdf(cert, letterhead = {}) {
  ensureDir();
  const filePath = fitnessCertificatePdfPath(cert);

  let html = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

  const certData = typeof cert.certificate_data === 'string' ? JSON.parse(cert.certificate_data) : (cert.certificate_data || {});

  const signatureDataUri = getDoctorSignatureDataUri(letterhead.doctorId);
  const signatureSlot = signatureDataUri
    ? `<img src="${signatureDataUri}" class="signature-img" alt="Signature" />`
    : '<div class="signature-line"></div>';

  const logoDataUri = getClinicLogoDataUri(letterhead.tenantId);
  const logoSlot = logoDataUri
    ? `<img src="${logoDataUri}" class="brand-logo-img" alt="${letterhead.clinicName || 'Clinic'} logo" />`
    : `<svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
         <circle cx="26" cy="26" r="25" stroke="#0f766e" stroke-width="1.6" fill="#f0fdfa"/>
         <path d="M15 27c3-6 8-9 11-9 2 0 2.5 1.6 1 3-2 2-5 3-7 6 3-1 7-3 10-6 2-2 4-1 3 1.3-1.7 3.7-6 6.7-10 8.2" stroke="#0f766e" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
         <path d="M37 25c-3-6-8-9-11-9-2 0-2.5 1.6-1 3 2 2 5 3 7 6-3-1-7-3-10-6-2-2-4-1-3 1.3 1.7 3.7 6 6.7 10 8.2" stroke="#5eead4" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
       </svg>`;

  const replacements = {
    '{{signatureSlot}}': signatureSlot,
    '{{logoSlot}}': logoSlot,
    // The template already includes the "Certificate No. FC-" label in a
    // couple of places; use the numeric sequence portion here to avoid
    // rendering a duplicated FC prefix while keeping the PDF and filename in
    // the same sequence.
    '{{certificateId}}': fitnessCertificateNumber(cert).replace(/^FC-/, ''),
    '{{issuedDate}}': fmtDate(cert.signed_at || cert.created_at),
    '{{patientName}}': cert.patient_name || '—',
    '{{employeeId}}': cert.employee_id || '—',
    '{{employerName}}': cert.employer_name || '—',
    '{{jobDescription}}': cert.job_description || '—',
    '{{examinationDate}}': fmtDate(cert.examination_date),
    '{{validFrom}}': fmtDate(cert.valid_from),
    '{{validUntil}}': fmtDate(cert.valid_until),
    '{{statusClass}}': cert.fitness_status || 'fit',
    '{{statusLabel}}': STATUS_LABEL[cert.fitness_status] || String(cert.fitness_status || '').toUpperCase(),
    '{{doctorName}}': cert.issued_by || '—',
    '{{doctorRegNo}}': cert.doctor_reg_no || '—',
    '{{doctorQualifications}}': letterhead.doctorQualifications || '',
    '{{doctorSpecialty}}': letterhead.doctorSpecialty || '',
    '{{clinicName}}': letterhead.clinicName || 'Mediqzy',
    '{{clinicAddress}}': letterhead.clinicAddress || '',
    '{{clinicPhone}}': letterhead.clinicPhone || '',
    // The place the examination/issuance actually happened is a manual entry on the certificate
    // (certData.examinationPlace) — it can differ from the clinic's registered address (e.g. a
    // camp held on-site at the corporate's own premises). Fall back to the clinic-derived value
    // only for older certificates issued before this field existed.
    '{{issuePlace}}': certData.examinationPlace || letterhead.issuePlace || '',
    '{{generatedDateTime}}': new Date().toLocaleString('en-IN'),
  };
  for (const [token, value] of Object.entries(replacements)) {
    html = html.replace(new RegExp(token.replace(/[{}]/g, '\\$&'), 'g'), String(value));
  }
  html = renderConditionalBlock(html, 'restrictions', cert.restrictions);
  html = renderConditionalBlock(html, 'remarks', cert.remarks);
  html = renderConditionalBlock(html, 'clinicAddress', letterhead.clinicAddress);
  html = renderConditionalBlock(html, 'clinicPhone', letterhead.clinicPhone);

  const puppeteer = await import('puppeteer');
  const browser = await puppeteer.default.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = Buffer.from(await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
    }));
    fs.writeFileSync(filePath, pdfBuffer);
  } finally {
    await browser.close();
  }

  return filePath;
}
