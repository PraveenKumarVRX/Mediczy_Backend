/**
 * Prescription Routes
 * CRUD API for doctors to create prescriptions and patients to download them
 * Integrated with EHR and Health Diary for comprehensive patient records
 */

import express from 'express';
import { body, validationResult, param } from 'express-validator';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import { Prescription, Appointment, User, Doctor } from '../models/index.js';
import { EHRRecord, HealthDiary } from '../models/index.js';
import { authUser, authDoctor } from '../middleware/auth.middleware.js';
import { JWT_CONFIG } from '../config/auth.config.js';
import { COOKIE_NAMES } from '../config/cookies.config.js';
import AuditLog from '../models/auditLog.model.intelligent.js';
import n8nService from '../services/n8n.service.js';
import whatsappProductionService from '../services/whatsapp-production.service.js';
import * as appointmentRepository from '../repositories/appointment.repository.js';
import * as prescriptionRepository from '../repositories/prescription.repository.js';
import { resolveActor, isOwnedByActor } from '../services/appointment-identity.service.js';

const router = express.Router();
// Ensure request bodies are parsed even if app-level parser order changes.
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const canAccessPrescriptionPdf = (decoded, prescription) => {
  if (!decoded) return false;
  if (decoded.role === 'doctor' || decoded.role === 'admin' || decoded.role === 'super_admin') {
    return true;
  }

  const decodedIds = [decoded.id, decoded.userId, decoded.user_id].filter(value => value !== undefined && value !== null);
  return decodedIds.some(value => String(value) === String(prescription.patientId));
};

// Helper function to render prescription HTML
const renderPrescriptionHTML = (prescription) => {
  const templatePath = path.join(__dirname, '../templates/documents/prescription-template.html');
  let template = fs.readFileSync(templatePath, 'utf-8');

  // Basic replacements
  const replacements = {
    '{{clinicName}}': prescription.clinicName || prescription.clinicDetails?.name || 'Mediczy Healthcare',
    '{{clinicAddress}}': prescription.clinicAddress || prescription.clinicDetails?.address || 'Virtual Consultation Platform',
    '{{clinicPhone}}': prescription.clinicPhone || prescription.clinicDetails?.phone || '+91-XXX-XXX-XXXX',
    '{{clinicEmail}}': prescription.clinicEmail || prescription.clinicDetails?.email || 'support@mediqzy.com',
    '{{clinicWebsite}}': 'www.mediczy.com',
    '{{patientName}}': prescription.patientName || 'N/A',
    '{{patientAge}}': prescription.patientAge || 'N/A',
    '{{patientGender}}': prescription.patientGender || 'N/A',
    '{{patientId}}': `P${String(prescription.patientId).padStart(6, '0')}`,
    '{{patientPhone}}': prescription.patientPhone || 'N/A',
    '{{prescriptionDate}}': new Date(prescription.createdAt).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric'
    }),
    '{{prescriptionId}}': prescription.prescriptionId,
    '{{bloodPressure}}': prescription.vitals?.bloodPressure || 'N/A',
    '{{pulse}}': prescription.vitals?.pulse || 'N/A',
    '{{temperature}}': prescription.vitals?.temperature || 'N/A',
    '{{weight}}': prescription.vitals?.weight || 'N/A',
    '{{chiefComplaints}}': prescription.chiefComplaints || 'As discussed during consultation',
    '{{diagnosis}}': prescription.diagnosis || 'N/A',
    '{{followUpDate}}': prescription.followUpDate
      ? new Date(prescription.followUpDate).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'long', year: 'numeric'
      })
      : 'As needed',
    '{{validityDays}}': prescription.validityDays || 30,
    '{{doctorName}}': prescription.doctorName || 'Doctor',
    '{{doctorQualifications}}': prescription.doctorQualifications || 'MBBS, MD',
    '{{doctorSpecialty}}': prescription.doctorSpecialty || prescription.specialty || 'General Medicine',
    '{{doctorRegNo}}': prescription.doctorRegNo || prescription.registrationNumber || 'N/A',
    '{{doctorId}}': prescription.doctorId || 'N/A',
    '{{generatedDateTime}}': new Date().toLocaleString('en-IN')
  };

  // Apply replacements
  for (const [key, value] of Object.entries(replacements)) {
    template = template.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
  }

  // Handle medications table
  const medications = prescription.medications || [];
  let medicationsHTML = '';
  medications.forEach((med, index) => {
    medicationsHTML += `
      <tr>
        <td>${index + 1}</td>
        <td>
          <div class="med-name">${med.name || 'N/A'}</div>
          <div class="med-composition">${med.composition || ''}</div>
        </td>
        <td>${med.dosage || 'As directed'}</td>
        <td>${med.frequency || 'As directed'}</td>
        <td>${med.duration || 'As directed'}</td>
        <td>${med.quantity || '-'}</td>
      </tr>
    `;
  });

  // Replace medications placeholder
  template = template.replace(/\{\{#medications\}\}[\s\S]*?\{\{\/medications\}\}/g, medicationsHTML);

  // Handle lab tests
  const labTests = prescription.labTests || [];
  if (labTests.length > 0) {
    let testsHTML = '';
    labTests.forEach(test => {
      testsHTML += `<div class="test-item">🔬 ${test.testName || test}</div>`;
    });
    template = template.replace('{{#hasTests}}', '');
    template = template.replace('{{/hasTests}}', '');
    template = template.replace(/\{\{#tests\}\}[\s\S]*?\{\{\/tests\}\}/g, testsHTML);
  } else {
    // Remove tests section if no tests
    template = template.replace(/\{\{#hasTests\}\}[\s\S]*?\{\{\/hasTests\}\}/g, '');
  }

  // Handle instructions
  const instructions = prescription.instructions || ['Complete the full course of medications', 'Contact doctor if symptoms worsen'];
  let instructionsHTML = '';
  instructions.forEach(inst => {
    const instruction = typeof inst === 'string' ? inst : inst.instruction;
    instructionsHTML += `<li>✓ ${instruction}</li>`;
  });
  template = template.replace(/\{\{#instructions\}\}[\s\S]*?\{\{\/instructions\}\}/g, instructionsHTML);

  return template;
};

/**
 * Notify patient that their prescription is ready.
 * Sends a WhatsApp message and an email (both fire-and-forget).
 * Returns the prescription PDF URL so it can be included in the API response.
 *
 * @param {object} prescription - Sequelize Prescription instance
 * @param {object|null} patient  - Sequelize User instance (may be null for walk-in patients)
 */
const notifyPatientPrescriptionReady = async (prescription, patient) => {
  const baseUrl = process.env.FRONTEND_URL || 'https://app.mediqzy.com';

  // Build a 30-day JWT so the patient can open the PDF without logging in
  const { default: jwt } = await import('jsonwebtoken');
  const shareToken = jwt.sign(
    { id: prescription.patientId, role: 'user' },
    JWT_CONFIG.SECRET,
    { expiresIn: '30d' }
  );

  const pdfUrl = `${baseUrl}/api/prescriptions/${prescription.prescriptionId}/pdf?token=${shareToken}`;
  const viewUrl = `${baseUrl}/my-prescriptions`;

  const patientEmail = patient?.email;
  const patientPhone = prescription.patientPhone || patient?.phoneNumber || patient?.phone;
  const patientName = prescription.patientName || 'Patient';
  const doctorName = prescription.doctorName || 'your doctor';
  const medications = prescription.medications?.length
    ? prescription.medications.map(m => m.name).join(', ')
    : 'as prescribed';
  const followUpDate = prescription.followUpDate
    ? new Date(prescription.followUpDate).toLocaleDateString('en-IN')
    : 'as advised';

  // 1. WhatsApp (fire-and-forget)
  if (patientPhone) {
    Promise.resolve().then(async () => {
      try {
        await whatsappProductionService.sendPrescriptionReady({
          to: `+91${patientPhone.replace(/[^0-9]/g, '').replace(/^91/, '')}`,
          patientName,
          doctorName,
          prescriptionUrl: pdfUrl,
          medications,
          followUpDate
        });
        console.log(`✅ Prescription WhatsApp sent to ${patientPhone}`);
      } catch (err) {
        console.error('Prescription WhatsApp notification failed:', err.message);
      }
    });
  }

  // 2. Email (fire-and-forget)
  if (patientEmail) {
    Promise.resolve().then(async () => {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: process.env.SMTP_PORT === '465',
          auth: {
            user: process.env.SMTP_USER || process.env.EMAIL_FROM || 'noreply@mediczy.com',
            pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD || ''
          },
          tls: { rejectUnauthorized: false }
        });

        const html = `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
            <div style="background:#1a73e8;padding:20px;border-radius:8px 8px 0 0;">
              <h1 style="color:#fff;margin:0;font-size:22px;">🏥 Your Prescription is Ready</h1>
            </div>
            <div style="background:#f9f9f9;padding:24px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px;">
              <p style="font-size:16px;">Dear <strong>${patientName}</strong>,</p>
              <p>Your prescription from <strong>Dr. ${doctorName}</strong> is ready.</p>
              <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#555;width:140px;">Prescription ID</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">${prescription.prescriptionId}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#555;">Diagnosis</td><td style="padding:8px;border-bottom:1px solid #eee;">${prescription.diagnosis || 'As discussed'}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#555;">Medications</td><td style="padding:8px;border-bottom:1px solid #eee;">${medications}</td></tr>
                <tr><td style="padding:8px;color:#555;">Follow-up</td><td style="padding:8px;">${followUpDate}</td></tr>
              </table>
              <div style="text-align:center;margin:24px 0;">
                <a href="${pdfUrl}" style="background:#1a73e8;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;margin-right:12px;">📥 Download PDF</a>
                <a href="${viewUrl}" style="background:#34a853;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">📱 View Online</a>
              </div>
              <p style="font-size:13px;color:#888;margin-top:20px;">Please follow the prescribed medications and instructions carefully. Contact your doctor if symptoms worsen.</p>
            </div>
          </div>`;

        await transporter.sendMail({
          from: `"Mediczy Healthcare" <${process.env.SMTP_USER || process.env.EMAIL_FROM || 'noreply@mediczy.com'}>`,
          to: patientEmail,
          subject: `Your Prescription from Dr. ${doctorName} is Ready – ${prescription.prescriptionId}`,
          html,
          text: `Your prescription from Dr. ${doctorName} is ready.\n\nPrescription ID: ${prescription.prescriptionId}\nDiagnosis: ${prescription.diagnosis}\nMedications: ${medications}\nFollow-up: ${followUpDate}\n\nDownload PDF: ${pdfUrl}\nView Online: ${viewUrl}`
        });
        console.log(`✅ Prescription email sent to ${patientEmail}`);
      } catch (err) {
        console.error('Prescription email notification failed:', err.message);
      }
    });
  }

  return pdfUrl;
};

/**
 * @route   GET /api/prescriptions
 * @desc    Alias for GET /api/prescriptions/doctor — returns the doctor's prescription list
 * @access  Private (Doctor)
 */
router.get('/', authDoctor, async (req, res) => {
  const doctorId = req.doctor?.id || req.doctor?.dataValues?.id || req.doctor?._id;
  if (!doctorId) return res.status(400).json({ success: false, message: 'Doctor ID not found' });
  try {
    const prescriptions = await prescriptionRepository.findAllForDoctor(req, doctorId);
    return res.json({ success: true, count: prescriptions.length, prescriptions: prescriptions.map(p => p.toJSON()) });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch prescriptions', error: error.message });
  }
});

/**
 * @route   POST /api/prescriptions/from-appointment/:appointmentId
 * @desc    Create prescription from appointment/consultation (Doctor only)
 * @access  Private (Doctor)
 */
router.post('/from-appointment/:appointmentId', authDoctor, [
  param('appointmentId').isInt().withMessage('Valid appointment ID is required'),
  body('diagnosis').notEmpty().withMessage('Diagnosis is required'),
  body('medications').isArray({ min: 1 }).withMessage('At least one medication is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { appointmentId } = req.params;
    const {
      diagnosis,
      chiefComplaints,
      medications,
      labTests,
      instructions,
      vitals,
      followUpDate,
      validityDays,
      notes
    } = req.body;

    // Get appointment details.
    // appointments has FORCE ROW LEVEL SECURITY — a bare findByPk() with no
    // RLS context always matched zero rows regardless of whether the
    // appointment existed. findByIdForDoctor also scopes the lookup to this
    // doctor via candidate resolution instead of a direct id comparison.
    const actor = await resolveActor(req);
    const appointment = await appointmentRepository.findByIdForDoctor(req, appointmentId);
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    // Verify doctor access
    if (!isOwnedByActor(appointment, actor)) {
      return res.status(403).json({ success: false, message: 'You can only create prescriptions for your own appointments' });
    }

    // Get doctor info
    const doctor = req.doctor;
    if (!doctor || !doctor.id) {
      return res.status(403).json({ success: false, message: 'Doctor access required' });
    }

    // Get patient info
    const patient = await User.findByPk(appointment.userId);
    let patientData = {
      patientName: appointment.patientName || 'Patient',
      patientAge: null,
      patientGender: 'Not specified',
      patientPhone: appointment.patientPhone
    };

    if (patient) {
      let patientAge = null;
      if (patient.dateOfBirth) {
        const dob = new Date(patient.dateOfBirth);
        const today = new Date();
        patientAge = today.getFullYear() - dob.getFullYear();
      }

      patientData = {
        patientName: `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || appointment.patientName,
        patientAge,
        patientGender: patient.gender || 'Not specified',
        patientPhone: patient.phoneNumber || patient.phone || appointment.patientPhone
      };
    }

    // Determine if this was an online consultation
    const consultationType = appointment.consultationType || 'in-person';
    const clinicAddress = consultationType === 'online'
      ? 'Online Consultation / Telemedicine'
      : (doctor.clinicAddress || doctor.address?.street || 'Clinic');

    // Create prescription linked to appointment, then mark the appointment
    // completed — both prescriptions and appointments have FORCE ROW LEVEL
    // SECURITY, so both writes must share one RLS-scoped transaction or the
    // INSERT/UPDATE are rejected outright ("new row violates row-level
    // security policy").
    const prescription = await appointmentRepository.withTransaction(req, async (transaction) => {
      const created = await Prescription.create({
        appointmentId: appointment.id,
        patientId: appointment.userId,
        ...patientData,
        doctorId: doctor.id,
        doctorName: `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim(),
        doctorQualifications: Array.isArray(doctor.qualifications)
          ? doctor.qualifications.join(', ')
          : (doctor.qualifications || doctor.qualification || 'MBBS'),
        doctorRegNo: doctor.registrationNumber || doctor.licenseNumber || 'N/A',
        specialty: doctor.specialization || 'General Medicine',
        clinicName: doctor.clinicHospitalName || doctor.clinicName || 'Mediczy Healthcare',
        clinicAddress,
        clinicPhone: doctor.phone || doctor.phoneNumber || doctor.clinicPhone,
        clinicEmail: doctor.email,
        clinicDetails: {
          name: doctor.clinicHospitalName || doctor.clinicName || 'Mediczy Healthcare',
          address: clinicAddress,
          phone: doctor.phone || doctor.phoneNumber,
          email: doctor.email,
          specialty: doctor.specialization,
          consultationType
        },
        diagnosis,
        chiefComplaints: typeof chiefComplaints === 'string'
          ? [chiefComplaints]
          : (Array.isArray(chiefComplaints) ? chiefComplaints : appointment.symptoms || []),
        medications,
        labTests: labTests || [],
        instructions: instructions || [
          'Complete the full course of medications',
          'Take medicines as directed',
          'Contact doctor if symptoms worsen'
        ],
        vitals: vitals || {},
        followUpDate,
        validityDays: validityDays || 30,
        notes: notes || appointment.notes,
        status: 'draft'
      }, { transaction });

      // Update appointment with prescription reference
      await Appointment.update(
        {
          prescription: created.prescriptionId,
          status: 'completed'
        },
        { where: { id: appointmentId }, transaction }
      );

      return created;
    });

    // Notify patient (WhatsApp + email, fire-and-forget)
    let notifyPdfUrl = null;
    try {
      notifyPdfUrl = await notifyPatientPrescriptionReady(prescription, patient || null);
    } catch (notifyErr) {
      console.error('Prescription notification error (non-fatal):', notifyErr.message);
    }

    res.status(201).json({
      success: true,
      message: `Prescription created successfully for ${consultationType} consultation`,
      prescription: {
        id: prescription.id,
        prescriptionId: prescription.prescriptionId,
        patientName: prescription.patientName,
        diagnosis: prescription.diagnosis,
        medicationsCount: prescription.medications.length,
        consultationType,
        status: prescription.status,
        createdAt: prescription.createdAt,
        expiresAt: prescription.expiresAt,
        pdfUrl: notifyPdfUrl || `https://app.mediqzy.com/api/prescriptions/${prescription.prescriptionId}/pdf`,
        shareUrl: `https://app.mediqzy.com/api/prescriptions/${prescription.prescriptionId}/share/whatsapp`
      }
    });
  } catch (error) {
    console.error('Create prescription from appointment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create prescription',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/prescriptions
 * @desc    Create a new prescription (Doctor only)
 * @access  Private (Doctor)
 */
router.post('/', authDoctor, [
  body('userId').optional(),
  body('patientId').optional(),
  body('diagnosis').notEmpty().withMessage('Diagnosis is required'),
  body('medications').isArray({ min: 1 }).withMessage('At least one medication is required')
    .custom((medications) => {
      for (let i = 0; i < medications.length; i++) {
        const med = medications[i];
        const medName = med?.name || med?.medicineName || med?.drugName;
        if (!medName || !String(medName).trim()) {
          throw new Error(`Medication ${i + 1}: Medicine name is required`);
        }
      }
      return true;
    })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const {
      appointmentId,
      userId,
      patientId,
      patientName: reqPatientName,
      patientAge: reqPatientAge,
      patientGender: reqPatientGender,
      patientPhone: reqPatientPhone,
      diagnosis,
      chiefComplaints,
      medications,
      labTests,
      instructions,
      vitals,
      followUpDate: rawFollowUpDate,
      validityDays,
      notes
    } = req.body;

    // Sanitize date fields — mobile apps sometimes send 'Invalid date' strings
    const followUpDate = (() => {
      if (!rawFollowUpDate) return null;
      const d = new Date(rawFollowUpDate);
      return isNaN(d.getTime()) ? null : rawFollowUpDate;
    })();

    // Use patientId or userId
    const patientUserId = patientId || userId;

    // Get doctor info from authenticated request
    const doctor = req.doctor;
    if (!doctor || !doctor.id) {
      return res.status(403).json({ success: false, message: 'Doctor access required' });
    }

    // Get patient info if available, otherwise use provided data
    let patientData = {
      patientName: reqPatientName || 'Patient',
      patientAge: reqPatientAge,
      patientGender: reqPatientGender || 'Not specified',
      patientPhone: reqPatientPhone
    };

    if (patientUserId) {
      const patient = await User.findByPk(patientUserId);
      if (patient) {
        // Calculate patient age
        let patientAge = reqPatientAge;
        if (!patientAge && patient.dateOfBirth) {
          const dob = new Date(patient.dateOfBirth);
          const today = new Date();
          patientAge = today.getFullYear() - dob.getFullYear();
        }

        patientData = {
          patientName: reqPatientName || `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || 'Patient',
          patientAge,
          patientGender: reqPatientGender || patient.gender || 'Not specified',
          patientPhone: reqPatientPhone || patient.phoneNumber || patient.phone
        };
      }
    }

    const normalizedMedications = (Array.isArray(medications) ? medications : []).map((med) => ({
      name: String(med?.name || med?.medicineName || med?.drugName || '').trim(),
      composition: med?.composition || med?.strength || '',
      dosage: String(med?.dosage || med?.dose || med?.doseText || 'As directed').trim(),
      frequency: String(med?.frequency || med?.freq || med?.schedule || 'As directed').trim(),
      duration: String(med?.duration || med?.days || med?.period || 'As directed').trim(),
      quantity: med?.quantity || med?.qty || '',
      instructions: med?.instructions || med?.notes || '',
    }));

    const prescriptionPayload = {
      appointmentId,
      patientId: patientUserId,
      organization_id: doctor.organization_id || doctor.hospitalId || req.user?.organization_id || null,
      tenant_id: doctor.organization_id || doctor.hospitalId || req.user?.organization_id || null,
      ...patientData,
      doctorId: doctor.id,
      doctorName: `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim(),
      doctorQualifications: Array.isArray(doctor.qualifications)
        ? doctor.qualifications.join(', ')
        : (doctor.qualifications || doctor.qualification || 'MBBS'),
      doctorRegNo: doctor.registrationNumber || doctor.licenseNumber || 'N/A',
      specialty: doctor.specialization || 'General Medicine',
      clinicName: doctor.clinicHospitalName || doctor.clinicName || 'Mediczy Healthcare',
      clinicAddress: doctor.clinicAddress || doctor.address?.street || 'Online Consultation',
      clinicPhone: doctor.phone || doctor.phoneNumber || doctor.clinicPhone,
      clinicEmail: doctor.email,
      clinicDetails: {
        name: doctor.clinicHospitalName || doctor.clinicName || 'Mediczy Healthcare',
        address: doctor.clinicAddress || doctor.address?.street || 'Online Consultation',
        phone: doctor.phone || doctor.phoneNumber,
        email: doctor.email,
        specialty: doctor.specialization
      },
      diagnosis,
      chiefComplaints: typeof chiefComplaints === 'string'
        ? [chiefComplaints]
        : (Array.isArray(chiefComplaints) ? chiefComplaints : []),
      medications: normalizedMedications,
      labTests: labTests || [],
      instructions: instructions || [
        'Complete the full course of medications',
        'Take medicines as directed',
        'Contact doctor if symptoms worsen'
      ],
      vitals: vitals || {},
      followUpDate,
      validityDays: validityDays || 30,
      notes,
      status: 'draft'
    };

    const prescription = await prescriptionRepository.withTransaction(req, async (transaction) => {
      const created = await Prescription.create(prescriptionPayload, { transaction });

      // Update appointment with prescription reference if provided
      if (appointmentId) {
        await Appointment.update(
          { prescription: created.prescriptionId },
          { where: { id: appointmentId }, transaction }
        );
      }

      return created;
    });

    // Audit logging for prescription creation (HIPAA compliance)
    try {
      await AuditLog.create({
        userId: doctor.id,
        userType: 'doctor',
        userEmail: doctor.email,
        action: 'CREATE',
        resourceType: 'prescription',
        resourceId: prescription.id.toString(),
        dataFields: {
          prescriptionId: prescription.prescriptionId,
          patientName: prescription.patientName,
          patientId: patientUserId,
          diagnosis: prescription.diagnosis,
          medicationsCount: prescription.medications.length,
          status: 'draft'
        },
        changesAfter: {
          prescriptionId: prescription.prescriptionId,
          status: 'draft'
        },
        req,
        status: 'SUCCESS',
        statusCode: 201,
        isPHI: true,
        purpose: 'Prescription Create',
      });
    } catch (auditError) {
      console.error('Audit log creation failed:', auditError);
      // Don't fail the request if audit logging fails
    }

    res.status(201).json({
      success: true,
      message: 'Prescription created successfully',
      prescription: {
        id: prescription.id,
        prescriptionId: prescription.prescriptionId,
        patientName: prescription.patientName,
        diagnosis: prescription.diagnosis,
        medicationsCount: prescription.medications.length,
        status: prescription.status,
        createdAt: prescription.createdAt,
        expiresAt: prescription.expiresAt
      }
    });
  } catch (error) {
    console.error('Create prescription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create prescription',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/prescriptions/doctor
 * @desc    Get all prescriptions created by the logged-in doctor
 * @access  Private (Doctor)
 */
router.get('/doctor', authDoctor, async (req, res) => {
  try {
    // Get doctor ID from authenticated request
    const doctorId = req.doctor?.id || req.doctor?.dataValues?.id || req.doctor?._id;

    if (!doctorId) {
      return res.status(400).json({ success: false, message: 'Doctor ID not found' });
    }

    const prescriptions = await prescriptionRepository.findAllForDoctor(req, doctorId);

    const normalizeInstructions = (prescription) => {
      if (Array.isArray(prescription.adviceList) && prescription.adviceList.length > 0) {
        return prescription.adviceList;
      }
      if (typeof prescription.advice === 'string' && prescription.advice.trim()) {
        return prescription.advice
          .split(';')
          .map(item => item.trim())
          .filter(Boolean);
      }
      return [];
    };

    const normalizeLabTests = (labTests) => {
      if (!Array.isArray(labTests)) {
        return [];
      }

      return labTests
        .map((test) => {
          if (typeof test === 'string') {
            return test;
          }
          return test?.testName || test?.name || null;
        })
        .filter(Boolean);
    };

    const normalizedPrescriptions = prescriptions.map((prescription) => ({
      ...prescription.toJSON(),
      instructions: normalizeInstructions(prescription),
      labTests: normalizeLabTests(prescription.labTests)
    }));

    res.json({
      success: true,
      count: normalizedPrescriptions.length,
      prescriptions: normalizedPrescriptions
    });
  } catch (error) {
    console.error('Get doctor prescriptions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch prescriptions',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/prescriptions/patient
 * @desc    Get all prescriptions for the logged-in patient
 * @access  Private (Patient)
 */
router.get('/patient', authUser, async (req, res) => {
  try {
    const patientId = req.user.id;

    // Only return prescriptions that are visible to the patient (not drafts)
    const prescriptions = await prescriptionRepository.findAllForPatient(req, patientId, {
      status: ['issued', 'active', 'dispensed', 'expired'],
    });

    res.json({
      success: true,
      count: prescriptions.length,
      prescriptions
    });
  } catch (error) {
    console.error('Get patient prescriptions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch prescriptions',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/prescriptions/patient/adherence-summary
 * @desc    Adherence summary across active patient prescriptions
 * @access  Private (Patient)
 */
router.get('/patient/adherence-summary', authUser, async (req, res) => {
  try {
    const patientId = req.user.id;
    const prescriptions = await prescriptionRepository.findAllForPatient(req, patientId, {
      status: ['issued', 'active', 'dispensed'],
    });

    const summaries = prescriptions.map((rx) => {
      const tracking = rx.adherenceTracking || {};
      let total = 0;
      let taken = 0;
      Object.values(tracking).forEach((day) => {
        Object.values(day || {}).forEach((value) => {
          total += 1;
          if (value) taken += 1;
        });
      });
      const adherenceRate = total > 0 ? Math.round((taken / total) * 100) : 100;
      return {
        prescriptionId: rx.id,
        prescriptionNumber: rx.prescriptionId,
        doctorName: rx.doctorName,
        adherenceRate,
        adherenceTracking: tracking,
        medications: rx.medications || [],
      };
    });

    const overallRate = summaries.length
      ? Math.round(summaries.reduce((sum, item) => sum + item.adherenceRate, 0) / summaries.length)
      : 100;

    res.json({
      success: true,
      overallAdherenceRate: overallRate,
      prescriptions: summaries,
    });
  } catch (error) {
    console.error('Adherence summary error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch adherence summary' });
  }
});

/**
 * @route   POST /api/prescriptions/:id/adherence
 * @desc    Record medication dose taken / missed for adherence tracking
 * @access  Private (Patient owner)
 */
router.post('/:id/adherence', authUser, [
  body('medicationId').notEmpty().withMessage('medicationId is required'),
  body('taken').optional().isBoolean(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;
    const { medicationId, taken = true } = req.body;
    const userId = req.user.id;

    const prescription = await prescriptionRepository.findById(req, id);

    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }
    if (prescription.patientId !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { default: medicationReminderService } = await import('../services/medication-reminder-cron.service.js');
    await medicationReminderService.trackAdherence(prescription.id, String(medicationId), taken === true);

    await prescription.reload();
    const tracking = prescription.adherenceTracking || {};
    let total = 0;
    let takenCount = 0;
    Object.values(tracking).forEach((day) => {
      Object.values(day || {}).forEach((value) => {
        total += 1;
        if (value) takenCount += 1;
      });
    });
    const adherenceRate = total > 0 ? Math.round((takenCount / total) * 100) : 100;

    res.json({
      success: true,
      adherenceRate,
      adherenceTracking: tracking,
    });
  } catch (error) {
    console.error('Track adherence error:', error);
    res.status(500).json({ success: false, message: 'Failed to record adherence' });
  }
});

/**
 * @route   GET /api/prescriptions/:id
 * @desc    Get prescription by ID
 * @access  Private (Doctor or Patient owner)
 */
router.get('/:id', authUser, async (req, res) => {
  try {
    const { id } = req.params;

    // Find by ID or prescriptionId
    const prescription = await prescriptionRepository.findById(req, id);

    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }

    // Check access (patient or doctor)
    const userId = req.user.id;
    const userRole = req.user.role;

    if (userRole !== 'doctor' && prescription.patientId !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    res.json({
      success: true,
      prescription
    });
  } catch (error) {
    console.error('Get prescription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch prescription',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/prescriptions/patient/:patientId
 * @desc    Get all prescriptions for a patient
 * @access  Private (Patient or Doctor)
 */
router.get('/patient/:patientId', authUser, async (req, res) => {
  try {
    const { patientId } = req.params;
    const requesterId = req.user.id;
    const userRole = req.user.role;

    // Only allow patient to see their own or doctor to see any
    if (userRole !== 'doctor' && parseInt(patientId) !== requesterId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const prescriptions = await prescriptionRepository.findAllForPatient(req, patientId);

    res.json({
      success: true,
      count: prescriptions.length,
      prescriptions: prescriptions.map(p => ({
        id: p.id,
        prescriptionId: p.prescriptionId,
        doctorName: p.doctorName,
        diagnosis: p.diagnosis,
        medicationsCount: p.medications?.length || 0,
        status: p.status,
        createdAt: p.createdAt,
        followUpDate: p.followUpDate
      }))
    });
  } catch (error) {
    console.error('Get patient prescriptions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch prescriptions',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/prescriptions/my
 * @desc    Get current user's prescriptions
 * @access  Private
 */
router.get('/my/all', authUser, async (req, res) => {
  try {
    const patientId = req.user.id;

    const prescriptions = await prescriptionRepository.findAllForPatient(req, patientId, {
      status: ['issued', 'active', 'dispensed', 'expired'],
    });

    res.json({
      success: true,
      count: prescriptions.length,
      prescriptions
    });
  } catch (error) {
    console.error('Get my prescriptions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch prescriptions',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/prescriptions/appointment/:appointmentId
 * @desc    Get prescription for a specific appointment
 * @access  Private
 */
router.get('/appointment/:appointmentId', authUser, async (req, res) => {
  try {
    const { appointmentId } = req.params;

    const prescription = await prescriptionRepository.findByAppointmentId(req, appointmentId);

    if (!prescription) {
      return res.status(404).json({
        success: false,
        message: 'No prescription found for this appointment'
      });
    }

    // Check access
    const userId = req.user.id;
    const userRole = req.user.role;

    // Prescription's patient-identifying column is patientId, not userId.
    if (userRole !== 'doctor' && prescription.patientId !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    res.json({
      success: true,
      prescription
    });
  } catch (error) {
    console.error('Get appointment prescription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch prescription',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/prescriptions/doctor/issued
 * @desc    Get all prescriptions issued by the doctor
 * @access  Private (Doctor)
 */
router.get('/doctor/issued', authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor?.id || req.doctor?.dataValues?.id || req.doctor?._id;

    if (!doctorId) {
      return res.status(400).json({ success: false, message: 'Doctor ID not found' });
    }

    const page  = Math.max(0, parseInt(req.query.page  || '0',  10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));

    const { count: total, rows: prescriptions } = await prescriptionRepository.findAndCountAllForDoctor(req, doctorId, {
      limit,
      offset: page * limit,
    });

    res.json({
      success: true,
      count: prescriptions.length,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
      prescriptions: prescriptions.map(p => ({
        id: p.id,
        prescriptionId: p.prescriptionId,
        patientName: p.patientName,
        diagnosis: p.diagnosis,
        medicationsCount: p.medications?.length || 0,
        status: p.status,
        createdAt: p.createdAt
      }))
    });
  } catch (error) {
    console.error('Get doctor prescriptions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch prescriptions',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/prescriptions/:id
 * @desc    Update prescription (Doctor only, if not dispensed)
 * @access  Private (Doctor)
 */
router.put('/:id', authDoctor, async (req, res) => {
  try {
    const { id } = req.params;

    const fetchResult = await prescriptionRepository.withTransaction(req, async (transaction) => {
      const found = await prescriptionRepository.findByIdInTransaction(id, transaction);
      if (!found) return { notFound: true };

      // Check if doctor owns this prescription
      const doctorId = req.doctor?.id || req.doctor?.dataValues?.id || req.doctor?._id;
      if (found.doctorId !== doctorId) return { forbidden: true };

      // Cannot update issued/dispensed prescriptions
      if (['issued', 'dispensed', 'cancelled'].includes(found.status)) return { badStatus: found.status };

      return { prescription: found };
    });

    if (fetchResult.notFound) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }
    if (fetchResult.forbidden) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this prescription' });
    }
    if (fetchResult.badStatus) {
      return res.status(400).json({ success: false, message: `Cannot update ${fetchResult.badStatus} prescription` });
    }

    const prescription = fetchResult.prescription;

    const {
      diagnosis,
      chiefComplaints,
      medications,
      labTests,
      instructions,
      vitals,
      followUpDate: rawFollowUpDateUpdate,
      notes
    } = req.body;

    // Sanitize followUpDate — mobile apps can send "Invalid date" strings
    const followUpDate = (() => {
      if (rawFollowUpDateUpdate === undefined) return undefined;
      if (!rawFollowUpDateUpdate) return null;
      const d = new Date(rawFollowUpDateUpdate);
      return isNaN(d.getTime()) ? null : rawFollowUpDateUpdate;
    })();

    // Validate medications if provided
    if (medications && Array.isArray(medications)) {
      if (medications.length === 0) {
        return res.status(400).json({ success: false, message: 'At least one medication is required' });
      }
      for (let i = 0; i < medications.length; i++) {
        const med = medications[i];
        if (!med.name || !med.name.trim()) {
          return res.status(400).json({ success: false, message: `Medication ${i + 1}: Medicine name is required` });
        }
        if (!med.dosage || !med.dosage.trim()) {
          return res.status(400).json({ success: false, message: `Medication ${i + 1}: Dosage is required` });
        }
        if (!med.frequency || !med.frequency.trim()) {
          return res.status(400).json({ success: false, message: `Medication ${i + 1}: Frequency is required` });
        }
        if (!med.duration || !med.duration.trim()) {
          return res.status(400).json({ success: false, message: `Medication ${i + 1}: Duration is required` });
        }
      }
    }

    // Validate diagnosis if provided
    if (diagnosis && !diagnosis.trim()) {
      return res.status(400).json({ success: false, message: 'Diagnosis cannot be empty' });
    }

    // Store old values for audit trail
    const oldValues = {
      diagnosis: prescription.diagnosis,
      medications: prescription.medications,
      labTests: prescription.labTests,
      instructions: prescription.instructions,
      vitals: prescription.vitals,
      followUpDate: prescription.followUpDate,
      notes: prescription.notes
    };

    await prescriptionRepository.update(req, prescription, {
      diagnosis: diagnosis !== undefined ? diagnosis : prescription.diagnosis,
      chiefComplaints: chiefComplaints !== undefined ? chiefComplaints : prescription.chiefComplaints,
      medications: medications !== undefined ? medications : prescription.medications,
      labTests: labTests !== undefined ? labTests : prescription.labTests,
      instructions: instructions !== undefined ? instructions : prescription.instructions,
      vitals: vitals !== undefined ? vitals : prescription.vitals,
      followUpDate: followUpDate !== undefined ? followUpDate : prescription.followUpDate,
      notes: notes !== undefined ? notes : prescription.notes
    });

    // Audit logging for prescription update (HIPAA compliance)
    try {
      const doctorId = req.doctor?.id || req.doctor?.dataValues?.id || req.doctor?._id;
      await AuditLog.create({
        userId: doctorId,
        userType: 'doctor',
        userEmail: req.doctor?.email,
        action: 'UPDATE',
        resourceType: 'prescription',
        resourceId: prescription.id.toString(),
        dataFields: {
          prescriptionId: prescription.prescriptionId,
          patientName: prescription.patientName,
          status: prescription.status
        },
        changesBefore: oldValues,
        changesAfter: {
          diagnosis: prescription.diagnosis,
          medications: prescription.medications,
          labTests: prescription.labTests,
          instructions: prescription.instructions,
          vitals: prescription.vitals,
          followUpDate: prescription.followUpDate,
          notes: prescription.notes
        },
        req,
        status: 'SUCCESS',
        statusCode: 200,
        isPHI: true,
        purpose: 'Prescription Update',
      });
    } catch (auditError) {
      console.error('Audit log creation failed:', auditError);
    }

    res.json({
      success: true,
      message: 'Prescription updated successfully',
      prescription
    });
  } catch (error) {
    console.error('Update prescription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update prescription',
      error: error.message
    });
  }
});

/**
 * @route   PATCH /api/prescriptions/:id/status
 * @desc    Update prescription status (creates EHR & health diary when issued)
 * @access  Private (Doctor)
 */
router.patch('/:id/status', authDoctor, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['draft', 'issued', 'dispensed', 'cancelled', 'expired'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const prescription = await prescriptionRepository.findById(req, id);
    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }

    // Verify doctor ownership
    const doctorId = req.doctor?.id || req.doctor?.dataValues?.id || req.doctor?._id;
    if (prescription.doctorId !== doctorId) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this prescription' });
    }

    const previousStatus = prescription.status;
    await prescriptionRepository.update(req, prescription, {
      status,
      issuedAt: status === 'issued' ? new Date() : prescription.issuedAt
    });

    // Audit logging for prescription status change (HIPAA compliance)
    try {
      await AuditLog.create({
        userId: doctorId,
        userType: 'doctor',
        userEmail: req.doctor?.email,
        action: 'UPDATE',
        resourceType: 'prescription',
        resourceId: prescription.id.toString(),
        dataFields: {
          prescriptionId: prescription.prescriptionId,
          patientName: prescription.patientName,
          previousStatus,
          newStatus: status
        },
        changesBefore: { status: previousStatus },
        changesAfter: { status, issuedAt: status === 'issued' ? new Date() : null },
        req,
        status: 'SUCCESS',
        statusCode: 200,
        isPHI: true,
        purpose: `Prescription Status Update: ${previousStatus} → ${status}`,
      });
    } catch (auditError) {
      console.error('Audit log creation failed:', auditError);
    }

    // When prescription is issued, create EHR record, send patient notifications
    let ehrCreatedFlag = false;
    if (status === 'issued' && previousStatus !== 'issued' && prescription.patientId) {
      let ehrRecordId = null;
      try {
        // Create medical record entry
        const ehrRecord = await EHRRecord.createFromPrescription(prescription);
        ehrRecordId = ehrRecord.id;
        ehrCreatedFlag = true;
        console.log(`✅ Medical record created for prescription ${prescription.prescriptionId} (id=${ehrRecordId})`);
      } catch (ehrError) {
        console.error('EHR/medical record creation error:', ehrError.message);
      }

      // Health diary creation runs independently — doesn't need EHR to succeed
      try {
        await HealthDiary.createFromPrescription(prescription, ehrRecordId);
        console.log(`✅ Health diary entries created for patient ${prescription.patientId}`);
      } catch (diaryError) {
        console.error('Health diary creation error:', diaryError.message);
      }
    }

    // Notify patient on issue (WhatsApp + email, fire-and-forget)
    let pdfUrl = null;
    if (status === 'issued' && previousStatus !== 'issued') {
      try {
        const patient = prescription.patientId ? await User.findByPk(prescription.patientId) : null;
        pdfUrl = await notifyPatientPrescriptionReady(prescription, patient);

        // Also trigger n8n workflow (fire-and-forget)
        n8nService.prescriptionIssued({
          id: prescription.prescriptionId || prescription.id,
          patientId: prescription.patientId,
          patientName: prescription.patientName,
          patientEmail: patient?.email,
          patientPhone: prescription.patientPhone,
          doctorName: prescription.doctorName,
          medications: prescription.medications?.length
            ? prescription.medications
            : prescription.medicines,
          instructions: prescription.advice || prescription.adviceList,
          pharmacyPreference: prescription.pharmacyPreference
        }).catch((n8nError) => {
          console.error('Failed to trigger n8n prescription workflow:', n8nError);
        });
      } catch (n8nError) {
        console.error('Failed to trigger n8n prescription workflow:', n8nError);
      }
    }

    res.json({
      success: true,
      message: 'Prescription status updated',
      prescriptionId: prescription.prescriptionId,
      status,
      pdfUrl,
      ehrCreated: ehrCreatedFlag
    });
  } catch (error) {
    console.error('Update prescription status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update status',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/prescriptions/:id/issue
 * @desc    Issue a prescription (change status from draft to issued)
 * @access  Private (Doctor)
 */
router.post('/:id/issue', authDoctor, async (req, res) => {
  try {
    const { id } = req.params;

    const prescription = await prescriptionRepository.findById(req, id);
    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }

    // Verify doctor ownership
    const doctorId = req.doctor?.id || req.doctor?.dataValues?.id || req.doctor?._id;
    if (prescription.doctorId !== doctorId) {
      return res.status(403).json({ success: false, message: 'Not authorized to issue this prescription' });
    }

    // Can only issue draft prescriptions
    if (prescription.status !== 'draft') {
      return res.status(400).json({ success: false, message: `Cannot issue a ${prescription.status} prescription` });
    }

    const previousStatus = prescription.status;
    await prescriptionRepository.update(req, prescription, {
      status: 'issued',
      issuedAt: new Date()
    });

    // When prescription is issued, create EHR record and health diary entries
    if (prescription.patientId) {
      let ehrRecordId = null;
      try {
        const ehrRecord = await EHRRecord.createFromPrescription(prescription);
        ehrRecordId = ehrRecord.id;
        console.log(`✅ Medical record created for prescription ${prescription.prescriptionId} (id=${ehrRecordId})`);
      } catch (ehrError) {
        console.error('Medical record creation error:', ehrError.message);
      }
      try {
        await HealthDiary.createFromPrescription(prescription, ehrRecordId);
        console.log(`✅ Health diary entries created for patient ${prescription.patientId}`);
      } catch (diaryError) {
        console.error('Health diary creation error:', diaryError.message);
      }
    }

    try {
      const patient = prescription.patientId
        ? await User.findByPk(prescription.patientId)
        : null;

      // fire-and-forget — never blocks the issue response
      n8nService.prescriptionIssued({
        id: prescription.prescriptionId || prescription.id,
        patientId: prescription.patientId,
        patientName: prescription.patientName,
        patientEmail: patient?.email,
        patientPhone: prescription.patientPhone,
        doctorName: prescription.doctorName,
        medications: prescription.medications?.length
          ? prescription.medications
          : prescription.medicines,
        instructions: prescription.advice || prescription.adviceList,
        pharmacyPreference: prescription.pharmacyPreference
      }).catch((n8nError) => {
        console.error('Failed to trigger n8n prescription workflow:', n8nError);
      });
    } catch (n8nError) {
      console.error('Failed to trigger n8n prescription workflow:', n8nError);
    }

    res.json({
      success: true,
      message: 'Prescription issued successfully',
      prescription: {
        id: prescription.id,
        prescriptionId: prescription.prescriptionId,
        prescriptionNumber: prescription.prescriptionId,
        status: 'issued',
        issuedAt: prescription.issuedAt,
        patientName: prescription.patientName,
        diagnosis: prescription.diagnosis
      }
    });
  } catch (error) {
    console.error('Issue prescription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to issue prescription',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/prescriptions/:id/html
 * @desc    Get print-friendly prescription HTML
 * @access  Private (Doctor or Patient owner) or Public with valid token in query
 */
router.get('/:id/html', async (req, res) => {
  try {
    const { id } = req.params;
    const { token } = req.query;

    const prescription = await prescriptionRepository.findByIdBypass(id);

    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }

    // Check access via Authorization header, signed share token, or httpOnly web auth cookie.
    const jwt = await import('jsonwebtoken');
    const bearerToken = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : null;
    const cookieToken = req.cookies?.[COOKIE_NAMES.ACCESS];
    const tokenCandidates = [bearerToken, token, cookieToken].filter(Boolean);
    let authenticated = false;

    for (const candidate of tokenCandidates) {
      try {
        const decoded = jwt.default.verify(candidate, JWT_CONFIG.SECRET);
        if (canAccessPrescriptionPdf(decoded, prescription)) {
          authenticated = true;
          break;
        }
      } catch {
        // Try the next token source.
      }
    }

    if (!authenticated) {
      return res.status(403).json({ success: false, message: 'Access denied. Please login to view prescription.' });
    }

    // Generate HTML
    const html = renderPrescriptionHTML(prescription);

    // Add print button at the top
    const printableHTML = html.replace(
      '</head>',
      `<style>
        @media print {
          .print-button, .no-print { display: none !important; }
        }
        .print-button {
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 1000;
          padding: 12px 24px;
          background: #2196F3;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 16px;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        .print-button:hover {
          background: #1976D2;
        }
      </style>
      <script>
        function printPrescription() {
          window.print();
        }
      </script>
      </head>`
    ).replace(
      '<body>',
      `<body>
        <button class="print-button no-print" onclick="printPrescription()">🖨️ Print Prescription</button>`
    );

    res.setHeader('Content-Type', 'text/html');
    res.send(printableHTML);
  } catch (error) {
    console.error('Generate prescription HTML error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate HTML',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/prescriptions/:id/pdf
 * @desc    Generate and download prescription PDF
 * @access  Private or Public with valid token in query
 */
router.get('/:id/pdf', async (req, res) => {
  try {
    const { id } = req.params;
    const { token } = req.query;

    const prescription = await prescriptionRepository.findByIdBypass(id);

    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }

    // Check access via Authorization header, signed share token, or httpOnly web auth cookie.
    const jwt = await import('jsonwebtoken');
    const bearerToken = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : null;
    const cookieToken = req.cookies?.[COOKIE_NAMES.ACCESS];
    const tokenCandidates = [bearerToken, token, cookieToken].filter(Boolean);
    let authenticated = false;

    for (const candidate of tokenCandidates) {
      try {
        const decoded = jwt.default.verify(candidate, JWT_CONFIG.SECRET);
        if (canAccessPrescriptionPdf(decoded, prescription)) {
          authenticated = true;
          break;
        }
      } catch {
        // Try the next token source.
      }
    }

    if (!authenticated) {
      return res.status(403).json({ success: false, message: 'Access denied. Please login to view prescription.' });
    }

    // Generate HTML
    const html = renderPrescriptionHTML(prescription);

    // Generate PDF using Puppeteer directly to avoid vulnerable wrapper dependencies.
    try {
      const puppeteer = await import('puppeteer');
      const browser = await puppeteer.default.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      let pdfBuffer;

      try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        // Buffer.from() required: puppeteer v20+ returns Uint8Array, not Buffer.
        // Express JSON-serialises Uint8Array unless converted.
        pdfBuffer = Buffer.from(await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: {
            top: '10mm',
            right: '10mm',
            bottom: '10mm',
            left: '10mm'
          }
        }));
      } finally {
        await browser.close();
      }

      // Save PDF to uploads directory
      const fs = await import('fs');
      const uploadsDir = path.join(__dirname, '../../uploads/prescriptions');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      if (!pdfBuffer?.slice(0, 4).equals(Buffer.from("%PDF"))) {
        throw new Error("Generated file is not a valid PDF");
      }

      const pdfPath = path.join(uploadsDir, `${prescription.prescriptionId}.pdf`);
      fs.writeFileSync(pdfPath, pdfBuffer);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=\"prescription-" + prescription.prescriptionId + ".pdf\"");
      res.setHeader("Content-Length", String(pdfBuffer.length));
      res.setHeader("Cache-Control", "private, no-store");
      res.send(pdfBuffer);
    } catch (pdfError) {
      console.warn("PDF generation failed:", pdfError.message);
      return res.status(500).json({
        success: false,
        message: "Failed to generate prescription PDF. Please use print preview and try again.",
        error: pdfError.message
      });
    }
  } catch (error) {
    console.error('Generate prescription PDF error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate PDF',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/prescriptions/:id/share/whatsapp
 * @desc    Generate WhatsApp share link for prescription
 * @access  Private
 */
router.get('/:id/share/whatsapp', authUser, async (req, res) => {
  try {
    const { id } = req.params;

    const prescription = await prescriptionRepository.findById(req, id);

    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }

    // Check access
    const userId = req.user.id;
    const userRole = req.user.role;

    if (userRole !== 'doctor' && prescription.patientId !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Generate shareable link
    const baseUrl = process.env.FRONTEND_URL || 'https://app.mediqzy.com';

    // Get a fresh token for the patient to access the prescription
    const jwt = await import('jsonwebtoken');
    const shareToken = jwt.default.sign(
      { id: prescription.patientId, role: 'user' },
      JWT_CONFIG.SECRET,
      { expiresIn: '30d' }
    );

    const pdfUrl = `${baseUrl}/api/prescriptions/${prescription.prescriptionId}/pdf?token=${shareToken}`;

    // Determine consultation type
    const consultationType = prescription.clinicDetails?.consultationType ||
      (prescription.clinicAddress && prescription.clinicAddress.includes('Online') ? 'Online Consultation' : 'Clinic Visit');

    // WhatsApp message
    const message = `🏥 *Prescription from ${prescription.doctorName || 'Doctor'}*\n\n` +
      `Patient: ${prescription.patientName}\n` +
      `Date: ${new Date(prescription.createdAt).toLocaleDateString('en-IN')}\n` +
      `Consultation Type: ${consultationType}\n` +
      `Prescription ID: ${prescription.prescriptionId}\n\n` +
      `📥 Download: ${pdfUrl}`;

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;

    res.json({
      success: true,
      whatsappUrl,
      pdfUrl,
      message,
      consultationType
    });
  } catch (error) {
    console.error('WhatsApp share error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate share link',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/prescriptions/:id/share/whatsapp/:phone
 * @desc    Send prescription via WhatsApp to patient phone number
 * @access  Private (Doctor)
 */
router.post('/:id/share/whatsapp/:phone', authDoctor, async (req, res) => {
  try {
    const { id, phone } = req.params;

    const prescription = await prescriptionRepository.findById(req, id);

    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }

    // Generate prescription URL
    const baseUrl = process.env.FRONTEND_URL || 'https://app.mediqzy.com';

    // Create a share token for the patient
    const jwt = await import('jsonwebtoken');
    const shareToken = jwt.default.sign(
      { id: prescription.patientId, role: 'user' },
      JWT_CONFIG.SECRET,
      { expiresIn: '30d' }
    );

    const prescriptionUrl = `${baseUrl}/api/prescriptions/${prescription.prescriptionId}/html?token=${shareToken}`;
    const pdfUrl = `${baseUrl}/api/prescriptions/${prescription.prescriptionId}/pdf?token=${shareToken}`;

    // Format phone number (remove +91 if present, then add it)
    const formattedPhone = phone.replace(/[^0-9]/g, '').replace(/^91/, '');

    // Determine consultation type
    const consultationType = prescription.clinicDetails?.consultationType ||
      (prescription.clinicAddress && prescription.clinicAddress.includes('Online') ? 'Online Consultation' : 'Clinic Visit');

    // WhatsApp message for specific patient
    const message = `🏥 *Medical Prescription*\n\n` +
      `Dear ${prescription.patientName},\n\n` +
      `Your prescription has been generated by ${prescription.doctorName || 'your doctor'}.\n\n` +
      `📋 *Prescription Details:*\n` +
      `Date: ${new Date(prescription.createdAt).toLocaleDateString('en-IN')}\n` +
      `Consultation Type: ${consultationType}\n` +
      `Prescription ID: ${prescription.prescriptionId}\n\n` +
      `📥 *Download PDF:* ${pdfUrl}\n` +
      `📱 *View Online:* ${prescriptionUrl}\n\n` +
      `⚕️ Please follow the prescribed medications and instructions.\n\n` +
      `For any queries, contact: ${prescription.clinicPhone || 'your clinic'}`;

    const whatsappUrl = `https://wa.me/91${formattedPhone}?text=${encodeURIComponent(message)}`;

    res.json({
      success: true,
      whatsappUrl,
      prescriptionUrl,
      pdfUrl,
      phoneNumber: `+91${formattedPhone}`,
      consultationType,
      message: 'WhatsApp link generated. Click the URL to send.'
    });
  } catch (error) {
    console.error('WhatsApp send error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate WhatsApp message',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/prescriptions/:id
 * @desc    Delete/Cancel prescription (Doctor only, if not dispensed)
 * @access  Private (Doctor)
 */
router.delete('/:id', authDoctor, async (req, res) => {
  try {
    const { id } = req.params;

    const prescription = await prescriptionRepository.findById(req, id);
    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }

    // Check if doctor owns this prescription
    const doctorId = req.doctor?.id || req.doctor?.dataValues?.id || req.doctor?._id;
    if (prescription.doctorId !== doctorId) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this prescription' });
    }

    // Cannot delete dispensed prescriptions, only cancel
    if (prescription.status === 'dispensed') {
      await prescriptionRepository.update(req, prescription, { status: 'cancelled' });
      
      // Audit logging for prescription cancellation
      try {
        await AuditLog.create({
          userId: doctorId,
          userType: 'doctor',
          userEmail: req.doctor?.email,
          action: 'DELETE',
          resourceType: 'prescription',
          resourceId: prescription.id.toString(),
          dataFields: {
            prescriptionId: prescription.prescriptionId,
            patientName: prescription.patientName,
            previousStatus: 'dispensed',
            newStatus: 'cancelled'
          },
          changesBefore: { status: 'dispensed' },
          changesAfter: { status: 'cancelled' },
          req,
          status: 'SUCCESS',
          statusCode: 200,
          isPHI: true,
          purpose: 'Prescription Cancellation',
        });
      } catch (auditError) {
        console.error('Audit log creation failed:', auditError);
      }
      
      return res.json({
        success: true,
        message: 'Prescription cancelled (was already dispensed)',
        prescriptionId: prescription.prescriptionId
      });
    }

    // Soft delete by cancelling
    await prescriptionRepository.update(req, prescription, { status: 'cancelled' });

    // Audit logging for prescription deletion
    try {
      await AuditLog.create({
        userId: doctorId,
        userType: 'doctor',
        userEmail: req.doctor?.email,
        action: 'DELETE',
        resourceType: 'prescription',
        resourceId: prescription.id.toString(),
        dataFields: {
          prescriptionId: prescription.prescriptionId,
          patientName: prescription.patientName,
          previousStatus: prescription.status,
          newStatus: 'cancelled'
        },
        changesBefore: { status: prescription.status },
        changesAfter: { status: 'cancelled' },
        req,
        status: 'SUCCESS',
        statusCode: 200,
        isPHI: true,
        purpose: 'Prescription Deletion',
      });
    } catch (auditError) {
      console.error('Audit log creation failed:', auditError);
    }

    res.json({
      success: true,
      message: 'Prescription cancelled',
      prescriptionId: prescription.prescriptionId
    });
  } catch (error) {
    console.error('Delete prescription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete prescription',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/prescriptions/:id/share
 * @desc    Share prescription with attached pharmacy or lab
 * @access  Private (Doctor)
 */
router.post('/:id/share', authDoctor, [
  body('entityId').isInt().withMessage('Entity ID is required'),
  body('entityType').isIn(['pharmacy', 'lab']).withMessage('Entity type must be pharmacy or lab'),
  body('method').isIn(['email', 'sms', 'whatsapp']).withMessage('Method must be email, sms, or whatsapp'),
  body('contact').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;
    const { entityId, entityType, method, contact } = req.body;

    // Find prescription
    const prescription = await prescriptionRepository.findById(req, id);

    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }

    // Verify doctor owns prescription
    const doctorId = req.doctor?.id || req.doctor?.dataValues?.id || req.doctor?._id;
    if (prescription.doctorId !== doctorId) {
      return res.status(403).json({ success: false, message: 'Not authorized to share this prescription' });
    }

    // Generate shareable links
    const baseUrl = process.env.FRONTEND_URL || 'https://app.mediqzy.com';
    const jwt = await import('jsonwebtoken');
    
    // Generate a share token valid for 30 days
    const shareToken = jwt.default.sign(
      { 
        prescriptionId: prescription.prescriptionId, 
        entityId, 
        entityType,
        purpose: 'prescription_share' 
      },
      JWT_CONFIG.SECRET,
      { expiresIn: '30d' }
    );

    const pdfUrl = `${baseUrl}/api/prescriptions/${prescription.prescriptionId}/pdf?token=${shareToken}`;
    const htmlUrl = `${baseUrl}/api/prescriptions/${prescription.prescriptionId}/html?token=${shareToken}`;

    // Format phone number for WhatsApp/SMS
    const formatPhone = (phone) => {
      if (!phone) return null;
      const cleaned = phone.replace(/[^0-9]/g, '').replace(/^91/, '');
      return cleaned.length === 10 ? cleaned : null;
    };

    // Build share message
    const entityName = entityType === 'pharmacy' ? 'Pharmacy' : 'Lab';
    const message = entityType === 'pharmacy' 
      ? `🏥 *Prescription from ${prescription.doctorName || 'Doctor'}*\n\n` +
        `Patient: ${prescription.patientName}\n` +
        `Date: ${new Date(prescription.createdAt).toLocaleDateString('en-IN')}\n` +
        `Prescription ID: ${prescription.prescriptionId}\n\n` +
        `*Medications:*\n${(prescription.medications || []).map((m, i) => 
          `${i + 1}. ${m.name} - ${m.dosage} - ${m.frequency} - ${m.duration}`
        ).join('\n')}\n\n` +
        `📥 Download PDF: ${pdfUrl}`
      : `🔬 *Lab Test Request from ${prescription.doctorName || 'Doctor'}*\n\n` +
        `Patient: ${prescription.patientName}\n` +
        `Date: ${new Date(prescription.createdAt).toLocaleDateString('en-IN')}\n` +
        `Prescription ID: ${prescription.prescriptionId}\n\n` +
        `*Tests Advised:*\n${(prescription.labTests || []).map((t, i) => 
          `${i + 1}. ${t.testName || t}`
        ).join('\n')}\n\n` +
        `📥 Download PDF: ${pdfUrl}`;

    let shareResult = {};

    if (method === 'whatsapp') {
      const phoneNumber = formatPhone(contact);
      if (!phoneNumber) {
        return res.status(400).json({ success: false, message: 'Valid phone number required for WhatsApp' });
      }
      shareResult = {
        whatsappUrl: `https://wa.me/91${phoneNumber}?text=${encodeURIComponent(message)}`,
        phoneNumber: `+91${phoneNumber}`
      };
    } else if (method === 'sms') {
      const phoneNumber = formatPhone(contact);
      if (!phoneNumber) {
        return res.status(400).json({ success: false, message: 'Valid phone number required for SMS' });
      }
      // SMS is typically sent via a service - here we return the details
      shareResult = {
        smsUrl: `sms:+91${phoneNumber}?body=${encodeURIComponent(message.replace(/\*/g, '').substring(0, 160))}`,
        phoneNumber: `+91${phoneNumber}`,
        message: message.replace(/\*/g, '').substring(0, 160)
      };
    } else if (method === 'email') {
      // Email share
      const subject = entityType === 'pharmacy' 
        ? `Prescription for ${prescription.patientName} - ${prescription.prescriptionId}`
        : `Lab Test Request for ${prescription.patientName} - ${prescription.prescriptionId}`;
      
      shareResult = {
        emailSubject: subject,
        emailBody: message.replace(/\*/g, ''),
        mailtoUrl: `mailto:${contact || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message.replace(/\*/g, ''))}`
      };
    }

    // Log the share action
    const shareLog = {
      timestamp: new Date().toISOString(),
      entityId,
      entityType,
      method,
      contact,
      sharedBy: doctorId
    };

    // Update prescription with share history (using metadata field)
    const existingMetadata = prescription.metadata || {};
    const shareHistory = existingMetadata.shareHistory || [];
    shareHistory.push(shareLog);
    
    await prescription.update({
      metadata: {
        ...existingMetadata,
        shareHistory,
        lastSharedAt: new Date().toISOString()
      }
    });

    res.json({
      success: true,
      message: `Prescription share link generated for ${entityName}`,
      pdfUrl,
      htmlUrl,
      ...shareResult
    });
  } catch (error) {
    console.error('Share prescription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to share prescription',
      error: error.message
    });
  }
});

export default router;
