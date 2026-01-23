/**
 * Health Coins Wallet Routes
 * API endpoints for wallet operations and health coins management
 */

import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import healthCoinsService from '../services/health-coins.service.js';
import { HEALTH_COINS_REWARDS, HEALTH_COINS_PRICING } from '../config/health-coins.config.js';
import paymentGateway from '../services/payment-gateway.service.js';

const router = express.Router();

/**
 * GET /api/wallet
 * Get user wallet balance and summary
 */
router.get('/', authUser, async (req, res) => {
  try {
    const summary = await healthCoinsService.getWalletSummary(req.user.id);
    
    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Get wallet error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wallet',
      error: error.message
    });
  }
});

/**
 * GET /api/wallet/balance
 * Get wallet balance only
 */
router.get('/balance', authUser, async (req, res) => {
  try {
    const balance = await healthCoinsService.getBalance(req.user.id);
    
    res.json({
      success: true,
      balance
    });
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch balance',
      error: error.message
    });
  }
});

/**
 * GET /api/wallet/transactions
 * Get transaction history
 */
router.get('/transactions', authUser, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    
    const transactions = await healthCoinsService.getTransactionHistory(
      req.user.id,
      parseInt(limit),
      parseInt(offset)
    );
    
    res.json({
      success: true,
      data: transactions,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        count: transactions.length
      }
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions',
      error: error.message
    });
  }
});

/**
 * POST /api/wallet/earn/daily-login
 * Award coins for daily login
 */
router.post('/earn/daily-login', authUser, async (req, res) => {
  try {
    const result = await healthCoinsService.awardDailyLogin(req.user.id);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json({
      success: true,
      message: `Earned ${HEALTH_COINS_REWARDS.DAILY_LOGIN} health coins for daily login!`,
      coinsEarned: HEALTH_COINS_REWARDS.DAILY_LOGIN,
      bonusCoins: result.bonusAwarded || 0,
      streak: result.streak,
      newBalance: result.newBalance
    });
  } catch (error) {
    console.error('Daily login reward error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to award daily login',
      error: error.message
    });
  }
});

/**
 * POST /api/wallet/earn/steps
 * Award coins for steps milestone
 */
router.post('/earn/steps', authUser, async (req, res) => {
  try {
    const { steps } = req.body;
    
    if (!steps || steps < 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid steps count'
      });
    }
    
    const result = await healthCoinsService.awardStepsMilestone(req.user.id, steps);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json({
      success: true,
      message: `Earned ${result.transaction.amount} health coins for steps!`,
      coinsEarned: result.transaction.amount,
      steps,
      newBalance: result.newBalance
    });
  } catch (error) {
    console.error('Steps reward error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to award steps',
      error: error.message
    });
  }
});

/**
 * POST /api/wallet/earn/health-assessment
 * Award coins for completing health assessment
 */
router.post('/earn/health-assessment', authUser, async (req, res) => {
  try {
    const result = await healthCoinsService.awardHealthAssessment(req.user.id);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json({
      success: true,
      message: `Earned ${HEALTH_COINS_REWARDS.HEALTH_ASSESSMENT} health coins!`,
      coinsEarned: HEALTH_COINS_REWARDS.HEALTH_ASSESSMENT,
      newBalance: result.newBalance
    });
  } catch (error) {
    console.error('Health assessment reward error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to award health assessment',
      error: error.message
    });
  }
});

/**
 * POST /api/wallet/earn/vital-signs
 * Award coins for logging vital signs
 */
router.post('/earn/vital-signs', authUser, async (req, res) => {
  try {
    const result = await healthCoinsService.awardVitalSignsLog(req.user.id);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json({
      success: true,
      message: `Earned ${HEALTH_COINS_REWARDS.VITAL_SIGNS_LOG} health coins!`,
      coinsEarned: HEALTH_COINS_REWARDS.VITAL_SIGNS_LOG,
      newBalance: result.newBalance
    });
  } catch (error) {
    console.error('Vital signs reward error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to award vital signs',
      error: error.message
    });
  }
});

/**
 * POST /api/wallet/earn/activity
 * Award coins for generic activity
 */
router.post('/earn/activity', authUser, async (req, res) => {
  try {
    const { activityType, metadata } = req.body;
    
    if (!activityType) {
      return res.status(400).json({
        success: false,
        message: 'Activity type is required'
      });
    }
    
    const result = await healthCoinsService.awardActivity(
      req.user.id,
      activityType,
      metadata || {}
    );
    
    res.json({
      success: true,
      message: `Earned ${result.transaction.amount} health coins!`,
      coinsEarned: result.transaction.amount,
      newBalance: result.newBalance
    });
  } catch (error) {
    console.error('Activity reward error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to award activity',
      error: error.message
    });
  }
});

/**
 * POST /api/wallet/spend
 * Spend health coins
 */
router.post('/spend', authUser, async (req, res) => {
  try {
    const { amount, activityType, description, referenceType, referenceId, metadata } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }
    
    const result = await healthCoinsService.deductCoins(
      req.user.id,
      amount,
      activityType || 'OTHER',
      description || 'Health coins spent',
      referenceType,
      referenceId,
      metadata || {}
    );
    
    res.json({
      success: true,
      message: `Spent ${amount} health coins`,
      coinsSpent: amount,
      newBalance: result.newBalance
    });
  } catch (error) {
    console.error('Spend coins error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to spend coins',
      error: error.message
    });
  }
});

/**
 * GET /api/wallet/rewards
 * Get available rewards configuration
 */
router.get('/rewards', authUser, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        rewards: HEALTH_COINS_REWARDS,
        pricing: HEALTH_COINS_PRICING
      }
    });
  } catch (error) {
    console.error('Get rewards error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rewards',
      error: error.message
    });
  }
});

/**
 * POST /api/wallet/create-order
 * Create Razorpay order for health coins purchase
 */
router.post('/create-order', authUser, async (req, res) => {
  try {
    const { packageId } = req.body;
    
    if (packageId === undefined || packageId === null) {
      return res.status(400).json({
        success: false,
        message: 'Package ID is required'
      });
    }
    
    // Get package details
    const pkg = HEALTH_COINS_PRICING.packages[packageId];
    
    if (!pkg) {
      return res.status(400).json({
        success: false,
        message: 'Invalid package'
      });
    }
    
    // Debug env presence for Razorpay keys
    const mask = (v) => (v ? `${v.slice(0, 3)}***${v.slice(-4)}` : 'undefined');
    console.log('🔑 Razorpay env in route', {
      key_id: mask(process.env.RAZORPAY_KEY_ID),
      hasSecret: !!process.env.RAZORPAY_KEY_SECRET
    });

    // Create Razorpay order
    const orderData = {
      amount: pkg.price,
      currency: 'INR',
      receipt: `HC_${req.user.id}_${Date.now()}`,
      notes: {
        userId: req.user.id,
        packageId,
        coins: pkg.coins,
        type: 'health_coins_purchase'
      }
    };

    console.log('📝 Creating Razorpay order with:', JSON.stringify(orderData, null, 2));
    
    const razorpayOrder = await paymentGateway.createRazorpayOrder(orderData);
    
    console.log('✅ Razorpay order created for HC purchase:', razorpayOrder.orderId);
    console.log('📤 Razorpay order details:', JSON.stringify(razorpayOrder, null, 2));
    
    res.json({
      success: true,
      order: {
        orderId: razorpayOrder.orderId,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        key: process.env.RAZORPAY_KEY_ID
      },
      package: pkg
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment order',
      error: error.message
    });
  }
});

/**
 * POST /api/wallet/verify-payment
 * Verify Razorpay payment and credit coins
 */
router.post('/verify-payment', authUser, async (req, res) => {
  try {
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature,
      packageId 
    } = req.body;
    
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || packageId === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Missing required payment fields'
      });
    }
    
    // Verify payment signature
    const isValid = paymentGateway.verifyRazorpaySignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );
    
    if (!isValid) {
      console.error('❌ Invalid payment signature');
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed'
      });
    }
    
    // Get package details
    const pkg = HEALTH_COINS_PRICING.packages[packageId];
    
    if (!pkg) {
      return res.status(400).json({
        success: false,
        message: 'Invalid package'
      });
    }
    
    // Add coins to wallet
    const result = await healthCoinsService.addCoins(
      req.user.id,
      pkg.coins,
      'PURCHASE',
      'PURCHASE',
      `Purchased ${pkg.coins} health coins`,
      {
        packageId,
        paymentMethod: 'razorpay',
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        amountPaid: pkg.price,
        discount: pkg.discount
      }
    );
    
    console.log(`✅ Successfully credited ${pkg.coins} HC to user ${req.user.id}`);
    
    res.json({
      success: true,
      message: `Successfully purchased ${pkg.coins} health coins`,
      coinsPurchased: pkg.coins,
      newBalance: result.newBalance,
      transactionId: razorpay_payment_id
    });
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment',
      error: error.message
    });
  }
});

/**
 * POST /api/wallet/purchase
 * Purchase health coins with real money
 * @deprecated Use /create-order and /verify-payment instead
 */
router.post('/purchase', authUser, async (req, res) => {
  try {
    const { packageId, paymentMethod, paymentTransactionId, amountPaid } = req.body;
    
    console.log('💰 Wallet purchase request:', { 
      packageId, 
      paymentMethod, 
      paymentTransactionId, 
      amountPaid,
      userId: req.user.id,
      body: req.body 
    });
    
    if (packageId === undefined || packageId === null || !paymentTransactionId || !amountPaid) {
      console.log('❌ Missing required fields:', { 
        hasPackageId: packageId !== undefined && packageId !== null, 
        hasPaymentTransactionId: !!paymentTransactionId, 
        hasAmountPaid: !!amountPaid 
      });
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }
    
    // Get package details
    const pkg = HEALTH_COINS_PRICING.packages[packageId];
    
    if (!pkg) {
      return res.status(400).json({
        success: false,
        message: 'Invalid package'
      });
    }
    
    // Verify payment amount
    if (parseFloat(amountPaid) < pkg.price) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient payment amount'
      });
    }
    
    // Add coins to wallet
    const result = await healthCoinsService.addCoins(
      req.user.id,
      pkg.coins,
      'PURCHASE',
      'PURCHASE',
      `Purchased ${pkg.coins} health coins`,
      {
        packageId,
        paymentMethod,
        paymentTransactionId,
        amountPaid: parseFloat(amountPaid),
        discount: pkg.discount
      }
    );
    
    res.json({
      success: true,
      message: `Successfully purchased ${pkg.coins} health coins`,
      coinsPurchased: pkg.coins,
      newBalance: result.newBalance
    });
  } catch (error) {
    console.error('Purchase coins error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to purchase coins',
      error: error.message
    });
  }
});

// ============================================
// HEALTH COINS APPOINTMENT PAYMENT ENDPOINTS
// ============================================

/**
 * GET /api/wallet/appointment/calculate/:consultationFee
 * Calculate HC required to pay for a consultation
 */
router.get('/appointment/calculate/:consultationFee', authUser, async (req, res) => {
  try {
    const consultationFee = parseFloat(req.params.consultationFee);
    
    if (isNaN(consultationFee) || consultationFee <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid consultation fee'
      });
    }
    
    const canPayResult = await healthCoinsService.canPayWithHC(req.user.id, consultationFee);
    
    res.json({
      success: true,
      data: canPayResult
    });
  } catch (error) {
    console.error('Calculate HC error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate HC requirement',
      error: error.message
    });
  }
});

/**
 * POST /api/wallet/appointment/can-pay
 * Check if user can pay for appointment with HC
 */
router.post('/appointment/can-pay', authUser, async (req, res) => {
  try {
    const { consultationFee } = req.body;
    
    if (!consultationFee || consultationFee <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid consultation fee is required'
      });
    }
    
    const result = await healthCoinsService.canPayWithHC(req.user.id, consultationFee);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Can pay with HC error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check HC payment eligibility',
      error: error.message
    });
  }
});

/**
 * POST /api/wallet/appointment/pay
 * Pay for an appointment using Health Coins
 */
router.post('/appointment/pay', authUser, async (req, res) => {
  try {
    const { appointmentId, consultationFee, doctorName } = req.body;
    
    if (!appointmentId || !consultationFee || !doctorName) {
      return res.status(400).json({
        success: false,
        message: 'Appointment ID, consultation fee, and doctor name are required'
      });
    }
    
    // First check if user can pay
    const canPayResult = await healthCoinsService.canPayWithHC(req.user.id, consultationFee);
    
    if (!canPayResult.canPay) {
      return res.status(400).json({
        success: false,
        message: `Insufficient Health Coins. You need ${canPayResult.hcRequired} HC but have ${canPayResult.currentBalance} HC`,
        data: canPayResult
      });
    }
    
    // Process the payment
    const result = await healthCoinsService.payForAppointment(
      req.user.id,
      appointmentId,
      consultationFee,
      doctorName
    );
    
    console.log(`✅ HC payment successful: User ${req.user.id} paid ${result.hcPaid} HC for appointment ${appointmentId}`);
    
    res.json({
      success: true,
      message: `Successfully paid ${result.hcPaid} HC for consultation (₹${consultationFee} value with ${result.bonusPercent}% bonus)`,
      data: {
        appointmentId,
        hcPaid: result.hcPaid,
        consultationFeeINR: consultationFee,
        bonusPercent: result.bonusPercent,
        newBalance: result.newBalance,
        transactionId: result.transaction.id
      }
    });
  } catch (error) {
    console.error('HC appointment payment error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process HC payment',
      error: error.message
    });
  }
});

/**
 * POST /api/wallet/appointment/refund
 * Refund HC for a cancelled appointment
 */
router.post('/appointment/refund', authUser, async (req, res) => {
  try {
    const { appointmentId, hcAmount, doctorName } = req.body;
    
    if (!appointmentId || !hcAmount || !doctorName) {
      return res.status(400).json({
        success: false,
        message: 'Appointment ID, HC amount, and doctor name are required'
      });
    }
    
    const result = await healthCoinsService.refundAppointmentPayment(
      req.user.id,
      appointmentId,
      hcAmount,
      doctorName
    );
    
    console.log(`✅ HC refund successful: User ${req.user.id} refunded ${hcAmount} HC for appointment ${appointmentId}`);
    
    res.json({
      success: true,
      message: `Successfully refunded ${hcAmount} HC for cancelled appointment`,
      data: {
        appointmentId,
        hcRefunded: hcAmount,
        newBalance: result.newBalance
      }
    });
  } catch (error) {
    console.error('HC refund error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process HC refund',
      error: error.message
    });
  }
});

export default router;
