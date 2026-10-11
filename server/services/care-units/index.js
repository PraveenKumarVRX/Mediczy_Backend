/** Wires the care-unit and OHC services to the real pool and token store. Tests build their own with createXxxService. */
import jwt from 'jsonwebtoken';
import pool from '../../db/pgPool.js';
import { JWT_CONFIG } from '../../config/auth.config.js';
import * as revocation from '../token-revocation.service.js';
import { createCareUnitService } from './care-unit.service.js';
import { createOhcService, OHC_PORTAL } from './ohc.service.js';
import { createOhcClinicianService } from './ohc-clinician.service.js';

const tokens = {
  issuePortalTokenPair: revocation.issuePortalTokenPair,
  rotatePortalRefreshToken: revocation.rotatePortalRefreshToken,
  revokeToken: revocation.revokeToken,
  revokeAllForUser: revocation.revokeAllForUser,
  decodeRefreshJti(token) {
    try { const d = jwt.verify(token, JWT_CONFIG.SECRET); return d.tokenType === 'refresh' && d.portal === OHC_PORTAL ? d.jti : null; } catch { return null; }
  },
};

export const careUnitService = createCareUnitService({ pool });
export const ohcService = createOhcService({ pool, tokens });
export { pool as careUnitPool };
