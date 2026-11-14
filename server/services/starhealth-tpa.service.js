import axios from '../integrations/axios.js';
import logger from '../config/logger.js';

/**
 * Star Health TPA Integration Service
 * Provides comprehensive health insurance and TPA services through Star Health API
 * 
 * Features:
 * - Token-based authentication with validation
 * - Client and broker information retrieval
 * - Employee enrollment data
 * - E-card generation (by Employee ID or Health Card ID)
 * - Network hospital search by pincode
 * 
 * API Documentation: Star Health Broker & Utility Services API
 */
class StarHealthTPA {
  constructor() {
    this.username = process.env.STARHEALTH_TPA_USERNAME;
    this.password = process.env.STARHEALTH_TPA_PASSWORD;
    this.partnerId = process.env.STARHEALTH_TPA_PARTNER_ID;
    this.env = process.env.STARHEALTH_TPA_ENV || 'production';
    
    // Environment-based URLs
    this.baseURL = this.env === 'production'
      ? 'https://securegw.starhealth.in'
      : 'https://securegw-uat.starhealth.in';
    
    this.token = null;
    this.tokenExpiry = null;
  }

  /**
   * Generate authentication token
   * @returns {Promise<string>} Auth token
   */
  async generateToken() {
    try {
      // Check if token is still valid
      if (this.token && this.tokenExpiry && new Date() < this.tokenExpiry) {
        return this.token;
      }

      const response = await axios.post(
        `${this.baseURL}/api/authentication-service/v1/auth/token/generate`,
        {
          username: this.username,
          password: this.password,
          partnerId: this.partnerId
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data && response.data.token) {
        this.token = response.data.token;
        // Set expiry to 55 minutes (safety margin)
        this.tokenExpiry = new Date(Date.now() + 55 * 60 * 1000);
        
        logger.info('Star Health TPA: Token generated successfully');
        return this.token;
      }

      throw new Error('Failed to generate auth token');
    } catch (error) {
      logger.error('Star Health TPA: Token generation failed', error);
      throw error;
    }
  }

  /**
   * Validate current token
   * @returns {Promise<boolean>} Token validity
   */
  async validateToken() {
    try {
      const token = await this.generateToken();

      const response = await axios.get(
        `${this.baseURL}/api/authentication-service/v1/auth/token/validate`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      const isValid = response.data?.valid === true;
      logger.info('Star Health TPA: Token validation', { isValid });
      return isValid;
    } catch (error) {
      logger.error('Star Health TPA: Token validation failed', error);
      return false;
    }
  }

  /**
   * Execute API request with authentication
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint
   * @returns {Promise<Object>} API response
   */
  async executeAPI(method, endpoint) {
    try {
      const token = await this.generateToken();

      const response = await axios({
        method: method,
        url: `${this.baseURL}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      logger.error(`Star Health TPA: ${endpoint} API failed`, error);
      throw error;
    }
  }

  /**
   * Get broker/client details
   * @param {Object} params - Parameters
   * @param {string} params.brokerCode - Broker code
   * @returns {Promise<Object>} Broker client details
   */
  async getBrokerClientDetails({ brokerCode }) {
    try {
      const response = await this.executeAPI(
        'GET',
        `/api/broker-service/v1/client/brokercode/${brokerCode}`
      );
      
      logger.info('Star Health TPA: Broker client details retrieved', { brokerCode });
      return response;
    } catch (error) {
      logger.error('Star Health TPA: Failed to get broker client details', error);
      throw error;
    }
  }

  /**
   * Get enrollment data of employees
   * @param {Object} params - Parameters
   * @param {string} params.groupCode - Group code
   * @returns {Promise<Object>} Enrollment data
   */
  async getEnrollmentDetails({ groupCode }) {
    try {
      const response = await this.executeAPI(
        'GET',
        `/api/broker-service/v1/enroldata/groupcode/${groupCode}`
      );
      
      logger.info('Star Health TPA: Enrollment data retrieved', { groupCode });
      return response;
    } catch (error) {
      logger.error('Star Health TPA: Failed to get enrollment data', error);
      throw error;
    }
  }

  /**
   * Get E-card by employee ID
   * @param {Object} params - Parameters
   * @param {string} params.employeeId - Employee ID
   * @returns {Promise<Object>} E-card data
   */
  async getECardByEmployeeId({ employeeId }) {
    try {
      const response = await this.executeAPI(
        'GET',
        `/api/broker-service/v1/ecard/employeeid/${employeeId}`
      );
      
      logger.info('Star Health TPA: E-card retrieved by employee ID', { employeeId });
      return response;
    } catch (error) {
      logger.error('Star Health TPA: Failed to get E-card by employee ID', error);
      throw error;
    }
  }

  /**
   * Get E-card by health card ID
   * @param {Object} params - Parameters
   * @param {string} params.healthCardId - Health card ID
   * @returns {Promise<Object>} E-card data
   */
  async getECardByHealthCardId({ healthCardId }) {
    try {
      const response = await this.executeAPI(
        'GET',
        `/api/broker-service/v1/ecard/healthcardid/${healthCardId}`
      );
      
      logger.info('Star Health TPA: E-card retrieved by health card ID', { healthCardId });
      return response;
    } catch (error) {
      logger.error('Star Health TPA: Failed to get E-card by health card ID', error);
      throw error;
    }
  }

  /**
   * Get E-card (flexible method)
   * @param {Object} params - Parameters
   * @param {string} params.employeeId - Employee ID (optional)
   * @param {string} params.healthCardId - Health card ID (optional)
   * @returns {Promise<Object>} E-card data
   */
  async getECard({ employeeId, healthCardId }) {
    try {
      if (employeeId) {
        return await this.getECardByEmployeeId({ employeeId });
      } else if (healthCardId) {
        return await this.getECardByHealthCardId({ healthCardId });
      } else {
        throw new Error('Either employeeId or healthCardId is required');
      }
    } catch (error) {
      logger.error('Star Health TPA: Failed to get E-card', error);
      throw error;
    }
  }

  /**
   * Get network hospitals by pincode
   * @param {Object} params - Parameters
   * @param {string} params.pincode - Pincode
   * @returns {Promise<Object>} Network hospitals list
   */
  async getNetworkHospitals({ pincode }) {
    try {
      if (!pincode) {
        throw new Error('Pincode is required');
      }

      const response = await this.executeAPI(
        'GET',
        `/api/utility-service/v1/hospital/network/pincode/${pincode}/list`
      );
      
      logger.info('Star Health TPA: Network hospitals retrieved', { pincode });
      return response;
    } catch (error) {
      logger.error('Star Health TPA: Failed to get network hospitals', error);
      throw error;
    }
  }

  /**
   * Get network hospital count
   * @param {Object} params - Parameters
   * @param {string} params.pincode - Pincode
   * @returns {Promise<number>} Count of network hospitals
   */
  async getNetworkHospitalCount({ pincode }) {
    try {
      const response = await this.getNetworkHospitals({ pincode });
      const count = response?.hospitals?.length || response?.data?.length || 0;
      
      logger.info('Star Health TPA: Network hospital count retrieved', { count });
      return count;
    } catch (error) {
      logger.error('Star Health TPA: Failed to get network hospital count', error);
      throw error;
    }
  }

  /**
   * Get policy details (wrapper around getBrokerClientDetails)
   * @param {Object} params - Parameters
   * @param {string} params.brokerCode - Broker code
   * @returns {Promise<Object>} Policy details
   */
  async getPolicyDetails({ brokerCode }) {
    try {
      const response = await this.getBrokerClientDetails({ brokerCode });
      
      logger.info('Star Health TPA: Policy details retrieved', { brokerCode });
      return response;
    } catch (error) {
      logger.error('Star Health TPA: Failed to get policy details', error);
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
      const isValid = await this.validateToken();
      
      return {
        status: 'healthy',
        provider: 'Star Health',
        tokenValid: isValid,
        environment: this.env
      };
    } catch (error) {
      logger.error('Star Health TPA: Health check failed', error);
      return {
        status: 'unhealthy',
        provider: 'Star Health',
        error: error.message,
        environment: this.env
      };
    }
  }
}

// Export singleton instance
export default new StarHealthTPA();
