import axios from '../integrations/axios.js';
import logger from '../config/logger.js';

/**
 * ICICI Lombard TPA Integration Service
 * Provides comprehensive health insurance and TPA services through ICICI Lombard ESB API
 * 
 * Features:
 * - JWT token-based authentication with auto-renewal
 * - Member enrollment and E-card generation
 * - Policy details and UHID reports
 * - Network hospital search
 * - Batch enrollment management
 * 
 * API Documentation: ICICI Lombard ESB Health API
 */
class ICICILombardTPA {
  constructor() {
    this.username = process.env.ICICI_TPA_USERNAME;
    this.password = process.env.ICICI_TPA_PASSWORD;
    this.partnerCode = process.env.ICICI_TPA_PARTNER_CODE;
    this.env = process.env.ICICI_TPA_ENV || 'production';
    
    // Environment-based URLs
    this.baseURL = this.env === 'production'
      ? 'https://ilesbapigee.insurancearticlez.com'
      : 'https://ilesbapigee.insurancearticlez.com'; // Same URL for UAT/PROD
    
    this.token = null;
    this.tokenExpiry = null;
  }

  /**
   * Generate JWT authentication token
   * Token is valid for a specific duration (usually 10 minutes)
   * @returns {Promise<string>} JWT token
   */
  async generateToken() {
    try {
      // Check if token is still valid
      if (this.token && this.tokenExpiry && new Date() < this.tokenExpiry) {
        return this.token;
      }

      const response = await axios.post(
        `${this.baseURL}/generate-jwt-token`,
        {
          username: this.username,
          password: this.password,
          partnerCode: this.partnerCode
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data && response.data.token) {
        this.token = response.data.token;
        // Set expiry to 9 minutes (safety margin for 10 min token)
        this.tokenExpiry = new Date(Date.now() + 9 * 60 * 1000);
        
        logger.info('ICICI Lombard TPA: Token generated successfully');
        return this.token;
      }

      throw new Error('Failed to generate JWT token');
    } catch (error) {
      logger.error('ICICI Lombard TPA: Token generation failed', error);
      throw error;
    }
  }

  /**
   * Execute API request with authentication
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request payload
   * @returns {Promise<Object>} API response
   */
  async executeAPI(method, endpoint, data = null) {
    try {
      const token = await this.generateToken();

      const config = {
        method: method,
        url: `${this.baseURL}${endpoint}`,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      };

      if (data) {
        config.data = data;
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
      logger.error(`ICICI Lombard TPA: ${endpoint} API failed`, error);
      throw error;
    }
  }

  /**
   * Get network hospitals list
   * @param {Object} params - Parameters
   * @param {string} params.state - State name (optional)
   * @param {string} params.city - City name (optional)
   * @param {string} params.pincode - Pincode (optional)
   * @param {string} params.hospitalName - Hospital name search (optional)
   * @returns {Promise<Object>} Network hospitals list
   */
  async getNetworkHospitals({ state, city, pincode, hospitalName } = {}) {
    try {
      const queryParams = new URLSearchParams({
        ...(state && { state: state }),
        ...(city && { city: city }),
        ...(pincode && { pincode: pincode }),
        ...(hospitalName && { hospitalName: hospitalName })
      });

      const endpoint = `/health/ilservices/health/v1/generic/hospitalnetworklist?${queryParams}`;
      const response = await this.executeAPI('GET', endpoint);
      
      logger.info('ICICI Lombard TPA: Network hospitals retrieved');
      return response;
    } catch (error) {
      logger.error('ICICI Lombard TPA: Failed to get network hospitals', error);
      throw error;
    }
  }

  /**
   * Get UHID and policy details
   * @param {Object} params - Parameters
   * @param {string} params.policyNumber - Policy number
   * @param {string} params.uhid - UHID number (optional)
   * @returns {Promise<Object>} Policy and UHID details
   */
  async getPolicyDetails({ policyNumber, uhid }) {
    try {
      const requestData = {
        policyNumber: policyNumber,
        ...(uhid && { uhid: uhid })
      };

      const response = await this.executeAPI(
        'POST',
        '/misc-generic/ilservices/misc/v2/genus/getuhidreport',
        requestData
      );
      
      logger.info('ICICI Lombard TPA: Policy details retrieved', { policyNumber });
      return response;
    } catch (error) {
      logger.error('ICICI Lombard TPA: Failed to get policy details', error);
      throw error;
    }
  }

  /**
   * Get E-card for member
   * @param {Object} params - Parameters
   * @param {string} params.policyNumber - Policy number
   * @param {string} params.uhid - UHID number
   * @param {string} params.memberId - Member ID (optional)
   * @returns {Promise<Object>} E-card data
   */
  async getECard({ policyNumber, uhid, memberId }) {
    try {
      const requestData = {
        policyNumber: policyNumber,
        uhid: uhid,
        ...(memberId && { memberId: memberId })
      };

      const response = await this.executeAPI(
        'POST',
        '/health/ilservices/health/v2/healthcard/fetch',
        requestData
      );
      
      logger.info('ICICI Lombard TPA: E-card retrieved', { policyNumber, uhid });
      return response;
    } catch (error) {
      logger.error('ICICI Lombard TPA: Failed to get E-card', error);
      throw error;
    }
  }

  /**
   * Fetch UHID for enrollment
   * @param {Object} params - Parameters
   * @param {string} params.policyNumber - Policy number
   * @param {Array} params.memberDetails - Array of member details
   * @returns {Promise<Object>} UHID details
   */
  async fetchUHID({ policyNumber, memberDetails }) {
    try {
      const requestData = {
        policyNumber: policyNumber,
        memberDetails: memberDetails
      };

      const response = await this.executeAPI(
        'POST',
        '/health/ilservices/health/v1/enrollment/fetchuhid',
        requestData
      );
      
      logger.info('ICICI Lombard TPA: UHID fetched', { policyNumber });
      return response;
    } catch (error) {
      logger.error('ICICI Lombard TPA: Failed to fetch UHID', error);
      throw error;
    }
  }

  /**
   * Create enrollment batch
   * @param {Object} params - Parameters
   * @param {string} params.policyNumber - Policy number
   * @param {Array} params.enrollmentData - Array of enrollment data
   * @returns {Promise<Object>} Batch creation response with batch ID
   */
  async createEnrollmentBatch({ policyNumber, enrollmentData }) {
    try {
      const requestData = {
        policyNumber: policyNumber,
        enrollmentData: enrollmentData
      };

      const response = await this.executeAPI(
        'POST',
        '/health/ilservices/health/v1/enrollment/batchcreation',
        requestData
      );
      
      logger.info('ICICI Lombard TPA: Enrollment batch created', { policyNumber });
      return response;
    } catch (error) {
      logger.error('ICICI Lombard TPA: Failed to create enrollment batch', error);
      throw error;
    }
  }

  /**
   * Get enrollment batch status
   * @param {Object} params - Parameters
   * @param {string} params.batchId - Batch ID
   * @returns {Promise<Object>} Batch status
   */
  async getEnrollmentBatchStatus({ batchId }) {
    try {
      const requestData = {
        batchId: batchId
      };

      const response = await this.executeAPI(
        'POST',
        '/health/ilservices/health/v1/enrollment/batchstatus',
        requestData
      );
      
      logger.info('ICICI Lombard TPA: Batch status retrieved', { batchId });
      return response;
    } catch (error) {
      logger.error('ICICI Lombard TPA: Failed to get batch status', error);
      throw error;
    }
  }

  /**
   * Get enrollment batch details
   * @param {Object} params - Parameters
   * @param {string} params.batchId - Batch ID
   * @returns {Promise<Object>} Batch details
   */
  async getEnrollmentBatchDetails({ batchId }) {
    try {
      const requestData = {
        batchId: batchId
      };

      const response = await this.executeAPI(
        'POST',
        '/health/ilservices/health/v1/enrollment/batchdetails',
        requestData
      );
      
      logger.info('ICICI Lombard TPA: Batch details retrieved', { batchId });
      return response;
    } catch (error) {
      logger.error('ICICI Lombard TPA: Failed to get batch details', error);
      throw error;
    }
  }

  /**
   * Get enrollment details (wrapper around getPolicyDetails)
   * @param {Object} params - Parameters
   * @param {string} params.policyNumber - Policy number
   * @param {string} params.uhid - UHID number (optional)
   * @returns {Promise<Object>} Enrollment details
   */
  async getEnrollmentDetails({ policyNumber, uhid }) {
    try {
      const response = await this.getPolicyDetails({ policyNumber, uhid });
      
      logger.info('ICICI Lombard TPA: Enrollment details retrieved', { policyNumber });
      return response;
    } catch (error) {
      logger.error('ICICI Lombard TPA: Failed to get enrollment details', error);
      throw error;
    }
  }

  /**
   * Get network hospital count
   * @param {Object} params - Parameters (same as getNetworkHospitals)
   * @returns {Promise<number>} Count of network hospitals
   */
  async getNetworkHospitalCount(params = {}) {
    try {
      const response = await this.getNetworkHospitals(params);
      const count = response?.hospitals?.length || response?.data?.length || 0;
      
      logger.info('ICICI Lombard TPA: Network hospital count retrieved', { count });
      return count;
    } catch (error) {
      logger.error('ICICI Lombard TPA: Failed to get network hospital count', error);
      throw error;
    }
  }

  /**
   * Health check
   * @returns {Promise<Object>} Service health status
   */
  async healthCheck() {
    try {
      const token = await this.generateToken();
      return {
        status: 'healthy',
        provider: 'ICICI Lombard',
        tokenValid: !!token,
        environment: this.env
      };
    } catch (error) {
      logger.error('ICICI Lombard TPA: Health check failed', error);
      return {
        status: 'unhealthy',
        provider: 'ICICI Lombard',
        error: error.message,
        environment: this.env
      };
    }
  }
}

// Export singleton instance
export default new ICICILombardTPA();
