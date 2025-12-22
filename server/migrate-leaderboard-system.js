import { postgresSequelize as sequelize } from './db/postgres-sequelize.js';
import HealthGoal from './models/postgres/health-goal.model.postgres.js';
import HealthChallenge from './models/postgres/health-challenge.model.postgres.js';
import UserGoalProgress from './models/postgres/user-goal-progress.model.postgres.js';
import UserChallengeParticipation from './models/postgres/user-challenge-participation.model.postgres.js';
import Leaderboard from './models/postgres/leaderboard.model.postgres.js';
import { Achievement, UserAchievement } from './models/postgres/achievement.model.postgres.js';

async function migrateLeaderboardSystem() {
  try {
    console.log('Starting leaderboard system migration...');

    // Sync all models
    await HealthGoal.sync({ force: false });
    console.log('✓ health_goals table created');

    await HealthChallenge.sync({ force: false });
    console.log('✓ health_challenges table created');

    await UserGoalProgress.sync({ force: false });
    console.log('✓ user_goal_progress table created');

    await UserChallengeParticipation.sync({ force: false });
    console.log('✓ user_challenge_participation table created');

    await Leaderboard.sync({ force: false });
    console.log('✓ leaderboards table created');

    await Achievement.sync({ force: false });
    console.log('✓ achievements table created');

    await UserAchievement.sync({ force: false });
    console.log('✓ user_achievements table created');

    // Set up model relationships
    console.log('\nSetting up model relationships...');

    // HealthGoal relationships
    HealthGoal.hasMany(UserGoalProgress, { foreignKey: 'goalId', as: 'userProgress' });
    UserGoalProgress.belongsTo(HealthGoal, { foreignKey: 'goalId', as: 'goal' });

    // HealthChallenge relationships
    HealthChallenge.hasMany(UserChallengeParticipation, { foreignKey: 'challengeId', as: 'participants' });
    UserChallengeParticipation.belongsTo(HealthChallenge, { foreignKey: 'challengeId', as: 'challenge' });

    // Achievement relationships
    Achievement.hasMany(UserAchievement, { foreignKey: 'achievementId', as: 'userAchievements' });
    UserAchievement.belongsTo(Achievement, { foreignKey: 'achievementId', as: 'achievement' });

    console.log('✓ Model relationships configured');

    // Seed default health goals
    console.log('\nSeeding default health goals...');
    
    const defaultGoals = [
      {
        name: '10,000 Steps Daily',
        description: 'Walk 10,000 steps every day for better cardiovascular health',
        category: 'STEPS',
        type: 'PERSONAL',
        targetType: 'COUNT',
        targetValue: 10000,
        targetUnit: 'steps',
        duration: 30,
        points: 100,
        difficulty: 'MEDIUM',
        isPublic: true,
        icon: '🚶',
        color: '#4CAF50'
      },
      {
        name: 'Drink 8 Glasses of Water',
        description: 'Stay hydrated by drinking 8 glasses of water daily',
        category: 'HYDRATION',
        type: 'PERSONAL',
        targetType: 'COUNT',
        targetValue: 8,
        targetUnit: 'glasses',
        duration: 30,
        points: 50,
        difficulty: 'EASY',
        isPublic: true,
        icon: '💧',
        color: '#2196F3'
      },
      {
        name: 'Lose 5kg in 3 Months',
        description: 'Achieve healthy weight loss through diet and exercise',
        category: 'WEIGHT',
        type: 'PERSONAL',
        targetType: 'WEIGHT',
        targetValue: 5,
        targetUnit: 'kg',
        duration: 90,
        points: 300,
        difficulty: 'HARD',
        isPublic: true,
        icon: '⚖️',
        color: '#FF5722'
      },
      {
        name: '30 Minutes Daily Exercise',
        description: 'Exercise for at least 30 minutes every day',
        category: 'EXERCISE',
        type: 'PERSONAL',
        targetType: 'DURATION',
        targetValue: 30,
        targetUnit: 'minutes',
        duration: 30,
        points: 120,
        difficulty: 'MEDIUM',
        isPublic: true,
        icon: '💪',
        color: '#FF9800'
      },
      {
        name: '7 Hours Sleep Daily',
        description: 'Get at least 7 hours of quality sleep every night',
        category: 'SLEEP',
        type: 'PERSONAL',
        targetType: 'DURATION',
        targetValue: 7,
        targetUnit: 'hours',
        duration: 30,
        points: 90,
        difficulty: 'MEDIUM',
        isPublic: true,
        icon: '😴',
        color: '#9C27B0'
      },
      {
        name: '10 Minutes Daily Meditation',
        description: 'Practice mindfulness meditation for mental clarity',
        category: 'MEDITATION',
        type: 'PERSONAL',
        targetType: 'DURATION',
        targetValue: 10,
        targetUnit: 'minutes',
        duration: 30,
        points: 80,
        difficulty: 'EASY',
        isPublic: true,
        icon: '🧘',
        color: '#673AB7'
      },
      {
        name: 'Run 5K',
        description: 'Complete a 5-kilometer run',
        category: 'FITNESS',
        type: 'PERSONAL',
        targetType: 'DISTANCE',
        targetValue: 5,
        targetUnit: 'km',
        duration: 60,
        points: 200,
        difficulty: 'HARD',
        isPublic: true,
        icon: '🏃',
        color: '#F44336'
      },
      {
        name: 'Quit Smoking - 30 Days',
        description: 'Stay smoke-free for 30 consecutive days',
        category: 'QUIT_SMOKING',
        type: 'PERSONAL',
        targetType: 'DURATION',
        targetValue: 30,
        targetUnit: 'days',
        duration: 30,
        points: 500,
        difficulty: 'EXPERT',
        isPublic: true,
        icon: '🚭',
        color: '#795548'
      }
    ];

    for (const goal of defaultGoals) {
      await HealthGoal.findOrCreate({
        where: { name: goal.name, category: goal.category },
        defaults: goal
      });
    }
    
    console.log('✓ Seeded 8 default health goals');

    // Seed default achievements
    console.log('\nSeeding default achievements...');
    
    const defaultAchievements = [
      {
        name: 'First Steps',
        description: 'Complete your first health goal',
        category: 'GOALS',
        badgeIcon: '🎯',
        badgeColor: '#4CAF50',
        tier: 'BRONZE',
        points: 50,
        coinReward: 100,
        criteria: { goalsCompleted: 1 },
        isActive: true,
        isSecret: false
      },
      {
        name: 'Goal Master',
        description: 'Complete 10 health goals',
        category: 'GOALS',
        badgeIcon: '🏆',
        badgeColor: '#FFD700',
        tier: 'GOLD',
        points: 500,
        coinReward: 1000,
        criteria: { goalsCompleted: 10 },
        isActive: true,
        isSecret: false
      },
      {
        name: 'Challenger',
        description: 'Participate in your first challenge',
        category: 'CHALLENGES',
        badgeIcon: '⚔️',
        badgeColor: '#FF5722',
        tier: 'BRONZE',
        points: 100,
        coinReward: 200,
        criteria: { challengesParticipated: 1 },
        isActive: true,
        isSecret: false
      },
      {
        name: 'Champion',
        description: 'Win 5 challenges',
        category: 'CHALLENGES',
        badgeIcon: '👑',
        badgeColor: '#FFD700',
        tier: 'GOLD',
        points: 1000,
        coinReward: 2000,
        criteria: { challengesWon: 5 },
        isActive: true,
        isSecret: false
      },
      {
        name: 'Week Warrior',
        description: 'Maintain a 7-day streak',
        category: 'STREAKS',
        badgeIcon: '🔥',
        badgeColor: '#FF9800',
        tier: 'BRONZE',
        points: 100,
        coinReward: 150,
        criteria: { streakDays: 7 },
        isActive: true,
        isSecret: false
      },
      {
        name: 'Unstoppable',
        description: 'Maintain a 30-day streak',
        category: 'STREAKS',
        badgeIcon: '⚡',
        badgeColor: '#FFD700',
        tier: 'GOLD',
        points: 500,
        coinReward: 1000,
        criteria: { streakDays: 30 },
        isActive: true,
        isSecret: false
      },
      {
        name: 'Social Butterfly',
        description: 'Complete a group challenge',
        category: 'SOCIAL',
        badgeIcon: '🦋',
        badgeColor: '#E91E63',
        tier: 'BRONZE',
        points: 150,
        coinReward: 250,
        criteria: { groupChallengesCompleted: 1 },
        isActive: true,
        isSecret: false
      },
      {
        name: 'Consistency King',
        description: 'Log progress for 30 consecutive days',
        category: 'CONSISTENCY',
        badgeIcon: '📊',
        badgeColor: '#9C27B0',
        tier: 'SILVER',
        points: 300,
        coinReward: 500,
        criteria: { consecutiveDaysLogged: 30 },
        isActive: true,
        isSecret: false
      },
      {
        name: 'Milestone Maker',
        description: 'Reach 100,000 total points',
        category: 'MILESTONES',
        badgeIcon: '🎖️',
        badgeColor: '#FFD700',
        tier: 'PLATINUM',
        points: 2000,
        coinReward: 5000,
        criteria: { totalPoints: 100000 },
        isActive: true,
        isSecret: false
      },
      {
        name: 'Legend',
        description: 'Unlock all other achievements',
        category: 'SPECIAL',
        badgeIcon: '💎',
        badgeColor: '#00BCD4',
        tier: 'DIAMOND',
        points: 10000,
        coinReward: 20000,
        criteria: { allAchievementsUnlocked: true },
        isActive: true,
        isSecret: true
      }
    ];

    for (const achievement of defaultAchievements) {
      await Achievement.findOrCreate({
        where: { name: achievement.name, category: achievement.category },
        defaults: achievement
      });
    }
    
    console.log('✓ Seeded 10 default achievements');

    console.log('\n✅ Leaderboard system migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateLeaderboardSystem();
