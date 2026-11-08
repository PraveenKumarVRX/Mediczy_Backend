/**
 * Abandoned-checkout expiry (W-ORD-1 / W-ORD-2).
 *
 * Closing the payment sheet left the order sitting at 'pending' forever, so a
 * user's Order History filled with pending orders that were never paid and never
 * cleared. This sweeps orders that have been 'pending' past a grace window and
 * cancels them — but only when no successful payment exists against the order, so
 * a captured payment whose status update lagged is never cancelled out from under
 * the customer.
 */
import { Op } from 'sequelize';
import { Order, Payment } from '../models/billing.model.intelligent.js';
import { tick, tickError, beginJob } from '../utils/cronRegistry.js';

const JOB = 'order_abandonment_expiry';

// Razorpay 'captured' and our own 'success' both mean money actually moved.
const SUCCESSFUL_PAYMENT = ['success', 'captured'];

// A payment that is still in flight — do not cancel the order underneath it.
const IN_FLIGHT_PAYMENT = ['initiated', 'pending', 'authorized', 'processing'];

export function getAbandonWindowMinutes() {
  const raw = Number(process.env.ORDER_ABANDON_MINUTES);
  return Number.isFinite(raw) && raw >= 5 ? raw : 30;
}

/**
 * Cancel stale unpaid 'pending' orders.
 * @param {{minutes?: number}} opts
 */
export async function expireAbandonedOrders({ minutes } = {}) {
  if (!(await beginJob(JOB))) return { skipped: true };

  const windowMinutes = Number.isFinite(minutes) && minutes >= 1 ? minutes : getAbandonWindowMinutes();

  try {
    const cutoff = new Date(Date.now() - windowMinutes * 60_000);

    const stale = await Order.findAll({
      where: { status: 'pending', createdAt: { [Op.lt]: cutoff } },
      attributes: ['id', 'orderNumber', 'userId', 'metadata'],
      limit: 500,
    });

    let expired = 0;
    let keptPaid = 0;
    let keptInFlight = 0;

    for (const order of stale) {
      const paid = await Payment.count({
        where: { orderId: order.id, status: { [Op.in]: SUCCESSFUL_PAYMENT } },
      });
      if (paid > 0) { keptPaid += 1; continue; }

      const inFlight = await Payment.count({
        where: { orderId: order.id, status: { [Op.in]: IN_FLIGHT_PAYMENT } },
      });
      if (inFlight > 0) { keptInFlight += 1; continue; }

      await order.update({
        status: 'cancelled',
        metadata: {
          ...(order.metadata || {}),
          cancelledReason: 'abandoned_checkout',
          cancelledBy: 'system',
          cancelledAt: new Date().toISOString(),
          abandonWindowMinutes: windowMinutes,
        },
      });
      expired += 1;
    }

    const result = { scanned: stale.length, expired, keptPaid, keptInFlight, windowMinutes };
    tick(JOB, result);
    return result;
  } catch (error) {
    tickError(JOB, error);
    throw error;
  }
}

export default { expireAbandonedOrders, getAbandonWindowMinutes, JOB };
