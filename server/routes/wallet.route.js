/**
 * Health Coins Wallet Routes
 * API endpoints for wallet operations and health coins management
 */

import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import healthCoinsService from '../services/health-coins.service.js';
import { HEALTH_COINS_REWARDS, HEALTH_COINS_PRICING } from '../config/health-coins.config.js';

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
 * POST /api/wallet/purchase
 * Purchase health coins with real money
 */
router.post('/purchase', authUser, async (req, res) => {
  try {
    const { packageId, paymentMethod, paymentTransactionId, amountPaid } = req.body;
    
    if (!packageId || !paymentTransactionId || !amountPaid) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }
    
    // Get package details
    const pkg = HEALTH_COINS_PRICING.packages.find((p, idx) => idx === packageId);
    
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

export default router;
