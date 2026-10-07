/** Wires the collection services to the real pool and token store. Tests build their own with createXxxService. */
import jwt from 'jsonwebtoken';
import pool from '../../db/pgPool.js';
import { JWT_CONFIG } from '../../config/auth.config.js';
import * as revocation from '../token-revocation.service.js';
import { createCollectionService } from './collection.service.js';
import { createPhlebotomistService, PHLEBOTOMY_PORTAL } from './phlebotomist.service.js';

const tokens = {
  issuePortalTokenPair: revocation.issuePortalTokenPair,
  rotatePortalRefreshToken: revocation.rotatePortalRefreshToken,
  revokeToken: revocation.revokeToken,
  revokeAllForUser: revocation.revokeAllForUser,
  decodeRefreshJti(token) {
    try {
      const d = jwt.verify(token, JWT_CONFIG.SECRET);
      return d.tokenType === 'refresh' && d.portal === PHLEBOTOMY_PORTAL ? d.jti : null;
    } catch {
      return null;
    }
  },
};

export const collectionService = createCollectionService({ pool });
export const phlebotomistService = createPhlebotomistService({ pool, tokens });
