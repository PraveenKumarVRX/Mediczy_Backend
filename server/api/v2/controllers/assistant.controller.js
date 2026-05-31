/**
 * Assistant Controller for API v2
 * Handles all HTTP concerns (request/response)
 * Delegates business logic to AssistantService
 */

import AssistantService from '../../../services/assistant.service.js';
import ApiResponse from '../../../shared/utils/apiResponse.js';
import { asyncHandler } from '../../../middleware/errorHandler.middleware.js';

class AssistantController {
  
  /**
   * Login assistant
   * POST /api/v2/assistants/login
   */
  login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const tenantId = req.tenantId || 'default';
    
    const result = await AssistantService.authenticate(email, password, tenantId);
    
    // Generate JWT token pair with refresh-token persistence
    const { issueTokenPair } = await import('../auth.utils.js');
    
    const { accessToken, refreshToken } = await issueTokenPair(
      {
        id: result.assistant.id,
        userId: result.assistant.id,
        email: result.assistant.email,
        name: result.assistant.name,
        linkedDoctorId: result.assistant.linked_doctor_id,
        permissions: result.permissions,
        tenantId
      },
      'assistant',
      {
        ipAddress: req.ip || req.socket?.remoteAddress || null,
        userAgent: req.headers['user-agent'] || null,
      }
    );
    
    ApiResponse.success(res, {
      message: 'Login successful',
      data: {
        assistant: result.assistant,
        permissions: result.permissions,
        accessToken,
        refreshToken,
        expiresIn: '15m'
      }
    });
  });

  /**
   * Get assistant profile
   * GET /api/v2/assistants/profile
   */
  getProfile = asyncHandler(async (req, res) => {
    const profile = await AssistantService.getProfile(req.userId, req.tenantId);
    ApiResponse.success(res, { data: profile });
  });

  /**
   * Update assistant profile
   * PUT /api/v2/assistants/profile
   */
  updateProfile = asyncHandler(async (req, res) => {
    const updated = await AssistantService.updateProfile(req.userId, req.body, req.tenantId);
    ApiResponse.success(res, {
      message: 'Profile updated successfully',
      data: updated
    });
  });

  /**
   * Get dashboard statistics
   * GET /api/v2/assistants/dashboard
   */
  getDashboard = asyncHandler(async (req, res) => {
    const doctorId = req.user?.linkedDoctorId;
    
    if (!doctorId) {
      return ApiResponse.error(res, {
        statusCode: 400,
        code: 'NO_LINKED_DOCTOR',
        message: 'No doctor linked to this assistant account'
      });
    }
    
    const stats = await AssistantService.getDashboardStats(req.userId, doctorId, req.tenantId);
    ApiResponse.success(res, { data: stats });
  });

  /**
   * Get appointments for linked doctor
   * GET /api/v2/assistants/appointments
   */
  getAppointments = asyncHandler(async (req, res) => {
    const doctorId = req.user?.linkedDoctorId;
    
    if (!doctorId) {
      return ApiResponse.error(res, {
        statusCode: 400,
        code: 'NO_LINKED_DOCTOR',
        message: 'No doctor linked to this assistant account'
      });
    }
    
    const { page, limit, status, date, search } = req.query;
    const result = await AssistantService.getAppointments(doctorId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      status,
      date,
      search
    });
    
    ApiResponse.paginated(res, {
      data: result.appointments,
      ...result.pagination
    });
  });

  /**
   * Create appointment
   * POST /api/v2/assistants/appointments
   */
  createAppointment = asyncHandler(async (req, res) => {
    const doctorId = req.user?.linkedDoctorId;
    
    if (!doctorId) {
      return ApiResponse.error(res, {
        statusCode: 400,
        code: 'NO_LINKED_DOCTOR',
        message: 'No doctor linked to this assistant account'
      });
    }
    
    const appointment = await AssistantService.createAppointment(
      doctorId, 
      req.body,
      req.userId
    );
    
    ApiResponse.created(res, {
      message: 'Appointment created successfully',
      data: appointment
    });
  });

  /**
   * Update appointment status
   * PATCH /api/v2/assistants/appointments/:id/status
   */
  updateAppointmentStatus = asyncHandler(async (req, res) => {
    const doctorId = req.user?.linkedDoctorId;
    const { id } = req.params;
    const { status } = req.body;
    
    if (!doctorId) {
      return ApiResponse.error(res, {
        statusCode: 400,
        code: 'NO_LINKED_DOCTOR',
        message: 'No doctor linked to this assistant account'
      });
    }
    
    const updated = await AssistantService.updateAppointmentStatus(id, status, doctorId);
    
    ApiResponse.success(res, {
      message: 'Appointment status updated',
      data: updated
    });
  });

  /**
   * Get patients for linked doctor
   * GET /api/v2/assistants/patients
   */
  getPatients = asyncHandler(async (req, res) => {
    const doctorId = req.user?.linkedDoctorId;
    
    if (!doctorId) {
      return ApiResponse.error(res, {
        statusCode: 400,
        code: 'NO_LINKED_DOCTOR',
        message: 'No doctor linked to this assistant account'
      });
    }
    
    const { page, limit, search } = req.query;
    const result = await AssistantService.getPatients(doctorId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      search
    });
    
    ApiResponse.paginated(res, {
      data: result.patients,
      ...result.pagination
    });
  });

  /**
   * Register new patient
   * POST /api/v2/assistants/patients
   */
  registerPatient = asyncHandler(async (req, res) => {
    const doctorId = req.user?.linkedDoctorId;
    
    if (!doctorId) {
      return ApiResponse.error(res, {
        statusCode: 400,
        code: 'NO_LINKED_DOCTOR',
        message: 'No doctor linked to this assistant account'
      });
    }
    
    const patient = await AssistantService.registerPatient(
      req.body,
      doctorId,
      req.userId
    );
    
    ApiResponse.created(res, {
      message: 'Patient registered successfully',
      data: patient
    });
  });

  /**
   * Get prescriptions
   * GET /api/v2/assistants/prescriptions
   */
  getPrescriptions = asyncHandler(async (req, res) => {
    const doctorId = req.user?.linkedDoctorId;
    
    if (!doctorId) {
      return ApiResponse.error(res, {
        statusCode: 400,
        code: 'NO_LINKED_DOCTOR',
        message: 'No doctor linked to this assistant account'
      });
    }
    
    const { page, limit, status, patientId } = req.query;
    const result = await AssistantService.getPrescriptions(doctorId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      status,
      patientId
    });
    
    ApiResponse.paginated(res, {
      data: result.prescriptions,
      ...result.pagination
    });
  });

  /**
   * Get billing records
   * GET /api/v2/assistants/billing
   */
  getBilling = asyncHandler(async (req, res) => {
    const doctorId = req.user?.linkedDoctorId;
    
    if (!doctorId) {
      return ApiResponse.error(res, {
        statusCode: 400,
        code: 'NO_LINKED_DOCTOR',
        message: 'No doctor linked to this assistant account'
      });
    }
    
    const { page, limit, status, startDate, endDate } = req.query;
    const result = await AssistantService.getBilling(doctorId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      status,
      startDate,
      endDate
    });
    
    ApiResponse.success(res, {
      data: {
        billing: result.billing,
        summary: result.summary,
        pagination: result.pagination
      }
    });
  });

  /**
   * Get messages
   * GET /api/v2/assistants/messages
   */
  getMessages = asyncHandler(async (req, res) => {
    const { page, limit, folder } = req.query;
    
    const result = await AssistantService.getMessages(req.userId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      folder
    });
    
    ApiResponse.paginated(res, {
      data: result.messages,
      ...result.pagination
    });
  });

  /**
   * Get linked doctors
   * GET /api/v2/assistants/linked-doctors
   */
  getLinkedDoctors = asyncHandler(async (req, res) => {
    const doctors = await AssistantService.getLinkedDoctors(req.userId, req.tenantId);
    ApiResponse.success(res, { data: doctors });
  });
}

export default new AssistantController();
