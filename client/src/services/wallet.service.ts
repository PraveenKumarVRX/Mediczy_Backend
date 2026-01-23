/**
 * Wallet Service - Health Coins API
 * Handles all wallet and health coins related API calls
 */

import api from '@/lib/api';

export interface WalletBalance {
  balance: number;
  totalEarned: number;
  totalSpent: number;
  totalPurchased: number;
  streakDays: number;
}

export interface WalletTransaction {
  id: number;
  type: 'EARN' | 'SPEND' | 'PURCHASE' | 'BONUS' | 'REFUND';
  amount: number;
  balanceAfter: number;
  activityType: string;
  description: string;
  referenceType?: string;
  referenceId?: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface WalletSummary extends WalletBalance {
  todayActivity: {
    dailyLoginRewarded: boolean;
    stepsGoalReached: number;
    totalSteps: number;
  } | null;
  recentTransactions: WalletTransaction[];
}

export interface HCCalculation {
  canPay: boolean;
  currentBalance: number;
  consultationFeeINR: number;
  hcRequired: number;
  hcToINRRate: number;
  bonusPercent: number;
  effectiveValuePerHC: number;
  savings: number;
  shortfall: number;
}

export interface HCPackage {
  coins: number;
  price: number;
  discount: number;
  popular: boolean;
}

export interface HCRewardsConfig {
  rewards: Record<string, number | Record<number, number>>;
  pricing: {
    packages: HCPackage[];
    HC_TO_INR_RATE: number;
    HC_PAYMENT_BONUS_PERCENT: number;
    services: Record<string, any>;
  };
}

class WalletService {
  /**
   * Get wallet summary including balance and recent transactions
   */
  async getWalletSummary(): Promise<WalletSummary> {
    const response = await api.get('/wallet');
    return response.data.data;
  }

  /**
   * Get wallet balance only
   */
  async getBalance(): Promise<number> {
    const response = await api.get('/wallet/balance');
    return response.data.balance;
  }

  /**
   * Get transaction history
   */
  async getTransactions(limit = 50, offset = 0): Promise<WalletTransaction[]> {
    const response = await api.get('/wallet/transactions', {
      params: { limit, offset }
    });
    return response.data.data;
  }

  /**
   * Get rewards configuration
   */
  async getRewardsConfig(): Promise<HCRewardsConfig> {
    const response = await api.get('/wallet/rewards');
    return response.data.data;
  }

  /**
   * Claim daily login reward
   */
  async claimDailyLogin(): Promise<{
    coinsEarned: number;
    bonusCoins: number;
    streak: number;
    newBalance: number;
  }> {
    const response = await api.post('/wallet/earn/daily-login');
    return response.data;
  }

  /**
   * Calculate HC required for a consultation fee
   */
  async calculateHCForConsultation(consultationFee: number): Promise<HCCalculation> {
    const response = await api.get(`/wallet/appointment/calculate/${consultationFee}`);
    return response.data.data;
  }

  /**
   * Check if user can pay for appointment with HC
   */
  async canPayWithHC(consultationFee: number): Promise<HCCalculation> {
    const response = await api.post('/wallet/appointment/can-pay', {
      consultationFee
    });
    return response.data.data;
  }

  /**
   * Pay for appointment using Health Coins (via wallet route)
   */
  async payForAppointmentWithHC(
    appointmentId: number,
    consultationFee: number,
    doctorName: string
  ): Promise<{
    appointmentId: number;
    hcPaid: number;
    consultationFeeINR: number;
    bonusPercent: number;
    newBalance: number;
    transactionId: number;
  }> {
    const response = await api.post('/wallet/appointment/pay', {
      appointmentId,
      consultationFee,
      doctorName
    });
    return response.data.data;
  }

  /**
   * Check HC payment eligibility for a specific appointment
   */
  async checkAppointmentHCPayment(appointmentId: number): Promise<{
    appointment: {
      id: number;
      doctorName: string;
      consultationFee: number;
      status: string;
      paymentStatus: string;
    };
    healthCoins: HCCalculation;
  }> {
    const response = await api.get(`/consultation/payment/hc-check/${appointmentId}`);
    return response.data;
  }

  /**
   * Pay for appointment using Health Coins (via consultation route)
   */
  async payAppointmentWithHC(appointmentId: number): Promise<{
    appointment: {
      id: number;
      doctorName: string;
      date: string;
      time: string;
      status: string;
      paymentStatus: string;
      meetingLink: string;
      meetingId: string;
    };
    payment: {
      method: string;
      hcPaid: number;
      consultationFeeINR: number;
      bonusPercent: number;
      newBalance: number;
      transactionId: number;
    };
  }> {
    const response = await api.post(`/consultation/payment/hc/${appointmentId}`);
    return response.data;
  }

  /**
   * Create order for purchasing HC
   */
  async createPurchaseOrder(packageId: number): Promise<{
    order: {
      orderId: string;
      amount: number;
      currency: string;
      key: string;
    };
    package: HCPackage;
  }> {
    const response = await api.post('/wallet/create-order', { packageId });
    return response.data;
  }

  /**
   * Verify payment and credit HC
   */
  async verifyPurchasePayment(
    razorpay_order_id: string,
    razorpay_payment_id: string,
    razorpay_signature: string,
    packageId: number
  ): Promise<{
    coinsPurchased: number;
    newBalance: number;
    transactionId: string;
  }> {
    const response = await api.post('/wallet/verify-payment', {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      packageId
    });
    return response.data;
  }
}

export const walletService = new WalletService();
export default walletService;
