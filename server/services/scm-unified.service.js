/**
 * Unified SCM data layer — shared by /api/scm and /api/procurement.
 */
import { ensureAllScmTables } from '../migrations/scm-tables.migration.js';
import { connectPostgres } from '../db/postgres.js';

export const getScmDb = async () => {
  const db = await connectPostgres();
  await ensureAllScmTables(db);
  return db;
};

export const resolveItemId = async (db, { itemId, itemCode, description }) => {
  if (itemId) return Number(itemId);
  if (itemCode) {
    const { rows } = await db.query('SELECT id FROM scm_items WHERE item_code = $1', [itemCode]);
    if (rows[0]) return rows[0].id;
  }
  if (description) {
    const code = `AUTO-${Date.now()}`;
    const { rows } = await db.query(
      `INSERT INTO scm_items (item_code, name, category) VALUES ($1,$2,'Consumable') RETURNING id`,
      [code, description.slice(0, 240)]
    );
    return rows[0].id;
  }
  return null;
};

export const poStatusAfterReceipt = async (db, orderId) => {
  const { rows: lines } = await db.query(
    'SELECT quantity, received_quantity FROM scm_po_lines WHERE order_id = $1',
    [orderId]
  );
  if (!lines.length) return 'approved';
  const fullyReceived = lines.every((l) => Number(l.received_quantity) >= Number(l.quantity));
  const anyReceived = lines.some((l) => Number(l.received_quantity) > 0);
  if (fullyReceived) return 'received';
  if (anyReceived) return 'partial_receipt';
  return 'approved';
};

export const mapProcurementOrderRow = (row) => ({
  ...row,
  lines: (row.lines || []).map((l) => ({
    ...l,
    itemCode: l.item_code || l.itemCode,
    itemId: l.itemId || l.item_id,
  })),
});

export const scmOverviewMetrics = async (db) => {
  const { rows } = await db.query(`
    SELECT
      (SELECT COUNT(*)::int FROM scm_items WHERE status = 'active') AS active_items,
      (SELECT COUNT(*)::int FROM scm_purchase_orders WHERE status IN ('draft','submitted','approved','partial_receipt')) AS open_pos,
      (SELECT COUNT(*)::int FROM scm_purchase_orders WHERE status IN ('draft','submitted','approved')) AS open_orders,
      (SELECT COUNT(*)::int FROM scm_purchase_orders WHERE status = 'approved') AS awaiting_receipt,
      (SELECT COUNT(*)::int FROM scm_vendors WHERE status = 'approved') AS approved_vendors,
      (SELECT COUNT(*)::int FROM scm_grns WHERE received_at::date = CURRENT_DATE) AS todays_grns,
      (SELECT COUNT(*)::int FROM scm_ap_invoices WHERE status IN ('draft','matched','approved')) AS open_invoices,
      (SELECT COUNT(*)::int FROM scm_indents WHERE status IN ('submitted','approved')) AS open_indents,
      (SELECT COUNT(*)::int FROM scm_case_carts WHERE status IN ('preparing','ready')) AS active_case_carts,
      (SELECT COUNT(*)::int FROM scm_cycle_counts WHERE status = 'scheduled') AS scheduled_counts
  `);
  return rows[0];
};
