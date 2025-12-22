import axios from 'axios';
import logger from '../config/logger.js';

/**
 * MediAssist TPA Integration Service (powered by MediBuddy)
 * Provides comprehensive health insurance and TPA services through MediAssist/MediBuddy API
 * 
 * Features:
 * - Basic authentication
 * - Beneficiary enrollment details
 * - Claim management and tracking
 * - Network hospital search
 * - E-card generation for members
 * 
 * API Documentation: MediAssist ClaimAPIServiceV2
 */
class MediAssistTPA {
  constructor() {
    this.username = process.env.MEDIASSIST_TPA_USERNAME;
    this.password = process.env.MEDIASSIST_TPA_PASSWORD;
    this.clientId = process.env.MEDIASSIST_TPA_CLIENT_ID;
    this.env = process.env.MEDIASSIST_TPA_ENV || 'production';
    
    // Base URL
    this.baseURL = 'https://integration.medibuddy.in/ClaimAPIServiceV2/ClaimService';
  }

  /**
   * Execute API request with authentication
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request payload
   * @returns {Promise<Object>} API response
   */
  async executeAPI(endpoint, data) {
    try {
      const response = await axios.post(
        `${this.baseURL}/${endpoint}`,
        {
          clientId: this.clientId,
          username: this.username,
          password: this.password,
          ...data
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      logger.error(`MediAssist TPA: ${endpoint} API failed`, error);
      throw error;
    }
  }

  /**
   * Get beneficiary/enrollment details
   * @param {Object} params - Parameters
   * @param {string} params.policyNumber - Policy number
   * @param {string} params.memberId - Member ID (optional)
   * @param {string} params.employeeId - Employee ID (optional)
   * @returns {Promise<Object>} Enrollment details
   */
  async getEnrollmentDetails({ policyNumber, memberId, employeeId }) {
    try {
      const requestData = {
        policyNumber: policyNumber,
        ...(memberId && { memberId: memberId }),
        ...(employeeId && { employeeId: employeeId })
      };

      const response = await this.executeAPI('GetBenefDetails', requestData);
      
      logger.info('MediAssist TPA: Enrollment details retrieved', { policyNumber });
      return response;
    } catch (error) {
      logger.error('MediAssist TPA: Failed to get enrollment details', error);
      throw error;
    }
  }

  /**
   * Get claim details
   * @param {Object} params - Parameters
   * @param {string} params.policyNumber - Policy number
   * @param {string} params.claimNumber - Claim number (optional)
   * @param {string} params.fromDate - Start date (optional)
   * @param {string} params.toDate - End date (optional)
   * @returns {Promise<Object>} Claim details
   */
  async getClaimsList({ policyNumber, claimNumber, fromDate, toDate }) {
    try {
      const requestData = {
        policyNumber: policyNumber,
        ...(claimNumber && { claimNumber: claimNumber }),
        ...(fromDate && { fromDate: fromDate }),
        ...(toDate && { toDate: toDate })
      };

      const response = await this.executeAPI('ClaimDetail', requestData);
      
      logger.info('MediAssist TPA: Claim details retrieved', { policyNumber });
      return response;
    } catch (error) {
      logger.error('MediAssist TPA: Failed to get claim details', error);
      throw error;
    }
  }

  /**
   * Get individual claim details
   * @param {Object} params - Parameters
   * @param {string} params.claimNumber - Claim number
   * @param {string} params.policyNumber - Policy number (optional)
   * @returns {Promise<Object>} Claim status
   */
  async getClaimStatus({ claimNumber, policyNumber }) {
    try {
      const requestData = {
        claimNumber: claimNumber,
        ...(policyNumber && { policyNumber: policyNumber })
      };

      const response = await this.executeAPI('ClaimDetail', requestData);
      
      logger.info('MediAssist TPA: Claim status retrieved', { claimNumber });
      return response;
    } catch (error) {
      logger.error('MediAssist TPA: Failed to get claim status', error);
      throw error;
    }
  }

  /**
   * Get network hospitals
   * @param {Object} params - Parameters
   * @param {string} params.city - City name (optional)
   * @param {string} params.state - State name (optional)
   * @param {string} params.pincode - Pincode (optional)
   * @param {string} params.hospitalName - Hospital name search (optional)
   * @returns {Promise<Object>} Network hospitals list
   */
  async getNetworkHospitals({ city, state, pincode, hospitalName } = {}) {
    try {
      const requestData = {
        ...(city && { city: city }),
        ...(state && { state: state }),
        ...(pincode && { pincode: pincode }),
        ...(hospitalName && { hospitalName: hospitalName })
      };

      const response = await this.executeAPI('NetworkHospital', requestData);
      
      logger.info('MediAssist TPA: Network hospitals retrieved');
      return response;
    } catch (error) {
      logger.error('MediAssist TPA: Failed to get network hospitals', error);
      throw error;
    }
  }

  /**
   * Get member E-card
   * @param {Object} params - Parameters
   * @param {string} params.policyNumber - Policy number
   * @param {string} params.memberId - Member ID
   * @param {string} params.employeeId - Employee ID (optional)
   * @returns {Promise<Object>} E-card data
   */
  async getECard({ policyNumber, memberId, employeeId }) {
    try {
      const requestData = {
        policyNumber: policyNumber,
        memberId: memberId,
        ...(employeeId && { employeeId: employeeId })
      };

      const response = await this.executeAPI('MemberEcard/', requestData);
      
      logger.info('MediAssist TPA: E-card retrieved', { policyNumber, memberId });
      return response;
    } catch (error) {
      logger.error('MediAssist TPA: Failed to get E-card', error);
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
      
      logger.info('MediAssist TPA: Network hospital count retrieved', { count });
      return count;
    } catch (error) {
      logger.error('MediAssist TPA: Failed to get network hospital count', error);
      throw error;
    }
  }

  /**
   * Get policy details (wrapper around getEnrollmentDetails)
   * @param {Object} params - Parameters
   * @param {string} params.policyNumber - Policy number
   * @returns {Promise<Object>} Policy details
   */
  async getPolicyDetails({ policyNumber }) {
    try {
      const response = await this.getEnrollmentDetails({ policyNumber });
      
      logger.info('MediAssist TPA: Policy details retrieved', { policyNumber });
      return response;
    } catch (error) {
      logger.error('MediAssist TPA: Failed to get policy details', error);
      throw error;
    }
  }

  /**
   * Health check
   * @returns {Promise<Object>} Service health status
   */
  async healthCheck() {
    try {
      // Simple validation of credentials
      if (!this.username || !this.password || !this.clientId) {
        throw new Error('Missing credentials');
      }
      
      return {
        status: 'healthy',
        provider: 'MediAssist',
        credentialsConfigured: true,
        environment: this.env
      };
    } catch (error) {
      logger.error('MediAssist TPA: Health check failed', error);
      return {
        status: 'unhealthy',
        provider: 'MediAssist',
        error: error.message,
        environment: this.env
      };
    }
  }
}

// Export singleton instance
export default new MediAssistTPA();
