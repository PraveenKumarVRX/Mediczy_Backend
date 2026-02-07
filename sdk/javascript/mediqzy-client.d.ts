/**
 * TypeScript Type Definitions for Mediqzy API Client SDK
 * 
 * @version 1.0.0
 */

// ==================== Configuration ====================

export interface MediqzyClientConfig {
  baseUrl: string;
  tenantId: string;
  accessToken?: string;
  onTokenRefresh?: (tokens: TokenRefreshCallback) => void;
}

export interface TokenRefreshCallback {
  accessToken: string;
  refreshToken: string;
}

// ==================== Authentication ====================

export interface TokenExchangeParams {
  providerToken: string;
  provider: 'azure_ad' | 'google' | 'okta';
  externalUserId: string;
  role?: 'patient' | 'doctor' | 'clinic_admin' | 'corporate_admin' | 'insurance_admin' | 'tpa_admin';
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user_id: string;
  tenant_id: string;
  scopes: string[];
}

export interface RefreshTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface RevokeTokenResponse {
  revoked: boolean;
  message: string;
}

// ==================== Users ====================

export interface Address {
  street: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

export interface UserData {
  external_user_id: string;
  email: string;
  phone: string;
  first_name: string;
  last_name: string;
  date_of_birth?: string;
  gender?: 'male' | 'female' | 'other';
  address?: Address;
  tenant_meta?: Record<string, any>;
}

export interface User {
  user_id: string;
  external_user_id: string;
  email: string;
  phone: string;
  first_name: string;
  last_name: string;
  date_of_birth?: string;
  gender?: string;
  address?: Address;
  tenant_meta?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface HealthProfile {
  height_cm?: number;
  weight_kg?: number;
  blood_type?: string;
  allergies?: string[];
  chronic_conditions?: string[];
  medications?: Medication[];
  emergency_contact?: EmergencyContact;
}

export interface Medication {
  name: string;
  dosage: string;
  frequency: string;
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
}

// ==================== Doctors ====================

export interface DoctorSearchFilters {
  specialty?: string;
  city?: string;
  consultationType?: 'online' | 'offline' | 'both';
  minRating?: number;
  language?: string;
  availableDate?: string;
  sortBy?: 'rating' | 'experience' | 'fee';
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface Doctor {
  doctor_id: string;
  name: string;
  specialty: string;
  qualification: string;
  experience_years: number;
  rating: number;
  consultation_fee: number;
  languages: string[];
  consultation_types: string[];
  profile_picture?: string;
  city: string;
  clinic_name: string;
  working_hours: WorkingHours;
  bio?: string;
}

export interface WorkingHours {
  [key: string]: {
    available: boolean;
    start?: string;
    end?: string;
  };
}

export interface DoctorsResponse {
  doctors: Doctor[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

export interface DoctorAvailability {
  doctor_id: string;
  working_hours: WorkingHours;
  timezone: string;
}

export interface TimeSlot {
  time: string;
  available: boolean;
}

export interface DoctorSlotsResponse {
  doctor_id: string;
  date: string;
  consultation_type: string;
  slot_duration: number;
  slots: TimeSlot[];
}

// ==================== Appointments ====================

export interface AppointmentData {
  doctorId: string;
  userId: string;
  appointmentDate: string;
  appointmentTime: string;
  consultationType?: 'online' | 'offline';
  reason: string;
  symptoms?: string[];
  paymentMethod?: 'wallet' | 'card' | 'upi';
}

export interface Appointment {
  appointment_id: string;
  doctor_id: string;
  user_id: string;
  appointment_date: string;
  appointment_time: string;
  consultation_type: string;
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  reason: string;
  symptoms?: any;
  consultation_fee: number;
  platform_fee: number;
  total_amount: number;
  payment_method: string;
  payment_status: string;
  meeting_details?: MeetingDetails;
  prescription_id?: string;
  rescheduled_from?: any;
  cancellation_reason?: string;
  created_at: string;
  updated_at: string;
  cancelled_at?: string;
  completed_at?: string;
}

export interface MeetingDetails {
  room_id: string;
  duration_minutes?: number;
  recording_url?: string;
  ended_by?: string;
  participants?: any[];
}

export interface AppointmentFilters {
  userId?: string;
  doctorId?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

export interface AppointmentsResponse {
  appointments: Appointment[];
  pagination: {
    limit: number;
    offset: number;
  };
}

// ==================== Video Consultation ====================

export interface VideoTokenParams {
  appointmentId: string;
  participantType: 'patient' | 'doctor';
  userId: string;
  name: string;
}

export interface VideoTokenResponse {
  token: string;
  room_id: string;
  ws_url: string;
  participant: {
    identity: string;
    name: string;
    type: string;
  };
  expires_in: number;
}

export interface VideoRoomStatus {
  room_id: string;
  appointment_id: string;
  status: string;
  started_at?: string;
  ended_at?: string;
  participants: any[];
  duration_minutes?: number;
}

export interface EndCallParams {
  roomId: string;
  durationMinutes: number;
  recordingUrl?: string;
}

export interface EndCallResponse {
  appointment_id: string;
  room_id: string;
  status: string;
  ended_at: string;
  duration_minutes: number;
}

// ==================== Error Handling ====================

export class MediqzyAPIError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode: number);
}

// ==================== Main Client Class ====================

export class MediqzyClient {
  baseUrl: string;
  tenantId: string;
  accessToken: string | null;
  refreshToken: string | null;
  onTokenRefresh: ((tokens: TokenRefreshCallback) => void) | null;

  constructor(config: MediqzyClientConfig);

  // Authentication
  exchangeToken(params: TokenExchangeParams): Promise<TokenResponse>;
  refreshAccessToken(): Promise<RefreshTokenResponse>;
  revokeToken(): Promise<RevokeTokenResponse>;

  // Users
  createUser(userData: UserData): Promise<User>;
  getUser(userId: string): Promise<User>;
  updateUser(userId: string, updates: Partial<UserData>): Promise<User>;
  getHealthProfile(userId: string): Promise<{ user_id: string; health_profile: HealthProfile }>;
  updateHealthProfile(userId: string, healthData: HealthProfile): Promise<{ user_id: string; health_profile: HealthProfile }>;

  // Doctors
  searchDoctors(filters?: DoctorSearchFilters): Promise<DoctorsResponse>;
  getDoctor(doctorId: string): Promise<Doctor>;
  getDoctorAvailability(doctorId: string, params?: { startDate?: string; endDate?: string }): Promise<DoctorAvailability>;
  getDoctorSlots(doctorId: string, date: string, consultationType?: string): Promise<DoctorSlotsResponse>;

  // Appointments
  createAppointment(appointmentData: AppointmentData): Promise<Appointment>;
  listAppointments(filters?: AppointmentFilters): Promise<AppointmentsResponse>;
  getAppointment(appointmentId: string): Promise<Appointment>;
  rescheduleAppointment(appointmentId: string, newDate: string, newTime: string): Promise<Appointment>;
  cancelAppointment(appointmentId: string, reason?: string): Promise<Appointment>;
  completeAppointment(appointmentId: string): Promise<Appointment>;

  // Video Consultation
  generateVideoToken(params: VideoTokenParams): Promise<VideoTokenResponse>;
  getVideoRoomStatus(roomId: string): Promise<VideoRoomStatus>;
  endVideoCall(roomId: string, durationMinutes: number, recordingUrl?: string): Promise<EndCallResponse>;
}

export default MediqzyClient;
