import { postgresSequelize as db } from '../db/postgres-sequelize.js';
import { setRlsContext } from '../middleware/rls-context.middleware.js';

// Durable, idempotent follow-ups for pending care. Paid/unknown-payment orders
// retain their state so a service delay cannot silently discard a payment.
export async function followUpUnconfirmedCare({ database = db, setContext = setRlsContext } = {}) {
  return database.transaction(async transaction => {
    await setContext(transaction, { orgId: 0, userId: 0, isPlatformAdmin: true });
    const query = (sql, replacements = {}) => database.query(sql, { transaction, replacements, type: database.QueryTypes.SELECT });
    const notify = (row, title, message, route) => query(`INSERT INTO notifications
      ("userId", "userType", type, title, message, "isRead", status, channels, "webRoute", "createdAt", "updatedAt")
      VALUES (:userId, 'patient', 'warning', :title, :message, false, 'sent', ARRAY['app'], :route, NOW(), NOW()) RETURNING id`,
    { userId: row.userId, title, message, route });

    const appointments = await query(`SELECT id, "userId", "doctorName", "appointmentDate", "appointmentTime" FROM appointments
      WHERE status::text IN ('scheduled','pending','rescheduled','pending_confirmation')
        -- Doctor consultations only: a lab booking (consultationType 'lab-test', no doctor)
        -- has its own 48-hour lab follow-up below and is never "waiting for the call".
        AND "doctorId" IS NOT NULL
        AND COALESCE("consultationType"::text, '') <> 'lab-test'
        AND ("appointmentDate"::text || 'T' || LEFT("appointmentTime"::text,5) || ':00+05:30')::timestamptz BETWEEN NOW() AND NOW() + INTERVAL '30 minutes'
        AND COALESCE(metadata->>'confirmationFollowupSlot','') <> ("appointmentDate"::text || '/' || "appointmentTime"::text)
      ORDER BY "appointmentDate", "appointmentTime" FOR UPDATE SKIP LOCKED LIMIT 100`);
    for (const row of appointments) {
      await notify(row, 'Doctor confirmation pending', `Your appointment with ${row.doctorName || 'your doctor'} starts within 30 minutes and is still awaiting confirmation. Contact support before travelling or waiting for the call.`, '/appointments');
      await query(`UPDATE appointments SET metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('confirmationFollowupSlot', "appointmentDate"::text || '/' || "appointmentTime"::text) WHERE id = :id RETURNING id`, { id: row.id });
    }

    const labTests = await query(`SELECT id, "userId", "testName" FROM lab_tests
      WHERE status = 'pending_confirmation' AND "createdAt" < NOW() - INTERVAL '48 hours'
        AND metadata->>'careFollowupNotified' IS NULL ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 100`);
    for (const row of labTests) {
      await notify(row, 'Lab confirmation delayed', `Your ${row.testName || 'lab test'} booking has not been confirmed within 48 hours. Contact support to arrange confirmation, cancellation or a payment review.`, '/patient/lab-tests');
      await query(`UPDATE lab_tests SET metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('careFollowupNotified', NOW()) WHERE id = :id RETURNING id`, { id: row.id });
    }

    const pharmacyOrders = await query(`SELECT id, "userId", "orderNumber" FROM orders
      WHERE "orderType" = 'medicine' AND status = 'pending' AND "createdAt" < NOW() - INTERVAL '48 hours'
        AND metadata->>'careFollowupNotified' IS NULL ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 100`);
    for (const row of pharmacyOrders) {
      await notify(row, 'Pharmacy confirmation delayed', `Medicine order ${row.orderNumber} has not been confirmed within 48 hours. Contact support for fulfilment, cancellation or a payment review.`, '/patient/pharmacy');
      await query(`UPDATE orders SET metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('careFollowupNotified', NOW()) WHERE id = :id RETURNING id`, { id: row.id });
    }
    const result = { appointments: appointments.length, labTests: labTests.length, pharmacyOrders: pharmacyOrders.length };
    if (appointments.length || labTests.length || pharmacyOrders.length) console.warn('[CareFollowup] Confirmation delays require operations review:', JSON.stringify(result));
    return result;
  });
}
