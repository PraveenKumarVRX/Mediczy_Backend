/**
 * Pharmacy Service - Mediqzy API v1
 */

import BaseService from '../BaseService.js';

class PharmacyService extends BaseService {
  constructor() { super('api_pharmacy_orders'); }

  async createPrescription(tenantId, data) {
    const prescriptionId = this.generateId('rx');
    const result = await this.query(
      `INSERT INTO api_prescriptions 
       (prescription_id, tenant_id, user_id, doctor_id, appointment_id, diagnosis, 
        medications, valid_until, refills_allowed, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active') RETURNING *`,
      [prescriptionId, tenantId, data.user_id, data.doctor_id, data.appointment_id,
       data.diagnosis, JSON.stringify(data.medications), data.valid_until, data.refills_allowed || 0]
    );
    return result.rows[0];
  }

  async createOrder(tenantId, data) {
    const orderId = this.generateId('order');
    const result = await this.query(
      `INSERT INTO api_pharmacy_orders 
       (order_id, tenant_id, user_id, prescription_id, items, delivery_type, 
        delivery_address, delivery_date, subtotal, delivery_charge, discount, 
        total_amount, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending') RETURNING *`,
      [orderId, tenantId, data.user_id, data.prescription_id, JSON.stringify(data.items),
       data.delivery_type, JSON.stringify(data.delivery_address), data.delivery_date,
       data.subtotal, data.delivery_charge || 0, data.discount || 0, data.total_amount]
    );
    return result.rows[0];
  }

  async getOrder(tenantId, orderId) {
    return await this.findById(orderId, tenantId, 'order_id');
  }

  async listOrders(tenantId, userId, options = {}) {
    return await this.findAll(tenantId, { ...options, where: { user_id: userId } });
  }

  async updateOrderStatus(tenantId, orderId, status) {
    const updates = { status };
    if (status === 'delivered') updates.delivered_at = new Date();
    if (status === 'cancelled') updates.cancelled_at = new Date();
    return await this.update(orderId, updates, tenantId, 'order_id');
  }
}

export default new PharmacyService();
