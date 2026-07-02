/**
 * PAR-level auto-reorder — scans scm_locations par levels vs on-hand stock.
 */
import cron from 'node-cron';
import { tick, tickError, tickStart } from '../utils/cronRegistry.js';
import { getScmDb, poStatusAfterReceipt } from './scm-unified.service.js';
import { requestOperationsApproval } from './operations-governance.service.js';

const DEFAULT_VENDOR_ID = null;

async function findPreferredVendor(db, itemId) {
  const { rows } = await db.query(`
    SELECT vendor_id, contract_price FROM scm_vendor_catalogue
    WHERE item_id = $1 AND status = 'active'
    ORDER BY contract_price ASC NULLS LAST LIMIT 1
  `, [itemId]);
  return rows[0] || null;
}

export async function runParReorderScan({ autoCreatePo = false } = {}) {
  const db = await getScmDb();
  const { rows: parGaps } = await db.query(`
    SELECT loc.id AS location_id, loc.warehouse_id, loc.par_level, loc.code AS location_code,
           i.id AS item_id, i.item_code, i.name,
           COALESCE(SUM(l.quantity_delta), 0)::numeric AS on_hand
    FROM scm_locations loc
    JOIN scm_items i ON i.status = 'active'
    LEFT JOIN scm_inventory_ledger l ON l.item_id = i.id AND l.warehouse_id = loc.warehouse_id
    WHERE loc.par_level > 0
    GROUP BY loc.id, loc.warehouse_id, loc.par_level, loc.code, i.id, i.item_code, i.name
    HAVING COALESCE(SUM(l.quantity_delta), 0) < loc.par_level
    LIMIT 50
  `);

  const results = [];
  for (const gap of parGaps) {
    const suggestedQty = Math.max(Number(gap.par_level) * 2 - Number(gap.on_hand), Number(gap.par_level));
    const catalogue = await findPreferredVendor(db, gap.item_id);
    let poId = null;
    let status = 'suggested';

    if (autoCreatePo && catalogue?.vendor_id) {
      const unitPrice = Number(catalogue.contract_price || 100);
      const { rows: po } = await db.query(`
        INSERT INTO scm_purchase_orders (po_number, vendor_id, department, requested_by, total_amount, status)
        VALUES ($1,$2,'PAR Auto','PAR-Cron',$3,'submitted') RETURNING *
      `, [`PO-PAR-${Date.now()}-${gap.item_id}`, catalogue.vendor_id, suggestedQty * unitPrice]);
      await db.query(
        'INSERT INTO scm_po_lines (order_id, item_id, description, quantity, unit_price) VALUES ($1,$2,$3,$4,$5)',
        [po[0].id, gap.item_id, gap.name, suggestedQty, unitPrice]
      );
      await requestOperationsApproval(db, {
        module: 'scm', entityType: 'order', entityId: po[0].id,
        action: 'approve_po', requestedBy: 'PAR-Cron',
      });
      poId = po[0].id;
      status = 'po_created';
    }

    await db.query(`
      INSERT INTO scm_par_reorder_log (location_id, item_id, on_hand, par_level, suggested_qty, po_id, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `, [gap.location_id, gap.item_id, gap.on_hand, gap.par_level, suggestedQty, poId, status]);

    results.push({ itemId: gap.item_id, locationId: gap.location_id, suggestedQty, poId, status });
  }
  return { scanned: parGaps.length, actions: results.length, results };
}

export function startScmParReorderCron() {
  // Every 6 hours at :45
  cron.schedule('45 */6 * * *', async () => {
    tickStart('scm_par_reorder');
    try {
      const result = await runParReorderScan({ autoCreatePo: process.env.SCM_PAR_AUTO_PO === 'true' });
      tick('scm_par_reorder', result);
    } catch (err) {
      tickError('scm_par_reorder', err.message);
    }
  });
  console.log('[SCM] PAR auto-reorder cron scheduled (every 6h)');
}

export default { runParReorderScan, startScmParReorderCron };
