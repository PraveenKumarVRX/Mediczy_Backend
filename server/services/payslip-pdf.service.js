/**
 * Payslip PDF generation — added 2026-09-18 per audit finding: payroll had
 * no payslip PDF generation or statutory e-filing export. Unlike the bill
 * template service, the PDF is generated in memory and never written to disk.
 */

import PDFDocument from 'pdfkit';

/**
 * Renders the payslip entirely in memory and resolves with a Buffer.
 * Nothing is written to disk — salary PDFs must never land in a web-reachable
 * directory. Callers stream the buffer to the authenticated requester.
 */
export function generatePayslipPdf({ run, line, hospitalName }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(18).text(hospitalName || 'Mediczy Hospital', { align: 'center' });
      doc.fontSize(14).text('Payslip', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10)
        .text(`Pay Period: ${run.month}`)
        .text(`Employee Code: ${line.employeeCode}`)
        .text(`Employee Name: ${line.employeeName}`)
        .text(`Department: ${line.department || 'N/A'}`)
        .moveDown();

      doc.fontSize(11).text('Earnings & Deductions', { underline: true }).moveDown(0.3);
      doc.fontSize(10);
      const rows = [
        ['Gross Pay', line.gross],
        ['PF', line.pf],
        ['ESI', line.esi],
        ['TDS', line.tds],
        ['Other Deductions', line.otherDeductions],
        ['Net Pay', line.net],
      ];
      rows.forEach(([label, value]) => {
        doc.text(`${label}: ₹${Number(value || 0).toFixed(2)}`);
      });

      doc.moveDown(1.5).fontSize(8).fillColor('#666')
        .text('This is a system-generated payslip.', { align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Statutory e-filing export — PF/ESI/TDS challan-ready CSV for a payroll
 * run, in the column layout EPFO/ESIC portals commonly accept for bulk
 * upload. Kept as CSV (not a filed submission) since actually filing
 * requires portal-specific credentials this environment doesn't have —
 * this produces the export a payroll team would upload manually.
 */
export function buildStatutoryExportCsv(run, lines) {
  const header = ['Employee Code', 'Employee Name', 'Gross', 'PF', 'ESI', 'TDS', 'Net'];
  const escapeCell = (v) => {
    let s = String(v ?? '');
    // Neutralise spreadsheet formula injection from free-text fields (e.g. employee names).
    if (typeof v === 'string' && /^[=+@\t\r]|^-(?!\d)/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = lines.map((l) => [l.employeeCode, l.employeeName, l.gross, l.pf, l.esi, l.tds, l.net]);
  return [header, ...rows].map((r) => r.map(escapeCell).join(',')).join('\n');
}

export default { generatePayslipPdf, buildStatutoryExportCsv };
