/**
 * /api/wellness — the wellness surface the shipped mobile app asks for.
 *
 * The app calls GET /api/wellness/dashboard on nearly every visit to its
 * Wellness tab. Nothing was mounted at /api/wellness, and because ring-fencing
 * gates before routing, an unknown path answers 403 rather than 404 — so the
 * single largest failure in the access log (107 denials) read as "permission
 * denied" for a feature that simply had no backend.
 *
 * This is deliberately an aggregate over data that already exists and already
 * works (health goals, challenges, enrolments, HealthCoins). It invents no new
 * metric: there is no server-side "wellness score", and a number presented to a
 * patient as a health measure is not something to make up here.
 */
import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import leaderboardService from '../services/leaderboard.service.js';
import healthCoinsService from '../services/health-coins.service.js';

const router = express.Router();

/** Never let one slow or broken source take down the whole dashboard. */
async function settle(label, work, fallback) {
  try {
    return await work();
  } catch (error) {
    console.error(`[wellness] ${label} failed:`, error.message);
    return fallback;
  }
}

/**
 * GET /api/wellness/dashboard
 * Goals (annotated with whether this user has joined), challenges, the user's
 * own goals, and their HealthCoins balance.
 */
router.get('/dashboard', authUser, async (req, res) => {
  const userId = req.user.id;

  const [goals, challenges, myGoals, coins] = await Promise.all([
    settle('goals', () => leaderboardService.getAllGoals({}, userId), []),
    settle('challenges', () => leaderboardService.getAllChallenges({}), []),
    settle('myGoals', () => leaderboardService.getUserGoals(userId), []),
    settle('coins', () => healthCoinsService.getBalance(userId), null),
  ]);

  const joined = goals.filter((goal) => goal.joined);
  const available = goals.filter((goal) => !goal.joined && !goal.completed);

  return res.json({
    success: true,
    data: {
      goals: { all: goals, joined, available, completed: goals.filter((g) => g.completed) },
      challenges,
      myGoals,
      healthCoins: coins,
      counts: {
        goalsAvailable: available.length,
        goalsJoined: joined.length,
        challenges: Array.isArray(challenges) ? challenges.length : 0,
      },
    },
  });
});

/** GET /api/wellness/goals — same list the dashboard embeds. */
router.get('/goals', authUser, async (req, res) => {
  try {
    const { category, type, difficulty } = req.query;
    const goals = await leaderboardService.getAllGoals({ category, type, difficulty }, req.user.id);
    return res.json({ success: true, data: { goals } });
  } catch (error) {
    console.error('[wellness] goals failed:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to load wellness goals' });
  }
});

/** GET /api/wellness/my-goals — the caller's enrolments and progress. */
router.get('/my-goals', authUser, async (req, res) => {
  try {
    const goals = await leaderboardService.getUserGoals(req.user.id);
    return res.json({ success: true, data: { goals } });
  } catch (error) {
    console.error('[wellness] my-goals failed:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to load your goals' });
  }
});

/** GET /api/wellness/challenges */
router.get('/challenges', authUser, async (req, res) => {
  try {
    const challenges = await leaderboardService.getAllChallenges({});
    return res.json({ success: true, data: { challenges } });
  } catch (error) {
    console.error('[wellness] challenges failed:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to load challenges' });
  }
});

/**
 * POST /api/wellness/goals/:goalId/join
 * Idempotent, like the leaderboard route it delegates to: joining a goal you
 * are already in reports success, not an error.
 */
router.post('/goals/:goalId/join', authUser, async (req, res) => {
  try {
    const { progress, alreadyEnrolled } = await leaderboardService.joinGoal(req.user.id, req.params.goalId);
    return res.json({
      success: true,
      alreadyEnrolled,
      message: alreadyEnrolled ? 'You are already in this goal' : 'Successfully joined goal',
      data: { progress },
    });
  } catch (error) {
    console.error('[wellness] join goal failed:', error.message);
    return res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
