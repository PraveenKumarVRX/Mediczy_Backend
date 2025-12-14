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

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to render prescription HTML
const renderPrescriptionHTML = (prescription) => {
  const templatePath = path.join(__dirname, '../templates/documents/prescription-template.html');
  let template = fs.readFileSync(templatePath, 'utf-8');
  
  // Basic replacements
  const replacements = {
    '{{clinicName}}': prescription.clinicName || 'Mediczy Healthcare',
    '{{clinicAddress}}': prescription.clinicAddress || 'Virtual Consultation',
    '{{clinicPhone}}': prescription.clinicPhone || '+91-XXX-XXX-XXXX',
    '{{clinicEmail}}': prescription.clinicEmail || 'support@mediczy.com',
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
    '{{doctorQualifications}}': prescription.doctorQualifications || 'MBBS',
    '{{doctorRegNo}}': prescription.doctorRegNo || 'N/A',
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
 * @route   POST /api/prescriptions
 * @desc    Create a new prescription (Doctor only)
 * @access  Private (Doctor)
 */
router.post('/', authUser, [
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
    
    // Get doctor info
    const doctor = await Doctor.findByPk(req.user.id);
    if (!doctor) {
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
      const patient = await userModel.findByPk(patientUserId);
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
      doctorQualifications: doctor.qualifications || doctor.specialization || 'MBBS',
      doctorRegNo: doctor.registrationNumber || doctor.licenseNumber || 'N/A',
      clinicName: doctor.clinicHospitalName || 'Mediczy Healthcare',
      clinicAddress: doctor.clinicAddress || 'Online Consultation',
      clinicPhone: doctor.phone || doctor.phoneNumber,
      clinicEmail: doctor.email,
      diagnosis,
      chiefComplaints,
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
router.get('/doctor', authUser, async (req, res) => {
  try {
    // Get doctor ID from various possible locations
    const doctorId = req.user?.id || req.user?.dataValues?.id || req.user?._id;
    
    // Check if user has doctor role from token
    if (req.user?.role !== 'doctor' && req.userRole !== 'doctor') {
      return res.status(403).json({ success: false, message: 'Doctor access required' });
    }
    
    if (!doctorId) {
      return res.status(400).json({ success: false, message: 'Doctor ID not found in token' });
    }
    
    const prescriptions = await Prescription.findAll({
      where: { doctorId: parseInt(doctorId) },
      order: [['createdAt', 'DESC']]
    });
    
    res.json({
      success: true,
      count: prescriptions.length,
      prescriptions
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
router.get('/doctor/issued', authUser, async (req, res) => {
  try {
    const doctorId = req.user.id;
    
    // Verify doctor
    const doctor = await Doctor.findByPk(doctorId);
    if (!doctor) {
      return res.status(403).json({ success: false, message: 'Doctor access required' });
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
router.put('/:id', authUser, async (req, res) => {
  try {
    const { id } = req.params;
    
    const prescription = await Prescription.findByPk(id);
    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }
    
    // Check if doctor owns this prescription
    if (prescription.doctorId !== req.user.id) {
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
router.patch('/:id/status', authUser, async (req, res) => {
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
 * @route   GET /api/prescriptions/:id/html
 * @desc    Get prescription as HTML (for display/printing)
 * @access  Private
 */
router.get('/:id/html', authUser, async (req, res) => {
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
    
    if (userRole !== 'doctor' && prescription.userId !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const html = renderPrescriptionHTML(prescription);
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    console.error('Get prescription HTML error:', error);
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
 * @access  Private
 */
router.get('/:id/pdf', authUser, async (req, res) => {
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
    
    if (userRole !== 'doctor' && prescription.userId !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    // Generate HTML
    const html = renderPrescriptionHTML(prescription);
    
    // Try to use puppeteer for PDF generation
    try {
      const puppeteer = await import('puppeteer');
      const browser = await puppeteer.default.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '10mm',
          right: '10mm',
          bottom: '10mm',
          left: '10mm'
        }
      });
      
      await browser.close();
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="prescription-${prescription.prescriptionId}.pdf"`);
      res.send(pdfBuffer);
    } catch (puppeteerError) {
      console.warn('Puppeteer PDF generation failed, returning HTML:', puppeteerError.message);
      // Fallback to HTML if puppeteer fails
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Disposition', `attachment; filename="prescription-${prescription.prescriptionId}.html"`);
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
 * @route   DELETE /api/prescriptions/:id
 * @desc    Delete/Cancel prescription (Doctor only, if not dispensed)
 * @access  Private (Doctor)
 */
router.delete('/:id', authUser, async (req, res) => {
  try {
    const { id } = req.params;
    
    const prescription = await Prescription.findByPk(id);
    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }
    
    // Check if doctor owns this prescription
    if (prescription.doctorId !== req.user.id) {
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

export default router;
