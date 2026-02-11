import pharmacyService from '../../services/api-v1/PharmacyService.js';
import n8nService from '../../services/n8n.service.js';
import { User, Doctor } from '../../models/index.js';
import { asyncHandler } from '../../middleware/errorHandler.js';

/**
 * Create a new prescription
 */
export const createPrescription = asyncHandler(async (req, res) => {
  const prescription = await pharmacyService.createPrescription(req.tenantId, req.body);

  // Notify via n8n (best-effort)
  try {
    const patient = req.body?.user_id
      ? await User.findByPk(req.body.user_id)
      : null;
    const doctor = req.body?.doctor_id
      ? await Doctor.findByPk(req.body.doctor_id)
      : null;

    await n8nService.prescriptionIssued({
      id: prescription?.prescription_id || prescription?.id,
      patientId: req.body?.user_id,
      patientName: patient
        ? `${patient.firstName || ''} ${patient.lastName || ''}`.trim()
        : undefined,
      patientEmail: patient?.email,
      patientPhone: patient?.phoneNumber || patient?.phone,
      doctorName: doctor
        ? `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim()
        : undefined,
      medications: prescription?.medications,
      instructions: prescription?.instructions,
      pharmacyPreference: 'api-v1'
    });
  } catch (n8nError) {
    console.error('Failed to trigger n8n prescription workflow:', n8nError);
  }

  res.status(201).json(prescription);
});

/**
 * Create a new pharmacy order
 */
export const createOrder = asyncHandler(async (req, res) => {
  const order = await pharmacyService.createOrder(req.tenantId, req.body);
  res.status(201).json(order);
});

/**
 * Get a specific pharmacy order
 */
export const getOrder = asyncHandler(async (req, res) => {
  const order = await pharmacyService.getOrder(req.tenantId, req.params.orderId);
  res.json(order);
});

/**
 * List all pharmacy orders for a user
 */
export const listOrders = asyncHandler(async (req, res) => {
  const { userId } = req.query;
  const options = {
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 20,
    sortBy: req.query.sortBy || 'created_at',
    sortOrder: req.query.sortOrder || 'DESC'
  };
  
  const result = await pharmacyService.listOrders(req.tenantId, userId, options);
  res.json(result);
});

/**
 * Update pharmacy order status
 */
export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;
  
  const order = await pharmacyService.updateOrderStatus(req.tenantId, orderId, status);
  res.json(order);
});
