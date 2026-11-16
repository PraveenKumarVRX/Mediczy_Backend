import express from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { body, validationResult } from 'express-validator';

/** First-admin bootstrap via a one-time invite token, instead of anyone (including an
 * operator with psql access) ever setting that password directly. Single-use is enforced
 * by refusing once this tenant already has any user row — there is no separate "consumed"
 * flag to manage, and it fails safe: a second attempt after a real admin exists is a no-op. */
export function buildCrmOnboardingRouter({ pool, tenantId }) {
  const router = express.Router();

  router.post('/accept-invite', [
    body('token').isString().notEmpty(),
    body('email').isEmail(),
    body('password').isString().isLength({ min: 8 }),
    body('firstName').isString().trim().notEmpty(),
    body('lastName').isString().trim().notEmpty(),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });

    const expectedHash = process.env.ADMIN_INVITE_TOKEN_HASH;
    if (!/^[a-f0-9]{64}$/i.test(expectedHash || '')) {
      return res.status(503).json({ success: false, message: 'No admin invite is configured for this installation.' });
    }
    const suppliedHash = crypto.createHash('sha256').update(String(req.body.token)).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(suppliedHash, 'hex'), Buffer.from(expectedHash.toLowerCase(), 'hex'))) {
      return res.status(403).json({ success: false, message: 'Invalid or expired invite.' });
    }

    const { rows: [{ count }] } = await pool.query('SELECT COUNT(*)::int AS count FROM users WHERE tenant_id = $1', [tenantId]);
    if (count > 0) {
      return res.status(409).json({ success: false, message: 'An admin account already exists for this installation. Invite already used.' });
    }

    const email = String(req.body.email).trim().toLowerCase();
    const passwordHash = await bcrypt.hash(req.body.password, 10);
    const { rows: [user] } = await pool.query(
      `INSERT INTO users (email, password, "firstName", "lastName", role, status, tenant_id, "isAdmin", "isTeam", metadata)
       VALUES ($1, $2, $3, $4, 'admin', 'active', $5, true, true, $6::jsonb)
       RETURNING id, email`,
      [email, passwordHash, String(req.body.firstName).trim(), String(req.body.lastName).trim(), tenantId, JSON.stringify({ crmRole: 'admin', isCRM: true })]
    );
    return res.status(201).json({ success: true, message: 'Admin account created. You can now log in.', data: { id: user.id, email: user.email } });
  });

  return router;
}
