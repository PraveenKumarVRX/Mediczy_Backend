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

  /**
   * Draw a horizontal rule
   */
  _hr(doc, y) {
    doc.moveTo(50, y).lineTo(545, y).strokeColor('#cccccc').lineWidth(0.5).stroke();
  }

  /**
   * Draw a two-column label+value pair
   */
  _field(doc, label, value, x, y, w) {
    const val = value != null && value !== '' ? String(value) : '_______________';
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#444444').text(label, x, y, { width: w * 0.38, continued: false });
    doc.fontSize(8).font('Helvetica').fillColor('#000000').text(val, x + w * 0.38, y, { width: w * 0.62, continued: false });
  }

  /**
   * Generate TPA-specific Pre-Authorization Form PDF
   * Implements the IRDAI-standard 11-section cashless pre-authorisation form with
   * per-TPA branding matching each TPA's official form (Heritage, Medi Assist, FHPL, TTK, etc.)
   * Auto-selects TPA from stored tpaCode in admissionDetails or falls back to insurer mapping.
   * @param {Object} preAuth  - PreAuthorization record (Sequelize model instance or plain object)
   * @param {Object} hospital - Hospital details { name, rohiniId, address, city, phone, providerCode }
   * @returns {Promise<string>} - Public path to generated PDF
   */
  async generateTPAPreAuthFormPDF(preAuth, hospital = {}) {
    return new Promise((resolve, reject) => {
      try {
        const pdfDir = path.join(__dirname, '../public/pdfs/pre-auth');
        if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });

        const refNo = preAuth.preAuthNumber || `PA-${preAuth.id}`;
        const filename = `tpa-form-${refNo}-${Date.now()}.pdf`;
        const filepath = path.join(pdfDir, filename);

        const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 45, right: 45 } });
        const stream = fs.createWriteStream(filepath);
        doc.pipe(stream);

        const ad     = preAuth.admissionDetails || {};
        const pp     = Array.isArray(preAuth.plannedProcedures) ? (preAuth.plannedProcedures[0] || {}) : (preAuth.plannedProcedures || {});
        const extra  = ad.extraFields || {};

        // ─── Auto-detect TPA from stored tpaCode, fallback to insurer mapping ───
        const INSURER_DEFAULT_TPA = {
          // In-house / direct settlement insurers (own brand config)
          star_health: 'star_health', care_health: 'care_health', niva_bupa: 'niva_bupa',
          icici_lombard: 'icici_lombard', bajaj_allianz: 'bajaj_allianz',
          manipal_cigna: 'manipal_cigna', galaxy: 'galaxy',
          // Insurers that route through external TPAs
          new_india: 'health_india', united_india: 'health_india', oriental: 'east_west',
          hdfc_ergo: 'paramount', tata_aig: 'ttk',
          sbi_general: 'medi_assist', national: 'safeway',
          aditya_birla: 'ttk', future_generali: 'vidal_health',
          reliance: 'paramount', go_digit: 'md_india', cghs: 'alankit', esic: 'alankit',
          iffco_tokio: 'vidal_health', royal_sundaram: 'paramount', liberty: 'fhpl',
          cholamandalam: 'fhpl',
        };
        const storedTpaCode = (ad.tpaCode || '').toLowerCase().replace(/-/g, '_');
        const inferredTpaCode = INSURER_DEFAULT_TPA[(ad.insurerCode || '').toLowerCase()] || '';
        const tpaKey = storedTpaCode || inferredTpaCode || 'generic';

        // ─── Per-TPA branding config ─────────────────────────────────────────
        // headerBg: main header background, accent: section header color, irdaiLicense: IRDAI TPA license no
        // extraIdLabel/Value: TPA-specific identification field shown in Part C
        const TPA_CONFIG = {
          heritage:    { name: 'Heritage Health TPA Pvt. Ltd.',                    headerBg: '#0D3461', headerText: '#FFFFFF', secBg: '#E8F0F8', secText: '#0D3461', accent: '#F7941D', irdai: '044', addr: '204/205, Prestige Centre Point, Cunningham Road, Bengaluru – 560052', extraIdLabel: 'Heritage Auth No.',        extraIdKey: 'tpaAuthRef'  },
          medi_assist: { name: 'Medi Assist India TPA Pvt. Ltd.',                  headerBg: '#006633', headerText: '#FFFFFF', secBg: '#E8F5EE', secText: '#006633', accent: '#F7941D', irdai: '030', addr: 'No. 1, Daisoji, Marathahalli, Bengaluru – 560037',              extraIdLabel: 'MACS Auth / Ref ID',       extraIdKey: 'tpaAuthRef'  },
          health_india:{ name: 'Health India TPA Services Pvt. Ltd.',              headerBg: '#C0392B', headerText: '#FFFFFF', secBg: '#FDEDEC', secText: '#922B21', accent: '#F39C12', irdai: '017', addr: '301-305, Sai Arcade, Near Tata Power, Goregaon East, Mumbai – 400063', extraIdLabel: 'Claim Intimation No.',     extraIdKey: 'tpaAuthRef'  },
          vidal_health:{ name: 'Vidal Health TPA Pvt. Ltd.',                       headerBg: '#4A235A', headerText: '#FFFFFF', secBg: '#F5EEF8', secText: '#4A235A', accent: '#E67E22', irdai: '023', addr: '401/402, Prestige Towers, Residency Road, Bengaluru – 560025', extraIdLabel: 'e-Auth / Vidal Ref No.',   extraIdKey: 'eAuthNo'      },
          paramount:   { name: 'Paramount Health Services & Insurance TPA Pvt. Ltd.', headerBg: '#154360', headerText: '#FFFFFF', secBg: '#EBF5FB', secText: '#154360', accent: '#1F618D', irdai: '006', addr: '9/F, Universal Majestic, P.L. Lokhande Marg, Chembur West, Mumbai – 400043', extraIdLabel: 'PHS Auth No.', extraIdKey: 'tpaAuthRef' },
          raksha:      { name: 'Raksha Health Insurance TPA Pvt. Ltd.',             headerBg: '#7B241C', headerText: '#FFFFFF', secBg: '#FDEDEC', secText: '#7B241C', accent: '#3498DB', irdai: '018', addr: 'B-5, Maharani Bagh, New Delhi – 110065',                      extraIdLabel: 'Raksha Ref. No.',          extraIdKey: 'tpaAuthRef'  },
          fhpl:        { name: 'Family Health Plan (TPA) Ltd.',                     headerBg: '#D35400', headerText: '#FFFFFF', secBg: '#FEF9E7', secText: '#784212', accent: '#2980B9', irdai: '004', addr: '5-9-22, Shakkar Bhavan, Secretariat Road, Hyderabad – 500063', extraIdLabel: 'FHPL Auth Code',           extraIdKey: 'tpaAuthRef'  },
          safeway:     { name: 'Safeway Insurance TPA Pvt. Ltd.',                   headerBg: '#145A32', headerText: '#FFFFFF', secBg: '#E9F7EF', secText: '#145A32', accent: '#F39C12', irdai: '021', addr: '34/35, Jacaranda Marg, DLF Phase-II, Gurugram – 122002',      extraIdLabel: 'Safeway Ref. No.',         extraIdKey: 'tpaAuthRef'  },
          medsave:     { name: 'Medsave Health Insurance TPA Ltd.',                 headerBg: '#1B2631', headerText: '#FFFFFF', secBg: '#EBF5FB', secText: '#1B2631', accent: '#2E86C1', irdai: '019', addr: '28, Nehru Place, New Delhi – 110019',                        extraIdLabel: 'Medsave Auth ID',          extraIdKey: 'tpaAuthRef'  },
          ttk:         { name: 'TTK Healthcare Services Pvt. Ltd.',                 headerBg: '#1A5276', headerText: '#FFFFFF', secBg: '#EBF5FB', secText: '#1A5276', accent: '#17A589', irdai: '003', addr: '9, Jeevanhalli, Hosur Road, Bengaluru – 560095',              extraIdLabel: 'TTK Pre-Auth No.',         extraIdKey: 'tpaAuthRef'  },
          east_west:   { name: 'East West Assist TPA Pvt. Ltd.',                   headerBg: '#0E6655', headerText: '#FFFFFF', secBg: '#E8F8F5', secText: '#0E6655', accent: '#F39C12', irdai: '025', addr: 'Plot No. 35, Sector 44, Gurugram – 122003',                  extraIdLabel: 'EWA Auth Code',            extraIdKey: 'tpaAuthRef'  },
          dedicated:   { name: 'Dedicated Healthcare Services (India) TPA Pvt. Ltd.', headerBg: '#1C2833', headerText: '#FFFFFF', secBg: '#EBF5FB', secText: '#1C2833', accent: '#2E86C1', irdai: '010', addr: 'B-234, Okhla Industrial Area Phase-I, New Delhi – 110020', extraIdLabel: 'DHS Pre-Auth No.', extraIdKey: 'tpaAuthRef' },
          good_health: { name: 'Good Health TPA Services Pvt. Ltd.',               headerBg: '#784212', headerText: '#FFFFFF', secBg: '#FDFEFE', secText: '#784212', accent: '#27AE60', irdai: '015', addr: '6th Floor, Konark Heights, Baner, Pune – 411045',            extraIdLabel: 'Good Health Auth No.',     extraIdKey: 'tpaAuthRef'  },
          ericson:     { name: 'Ericson Insurance TPA Services Pvt. Ltd.',          headerBg: '#154360', headerText: '#FFFFFF', secBg: '#EBF5FB', secText: '#154360', accent: '#1ABC9C', irdai: '013', addr: '18/1, 2nd Floor, Connaught Place, New Delhi – 110001',       extraIdLabel: 'Ericson Auth ID',          extraIdKey: 'tpaAuthRef'  },
          md_india:    { name: 'MD India Health Insurance TPA (P) Ltd.',            headerBg: '#1A5276', headerText: '#FFFFFF', secBg: '#EBF5FB', secText: '#1A5276', accent: '#148F77', irdai: '040', addr: 'Unit No. 601-605, Vipul Square, Sohna Road, Gurugram – 122018', extraIdLabel: 'MD India Auth No.',     extraIdKey: 'tpaAuthRef'  },
          alankit:     { name: 'Alankit Assignments Ltd. (TPA)',                    headerBg: '#145A32', headerText: '#FFFFFF', secBg: '#E9F7EF', secText: '#145A32', accent: '#F39C12', irdai: '028', addr: 'Alankit House, 4/2, Asaf Ali Road, New Delhi – 110002',      extraIdLabel: 'CGHS Beneficiary ID',      extraIdKey: 'cghs_id'     },
          // ── In-house / Direct Settlement Insurers ────────────────────────────
          star_health:  { name: 'Star Health and Allied Insurance Co. Ltd.',         headerBg: '#C0001A', headerText: '#FFFFFF', secBg: '#FEF2F2', secText: '#7F0011', accent: '#F59E0B', irdai: 'Reg. 129', addr: '1, New Tank Street, Valluvar Kottam High Road, Nungambakkam, Chennai – 600034', extraIdLabel: 'Star Auth. No.',    extraIdKey: 'tpaAuthRef', direct: true },
          icici_lombard:{ name: 'ICICI Lombard General Insurance Co. Ltd.',          headerBg: '#003087', headerText: '#FFFFFF', secBg: '#EFF6FF', secText: '#003087', accent: '#F7941D', irdai: 'Reg. 115', addr: 'ICICI Lombard House, 414, Veer Savarkar Marg, Mumbai – 400025',               extraIdLabel: 'IL Pre-Auth No.',   extraIdKey: 'tpaAuthRef', direct: true },
          care_health:  { name: 'Care Health Insurance Ltd.',                        headerBg: '#00703C', headerText: '#FFFFFF', secBg: '#ECFDF5', secText: '#00703C', accent: '#F59E0B', irdai: 'Reg. 148', addr: '5th Floor, 19 Chawla House, Nehru Place, New Delhi – 110019',                    extraIdLabel: 'Care Auth. No.',    extraIdKey: 'tpaAuthRef', direct: true },
          bajaj_allianz:{ name: 'Bajaj Allianz General Insurance Co. Ltd.',          headerBg: '#003087', headerText: '#FFFFFF', secBg: '#EFF6FF', secText: '#003087', accent: '#C8102E', irdai: 'Reg. 113', addr: 'Bajaj Allianz House, Airport Road, Yerawada, Pune – 411006',                        extraIdLabel: 'BAGIC Auth. No.',   extraIdKey: 'tpaAuthRef', direct: true },
          niva_bupa:    { name: 'Niva Bupa Health Insurance Co. Ltd.',               headerBg: '#5B21B6', headerText: '#FFFFFF', secBg: '#F5F3FF', secText: '#5B21B6', accent: '#F59E0B', irdai: 'Reg. 145', addr: 'C-98, 3rd Floor, Lawrence Road Industrial Area, New Delhi – 110035',              extraIdLabel: 'Niva Bupa Ref. No.',extraIdKey: 'tpaAuthRef', direct: true },
          manipal_cigna:{ name: 'ManipalCigna Health Insurance Co. Ltd.',            headerBg: '#0E7490', headerText: '#FFFFFF', secBg: '#ECFEFF', secText: '#0E7490', accent: '#F59E0B', irdai: 'Reg. 151', addr: '401/402, Paradigm B Wing, Mindspace, Malad West, Mumbai – 400064',                extraIdLabel: 'MCigna Auth. No.',  extraIdKey: 'tpaAuthRef', direct: true },
          galaxy:       { name: 'Galaxy Health Insurance Co. Ltd.',                  headerBg: '#1D4ED8', headerText: '#FFFFFF', secBg: '#EFF6FF', secText: '#1D4ED8', accent: '#F59E0B', irdai: 'Reg. 157', addr: '2nd Floor, Chennai Citi Centre, 10/11, Dr. Radhakrishnan Salai, Chennai – 600004',extraIdLabel: 'Galaxy Auth. No.',  extraIdKey: 'tpaAuthRef', direct: true },
          generic:     { name: (ad.tpaName || 'TPA'),                               headerBg: '#1e1b4b', headerText: '#FFFFFF', secBg: '#eef2ff',  secText: '#3730a3', accent: '#6366f1', irdai: '',    addr: '',                                                          extraIdLabel: 'TPA Ref. No.',             extraIdKey: 'tpaAuthRef'  },
        };

        const cfg = TPA_CONFIG[tpaKey] || TPA_CONFIG['generic'];
        const tpaName     = ad.tpaName || cfg.name;
        const insurerName = ad.insurerName || preAuth.insurer || '';

        const W = 505; // content width
        let y = 40;

        // ── HEADER ──────────────────────────────────────────────────────────────
        // Top accent stripe
        doc.rect(45, y, W, 4).fillColor(cfg.accent).fill();
        // Main header bar
        doc.rect(45, y + 4, W, 52).fillColor(cfg.headerBg).fill();
        doc.fontSize(13).font('Helvetica-Bold').fillColor(cfg.headerText)
           .text('PRE-AUTHORISATION REQUEST FORM', 50, y + 10, { width: W, align: 'center' });
        doc.fontSize(9).font('Helvetica').fillColor(cfg.headerText)
           .text(tpaName.toUpperCase(), 50, y + 27, { width: W, align: 'center' });
        doc.fontSize(7.5).fillColor(cfg.headerText)
           .text(`Ref No: ${refNo}   |   Date: ${new Date().toLocaleDateString('en-IN')}   |   Insurer: ${insurerName || 'Insurance Company'}`, 50, y + 43, { width: W, align: 'center' });
        // Bottom accent stripe
        doc.rect(45, y + 56, W, 3).fillColor(cfg.accent).fill();
        y += 66;

        // ── Section header helper ────────────────────────────────────────────
        const sectionHeader = (title, yPos) => {
          doc.rect(45, yPos, W, 17).fillColor(cfg.secBg).fill();
          doc.moveTo(45, yPos).lineTo(49, yPos).strokeColor(cfg.accent).lineWidth(4).stroke();
          doc.fontSize(8.5).font('Helvetica-Bold').fillColor(cfg.secText)
             .text(`   ${title}`, 45, yPos + 4, { width: W });
          return yPos + 20;
        };

        const colW = W / 2;
        const row = (l1, v1, l2, v2, yy) => {
          this._field(doc, l1, v1, 48, yy, colW);
          this._field(doc, l2, v2, 48 + colW, yy, colW);
          return yy + 13;
        };

        // ── PART A: HOSPITAL / PROVIDER DETAILS ─────────────────────────────
        y = sectionHeader('PART A  –  HOSPITAL / PROVIDER DETAILS', y);
        y = row('Hospital Name:', hospital.name || '______________________', 'ROHINI ID:', hospital.rohiniId || '______________________', y);
        y = row('Address:', hospital.address || '______________________', 'City / State:', hospital.city || '______________________', y);
        y = row('Phone / Email:', hospital.phone || '______________________', 'Provider / Panel Code:', hospital.providerCode || extra.providerCode || '______________________', y);
        this._hr(doc, y + 2); y += 7;

        // ── PART B: PATIENT / MEMBER DETAILS ────────────────────────────────
        y = sectionHeader('PART B  –  PATIENT / MEMBER DETAILS', y);
        const patient = preAuth.patient || {};
        const patientName = patient.firstName
          ? `${patient.firstName} ${patient.lastName || ''}`.trim()
          : (preAuth.patientName || preAuth.memberName || ad.memberName || '');
        const dob    = patient.dateOfBirth || patient.dob || '';
        const gender = patient.gender || '';
        const mobile = patient.phoneNumber || patient.mobile || '';

        y = row('Patient / Member Name:', patientName, 'Date of Birth:', dob, y);
        y = row('Gender:', gender, 'Mobile No.:', mobile, y);
        y = row('ABHA ID (Health ID):', patient.abhaId || '', 'UHID / MR No.:', String(patient.id || preAuth.patientId || ''), y);
        this._hr(doc, y + 2); y += 7;

        // ── PART C: POLICY / INSURANCE DETAILS ──────────────────────────────
        y = sectionHeader('PART C  –  POLICY / INSURANCE DETAILS', y);
        // Resolve TPA-specific extra ID
        const extraIdValue = (() => {
          const k = cfg.extraIdKey;
          if (k === 'tpaAuthRef') return ad.tpaAuthRef || preAuth.authRef || '';
          if (k === 'eAuthNo')    return extra.eAuthNo || '';
          if (k === 'cghs_id')   return extra.cghsId || extra.cghs_id || '';
          return extra[k] || '';
        })();

        // TPA member/enroll ID (shown for specific TPAs)
        const memberIdLabel = tpaKey === 'medi_assist' ? 'MA Provider Code' :
                              tpaKey === 'fhpl'         ? 'FHPL Member ID'   :
                              tpaKey === 'ttk'          ? 'TTK Member ID'    :
                              tpaKey === 'alankit'      ? 'CGHS Beneficiary ID' : null;
        const memberIdValue = tpaKey === 'medi_assist' ? (extra.providerCode || '') :
                              tpaKey === 'fhpl'         ? (extra.fhplMemberId || '') :
                              tpaKey === 'ttk'          ? (extra.ttkMemberId || '') :
                              tpaKey === 'alankit'      ? (extra.cghsId || extra.cghs_id || '') : null;

        y = row('Policy No.:', preAuth.policyNumber || ad.policyNumber || '', 'Sum Insured (₹):', ad.sumInsured ? Number(ad.sumInsured).toLocaleString('en-IN') : '___________', y);
        y = row('Insurer / Company:', insurerName, cfg.direct ? 'Direct Settlement' : 'TPA Name:', cfg.direct ? cfg.name : tpaName, y);
        y = row(`${cfg.extraIdLabel}:`, extraIdValue, memberIdLabel ? `${memberIdLabel}:` : 'Group / Corporate:', memberIdValue ?? '', y);
        this._hr(doc, y + 2); y += 7;

        // ── PART D: ADMISSION DETAILS ────────────────────────────────────────
        y = sectionHeader('PART D  –  ADMISSION DETAILS', y);
        const admType = ad.admissionType || '';
        const cappedAdmType = admType ? admType.charAt(0).toUpperCase() + admType.slice(1) : '';
        y = row('Type of Admission:', cappedAdmType, 'Planned Date of Admission:', ad.admissionDate ? new Date(ad.admissionDate).toLocaleDateString('en-IN') : '', y);
        y = row('Treating Doctor:', ad.doctorName || '', 'Estimated Duration (days):', String(ad.expectedDuration || ''), y);
        y = row('Ward / Room Type:', ad.ward || ad.roomType || '', 'Room Tariff / Day (₹):', ad.roomRatePerDay ? `₹${Number(ad.roomRatePerDay).toLocaleString('en-IN')}` : '', y);
        y = row('Expected ICU Days:', String(ad.icuDays || '0'), 'ICU Tariff / Day (₹):', ad.icuRate ? `₹${Number(ad.icuRate).toLocaleString('en-IN')}` : '', y);
        this._hr(doc, y + 2); y += 7;

        // ── PART E: DIAGNOSIS & CLINICAL DETAILS ────────────────────────────
        y = sectionHeader('PART E  –  DIAGNOSIS & CLINICAL DETAILS', y);
        const diagnosis  = ad.diagnosis || pp.diagnosis || preAuth.diagnosis || '';
        const procedure  = ad.procedure || pp.description || preAuth.procedure || '';
        const treatment  = ad.proposedTreatment || pp.proposedTreatment || '';
        const justification = ad.clinicalJustification || '';

        y = row('Primary Diagnosis:', diagnosis, 'ICD-10 Code:', ad.icdCode || pp.icdCode || '', y);
        y = row('Proposed Procedure:', procedure, 'Procedure Code (ICD-PCS):', ad.procedureCode || pp.code || '', y);

        if (treatment) {
          doc.fontSize(8).font('Helvetica-Bold').fillColor('#444444').text('Proposed Treatment Plan:', 48, y, { width: colW * 0.40, continued: false });
          doc.fontSize(8).font('Helvetica').fillColor('#000000').text(treatment, 48 + colW * 0.40, y, { width: W - colW * 0.40 });
          y += 13;
        }
        if (justification) {
          doc.fontSize(8).font('Helvetica-Bold').fillColor('#444444').text('Clinical Justification:', 48, y, { width: colW * 0.40, continued: false });
          doc.fontSize(8).font('Helvetica').fillColor('#000000').text(justification, 48 + colW * 0.40, y, { width: W - colW * 0.40 });
          y += 13;
        }

        // Past hospitalization (IRDAI required field)
        const pastHosp = ad.pastHospitalization || '';
        y = row('Past Hospitalization (last 4 yrs):', pastHosp || 'None', 'Surgical Management:', ad.surgicalManagement || '', y);
        this._hr(doc, y + 2); y += 7;

        // ── PART F: ESTIMATED COST BREAKUP ───────────────────────────────────
        y = sectionHeader('PART F  –  ESTIMATED COST BREAKUP', y);
        const estimatedAmount = preAuth.estimatedAmount || 0;
        const days    = Number(ad.expectedDuration) || 0;
        const icuDays = Number(ad.icuDays) || 0;
        const roomCost = (Number(ad.roomRatePerDay) || 0) * days;
        const icuCost  = (Number(ad.icuRate) || 0) * icuDays;

        // Table header
        const tblX = 48, tblW = W - 6;
        doc.rect(tblX, y, tblW * 0.65, 13).fillColor(cfg.secBg).fill();
        doc.rect(tblX + tblW * 0.65, y, tblW * 0.35, 13).fillColor(cfg.secBg).fill();
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor(cfg.secText)
           .text('Cost Head', tblX + 3, y + 3, { width: tblW * 0.62 });
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor(cfg.secText)
           .text('Est. Amount (₹)', tblX + tblW * 0.65 + 3, y + 3, { width: tblW * 0.32 });
        y += 14;

        const costItems = [
          ['Room / Bed Charges',                    roomCost > 0 ? `₹${roomCost.toLocaleString('en-IN')}` : '___________'],
          ['ICU Charges',                           icuCost > 0  ? `₹${icuCost.toLocaleString('en-IN')}`  : '___________'],
          ['Surgeon / Specialist Fees',             '___________'],
          ['Anaesthetist Fees',                     '___________'],
          ['OT Charges / Procedure Charges',        '___________'],
          ['Medicines, Consumables & Implants',     '___________'],
          ['Investigations / Lab / Radiology',      '___________'],
          ['Physiotherapy / Rehabilitation',        '___________'],
          ['Other Miscellaneous Charges',           '___________'],
        ];
        costItems.forEach(([label, val], i) => {
          const bg = i % 2 === 0 ? '#FFFFFF' : '#F9FAFB';
          doc.rect(tblX, y, tblW, 12).fillColor(bg).fill();
          doc.rect(tblX, y, tblW, 12).strokeColor('#E5E7EB').lineWidth(0.3).stroke();
          doc.fontSize(7.5).font('Helvetica').fillColor('#111827')
             .text(label, tblX + 3, y + 2, { width: tblW * 0.62 });
          doc.fontSize(7.5).font('Helvetica-Bold').fillColor(cfg.headerBg)
             .text(val, tblX + tblW * 0.65, y + 2, { width: tblW * 0.33, align: 'right' });
          y += 12;
        });

        doc.rect(tblX, y, tblW, 16).fillColor(cfg.headerBg).fill();
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#FFFFFF')
           .text('TOTAL ESTIMATED AMOUNT', tblX + 3, y + 4, { width: tblW * 0.62 });
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor(cfg.accent)
           .text(`₹${Number(estimatedAmount).toLocaleString('en-IN')}`, tblX + tblW * 0.65, y + 4, { width: tblW * 0.33, align: 'right' });
        y += 18;

        if (preAuth.approvedAmount) {
          doc.fontSize(8).font('Helvetica-Bold').fillColor('#15803d')
             .text(`Approved Amount: ₹${Number(preAuth.approvedAmount).toLocaleString('en-IN')}`, 48, y);
          y += 13;
        }
        this._hr(doc, y + 2); y += 7;

        // ── PART G: DOCUMENTS CHECKLIST ──────────────────────────────────────
        y = sectionHeader('PART G  –  DOCUMENTS SUBMITTED / ENCLOSED', y);
        const DOCS = [
          'Duly filled Pre-Auth Form (signed by treating doctor)',
          'Indoor case papers / Clinical summary',
          'Investigation reports (pathology, radiology, ECG, etc.)',
          'Previous discharge summary (if re-admission)',
          'ID & Insurance card copy / e-card',
          'ABHA card / PMJAY card (if applicable)',
          "Treating Doctor's certificate / prescription",
          'Any other relevant document',
        ];
        const midX = 48 + W / 2;
        DOCS.forEach((d, i) => {
          const xPos = i % 2 === 0 ? 48 : midX + 3;
          const yPos = y + Math.floor(i / 2) * 12;
          doc.rect(xPos, yPos + 2, 7, 7).strokeColor(cfg.accent).lineWidth(0.6).stroke();
          doc.fontSize(7).font('Helvetica').fillColor('#111827').text(d, xPos + 10, yPos + 2, { width: W / 2 - 16 });
        });
        y += Math.ceil(DOCS.length / 2) * 12 + 5;
        this._hr(doc, y + 2); y += 7;

        // ── PART H: UNDERTAKING & DECLARATION ───────────────────────────────
        y = sectionHeader('PART H  –  HOSPITAL UNDERTAKING & DECLARATION', y);
        doc.fontSize(7).font('Helvetica').fillColor('#374151')
           .text(
             'I/We hereby declare that: (a) the information furnished above is true, correct and complete to the best of my/our knowledge; (b) the patient named above is admitted/proposed to be admitted for the treatment specified; (c) the estimated cost is based on current tariff; and (d) I/We authorise the TPA/Insurer to verify any document, obtain medical details and conduct audit as required for processing this request. I/We understand that pre-authorisation does not guarantee payment and final settlement is subject to policy terms, underwriting conditions, and documents verification.',
             48, y, { width: W }
           );
        y += 30;

        const sigColW = W / 3;
        ['Treating Doctor\n(Name, Reg. No. & Stamp)', 'Hospital Authority\n(Authorised Signatory & Stamp)', 'Patient / Attendant\n(Signature & Date)'].forEach((label, i) => {
          const xPos = 48 + i * sigColW;
          doc.moveTo(xPos, y + 28).lineTo(xPos + sigColW - 8, y + 28).strokeColor('#9CA3AF').lineWidth(0.5).stroke();
          doc.fontSize(6.5).font('Helvetica').fillColor('#6B7280').text(label, xPos, y + 31, { width: sigColW - 8, align: 'center' });
        });
        y += 44;

        // ── FOOTER ───────────────────────────────────────────────────────────
        doc.rect(45, y, W, 1).fillColor(cfg.accent).fill();
        y += 4;
        const irdaiLabel = cfg.direct ? 'IRDAI Reg. No.' : 'IRDAI TPA License No.';
        doc.fontSize(6).font('Helvetica').fillColor('#6B7280')
           .text(
             `${tpaName}${cfg.irdai ? `  ·  ${irdaiLabel} ${cfg.irdai}` : ''}${cfg.addr ? `  ·  ${cfg.addr}` : ''}`,
             48, y, { width: W, align: 'center' }
           );
        doc.fontSize(6).fillColor('#9CA3AF')
           .text(`Generated by Mediczy Hospital Insurance Portal  ·  ${new Date().toLocaleString('en-IN')}  ·  For pre-authorisation only; does not guarantee approval.`, 48, y + 9, { width: W, align: 'center' });

        doc.end();
        stream.on('finish', () => resolve(`/pdfs/pre-auth/${filename}`));
        stream.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }
}

export default new PDFGeneratorService();
