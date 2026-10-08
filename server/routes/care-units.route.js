/** /api/care-units — hospital/clinic administrators manage their outreach clinics, medical centres and OHCs. */
import { careUnitService, careUnitPool } from '../services/care-units/index.js';
import { createAuthOperatorAdmin } from '../middleware/ohcAuth.middleware.js';
import { buildCareUnitsRouter } from './care-units/care-units.router.js';

export default buildCareUnitsRouter({ service: careUnitService, authenticate: createAuthOperatorAdmin({ pool: careUnitPool }) });
