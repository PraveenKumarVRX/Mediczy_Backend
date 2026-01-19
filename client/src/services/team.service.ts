/**
 * Team API Service
 * Centralized service for all team portal API calls
 */

import api from '@/lib/api';

const BASE_URL = '/api/team';

export interface TeamHeaders {
  Authorization: string;
}

/**
 * Get authorization headers for team requests
 */
export const getTeamHeaders = (): TeamHeaders => {
  const token = localStorage.getItem('teamToken') || localStorage.getItem('token');
  return {
    Authorization: `Bearer ${token}`
  };
};

// ============================================================================
// TEAM MEMBERS / USERS
// ============================================================================

export const teamUserService = {
  /**
   * Get all team users/members
   */
  getAll: async (params?: { department?: string; role?: string; status?: string }) => {
    const response = await api.get(`${BASE_URL}/users`, {
      params,
      headers: getTeamHeaders()
    });
    return response.data;
  },

  /**
   * Create new team member
   */
  create: async (data: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    role?: string;
    department?: string;
    designation?: string;
  }) => {
    const response = await api.post(`${BASE_URL}/users`, data, {
      headers: getTeamHeaders()
    });
    return response.data;
  }
};

// ============================================================================
// DOCTORS
// ============================================================================

export const teamDoctorService = {
  /**
   * Get all doctors
   */
  getAll: async (params?: { specialization?: string; city?: string; state?: string }) => {
    const response = await api.get(`${BASE_URL}/doctors`, {
      params,
      headers: getTeamHeaders()
    });
    return response.data;
  },

  /**
   * Create/Add new doctor
   */
  create: async (data: {
    firstName: string;
    lastName: string;
    email: string;
    license: string;
    specialization: string;
    phone?: string;
    qualification?: string;
    experience?: number;
  }) => {
    const response = await api.post(`${BASE_URL}/doctors`, data, {
      headers: getTeamHeaders()
    });
    return response.data;
  }
};

// ============================================================================
// TEAM DIRECTORY
// ============================================================================

export const teamDirectoryService = {
  /**
   * Get team directory (all team members)
   */
  getDirectory: async () => {
    const response = await api.get(`${BASE_URL}/directory`, {
      headers: getTeamHeaders()
    });
    return response.data;
  }
};

// ============================================================================
// APPOINTMENTS
// ============================================================================

export const teamAppointmentService = {
  /**
   * Get all appointments
   */
  getAll: async (params?: { status?: string; from?: string; to?: string }) => {
    const response = await api.get(`${BASE_URL}/appointments`, {
      params,
      headers: getTeamHeaders()
    });
    return response.data;
  },

  /**
   * Create new appointment
   */
  create: async (data: {
    patientName: string;
    patientEmail?: string;
    patientPhone: string;
    doctorId: number;
    appointmentDate: string;
    appointmentTime: string;
    reason?: string;
  }) => {
    const response = await api.post(`${BASE_URL}/appointments`, data, {
      headers: getTeamHeaders()
    });
    return response.data;
  }
};

// ============================================================================
// PHARMACIES
// ============================================================================

export const teamPharmacyService = {
  /**
   * Get all pharmacies
   */
  getAll: async (params?: { city?: string; state?: string; status?: string }) => {
    const response = await api.get(`${BASE_URL}/pharmacies`, {
      params,
      headers: getTeamHeaders()
    });
    return response.data;
  },

  /**
   * Create/Add new pharmacy
   */
  create: async (data: {
    name: string;
    licenseNumber: string;
    address: string;
    city: string;
    state: string;
    phone?: string;
    email?: string;
  }) => {
    const response = await api.post(`${BASE_URL}/pharmacies`, data, {
      headers: getTeamHeaders()
    });
    return response.data;
  }
};

// ============================================================================
// PROFILE
// ============================================================================

export const teamProfileService = {
  /**
   * Get current team user profile
   */
  getProfile: async () => {
    const response = await api.get(`${BASE_URL}/profile`, {
      headers: getTeamHeaders()
    });
    return response.data;
  },

  /**
   * Update team user profile
   */
  update: async (data: {
    firstName?: string;
    lastName?: string;
    department?: string;
    designation?: string;
  }) => {
    const response = await api.put(`${BASE_URL}/profile`, data, {
      headers: getTeamHeaders()
    });
    return response.data;
  }
};

// ============================================================================
// MODULES & PERMISSIONS
// ============================================================================

export const teamModuleService = {
  /**
   * Get available modules for current user
   */
  getModules: async () => {
    const response = await api.get(`${BASE_URL}/modules`, {
      headers: getTeamHeaders()
    });
    return response.data;
  },

  /**
   * Verify access to specific module
   */
  verifyAccess: async (moduleName: string) => {
    const response = await api.post(`${BASE_URL}/verify-access`, 
      { moduleName },
      { headers: getTeamHeaders() }
    );
    return response.data;
  }
};

// Export all services
export default {
  users: teamUserService,
  doctors: teamDoctorService,
  directory: teamDirectoryService,
  appointments: teamAppointmentService,
  pharmacies: teamPharmacyService,
  profile: teamProfileService,
  modules: teamModuleService
};
