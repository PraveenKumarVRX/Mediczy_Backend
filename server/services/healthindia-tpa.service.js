import axios from '../integrations/axios.js';

/**
 * Health India TPA Service
 * Handles all API interactions with Health India TPA
 */
class HealthIndiaTPA {
  constructor() {
    this.baseURL = process.env.HEALTHINDIA_TPA_BASE_URL || 'https://api.healthindiatpa.com';
    this.authToken = process.env.HEALTHINDIA_TPA_AUTH_TOKEN || '';
    this.clientId = process.env.HEALTHINDIA_TPA_CLIENT_ID || '';
  }

  /**
   * Get claims list from Health India TPA
   * @param {Object} params
   * @param {string} params.PolicyNumber - Policy number
   * @param {string} params.FromDate - Start date (dd/mm/yyyy)
   * @param {string} params.ToDate - End date (dd/mm/yyyy)
   * @param {string} params.EmployeeNumber - Employee number (optional)
   * @param {string} params.MemberID - Member ID (optional)
   * @returns {Promise<Object>} Claims data
   */
  async getClaimsList({ PolicyNumber, FromDate, ToDate, EmployeeNumber, MemberID }) {
    try {
      const response = await axios.post(`${this.baseURL}/GetClaimsList`, {
        AuthToken: this.authToken,
        ClientId: this.clientId,
        PolicyNumber,
        FromDate,
        ToDate,
        EmployeeNumber,
        MemberID
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Health India TPA - Get Claims Error:', error.message);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Submit claim intimation to Health India TPA
   * @param {Object} params
   * @param {string} params.PolicyNo - Policy number
   * @param {string} params.MemberId - Member ID
   * @param {string} params.DateOfAdmission - Admission date (dd/mm/yyyy)
   * @param {string} params.HospitalName - Hospital name
   * @param {string} params.HospitalAddress - Hospital address
   * @param {string} params.ContactNo - Contact number
   * @param {string} params.AilmentDescription - Ailment description
   * @param {string} params.EstimatedAmount - Estimated claim amount
   * @returns {Promise<Object>} Claim intimation response
   */
  async submitClaimIntimation({
    PolicyNo,
    MemberId,
    DateOfAdmission,
    HospitalName,
    HospitalAddress,
    ContactNo,
    AilmentDescription,
    EstimatedAmount
  }) {
    try {
      const response = await axios.post(`${this.baseURL}/ClaimIntimation`, {
        AuthToken: this.authToken,
        ClientId: this.clientId,
        PolicyNo,
        MemberId,
        DateOfAdmission,
        HospitalName,
        HospitalAddress,
        ContactNo,
        AilmentDescription,
        EstimatedAmount
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Health India TPA - Submit Claim Intimation Error:', error.message);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Get enrollment details from Health India TPA
   * @param {Object} params
   * @param {string} params.PolicyNumber - Policy number
   * @param {string} params.EmployeeNumber - Employee number (optional)
   * @param {string} params.MemberID - Member ID (optional)
   * @returns {Promise<Object>} Enrollment data
   */
  async getEnrollmentDetails({ PolicyNumber, EmployeeNumber, MemberID }) {
    try {
      const response = await axios.post(`${this.baseURL}/GetEnrollmentDetails`, {
        AuthToken: this.authToken,
        ClientId: this.clientId,
        PolicyNumber,
        EmployeeNumber,
        MemberID
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Health India TPA - Get Enrollment Error:', error.message);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Get member E-Card URL from Health India TPA
   * @param {Object} params
   * @param {string} params.PolicyNumber - Policy number
   * @param {string} params.MemberID - Member ID
   * @param {string} params.EmployeeNumber - Employee number (optional)
   * @returns {Promise<Object>} E-Card URL
   */
  async getMemberECardURL({ PolicyNumber, MemberID, EmployeeNumber }) {
    try {
      const response = await axios.post(`${this.baseURL}/GetMemberECardURL`, {
        AuthToken: this.authToken,
        ClientId: this.clientId,
        PolicyNumber,
        MemberID,
        EmployeeNumber
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Health India TPA - Get E-Card Error:', error.message);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Get network hospital count from Health India TPA
   * @returns {Promise<Object>} Hospital count
   */
  async getNetworkHospitalCount() {
    try {
      const response = await axios.post(`${this.baseURL}/GetNetworkHospitalCount`, {
        AuthToken: this.authToken,
        ClientId: this.clientId
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Health India TPA - Get Hospital Count Error:', error.message);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Get network hospitals from Health India TPA
   * @param {Object} params
   * @param {number} params.StartIndex - Starting index
   * @param {number} params.EndIndex - Ending index
   * @param {string} params.CityName - City name filter (optional)
   * @param {string} params.StateName - State name filter (optional)
   * @returns {Promise<Object>} Hospital list
   */
  async getNetworkHospitals({ StartIndex = 0, EndIndex = 100, CityName, StateName }) {
    try {
      const response = await axios.post(`${this.baseURL}/GetNetworkHospitals`, {
        AuthToken: this.authToken,
        ClientId: this.clientId,
        StartIndex,
        EndIndex,
        CityName,
        StateName
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Health India TPA - Get Hospitals Error:', error.message);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Get pre-authorization status
   * @param {Object} params
   * @param {string} params.PolicyNumber - Policy number
   * @param {string} params.PreAuthNumber - Pre-authorization number
   * @returns {Promise<Object>} Pre-auth status
   */
  async getPreAuthStatus({ PolicyNumber, PreAuthNumber }) {
    try {
      const response = await axios.post(`${this.baseURL}/GetPreAuthStatus`, {
        AuthToken: this.authToken,
        ClientId: this.clientId,
        PolicyNumber,
        PreAuthNumber
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Health India TPA - Get Pre-Auth Status Error:', error.message);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Parse Health India TPA response
   * @param {Object} result - API result
   * @returns {Object} Parsed response
   */
  parseResponse(result) {
    if (!result.success) {
      return result;
    }

    // Health India TPA typically returns { Status, Message, Data }
    const { Status, Message, Data } = result.data || {};

    return {
      success: Status === true || Status === 'success',
      status: Status,
      message: Message,
      data: Data || []
    };
  }
}

export default new HealthIndiaTPA();
