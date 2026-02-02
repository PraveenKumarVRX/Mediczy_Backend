/**
 * Insurance Provider Integration Service
 * Integrates with various insurance providers (TPAs) for eligibility checks
 */

import axios from 'axios';

class InsuranceProviderService {
  constructor() {
    // Provider API configurations (should be in env variables)
    this.providers = {
      'Star Health': {
        baseUrl: process.env.STAR_HEALTH_API_URL || 'https://api.starhealthinsurance.com',
        apiKey: process.env.STAR_HEALTH_API_KEY,
        timeout: 30000
      },
      'HDFC ERGO': {
        baseUrl: process.env.HDFC_ERGO_API_URL || 'https://api.hdfcergo.com',
        apiKey: process.env.HDFC_ERGO_API_KEY,
        timeout: 30000
      },
      'ICICI Lombard': {
        baseUrl: process.env.ICICI_LOMBARD_API_URL || 'https://api.icicilombard.com',
        apiKey: process.env.ICICI_LOMBARD_API_KEY,
        timeout: 30000
      },
      'Bajaj Allianz': {
        baseUrl: process.env.BAJAJ_ALLIANZ_API_URL || 'https://api.bajajallianz.com',
        apiKey: process.env.BAJAJ_ALLIANZ_API_KEY,
        timeout: 30000
      }
    };
  }

  /**
   * Check patient eligibility with insurance provider
   * @param {string} policyNumber - Policy number
   * @param {string} provider - Insurance provider name
   * @param {Object} patientDetails - Patient details
   * @returns {Promise<Object>} - Eligibility response
   */
  async checkEligibility(policyNumber, provider, patientDetails = {}) {
    try {
      const providerConfig = this.providers[provider];

      if (!providerConfig) {
        // Return mock data if provider not configured
        return this.getMockEligibility(policyNumber, provider);
      }

      // Real API call (when credentials are configured)
      if (!providerConfig.apiKey) {
        console.warn(`API key not configured for ${provider}, returning mock data`);
        return this.getMockEligibility(policyNumber, provider);
      }

      const response = await axios.post(
        `${providerConfig.baseUrl}/v1/eligibility/check`,
        {
          policyNumber,
          patientName: `${patientDetails.firstName || ''} ${patientDetails.lastName || ''}`.trim(),
          dob: patientDetails.dateOfBirth,
          hospitalId: patientDetails.hospitalId
        },
        {
          headers: {
            'Authorization': `Bearer ${providerConfig.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: providerConfig.timeout
        }
      );

      return this.formatEligibilityResponse(response.data, provider);

    } catch (error) {
      console.error(`Eligibility check failed for ${provider}:`, error.message);

      // Return mock data on error (for demo purposes)
      // In production, you might want to throw the error
      return this.getMockEligibility(policyNumber, provider, false);
    }
  }

  /**
   * Submit claim to insurance provider
   * @param {Object} claimData - Claim data
   * @returns {Promise<Object>} - Submission response
   */
  async submitClaim(claimData) {
    try {
      const providerConfig = this.providers[claimData.insuranceProvider];

      if (!providerConfig || !providerConfig.apiKey) {
        console.warn(`Provider ${claimData.insuranceProvider} not configured, simulating submission`);
        return {
          success: true,
          claimReferenceNumber: `REF${Date.now()}`,
          status: 'submitted',
          message: 'Claim submitted successfully (mock)',
          estimatedProcessingTime: '3-5 business days'
        };
      }

      const response = await axios.post(
        `${providerConfig.baseUrl}/v1/claims/submit`,
        {
          policyNumber: claimData.policyNumber,
          claimType: claimData.claimType,
          claimAmount: claimData.claimAmount,
          treatmentDetails: claimData.treatmentDetails,
          documents: claimData.documents
        },
        {
          headers: {
            'Authorization': `Bearer ${providerConfig.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: providerConfig.timeout
        }
      );

      return response.data;

    } catch (error) {
      console.error('Claim submission failed:', error.message);
      throw new Error(`Failed to submit claim to ${claimData.insuranceProvider}: ${error.message}`);
    }
  }

  /**
   * Check claim status with provider
   * @param {string} claimNumber - Claim number
   * @param {string} provider - Insurance provider
   * @returns {Promise<Object>} - Claim status
   */
  async getClaimStatus(claimNumber, provider) {
    try {
      const providerConfig = this.providers[provider];

      if (!providerConfig || !providerConfig.apiKey) {
        return {
          claimNumber,
          status: 'processing',
          lastUpdated: new Date().toISOString(),
          message: 'Mock status - configure API for real data'
        };
      }

      const response = await axios.get(
        `${providerConfig.baseUrl}/v1/claims/${claimNumber}/status`,
        {
          headers: {
            'Authorization': `Bearer ${providerConfig.apiKey}`
          },
          timeout: providerConfig.timeout
        }
      );

      return response.data;

    } catch (error) {
      console.error('Status check failed:', error.message);
      throw error;
    }
  }

  /**
   * Get mock eligibility data (for demo/fallback)
   */
  getMockEligibility(policyNumber, provider, isEligible = true) {
    return {
      eligible: isEligible,
      policyNumber,
      provider,
      policyStatus: isEligible ? 'Active' : 'Inactive',
      sumInsured: isEligible ? 500000 : 0,
      availableBalance: isEligible ? 450000 : 0,
      coverageDetails: isEligible ? {
        roomRent: 'Single AC Room',
        icuCoverage: true,
        ambulanceCoverage: true,
        preHospitalization: 30,
        postHospitalization: 60,
        maternityBenefit: true,
        copayment: 10
      } : null,
      policyExpiry: isEligible ? '2025-12-31' : null,
      message: isEligible ? 
        'Patient is eligible for cashless treatment' : 
        'Policy not found or expired. Please verify policy details.',
      dataSource: 'mock',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Format eligibility response from different providers
   */
  formatEligibilityResponse(data, provider) {
    // Normalize response format across different providers
    return {
      eligible: data.isEligible || data.eligible || false,
      policyNumber: data.policyNumber || data.policy_number,
      provider,
      policyStatus: data.status || data.policyStatus,
      sumInsured: data.sumInsured || data.sum_insured || 0,
      availableBalance: data.availableBalance || data.available_balance || 0,
      coverageDetails: data.coverage || data.coverageDetails,
      policyExpiry: data.expiryDate || data.policy_expiry,
      message: data.message,
      dataSource: 'api',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get list of supported insurance providers
   */
  getSupportedProviders() {
    return Object.keys(this.providers);
  }
}

export default new InsuranceProviderService();
