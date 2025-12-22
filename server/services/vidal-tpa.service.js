// Vidal TPA Service
// Complete integration with comprehensive endpoint coverage

import axios from 'axios';
import logger from '../config/logger.js';

class VidalTPA {
  constructor() {
    this.baseURL = process.env.VIDAL_TPA_ENV === 'production'
      ? 'https://api.vidalhealthtpa.com'
      : 'https://sandbox-api.vidalhealthtpa.com';
    
    this.credentials = {
      apiKey: process.env.VIDAL_TPA_API_KEY || '',
      clientId: process.env.VIDAL_TPA_CLIENT_ID || '',
      secret: process.env.VIDAL_TPA_SECRET || ''
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

      logger.info('Generating Vidal TPA token');
      
      const response = await axios.post(`${this.baseURL}/api/v1/auth/token`, {
        client_id: this.credentials.clientId,
        client_secret: this.credentials.secret
      }, {
        headers: {
          'X-API-Key': this.credentials.apiKey
        }
      });

      this.token = response.data.access_token;
      // Token valid for 50 minutes
      this.tokenExpiry = Date.now() + (50 * 60 * 1000);
      
      logger.info('Vidal TPA token generated successfully');
      return this.token;
    } catch (error) {
      logger.error('Error generating Vidal TPA token:', error.response?.data || error.message);
      throw new Error(`Vidal TPA authentication failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // Get enrollment details
  async getEnrollmentDetails(policyNumber) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.get(`${this.baseURL}/api/v1/policies/${policyNumber}/enrollment`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching Vidal enrollment details:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get member details
  async getMemberDetails(memberId) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.get(`${this.baseURL}/api/v1/members/${memberId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching Vidal member details:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get claims list
  async getClaimsList(params) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.post(`${this.baseURL}/api/v1/claims/query`, params, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching Vidal claims list:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get claim status
  async getClaimStatus(claimNumber) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.get(`${this.baseURL}/api/v1/claims/${claimNumber}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching Vidal claim status:', error.response?.data || error.message);
      throw error;
    }
  }

  // Submit claim intimation
  async submitClaimIntimation(claimData) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.post(`${this.baseURL}/api/v1/claims/intimation`, claimData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error submitting Vidal claim intimation:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get E-Card
  async getECard(policyNumber, memberId) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.post(`${this.baseURL}/api/v1/ecard/fetch`, {
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
      logger.error('Error fetching Vidal E-Card:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get network hospitals
  async getNetworkHospitals(searchParams) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.post(`${this.baseURL}/api/v1/network/search`, searchParams, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching Vidal network hospitals:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get policy details
  async getPolicyDetails(policyNumber) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.get(`${this.baseURL}/api/v1/policies/${policyNumber}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching Vidal policy details:', error.response?.data || error.message);
      throw error;
    }
  }

  // Submit pre-authorization
  async submitPreAuth(preAuthData) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.post(`${this.baseURL}/api/v1/preauth/request`, preAuthData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error submitting Vidal pre-auth:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get pre-auth status
  async getPreAuthStatus(preAuthNumber) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.get(`${this.baseURL}/api/v1/preauth/${preAuthNumber}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching Vidal pre-auth status:', error.response?.data || error.message);
      throw error;
    }
  }

  // Upload document
  async uploadDocument(documentData) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.post(`${this.baseURL}/api/v1/documents`, documentData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey,
          'Content-Type': 'multipart/form-data'
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error uploading Vidal document:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get sum insured
  async getSumInsured(policyNumber, memberId) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.post(`${this.baseURL}/api/v1/policies/sum-insured`, {
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
      logger.error('Error fetching Vidal sum insured:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get benefits details
  async getBenefitsDetails(policyNumber) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.get(`${this.baseURL}/api/v1/policies/${policyNumber}/benefits`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching Vidal benefits details:', error.response?.data || error.message);
      throw error;
    }
  }
}

export default new VidalTPA();
