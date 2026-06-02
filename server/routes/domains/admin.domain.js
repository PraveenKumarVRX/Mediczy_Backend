/**
 * Admin & Team Domain Router
 * Admin portal, team portal, CRM, and platform management routes.
 */
import { Router } from 'express';

import adminRouter              from '../admin.route.js';
import teamRouter               from '../team.route.js';
import teamEmailRouter          from '../teamEmail.route.js';
import crmRouter                from '../crm.route.js';
import crmUnderwritingRouter    from '../crm-underwriting.route.js';
import crmEmailRouter           from '../crmEmail.route.js';
import crmCampaignsRouter       from '../crmCampaigns.route.js';
import crmCampaignAnalyticsRouter from '../crmCampaignAnalytics.route.js';
import adminClinicsRouter       from '../admin/clinics.routes.js';
import adminPharmaciesRouter    from '../admin/pharmacies.routes.js';
import adminDoctorsRouter       from '../admin/doctors.routes.js';
import adminAppointmentsRouter  from '../admin/appointments.routes.js';
import drugPriceSyncRouter      from '../admin/drug-price-sync.route.js';
import saasDashboardRouter      from '../saas-dashboard.route.js';
import complianceDashboardRouter from '../compliance-dashboard.route.js';
import reportBuilderRouter      from '../report-builder.route.js';
import superadminClinicRouter   from '../superadmin-clinic.routes.js';
import superAdminTenantRouter   from '../super-admin-tenant.route.js';
import voiceScribeAdminRouter   from '../voice-scriber-admin.route.js';
import errorTrackingRouter      from '../error-tracking.route.js';
import revenueInsightsRouter    from '../revenue-insights.route.js';

const router = Router();

router.use('/admin',                    adminRouter);
router.use('/team',                     teamRouter);
router.use('/team/email',               teamEmailRouter);
router.use('/crm',                      crmRouter);
router.use('/crm/underwriting',         crmUnderwritingRouter);
router.use('/crm/email',                crmEmailRouter);
router.use('/crm/campaigns',            crmCampaignsRouter);
router.use('/crm/campaign-analytics',   crmCampaignAnalyticsRouter);
router.use('/admin/clinics',            adminClinicsRouter);
router.use('/admin/pharmacies',         adminPharmaciesRouter);
router.use('/admin/doctors',            adminDoctorsRouter);
router.use('/admin/appointments',       adminAppointmentsRouter);
router.use('/admin/drug-price-sync',    drugPriceSyncRouter);
router.use('/saas-dashboard',           saasDashboardRouter);
router.use('/compliance',               complianceDashboardRouter);
router.use('/report-builder',           reportBuilderRouter);
router.use('/superadmin/clinics',       superadminClinicRouter);
router.use('/superadmin/tenants',       superAdminTenantRouter);
router.use('/admin/voice-scribe',       voiceScribeAdminRouter);
router.use('/error-tracking',           errorTrackingRouter);
router.use('/revenue-insights',         revenueInsightsRouter);

export default router;
