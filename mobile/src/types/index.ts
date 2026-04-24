// ─── Auth ─────────────────────────────────────────────────────────────────────

export type UserRole = 'patient' | 'doctor';

export interface AuthUser {
  id: number;
  email: string;
  role: UserRole;
  name?: string;
  phone?: string;
  avatar?: string;
}

export interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isLoading: boolean;
}

// ─── Appointments ──────────────────────────────────────────────────────────────

export type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';
export type ConsultationType = 'video' | 'in-person' | 'chat';

export interface Appointment {
  id: number;
  doctorId: number;
  userId: number;
  doctorName: string;
  patientName: string;
  appointmentDate: string;
  appointmentTime: string;
  status: AppointmentStatus;
  consultationType: ConsultationType;
  paymentStatus: string;
  meetingLink?: string;
  notes?: string;
}

// ─── Doctor ────────────────────────────────────────────────────────────────────

export interface Doctor {
  id: number;
  name: string;
  email: string;
  specialization: string;
  experience?: number;
  rating?: number;
  fee?: number;
  emergencyFee?: number;
  avatar?: string;
  bio?: string;
  qualifications?: string[];
  languages?: string[];
  clinicName?: string;
  clinicAddress?: string;
  isAvailable?: boolean;
}

// ─── Prescription ──────────────────────────────────────────────────────────────

export type PrescriptionStatus = 'draft' | 'issued' | 'active' | 'dispensed' | 'expired';

export interface Medication {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions?: string;
}

export interface Prescription {
  id: number;
  prescriptionId: string;
  patientId: number;
  patientName: string;
  doctorId: number;
  doctorName: string;
  diagnosis: string;
  chiefComplaints?: string;
  medications: Medication[];
  instructions?: string[];
  labTests?: string[];
  followUpDate?: string;
  status: PrescriptionStatus;
  issuedAt?: string;
  pdfUrl?: string;
  createdAt: string;
}

// ─── EHR ──────────────────────────────────────────────────────────────────────

export interface MedicalRecord {
  id: number;
  recordType: string;
  title: string;
  summary?: string;
  details?: Record<string, unknown>;
  doctorName?: string;
  recordDate: string;
  status: string;
}

// ─── Health Diary ─────────────────────────────────────────────────────────────

export interface HealthDiaryEntry {
  id: number;
  userId: number;
  entryType: string;
  title: string;
  description?: string;
  data?: Record<string, unknown>;
  entryDate: string;
  linkedRecordType?: string;
  linkedRecordId?: number;
  tags?: string[];
}

// ─── Notification ─────────────────────────────────────────────────────────────

export interface AppNotification {
  id: number;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

// ─── API Response ─────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
