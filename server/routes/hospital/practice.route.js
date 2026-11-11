import { prescriptionSafetyGate } from '../../services/prescription-safety.service.js';
import * as hospitalMrd from '../../services/hospital-mrd.service.js';
import * as dischargeSummaries from '../../services/discharge-summary.service.js';
import { requireSessionRole, DISCHARGE_DOC_ROLES, MRD_WRITE_ROLES } from '../../utils/discharge-policy.js';
import { sendRouteError } from '../../utils/route-errors.js';
import { auditAction } from '../../utils/action-audit.js';
import { resolveTenantId } from '../../utils/tenant-identity.js';
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { JWT_CONFIG } from '../../config/auth.config.js';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';
import { classifySentiment } from '../../services/ai-brain/sentiment-classifier.service.js';
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
import emrOrderRouter from '../../services/emr-order-router.service.js';
import { enforceInsurancePolicyStandards } from '../../services/insurance-policy-standards.service.js';
import { evaluateVitalsAndAlert, ensureClinicalIntelligenceTables } from '../../services/clinical-intelligence.service.js';

import { schemaVerifier } from '../../utils/schema-guard.js';

const ENSUREPRACTICESCHEMA_TABLES = ['discharge_plans', 'prems_survey_invitations', 'hospital_tariffs', 'prems_responses'];

const ensurePracticeSchema = schemaVerifier({
  sequelize: sequelize,
  tables: ENSUREPRACTICESCHEMA_TABLES,
  code: 'SCHEMA_NOT_MIGRATED',
  message: 'Apply migration 20261015002700-prems-feedback before using practice workflows',
});

const router = express.Router();
const JWT_SECRET = JWT_CONFIG.SECRET;
const DEMO_HOSPITAL_CAPABILITIES = [
  'practice_management', 'appointments', 'bed_management', 'patients', 'doctors',
  'branches', 'ambulance', 'communication', 'ehr', 'mrd', 'opd_ipd', 'ip_sheets',
  'discharge_summary', 'pharmacy', 'lab_reports', 'insurance_billing', 'billing', 'staff_management', 'asset_tracking',
];
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

async function fetchLivePracticePatients(organizationId) {
  const orgId = organizationId;
  const [queueRows, ipdRows] = await Promise.all([
    sequelize.query(
      `SELECT DISTINCT ON (q.patient_id)
          q.patient_id AS id,
          q.patient_name AS name,
          u."phoneNumber" AS phone,
          u.email,
          u.gender,
          u.metadata,
          'OPD' AS admission_status
       FROM hospital_queue_entries q
       LEFT JOIN users u ON u.id = q.patient_id
       WHERE q.organization_id = :orgId
         AND q.department = 'opd'
         AND q.check_in_at::date = CURRENT_DATE
         AND q.status IN ('waiting', 'called', 'in_service')
       ORDER BY q.patient_id, q.check_in_at DESC`,
      { replacements: { orgId }, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT
          a.patient_id AS id,
          COALESCE(NULLIF(TRIM(u."firstName" || ' ' || COALESCE(u."lastName", '')), ''), 'Patient') AS name,
          u."phoneNumber" AS phone,
          u.email,
          u.gender,
          u.metadata,
          'IPD' AS admission_status,
          a.admission_diagnosis AS diagnosis,
          a.admission_datetime AS admission_date,
          w.name AS ward,
          b.bed_number AS bed
       FROM ip_admissions a
       LEFT JOIN users u ON u.id = a.patient_id
       LEFT JOIN beds b ON b.id = a.bed_id
       LEFT JOIN wards w ON w.id = b.ward_id
       WHERE a.organization_id = :orgId AND a.status IN ('admitted', 'in_ot', 'in_icu', 'pre_admitted')
       ORDER BY a.admission_datetime DESC`,
      { replacements: { orgId }, type: QueryTypes.SELECT }
    ),
  ]);

  const mapRow = (row, status) => {
    const meta = typeof row.metadata === 'object' && row.metadata ? row.metadata : {};
    return {
      id: String(row.id),
      uhid: meta.uhid || `UHID${row.id}`,
      name: row.name || 'Unknown',
      age: meta.age || 0,
      gender: row.gender || 'Other',
      phone: row.phone || '',
      email: row.email || '',
      address: meta.address || '',
      bloodGroup: meta.bloodGroup || '—',
      admissionStatus: status,
      admissionDate: row.admission_date ? String(row.admission_date).slice(0, 10) : undefined,
      assignedDoctor: meta.doctorName || undefined,
      department: meta.department || 'General',
      bed: row.bed || undefined,
      ward: row.ward || undefined,
      diagnosis: row.diagnosis || undefined,
    };
  };

  const seen = new Set();
  const patients = [];
  for (const row of ipdRows) {
    seen.add(String(row.id));
    patients.push(mapRow(row, 'IPD'));
  }
  for (const row of queueRows) {
    const id = String(row.id);
    if (!seen.has(id)) {
      seen.add(id);
      patients.push(mapRow(row, 'OPD'));
    }
  }
  return patients;
}

const generateId = (prefix) => {
  if (crypto.randomUUID) {
    return `${prefix}${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
  }
  return `${prefix}${Date.now().toString(36)}`;
};

const toNumberOrNull = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const verifyHospitalToken = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  try {
    const hostTenantId = toNumberOrNull(req.tenant?.id || req.tenantId);
    const decoded = jwt.verify(token, JWT_SECRET);
    const role = decoded.role || decoded.userType;
    const tokenTenantId = toNumberOrNull(
      decoded.tenant_id || decoded.organization_id || decoded.hospital_id || decoded.hospitalId
    );

    // Support both old system (role: hospital) and new multitenancy (role: hospital_admin, etc.)
    const validRoles = [
      'hospital',
      'hospital_admin',
      'ceo',
      'coo',
      'cfo',
      'ms',
      'medical_superintendent',
      'cmo',
      'chief_medical_officer',
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
      'security_staff',
      'billing',
      'receptionist',
      'insurance_coordinator',
    ];
    if (!validRoles.includes(role)) {
      return res.status(403).json({ success: false, message: 'Hospital role required' });
    }

    if (hostTenantId && (!tokenTenantId || hostTenantId !== tokenTenantId)) {
      return res.status(403).json({
        success: false,
        code: 'TENANT_HOST_MISMATCH',
        message: 'Hospital token does not match the request origin'
      });
    }

    // Support both old system (decoded.id) and new multitenancy (decoded.tenant_id / decoded.hospital_id)
    req.hostTenantId = hostTenantId;
    req.tokenTenantId = tokenTenantId;
    // Audit SEC-01: `id` is a tenant id only for the legacy hospital account (utils/tenant-identity.js); a staff token
    // with no tenant claim is refused instead of becoming "tenant = its own user id".
    const resolvedTenant = tokenTenantId || resolveTenantId(decoded);
    if (!resolvedTenant) {
      return res.status(403).json({ success: false, code: 'TENANT_CONTEXT_REQUIRED', message: 'This account is not attached to a hospital. Ask an administrator to attach it.' });
    }
    req.hospitalId = resolvedTenant;
    req.hospitalOrgId = req.hospitalId;  // For DB queries
    req.hospitalName = decoded.hospitalName || decoded.name || 'Hospital';
    req.tenantId = resolvedTenant;
    req.userId = decoded.id;
    req.userRole = role;
    req.capabilities = Array.isArray(decoded.capabilities) ? decoded.capabilities : undefined;

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

router.get('/capabilities', verifyHospitalToken, async (req, res) => {
  const caps = req.capabilities?.length ? req.capabilities : DEMO_HOSPITAL_CAPABILITIES;
  return res.json({ success: true, capabilities: caps, data: caps });
});

router.get('/plan/capabilities', verifyHospitalToken, async (req, res) => {
  const caps = req.capabilities?.length ? req.capabilities : DEMO_HOSPITAL_CAPABILITIES;
  return res.json({ success: true, capabilities: caps, data: caps });
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
    const claimScope = {
      status: { [Op.in]: ['pending', 'submitted', 'query'] },
      [Op.or]: [{ organizationId: req.hospitalId }, { hospitalId: req.hospitalId }]
    };
    const pendingClaims = await InsuranceClaim.count({ where: claimScope }).catch(() => 0);

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

    // Hospital OPD bookings → token today or deferred to appointment date
    let qmsToken = null;
    try {
      const { issueTokenForAppointment } = await import('../../services/qms-opd.service.js');
      const ctype = String(consultationType || 'in-person').toLowerCase();
      const tele = ['video', 'audio', 'chat', 'telemedicine'].includes(ctype);
      if (!tele) {
        const notifyOptIn = req.body?.notifyOptIn === true || req.body?.notifyOptIn === 'true';
        qmsToken = await issueTokenForAppointment(appointment, {
          notifyOptIn,
          notifyPhone: patientPhone,
          organizationId,
          source: 'hospital-practice-booking',
          mode: 'auto',
          branchId: req.body?.branchId,
        });
      }
    } catch (qmsErr) {
      console.error('[hospital/practice] QMS token issue failed:', qmsErr.message);
    }

    return res.status(201).json({
      success: true,
      message: qmsToken?.deferred
        ? `Appointment created. Token activates on ${qmsToken.activateOn}.`
        : qmsToken?.tokenNumber
          ? `Appointment created. Token ${qmsToken.tokenNumber} sent on WhatsApp/SMS if opted in.`
          : 'Appointment created successfully',
      data: {
        id: appointment.id.toString(),
        patientName: appointment.patientName,
        doctorName: appointment.doctorName,
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
        status: appointment.status,
        qmsToken: qmsToken
          ? {
              tokenNumber: qmsToken.tokenNumber || null,
              deferred: Boolean(qmsToken.deferred),
              activateOn: qmsToken.activateOn || null,
              queueZone: qmsToken.queueZone,
              estimatedWaitMinutes: qmsToken.estimatedWaitMinutes,
              doctorName: qmsToken.doctorName,
            }
          : null,
      },
      qmsToken,
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
  try {
    const livePatients = await fetchLivePracticePatients(req.hospitalId);
    if (livePatients.length > 0) {
      const filtered = livePatients.filter((p) => {
        if (!search) return true;
        const term = String(search).toLowerCase();
        return (
          p.name?.toLowerCase().includes(term) ||
          p.phone?.toLowerCase().includes(term) ||
          p.uhid?.toLowerCase().includes(term)
        );
      });
      return res.json({ success: true, data: filtered, total: filtered.length, live: true });
    }
  } catch (error) {
    console.warn('[practice] live patients fallback:', error.message);
  }

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
  if (/^\d+$/.test(req.params.id) && req.body.admissionStatus === 'IPD') {
    return res.json({
      success: true,
      message: 'Redirect to ADT admission',
      data: {
        id: req.params.id,
        admissionStatus: 'IPD',
        redirect: `/hospital/adt/admit?patientId=${req.params.id}&type=op_converted`,
      },
    });
  }

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
 * Assign a UHID to a patient (or to every patient of this hospital that has none). Explicit, idempotent, audited.
 * POST /api/hospital/practice/mrd/uhid/assign   body: { patientId } | { all: true, limit? }
 */
router.post('/mrd/uhid/assign', verifyHospitalToken, requireSessionRole(MRD_WRITE_ROLES), async (req, res) => {
  try {
    const hospitalId = Number(req.hospitalId);
    const body = req.body || {};
    const data = body.all === true
      ? await hospitalMrd.assignMissingUhids(hospitalId, { limit: body.limit })
      : await hospitalMrd.assignUhid(hospitalId, body.patientId);
    await auditAction({ module: 'mrd', entityType: 'patient_uhid', entityId: body.patientId ?? 'bulk', action: body.all === true ? 'uhid_assigned_bulk' : 'uhid_assigned', actor: req.userId, organizationId: hospitalId, details: body.all === true ? { assigned: data.assigned } : data });
    res.json({ success: true, data });
  } catch (error) {
    sendRouteError(res, error);
  }
});

/**
 * Add Record to Digitization Queue
 * POST /api/hospital/practice/mrd/digitization-queue
 */
router.post('/mrd/digitization-queue', verifyHospitalToken, requireSessionRole(MRD_WRITE_ROLES), async (req, res) => {
  const { recordId } = req.body || {};
  if (!recordId) return res.status(400).json({ success: false, message: 'Record ID is required' });
  try {
    const entry = await hospitalMrd.queueForDigitization(Number(req.hospitalId), Number(recordId));
    await auditAction({ module: 'mrd', entityType: 'mrd_record', entityId: recordId, action: 'digitization_queued', actor: req.userId, organizationId: Number(req.hospitalId), details: { role: req.userRole } });
    res.status(201).json({ success: true, message: 'Record added to digitization queue', data: entry });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error('Error adding to digitization queue:', error);
    res.status(500).json({ success: false, message: 'Failed to add record to queue' });
  }
});

router.get('/discharge-summaries', verifyHospitalToken, async (req, res) => {
  try {
    const { patientId, status, limit = '50' } = req.query;
    const params = { hospitalId: req.hospitalId, limit: Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 200) };
    const where = ['hospital_id = :hospitalId'];
    if (patientId) { where.push('(patient_id = :patientId OR patient_id::text = :patientIdText)'); params.patientId = patientId; params.patientIdText = String(patientId); }
    if (status) { where.push('status = :status'); params.status = status; }
    const [rows] = await sequelize.query(
      `SELECT * FROM discharge_summaries WHERE ${where.join(' AND ')} ORDER BY updated_at DESC LIMIT :limit`,
      { replacements: params, type: QueryTypes.SELECT }
    );
    res.json({ success: true, data: rows, total: rows.length });
  } catch (error) {
    console.error('Error listing discharge summaries:', error);
    res.status(500).json({ success: false, message: 'Failed to list discharge summaries', error: error.message });
  }
});

router.get('/mrd/records', verifyHospitalToken, async (req, res) => {
  try {
    const rows = await hospitalMrd.listMrdRecords(Number(req.hospitalId), { search: req.query.search, limit: req.query.limit });
    res.json({ success: true, data: rows, total: rows.length });
  } catch (error) {
    console.error('Error listing MRD records:', error);
    res.status(503).json({ success: false, code: 'MRD_UNAVAILABLE', message: 'MRD records are not available' });
  }
});

router.post('/mrd/records', verifyHospitalToken, requireSessionRole(MRD_WRITE_ROLES), async (req, res) => {
  try {
    // verifyHospitalToken sets req.userId (not req.user), so the record is attributed to the real indexer.
    const record = await hospitalMrd.createMrdRecord(Number(req.hospitalId), req.body || {}, req.userId || null);
    await auditAction({ module: 'mrd', entityType: 'mrd_record', entityId: record.id, action: 'index', actor: req.userId, organizationId: Number(req.hospitalId), details: { mrdNumber: record.mrdNumber, patientId: record.patientId, recordType: record.recordType, role: req.userRole } });
    res.status(201).json({ success: true, data: record });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error('Error creating MRD record:', error);
    res.status(500).json({ success: false, message: 'Failed to create MRD record' });
  }
});

/**
 * Save Discharge Summary (Draft)
 * POST /api/hospital/practice/discharge-summaries
 */
router.post('/discharge-summaries', verifyHospitalToken, requireSessionRole(DISCHARGE_DOC_ROLES), async (req, res) => {
  try {
    const { summary, updatedExisting } = await dischargeSummaries.saveSummary(Number(req.hospitalId), req.body || {});
    res.status(updatedExisting ? 200 : 201).json({ success: true, message: 'Discharge summary saved', data: summary });
  } catch (error) {
    sendRouteError(res, error);
  }
});

/**
 * Submit Discharge Summary for Approval
 * POST /api/hospital/practice/discharge-summaries/submit
 */
router.post('/discharge-summaries/submit', verifyHospitalToken, requireSessionRole(DISCHARGE_DOC_ROLES), async (req, res) => {
  try {
    const hospitalId = Number(req.hospitalId);
    const { summary, submittedNow, alreadySubmitted } = await dischargeSummaries.saveSummary(hospitalId, req.body || {}, { submit: true });

    // The patient survey invitation goes out ONCE, on the transition into pending_approval — not on every save/retry.
    if (submittedNow) {
      await ensurePremsTables();
      const existing = await sequelize.query(
        'SELECT 1 FROM prems_survey_invitations WHERE hospital_id = :hospitalId AND discharge_summary_id = :summaryId LIMIT 1',
        { replacements: { hospitalId, summaryId: summary.id }, type: QueryTypes.SELECT });
      if (!existing.length) {
        await sequelize.query(`
          INSERT INTO prems_survey_invitations (hospital_id, patient_id, discharge_summary_id, visit_type, channel)
          VALUES (:hospitalId, :patientId, :summaryId, 'ipd', 'whatsapp')
        `, { replacements: { hospitalId, patientId: summary.patient_id, summaryId: summary.id } });
      }
      await auditAction({ module: 'discharge', entityType: 'discharge_summary', entityId: summary.id, action: 'submit', actor: req.userId, organizationId: hospitalId, details: { admissionId: summary.admission_id, role: req.userRole } });
    }
    res.status(alreadySubmitted ? 200 : 201).json({ success: true, message: alreadySubmitted ? 'Discharge summary was already submitted for approval' : 'Discharge summary submitted for approval', data: summary, alreadySubmitted: Boolean(alreadySubmitted) });
  } catch (error) {
    sendRouteError(res, error);
  }
});

/**
 * Update Discharge Summary (Edit)
 * PUT /api/hospital/practice/discharge-summaries/:id
 */
router.put('/discharge-summaries/:id', verifyHospitalToken, requireSessionRole(DISCHARGE_DOC_ROLES), async (req, res) => {
  try {
    const data = await dischargeSummaries.updateSummary(Number(req.hospitalId), req.params.id, req.body || {});
    res.json({ success: true, message: 'Discharge summary updated successfully', data });
  } catch (error) {
    sendRouteError(res, error);
  }
});


// Discharge planning has its own check so the handlers below state plainly what
// they depend on. The table is owned by the 20261015002700-prems-feedback
// migration; this used to build it on the request path, taking an ACCESS
// EXCLUSIVE lock mid-request, and a skipped migration simply looked fine.
const ensureDischargePlanningTables = schemaVerifier({
  sequelize,
  tables: ['discharge_plans'],
  code: 'SCHEMA_NOT_MIGRATED',
  message: 'Apply migration 20261015002700-prems-feedback before using discharge planning',
});

router.get('/discharge-plans', verifyHospitalToken, async (req, res) => {
  await ensureDischargePlanningTables();
  const [rows] = await sequelize.query(`SELECT * FROM discharge_plans WHERE hospital_id = :hospitalId ORDER BY updated_at DESC`, { replacements: { hospitalId: req.hospitalId } });
  res.json({ success: true, data: rows });
});

router.post('/discharge-plans', verifyHospitalToken, async (req, res) => {
  await ensureDischargePlanningTables();
  const { patientId, admissionId, targetDischargeDate, owner, blockers = [], tasks = [] } = req.body;
  if (!patientId) return res.status(400).json({ success: false, message: 'patientId is required' });
  const [rows] = await sequelize.query(`INSERT INTO discharge_plans (hospital_id, patient_id, admission_id, target_discharge_date, owner, blockers, tasks) VALUES (:hospitalId,:patientId,:admissionId,:targetDischargeDate,:owner,:blockers::jsonb,:tasks::jsonb) RETURNING *`, { replacements: { hospitalId: req.hospitalId, patientId, admissionId: admissionId || null, targetDischargeDate: targetDischargeDate || null, owner: owner || null, blockers: JSON.stringify(blockers), tasks: JSON.stringify(tasks) } });
  res.status(201).json({ success: true, data: rows[0] });
});

router.patch('/discharge-plans/:id', verifyHospitalToken, async (req, res) => {
  await ensureDischargePlanningTables();
  const { targetDischargeDate, owner, blockers, tasks, status } = req.body;
  const [rows] = await sequelize.query(`UPDATE discharge_plans SET target_discharge_date = COALESCE(:targetDischargeDate, target_discharge_date), owner = COALESCE(:owner, owner), blockers = COALESCE(:blockers::jsonb, blockers), tasks = COALESCE(:tasks::jsonb, tasks), status = COALESCE(:status, status), updated_at = NOW() WHERE id = :id AND hospital_id = :hospitalId RETURNING *`, { replacements: { id: req.params.id, hospitalId: req.hospitalId, targetDischargeDate: targetDischargeDate || null, owner: owner || null, blockers: blockers ? JSON.stringify(blockers) : null, tasks: tasks ? JSON.stringify(tasks) : null, status: status || null } });
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Discharge plan not found' });
  res.json({ success: true, data: rows[0] });
});

/**
 * Create Prescription
 * POST /api/hospital/practice/prescriptions
 */
router.post('/prescriptions', verifyHospitalToken, prescriptionSafetyGate('hospital.practice.prescription', (req) => ({ patientId: req.body?.patientId, medications: req.body?.medications }), { issuing: true }), async (req, res) => {
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

      // fire-and-forget — never blocks the prescription response
      n8nService.prescriptionIssued({
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
      }).catch((n8nError) => {
        console.error('Failed to trigger n8n prescription workflow:', n8nError);
      });
    } catch (n8nError) {
      console.error('Failed to trigger n8n prescription workflow:', n8nError);
    }

    const createdPrescription = prescription?.[0] || prescription;
    let routing = null;
    try {
      routing = await emrOrderRouter.routePrescription({
        prescriptionId: createdPrescription?.id,
        hospitalId,
        patientId,
        doctorId,
        medications,
        notes,
        diagnosis,
        labTests: req.body.labTests
      });
    } catch (routeError) {
      console.error('EMR prescription routing error:', routeError);
    }

    res.status(201).json({
      success: true,
      message: 'Prescription created successfully',
      data: createdPrescription,
      routing
    });
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

    const createdOrder = order?.[0] || order;
    let routing = null;
    try {
      routing = await emrOrderRouter.routeLabOrder({
        labOrderId: createdOrder?.id,
        hospitalId,
        patientId,
        doctorId: req.body.doctorId,
        tests,
        totalAmount,
        orderNumber,
        priority,
        notes
      });
    } catch (routeError) {
      console.error('EMR lab order routing error:', routeError);
    }

    res.status(201).json({ success: true, message: 'Lab order created successfully', data: createdOrder, routing });
  } catch (error) {
    console.error('Error creating lab order:', error);
    res.status(500).json({ success: false, message: 'Failed to create lab order', error: error.message });
  }
});

/**
 * GET /api/hospital/practice/order-status
 * Unified lab + pharmacy order status for a patient
 */
router.get('/order-status', verifyHospitalToken, async (req, res) => {
  try {
    const hospitalId = req.hospitalId;
    const { patientId } = req.query;
    if (!patientId) {
      return res.status(400).json({ success: false, message: 'patientId is required' });
    }

    const status = await emrOrderRouter.getPatientOrderStatus(hospitalId, patientId);
    res.json({ success: true, data: status });
  } catch (error) {
    console.error('Error fetching order status:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch order status', error: error.message });
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
      where: {
        status: { [Op.in]: ['pending', 'submitted', 'query'] },
        [Op.or]: [{ organizationId: req.hospitalId }, { hospitalId: req.hospitalId }]
      },
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

    let routing = null;
    try {
      routing = await emrOrderRouter.routeLabOrder({
        labOrderId: labOrder.id,
        hospitalId: organizationId,
        patientId,
        doctorId,
        testType,
        totalAmount: 0,
        orderNumber,
        priority,
        notes
      });
    } catch (routeError) {
      console.error('EMR lab order routing error:', routeError);
    }

    res.status(201).json({ success: true, message: 'Lab order created successfully', data: createdOrder, routing });
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
router.post('/pharmacy/prescriptions', verifyHospitalToken, prescriptionSafetyGate('hospital.practice.pharmacy-dispense', async (req) => {
  // This path carries a medicineId, not a drug name, and the class/interaction checks match on the
  // name. Resolve it here; a blank name would make the gate pass vacuously, which is worse than
  // no gate because it looks like a check happened.
  let name = req.body?.medicineName || req.body?.medicine?.name || null;
  if (!name && req.body?.medicineId && req.hospitalId) {
    const med = await PharmacyInventory.findOne({ where: { id: req.body.medicineId, organizationId: req.hospitalId }, attributes: ['medicineName', 'name', 'genericName'] });
    name = med?.medicineName || med?.name || med?.genericName || null;
  }
  return { patientId: req.body?.patientId, medications: [{ name, dosage: req.body?.dosage }] };
}, { issuing: true }), async (req, res) => {
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
    const {
      patientId,
      policyNumber,
      insuranceProvider,
      planName,
      coverageAmount,
      deductible,
      copay,
      validFrom,
      validUpto,
      eCardAvailable
    } = req.body;

    if (!patientId || !policyNumber || !insuranceProvider || !coverageAmount) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const standardization = enforceInsurancePolicyStandards({
      policyNumber,
      planName,
      policyType: planName,
      startDate: validFrom,
      endDate: validUpto,
      requestedECardAvailable: eCardAvailable,
      autoAssignStartDate: false,
      autoAssignEndDate: true
    });

    if (!standardization.valid) {
      return res.status(400).json({ success: false, message: standardization.message });
    }

    const normalized = standardization.normalized;

    const policy = await InsurancePolicy.create({
      patientId,
      policyNumber: normalized.policyNumber,
      insuranceProvider,
      planName,
      coverageAmount,
      remainingAmount: coverageAmount,
      deductible,
      copay,
      validFrom: normalized.validFrom,
      validUpto: normalized.validUpto,
      organizationId
    });

    res.status(201).json({
      success: true,
      message: 'Policy created successfully',
      data: {
        ...policy.toJSON(),
        eCardApplicable: normalized.eCardApplicable,
        eCardAvailable: normalized.eCardAvailable
      }
    });
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

    const intelligence = await evaluateVitalsAndAlert({
      tenantId: organizationId,
      patientId,
      source: 'hospital-practice-vitals',
      recordedBy,
      vitals: { systolic, diastolic, temperature, heartRate, respiratoryRate, oxygenSaturation }
    });

    res.status(201).json({
      success: true,
      message: 'Vital signs recorded successfully',
      data: vital,
      intelligence
    });
  } catch (error) {
    console.error('Error recording vitals:', error);
    res.status(500).json({ success: false, message: 'Failed to record vitals', error: error.message });
  }
});


router.get('/clinical-alerts', verifyHospitalToken, async (req, res) => {
  try {
    await ensureClinicalIntelligenceTables();
    const [rows] = await sequelize.query(`
      SELECT * FROM clinical_alerts
      WHERE tenant_id = :tenantId
        AND (:status::text IS NULL OR status = :status)
      ORDER BY created_at DESC
      LIMIT 100
    `, { replacements: { tenantId: req.hospitalId, status: req.query.status || null } });
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load clinical alerts', error: error.message });
  }
});

router.patch('/clinical-alerts/:id/acknowledge', verifyHospitalToken, async (req, res) => {
  try {
    await ensureClinicalIntelligenceTables();
    const [rows] = await sequelize.query(`
      UPDATE clinical_alerts
      SET status = 'acknowledged', acknowledged_by = :userId, acknowledged_at = NOW()
      WHERE id = :id AND tenant_id = :tenantId
      RETURNING *
    `, { replacements: { id: req.params.id, tenantId: req.hospitalId, userId: req.userId || null } });
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Alert not found' });
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to acknowledge alert', error: error.message });
  }
});


// Phase 1: canonical tariff master
const ensurePremsTables = async () => {
  // Schema is owned by the migration; this used to build the table on
  // the request path, taking an ACCESS EXCLUSIVE lock mid-request.
  await ensurePracticeSchema();
};

router.get('/tariffs', verifyHospitalToken, async (req, res) => {
  try {
    // Schema is owned by the migration; this used to build the table on
    // the request path, taking an ACCESS EXCLUSIVE lock mid-request.
    await ensurePracticeSchema();
    const [rows] = await sequelize.query(`SELECT * FROM hospital_tariffs WHERE active = TRUE AND hospital_id = :hospitalId ORDER BY category, item_name`, { replacements: { hospitalId: req.hospitalId } });
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load tariffs', error: error.message });
  }
});

router.post('/tariffs', verifyHospitalToken, async (req, res) => {
  try {
    const { code, itemName, category, unit, roomCategory, payerType, packageCode, rate, gst = 0, effectiveFrom, effectiveTo } = req.body;
    if (!code || !itemName || !category || !unit || rate === undefined || !effectiveFrom) {
      return res.status(400).json({ success: false, message: 'code, itemName, category, unit, rate and effectiveFrom are required' });
    }
    // Schema is owned by the migration; this used to build the table on
    // the request path, taking an ACCESS EXCLUSIVE lock mid-request.
    await ensurePracticeSchema();
    const [rows] = await sequelize.query(`
      INSERT INTO hospital_tariffs (hospital_id, code, item_name, category, unit, room_category, payer_type, package_code, rate, gst, effective_from, effective_to)
      VALUES (:hospitalId,:code,:itemName,:category,:unit,:roomCategory,:payerType,:packageCode,:rate,:gst,:effectiveFrom,:effectiveTo)
      RETURNING *
    `, { replacements: { hospitalId: req.hospitalId, code, itemName, category, unit, roomCategory: roomCategory || null, payerType: payerType || null, packageCode: packageCode || null, rate, gst, effectiveFrom, effectiveTo: effectiveTo || null } });
    res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create tariff', error: error.message });
  }
});


router.get('/tariffs/lookup', verifyHospitalToken, async (req, res) => {
  try {
    const { code, roomCategory, payerType, onDate = new Date().toISOString().slice(0, 10) } = req.query;
    if (!code) return res.status(400).json({ success: false, message: 'code is required' });
    const [rows] = await sequelize.query(`
      SELECT * FROM hospital_tariffs
      WHERE hospital_id = :hospitalId AND code = :code AND active = TRUE
        AND effective_from <= :onDate AND (effective_to IS NULL OR effective_to >= :onDate)
        AND (:roomCategory::text IS NULL OR room_category IS NULL OR room_category = :roomCategory)
        AND (:payerType::text IS NULL OR payer_type IS NULL OR payer_type = :payerType)
      ORDER BY
        CASE WHEN payer_type = :payerType THEN 0 ELSE 1 END,
        CASE WHEN room_category = :roomCategory THEN 0 ELSE 1 END,
        effective_from DESC
      LIMIT 1
    `, { replacements: { hospitalId: req.hospitalId, code, roomCategory: roomCategory || null, payerType: payerType || null, onDate } });
    if (!rows[0]) return res.status(404).json({ success: false, message: 'No active tariff found' });
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to resolve tariff', error: error.message });
  }
});

// Phase 1: PREMS feedback capture
router.get('/prems/responses', verifyHospitalToken, async (req, res) => {
  try {
    await ensurePremsTables();
    // Schema is owned by the migration; this used to build the table on
    // the request path, taking an ACCESS EXCLUSIVE lock mid-request.
    await ensurePracticeSchema();
    const [rows] = await sequelize.query(`SELECT * FROM prems_responses WHERE hospital_id = :hospitalId ORDER BY created_at DESC LIMIT 100`, { replacements: { hospitalId: req.hospitalId } });
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load PREMS responses', error: error.message });
  }
});

router.post('/prems/responses', verifyHospitalToken, async (req, res) => {
  try {
    await ensurePremsTables();
    const { patientId, visitType = 'opd', rating, communicationScore, cleanlinessScore, waitTimeScore, comment } = req.body;
    if (!rating) return res.status(400).json({ success: false, message: 'rating is required' });
    // Schema is owned by the migration; this used to build the table on
    // the request path, taking an ACCESS EXCLUSIVE lock mid-request.
    await ensurePracticeSchema();

    // A survey form that is submitted twice — a double tap, a retried request,
    // a reloaded link — must record one response, not two, or the ward's scores
    // move on how often a patient pressed the button. prems_responses already
    // carried idempotency_key under a unique index and nothing ever set it.
    const idempotencyKey = String(req.body.idempotencyKey || req.get('Idempotency-Key') || '').trim();
    if (!idempotencyKey) {
      return res.status(400).json({
        success: false,
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Send an idempotencyKey (or an Idempotency-Key header) so a resubmitted survey is not counted twice.',
      });
    }

    const negativeFollowup = Number(rating) <= 2;
    // `sentiment` has existed on this table since the PREMS migration but was never
    // populated by this route — classify the free-text comment when one is given.
    const sentimentResult = comment ? await classifySentiment(comment).catch(() => null) : null;
    const [rows] = await sequelize.query(`
      INSERT INTO prems_responses (hospital_id, patient_id, visit_type, rating, communication_score, cleanliness_score, wait_time_score, comment, negative_followup, sentiment, idempotency_key)
      VALUES (:hospitalId,:patientId,:visitType,:rating,:communicationScore,:cleanlinessScore,:waitTimeScore,:comment,:negativeFollowup,:sentiment,:idempotencyKey)
      ON CONFLICT DO NOTHING RETURNING *
    `, { replacements: { hospitalId: req.hospitalId, patientId: patientId || null, visitType, rating, communicationScore: communicationScore || null, cleanlinessScore: cleanlinessScore || null, waitTimeScore: waitTimeScore || null, comment: comment || null, negativeFollowup, sentiment: sentimentResult?.sentiment || null, idempotencyKey } });
    // A replay returns no row from ON CONFLICT DO NOTHING. Answer with the
    // response already recorded, and do not raise a second complaint ticket
    // for it.
    if (!rows[0]) {
      const [existing] = await sequelize.query(
        `SELECT * FROM prems_responses WHERE idempotency_key = :idempotencyKey LIMIT 1`,
        { replacements: { idempotencyKey } }
      );
      return res.status(200).json({
        success: true,
        data: existing?.[0] || null,
        replayed: true,
        message: 'This survey response was already recorded.',
      });
    }

    if (negativeFollowup) {
      const ticketNumber = `PREMS-${Date.now()}`;
      await sequelize.query(`
        INSERT INTO tickets ("ticketNumber", subject, description, category, priority, status, requester, metadata, "createdAt", "updatedAt")
        VALUES (:ticketNumber, :subject, :description, 'feedback', 'high', 'open', :requester::jsonb, :metadata::jsonb, NOW(), NOW())
      `, { replacements: {
        ticketNumber,
        subject: `Negative PREMS feedback - ${visitType.toUpperCase()}`,
        description: comment || 'Low patient experience score requires follow-up.',
        requester: JSON.stringify({ userId: patientId || null }),
        metadata: JSON.stringify({ source: 'prems', responseId: rows[0].id, hospitalId: req.hospitalId }),
      } });

      // A complaint with no clock is a complaint nobody has to answer. The
      // ticket_sla table was created with the PREMS migration and never
      // written to, so negative feedback raised a ticket that could sit open
      // indefinitely with nothing recording when a reply was due.
      const severity = Number(rating) <= 1 ? 'S1' : 'S2';
      const responseHours = severity === 'S1' ? 4 : 8;
      const resolutionHours = severity === 'S1' ? 24 : 72;
      await sequelize.query(`
        INSERT INTO ticket_sla (ticket_id, severity, feedback_type, evidence_quote, response_due_at, resolution_due_at)
        VALUES (:ticketId, :severity, 'prems_negative', :quote,
                NOW() + (:responseHours || ' hours')::interval,
                NOW() + (:resolutionHours || ' hours')::interval)
        ON CONFLICT (ticket_id) DO NOTHING
      `, { replacements: {
        ticketId: ticketNumber,
        severity,
        quote: comment ? String(comment).slice(0, 500) : null,
        responseHours: String(responseHours),
        resolutionHours: String(resolutionHours),
      } }).catch((err) => console.error('[prems] SLA record failed:', err.message));

      // Without this the response and the complaint it raised were unlinked, so
      // nothing could tell which feedback a ticket came from.
      await sequelize.query(
        `UPDATE prems_responses SET complaint_ticket_id = :ticketId, updated_at = NOW() WHERE id = :id`,
        { replacements: { ticketId: ticketNumber, id: rows[0].id } }
      ).catch((err) => console.error('[prems] ticket link failed:', err.message));
      rows[0].complaint_ticket_id = ticketNumber;
    }
    res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to save PREMS response', error: error.message });
  }
});


router.get('/prems/invitations', verifyHospitalToken, async (req, res) => {
  try {
    await ensurePremsTables();
    const [rows] = await sequelize.query(`SELECT * FROM prems_survey_invitations WHERE hospital_id = :hospitalId ORDER BY created_at DESC LIMIT 100`, { replacements: { hospitalId: req.hospitalId } });
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load PREMS invitations', error: error.message });
  }
});

/**
 * PREMS metrics for a hospital: volumes, average scores and how the complaints
 * raised from negative feedback are tracking against their SLA.
 */
router.get('/prems/metrics', verifyHospitalToken, async (req, res) => {
  try {
    await ensurePracticeSchema();
    const [summary] = await sequelize.query(`
      SELECT COUNT(*)::int AS responses,
             ROUND(AVG(rating)::numeric, 2) AS average_rating,
             COUNT(*) FILTER (WHERE negative_followup)::int AS negative_responses,
             COUNT(DISTINCT complaint_ticket_id)::int AS complaints_raised
        FROM prems_responses
       WHERE hospital_id = :hospitalId
         AND created_at >= NOW() - INTERVAL '90 days'
    `, { replacements: { hospitalId: req.hospitalId } });

    const [sla] = await sequelize.query(`
      SELECT COUNT(*)::int AS tracked,
             COUNT(*) FILTER (WHERE breached)::int AS breached,
             COUNT(*) FILTER (WHERE response_met_at IS NULL AND response_due_at < NOW())::int AS response_overdue
        FROM ticket_sla
       WHERE feedback_type = 'prems_negative'
         AND created_at >= NOW() - INTERVAL '90 days'
    `).catch(() => [[{}]]);

    res.json({ success: true, data: { window: '90d', ...(summary?.[0] || {}), sla: sla?.[0] || {} } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load PREMS metrics', error: error.message });
  }
});

// Phase 1: discharge-facing readmission risk
router.get('/patients/:patientId/readmission-risk', verifyHospitalToken, async (req, res) => {
  try {
    const patientId = Number(req.params.patientId);
    const [scores] = await sequelize.query(`
      SELECT * FROM ai_health_risk_scores WHERE patient_id = :patientId ORDER BY updated_at DESC LIMIT 1
    `, { replacements: { patientId } });
    const [insights] = await sequelize.query(`
      SELECT title, description, severity, data
      FROM ai_clinical_insights
      WHERE target_id = :patientId AND insight_type = 'readmission_risk'
      ORDER BY created_at DESC LIMIT 1
    `, { replacements: { patientId } });
    const latest = scores[0] || null;
    const insight = insights[0] || null;
    const score = Number(latest?.readmission_risk_score ?? latest?.overall_score ?? 0);
    const level = score >= 70 || insight?.severity === 'warning' ? 'high' : score >= 40 ? 'medium' : 'low';
    res.json({ success: true, data: { level, score, factors: insight?.data || {}, insight } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load readmission risk', error: error.message });
  }
});

export default router;
