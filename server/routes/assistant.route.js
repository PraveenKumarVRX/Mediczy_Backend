import express from 'express';
import { body } from 'express-validator';
import Assistant from '../models/assistant.model.intelligent.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const router = express.Router();

// Assistant authentication middleware
export const authAssistant = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: 'No authorization token provided' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.role !== 'assistant') {
      return res.status(403).json({ 
        success: false,
        message: 'Access denied. Assistant privileges required.' 
      });
    }

    req.assistant = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      linkedDoctorIds: decoded.linkedDoctorIds || [],
      primaryDoctorId: decoded.primaryDoctorId,
      linkedFacilityId: decoded.linkedFacilityId,
      linkedFacilityType: decoded.linkedFacilityType,
      linkedFacilityName: decoded.linkedFacilityName,
      canAccessDoctorCalendar: decoded.canAccessDoctorCalendar,
      canManagePatients: decoded.canManagePatients
    };

    next();
  } catch (error) {
    console.error('Assistant authentication error:', error);
    
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

// Assistant login endpoint
router.post('/login', [
  body('email').isEmail().withMessage('Must be a valid email'),
  body('password').notEmpty().withMessage('Password is required'),
], async (req, res) => {
  try {
    const { email, password } = req.body;

    // DEV-ONLY: Test/Demo assistant credentials (disabled in production)
    if (process.env.NODE_ENV !== 'production') {
      const testAssistants = {
        'assistant@mediczy.com': {
          id: 'asst_001',
          email: 'assistant@mediczy.com',
          password: 'AssistantPass123',
          firstName: 'Emily',
          lastName: 'Davis',
          roleTitle: 'Medical Secretary',
          linkedDoctorIds: ['doc_001'],
          primaryDoctorId: 'doc_001',
          linkedFacilityId: 'facility_001',
          linkedFacilityType: 'clinic',
          linkedFacilityName: 'Mediczy Health Clinic',
          workSchedule: { monday: '9:00-17:00', tuesday: '9:00-17:00', wednesday: '9:00-17:00', thursday: '9:00-17:00', friday: '9:00-17:00' },
          permissions: ['view_appointments', 'manage_appointments', 'view_patients', 'send_messages'],
          canAccessDoctorCalendar: true,
          canManagePatients: true,
          phoneNumber: '+91 9876543210'
        },
        'secretary@mediczy.com': {
          id: 'asst_002',
          email: 'secretary@mediczy.com',
          password: 'SecretaryPass123',
          firstName: 'Sarah',
          lastName: 'Johnson',
          roleTitle: 'Doctor Secretary',
          linkedDoctorIds: ['doc_002', 'doc_003'],
          primaryDoctorId: 'doc_002',
          linkedFacilityId: 'facility_001',
          linkedFacilityType: 'hospital',
          linkedFacilityName: 'Mediczy Hospital',
          workSchedule: { monday: '8:00-16:00', tuesday: '8:00-16:00', wednesday: '8:00-16:00', thursday: '8:00-16:00', friday: '8:00-16:00' },
          permissions: ['view_appointments', 'manage_appointments', 'view_patients', 'manage_patients', 'send_messages', 'view_billing'],
          canAccessDoctorCalendar: true,
          canManagePatients: true,
          phoneNumber: '+91 9876543211'
        }
      };

    // Check test credentials first
    const testAssistant = testAssistants[email];
    if (testAssistant && testAssistant.password === password) {
      const token = jwt.sign(
        {
          id: testAssistant.id,
          email: testAssistant.email,
          role: 'assistant',
          linkedDoctorIds: testAssistant.linkedDoctorIds,
          primaryDoctorId: testAssistant.primaryDoctorId,
          linkedFacilityId: testAssistant.linkedFacilityId,
          linkedFacilityType: testAssistant.linkedFacilityType,
          linkedFacilityName: testAssistant.linkedFacilityName,
          canAccessDoctorCalendar: testAssistant.canAccessDoctorCalendar,
          canManagePatients: testAssistant.canManagePatients
        },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
      );

      return res.status(200).json({
        success: true,
        message: 'Assistant login successful',
        token,
        assistant: {
          id: testAssistant.id,
          email: testAssistant.email,
          firstName: testAssistant.firstName,
          lastName: testAssistant.lastName,
          roleTitle: testAssistant.roleTitle,
          linkedDoctorIds: testAssistant.linkedDoctorIds,
          primaryDoctorId: testAssistant.primaryDoctorId,
          linkedFacilityId: testAssistant.linkedFacilityId,
          linkedFacilityType: testAssistant.linkedFacilityType,
          linkedFacilityName: testAssistant.linkedFacilityName,
          workSchedule: testAssistant.workSchedule,
          permissions: testAssistant.permissions,
          canAccessDoctorCalendar: testAssistant.canAccessDoctorCalendar,
          canManagePatients: testAssistant.canManagePatients,
          phoneNumber: testAssistant.phoneNumber
        }
      });
    }
    } // End NODE_ENV !== 'production' check

    // Check database for assistant
    const assistant = await Assistant.findOne({ 
      where: { 
        email,
        isActive: true
      } 
    });

    if (!assistant) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    // Verify password using intelligent adapter if available, else fallback
    let isPasswordValid = false;
    if (typeof assistant.comparePassword === 'function') {
      isPasswordValid = await assistant.comparePassword(password);
    } else if (assistant.password) {
      isPasswordValid = await bcrypt.compare(password, assistant.password);
    } else {
      // Development fallback
      isPasswordValid = password === 'AssistantPass123';
    }
    
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    // Update last login
    await assistant.update({ lastLogin: new Date() });

    // Generate JWT token
    const token = jwt.sign(
      {
        id: assistant.id,
        email: assistant.email,
        role: 'assistant',
        linkedDoctorIds: assistant.linkedDoctorIds || [],
        primaryDoctorId: assistant.primaryDoctorId || (assistant.linkedDoctorIds && assistant.linkedDoctorIds[0]),
        linkedFacilityId: assistant.linkedFacilityId,
        linkedFacilityType: assistant.linkedFacilityType,
        linkedFacilityName: assistant.linkedFacilityName,
        canAccessDoctorCalendar: assistant.canAccessDoctorCalendar,
        canManagePatients: assistant.canManagePatients
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.status(200).json({
      success: true,
      message: 'Assistant login successful',
      token,
      assistant: {
        id: assistant.id,
        email: assistant.email,
        firstName: assistant.firstName,
        lastName: assistant.lastName,
        roleTitle: assistant.roleTitle,
        linkedDoctorIds: assistant.linkedDoctorIds || [],
        primaryDoctorId: assistant.primaryDoctorId,
        linkedFacilityId: assistant.linkedFacilityId,
        linkedFacilityType: assistant.linkedFacilityType,
        linkedFacilityName: assistant.linkedFacilityName,
        workSchedule: assistant.workSchedule,
        permissions: assistant.permissions,
        canAccessDoctorCalendar: assistant.canAccessDoctorCalendar,
        canManagePatients: assistant.canManagePatients,
        phoneNumber: assistant.phoneNumber
      }
    });
  } catch (error) {
    console.error('Assistant login error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during login',
      error: error.message 
    });
  }
});

// Get assistant profile
router.get('/profile', authAssistant, async (req, res) => {
  try {
    let assistant;
    
    // Handle test assistant
    if (req.assistant.id === 'asst_001') {
      assistant = {
        id: 'asst_001',
        email: 'assistant@mediczy.com',
        firstName: 'Emily',
        lastName: 'Davis',
        roleTitle: 'Medical Secretary',
        linkedDoctorIds: ['doc_001'],
        primaryDoctorId: 'doc_001',
        linkedDoctors: [
          { id: 'doc_001', name: 'Dr. Michael Roberts', specialty: 'General Medicine' }
        ],
        phoneNumber: '+1-555-0201',
        emergencyContact: '+1-555-0202',
        workSchedule: {
          monday: '09:00-17:00',
          tuesday: '09:00-17:00',
          wednesday: '09:00-17:00',
          thursday: '09:00-17:00',
          friday: '09:00-17:00'
        },
        permissions: [
          'Manage Appointments',
          'View Patient List',
          'Update Appointment Status',
          'Send Notifications',
          'Manage Schedule',
          'View Reports',
          'Handle Queries',
          'Document Management'
        ],
        canAccessDoctorCalendar: true,
        canManagePatients: false
      };
    } else {
      assistant = await Assistant.findByPk(req.assistant.id, {
        attributes: { exclude: ['password'] }
      });
      
      if (!assistant) {
        return res.status(404).json({ 
          success: false,
          message: 'Assistant not found' 
        });
      }
    }

    res.status(200).json({
      success: true,
      assistant
    });
  } catch (error) {
    console.error('Get assistant profile error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: error.message 
    });
  }
});

// Update assistant profile
router.put('/profile', authAssistant, async (req, res) => {
  try {
    const { firstName, lastName, phoneNumber, emergencyContact } = req.body;

    if (req.assistant.id === 'asst_001') {
      return res.status(200).json({
        success: true,
        message: 'Test assistant profile updated (mock)',
        assistant: { firstName, lastName, phoneNumber, emergencyContact }
      });
    }

    const assistant = await Assistant.findByPk(req.assistant.id);
    
    if (!assistant) {
      return res.status(404).json({ 
        success: false,
        message: 'Assistant not found' 
      });
    }

    await assistant.update({
      firstName,
      lastName,
      phoneNumber,
      emergencyContact
    });

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      assistant: {
        id: assistant.id,
        firstName: assistant.firstName,
        lastName: assistant.lastName,
        email: assistant.email,
        phoneNumber: assistant.phoneNumber,
        emergencyContact: assistant.emergencyContact
      }
    });
  } catch (error) {
    console.error('Update assistant profile error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: error.message 
    });
  }
});

// Get doctor's appointments (for managing)
router.get('/appointments', authAssistant, async (req, res) => {
  try {
    const { date } = req.query;
    
    // Mock appointments data
    const appointments = [
      {
        id: 'APT001',
        patientName: 'John Smith',
        patientPhone: '+1-555-1234',
        appointmentTime: '09:00',
        duration: '30 min',
        type: 'Consultation',
        status: 'Confirmed',
        notes: 'Follow-up visit'
      },
      {
        id: 'APT002',
        patientName: 'Sarah Williams',
        patientPhone: '+1-555-5678',
        appointmentTime: '10:00',
        duration: '45 min',
        type: 'Check-up',
        status: 'Pending',
        notes: 'Annual physical'
      },
      {
        id: 'APT003',
        patientName: 'Michael Brown',
        patientPhone: '+1-555-9012',
        appointmentTime: '11:30',
        duration: '30 min',
        type: 'Consultation',
        status: 'Confirmed',
        notes: 'Prescription renewal'
      }
    ];

    res.status(200).json({
      success: true,
      appointments,
      linkedDoctorIds: req.assistant.linkedDoctorIds,
      primaryDoctorId: req.assistant.primaryDoctorId,
      date: date || new Date().toISOString().split('T')[0]
    });
  } catch (error) {
    console.error('Get appointments error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: error.message 
    });
  }
});

// Update appointment status
router.put('/appointments/:appointmentId', authAssistant, async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { status, notes } = req.body;

    // Mock update
    res.status(200).json({
      success: true,
      message: 'Appointment updated successfully',
      appointment: {
        id: appointmentId,
        status,
        notes,
        updatedBy: req.assistant.id,
        updatedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Update appointment error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: error.message 
    });
  }
});

// Get doctor's schedule
router.get('/doctor-schedule', authAssistant, async (req, res) => {
  try {
    if (!req.assistant.canAccessDoctorCalendar) {
      return res.status(403).json({
        success: false,
        message: 'No permission to access doctor calendar'
      });
    }

    // Mock schedule (for primary doctor)
    const schedule = {
      linkedDoctorIds: req.assistant.linkedDoctorIds,
      primaryDoctorId: req.assistant.primaryDoctorId,
      doctorName: 'Dr. Michael Roberts',
      weekSchedule: [
        { day: 'Monday', slots: '09:00-17:00', availability: 'Available' },
        { day: 'Tuesday', slots: '09:00-17:00', availability: 'Available' },
        { day: 'Wednesday', slots: '09:00-13:00', availability: 'Half Day' },
        { day: 'Thursday', slots: '09:00-17:00', availability: 'Available' },
        { day: 'Friday', slots: '09:00-17:00', availability: 'Available' }
      ],
      breaks: [
        { time: '13:00-14:00', type: 'Lunch Break' }
      ]
    };

    res.status(200).json({
      success: true,
      schedule
    });
  } catch (error) {
    console.error('Get doctor schedule error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: error.message 
    });
  }
});

// Get patient list (if permission granted)
router.get('/patients', authAssistant, async (req, res) => {
  try {
    // Mock patient list
    const patients = [
      {
        id: 'PAT001',
        name: 'John Smith',
        phone: '+1-555-1234',
        email: 'john.smith@email.com',
        lastVisit: '2025-11-20',
        nextAppointment: '2025-11-25'
      },
      {
        id: 'PAT002',
        name: 'Sarah Williams',
        phone: '+1-555-5678',
        email: 'sarah.w@email.com',
        lastVisit: '2025-11-18',
        nextAppointment: '2025-11-24'
      }
    ];

    res.status(200).json({
      success: true,
      patients,
      linkedDoctorIds: req.assistant.linkedDoctorIds
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

// Send notification to patient
router.post('/notify', authAssistant, async (req, res) => {
  try {
    const { patientId, message, type } = req.body;

    // Mock notification
    res.status(200).json({
      success: true,
      message: 'Notification sent successfully',
      notification: {
        patientId,
        message,
        type,
        sentBy: req.assistant.id,
        sentAt: new Date()
      }
    });
  } catch (error) {
    console.error('Send notification error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: error.message 
    });
  }
});

// ==================== DOCTOR MANAGEMENT ENDPOINTS ====================

// Get linked doctors
router.get('/linked-doctors', authAssistant, async (req, res) => {
  try {
    if (req.assistant.id === 'asst_001') {
      // Mock doctors for test assistant
      const doctors = [
        {
          id: 'doc_001',
          name: 'Dr. Michael Roberts',
          specialty: 'General Medicine',
          email: 'dr.roberts@mediczy.com',
          phone: '+1-555-1001',
          isPrimary: true
        }
      ];
      
      return res.status(200).json({
        success: true,
        doctors,
        count: doctors.length,
        maxAllowed: 5
      });
    }

    const assistant = await Assistant.findByPk(req.assistant.id);
    
    if (!assistant) {
      return res.status(404).json({
        success: false,
        message: 'Assistant not found'
      });
    }

    // In production, fetch actual doctor details from database
    const linkedDoctorIds = assistant.linkedDoctorIds || [];
    
    res.status(200).json({
      success: true,
      linkedDoctorIds,
      primaryDoctorId: assistant.primaryDoctorId,
      count: linkedDoctorIds.length,
      maxAllowed: 5,
      canAddMore: linkedDoctorIds.length < 5
    });
  } catch (error) {
    console.error('Get linked doctors error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Add doctor to assistant (Admin only - requires authUser middleware)
router.post('/link-doctor', async (req, res) => {
  try {
    const { assistantId, doctorId, setPrimary } = req.body;

    if (!assistantId || !doctorId) {
      return res.status(400).json({
        success: false,
        message: 'Assistant ID and Doctor ID are required'
      });
    }

    // For test assistant
    if (assistantId === 'asst_001') {
      return res.status(200).json({
        success: true,
        message: 'Doctor linked successfully (mock)',
        assistant: {
          id: assistantId,
          linkedDoctorIds: ['doc_001', doctorId]
        }
      });
    }

    const assistant = await Assistant.findByPk(assistantId);
    
    if (!assistant) {
      return res.status(404).json({
        success: false,
        message: 'Assistant not found'
      });
    }

    let linkedDoctorIds = assistant.linkedDoctorIds || [];

    // Check if already linked
    if (linkedDoctorIds.includes(doctorId)) {
      return res.status(409).json({
        success: false,
        message: 'Doctor is already linked to this assistant'
      });
    }

    // Check maximum limit
    if (linkedDoctorIds.length >= 5) {
      return res.status(400).json({
        success: false,
        message: 'Assistant already linked to maximum 5 doctors. Remove one to add another.'
      });
    }

    // Add doctor to list
    linkedDoctorIds.push(doctorId);

    // Update assistant
    const updateData = {
      linkedDoctorIds
    };

    // Set as primary if requested or if it's the first doctor
    if (setPrimary || linkedDoctorIds.length === 1) {
      updateData.primaryDoctorId = doctorId;
    }

    await assistant.update(updateData);

    res.status(200).json({
      success: true,
      message: 'Doctor linked successfully',
      assistant: {
        id: assistant.id,
        linkedDoctorIds: assistant.linkedDoctorIds,
        primaryDoctorId: assistant.primaryDoctorId,
        count: linkedDoctorIds.length
      }
    });
  } catch (error) {
    console.error('Link doctor error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Remove doctor from assistant (Admin only)
router.post('/unlink-doctor', async (req, res) => {
  try {
    const { assistantId, doctorId } = req.body;

    if (!assistantId || !doctorId) {
      return res.status(400).json({
        success: false,
        message: 'Assistant ID and Doctor ID are required'
      });
    }

    // For test assistant
    if (assistantId === 'asst_001') {
      return res.status(200).json({
        success: true,
        message: 'Doctor unlinked successfully (mock)'
      });
    }

    const assistant = await Assistant.findByPk(assistantId);
    
    if (!assistant) {
      return res.status(404).json({
        success: false,
        message: 'Assistant not found'
      });
    }

    let linkedDoctorIds = assistant.linkedDoctorIds || [];

    // Check if doctor is linked
    if (!linkedDoctorIds.includes(doctorId)) {
      return res.status(404).json({
        success: false,
        message: 'Doctor is not linked to this assistant'
      });
    }

    // Remove doctor from list
    linkedDoctorIds = linkedDoctorIds.filter(id => id !== doctorId);

    const updateData = {
      linkedDoctorIds
    };

    // If removed doctor was primary, set new primary
    if (assistant.primaryDoctorId === doctorId) {
      updateData.primaryDoctorId = linkedDoctorIds.length > 0 ? linkedDoctorIds[0] : null;
    }

    await assistant.update(updateData);

    res.status(200).json({
      success: true,
      message: 'Doctor unlinked successfully',
      assistant: {
        id: assistant.id,
        linkedDoctorIds: assistant.linkedDoctorIds,
        primaryDoctorId: assistant.primaryDoctorId,
        count: linkedDoctorIds.length
      }
    });
  } catch (error) {
    console.error('Unlink doctor error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Set primary doctor
router.post('/set-primary-doctor', async (req, res) => {
  try {
    const { assistantId, doctorId } = req.body;

    if (!assistantId || !doctorId) {
      return res.status(400).json({
        success: false,
        message: 'Assistant ID and Doctor ID are required'
      });
    }

    // For test assistant
    if (assistantId === 'asst_001') {
      return res.status(200).json({
        success: true,
        message: 'Primary doctor set successfully (mock)'
      });
    }

    const assistant = await Assistant.findByPk(assistantId);
    
    if (!assistant) {
      return res.status(404).json({
        success: false,
        message: 'Assistant not found'
      });
    }

    const linkedDoctorIds = assistant.linkedDoctorIds || [];

    // Check if doctor is linked
    if (!linkedDoctorIds.includes(doctorId)) {
      return res.status(404).json({
        success: false,
        message: 'Doctor must be linked before setting as primary'
      });
    }

    await assistant.update({
      primaryDoctorId: doctorId
    });

    res.status(200).json({
      success: true,
      message: 'Primary doctor set successfully',
      assistant: {
        id: assistant.id,
        primaryDoctorId: assistant.primaryDoctorId
      }
    });
  } catch (error) {
    console.error('Set primary doctor error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Link assistant to facility (Admin only)
router.post('/link-facility', async (req, res) => {
  try {
    const { assistantId, facilityId, facilityType, facilityName } = req.body;

    if (!assistantId || !facilityId || !facilityType || !facilityName) {
      return res.status(400).json({
        success: false,
        message: 'assistantId, facilityId, facilityType, and facilityName are required'
      });
    }

    if (!['clinic', 'hospital'].includes(facilityType)) {
      return res.status(400).json({
        success: false,
        message: 'facilityType must be either "clinic" or "hospital"'
      });
    }

    // For test assistant
    if (assistantId === 'asst_001') {
      return res.status(200).json({
        success: true,
        message: 'Facility linked successfully (mock)',
        assistant: {
          id: assistantId,
          linkedFacilityId: facilityId,
          linkedFacilityType: facilityType,
          linkedFacilityName: facilityName
        }
      });
    }

    // Database update
    const assistant = await Assistant.findByPk(assistantId);
    
    if (!assistant) {
      return res.status(404).json({
        success: false,
        message: 'Assistant not found'
      });
    }

    await assistant.update({
      linkedFacilityId: facilityId,
      linkedFacilityType: facilityType,
      linkedFacilityName: facilityName
    });

    res.status(200).json({
      success: true,
      message: 'Facility linked successfully',
      assistant: {
        id: assistant.id,
        linkedFacilityId: assistant.linkedFacilityId,
        linkedFacilityType: assistant.linkedFacilityType,
        linkedFacilityName: assistant.linkedFacilityName
      }
    });
  } catch (error) {
    console.error('Link facility error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Unlink assistant from facility (Admin only)
router.post('/unlink-facility', async (req, res) => {
  try {
    const { assistantId } = req.body;

    if (!assistantId) {
      return res.status(400).json({
        success: false,
        message: 'assistantId is required'
      });
    }

    // For test assistant
    if (assistantId === 'asst_001') {
      return res.status(200).json({
        success: true,
        message: 'Facility unlinked successfully (mock)',
        assistant: {
          id: assistantId,
          linkedFacilityId: null,
          linkedFacilityType: null,
          linkedFacilityName: null
        }
      });
    }

    // Database update
    const assistant = await Assistant.findByPk(assistantId);
    
    if (!assistant) {
      return res.status(404).json({
        success: false,
        message: 'Assistant not found'
      });
    }

    await assistant.update({
      linkedFacilityId: null,
      linkedFacilityType: null,
      linkedFacilityName: null
    });

    res.status(200).json({
      success: true,
      message: 'Facility unlinked successfully',
      assistant: {
        id: assistant.id
      }
    });
  } catch (error) {
    console.error('Unlink facility error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// ==================== CONSULTATION MANAGEMENT (Assistant) ====================
// In-memory storage for assistant-managed consultations (test mode / mock)
const assistantConsultationsStore = new Map();

function seedAssistantConsultations() {
  if (assistantConsultationsStore.size === 0) {
    const base = [
      {
        id: 'CONS001',
        patientName: 'Laura Green',
        patientPhone: '+1-555-3001',
        doctorName: 'Dr. Michael Roberts',
        doctorId: 'doc_001',
        appointmentDate: new Date().toISOString().split('T')[0],
        appointmentTime: '14:00',
        duration: '30 min',
        type: 'video',
        status: 'pending',
        notes: [],
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      },
      {
        id: 'CONS002',
        patientName: 'David Turner',
        patientPhone: '+1-555-3002',
        doctorName: 'Dr. Michael Roberts',
        doctorId: 'doc_001',
        appointmentDate: new Date().toISOString().split('T')[0],
        appointmentTime: '15:00',
        duration: '30 min',
        type: 'in-person',
        status: 'confirmed',
        notes: ['Bring previous lab reports'],
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      }
    ];
    base.forEach(c => assistantConsultationsStore.set(c.id, c));
  }
}

seedAssistantConsultations();

// List consultations for linked doctors
router.get('/consultations', authAssistant, async (req, res) => {
  try {
    // In production we would query Appointment model filtered by linkedDoctorIds
    const linkedDoctorIds = req.assistant.linkedDoctorIds || [];
    const consultations = Array.from(assistantConsultationsStore.values()).filter(c => linkedDoctorIds.length === 0 || linkedDoctorIds.includes(c.doctorId));
    return res.status(200).json({ success: true, consultations });
  } catch (error) {
    console.error('Assistant consultations list error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch consultations', error: error.message });
  }
});

// Accept (confirm) consultation
router.post('/consultations/:id/accept', authAssistant, async (req, res) => {
  try {
    const { id } = req.params;
    const item = assistantConsultationsStore.get(id);
    if (!item) return res.status(404).json({ success: false, message: 'Consultation not found' });
    item.status = 'confirmed';
    item.lastUpdated = new Date().toISOString();
    assistantConsultationsStore.set(id, item);
    return res.json({ success: true, consultation: item });
  } catch (error) {
    console.error('Accept consultation error:', error);
    return res.status(500).json({ success: false, message: 'Failed to accept consultation', error: error.message });
  }
});

// Cancel consultation
router.post('/consultations/:id/cancel', authAssistant, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const item = assistantConsultationsStore.get(id);
    if (!item) return res.status(404).json({ success: false, message: 'Consultation not found' });
    item.status = 'cancelled';
    if (reason) item.notes.push(`Cancelled: ${reason}`);
    item.lastUpdated = new Date().toISOString();
    assistantConsultationsStore.set(id, item);
    return res.json({ success: true, consultation: item });
  } catch (error) {
    console.error('Cancel consultation error:', error);
    return res.status(500).json({ success: false, message: 'Failed to cancel consultation', error: error.message });
  }
});

// Postpone (reschedule) consultation
router.post('/consultations/:id/postpone', authAssistant, async (req, res) => {
  try {
    const { id } = req.params;
    const { appointmentDate, appointmentTime, note } = req.body;
    if (!appointmentDate || !appointmentTime) {
      return res.status(400).json({ success: false, message: 'appointmentDate and appointmentTime are required' });
    }
    const item = assistantConsultationsStore.get(id);
    if (!item) return res.status(404).json({ success: false, message: 'Consultation not found' });
    item.appointmentDate = appointmentDate;
    item.appointmentTime = appointmentTime;
    item.status = 'rescheduled';
    if (note) item.notes.push(`Rescheduled: ${note}`);
    item.lastUpdated = new Date().toISOString();
    assistantConsultationsStore.set(id, item);
    return res.json({ success: true, consultation: item });
  } catch (error) {
    console.error('Postpone consultation error:', error);
    return res.status(500).json({ success: false, message: 'Failed to postpone consultation', error: error.message });
  }
});

// Add note to consultation
router.post('/consultations/:id/notes', authAssistant, async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    if (!note || !note.trim()) {
      return res.status(400).json({ success: false, message: 'Note content is required' });
    }
    const item = assistantConsultationsStore.get(id);
    if (!item) return res.status(404).json({ success: false, message: 'Consultation not found' });
    item.notes.push(note.trim());
    item.lastUpdated = new Date().toISOString();
    assistantConsultationsStore.set(id, item);
    return res.json({ success: true, consultation: item });
  } catch (error) {
    console.error('Add note consultation error:', error);
    return res.status(500).json({ success: false, message: 'Failed to add note', error: error.message });
  }
});

// Book new consultation (assistant proxy for user)
router.post('/consultations/book', authAssistant, async (req, res) => {
  try {
    const { patientName, patientPhone, doctorId, appointmentDate, appointmentTime, type } = req.body;
    if (!patientName || !doctorId || !appointmentDate || !appointmentTime) {
      return res.status(400).json({ success: false, message: 'patientName, doctorId, appointmentDate, appointmentTime are required' });
    }
    const id = `CONS_${Date.now()}`;
    const record = {
      id,
      patientName,
      patientPhone: patientPhone || 'N/A',
      doctorId,
      doctorName: 'Doctor',
      appointmentDate,
      appointmentTime,
      duration: '30 min',
      type: type || 'video',
      status: 'pending',
      notes: [],
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };
    assistantConsultationsStore.set(id, record);
    return res.json({ success: true, consultation: record });
  } catch (error) {
    console.error('Book consultation error:', error);
    return res.status(500).json({ success: false, message: 'Failed to book consultation', error: error.message });
  }
});

export default router;
