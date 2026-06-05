/**
 * Patient Domain Router
 * Aggregates all patient-facing API routes.
 * Mounted in app.js: import patientDomain from './routes/domains/patient.domain.js'
 *                    app.use('/api', patientDomain);
 */
import { Router } from 'express';

import userRouter           from '../user.route.js';
import addressRouter        from '../address.route.js';
import familyMemberRouter   from '../family-member.route.js';
import walletRouter         from '../wallet.route.js';
import couponRouter         from '../coupon.route.js';
import membershipPlansRouter from '../membership-plans.route.js';
import membershipRouter     from '../membership.route.js';
import orgMembershipPlansRouter from '../org-membership-plans.route.js';
import leaderboardRouter    from '../leaderboard.route.js';
import passwordResetRouter  from '../password-reset.route.js';
import appointmentRouter    from '../appointment.route.js';
import availabilityRouter   from '../availability.route.js';
import reportsRouter        from '../reports.route.js';
import labTestsRouter       from '../lab-tests.route.js';
import fitnessRouter        from '../fitness.route.js';
import fitnessDataRouter    from '../fitnessData.js';
import activityTrackerRouter from '../activityTracker.route.js';
import appleHealthRouter    from '../apple-health.route.js';
import healthAssessmentRouter from '../health-assessment.route.js';
import healthScoreRouter    from '../health-score.route.js';
import reportAnalysisRouter from '../report-analysis.route.js';
import dietRouter           from '../diet.route.js';
import ayushmanRouter       from '../ayushman.route.js';
import patientEngagementRouter from '../patient-engagement.route.js';
import unifiedPatientRouter from '../unified-patient.routes.js';

const router = Router();

router.use('/users',            userRouter);
router.use('/address',          addressRouter);
router.use('/family-members',   familyMemberRouter);
router.use('/wallet',           walletRouter);
router.use('/coupons',          couponRouter);
router.use('/membership-plans', membershipPlansRouter);
router.use('/membership',       membershipRouter);
router.use('/org-membership-plans', orgMembershipPlansRouter);
router.use('/leaderboard',      leaderboardRouter);
router.use('/password-reset',   passwordResetRouter);
router.use('/appointments',     appointmentRouter);
router.use('/availability',     availabilityRouter);
router.use('/reports',          reportsRouter);
router.use('/report-analysis',  reportAnalysisRouter);
router.use('/lab-tests',        labTestsRouter);
router.use('/fitness',          fitnessRouter);
router.use('/fitness-data',     fitnessDataRouter);
router.use('/activity',         activityTrackerRouter);
router.use('/apple-health',     appleHealthRouter);
router.use('/health-assessment',healthAssessmentRouter);
router.use('/health-score',     healthScoreRouter);
router.use('/diet',             dietRouter);
router.use('/ayushman',         ayushmanRouter);
router.use('/patient-engagement', patientEngagementRouter);
router.use('/patients',         unifiedPatientRouter);

export default router;
