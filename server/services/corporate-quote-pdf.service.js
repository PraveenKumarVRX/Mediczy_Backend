/**
 * Renders a saved corporate_quotes record into a proposal PDF — closes
 * the "no formal proposal document" gap. Purely a renderer: takes
 * whatever quote object it's given (any prospect, any tiers, any
 * categories) and lays it out; no prospect-specific data lives here.
 */
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inr = (value) => `Rs. ${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const categoryLabel = (value) => String(value).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export async function generateCorporateQuotePdf(quote) {
  return new Promise((resolve, reject) => {
    try {
      const pdfDir = path.join(__dirname, '../public/pdfs/corporate-quotes');
      if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });

      const filename = `quote-${quote.id}-${Date.now()}.pdf`;
      const filepath = path.join(pdfDir, filename);

      const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 } });
      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      doc.fontSize(20).font('Helvetica-Bold').text('Corporate Wellness Wallet — Proposal', { align: 'center' }).moveDown(0.3);
      doc.fontSize(10).font('Helvetica').fillColor('#555')
        .text(`Prepared for ${quote.prospectName}`, { align: 'center' })
        .text(`Generated on ${new Date().toLocaleDateString('en-IN')}`, { align: 'center' })
        .fillColor('#000')
        .moveDown(1.5);

      section(doc, 'Prospect Details');
      row(doc, 'Company', quote.prospectName);
      if (quote.contactName) row(doc, 'Contact', quote.contactName);
      if (quote.contactEmail) row(doc, 'Email', quote.contactEmail);
      if (quote.contactPhone) row(doc, 'Phone', quote.contactPhone);
      row(doc, 'Employee count', String(quote.employeeCount));
      doc.moveDown(1);

      section(doc, 'Coverage Categories');
      doc.fontSize(11).font('Helvetica').text((quote.categories || []).map(categoryLabel).join(', ') || '—');
      doc.moveDown(1);

      section(doc, 'Wallet Tiers');
      for (const tier of quote.tierOptions || []) {
        doc.fontSize(11).font('Helvetica')
          .text(`${tier.label}${tier.isDefault ? ' (Base — included for every employee)' : ' (Optional employee upgrade)'}: ${inr(tier.allocatedLimit)} / employee / year`);
      }
      doc.moveDown(1);

      const calc = quote.calculation || {};
      section(doc, 'Estimated Annual Cost');
      row(doc, 'Guaranteed wallet funding (base tier x employees)', inr(calc.guaranteedWalletFunding));
      if (Array.isArray(calc.tierBreakdown) && calc.tierBreakdown.length) {
        doc.fontSize(10).font('Helvetica-Oblique').fillColor('#555').text('Optional-tier upside (assumed uptake):').fillColor('#000');
        for (const t of calc.tierBreakdown) {
          row(doc, `  ${t.label} — ${t.uptakePercent}% assumed uptake (${t.employeesAtTier} employees)`, inr(t.incrementalCost));
        }
      }
      row(doc, 'Total estimated wallet funding', inr(calc.totalWalletFunding));
      row(doc, `Mediqzy admin fee (${calc.adminFeePercent}%)`, inr(calc.adminFee));
      if (calc.categoryLoadingTotal) row(doc, 'Category loading', inr(calc.categoryLoadingTotal));
      doc.moveDown(0.3);
      doc.fontSize(12).font('Helvetica-Bold').text(`Estimated total annual cost: ${inr(calc.estimatedTotalAnnualCost)}`);
      doc.fontSize(11).font('Helvetica').text(`Estimated cost per employee/year: ${inr(calc.estimatedPerEmployeeAnnualCost)}`);
      doc.moveDown(0.5);
      if (calc.range) {
        doc.fontSize(10).font('Helvetica-Oblique').fillColor('#555')
          .text(`Range if uptake differs from assumption: ${inr(calc.range.minimum)} (no one upgrades) to ${inr(calc.range.maximum)} (everyone upgrades to the top tier).`)
          .fillColor('#000');
      }
      doc.moveDown(1.5);

      if (quote.notes) {
        section(doc, 'Notes');
        doc.fontSize(10).font('Helvetica').text(quote.notes);
        doc.moveDown(1);
      }

      doc.fontSize(8).font('Helvetica-Oblique').fillColor('#888')
        .text('This is an indicative estimate, not a binding quote. Wallet funding is a pass-through cost borne by the employer; final commercial terms are confirmed separately.', { align: 'center' })
        .text('Mediqzy Healthcare — Corporate Wellness Platform', { align: 'center' });

      doc.end();
      stream.on('finish', () => resolve(`/pdfs/corporate-quotes/${filename}`));
      stream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
}

function section(doc, title) {
  doc.fontSize(13).font('Helvetica-Bold').text(title).moveDown(0.3);
}

function row(doc, label, value) {
  doc.fontSize(10).font('Helvetica').text(`${label}: `, { continued: true }).font('Helvetica-Bold').text(String(value));
}
