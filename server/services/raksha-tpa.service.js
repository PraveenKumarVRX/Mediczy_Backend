// Raksha TPA Service
// Complete integration with all TPA operations

import axios from 'axios';
import logger from '../config/logger.js';

class RakshaTPA {
  constructor() {
    this.baseURL = process.env.RAKSHA_TPA_ENV === 'production'
      ? 'https://partner-api.rakshatpa.com'
      : 'https://uat-partner-api.rakshatpa.com';
    
    this.credentials = {
      apiKey: process.env.RAKSHA_TPA_API_KEY || '',
      partnerId: process.env.RAKSHA_TPA_PARTNER_ID || '',
      secret: process.env.RAKSHA_TPA_SECRET || ''
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

      logger.info('Generating Raksha TPA token');
      
      const response = await axios.post(`${this.baseURL}/v1/oauth/token`, {
        grant_type: 'client_credentials',
        client_id: this.credentials.partnerId,
        client_secret: this.credentials.secret
      }, {
        headers: {
          'X-API-Key': this.credentials.apiKey
        }
      });

      this.token = response.data.access_token;
      // Token valid for 55 minutes
      this.tokenExpiry = Date.now() + (55 * 60 * 1000);
      
      logger.info('Raksha TPA token generated successfully');
      return this.token;
    } catch (error) {
      logger.error('Error generating Raksha TPA token:', error.response?.data || error.message);
      throw new Error(`Raksha TPA authentication failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // Get enrollment details
  async getEnrollmentDetails(policyNumber) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.get(`${this.baseURL}/v1/enrollment/${policyNumber}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching Raksha enrollment details:', error.response?.data || error.message);
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
      logger.error('Error fetching Raksha member details:', error.response?.data || error.message);
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
      logger.error('Error fetching Raksha claims list:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get claim status
  async getClaimStatus(claimNumber) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.get(`${this.baseURL}/v1/claims/${claimNumber}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching Raksha claim status:', error.response?.data || error.message);
      throw error;
    }
  }

  // Submit claim intimation
  async submitClaimIntimation(claimData) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.post(`${this.baseURL}/v1/claims/intimate`, claimData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error submitting Raksha claim intimation:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get E-Card
  async getECard(policyNumber, memberId) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.post(`${this.baseURL}/v1/ecard/generate`, {
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
      logger.error('Error fetching Raksha E-Card:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get network hospitals
  async getNetworkHospitals(searchParams) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.post(`${this.baseURL}/v1/network/hospitals`, searchParams, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching Raksha network hospitals:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get policy details
  async getPolicyDetails(policyNumber) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.get(`${this.baseURL}/v1/policy/${policyNumber}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching Raksha policy details:', error.response?.data || error.message);
      throw error;
    }
  }

  // Submit pre-authorization
  async submitPreAuth(preAuthData) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.post(`${this.baseURL}/v1/preauth/submit`, preAuthData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error submitting Raksha pre-auth:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get pre-auth status
  async getPreAuthStatus(preAuthNumber) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.get(`${this.baseURL}/v1/preauth/${preAuthNumber}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching Raksha pre-auth status:', error.response?.data || error.message);
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
      logger.error('Error uploading Raksha document:', error.response?.data || error.message);
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
      logger.error('Error fetching Raksha sum insured:', error.response?.data || error.message);
      throw error;
    }
  }
}

export default new RakshaTPA();
