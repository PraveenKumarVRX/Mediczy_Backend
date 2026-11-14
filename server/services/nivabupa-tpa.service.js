// Niva Bupa TPA Service
// Complete integration with all TPA capabilities

import axios from '../integrations/axios.js';
import logger from '../config/logger.js';

class NivaBupaTPA {
  constructor() {
    this.baseURL = process.env.NIVABUPA_TPA_ENV === 'production'
      ? 'https://partner-api.nivabupa.com'
      : 'https://uat-partner-api.nivabupa.com';
    
    this.credentials = {
      username: process.env.NIVABUPA_TPA_USERNAME || '',
      password: process.env.NIVABUPA_TPA_PASSWORD || '',
      partnerId: process.env.NIVABUPA_TPA_PARTNER_ID || '',
      apiKey: process.env.NIVABUPA_TPA_API_KEY || ''
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

      logger.info('Generating Niva Bupa TPA token');
      
      const response = await axios.post(`${this.baseURL}/api/v2/authenticate`, {
        username: this.credentials.username,
        password: this.credentials.password,
        partner_id: this.credentials.partnerId
      }, {
        headers: {
          'X-API-Key': this.credentials.apiKey
        }
      });

      this.token = response.data.token;
      // Token valid for 55 minutes
      this.tokenExpiry = Date.now() + (55 * 60 * 1000);
      
      logger.info('Niva Bupa TPA token generated successfully');
      return this.token;
    } catch (error) {
      logger.error('Error generating Niva Bupa TPA token:', error.response?.data || error.message);
      throw new Error(`Niva Bupa TPA authentication failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // Get enrollment details
  async getEnrollmentDetails(policyNumber) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.get(`${this.baseURL}/api/v2/enrollment/${policyNumber}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey,
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching Niva Bupa enrollment details:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get member details
  async getMemberDetails(memberId) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.get(`${this.baseURL}/api/v2/members/${memberId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey,
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching Niva Bupa member details:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get claims list
  async getClaimsList(params) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.post(`${this.baseURL}/api/v2/claims/list`, params, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey,
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching Niva Bupa claims list:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get claim status
  async getClaimStatus(claimNumber) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.get(`${this.baseURL}/api/v2/claims/${claimNumber}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey,
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching Niva Bupa claim status:', error.response?.data || error.message);
      throw error;
    }
  }

  // Submit claim intimation
  async submitClaimIntimation(claimData) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.post(`${this.baseURL}/api/v2/claims/intimate`, claimData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey,
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error submitting Niva Bupa claim intimation:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get E-Card
  async getECard(policyNumber, memberId) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.post(`${this.baseURL}/api/v2/ecard/generate`, {
        policy_number: policyNumber,
        member_id: memberId
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey,
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching Niva Bupa E-Card:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get network hospitals
  async getNetworkHospitals(searchParams) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.post(`${this.baseURL}/api/v2/network/search`, searchParams, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey,
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching Niva Bupa network hospitals:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get policy details
  async getPolicyDetails(policyNumber) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.get(`${this.baseURL}/api/v2/policy/${policyNumber}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey,
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching Niva Bupa policy details:', error.response?.data || error.message);
      throw error;
    }
  }

  // Submit pre-authorization
  async submitPreAuth(preAuthData) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.post(`${this.baseURL}/api/v2/preauth/submit`, preAuthData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey,
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error submitting Niva Bupa pre-auth:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get pre-auth status
  async getPreAuthStatus(preAuthNumber) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.get(`${this.baseURL}/api/v2/preauth/${preAuthNumber}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey,
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching Niva Bupa pre-auth status:', error.response?.data || error.message);
      throw error;
    }
  }

  // Upload document
  async uploadDocument(documentData) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.post(`${this.baseURL}/api/v2/documents/upload`, documentData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey,
          'X-Partner-Id': this.credentials.partnerId,
          'Content-Type': 'multipart/form-data'
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error uploading Niva Bupa document:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get sum insured
  async getSumInsured(policyNumber, memberId) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.post(`${this.baseURL}/api/v2/policy/sum-insured`, {
        policy_number: policyNumber,
        member_id: memberId
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey,
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching Niva Bupa sum insured:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get coverage details
  async getCoverageDetails(policyNumber) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.get(`${this.baseURL}/api/v2/policy/${policyNumber}/coverage`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.credentials.apiKey,
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching Niva Bupa coverage details:', error.response?.data || error.message);
      throw error;
    }
  }
}

export default new NivaBupaTPA();
