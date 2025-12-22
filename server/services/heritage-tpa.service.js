/**
 * Heritage TPA API Integration Service
 * Base URL: http://223.31.103.204/HeritageMobileAppNew/MobileAppAPI.svc
 */

import axios from 'axios';

class HeritageTPA {
  constructor() {
    this.baseURL = process.env.HERITAGE_TPA_BASE_URL || 'http://223.31.103.204/HeritageMobileAppNew/MobileAppAPI.svc';
    this.authId = process.env.HERITAGE_TPA_AUTH_ID || '';
    this.insCoCode = process.env.HERITAGE_TPA_INSCO || 'NIC';
  }

  /**
   * Get Claims List
   * @param {Object} params
   * @param {string} params.PolicyNumber - Policy Number (Mandatory)
   * @param {string} params.FromDate - Date format (dd/mm/yyyy)
   * @param {string} params.ToDate - Date format (dd/mm/yyyy)
   * @param {string} params.EmployeeNumber - Employee Number (Optional)
   * @param {string} params.MemberID - Member ID (Optional)
   */
  async getClaimsList(params) {
    try {
      const payload = {
        InsCo: this.insCoCode,
        PolicyNumber: params.PolicyNumber,
        FromDate: params.FromDate || '',
        ToDate: params.ToDate || '',
        AuthId: this.authId,
        EmployeeNumber: params.EmployeeNumber || '',
        MemberID: params.MemberID || ''
      };

      const response = await axios.post(
        `${this.baseURL}/GetClaimsList`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Heritage TPA GetClaimsList Error:', error);
      return {
        success: false,
        error: error.message,
        details: error.response?.data
      };
    }
  }

  /**
   * Submit Claim Intimation
   * @param {Object} params
   * @param {string} params.AilmentDescription
   * @param {string} params.ContactNo
   * @param {string} params.ProviderNumber
   * @param {string} params.DateOfAdmission
   * @param {string} params.HospName
   * @param {string} params.HospAddress
   * @param {string} params.MemberId
   * @param {string} params.PolicyNo
   */
  async submitClaimIntimation(params) {
    try {
      const payload = {
        AilmentDescription: params.AilmentDescription,
        ContactNo: params.ContactNo,
        ProviderNumber: params.ProviderNumber,
        DateOfAdmission: params.DateOfAdmission,
        HospName: params.HospName,
        HospAddress: params.HospAddress,
        MemberId: params.MemberId,
        PolicyNo: params.PolicyNo,
        AuthId: this.authId
      };

      const response = await axios.post(
        `${this.baseURL}/ClaimIntimations`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Heritage TPA ClaimIntimation Error:', error);
      return {
        success: false,
        error: error.message,
        details: error.response?.data
      };
    }
  }

  /**
   * Get Enrollment Details
   * @param {Object} params
   * @param {string} params.PolicyNumber - Policy Number (Mandatory)
   * @param {string} params.EmployeeNumber - Employee Number (Optional)
   * @param {string} params.MemberID - Member ID (Optional)
   */
  async getEnrollmentDetails(params) {
    try {
      const payload = {
        PolicyNumber: params.PolicyNumber,
        AuthId: this.authId,
        EmployeeNumber: params.EmployeeNumber || '',
        MemberID: params.MemberID || ''
      };

      const response = await axios.post(
        `${this.baseURL}/GetEnrollmentDetails`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Heritage TPA GetEnrollmentDetails Error:', error);
      return {
        success: false,
        error: error.message,
        details: error.response?.data
      };
    }
  }

  /**
   * Get Member E-Card URL
   * @param {Object} params
   * @param {string} params.PolicyNumber - Policy Number (Mandatory)
   * @param {string} params.EmployeeNumber - Employee Number (Optional)
   * @param {string} params.TPAId - TPA ID (Optional)
   * @param {string} params.MemberID - Member ID (Optional)
   */
  async getMemberECardURL(params) {
    try {
      const payload = {
        PolicyNumber: params.PolicyNumber,
        EmployeeNumber: params.EmployeeNumber || '',
        TPAId: params.TPAId || '',
        MemberID: params.MemberID || '',
        AuthId: this.authId
      };

      const response = await axios.post(
        `${this.baseURL}/GetMemberECardURL`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Heritage TPA GetMemberECardURL Error:', error);
      return {
        success: false,
        error: error.message,
        details: error.response?.data
      };
    }
  }

  /**
   * Get Network Hospital Count
   */
  async getNetworkHospitalCount() {
    try {
      const payload = {
        Count: 'true',
        StartIndex: 0,
        EndIndex: 0,
        AuthId: this.authId
      };

      const response = await axios.post(
        `${this.baseURL}/GetNetworkHospitalCount`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Heritage TPA GetNetworkHospitalCount Error:', error);
      return {
        success: false,
        error: error.message,
        details: error.response?.data
      };
    }
  }

  /**
   * Get Network Hospitals
   * @param {Object} params
   * @param {number} params.StartIndex - Start index for pagination
   * @param {number} params.EndIndex - End index for pagination
   */
  async getNetworkHospitals(params) {
    try {
      const payload = {
        Count: 'false',
        StartIndex: params.StartIndex || 0,
        EndIndex: params.EndIndex || 100,
        AuthId: this.authId
      };

      const response = await axios.post(
        `${this.baseURL}/GetNetworkHospitals`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Heritage TPA GetNetworkHospitals Error:', error);
      return {
        success: false,
        error: error.message,
        details: error.response?.data
      };
    }
  }

  /**
   * Parse Heritage TPA response format
   * @param {Object} response - Heritage TPA API response
   */
  parseResponse(response) {
    if (!response || !response.data) {
      return {
        status: false,
        message: 'Invalid response',
        result: []
      };
    }

    const { Data, Status, Message } = response.data;

    return {
      status: Status === true || Status === 'True' || Status === 'true',
      message: Message || '',
      result: Data || []
    };
  }
}

export default new HeritageTPA();
