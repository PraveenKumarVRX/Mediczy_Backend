/**
 * useLabCart — cart state + server-sync for the Lab Tests page.
 * Extracted from LabTests.tsx (Phase 3 modularisation).
 */

import { useState, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';

export interface AvailableTest {
  id: string;
  name: string;
  category: string;
  description: string;
  price: string;
  preparationRequired: boolean;
  turnaroundTime: string;
}

export interface CartItem {
  test: AvailableTest;
  quantity: number;
}

export function useLabCart() {
  const { toast } = useToast();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCartDialog, setShowCartDialog] = useState(false);
  const [showCheckoutDialog, setShowCheckoutDialog] = useState(false);
  const checkoutInFlightRef = useRef(false);
  const [lastCheckoutKey, setLastCheckoutKey] = useState<string | null>(null);

  const cartTotal = cart.reduce((total, item) => {
    const price = parseInt(String(item.test?.price ?? '0').replace(/[₹,]/g, '')) || 0;
    return total + price * item.quantity;
  }, 0);

  const cartFingerprint = cart
    .map(i => `${i.test.id}:${i.quantity}`)
    .sort()
    .join(',');

  // ── API sync (fire-and-forget) ──────────────────────────────────────────────
  const _syncAdd = async (test: AvailableTest) => {
    try {
      if (localStorage.getItem('token')) await api.post('/cart/add', { test, quantity: 1 });
    } catch { /* silent */ }
  };

  const _syncRemove = async (testId: string) => {
    try {
      if (localStorage.getItem('token')) await api.delete(`/cart/remove/${testId}`);
    } catch { /* silent */ }
  };

  const _syncClear = async () => {
    try {
      if (localStorage.getItem('token')) await api.delete('/cart/clear');
    } catch { /* silent */ }
  };

  // ── Public API ──────────────────────────────────────────────────────────────
  const fetchCart = async () => {
    try {
      if (!localStorage.getItem('token')) return;
      const res = await api.get('/cart');
      if (res.data?.success && res.data?.cart) setCart(res.data.cart);
    } catch { /* silent */ }
  };

  const addToCart = (test: AvailableTest) => {
    setCart(prev => {
      if (prev.some(i => i.test.id === test.id)) return prev;
      return [...prev, { test, quantity: 1 }];
    });
    _syncAdd(test);
    toast({ title: 'Added to cart', description: test.name });
  };

  const removeFromCart = (testId: string) => {
    setCart(prev => prev.filter(i => i.test.id !== testId));
    _syncRemove(testId);
  };

  const clearCart = () => {
    setCart([]);
    _syncClear();
  };

  return {
    cart, cartTotal, cartFingerprint,
    showCartDialog, setShowCartDialog,
    showCheckoutDialog, setShowCheckoutDialog,
    checkoutInFlightRef, lastCheckoutKey, setLastCheckoutKey,
    fetchCart, addToCart, removeFromCart, clearCart,
  };
}
