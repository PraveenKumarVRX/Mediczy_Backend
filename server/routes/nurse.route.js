import express from 'express';
import { body } from 'express-validator';
import Nurse from '../models/nurse.model.intelligent.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Medication from '../models/medication.model.intelligent.js';
import PatientNote from '../models/patientNote.model.intelligent.js';
import VitalsRecord from '../models/vitalsRecord.model.intelligent.js';

const router = express.Router();

// Nurse authentication middleware
export const authNurse = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    // Development bypass: allow the Vite dev token without requiring JWT signing.
    // This keeps nurse portal pages functional in local dev environments.
    if (token === 'dev-nurse-token' && process.env.NODE_ENV !== 'production') {
      req.nurse = {
        id: 'nurse_001',
        email: 'nurse@mediczy.com',
        role: 'nurse'
      };
      return next();
    }
    
    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: 'No authorization token provided' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.role !== 'nurse') {
      return res.status(403).json({ 
        success: false,
        message: 'Access denied. Nurse privileges required.' 
      });
    }

    req.nurse = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role
    };

    next();
  } catch (error) {
    console.error('Nurse authentication error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        message: 'Token expired. Please login again.' 
      });
    }
    
    return res.status(401).json({ 
      success: false,
      message: 'Invalid or expired token' 
    });
  }
};

// Nurse login endpoint
router.post('/login', [
  body('email').isEmail().withMessage('Must be a valid email'),
  body('password').notEmpty().withMessage('Password is required'),
], async (req, res) => {
  console.log('🟢 [Nurse Login] Request received');
  try {
    const { email, password } = req.body;
    console.log('🟢 [Nurse Login] Email:', email);

    // Hardcoded credentials removed for security - all nurses must be in database
    
    // Check database for nurse
    console.log('🟢 [Nurse Login] Querying database...');
    let nurse;
    try {
      nurse = await Nurse.findOne({ 
        where: { 
          email
        } 
      });
      console.log('🟢 [Nurse Login] Query completed');
    } catch (queryError) {
      console.error('❌ Nurse DB query error:', queryError.message);
      throw queryError;
    }
    console.log('🟢 [Nurse Login] Nurse found:', !!nurse);

    if (!nurse) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    // Verify password
    if (!nurse.comparePassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials - password verification not configured'
      });
    }
    const isPasswordValid = await nurse.comparePassword(password);
    
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    // Update last login
    if (nurse.update) await nurse.update({ lastLogin: new Date().toISOString() });

    // Generate JWT token
    const token = jwt.sign(
      {
        id: nurse.id,
        nurseId: nurse.id,
        email: nurse.email,
        role: 'nurse',
        userType: 'nurse'
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.status(200).json({
      success: true,
      message: 'Nurse login successful',
      token,
      nurse: {
        id: nurse.id,
        email: nurse.email,
        firstName: nurse.firstName,
        lastName: nurse.lastName,
        department: nurse.department,
        specialty: nurse.specialty,
        shift: nurse.shift,
        licenseNumber: nurse.licenseNumber,
        assignedWard: nurse.assignedWard,
        permissions: nurse.permissions || [],
        phoneNumber: nurse.phoneNumber
      }
    });
  } catch (error) {
    console.error('❌ NURSE LOGIN ERROR:', error);
    console.error('❌ Error message:', error.message);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({ 
      success: false,
      message: 'Server error during login',
      error: error.message 
    });
  }
});

// Get nurse profile
router.get('/profile', authNurse, async (req, res) => {
  try {
    let nurse;
    
    // Handle test nurse
    if (req.nurse.id === 'nurse_001') {
      nurse = {
        id: 'nurse_001',
        email: 'nurse@mediczy.com',
        firstName: 'Sarah',
        lastName: 'Johnson',
        department: 'Emergency Department',
        specialty: 'Emergency Care',
        shift: 'Morning',
        licenseNumber: 'RN-123456',
        assignedWard: 'Emergency Ward',
        qualifications: 'BSN, Registered Nurse, ACLS Certified',
        phoneNumber: '+1-555-0101',
        emergencyContact: '+1-555-0102',
        permissions: [
          'View Patients',
          'Record Vitals',
          'Medication Administration',
          'View Appointments',
          'Patient Notes',
          'Lab Results View',
          'Emergency Response'
        ]
      };
    } else {
      nurse = await Nurse.findByPk(req.nurse.id, {
        attributes: { exclude: ['password'] }
      });
      
      if (!nurse) {
        return res.status(404).json({ 
          success: false,
          message: 'Nurse not found' 
        });
      }
    }

    res.status(200).json({
      success: true,
      nurse
    });
  } catch (error) {
    console.error('Get nurse profile error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: error.message 
    });
  }
});

// Update nurse profile
router.put('/profile', authNurse, async (req, res) => {
  try {
    const { firstName, lastName, phoneNumber, emergencyContact } = req.body;

    if (req.nurse.id === 'nurse_001') {
      return res.status(200).json({
        success: true,
        message: 'Test nurse profile updated (mock)',
        nurse: { firstName, lastName, phoneNumber, emergencyContact }
      });
    }

    const nurse = await Nurse.findByPk(req.nurse.id);
    
    if (!nurse) {
      return res.status(404).json({ 
        success: false,
        message: 'Nurse not found' 
      });
    }

    await nurse.update({
      firstName,
      lastName,
      phoneNumber,
      emergencyContact
    });

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      nurse: {
        id: nurse.id,
        firstName: nurse.firstName,
        lastName: nurse.lastName,
        email: nurse.email,
        phoneNumber: nurse.phoneNumber,
        emergencyContact: nurse.emergencyContact
      }
    });
  } catch (error) {
    console.error('Update nurse profile error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: error.message 
    });
  }
});

// Get assigned patients (mock for now)
router.get('/patients', authNurse, async (req, res) => {
  try {
    // Mock patient data
    const patients = [
      {
        id: 'P001',
        name: 'John Doe',
        age: 45,
        ward: 'Emergency Ward',
        bedNumber: 'ER-12',
        condition: 'Stable',
        admissionDate: new Date().toISOString(),
        vitalsLastRecorded: '2 hours ago'
      },
      {
        id: 'P002',
        name: 'Jane Smith',
        age: 32,
        ward: 'Emergency Ward',
        bedNumber: 'ER-15',
        condition: 'Critical',
        admissionDate: new Date().toISOString(),
        vitalsLastRecorded: '30 minutes ago'
      }
    ];

    res.status(200).json({
      success: true,
      patients
    });
  } catch (error) {
    console.error('Get patients error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: error.message 
    });
  }
});

// Record patient vitals
router.post('/vitals', authNurse, async (req, res) => {
  try {
    const { patientId, vitals } = req.body;

    // Validate and convert patientId to integer
    if (!patientId) {
      return res.status(400).json({
        success: false,
        message: 'Patient ID is required'
      });
    }

    const parsedPatientId = parseInt(patientId, 10);
    if (isNaN(parsedPatientId)) {
      return res.status(400).json({
        success: false,
        message: 'Patient ID must be a valid number'
      });
    }

    // Validate vitals object exists
    if (!vitals || typeof vitals !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Vitals data is required'
      });
    }

    // Parse blood pressure if provided as "120/80" format
    let systolic = null;
    let diastolic = null;
    if (vitals?.bp || vitals?.bloodPressure) {
      const bp = vitals?.bp ?? vitals?.bloodPressure;
      if (typeof bp === 'string' && bp.includes('/')) {
        const [sys, dia] = bp.split('/');
        systolic = parseInt(sys, 10);
        diastolic = parseInt(dia, 10);
      } else if (vitals?.bloodPressureSystolic && vitals?.bloodPressureDiastolic) {
        systolic = vitals.bloodPressureSystolic;
        diastolic = vitals.bloodPressureDiastolic;
      }
    }

    const record = await VitalsRecord.create({
      userId: parsedPatientId,
      recordedBy: req.nurse.id,
      temperature: vitals?.temperature ?? null,
      heartRate: vitals?.pulse ?? vitals?.heartRate ?? null,
      bloodPressureSystolic: systolic,
      bloodPressureDiastolic: diastolic,
      oxygenSaturation: vitals?.oxygenSaturation ?? vitals?.spO2 ?? null,
      weight: vitals?.weight ?? null,
      bloodSugar: vitals?.bloodSugar ?? null,
      respiratoryRate: vitals?.respiratoryRate ?? null,
      notes: vitals?.notes ?? null,
      source: 'nurse',
      recordedAt: new Date()
    });

    res.status(200).json({
      success: true,
      message: 'Vitals recorded successfully',
      data: record
    });
  } catch (error) {
    console.error('Record vitals error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: error.message 
    });
  }
});

// Get today's vitals recorded by nurse
router.get('/vitals/today', authNurse, async (req, res) => {
  try {
    const { Op } = await import('sequelize');
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const records = await VitalsRecord.findAll({
      where: {
        recordedBy: req.nurse.id,
        recordedAt: { [Op.gte]: startOfDay.toISOString() }
      },
      order: [['recordedAt', 'DESC']],
      limit: 50
    });

    res.status(200).json({ success: true, records });
  } catch (error) {
    console.error('Get today vitals error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Record medication administration
router.post('/medications', authNurse, async (req, res) => {
  try {
    const { patientId, medication, dosage, route, frequency, notes } = req.body;
    const record = await Medication.create({
      name: medication,
      dosage,
      route: route || 'oral',
      frequency,
      instructions: notes,
      isActive: true,
      startDate: new Date(),
      metadata: {
        administeredBy: req.nurse.id,
        administeredByRole: 'nurse',
        patientId,
        administeredAt: new Date().toISOString()
      }
    });
    res.status(200).json({ success: true, message: 'Medication saved', data: record });
  } catch (error) {
    console.error('Save medication error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Get medications for a patient
router.get('/medications/:patientId', authNurse, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { Op } = await import('sequelize');
    const records = await Medication.findAll({
      where: {
        'metadata.patientId': { [Op.eq]: patientId }
      },
      order: [['createdAt', 'DESC']],
      limit: 100
    });
    res.status(200).json({ success: true, records });
  } catch (error) {
    console.error('Get medications error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Record patient note
router.post('/notes', authNurse, async (req, res) => {
  try {
    const { patientId, note, category } = req.body;
    const record = await PatientNote.create({
      patientId,
      nurseId: req.nurse.id,
      note,
      category,
      createdAt: new Date()
    });
    res.status(200).json({ success: true, message: 'Note saved', data: record });
  } catch (error) {
    console.error('Save note error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Get notes for a patient
router.get('/notes/:patientId', authNurse, async (req, res) => {
  try {
    const { patientId } = req.params;
    const records = await PatientNote.findAll({
      where: { patientId },
      order: [['createdAt', 'DESC']],
      limit: 100
    });
    res.status(200).json({ success: true, records });
  } catch (error) {
    console.error('Get notes error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Recent activity across vitals, medications, and notes for this nurse
router.get('/activity/recent', authNurse, async (req, res) => {
  try {
    const nurseId = req.nurse.id;
    const { Op } = await import('sequelize');
    const [vitals, meds, notes] = await Promise.all([
      VitalsRecord.findAll({ where: { recordedBy: nurseId }, order: [['recordedAt', 'DESC']], limit: 20 }),
      Medication.findAll({ 
        where: { 
          'metadata.administeredBy': { [Op.eq]: nurseId } 
        }, 
        order: [['createdAt', 'DESC']], 
        limit: 20 
      }),
      PatientNote.findAll({ where: { nurseId }, order: [['createdAt', 'DESC']], limit: 20 }),
    ]);

    const items = [
      ...vitals.map(v => ({
        type: 'Vitals',
        patientId: v.userId,
        timestamp: v.recordedAt,
        summary: `BP: ${v.bloodPressureSystolic || '?'}/${v.bloodPressureDiastolic || '?'}, HR: ${v.heartRate || 'N/A'}, Temp: ${v.temperature || 'N/A'}`,
      })),
      ...meds.map(m => ({
        type: 'Medication',
        patientId: m.metadata?.patientId,
        timestamp: m.metadata?.administeredAt || m.createdAt,
        summary: `${m.name} ${m.dosage || ''} ${m.route ? '(' + m.route + ')' : ''}`.trim(),
      })),
      ...notes.map(n => ({
        type: 'Note',
        patientId: n.patientId,
        timestamp: n.createdAt,
        summary: (n.note || '').slice(0, 80)
      })),
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 20);

    res.status(200).json({ success: true, items });
  } catch (error) {
    console.error('Get recent activity error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Get shift schedule
router.get('/schedule', authNurse, async (req, res) => {
  try {
    // Mock schedule data
    const schedule = {
      currentShift: 'Morning',
      shiftStart: '07:00',
      shiftEnd: '15:00',
      assignedWard: 'Emergency Ward',
      upcomingShifts: [
        { date: '2025-11-25', shift: 'Morning', hours: '07:00-15:00' },
        { date: '2025-11-26', shift: 'Morning', hours: '07:00-15:00' },
        { date: '2025-11-27', shift: 'Off', hours: '-' }
      ]
    };

    res.status(200).json({
      success: true,
      schedule
    });
  } catch (error) {
    console.error('Get schedule error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: error.message 
    });
  }
});

/**
 * POST /api/nurses/book
 * Book an appointment with a nurse
 */
router.post('/book', async (req, res) => {
  try {
    const {
      nurseId,
      appointmentDate,
      appointmentTime,
      serviceType,
      symptoms,
      notes,
      patientName,
      patientPhone,
      patientAddress
    } = req.body;

    // Validate required fields
    if (!nurseId || !appointmentDate || !appointmentTime) {
      return res.status(400).json({
        success: false,
        message: 'Nurse ID, appointment date, and time are required'
      });
    }

    // Get nurse details
    const nurse = await Nurse.findByPk(nurseId);
    if (!nurse) {
      return res.status(404).json({
        success: false,
        message: 'Nurse not found'
      });
    }

    // Create appointment record
    const appointment = {
      id: `nurse-appt-${Date.now()}`,
      nurseId,
      patientName: patientName || 'Patient',
      patientPhone: patientPhone || '',
      appointmentDate,
      appointmentTime,
      serviceType: serviceType || 'general',
      symptoms: symptoms || '',
      notes: notes || '',
      patientAddress: patientAddress || {},
      status: 'scheduled',
      bookingTime: new Date().toISOString(),
      fee: nurse.consultationFee || 500
    };

    // TODO: Store in database once NurseAppointment model is created

    res.json({
      success: true,
      message: 'Appointment booked successfully',
      appointment
    });
  } catch (error) {
    console.error('Nurse booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to book appointment',
      error: error.message
    });
  }
});

export default router;
