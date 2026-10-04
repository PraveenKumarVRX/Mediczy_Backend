/**
 * Purchase Notification Service
 *
 * Single place every payment-success code path calls into. Closes a gap found
 * during the 2026-09-15 micro-audit: purchases (lab/pharmacy orders, membership
 * upgrades) were being verified and recorded correctly, but nobody — not the
 * customer, not the team — was ever told. Money moved silently.
 *
 * Two responsibilities:
 *   1. Email the customer an order confirmation with an itemized invoice.
 *   2. Alert the internal team (ADMIN_ALERT_EMAILS) that a sale happened.
 *
 * Both are best-effort and never throw — a notification failure must never
 * fail or roll back the underlying purchase. Failures are logged loudly so
 * they show up in mediczy-server-error.log instead of disappearing.
 */

import { sendTransactionalEmail } from './welcome-email.service.js';

const ADMIN_ALERT_EMAILS = (process.env.PURCHASE_ALERT_EMAILS || 'parinitha@mysmarthealth.in,sk@mysmarthealth.in')
  .split(',')
  .map(e => e.trim())
  .filter(Boolean);

function formatMoney(amount, currency = 'INR') {
  const n = Number(amount || 0);
  const symbol = currency === 'INR' ? '₹' : `${currency} `;
  return `${symbol}${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateTime(date) {
  return new Date(date || Date.now()).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  }) + ' IST';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/**
 * Renders a self-contained invoice-style HTML email body.
 * lineItems: [{ description, quantity, unitPrice, total }]
 */
function buildInvoiceHtml({
  invoiceNumber,
  issueDate,
  customerName,
  customerEmail,
  customerPhone,
  lineItems,
  subtotal,
  tax,
  discount,
  total,
  currency = 'INR',
  paymentId,
  paymentMethod,
}) {
  const rows = (lineItems || []).map(item => `
    <tr>
      <td style="padding:10px 8px;border-bottom:1px solid #eee;">${escapeHtml(item.description)}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:center;">${item.quantity || 1}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right;">${formatMoney(item.unitPrice ?? item.total, currency)}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right;">${formatMoney(item.total, currency)}</td>
    </tr>`).join('');

  return `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;">
    <div style="background:#0f766e;padding:24px 32px;border-radius:8px 8px 0 0;">
      <h1 style="color:#fff;margin:0;font-size:20px;">Mediqzy</h1>
      <p style="color:#d1fae5;margin:4px 0 0;font-size:13px;">Order Confirmation &amp; Invoice</p>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;padding:24px 32px;border-radius:0 0 8px 8px;">
      <p style="margin:0 0 16px;">Hi ${escapeHtml(customerName || 'there')},</p>
      <p style="margin:0 0 20px;">Thank you for your purchase. Here are your order details:</p>

      <table style="width:100%;font-size:13px;color:#555;margin-bottom:16px;">
        <tr><td>Invoice No.</td><td style="text-align:right;font-weight:600;">${escapeHtml(invoiceNumber)}</td></tr>
        <tr><td>Date</td><td style="text-align:right;">${formatDateTime(issueDate)}</td></tr>
        <tr><td>Payment ID</td><td style="text-align:right;">${escapeHtml(paymentId || '—')}</td></tr>
        <tr><td>Payment Method</td><td style="text-align:right;text-transform:capitalize;">${escapeHtml(paymentMethod || 'Online')}</td></tr>
      </table>

      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:8px;text-align:left;">Item</th>
            <th style="padding:8px;text-align:center;">Qty</th>
            <th style="padding:8px;text-align:right;">Rate</th>
            <th style="padding:8px;text-align:right;">Amount</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <table style="width:100%;font-size:13px;margin-bottom:20px;">
        <tr><td style="text-align:right;padding:2px 0;">Subtotal</td><td style="text-align:right;width:110px;">${formatMoney(subtotal, currency)}</td></tr>
        ${Number(discount) > 0 ? `<tr><td style="text-align:right;padding:2px 0;color:#059669;">Discount</td><td style="text-align:right;color:#059669;">-${formatMoney(discount, currency)}</td></tr>` : ''}
        ${Number(tax) > 0 ? `<tr><td style="text-align:right;padding:2px 0;">Tax</td><td style="text-align:right;">${formatMoney(tax, currency)}</td></tr>` : ''}
        <tr><td style="text-align:right;padding:8px 0 0;font-weight:700;font-size:15px;border-top:2px solid #0f766e;">Total Paid</td><td style="text-align:right;padding:8px 0 0;font-weight:700;font-size:15px;border-top:2px solid #0f766e;">${formatMoney(total, currency)}</td></tr>
      </table>

      <p style="font-size:12px;color:#888;margin:0 0 4px;">Billed to: ${escapeHtml(customerName)} · ${escapeHtml(customerEmail || '')} ${customerPhone ? '· ' + escapeHtml(customerPhone) : ''}</p>
      <p style="font-size:12px;color:#888;margin:16px 0 0;">Questions about this order? Reply to this email or reach us at hello@mysmarthealth.in.</p>
    </div>
    <p style="text-align:center;font-size:11px;color:#aaa;margin-top:16px;">Mediqzy · This is an automated receipt for your records.</p>
  </div>`;
}

/**
 * Pharmacy orders keep their medicines in patient_pharmacy_orders, linked from the billing order
 * by metadata.pharmacyOrderId -> patient_pharmacy_orders.order_id (note: order_id, NOT id — the
 * table has no `id` column, which is why this link is easy to miss).
 *
 * Without this, buildOrderItemLabel() in billing.route.js returns the constant 'Pharmacy Order'
 * and the notifier synthesises a single anonymous line, so neither the customer's invoice nor the
 * team alert named a single medicine — the complaint that prompted this (2026-10-04).
 *
 * Best-effort: any failure returns null and the caller falls back to the old behaviour.
 */
async function resolvePharmacyLineItems(order) {
  const pharmacyOrderId = order?.metadata?.pharmacyOrderId;
  if (!pharmacyOrderId) return null;
  try {
    const { default: pool } = await import('../db/pgPool.js');
    const db = pool.pool || pool.default || pool;
    const { rows } = await db.query(
      `SELECT items, delivery_charge, delivery_type, delivery_address
         FROM patient_pharmacy_orders WHERE order_id = $1 LIMIT 1`,
      [pharmacyOrderId],
    );
    if (!rows.length || !Array.isArray(rows[0].items) || !rows[0].items.length) return null;

    const lineItems = rows[0].items.map((i) => {
      const name = String(i.brand_name || i.medicine_name || 'Medicine').trim();
      // Brand names usually already carry the strength ("A-Rosuvastatin 10mg"), so appending it
      // again reads as "A-Rosuvastatin 10mg 10mg Tablet" on a customer invoice.
      const strength = i.strength && !name.toLowerCase().includes(String(i.strength).toLowerCase())
        ? String(i.strength) : '';
      const spec = [strength, i.form].filter(Boolean).join(' ');
      const pack = i.pack_size ? ` — ${i.pack_size}` : '';
      const generic = i.generic_name && !name.toLowerCase().includes(String(i.generic_name).toLowerCase())
        ? ` [${i.generic_name}]` : '';
      return {
        description: `${name}${spec ? ' ' + spec : ''}${pack}${generic}`.trim(),
        quantity: i.quantity ?? 1,
        unitPrice: i.unit_price ?? i.line_total,
        total: i.line_total ?? i.unit_price,
      };
    });

    // Delivery is a charge the customer paid; it belongs on the invoice as its own line, not
    // folded silently into the total.
    const delivery = Number(rows[0].delivery_charge || 0);
    if (delivery > 0) {
      lineItems.push({ description: `Delivery (${rows[0].delivery_type || 'delivery'})`, quantity: 1, unitPrice: delivery, total: delivery });
    }
    return { lineItems, deliveryType: rows[0].delivery_type, deliveryAddress: rows[0].delivery_address };
  } catch (err) {
    console.error(`⚠️ Could not resolve pharmacy line items for order ${order?.id} (pharmacyOrderId ${pharmacyOrderId}):`, err.message);
    return null;
  }
}

async function sendCustomerPurchaseConfirmation(details) {
  if (!details.customerEmail) {
    console.warn(`[purchase-notification] No customer email on file for invoice ${details.invoiceNumber} — skipping confirmation email`);
    return;
  }
  try {
    await sendTransactionalEmail({
      to: details.customerEmail,
      subject: `Your Mediqzy order confirmation — ${details.invoiceNumber} (${formatMoney(details.total, details.currency)})`,
      html: buildInvoiceHtml(details),
      fromName: 'Mediqzy',
    });
    console.log(`✅ Purchase confirmation emailed to ${details.customerEmail} (${details.invoiceNumber})`);
  } catch (err) {
    console.error(`❌ Purchase confirmation email FAILED for ${details.invoiceNumber} → ${details.customerEmail}:`, err.message);
  }
}

async function sendAdminPurchaseAlert({
  customerName,
  customerEmail,
  customerPhone,
  employer,
  itemLabel,
  lineItems,
  deliveryType,
  deliveryAddress,
  amount,
  currency = 'INR',
  paymentId,
  gateway = 'razorpay',
  purchasedAt,
  invoiceNumber,
}) {
  if (ADMIN_ALERT_EMAILS.length === 0) return;

  // Itemise the alert. Before this, the team email carried only `itemLabel` — for a pharmacy
  // order that is the literal string 'Pharmacy Order' (buildOrderItemLabel in billing.route.js),
  // so the alert said money arrived and nothing about what was bought. The customer's invoice
  // already renders lineItems; the alert simply never received them.
  //
  // A single line whose description equals itemLabel adds nothing over the Item row, so it is
  // skipped — that is the synthesised fallback, not real detail.
  const items = Array.isArray(lineItems) ? lineItems.filter(Boolean) : [];
  const meaningful = items.length > 1
    || (items.length === 1 && String(items[0].description || '').trim() !== String(itemLabel || '').trim());
  const itemsBlock = meaningful ? `
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin:12px 0 4px;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:6px 8px;text-align:left;border-bottom:1px solid #e5e7eb;">Item</th>
            <th style="padding:6px 8px;text-align:center;border-bottom:1px solid #e5e7eb;">Qty</th>
            <th style="padding:6px 8px;text-align:right;border-bottom:1px solid #e5e7eb;">Rate</th>
            <th style="padding:6px 8px;text-align:right;border-bottom:1px solid #e5e7eb;">Amount</th>
          </tr>
        </thead>
        <tbody>${items.map((i) => `
          <tr>
            <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;">${escapeHtml(i.description)}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;text-align:center;">${escapeHtml(i.quantity ?? 1)}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;text-align:right;">${formatMoney(i.unitPrice ?? i.total, currency)}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;text-align:right;">${formatMoney(i.total, currency)}</td>
          </tr>`).join('')}
        </tbody>
      </table>` : '';

  // Say so explicitly when the detail is absent, rather than leaving the reader to wonder whether
  // the order really had one anonymous line. itemsCount comes from the order metadata.
  const noDetailNote = !meaningful ? `
      <p style="margin:10px 0 0;padding:8px 10px;background:#fffbeb;border-left:3px solid #f59e0b;font-size:12px;color:#92400e;">
        No itemised detail was recorded for this order, so only the total is shown.
        If this is a pharmacy order, the items are not persisted anywhere the notification can read.
      </p>` : '';

  // Fulfilment needs the destination, not just the money.
  const addr = deliveryAddress && typeof deliveryAddress === 'object'
    ? [deliveryAddress.line1, deliveryAddress.line2, deliveryAddress.city, deliveryAddress.state, deliveryAddress.pincode]
        .filter(Boolean).join(', ').replace(/\s+/g, ' ').trim()
    : (typeof deliveryAddress === 'string' ? deliveryAddress : '');
  const deliveryBlock = (deliveryType || addr) ? `
      <p style="margin:10px 0 0;font-size:13px;">
        <span style="color:#666;">Delivery</span>
        <strong style="text-transform:capitalize;">${escapeHtml(String(deliveryType || '').replace(/_/g, ' ') || '—')}</strong>
        ${addr ? `<br><span style="color:#666;">Address</span> ${escapeHtml(addr)}` : ''}
      </p>` : '';

  const html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:520px;margin:0 auto;">
      <h2 style="margin:0 0 12px;color:#0f766e;">💰 New purchase on Mediqzy</h2>
      <table style="width:100%;font-size:14px;border-collapse:collapse;">
        <tr><td style="padding:4px 0;color:#666;">Customer</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(customerName)}</td></tr>
        <tr><td style="padding:4px 0;color:#666;">Email</td><td style="padding:4px 0;">${escapeHtml(customerEmail || '—')}</td></tr>
        <tr><td style="padding:4px 0;color:#666;">Phone</td><td style="padding:4px 0;">${escapeHtml(customerPhone || '—')}</td></tr>
        ${employer ? `<tr><td style="padding:4px 0;color:#666;">Employer</td><td style="padding:4px 0;">${escapeHtml(employer)}</td></tr>` : ''}
        <tr><td style="padding:4px 0;color:#666;">Item</td><td style="padding:4px 0;">${escapeHtml(itemLabel)}</td></tr>
        <tr><td style="padding:4px 0;color:#666;">Amount</td><td style="padding:4px 0;font-weight:700;font-size:16px;">${formatMoney(amount, currency)}</td></tr>
        <tr><td style="padding:4px 0;color:#666;">Gateway / Payment ID</td><td style="padding:4px 0;">${escapeHtml(gateway)} / ${escapeHtml(paymentId || '—')}</td></tr>
        <tr><td style="padding:4px 0;color:#666;">Invoice</td><td style="padding:4px 0;">${escapeHtml(invoiceNumber || '—')}</td></tr>
        <tr><td style="padding:4px 0;color:#666;">Time</td><td style="padding:4px 0;">${formatDateTime(purchasedAt)}</td></tr>
      </table>
      ${itemsBlock}
      ${deliveryBlock}
      ${noDetailNote}
    </div>`;

  const subject = `💰 New purchase: ${formatMoney(amount, currency)} — ${itemLabel} — ${customerName}`;
  // Sent one-by-one (not a single multi-recipient call): the shared sendMail()
  // helper's SES path wraps `to` as `[msg.to]`, which breaks for an array or
  // comma-joined string of addresses.
  await Promise.all(ADMIN_ALERT_EMAILS.map(async (to) => {
    try {
      await sendTransactionalEmail({ to, subject, html, fromName: 'Mediqzy Alerts' });
      console.log(`✅ Admin purchase alert sent to ${to}`);
    } catch (err) {
      console.error(`❌ Admin purchase alert email FAILED for ${to}:`, err.message);
    }
  }));
}

/**
 * Orchestrator for real `orders` purchases (billing.route.js).
 * Idempotently creates the formal Invoice + PDF record (same logic as the
 * manual POST /invoices/generate route), then emails customer + admins.
 */
async function notifyOrderPurchase({ order, user, payment, lineItems, itemLabel }) {
  try {
    const { Invoice } = await import('../models/billing.model.intelligent.js');
    const invoiceService = (await import('./invoice.service.js')).default;
    const paymentGateway = (await import('./payment-gateway.service.js')).default;

    // Real medicines first; fall back to whatever the caller passed.
    const pharmacy = await resolvePharmacyLineItems(order);
    const effectiveLineItems = pharmacy?.lineItems || lineItems;

    let invoice = await Invoice.findOne({ where: { orderId: order.id } });
    if (!invoice) {
      const invoiceNumber = paymentGateway.generateInvoiceNumber();
      invoice = await Invoice.create({
        invoiceNumber,
        orderId: order.id,
        userId: user.id,
        issueDate: new Date(),
        dueDate: new Date(),
        status: 'paid',
        subtotal: order.subtotal,
        tax: order.tax,
        discount: order.discount,
        total: order.total,
        currency: order.currency || 'INR',
        lineItems: effectiveLineItems || [{ description: itemLabel, quantity: 1, unitPrice: order.total, total: order.total }],
        customerDetails: {
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
          email: user.email,
          phone: user.phoneNumber,
          address: order.billingAddress,
        },
      });

      try {
        const pdfResult = await invoiceService.generateInvoicePDF(invoice.toJSON());
        await invoice.update({ pdfUrl: pdfResult.url });
      } catch (pdfErr) {
        console.error(`⚠️ Invoice PDF generation failed for ${invoiceNumber} (order ${order.id}), continuing without PDF:`, pdfErr.message);
      }
    }

    const customerName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Customer';

    await Promise.all([
      sendCustomerPurchaseConfirmation({
        invoiceNumber: invoice.invoiceNumber,
        issueDate: invoice.issueDate,
        customerName,
        customerEmail: user.email,
        customerPhone: user.phoneNumber,
        lineItems: invoice.lineItems,
        subtotal: invoice.subtotal,
        tax: invoice.tax,
        discount: invoice.discount,
        total: invoice.total,
        currency: invoice.currency,
        paymentId: payment.gatewayPaymentId || payment.paymentId,
        paymentMethod: payment.method,
      }),
      sendAdminPurchaseAlert({
        customerName,
        customerEmail: user.email,
        customerPhone: user.phoneNumber,
        employer: user.employer_name,
        itemLabel: itemLabel || `Order #${order.orderNumber}`,
        lineItems: invoice.lineItems,
        deliveryType: pharmacy?.deliveryType,
        deliveryAddress: pharmacy?.deliveryAddress,
        amount: order.total,
        currency: order.currency,
        paymentId: payment.gatewayPaymentId || payment.paymentId,
        purchasedAt: new Date(),
        invoiceNumber: invoice.invoiceNumber,
      }),
    ]);
  } catch (err) {
    console.error(`❌ notifyOrderPurchase failed for order ${order?.id}:`, err.message);
  }
}

/**
 * Orchestrator for membership plan upgrades (membership.route.js).
 * These don't have an `orders` row to attach a formal Invoice to, so this
 * sends the same invoice-style email/alert using a synthetic invoice number,
 * without creating a DB Invoice record. (Follow-up: give membership upgrades
 * a proper orders row so they get full Invoice+PDF treatment too.)
 */
async function notifyMembershipPurchase({ user, plan, payment, previousPlanName, amountDue }) {
  try {
    const customerName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Customer';
    const invoiceNumber = `MEM-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Date.now()}`;
    const itemLabel = `Membership upgrade: ${previousPlanName ? previousPlanName + ' → ' : ''}${plan.name}`;

    const sends = [
      sendCustomerPurchaseConfirmation({
        invoiceNumber,
        issueDate: new Date(),
        customerName,
        customerEmail: user.email,
        customerPhone: user.phoneNumber,
        lineItems: [{ description: itemLabel, quantity: 1, unitPrice: amountDue, total: amountDue }],
        subtotal: amountDue,
        tax: 0,
        discount: 0,
        total: amountDue,
        currency: 'INR',
        paymentId: payment?.paymentId,
        paymentMethod: payment?.method || 'razorpay',
      }),
    ];

    if (Number(amountDue) > 0) {
      sends.push(sendAdminPurchaseAlert({
        customerName,
        customerEmail: user.email,
        customerPhone: user.phoneNumber,
        employer: user.employer_name,
        itemLabel,
        lineItems: [{ description: itemLabel, quantity: 1, unitPrice: amountDue, total: amountDue }],
        amount: amountDue,
        currency: 'INR',
        paymentId: payment?.paymentId,
        purchasedAt: new Date(),
        invoiceNumber,
      }));
    }

    await Promise.all(sends);
  } catch (err) {
    console.error(`❌ notifyMembershipPurchase failed for user ${user?.id}:`, err.message);
  }
}

export default {
  notifyOrderPurchase,
  notifyMembershipPurchase,
  sendCustomerPurchaseConfirmation,
  sendAdminPurchaseAlert,
};
