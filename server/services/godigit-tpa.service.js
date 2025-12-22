import axios from 'axios';
import logger from '../config/logger.js';

/**
 * GoDigit TPA Integration Service
 * Provides comprehensive health insurance and TPA services through GoDigit's OneAPI
 * 
 * Features:
 * - Token-based authentication with auto-renewal
 * - Member enrollment and E-card generation
 * - Claims management (dump, intimation, status)
 * - Network hospital search
 * - Document upload for claims
 * - Payment gateway integration
 * 
 * API Documentation: GoDigit OneAPI v1
 */
class GoDigitTPA {
  constructor() {
    this.clientId = process.env.GODIGIT_TPA_CLIENT_ID;
    this.clientSecret = process.env.GODIGIT_TPA_CLIENT_SECRET;
    this.partnerCode = process.env.GODIGIT_TPA_PARTNER_CODE;
    this.env = process.env.GODIGIT_TPA_ENV || 'production';
    
    // Environment-based URLs
    this.baseURL = this.env === 'production' 
      ? 'https://oneapi.godigit.com'
      : 'https://preprod-oneapi.godigit.com';
    
    this.paymentBaseURL = this.env === 'production'
      ? 'https://prod-digitpaymentgateway.godigit.com'
      : 'https://preprod-digitpaymentgateway.godigit.com';
    
    this.token = null;
    this.tokenExpiry = null;
  }

  /**
   * Generate authentication token
   * Token is valid for a specific duration (usually 1 hour)
   * @returns {Promise<string>} Auth token
   */
  async generateToken() {
    try {
      // Check if token is still valid
      if (this.token && this.tokenExpiry && new Date() < this.tokenExpiry) {
        return this.token;
      }

      const response = await axios.post(
        `${this.baseURL}/OneAPI/digit/generateAuthKey`,
        {
          clientId: this.clientId,
          clientSecret: this.clientSecret,
          partnerCode: this.partnerCode
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data && response.data.authToken) {
        this.token = response.data.authToken;
        // Set expiry to 55 minutes (safety margin)
        this.tokenExpiry = new Date(Date.now() + 55 * 60 * 1000);
        
        logger.info('GoDigit TPA: Token generated successfully');
        return this.token;
      }

      throw new Error('Failed to generate auth token');
    } catch (error) {
      logger.error('GoDigit TPA: Token generation failed', error);
      throw error;
    }
  }

  /**
   * Execute API request with authentication
   * @param {string} apiName - Name of the API endpoint
   * @param {Object} requestData - Request payload
   * @returns {Promise<Object>} API response
   */
  async executeAPI(apiName, requestData) {
    try {
      const token = await this.generateToken();

      const response = await axios.post(
        `${this.baseURL}/OneAPI/v1/executor`,
        {
          apiName: apiName,
          requestData: requestData
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );

      return response.data;
    } catch (error) {
      logger.error(`GoDigit TPA: ${apiName} API failed`, error);
      throw error;
    }
  }

  /**
   * Get member enrollment details
   * @param {Object} params - Parameters
   * @param {string} params.policyNumber - Policy number
   * @param {string} params.memberId - Member ID (optional)
   * @returns {Promise<Object>} Enrollment details
   */
  async getEnrollmentDetails({ policyNumber, memberId }) {
    try {
      const requestData = {
        policyNumber: policyNumber,
        ...(memberId && { memberId: memberId })
      };

      const response = await this.executeAPI('getMemberDetails', requestData);
      
      logger.info('GoDigit TPA: Enrollment details retrieved', { policyNumber });
      return response;
    } catch (error) {
      logger.error('GoDigit TPA: Failed to get enrollment details', error);
      throw error;
    }
  }

  /**
   * Get claims dump/list
   * @param {Object} params - Parameters
   * @param {string} params.policyNumber - Policy number
   * @param {string} params.fromDate - Start date (YYYY-MM-DD)
   * @param {string} params.toDate - End date (YYYY-MM-DD)
   * @returns {Promise<Object>} Claims list
   */
  async getClaimsList({ policyNumber, fromDate, toDate }) {
    try {
      const requestData = {
        policyNumber: policyNumber,
        fromDate: fromDate,
        toDate: toDate
      };

      const response = await this.executeAPI('getClaimsDump', requestData);
      
      logger.info('GoDigit TPA: Claims list retrieved', { policyNumber });
      return response;
    } catch (error) {
      logger.error('GoDigit TPA: Failed to get claims list', error);
      throw error;
    }
  }

  /**
   * Get individual E-card
   * @param {Object} params - Parameters
   * @param {string} params.policyNumber - Policy number
   * @param {string} params.memberId - Member ID
   * @returns {Promise<Object>} E-card data
   */
  async getECard({ policyNumber, memberId }) {
    try {
      const requestData = {
        policyNumber: policyNumber,
        memberId: memberId
      };

      const response = await this.executeAPI('getIndividualEcard', requestData);
      
      logger.info('GoDigit TPA: E-card retrieved', { policyNumber, memberId });
      return response;
    } catch (error) {
      logger.error('GoDigit TPA: Failed to get E-card', error);
      throw error;
    }
  }

  /**
   * Get network hospitals
   * @param {Object} params - Parameters
   * @param {string} params.city - City name (optional)
   * @param {string} params.state - State name (optional)
   * @param {string} params.hospitalName - Hospital name search (optional)
   * @param {string} params.pincode - Pincode (optional)
   * @returns {Promise<Object>} Network hospitals list
   */
  async getNetworkHospitals({ city, state, hospitalName, pincode } = {}) {
    try {
      const requestData = {
        ...(city && { city: city }),
        ...(state && { state: state }),
        ...(hospitalName && { hospitalName: hospitalName }),
        ...(pincode && { pincode: pincode })
      };

      const response = await this.executeAPI('getNetworkHospitals', requestData);
      
      logger.info('GoDigit TPA: Network hospitals retrieved');
      return response;
    } catch (error) {
      logger.error('GoDigit TPA: Failed to get network hospitals', error);
      throw error;
    }
  }

  /**
   * Get individual claim details
   * @param {Object} params - Parameters
   * @param {string} params.claimNumber - Claim number
   * @param {string} params.policyNumber - Policy number (optional)
   * @returns {Promise<Object>} Claim details
   */
  async getClaimStatus({ claimNumber, policyNumber }) {
    try {
      const requestData = {
        claimNumber: claimNumber,
        ...(policyNumber && { policyNumber: policyNumber })
      };

      const response = await this.executeAPI('getClaimDetails', requestData);
      
      logger.info('GoDigit TPA: Claim status retrieved', { claimNumber });
      return response;
    } catch (error) {
      logger.error('GoDigit TPA: Failed to get claim status', error);
      throw error;
    }
  }

  /**
   * Submit claim intimation (FNOL - First Notice of Loss)
   * @param {Object} claimData - Claim intimation data
   * @param {string} claimData.policyNumber - Policy number
   * @param {string} claimData.memberId - Member ID
   * @param {string} claimData.claimType - Type of claim (Cashless/Reimbursement)
   * @param {string} claimData.hospitalName - Hospital name
   * @param {string} claimData.dateOfAdmission - Admission date (YYYY-MM-DD)
   * @param {string} claimData.ailmentDetails - Details of ailment
   * @param {string} claimData.estimatedAmount - Estimated claim amount
   * @returns {Promise<Object>} Claim intimation response
   */
  async submitClaimIntimation(claimData) {
    try {
      const requestData = {
        policyNumber: claimData.policyNumber,
        memberId: claimData.memberId,
        claimType: claimData.claimType,
        hospitalName: claimData.hospitalName,
        dateOfAdmission: claimData.dateOfAdmission,
        ailmentDetails: claimData.ailmentDetails,
        estimatedAmount: claimData.estimatedAmount,
        ...(claimData.contactNumber && { contactNumber: claimData.contactNumber }),
        ...(claimData.emailId && { emailId: claimData.emailId })
      };

      const response = await this.executeAPI('claimIntimationFNOL', requestData);
      
      logger.info('GoDigit TPA: Claim intimation submitted', { 
        policyNumber: claimData.policyNumber 
      });
      return response;
    } catch (error) {
      logger.error('GoDigit TPA: Failed to submit claim intimation', error);
      throw error;
    }
  }

  /**
   * Upload claim document
   * @param {Object} params - Parameters
   * @param {string} params.claimNumber - Claim number
   * @param {string} params.documentType - Type of document
   * @param {string} params.documentBase64 - Base64 encoded document
   * @param {string} params.fileName - File name with extension
   * @returns {Promise<Object>} Upload response
   */
  async uploadDocument({ claimNumber, documentType, documentBase64, fileName }) {
    try {
      const requestData = {
        claimNumber: claimNumber,
        documentType: documentType,
        documentBase64: documentBase64,
        fileName: fileName
      };

      const response = await this.executeAPI('uploadClaimDocument', requestData);
      
      logger.info('GoDigit TPA: Document uploaded', { claimNumber, documentType });
      return response;
    } catch (error) {
      logger.error('GoDigit TPA: Failed to upload document', error);
      throw error;
    }
  }

  /**
   * Initiate payment through GoDigit payment gateway
   * @param {Object} params - Parameters
   * @param {string} params.customerId - Customer ID
   * @param {number} params.amount - Payment amount
   * @param {string} params.returnUrl - Return URL after payment
   * @param {string} params.purpose - Payment purpose
   * @returns {Promise<Object>} Payment gateway response with URL
   */
  async initiatePayment({ customerId, amount, returnUrl, purpose }) {
    try {
      const token = await this.generateToken();

      const response = await axios.post(
        `${this.paymentBaseURL}/DigitPaymentGateway/v1/customerFloat`,
        {
          customerId: customerId,
          amount: amount,
          returnUrl: returnUrl,
          purpose: purpose
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );

      logger.info('GoDigit TPA: Payment initiated', { customerId, amount });
      return response.data;
    } catch (error) {
      logger.error('GoDigit TPA: Failed to initiate payment', error);
      throw error;
    }
  }

  /**
   * Check payment status
   * @param {Object} params - Parameters
   * @param {string} params.transactionId - Transaction ID
   * @returns {Promise<Object>} Payment status
   */
  async getPaymentStatus({ transactionId }) {
    try {
      const token = await this.generateToken();

      const response = await axios.get(
        `${this.paymentBaseURL}/DigitPaymentGateway/v2/payments`,
        {
          params: { transactionId: transactionId },
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      logger.info('GoDigit TPA: Payment status retrieved', { transactionId });
      return response.data;
    } catch (error) {
      logger.error('GoDigit TPA: Failed to get payment status', error);
      throw error;
    }
  }

  /**
   * Get policy details
   * @param {Object} params - Parameters
   * @param {string} params.policyNumber - Policy number
   * @returns {Promise<Object>} Policy details
   */
  async getPolicyDetails({ policyNumber }) {
    try {
      const requestData = {
        policyNumber: policyNumber
      };

      const response = await this.executeAPI('getPolicyDetails', requestData);
      
      logger.info('GoDigit TPA: Policy details retrieved', { policyNumber });
      return response;
    } catch (error) {
      logger.error('GoDigit TPA: Failed to get policy details', error);
      throw error;
    }
  }

  /**
   * Get network hospital count
   * @param {Object} params - Parameters (same as getNetworkHospitals)
   * @returns {Promise<number>} Count of network hospitals
   */
  async getNetworkHospitalCount(params = {}) {
    try {
      const response = await this.getNetworkHospitals(params);
      const count = response?.hospitals?.length || 0;
      
      logger.info('GoDigit TPA: Network hospital count retrieved', { count });
      return count;
    } catch (error) {
      logger.error('GoDigit TPA: Failed to get network hospital count', error);
      throw error;
    }
  }
}

// Export singleton instance
export default new GoDigitTPA();
