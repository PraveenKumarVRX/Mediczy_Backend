import axios from '../integrations/axios.js';

/**
 * MD India TPA Service
 * Handles all API interactions with MD India TPA
 * Base URL: https://APISet.mdindia.com:8167/Way2Wealth/Way2WealthService.svc/rest
 */
class MDIndiaTPA {
  constructor() {
    this.baseURL = process.env.MDINDIA_TPA_BASE_URL || 'https://APISet.mdindia.com:8167/Way2Wealth/Way2WealthService.svc/rest';
    this.username = process.env.MDINDIA_TPA_USERNAME || 'Way2Wealth';
    this.password = process.env.MDINDIA_TPA_PASSWORD || 'MdIndia@123';
  }

  /**
   * Get enrollment details for policy members
   * @param {Object} params
   * @param {string} params.PolicyNo - Policy number
   * @param {boolean} params.IsCount - Whether to get count only (optional)
   * @param {number} params.StartIndex - Starting index for pagination (default: 1)
   * @param {number} params.EndIndex - Ending index for pagination (default: 9999)
   * @returns {Promise<Object>} Enrollment data with member details
   */
  async getEnrollmentDetails({ PolicyNo, IsCount = false, StartIndex = 1, EndIndex = 9999 }) {
    try {
      const response = await axios.get(`${this.baseURL}/GetEnrollmentDetails`, {
        params: {
          UserName: this.username,
          Password: this.password,
          PolicyNo,
          IsCount,
          StartIndex,
          EndIndex
        }
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('MD India TPA - Get Enrollment Error:', error.message);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Get claims list for a policy
   * @param {Object} params
   * @param {string} params.PolicyNo - Policy number
   * @param {string} params.FromDate - Start date (dd/mm/yyyy format)
   * @param {string} params.ToDate - End date (dd/mm/yyyy format)
   * @returns {Promise<Object>} Claims data with extensive claim details
   */
  async getClaims({ PolicyNo, FromDate, ToDate }) {
    try {
      const response = await axios.get(`${this.baseURL}/GetClaims`, {
        params: {
          UserName: this.username,
          Password: this.password,
          PolicyNo,
          FromDate,
          ToDate
        }
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('MD India TPA - Get Claims Error:', error.message);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Get policy-wise hospital list
   * @param {Object} params
   * @param {string} params.PolicyNo - Policy number
   * @param {number} params.StartIndex - Starting index for pagination (optional)
   * @param {number} params.EndIndex - Ending index for pagination (optional)
   * @returns {Promise<Object>} Hospital list for policy
   */
  async getPolicyWiseHospital({ PolicyNo, StartIndex = 1, EndIndex = 1000 }) {
    try {
      const response = await axios.get(`${this.baseURL}/GetPolicyWiseHospital`, {
        params: {
          UserName: this.username,
          Password: this.password,
          PolicyNo,
          StartIndex,
          EndIndex
        }
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('MD India TPA - Get Policy Wise Hospital Error:', error.message);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Get E-Card for a member
   * @param {Object} params
   * @param {string} params.PolicyNo - Policy number
   * @param {string} params.MemberId - Member ID or TPA Health ID
   * @returns {Promise<Object>} E-Card data/URL
   */
  async getEcard({ PolicyNo, MemberId }) {
    try {
      const response = await axios.get(`${this.baseURL}/GetEcard`, {
        params: {
          UserName: this.username,
          Password: this.password,
          PolicyNo,
          MemberId
        }
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('MD India TPA - Get Ecard Error:', error.message);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Get endorsement data for policy
   * @param {Object} params
   * @param {string} params.PolicyNo - Policy number
   * @param {string} params.FromDate - Start date (dd/mm/yyyy format)
   * @param {string} params.ToDate - End date (dd/mm/yyyy format)
   * @returns {Promise<Object>} Endorsement data
   */
  async getEndorsementData({ PolicyNo, FromDate, ToDate }) {
    try {
      const response = await axios.get(`${this.baseURL}/GetEndorsmentData`, {
        params: {
          UserName: this.username,
          Password: this.password,
          PolicyNo,
          FromDate,
          ToDate
        }
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('MD India TPA - Get Endorsement Data Error:', error.message);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Parse MD India TPA response
   * Response format: { response: { Status: "succeed", data: [...] } }
   * @param {Object} result - API result
   * @returns {Object} Parsed response
   */
  parseResponse(result) {
    if (!result.success) {
      return result;
    }

    const response = result.data?.response;
    if (!response) {
      return {
        success: false,
        error: 'Invalid response format'
      };
    }

    return {
      success: response.Status === 'succeed',
      status: response.Status,
      data: response.data || [],
      message: response.Message || ''
    };
  }
}

export default new MDIndiaTPA();
