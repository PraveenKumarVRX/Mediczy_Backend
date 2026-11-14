/**
 * Care Health Insurance TPA Service
 * Provider: Religare/Care Health Insurance
 * Integration: W2W (Way2Wealth) API
 */

import axios from '../integrations/axios.js';

class CareHealthTPA {
  constructor() {
    this.baseURL = process.env.CARE_TPA_BASE_URL || 'https://rhiclapi.religarehealthinsurance.com';
    this.apiBaseURL = process.env.CARE_TPA_API_URL || 'https://api.religarehealthinsurance.com/relinterfacerestful/religare/secure/restful';
    this.partnerId = process.env.CARE_TPA_PARTNER_ID || '';
    this.partnerKey = process.env.CARE_TPA_PARTNER_KEY || '';
    this.token = null;
    this.tokenExpiry = null;
  }

  /**
   * Generate authentication token
   * @returns {Promise<string>} Authentication token
   */
  async generateToken() {
    try {
      // Check if token is still valid
      if (this.token && this.tokenExpiry && new Date() < this.tokenExpiry) {
        return this.token;
      }

      const response = await axios.post(`${this.apiBaseURL}/generatePartnerToken`, {
        partnerId: this.partnerId,
        partnerKey: this.partnerKey
      });

      if (response.data?.token) {
        this.token = response.data.token;
        // Token typically valid for 1 hour
        this.tokenExpiry = new Date(Date.now() + 3600000);
        return this.token;
      }

      throw new Error('Failed to generate token');
    } catch (error) {
      console.error('Care Health TPA - Token Generation Error:', error.message);
      throw error;
    }
  }

  /**
   * Get active enrollments/lives
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} Enrollment data
   */
  async getActiveEnrollments(params = {}) {
    try {
      const response = await axios.post(`${this.baseURL}/ActiveLives.php`, params, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return this.parseResponse(response.data);
    } catch (error) {
      console.error('Care Health TPA - Get Active Enrollments Error:', error.message);
      throw error;
    }
  }

  /**
   * Get health and OPD E-card
   * @param {Object} params - Member details
   * @returns {Promise<Object>} E-card URL/data
   */
  async getECard(params) {
    try {
      const response = await axios.post(`${this.baseURL}/getHealthAndOpdCard.php`, params, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return this.parseResponse(response.data);
    } catch (error) {
      console.error('Care Health TPA - Get E-Card Error:', error.message);
      throw error;
    }
  }

  /**
   * Get claim status
   * @param {Object} params - Claim query parameters
   * @returns {Promise<Object>} Claim status
   */
  async getClaimStatus(params) {
    try {
      const token = await this.generateToken();

      const response = await axios.post(`${this.apiBaseURL}/getClaimStatusGenie`, params, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      return this.parseResponse(response.data);
    } catch (error) {
      console.error('Care Health TPA - Get Claim Status Error:', error.message);
      throw error;
    }
  }

  /**
   * Get claim data/dump
   * @param {Object} params - Date range and filters
   * @returns {Promise<Object>} Claims data
   */
  async getClaimData(params) {
    try {
      const response = await axios.post(`${this.baseURL}/getClaimData.php`, params, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return this.parseResponse(response.data);
    } catch (error) {
      console.error('Care Health TPA - Get Claim Data Error:', error.message);
      throw error;
    }
  }

  /**
   * Get policy enquiry details
   * @param {Object} params - Policy details
   * @returns {Promise<Object>} Policy information
   */
  async getPolicyEnquiry(params) {
    try {
      const token = await this.generateToken();

      const response = await axios.post(`${this.apiBaseURL}/getPolicyEnquiry`, params, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      return this.parseResponse(response.data);
    } catch (error) {
      console.error('Care Health TPA - Get Policy Enquiry Error:', error.message);
      throw error;
    }
  }

  /**
   * Get state and city list for network hospitals
   * @returns {Promise<Object>} State/City data
   */
  async getStateCity() {
    try {
      const token = await this.generateToken();

      const response = await axios.get(`${this.apiBaseURL}/getStateCity`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      return this.parseResponse(response.data);
    } catch (error) {
      console.error('Care Health TPA - Get State/City Error:', error.message);
      throw error;
    }
  }

  /**
   * Get network hospitals
   * @param {Object} params - State, city, hospital name filters
   * @returns {Promise<Object>} Network hospitals list
   */
  async getNetworkHospitals(params) {
    try {
      const token = await this.generateToken();

      const response = await axios.post(`${this.apiBaseURL}/getNetwork`, params, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      return this.parseResponse(response.data);
    } catch (error) {
      console.error('Care Health TPA - Get Network Hospitals Error:', error.message);
      throw error;
    }
  }

  /**
   * Submit claim intimation
   * @param {Object} claimData - Claim details
   * @returns {Promise<Object>} Intimation response
   */
  async submitClaimIntimation(claimData) {
    try {
      const token = await this.generateToken();

      const response = await axios.post(`${this.apiBaseURL}/preIntimateClaimGenie`, claimData, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      return this.parseResponse(response.data);
    } catch (error) {
      console.error('Care Health TPA - Submit Claim Intimation Error:', error.message);
      throw error;
    }
  }

  /**
   * Upload document chunk
   * @param {Object} documentData - Document chunk data
   * @returns {Promise<Object>} Upload response
   */
  async uploadDocumentChunk(documentData) {
    try {
      const token = await this.generateToken();

      const response = await axios.post(`${this.apiBaseURL}/uploadChunk`, documentData, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      return this.parseResponse(response.data);
    } catch (error) {
      console.error('Care Health TPA - Upload Document Chunk Error:', error.message);
      throw error;
    }
  }

  /**
   * Attach document to claim
   * @param {Object} attachmentData - Document attachment data
   * @returns {Promise<Object>} Attachment response
   */
  async attachDocument(attachmentData) {
    try {
      const token = await this.generateToken();

      const response = await axios.post(`${this.apiBaseURL}/attachDocument`, attachmentData, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      return this.parseResponse(response.data);
    } catch (error) {
      console.error('Care Health TPA - Attach Document Error:', error.message);
      throw error;
    }
  }

  /**
   * Submit CD (Claim Discharge) statements
   * @param {Object} cdData - CD statement data
   * @returns {Promise<Object>} Submission response
   */
  async submitCDStatements(cdData) {
    try {
      const response = await axios.post(`${this.baseURL}/InsertCdStatements.php`, cdData, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return this.parseResponse(response.data);
    } catch (error) {
      console.error('Care Health TPA - Submit CD Statements Error:', error.message);
      throw error;
    }
  }

  /**
   * Parse Care Health TPA response
   * @param {Object} response - API response
   * @returns {Object} Parsed response
   */
  parseResponse(response) {
    if (!response) {
      return { success: false, message: 'Empty response' };
    }

    // Handle different response formats
    if (response.status === 'success' || response.success === true) {
      return {
        success: true,
        data: response.data || response.result || response,
        message: response.message || 'Operation successful'
      };
    }

    if (response.status === 'error' || response.success === false) {
      return {
        success: false,
        message: response.message || response.error || 'Operation failed',
        errors: response.errors || []
      };
    }

    // If no explicit status, return as-is
    return {
      success: true,
      data: response
    };
  }
}

export default new CareHealthTPA();
