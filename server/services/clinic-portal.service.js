/**
 * Clinic portal identity + operational helpers.
 * Bridges hospitals (web login) ↔ tenants (staff/patients/appointments).
 */
import { Op } from 'sequelize';
import Tenant from '../models/postgres/tenant.model.postgres.js';
import User from '../models/postgres/user.model.postgres.js';
import Hospital from '../models/hospital.model.intelligent.js';
import Appointment from '../models/postgres/appointment.model.postgres.js';

function toSlug(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
}

function parseMeta(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

/**
 * Resolve tenant + hospital context from a clinic portal JWT payload.
 */
export async function resolveClinicPortalContext(decoded = {}) {
  const hospitalId = Number(decoded.hospitalId || decoded.id);
  const explicitTenantId = Number(decoded.tenantId || decoded.tenant_id || 0) || null;
  const slug = String(decoded.clinicSlug || decoded.clinic_slug || '').toLowerCase().trim() || null;

  let hospital = null;
  if (Number.isFinite(hospitalId) && hospitalId > 0) {
    hospital = await Hospital.findByPk(hospitalId);
  }

  const meta = parseMeta(hospital?.metadata);
  let tenantId = explicitTenantId || Number(meta.tenant_id) || null;
  let tenant = tenantId ? await Tenant.findByPk(tenantId) : null;

  if (!tenant && slug) {
    tenant = await Tenant.findOne({
      where: {
        type: 'clinic',
        status: 'active',
        [Op.or]: [{ subdomain: slug }, { slug }],
      },
    });
    tenantId = tenant?.id || null;
  }

  if (!tenant && hospital?.email) {
    tenant = await Tenant.findOne({
      where: {
        type: 'clinic',
        [Op.or]: [
          { admin_email: hospital.email.toLowerCase() },
          { email: hospital.email.toLowerCase() },
        ],
      },
    });
    tenantId = tenant?.id || null;
  }

  return {
    hospital,
    hospitalId: hospital?.id || hospitalId || null,
    tenant,
    tenantId,
    slug: slug || tenant?.subdomain || tenant?.slug || meta.tenant_subdomain || null,
  };
}

/**
 * Ensure clinic tenant + hospitals login + clinic_admin user exist together.
 */
export async function provisionClinicPortal(input = {}) {
  const name = String(input.name || 'Clinic').trim();
  const code = String(input.code || name).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 32) || 'CLINIC';
  const subdomain = String(input.subdomain || toSlug(name)).toLowerCase().trim().slice(0, 63);
  const slug = toSlug(input.slug || subdomain);
  const email = String(input.email || `admin@${subdomain}.com`).toLowerCase().trim();
  const password = String(input.password || 'Mayden@321');
  const phone = String(input.phone || '+910000000000');
  const city = String(input.city || 'India');
  const specialty = String(input.specialty || 'dental');
  const adminFirst = String(input.admin_first_name || 'Clinic');
  const adminLast = String(input.admin_last_name || 'Admin');

  let tenant = await Tenant.findOne({
    where: {
      type: 'clinic',
      [Op.or]: [
        { subdomain },
        { slug },
        { email },
        { admin_email: email },
        ...(input.tenantId ? [{ id: Number(input.tenantId) }] : []),
      ],
    },
  });

  const tenantPatch = {
    name,
    slug,
    subdomain,
    email: input.tenantEmail || `${subdomain}@mediczy.internal`,
    phone,
    type: 'clinic',
    status: 'active',
    is_verified: true,
    verified_at: new Date(),
    admin_email: email,
    admin_password: password,
    plan: input.plan || tenant?.plan || 'free',
    settings: {
      ...(tenant?.settings || {}),
      clinic_code: code,
      specialty,
      timezone: 'Asia/Kolkata',
      language: 'en',
      currency: 'INR',
    },
    branding: {
      ...(tenant?.branding || {}),
      display_name: code,
    },
    metadata: {
      ...(tenant?.metadata || {}),
      clinic_code: code,
      specialty,
      portal_provisioned_at: new Date().toISOString(),
    },
  };

  let tenantAction = 'updated';
  if (!tenant) {
    tenant = await Tenant.create(tenantPatch);
    tenantAction = 'created';
  } else {
    await tenant.update(tenantPatch);
  }

  let hospital = await Hospital.findOne({ where: { email } });
  const hospitalPatch = {
    hospitalName: name,
    email,
    password,
    phoneNumber: phone,
    city,
    state: input.state || '',
    address: input.address || name,
    registrationNumber: input.registrationNumber || `CLINIC-${code}`,
    status: 'active',
    isVerified: true,
    specializations: ['Dental', specialty].filter(Boolean),
    facilities: [],
    metadata: {
      clinicType: 'Dental Clinic',
      registeredAs: 'clinic',
      clinic_code: code,
      tenant_id: tenant.id,
      tenant_slug: tenant.slug,
      tenant_subdomain: tenant.subdomain,
      numberOfRooms: Number(input.numberOfRooms || 0),
    },
  };

  let hospitalAction = 'updated';
  if (!hospital) {
    hospital = await Hospital.create(hospitalPatch);
    hospitalAction = 'created';
  } else {
    await hospital.update(hospitalPatch);
  }

  let adminUser = await User.findOne({
    where: {
      [Op.or]: [
        { email },
        { organization_id: tenant.id, role: 'clinic_admin' },
      ],
    },
  });

  let adminAction = 'updated';
  if (!adminUser) {
    adminUser = await User.create({
      email,
      password,
      firstName: adminFirst,
      lastName: adminLast,
      phoneNumber: phone,
      dateOfBirth: new Date('1990-01-01'),
      gender: 'Other',
      role: 'clinic_admin',
      organization_id: tenant.id,
      organization_type: 'clinic',
      tenant_id: tenant.id,
      status: 'active',
      is_verified: true,
      verified_at: new Date(),
      permissions: {
        staff_management: true,
        staff_creation: true,
        appointments: true,
        patient_management: true,
        reports: true,
        settings: true,
      },
      scope: { clinic_id: tenant.id, access_type: 'full_clinic' },
      metadata: { provisioned_by: 'clinic-portal-service' },
    });
    adminAction = 'created';
  } else {
    await adminUser.update({
      email,
      password,
      firstName: adminFirst,
      lastName: adminLast,
      phoneNumber: phone,
      role: 'clinic_admin',
      organization_id: tenant.id,
      organization_type: 'clinic',
      tenant_id: tenant.id,
      status: 'active',
      is_verified: true,
    });
  }

  await tenant.update({
    admin_user_id: adminUser.id,
    admin_email: email,
  });

  return {
    tenantAction,
    hospitalAction,
    adminAction,
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      subdomain: tenant.subdomain,
      status: tenant.status,
      access_url: `https://${tenant.subdomain}.mediqzy.com`,
    },
    hospital: {
      id: hospital.id,
      name: hospital.hospitalName || hospital.hospital_name,
      email: hospital.email,
      status: hospital.status,
    },
    adminUser: {
      id: adminUser.id,
      email: adminUser.email,
      role: adminUser.role,
    },
    login: {
      email,
      password,
      urls: [
        `https://${subdomain}.mediqzy.com/login`,
        `https://${subdomain}.mediqzy.com/clinic/login`,
        'https://app.mediqzy.com/clinic/login',
      ],
    },
  };
}

export async function getClinicPortalStats(tenantId) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tomorrow = new Date(todayStart);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [totalPatients, staffCount, todayAppointments, waiting] = await Promise.all([
    User.count({ where: { organization_id: tenantId, role: 'patient', status: { [Op.ne]: 'deleted' } } }),
    User.count({
      where: {
        organization_id: tenantId,
        role: { [Op.in]: ['doctor', 'nurse', 'doctor_assistant', 'clinic_admin'] },
        status: 'active',
      },
    }),
    Appointment.count({
      where: {
        [Op.or]: [{ organization_id: tenantId }, { tenant_id: tenantId }],
        appointmentDate: { [Op.gte]: todayStart, [Op.lt]: tomorrow },
      },
    }).catch(() => 0),
    Appointment.count({
      where: {
        [Op.or]: [{ organization_id: tenantId }, { tenant_id: tenantId }],
        appointmentDate: { [Op.gte]: todayStart, [Op.lt]: tomorrow },
        status: { [Op.in]: ['waiting', 'checked_in', 'Waiting', 'Checked In'] },
      },
    }).catch(() => 0),
  ]);

  return {
    todayAppointments,
    patientsWaiting: waiting,
    totalPatients,
    staffCount,
    todayRevenue: 0,
    monthlyRevenue: 0,
    revenueGrowth: 0,
  };
}

export async function listClinicPortalPatients(tenantId, { search = '', limit = 50 } = {}) {
  const where = {
    organization_id: tenantId,
    role: 'patient',
    status: { [Op.ne]: 'deleted' },
  };
  if (search) {
    where[Op.or] = [
      { firstName: { [Op.iLike]: `%${search}%` } },
      { lastName: { [Op.iLike]: `%${search}%` } },
      { email: { [Op.iLike]: `%${search}%` } },
      { phoneNumber: { [Op.iLike]: `%${search}%` } },
    ];
  }
  const rows = await User.findAll({
    where,
    order: [['updatedAt', 'DESC']],
    limit: Math.min(Number(limit) || 50, 200),
  });
  return rows.map((p) => ({
    id: p.id,
    name: `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.email,
    email: p.email,
    phone: p.phoneNumber,
    status: p.status,
    lastVisit: p.updatedAt,
    diagnosis: p.metadata?.diagnosis || '',
    nextVisit: p.metadata?.nextVisit || null,
  }));
}

export async function createClinicPortalPatient(tenantId, body = {}) {
  const email = String(body.email || '').toLowerCase().trim();
  const password = String(body.password || `Patient@${Date.now().toString().slice(-6)}`);
  if (!email) throw new Error('email is required');

  const existing = await User.findOne({ where: { email } });
  if (existing) throw Object.assign(new Error('Email already registered'), { status: 409 });

  const name = String(body.name || '').trim();
  const [firstName, ...rest] = name ? name.split(/\s+/) : [body.first_name || 'Patient', body.last_name || 'User'];
  const lastName = rest.length ? rest.join(' ') : (body.last_name || 'User');

  const patient = await User.create({
    email,
    password,
    firstName,
    lastName,
    phoneNumber: body.phone || body.patientPhone || '',
    dateOfBirth: body.date_of_birth || new Date('1990-01-01'),
    gender: body.gender || 'Other',
    role: 'patient',
    organization_id: tenantId,
    organization_type: 'clinic',
    tenant_id: tenantId,
    status: 'active',
    is_verified: true,
    verified_at: new Date(),
    metadata: {
      diagnosis: body.diagnosis || '',
      nextVisit: body.nextVisit || null,
      created_via: 'clinic_portal',
    },
  });

  return {
    id: patient.id,
    name: `${patient.firstName} ${patient.lastName}`.trim(),
    email: patient.email,
    phone: patient.phoneNumber,
    diagnosis: patient.metadata?.diagnosis || '',
    lastVisit: patient.updatedAt,
    nextVisit: patient.metadata?.nextVisit || null,
  };
}

export async function listClinicPortalAppointments(tenantId, { limit = 50 } = {}) {
  const rows = await Appointment.findAll({
    where: {
      [Op.or]: [{ organization_id: tenantId }, { tenant_id: tenantId }],
    },
    order: [['appointmentDate', 'DESC']],
    limit: Math.min(Number(limit) || 50, 200),
  }).catch(() => []);

  return rows.map((a) => ({
    id: a.id,
    patient: a.patientName,
    phone: a.patientPhone,
    email: a.patientEmail,
    time: a.appointmentTime || a.appointmentDate,
    date: a.appointmentDate,
    type: a.appointmentType || a.type || 'Consultation',
    status: a.status || 'Scheduled',
    doctor: a.doctorName || 'Unassigned',
  }));
}

export async function createClinicPortalAppointment(tenantId, body = {}) {
  const patientName = String(body.patientName || body.patient || body.name || '').trim();
  const patientPhone = String(body.patientPhone || body.phone || '0000000000').trim();
  if (!patientName) throw new Error('patientName is required');

  const appointmentDate = body.appointmentDate
    ? new Date(body.appointmentDate)
    : new Date();

  const row = await Appointment.create({
    organization_id: tenantId,
    organization_type: 'clinic',
    tenant_id: tenantId,
    patientName,
    patientPhone,
    patientEmail: body.patientEmail || body.email || null,
    doctorName: body.doctorName || body.doctor || 'Clinic Doctor',
    appointmentDate,
    appointmentTime: body.appointmentTime || body.time || null,
    appointmentType: body.appointmentType || body.type || 'consultation',
    status: body.status || 'Scheduled',
    reason: body.reason || body.notes || null,
    metadata: { created_via: 'clinic_portal' },
  });

  return {
    id: row.id,
    patient: row.patientName,
    phone: row.patientPhone,
    time: row.appointmentTime || row.appointmentDate,
    type: row.appointmentType || 'Consultation',
    status: row.status,
  };
}

export async function listClinicPortalStaff(tenantId) {
  const rows = await User.findAll({
    where: {
      organization_id: tenantId,
      role: { [Op.in]: ['doctor', 'nurse', 'doctor_assistant', 'clinic_admin'] },
      status: { [Op.ne]: 'deleted' },
    },
    order: [['role', 'ASC'], ['firstName', 'ASC']],
  });
  return rows.map((s) => ({
    id: s.id,
    name: `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.email,
    email: s.email,
    phone: s.phoneNumber,
    role: s.role,
    status: s.status,
    specialization: s.metadata?.specialization || s.specialization || '',
  }));
}

export async function createClinicPortalStaff(tenantId, body = {}) {
  const email = String(body.email || '').toLowerCase().trim();
  const password = String(body.password || `Staff@${Date.now().toString().slice(-6)}`);
  const role = String(body.role || 'doctor').trim();
  if (!email) throw new Error('email is required');
  if (!['doctor', 'nurse', 'doctor_assistant'].includes(role)) {
    throw new Error('role must be doctor, nurse, or doctor_assistant');
  }

  const existing = await User.findOne({ where: { email } });
  if (existing) throw Object.assign(new Error('Email already registered'), { status: 409 });

  const staff = await User.create({
    email,
    password,
    firstName: body.first_name || body.firstName || 'Staff',
    lastName: body.last_name || body.lastName || 'Member',
    phoneNumber: body.phone || '',
    dateOfBirth: new Date('1990-01-01'),
    gender: 'Other',
    role,
    organization_id: tenantId,
    organization_type: 'clinic',
    tenant_id: tenantId,
    status: 'active',
    is_verified: true,
    verified_at: new Date(),
    permissions: {
      appointments: true,
      patient_management: true,
      prescriptions: role === 'doctor',
      notes: true,
    },
    scope: { clinic_id: tenantId, access_type: role === 'doctor' ? 'full_access' : 'limited_access' },
    metadata: {
      specialization: body.specialization || '',
      license_number: body.license_number || '',
      qualification: body.qualification || '',
    },
  });

  return {
    id: staff.id,
    name: `${staff.firstName} ${staff.lastName}`.trim(),
    email: staff.email,
    role: staff.role,
    status: staff.status,
    specialization: staff.metadata?.specialization || '',
  };
}

export default {
  resolveClinicPortalContext,
  provisionClinicPortal,
  getClinicPortalStats,
  listClinicPortalPatients,
  createClinicPortalPatient,
  listClinicPortalAppointments,
  createClinicPortalAppointment,
  listClinicPortalStaff,
  createClinicPortalStaff,
};
