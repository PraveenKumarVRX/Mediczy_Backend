/**
 * PDF Generator Service
 * Generates PDF documents for insurance claims
 */

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PDFGeneratorService {
  /**
   * Generate claim PDF
   * @param {Object} claim - Claim data
   * @param {Object} patient - Patient data
   * @returns {Promise<string>} - Path to generated PDF
   */
  async generateClaimPDF(claim, patient) {
    return new Promise((resolve, reject) => {
      try {
        // Create PDF directory if it doesn't exist
        const pdfDir = path.join(__dirname, '../public/pdfs/claims');
        if (!fs.existsSync(pdfDir)) {
          fs.mkdirSync(pdfDir, { recursive: true });
        }

        const filename = `claim-${claim.claimNumber}-${Date.now()}.pdf`;
        const filepath = path.join(pdfDir, filename);

        // Create PDF document
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 50, bottom: 50, left: 50, right: 50 }
        });

        // Pipe to file
        const stream = fs.createWriteStream(filepath);
        doc.pipe(stream);

        // Add header
        doc
          .fontSize(20)
          .font('Helvetica-Bold')
          .text('Insurance Claim Form', { align: 'center' })
          .moveDown(0.5);

        doc
          .fontSize(10)
          .font('Helvetica')
          .text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' })
          .moveDown(2);

        // Claim Information
        doc
          .fontSize(14)
          .font('Helvetica-Bold')
          .text('Claim Information')
          .moveDown(0.5);

        doc
          .fontSize(10)
          .font('Helvetica');

        const claimInfo = [
          ['Claim Number:', claim.claimNumber],
          ['Claim Type:', claim.claimType || 'Cashless'],
          ['Policy Number:', claim.policyNumber],
          ['Status:', claim.status],
          ['Claim Amount:', `₹${claim.claimAmount?.toLocaleString('en-IN') || 'N/A'}`],
          ['Approved Amount:', claim.approvedAmount ? `₹${claim.approvedAmount.toLocaleString('en-IN')}` : 'Pending'],
          ['Submitted Date:', claim.submittedAt ? new Date(claim.submittedAt).toLocaleDateString() : 'Not submitted'],
        ];

        claimInfo.forEach(([label, value]) => {
          doc.text(`${label} ${value}`, { continued: false });
        });

        doc.moveDown(1);

        // Patient Information
        doc
          .fontSize(14)
          .font('Helvetica-Bold')
          .text('Patient Information')
          .moveDown(0.5);

        doc
          .fontSize(10)
          .font('Helvetica');

        const patientInfo = [
          ['Patient Name:', `${patient.firstName} ${patient.lastName}`],
          ['Patient ID:', patient.id],
          ['Email:', patient.email || 'N/A'],
          ['Phone:', patient.phoneNumber || 'N/A'],
        ];

        patientInfo.forEach(([label, value]) => {
          doc.text(`${label} ${value}`, { continued: false });
        });

        doc.moveDown(1);

        // Clinical Information
        if (claim.diagnosis || claim.treatmentDetails) {
          doc
            .fontSize(14)
            .font('Helvetica-Bold')
            .text('Clinical Information')
            .moveDown(0.5);

          doc
            .fontSize(10)
            .font('Helvetica');

          if (claim.diagnosis) {
            doc.text(`Diagnosis: ${claim.diagnosis}`);
          }

          if (claim.treatmentDetails) {
            doc.text('Treatment Details:', { underline: true }).moveDown(0.3);
            if (typeof claim.treatmentDetails === 'object') {
              Object.entries(claim.treatmentDetails).forEach(([key, value]) => {
                doc.text(`  ${key}: ${value}`);
              });
            } else {
              doc.text(`  ${claim.treatmentDetails}`);
            }
          }

          doc.moveDown(1);
        }

        // Documents Submitted
        if (claim.documents && claim.documents.length > 0) {
          doc
            .fontSize(14)
            .font('Helvetica-Bold')
            .text('Documents Submitted')
            .moveDown(0.5);

          doc
            .fontSize(10)
            .font('Helvetica');

          claim.documents.forEach((doc_item, index) => {
            const docType = doc_item.type || doc_item;
            doc.text(`${index + 1}. ${docType}`);
          });

          doc.moveDown(1);
        }

        // Footer
        doc
          .moveDown(2)
          .fontSize(8)
          .font('Helvetica-Oblique')
          .text('This is a computer-generated document. No signature is required.', { align: 'center' })
          .text('Mediqzy Healthcare - Insurance Claims Management System', { align: 'center' });

        // Finalize PDF
        doc.end();

        stream.on('finish', () => {
          resolve(`/pdfs/claims/${filename}`);
        });

        stream.on('error', (error) => {
          reject(error);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Generate pre-authorization PDF
   * @param {Object} preAuth - Pre-auth data
   * @param {Object} patient - Patient data
   * @returns {Promise<string>} - Path to generated PDF
   */
  async generatePreAuthPDF(preAuth, patient) {
    return new Promise((resolve, reject) => {
      try {
        const pdfDir = path.join(__dirname, '../public/pdfs/pre-auth');
        if (!fs.existsSync(pdfDir)) {
          fs.mkdirSync(pdfDir, { recursive: true });
        }

        const filename = `preauth-${preAuth.preAuthNumber}-${Date.now()}.pdf`;
        const filepath = path.join(pdfDir, filename);

        const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 } });
        const stream = fs.createWriteStream(filepath);
        doc.pipe(stream);

        // Header
        doc
          .fontSize(20)
          .font('Helvetica-Bold')
          .text('Pre-Authorization Request', { align: 'center' })
          .moveDown(2);

        // Pre-auth details
        doc
          .fontSize(14)
          .font('Helvetica-Bold')
          .text('Pre-Authorization Details')
          .moveDown(0.5);

        doc
          .fontSize(10)
          .font('Helvetica');

        const preAuthInfo = [
          ['Pre-Auth Number:', preAuth.preAuthNumber],
          ['Policy Number:', preAuth.policyNumber],
          ['Status:', preAuth.status],
          ['Estimated Amount:', `₹${preAuth.estimatedAmount?.toLocaleString('en-IN') || 'N/A'}`],
          ['Approved Amount:', preAuth.approvedAmount ? `₹${preAuth.approvedAmount.toLocaleString('en-IN')}` : 'Pending'],
          ['Requested Date:', new Date(preAuth.requestedAt || preAuth.createdAt).toLocaleDateString()],
        ];

        preAuthInfo.forEach(([label, value]) => {
          doc.text(`${label} ${value}`);
        });

        doc.moveDown(1);

        // Patient info
        doc
          .fontSize(14)
          .font('Helvetica-Bold')
          .text('Patient Information')
          .moveDown(0.5);

        doc
          .fontSize(10)
          .font('Helvetica')
          .text(`Patient Name: ${patient.firstName} ${patient.lastName}`)
          .text(`Patient ID: ${patient.id}`)
          .moveDown(1);

        // Procedure details
        if (preAuth.procedureDetails) {
          doc
            .fontSize(14)
            .font('Helvetica-Bold')
            .text('Procedure Details')
            .moveDown(0.5);

          doc
            .fontSize(10)
            .font('Helvetica');

          if (typeof preAuth.procedureDetails === 'object') {
            Object.entries(preAuth.procedureDetails).forEach(([key, value]) => {
              doc.text(`${key}: ${value}`);
            });
          } else {
            doc.text(preAuth.procedureDetails);
          }
        }

        doc.end();

        stream.on('finish', () => {
          resolve(`/pdfs/pre-auth/${filename}`);
        });

        stream.on('error', (error) => {
          reject(error);
        });

      } catch (error) {
        reject(error);
      }
    });
  }
}

export default new PDFGeneratorService();
