import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

declare global {
  interface Window {
    Razorpay: any;
  }
}

export interface RazorpayConfig {
  keyId: string;
  currency: string;
}

export interface CreateOrderData {
  amount: number;
  currency?: string;
  clientType: 'user' | 'doctor' | 'hospital' | 'pharmacy' | 'corporate';
  clientId: string;
  clientName: string;
  description: string;
  metadata?: Record<string, any>;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
}

export interface PaymentVerificationData {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

/**
 * Load Razorpay SDK script dynamically
 */
export const loadRazorpayScript = (): Promise<boolean> => {
  return new Promise((resolve) => {
    // Check if script already loaded
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    
    script.onload = () => {
      resolve(true);
    };
    
    script.onerror = () => {
      resolve(false);
    };

    document.body.appendChild(script);
  });
};

/**
 * Get Razorpay configuration from backend
 */
export const getRazorpayConfig = async (): Promise<RazorpayConfig> => {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/payments/config`);
    return response.data;
  } catch (error) {
    console.error('Failed to fetch Razorpay config:', error);
    throw error;
  }
};

/**
 * Create a payment order
 */
export const createPaymentOrder = async (
  orderData: CreateOrderData,
  token: string
): Promise<any> => {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/api/payments/order`,
      orderData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  } catch (error: any) {
    console.error('Failed to create payment order:', error);
    throw new Error(error.response?.data?.message || 'Failed to create payment order');
  }
};

/**
 * Verify payment after completion
 */
export const verifyPayment = async (
  verificationData: PaymentVerificationData,
  token: string
): Promise<any> => {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/api/payments/verify`,
      verificationData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  } catch (error: any) {
    console.error('Failed to verify payment:', error);
    throw new Error(error.response?.data?.message || 'Failed to verify payment');
  }
};

/**
 * Open Razorpay checkout
 */
export const openRazorpayCheckout = async (
  order: any,
  options: {
    prefill?: {
      name?: string;
      email?: string;
      contact?: string;
    };
    onSuccess: (response: any) => void;
    onFailure: (error: any) => void;
  }
): Promise<void> => {
  // Load Razorpay script
  const isLoaded = await loadRazorpayScript();
  
  if (!isLoaded) {
    options.onFailure(new Error('Failed to load Razorpay SDK'));
    return;
  }

  const razorpayOptions = {
    key: order.gatewayConfig.keyId,
    amount: order.order.amount,
    currency: order.order.currency,
    name: order.gatewayConfig.name || 'Mediczy',
    description: order.transaction.description || 'Payment',
    order_id: order.order.id,
    prefill: options.prefill || {},
    theme: {
      color: order.gatewayConfig.theme?.color || '#10B981'
    },
    handler: function (response: any) {
      options.onSuccess(response);
    },
    modal: {
      ondismiss: function () {
        options.onFailure(new Error('Payment cancelled by user'));
      }
    }
  };

  const razorpay = new window.Razorpay(razorpayOptions);
  razorpay.open();
};

/**
 * Get all transactions with filtering
 */
export const getTransactions = async (
  filters: {
    status?: string;
    clientType?: string;
    gatewayId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  },
  token: string
): Promise<any> => {
  try {
    const queryParams = new URLSearchParams(
      Object.entries(filters).reduce((acc, [key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          acc[key] = String(value);
        }
        return acc;
      }, {} as Record<string, string>)
    );

    const response = await axios.get(
      `${API_BASE_URL}/api/payments/transactions?${queryParams}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
    return response.data;
  } catch (error: any) {
    console.error('Failed to fetch transactions:', error);
    throw new Error(error.response?.data?.message || 'Failed to fetch transactions');
  }
};

/**
 * Get single transaction
 */
export const getTransaction = async (
  transactionId: string,
  token: string
): Promise<any> => {
  try {
    const response = await axios.get(
      `${API_BASE_URL}/api/payments/transactions/${transactionId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
    return response.data;
  } catch (error: any) {
    console.error('Failed to fetch transaction:', error);
    throw new Error(error.response?.data?.message || 'Failed to fetch transaction');
  }
};

/**
 * Create refund for a transaction
 */
export const createRefund = async (
  transactionId: string,
  refundData: {
    amount?: number;
    reason?: string;
    speed?: 'normal' | 'optimum';
  },
  token: string
): Promise<any> => {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/api/payments/refund`,
      {
        transactionId,
        ...refundData
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  } catch (error: any) {
    console.error('Failed to create refund:', error);
    throw new Error(error.response?.data?.message || 'Failed to create refund');
  }
};

/**
 * Get payment gateways
 */
export const getGateways = async (token: string): Promise<any> => {
  try {
    const response = await axios.get(
      `${API_BASE_URL}/api/payments/gateways`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
    return response.data;
  } catch (error: any) {
    console.error('Failed to fetch gateways:', error);
    throw new Error(error.response?.data?.message || 'Failed to fetch gateways');
  }
};

/**
 * Update gateway configuration
 */
export const updateGateway = async (
  gatewayId: string,
  updates: Record<string, any>,
  token: string
): Promise<any> => {
  try {
    const response = await axios.put(
      `${API_BASE_URL}/api/payments/gateways/${gatewayId}`,
      updates,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  } catch (error: any) {
    console.error('Failed to update gateway:', error);
    throw new Error(error.response?.data?.message || 'Failed to update gateway');
  }
};

/**
 * Get payment statistics
 */
export const getPaymentStats = async (
  filters: {
    startDate?: string;
    endDate?: string;
    clientType?: string;
  },
  token: string
): Promise<any> => {
  try {
    const queryParams = new URLSearchParams(
      Object.entries(filters).reduce((acc, [key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          acc[key] = String(value);
        }
        return acc;
      }, {} as Record<string, string>)
    );

    const response = await axios.get(
      `${API_BASE_URL}/api/payments/stats?${queryParams}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
    return response.data;
  } catch (error: any) {
    console.error('Failed to fetch payment stats:', error);
    throw new Error(error.response?.data?.message || 'Failed to fetch payment stats');
  }
};
