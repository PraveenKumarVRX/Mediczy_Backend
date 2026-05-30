/**
 * Labs Service - Mediqzy API v1
 */

import BaseService from '../BaseService.js';
import { ErrorTypes } from '../../middleware/errorHandler.js';

class LabsService extends BaseService {
  constructor() {
    super('api_lab_bookings');
  }

  async createHomeCollectionJob(tenantId, bookingId, data = {}) {
    const bookingResult = await this.query(
      `SELECT booking_id, collection_type, collection_date, collection_time_slot,
              collection_address, patient_name, status
         FROM api_lab_bookings
        WHERE booking_id = $1 AND tenant_id = $2`,
      [bookingId, tenantId]
    );

    if (bookingResult.rows.length === 0) {
      throw ErrorTypes.NotFound('Lab booking');
    }

    const booking = bookingResult.rows[0];
    if (booking.collection_type !== 'home-collection') {
      throw ErrorTypes.BadRequest('Home collection job can only be created for home-collection bookings');
    }

    const existingJobResult = await this.query(
      `SELECT job_id
         FROM api_lab_home_collection_jobs
        WHERE booking_id = $1
          AND tenant_id = $2
          AND status NOT IN ('cancelled', 'handed_over')
        LIMIT 1`,
      [bookingId, tenantId]
    );

    if (existingJobResult.rows.length > 0) {
      throw ErrorTypes.BadRequest('An active home collection job already exists for this booking');
    }

    const jobId = this.generateId('hc-job');
    const result = await this.query(
      `INSERT INTO api_lab_home_collection_jobs
       (job_id, tenant_id, booking_id, status, scheduled_date, scheduled_slot, pickup_address, notes)
       VALUES ($1, $2, $3, 'unassigned', $4, $5, $6, $7)
       RETURNING *`,
      [
        jobId,
        tenantId,
        bookingId,
        data.scheduled_date || booking.collection_date || null,
        data.scheduled_slot || booking.collection_time_slot || null,
        JSON.stringify(data.pickup_address || booking.collection_address || {}),
        data.notes || null
      ]
    );

    await this.recordHomeCollectionEvent(tenantId, jobId, {
      booking_id: bookingId,
      event_type: 'JOB_CREATED',
      event_payload: {
        scheduled_date: data.scheduled_date || booking.collection_date || null,
        scheduled_slot: data.scheduled_slot || booking.collection_time_slot || null
      },
      actor_id: data.actor_id || null,
      actor_role: data.actor_role || 'lab-admin',
      actor_name: data.actor_name || null
    });

    return result.rows[0];
  }

  async listHomeCollectionJobs(tenantId, options = {}) {
    const { page = 1, limit = 20, status, scheduledDate, phlebotomistId } = options;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE tenant_id = $1';
    const params = [tenantId];
    let pi = 2;

    if (status) {
      whereClause += ` AND status = $${pi}`;
      params.push(status);
      pi++;
    }

    if (scheduledDate) {
      whereClause += ` AND scheduled_date = $${pi}`;
      params.push(scheduledDate);
      pi++;
    }

    if (phlebotomistId) {
      whereClause += ` AND phlebotomist_id = $${pi}`;
      params.push(phlebotomistId);
      pi++;
    }

    const countResult = await this.query(
      `SELECT COUNT(*) FROM api_lab_home_collection_jobs ${whereClause}`,
      params
    );

    const result = await this.query(
      `SELECT * FROM api_lab_home_collection_jobs
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, limit, offset]
    );

    const total = parseInt(countResult.rows[0].count, 10);
    return {
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    };
  }

  async getHomeCollectionJob(tenantId, jobId) {
    const result = await this.query(
      `SELECT hcj.*, lb.patient_name, lb.collection_address
         FROM api_lab_home_collection_jobs hcj
         JOIN api_lab_bookings lb
           ON lb.booking_id = hcj.booking_id
          AND lb.tenant_id = hcj.tenant_id
        WHERE hcj.job_id = $1 AND hcj.tenant_id = $2`,
      [jobId, tenantId]
    );

    if (result.rows.length === 0) {
      throw ErrorTypes.NotFound('Home collection job');
    }

    return result.rows[0];
  }

  async assignPhlebotomist(tenantId, jobId, data) {
    const job = await this.findHomeCollectionJobById(tenantId, jobId);
    if (job.status === 'cancelled' || job.status === 'handed_over') {
      throw ErrorTypes.BadRequest(`Cannot assign phlebotomist when job is ${job.status}`);
    }

    const result = await this.query(
      `UPDATE api_lab_home_collection_jobs
          SET phlebotomist_id = $3,
              phlebotomist_name = $4,
              phlebotomist_phone = $5,
              status = 'assigned',
              assigned_at = NOW(),
              updated_at = NOW()
        WHERE job_id = $1 AND tenant_id = $2
        RETURNING *`,
      [jobId, tenantId, data.phlebotomist_id, data.phlebotomist_name, data.phlebotomist_phone || null]
    );

    await this.recordHomeCollectionEvent(tenantId, jobId, {
      booking_id: job.booking_id,
      event_type: 'PHLEBOTOMIST_ASSIGNED',
      event_payload: {
        phlebotomist_id: data.phlebotomist_id,
        phlebotomist_name: data.phlebotomist_name,
        phlebotomist_phone: data.phlebotomist_phone || null
      },
      actor_id: data.actor_id || null,
      actor_role: data.actor_role || 'lab-admin',
      actor_name: data.actor_name || null
    });

    return result.rows[0];
  }

  async updateHomeCollectionJobStatus(tenantId, jobId, data) {
    const job = await this.findHomeCollectionJobById(tenantId, jobId);
    const targetStatus = data.status;
    const transitions = {
      unassigned: ['assigned', 'cancelled'],
      assigned: ['en_route', 'cancelled'],
      en_route: ['arrived', 'cancelled'],
      arrived: ['collected', 'cancelled'],
      collected: ['in_transit', 'cancelled'],
      in_transit: ['handed_over', 'cancelled'],
      handed_over: [],
      cancelled: []
    };

    if (!transitions[job.status]?.includes(targetStatus)) {
      throw ErrorTypes.BadRequest(`Invalid status transition from ${job.status} to ${targetStatus}`);
    }

    const statusColumns = {
      en_route: 'en_route_at',
      arrived: 'arrived_at',
      collected: 'collected_at',
      in_transit: 'in_transit_at',
      handed_over: 'handed_over_at',
      cancelled: 'cancelled_at'
    };

    const setFragments = ['status = $3', 'updated_at = NOW()'];
    const params = [jobId, tenantId, targetStatus];
    let pi = 4;

    const tsColumn = statusColumns[targetStatus];
    if (tsColumn) {
      setFragments.push(`${tsColumn} = NOW()`);
    }

    if (Object.prototype.hasOwnProperty.call(data, 'proof_of_collection')) {
      setFragments.push(`proof_of_collection = $${pi}`);
      params.push(JSON.stringify(data.proof_of_collection || {}));
      pi++;
    }

    if (Object.prototype.hasOwnProperty.call(data, 'handover_details')) {
      setFragments.push(`handover_details = $${pi}`);
      params.push(JSON.stringify(data.handover_details || {}));
      pi++;
    }

    if (Object.prototype.hasOwnProperty.call(data, 'notes')) {
      setFragments.push(`notes = $${pi}`);
      params.push(data.notes || null);
      pi++;
    }

    const updateSql = `
      UPDATE api_lab_home_collection_jobs
         SET ${setFragments.join(', ')}
       WHERE job_id = $1 AND tenant_id = $2
       RETURNING *
    `;

    const result = await this.query(updateSql, params);

    if (targetStatus === 'collected') {
      await this.query(
        `UPDATE api_lab_bookings
            SET collected_at = NOW(), updated_at = NOW()
          WHERE booking_id = $1 AND tenant_id = $2`,
        [job.booking_id, tenantId]
      );
    }

    if (targetStatus === 'handed_over') {
      await this.query(
        `UPDATE api_lab_bookings
            SET status = 'processing', updated_at = NOW()
          WHERE booking_id = $1 AND tenant_id = $2`,
        [job.booking_id, tenantId]
      );
    }

    if (targetStatus === 'cancelled') {
      await this.query(
        `UPDATE api_lab_bookings
            SET status = 'cancelled',
                cancellation_reason = COALESCE($3, cancellation_reason),
                cancelled_at = NOW(),
                updated_at = NOW()
          WHERE booking_id = $1 AND tenant_id = $2`,
        [job.booking_id, tenantId, data.notes || null]
      );
    }

    await this.recordHomeCollectionEvent(tenantId, jobId, {
      booking_id: job.booking_id,
      event_type: 'STATUS_CHANGED',
      event_payload: {
        from_status: job.status,
        to_status: targetStatus,
        proof_of_collection: data.proof_of_collection || null,
        handover_details: data.handover_details || null,
        notes: data.notes || null
      },
      actor_id: data.actor_id || null,
      actor_role: data.actor_role || 'phlebotomist',
      actor_name: data.actor_name || null
    });

    return result.rows[0];
  }

  async listHomeCollectionEvents(tenantId, jobId) {
    await this.findHomeCollectionJobById(tenantId, jobId);
    const result = await this.query(
      `SELECT *
         FROM api_lab_home_collection_events
        WHERE job_id = $1 AND tenant_id = $2
        ORDER BY created_at ASC`,
      [jobId, tenantId]
    );
    return result.rows;
  }

  async recordHomeCollectionEvent(tenantId, jobId, data) {
    const eventId = this.generateId('hc-evt');
    await this.query(
      `INSERT INTO api_lab_home_collection_events
       (event_id, tenant_id, job_id, booking_id, event_type, event_payload,
        actor_id, actor_role, actor_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        eventId,
        tenantId,
        jobId,
        data.booking_id,
        data.event_type,
        JSON.stringify(data.event_payload || {}),
        data.actor_id || null,
        data.actor_role || null,
        data.actor_name || null
      ]
    );
  }

  async findHomeCollectionJobById(tenantId, jobId) {
    const result = await this.query(
      `SELECT *
         FROM api_lab_home_collection_jobs
        WHERE job_id = $1 AND tenant_id = $2`,
      [jobId, tenantId]
    );

    if (result.rows.length === 0) {
      throw ErrorTypes.NotFound('Home collection job');
    }

    return result.rows[0];
  }

  async createBooking(tenantId, data) {
    const bookingId = this.generateId('lab');
    
    const result = await this.query(
      `INSERT INTO api_lab_bookings 
       (booking_id, tenant_id, user_id, tests, collection_type, collection_date, 
        collection_time_slot, collection_address, patient_name, patient_age, 
        patient_gender, total_amount, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending')
       RETURNING *`,
      [bookingId, tenantId, data.user_id, JSON.stringify(data.tests), 
       data.collection_type, data.collection_date, data.collection_time_slot,
       JSON.stringify(data.collection_address), data.patient_name, 
       data.patient_age, data.patient_gender, data.total_amount]
    );

    return result.rows[0];
  }

  async getBooking(tenantId, bookingId) {
    return await this.findById(bookingId, tenantId, 'booking_id');
  }

  async listBookings(tenantId, userId, options = {}) {
    return await this.findAll(tenantId, { ...options, where: { user_id: userId } });
  }

  async updateStatus(tenantId, bookingId, status, notes = null) {
    const updates = { status };
    if (notes) updates.lab_notes = notes;
    if (status === 'completed') updates.completed_at = new Date();
    if (status === 'cancelled') updates.cancelled_at = new Date();
    
    return await this.update(bookingId, updates, tenantId, 'booking_id');
  }

  async uploadReport(tenantId, bookingId, reportUrl) {
    return await this.update(bookingId, {
      report_url: reportUrl,
      report_uploaded_at: new Date(),
      status: 'completed'
    }, tenantId, 'booking_id');
  }

  async listTests(tenantId, options = {}) {
    const { page = 1, limit = 50, category, search } = options;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE tenant_id = $1 AND status = $2';
    let params = [tenantId, 'active'];
    let paramIndex = 3;

    if (category) {
      whereClause += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (search) {
      whereClause += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    const countResult = await this.query(
      `SELECT COUNT(*) FROM api_lab_tests ${whereClause}`,
      params
    );

    const result = await this.query(
      `SELECT * FROM api_lab_tests
       ${whereClause}
       ORDER BY name ASC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    const total = parseInt(countResult.rows[0].count);
    return {
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    };
  }

  async getTest(tenantId, testId) {
    const result = await this.query(
      `SELECT * FROM api_lab_tests WHERE test_id = $1 AND tenant_id = $2 AND status = 'active'`,
      [testId, tenantId]
    );
    if (result.rows.length === 0) {
      throw ErrorTypes.NotFound('Lab test');
    }
    return result.rows[0];
  }

  async listCategories(tenantId) {
    const result = await this.query(
      `SELECT DISTINCT category, COUNT(*) AS test_count
       FROM api_lab_tests
       WHERE tenant_id = $1 AND status = 'active' AND category IS NOT NULL
       GROUP BY category
       ORDER BY category ASC`,
      [tenantId]
    );
    return result.rows;
  }

  async listPartners(tenantId, options = {}) {
    const { page = 1, limit = 20, city, homeCollection } = options;
    const offset = (page - 1) * limit;

    let where = `WHERE tenant_id = $1 AND status = 'active'`;
    const params = [tenantId];
    let pi = 2;

    if (city) {
      where += ` AND address->>'city' ILIKE $${pi}`;
      params.push(`%${city}%`);
      pi++;
    }

    if (homeCollection !== undefined) {
      where += ` AND home_collection = $${pi}`;
      params.push(homeCollection === true || homeCollection === 'true');
      pi++;
    }

    const countResult = await this.query(
      `SELECT COUNT(*) FROM api_lab_partners ${where}`, params
    );

    const result = await this.query(
      `SELECT * FROM api_lab_partners ${where}
       ORDER BY name ASC
       LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, limit, offset]
    );

    const total = parseInt(countResult.rows[0].count);
    return {
      data: result.rows,
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    };
  }

  async getSlots(tenantId, { date, collectionType = 'home-collection', partnerId } = {}) {
    // Default time slots if no partner-specific configuration is found
    const defaultSlots = [
      { slot_id: 'slot-1', label: '07:00 AM – 09:00 AM', start_time: '07:00', end_time: '09:00' },
      { slot_id: 'slot-2', label: '09:00 AM – 11:00 AM', start_time: '09:00', end_time: '11:00' },
      { slot_id: 'slot-3', label: '11:00 AM – 01:00 PM', start_time: '11:00', end_time: '13:00' },
      { slot_id: 'slot-4', label: '01:00 PM – 03:00 PM', start_time: '13:00', end_time: '15:00' },
      { slot_id: 'slot-5', label: '04:00 PM – 06:00 PM', start_time: '16:00', end_time: '18:00' }
    ];

    if (partnerId) {
      const partnerResult = await this.query(
        `SELECT pickup_slots, home_collection, lab_visit
         FROM api_lab_partners
         WHERE partner_id = $1 AND tenant_id = $2 AND status = 'active'`,
        [partnerId, tenantId]
      );
      if (partnerResult.rows.length > 0) {
        const partner = partnerResult.rows[0];
        const slots = partner.pickup_slots || [];
        if (slots.length > 0) {
          return {
            date: date || new Date().toISOString().split('T')[0],
            collection_type: collectionType,
            partner_id: partnerId,
            slots
          };
        }
      }
    }

    return {
      date: date || new Date().toISOString().split('T')[0],
      collection_type: collectionType,
      partner_id: partnerId || null,
      slots: collectionType === 'home-collection'
        ? defaultSlots
        : defaultSlots.slice(0, 3) // fewer slots for lab-visit
    };
  }

  async cancelBooking(tenantId, bookingId, reason = null) {
    const booking = await this.findById(bookingId, tenantId, 'booking_id');

    if (['completed', 'cancelled'].includes(booking.status)) {
      throw ErrorTypes.BadRequest(`Cannot cancel a booking that is already ${booking.status}`);
    }

    return await this.update(bookingId, {
      status: 'cancelled',
      cancelled_at: new Date(),
      cancellation_reason: reason
    }, tenantId, 'booking_id');
  }

  async getReport(tenantId, bookingId) {
    const booking = await this.findById(bookingId, tenantId, 'booking_id');
    if (!booking.report_url) {
      throw ErrorTypes.NotFound('Report (not yet uploaded)');
    }
    return {
      booking_id: booking.booking_id,
      patient_name: booking.patient_name,
      report_url: booking.report_url,
      report_uploaded_at: booking.report_uploaded_at,
      tests: booking.tests,
      status: booking.status
    };
  }

  async initiatePayment(tenantId, bookingId, paymentData) {
    const booking = await this.findById(bookingId, tenantId, 'booking_id');

    if (booking.payment_status === 'paid') {
      throw ErrorTypes.BadRequest('Booking is already paid');
    }

    if (booking.status === 'cancelled') {
      throw ErrorTypes.BadRequest('Cannot initiate payment for a cancelled booking');
    }

    const paymentId = booking.payment_id || paymentData?.payment_id || this.generateId('pay');
    return await this.update(bookingId, {
      payment_id: paymentId,
      payment_status: 'initiated',
      payment_method: paymentData?.payment_method || booking.payment_method || null,
      payment_reference: paymentData?.payment_reference || booking.payment_reference || null,
      payment_metadata: paymentData?.payment_metadata || booking.payment_metadata || null,
      payment_initiated_at: new Date()
    }, tenantId, 'booking_id');
  }

  async getPayment(tenantId, bookingId) {
    const booking = await this.findById(bookingId, tenantId, 'booking_id');
    return {
      booking_id: booking.booking_id,
      patient_name: booking.patient_name,
      total_amount: booking.total_amount,
      currency: booking.currency,
      booking_status: booking.status,
      payment_status: booking.payment_status,
      payment_id: booking.payment_id,
      payment_method: booking.payment_method || null,
      payment_reference: booking.payment_reference || null,
      payment_initiated_at: booking.payment_initiated_at || null,
      payment_completed_at: booking.payment_completed_at || null,
      payment_failed_at: booking.payment_failed_at || null,
      payment_metadata: booking.payment_metadata || null
    };
  }

  async updatePaymentStatus(tenantId, bookingId, paymentData) {
    const booking = await this.findById(bookingId, tenantId, 'booking_id');
    const targetStatus = paymentData.payment_status;
    const currentStatus = booking.payment_status || 'pending';

    const validTransitions = {
      pending: ['initiated', 'paid', 'failed'],
      initiated: ['paid', 'failed'],
      failed: ['initiated'],
      paid: []
    };

    if (currentStatus === targetStatus) {
      return booking;
    }

    const nextStates = validTransitions[currentStatus] || [];
    if (!nextStates.includes(targetStatus)) {
      throw ErrorTypes.BadRequest(`Invalid payment status transition from ${currentStatus} to ${targetStatus}`);
    }

    if (booking.status === 'cancelled' && targetStatus === 'paid') {
      throw ErrorTypes.BadRequest('Cannot mark payment as paid for a cancelled booking');
    }

    const updates = {
      payment_status: targetStatus,
      payment_method: paymentData.payment_method || booking.payment_method || null,
      payment_reference: paymentData.payment_reference || booking.payment_reference || null,
      payment_metadata: paymentData.payment_metadata || booking.payment_metadata || null
    };

    if (!booking.payment_id && (targetStatus === 'initiated' || targetStatus === 'paid')) {
      updates.payment_id = paymentData.payment_id || this.generateId('pay');
    }

    if (targetStatus === 'initiated') {
      updates.payment_initiated_at = new Date();
    }

    if (targetStatus === 'paid') {
      updates.payment_completed_at = new Date();
      if (booking.status !== 'completed') {
        updates.status = 'completed';
        updates.completed_at = new Date();
      }
    }

    if (targetStatus === 'failed') {
      updates.payment_failed_at = new Date();
    }

    return await this.update(bookingId, updates, tenantId, 'booking_id');
  }

  async listBillingWorkQueue(tenantId, options = {}) {
    const { page = 1, limit = 20, paymentStatus, search } = options;
    const offset = (page - 1) * limit;

    const where = ['tenant_id = $1', `status <> 'cancelled'`];
    const params = [tenantId];
    let pi = 2;

    if (paymentStatus) {
      where.push(`payment_status = $${pi}`);
      params.push(paymentStatus);
      pi += 1;
    } else {
      where.push(`payment_status IN ('pending', 'initiated', 'failed', 'credit_pending')`);
    }

    if (search) {
      where.push(`(
        booking_id ILIKE $${pi}
        OR COALESCE(patient_name, '') ILIKE $${pi}
        OR COALESCE(user_id, '') ILIKE $${pi}
        OR COALESCE(payment_id, '') ILIKE $${pi}
        OR COALESCE(payment_reference, '') ILIKE $${pi}
      )`);
      params.push(`%${search}%`);
      pi += 1;
    }

    const whereClause = where.join(' AND ');

    const countResult = await this.query(
      `SELECT COUNT(*) FROM api_lab_bookings WHERE ${whereClause}`,
      params
    );

    const result = await this.query(
      `SELECT booking_id, user_id, patient_name, total_amount, currency, status, payment_status,
              payment_id, payment_method, payment_reference, payment_initiated_at,
              payment_completed_at, payment_failed_at, created_at, updated_at
         FROM api_lab_bookings
        WHERE ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, limit, offset]
    );

    const total = parseInt(countResult.rows[0].count, 10);
    return {
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    };
  }

  async getCentralizedBillingSummary(tenantId, options = {}) {
    const { from, to, groupBy = 'partner' } = options;

    const groupByMap = {
      partner: `COALESCE(partner_id, 'unassigned')`,
      date: `TO_CHAR(COALESCE(collection_date, created_at::date), 'YYYY-MM-DD')`,
      collection_type: `COALESCE(collection_type, 'unknown')`
    };

    const groupExpr = groupByMap[groupBy] || groupByMap.partner;

    const where = ['tenant_id = $1'];
    const params = [tenantId];
    let pi = 2;

    if (from) {
      where.push(`COALESCE(collection_date, created_at::date) >= $${pi}`);
      params.push(from);
      pi += 1;
    }

    if (to) {
      where.push(`COALESCE(collection_date, created_at::date) <= $${pi}`);
      params.push(to);
      pi += 1;
    }

    const whereClause = where.join(' AND ');
    const groupedResult = await this.query(
      `SELECT ${groupExpr} AS group_key,
              COUNT(*)::int AS booking_count,
              COALESCE(SUM(total_amount), 0)::numeric(12,2) AS total_amount,
              COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END), 0)::numeric(12,2) AS collected_amount,
              COALESCE(SUM(CASE WHEN payment_status <> 'paid' THEN total_amount ELSE 0 END), 0)::numeric(12,2) AS outstanding_amount
         FROM api_lab_bookings
        WHERE ${whereClause}
        GROUP BY group_key
        ORDER BY total_amount DESC, group_key ASC`,
      params
    );

    const totals = await this.query(
      `SELECT COUNT(*)::int AS booking_count,
              COALESCE(SUM(total_amount), 0)::numeric(12,2) AS total_amount,
              COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END), 0)::numeric(12,2) AS collected_amount,
              COALESCE(SUM(CASE WHEN payment_status <> 'paid' THEN total_amount ELSE 0 END), 0)::numeric(12,2) AS outstanding_amount
         FROM api_lab_bookings
        WHERE ${whereClause}`,
      params
    );

    return {
      group_by: groupBy,
      from: from || null,
      to: to || null,
      data: groupedResult.rows,
      totals: totals.rows[0]
    };
  }

  async getIpCreditOutstanding(tenantId, userId) {
    const result = await this.query(
      `SELECT COALESCE(SUM(
          CASE
            WHEN entry_type = 'debit' THEN amount
            WHEN entry_type = 'credit' THEN -amount
            ELSE 0
          END
        ), 0)::numeric(12,2) AS outstanding
         FROM api_lab_ip_credit_ledger
        WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, userId]
    );

    const outstanding = Number(result.rows[0]?.outstanding || 0);
    return outstanding > 0 ? outstanding : 0;
  }

  async applyIpCredit(tenantId, bookingId, data = {}) {
    const booking = await this.findById(bookingId, tenantId, 'booking_id');

    if (booking.status === 'cancelled') {
      throw ErrorTypes.BadRequest('Cannot apply IP credit on a cancelled booking');
    }
    if (booking.payment_status === 'paid') {
      throw ErrorTypes.BadRequest('Booking is already paid');
    }

    const amount = Number(data.amount || booking.total_amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw ErrorTypes.BadRequest('amount must be a positive number');
    }

    const currentOutstanding = await this.getIpCreditOutstanding(tenantId, booking.user_id);
    const nextOutstanding = Number((currentOutstanding + amount).toFixed(2));
    const entryId = this.generateId('ipcr-ledger');

    await this.query(
      `INSERT INTO api_lab_ip_credit_ledger
        (entry_id, tenant_id, booking_id, user_id, patient_name, entry_type, amount,
         balance_after, reference, notes, metadata, acted_by)
       VALUES ($1, $2, $3, $4, $5, 'debit', $6, $7, $8, $9, $10::jsonb, $11)`,
      [
        entryId,
        tenantId,
        booking.booking_id,
        booking.user_id,
        booking.patient_name,
        amount,
        nextOutstanding,
        data.reference || null,
        data.notes || null,
        JSON.stringify(data.metadata || {}),
        data.acted_by || null
      ]
    );

    const metadata = {
      ...(booking.payment_metadata || {}),
      ip_credit: {
        applied_amount: amount,
        applied_at: new Date().toISOString(),
        ledger_entry_id: entryId
      }
    };

    const updatedBooking = await this.update(bookingId, {
      payment_status: 'credit_pending',
      payment_method: 'ip_credit',
      payment_reference: data.reference || booking.payment_reference || null,
      payment_metadata: metadata,
      payment_id: booking.payment_id || this.generateId('credit-pay'),
      payment_initiated_at: booking.payment_initiated_at || new Date()
    }, tenantId, 'booking_id');

    return {
      booking: updatedBooking,
      ledger_entry_id: entryId,
      outstanding_after: nextOutstanding
    };
  }

  async settleIpCredit(tenantId, bookingId, data = {}) {
    const booking = await this.findById(bookingId, tenantId, 'booking_id');

    if (booking.status === 'cancelled') {
      throw ErrorTypes.BadRequest('Cannot settle IP credit on a cancelled booking');
    }

    const amount = Number(data.amount || booking.total_amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw ErrorTypes.BadRequest('amount must be a positive number');
    }

    const currentOutstanding = await this.getIpCreditOutstanding(tenantId, booking.user_id);
    if (amount > currentOutstanding) {
      throw ErrorTypes.BadRequest('Settlement amount cannot exceed outstanding credit');
    }

    const nextOutstanding = Number((currentOutstanding - amount).toFixed(2));
    const entryId = this.generateId('ipcr-ledger');

    await this.query(
      `INSERT INTO api_lab_ip_credit_ledger
        (entry_id, tenant_id, booking_id, user_id, patient_name, entry_type, amount,
         balance_after, reference, notes, metadata, acted_by)
       VALUES ($1, $2, $3, $4, $5, 'credit', $6, $7, $8, $9, $10::jsonb, $11)`,
      [
        entryId,
        tenantId,
        booking.booking_id,
        booking.user_id,
        booking.patient_name,
        amount,
        nextOutstanding,
        data.reference || null,
        data.notes || null,
        JSON.stringify(data.metadata || {}),
        data.acted_by || null
      ]
    );

    const shouldMarkPaid = nextOutstanding <= 0.0001 || data.close_booking === true;
    const metadata = {
      ...(booking.payment_metadata || {}),
      ip_credit: {
        ...(booking.payment_metadata?.ip_credit || {}),
        last_settled_amount: amount,
        last_settled_at: new Date().toISOString(),
        last_ledger_entry_id: entryId,
        outstanding_after: nextOutstanding
      }
    };

    const updates = {
      payment_status: shouldMarkPaid ? 'paid' : 'credit_pending',
      payment_method: data.payment_method || booking.payment_method || 'ip_credit',
      payment_reference: data.reference || booking.payment_reference || null,
      payment_metadata: metadata,
      payment_completed_at: shouldMarkPaid ? new Date() : booking.payment_completed_at || null,
      payment_id: booking.payment_id || this.generateId('credit-pay')
    };

    if (shouldMarkPaid && booking.status !== 'completed') {
      updates.status = 'completed';
      updates.completed_at = new Date();
    }

    const updatedBooking = await this.update(bookingId, updates, tenantId, 'booking_id');

    return {
      booking: updatedBooking,
      ledger_entry_id: entryId,
      outstanding_after: nextOutstanding
    };
  }

  async listIpCreditLedger(tenantId, options = {}) {
    const { page = 1, limit = 20, userId, bookingId } = options;
    const offset = (page - 1) * limit;

    const where = ['tenant_id = $1'];
    const params = [tenantId];
    let pi = 2;

    if (userId) {
      where.push(`user_id = $${pi}`);
      params.push(userId);
      pi += 1;
    }

    if (bookingId) {
      where.push(`booking_id = $${pi}`);
      params.push(bookingId);
      pi += 1;
    }

    const whereClause = where.join(' AND ');

    const countResult = await this.query(
      `SELECT COUNT(*) FROM api_lab_ip_credit_ledger WHERE ${whereClause}`,
      params
    );

    const result = await this.query(
      `SELECT entry_id, booking_id, user_id, patient_name, entry_type, amount,
              balance_after, reference, notes, metadata, acted_by, created_at
         FROM api_lab_ip_credit_ledger
        WHERE ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, limit, offset]
    );

    const total = parseInt(countResult.rows[0].count, 10);
    return {
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    };
  }
}

export default new LabsService();
