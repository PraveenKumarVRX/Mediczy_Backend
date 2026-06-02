/**
 * Doctor Domain Router
 * All doctor-portal API routes.
 */
import { Router } from 'express';

import doctorRouter          from '../doctor.route.js';
import doctorEnhancedRoutes  from '../doctor.enhanced.route.js';
import doctorAvailabilityRouter from '../doctor-availability.route.js';
import doctorChatRouter      from '../doctor-chat.route.js';
import doctorImagingRouter   from '../doctor-imaging.route.js';
import doctorRisReferredRouter from '../doctor-ris-referred.route.js';
import doctorSettingsRouter  from '../doctor-settings.route.js';
import doctorOAuthRouter     from '../doctor-oauth.route.js';
import carePlanRouter        from '../care-plan.route.js';
import aiScribeRouter        from '../ai-scribe.route.js';
import scribeRouter          from '../scribe.js';
import offlineScribeRouter   from '../offline-scribe.route.js';
import voiceAssistantRouter  from '../voice-assistant.route.js';
import recordingRouter       from '../recording.route.js';
import clinicalWorkflowRouter from '../clinical-workflow.route.js';
import delegationRouter      from '../delegation.route.js';

const router = Router();

router.use('/doctors',            doctorRouter);
router.use('/doctors',            doctorEnhancedRoutes);
router.use('/doctor/availability',doctorAvailabilityRouter);
router.use('/doctor/chat',        doctorChatRouter);
router.use('/doctors/imaging',    doctorImagingRouter);
router.use('/doctors/ris-referred', doctorRisReferredRouter);
router.use('/doctor/settings',    doctorSettingsRouter);
router.use('/auth/doctor',        doctorOAuthRouter);
router.use('/care-plans',         carePlanRouter);
router.use('/ai-scribe',          aiScribeRouter);
router.use('/scribe',             scribeRouter);
router.use('/offline-scribe',     offlineScribeRouter);
router.use('/voice-assistant',    voiceAssistantRouter);
router.use('/recordings',         recordingRouter);
router.use('/doctor/clinical-workflow', clinicalWorkflowRouter);
router.use('/delegation',         delegationRouter);

export default router;
