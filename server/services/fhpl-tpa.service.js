// FHPL (Family Health Plan Limited) TPA Service
// Complete integration with all endpoints

import axios from '../integrations/axios.js';
import logger from '../config/logger.js';

class FHPLTPA {
  constructor() {
    this.baseURL = process.env.FHPL_TPA_ENV === 'production'
      ? 'https://api.fhpl.net'
      : 'https://uat-api.fhpl.net';
    
    this.credentials = {
      username: process.env.FHPL_TPA_USERNAME || '',
      password: process.env.FHPL_TPA_PASSWORD || '',
      clientId: process.env.FHPL_TPA_CLIENT_ID || '',
      partnerId: process.env.FHPL_TPA_PARTNER_ID || ''
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

      logger.info('Generating FHPL TPA token');
      
      const response = await axios.post(`${this.baseURL}/oauth/token`, {
        grant_type: 'password',
        username: this.credentials.username,
        password: this.credentials.password,
        client_id: this.credentials.clientId
      });

      this.token = response.data.access_token;
      // Token valid for 55 minutes (safety margin from 60 min)
      this.tokenExpiry = Date.now() + (55 * 60 * 1000);
      
      logger.info('FHPL TPA token generated successfully');
      return this.token;
    } catch (error) {
      logger.error('Error generating FHPL TPA token:', error.response?.data || error.message);
      throw new Error(`FHPL TPA authentication failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // Get enrollment details
  async getEnrollmentDetails(policyNumber) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.get(`${this.baseURL}/api/v1/enrollment/${policyNumber}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching FHPL enrollment details:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get employee enrollment details
  async getEmployeeDetails(employeeId) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.get(`${this.baseURL}/api/v1/enrollment/employee/${employeeId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching FHPL employee details:', error.response?.data || error.message);
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
          'Content-Type': 'application/json',
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching FHPL claims list:', error.response?.data || error.message);
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
          'Content-Type': 'application/json',
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching FHPL claim status:', error.response?.data || error.message);
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
          'Content-Type': 'application/json',
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error submitting FHPL claim intimation:', error.response?.data || error.message);
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
          'Content-Type': 'application/json',
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching FHPL E-Card:', error.response?.data || error.message);
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
          'Content-Type': 'application/json',
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching FHPL network hospitals:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get hospital count
  async getHospitalCount(params) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.post(`${this.baseURL}/api/v1/network/hospitals/count`, params, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching FHPL hospital count:', error.response?.data || error.message);
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
          'Content-Type': 'application/json',
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching FHPL policy details:', error.response?.data || error.message);
      throw error;
    }
  }

  // Submit pre-authorization request
  async submitPreAuth(preAuthData) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.post(`${this.baseURL}/api/v1/preauth/submit`, preAuthData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error submitting FHPL pre-auth:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get pre-authorization status
  async getPreAuthStatus(preAuthNumber) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.get(`${this.baseURL}/api/v1/preauth/${preAuthNumber}/status`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching FHPL pre-auth status:', error.response?.data || error.message);
      throw error;
    }
  }

  // Upload document
  async uploadDocument(documentData) {
    try {
      const token = await this.generateToken();
      
      const formData = new FormData();
      formData.append('claimNumber', documentData.claimNumber);
      formData.append('documentType', documentData.documentType);
      formData.append('file', documentData.file);

      const response = await axios.post(`${this.baseURL}/api/v1/documents/upload`, formData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error uploading FHPL document:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get member card details
  async getMemberCard(memberId) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.get(`${this.baseURL}/api/v1/member/${memberId}/card`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching FHPL member card:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get sum insured details
  async getSumInsured(policyNumber, memberId) {
    try {
      const token = await this.generateToken();
      
      const response = await axios.post(`${this.baseURL}/api/v1/policy/sum-insured`, {
        policyNumber,
        memberId
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Partner-Id': this.credentials.partnerId
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching FHPL sum insured:', error.response?.data || error.message);
      throw error;
    }
  }
}

export default new FHPLTPA();
