// MedSave TPA Service
// Comprehensive TPA integration with full endpoint coverage

import axios from 'axios';
import logger from '../config/logger.js';

class MedSaveTPA {
  constructor() {
    this.baseURL = process.env.MEDSAVE_TPA_ENV === 'production'
      ? 'https://api.medsave.in'
      : 'https://uat-api.medsave.in';
    
    this.credentials = {
      apiKey: process.env.MEDSAVE_TPA_API_KEY || '',
      clientId: process.env.MEDSAVE_TPA_CLIENT_ID || '',
      secret: process.env.MEDSAVE_TPA_SECRET || ''
    };

    this.token = null;
    this.tokenExpiry = null;
  }

  // Generate authentication token
  async generateToken() {
    try {
      if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
        return this.token;
      }

      logger.info('Generating MedSave TPA token');
      
      const response = await axios.post(`${this.baseURL}/v1/auth/token`, {
        client_id: this.credentials.clientId,
        client_secret: this.credentials.secret,
        grant_type: 'client_credentials'
      }, {
        headers: {
          'X-API-Key': this.credentials.apiKey
        }
      });

      this.token = response.data.access_token;
      // Token valid for 50 minutes (safety margin from 60 min)
      this.tokenExpiry = Date.now() + (50 * 60 * 1000);
      
      logger.info('MedSave TPA token generated successfully');
      return this.token;
    } catch (error) {
      logger.error('Error generating MedSave TPA token:', error.response?.data || error.message);
      throw new Error(`MedSave TPA authentication failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // Get enrollment details
  async getEnrollmentDetails(policyNumber) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.get(`${this.baseURL}/v1/enrollment/policy/${policyNumber}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching MedSave enrollment details:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get member details
  async getMemberDetails(memberId) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.get(`${this.baseURL}/v1/members/${memberId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching MedSave member details:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get claims list
  async getClaimsList(params) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.post(`${this.baseURL}/v1/claims/search`, params, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching MedSave claims list:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get claim status
  async getClaimStatus(claimNumber) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.get(`${this.baseURL}/v1/claims/${claimNumber}/status`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching MedSave claim status:', error.response?.data || error.message);
      throw error;
    }
  }

  // Submit claim intimation
  async submitClaimIntimation(claimData) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.post(`${this.baseURL}/v1/claims/intimation`, claimData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error submitting MedSave claim intimation:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get E-Card
  async getECard(policyNumber, memberId) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.post(`${this.baseURL}/v1/ecard`, {
        policy_number: policyNumber,
        member_id: memberId
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching MedSave E-Card:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get network hospitals
  async getNetworkHospitals(searchParams) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.post(`${this.baseURL}/v1/network/hospitals/search`, searchParams, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching MedSave network hospitals:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get policy details
  async getPolicyDetails(policyNumber) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.get(`${this.baseURL}/v1/policies/${policyNumber}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching MedSave policy details:', error.response?.data || error.message);
      throw error;
    }
  }

  // Submit pre-authorization
  async submitPreAuth(preAuthData) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.post(`${this.baseURL}/v1/preauth/request`, preAuthData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error submitting MedSave pre-auth:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get pre-auth status
  async getPreAuthStatus(preAuthNumber) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.get(`${this.baseURL}/v1/preauth/${preAuthNumber}/status`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching MedSave pre-auth status:', error.response?.data || error.message);
      throw error;
    }
  }

  // Upload document
  async uploadDocument(documentData) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.post(`${this.baseURL}/v1/documents/upload`, documentData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey,
          'Content-Type': 'multipart/form-data'
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error uploading MedSave document:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get sum insured
  async getSumInsured(policyNumber, memberId) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.post(`${this.baseURL}/v1/policy/sum-insured`, {
        policy_number: policyNumber,
        member_id: memberId
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching MedSave sum insured:', error.response?.data || error.message);
      throw error;
    }
  }
}

export default new MedSaveTPA();
