/**
 * Assistant Controller - Enterprise Grade
 * Handles HTTP request/response only, delegates business logic to services
 */

import AssistantService from '../../../services/assistant.service.js';
import { validateRequest } from '../validators/index.js';
import { assistantLoginSchema, assistantProfileSchema } from '../validators/assistant.validator.js';
import { ApiResponse, ApiError } from '../../../shared/utils/apiResponse.js';
import { HTTP_STATUS } from '../../../shared/constants/httpStatus.js';

class AssistantController {
  /**
   * POST /api/v1/assistant/login
   */
  async login(req, res, next) {
    try {
      const validated = validateRequest(assistantLoginSchema, req.body);
      const result = await AssistantService.login(validated, req.tenant);
      
      return ApiResponse.success(res, {
        message: 'Assistant login successful',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/assistant/profile
   */
  async getProfile(req, res, next) {
    try {
      const profile = await AssistantService.getProfile(req.assistant.id, req.tenant);
      
      return ApiResponse.success(res, {
        message: 'Profile retrieved successfully',
        data: profile
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/assistant/profile
   */
  async updateProfile(req, res, next) {
    try {
      const validated = validateRequest(assistantProfileSchema, req.body);
      const profile = await AssistantService.updateProfile(req.assistant.id, validated, req.tenant);
      
      return ApiResponse.success(res, {
        message: 'Profile updated successfully',
        data: profile
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/assistant/dashboard
   */
  async getDashboard(req, res, next) {
    try {
      const dashboard = await AssistantService.getDashboard(req.assistant.id, req.tenant);
      
      return ApiResponse.success(res, {
        data: dashboard
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/assistant/appointments
   */
  async getAppointments(req, res, next) {
    try {
      const { page = 1, limit = 20, status, date, doctorId } = req.query;
      
      const appointments = await AssistantService.getAppointments(req.assistant.id, {
        page: parseInt(page),
        limit: parseInt(limit),
        status,
        date,
        doctorId
      }, req.tenant);
      
      return ApiResponse.paginated(res, appointments);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/assistant/appointments/:id/status
   */
  async updateAppointmentStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status, reason } = req.body;
      
      const appointment = await AssistantService.updateAppointmentStatus(
        req.assistant.id, 
        id, 
        { status, reason },
        req.tenant
      );
      
      return ApiResponse.success(res, {
        message: 'Appointment status updated',
        data: appointment
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/assistant/patients
   */
  async getPatients(req, res, next) {
    try {
      const { page = 1, limit = 20, search, status } = req.query;
      
      const patients = await AssistantService.getPatients(req.assistant.id, {
        page: parseInt(page),
        limit: parseInt(limit),
        search,
        status
      }, req.tenant);
      
      return ApiResponse.paginated(res, patients);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/assistant/patients
   */
  async registerPatient(req, res, next) {
    try {
      const patient = await AssistantService.registerPatient(req.assistant.id, req.body, req.tenant);
      
      return ApiResponse.created(res, {
        message: 'Patient registered successfully',
        data: patient
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/assistant/linked-doctors
   */
  async getLinkedDoctors(req, res, next) {
    try {
      const doctors = await AssistantService.getLinkedDoctors(req.assistant.id, req.tenant);
      
      return ApiResponse.success(res, {
        data: doctors
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/assistant/prescriptions
   */
  async getPrescriptions(req, res, next) {
    try {
      const { page = 1, limit = 20, patientId, doctorId, date } = req.query;
      
      const prescriptions = await AssistantService.getPrescriptions(req.assistant.id, {
        page: parseInt(page),
        limit: parseInt(limit),
        patientId,
        doctorId,
        date
      }, req.tenant);
      
      return ApiResponse.paginated(res, prescriptions);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/assistant/billing/invoices
   */
  async getInvoices(req, res, next) {
    try {
      const { page = 1, limit = 20, status, patientId } = req.query;
      
      const invoices = await AssistantService.getInvoices(req.assistant.id, {
        page: parseInt(page),
        limit: parseInt(limit),
        status,
        patientId
      }, req.tenant);
      
      return ApiResponse.paginated(res, invoices);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/assistant/messages
   */
  async getMessages(req, res, next) {
    try {
      const { page = 1, limit = 20, patientId } = req.query;
      
      const messages = await AssistantService.getMessages(req.assistant.id, {
        page: parseInt(page),
        limit: parseInt(limit),
        patientId
      }, req.tenant);
      
      return ApiResponse.paginated(res, messages);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/assistant/messages
   */
  async sendMessage(req, res, next) {
    try {
      const { patientId, content, type = 'text' } = req.body;
      
      const message = await AssistantService.sendMessage(req.assistant.id, {
        patientId,
        content,
        type
      }, req.tenant);
      
      return ApiResponse.created(res, {
        message: 'Message sent successfully',
        data: message
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/assistant/reports
   */
  async getReports(req, res, next) {
    try {
      const { range = 'week' } = req.query;
      
      const reports = await AssistantService.getReports(req.assistant.id, { range }, req.tenant);
      
      return ApiResponse.success(res, {
        data: reports
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new AssistantController();
