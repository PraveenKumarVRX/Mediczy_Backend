import pool from '../db/pgPool.js';
import * as appointmentRepository from '../repositories/appointment.repository.js';
import LabOrder from '../models/postgres/labOrder.model.postgres.js';
import { MembershipPlan, UserPlan } from '../models/postgres/membershipPlan.model.postgres.js';
import DoctorAvailability from '../models/doctorAvailability.model.intelligent.js';
import doctorModel from '../models/doctor.model.intelligent.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MESSAGE_LENGTH = 4000;
const ACTIVE_HANDOFF = ['open', 'assigned', 'in_progress'];

const fail = (statusCode, message, code = 'CUSTOMER_CARE_ERROR') =>
  Object.assign(new Error(message), { statusCode, code });
const plain = (value) => value?.toJSON ? value.toJSON() : value;
const clip = (value, limit) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, limit);
const displayText = (value, limit) => clip(String(value || '').replace(/<[^>]*>/g, ' '), limit);

function optionalPositiveId(value, label) {
  if (value == null || value === '') return null;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw fail(400, `Valid ${label} is required`, `INVALID_${label.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`);
  return id;
}

export function customerCareTenant(req) {
  // Never use a tenant value from the body/query/header. Auth middleware binds
  // userTenantId from the authenticated account when one is available.
  // The optional default is a deployment-owned support tenant for individual
  // accounts; it is configuration, not client input.
  const value = req.user?.organization_id || req.user?.organizationId || req.userTenantId || process.env.CUSTOMER_CARE_DEFAULT_TENANT_ID || null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function classifyCustomerCareMessage(message) {
  const normalized = String(message || '').toLowerCase();
  if (/\b(self[ -]?harm|suicid|overdos|chest pain|cannot breathe|unconscious|severe bleeding)\b/.test(normalized)) {
    return { mode: 'escalate', reason: 'urgent_safety', riskLevel: 'high' };
  }
  if (/\b(diagnos|symptom|treatment|medication|prescription|dose|side effect|medical advice|health record|test result interpretation)\b/.test(normalized)) {
    return { mode: 'escalate', reason: 'clinical_content', riskLevel: 'elevated' };
  }
  if (/\b(claim|refund|payment|wallet|insurance eligibility|coverage decision|benefit decision)\b/.test(normalized)) {
    return { mode: 'escalate', reason: 'restricted_financial_or_claim', riskLevel: 'normal' };
  }
  if (/\b(employer|manager|family member|spouse|my employee|someone else)\b/.test(normalized)) {
    return { mode: 'escalate', reason: 'third_party_data_request', riskLevel: 'normal' };
  }
  if (/\b(human|agent|representative|support person|talk to someone)\b/.test(normalized)) {
    return { mode: 'escalate', reason: 'human_requested', riskLevel: 'normal' };
  }
  return { mode: 'retrieve' };
}

function safeHandoffSummary(reason) {
  const messages = {
    urgent_safety: 'Urgent customer safety escalation. Review the authenticated conversation immediately.',
    clinical_content: 'Customer requested clinical guidance. Route to an approved clinical support workflow.',
    restricted_financial_or_claim: 'Customer requested a claim, payment, refund, insurance, or benefit decision requiring human review.',
    third_party_data_request: 'Customer requested information involving another person or organisation. Verify authority before disclosure.',
    human_requested: 'Customer requested human assistance.',
    knowledge_uncertain: 'The approved support knowledge base could not verify an answer.',
  };
  return messages[reason] || 'Customer-care request requires human review.';
}

function normalizeStatus(value) {
  return value == null ? null : String(value).toLowerCase();
}

function localDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) throw fail(400, 'date must be YYYY-MM-DD', 'INVALID_DATE');
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw fail(400, 'date must be a valid calendar date', 'INVALID_DATE');
  return parsed;
}

function selectedSlots(availabilities, bookedTimes) {
  const booked = new Set(bookedTimes.map((value) => String(value).slice(0, 5)));
  const byTime = new Map();
  for (const availability of availabilities) {
    if (!availability?.generateTimeSlots || availability.isAvailable === false) continue;
    for (const slot of availability.generateTimeSlots() || []) {
      const time = String(slot.time || '').slice(0, 5);
      if (/^\d{2}:\d{2}$/.test(time) && !booked.has(time)) {
        byTime.set(time, { time, consultationType: availability.consultationType || 'both' });
      }
    }
  }
  return [...byTime.values()].sort((a, b) => a.time.localeCompare(b.time));
}

/**
 * Headless, deterministic customer-care capability.  It never invokes an
 * LLM, accepts an actor id from a caller, or performs a write other than
 * customer-care state and a separately-confirmed appointment action.
 */
export function createCustomerCareService({
  database = pool,
  appointments = appointmentRepository,
  LabOrderModel = LabOrder,
  UserPlanModel = UserPlan,
  MembershipPlanModel = MembershipPlan,
  AvailabilityModel = DoctorAvailability,
  DoctorModel = doctorModel,
} = {}) {
  async function requireConversation(userId, id) {
    if (!UUID.test(String(id || ''))) throw fail(400, 'Invalid conversation id', 'INVALID_CONVERSATION_ID');
    const { rows } = await database.query(
      `SELECT id, user_id, tenant_id, channel, status, risk_level, last_message_at, created_at, updated_at
         FROM customer_care_conversations WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    if (!rows[0]) throw fail(404, 'Conversation not found', 'CONVERSATION_NOT_FOUND');
    return rows[0];
  }

  async function addMessage(conversationId, actorType, body, metadata = {}) {
    await database.query(
      `INSERT INTO customer_care_messages(conversation_id, actor_type, body, metadata)
       VALUES($1, $2, $3, $4::jsonb)`,
      [conversationId, actorType, clip(body, 8000), JSON.stringify(metadata)],
    );
    await database.query(
      `UPDATE customer_care_conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [conversationId],
    );
  }

  async function createHandoffForConversation(conversation, { reason, riskLevel = 'normal' }) {
    const hours = riskLevel === 'high' ? 0.5 : riskLevel === 'elevated' ? 2 : 4;
    const { rows } = await database.query(
      `INSERT INTO customer_care_handoffs(
         conversation_id, tenant_id, reason_code, safe_summary, risk_level, queue_key, sla_due_at
       ) VALUES ($1, $2, $3, $4, $5, 'customer-support', NOW() + ($6 * INTERVAL '1 hour'))
       ON CONFLICT (conversation_id) WHERE status IN ('open','assigned','in_progress')
       DO UPDATE SET updated_at = NOW()
       RETURNING id, reason_code, safe_summary, risk_level, queue_key, assigned_to, sla_due_at, status, created_at, updated_at`,
      [conversation.id, conversation.tenant_id, reason, safeHandoffSummary(reason), riskLevel, hours],
    );
    await database.query(
      `UPDATE customer_care_conversations
          SET status = 'handoff_pending', risk_level = $2, updated_at = NOW()
        WHERE id = $1`,
      [conversation.id, riskLevel],
    );
    return rows[0];
  }

  return {
    async createConversation(req, { channel = 'web' } = {}) {
      const safeChannel = ['web', 'mobile', 'whatsapp', 'sms', 'email'].includes(channel) ? channel : 'web';
      const { rows } = await database.query(
        `INSERT INTO customer_care_conversations(user_id, tenant_id, channel)
         VALUES($1, $2, $3)
         RETURNING id, channel, status, risk_level, last_message_at, created_at`,
        [req.user.id, customerCareTenant(req), safeChannel],
      );
      return rows[0];
    },

    async getConversation(req, id) {
      const conversation = await requireConversation(req.user.id, id);
      const [messages, handoffs] = await Promise.all([
        database.query(
          `SELECT id, actor_type, body, metadata, created_at
             FROM customer_care_messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 100`, [id],
        ),
        database.query(
          `SELECT id, reason_code, risk_level, queue_key, sla_due_at, status, created_at, updated_at
             FROM customer_care_handoffs WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1`, [id],
        ),
      ]);
      return { ...conversation, messages: messages.rows, handoff: handoffs.rows[0] || null };
    },

    async answer(req, conversationId, { message }) {
      const text = clip(message, MAX_MESSAGE_LENGTH);
      if (!text) throw fail(400, 'message is required', 'INVALID_MESSAGE');
      const conversation = await requireConversation(req.user.id, conversationId);
      await addMessage(conversation.id, 'customer', text);
      const classification = classifyCustomerCareMessage(text);
      if (classification.mode === 'escalate') {
        const handoff = await createHandoffForConversation(conversation, classification);
        const response = classification.reason === 'urgent_safety'
          ? 'I cannot provide emergency or clinical guidance here. I have marked this for immediate human review. If there is immediate danger, contact local emergency services now.'
          : 'This request needs a human support specialist. I have created a support handoff and will not make a decision or disclose another person’s information.';
        await addMessage(conversation.id, 'assistant', response, { mode: 'escalate', reason: classification.reason, handoffId: handoff.id });
        return { mode: 'escalate_to_human', answer: response, citations: [], handoff };
      }

      const tenantId = conversation.tenant_id;
      const { rows } = await database.query(
        `SELECT id, title, source_uri, version,
           ts_headline('english', body, plainto_tsquery('english', $1),
             'MaxWords=42, MinWords=12, StartSel=[, StopSel=]') AS excerpt
         FROM customer_care_knowledge_documents
         WHERE status = 'published'
           AND (review_due_at IS NULL OR review_due_at > NOW())
           AND (tenant_id IS NULL OR tenant_id = $2)
           AND to_tsvector('english', title || ' ' || body) @@ plainto_tsquery('english', $1)
         ORDER BY (tenant_id IS NOT NULL) DESC,
           ts_rank_cd(to_tsvector('english', title || ' ' || body), plainto_tsquery('english', $1)) DESC
         LIMIT 3`,
        [text, tenantId],
      );
      if (!rows.length) {
        const handoff = await createHandoffForConversation(conversation, { reason: 'knowledge_uncertain' });
        const response = 'I could not verify an answer from the approved support guidance, so I have sent this to a human support specialist.';
        await addMessage(conversation.id, 'assistant', response, { mode: 'escalate', reason: 'knowledge_uncertain', handoffId: handoff.id });
        return { mode: 'escalate_to_human', answer: response, citations: [], handoff };
      }
      const citations = rows.map((row) => ({
        documentId: row.id,
        title: row.title,
        version: row.version,
        sourceUri: row.source_uri || null,
        excerpt: displayText(row.excerpt, 700),
      }));
      const answer = citations.map((citation) => `${citation.title}: ${citation.excerpt}`).join('\n\n');
      await addMessage(conversation.id, 'assistant', answer, { mode: 'answer_with_citations', citations });
      return { mode: 'answer_with_citations', answer, citations, handoff: null };
    },

    async appointmentStatus(req, appointmentId = null) {
      const parsedAppointmentId = optionalPositiveId(appointmentId, 'appointment id');
      const records = parsedAppointmentId
        ? [await appointments.findByIdForPatient(req, parsedAppointmentId)].filter(Boolean)
        : await appointments.findRecentForPatient(req, { limit: 10 });
      if (parsedAppointmentId && !records.length) throw fail(404, 'Appointment not found', 'APPOINTMENT_NOT_FOUND');
      return records.map((record) => {
        const item = plain(record);
        return {
          id: item.id, doctorName: item.doctorName, specialization: item.specialization || null,
          appointmentDate: item.appointmentDate, appointmentTime: String(item.appointmentTime || '').slice(0, 5),
          consultationType: item.consultationType, status: normalizeStatus(item.status), updatedAt: item.updatedAt || null,
        };
      });
    },

    async labStatus(req, orderId = null) {
      const parsedOrderId = optionalPositiveId(orderId, 'lab order id');
      const where = { patientId: req.user.id };
      if (parsedOrderId) where.id = parsedOrderId;
      const rows = await LabOrderModel.findAll({
        where,
        attributes: ['id', 'orderNumber', 'testType', 'status', 'sampleCollectedAt', 'updatedAt'],
        order: [['updatedAt', 'DESC']], limit: parsedOrderId ? 1 : 10,
      });
      if (parsedOrderId && !rows.length) throw fail(404, 'Lab order not found', 'LAB_ORDER_NOT_FOUND');
      return rows.map((record) => {
        const item = plain(record);
        return { id: item.id, orderNumber: item.orderNumber, testType: item.testType, status: normalizeStatus(item.status), sampleCollectedAt: item.sampleCollectedAt || null, updatedAt: item.updatedAt || null };
      });
    },

    async pharmacyStatus(req, orderId = null) {
      const parsedOrderId = optionalPositiveId(orderId, 'pharmacy order id');
      const args = [req.user.id];
      let filter = 'WHERE user_id = $1';
      if (parsedOrderId) { args.push(String(parsedOrderId)); filter += ' AND order_id = $2'; }
      const { rows } = await database.query(
        `SELECT order_id, status, updated_at, created_at, delivery_type
           FROM patient_pharmacy_orders ${filter}
          ORDER BY updated_at DESC LIMIT ${parsedOrderId ? 1 : 10}`,
        args,
      );
      if (parsedOrderId && !rows.length) throw fail(404, 'Pharmacy order not found', 'PHARMACY_ORDER_NOT_FOUND');
      return rows.map((item) => ({ orderId: item.order_id, status: normalizeStatus(item.status), deliveryType: item.delivery_type || null, createdAt: item.created_at, updatedAt: item.updated_at }));
    },

    async membershipStatus(req) {
      const record = await UserPlanModel.findOne({
        where: { userId: req.user.id, status: 'active' },
        include: [{ model: MembershipPlanModel, as: 'plan' }],
        order: [['createdAt', 'DESC']],
      });
      if (!record) return null;
      const item = plain(record);
      const plan = item.plan || item.MembershipPlan || {};
      return { status: normalizeStatus(item.status), planName: plan.name || null, planType: plan.type || null, startDate: item.startDate, endDate: item.endDate, autoRenew: Boolean(item.autoRenew) };
    },

    async availableSlots({ doctorId, date }) {
      const parsedDoctorId = Number(doctorId);
      if (!Number.isSafeInteger(parsedDoctorId) || parsedDoctorId < 1) throw fail(400, 'Valid doctorId is required', 'INVALID_DOCTOR_ID');
      const calendarDate = localDate(date);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (calendarDate < today) throw fail(400, 'Availability is only available for today or a future date', 'INVALID_DATE');
      const doctor = await DoctorModel.findByPk(parsedDoctorId);
      if (!doctor || doctor.isAvailable === false || doctor.isVerified === false) throw fail(404, 'Verified doctor not available', 'DOCTOR_NOT_AVAILABLE');
      const availability = await AvailabilityModel.findAll({ where: { doctorId: parsedDoctorId, dayOfWeek: calendarDate.getUTCDay(), isAvailable: true } });
      const booked = await appointments.findBookedSlotsForDoctorOnDate(parsedDoctorId, date);
      const slots = selectedSlots(availability, booked.map((row) => plain(row).appointmentTime));
      return {
        doctor: { id: doctor.id, name: [doctor.prefix, doctor.firstName, doctor.lastName].filter(Boolean).join(' ') || doctor.name || 'Doctor', specialization: doctor.specialization || null },
        date,
        slots,
        source: 'authoritative_availability',
      };
    },

    async validateRescheduleTarget(appointment, action) {
      const result = await this.availableSlots({ doctorId: appointment.doctorId, date: action.appointmentDate });
      if (!result.slots.some((slot) => slot.time === String(action.appointmentTime).slice(0, 5))) {
        throw fail(409, 'Slot no longer available', 'SLOT_NO_LONGER_AVAILABLE');
      }
    },

    async listHandoffs(tenantId, { status } = {}) {
      const args = [tenantId];
      const allowedStatuses = ['open', 'assigned', 'in_progress', 'resolved', 'cancelled'];
      const clause = allowedStatuses.includes(status) ? ' AND h.status = $2' : '';
      if (allowedStatuses.includes(status)) args.push(status);
      const { rows } = await database.query(
        `SELECT h.id, h.conversation_id, h.reason_code, h.safe_summary, h.risk_level, h.queue_key,
                h.assigned_to, h.sla_due_at, h.status, h.created_at, h.updated_at,
                c.channel, c.user_id
           FROM customer_care_handoffs h
           JOIN customer_care_conversations c ON c.id = h.conversation_id
          WHERE h.tenant_id = $1${clause}
          ORDER BY h.sla_due_at ASC LIMIT 200`, args,
      );
      return rows;
    },

    async assignHandoff(tenantId, id, actorId, { assignedTo, queueKey }) {
      if (!UUID.test(String(id || ''))) throw fail(400, 'Invalid handoff id', 'INVALID_HANDOFF_ID');
      const assignee = Number(assignedTo || actorId);
      if (!Number.isSafeInteger(assignee) || assignee < 1) throw fail(400, 'Valid assignee required', 'INVALID_ASSIGNEE');
      const { rows } = await database.query(
        `UPDATE customer_care_handoffs
            SET assigned_to = $3, queue_key = COALESCE(NULLIF($4, ''), queue_key), status = 'assigned', updated_at = NOW()
          WHERE id = $1 AND tenant_id = $2 AND status IN ('open','assigned','in_progress')
        RETURNING id, conversation_id, reason_code, safe_summary, risk_level, queue_key, assigned_to, sla_due_at, status, updated_at`,
        [id, tenantId, assignee, clip(queueKey, 80)],
      );
      if (!rows[0]) throw fail(404, 'Open handoff not found', 'HANDOFF_NOT_FOUND');
      return rows[0];
    },

    async resolveHandoff(tenantId, id, actorId, { resolutionNote }) {
      if (!UUID.test(String(id || ''))) throw fail(400, 'Invalid handoff id', 'INVALID_HANDOFF_ID');
      const { rows } = await database.query(
        `UPDATE customer_care_handoffs
            SET assigned_to = COALESCE(assigned_to, $3), status = 'resolved', resolution_note = $4,
                resolved_at = NOW(), updated_at = NOW()
          WHERE id = $1 AND tenant_id = $2 AND status IN ('open','assigned','in_progress')
        RETURNING id, conversation_id, reason_code, risk_level, queue_key, assigned_to, sla_due_at, status, resolution_note, resolved_at`,
        [id, tenantId, actorId, clip(resolutionNote, 2000)],
      );
      if (!rows[0]) throw fail(404, 'Open handoff not found', 'HANDOFF_NOT_FOUND');
      await database.query(`UPDATE customer_care_conversations SET status = 'resolved', updated_at = NOW() WHERE id = $1`, [rows[0].conversation_id]);
      return rows[0];
    },

    async listKnowledge(tenantId) {
      const { rows } = await database.query(
        `SELECT id, tenant_id, title, source_uri, language, audience, tags, version, status, review_due_at, content_owner, published_at, created_at, updated_at
           FROM customer_care_knowledge_documents
          WHERE tenant_id IS NULL OR tenant_id = $1 ORDER BY updated_at DESC LIMIT 200`, [tenantId],
      );
      return rows;
    },

    async saveKnowledge(tenantId, actorId, data) {
      const title = clip(data.title, 240);
      const body = clip(data.body, 50000);
      if (!title || !body) throw fail(400, 'title and body are required', 'INVALID_KNOWLEDGE_DOCUMENT');
      const status = ['draft', 'published', 'revoked'].includes(data.status) ? data.status : 'draft';
      const isGlobal = data.global === true;
      const values = [data.id || null, isGlobal ? null : tenantId, title, body, clip(data.sourceUri, 2000) || null,
        clip(data.language || 'en', 16), Array.isArray(data.tags) ? data.tags.map((tag) => clip(tag, 40)).filter(Boolean).slice(0, 20) : [],
        status, data.reviewDueAt || null, clip(data.ownerLabel || 'Tenant CRM administrator', 160), actorId];
      const { rows } = await database.query(
        `INSERT INTO customer_care_knowledge_documents(
           id, tenant_id, title, body, source_uri, language, tags, status, review_due_at, content_owner, created_by, updated_by, published_at, revoked_at
         ) VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10, $11, $11,
           CASE WHEN $8::varchar = 'published' THEN NOW() ELSE NULL END,
           CASE WHEN $8::varchar = 'revoked' THEN NOW() ELSE NULL END)
         ON CONFLICT (id) DO UPDATE SET
           tenant_id = EXCLUDED.tenant_id, title = EXCLUDED.title, body = EXCLUDED.body, source_uri = EXCLUDED.source_uri,
           language = EXCLUDED.language, tags = EXCLUDED.tags, status = EXCLUDED.status, review_due_at = EXCLUDED.review_due_at,
           content_owner = EXCLUDED.content_owner, version = customer_care_knowledge_documents.version + 1, updated_by = EXCLUDED.updated_by, updated_at = NOW(),
           published_at = CASE WHEN EXCLUDED.status = 'published' THEN NOW() ELSE customer_care_knowledge_documents.published_at END,
           revoked_at = CASE WHEN EXCLUDED.status = 'revoked' THEN NOW() ELSE NULL END
         WHERE customer_care_knowledge_documents.tenant_id IS NULL OR customer_care_knowledge_documents.tenant_id = $2
         RETURNING id, tenant_id, title, source_uri, language, tags, version, status, review_due_at, content_owner, published_at, revoked_at, updated_at`, values,
      );
      if (!rows[0]) throw fail(404, 'Knowledge document not found', 'KNOWLEDGE_NOT_FOUND');
      return rows[0];
    },
  };
}

export default createCustomerCareService;
