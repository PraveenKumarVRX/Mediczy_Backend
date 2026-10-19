/**
 * Pharmacy Inventory Routes
 *
 * Reads/writes the real catalog (`pharmacy_medicines`) joined with this pharmacy's
 * stock (`pharmacy_stock`) and batches (`pharmacy_batches`) — the same tables every
 * other pharmacy route (sales, batches, purchase orders, returns) already uses.
 * Response shapes are kept identical to the previous (disconnected flat-model)
 * implementation so the client needs no changes.
 */

import express from 'express';
import sharedPool from '../../db/pgPool.js';
import { requirePharmacyAuth } from '../../middleware/pharmacyAuth.middleware.js';
import cimsService from '../../services/cims-medicine.service.js';

const router = express.Router();

router.use(requirePharmacyAuth);

// Shape a joined (pharmacy_medicines + pharmacy_stock + nearest batch) row into the
// flat contract the client already parses (see client/src/pages/pharmacy/PharmacyModulePages.tsx
// `normalizeMedicine`).
function toClientShape(row) {
  const quantity = Number(row.quantity || 0);
  const reorderLevel = Number(row.reorder_level || 20);
  return {
    id: row.id,
    medicineName: row.name,
    name: row.name,
    genericName: row.generic_name,
    manufacturer: row.manufacturer,
    category: row.category || 'General',
    quantity,
    unit: row.form || 'unit',
    unitPrice: Number(row.unit_price || row.mrp || 0),
    mrp: Number(row.mrp || row.unit_price || 0),
    reorderLevel,
    batchNumber: row.batch_number || null,
    expiryDate: row.expiry_date || null,
    status: quantity <= reorderLevel ? 'Low Stock' : 'In Stock',
    location: row.supplier ? `Supplier: ${row.supplier}` : 'Unassigned',
  };
}

// Shared SELECT: catalog row + this pharmacy's stock quantity + nearest-expiry batch.
const BASE_SELECT = `
  SELECT pm.id, pm.name, pm.generic_name, pm.manufacturer, pm.category, pm.form,
         pm.mrp, pm.unit_price, pm.reorder_level,
         COALESCE(ps.quantity, 0) AS quantity,
         nb.batch_number, nb.expiry_date, nb.supplier
  FROM pharmacy_medicines pm
  JOIN pharmacy_stock ps ON ps.medicine_id = pm.id AND ps.pharmacy_id = $1
  LEFT JOIN LATERAL (
    SELECT batch_number, expiry_date, supplier
    FROM pharmacy_batches b
    WHERE b.pharmacy_id = $1 AND b.medicine_id = pm.id AND b.quantity > 0
    ORDER BY b.expiry_date NULLS LAST, b.created_at ASC
    LIMIT 1
  ) nb ON true
`;

/**
 * GET /api/pharmacy/inventory
 * List this pharmacy's stocked medicines (real catalog + stock, not demo data).
 */
router.get('/', async (req, res) => {
  try {
    const pharmacyId = req.pharmacyId;
    const { category, search, lowStock, page = 1, limit = 50 } = req.query;

    const conditions = [];
    const params = [pharmacyId];
    let idx = 2;

    if (category) {
      conditions.push(`pm.category ILIKE $${idx}`);
      params.push(category);
      idx++;
    }
    if (search) {
      conditions.push(`(pm.name ILIKE $${idx} OR pm.generic_name ILIKE $${idx} OR pm.manufacturer ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }
    if (lowStock === 'true') {
      conditions.push(`COALESCE(ps.quantity, 0) <= pm.reorder_level`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const safeLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (Math.max(1, parseInt(page, 10) || 1) - 1) * safeLimit;

    const [rowsResult, countResult] = await Promise.all([
      sharedPool.query(
        `${BASE_SELECT} ${where} ORDER BY pm.name ASC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, safeLimit, offset]
      ),
      sharedPool.query(
        `SELECT COUNT(*) FROM pharmacy_medicines pm JOIN pharmacy_stock ps ON ps.medicine_id = pm.id AND ps.pharmacy_id = $1 ${where}`,
        params
      ),
    ]);

    const total = parseInt(countResult.rows[0].count, 10);
    const medicines = rowsResult.rows.map(toClientShape);
    const lowStockCount = medicines.filter((m) => m.quantity <= m.reorderLevel).length;
    const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const expiringCount = medicines.filter((m) => m.expiryDate && new Date(m.expiryDate) <= thirtyDays).length;

    res.json({
      success: true,
      data: {
        total,
        medicines,
        stats: {
          totalItems: total,
          lowStock: lowStockCount,
          expiringSoon: expiringCount,
          categories: new Set(medicines.map((m) => m.category)).size,
        },
      },
      pagination: { page: parseInt(page, 10) || 1, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) },
    });
  } catch (error) {
    console.error('Inventory fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch inventory', error: error.message });
  }
});

/**
 * GET /api/pharmacy/inventory/search
 * Search this pharmacy's stocked medicines by name/generic/manufacturer.
 */
router.get('/search', async (req, res) => {
  try {
    const pharmacyId = req.pharmacyId;
    const { q, limit = 20 } = req.query;

    if (!q || q.length < 2) return res.json({ success: true, data: [] });

    const safeLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const result = await sharedPool.query(
      `${BASE_SELECT}
       WHERE pm.name ILIKE $2 OR pm.generic_name ILIKE $2 OR pm.manufacturer ILIKE $2
       ORDER BY pm.name ASC LIMIT $3`,
      [pharmacyId, `%${q}%`, safeLimit]
    );

    res.json({
      success: true,
      query: q,
      data: result.rows.map((row) => {
        const shaped = toClientShape(row);
        return { ...shaped, price: shaped.unitPrice, inStock: shaped.quantity > 0 };
      }),
    });
  } catch (error) {
    console.error('Medicine search error:', error);
    res.status(500).json({ success: false, message: 'Search failed', error: error.message });
  }
});

/**
 * GET /api/pharmacy/inventory/categories
 * Distinct categories across this pharmacy's stocked medicines.
 */
router.get('/categories', async (req, res) => {
  try {
    const pharmacyId = req.pharmacyId;
    const result = await sharedPool.query(
      `SELECT COALESCE(pm.category, 'General') AS name, COUNT(*) AS count
       FROM pharmacy_medicines pm
       JOIN pharmacy_stock ps ON ps.medicine_id = pm.id AND ps.pharmacy_id = $1
       GROUP BY 1 ORDER BY 1`,
      [pharmacyId]
    );
    res.json({ success: true, data: result.rows.map((r, idx) => ({ id: idx + 1, name: r.name, count: parseInt(r.count, 10) })) });
  } catch (error) {
    console.error('Categories fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch categories', error: error.message });
  }
});

/**
 * GET /api/pharmacy/inventory/:id
 * Detail view for one medicine this pharmacy stocks, including all its batches.
 */
router.get('/:id', async (req, res) => {
  try {
    const pharmacyId = req.pharmacyId;
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid medicine ID' });

    const result = await sharedPool.query(`${BASE_SELECT} WHERE pm.id = $2`, [pharmacyId, id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Medicine not found' });

    const batches = await sharedPool.query(
      `SELECT batch_number, quantity, expiry_date, supplier, created_at AS location
       FROM pharmacy_batches WHERE pharmacy_id = $1 AND medicine_id = $2 ORDER BY expiry_date NULLS LAST`,
      [pharmacyId, id]
    );

    const shaped = toClientShape(result.rows[0]);
    res.json({
      success: true,
      data: {
        ...shaped,
        stock: shaped.quantity,
        minStock: shaped.reorderLevel,
        price: shaped.unitPrice,
        description: 'Used for treatment as prescribed',
        batchDetails: batches.rows.map((b) => ({
          batchNumber: b.batch_number,
          quantity: b.quantity,
          expiryDate: b.expiry_date,
          location: b.supplier || 'Unassigned',
        })),
        salesHistory: [],
      },
    });
  } catch (error) {
    console.error('Medicine detail error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch medicine details', error: error.message });
  }
});

/**
 * POST /api/pharmacy/inventory
 * Add (or restock) a medicine: reuse the catalog row by name if it already exists
 * (same pattern as server/routes/pharmacy/stock.route.js), then add/increment this
 * pharmacy's stock row, and optionally create a batch if batch/expiry info is given.
 */
router.post('/', async (req, res) => {
  const client = await sharedPool.connect();
  try {
    const pharmacyId = req.pharmacyId;
    const {
      name, genericName, manufacturer, category, quantity,
      unit, price, mrp, batchNumber, expiryDate, reorderLevel, supplier,
    } = req.body;

    if (!name || !quantity) {
      return res.status(400).json({ success: false, message: 'Medicine name and quantity are required' });
    }

    const qty = parseInt(quantity, 10) || 0;
    const unitPrice = parseFloat(price) || 0;
    const mrpVal = parseFloat(mrp) || unitPrice;

    await client.query('BEGIN');

    const existing = await client.query(`SELECT * FROM pharmacy_medicines WHERE name ILIKE $1 LIMIT 1`, [name]);
    let medicine = existing.rows[0];
    if (!medicine) {
      const inserted = await client.query(
        `INSERT INTO pharmacy_medicines (name, generic_name, manufacturer, category, form, unit_price, mrp, reorder_level, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()) RETURNING *`,
        [name, genericName || null, manufacturer || null, category || null, unit || null, unitPrice, mrpVal, parseInt(reorderLevel, 10) || 20]
      );
      medicine = inserted.rows[0];
    }

    const existingStock = await client.query(
      `SELECT * FROM pharmacy_stock WHERE pharmacy_id = $1 AND medicine_id = $2 LIMIT 1`,
      [pharmacyId, medicine.id]
    );

    let stock;
    if (existingStock.rows.length) {
      const updated = await client.query(
        `UPDATE pharmacy_stock SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [qty, existingStock.rows[0].id]
      );
      stock = updated.rows[0];
    } else {
      const created = await client.query(
        `INSERT INTO pharmacy_stock (pharmacy_id, medicine_id, quantity, expiry_date, batch_number, supplier, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) RETURNING *`,
        [pharmacyId, medicine.id, qty, expiryDate || null, batchNumber || null, supplier || null]
      );
      stock = created.rows[0];
    }

    if (batchNumber) {
      await client.query(
        `INSERT INTO pharmacy_batches (pharmacy_id, medicine_id, batch_number, quantity, expiry_date, supplier, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
         ON CONFLICT (batch_number) DO UPDATE SET quantity = pharmacy_batches.quantity + EXCLUDED.quantity, updated_at = NOW()`,
        [pharmacyId, medicine.id, batchNumber, qty, expiryDate || null, supplier || null]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Medicine added to inventory',
      data: toClientShape({ ...medicine, quantity: stock.quantity, batch_number: batchNumber, expiry_date: expiryDate, supplier }),
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Add medicine error:', error);
    res.status(500).json({ success: false, message: 'Failed to add medicine', error: error.message });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/pharmacy/inventory/:id
 * Update catalog fields for a medicine (shared across pharmacies, same as /api/pharmacy/medicines).
 */
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, genericName, manufacturer, category, unit, price, reorderLevel } = req.body;
    if (!id) return res.status(400).json({ success: false, message: 'Invalid medicine ID' });

    const result = await sharedPool.query(
      `UPDATE pharmacy_medicines SET
         name = COALESCE($1, name), generic_name = COALESCE($2, generic_name),
         manufacturer = COALESCE($3, manufacturer), category = COALESCE($4, category),
         form = COALESCE($5, form), unit_price = COALESCE($6, unit_price),
         reorder_level = COALESCE($7, reorder_level), updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [name || null, genericName || null, manufacturer || null, category || null, unit || null,
       price !== undefined ? parseFloat(price) : null, reorderLevel !== undefined ? parseInt(reorderLevel, 10) : null, id]
    );

    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Medicine not found' });
    res.json({ success: true, message: 'Medicine updated successfully', data: { id, ...req.body, updatedAt: new Date().toISOString() } });
  } catch (error) {
    console.error('Update medicine error:', error);
    res.status(500).json({ success: false, message: 'Failed to update medicine', error: error.message });
  }
});

/**
 * PUT /api/pharmacy/inventory/:id/stock
 * Adjust this pharmacy's stock quantity for a medicine directly (manual correction).
 */
router.put('/:id/stock', async (req, res) => {
  try {
    const pharmacyId = req.pharmacyId;
    const medicineId = parseInt(req.params.id, 10);
    const { quantity, operation = 'set' } = req.body;
    const qty = parseInt(quantity, 10) || 0;

    const existing = await sharedPool.query(
      `SELECT * FROM pharmacy_stock WHERE pharmacy_id = $1 AND medicine_id = $2 LIMIT 1`,
      [pharmacyId, medicineId]
    );

    if (!existing.rows.length) {
      const created = await sharedPool.query(
        `INSERT INTO pharmacy_stock (pharmacy_id, medicine_id, quantity, created_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW()) RETURNING *`,
        [pharmacyId, medicineId, qty]
      );
      return res.json({ success: true, message: 'Stock updated successfully', data: { id: medicineId, previousStock: 0, newStock: created.rows[0].quantity } });
    }

    const previous = existing.rows[0].quantity;
    let newQuantity = qty;
    if (operation === 'add') newQuantity = previous + qty;
    if (operation === 'subtract') newQuantity = Math.max(0, previous - qty);

    await sharedPool.query(`UPDATE pharmacy_stock SET quantity = $1, updated_at = NOW() WHERE id = $2`, [newQuantity, existing.rows[0].id]);
    res.json({ success: true, message: 'Stock updated successfully', data: { id: medicineId, previousStock: previous, newStock: newQuantity } });
  } catch (error) {
    console.error('Stock update error:', error);
    res.status(500).json({ success: false, message: 'Failed to update stock', error: error.message });
  }
});

/**
 * DELETE /api/pharmacy/inventory/:id
 * Remove this pharmacy's stock row for a medicine (catalog row itself is shared, not deleted).
 */
router.delete('/:id', async (req, res) => {
  try {
    const pharmacyId = req.pharmacyId;
    const medicineId = parseInt(req.params.id, 10);
    const result = await sharedPool.query(
      `DELETE FROM pharmacy_stock WHERE pharmacy_id = $1 AND medicine_id = $2 RETURNING id`,
      [pharmacyId, medicineId]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Medicine not found in your inventory' });
    res.json({ success: true, message: 'Medicine removed from inventory', data: { id: medicineId } });
  } catch (error) {
    console.error('Delete medicine error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete medicine', error: error.message });
  }
});

/**
 * GET /api/pharmacy/inventory/search/:query (legacy path kept for compatibility)
 */
router.get('/search/:query', async (req, res) => {
  try {
    const pharmacyId = req.pharmacyId;
    const result = await sharedPool.query(
      `${BASE_SELECT} WHERE pm.name ILIKE $2 OR pm.generic_name ILIKE $2 ORDER BY pm.name ASC LIMIT 20`,
      [pharmacyId, `%${req.params.query}%`]
    );
    res.json({
      success: true,
      query: req.params.query,
      results: result.rows.map((row) => {
        const shaped = toClientShape(row);
        return { id: shaped.id, name: shaped.name, genericName: shaped.genericName, category: shaped.category, stock: shaped.quantity, price: shaped.unitPrice };
      }),
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ success: false, message: 'Search failed', error: error.message });
  }
});

// ============================================
// CIMS Medicine Reference Database Routes
// (independent reference dataset, unrelated to this pharmacy's stock — unchanged)
// ============================================

router.get('/cims/search', async (req, res) => {
  try {
    const { q, page = 1, limit = 50, cursor } = req.query;
    const useCursor = Object.prototype.hasOwnProperty.call(req.query, 'cursor');
    if (!q || q.length < 2) return res.json({ success: true, data: [], message: 'Enter at least 2 characters' });
    const results = cimsService.searchByName(q, { page: parseInt(page), limit: parseInt(limit), cursor, useCursor });
    res.json({
      success: true, query: q, total: results.total, data: results.data,
      pagination: cursor ? { cursor: results.cursor, nextCursor: results.nextCursor, limit: results.limit }
                          : { page: results.page, limit: results.limit, totalPages: results.totalPages },
    });
  } catch (error) {
    console.error('CIMS search error:', error);
    res.status(500).json({ success: false, message: 'CIMS search failed', error: error.message });
  }
});

router.get('/cims/categories', async (req, res) => {
  try {
    res.json({ success: true, data: cimsService.getCategories() });
  } catch (error) {
    console.error('CIMS categories error:', error);
    res.status(500).json({ success: false, message: 'Failed to get categories', error: error.message });
  }
});

router.get('/cims/category/:categoryName', async (req, res) => {
  try {
    const { categoryName } = req.params;
    const { page = 1, limit = 100, cursor } = req.query;
    const useCursor = Object.prototype.hasOwnProperty.call(req.query, 'cursor');
    const results = cimsService.getByCategory(categoryName, { page: parseInt(page), limit: parseInt(limit), cursor, useCursor });
    res.json({
      success: true, category: categoryName, total: results.total, data: results.data,
      pagination: cursor ? { cursor: results.cursor, nextCursor: results.nextCursor, limit: results.limit }
                          : { page: results.page, limit: results.limit, totalPages: results.totalPages },
    });
  } catch (error) {
    console.error('CIMS category fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to get medicines by category', error: error.message });
  }
});

router.get('/cims/medicine/:id', async (req, res) => {
  try {
    const medicine = cimsService.getById(req.params.id);
    if (!medicine) return res.status(404).json({ success: false, message: 'Medicine not found in CIMS database' });
    res.json({ success: true, data: medicine });
  } catch (error) {
    console.error('CIMS medicine fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to get medicine details', error: error.message });
  }
});

router.get('/cims/alternatives/:medicineId', async (req, res) => {
  try {
    const { medicineId } = req.params;
    const { page = 1, limit = 10, cursor } = req.query;
    const useCursor = Object.prototype.hasOwnProperty.call(req.query, 'cursor');
    const alternatives = cimsService.getAlternatives(medicineId, { page: parseInt(page), limit: parseInt(limit), cursor, useCursor });
    res.json({
      success: true, medicineId, total: alternatives.total, data: alternatives.data,
      pagination: cursor ? { cursor: alternatives.cursor, nextCursor: alternatives.nextCursor, limit: alternatives.limit }
                          : { page: alternatives.page, limit: alternatives.limit, totalPages: alternatives.totalPages },
    });
  } catch (error) {
    console.error('CIMS alternatives error:', error);
    res.status(500).json({ success: false, message: 'Failed to get alternatives', error: error.message });
  }
});

router.get('/cims/indication/:indication', async (req, res) => {
  try {
    const { indication } = req.params;
    const { page = 1, limit = 30, cursor } = req.query;
    const useCursor = Object.prototype.hasOwnProperty.call(req.query, 'cursor');
    const results = cimsService.searchByIndication(indication, { page: parseInt(page), limit: parseInt(limit), cursor, useCursor });
    res.json({
      success: true, indication, total: results.total, data: results.data,
      pagination: cursor ? { cursor: results.cursor, nextCursor: results.nextCursor, limit: results.limit }
                          : { page: results.page, limit: results.limit, totalPages: results.totalPages },
    });
  } catch (error) {
    console.error('CIMS indication search error:', error);
    res.status(500).json({ success: false, message: 'Failed to search by indication', error: error.message });
  }
});

router.get('/cims/stats', async (req, res) => {
  try {
    res.json({ success: true, data: cimsService.getStats() });
  } catch (error) {
    console.error('CIMS stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to get statistics', error: error.message });
  }
});

router.get('/cims/otc', async (req, res) => {
  try {
    const { page = 1, limit = 100, cursor } = req.query;
    const useCursor = Object.prototype.hasOwnProperty.call(req.query, 'cursor');
    const otcMedicines = cimsService.getOTCMedicines({ page: parseInt(page), limit: parseInt(limit), cursor, useCursor });
    res.json({
      success: true, total: otcMedicines.total, data: otcMedicines.data,
      pagination: cursor ? { cursor: otcMedicines.cursor, nextCursor: otcMedicines.nextCursor, limit: otcMedicines.limit }
                          : { page: otcMedicines.page, limit: otcMedicines.limit, totalPages: otcMedicines.totalPages },
    });
  } catch (error) {
    console.error('CIMS OTC fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to get OTC medicines', error: error.message });
  }
});

router.get('/cims/pregnancy-safe', async (req, res) => {
  try {
    const { page = 1, limit = 50, cursor } = req.query;
    const useCursor = Object.prototype.hasOwnProperty.call(req.query, 'cursor');
    const safeMedicines = cimsService.getPregnancySafe({ page: parseInt(page), limit: parseInt(limit), cursor, useCursor });
    res.json({
      success: true, total: safeMedicines.total, data: safeMedicines.data,
      pagination: cursor ? { cursor: safeMedicines.cursor, nextCursor: safeMedicines.nextCursor, limit: safeMedicines.limit }
                          : { page: safeMedicines.page, limit: safeMedicines.limit, totalPages: safeMedicines.totalPages },
    });
  } catch (error) {
    console.error('CIMS pregnancy-safe fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to get pregnancy-safe medicines', error: error.message });
  }
});

router.post('/cims/advanced-search', async (req, res) => {
  try {
    const results = cimsService.advancedSearch(req.body);
    res.json({
      success: true, total: results.total, data: results.data,
      pagination: req.body?.cursor ? { cursor: results.cursor, nextCursor: results.nextCursor, limit: results.limit }
                                    : { page: results.page, limit: results.limit, totalPages: results.totalPages },
    });
  } catch (error) {
    console.error('CIMS advanced search error:', error);
    res.status(500).json({ success: false, message: 'Advanced search failed', error: error.message });
  }
});

export default router;
