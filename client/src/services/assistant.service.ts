/**
 * Assistant API Service
 * Centralized service for all assistant portal API calls
 */

import api from '@/lib/api';

const BASE_URL = '/api';

export interface AssistantHeaders {
  Authorization: string;
}

/**
 * Get authorization headers for assistant requests
 */
export const getAssistantHeaders = (): AssistantHeaders => {
  const token = localStorage.getItem('assistantToken') || localStorage.getItem('token');
  return {
    Authorization: `Bearer ${token}`
  };
};

// ============================================================================
// PATIENT MANAGEMENT
// ============================================================================

export const assistantPatientService = {
  /**
   * Register new patient
   */
  register: async (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phoneNumber: string;
    dateOfBirth?: string;
    gender?: string;
    address?: string;
    emergencyContact?: string;
    bloodGroup?: string;
    allergies?: string;
    medicalHistory?: string;
  }) => {
    const response = await api.post(`${BASE_URL}/patients/assistant/register`, data, {
      headers: getAssistantHeaders()
    });
    return response.data;
  },

  /**
   * Get all patients
   */
  getAll: async (params?: { search?: string; page?: number; limit?: number }) => {
    const response = await api.get(`${BASE_URL}/assistant/patients`, {
      params,
      headers: getAssistantHeaders()
    });
    return response.data;
  }
};

// ============================================================================
// APPOINTMENTS
// ============================================================================

export const assistantAppointmentService = {
  /**
   * Get all appointments
   */
  getAll: async (params?: { status?: string; date?: string; doctorId?: number }) => {
    const response = await api.get(`${BASE_URL}/assistant/appointments`, {
      params,
      headers: getAssistantHeaders()
    });
    return response.data;
  },

  /**
   * Update appointment
   */
  update: async (appointmentId: string | number, data: any) => {
    const response = await api.put(`${BASE_URL}/assistant/appointments/${appointmentId}`, data, {
      headers: getAssistantHeaders()
    });
    return response.data;
  },

  /**
   * Book new consultation
   */
  bookConsultation: async (data: {
    patientId: number;
    doctorId: number;
    appointmentDate: string;
    appointmentTime: string;
    consultationType: string;
    reason?: string;
  }) => {
    const response = await api.post(`${BASE_URL}/assistant/consultations/book`, data, {
      headers: getAssistantHeaders()
    });
    return response.data;
  }
};

// ============================================================================
// DOCTOR SCHEDULE
// ============================================================================

export const assistantScheduleService = {
  /**
   * Get doctor schedule
   */
  getDoctorSchedule: async (params?: { doctorId?: number; date?: string }) => {
    const response = await api.get(`${BASE_URL}/assistant/doctor-schedule`, {
      params,
      headers: getAssistantHeaders()
    });
    return response.data;
  }
};

// ============================================================================
// LINKED DOCTORS
// ============================================================================

export const assistantDoctorService = {
  /**
   * Get linked doctors
   */
  getLinkedDoctors: async () => {
    const response = await api.get(`${BASE_URL}/assistant/linked-doctors`, {
      headers: getAssistantHeaders()
    });
    return response.data;
  },

  /**
   * Link doctor
   */
  linkDoctor: async (data: { doctorId: number }) => {
    const response = await api.post(`${BASE_URL}/assistant/link-doctor`, data, {
      headers: getAssistantHeaders()
    });
    return response.data;
  },

  /**
   * Unlink doctor
   */
  unlinkDoctor: async (data: { doctorId: number }) => {
    const response = await api.post(`${BASE_URL}/assistant/unlink-doctor`, data, {
      headers: getAssistantHeaders()
    });
    return response.data;
  },

  /**
   * Set primary doctor
   */
  setPrimaryDoctor: async (data: { doctorId: number }) => {
    const response = await api.post(`${BASE_URL}/assistant/set-primary-doctor`, data, {
      headers: getAssistantHeaders()
    });
    return response.data;
  }
};

// ============================================================================
// FACILITY MANAGEMENT
// ============================================================================

export const assistantFacilityService = {
  /**
   * Link facility
   */
  linkFacility: async (data: {
    facilityId: number;
    facilityType: string;
    facilityName: string;
  }) => {
    const response = await api.post(`${BASE_URL}/assistant/link-facility`, data, {
      headers: getAssistantHeaders()
    });
    return response.data;
  },

  /**
   * Unlink facility
   */
  unlinkFacility: async (data: { facilityId: number; facilityType: string }) => {
    const response = await api.post(`${BASE_URL}/assistant/unlink-facility`, data, {
      headers: getAssistantHeaders()
    });
    return response.data;
  }
};

// ============================================================================
// CONSULTATIONS
// ============================================================================

export const assistantConsultationService = {
  /**
   * Get all consultations
   */
  getAll: async (params?: { status?: string; date?: string }) => {
    const response = await api.get(`${BASE_URL}/assistant/consultations`, {
      params,
      headers: getAssistantHeaders()
    });
    return response.data;
  },

  /**
   * Accept consultation
   */
  accept: async (consultationId: string | number) => {
    const response = await api.post(`${BASE_URL}/assistant/consultations/${consultationId}/accept`, {}, {
      headers: getAssistantHeaders()
    });
    return response.data;
  },

  /**
   * Cancel consultation
   */
  cancel: async (consultationId: string | number, reason?: string) => {
    const response = await api.post(`${BASE_URL}/assistant/consultations/${consultationId}/cancel`, 
      { reason },
      { headers: getAssistantHeaders() }
    );
    return response.data;
  },

  /**
   * Postpone consultation
   */
  postpone: async (consultationId: string | number, data: {
    newDate: string;
    newTime: string;
    reason?: string;
  }) => {
    const response = await api.post(`${BASE_URL}/assistant/consultations/${consultationId}/postpone`, data, {
      headers: getAssistantHeaders()
    });
    return response.data;
  },

  /**
   * Add notes to consultation
   */
  addNotes: async (consultationId: string | number, notes: string) => {
    const response = await api.post(`${BASE_URL}/assistant/consultations/${consultationId}/notes`, 
      { notes },
      { headers: getAssistantHeaders() }
    );
    return response.data;
  }
};

// ============================================================================
// NOTIFICATIONS
// ============================================================================

export const assistantNotificationService = {
  /**
   * Send notification
   */
  send: async (data: {
    patientId: number;
    message: string;
    type: string;
  }) => {
    const response = await api.post(`${BASE_URL}/assistant/notify`, data, {
      headers: getAssistantHeaders()
    });
    return response.data;
  }
};

// ============================================================================
// PROFILE
// ============================================================================

export const assistantProfileService = {
  /**
   * Get profile
   */
  getProfile: async () => {
    const response = await api.get(`${BASE_URL}/assistant/profile`, {
      headers: getAssistantHeaders()
    });
    return response.data;
  },

  /**
   * Update profile
   */
  update: async (data: {
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    roleTitle?: string;
  }) => {
    const response = await api.put(`${BASE_URL}/assistant/profile`, data, {
      headers: getAssistantHeaders()
    });
    return response.data;
  }
};

// Export all services
export default {
  patients: assistantPatientService,
  appointments: assistantAppointmentService,
  schedule: assistantScheduleService,
  doctors: assistantDoctorService,
  facilities: assistantFacilityService,
  consultations: assistantConsultationService,
  notifications: assistantNotificationService,
  profile: assistantProfileService
};
