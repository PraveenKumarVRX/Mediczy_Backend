import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { JWT_CONFIG } from '../../config/auth.config.js';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';
import { QueryTypes, Op } from 'sequelize';
import Appointment from '../../models/postgres/appointment.model.postgres.js';
import Bed from '../../models/postgres/bed.model.postgres.js';
import LabOrder from '../../models/postgres/labOrder.model.postgres.js';
import PharmacyInventory from '../../models/postgres/pharmacyInventory.model.postgres.js';
import PrescriptionDispensing from '../../models/postgres/prescriptionDispensing.model.postgres.js';
import InsuranceClaim from '../../models/postgres/insuranceClaim.model.postgres.js';
import InsurancePolicy from '../../models/postgres/insurancePolicy.model.postgres.js';
import MedicalRecord from '../../models/postgres/medicalRecord.model.postgres.js';
import EHRRecord from '../../models/postgres/ehrRecord.model.postgres.js';
import VitalSign from '../../models/postgres/vitalSign.model.postgres.js';
import n8nService from '../../services/n8n.service.js';

const router = express.Router();
const JWT_SECRET = JWT_CONFIG.SECRET;
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

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const role = decoded.role || decoded.userType;

    // Support both old system (role: hospital) and new multitenancy (role: hospital_admin, etc.)
    const validRoles = [
      'hospital',
      'hospital_admin',
      'doctor',
      'staff',
      'nurse',
      'accounts_staff',
      'mrd_staff',
      'insurance_desk_staff',
      'hr_staff',
      'it_edp_staff',
      'ot_staff',
      'icu_staff',
      'quality_staff',
      'security_staff'
    ];
    if (!validRoles.includes(role)) {
      return res.status(403).json({ success: false, message: 'Hospital role required' });
    }

    // Support both old system (decoded.id) and new multitenancy (decoded.tenant_id / decoded.hospital_id)
    req.hospitalId = decoded.hospital_id || decoded.tenant_id || decoded.id || decoded.hospitalId;
    req.hospitalOrgId = decoded.hospital_id || decoded.tenant_id || decoded.id || decoded.hospitalId;  // For DB queries
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

const formatUserName = (user) => {
  if (!user) return 'Unknown Patient';
  const parts = [user.firstName, user.lastName].filter(Boolean);
  return parts.length ? parts.join(' ') : user.email || `User ${user.id}`;
};

const mapSeverity = (vital) => {
  if (!vital) return 'Stable';

  const systolic = vital.systolic ?? null;
  const heartRate = vital.heartRate ?? null;
  const respiratoryRate = vital.respiratoryRate ?? null;
  const oxygenSaturation = vital.oxygenSaturation ?? null;
  const temperature = vital.temperature ?? null;

  if (
    (oxygenSaturation !== null && Number(oxygenSaturation) < 92) ||
    (systolic !== null && Number(systolic) < 90) ||
    (heartRate !== null && Number(heartRate) >= 120)
  ) {
    return 'Critical';
  }

  if (
    (oxygenSaturation !== null && Number(oxygenSaturation) < 95) ||
    (respiratoryRate !== null && Number(respiratoryRate) >= 24) ||
    (temperature !== null && Number(temperature) >= 38)
  ) {
    return 'Improving';
  }

  return 'Stable';
};

router.get('/icu/portal-data', verifyHospitalToken, async (req, res) => {
  try {
    const organizationId = req.hospitalId;
    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'Organization ID required' });
    }

    const allBeds = await Bed.findAll({
      where: { organizationId },
      order: [['ward', 'ASC'], ['bedNumber', 'ASC']]
    });

    const scopedBeds = allBeds.filter((bed) => {
      const ward = String(bed.ward || '').toLowerCase();
      const bedType = String(bed.bedType || '').toLowerCase();
      return ward.includes('icu') || bedType.includes('icu');
    });

    const activeBeds = scopedBeds.length ? scopedBeds : allBeds;

    const vitals = await VitalSign.findAll({
      where: { organizationId },
      order: [['recordedAt', 'DESC']]
    });

    const latestVitalsByPatient = new Map();
    vitals.forEach((vital) => {
      if (!latestVitalsByPatient.has(vital.patientId)) {
        latestVitalsByPatient.set(vital.patientId, vital);
      }
    });

    const patientIds = Array.from(new Set(activeBeds.map((bed) => bed.patientId).filter(Boolean)));
    const records = patientIds.length
      ? await MedicalRecord.findAll({
          where: {
            organizationId,
            patientId: { [Op.in]: patientIds }
          },
          order: [['createdAt', 'DESC']]
        })
      : [];

    const latestRecordByPatient = new Map();
    records.forEach((record) => {
      if (!latestRecordByPatient.has(record.patientId)) {
        latestRecordByPatient.set(record.patientId, record);
      }
    });

    const doctorIds = Array.from(new Set(records.map((record) => record.doctorId).filter(Boolean)));
    const userIds = Array.from(new Set([...patientIds, ...doctorIds]));
    const users = userIds.length
      ? await sequelize.query(
          'SELECT id, "firstName", "lastName", email, "phoneNumber" FROM users WHERE id IN (:userIds)',
          {
            replacements: { userIds },
            type: QueryTypes.SELECT
          }
        )
      : [];

    const userMap = new Map(users.map((user) => [user.id, user]));

    const patients = activeBeds
      .filter((bed) => bed.patientId)
      .map((bed) => {
        const patientUser = userMap.get(bed.patientId);
        const latestVital = latestVitalsByPatient.get(bed.patientId) || null;
        const latestRecord = latestRecordByPatient.get(bed.patientId) || null;
        const doctorUser = latestRecord?.doctorId ? userMap.get(latestRecord.doctorId) : null;
        const systolic = latestVital?.systolic ?? null;
        const diastolic = latestVital?.diastolic ?? null;
        const map = systolic !== null && diastolic !== null
          ? Math.round((Number(systolic) + 2 * Number(diastolic)) / 3)
          : null;
        const risk = mapSeverity(latestVital);

        return {
          patientId: bed.patientId,
          bedId: bed.id,
          bed: bed.bedNumber,
          zone: bed.ward || 'ICU',
          type: bed.bedType || 'ICU',
          nurseRatio: risk === 'Critical' ? '1:1' : '1:2',
          turnaround: String(bed.status || '').toLowerCase() === 'available' ? 'Ready' : 'In use',
          patient: formatUserName(patientUser),
          age: null,
          diagnosis: latestRecord?.diagnosis || 'Diagnosis pending',
          consultant: formatUserName(doctorUser).replace('Unknown Patient', 'Assigned clinician'),
          vent: bed.bedType || 'Not charted',
          status: risk,
          score: latestRecord?.recordType || 'Review pending',
          hrs: bed.assignedAt ? Math.max(1, Math.round((Date.now() - new Date(bed.assignedAt).getTime()) / 3600000)) : 0,
          latestVitals: latestVital
            ? {
                hr: latestVital.heartRate ?? null,
                spo2: latestVital.oxygenSaturation ?? null,
                systolic,
                diastolic,
                map,
                rr: latestVital.respiratoryRate ?? null,
                temp: latestVital.temperature ?? null,
                recordedAt: latestVital.recordedAt
              }
            : null
        };
      });

    const alerts = patients.flatMap((patient) => {
      const vital = patient.latestVitals;
      if (!vital) return [];

      const nextAlerts = [];
      if (vital.hr !== null && Number(vital.hr) >= 120) {
        nextAlerts.push({ source: patient.bed, alert: `Heart rate elevated at ${vital.hr} bpm`, severity: 'Critical' });
      }
      if (vital.spo2 !== null && Number(vital.spo2) < 92) {
        nextAlerts.push({ source: patient.bed, alert: `SpO2 dropped to ${vital.spo2}%`, severity: 'Critical' });
      }
      if (vital.map !== null && Number(vital.map) < 65) {
        nextAlerts.push({ source: patient.bed, alert: `MAP below target at ${vital.map}`, severity: 'High' });
      }
      if (vital.temp !== null && Number(vital.temp) >= 38) {
        nextAlerts.push({ source: patient.bed, alert: `Temperature elevated at ${vital.temp} C`, severity: 'High' });
      }

      return nextAlerts.map((entry) => ({
        ...entry,
        owner: patient.consultant,
        time: patient.latestVitals?.recordedAt || null
      }));
    }).slice(0, 10);

    const vitalsRows = patients
      .filter((patient) => patient.latestVitals)
      .map((patient) => ({
        patient: patient.patient,
        bed: patient.bed,
        hr: patient.latestVitals.hr,
        spo2: patient.latestVitals.spo2,
        map: patient.latestVitals.map,
        rr: patient.latestVitals.rr,
        temp: patient.latestVitals.temp,
        status: patient.status,
        recordedAt: patient.latestVitals.recordedAt
      }));

    return res.json({
      success: true,
      data: {
        summary: {
          totalBeds: activeBeds.length,
          occupiedBeds: activeBeds.filter((bed) => String(bed.status || '').toLowerCase() === 'occupied').length,
          availableBeds: activeBeds.filter((bed) => String(bed.status || '').toLowerCase() === 'available').length,
          reservedBeds: activeBeds.filter((bed) => String(bed.status || '').toLowerCase() === 'reserved').length,
          monitoredBeds: patients.length,
          criticalPatients: patients.filter((patient) => patient.status === 'Critical').length,
          stablePatients: patients.filter((patient) => patient.status !== 'Critical').length,
          openAlerts: alerts.length
        },
        patients,
        livePatients: patients.slice(0, 6).map((patient) => ({
          bed: patient.bed,
          patient: patient.patient,
          mode: patient.vent,
          infusions: patient.diagnosis,
          hr: patient.latestVitals?.hr ?? 0,
          spo2: patient.latestVitals?.spo2 ?? 0,
          map: patient.latestVitals?.map ?? 0,
          rr: patient.latestVitals?.rr ?? 0,
          temp: patient.latestVitals?.temp ?? 0,
          score: patient.score,
          risk: patient.status
        })),
        beds: activeBeds.map((bed) => {
          const patient = patients.find((row) => row.bedId === bed.id);
          return {
            bed: bed.bedNumber,
            zone: bed.ward || 'ICU',
            type: bed.bedType || 'ICU',
            nurseRatio: patient?.nurseRatio || '1:2',
            status: String(bed.status || 'available').replace(/^./, (value) => value.toUpperCase()),
            turnaround: patient ? `${patient.hrs}h occupied` : 'Ready',
            patient: patient?.patient || null,
            diagnosis: patient?.diagnosis || null
          };
        }),
        vitals: vitalsRows,
        alerts,
        updatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching ICU portal data:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch ICU portal data', error: error.message });
  }
});

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

// Backward-compatible alias for older dashboard clients
router.get('/analytics/stats', verifyHospitalToken, async (req, res) => {
  try {
    const state = await readState();
    const practice = getPractice(state, req.hospitalId, req.hospitalName);
    const pendingClaims = await InsuranceClaim.count({
      where: {
        status: { [Op.in]: ['pending', 'submitted', 'query'] }
      }
    }).catch(() => 0);

    return res.json({
      success: true,
      data: {
        totalPatients: practice.patients.length,
        todayAdmissions: practice.patients.filter((p) => p.admissionStatus === 'IPD').length,
        activeClaims: pendingClaims,
        todayRevenue: 0,
        patients: practice.patients.length,
        ipd: practice.patients.filter((p) => p.admissionStatus === 'IPD').length,
        appointments: practice.appointments.length,
        staff: practice.staff.length,
        resources: practice.resources.length
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch analytics stats', error: error.message });
  }
});

router.get('/appointments', verifyHospitalToken, async (req, res) => {
  try {
    const { date, status, department, upcoming, priority, type, doctorId } = req.query;
    const hospitalId = req.hospitalId;
    const organizationId = req.hospitalOrgId || hospitalId;

    console.log('🏥 Hospital appointments request:', {
      hospitalId,
      organizationId,
      date,
      status,
      department,
      upcoming,
      priority,
      type,
      doctorId
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

    if (doctorId) {
      whereClause.doctorId = doctorId;
    }

    // Note: Priority and type filters applied after fetching
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
    let transformedAppointments = appointments.map(apt => ({
      id: apt.id.toString(),
      patientId: apt.userId?.toString() || '',
      patientName: apt.patientName || 'Unknown',
      patientPhone: apt.patientPhone || '',
      doctorId: apt.doctorId?.toString() || '',
      doctorName: apt.doctorName || 'Dr. Unknown',
      department: apt.specialization || 'General',
      date: apt.appointmentDate || '',
      time: apt.appointmentTime?.substring(0, 5) || '',
      type: apt.consultationType === 'in-person' ? 'IPD' : 'OPD',
      status: apt.status || 'Scheduled',
      priority: 'Normal', // Default - can be enhanced with metadata
      notes: apt.reason || '',
      createdAt: apt.createdAt || new Date().toISOString()
    }));

    // Apply in-memory filters for priority and type if needed
    if (priority) {
      transformedAppointments = transformedAppointments.filter(apt =>
        apt.priority.toLowerCase() === priority.toLowerCase()
      );
    }

    if (type) {
      transformedAppointments = transformedAppointments.filter(apt =>
        apt.type.toLowerCase() === type.toLowerCase()
      );
    }

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
  try {
    const { patientName, patientPhone, patientEmail, userId, doctorId, appointmentDate, appointmentTime, reason, consultationType } = req.body;

    if (!patientName || !patientPhone || !appointmentDate || !appointmentTime) {
      return res.status(400).json({
        success: false,
        message: 'Patient name, phone, date, and time are required'
      });
    }

    const hospitalId = req.hospitalId;
    const organizationId = req.hospitalOrgId || hospitalId;

    // Fetch doctor details if doctorId provided
    let doctorName = 'Unassigned';
    let specialization = 'General';
    if (doctorId) {
      const Doctor = (await import('../../models/postgres/doctor.model.postgres.js')).default;
      const doctor = await Doctor.findByPk(doctorId);
      if (doctor) {
        doctorName = `Dr. ${doctor.firstName} ${doctor.lastName}`;
        specialization = doctor.specialization || 'General';
      }
    }

    // Create appointment in PostgreSQL
    const appointment = await Appointment.create({
      userId: userId || null, // Optional - for walk-in patients
      patientId: userId || null, // Link patient for doctor queries
      patientName,
      patientPhone,
      patientEmail: patientEmail || null,
      doctorId: doctorId || null,
      doctorName,
      specialization,
      appointmentDate,
      appointmentTime,
      reason: reason || '',
      consultationType: consultationType || 'online',
      status: 'scheduled',
      paymentStatus: 'pending',
      organization_id: organizationId,
      organization_type: 'hospital'
    });

    console.log('✅ Hospital created appointment:', appointment.id);

    return res.status(201).json({
      success: true,
      message: 'Appointment created successfully',
      data: {
        id: appointment.id.toString(),
        patientName: appointment.patientName,
        doctorName: appointment.doctorName,
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
        status: appointment.status
      }
    });
  } catch (error) {
    console.error('Create hospital appointment error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create appointment',
      error: error.message
    });
  }
});

router.patch('/appointments/:id', verifyHospitalToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, appointmentDate, appointmentTime, reason, doctorId } = req.body;
    const hospitalId = req.hospitalId;
    const organizationId = req.hospitalOrgId || hospitalId;

    // Find appointment belonging to this hospital
    const appointment = await Appointment.findOne({
      where: {
        id,
        organization_id: organizationId
      }
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found or does not belong to this hospital'
      });
    }

    // Update allowed fields
    const updateData = {};
    if (status) updateData.status = status;
    if (appointmentDate) updateData.appointmentDate = appointmentDate;
    if (appointmentTime) updateData.appointmentTime = appointmentTime;
    if (reason) updateData.reason = reason;
    if (doctorId) updateData.doctorId = doctorId;

    await appointment.update(updateData);

    console.log('✅ Hospital updated appointment:', id);

    return res.json({
      success: true,
      message: 'Appointment updated successfully',
      data: {
        id: appointment.id.toString(),
        status: appointment.status,
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime
      }
    });
  } catch (error) {
    console.error('Update hospital appointment error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update appointment',
      error: error.message
    });
  }
});

router.delete('/appointments/:id', verifyHospitalToken, async (req, res) => {
  try {
    const { id } = req.params;
    const hospitalId = req.hospitalId;
    const organizationId = req.hospitalOrgId || hospitalId;

    // Find appointment belonging to this hospital
    const appointment = await Appointment.findOne({
      where: {
        id,
        organization_id: organizationId
      }
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found or does not belong to this hospital'
      });
    }

    // Soft delete by updating status to cancelled
    await appointment.update({
      status: 'cancelled',
      cancellationReason: 'Cancelled by hospital',
      cancelledAt: new Date()
    });

    console.log('✅ Hospital cancelled appointment:', id);

    return res.json({
      success: true,
      message: 'Appointment cancelled successfully'
    });
  } catch (error) {
    console.error('Delete hospital appointment error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to cancel appointment',
      error: error.message
    });
  }
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

// Backward-compatible alias for older dashboard clients
router.get('/patients/recent-admissions', verifyHospitalToken, async (req, res) => {
  try {
    const state = await readState();
    const practice = getPractice(state, req.hospitalId, req.hospitalName);
    const admissions = practice.patients
      .filter((p) => ['ipd', 'admitted', 'under review'].includes(String(p.admissionStatus || '').toLowerCase()))
      .sort((a, b) => new Date(b.admissionDate || b.createdAt || 0).getTime() - new Date(a.admissionDate || a.createdAt || 0).getTime())
      .slice(0, 10);

    return res.json({ success: true, admissions, data: admissions, total: admissions.length });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch recent admissions', error: error.message });
  }
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

// ============================================
// HOSPITAL DOCTORS MANAGEMENT
// ============================================

/**
 * @route   GET /api/hospital/practice/doctors
 * @desc    Get all doctors in the hospital
 * @access  Private (Hospital)
 */
router.get('/doctors', verifyHospitalToken, async (req, res) => {
  try {
    const { specialization, status, department } = req.query;
    const state = await readState();
    const practice = getPractice(state, req.hospitalId, req.hospitalName);
    
    // Initialize doctors array if not exists
    if (!practice.doctors) {
      practice.doctors = [];
    }
    
    let doctors = practice.doctors;
    
    // Apply filters
    if (specialization) {
      doctors = doctors.filter(d => d.specialization === specialization);
    }
    if (status) {
      doctors = doctors.filter(d => d.status === status);
    }
    if (department) {
      doctors = doctors.filter(d => d.department === department);
    }
    
    res.json({ 
      success: true, 
      data: doctors, 
      total: doctors.length,
      specializations: [...new Set(practice.doctors.map(d => d.specialization))].filter(Boolean)
    });
  } catch (error) {
    console.error('Error fetching hospital doctors:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch doctors' });
  }
});

/**
 * @route   POST /api/hospital/practice/doctors
 * @desc    Add a doctor to the hospital
 * @access  Private (Hospital)
 */
router.post('/doctors', verifyHospitalToken, async (req, res) => {
  try {
    const { 
      firstName, lastName, name, email, phone, phoneNumber,
      specialization, department, qualification, experience,
      registrationNumber, consultationFee, shift, status, password
    } = req.body;
    
    const doctorName = name || `Dr. ${firstName || ''} ${lastName || ''}`.trim();
    const doctorPhone = phone || phoneNumber;
    
    if (!doctorName || doctorName === 'Dr.') {
      return res.status(400).json({ 
        success: false, 
        message: 'Doctor name is required' 
      });
    }
    
    if (!doctorPhone) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number is required' 
      });
    }
    
    if (!specialization) {
      return res.status(400).json({ 
        success: false, 
        message: 'Specialization is required' 
      });
    }

    const state = await readState();
    const practice = getPractice(state, req.hospitalId, req.hospitalName);
    
    // Initialize doctors array if not exists
    if (!practice.doctors) {
      practice.doctors = [];
    }
    
    // Check for duplicate by phone or email
    const existingDoctor = practice.doctors.find(d => 
      d.phone === doctorPhone || (email && d.email === email)
    );
    
    if (existingDoctor) {
      return res.status(400).json({ 
        success: false, 
        message: 'A doctor with this phone/email already exists' 
      });
    }

    const doctor = {
      id: generateId('DOC'),
      name: doctorName,
      firstName: firstName || doctorName.replace('Dr. ', '').split(' ')[0],
      lastName: lastName || doctorName.replace('Dr. ', '').split(' ').slice(1).join(' '),
      email: email || '',
      phone: doctorPhone,
      specialization,
      department: department || specialization,
      qualification: qualification || 'MBBS',
      experience: parseInt(experience) || 0,
      registrationNumber: registrationNumber || '',
      consultationFee: parseFloat(consultationFee) || 500,
      shift: shift || 'Morning',
      status: status || 'active',
      hospitalId: req.hospitalId,
      joiningDate: new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString()
    };

    practice.doctors.unshift(doctor);
    await writeState(state);

    res.status(201).json({ 
      success: true, 
      message: 'Doctor added successfully',
      data: doctor 
    });
  } catch (error) {
    console.error('Error adding doctor:', error);
    res.status(500).json({ success: false, message: 'Failed to add doctor' });
  }
});

/**
 * @route   GET /api/hospital/practice/doctors/:id
 * @desc    Get a specific doctor
 * @access  Private (Hospital)
 */
router.get('/doctors/:id', verifyHospitalToken, async (req, res) => {
  try {
    const state = await readState();
    const practice = getPractice(state, req.hospitalId, req.hospitalName);
    
    if (!practice.doctors) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }
    
    const doctor = practice.doctors.find(d => d.id === req.params.id);
    
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }
    
    res.json({ success: true, data: doctor });
  } catch (error) {
    console.error('Error fetching doctor:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch doctor' });
  }
});

/**
 * @route   PATCH /api/hospital/practice/doctors/:id
 * @desc    Update a doctor
 * @access  Private (Hospital)
 */
router.patch('/doctors/:id', verifyHospitalToken, async (req, res) => {
  try {
    const state = await readState();
    const practice = getPractice(state, req.hospitalId, req.hospitalName);
    
    if (!practice.doctors) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }
    
    const index = practice.doctors.findIndex(d => d.id === req.params.id);
    
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }
    
    // Update fields
    const updates = { ...req.body };
    delete updates.id; // Prevent ID modification
    delete updates.hospitalId; // Prevent hospital ID modification
    
    // Update name if firstName/lastName provided
    if (updates.firstName || updates.lastName) {
      const fn = updates.firstName || practice.doctors[index].firstName || '';
      const ln = updates.lastName || practice.doctors[index].lastName || '';
      updates.name = `Dr. ${fn} ${ln}`.trim();
    }
    
    practice.doctors[index] = { 
      ...practice.doctors[index], 
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    await writeState(state);
    
    res.json({ 
      success: true, 
      message: 'Doctor updated successfully',
      data: practice.doctors[index] 
    });
  } catch (error) {
    console.error('Error updating doctor:', error);
    res.status(500).json({ success: false, message: 'Failed to update doctor' });
  }
});

/**
 * @route   DELETE /api/hospital/practice/doctors/:id
 * @desc    Remove a doctor from hospital
 * @access  Private (Hospital)
 */
router.delete('/doctors/:id', verifyHospitalToken, async (req, res) => {
  try {
    const state = await readState();
    const practice = getPractice(state, req.hospitalId, req.hospitalName);
    
    if (!practice.doctors) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }
    
    const before = practice.doctors.length;
    practice.doctors = practice.doctors.filter(d => d.id !== req.params.id);
    
    if (practice.doctors.length === before) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }
    
    await writeState(state);
    
    res.json({ success: true, message: 'Doctor removed successfully' });
  } catch (error) {
    console.error('Error removing doctor:', error);
    res.status(500).json({ success: false, message: 'Failed to remove doctor' });
  }
});

/**
 * @route   GET /api/hospital/practice/doctors/by-specialization
 * @desc    Get doctors grouped by specialization
 * @access  Private (Hospital)
 */
router.get('/doctors-by-specialization', verifyHospitalToken, async (req, res) => {
  try {
    const state = await readState();
    const practice = getPractice(state, req.hospitalId, req.hospitalName);
    
    if (!practice.doctors) {
      return res.json({ success: true, data: {}, total: 0 });
    }
    
    const grouped = practice.doctors.reduce((acc, doctor) => {
      const spec = doctor.specialization || 'General';
      if (!acc[spec]) acc[spec] = [];
      acc[spec].push(doctor);
      return acc;
    }, {});
    
    res.json({ 
      success: true, 
      data: grouped,
      specializations: Object.keys(grouped),
      total: practice.doctors.length
    });
  } catch (error) {
    console.error('Error fetching doctors by specialization:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch doctors' });
  }
});

// ============================================
// STAFF MANAGEMENT (Non-Doctor Staff)
// ============================================

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
 * Update Discharge Summary (Edit)
 * PUT /api/hospital/practice/discharge-summaries/:id
 */
router.put('/discharge-summaries/:id', verifyHospitalToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { diagnosis, procedures, medications, followUp, status } = req.body;
    const hospitalId = req.hospitalId;

    if (!id) {
      return res.status(400).json({ success: false, message: 'Summary ID is required' });
    }

    const [updated] = await sequelize.query(
      `UPDATE discharge_summaries 
       SET diagnosis = :diagnosis,
           procedures = :procedures,
           medications = :medications,
           follow_up = :followUp,
           status = COALESCE(:status, status),
           updated_at = NOW()
       WHERE id = :id AND hospital_id = :hospitalId
       RETURNING *`,
      {
        replacements: {
          id,
          diagnosis: JSON.stringify(diagnosis || []),
          procedures: JSON.stringify(procedures || []),
          medications: JSON.stringify(medications || []),
          followUp,
          status: status || null,
          hospitalId
        },
        type: QueryTypes.UPDATE
      }
    );

    if (!updated || updated.length === 0) {
      return res.status(404).json({ success: false, message: 'Discharge summary not found or access denied' });
    }

    res.json({ success: true, message: 'Discharge summary updated successfully', data: updated[0] });
  } catch (error) {
    console.error('Error updating discharge summary:', error);
    res.status(500).json({ success: false, message: 'Failed to update discharge summary', error: error.message });
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

    // Notify via n8n (best-effort)
    try {
      let patient;
      let doctor;

      if (patientId) {
        [patient] = await sequelize.query(
          'SELECT id, "firstName", "lastName", email, "phoneNumber" FROM users WHERE id = :id',
          { replacements: { id: patientId }, type: QueryTypes.SELECT }
        );
      }

      if (doctorId) {
        [doctor] = await sequelize.query(
          'SELECT id, "firstName", "lastName", email FROM users WHERE id = :id',
          { replacements: { id: doctorId }, type: QueryTypes.SELECT }
        );
      }

      await n8nService.prescriptionIssued({
        id: prescription?.[0]?.id,
        patientId: patientId,
        patientName: patient
          ? `${patient.firstName || ''} ${patient.lastName || ''}`.trim()
          : undefined,
        patientEmail: patient?.email,
        patientPhone: patient?.phoneNumber,
        doctorName: doctor
          ? `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim()
          : undefined,
        medications: medications,
        instructions: notes,
        pharmacyPreference: 'hospital-practice'
      });
    } catch (n8nError) {
      console.error('Failed to trigger n8n prescription workflow:', n8nError);
    }

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

// ========================================
// BEDS MANAGEMENT ENDPOINTS
// ========================================

/**
 * GET /api/hospital/practice/beds
 * List all beds for the hospital with optional filters
 */
router.get('/beds', verifyHospitalToken, async (req, res) => {
  try {
    const { organizationId } = req.hospitalId ? { organizationId: req.hospitalId } : req.query;
    const { status, ward, bedType, patientId } = req.query;

    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'Organization ID required' });
    }

    const whereClause = { organizationId };

    if (status) whereClause.status = status;
    if (ward) whereClause.ward = ward;
    if (bedType) whereClause.bedType = bedType;
    if (patientId) whereClause.patientId = patientId;

    const beds = await Bed.findAll({
      where: whereClause,
      order: [['ward', 'ASC'], ['bedNumber', 'ASC']]
    });

    // Manually fetch patient details for occupied beds
    const bedsWithPatients = await Promise.all(beds.map(async (bed) => {
      const bedData = bed.toJSON();
      if (bed.patientId) {
        const patient = await sequelize.query(
          'SELECT id, "firstName", "lastName", email, "phoneNumber" FROM users WHERE id = :patientId',
          {
            replacements: { patientId: bed.patientId },
            type: QueryTypes.SELECT
          }
        );
        bedData.patient = patient[0] || null;
      }
      return bedData;
    }));

    res.json({
      success: true,
      data: bedsWithPatients,
      total: beds.length,
      stats: {
        available: beds.filter(b => b.status === 'available').length,
        occupied: beds.filter(b => b.status === 'occupied').length,
        maintenance: beds.filter(b => b.status === 'maintenance').length,
        reserved: beds.filter(b => b.status === 'reserved').length
      }
    });
  } catch (error) {
    console.error('Error fetching beds:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch beds', error: error.message });
  }
});

// Backward-compatible alias for older dashboard clients
router.get('/beds/occupancy', verifyHospitalToken, async (req, res) => {
  try {
    const organizationId = req.hospitalId;
    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'Organization ID required' });
    }

    const beds = await Bed.findAll({ where: { organizationId } });
    const wardMap = {};

    beds.forEach((bed) => {
      const ward = bed.ward || 'General Ward';
      if (!wardMap[ward]) {
        wardMap[ward] = { department: ward, total: 0, occupied: 0, color: 'teal' };
      }
      wardMap[ward].total += 1;
      if (String(bed.status || '').toLowerCase() === 'occupied') {
        wardMap[ward].occupied += 1;
      }
    });

    const wards = Object.values(wardMap);
    return res.json({ success: true, wards, data: wards });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch bed occupancy', error: error.message });
  }
});

// Backward-compatible alias for older dashboard clients
router.get('/claims/pending', verifyHospitalToken, async (req, res) => {
  try {
    const claims = await InsuranceClaim.findAll({
      where: { status: { [Op.in]: ['pending', 'submitted', 'query'] } },
      attributes: ['id', 'claimNumber', 'claimAmount', 'status', 'submittedAt', 'createdAt'],
      order: [['submittedAt', 'DESC']],
      limit: 20
    });

    return res.json({ success: true, claims, data: claims, total: claims.length });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch pending claims', error: error.message });
  }
});

// Backward-compatible alias for older dashboard clients
router.get('/notifications/recent', verifyHospitalToken, async (req, res) => {
  return res.json({ success: true, notifications: [] });
});

/**
 * POST /api/hospital/practice/beds
 * Create a new bed
 */
router.post('/beds', verifyHospitalToken, async (req, res) => {
  try {
    const organizationId = req.hospitalId;
    const { bedNumber, ward, bedType, status, notes } = req.body;

    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'Organization ID required' });
    }

    if (!bedNumber || !ward) {
      return res.status(400).json({ success: false, message: 'Bed number and ward are required' });
    }

    // Check for duplicate bed number in same organization
    const existing = await Bed.findOne({
      where: { bedNumber, organizationId }
    });

    if (existing) {
      return res.status(409).json({ success: false, message: 'Bed number already exists in this hospital' });
    }

    const bed = await Bed.create({
      bedNumber,
      ward,
      bedType,
      status: status || 'available',
      notes,
      organizationId
    });

    res.status(201).json({ success: true, message: 'Bed created successfully', data: bed });
  } catch (error) {
    console.error('Error creating bed:', error);
    res.status(500).json({ success: false, message: 'Failed to create bed', error: error.message });
  }
});

/**
 * PATCH /api/hospital/practice/beds/:id
 * Update bed status or assign/release patient
 */
router.patch('/beds/:id', verifyHospitalToken, async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.hospitalId;
    const { status, patientId, notes } = req.body;

    const bed = await Bed.findOne({
      where: { id, organizationId }
    });

    if (!bed) {
      return res.status(404).json({ success: false, message: 'Bed not found' });
    }

    // Handle patient assignment/release
    if (patientId !== undefined) {
      if (patientId) {
        // Assign patient
        bed.patientId = patientId;
        bed.status = 'occupied';
        bed.assignedAt = new Date();
        bed.releasedAt = null;
      } else {
        // Release patient
        bed.patientId = null;
        bed.status = 'available';
        bed.releasedAt = new Date();
      }
    }

    if (status) bed.status = status;
    if (notes !== undefined) bed.notes = notes;

    await bed.save();

    const updatedBed = bed.toJSON();
    if (bed.patientId) {
      const patient = await sequelize.query(
        'SELECT id, "firstName", "lastName", email FROM users WHERE id = :patientId',
        {
          replacements: { patientId: bed.patientId },
          type: QueryTypes.SELECT
        }
      );
      updatedBed.patient = patient[0] || null;
    }

    res.json({ success: true, message: 'Bed updated successfully', data: updatedBed });
  } catch (error) {
    console.error('Error updating bed:', error);
    res.status(500).json({ success: false, message: 'Failed to update bed', error: error.message });
  }
});

/**
 * DELETE /api/hospital/practice/beds/:id
 * Delete a bed
 */
router.delete('/beds/:id', verifyHospitalToken, async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.hospitalId;

    const bed = await Bed.findOne({
      where: { id, organizationId }
    });

    if (!bed) {
      return res.status(404).json({ success: false, message: 'Bed not found' });
    }

    if (bed.status === 'occupied') {
      return res.status(400).json({ success: false, message: 'Cannot delete occupied bed' });
    }

    await bed.destroy();

    res.json({ success: true, message: 'Bed deleted successfully' });
  } catch (error) {
    console.error('Error deleting bed:', error);
    res.status(500).json({ success: false, message: 'Failed to delete bed', error: error.message });
  }
});

// ========================================
// LABS MANAGEMENT ENDPOINTS
// ========================================

/**
 * GET /api/hospital/practice/labs
 * List all lab orders for the hospital
 */
router.get('/labs', verifyHospitalToken, async (req, res) => {
  try {
    const { organizationId } = req.hospitalId ? { organizationId: req.hospitalId } : req.query;
    const { status, priority, testCategory, patientId, doctorId, fromDate, toDate } = req.query;

    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'Organization ID required' });
    }

    const whereClause = { organizationId };

    if (status) whereClause.status = status;
    if (priority) whereClause.priority = priority;
    if (testCategory) whereClause.testCategory = testCategory;
    if (patientId) whereClause.patientId = patientId;
    if (doctorId) whereClause.doctorId = doctorId;

    if (fromDate || toDate) {
      whereClause.created_at = {};
      if (fromDate) whereClause.created_at[Op.gte] = new Date(fromDate);
      if (toDate) whereClause.created_at[Op.lte] = new Date(toDate);
    }

    const labOrders = await LabOrder.findAll({
      where: whereClause,
      order: [['created_at', 'DESC']]
    });

    // Manually fetch patient and doctor details
    const labOrdersWithDetails = await Promise.all(labOrders.map(async (order) => {
      const orderData = order.toJSON();
      if (order.patientId) {
        const [patient] = await sequelize.query(
          'SELECT id, "firstName", "lastName", email, "phoneNumber" FROM users WHERE id = :id',
          { replacements: { id: order.patientId }, type: QueryTypes.SELECT }
        );
        orderData.patient = patient || null;
      }
      if (order.doctorId) {
        const [doctor] = await sequelize.query(
          'SELECT id, "firstName", "lastName", email FROM users WHERE id = :id',
          { replacements: { id: order.doctorId }, type: QueryTypes.SELECT }
        );
        orderData.doctor = doctor || null;
      }
      return orderData;
    }));

    res.json({
      success: true,
      data: labOrdersWithDetails,
      total: labOrdersWithDetails.length,
      stats: {
        pending: labOrdersWithDetails.filter(l => l.status === 'pending').length,
        sampleCollected: labOrdersWithDetails.filter(l => l.status === 'sample_collected').length,
        inProgress: labOrdersWithDetails.filter(l => l.status === 'in_progress').length,
        completed: labOrdersWithDetails.filter(l => l.status === 'completed').length,
        urgent: labOrdersWithDetails.filter(l => l.priority === 'urgent').length
      }
    });
  } catch (error) {
    console.error('Error fetching lab orders:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch lab orders', error: error.message });
  }
});

/**
 * POST /api/hospital/practice/labs
 * Create a new lab order
 */
router.post('/labs', verifyHospitalToken, async (req, res) => {
  try {
    const organizationId = req.hospitalId;
    const { patientId, doctorId, testType, testCategory, priority, notes } = req.body;

    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'Organization ID required' });
    }

    if (!patientId || !doctorId || !testType) {
      return res.status(400).json({ success: false, message: 'Patient ID, Doctor ID, and Test Type are required' });
    }

    // Generate unique order number
    const orderNumber = `LAB${Date.now()}${Math.floor(Math.random() * 1000)}`;

    const labOrder = await LabOrder.create({
      orderNumber,
      patientId,
      doctorId,
      testType,
      testCategory,
      priority: priority || 'normal',
      status: 'pending',
      notes,
      organizationId
    });

    // Fetch with patient and doctor details
    const createdOrder = labOrder.toJSON();
    if (labOrder.patientId) {
      const [patient] = await sequelize.query(
        'SELECT id, "firstName", "lastName", email FROM users WHERE id = :id',
        { replacements: { id: labOrder.patientId }, type: QueryTypes.SELECT }
      );
      createdOrder.patient = patient || null;
    }
    if (labOrder.doctorId) {
      const [doctor] = await sequelize.query(
        'SELECT id, "firstName", "lastName", email FROM users WHERE id = :id',
        { replacements: { id: labOrder.doctorId }, type: QueryTypes.SELECT }
      );
      createdOrder.doctor = doctor || null;
    }

    res.status(201).json({ success: true, message: 'Lab order created successfully', data: createdOrder });
  } catch (error) {
    console.error('Error creating lab order:', error);
    res.status(500).json({ success: false, message: 'Failed to create lab order', error: error.message });
  }
});

/**
 * PATCH /api/hospital/practice/labs/:id
 * Update lab order status, results, or notes
 */
router.patch('/labs/:id', verifyHospitalToken, async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.hospitalId;
    const { status, results, notes, sampleCollectedAt } = req.body;

    const labOrder = await LabOrder.findOne({
      where: { id, organizationId }
    });

    if (!labOrder) {
      return res.status(404).json({ success: false, message: 'Lab order not found' });
    }

    if (status) labOrder.status = status;
    if (results !== undefined) labOrder.results = results;
    if (notes !== undefined) labOrder.notes = notes;
    if (sampleCollectedAt) labOrder.sampleCollectedAt = new Date(sampleCollectedAt);

    await labOrder.save();

    const updatedOrder = labOrder.toJSON();
    if (labOrder.patientId) {
      const [patient] = await sequelize.query(
        'SELECT id, "firstName", "lastName", email FROM users WHERE id = :id',
        { replacements: { id: labOrder.patientId }, type: QueryTypes.SELECT }
      );
      updatedOrder.patient = patient || null;
    }
    if (labOrder.doctorId) {
      const [doctor] = await sequelize.query(
        'SELECT id, "firstName", "lastName", email FROM users WHERE id = :id',
        { replacements: { id: labOrder.doctorId }, type: QueryTypes.SELECT }
      );
      updatedOrder.doctor = doctor || null;
    }

    res.json({ success: true, message: 'Lab order updated successfully', data: updatedOrder });
  } catch (error) {
    console.error('Error updating lab order:', error);
    res.status(500).json({ success: false, message: 'Failed to update lab order', error: error.message });
  }
});

// ========================================
// PHARMACY MANAGEMENT ENDPOINTS
// ========================================

/**
 * GET /api/hospital/practice/pharmacy
 * List pharmacy inventory
 */
router.get('/pharmacy', verifyHospitalToken, async (req, res) => {
  try {
    const { organizationId } = req.hospitalId ? { organizationId: req.hospitalId } : req.query;
    const { lowStock, search } = req.query;

    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'Organization ID required' });
    }

    const whereClause = { organizationId };

    if (search) {
      whereClause[Op.or] = [
        { medicineName: { [Op.iLike]: `%${search}%` } },
        { genericName: { [Op.iLike]: `%${search}%` } }
      ];
    }

    let inventory = await PharmacyInventory.findAll({
      where: whereClause,
      order: [['medicineName', 'ASC']]
    });

    // Filter low stock items if requested
    if (lowStock === 'true') {
      inventory = inventory.filter(item => item.quantity <= item.reorderLevel);
    }

    res.json({
      success: true,
      data: inventory,
      total: inventory.length,
      stats: {
        totalItems: inventory.length,
        lowStock: inventory.filter(item => item.quantity <= item.reorderLevel).length,
        outOfStock: inventory.filter(item => item.quantity === 0).length
      }
    });
  } catch (error) {
    console.error('Error fetching pharmacy inventory:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch inventory', error: error.message });
  }
});

/**
 * POST /api/hospital/practice/pharmacy
 * Add new medicine to inventory
 */
router.post('/pharmacy', verifyHospitalToken, async (req, res) => {
  try {
    const organizationId = req.hospitalId;
    const {
      medicineName,
      genericName,
      manufacturer,
      batchNumber,
      quantity,
      unit,
      unitPrice,
      expiryDate,
      reorderLevel
    } = req.body;

    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'Organization ID required' });
    }

    if (!medicineName || quantity === undefined) {
      return res.status(400).json({ success: false, message: 'Medicine name and quantity are required' });
    }

    const medicine = await PharmacyInventory.create({
      medicineName,
      genericName,
      manufacturer,
      batchNumber,
      quantity,
      unit,
      unitPrice,
      expiryDate,
      reorderLevel: reorderLevel || 10,
      organizationId
    });

    res.status(201).json({ success: true, message: 'Medicine added to inventory', data: medicine });
  } catch (error) {
    console.error('Error adding medicine:', error);
    res.status(500).json({ success: false, message: 'Failed to add medicine', error: error.message });
  }
});

/**
 * PATCH /api/hospital/practice/pharmacy/:id
 * Update medicine inventory (quantity, price, etc.)
 */
router.patch('/pharmacy/:id', verifyHospitalToken, async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.hospitalId;
    const { quantity, unitPrice, reorderLevel, batchNumber, expiryDate } = req.body;

    const medicine = await PharmacyInventory.findOne({
      where: { id, organizationId }
    });

    if (!medicine) {
      return res.status(404).json({ success: false, message: 'Medicine not found' });
    }

    if (quantity !== undefined) medicine.quantity = quantity;
    if (unitPrice !== undefined) medicine.unitPrice = unitPrice;
    if (reorderLevel !== undefined) medicine.reorderLevel = reorderLevel;
    if (batchNumber !== undefined) medicine.batchNumber = batchNumber;
    if (expiryDate !== undefined) medicine.expiryDate = expiryDate;

    await medicine.save();

    res.json({ success: true, message: 'Inventory updated successfully', data: medicine });
  } catch (error) {
    console.error('Error updating inventory:', error);
    res.status(500).json({ success: false, message: 'Failed to update inventory', error: error.message });
  }
});

/**
 * GET /api/hospital/practice/pharmacy/prescriptions
 * List prescription dispensing records
 */
router.get('/pharmacy/prescriptions', verifyHospitalToken, async (req, res) => {
  try {
    const { organizationId } = req.hospitalId ? { organizationId: req.hospitalId } : req.query;
    const { dispensed, patientId, fromDate, toDate } = req.query;

    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'Organization ID required' });
    }

    const whereClause = { organizationId };

    if (dispensed !== undefined) whereClause.dispensed = dispensed === 'true';
    if (patientId) whereClause.patientId = patientId;

    if (fromDate || toDate) {
      whereClause.created_at = {};
      if (fromDate) whereClause.created_at[Op.gte] = new Date(fromDate);
      if (toDate) whereClause.created_at[Op.lte] = new Date(toDate);
    }

    const prescriptions = await PrescriptionDispensing.findAll({
      where: whereClause,
      order: [['created_at', 'DESC']]
    });

    // Manually fetch related data
    const prescriptionsWithDetails = await Promise.all(prescriptions.map(async (prescription) => {
      const prescriptionData = prescription.toJSON();
      if (prescription.patientId) {
        const [patient] = await sequelize.query(
          'SELECT id, "firstName", "lastName", email FROM users WHERE id = :id',
          { replacements: { id: prescription.patientId }, type: QueryTypes.SELECT }
        );
        prescriptionData.patient = patient || null;
      }
      if (prescription.doctorId) {
        const [doctor] = await sequelize.query(
          'SELECT id, "firstName", "lastName", email FROM users WHERE id = :id',
          { replacements: { id: prescription.doctorId }, type: QueryTypes.SELECT }
        );
        prescriptionData.doctor = doctor || null;
      }
      if (prescription.medicineId) {
        const medicine = await PharmacyInventory.findOne({
          where: { id: prescription.medicineId },
          attributes: ['id', 'medicineName', 'genericName', 'unit']
        });
        prescriptionData.medicine = medicine ? medicine.toJSON() : null;
      }
      return prescriptionData;
    }));

    res.json({
      success: true,
      data: prescriptionsWithDetails,
      total: prescriptionsWithDetails.length,
      stats: {
        pending: prescriptionsWithDetails.filter(p => !p.dispensed).length,
        dispensed: prescriptionsWithDetails.filter(p => p.dispensed).length
      }
    });
  } catch (error) {
    console.error('Error fetching prescriptions:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch prescriptions', error: error.message });
  }
});

/**
 * POST /api/hospital/practice/pharmacy/prescriptions
 * Create prescription dispensing record
 */
router.post('/pharmacy/prescriptions', verifyHospitalToken, async (req, res) => {
  try {
    const organizationId = req.hospitalId;
    const {
      patientId,
      doctorId,
      medicineId,
      dosage,
      frequency,
      duration,
      quantity,
      prescriptionId
    } = req.body;

    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'Organization ID required' });
    }

    if (!patientId || !doctorId || !medicineId || !quantity) {
      return res.status(400).json({
        success: false,
        message: 'Patient ID, Doctor ID, Medicine ID, and quantity are required'
      });
    }

    // Check medicine availability
    const medicine = await PharmacyInventory.findOne({
      where: { id: medicineId, organizationId }
    });

    if (!medicine) {
      return res.status(404).json({ success: false, message: 'Medicine not found' });
    }

    if (medicine.quantity < quantity) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock. Available: ${medicine.quantity} ${medicine.unit}`
      });
    }

    // Generate unique dispensing number
    const dispensingNumber = `DISP${Date.now()}${Math.floor(Math.random() * 1000)}`;

    const prescription = await PrescriptionDispensing.create({
      dispensingNumber,
      prescriptionId,
      patientId,
      doctorId,
      medicineId,
      dosage,
      frequency,
      duration,
      quantity,
      dispensed: false,
      organizationId
    });

    // Fetch with related data
    const created = prescription.toJSON();
    if (prescription.patientId) {
      const [patient] = await sequelize.query(
        'SELECT id, "firstName", "lastName", email FROM users WHERE id = :id',
        { replacements: { id: prescription.patientId }, type: QueryTypes.SELECT }
      );
      created.patient = patient || null;
    }
    if (prescription.doctorId) {
      const [doctor] = await sequelize.query(
        'SELECT id, "firstName", "lastName", email FROM users WHERE id = :id',
        { replacements: { id: prescription.doctorId }, type: QueryTypes.SELECT }
      );
      created.doctor = doctor || null;
    }
    if (prescription.medicineId) {
      const medicine = await PharmacyInventory.findOne({
        where: { id: prescription.medicineId },
        attributes: ['id', 'medicineName', 'genericName', 'unit']
      });
      created.medicine = medicine ? medicine.toJSON() : null;
    }

    res.status(201).json({ success: true, message: 'Prescription created successfully', data: created });
  } catch (error) {
    console.error('Error creating prescription:', error);
    res.status(500).json({ success: false, message: 'Failed to create prescription', error: error.message });
  }
});

/**
 * PATCH /api/hospital/practice/pharmacy/prescriptions/:id/dispense
 * Mark prescription as dispensed and update inventory
 */
router.patch('/pharmacy/prescriptions/:id/dispense', verifyHospitalToken, async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.hospitalId;
    const { dispensedBy } = req.body;

    const prescription = await PrescriptionDispensing.findOne({
      where: { id, organizationId }
    });

    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }

    if (prescription.dispensed) {
      return res.status(400).json({ success: false, message: 'Prescription already dispensed' });
    }

    // Fetch medicine info
    const medicine = await PharmacyInventory.findOne({
      where: { id: prescription.medicineId, organizationId }
    });

    if (!medicine || medicine.quantity < prescription.quantity) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient stock to dispense'
      });
    }

    medicine.quantity -= prescription.quantity;
    await medicine.save();

    prescription.dispensed = true;
    prescription.dispensedAt = new Date();
    prescription.dispensedBy = dispensedBy || req.userId;
    await prescription.save();

    const updated = prescription.toJSON();
    if (prescription.patientId) {
      const [patient] = await sequelize.query(
        'SELECT id, "firstName", "lastName", email FROM users WHERE id = :id',
        { replacements: { id: prescription.patientId }, type: QueryTypes.SELECT }
      );
      updated.patient = patient || null;
    }
    if (prescription.doctorId) {
      const [doctor] = await sequelize.query(
        'SELECT id, "firstName", "lastName", email FROM users WHERE id = :id',
        { replacements: { id: prescription.doctorId }, type: QueryTypes.SELECT }
      );
      updated.doctor = doctor || null;
    }
    const medicineData = await PharmacyInventory.findOne({
      where: { id: prescription.medicineId },
      attributes: ['id', 'medicineName', 'genericName', 'unit', 'quantity']
    });
    updated.medicine = medicineData ? medicineData.toJSON() : null;

    res.json({
      success: true,
      message: 'Prescription dispensed successfully',
      data: updated,
      remainingStock: medicine.quantity
    });
  } catch (error) {
    console.error('Error dispensing prescription:', error);
    res.status(500).json({ success: false, message: 'Failed to dispense prescription', error: error.message });
  }
});

// ========================================
// INSURANCE MANAGEMENT ENDPOINTS
// ========================================

/**
 * GET /api/hospital/practice/insurance/policies
 * List insurance policies for patients
 */
router.get('/insurance/policies', verifyHospitalToken, async (req, res) => {
  try {
    const organizationId = req.hospitalId;
    const { status, patientId, provider } = req.query;

    const whereClause = { organizationId };
    if (status) whereClause.status = status;
    if (patientId) whereClause.patientId = patientId;
    if (provider) whereClause.insuranceProvider = provider;

    const policies = await InsurancePolicy.findAll({
      where: whereClause,
      order: [['validUpto', 'DESC']]
    });

    res.json({
      success: true,
      data: policies,
      total: policies.length,
      stats: {
        active: policies.filter(p => p.status === 'active').length,
        expired: policies.filter(p => p.status === 'expired').length,
        cancelled: policies.filter(p => p.status === 'cancelled').length
      }
    });
  } catch (error) {
    console.error('Error fetching policies:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch policies', error: error.message });
  }
});

/**
 * POST /api/hospital/practice/insurance/policies
 * Create new insurance policy
 */
router.post('/insurance/policies', verifyHospitalToken, async (req, res) => {
  try {
    const organizationId = req.hospitalId;
    const { patientId, policyNumber, insuranceProvider, planName, coverageAmount, deductible, copay, validFrom, validUpto } = req.body;

    if (!patientId || !policyNumber || !insuranceProvider || !coverageAmount) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const policy = await InsurancePolicy.create({
      patientId,
      policyNumber,
      insuranceProvider,
      planName,
      coverageAmount,
      remainingAmount: coverageAmount,
      deductible,
      copay,
      validFrom,
      validUpto,
      organizationId
    });

    res.status(201).json({ success: true, message: 'Policy created successfully', data: policy });
  } catch (error) {
    console.error('Error creating policy:', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ success: false, message: 'Policy number already exists' });
    }
    res.status(500).json({ success: false, message: 'Failed to create policy', error: error.message });
  }
});

/**
 * GET /api/hospital/practice/insurance/claims
 * List insurance claims
 */
router.get('/insurance/claims', verifyHospitalToken, async (req, res) => {
  try {
    const organizationId = req.hospitalId;
    const { status, patientId, fromDate, toDate } = req.query;

    const whereClause = { organizationId };
    if (status) whereClause.status = status;
    if (patientId) whereClause.patientId = patientId;

    if (fromDate || toDate) {
      whereClause.submittedDate = {};
      if (fromDate) whereClause.submittedDate[Op.gte] = new Date(fromDate);
      if (toDate) whereClause.submittedDate[Op.lte] = new Date(toDate);
    }

    const claims = await InsuranceClaim.findAll({
      where: whereClause,
      order: [['created_at', 'DESC']]
    });

    const totalClaimed = claims.reduce((sum, c) => sum + parseFloat(c.claimAmount), 0);
    const totalApproved = claims.reduce((sum, c) => sum + (c.approvedAmount ? parseFloat(c.approvedAmount) : 0), 0);

    res.json({
      success: true,
      data: claims,
      total: claims.length,
      stats: {
        submitted: claims.filter(c => c.status === 'submitted').length,
        underReview: claims.filter(c => c.status === 'under_review').length,
        approved: claims.filter(c => c.status === 'approved').length,
        rejected: claims.filter(c => c.status === 'rejected').length,
        paid: claims.filter(c => c.status === 'paid').length,
        totalClaimed,
        totalApproved
      }
    });
  } catch (error) {
    console.error('Error fetching claims:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch claims', error: error.message });
  }
});

/**
 * POST /api/hospital/practice/insurance/claims
 * Create insurance claim
 */
router.post('/insurance/claims', verifyHospitalToken, async (req, res) => {
  try {
    const organizationId = req.hospitalId;
    const { patientId, appointmentId, policyNumber, insuranceProvider, claimAmount } = req.body;

    if (!patientId || !insuranceProvider || !claimAmount) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const claimNumber = `CLM${Date.now()}${Math.floor(Math.random() * 1000)}`;

    const claim = await InsuranceClaim.create({
      claimNumber,
      patientId,
      appointmentId,
      policyNumber,
      insuranceProvider,
      claimAmount,
      status: 'submitted',
      submittedDate: new Date(),
      organizationId
    });

    res.status(201).json({ success: true, message: 'Claim submitted successfully', data: claim });
  } catch (error) {
    console.error('Error creating claim:', error);
    res.status(500).json({ success: false, message: 'Failed to create claim', error: error.message });
  }
});

/**
 * PATCH /api/hospital/practice/insurance/claims/:id
 * Update claim status (approve/reject/pay)
 */
router.patch('/insurance/claims/:id', verifyHospitalToken, async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.hospitalId;
    const { status, approvedAmount, rejectionReason, paymentDate } = req.body;

    const claim = await InsuranceClaim.findOne({
      where: { id, organizationId }
    });

    if (!claim) {
      return res.status(404).json({ success: false, message: 'Claim not found' });
    }

    if (status) claim.status = status;
    if (approvedAmount !== undefined) claim.approvedAmount = approvedAmount;
    if (rejectionReason) claim.rejectionReason = rejectionReason;
    if (status === 'approved' && !claim.approvalDate) claim.approvalDate = new Date();
    if (status === 'paid' && paymentDate) claim.paymentDate = new Date(paymentDate);

    await claim.save();

    res.json({ success: true, message: 'Claim updated successfully', data: claim });
  } catch (error) {
    console.error('Error updating claim:', error);
    res.status(500).json({ success: false, message: 'Failed to update claim', error: error.message });
  }
});

// ========================================
// MEDICAL RECORDS ENDPOINTS
// ========================================

/**
 * GET /api/hospital/practice/medical-records
 * List patient medical records
 */
router.get('/medical-records', verifyHospitalToken, async (req, res) => {
  try {
    const organizationId = req.hospitalId;
    const { patientId, doctorId, recordType, fromDate, toDate } = req.query;

    const whereClause = { organizationId };
    if (patientId) whereClause.patientId = patientId;
    if (doctorId) whereClause.doctorId = doctorId;
    if (recordType) whereClause.recordType = recordType;

    if (fromDate || toDate) {
      whereClause.recordDate = {};
      if (fromDate) whereClause.recordDate[Op.gte] = new Date(fromDate);
      if (toDate) whereClause.recordDate[Op.lte] = new Date(toDate);
    }

    const records = await sequelize.query(
      `SELECT * FROM medical_records 
       WHERE organization_id = :organizationId 
       ${patientId ? 'AND patient_id = :patientId' : ''}
       ${doctorId ? 'AND doctor_id = :doctorId' : ''}
       ${recordType ? 'AND record_type = :recordType' : ''}
       ORDER BY record_date DESC`,
      {
        replacements: { organizationId, patientId, doctorId, recordType },
        type: QueryTypes.SELECT
      }
    );

    res.json({ success: true, data: records, total: records.length });
  } catch (error) {
    console.error('Error fetching records:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch records', error: error.message });
  }
});

/**
 * POST /api/hospital/practice/medical-records
 * Create medical record
 */
router.post('/medical-records', verifyHospitalToken, async (req, res) => {
  try {
    const organizationId = req.hospitalId;
    const { patientId, doctorId, appointmentId, diagnosis, treatment, symptoms, vitalSigns, prescriptions, recordType, recordDate } = req.body;

    if (!patientId || !doctorId) {
      return res.status(400).json({ success: false, message: 'Patient and Doctor are required' });
    }

    const recordNumber = `MR${Date.now()}${Math.floor(Math.random() * 1000)}`;

    const record = await MedicalRecord.create({
      recordNumber,
      patientId,
      doctorId,
      appointmentId,
      diagnosis,
      treatment,
      symptoms,
      vitalSigns,
      prescriptions,
      recordType,
      recordDate: recordDate || new Date(),
      organizationId
    });

    res.status(201).json({ success: true, message: 'Record created successfully', data: record });
  } catch (error) {
    console.error('Error creating record:', error);
    res.status(500).json({ success: false, message: 'Failed to create record', error: error.message });
  }
});

/**
 * PATCH /api/hospital/practice/medical-records/:id
 * Update medical record
 */
router.patch('/medical-records/:id', verifyHospitalToken, async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.hospitalId;
    const { diagnosis, treatment, symptoms, vitalSigns, prescriptions } = req.body;

    const record = await MedicalRecord.findOne({
      where: { id, organizationId }
    });

    if (!record) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }

    if (diagnosis !== undefined) record.diagnosis = diagnosis;
    if (treatment !== undefined) record.treatment = treatment;
    if (symptoms !== undefined) record.symptoms = symptoms;
    if (vitalSigns !== undefined) record.vitalSigns = vitalSigns;
    if (prescriptions !== undefined) record.prescriptions = prescriptions;

    await record.save();

    res.json({ success: true, message: 'Record updated successfully', data: record });
  } catch (error) {
    console.error('Error updating record:', error);
    res.status(500).json({ success: false, message: 'Failed to update record', error: error.message });
  }
});

// ========================================
// EHR ENDPOINTS
// ========================================

/**
 * GET /api/hospital/practice/ehr/:patientId
 * Get patient EHR record
 */
router.get('/ehr/:patientId', verifyHospitalToken, async (req, res) => {
  try {
    const { patientId } = req.params;
    const organizationId = req.hospitalId;

    const ehr = await EHRRecord.findOne({
      where: { patientId, organizationId }
    });

    if (!ehr) {
      return res.status(404).json({ success: false, message: 'EHR not found' });
    }

    res.json({ success: true, data: ehr });
  } catch (error) {
    console.error('Error fetching EHR:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch EHR', error: error.message });
  }
});

/**
 * POST /api/hospital/practice/ehr
 * Create EHR record
 */
router.post('/ehr', verifyHospitalToken, async (req, res) => {
  try {
    const organizationId = req.hospitalId;
    const { patientId, height, weight, bloodType, allergies, chronicDiseases, emergencyContact, insuranceDetails } = req.body;

    if (!patientId) {
      return res.status(400).json({ success: false, message: 'Patient ID is required' });
    }

    // Check if EHR already exists
    const existingEHR = await EHRRecord.findOne({ where: { patientId, organizationId } });
    if (existingEHR) {
      return res.status(409).json({ success: false, message: 'EHR already exists for this patient' });
    }

    const ehrNumber = `EHR${Date.now()}${Math.floor(Math.random() * 1000)}`;

    const ehr = await EHRRecord.create({
      ehrNumber,
      patientId,
      height,
      weight,
      bloodType,
      allergies,
      chronicDiseases,
      emergencyContact,
      insuranceDetails,
      organizationId
    });

    res.status(201).json({ success: true, message: 'EHR created successfully', data: ehr });
  } catch (error) {
    console.error('Error creating EHR:', error);
    res.status(500).json({ success: false, message: 'Failed to create EHR', error: error.message });
  }
});

/**
 * PATCH /api/hospital/practice/ehr/:patientId
 * Update EHR record
 */
router.patch('/ehr/:patientId', verifyHospitalToken, async (req, res) => {
  try {
    const { patientId } = req.params;
    const organizationId = req.hospitalId;
    const { height, weight, bloodType, allergies, chronicDiseases, medications, emergencyContact } = req.body;

    const ehr = await EHRRecord.findOne({
      where: { patientId, organizationId }
    });

    if (!ehr) {
      return res.status(404).json({ success: false, message: 'EHR not found' });
    }

    if (height !== undefined) ehr.height = height;
    if (weight !== undefined) ehr.weight = weight;
    if (bloodType !== undefined) ehr.bloodType = bloodType;
    if (allergies !== undefined) ehr.allergies = allergies;
    if (chronicDiseases !== undefined) ehr.chronicDiseases = chronicDiseases;
    if (medications !== undefined) ehr.medications = medications;
    if (emergencyContact !== undefined) ehr.emergencyContact = emergencyContact;

    await ehr.save();

    res.json({ success: true, message: 'EHR updated successfully', data: ehr });
  } catch (error) {
    console.error('Error updating EHR:', error);
    res.status(500).json({ success: false, message: 'Failed to update EHR', error: error.message });
  }
});

// ========================================
// VITAL SIGNS ENDPOINTS
// ========================================

/**
 * GET /api/hospital/practice/vitals
 * List vital signs records
 */
router.get('/vitals', verifyHospitalToken, async (req, res) => {
  try {
    const organizationId = req.hospitalId;
    const { patientId, fromDate, toDate, latest } = req.query;

    let whereClause = { organizationId };
    if (patientId) whereClause.patientId = patientId;

    if (fromDate || toDate) {
      whereClause.recordedAt = {};
      if (fromDate) whereClause.recordedAt[Op.gte] = new Date(fromDate);
      if (toDate) whereClause.recordedAt[Op.lte] = new Date(toDate);
    }

    let query = VitalSign.findAll({
      where: whereClause,
      order: [['recordedAt', 'DESC']]
    });

    if (latest === 'true') {
      query = query.then(vitals => {
        const grouped = {};
        vitals.forEach(vital => {
          if (!grouped[vital.patientId]) grouped[vital.patientId] = vital;
        });
        return Object.values(grouped);
      });
    }

    const vitals = await query;

    res.json({ success: true, data: vitals, total: vitals.length });
  } catch (error) {
    console.error('Error fetching vitals:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch vitals', error: error.message });
  }
});

/**
 * POST /api/hospital/practice/vitals
 * Record vital signs
 */
router.post('/vitals', verifyHospitalToken, async (req, res) => {
  try {
    const organizationId = req.hospitalId;
    const { patientId, systolic, diastolic, temperature, heartRate, respiratoryRate, oxygenSaturation, weight, height, notes, recordedBy } = req.body;

    if (!patientId) {
      return res.status(400).json({ success: false, message: 'Patient ID is required' });
    }

    const vital = await VitalSign.create({
      patientId,
      systolic,
      diastolic,
      temperature,
      heartRate,
      respiratoryRate,
      oxygenSaturation,
      weight,
      height,
      notes,
      recordedBy,
      recordedAt: new Date(),
      organizationId
    });

    res.status(201).json({ success: true, message: 'Vital signs recorded successfully', data: vital });
  } catch (error) {
    console.error('Error recording vitals:', error);
    res.status(500).json({ success: false, message: 'Failed to record vitals', error: error.message });
  }
});

export default router;
