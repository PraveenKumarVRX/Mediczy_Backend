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
import { Prescription, Appointment, User, Doctor } from '../models/index.js';
import { EHRRecord, HealthDiary } from '../models/index.js';
import { authUser, authDoctor } from '../middleware/auth.middleware.js';
import { JWT_CONFIG } from '../config/auth.config.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to render prescription HTML
const renderPrescriptionHTML = (prescription) => {
  const templatePath = path.join(__dirname, '../templates/documents/prescription-template.html');
  let template = fs.readFileSync(templatePath, 'utf-8');

  // Basic replacements
  const replacements = {
    '{{clinicName}}': prescription.clinicName || prescription.clinicDetails?.name || 'Mediczy Healthcare',
    '{{clinicAddress}}': prescription.clinicAddress || prescription.clinicDetails?.address || 'Virtual Consultation Platform',
    '{{clinicPhone}}': prescription.clinicPhone || prescription.clinicDetails?.phone || '+91-XXX-XXX-XXXX',
    '{{clinicEmail}}': prescription.clinicEmail || prescription.clinicDetails?.email || 'support@mediczy.com',
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

    // Get appointment details
    const appointment = await Appointment.findByPk(appointmentId);
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    // Verify doctor access
    const doctorId = req.doctor?.id || req.doctor?.dataValues?.id || req.doctor?._id;
    if (appointment.doctorId !== doctorId) {
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

    // Create prescription linked to appointment
    const prescription = await Prescription.create({
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
      status: 'active'
    });

    // Update appointment with prescription reference
    await Appointment.update(
      {
        prescription: prescription.prescriptionId,
        status: 'completed'
      },
      { where: { id: appointmentId } }
    );

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
        pdfUrl: `https://mediqzy.com/api/prescriptions/${prescription.prescriptionId}/pdf`,
        shareUrl: `https://mediqzy.com/api/prescriptions/${prescription.prescriptionId}/share/whatsapp`
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
      followUpDate,
      validityDays,
      notes
    } = req.body;

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

    // Create prescription
    const prescription = await Prescription.create({
      appointmentId,
      patientId: patientUserId,
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
      notes,
      status: 'draft'
    });

    // Update appointment with prescription reference if provided
    if (appointmentId) {
      await Appointment.update(
        { prescription: prescription.prescriptionId },
        { where: { id: appointmentId } }
      );
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

    const prescriptions = await Prescription.findAll({
      where: { doctorId: parseInt(doctorId) },
      order: [['createdAt', 'DESC']]
    });

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

    const prescriptions = await Prescription.findAll({
      where: { patientId },
      order: [['createdAt', 'DESC']]
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
 * @route   GET /api/prescriptions/:id
 * @desc    Get prescription by ID
 * @access  Private (Doctor or Patient owner)
 */
router.get('/:id', authUser, async (req, res) => {
  try {
    const { id } = req.params;

    // Find by ID or prescriptionId
    const prescription = await Prescription.findOne({
      where: isNaN(id)
        ? { prescriptionId: id }
        : { id: parseInt(id) }
    });

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

    const prescriptions = await Prescription.findAll({
      where: { patientId: parseInt(patientId) },
      order: [['createdAt', 'DESC']]
    });

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

    const prescriptions = await Prescription.findAll({
      where: { patientId },
      order: [['createdAt', 'DESC']]
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

    const prescription = await Prescription.findOne({
      where: { appointmentId: parseInt(appointmentId) }
    });

    if (!prescription) {
      return res.status(404).json({
        success: false,
        message: 'No prescription found for this appointment'
      });
    }

    // Check access
    const userId = req.user.id;
    const userRole = req.user.role;

    if (userRole !== 'doctor' && prescription.userId !== userId) {
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

    const prescriptions = await Prescription.findAll({
      where: { doctorId },
      order: [['createdAt', 'DESC']],
      limit: 100
    });

    res.json({
      success: true,
      count: prescriptions.length,
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

    const prescription = await Prescription.findByPk(id);
    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }

    // Check if doctor owns this prescription
    const doctorId = req.doctor?.id || req.doctor?.dataValues?.id || req.doctor?._id;
    if (prescription.doctorId !== doctorId) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this prescription' });
    }

    // Cannot update dispensed prescriptions
    if (prescription.status === 'dispensed') {
      return res.status(400).json({ success: false, message: 'Cannot update dispensed prescription' });
    }

    const {
      diagnosis,
      chiefComplaints,
      medications,
      labTests,
      instructions,
      vitals,
      followUpDate,
      notes
    } = req.body;

    await prescription.update({
      diagnosis: diagnosis || prescription.diagnosis,
      chiefComplaints: chiefComplaints || prescription.chiefComplaints,
      medications: medications || prescription.medications,
      labTests: labTests || prescription.labTests,
      instructions: instructions || prescription.instructions,
      vitals: vitals || prescription.vitals,
      followUpDate: followUpDate || prescription.followUpDate,
      notes: notes || prescription.notes
    });

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

    const prescription = await Prescription.findByPk(id);
    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }

    // Verify doctor ownership
    const doctorId = req.doctor?.id || req.doctor?.dataValues?.id || req.doctor?._id;
    if (prescription.doctorId !== doctorId) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this prescription' });
    }

    const previousStatus = prescription.status;
    await prescription.update({
      status,
      issuedAt: status === 'issued' ? new Date() : prescription.issuedAt
    });

    // When prescription is issued, create EHR record and health diary entries
    if (status === 'issued' && previousStatus !== 'issued' && prescription.patientId) {
      try {
        // Create EHR record
        const ehrRecord = await EHRRecord.createFromPrescription(prescription);
        console.log(`✅ EHR record created for prescription ${prescription.prescriptionNumber}`);

        // Create health diary entries
        await HealthDiary.createFromPrescription(prescription, ehrRecord.id);
        console.log(`✅ Health diary entries created for patient ${prescription.patientId}`);
      } catch (ehrError) {
        console.error('EHR/Diary creation error:', ehrError.message);
        // Don't fail the request, just log the error
      }
    }

    res.json({
      success: true,
      message: 'Prescription status updated',
      prescriptionId: prescription.prescriptionNumber || prescription.prescriptionId,
      status,
      ehrCreated: status === 'issued' && previousStatus !== 'issued'
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

    const prescription = await Prescription.findByPk(id);
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
    await prescription.update({
      status: 'issued',
      issuedAt: new Date()
    });

    // When prescription is issued, create EHR record and health diary entries
    if (prescription.patientId) {
      try {
        // Create EHR record
        const ehrRecord = await EHRRecord.createFromPrescription(prescription);
        console.log(`✅ EHR record created for prescription ${prescription.prescriptionNumber}`);

        // Create health diary entries
        await HealthDiary.createFromPrescription(prescription, ehrRecord.id);
        console.log(`✅ Health diary entries created for patient ${prescription.patientId}`);
      } catch (ehrError) {
        console.error('EHR/Diary creation error:', ehrError.message);
        // Don't fail the request, just log the error
      }
    }

    res.json({
      success: true,
      message: 'Prescription issued successfully',
      prescription: {
        id: prescription.id,
        prescriptionId: prescription.prescriptionId,
        prescriptionNumber: prescription.prescriptionNumber,
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

    const prescription = await Prescription.findOne({
      where: isNaN(id)
        ? { prescriptionId: id }
        : { id: parseInt(id) }
    });

    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }

    // Check access - either via Authorization header or query token
    let authenticated = false;

    // Try authorization header first
    if (req.headers.authorization) {
      try {
        const headerToken = req.headers.authorization.split(' ')[1];
        const jwt = await import('jsonwebtoken');
        const decoded = jwt.default.verify(headerToken, JWT_CONFIG.SECRET);
        if (decoded.role === 'doctor' || decoded.id === prescription.patientId) {
          authenticated = true;
        }
      } catch (err) {
        // Header auth failed, will try query token
      }
    }

    // Try query token if header auth failed
    if (!authenticated && token) {
      try {
        const jwt = await import('jsonwebtoken');
        const decoded = jwt.default.verify(token, JWT_CONFIG.SECRET);
        if (decoded.role === 'doctor' || decoded.id === prescription.patientId) {
          authenticated = true;
        }
      } catch (err) {
        // Query token also failed
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

    const prescription = await Prescription.findOne({
      where: isNaN(id)
        ? { prescriptionId: id }
        : { id: parseInt(id) }
    });

    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }

    // Check access - either via Authorization header or query token
    let authenticated = false;

    // Try authorization header first
    if (req.headers.authorization) {
      try {
        const headerToken = req.headers.authorization.split(' ')[1];
        const jwt = await import('jsonwebtoken');
        const decoded = jwt.default.verify(headerToken, JWT_CONFIG.SECRET);
        if (decoded.role === 'doctor' || decoded.id === prescription.patientId) {
          authenticated = true;
        }
      } catch (err) {
        // Header auth failed, will try query token
      }
    }

    // Try query token if header auth failed
    if (!authenticated && token) {
      try {
        const jwt = await import('jsonwebtoken');
        const decoded = jwt.default.verify(token, JWT_CONFIG.SECRET);
        if (decoded.role === 'doctor' || decoded.id === prescription.patientId) {
          authenticated = true;
        }
      } catch (err) {
        // Query token also failed
      }
    }

    if (!authenticated) {
      return res.status(403).json({ success: false, message: 'Access denied. Please login to view prescription.' });
    }

    // Generate HTML
    const html = renderPrescriptionHTML(prescription);

    // Try to use html-pdf-node for PDF generation
    try {
      const htmlPdf = await import('html-pdf-node');

      const options = {
        format: 'A4',
        printBackground: true,
        margin: {
          top: '10mm',
          right: '10mm',
          bottom: '10mm',
          left: '10mm'
        }
      };

      const file = { content: html };
      const pdfBuffer = await htmlPdf.default.generatePdf(file, options);

      // Save PDF to uploads directory
      const fs = await import('fs');
      const uploadsDir = path.join(__dirname, '../../uploads/prescriptions');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const pdfPath = path.join(uploadsDir, `${prescription.prescriptionId}.pdf`);
      fs.writeFileSync(pdfPath, pdfBuffer);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="prescription-${prescription.prescriptionId}.pdf"`);
      res.send(pdfBuffer);
    } catch (pdfError) {
      console.warn('PDF generation failed, returning HTML:', pdfError.message);
      // Fallback to HTML if PDF fails
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Disposition', `inline; filename="prescription-${prescription.prescriptionId}.html"`);
      res.send(html);
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

    const prescription = await Prescription.findOne({
      where: isNaN(id)
        ? { prescriptionId: id }
        : { id: parseInt(id) }
    });

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
    const baseUrl = process.env.FRONTEND_URL || 'https://mediqzy.com';

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

    const prescription = await Prescription.findOne({
      where: isNaN(id)
        ? { prescriptionId: id }
        : { id: parseInt(id) }
    });

    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }

    // Generate prescription URL
    const baseUrl = process.env.FRONTEND_URL || 'https://mediqzy.com';

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

    const prescription = await Prescription.findByPk(id);
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
      await prescription.update({ status: 'cancelled' });
      return res.json({
        success: true,
        message: 'Prescription cancelled (was already dispensed)',
        prescriptionId: prescription.prescriptionId
      });
    }

    // Soft delete by cancelling
    await prescription.update({ status: 'cancelled' });

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
    const prescription = await Prescription.findOne({
      where: isNaN(id)
        ? { prescriptionId: id }
        : { id: parseInt(id) }
    });

    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }

    // Verify doctor owns prescription
    const doctorId = req.doctor?.id || req.doctor?.dataValues?.id || req.doctor?._id;
    if (prescription.doctorId !== doctorId) {
      return res.status(403).json({ success: false, message: 'Not authorized to share this prescription' });
    }

    // Generate shareable links
    const baseUrl = process.env.FRONTEND_URL || 'https://mediqzy.com';
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
