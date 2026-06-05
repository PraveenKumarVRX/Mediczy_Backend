/**
 * Health Coins Service
 * Business logic for wallet operations and coin rewards
 */

import UserWallet from '../models/postgres/user-wallet.model.postgres.js';
import HealthCoinsTransaction from '../models/postgres/health-coins-transaction.model.postgres.js';
import UserActivityLog from '../models/postgres/user-activity-log.model.postgres.js';
import { HEALTH_COINS_REWARDS, HEALTH_COINS_PRICING } from '../config/health-coins.config.js';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { Op } from 'sequelize';

class HealthCoinsService {
  /**
   * Get or create user wallet
   */
  async getOrCreateWallet(userId) {
    let wallet = await UserWallet.findOne({ where: { userId } });
    
    if (!wallet) {
      wallet = await UserWallet.create({
        userId,
        balance: 0,
        totalEarned: 0,
        totalSpent: 0,
        totalPurchased: 0
      });
    }
    
    return wallet;
  }

  /**
   * Get wallet balance
   */
  async getBalance(userId) {
    const wallet = await this.getOrCreateWallet(userId);
    return parseFloat(wallet.balance);
  }

  /**
   * Add coins to wallet
   */
  async addCoins(userId, amount, type, activityType, description, metadata = {}) {
    const transaction = await sequelize.transaction();
    
    try {
      const wallet = await this.getOrCreateWallet(userId);
      
      // Update balance
      const newBalance = parseFloat(wallet.balance) + parseFloat(amount);
      
      await wallet.update({
        balance: newBalance,
        totalEarned: type === 'EARN' ? parseFloat(wallet.totalEarned) + parseFloat(amount) : wallet.totalEarned,
        totalPurchased: type === 'PURCHASE' ? parseFloat(wallet.totalPurchased) + parseFloat(amount) : wallet.totalPurchased,
        lastActivityDate: new Date()
      }, { transaction });
      
      // Create transaction record
      const txn = await HealthCoinsTransaction.create({
        userId,
        type,
        amount: parseFloat(amount),
        balanceAfter: newBalance,
        activityType,
        description,
        metadata,
        status: 'COMPLETED'
      }, { transaction });
      
      await transaction.commit();
      
      return {
        success: true,
        transaction: txn,
        newBalance
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Deduct coins from wallet
   */
  async deductCoins(userId, amount, activityType, description, referenceType, referenceId, metadata = {}) {
    const transaction = await sequelize.transaction();
    
    try {
      const wallet = await this.getOrCreateWallet(userId);
      
      // Check sufficient balance
      if (parseFloat(wallet.balance) < parseFloat(amount)) {
        throw new Error('Insufficient health coins balance');
      }
      
      // Update balance
      const newBalance = parseFloat(wallet.balance) - parseFloat(amount);
      
      await wallet.update({
        balance: newBalance,
        totalSpent: parseFloat(wallet.totalSpent) + parseFloat(amount)
      }, { transaction });
      
      // Create transaction record
      const txn = await HealthCoinsTransaction.create({
        userId,
        type: 'SPEND',
        amount: -parseFloat(amount),
        balanceAfter: newBalance,
        activityType,
        description,
        referenceType,
        referenceId,
        metadata,
        status: 'COMPLETED'
      }, { transaction });
      
      await transaction.commit();
      
      return {
        success: true,
        transaction: txn,
        newBalance
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Award coins for daily login
   */
  async awardDailyLogin(userId) {
    const today = new Date().toISOString().split('T')[0];
    const dayStart = new Date(`${today}T00:00:00.000Z`);
    const dayEnd = new Date(`${today}T23:59:59.999Z`);

    // Hard guard: never allow more than one DAILY_LOGIN reward transaction per day.
    const dailyLoginTxn = await HealthCoinsTransaction.findOne({
      where: {
        userId,
        activityType: 'DAILY_LOGIN',
        status: 'COMPLETED',
        createdAt: {
          [Op.between]: [dayStart, dayEnd]
        }
      }
    });

    if (dailyLoginTxn) {
      const wallet = await this.getOrCreateWallet(userId);
      return {
        success: false,
        message: 'Daily login already rewarded today',
        streak: wallet.streakDays || 0,
        newBalance: parseFloat(wallet.balance)
      };
    }
    
    // Check if already rewarded today
    let activityLog = await UserActivityLog.findOne({
      where: { userId, activityDate: today }
    });
    
    if (activityLog && activityLog.dailyLoginRewarded) {
      return { success: false, message: 'Daily login already rewarded today' };
    }
    
    // Create or update activity log
    if (!activityLog) {
      activityLog = await UserActivityLog.create({
        userId,
        activityDate: today,
        dailyLoginRewarded: true
      });
    } else {
      await activityLog.update({ dailyLoginRewarded: true });
    }
    
    // Update streak
    const wallet = await this.getOrCreateWallet(userId);
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const yesterdayLog = await UserActivityLog.findOne({
      where: { userId, activityDate: yesterday }
    });
    
    let newStreak = 1;
    if (yesterdayLog && yesterdayLog.dailyLoginRewarded) {
      newStreak = wallet.streakDays + 1;
    }
    
    await wallet.update({ streakDays: newStreak });
    
    // Award coins
    const result = await this.addCoins(
      userId,
      HEALTH_COINS_REWARDS.DAILY_LOGIN,
      'EARN',
      'DAILY_LOGIN',
      `Daily login reward - Day ${newStreak}`,
      { streak: newStreak }
    );

    // Daily login is strictly fixed to 1 HC/day.
    result.bonusAwarded = 0;
    result.streak = newStreak;
    return result;
  }

  /**
   * Award coins for steps milestone
   */
  async awardStepsMilestone(userId, totalSteps) {
    const today = new Date().toISOString().split('T')[0];
    
    // Get or create today's activity log
    let activityLog = await UserActivityLog.findOne({
      where: { userId, activityDate: today }
    });
    
    if (!activityLog) {
      activityLog = await UserActivityLog.create({
        userId,
        activityDate: today,
        totalSteps: totalSteps
      });
    }
    
    // Calculate milestones (100 steps = 1 HC)
    const newMilestones = Math.floor(totalSteps / 100);
    const previousMilestones = activityLog.stepsGoalReached || 0;
    
    // Check if new milestones achieved
    if (newMilestones <= previousMilestones) {
      return { success: false, message: 'No new milestones achieved' };
    }
    
    // Calculate coins to award (max 10 per day)
    const milestonesToAward = Math.min(
      newMilestones - previousMilestones,
      HEALTH_COINS_REWARDS.STEPS_MAX_PER_DAY - previousMilestones
    );
    
    if (milestonesToAward <= 0) {
      return { success: false, message: 'Daily steps reward limit reached' };
    }
    
    // Update activity log
    await activityLog.update({
      stepsGoalReached: previousMilestones + milestonesToAward,
      totalSteps: totalSteps
    });
    
    // Award coins
    const coinsToAward = milestonesToAward * HEALTH_COINS_REWARDS.STEPS_PER_100;
    const result = await this.addCoins(
      userId,
      coinsToAward,
      'EARN',
      'STEPS_MILESTONE',
      `${milestonesToAward} x 100 steps milestone achieved`,
      { steps: totalSteps, milestones: milestonesToAward }
    );
    
    return result;
  }

  /**
   * Award coins for health assessment
   */
  async awardHealthAssessment(userId) {
    const today = new Date().toISOString().split('T')[0];
    
    let activityLog = await UserActivityLog.findOne({
      where: { userId, activityDate: today }
    });
    
    if (activityLog && activityLog.healthAssessmentCompleted) {
      return { success: false, message: 'Health assessment already rewarded today' };
    }
    
    if (!activityLog) {
      activityLog = await UserActivityLog.create({
        userId,
        activityDate: today,
        healthAssessmentCompleted: true
      });
    } else {
      await activityLog.update({ healthAssessmentCompleted: true });
    }
    
    return await this.addCoins(
      userId,
      HEALTH_COINS_REWARDS.HEALTH_ASSESSMENT,
      'EARN',
      'HEALTH_ASSESSMENT',
      'Completed health risk assessment',
      {}
    );
  }

  /**
   * Award coins for vital signs logging
   */
  async awardVitalSignsLog(userId) {
    const today = new Date().toISOString().split('T')[0];
    
    let activityLog = await UserActivityLog.findOne({
      where: { userId, activityDate: today }
    });
    
    if (activityLog && activityLog.vitalSignsLogged) {
      return { success: false, message: 'Vital signs already rewarded today' };
    }
    
    if (!activityLog) {
      activityLog = await UserActivityLog.create({
        userId,
        activityDate: today,
        vitalSignsLogged: true
      });
    } else {
      await activityLog.update({ vitalSignsLogged: true });
    }
    
    return await this.addCoins(
      userId,
      HEALTH_COINS_REWARDS.VITAL_SIGNS_LOG,
      'EARN',
      'VITAL_SIGNS_LOG',
      'Logged vital signs',
      {}
    );
  }

  /**
   * Award coins for various one-time or repeatable activities
   */
  async awardActivity(userId, activityType, metadata = {}) {
    const reward = HEALTH_COINS_REWARDS[activityType];
    
    if (!reward) {
      throw new Error(`Invalid activity type: ${activityType}`);
    }
    
    return await this.addCoins(
      userId,
      reward,
      'EARN',
      activityType,
      `Reward for ${activityType.toLowerCase().replace(/_/g, ' ')}`,
      metadata
    );
  }

  /**
   * Get transaction history
   */
  async getTransactionHistory(userId, limit = 50, offset = 0) {
    const transactions = await HealthCoinsTransaction.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });
    
    return transactions;
  }

  /**
   * Get wallet summary
   */
  async getWalletSummary(userId) {
    const wallet = await this.getOrCreateWallet(userId);
    
    // Get today's activity
    const today = new Date().toISOString().split('T')[0];
    const todayActivity = await UserActivityLog.findOne({
      where: { userId, activityDate: today }
    });
    
    // Get recent transactions
    const recentTransactions = await this.getTransactionHistory(userId, 10);
    
    return {
      balance: parseFloat(wallet.balance),
      totalEarned: parseFloat(wallet.totalEarned),
      totalSpent: parseFloat(wallet.totalSpent),
      totalPurchased: parseFloat(wallet.totalPurchased),
      streakDays: wallet.streakDays,
      todayActivity: todayActivity || null,
      recentTransactions
    };
  }

  /**
   * Calculate HC required to pay for a consultation
   * Includes bonus value calculation
   */
  calculateHCForConsultation(consultationFeeINR) {
    // Consultation payments must use exact HC equivalent (no bonus discount).
    const bonusPercent = 0;
    const rate = HEALTH_COINS_PRICING.HC_TO_INR_RATE || 1;
    
    // Exact conversion: 1 HC uses configured rate with no consultation bonus.
    const effectiveRate = rate * (1 + bonusPercent / 100);
    const hcRequired = Math.ceil(consultationFeeINR / effectiveRate);
    
    return {
      consultationFeeINR,
      hcRequired,
      hcToINRRate: rate,
      bonusPercent,
      effectiveValuePerHC: effectiveRate,
      savings: consultationFeeINR - hcRequired  // How much saved compared to INR value
    };
  }

  /**
   * Check if user can pay for consultation with HC
   */
  async canPayWithHC(userId, consultationFeeINR) {
    const wallet = await this.getOrCreateWallet(userId);
    const balance = parseFloat(wallet.balance);
    const calculation = this.calculateHCForConsultation(consultationFeeINR);
    
    return {
      canPay: balance >= calculation.hcRequired,
      currentBalance: balance,
      ...calculation,
      shortfall: Math.max(0, calculation.hcRequired - balance)
    };
  }

  /**
   * Pay for appointment using Health Coins
   */
  async payForAppointment(userId, appointmentId, consultationFeeINR, doctorName) {
    const transaction = await sequelize.transaction();
    
    try {
      const wallet = await this.getOrCreateWallet(userId);
      const balance = parseFloat(wallet.balance);
      const calculation = this.calculateHCForConsultation(consultationFeeINR);
      
      // Check sufficient balance
      if (balance < calculation.hcRequired) {
        throw new Error(`Insufficient Health Coins. Required: ${calculation.hcRequired} HC, Available: ${balance} HC`);
      }
      
      // Deduct coins
      const newBalance = balance - calculation.hcRequired;
      
      await wallet.update({
        balance: newBalance,
        totalSpent: parseFloat(wallet.totalSpent) + calculation.hcRequired
      }, { transaction });
      
      // Create transaction record
      const txn = await HealthCoinsTransaction.create({
        userId,
        type: 'SPEND',
        amount: -calculation.hcRequired,
        balanceAfter: newBalance,
        activityType: 'CONSULTATION',
        description: `Paid for appointment #${appointmentId} with ${doctorName}`,
        referenceType: 'APPOINTMENT',
        referenceId: parseInt(appointmentId, 10),
        metadata: {
          appointmentId,
          doctorName,
          consultationFeeINR,
          hcPaid: calculation.hcRequired,
          bonusPercent: calculation.bonusPercent,
          effectiveValue: consultationFeeINR
        },
        status: 'COMPLETED'
      }, { transaction });
      
      await transaction.commit();
      
      return {
        success: true,
        transaction: txn,
        newBalance,
        hcPaid: calculation.hcRequired,
        consultationFeeINR,
        bonusPercent: calculation.bonusPercent
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Refund HC for cancelled appointment
   */
  async refundAppointmentPayment(userId, appointmentId, hcAmount, doctorName) {
    return await this.addCoins(
      userId,
      hcAmount,
      'REFUND',
      'APPOINTMENT_REFUND',
      `Refund for cancelled appointment #${appointmentId} with ${doctorName}`,
      {
        appointmentId,
        doctorName,
        refundedAmount: hcAmount
      }
    );
  }
}

export default new HealthCoinsService();
