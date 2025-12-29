import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

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
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const role = decoded.role || decoded.userType;
    if (role !== 'hospital') {
      return res.status(403).json({ success: false, message: 'Hospital role required' });
    }

    req.hospitalId = decoded.id || decoded.hospitalId;
    req.hospitalName = decoded.hospitalName || decoded.name || 'Hospital';
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
  const { date, status, department } = req.query;
  const state = await readState();
  const practice = getPractice(state, req.hospitalId, req.hospitalName);
  const filtered = practice.appointments.filter((apt) => {
    if (date && apt.date !== date) return false;
    if (status && apt.status !== status) return false;
    if (department && apt.department !== department) return false;
    return true;
  });
  res.json({ success: true, data: filtered, total: filtered.length });
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

export default router;
