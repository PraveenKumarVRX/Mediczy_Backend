/**
 * Provider Network Domain Router
 * Hospitals, clinics, labs, pharmacies, ambulance, homecare, TPA, etc.
 */
import { Router } from 'express';

import hospitalRouter         from '../hospital.route.js';
import hospitalAuthRouter     from '../hospital-auth.route.js';
import hospitalPracticeRouter from '../hospital-practice.route.js';
import clinicRouter           from '../clinic.route.js';
import clinicAuthRouter       from '../clinic/auth.routes.js';
import clinicDashboardRouter  from '../clinic/dashboard.routes.js';
import clinicStaffRouter      from '../clinic-staff.routes.js';
import clinicStaffAuthRouter  from '../clinic-staff-auth.routes.js';
import clinicPatientRouter    from '../clinic-patient.routes.js';
import enhancedLabRouter      from '../enhanced-lab.route.js';
import labAuthRouter          from '../lab/auth.routes.js';
import labRisImagingRouter    from '../lab/ris-imaging.route.js';
import pharmacyRouter         from '../pharmacy.route.js';
import ambulanceRouter        from '../ambulance.route.js';
import ambulanceAuthRouter    from '../ambulance/auth.routes.js';
import homecareAuthRouter     from '../homecare/auth.routes.js';
import tpaRouter              from '../tpa.route.js';
import psuAuthRouter          from '../psu/auth.routes.js';
import insurerAuthRouter      from '../insurer/auth.routes.js';
import ngoAuthRouter          from '../ngo/auth.routes.js';
import insuranceBrokerRouter  from '../insurance-broker.route.js';
import aggregatorRouter       from '../aggregator.route.js';
import unifiedHospitalStaffRouter from '../unified-hospital-staff.routes.js';

const router = Router();

router.use('/hospital',               hospitalRouter);
router.use('/hospital/auth',          hospitalAuthRouter);
router.use('/hospital/practice',      hospitalPracticeRouter);
router.use('/clinic',                 clinicRouter);
router.use('/clinic/auth',            clinicAuthRouter);
router.use('/clinic/dashboard',       clinicDashboardRouter);
router.use('/clinic-staff',           clinicStaffRouter);
router.use('/clinic-staff/auth',      clinicStaffAuthRouter);
router.use('/clinic/patients',        clinicPatientRouter);
router.use('/labs',                   enhancedLabRouter);
router.use('/lab/auth',               labAuthRouter);
router.use('/lab/ris',                labRisImagingRouter);
router.use('/pharmacy',               pharmacyRouter);
router.use('/ambulance',              ambulanceRouter);
router.use('/ambulance/auth',         ambulanceAuthRouter);
router.use('/homecare/auth',          homecareAuthRouter);
router.use('/tpa',                    tpaRouter);
router.use('/psu/auth',               psuAuthRouter);
router.use('/insurer/auth',           insurerAuthRouter);
router.use('/ngo/auth',               ngoAuthRouter);
router.use('/insurance-broker',       insuranceBrokerRouter);
router.use('/aggregator',             aggregatorRouter);
router.use('/hospital-staff',         unifiedHospitalStaffRouter);

export default router;
