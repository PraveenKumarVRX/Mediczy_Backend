/**
 * Patient data layer.
 *
 * Every path here was verified against the live API with a patient token
 * before being used, and every one of them is inside the `patient` allow-list
 * in server/middleware/ringFencing.js — a path outside that list answers 403
 * for a patient however correct the route is, so new endpoints must be added
 * there as well.
 *
 * Server responses are inconsistent about envelopes ({data:{…}} vs top-level)
 * and about snake_case vs camelCase, so each loader normalises into the types
 * below and screens never touch a raw payload.
 */
import { connectionManager } from '../connection/runtime';

export interface Profile {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  bloodType?: string | null;
  allergies: string[];
  clinicName?: string | null;
  clinicPhone?: string | null;
  clinicEmail?: string | null;
}

export interface Appointment {
  id: number;
  reference?: string | null;
  doctorName: string;
  specialization?: string | null;
  date?: string | null;
  time?: string | null;
  dateTime?: string | null;
  status: string;
  consultationType?: string | null;
  reason?: string | null;
}

export interface Doctor {
  id: number;
  name: string;
  specialization?: string | null;
  qualification?: string | null;
  experience?: number | null;
  fee?: number | null;
  rating?: number | null;
  languages: string[];
}

export interface SlotsForDay {
  isOffDay: boolean;
  slotDuration?: number | null;
  online: string[];
  inPerson: string[];
}

export interface Prescription {
  id: number;
  reference?: string | null;
  doctorName?: string | null;
  specialty?: string | null;
  diagnosis?: string | null;
  issuedAt?: string | null;
  status?: string | null;
  medicines: { name: string; dosage?: string | null; frequency?: string | null; duration?: string | null }[];
  advice?: string | null;
  followUpDate?: string | null;
}

export interface Report {
  id: number;
  fileName?: string | null;
  fileUrl?: string | null;
  reportType?: string | null;
  description?: string | null;
  status?: string | null;
  createdAt?: string | null;
}

export interface Vital {
  recordedAt?: string | null;
  systolic?: number | null;
  diastolic?: number | null;
  heartRate?: number | null;
  temperature?: number | null;
  spo2?: number | null;
  weight?: number | null;
  bloodSugar?: number | null;
}

export interface CheckupPackage {
  id: number;
  name: string;
  description?: string | null;
  price?: number | null;
  testCount?: number | null;
}

export interface CheckupBooking {
  id: number;
  packageName?: string | null;
  status?: string | null;
  scheduledFor?: string | null;
  location?: string | null;
}

export interface Notification {
  id: number;
  title?: string | null;
  body?: string | null;
  createdAt?: string | null;
  read: boolean;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strings = (v: unknown): string[] => list(v).map(str).filter((s): s is string => !!s);

function fullName(parts: unknown[], fallback: string) {
  const name = parts.map(str).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return name || fallback;
}

type Row = Record<string, unknown>;
const rows = (v: unknown): Row[] => list(v).filter((r): r is Row => !!r && typeof r === 'object');

async function get(path: string) {
  return connectionManager.request(path) as Promise<Row>;
}

export async function loadProfile(): Promise<Profile> {
  const res = await get('/api/patient/profile');
  const data = (res.data || {}) as Row;
  const p = (data.patient || {}) as Row;
  const clinic = (data.clinic || {}) as Row;
  return {
    id: num(p.id) ?? 0,
    name: fullName([p.first_name, p.last_name], 'Your profile'),
    email: str(p.email) || '',
    phone: str(p.phone),
    dateOfBirth: str(p.date_of_birth),
    gender: str(p.gender),
    bloodType: str(p.blood_type),
    allergies: strings(p.allergies),
    clinicName: str(clinic.name),
    clinicPhone: str(clinic.phone),
    clinicEmail: str(clinic.email),
  };
}

function toAppointment(r: Row): Appointment {
  return {
    id: num(r.id) ?? 0,
    reference: str(r.appointmentId),
    doctorName: str(r.doctorName) || 'Your doctor',
    specialization: str(r.specialization),
    date: str(r.appointmentDate),
    time: str(r.appointmentTime),
    dateTime: str(r.appointmentDateTime),
    status: str(r.status) || 'scheduled',
    consultationType: str(r.consultationType),
    reason: str(r.reason) || str(r.notes),
  };
}

export async function loadAppointments(): Promise<{ upcoming: Appointment[]; past: Appointment[] }> {
  const res = await get('/api/patient/appointments');
  const data = (res.data || {}) as Row;
  return { upcoming: rows(data.upcoming).map(toAppointment), past: rows(data.past).map(toAppointment) };
}

export async function loadDoctors(): Promise<Doctor[]> {
  const res = await get('/api/doctors');
  return rows(res.doctors).map(r => ({
    id: num(r.id) ?? 0,
    name: fullName([r.prefix, r.firstName, r.lastName], 'Doctor'),
    specialization: str(r.specialization),
    qualification: str(r.qualification),
    experience: num(r.experience),
    fee: num(r.onlineConsultationFee) ?? num(r.consultationFees) ?? num(r.inPersonConsultationFee),
    rating: num(r.rating),
    languages: strings(r.languages),
  })).filter(d => d.id > 0);
}

export async function loadSlots(doctorId: number, date: string): Promise<SlotsForDay> {
  const res = await get(`/api/doctors/available-slots/${doctorId}?date=${date}`);
  const slots = (res.slots || {}) as Row;
  return {
    isOffDay: res.isOffDay === true,
    slotDuration: num(res.slotDuration),
    online: strings(slots.online),
    inPerson: strings(slots['in-person']),
  };
}

export async function bookAppointment(input: {
  doctorId: number; date: string; time: string; consultationType: 'video' | 'in-person'; reason?: string;
}) {
  return connectionManager.request('/api/appointments', {
    doctorId: input.doctorId,
    appointmentDate: input.date,
    appointmentTime: input.time,
    consultationType: input.consultationType,
    ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
  });
}

export async function loadPrescriptions(): Promise<Prescription[]> {
  const res = await get('/api/prescriptions/patient');
  return rows(res.prescriptions).map(r => {
    const source = list(r.medicines).length ? r.medicines : r.medications;
    return {
      id: num(r.id) ?? 0,
      reference: str(r.prescriptionId),
      doctorName: str(r.doctorName),
      specialty: str(r.specialty),
      diagnosis: str(r.diagnosis),
      issuedAt: str(r.issuedAt) || str(r.createdAt),
      status: str(r.status),
      medicines: rows(source).map(m => ({
        name: str(m.name) || str(m.medicine) || str(m.drug) || 'Medicine',
        dosage: str(m.dosage) || str(m.strength),
        frequency: str(m.frequency),
        duration: str(m.duration),
      })),
      advice: str(r.advice),
      followUpDate: str(r.followUpDate),
    };
  });
}

export async function loadReports(): Promise<Report[]> {
  const res = await get('/api/patient/reports');
  const data = (res.data || {}) as Row;
  return rows(data.reports).map(r => ({
    id: num(r.id) ?? 0,
    fileName: str(r.fileName),
    fileUrl: str(r.fileUrl),
    reportType: str(r.reportType),
    description: str(r.description),
    status: str(r.status),
    createdAt: str(r.createdAt),
  }));
}

export async function loadVitals(): Promise<Vital[]> {
  const res = await get('/api/health-data/vitals');
  return rows(res.vitals).map(r => ({
    recordedAt: str(r.recordedAt) || str(r.recorded_at) || str(r.createdAt),
    systolic: num(r.systolic) ?? num(r.bloodPressureSystolic),
    diastolic: num(r.diastolic) ?? num(r.bloodPressureDiastolic),
    heartRate: num(r.heartRate) ?? num(r.pulse),
    temperature: num(r.temperature),
    spo2: num(r.spo2) ?? num(r.oxygenSaturation),
    weight: num(r.weight),
    bloodSugar: num(r.bloodSugar) ?? num(r.glucose),
  }));
}

export async function loadCheckupPackages(): Promise<CheckupPackage[]> {
  const res = await get('/api/health-checkups/packages');
  return rows(res.packages).map(r => ({
    id: num(r.id) ?? 0,
    name: str(r.name) || str(r.packageName) || 'Health checkup',
    description: str(r.description),
    price: num(r.price) ?? num(r.amount),
    testCount: num(r.testCount) ?? (list(r.tests).length || null),
  }));
}

export async function loadCheckupBookings(): Promise<CheckupBooking[]> {
  const res = await get('/api/health-checkups/bookings');
  return rows(res.bookings).map(r => ({
    id: num(r.id) ?? 0,
    packageName: str(r.packageName) || str(r.package_name),
    status: str(r.status),
    scheduledFor: str(r.scheduledAt) || str(r.scheduled_for) || str(r.appointmentDate),
    location: str(r.locationName) || str(r.labName),
  }));
}

export async function loadNotifications(): Promise<Notification[]> {
  const res = await get('/api/notifications');
  return rows(res.notifications).map(r => ({
    id: num(r.id) ?? 0,
    title: str(r.title),
    body: str(r.body) || str(r.message),
    createdAt: str(r.createdAt) || str(r.created_at),
    read: r.read === true || r.isRead === true,
  }));
}

/**
 * DPDPA §14 erasure, which the server performs immediately. It requires the
 * literal confirmation below, and refuses accounts flagged as managed (the
 * app-store reviewer login among them) with code `account_protected`.
 */
export async function deleteAccount() {
  return connectionManager.request('/api/users/data/erasure', { confirm: 'ERASE' });
}
