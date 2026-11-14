// Paramount TPA Service
// Complete integration with all endpoint coverage

import axios from '../integrations/axios.js';
import logger from '../config/logger.js';

class ParamountTPA {
  constructor() {
    this.baseURL = process.env.PARAMOUNT_TPA_ENV === 'production'
      ? 'https://api.paramounttpa.com'
      : 'https://uat-api.paramounttpa.com';
    
    this.credentials = {
      username: process.env.PARAMOUNT_TPA_USERNAME || '',
      password: process.env.PARAMOUNT_TPA_PASSWORD || '',
      clientId: process.env.PARAMOUNT_TPA_CLIENT_ID || '',
      partnerId: process.env.PARAMOUNT_TPA_PARTNER_ID || ''
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

      logger.info('Generating Paramount TPA token');
      
      const response = await axios.post(`${this.baseURL}/api/auth/login`, {
        username: this.credentials.username,
        password: this.credentials.password,
        client_id: this.credentials.clientId
      });

      this.token = response.data.access_token;
      // Token valid for 50 minutes
      this.tokenExpiry = Date.now() + (50 * 60 * 1000);
      
      logger.info('Paramount TPA token generated successfully');
      return this.token;
    } catch (error) {
      logger.error('Error generating Paramount TPA token:', error.response?.data || error.message);
      throw new Error(`Paramount TPA authentication failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // Get enrollment details
  async getEnrollmentDetails(policyNumber) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.get(`${this.baseURL}/api/v1/enrollment/policy/${policyNumber}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching Paramount enrollment details:', error.response?.data || error.message);
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
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching Paramount member details:', error.response?.data || error.message);
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
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching Paramount claims list:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get claim status
  async getClaimStatus(claimNumber) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.get(`${this.baseURL}/api/v1/claims/${claimNumber}/status`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching Paramount claim status:', error.response?.data || error.message);
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
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error submitting Paramount claim intimation:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get E-Card
  async getECard(policyNumber, memberId) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.post(`${this.baseURL}/api/v1/ecard/request`, {
        policyNumber,
        memberId
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching Paramount E-Card:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get network hospitals
  async getNetworkHospitals(searchParams) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.post(`${this.baseURL}/api/v1/network/hospitals`, searchParams, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching Paramount network hospitals:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get policy details
  async getPolicyDetails(policyNumber) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.get(`${this.baseURL}/api/v1/policy/${policyNumber}/details`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching Paramount policy details:', error.response?.data || error.message);
      throw error;
    }
  }

  // Submit pre-authorization
  async submitPreAuth(preAuthData) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.post(`${this.baseURL}/api/v1/preauth/initiate`, preAuthData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error submitting Paramount pre-auth:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get pre-auth status
  async getPreAuthStatus(preAuthNumber) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.get(`${this.baseURL}/api/v1/preauth/${preAuthNumber}/status`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching Paramount pre-auth status:', error.response?.data || error.message);
      throw error;
    }
  }

  // Upload document
  async uploadDocument(documentData) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.post(`${this.baseURL}/api/v1/documents/upload`, documentData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Partner-Id': this.credentials.partnerId,
          'Content-Type': 'multipart/form-data'
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error uploading Paramount document:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get sum insured
  async getSumInsured(policyNumber, memberId) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.post(`${this.baseURL}/api/v1/policy/sum-insured`, {
        policyNumber,
        memberId
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching Paramount sum insured:', error.response?.data || error.message);
      throw error;
    }
  }
}

export default new ParamountTPA();
