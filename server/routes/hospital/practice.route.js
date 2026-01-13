import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';
import { QueryTypes, Op } from 'sequelize';
import Appointment from '../../models/postgres/appointment.model.postgres.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'mediczy-super-secret-key-2024';
const STORE_DIR = process.env.HOSPITAL_PRACTICE_STORE || '/tmp/mediczy/hospital-practice';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const storePath = path.join(STORE_DIR, 'state.json');

const ensureStore = async () => {
  await fs.mkdir(STORE_DIR, { recursive: true });
  try {
    await fs.access(storePath);
  } catch {
    const seed = { tenants: {} };
    await fs.writeFile(storePath, JSON.stringify(seed, null, 2));
  }
};

const readState = async () => {
  await ensureStore();
  const raw = await fs.readFile(storePath, 'utf8');
  if (!raw) return { tenants: {} };
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error('Invalid practice state JSON, resetting file:', error.message);
    return { tenants: {} };
  }
};

const writeState = async (state) => {
  await fs.writeFile(storePath, JSON.stringify(state, null, 2));
};

const generateId = (prefix) => {
  if (crypto.randomUUID) {
    return `${prefix}${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
  }
  return `${prefix}${Date.now().toString(36)}`;
};

const verifyHospitalToken = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  // Dev bypass token used by frontend seed login
  if (token === 'dev-hospital-token') {
    req.hospitalId = 'hospital_dev';
    req.hospitalName = 'Sample Hospital';
    req.tenantId = 'hospital_dev';
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const role = decoded.role || decoded.userType;
    
    // Support both old system (role: hospital) and new multitenancy (role: hospital_admin, etc.)
    const validRoles = ['hospital', 'hospital_admin', 'doctor', 'staff', 'nurse'];
    if (!validRoles.includes(role)) {
      return res.status(403).json({ success: false, message: 'Hospital role required' });
    }

    // Support both old system (decoded.id) and new multitenancy (decoded.tenant_id / decoded.hospital_id)
    req.hospitalId = decoded.hospital_id || decoded.tenant_id || decoded.id || decoded.hospitalId;
    req.hospitalName = decoded.hospitalName || decoded.name || 'Hospital';
    req.tenantId = decoded.tenant_id || decoded.hospital_id || decoded.id;
    req.userId = decoded.id;
    req.userRole = role;
    
    return next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid token', error: error.message });
  }
};

const getPractice = (state, hospitalId, hospitalName) => {
  if (!state.tenants[hospitalId]) {
    state.tenants[hospitalId] = {
      meta: { name: hospitalName },
      appointments: [],
      patients: [],
      staff: [],
      resources: []
    };
  }
  return state.tenants[hospitalId];
};

router.get('/', verifyHospitalToken, async (req, res) => {
  const state = await readState();
  const practice = getPractice(state, req.hospitalId, req.hospitalName);
  res.json({ success: true, data: practice });
});

router.get('/summary', verifyHospitalToken, async (req, res) => {
  const state = await readState();
  const practice = getPractice(state, req.hospitalId, req.hospitalName);
  res.json({
    success: true,
    data: {
      appointments: practice.appointments.length,
      patients: practice.patients.length,
      staff: practice.staff.length,
      resources: practice.resources.length,
      ipd: practice.patients.filter((p) => p.admissionStatus === 'IPD').length,
      bedsInUse: practice.resources.filter((r) => r.type === 'Bed' && r.status === 'In-Use').length
    }
  });
});

router.get('/appointments', verifyHospitalToken, async (req, res) => {
  try {
    const { date, status, department, upcoming } = req.query;
    const hospitalId = req.hospitalId;
    const organizationId = req.hospitalOrgId || hospitalId;

    console.log('🏥 Hospital appointments request:', {
      hospitalId,
      organizationId,
      date,
      status,
      department,
      upcoming
    });

    const whereClause = {
      organization_id: organizationId
    };

    if (status) {
      whereClause.status = status;
    }

    if (date) {
      whereClause.appointmentDate = date;
    }

    if (upcoming === 'true') {
      const now = new Date();
      whereClause.appointmentDate = {
        [Op.gte]: now.toISOString().split('T')[0]
      };
    }

    console.log('🏥 Query where clause:', JSON.stringify(whereClause, null, 2));

    const appointments = await Appointment.findAll({
      where: whereClause,
      order: [
        ['appointmentDate', 'ASC'],
        ['appointmentTime', 'ASC']
      ],
      logging: console.log
    });

    console.log('✅ Found hospital appointments:', appointments.length);

    // Transform appointments to match frontend expectations
    const transformedAppointments = appointments.map(apt => ({
      id: apt.id.toString(),
      patientId: apt.userId?.toString() || '',
      patientName: apt.patientName || 'Unknown',
      patientPhone: apt.patientPhone || '',
      doctorId: apt.doctorId?.toString() || '',
      doctorName: apt.doctorName || 'Dr. Unknown',
      department: apt.specialization || 'General',
      date: apt.appointmentDate || '',
      time: apt.appointmentTime?.substring(0, 5) || '',
      type: 'OPD',
      status: apt.status || 'Scheduled',
      priority: 'Normal',
      notes: apt.reason || '',
      createdAt: apt.createdAt || new Date().toISOString()
    }));

    return res.json({ 
      success: true, 
      data: transformedAppointments, 
      total: transformedAppointments.length 
    });
  } catch (error) {
    console.error('Get hospital appointments error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch appointments',
      error: error.message
    });
  }
});

router.post('/appointments', verifyHospitalToken, async (req, res) => {
  const { patientName, patientPhone, department, doctorId, doctorName, type, priority, time, date, notes } = req.body;
  if (!patientName || !patientPhone || !time || !date) {
    return res.status(400).json({ success: false, message: 'Patient, phone, date, and time are required' });
  }

  const state = await readState();
  const practice = getPractice(state, req.hospitalId, req.hospitalName);
  const now = new Date().toISOString().slice(0, 10);
  const appointment = {
    id: generateId('APT'),
    patientId: generateId('P'),
    patientName,
    patientPhone,
    doctorId: doctorId || 'NA',
    doctorName: doctorName || 'Unassigned',
    department: department || 'General Medicine',
    date,
    time,
    type: type || 'OPD',
    status: 'Scheduled',
    priority: priority || 'Normal',
    notes: notes || '',
    createdAt: now
  };

  practice.appointments.unshift(appointment);
  await writeState(state);
  res.status(201).json({ success: true, message: 'Appointment created', data: appointment });
});

router.patch('/appointments/:id', verifyHospitalToken, async (req, res) => {
  const state = await readState();
  const practice = getPractice(state, req.hospitalId, req.hospitalName);
  const index = practice.appointments.findIndex((apt) => apt.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Appointment not found' });
  }
  practice.appointments[index] = { ...practice.appointments[index], ...req.body };
  await writeState(state);
  res.json({ success: true, message: 'Appointment updated', data: practice.appointments[index] });
});

router.post('/appointments/:id/status', verifyHospitalToken, async (req, res) => {
  const { status } = req.body;
  const state = await readState();
  const practice = getPractice(state, req.hospitalId, req.hospitalName);
  const index = practice.appointments.findIndex((apt) => apt.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Appointment not found' });
  }
  practice.appointments[index].status = status || practice.appointments[index].status;
  await writeState(state);
  res.json({ success: true, message: 'Appointment status updated', data: practice.appointments[index] });
});

router.get('/patients', verifyHospitalToken, async (req, res) => {
  const { search } = req.query;
  const state = await readState();
  const practice = getPractice(state, req.hospitalId, req.hospitalName);
  const filtered = practice.patients.filter((p) => {
    if (!search) return true;
    const term = String(search).toLowerCase();
    return (
      p.name?.toLowerCase().includes(term) ||
      p.phone?.toLowerCase().includes(term) ||
      p.uhid?.toLowerCase().includes(term)
    );
  });
  res.json({ success: true, data: filtered, total: filtered.length });
});

router.post('/patients', verifyHospitalToken, async (req, res) => {
  const { name, phone, gender, age, email, address, admissionStatus, department, assignedDoctor } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ success: false, message: 'Name and phone are required' });
  }

  const state = await readState();
  const practice = getPractice(state, req.hospitalId, req.hospitalName);
  const patient = {
    id: generateId('P'),
    uhid: generateId('UHID'),
    name,
    age: age || null,
    gender: gender || 'Other',
    phone,
    email: email || '',
    address: address || '',
    bloodGroup: req.body.bloodGroup || 'Unknown',
    admissionStatus: admissionStatus || 'OPD',
    admissionDate: admissionStatus === 'IPD' ? new Date().toISOString().slice(0, 10) : undefined,
    assignedDoctor,
    department
  };

  practice.patients.unshift(patient);
  await writeState(state);
  res.status(201).json({ success: true, message: 'Patient registered', data: patient });
});

router.patch('/patients/:id', verifyHospitalToken, async (req, res) => {
  const state = await readState();
  const practice = getPractice(state, req.hospitalId, req.hospitalName);
  const index = practice.patients.findIndex((p) => p.id === req.params.id || p.uhid === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Patient not found' });
  }
  practice.patients[index] = { ...practice.patients[index], ...req.body };
  await writeState(state);
  res.json({ success: true, message: 'Patient updated', data: practice.patients[index] });
});

router.post('/patients/:id/discharge', verifyHospitalToken, async (req, res) => {
  const state = await readState();
  const practice = getPractice(state, req.hospitalId, req.hospitalName);
  const index = practice.patients.findIndex((p) => p.id === req.params.id || p.uhid === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Patient not found' });
  }
  const patient = practice.patients[index];
  patient.admissionStatus = 'Discharged';
  patient.dischargeDate = new Date().toISOString().slice(0, 10);
  if (patient.bed) {
    const bed = practice.resources.find((r) => r.name === patient.bed || r.id === patient.bed);
    if (bed) bed.status = 'Available';
  }
  await writeState(state);
  res.json({ success: true, message: 'Patient discharged', data: patient });
});

router.get('/staff', verifyHospitalToken, async (req, res) => {
  const { department, role } = req.query;
  const state = await readState();
  const practice = getPractice(state, req.hospitalId, req.hospitalName);
  const filtered = practice.staff.filter((member) => {
    if (department && member.department !== department) return false;
    if (role && member.role !== role) return false;
    return true;
  });
  res.json({ success: true, data: filtered, total: filtered.length });
});

router.post('/staff', verifyHospitalToken, async (req, res) => {
  const { name, role, department, specialization, phone, email, shift, status } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ success: false, message: 'Name and phone are required for staff' });
  }

  const state = await readState();
  const practice = getPractice(state, req.hospitalId, req.hospitalName);
  const staff = {
    id: generateId('S'),
    name,
    role: role || 'Doctor',
    department: department || 'General',
    specialization: specialization || '',
    phone,
    email: email || '',
    shift: shift || 'Morning',
    status: status || 'On-Duty',
    joiningDate: new Date().toISOString().slice(0, 10)
  };

  practice.staff.unshift(staff);
  await writeState(state);
  res.status(201).json({ success: true, message: 'Staff added', data: staff });
});

router.patch('/staff/:id', verifyHospitalToken, async (req, res) => {
  const state = await readState();
  const practice = getPractice(state, req.hospitalId, req.hospitalName);
  const index = practice.staff.findIndex((s) => s.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Staff not found' });
  }
  practice.staff[index] = { ...practice.staff[index], ...req.body };
  await writeState(state);
  res.json({ success: true, message: 'Staff updated', data: practice.staff[index] });
});

router.delete('/staff/:id', verifyHospitalToken, async (req, res) => {
  const state = await readState();
  const practice = getPractice(state, req.hospitalId, req.hospitalName);
  const before = practice.staff.length;
  practice.staff = practice.staff.filter((s) => s.id !== req.params.id);
  if (practice.staff.length === before) {
    return res.status(404).json({ success: false, message: 'Staff not found' });
  }
  await writeState(state);
  res.json({ success: true, message: 'Staff removed' });
});

router.get('/resources', verifyHospitalToken, async (req, res) => {
  const { status, type } = req.query;
  const state = await readState();
  const practice = getPractice(state, req.hospitalId, req.hospitalName);
  const filtered = practice.resources.filter((r) => {
    if (status && r.status !== status) return false;
    if (type && r.type !== type) return false;
    return true;
  });
  res.json({ success: true, data: filtered, total: filtered.length });
});

router.post('/resources', verifyHospitalToken, async (req, res) => {
  const { name, type, department, status, location, lastMaintenance, nextMaintenance } = req.body;
  if (!name) {
    return res.status(400).json({ success: false, message: 'Resource name is required' });
  }

  const state = await readState();
  const practice = getPractice(state, req.hospitalId, req.hospitalName);
  const resource = {
    id: generateId('R'),
    name,
    type: type || 'Bed',
    department: department || 'General',
    status: status || 'Available',
    location: location || 'Not set',
    lastMaintenance,
    nextMaintenance
  };

  practice.resources.unshift(resource);
  await writeState(state);
  res.status(201).json({ success: true, message: 'Resource added', data: resource });
});

router.patch('/resources/:id', verifyHospitalToken, async (req, res) => {
  const state = await readState();
  const practice = getPractice(state, req.hospitalId, req.hospitalName);
  const index = practice.resources.findIndex((r) => r.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Resource not found' });
  }
  practice.resources[index] = { ...practice.resources[index], ...req.body };
  await writeState(state);
  res.json({ success: true, message: 'Resource updated', data: practice.resources[index] });
});

router.post('/resources/:id/release', verifyHospitalToken, async (req, res) => {
  const state = await readState();
  const practice = getPractice(state, req.hospitalId, req.hospitalName);
  const resource = practice.resources.find((r) => r.id === req.params.id);
  if (!resource) {
    return res.status(404).json({ success: false, message: 'Resource not found' });
  }
  resource.status = 'Available';
  await writeState(state);
  res.json({ success: true, message: 'Resource released', data: resource });
});

router.post('/resources/allocate', verifyHospitalToken, async (req, res) => {
  const { patientId, resourceId } = req.body;
  if (!patientId || !resourceId) {
    return res.status(400).json({ success: false, message: 'Patient and resource are required' });
  }

  const state = await readState();
  const practice = getPractice(state, req.hospitalId, req.hospitalName);
  const patient = practice.patients.find((p) => p.id === patientId || p.uhid === patientId);
  const resource = practice.resources.find((r) => r.id === resourceId);

  if (!patient) {
    return res.status(404).json({ success: false, message: 'Patient not found' });
  }
  if (!resource) {
    return res.status(404).json({ success: false, message: 'Resource not found' });
  }
  if (resource.status !== 'Available') {
    return res.status(400).json({ success: false, message: 'Resource not available' });
  }

  patient.admissionStatus = 'IPD';
  patient.bed = resource.name;
  patient.ward = resource.department;
  patient.admissionDate = patient.admissionDate || new Date().toISOString().slice(0, 10);
  resource.status = 'In-Use';

  await writeState(state);
  res.json({ success: true, message: 'Bed allocated', data: { patient, resource } });
});

// ============================================================================
// DATABASE-BACKED ENDPOINTS (Production-ready)
// ============================================================================

/**
 * Update Insurance Claim
 * PATCH /api/hospital/practice/insurance/claims/:id
 */
router.patch('/insurance/claims/:id', verifyHospitalToken, async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { status, approvedAmount, remarks } = req.body;
    const hospitalId = req.hospitalId;

    const [updated] = await sequelize.query(
      `UPDATE insurance_claims 
       SET status = :status,
           approved_amount = :approvedAmount,
           remarks = :remarks,
           updated_at = NOW()
       WHERE id = :id AND hospital_id = :hospitalId
       RETURNING *`,
      {
        replacements: { id, status, approvedAmount, remarks, hospitalId },
        type: QueryTypes.UPDATE,
        transaction
      }
    );

    if (!updated || updated.length === 0) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Claim not found or unauthorized'
      });
    }

    await sequelize.query(
      `INSERT INTO claim_timeline (claim_id, status, remarks, created_at)
       VALUES (:claimId, :status, :remarks, NOW())`,
      {
        replacements: { claimId: id, status, remarks: remarks || 'Status updated' },
        type: QueryTypes.INSERT,
        transaction
      }
    );

    await transaction.commit();
    res.json({ success: true, message: 'Claim updated successfully', data: updated[0] });
  } catch (error) {
    await transaction.rollback();
    console.error('Error updating claim:', error);
    res.status(500).json({ success: false, message: 'Failed to update claim', error: error.message });
  }
});

/**
 * Add Record to Digitization Queue
 * POST /api/hospital/practice/mrd/digitization-queue
 */
router.post('/mrd/digitization-queue', verifyHospitalToken, async (req, res) => {
  try {
    const { recordId } = req.body;
    const hospitalId = req.hospitalId;

    if (!recordId) {
      return res.status(400).json({ success: false, message: 'Record ID is required' });
    }

    const [record] = await sequelize.query(
      `SELECT id, mrd_number, patient_name, total_pages 
       FROM medical_records 
       WHERE id = :recordId AND hospital_id = :hospitalId`,
      { replacements: { recordId, hospitalId }, type: QueryTypes.SELECT }
    );

    if (!record) {
      return res.status(404).json({ success: false, message: 'Medical record not found' });
    }

    const [queueEntry] = await sequelize.query(
      `INSERT INTO digitization_queue 
       (record_id, mrd_number, patient_name, total_pages, status, priority, hospital_id, created_at, updated_at)
       VALUES (:recordId, :mrdNumber, :patientName, :totalPages, 'pending', 'normal', :hospitalId, NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          recordId: record.id,
          mrdNumber: record.mrd_number,
          patientName: record.patient_name,
          totalPages: record.total_pages || 0,
          hospitalId
        },
        type: QueryTypes.INSERT
      }
    );

    res.status(201).json({ success: true, message: 'Record added to digitization queue', data: queueEntry[0] });
  } catch (error) {
    console.error('Error adding to digitization queue:', error);
    res.status(500).json({ success: false, message: 'Failed to add record to queue', error: error.message });
  }
});

/**
 * Save Discharge Summary (Draft)
 * POST /api/hospital/practice/discharge-summaries
 */
router.post('/discharge-summaries', verifyHospitalToken, async (req, res) => {
  try {
    const { patientId, admissionId, diagnosis, procedures, medications, followUp, status } = req.body;
    const hospitalId = req.hospitalId;

    if (!patientId) {
      return res.status(400).json({ success: false, message: 'Patient ID is required' });
    }

    const [summary] = await sequelize.query(
      `INSERT INTO discharge_summaries 
       (patient_id, admission_id, diagnosis, procedures, medications, follow_up, 
        status, hospital_id, created_at, updated_at)
       VALUES (:patientId, :admissionId, :diagnosis, :procedures, :medications, :followUp,
               :status, :hospitalId, NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          patientId,
          admissionId,
          diagnosis: JSON.stringify(diagnosis || []),
          procedures: JSON.stringify(procedures || []),
          medications: JSON.stringify(medications || []),
          followUp,
          status: status || 'draft',
          hospitalId
        },
        type: QueryTypes.INSERT
      }
    );

    res.status(201).json({ success: true, message: 'Discharge summary saved', data: summary[0] });
  } catch (error) {
    console.error('Error saving discharge summary:', error);
    res.status(500).json({ success: false, message: 'Failed to save discharge summary', error: error.message });
  }
});

/**
 * Submit Discharge Summary for Approval
 * POST /api/hospital/practice/discharge-summaries/submit
 */
router.post('/discharge-summaries/submit', verifyHospitalToken, async (req, res) => {
  try {
    const { patientId, admissionId, diagnosis, procedures, medications, followUp } = req.body;
    const hospitalId = req.hospitalId;

    const [summary] = await sequelize.query(
      `INSERT INTO discharge_summaries 
       (patient_id, admission_id, diagnosis, procedures, medications, follow_up, 
        status, hospital_id, submitted_at, created_at, updated_at)
       VALUES (:patientId, :admissionId, :diagnosis, :procedures, :medications, :followUp,
               'pending_approval', :hospitalId, NOW(), NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          patientId,
          admissionId,
          diagnosis: JSON.stringify(diagnosis || []),
          procedures: JSON.stringify(procedures || []),
          medications: JSON.stringify(medications || []),
          followUp,
          hospitalId
        },
        type: QueryTypes.INSERT
      }
    );

    res.status(201).json({ success: true, message: 'Discharge summary submitted for approval', data: summary[0] });
  } catch (error) {
    console.error('Error submitting discharge summary:', error);
    res.status(500).json({ success: false, message: 'Failed to submit discharge summary', error: error.message });
  }
});

/**
 * Create Prescription
 * POST /api/hospital/practice/prescriptions
 */
router.post('/prescriptions', verifyHospitalToken, async (req, res) => {
  try {
    const { patientId, medications, diagnosis, notes, doctorId } = req.body;
    const hospitalId = req.hospitalId;

    if (!patientId || !medications || medications.length === 0) {
      return res.status(400).json({ success: false, message: 'Patient ID and medications are required' });
    }

    const [prescription] = await sequelize.query(
      `INSERT INTO prescriptions 
       (patient_id, doctor_id, hospital_id, diagnosis, medications, notes, 
        status, created_at, updated_at)
       VALUES (:patientId, :doctorId, :hospitalId, :diagnosis, :medications, :notes,
               'active', NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          patientId,
          doctorId: doctorId || 'unassigned',
          hospitalId,
          diagnosis,
          medications: JSON.stringify(medications),
          notes
        },
        type: QueryTypes.INSERT
      }
    );

    res.status(201).json({ success: true, message: 'Prescription created successfully', data: prescription[0] });
  } catch (error) {
    console.error('Error creating prescription:', error);
    res.status(500).json({ success: false, message: 'Failed to create prescription', error: error.message });
  }
});

/**
 * Save IP Sheet
 * POST /api/hospital/practice/ip-sheets
 */
router.post('/ip-sheets', verifyHospitalToken, async (req, res) => {
  try {
    const { patientId, sheetType, data, timestamp } = req.body;
    const hospitalId = req.hospitalId;

    if (!patientId || !sheetType) {
      return res.status(400).json({ success: false, message: 'Patient ID and sheet type are required' });
    }

    const [sheet] = await sequelize.query(
      `INSERT INTO ip_sheets 
       (patient_id, sheet_type, data, hospital_id, recorded_at, created_at, updated_at)
       VALUES (:patientId, :sheetType, :data, :hospitalId, :timestamp, NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          patientId,
          sheetType,
          data: JSON.stringify(data || {}),
          hospitalId,
          timestamp: timestamp || new Date().toISOString()
        },
        type: QueryTypes.INSERT
      }
    );

    res.status(201).json({ success: true, message: 'IP sheet saved successfully', data: sheet[0] });
  } catch (error) {
    console.error('Error saving IP sheet:', error);
    res.status(500).json({ success: false, message: 'Failed to save IP sheet', error: error.message });
  }
});

/**
 * Add Hospital Branch
 * POST /api/hospital/practice/branches
 */
router.post('/branches', verifyHospitalToken, async (req, res) => {
  try {
    const { name, type, address, city, state, pincode, phone, email, manager } = req.body;
    const hospitalId = req.hospitalId;

    if (!name || !address) {
      return res.status(400).json({ success: false, message: 'Branch name and address are required' });
    }

    const [branch] = await sequelize.query(
      `INSERT INTO hospital_branches 
       (hospital_id, name, type, address, city, state, pincode, phone, email, 
        manager, status, created_at, updated_at)
       VALUES (:hospitalId, :name, :type, :address, :city, :state, :pincode, :phone, :email,
               :manager, 'active', NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          hospitalId,
          name,
          type: type || 'branch',
          address,
          city,
          state,
          pincode,
          phone,
          email,
          manager: JSON.stringify(manager || {})
        },
        type: QueryTypes.INSERT
      }
    );

    res.status(201).json({ success: true, message: 'Branch added successfully', data: branch[0] });
  } catch (error) {
    console.error('Error adding branch:', error);
    res.status(500).json({ success: false, message: 'Failed to add branch', error: error.message });
  }
});

/**
 * Add Outreach Clinic
 * POST /api/hospital/practice/clinics
 */
router.post('/clinics', verifyHospitalToken, async (req, res) => {
  try {
    const { name, type, parentBranch, location, schedule, doctor, services, capacity } = req.body;
    const hospitalId = req.hospitalId;

    if (!name || !location) {
      return res.status(400).json({ success: false, message: 'Clinic name and location are required' });
    }

    const [clinic] = await sequelize.query(
      `INSERT INTO outreach_clinics 
       (hospital_id, name, type, parent_branch, location, schedule, doctor, 
        services, capacity, status, created_at, updated_at)
       VALUES (:hospitalId, :name, :type, :parentBranch, :location, :schedule, :doctor,
               :services, :capacity, 'active', NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          hospitalId,
          name,
          type: type || 'daily',
          parentBranch,
          location: JSON.stringify(location),
          schedule: JSON.stringify(schedule || {}),
          doctor: JSON.stringify(doctor || {}),
          services: JSON.stringify(services || []),
          capacity: capacity || 0
        },
        type: QueryTypes.INSERT
      }
    );

    res.status(201).json({ success: true, message: 'Clinic added successfully', data: clinic[0] });
  } catch (error) {
    console.error('Error adding clinic:', error);
    res.status(500).json({ success: false, message: 'Failed to add clinic', error: error.message });
  }
});

/**
 * Add Ambulance Vehicle
 * POST /api/hospital/practice/ambulances/vehicles
 */
router.post('/ambulances/vehicles', verifyHospitalToken, async (req, res) => {
  try {
    const { vehicleNumber, type, driver, paramedic, equipment } = req.body;
    const hospitalId = req.hospitalId;

    if (!vehicleNumber || !type) {
      return res.status(400).json({ success: false, message: 'Vehicle number and type are required' });
    }

    const [vehicle] = await sequelize.query(
      `INSERT INTO ambulance_vehicles 
       (hospital_id, vehicle_number, type, driver, paramedic, equipment, 
        status, fuel_level, created_at, updated_at)
       VALUES (:hospitalId, :vehicleNumber, :type, :driver, :paramedic, :equipment,
               'available', 100, NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          hospitalId,
          vehicleNumber,
          type,
          driver: JSON.stringify(driver || {}),
          paramedic: JSON.stringify(paramedic || {}),
          equipment: JSON.stringify(equipment || [])
        },
        type: QueryTypes.INSERT
      }
    );

    res.status(201).json({ success: true, message: 'Ambulance vehicle added successfully', data: vehicle[0] });
  } catch (error) {
    console.error('Error adding ambulance:', error);
    res.status(500).json({ success: false, message: 'Failed to add ambulance vehicle', error: error.message });
  }
});

/**
 * Create Lab Test Order
 * POST /api/hospital/practice/lab-orders
 */
router.post('/lab-orders', verifyHospitalToken, async (req, res) => {
  try {
    const { patientId, tests, priority, notes, totalAmount } = req.body;
    const hospitalId = req.hospitalId;

    if (!patientId || !tests || tests.length === 0) {
      return res.status(400).json({ success: false, message: 'Patient ID and tests are required' });
    }

    const orderNumber = `LAB-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    const [order] = await sequelize.query(
      `INSERT INTO lab_orders 
       (order_number, patient_id, hospital_id, tests, priority, 
        notes, total_amount, status, created_at, updated_at)
       VALUES (:orderNumber, :patientId, :hospitalId, :tests, :priority,
               :notes, :totalAmount, 'ordered', NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          orderNumber,
          patientId,
          hospitalId,
          tests: JSON.stringify(tests),
          priority: priority || 'routine',
          notes,
          totalAmount: totalAmount || 0
        },
        type: QueryTypes.INSERT
      }
    );

    res.status(201).json({ success: true, message: 'Lab order created successfully', data: order[0] });
  } catch (error) {
    console.error('Error creating lab order:', error);
    res.status(500).json({ success: false, message: 'Failed to create lab order', error: error.message });
  }
});

/**
 * Create Imaging Test Order
 * POST /api/hospital/practice/imaging-orders
 */
router.post('/imaging-orders', verifyHospitalToken, async (req, res) => {
  try {
    const { patientId, tests, priority, notes, totalAmount } = req.body;
    const hospitalId = req.hospitalId;

    if (!patientId || !tests || tests.length === 0) {
      return res.status(400).json({ success: false, message: 'Patient ID and tests are required' });
    }

    const orderNumber = `IMG-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    const [order] = await sequelize.query(
      `INSERT INTO imaging_orders 
       (order_number, patient_id, hospital_id, tests, priority, 
        notes, total_amount, status, created_at, updated_at)
       VALUES (:orderNumber, :patientId, :hospitalId, :tests, :priority,
               :notes, :totalAmount, 'ordered', NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          orderNumber,
          patientId,
          hospitalId,
          tests: JSON.stringify(tests),
          priority: priority || 'routine',
          notes,
          totalAmount: totalAmount || 0
        },
        type: QueryTypes.INSERT
      }
    );

    res.status(201).json({ success: true, message: 'Imaging order created successfully', data: order[0] });
  } catch (error) {
    console.error('Error creating imaging order:', error);
    res.status(500).json({ success: false, message: 'Failed to create imaging order', error: error.message });
  }
});

/**
 * Schedule Procedure
 * POST /api/hospital/practice/procedures/schedule
 */
router.post('/procedures/schedule', verifyHospitalToken, async (req, res) => {
  try {
    const { procedureId, patientId, scheduledDate, scheduledTime, priority, anesthesiaType, room, notes, estimatedDuration } = req.body;
    const hospitalId = req.hospitalId;

    if (!procedureId || !patientId || !scheduledDate || !scheduledTime) {
      return res.status(400).json({ success: false, message: 'Procedure ID, patient ID, date and time are required' });
    }

    const [scheduled] = await sequelize.query(
      `INSERT INTO procedure_schedules 
       (procedure_id, patient_id, hospital_id, scheduled_date, 
        scheduled_time, priority, anesthesia_type, room, notes, estimated_duration,
        status, created_at, updated_at)
       VALUES (:procedureId, :patientId, :hospitalId, :scheduledDate,
               :scheduledTime, :priority, :anesthesiaType, :room, :notes, :estimatedDuration,
               'scheduled', NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          procedureId,
          patientId,
          hospitalId,
          scheduledDate,
          scheduledTime,
          priority: priority || 'routine',
          anesthesiaType,
          room,
          notes,
          estimatedDuration
        },
        type: QueryTypes.INSERT
      }
    );

    res.status(201).json({ success: true, message: 'Procedure scheduled successfully', data: scheduled[0] });
  } catch (error) {
    console.error('Error scheduling procedure:', error);
    res.status(500).json({ success: false, message: 'Failed to schedule procedure', error: error.message });
  }
});

export default router;
