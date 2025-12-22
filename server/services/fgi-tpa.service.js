/**
 * Future Generali India (FGI) TPA Service
 * Integration: MDBT (MyDataBuddy) API
 */

import axios from 'axios';

class FGITPA {
  constructor() {
    this.baseURL = process.env.FGI_TPA_BASE_URL || 'https://fgnle-apim.fggeneral.in';
    this.uatURL = process.env.FGI_TPA_UAT_URL || 'https://uat-internal-apim.futuregenerali.in:9443';
    this.apiKey = process.env.FGI_TPA_API_KEY || '';
    this.clientId = process.env.FGI_TPA_CLIENT_ID || '';
    this.clientSecret = process.env.FGI_TPA_CLIENT_SECRET || '';
    this.environment = process.env.NODE_ENV || 'production';
  }

  /**
   * Get base URL based on environment
   */
  getBaseURL() {
    return this.environment === 'production' ? this.baseURL : this.uatURL;
  }

  /**
   * Get enrollment details
   * @param {Object} params - Member details
   * @returns {Promise<Object>} Enrollment data
   */
  async getEnrollmentDetails(params) {
    try {
      const response = await axios.post(`${this.getBaseURL()}/enrollment/details`, params, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'client-id': this.clientId
        }
      });

      return this.parseResponse(response.data);
    } catch (error) {
      console.error('FGI TPA - Get Enrollment Details Error:', error.message);
      throw error;
    }
  }

  /**
   * Get policy details
   * @param {Object} params - Policy query parameters
   * @returns {Promise<Object>} Policy information
   */
  async getPolicyDetails(params) {
    try {
      const response = await axios.post(`${this.getBaseURL()}/policy/details`, params, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'client-id': this.clientId
        }
      });

      return this.parseResponse(response.data);
    } catch (error) {
      console.error('FGI TPA - Get Policy Details Error:', error.message);
      throw error;
    }
  }

  /**
   * Get member E-card
   * @param {Object} params - Member details
   * @returns {Promise<Object>} E-card data/URL
   */
  async getECard(params) {
    try {
      const response = await axios.post(`${this.getBaseURL()}/member/ecard`, params, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'client-id': this.clientId
        }
      });

      return this.parseResponse(response.data);
    } catch (error) {
      console.error('FGI TPA - Get E-Card Error:', error.message);
      throw error;
    }
  }

  /**
   * Get claims list
   * @param {Object} params - Claim query parameters
   * @returns {Promise<Object>} Claims data
   */
  async getClaimsList(params) {
    try {
      const response = await axios.post(`${this.getBaseURL()}/claims/list`, params, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'client-id': this.clientId
        }
      });

      return this.parseResponse(response.data);
    } catch (error) {
      console.error('FGI TPA - Get Claims List Error:', error.message);
      throw error;
    }
  }

  /**
   * Submit claim intimation
   * @param {Object} claimData - Claim intimation details
   * @returns {Promise<Object>} Intimation response
   */
  async submitClaimIntimation(claimData) {
    try {
      const response = await axios.post(`${this.getBaseURL()}/claims/intimation`, claimData, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'client-id': this.clientId
        }
      });

      return this.parseResponse(response.data);
    } catch (error) {
      console.error('FGI TPA - Submit Claim Intimation Error:', error.message);
      throw error;
    }
  }

  /**
   * Get claim status
   * @param {Object} params - Claim reference details
   * @returns {Promise<Object>} Claim status
   */
  async getClaimStatus(params) {
    try {
      const response = await axios.post(`${this.getBaseURL()}/claims/status`, params, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'client-id': this.clientId
        }
      });

      return this.parseResponse(response.data);
    } catch (error) {
      console.error('FGI TPA - Get Claim Status Error:', error.message);
      throw error;
    }
  }

  /**
   * Get network hospitals
   * @param {Object} params - Location and specialty filters
   * @returns {Promise<Object>} Network hospitals list
   */
  async getNetworkHospitals(params) {
    try {
      const response = await axios.post(`${this.getBaseURL()}/network/hospitals`, params, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'client-id': this.clientId
        }
      });

      return this.parseResponse(response.data);
    } catch (error) {
      console.error('FGI TPA - Get Network Hospitals Error:', error.message);
      throw error;
    }
  }

  /**
   * Get pre-authorization details
   * @param {Object} params - Pre-auth query parameters
   * @returns {Promise<Object>} Pre-auth data
   */
  async getPreAuthDetails(params) {
    try {
      const response = await axios.post(`${this.getBaseURL()}/preauth/details`, params, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'client-id': this.clientId
        }
      });

      return this.parseResponse(response.data);
    } catch (error) {
      console.error('FGI TPA - Get Pre-Auth Details Error:', error.message);
      throw error;
    }
  }

  /**
   * Submit pre-authorization request
   * @param {Object} preAuthData - Pre-auth request details
   * @returns {Promise<Object>} Pre-auth response
   */
  async submitPreAuth(preAuthData) {
    try {
      const response = await axios.post(`${this.getBaseURL()}/preauth/submit`, preAuthData, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'client-id': this.clientId
        }
      });

      return this.parseResponse(response.data);
    } catch (error) {
      console.error('FGI TPA - Submit Pre-Auth Error:', error.message);
      throw error;
    }
  }

  /**
   * Upload document
   * @param {Object} documentData - Document data with base64 content
   * @returns {Promise<Object>} Upload response
   */
  async uploadDocument(documentData) {
    try {
      const response = await axios.post(`${this.getBaseURL()}/documents/upload`, documentData, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'client-id': this.clientId
        }
      });

      return this.parseResponse(response.data);
    } catch (error) {
      console.error('FGI TPA - Upload Document Error:', error.message);
      throw error;
    }
  }

  /**
   * Get document list
   * @param {Object} params - Document query parameters
   * @returns {Promise<Object>} Documents list
   */
  async getDocuments(params) {
    try {
      const response = await axios.post(`${this.getBaseURL()}/documents/list`, params, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'client-id': this.clientId
        }
      });

      return this.parseResponse(response.data);
    } catch (error) {
      console.error('FGI TPA - Get Documents Error:', error.message);
      throw error;
    }
  }

  /**
   * Parse FGI TPA response
   * @param {Object} response - API response
   * @returns {Object} Parsed response
   */
  parseResponse(response) {
    if (!response) {
      return { success: false, message: 'Empty response' };
    }

    // FGI typically uses status code and message
    if (response.statusCode === '0' || response.status === 'SUCCESS') {
      return {
        success: true,
        data: response.data || response.response || response,
        message: response.message || 'Operation successful'
      };
    }

    if (response.statusCode !== '0' || response.status === 'FAILURE') {
      return {
        success: false,
        message: response.message || response.errorMessage || 'Operation failed',
        errorCode: response.statusCode || response.errorCode
      };
    }

    return {
      success: true,
      data: response
    };
  }
}

export default new FGITPA();
