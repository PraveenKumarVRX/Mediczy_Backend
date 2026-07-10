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
import { ok, clientError, serverError, notFound, forbidden, conflict } from '../utils/api-response.js';
import { ErrorCodes } from '../utils/error-codes.js';

const router = express.Router();

import {
  COUPON_SCOPES,
  normalizeRequestedScope,
  parseCouponScopes,
  parseAssignedUserIds,
  isCouponEligibleForUser,
  isCouponEligibleForScope,
  calculateCouponPricing,
  isFixedInrCoupon
} from '../services/coupon-validation.service.js';

const DEFAULT_COUPON_SCOPE = COUPON_SCOPES.COINS_PURCHASE;

/**
 * GET /api/wallet
 * Get user wallet balance and summary
 */
router.get('/', authUser, async (req, res) => {
  try {
    const summary = await healthCoinsService.getWalletSummary(req.user.id);

    return ok(res, { data: summary });
  } catch (error) {
    console.error('Get wallet error:', error);
    return serverError(res, error, 'Failed to fetch wallet');
  }
});

/**
 * GET /api/wallet/balance
 * Get wallet balance only
 */
router.get('/balance', authUser, async (req, res) => {
  try {
    const balance = await healthCoinsService.getBalance(req.user.id);

    return ok(res, { balance });
  } catch (error) {
    console.error('Get balance error:', error);
    return serverError(res, error, 'Failed to fetch balance');
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
    
    return ok(res, {
      data: transactions,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        count: transactions.length
      }
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    return serverError(res, error, 'Failed to fetch transactions');
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
      return conflict(res, result.message || 'Daily login reward unavailable', ErrorCodes.DAILY_REWARD_CLAIMED);
    }

    return ok(res, {
      message: `Earned ${HEALTH_COINS_REWARDS.DAILY_LOGIN} health coins for daily login!`,
      coinsEarned: HEALTH_COINS_REWARDS.DAILY_LOGIN,
      bonusCoins: result.bonusAwarded || 0,
      streak: result.streak,
      newBalance: result.newBalance
    });
  } catch (error) {
    console.error('Daily login reward error:', error);
    return serverError(res, error, 'Failed to award daily login');
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
      return clientError(res, 'Invalid steps count', ErrorCodes.INVALID_INPUT);
    }

    const result = await healthCoinsService.awardStepsMilestone(req.user.id, steps);

    if (!result.success) {
      return clientError(res, result.message || 'Steps milestone not awarded', ErrorCodes.INVALID_INPUT);
    }

    return ok(res, {
      message: `Earned ${result.transaction.amount} health coins for steps!`,
      coinsEarned: result.transaction.amount,
      steps,
      newBalance: result.newBalance
    });
  } catch (error) {
    console.error('Steps reward error:', error);
    return serverError(res, error, 'Failed to award steps');
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
      return clientError(res, result.message || 'Health assessment reward not awarded', ErrorCodes.INVALID_INPUT);
    }

    return ok(res, {
      message: `Earned ${HEALTH_COINS_REWARDS.HEALTH_ASSESSMENT} health coins!`,
      coinsEarned: HEALTH_COINS_REWARDS.HEALTH_ASSESSMENT,
      newBalance: result.newBalance
    });
  } catch (error) {
    console.error('Health assessment reward error:', error);
    return serverError(res, error, 'Failed to award health assessment');
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
      return clientError(res, result.message || 'Vital signs reward not awarded', ErrorCodes.INVALID_INPUT);
    }

    return ok(res, {
      message: `Earned ${HEALTH_COINS_REWARDS.VITAL_SIGNS_LOG} health coins!`,
      coinsEarned: HEALTH_COINS_REWARDS.VITAL_SIGNS_LOG,
      newBalance: result.newBalance
    });
  } catch (error) {
    console.error('Vital signs reward error:', error);
    return serverError(res, error, 'Failed to award vital signs');
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
      return clientError(res, 'Activity type is required', ErrorCodes.INVALID_INPUT);
    }

    const result = await healthCoinsService.awardActivity(
      req.user.id,
      activityType,
      metadata || {}
    );

    return ok(res, {
      message: `Earned ${result.transaction.amount} health coins!`,
      coinsEarned: result.transaction.amount,
      newBalance: result.newBalance
    });
  } catch (error) {
    console.error('Activity reward error:', error);
    return serverError(res, error, 'Failed to award activity');
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
      return clientError(res, 'Invalid amount', ErrorCodes.INVALID_INPUT);
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

    return ok(res, {
      message: `Spent ${amount} health coins`,
      coinsSpent: amount,
      newBalance: result.newBalance
    });
  } catch (error) {
    console.error('Spend coins error:', error);
    return serverError(res, error, error.message || 'Failed to spend coins');
  }
});

/**
 * GET /api/wallet/rewards
 * Get available rewards configuration
 */
router.get('/rewards', authUser, async (req, res) => {
  try {
    return ok(res, {
      data: {
        rewards: HEALTH_COINS_REWARDS,
        pricing: HEALTH_COINS_PRICING
      }
    });
  } catch (error) {
    console.error('Get rewards error:', error);
    return serverError(res, error, 'Failed to fetch rewards');
  }
});

/**
 * GET /api/wallet/my-coupons
 * Get active coupons available for the logged-in user
 */
router.get('/my-coupons', authUser, async (req, res) => {
  try {
    const scope = req.query.scope ? normalizeRequestedScope(req.query.scope) : null;
    if (req.query.scope && !scope) {
      return clientError(res, 'Invalid scope. Allowed: COINS_PURCHASE, HEALTH_CHECKUP, PHARMACY_PURCHASE, CONSULTATION', ErrorCodes.INVALID_INPUT);
    }

    const now = new Date();
    const coupons = await Coupon.findAll({
      where: {
        isActive: true,
        validFrom: { [Op.lte]: now },
        validUntil: { [Op.gte]: now }
      },
      order: [['validUntil', 'ASC'], ['createdAt', 'DESC']],
      limit: 50
    });

    const eligibleCoupons = [];

    for (const coupon of coupons) {
      if (!isCouponEligibleForUser(coupon, req.user.id)) {
        continue;
      }

      if (scope && !isCouponEligibleForScope(coupon, scope)) {
        continue;
      }

      if (coupon.usageCount >= coupon.maxUsage) {
        continue;
      }

      const userUsage = await CouponUsage.count({
        where: {
          couponId: coupon.id,
          userId: req.user.id
        }
      });

      const remainingForUser = Math.max(0, (coupon.maxUsagePerUser || 1) - userUsage);
      if (remainingForUser <= 0) {
        continue;
      }

      const assignedUserIds = parseAssignedUserIds(coupon);
      const scopes = parseCouponScopes(coupon);

      eligibleCoupons.push({
        id: coupon.id,
        code: coupon.code,
        type: coupon.type,
        value: Number(coupon.value),
        minPurchase: Number(coupon.minPurchase || 0),
        description: coupon.description,
        corporateName: coupon.corporateName,
        validUntil: coupon.validUntil,
        maxUsagePerUser: coupon.maxUsagePerUser,
        userUsage,
        remainingForUser,
        isPersonalized: assignedUserIds.length > 0,
        scopes,
        primaryScope: scopes[0]
      });
    }

    return ok(res, { coupons: eligibleCoupons });
  } catch (error) {
    console.error('Get my coupons error:', error);
    return serverError(res, error, 'Failed to fetch available coupons');
  }
});

/**
 * POST /api/wallet/validate-coupon
 * Validate coupon code for HC purchase
 */
router.post('/validate-coupon', authUser, async (req, res) => {
  try {
    const { code, packageId, scope: rawScope, orderAmount } = req.body;
    
    if (!code) {
      return clientError(res, 'Coupon code is required', ErrorCodes.INVALID_INPUT);
    }

    const scope = normalizeRequestedScope(rawScope || DEFAULT_COUPON_SCOPE);
    if (!scope) {
      return clientError(res, 'Invalid scope. Allowed: COINS_PURCHASE, HEALTH_CHECKUP, PHARMACY_PURCHASE, CONSULTATION', ErrorCodes.INVALID_INPUT);
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
      return notFound(res, 'Invalid or expired coupon code', ErrorCodes.INVALID_COUPON);
    }

    if (!isCouponEligibleForUser(coupon, req.user.id)) {
      return forbidden(res, 'This coupon is not assigned to your account', ErrorCodes.FORBIDDEN);
    }

    if (!isCouponEligibleForScope(coupon, scope)) {
      return clientError(res, `This coupon is not valid for ${scope}`, ErrorCodes.INVALID_COUPON);
    }

    // Check max usage
    if (coupon.usageCount >= coupon.maxUsage) {
      return conflict(res, 'Coupon usage limit exceeded', ErrorCodes.COUPON_ALREADY_USED);
    }

    // Check user usage
    const userUsage = await CouponUsage.count({
      where: {
        couponId: coupon.id,
        userId: req.user.id
      }
    });

    if (userUsage >= coupon.maxUsagePerUser) {
      return conflict(res, 'You have already used this coupon the maximum number of times', ErrorCodes.COUPON_ALREADY_USED);
    }

    // Calculate discount/bonus
    const normalizedOrderAmount = Number(orderAmount || 0);
    const pkg = packageId !== undefined ? HEALTH_COINS_PRICING.packages[packageId] : null;
    if (coupon.type === 'PERCENTAGE' && pkg && pkg.coins < coupon.minPurchase && !isFixedInrCoupon(coupon)) {
      return clientError(res, `Minimum purchase of ${coupon.minPurchase} HC required for this coupon`, ErrorCodes.INVALID_COUPON);
    }

    const pricing = calculateCouponPricing({
      coupon,
      scope,
      orderAmount: normalizedOrderAmount,
      packagePrice: pkg ? pkg.price : 0
    });

    return ok(res, {
      message: 'Coupon is valid',
      coupon: {
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        scope,
        scopes: parseCouponScopes(coupon),
        grantType: coupon.metadata?.grantType || null,
        description: coupon.description,
        discount: pricing.discount,
        bonusHC: pricing.bonusHC,
        finalPrice: pricing.finalPrice
      }
    });
  } catch (error) {
    if (error.message?.includes('coupon') || error.message?.includes('Coupon') || error.message?.includes('Minimum order')) {
      return clientError(res, error.message, ErrorCodes.INVALID_COUPON);
    }
    console.error('Validate coupon error:', error);
    return serverError(res, error, 'Failed to validate coupon');
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
      return clientError(res, 'Package ID is required', ErrorCodes.INVALID_INPUT);
    }

    // Get package details
    const pkg = HEALTH_COINS_PRICING.packages[packageId];

    if (!pkg) {
      return clientError(res, 'Invalid package', ErrorCodes.INVALID_INPUT);
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
        return clientError(res, 'Invalid or expired coupon code', ErrorCodes.INVALID_COUPON);
      }

      if (!isCouponEligibleForUser(coupon, req.user.id)) {
        return forbidden(res, 'This coupon is not assigned to your account', ErrorCodes.FORBIDDEN);
      }

      if (!isCouponEligibleForScope(coupon, COUPON_SCOPES.COINS_PURCHASE)) {
        return clientError(res, 'This coupon is not valid for coin purchases', ErrorCodes.INVALID_COUPON);
      }

      // Check usage limits
      if (coupon.usageCount >= coupon.maxUsage) {
        return conflict(res, 'Coupon usage limit exceeded', ErrorCodes.COUPON_ALREADY_USED);
      }

      const userUsage = await CouponUsage.count({
        where: { couponId: coupon.id, userId: req.user.id }
      });

      if (userUsage >= coupon.maxUsagePerUser) {
        return conflict(res, 'You have already used this coupon', ErrorCodes.COUPON_ALREADY_USED);
      }

      // Apply coupon discount/bonus
      if (coupon.type === 'PERCENTAGE') {
        if (pkg.coins < coupon.minPurchase) {
          return clientError(res, `Minimum purchase of ${coupon.minPurchase} HC required`, ErrorCodes.INVALID_COUPON);
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
      // Razorpay notes MUST be string key-value pairs (no nulls, no numbers)
      const rawNotes = {
        userId: req.user.id,
        packageId,
        coins: pkg.coins,
        bonusHC,
        type: 'health_coins_purchase'
      };
      if (couponCode) rawNotes.couponCode = couponCode;
      // Stringify all note values — Razorpay requires string values
      const notes = {};
      for (const [k, v] of Object.entries(rawNotes)) {
        if (v !== null && v !== undefined) notes[k] = String(v);
      }

      const orderData = {
        amount: finalAmount,
        currency: 'INR',
        receipt: `HC_${req.user.id}_${Date.now()}`,
        notes
      };

      console.log('📝 Creating Razorpay order with:', JSON.stringify(orderData, null, 2));
      
      razorpayOrder = await paymentGateway.createRazorpayOrder(orderData);
      
      console.log('✅ Razorpay order created for HC purchase:', razorpayOrder.orderId);
      console.log('📤 Razorpay order details:', JSON.stringify(razorpayOrder, null, 2));
    }
    
    return ok(res, {
      order: razorpayOrder ? {
        orderId: razorpayOrder.orderId,
        amount: razorpayOrder.amount,
        amountInPaise: razorpayOrder.amountInPaise,
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
    return serverError(res, error, 'Failed to create payment order');
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
      return clientError(res, 'Missing required payment fields', ErrorCodes.INVALID_INPUT);
    }

    // Verify payment signature
    const isValid = paymentGateway.verifyRazorpaySignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );

    if (!isValid) {
      console.error('❌ Invalid payment signature');
      return clientError(res, 'Payment verification failed', ErrorCodes.PAYMENT_FAILED);
    }

    // Get package details
    const pkg = HEALTH_COINS_PRICING.packages[packageId];

    if (!pkg) {
      return clientError(res, 'Invalid package', ErrorCodes.INVALID_INPUT);
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
        if (!isCouponEligibleForUser(coupon, req.user.id) || !isCouponEligibleForScope(coupon, COUPON_SCOPES.COINS_PURCHASE)) {
          coupon = null;
        }

        if (!coupon) {
          return clientError(res, 'This coupon is not valid for this user or purchase type', ErrorCodes.INVALID_COUPON);
        }

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

    return ok(res, {
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
    return serverError(res, error, 'Failed to verify payment');
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
      return clientError(res, 'Package ID and coupon code are required', ErrorCodes.INVALID_INPUT);
    }

    // Get package details
    const pkg = HEALTH_COINS_PRICING.packages[packageId];
    if (!pkg) {
      return clientError(res, 'Invalid package', ErrorCodes.INVALID_INPUT);
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
      return clientError(res, 'Invalid or expired coupon', ErrorCodes.INVALID_COUPON);
    }

    if (!isCouponEligibleForUser(coupon, req.user.id)) {
      return forbidden(res, 'This coupon is not assigned to your account', ErrorCodes.FORBIDDEN);
    }

    if (!isCouponEligibleForScope(coupon, COUPON_SCOPES.COINS_PURCHASE)) {
      return clientError(res, 'This coupon is not valid for coin purchases', ErrorCodes.INVALID_COUPON);
    }

    // Only FREE_HC coupons can be redeemed for free
    if (coupon.type !== 'FREE_HC') {
      return clientError(res, 'This coupon requires payment', ErrorCodes.INVALID_COUPON);
    }

    // Check usage limits
    if (coupon.usageCount >= coupon.maxUsage) {
      return conflict(res, 'Coupon usage limit reached', ErrorCodes.COUPON_ALREADY_USED);
    }

    const userUsage = await CouponUsage.count({
      where: { couponId: coupon.id, userId: req.user.id }
    });

    if (userUsage >= coupon.maxUsagePerUser) {
      return conflict(res, 'You have already used this coupon', ErrorCodes.COUPON_ALREADY_USED);
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

    return ok(res, {
      message: `${totalHC} health coins added to your wallet via coupon ${coupon.code}`,
      totalCoins: totalHC,
      baseCoins: pkg.coins,
      bonusCoins: bonusHC,
      newBalance: result.newBalance
    });
  } catch (error) {
    console.error('Redeem free coupon error:', error);
    return serverError(res, error, 'Failed to redeem coupon');
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
      return clientError(res, 'Missing required fields', ErrorCodes.INVALID_INPUT);
    }

    // Get package details
    const pkg = HEALTH_COINS_PRICING.packages[packageId];

    if (!pkg) {
      return clientError(res, 'Invalid package', ErrorCodes.INVALID_INPUT);
    }

    // Verify payment amount
    if (parseFloat(amountPaid) < pkg.price) {
      return clientError(res, 'Insufficient payment amount', ErrorCodes.PAYMENT_FAILED);
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

    return ok(res, {
      message: `Successfully purchased ${pkg.coins} health coins`,
      coinsPurchased: pkg.coins,
      newBalance: result.newBalance
    });
  } catch (error) {
    console.error('Purchase coins error:', error);
    return serverError(res, error, 'Failed to purchase coins');
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
      return clientError(res, 'Invalid consultation fee', ErrorCodes.INVALID_INPUT);
    }

    const canPayResult = await healthCoinsService.canPayWithHC(req.user.id, consultationFee);

    return ok(res, { data: canPayResult });
  } catch (error) {
    console.error('Calculate HC error:', error);
    return serverError(res, error, 'Failed to calculate HC requirement');
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
      return clientError(res, 'Valid consultation fee is required', ErrorCodes.INVALID_INPUT);
    }

    const result = await healthCoinsService.canPayWithHC(req.user.id, consultationFee);

    return ok(res, { data: result });
  } catch (error) {
    console.error('Can pay with HC error:', error);
    return serverError(res, error, 'Failed to check HC payment eligibility');
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
      return clientError(res, 'Appointment ID, consultation fee, and doctor name are required', ErrorCodes.INVALID_INPUT);
    }

    // First check if user can pay
    const canPayResult = await healthCoinsService.canPayWithHC(req.user.id, consultationFee);

    if (!canPayResult.canPay) {
      return clientError(
        res,
        `Insufficient Health Coins. You need ${canPayResult.hcRequired} HC but have ${canPayResult.currentBalance} HC`,
        ErrorCodes.INSUFFICIENT_COINS
      );
    }

    // Process the payment
    const result = await healthCoinsService.payForAppointment(
      req.user.id,
      appointmentId,
      consultationFee,
      doctorName
    );

    console.log(`✅ HC payment successful: User ${req.user.id} paid ${result.hcPaid} HC for appointment ${appointmentId}`);

    return ok(res, {
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
    return serverError(res, error, error.message || 'Failed to process HC payment');
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
      return clientError(res, 'Appointment ID, HC amount, and doctor name are required', ErrorCodes.INVALID_INPUT);
    }

    const result = await healthCoinsService.refundAppointmentPayment(
      req.user.id,
      appointmentId,
      hcAmount,
      doctorName
    );

    console.log(`✅ HC refund successful: User ${req.user.id} refunded ${hcAmount} HC for appointment ${appointmentId}`);

    return ok(res, {
      message: `Successfully refunded ${hcAmount} HC for cancelled appointment`,
      data: {
        appointmentId,
        hcRefunded: hcAmount,
        newBalance: result.newBalance
      }
    });
  } catch (error) {
    console.error('HC refund error:', error);
    return serverError(res, error, 'Failed to process HC refund');
  }
});

export default router;
