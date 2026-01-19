import express from 'express';
import { Op } from 'sequelize';
import { authUser } from '../middleware/auth.middleware.js';

const router = express.Router();

// In-memory cart store (can be replaced with Redis or database)
// For production, use Redis or a Cart table in database
const cartStore = new Map();

/**
 * Cart Routes
 * ===========
 * API endpoints for lab test cart management
 */

// GET /api/cart - Get user's cart
router.get('/', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const cart = cartStore.get(userId) || { items: [], updatedAt: new Date() };
    
    res.json({
      success: true,
      cart: cart.items,
      total: cart.items.reduce((sum, item) => {
        const price = parseInt(item.test?.price?.replace(/[₹,]/g, '')) || 0;
        return sum + price * (item.quantity || 1);
      }, 0),
      itemCount: cart.items.length,
      updatedAt: cart.updatedAt
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
    const { test, quantity = 1 } = req.body;
    
    if (!test || !test.id) {
      return res.status(400).json({ success: false, message: 'Test item is required' });
    }
    
    let cart = cartStore.get(userId) || { items: [], updatedAt: new Date() };
    
    // Check if item already exists
    const existingIndex = cart.items.findIndex(item => item.test?.id === test.id);
    
    if (existingIndex >= 0) {
      // Update quantity if exists
      cart.items[existingIndex].quantity = (cart.items[existingIndex].quantity || 1) + quantity;
    } else {
      // Add new item
      cart.items.push({ test, quantity });
    }
    
    cart.updatedAt = new Date();
    cartStore.set(userId, cart);
    
    res.json({
      success: true,
      message: 'Item added to cart',
      cart: cart.items,
      itemCount: cart.items.length,
      total: cart.items.reduce((sum, item) => {
        const price = parseInt(item.test?.price?.replace(/[₹,]/g, '')) || 0;
        return sum + price * (item.quantity || 1);
      }, 0)
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
    
    let cart = cartStore.get(userId) || { items: [], updatedAt: new Date() };
    
    cart.items = cart.items.filter(item => item.test?.id !== testId);
    cart.updatedAt = new Date();
    cartStore.set(userId, cart);
    
    res.json({
      success: true,
      message: 'Item removed from cart',
      cart: cart.items,
      itemCount: cart.items.length,
      total: cart.items.reduce((sum, item) => {
        const price = parseInt(item.test?.price?.replace(/[₹,]/g, '')) || 0;
        return sum + price * (item.quantity || 1);
      }, 0)
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
    const { quantity } = req.body;
    
    if (quantity < 1) {
      return res.status(400).json({ success: false, message: 'Quantity must be at least 1' });
    }
    
    let cart = cartStore.get(userId) || { items: [], updatedAt: new Date() };
    
    const itemIndex = cart.items.findIndex(item => item.test?.id === testId);
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
      total: cart.items.reduce((sum, item) => {
        const price = parseInt(item.test?.price?.replace(/[₹,]/g, '')) || 0;
        return sum + price * (item.quantity || 1);
      }, 0)
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
      total: 0
    });
  } catch (error) {
    console.error('Error clearing cart:', error);
    res.status(500).json({ success: false, message: 'Failed to clear cart' });
  }
});

// POST /api/cart/sync - Sync local cart with server
router.post('/sync', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { items } = req.body;
    
    if (!Array.isArray(items)) {
      return res.status(400).json({ success: false, message: 'Items must be an array' });
    }
    
    const cart = { items, updatedAt: new Date() };
    cartStore.set(userId, cart);
    
    res.json({
      success: true,
      message: 'Cart synced',
      cart: cart.items,
      itemCount: cart.items.length,
      total: cart.items.reduce((sum, item) => {
        const price = parseInt(item.test?.price?.replace(/[₹,]/g, '')) || 0;
        return sum + price * (item.quantity || 1);
      }, 0)
    });
  } catch (error) {
    console.error('Error syncing cart:', error);
    res.status(500).json({ success: false, message: 'Failed to sync cart' });
  }
});

export default router;
