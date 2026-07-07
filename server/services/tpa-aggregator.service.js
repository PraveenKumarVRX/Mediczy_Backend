/**
 * TPA Aggregator Service
 * Unified interface for all TPA integrations
 * Provides a single API to interact with multiple TPA providers
 */

import heritageTPA from './heritage-tpa.service.js';
import mdIndiaTPA from './mdindia-tpa.service.js';
import healthIndiaTPA from './healthindia-tpa.service.js';
import careHealthTPA from './care-health-tpa.service.js';
import fgiTPA from './fgi-tpa.service.js';
import godigitTPA from './godigit-tpa.service.js';
import iciciTPA from './icici-tpa.service.js';
import mediassistTPA from './mediassist-tpa.service.js';
import starhealthTPA from './starhealth-tpa.service.js';
import fhplTPA from './fhpl-tpa.service.js';
import medsaveTPA from './medsave-tpa.service.js';
import nivabupaTPA from './nivabupa-tpa.service.js';
import paramountTPA from './paramount-tpa.service.js';
import rakshaTPA from './raksha-tpa.service.js';
import vidalTPA from './vidal-tpa.service.js';
import voloTPA from './volo-tpa.service.js';
import ewatTPA from './ewat-tpa.service.js';

class TPAAggregator {
  constructor() {
    this.providers = {
      heritage: heritageTPA,
      mdindia: mdIndiaTPA,
      healthindia: healthIndiaTPA,
      care: careHealthTPA,
      fgi: fgiTPA,
      godigit: godigitTPA,
      icici: iciciTPA,
      mediassist: mediassistTPA,
      starhealth: starhealthTPA,
      fhpl: fhplTPA,
      medsave: medsaveTPA,
      nivabupa: nivabupaTPA,
      paramount: paramountTPA,
      raksha: rakshaTPA,
      vidal: vidalTPA,
      volo: voloTPA,
      ewat: ewatTPA
    };

    this.providerMapping = {
      'Heritage': 'heritage',
      'MD India': 'mdindia',
      'Health India': 'healthindia',
      'Care Health': 'care',
      'Future Generali': 'fgi',
      'FGI': 'fgi',
      'Religare': 'care',
      'Care': 'care',
      'GoDigit': 'godigit',
      'Go Digit': 'godigit',
      'ICICI': 'icici',
      'ICICI Lombard': 'icici',
      'MediAssist': 'mediassist',
      'Medi Assist': 'mediassist',
      'Star Health': 'starhealth',
      'StarHealth': 'starhealth',
      'FHPL': 'fhpl',
      'Family Health Plan': 'fhpl',
      'MedSave': 'medsave',
      'Niva Bupa': 'nivabupa',
      'NivaBupa': 'nivabupa',
      'Paramount': 'paramount',
      'Paramount TPA': 'paramount',
      'Raksha': 'raksha',
      'Raksha TPA': 'raksha',
      'Vidal': 'vidal',
      'Vidal Health': 'vidal',
      'Volo': 'volo',
      'Volo TPA': 'volo',
      'EWAT': 'ewat',
      'Employee Welfare': 'ewat'
    };
  }

  /**
   * Get TPA provider instance
   * @param {string} providerName - TPA provider name
   * @returns {Object} TPA service instance
   */
  getProvider(providerName) {
    const normalizedName = this.providerMapping[providerName] || providerName.toLowerCase();
    const provider = this.providers[normalizedName];

    if (!provider) {
      throw new Error(`TPA provider '${providerName}' not implemented`);
    }

    return provider;
  }

  /**
   * Get enrollment/member details from any TPA
   * @param {string} tpaProvider - TPA provider name
   * @param {Object} params - Member query parameters
   * @returns {Promise<Object>} Member/enrollment data
   */
  async getEnrollmentDetails(tpaProvider, params) {
    try {
      const provider = this.getProvider(tpaProvider);
      
      if (provider.getEnrollmentDetails) {
        return await provider.getEnrollmentDetails(params);
      }

      throw new Error(`Enrollment details not supported for ${tpaProvider}`);
    } catch (error) {
      console.error(`TPA Aggregator - Get Enrollment Error (${tpaProvider}):`, error.message);
      throw error;
    }
  }

  /**
   * Get claims list from any TPA
   * @param {string} tpaProvider - TPA provider name
   * @param {Object} params - Claims query parameters
   * @returns {Promise<Object>} Claims data
   */
  async getClaimsList(tpaProvider, params) {
    try {
      const provider = this.getProvider(tpaProvider);
      
      if (provider.getClaimsList || provider.getClaims) {
        const method = provider.getClaimsList || provider.getClaims;
        return await method.call(provider, params);
      }

      throw new Error(`Claims list not supported for ${tpaProvider}`);
    } catch (error) {
      console.error(`TPA Aggregator - Get Claims Error (${tpaProvider}):`, error.message);
      throw error;
    }
  }

  /**
   * Submit claim intimation to any TPA
   * @param {string} tpaProvider - TPA provider name
   * @param {Object} claimData - Claim details
   * @returns {Promise<Object>} Intimation response
   */
  async submitClaimIntimation(tpaProvider, claimData) {
    try {
      const provider = this.getProvider(tpaProvider);
      
      if (provider.submitClaimIntimation || provider.claimIntimation) {
        const method = provider.submitClaimIntimation || provider.claimIntimation;
        return await method.call(provider, claimData);
      }

      throw new Error(`Claim intimation not supported for ${tpaProvider}`);
    } catch (error) {
      console.error(`TPA Aggregator - Submit Claim Intimation Error (${tpaProvider}):`, error.message);
      throw error;
    }
  }

  /**
   * Get member E-card from any TPA
   * @param {string} tpaProvider - TPA provider name
   * @param {Object} params - Member details
   * @returns {Promise<Object>} E-card URL/data
   */
  async getECard(tpaProvider, params) {
    try {
      const provider = this.getProvider(tpaProvider);
      
      if (provider.getECard || provider.getMemberECardURL) {
        const method = provider.getECard || provider.getMemberECardURL;
        return await method.call(provider, params);
      }

      throw new Error(`E-card not supported for ${tpaProvider}`);
    } catch (error) {
      console.error(`TPA Aggregator - Get E-Card Error (${tpaProvider}):`, error.message);
      throw error;
    }
  }

  /**
   * Get network hospitals from any TPA
   * @param {string} tpaProvider - TPA provider name
   * @param {Object} params - Location and specialty filters
   * @returns {Promise<Object>} Network hospitals list
   */
  async getNetworkHospitals(tpaProvider, params) {
    try {
      const provider = this.getProvider(tpaProvider);
      
      if (provider.getNetworkHospitals) {
        return await provider.getNetworkHospitals(params);
      }

      throw new Error(`Network hospitals not supported for ${tpaProvider}`);
    } catch (error) {
      console.error(`TPA Aggregator - Get Network Hospitals Error (${tpaProvider}):`, error.message);
      throw error;
    }
  }

  /**
   * Get network hospital count from any TPA
   * @param {string} tpaProvider - TPA provider name
   * @param {Object} params - Location filters
   * @returns {Promise<Object>} Hospital count
   */
  async getNetworkHospitalCount(tpaProvider, params) {
    try {
      const provider = this.getProvider(tpaProvider);
      
      if (provider.getNetworkHospitalCount) {
        return await provider.getNetworkHospitalCount(params);
      }

      // Fallback: get full list and count
      if (provider.getNetworkHospitals) {
        const result = await provider.getNetworkHospitals(params);
        const count = Array.isArray(result.data) ? result.data.length : 0;
        return { success: true, count, message: 'Count derived from hospital list' };
      }

      throw new Error(`Network hospital count not supported for ${tpaProvider}`);
    } catch (error) {
      console.error(`TPA Aggregator - Get Hospital Count Error (${tpaProvider}):`, error.message);
      throw error;
    }
  }

  /**
   * Get policy details from any TPA
   * @param {string} tpaProvider - TPA provider name
   * @param {Object} params - Policy query parameters
   * @returns {Promise<Object>} Policy information
   */
  async getPolicyDetails(tpaProvider, params) {
    try {
      const provider = this.getProvider(tpaProvider);
      
      if (provider.getPolicyDetails || provider.getPolicyEnquiry) {
        const method = provider.getPolicyDetails || provider.getPolicyEnquiry;
        return await method.call(provider, params);
      }

      throw new Error(`Policy details not supported for ${tpaProvider}`);
    } catch (error) {
      console.error(`TPA Aggregator - Get Policy Details Error (${tpaProvider}):`, error.message);
      throw error;
    }
  }

  /**
   * Get claim status from any TPA
   * @param {string} tpaProvider - TPA provider name
   * @param {Object} params - Claim reference details
   * @returns {Promise<Object>} Claim status
   */
  async getClaimStatus(tpaProvider, params) {
    try {
      const provider = this.getProvider(tpaProvider);
      
      if (provider.getClaimStatus) {
        return await provider.getClaimStatus(params);
      }

      throw new Error(`Claim status not supported for ${tpaProvider}`);
    } catch (error) {
      console.error(`TPA Aggregator - Get Claim Status Error (${tpaProvider}):`, error.message);
      throw error;
    }
  }

  /**
   * Upload document to any TPA
   * @param {string} tpaProvider - TPA provider name
   * @param {Object} documentData - Document data
   * @returns {Promise<Object>} Upload response
   */
  async uploadDocument(tpaProvider, documentData) {
    try {
      const provider = this.getProvider(tpaProvider);
      
      if (provider.uploadDocument || provider.uploadDocumentChunk) {
        const method = provider.uploadDocument || provider.uploadDocumentChunk;
        return await method.call(provider, documentData);
      }

      throw new Error(`Document upload not supported for ${tpaProvider}`);
    } catch (error) {
      console.error(`TPA Aggregator - Upload Document Error (${tpaProvider}):`, error.message);
      throw error;
    }
  }

  /**
   * Get pre-authorization details from any TPA
   * @param {string} tpaProvider - TPA provider name
   * @param {Object} params - Pre-auth query parameters
   * @returns {Promise<Object>} Pre-auth data
   */
  async getPreAuthDetails(tpaProvider, params) {
    try {
      const provider = this.getProvider(tpaProvider);
      
      if (provider.getPreAuthDetails || provider.getPreAuthStatus) {
        const method = provider.getPreAuthDetails || provider.getPreAuthStatus;
        return await method.call(provider, params);
      }

      throw new Error(`Pre-authorization not supported for ${tpaProvider}`);
    } catch (error) {
      console.error(`TPA Aggregator - Get Pre-Auth Error (${tpaProvider}):`, error.message);
      throw error;
    }
  }

  /**
   * Get list of all available TPA providers
   * @returns {Array} List of provider objects
   */
  getAvailableProviders() {
    return Object.keys(this.providers).map(key => ({
      id: key,
      name: this.getProviderDisplayName(key),
      implemented: true,
      capabilities: this.getProviderCapabilities(key)
    }));
  }

  /**
   * Get display name for provider
   * @param {string} providerId - Provider ID
   * @returns {string} Display name
   */
  getProviderDisplayName(providerId) {
    const names = {
      heritage: 'Heritage Health TPA',
      mdindia: 'MD India TPA',
      healthindia: 'Health India TPA',
      care: 'Care Health Insurance',
      fgi: 'Future Generali India',
      godigit: 'GoDigit General Insurance',
      icici: 'ICICI Lombard',
      mediassist: 'MediAssist TPA',
      starhealth: 'Star Health Insurance',
      fhpl: 'Family Health Plan (FHPL)',
      medsave: 'MedSave TPA',
      nivabupa: 'Niva Bupa Health Insurance',
      paramount: 'Paramount TPA',
      raksha: 'Raksha TPA',
      vidal: 'Vidal Health TPA',
      volo: 'Volo TPA',
      ewat: 'EWAT (Employee Welfare) TPA'
    };
    return names[providerId] || providerId;
  }

  /**
   * Get capabilities of a provider
   * @param {string} providerId - Provider ID
   * @returns {Object} Capabilities object
   */
  getProviderCapabilities(providerId) {
    const provider = this.providers[providerId];
    if (!provider) return {};

    return {
      enrollment: !!provider.getEnrollmentDetails,
      claims: !!(provider.getClaimsList || provider.getClaims),
      claimIntimation: !!(provider.submitClaimIntimation || provider.claimIntimation),
      claimStatus: !!provider.getClaimStatus,
      ecard: !!(provider.getECard || provider.getMemberECardURL),
      networkHospitals: !!provider.getNetworkHospitals,
      policyDetails: !!(provider.getPolicyDetails || provider.getPolicyEnquiry),
      preAuth: !!(provider.getPreAuthDetails || provider.getPreAuthStatus),
      documentUpload: !!(provider.uploadDocument || provider.uploadDocumentChunk)
    };
  }

  /**
   * Execute a TPA operation with automatic provider detection
   * @param {Object} params - Operation parameters
   * @returns {Promise<Object>} Operation result
   */
  async executeOperation({ provider, operation, data }) {
    const operationMap = {
      'getEnrollment': 'getEnrollmentDetails',
      'getClaims': 'getClaimsList',
      'submitClaim': 'submitClaimIntimation',
      'getECard': 'getECard',
      'getHospitals': 'getNetworkHospitals',
      'getPolicy': 'getPolicyDetails',
      'getClaimStatus': 'getClaimStatus',
      'uploadDoc': 'uploadDocument',
      'getPreAuth': 'getPreAuthDetails'
    };

    const methodName = operationMap[operation] || operation;
    
    if (!this[methodName]) {
      throw new Error(`Operation '${operation}' not supported`);
    }

    return await this[methodName](provider, data);
  }
}

export default new TPAAggregator();
