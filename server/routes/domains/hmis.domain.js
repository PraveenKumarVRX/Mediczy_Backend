/**
 * HMIS (Hospital Management Information System) Domain Router
 * Inpatient workflows: ADT, beds, OT, ICU, ER, nursing, discharge, FHIR.
 */
import { Router } from 'express';

import adtRouter               from '../adt.route.js';
import bedsManagementRouter    from '../beds-management.route.js';
import otSchedulingRouter      from '../ot-scheduling.route.js';
import emarRouter              from '../emar.route.js';
import vitalsRouter            from '../vitals.route.js';
import erWorkflowRouter        from '../er-workflow.route.js';
import patientNavigationRouter from '../patient-navigation.route.js';
import nursingIpdRouter        from '../nursing-ipd.route.js';
import clinicalWorkspaceRouter from '../clinical-workspace.route.js';
import anesthesiaRouter        from '../anesthesia.route.js';
import billingEstimateRouter   from '../billing-estimate.route.js';
import dischargeWorkflowRouter from '../discharge-workflow.route.js';
import followUpHmisRouter      from '../follow-up-hmis.route.js';
import icuRouter               from '../icu.route.js';
import hmisPreAuthRouter       from '../hmis-preauth.route.js';
import nursingEchartRouter     from '../nursing-echart.route.js';
import clinicalScoresRouter    from '../clinical-scores.route.js';
import labRuleEngineRouter     from '../lab-rule-engine.route.js';
import bedsideReferenceRouter  from '../bedside-reference.route.js';
import hl7GatewayRouter        from '../hl7-gateway.route.js';
import hmisAnalyticsRouter     from '../hmis-analytics.route.js';
import hmisAlertsRouter        from '../hmis-alerts.route.js';
import hmisAutomationRouter    from '../hmis-automation.route.js';
import clinicalReportsRouter   from '../clinical-reports.route.js';
import aiHmisOpsRouter         from '../ai-hmis-ops.route.js';
import aiRevenueRouter         from '../ai-revenue.route.js';
import aiDeptRouter            from '../ai-dept.route.js';
import queueManagementRouter   from '../queue-management.route.js';
import consentManagementRouter from '../consent-management.route.js';

const router = Router();

router.use('/v1/adt',               adtRouter);
router.use('/v1/beds',              bedsManagementRouter);
router.use('/v1/ot',                otSchedulingRouter);
router.use('/v1/emar',              emarRouter);
router.use('/v1/vitals',            vitalsRouter);
router.use('/v1/er',                erWorkflowRouter);
router.use('/v1/patient-navigation',patientNavigationRouter);
router.use('/v1/nursing',           nursingIpdRouter);
router.use('/v1/nursing-ipd',       nursingIpdRouter);
router.use('/v1/clinical-workspace',clinicalWorkspaceRouter);
router.use('/v1/anesthesia',        anesthesiaRouter);
router.use('/v1/billing-estimate',  billingEstimateRouter);
router.use('/v1/discharge',         dischargeWorkflowRouter);
router.use('/v1/follow-up',         followUpHmisRouter);
router.use('/v1/icu',               icuRouter);
router.use('/v1/preauth',           hmisPreAuthRouter);
router.use('/v1/echart',            nursingEchartRouter);
router.use('/v1/nursing-echart',    nursingEchartRouter);
router.use('/v1/clinical-scores',   clinicalScoresRouter);
router.use('/v1/lab-rules',         labRuleEngineRouter);
router.use('/v1/bedside-reference', bedsideReferenceRouter);
router.use('/v1/hl7',               hl7GatewayRouter);
router.use('/v1/hmis-analytics',    hmisAnalyticsRouter);
router.use('/v1/hmis-alerts',       hmisAlertsRouter);
router.use('/v1/hmis-automation',   hmisAutomationRouter);
router.use('/v1/clinical-reports',  clinicalReportsRouter);
router.use('/ai-hmis-ops',          aiHmisOpsRouter);
router.use('/ai-revenue',           aiRevenueRouter);
router.use('/ai-dept',              aiDeptRouter);
router.use('/v1/queue',             queueManagementRouter);
router.use('/v1/consent',           consentManagementRouter);

export default router;
