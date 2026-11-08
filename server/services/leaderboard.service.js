import { Op } from 'sequelize';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import HealthGoal from '../models/postgres/health-goal.model.postgres.js';
import HealthChallenge from '../models/postgres/health-challenge.model.postgres.js';
import UserGoalProgress from '../models/postgres/user-goal-progress.model.postgres.js';
import UserChallengeParticipation from '../models/postgres/user-challenge-participation.model.postgres.js';
import Leaderboard from '../models/postgres/leaderboard.model.postgres.js';
import { Achievement, UserAchievement } from '../models/postgres/achievement.model.postgres.js';
import UserModel from '../models/postgres/user.model.postgres.js';
import healthCoinsService from './health-coins.service.js';

// The model is imported directly here, so register the association used by
// leaderboard queries even when the central association bootstrap is absent.
if (!Leaderboard.associations.user) {
  Leaderboard.belongsTo(UserModel, { as: 'user', foreignKey: 'userId' });
}

class LeaderboardService {
  // ===================== HEALTH GOALS =====================
  
  /**
   * @param {object} filters
   * @param {number} [userId] when given, each goal is annotated with the
   *   caller's enrolment. Without it a client cannot tell a goal it has
   *   already joined from one it has not: the app kept a joined goal under
   *   "Available", and tapping Join again answered "Already enrolled".
   */
  async getAllGoals(filters = {}, userId = null) {
    const where = { isActive: true };

    if (filters.category) where.category = filters.category;
    if (filters.type) where.type = filters.type;
    if (filters.difficulty) where.difficulty = filters.difficulty;
    if (filters.isPublic !== undefined) where.isPublic = filters.isPublic;

    const goals = await HealthGoal.findAll({
      where,
      order: [['difficulty', 'ASC'], ['points', 'ASC']]
    });

    if (!userId) return goals;

    const progress = await UserGoalProgress.findAll({
      where: { userId, goalId: { [Op.in]: goals.map((g) => g.id) } },
      order: [['createdAt', 'DESC']],
    });
    const byGoal = new Map();
    for (const row of progress) {
      // Keep the most recent record per goal; an active one always wins.
      const current = byGoal.get(String(row.goalId));
      const active = ['NOT_STARTED', 'IN_PROGRESS'].includes(row.status);
      if (!current || (active && !['NOT_STARTED', 'IN_PROGRESS'].includes(current.status))) {
        byGoal.set(String(row.goalId), row);
      }
    }

    return goals.map((goal) => {
      const row = byGoal.get(String(goal.id));
      const active = row ? ['NOT_STARTED', 'IN_PROGRESS'].includes(row.status) : false;
      return {
        ...goal.toJSON(),
        joined: active,
        completed: row ? row.status === 'COMPLETED' : false,
        progress: row
          ? { status: row.status, currentValue: row.currentValue, targetValue: row.targetValue, startedAt: row.createdAt }
          : null,
      };
    });
  }

  async getGoalById(goalId) {
    return await HealthGoal.findByPk(goalId);
  }

  async createGoal(userId, goalData) {
    return await HealthGoal.create({
      ...goalData,
      createdBy: userId
    });
  }

  async joinGoal(userId, goalId) {
    const transaction = await sequelize.transaction();
    
    try {
      // Check if already joined
      const existing = await UserGoalProgress.findOne({
        where: {
          userId,
          goalId,
          status: { [Op.in]: ['NOT_STARTED', 'IN_PROGRESS'] }
        }
      });

      // Joining a goal you are already in is not an error — it is the same
      // outcome. Throwing here meant a user whose goal the list still showed
      // as "Available" got a failure message for tapping Join. Idempotent.
      if (existing) {
        await transaction.rollback();
        return { progress: existing, alreadyEnrolled: true };
      }

      const goal = await HealthGoal.findByPk(goalId);
      if (!goal) {
        throw new Error('Goal not found');
      }

      // Calculate end date
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + goal.duration);

      const progress = await UserGoalProgress.create({
        userId,
        goalId,
        status: 'IN_PROGRESS',
        currentValue: 0,
        targetValue: goal.targetValue,
        progressPercentage: 0,
        startDate,
        endDate,
        pointsEarned: 0,
        streak: 0
      }, { transaction });

      await transaction.commit();
      return { progress, alreadyEnrolled: false };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async updateGoalProgress(userId, goalId, progressData) {
    const transaction = await sequelize.transaction();
    
    try {
      const progress = await UserGoalProgress.findOne({
        where: {
          userId,
          goalId,
          status: 'IN_PROGRESS'
        }
      });

      if (!progress) {
        throw new Error('Goal progress not found or not active');
      }

      const goal = await HealthGoal.findByPk(goalId);

      // Update progress
      const newValue = progressData.incrementBy 
        ? parseFloat(progress.currentValue) + parseFloat(progressData.incrementBy)
        : parseFloat(progressData.value);

      const percentage = Math.min((newValue / progress.targetValue) * 100, 100);
      
      // Calculate streak
      const lastActivity = progress.lastActivityDate 
        ? new Date(progress.lastActivityDate) 
        : new Date(progress.startDate);
      const daysSinceLastActivity = Math.floor(
        (new Date() - lastActivity) / (1000 * 60 * 60 * 24)
      );
      
      let newStreak = progress.streak;
      if (daysSinceLastActivity === 0) {
        // Same day, no change
      } else if (daysSinceLastActivity === 1) {
        newStreak++;
      } else {
        newStreak = 1; // Reset streak
      }

      // Add check-in
      const checkIns = progress.checkIns || [];
      checkIns.push({
        date: new Date(),
        value: newValue,
        note: progressData.note || null
      });

      const updates = {
        currentValue: newValue,
        progressPercentage: percentage,
        lastActivityDate: new Date(),
        streak: newStreak,
        checkIns
      };

      // Check if goal completed
      if (percentage >= 100) {
        updates.status = 'COMPLETED';
        updates.completedAt = new Date();
        updates.pointsEarned = goal.points;

        // Award health coins
        await healthCoinsService.addCoins(
          userId,
          goal.points,
          'GOAL_COMPLETION',
          `Completed goal: ${goal.name}`,
          transaction
        );

        // Update leaderboard
        await this.updateUserLeaderboard(userId, transaction);

        // Check for achievements
        await this.checkAndUnlockAchievements(userId, transaction);
      }

      await progress.update(updates, { transaction });

      await transaction.commit();
      return progress;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async getUserGoals(userId, status = null) {
    const where = { userId };
    if (status) where.status = status;

    return await UserGoalProgress.findAll({
      where,
      include: [{
        model: HealthGoal,
        as: 'goal'
      }],
      order: [['createdAt', 'DESC']]
    });
  }

  // ===================== CHALLENGES =====================

  async getAllChallenges(filters = {}) {
    const where = {};
    
    if (filters.status) where.status = filters.status;
    if (filters.type) where.type = filters.type;
    if (filters.category) where.category = filters.category;
    
    return await HealthChallenge.findAll({
      where,
      order: [['startDate', 'DESC']]
    });
  }

  async getChallengeById(challengeId) {
    return await HealthChallenge.findByPk(challengeId, {
      include: [{
        model: UserChallengeParticipation,
        as: 'participants'
      }]
    });
  }

  async createChallenge(userId, challengeData) {
    return await HealthChallenge.create({
      ...challengeData,
      createdBy: userId,
      status: new Date() >= new Date(challengeData.startDate) ? 'ACTIVE' : 'UPCOMING'
    });
  }

  async joinChallenge(userId, challengeId) {
    const transaction = await sequelize.transaction();
    
    try {
      // Check if already joined
      const existing = await UserChallengeParticipation.findOne({
        where: { userId, challengeId }
      });

      if (existing) {
        throw new Error('Already participating in this challenge');
      }

      const challenge = await HealthChallenge.findByPk(challengeId);
      if (!challenge) {
        throw new Error('Challenge not found');
      }

      if (challenge.status === 'COMPLETED' || challenge.status === 'CANCELLED') {
        throw new Error('Challenge is not active');
      }

      // Check max participants
      if (challenge.maxParticipants) {
        const currentCount = await UserChallengeParticipation.count({
          where: { challengeId }
        });
        if (currentCount >= challenge.maxParticipants) {
          throw new Error('Challenge is full');
        }
      }

      // Deduct entry fee if required
      if (challenge.entryFee > 0) {
        await healthCoinsService.deductCoins(
          userId,
          challenge.entryFee,
          'CHALLENGE_ENTRY',
          `Joined challenge: ${challenge.name}`,
          transaction
        );
      }

      const participation = await UserChallengeParticipation.create({
        userId,
        challengeId,
        status: 'ACTIVE',
        currentValue: 0,
        progressPercentage: 0,
        entryFeePaid: challenge.entryFee
      }, { transaction });

      await transaction.commit();
      return participation;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async updateChallengeProgress(userId, challengeId, progressData) {
    const transaction = await sequelize.transaction();
    
    try {
      const participation = await UserChallengeParticipation.findOne({
        where: {
          userId,
          challengeId,
          status: 'ACTIVE'
        }
      });

      if (!participation) {
        throw new Error('Not participating in this challenge');
      }

      const challenge = await HealthChallenge.findByPk(challengeId);

      // Update progress
      const newValue = progressData.incrementBy 
        ? parseFloat(participation.currentValue) + parseFloat(progressData.incrementBy)
        : parseFloat(progressData.value);

      const percentage = Math.min((newValue / challenge.targetValue) * 100, 100);

      // Add check-in
      const checkIns = participation.checkIns || [];
      checkIns.push({
        date: new Date(),
        value: newValue,
        note: progressData.note || null
      });

      const updates = {
        currentValue: newValue,
        progressPercentage: percentage,
        lastActivityDate: new Date(),
        checkIns
      };

      if (percentage >= 100) {
        updates.status = 'COMPLETED';
        updates.completedAt = new Date();
        updates.pointsEarned = challenge.points;
      }

      await participation.update(updates, { transaction });

      // Recalculate challenge rankings
      await this.updateChallengeRankings(challengeId, transaction);

      await transaction.commit();
      return participation;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async updateChallengeRankings(challengeId, transaction) {
    const participants = await UserChallengeParticipation.findAll({
      where: { challengeId, status: { [Op.in]: ['ACTIVE', 'COMPLETED'] } },
      order: [['currentValue', 'DESC'], ['lastActivityDate', 'ASC']]
    });

    for (let i = 0; i < participants.length; i++) {
      await participants[i].update({
        previousRank: participants[i].rank,
        rank: i + 1
      }, { transaction });
    }
  }

  async getChallengeLeaderboard(challengeId, limit = 50) {
    const participants = await UserChallengeParticipation.findAll({
      where: {
        challengeId,
        status: { [Op.in]: ['ACTIVE', 'COMPLETED'] }
      },
      include: [{
        model: UserModel,
        as: 'user',
        attributes: ['id', 'firstName', 'lastName', 'profileImage']
      }],
      order: [['rank', 'ASC']],
      limit
    });

    return participants;
  }

  async finalizeChallengeAndDistributePrizes(challengeId) {
    const transaction = await sequelize.transaction();
    
    try {
      const challenge = await HealthChallenge.findByPk(challengeId);
      
      if (challenge.status !== 'ACTIVE') {
        throw new Error('Challenge is not active');
      }

      // Get final rankings
      await this.updateChallengeRankings(challengeId, transaction);

      const winners = await UserChallengeParticipation.findAll({
        where: {
          challengeId,
          status: 'COMPLETED'
        },
        order: [['rank', 'ASC']],
        limit: Object.keys(challenge.prizeDistribution || {}).length
      });

      // Distribute prizes
      if (challenge.prizePool > 0 && challenge.prizeDistribution) {
        for (const winner of winners) {
          const prizePercentage = challenge.prizeDistribution[winner.rank];
          if (prizePercentage) {
            const prize = Math.floor((challenge.prizePool * prizePercentage) / 100);
            
            await healthCoinsService.addCoins(
              winner.userId,
              prize,
              'CHALLENGE_PRIZE',
              `Won ${winner.rank}${this.getOrdinalSuffix(winner.rank)} place in challenge: ${challenge.name}`,
              transaction
            );

            await winner.update({
              isWinner: true,
              prizeWon: prize,
              bonusPointsEarned: challenge.bonusPoints
            }, { transaction });

            // Update leaderboard
            await this.updateUserLeaderboard(winner.userId, transaction);
          }
        }
      }

      await challenge.update({ status: 'COMPLETED' }, { transaction });

      await transaction.commit();
      return winners;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  // ===================== LEADERBOARDS =====================

  async getGlobalLeaderboard(period = 'ALL_TIME', limit = 50) {
    const where = {
      leaderboardType: 'GLOBAL',
      period
    };

    return await Leaderboard.findAll({
      where,
      include: [{
        model: UserModel,
        as: 'user',
        attributes: ['id', 'firstName', 'lastName', 'profileImage']
      }],
      order: [['rank', 'ASC']],
      limit
    });
  }

  async getPeerLeaderboard(userId, limit = 20) {
    // Get user's friends/connections (implement based on your friend system)
    // For now, returning users from same corporate or nearby ranks
    
    const userLeaderboard = await Leaderboard.findOne({
      where: {
        userId,
        leaderboardType: 'GLOBAL',
        period: 'ALL_TIME'
      }
    });

    if (!userLeaderboard) {
      return [];
    }

    const rankStart = Math.max(1, userLeaderboard.rank - Math.floor(limit / 2));
    const rankEnd = rankStart + limit;

    return await Leaderboard.findAll({
      where: {
        leaderboardType: 'GLOBAL',
        period: 'ALL_TIME',
        rank: { [Op.between]: [rankStart, rankEnd] }
      },
      include: [{
        model: UserModel,
        as: 'user',
        attributes: ['id', 'firstName', 'lastName', 'profileImage']
      }],
      order: [['rank', 'ASC']]
    });
  }

  async getCorporateLeaderboard(corporateId, period = 'MONTHLY', limit = 50) {
    return await Leaderboard.findAll({
      where: {
        leaderboardType: 'CORPORATE',
        referenceId: corporateId,
        period
      },
      include: [{
        model: UserModel,
        as: 'user',
        attributes: ['id', 'firstName', 'lastName', 'profileImage']
      }],
      order: [['rank', 'ASC']],
      limit
    });
  }

  async getUserRank(userId, leaderboardType = 'GLOBAL', period = 'ALL_TIME') {
    return await Leaderboard.findOne({
      where: {
        userId,
        leaderboardType,
        period
      }
    });
  }

  async updateUserLeaderboard(userId, transaction) {
    // Calculate user's total stats
    const goalStats = await UserGoalProgress.findAll({
      where: { userId, status: 'COMPLETED' },
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'completed'],
        [sequelize.fn('SUM', sequelize.col('points_earned')), 'points']
      ],
      raw: true
    });

    const challengeStats = await UserChallengeParticipation.findAll({
      where: { userId, isWinner: true },
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'won']
      ],
      raw: true
    });

    const currentStreak = await this.calculateUserStreak(userId);

    const totalPoints = parseInt(goalStats[0]?.points || 0);
    const goalsCompleted = parseInt(goalStats[0]?.completed || 0);
    const challengesWon = parseInt(challengeStats[0]?.won || 0);

    // Update or create leaderboard entry
    const [leaderboard, created] = await Leaderboard.findOrCreate({
      where: {
        userId,
        leaderboardType: 'GLOBAL',
        period: 'ALL_TIME'
      },
      defaults: {
        rank: 999999, // Temporary rank
        totalPoints,
        goalsCompleted,
        challengesWon,
        currentStreak,
        longestStreak: currentStreak,
        lastUpdated: new Date()
      },
      transaction
    });

    if (!created) {
      await leaderboard.update({
        previousRank: leaderboard.rank,
        totalPoints,
        goalsCompleted,
        challengesWon,
        currentStreak,
        longestStreak: Math.max(leaderboard.longestStreak, currentStreak),
        lastUpdated: new Date()
      }, { transaction });
    }

    // Recalculate all rankings (done in background job ideally)
    await this.recalculateGlobalRankings('ALL_TIME', transaction);

    return leaderboard;
  }

  async recalculateGlobalRankings(period, transaction) {
    const leaderboards = await Leaderboard.findAll({
      where: {
        leaderboardType: 'GLOBAL',
        period
      },
      order: [
        ['totalPoints', 'DESC'],
        ['goalsCompleted', 'DESC'],
        ['challengesWon', 'DESC'],
        ['lastUpdated', 'ASC']
      ]
    });

    for (let i = 0; i < leaderboards.length; i++) {
      await leaderboards[i].update({
        rank: i + 1
      }, { transaction });
    }
  }

  async calculateUserStreak(userId) {
    const recentProgress = await UserGoalProgress.findAll({
      where: {
        userId,
        lastActivityDate: {
          [Op.gte]: sequelize.literal("NOW() - INTERVAL '30 days'")
        }
      },
      order: [['lastActivityDate', 'DESC']]
    });

    if (recentProgress.length === 0) return 0;

    let streak = 1;
    let lastDate = new Date(recentProgress[0].lastActivityDate);

    for (let i = 1; i < recentProgress.length; i++) {
      const currentDate = new Date(recentProgress[i].lastActivityDate);
      const daysDiff = Math.floor((lastDate - currentDate) / (1000 * 60 * 60 * 24));
      
      if (daysDiff === 1) {
        streak++;
        lastDate = currentDate;
      } else if (daysDiff > 1) {
        break;
      }
    }

    return streak;
  }

  // ===================== ACHIEVEMENTS =====================

  async getAllAchievements(includeSecret = false) {
    const where = { isActive: true };
    if (!includeSecret) where.isSecret = false;

    return await Achievement.findAll({
      where,
      order: [['tier', 'ASC'], ['points', 'ASC']]
    });
  }

  async getUserAchievements(userId) {
    return await UserAchievement.findAll({
      where: { userId },
      include: [{
        model: Achievement,
        as: 'achievement'
      }],
      order: [['unlockedAt', 'DESC']]
    });
  }

  async checkAndUnlockAchievements(userId, transaction) {
    const achievements = await Achievement.findAll({ where: { isActive: true } });
    const userAchievements = await UserAchievement.findAll({ where: { userId } });
    const unlockedIds = userAchievements.map(ua => ua.achievementId);

    const stats = await this.getUserStats(userId);

    for (const achievement of achievements) {
      if (unlockedIds.includes(achievement.id)) continue;

      const criteria = achievement.criteria;
      let unlocked = false;

      if (criteria.goalsCompleted && stats.goalsCompleted >= criteria.goalsCompleted) {
        unlocked = true;
      } else if (criteria.challengesWon && stats.challengesWon >= criteria.challengesWon) {
        unlocked = true;
      } else if (criteria.challengesParticipated && stats.challengesParticipated >= criteria.challengesParticipated) {
        unlocked = true;
      } else if (criteria.streakDays && stats.currentStreak >= criteria.streakDays) {
        unlocked = true;
      } else if (criteria.totalPoints && stats.totalPoints >= criteria.totalPoints) {
        unlocked = true;
      }

      if (unlocked) {
        await UserAchievement.create({
          userId,
          achievementId: achievement.id,
          progress: 100,
          isNotified: false
        }, { transaction });

        // Award coins
        if (achievement.coinReward > 0) {
          await healthCoinsService.addCoins(
            userId,
            achievement.coinReward,
            'ACHIEVEMENT_UNLOCK',
            `Unlocked achievement: ${achievement.name}`,
            transaction
          );
        }
      }
    }
  }

  async getUserStats(userId) {
    const goalStats = await UserGoalProgress.count({
      where: { userId, status: 'COMPLETED' }
    });

    const challengeWins = await UserChallengeParticipation.count({
      where: { userId, isWinner: true }
    });

    const challengeParticipation = await UserChallengeParticipation.count({
      where: { userId }
    });

    const leaderboard = await Leaderboard.findOne({
      where: {
        userId,
        leaderboardType: 'GLOBAL',
        period: 'ALL_TIME'
      }
    });

    return {
      goalsCompleted: goalStats,
      challengesWon: challengeWins,
      challengesParticipated: challengeParticipation,
      totalPoints: leaderboard?.totalPoints || 0,
      currentStreak: leaderboard?.currentStreak || 0
    };
  }

  // ===================== UTILITIES =====================

  getOrdinalSuffix(num) {
    const j = num % 10;
    const k = num % 100;
    if (j === 1 && k !== 11) return 'st';
    if (j === 2 && k !== 12) return 'nd';
    if (j === 3 && k !== 13) return 'rd';
    return 'th';
  }
}

export default new LeaderboardService();
