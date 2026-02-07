/**
 * Mediqzy API Client SDK
 * JavaScript/TypeScript client library for Mediqzy API v1
 * 
 * @version 1.0.0
 * @author Mediqzy Development Team
 * @license MIT
 */

class MediqzyClient {
  /**
   * Initialize Mediqzy API client
   * 
   * @param {Object} config Configuration object
   * @param {string} config.baseUrl API base URL (e.g., 'https://api.mediqzy.com/v1')
   * @param {string} config.tenantId Tenant identifier
   * @param {string} [config.accessToken] Initial access token
   * @param {Function} [config.onTokenRefresh] Callback when token is refreshed
   */
  constructor(config) {
    this.baseUrl = config.baseUrl;
    this.tenantId = config.tenantId;
    this.accessToken = config.accessToken || null;
    this.refreshToken = null;
    this.onTokenRefresh = config.onTokenRefresh || null;
  }

  /**
   * Make authenticated API request
   * 
   * @private
   * @param {string} method HTTP method
   * @param {string} path API path
   * @param {Object} [data] Request body
   * @param {Object} [options] Additional options
   * @returns {Promise<Object>} Response data
   */
  async request(method, path, data = null, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.accessToken && !options.noAuth) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const requestOptions = {
      method,
      headers
    };

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      requestOptions.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, requestOptions);

      if (!response.ok) {
        const error = await response.json();
        throw new MediqzyAPIError(error.error.code, error.error.message, response.status);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof MediqzyAPIError) {
        throw error;
      }
      throw new MediqzyAPIError('NETWORK_ERROR', error.message, 0);
    }
  }

  // ==================== Authentication ====================

  /**
   * Exchange external OIDC token for Mediqzy access token
   * 
   * @param {Object} params Token exchange parameters
   * @param {string} params.providerToken External OIDC token
   * @param {string} params.provider Provider name (azure_ad, google, okta)
   * @param {string} params.externalUserId External user identifier
   * @param {string} [params.role='patient'] User role
   * @returns {Promise<Object>} Token response
   */
  async exchangeToken({ providerToken, provider, externalUserId, role = 'patient' }) {
    const response = await this.request('POST', '/auth/exchange', {
      provider_token: providerToken,
      provider,
      external_user_id: externalUserId,
      role,
      tenant_id: this.tenantId
    }, { noAuth: true });

    this.accessToken = response.access_token;
    this.refreshToken = response.refresh_token;

    if (this.onTokenRefresh) {
      this.onTokenRefresh({
        accessToken: this.accessToken,
        refreshToken: this.refreshToken
      });
    }

    return response;
  }

  /**
   * Refresh access token
   * 
   * @returns {Promise<Object>} New token response
   */
  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new MediqzyAPIError('NO_REFRESH_TOKEN', 'No refresh token available', 401);
    }

    const response = await this.request('POST', '/auth/refresh', {
      refresh_token: this.refreshToken
    }, { noAuth: true });

    this.accessToken = response.access_token;

    if (this.onTokenRefresh) {
      this.onTokenRefresh({
        accessToken: this.accessToken,
        refreshToken: this.refreshToken
      });
    }

    return response;
  }

  /**
   * Revoke access token (logout)
   * 
   * @returns {Promise<Object>} Revocation confirmation
   */
  async revokeToken() {
    const response = await this.request('POST', '/auth/revoke', {
      token: this.accessToken
    });

    this.accessToken = null;
    this.refreshToken = null;

    return response;
  }

  // ==================== Users ====================

  /**
   * Create or update user profile
   * 
   * @param {Object} userData User data
   * @returns {Promise<Object>} User profile
   */
  async createUser(userData) {
    return this.request('POST', `/${this.tenantId}/users`, userData);
  }

  /**
   * Get user profile
   * 
   * @param {string} userId User identifier
   * @returns {Promise<Object>} User profile
   */
  async getUser(userId) {
    return this.request('GET', `/${this.tenantId}/users/${userId}`);
  }

  /**
   * Update user profile
   * 
   * @param {string} userId User identifier
   * @param {Object} updates Profile updates
   * @returns {Promise<Object>} Updated user profile
   */
  async updateUser(userId, updates) {
    return this.request('PUT', `/${this.tenantId}/users/${userId}`, updates);
  }

  /**
   * Get user health profile
   * 
   * @param {string} userId User identifier
   * @returns {Promise<Object>} Health profile
   */
  async getHealthProfile(userId) {
    return this.request('GET', `/${this.tenantId}/users/${userId}/health-profile`);
  }

  /**
   * Update user health profile
   * 
   * @param {string} userId User identifier
   * @param {Object} healthData Health profile data
   * @returns {Promise<Object>} Updated health profile
   */
  async updateHealthProfile(userId, healthData) {
    return this.request('PUT', `/${this.tenantId}/users/${userId}/health-profile`, healthData);
  }

  // ==================== Doctors ====================

  /**
   * Search doctors
   * 
   * @param {Object} [filters] Search filters
   * @param {string} [filters.specialty] Doctor specialty
   * @param {string} [filters.city] City
   * @param {string} [filters.consultationType] online, offline, both
   * @param {number} [filters.minRating] Minimum rating
   * @param {string} [filters.language] Language
   * @param {string} [filters.availableDate] Available date (YYYY-MM-DD)
   * @param {string} [filters.sortBy='rating'] Sort field
   * @param {string} [filters.order='desc'] Sort order
   * @param {number} [filters.limit=20] Results limit
   * @param {number} [filters.offset=0] Results offset
   * @returns {Promise<Object>} Doctors list with pagination
   */
  async searchDoctors(filters = {}) {
    const queryParams = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value);
      }
    });

    const queryString = queryParams.toString();
    const path = `/${this.tenantId}/doctors${queryString ? '?' + queryString : ''}`;
    
    return this.request('GET', path);
  }

  /**
   * Get doctor details
   * 
   * @param {string} doctorId Doctor identifier
   * @returns {Promise<Object>} Doctor details
   */
  async getDoctor(doctorId) {
    return this.request('GET', `/${this.tenantId}/doctors/${doctorId}`);
  }

  /**
   * Get doctor availability
   * 
   * @param {string} doctorId Doctor identifier
   * @param {Object} [params] Query parameters
   * @param {string} [params.startDate] Start date (YYYY-MM-DD)
   * @param {string} [params.endDate] End date (YYYY-MM-DD)
   * @returns {Promise<Object>} Doctor availability
   */
  async getDoctorAvailability(doctorId, params = {}) {
    const queryParams = new URLSearchParams(params);
    const queryString = queryParams.toString();
    const path = `/${this.tenantId}/doctors/${doctorId}/availability${queryString ? '?' + queryString : ''}`;
    
    return this.request('GET', path);
  }

  /**
   * Get available time slots
   * 
   * @param {string} doctorId Doctor identifier
   * @param {string} date Date (YYYY-MM-DD)
   * @param {string} [consultationType='online'] Consultation type
   * @returns {Promise<Object>} Available slots
   */
  async getDoctorSlots(doctorId, date, consultationType = 'online') {
    const queryParams = new URLSearchParams({ date, consultation_type: consultationType });
    return this.request('GET', `/${this.tenantId}/doctors/${doctorId}/slots?${queryParams}`);
  }

  // ==================== Appointments ====================

  /**
   * Create appointment
   * 
   * @param {Object} appointmentData Appointment data
   * @param {string} appointmentData.doctorId Doctor identifier
   * @param {string} appointmentData.userId User identifier
   * @param {string} appointmentData.appointmentDate Date (YYYY-MM-DD)
   * @param {string} appointmentData.appointmentTime Time (HH:MM)
   * @param {string} [appointmentData.consultationType='online'] Consultation type
   * @param {string} appointmentData.reason Consultation reason
   * @param {Array<string>} [appointmentData.symptoms] Symptoms list
   * @param {string} [appointmentData.paymentMethod='wallet'] Payment method
   * @returns {Promise<Object>} Created appointment
   */
  async createAppointment(appointmentData) {
    return this.request('POST', `/${this.tenantId}/appointments`, {
      doctor_id: appointmentData.doctorId,
      user_id: appointmentData.userId,
      appointment_date: appointmentData.appointmentDate,
      appointment_time: appointmentData.appointmentTime,
      consultation_type: appointmentData.consultationType || 'online',
      reason: appointmentData.reason,
      symptoms: appointmentData.symptoms,
      payment_method: appointmentData.paymentMethod || 'wallet'
    });
  }

  /**
   * List appointments
   * 
   * @param {Object} [filters] Search filters
   * @param {string} [filters.userId] User identifier
   * @param {string} [filters.doctorId] Doctor identifier
   * @param {string} [filters.status] Appointment status
   * @param {string} [filters.fromDate] From date (YYYY-MM-DD)
   * @param {string} [filters.toDate] To date (YYYY-MM-DD)
   * @param {number} [filters.limit=20] Results limit
   * @param {number} [filters.offset=0] Results offset
   * @returns {Promise<Object>} Appointments list
   */
  async listAppointments(filters = {}) {
    const queryParams = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value);
      }
    });

    const queryString = queryParams.toString();
    const path = `/${this.tenantId}/appointments${queryString ? '?' + queryString : ''}`;
    
    return this.request('GET', path);
  }

  /**
   * Get appointment details
   * 
   * @param {string} appointmentId Appointment identifier
   * @returns {Promise<Object>} Appointment details
   */
  async getAppointment(appointmentId) {
    return this.request('GET', `/${this.tenantId}/appointments/${appointmentId}`);
  }

  /**
   * Reschedule appointment
   * 
   * @param {string} appointmentId Appointment identifier
   * @param {string} newDate New date (YYYY-MM-DD)
   * @param {string} newTime New time (HH:MM)
   * @returns {Promise<Object>} Rescheduled appointment
   */
  async rescheduleAppointment(appointmentId, newDate, newTime) {
    return this.request('PUT', `/${this.tenantId}/appointments/${appointmentId}/reschedule`, {
      new_date: newDate,
      new_time: newTime
    });
  }

  /**
   * Cancel appointment
   * 
   * @param {string} appointmentId Appointment identifier
   * @param {string} [reason] Cancellation reason
   * @returns {Promise<Object>} Cancelled appointment
   */
  async cancelAppointment(appointmentId, reason) {
    return this.request('POST', `/${this.tenantId}/appointments/${appointmentId}/cancel`, {
      cancellation_reason: reason
    });
  }

  /**
   * Mark appointment as completed
   * 
   * @param {string} appointmentId Appointment identifier
   * @returns {Promise<Object>} Completed appointment
   */
  async completeAppointment(appointmentId) {
    return this.request('POST', `/${this.tenantId}/appointments/${appointmentId}/complete`);
  }

  // ==================== Video Consultation ====================

  /**
   * Generate video room token
   * 
   * @param {Object} params Token parameters
   * @param {string} params.appointmentId Appointment identifier
   * @param {string} params.participantType Participant type (patient, doctor)
   * @param {string} params.userId User identifier
   * @param {string} params.name Participant name
   * @returns {Promise<Object>} Video token and room details
   */
  async generateVideoToken({ appointmentId, participantType, userId, name }) {
    return this.request('POST', `/${this.tenantId}/video/token`, {
      appointment_id: appointmentId,
      participant_type: participantType,
      user_id: userId,
      name
    });
  }

  /**
   * Get video room status
   * 
   * @param {string} roomId Room identifier
   * @returns {Promise<Object>} Room status
   */
  async getVideoRoomStatus(roomId) {
    return this.request('GET', `/${this.tenantId}/video/room/${roomId}`);
  }

  /**
   * End video call
   * 
   * @param {string} roomId Room identifier
   * @param {number} durationMinutes Call duration in minutes
   * @param {string} [recordingUrl] Recording URL
   * @returns {Promise<Object>} End call confirmation
   */
  async endVideoCall(roomId, durationMinutes, recordingUrl) {
    return this.request('POST', `/${this.tenantId}/video/room/${roomId}/end`, {
      duration_minutes: durationMinutes,
      recording_url: recordingUrl
    });
  }
}

/**
 * Custom API error class
 */
class MediqzyAPIError extends Error {
  constructor(code, message, statusCode) {
    super(message);
    this.name = 'MediqzyAPIError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

// Export for Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MediqzyClient, MediqzyAPIError };
}

if (typeof window !== 'undefined') {
  window.MediqzyClient = MediqzyClient;
  window.MediqzyAPIError = MediqzyAPIError;
}
