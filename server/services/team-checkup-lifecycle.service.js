/**
 * The booking lifecycle for check-ups the wellness team books (lab_orders rows,
 * test_category 'corporate_health_checkup'), plus the status history shared with
 * employee app bookings (Team QA 2026-11-21).
 *
 * Before this, a Team booking was written as 'pending' and nothing could ever move
 * it: no screen or API changed its status, the Approvals list read only employee app
 * bookings (health_checkup_bookings), and the status board counted a pending Team
 * booking as confirmed. Every Team booking in production was still 'pending'.
 *
 *   pending   --confirm-->  confirmed  --complete-->  completed
 *   pending | confirmed  --cancel-->  cancelled
 *
 * lab_orders is FORCED row-level security, so every read and write runs inside the
 * corporate booking context. The lab's own portal moves an order on through
 * sample_collected/processing; those states are shown, not changed, here.
 */
import { postgresSequelize as db } from '../db/postgres-sequelize.js';
import { withCorporateBookingContext } from './corporate-health-checkup-booking.service.js';

const SEL = { type: db.QueryTypes.SELECT };

export const TEAM_TRANSITIONS = {
  confirm: { from: ['pending'], to: 'confirmed' },
  complete: { from: ['confirmed'], to: 'completed' },
  cancel: { from: ['pending', 'confirmed'], to: 'cancelled' },
};

export class LifecycleError extends Error {
  constructor(status, message, code = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const TEAM_ORDER_SQL = `
  SELECT o.id, o.order_number, o.status, o.test_type, o.patient_id, o.lab_id, o.created_at, o.updated_at,
         o.sample_collected_at, o.notes,
         substring(o.notes from 'Date: ([0-9]{4}-[0-9]{2}-[0-9]{2})') AS appointment_date,
         NULLIF(trim(substring(o.notes from 'Date: [0-9]{4}-[0-9]{2}-[0-9]{2} ([^|]*)')), '') AS time_slot,
         COALESCE(l.name, NULLIF(trim(substring(o.notes from 'Lab: ([^|(]*)')), '')) AS lab_name,
         l.address AS lab_address,
         u.email AS employee_email, u."phoneNumber" AS employee_phone,
         TRIM(CONCAT(u."firstName", ' ', u."lastName")) AS employee_name,
         is_demo_account(o.patient_id) AS is_demo
    FROM lab_orders o
    LEFT JOIN labs l ON l.id = o.lab_id
    LEFT JOIN users u ON u.id = o.patient_id
   WHERE o.organization_id = :corporateId AND o.test_category = 'corporate_health_checkup'`;

/** A Team booking in the same shape as an employee booking in the Approvals list. */
export const teamOrderView = (r) => ({
  id: String(r.id),
  source: 'team',
  bookingReference: r.order_number,
  status: r.status,
  employee: { id: r.patient_id, name: r.employee_name || null, email: r.employee_email || null, phone: r.employee_phone || null },
  beneficiary: { name: r.employee_name || null, relation: 'self' },
  packageName: r.test_type,
  lab: { name: r.lab_name || null, address: r.lab_address || null },
  appointment: { date: r.appointment_date || null, timeSlot: r.time_slot || '' },
  reportCount: Number(r.report_count || 0),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  isDemo: r.is_demo === true,
});

export async function listTeamOrders({ corporateId, actorUserId, status = '' }, outer = undefined) {
  return withCorporateBookingContext({ corporateId, bookedByUserId: actorUserId }, async (transaction) => {
    const rows = await db.query(
      `SELECT t.*, (SELECT count(*) FROM corporate_health_reports r WHERE r.lab_order_id = t.id) AS report_count
         FROM (${TEAM_ORDER_SQL} AND (:status = '' OR o.status = :status)) t
        ORDER BY (t.status = 'pending') DESC, t.appointment_date ASC NULLS LAST, t.created_at DESC
        LIMIT 300`,
      { ...SEL, transaction, replacements: { corporateId, status: String(status || '').trim() } }
    );
    return rows.map(teamOrderView);
  }, outer);
}

/** Writes one history row. Fenced: a missing table (migration not applied) never blocks a status change. */
export async function recordBookingEvent({ corporateId, source, bookingId, employeeUserId, fromStatus, toStatus, actorUserId, note = null }, transaction) {
  try {
    await db.query('SAVEPOINT checkup_event', { transaction });
    await db.query(
      `INSERT INTO checkup_booking_events (corporate_id, booking_source, booking_id, employee_user_id, from_status, to_status, actor_user_id, note)
       VALUES (:corporateId, :source, :bookingId, :employeeUserId, :fromStatus, :toStatus, :actorUserId, :note)`,
      { transaction, replacements: { corporateId, source, bookingId, employeeUserId: employeeUserId || null, fromStatus: fromStatus || null, toStatus, actorUserId: actorUserId || null, note: note ? String(note).slice(0, 500) : null } }
    );
    await db.query('RELEASE SAVEPOINT checkup_event', { transaction });
  } catch (error) {
    await db.query('ROLLBACK TO SAVEPOINT checkup_event', { transaction }).catch(() => {});
    console.error(`[checkup-lifecycle] history not recorded for ${source} ${bookingId}: ${error.message}`);
  }
}

const todayIst = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/**
 * Moves one Team booking. Returns the updated booking view.
 * @param {'confirm'|'complete'|'cancel'} action
 */
export async function transitionTeamOrder({ corporateId, orderId, action, actorUserId, note = null }, outer = undefined) {
  const rule = TEAM_TRANSITIONS[action];
  if (!rule) throw new LifecycleError(400, 'Unknown action');
  const id = Number(orderId);
  if (!Number.isSafeInteger(id) || id < 1) throw new LifecycleError(400, 'A valid booking id is required');
  if (action === 'cancel' && String(note || '').trim().length < 3) throw new LifecycleError(400, 'Give a reason for cancelling');

  return withCorporateBookingContext({ corporateId, bookedByUserId: actorUserId }, async (transaction) => {
    const [order] = await db.query(`${TEAM_ORDER_SQL} AND o.id = :id FOR UPDATE OF o`, { ...SEL, transaction, replacements: { corporateId, id } });
    if (!order) throw new LifecycleError(404, 'Booking not found');
    if (!rule.from.includes(order.status)) {
      throw new LifecycleError(409, `This booking is ${order.status}; it can only be ${action === 'confirm' ? 'confirmed while pending' : action === 'complete' ? 'completed once confirmed' : 'cancelled while pending or confirmed'}.`, 'invalid_transition');
    }
    // A check-up cannot be completed before its appointment day (the same guard as employee bookings).
    if (action === 'complete' && order.appointment_date && order.appointment_date > todayIst()) {
      throw new LifecycleError(409, 'This check-up is scheduled for a future date and cannot be marked completed yet.', 'appointment_not_yet_due');
    }
    const stamp = `${new Date().toISOString().slice(0, 16).replace('T', ' ')} ${rule.to}${note ? `: ${String(note).replace(/\|/g, '/').slice(0, 300)}` : ''}`;
    const [updated] = await db.query(
      `UPDATE lab_orders
          SET status = :to, updated_at = NOW(),
              notes = CONCAT_WS(' | ', notes, :stamp)
        WHERE id = :id AND organization_id = :corporateId AND status = :from
        RETURNING id`,
      { ...SEL, transaction, replacements: { id, corporateId, to: rule.to, from: order.status, stamp } }
    );
    if (!updated) throw new LifecycleError(409, 'Booking status changed; reload');
    await recordBookingEvent({ corporateId, source: 'team', bookingId: id, employeeUserId: order.patient_id, fromStatus: order.status, toStatus: rule.to, actorUserId, note }, transaction);
    const [fresh] = await db.query(`${TEAM_ORDER_SQL} AND o.id = :id`, { ...SEL, transaction, replacements: { corporateId, id } });
    return teamOrderView(fresh);
  }, outer);
}

/**
 * The status history of one booking, oldest first, starting with when it was booked.
 * Rows from before history was kept show only the booking and the current status.
 */
export async function bookingHistory({ corporateId, source, bookingId, actorUserId }, outer = undefined) {
  const id = Number(bookingId);
  if (!['team', 'employee'].includes(source) || !Number.isSafeInteger(id) || id < 1) throw new LifecycleError(400, 'Unknown booking');
  return withCorporateBookingContext({ corporateId, bookedByUserId: actorUserId }, async (transaction) => {
    const [booking] = source === 'team'
      ? await db.query(
        `SELECT o.id, o.status, o.created_at, substring(o.notes from 'Booked by team: ([^ |]+)') AS booked_by
           FROM lab_orders o WHERE o.id = :id AND o.organization_id = :corporateId AND o.test_category = 'corporate_health_checkup'`,
        { ...SEL, transaction, replacements: { id, corporateId } })
      : await db.query(
        `SELECT b.id, b.status, b.created_at, u.email AS booked_by
           FROM health_checkup_bookings b LEFT JOIN users u ON u.id = b.user_id
          WHERE b.id = :id AND b.corporate_id = :corporateId`,
        { ...SEL, transaction, replacements: { id, corporateId } });
    if (!booking) throw new LifecycleError(404, 'Booking not found');
    let events = [];
    try {
      await db.query('SAVEPOINT checkup_history', { transaction });
      events = await db.query(
        `SELECT e.from_status, e.to_status, e.note, e.created_at, a.email AS actor_email,
                NULLIF(TRIM(CONCAT(a."firstName", ' ', a."lastName")), '') AS actor_name
           FROM checkup_booking_events e LEFT JOIN users a ON a.id = e.actor_user_id
          WHERE e.booking_source = :source AND e.booking_id = :id AND e.corporate_id = :corporateId
          ORDER BY e.created_at, e.id`,
        { ...SEL, transaction, replacements: { source, id, corporateId } });
      await db.query('RELEASE SAVEPOINT checkup_history', { transaction });
    } catch (error) {
      await db.query('ROLLBACK TO SAVEPOINT checkup_history', { transaction }).catch(() => {});
      console.error(`[checkup-lifecycle] history unavailable: ${error.message}`);
    }
    return {
      source, bookingId: String(id), status: booking.status,
      events: [
        { status: source === 'team' ? 'pending' : 'booked', at: booking.created_at, by: booking.booked_by || null, note: 'Booked' },
        ...events.map((e) => ({ from: e.from_status, status: e.to_status, at: e.created_at, by: e.actor_name || e.actor_email || null, note: e.note || null })),
      ],
    };
  }, outer);
}

export default { listTeamOrders, transitionTeamOrder, bookingHistory, recordBookingEvent, teamOrderView, TEAM_TRANSITIONS };
