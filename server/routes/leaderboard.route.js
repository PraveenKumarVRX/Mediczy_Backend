import express from 'express';
import leaderboardService from '../services/leaderboard.service.js';
import { authUser } from '../middleware/auth.middleware.js';

const router = express.Router();

// ===================== HEALTH GOALS =====================

// Get all available goals
router.get('/goals', authUser, async (req, res) => {
  try {
    const { category, type, difficulty, isPublic } = req.query;
    const goals = await leaderboardService.getAllGoals({
      category,
      type,
      difficulty,
      isPublic: isPublic ? isPublic === 'true' : undefined
    });

    res.json({
      success: true,
      data: { goals }
    });
  } catch (error) {
    console.error('Get goals error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get goal details
router.get('/goals/:goalId', authUser, async (req, res) => {
  try {
    const goal = await leaderboardService.getGoalById(req.params.goalId);
    
    if (!goal) {
      return res.status(404).json({
        success: false,
        message: 'Goal not found'
      });
    }

    res.json({
      success: true,
      data: { goal }
    });
  } catch (error) {
    console.error('Get goal error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Create custom goal
router.post('/goals', authUser, async (req, res) => {
  try {
    const goal = await leaderboardService.createGoal(req.user.id, req.body);

    res.status(201).json({
      success: true,
      message: 'Goal created successfully',
      data: { goal }
    });
  } catch (error) {
    console.error('Create goal error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Join a goal
router.post('/goals/:goalId/join', authUser, async (req, res) => {
  try {
    const progress = await leaderboardService.joinGoal(req.user.id, req.params.goalId);

    res.json({
      success: true,
      message: 'Successfully joined goal',
      data: { progress }
    });
  } catch (error) {
    console.error('Join goal error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// Update goal progress
router.post('/goals/:goalId/progress', authUser, async (req, res) => {
  try {
    const { value, incrementBy, note } = req.body;
    const progress = await leaderboardService.updateGoalProgress(
      req.user.id,
      req.params.goalId,
      { value, incrementBy, note }
    );

    res.json({
      success: true,
      message: 'Progress updated successfully',
      data: { progress }
    });
  } catch (error) {
    console.error('Update progress error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// Get user's goals
router.get('/my-goals', authUser, async (req, res) => {
  try {
    const { status } = req.query;
    const goals = await leaderboardService.getUserGoals(req.user.id, status);

    res.json({
      success: true,
      data: { goals }
    });
  } catch (error) {
    // The goals tables/associations may not be provisioned; show an empty state rather than 500.
    console.warn('Get user goals unavailable:', error.message);
    res.json({ success: true, data: { goals: [] } });
  }
});

// ===================== CHALLENGES =====================

// Get all challenges
router.get('/challenges', authUser, async (req, res) => {
  try {
    const { status, type, category } = req.query;
    const challenges = await leaderboardService.getAllChallenges({
      status,
      type,
      category
    });

    res.json({
      success: true,
      data: { challenges }
    });
  } catch (error) {
    console.error('Get challenges error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get challenge details
router.get('/challenges/:challengeId', authUser, async (req, res) => {
  try {
    const challenge = await leaderboardService.getChallengeById(req.params.challengeId);
    
    if (!challenge) {
      return res.status(404).json({
        success: false,
        message: 'Challenge not found'
      });
    }

    res.json({
      success: true,
      data: { challenge }
    });
  } catch (error) {
    console.error('Get challenge error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Create challenge
router.post('/challenges', authUser, async (req, res) => {
  try {
    const challenge = await leaderboardService.createChallenge(req.user.id, req.body);

    res.status(201).json({
      success: true,
      message: 'Challenge created successfully',
      data: { challenge }
    });
  } catch (error) {
    console.error('Create challenge error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Join challenge
router.post('/challenges/:challengeId/join', authUser, async (req, res) => {
  try {
    const participation = await leaderboardService.joinChallenge(
      req.user.id,
      req.params.challengeId
    );

    res.json({
      success: true,
      message: 'Successfully joined challenge',
      data: { participation }
    });
  } catch (error) {
    console.error('Join challenge error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// Update challenge progress
router.post('/challenges/:challengeId/progress', authUser, async (req, res) => {
  try {
    const { value, incrementBy, note } = req.body;
    const participation = await leaderboardService.updateChallengeProgress(
      req.user.id,
      req.params.challengeId,
      { value, incrementBy, note }
    );

    res.json({
      success: true,
      message: 'Progress updated successfully',
      data: { participation }
    });
  } catch (error) {
    console.error('Update challenge progress error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// Get challenge leaderboard
router.get('/challenges/:challengeId/leaderboard', authUser, async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const leaderboard = await leaderboardService.getChallengeLeaderboard(
      req.params.challengeId,
      parseInt(limit)
    );

    res.json({
      success: true,
      data: { leaderboard }
    });
  } catch (error) {
    console.error('Get challenge leaderboard error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ===================== LEADERBOARDS =====================

// Get global leaderboard
router.get('/leaderboard/global', authUser, async (req, res) => {
  try {
    const { period = 'ALL_TIME', limit = 50 } = req.query;
    const leaderboard = await leaderboardService.getGlobalLeaderboard(
      period,
      parseInt(limit)
    );

    res.json({
      success: true,
      data: { leaderboard, period }
    });
  } catch (error) {
    console.error('Get global leaderboard error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get peer leaderboard (friends/nearby ranks)
router.get('/leaderboard/peers', authUser, async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const leaderboard = await leaderboardService.getPeerLeaderboard(
      req.user.id,
      parseInt(limit)
    );

    res.json({
      success: true,
      data: { leaderboard }
    });
  } catch (error) {
    console.error('Get peer leaderboard error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get corporate leaderboard
router.get('/leaderboard/corporate/:corporateId', authUser, async (req, res) => {
  try {
    const { period = 'MONTHLY', limit = 50 } = req.query;
    const leaderboard = await leaderboardService.getCorporateLeaderboard(
      req.params.corporateId,
      period,
      parseInt(limit)
    );

    res.json({
      success: true,
      data: { leaderboard, period }
    });
  } catch (error) {
    console.error('Get corporate leaderboard error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get user's rank
router.get('/leaderboard/my-rank', authUser, async (req, res) => {
  try {
    const { type = 'GLOBAL', period = 'ALL_TIME' } = req.query;
    const rank = await leaderboardService.getUserRank(req.user.id, type, period);

    res.json({
      success: true,
      data: { rank }
    });
  } catch (error) {
    console.error('Get user rank error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get user stats summary
router.get('/stats/summary', authUser, async (req, res) => {
  try {
    const stats = await leaderboardService.getUserStats(req.user.id);

    res.json({
      success: true,
      data: { stats }
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ===================== ACHIEVEMENTS =====================

// Get all achievements
router.get('/achievements', authUser, async (req, res) => {
  try {
    const { includeSecret = false } = req.query;
    const achievements = await leaderboardService.getAllAchievements(
      includeSecret === 'true'
    );

    res.json({
      success: true,
      data: { achievements }
    });
  } catch (error) {
    console.error('Get achievements error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get user's achievements
router.get('/achievements/my', authUser, async (req, res) => {
  try {
    const achievements = await leaderboardService.getUserAchievements(req.user.id);

    res.json({
      success: true,
      data: { achievements }
    });
  } catch (error) {
    console.error('Get user achievements error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;
