import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import { catalogueByIdentifier } from '../services/lab-booking-pricing.service.js';

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

// The catalogue lookup is shared with GET /labs/:labId/tests and POST
// /labs/book(/quote), so a test the listing offers is one the cart accepts and
// the booking prices the same way (QA-06).
const itemIdentifier = (item) => (item?.test?.id ?? item?.id ?? null);

/**
 * The catalogue row an item resolved to, which is what makes two items "the
 * same test". The client may name a test by test_id, test_code or name, and
 * CATALOGUE_SQL accepts all three — so two adds of one test can arrive under
 * two different identifiers. Comparing the raw client identifier let the same
 * test sit in the cart twice (CBC from MEDALL appeared as 2 items).
 */
const catalogueKey = (item) => {
  const test = item?.test || item;
  return test?.catalogTestId === null || test?.catalogTestId === undefined
    ? null
    : String(test.catalogTestId).toLowerCase();
};

/** Does this cart item answer to `identifier` in any of the forms the catalogue accepts? */
const itemAnswersTo = (item, identifier) => {
  const wanted = String(identifier ?? '').toLowerCase();
  if (!wanted) return false;
  const test = item?.test || item;
  return [itemIdentifier(item), test?.catalogTestId, test?.test_code, test?.testCode, test?.name]
    .some((candidate) => candidate !== null && candidate !== undefined && String(candidate).toLowerCase() === wanted);
};

/**
 * A diagnostic test is ordered once per booking, so every cart line is a single
 * unit.
 *
 * prepareLabCheckout (patient-lab-checkout.service.js) reduces the selection to
 * `[...new Set(testIds)]` and prices each distinct test exactly once; it never
 * reads a quantity. A cart that counted the same CBC twice therefore showed
 * ₹598 for a booking that would be billed ₹299 — the very cart-vs-catalogue
 * disagreement this file's header says it exists to prevent. Keeping the line
 * at one unit makes the displayed total the total that will actually be charged.
 */
const LAB_TEST_QUANTITY = 1;

/**
 * Replace each item's price with the catalogue price, and collapse items that
 * resolve to the SAME catalogue row into one line. Returns { items, dropped, merged }.
 *
 * The collapse belongs here rather than only in POST /add, because /add is not
 * the path the app uses: it keeps a local cart and pushes the whole array to
 * POST /sync, which used to reprice each entry and store them all. One CBC
 * chosen twice therefore came back as two ₹299 lines totalling ₹598 for a
 * single test (mobile 1.3.0 QA row 113). Collapsing inside repriceItems also
 * means GET /api/cart heals a cart that already holds duplicates.
 */
async function repriceItems(rawItems) {
  const source = Array.isArray(rawItems) ? rawItems : [];
  const map = await catalogueByIdentifier(source.map(itemIdentifier));
  const items = [];
  const dropped = [];
  const merged = [];
  // catalogue test_id -> index in `items`, so a second arrival adds quantity.
  const seen = new Map();

  for (const item of source) {
    const test = item?.test || item;
    const row = map.get(String(itemIdentifier(item) ?? '').toLowerCase());
    if (!row) { dropped.push(itemIdentifier(item)); continue; }

    const dedupeKey = String(row.test_id).toLowerCase();
    const alreadyAt = seen.get(dedupeKey);
    if (alreadyAt !== undefined) {
      // Not accumulated into a quantity: see LAB_TEST_QUANTITY below.
      merged.push(row.test_id);
      continue;
    }

    seen.set(dedupeKey, items.length);
    items.push({
      ...item,
      quantity: LAB_TEST_QUANTITY,
      test: {
        ...test,
        id: test?.id ?? row.test_id,
        catalogTestId: row.test_id,
        // Carry the catalogue code so the item can later be matched by it —
        // the client may name the same test by id, code or name.
        testCode: row.test_code ?? test?.testCode ?? null,
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
  return { items, dropped, merged };
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
    const { items, dropped, merged } = await repriceItems(cart.items);

    cart.items = items;
    cart.updatedAt = new Date();
    cartStore.set(userId, cart);

    res.json({
      success: true,
      cart: items,
      total: cartTotal(items),
      itemCount: items.length,
      ...(dropped.length ? { removedUnavailable: dropped } : {}),
      ...(merged.length ? { mergedDuplicates: merged } : {}),
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
    // Match on the catalogue row first, so the same test added under a second
    // identifier merges into the existing line instead of duplicating it.
    const pricedKey = catalogueKey(pricedItem);
    const existingIndex = cart.items.findIndex((item) => {
      const key = catalogueKey(item);
      if (key && pricedKey && key === pricedKey) return true;
      return itemAnswersTo(item, test.id);
    });

    if (existingIndex >= 0) {
      // Adding a test already in the cart re-prices that line; it does not
      // stack, because checkout bills the test once (see LAB_TEST_QUANTITY).
      cart.items[existingIndex] = { ...pricedItem, quantity: LAB_TEST_QUANTITY };
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
    // Remove ONE line, not every line that answers to this identifier —
    // removing one of two identical items used to empty the cart.
    const index = cart.items.findIndex((item) => itemAnswersTo(item, testId));
    if (index >= 0) cart.items.splice(index, 1);
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
    const itemIndex = cart.items.findIndex((item) => itemAnswersTo(item, testId));
    if (itemIndex >= 0) {
      // Clamped, not stored as sent: a quantity above one would price a cart
      // that checkout bills once (see LAB_TEST_QUANTITY). Accepted rather than
      // rejected so an older client's "set quantity" still succeeds.
      cart.items[itemIndex].quantity = LAB_TEST_QUANTITY;
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

    const { items: priced, dropped, merged } = await repriceItems(items);
    const cart = { items: priced, updatedAt: new Date() };
    cartStore.set(userId, cart);

    res.json({
      success: true,
      message: 'Cart synced',
      cart: cart.items,
      itemCount: cart.items.length,
      total: cartTotal(cart.items),
      ...(dropped.length ? { removedUnavailable: dropped } : {}),
      // The client sent more lines than came back: say so explicitly, so a
      // smaller cart reads as "duplicates merged" rather than a failed save.
      ...(merged.length ? { mergedDuplicates: merged } : {}),
    });
  } catch (error) {
    console.error('Error syncing cart:', error);
    res.status(500).json({ success: false, message: 'Failed to sync cart' });
  }
});

export default router;
