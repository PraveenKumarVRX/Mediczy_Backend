/** Mounts lab-portal collection operations at /api/lab/collection with the real services. */
import { authLab } from '../../middleware/authLab.middleware.js';
import pool from '../../db/pgPool.js';
import { collectionService, phlebotomistService } from '../../services/collection/index.js';
import { buildLabCollectionRouter } from './collection.router.js';

// Resolve the lab's own uid from its id. A lab without one (legacy row) is refused rather than guessed at.
async function resolveOwner(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT unique_id FROM labs WHERE id = $1', [req.lab.id]);
    const uid = rows[0]?.unique_id;
    if (!uid) return res.status(403).json({ success: false, code: 'lab_uid_missing', message: 'This lab has no entity uid' });
    req.collector = { type: 'lab', ownerUid: uid, ref: `lab:${uid}` };
    return next();
  } catch (err) {
    console.error('[lab/collection] owner resolution failed:', err.message);
    return res.status(500).json({ success: false, code: 'internal_error', message: 'Something went wrong' });
  }
}

export default buildLabCollectionRouter({ collectionService, phlebotomistService, authenticate: authLab, resolveOwner });
