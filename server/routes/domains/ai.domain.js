/**
 * AI Domain Router
 * All AI features: health analysis, triage, brain, governance, telemetry.
 */
import { Router } from 'express';

import aiRouter             from '../ai.js';
import medicalAIRouter      from '../medical-ai.route.js';
import aiHealthRouter       from '../ai-health.route.js';
import aiVisionRouter       from '../ai-vision.route.js';
import aiGovernanceRouter   from '../ai-governance.route.js';
import telemetryRouter      from '../telemetry.route.js';
import localAiNodeRouter    from '../local-ai-node.route.js';
import labIntegrationRouter from '../lab-integration.route.js';

const router = Router();

router.use('/ai',              aiRouter);
router.use('/medical-ai',      medicalAIRouter);
router.use('/ai-health',       aiHealthRouter);
router.use('/ai-vision',       aiVisionRouter);
router.use('/ai-governance',   aiGovernanceRouter);
router.use('/telemetry',       telemetryRouter);
router.use('/local-ai',        localAiNodeRouter);
router.use('/lab-integration', labIntegrationRouter);

export default router;
