// Volo TPA Service
// Complete integration with all TPA endpoints

import axios from '../integrations/axios.js';
import logger from '../config/logger.js';

class VoloTPA {
  constructor() {
    this.baseURL = process.env.VOLO_TPA_ENV === 'production'
      ? 'https://partner.volotpa.in'
      : 'https://uat-partner.volotpa.in';
    
    this.credentials = {
      username: process.env.VOLO_TPA_USERNAME || '',
      password: process.env.VOLO_TPA_PASSWORD || '',
      partnerId: process.env.VOLO_TPA_PARTNER_ID || ''
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

      logger.info('Generating Volo TPA token');
      
      const response = await axios.post(`${this.baseURL}/api/v1/authenticate`, {
        username: this.credentials.username,
        password: this.credentials.password,
        partner_id: this.credentials.partnerId
      });

      this.token = response.data.token;
      // Token valid for 55 minutes
      this.tokenExpiry = Date.now() + (55 * 60 * 1000);
      
      logger.info('Volo TPA token generated successfully');
      return this.token;
    } catch (error) {
      logger.error('Error generating Volo TPA token:', error.response?.data || error.message);
      throw new Error(`Volo TPA authentication failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // Get enrollment details
  async getEnrollmentDetails(policyNumber) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.get(`${this.baseURL}/api/v1/enrollment/${policyNumber}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching Volo enrollment details:', error.response?.data || error.message);
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
      logger.error('Error fetching Volo member details:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get claims list
  async getClaimsList(params) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.post(`${this.baseURL}/api/v1/claims/list`, params, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching Volo claims list:', error.response?.data || error.message);
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
      logger.error('Error fetching Volo claim status:', error.response?.data || error.message);
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
      logger.error('Error submitting Volo claim intimation:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get E-Card
  async getECard(policyNumber, memberId) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.post(`${this.baseURL}/api/v1/ecard/generate`, {
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
      logger.error('Error fetching Volo E-Card:', error.response?.data || error.message);
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
      logger.error('Error fetching Volo network hospitals:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get policy details
  async getPolicyDetails(policyNumber) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.get(`${this.baseURL}/api/v1/policy/${policyNumber}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching Volo policy details:', error.response?.data || error.message);
      throw error;
    }
  }

  // Submit pre-authorization
  async submitPreAuth(preAuthData) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.post(`${this.baseURL}/api/v1/preauth/submit`, preAuthData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error submitting Volo pre-auth:', error.response?.data || error.message);
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
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching Volo pre-auth status:', error.response?.data || error.message);
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
      logger.error('Error uploading Volo document:', error.response?.data || error.message);
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
      logger.error('Error fetching Volo sum insured:', error.response?.data || error.message);
      throw error;
    }
  }
}

export default new VoloTPA();
