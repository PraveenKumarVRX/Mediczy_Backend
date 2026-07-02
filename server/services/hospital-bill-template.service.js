/**
 * Hospital bill PDF templates — GST itemized, insurance summary, cash receipt
 */

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

export async function generateHospitalBillPdf({ invoice, template, hospitalName }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const fileName = `hospital_bill_${invoice.bill_number}.pdf`;
      const uploadDir = path.join(process.cwd(), 'uploads', 'hospital-bills');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      const filePath = path.join(uploadDir, fileName);
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      const header = template?.header_config || {};
      const title = header.title || 'Hospital Bill';
      const tplType = template?.template_type || 'itemized';

      doc.fontSize(18).text(hospitalName || 'Mediczy Hospital', { align: 'center' });
      doc.fontSize(14).text(title, { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10)
        .text(`Bill No: ${invoice.bill_number}`)
        .text(`Date: ${new Date(invoice.created_at).toLocaleString('en-IN')}`)
        .text(`Patient ID: ${invoice.patient_id || 'N/A'}`)
        .text(`Admission: ${invoice.admission_id || 'OPD'}`)
        .text(`Status: ${invoice.status}`)
        .moveDown();

      if (tplType === 'summary') {
        doc.fontSize(11).text('Insurance Summary', { underline: true }).moveDown(0.3);
        doc.text(`Insurance Amount: ₹${Number(invoice.insurance_amount || 0).toFixed(2)}`);
        doc.text(`Patient Liability: ₹${Number(invoice.patient_liability || 0).toFixed(2)}`);
        doc.moveDown();
      }

      doc.fontSize(11).text('Line Items', { underline: true }).moveDown(0.3);
      doc.fontSize(9);
      const lines = invoice.lines || [];
      lines.forEach((line, idx) => {
        doc.text(
          `${idx + 1}. ${line.description} — ${line.quantity} x ₹${Number(line.unit_price).toFixed(2)} = ₹${Number(line.line_total).toFixed(2)}`
        );
      });

      doc.moveDown();
      doc.fontSize(11)
        .text(`Subtotal: ₹${Number(invoice.subtotal).toFixed(2)}`)
        .text(`Discount: ₹${Number(invoice.discount_amount).toFixed(2)}`)
        .text(`Tax: ₹${Number(invoice.tax_amount).toFixed(2)}`)
        .text(`Total: ₹${Number(invoice.total_amount).toFixed(2)}`, { bold: true })
        .text(`Insurance: ₹${Number(invoice.insurance_amount).toFixed(2)}`)
        .text(`Patient Due: ₹${Number(invoice.patient_liability).toFixed(2)}`)
        .text(`Paid: ₹${Number(invoice.amount_paid).toFixed(2)}`)
        .text(`Balance: ₹${Number(invoice.amount_due).toFixed(2)}`);

      const footer = template?.footer_config || {};
      if (footer.disclaimer) {
        doc.moveDown().fontSize(8).fillColor('#666').text(footer.disclaimer, { align: 'center' });
      }

      doc.end();
      stream.on('finish', () => resolve({
        success: true,
        filePath,
        fileName,
        url: `/uploads/hospital-bills/${fileName}`
      }));
      stream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

export default { generateHospitalBillPdf };
