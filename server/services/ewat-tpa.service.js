// EWAT TPA Service
// Employee Welfare Assistance Trust - Specialized TPA integration

import axios from 'axios';
import logger from '../config/logger.js';

class EWATTPA {
  constructor() {
    this.baseURL = process.env.EWAT_TPA_ENV === 'production'
      ? 'https://api.ewat.in'
      : 'https://sandbox-api.ewat.in';
    
    this.credentials = {
      apiKey: process.env.EWAT_TPA_API_KEY || '',
      partnerId: process.env.EWAT_TPA_PARTNER_ID || ''
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

      logger.info('Generating EWAT TPA token');
      
      const response = await axios.post(`${this.baseURL}/v1/auth/token`, {
        partner_id: this.credentials.partnerId
      }, {
        headers: {
          'X-API-Key': this.credentials.apiKey
        }
      });

      this.token = response.data.access_token;
      // Token valid for 50 minutes
      this.tokenExpiry = Date.now() + (50 * 60 * 1000);
      
      logger.info('EWAT TPA token generated successfully');
      return this.token;
    } catch (error) {
      logger.error('Error generating EWAT TPA token:', error.response?.data || error.message);
      throw new Error(`EWAT TPA authentication failed: ${error.response?.data?.message || error.message}`);
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
      logger.error('Error fetching EWAT enrollment details:', error.response?.data || error.message);
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
      logger.error('Error fetching EWAT claims list:', error.response?.data || error.message);
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
      logger.error('Error fetching EWAT claim status:', error.response?.data || error.message);
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
      logger.error('Error fetching EWAT E-Card:', error.response?.data || error.message);
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
      logger.error('Error fetching EWAT network hospitals:', error.response?.data || error.message);
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
      logger.error('Error fetching EWAT policy details:', error.response?.data || error.message);
      throw error;
    }
  }
}

export default new EWATTPA();
