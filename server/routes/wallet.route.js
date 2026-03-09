/**
 * Health Coins Wallet Routes
 * API endpoints for wallet operations and health coins management
 */

import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import healthCoinsService from '../services/health-coins.service.js';
import { HEALTH_COINS_REWARDS, HEALTH_COINS_PRICING } from '../config/health-coins.config.js';
import paymentGateway from '../services/payment-gateway.service.js';
import { Coupon, CouponUsage } from '../models/index.js';
import { Op } from 'sequelize';

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
      return res.status(200).json({
        success: false,
        message: result.message || 'Daily login reward unavailable',
        coinsEarned: 0,
        bonusCoins: 0,
        streak: result.streak || 0,
        newBalance: result.newBalance
      });
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
 * POST /api/wallet/validate-coupon
 * Validate coupon code for HC purchase
 */
router.post('/validate-coupon', authUser, async (req, res) => {
  try {
    const { code, packageId } = req.body;
    
    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Coupon code is required'
      });
    }
    
    // Find coupon
    const coupon = await Coupon.findOne({
      where: {
        code: code.toUpperCase(),
        isActive: true,
        validFrom: { [Op.lte]: new Date() },
        validUntil: { [Op.gte]: new Date() }
      }
    });
    
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Invalid or expired coupon code'
      });
    }
    
    // Check max usage
    if (coupon.usageCount >= coupon.maxUsage) {
      return res.status(400).json({
        success: false,
        message: 'Coupon usage limit exceeded'
      });
    }
    
    // Check user usage
    const userUsage = await CouponUsage.count({
      where: {
        couponId: coupon.id,
        userId: req.user.id
      }
    });
    
    if (userUsage >= coupon.maxUsagePerUser) {
      return res.status(400).json({
        success: false,
        message: 'You have already used this coupon the maximum number of times'
      });
    }
    
    // Get package if specified
    let pkg = null;
    if (packageId !== undefined) {
      pkg = HEALTH_COINS_PRICING.packages[packageId];
      
      // Check min purchase for PERCENTAGE type
      if (coupon.type === 'PERCENTAGE' && pkg && pkg.coins < coupon.minPurchase) {
        return res.status(400).json({
          success: false,
          message: `Minimum purchase of ${coupon.minPurchase} HC required for this coupon`
        });
      }
    }
    
    // Calculate discount/bonus
    let discount = 0;
    let bonusHC = 0;
    let finalPrice = pkg ? pkg.price : 0;
    
    if (coupon.type === 'PERCENTAGE' && pkg) {
      discount = (pkg.price * coupon.value) / 100;
      finalPrice = pkg.price - discount;
    } else if (coupon.type === 'FIXED_HC') {
      bonusHC = coupon.value;
    } else if (coupon.type === 'FREE_HC') {
      bonusHC = coupon.value;
      finalPrice = 0; // Free HC
    }
    
    res.json({
      success: true,
      message: 'Coupon is valid',
      coupon: {
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        description: coupon.description,
        discount,
        bonusHC,
        finalPrice: Math.max(0, finalPrice)
      }
    });
  } catch (error) {
    console.error('Validate coupon error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate coupon',
      error: error.message
    });
  }
});

/**
 * POST /api/wallet/create-order
 * Create Razorpay order for health coins purchase (with optional coupon)
 */
router.post('/create-order', authUser, async (req, res) => {
  try {
    const { packageId, couponCode } = req.body;
    
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
    
    let coupon = null;
    let discount = 0;
    let bonusHC = 0;
    let finalAmount = pkg.price;
    
    // Validate and apply coupon if provided
    if (couponCode) {
      coupon = await Coupon.findOne({
        where: {
          code: couponCode.toUpperCase(),
          isActive: true,
          validFrom: { [Op.lte]: new Date() },
          validUntil: { [Op.gte]: new Date() }
        }
      });
      
      if (!coupon) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired coupon code'
        });
      }
      
      // Check usage limits
      if (coupon.usageCount >= coupon.maxUsage) {
        return res.status(400).json({
          success: false,
          message: 'Coupon usage limit exceeded'
        });
      }
      
      const userUsage = await CouponUsage.count({
        where: { couponId: coupon.id, userId: req.user.id }
      });
      
      if (userUsage >= coupon.maxUsagePerUser) {
        return res.status(400).json({
          success: false,
          message: 'You have already used this coupon'
        });
      }
      
      // Apply coupon discount/bonus
      if (coupon.type === 'PERCENTAGE') {
        if (pkg.coins < coupon.minPurchase) {
          return res.status(400).json({
            success: false,
            message: `Minimum purchase of ${coupon.minPurchase} HC required`
          });
        }
        discount = (pkg.price * coupon.value) / 100;
        finalAmount = Math.max(0, pkg.price - discount);
      } else if (coupon.type === 'FIXED_HC') {
        bonusHC = coupon.value;
      } else if (coupon.type === 'FREE_HC') {
        bonusHC = coupon.value;
        finalAmount = 0;
      }
    }
    
    // Debug env presence for Razorpay keys
    const mask = (v) => (v ? `${v.slice(0, 3)}***${v.slice(-4)}` : 'undefined');
    console.log('🔑 Razorpay env in route', {
      key_id: mask(process.env.RAZORPAY_KEY_ID),
      hasSecret: !!process.env.RAZORPAY_KEY_SECRET
    });

    // Create Razorpay order only if payment required
    let razorpayOrder = null;
    if (finalAmount > 0) {
      const orderData = {
        amount: finalAmount,
        currency: 'INR',
        receipt: `HC_${req.user.id}_${Date.now()}`,
        notes: {
          userId: req.user.id,
          packageId,
          coins: pkg.coins,
          couponCode: couponCode || null,
          bonusHC,
          type: 'health_coins_purchase'
        }
      };

      console.log('📝 Creating Razorpay order with:', JSON.stringify(orderData, null, 2));
      
      razorpayOrder = await paymentGateway.createRazorpayOrder(orderData);
      
      console.log('✅ Razorpay order created for HC purchase:', razorpayOrder.orderId);
      console.log('📤 Razorpay order details:', JSON.stringify(razorpayOrder, null, 2));
    }
    
    res.json({
      success: true,
      order: razorpayOrder ? {
        orderId: razorpayOrder.orderId,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        key: process.env.RAZORPAY_KEY_ID
      } : null,
      package: pkg,
      coupon: coupon ? {
        code: coupon.code,
        discount,
        bonusHC,
        finalAmount
      } : null
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
      packageId,
      couponCode
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
    
    let coupon = null;
    let bonusHC = 0;
    let discount = 0;
    let totalHC = pkg.coins;
    
    // Process coupon if provided
    if (couponCode) {
      coupon = await Coupon.findOne({
        where: { code: couponCode.toUpperCase() }
      });
      
      if (coupon) {
        // Apply coupon bonus
        if (coupon.type === 'PERCENTAGE') {
          discount = (pkg.price * coupon.value) / 100;
        } else if (coupon.type === 'FIXED_HC' || coupon.type === 'FREE_HC') {
          bonusHC = coupon.value;
          totalHC = pkg.coins + bonusHC;
        }
        
        // Record coupon usage
        await CouponUsage.create({
          couponId: coupon.id,
          couponCode: coupon.code,
          userId: req.user.id,
          hcPurchased: pkg.coins,
          hcBonus: bonusHC,
          discountAmount: discount,
          amountPaid: pkg.price - discount,
          paymentId: razorpay_payment_id
        });
        
        // Increment coupon usage count
        await coupon.update({
          usageCount: coupon.usageCount + 1
        });
        
        console.log(`✅ Coupon ${coupon.code} applied - Bonus: ${bonusHC} HC, Discount: ₹${discount}`);
      }
    }
    
    // Add coins to wallet
    const result = await healthCoinsService.addCoins(
      req.user.id,
      totalHC,
      'PURCHASE',
      'PURCHASE',
      `Purchased ${pkg.coins} health coins${bonusHC > 0 ? ` + ${bonusHC} bonus HC` : ''}${coupon ? ` (Coupon: ${coupon.code})` : ''}`,
      {
        packageId,
        paymentMethod: 'razorpay',
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        amountPaid: pkg.price - discount,
        baseCoins: pkg.coins,
        bonusCoins: bonusHC,
        couponCode: couponCode || null,
        discount: discount
      }
    );
    
    console.log(`✅ Successfully credited ${totalHC} HC to user ${req.user.id}${bonusHC > 0 ? ` (${pkg.coins} + ${bonusHC} bonus)` : ''}`);
    
    res.json({
      success: true,
      message: `Successfully purchased ${pkg.coins} health coins${bonusHC > 0 ? ` + ${bonusHC} bonus HC` : ''}`,
      coinsPurchased: pkg.coins,
      bonusCoins: bonusHC,
      totalCoins: totalHC,
      newBalance: result.newBalance,
      transactionId: razorpay_payment_id,
      couponApplied: !!coupon
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
 * POST /api/wallet/redeem-free-coupon
 * Redeem a FREE_HC coupon (no Razorpay payment required)
 */
router.post('/redeem-free-coupon', authUser, async (req, res) => {
  try {
    const { packageId, couponCode } = req.body;

    if (packageId === undefined || !couponCode) {
      return res.status(400).json({
        success: false,
        message: 'Package ID and coupon code are required'
      });
    }

    // Get package details
    const pkg = HEALTH_COINS_PRICING.packages[packageId];
    if (!pkg) {
      return res.status(400).json({ success: false, message: 'Invalid package' });
    }

    // Validate coupon
    const coupon = await Coupon.findOne({
      where: {
        code: couponCode.toUpperCase(),
        isActive: true,
        validFrom: { [Op.lte]: new Date() },
        validUntil: { [Op.gte]: new Date() }
      }
    });

    if (!coupon) {
      return res.status(400).json({ success: false, message: 'Invalid or expired coupon' });
    }

    // Only FREE_HC coupons can be redeemed for free
    if (coupon.type !== 'FREE_HC') {
      return res.status(400).json({ success: false, message: 'This coupon requires payment' });
    }

    // Check usage limits
    if (coupon.usageCount >= coupon.maxUsage) {
      return res.status(400).json({ success: false, message: 'Coupon usage limit reached' });
    }

    const userUsage = await CouponUsage.count({
      where: { couponId: coupon.id, userId: req.user.id }
    });

    if (userUsage >= coupon.maxUsagePerUser) {
      return res.status(400).json({ success: false, message: 'You have already used this coupon' });
    }

    const bonusHC = coupon.value;
    const totalHC = pkg.coins + bonusHC;

    // Record coupon usage
    await CouponUsage.create({
      couponId: coupon.id,
      couponCode: coupon.code,
      userId: req.user.id,
      hcPurchased: pkg.coins,
      hcBonus: bonusHC,
      discountAmount: pkg.price,
      amountPaid: 0,
      paymentId: `FREE_${Date.now()}`
    });

    // Increment coupon usage count
    await coupon.update({ usageCount: coupon.usageCount + 1 });

    // Credit coins
    const result = await healthCoinsService.addCoins(
      req.user.id,
      totalHC,
      'PURCHASE',
      'PURCHASE',
      `Free HC via coupon ${coupon.code}: ${pkg.coins} HC + ${bonusHC} bonus`,
      {
        packageId,
        paymentMethod: 'free_coupon',
        couponCode: coupon.code,
        baseCoins: pkg.coins,
        bonusCoins: bonusHC,
        amountPaid: 0
      }
    );

    console.log(`✅ Free coupon ${coupon.code} redeemed by user ${req.user.id}: ${totalHC} HC`);

    res.json({
      success: true,
      message: `${totalHC} health coins added to your wallet via coupon ${coupon.code}`,
      totalCoins: totalHC,
      baseCoins: pkg.coins,
      bonusCoins: bonusHC,
      newBalance: result.newBalance
    });
  } catch (error) {
    console.error('Redeem free coupon error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to redeem coupon',
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
