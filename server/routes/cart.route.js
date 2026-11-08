import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import pool from '../db/pgPool.js';

const router = express.Router();

// In-memory cart store (can be replaced with Redis or database)
// For production, use Redis or a Cart table in database
const cartStore = new Map();

/**
 * Cart Routes
 * ===========
 * API endpoints for lab test cart management.
 *
 * Pricing is SERVER-AUTHORITATIVE (W-LAB-2 / D-8): the client may send a test
 * object, but its `price` is never trusted. Every item is re-priced from the
 * api_lab_tests catalogue — the same source the booking endpoint recomputes
 * from — so the cart can never disagree with the catalogue (CBC showed ₹1,000
 * in the cart and ₹500 in the app) and a crafted payload can't set its own price.
 * Tests that are not in the active catalogue, or have no confirmed price, are
 * refused on add and dropped on sync (consistent with BUG-04 hiding unpriced tests).
 */

const CATALOGUE_SQL = `
  SELECT test_id, name, test_code, price, currency, home_collection_charge
    FROM api_lab_tests
   WHERE status = 'active'
     AND price IS NOT NULL
     AND price::numeric >= 0
     AND (
       test_id::text = ANY($1::text[])
       OR LOWER(test_code) IN (SELECT LOWER(x) FROM unnest($1::text[]) AS x)
       OR LOWER(name)      IN (SELECT LOWER(x) FROM unnest($1::text[]) AS x)
     )`;

/** Look up catalogue rows by test_id / test_code / name, keyed lowercase. */
async function catalogueByIdentifier(identifiers) {
  const ids = [...new Set((identifiers || []).filter((v) => v !== null && v !== undefined).map(String))];
  const map = new Map();
  if (!ids.length) return map;
  const { rows } = await pool.query(CATALOGUE_SQL, [ids]);
  for (const row of rows) {
    for (const key of [row.test_id, row.test_code, row.name]) {
      if (key !== null && key !== undefined) map.set(String(key).toLowerCase(), row);
    }
  }
  return map;
}

const itemIdentifier = (item) => (item?.test?.id ?? item?.id ?? null);

/** Replace each item's price with the catalogue price. Returns { items, dropped }. */
async function repriceItems(rawItems) {
  const source = Array.isArray(rawItems) ? rawItems : [];
  const map = await catalogueByIdentifier(source.map(itemIdentifier));
  const items = [];
  const dropped = [];

  for (const item of source) {
    const test = item?.test || item;
    const row = map.get(String(itemIdentifier(item) ?? '').toLowerCase());
    if (!row) { dropped.push(itemIdentifier(item)); continue; }
    items.push({
      ...item,
      quantity: Math.max(1, Number(item?.quantity) || 1),
      test: {
        ...test,
        id: test?.id ?? row.test_id,
        catalogTestId: row.test_id,
        name: row.name,
        price: Number(row.price),
        currency: row.currency || 'INR',
        homeCollectionCharge: row.home_collection_charge === null || row.home_collection_charge === undefined
          ? null
          : Number(row.home_collection_charge),
        priceSource: 'catalog',
      },
    });
  }
  return { items, dropped };
}

/** Total from server-priced items (Number, not parseInt — decimals were being mangled). */
const cartTotal = (items) => (Array.isArray(items) ? items : []).reduce(
  (sum, item) => sum + (Number(item?.test?.price) || 0) * (Number(item?.quantity) || 1),
  0
);

const getCart = (userId) => cartStore.get(userId) || { items: [], updatedAt: new Date() };

// GET /api/cart - Get user's cart (re-priced against the live catalogue)
router.get('/', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const cart = getCart(userId);
    const { items, dropped } = await repriceItems(cart.items);

    cart.items = items;
    cart.updatedAt = new Date();
    cartStore.set(userId, cart);

    res.json({
      success: true,
      cart: items,
      total: cartTotal(items),
      itemCount: items.length,
      ...(dropped.length ? { removedUnavailable: dropped } : {}),
      updatedAt: cart.updatedAt,
    });
  } catch (error) {
    console.error('Error getting cart:', error);
    res.status(500).json({ success: false, message: 'Failed to get cart' });
  }
});

// POST /api/cart/add - Add item to cart
router.post('/add', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const quantity = Math.max(1, Number(req.body?.quantity) || 1);

    // Accept both { test: {...}, quantity } and the item object directly
    const test = req.body.test || (req.body.id ? req.body : null);

    if (!test || !test.id) {
      return res.status(400).json({ success: false, message: 'Test item is required' });
    }

    // Resolve against the catalogue — the client's price is ignored.
    const { items: resolved } = await repriceItems([{ test, quantity }]);
    if (!resolved.length) {
      return res.status(400).json({
        success: false,
        message: 'This test is not available for booking right now.',
        errorCode: 'TEST_NOT_BOOKABLE',
      });
    }
    const pricedItem = resolved[0];

    const cart = getCart(userId);
    const existingIndex = cart.items.findIndex((item) => String(itemIdentifier(item)) === String(test.id));

    if (existingIndex >= 0) {
      cart.items[existingIndex] = {
        ...pricedItem,
        quantity: (Number(cart.items[existingIndex].quantity) || 1) + quantity,
      };
    } else {
      cart.items.push(pricedItem);
    }

    cart.updatedAt = new Date();
    cartStore.set(userId, cart);

    res.json({
      success: true,
      message: 'Item added to cart',
      cart: cart.items,
      itemCount: cart.items.length,
      total: cartTotal(cart.items),
    });
  } catch (error) {
    console.error('Error adding to cart:', error);
    res.status(500).json({ success: false, message: 'Failed to add to cart' });
  }
});

// DELETE /api/cart/remove/:testId - Remove item from cart
router.delete('/remove/:testId', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { testId } = req.params;

    const cart = getCart(userId);
    cart.items = cart.items.filter((item) => String(itemIdentifier(item)) !== String(testId));
    cart.updatedAt = new Date();
    cartStore.set(userId, cart);

    res.json({
      success: true,
      message: 'Item removed from cart',
      cart: cart.items,
      itemCount: cart.items.length,
      total: cartTotal(cart.items),
    });
  } catch (error) {
    console.error('Error removing from cart:', error);
    res.status(500).json({ success: false, message: 'Failed to remove from cart' });
  }
});

// PUT /api/cart/update/:testId - Update item quantity
router.put('/update/:testId', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { testId } = req.params;
    const quantity = Number(req.body?.quantity);

    if (!Number.isFinite(quantity) || quantity < 1) {
      return res.status(400).json({ success: false, message: 'Quantity must be at least 1' });
    }

    const cart = getCart(userId);
    const itemIndex = cart.items.findIndex((item) => String(itemIdentifier(item)) === String(testId));
    if (itemIndex >= 0) {
      cart.items[itemIndex].quantity = quantity;
      cart.updatedAt = new Date();
      cartStore.set(userId, cart);
    }

    res.json({
      success: true,
      message: 'Cart updated',
      cart: cart.items,
      itemCount: cart.items.length,
      total: cartTotal(cart.items),
    });
  } catch (error) {
    console.error('Error updating cart:', error);
    res.status(500).json({ success: false, message: 'Failed to update cart' });
  }
});

// DELETE /api/cart/clear - Clear entire cart
router.delete('/clear', authUser, async (req, res) => {
  try {
    const userId = req.user.id;

    cartStore.set(userId, { items: [], updatedAt: new Date() });

    res.json({
      success: true,
      message: 'Cart cleared',
      cart: [],
      itemCount: 0,
      total: 0,
    });
  } catch (error) {
    console.error('Error clearing cart:', error);
    res.status(500).json({ success: false, message: 'Failed to clear cart' });
  }
});

// POST /api/cart/sync - Sync local cart with server (re-priced; unknown tests dropped)
router.post('/sync', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { items } = req.body;

    if (!Array.isArray(items)) {
      return res.status(400).json({ success: false, message: 'Items must be an array' });
    }

    const { items: priced, dropped } = await repriceItems(items);
    const cart = { items: priced, updatedAt: new Date() };
    cartStore.set(userId, cart);

    res.json({
      success: true,
      message: 'Cart synced',
      cart: cart.items,
      itemCount: cart.items.length,
      total: cartTotal(cart.items),
      ...(dropped.length ? { removedUnavailable: dropped } : {}),
    });
  } catch (error) {
    console.error('Error syncing cart:', error);
    res.status(500).json({ success: false, message: 'Failed to sync cart' });
  }
});

export default router;
