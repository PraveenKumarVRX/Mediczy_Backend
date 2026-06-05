/**
 * Corporate & Insurance Domain Router
 */
import { Router } from 'express';

import corporateRouter        from '../corporate.route.js';
import corporateAuthRouter    from '../corporate/auth.routes.js';
import corporateHmisRouter    from '../corporate-hmis.route.js';
import corporateBookingsRouter from '../corporate-bookings.route.js';
import insuranceRouter        from '../insurance.route.js';
import hospitalInsuranceRouter from '../hospital-insurance.route.js';

const router = Router();

router.use('/corporate',          corporateRouter);
router.use('/corporate/auth',     corporateAuthRouter);
router.use('/corporate/hmis',     corporateHmisRouter);
router.use('/corporate-bookings', corporateBookingsRouter);
router.use('/insurance',          insuranceRouter);
router.use('/hospital-insurance', hospitalInsuranceRouter);

export default router;
