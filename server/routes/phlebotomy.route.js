/** Mounts the phlebotomist API at /api/phlebotomy with the real services. The router itself is in phlebotomy.router.js. */
import { authLimiter } from '../middleware/rateLimiter.middleware.js';
import { createAuthPhlebotomist } from '../middleware/authPhlebotomist.middleware.js';
import { isTokenRevoked } from '../services/token-revocation.service.js';
import { collectionService, phlebotomistService } from '../services/collection/index.js';
import { buildPhlebotomyRouter } from './phlebotomy.router.js';

export default buildPhlebotomyRouter({
  collectionService,
  phlebotomistService,
  authenticate: createAuthPhlebotomist({ phlebotomistService, isTokenRevoked }),
  limiter: authLimiter,
});
