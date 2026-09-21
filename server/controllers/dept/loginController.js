import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { QueryTypes } from 'sequelize';
import { JWT_CONFIG } from '../../config/auth.config.js';
import sequelize from '../../db/postgres-sequelize.js';

const isMissingTableError = (error) =>
  error?.original?.code === '42P01' || error?.parent?.code === '42P01';

const getRoleCandidates = (role) => {
  // Normalize hyphens to underscores: 'blood-bank' → 'blood_bank_staff'
  const normalizedRole = String(role).trim().replace(/-/g, '_');
  return [...new Set([
    `${normalizedRole}_staff`,
    normalizedRole,
  ])];
};

const loginFromUsersTable = async ({ email, password, role }) => {
  const [user] = await sequelize.query(
    `SELECT id, email, password, "firstName", "lastName", role, organization_id, metadata, status
     FROM users
     WHERE lower(email) = :email
       AND role IN (:roles)
     LIMIT 1`,
    {
      replacements: { email, roles: getRoleCandidates(role) },
      type: QueryTypes.SELECT,
    }
  );

  if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
    return null;
  }

  return user;
};

// requireOrganization: the account must be attached to a hospital, and the token carries it (tenant isolation, WP-0.5).
// A login for staff with no organization is refused rather than issuing a token that could reach nothing (or, worse, everything).
export const createDeptLogin = (Model, role, { requireOrganization = false } = {}) => async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await Model.findOne({ where: { email: normalizedEmail } });

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const orgId = Number(user.organization_id);
    if (requireOrganization && !(Number.isInteger(orgId) && orgId > 0)) {
      return res.status(403).json({ message: 'This account is not attached to a hospital. Ask an administrator to attach it.' });
    }

    const token = jwt.sign(
      { id: user.id, role, ...(Number.isInteger(orgId) && orgId > 0 ? { organization_id: orgId } : {}) },
      JWT_CONFIG.SECRET,
      { expiresIn: JWT_CONFIG.EXPIRY.NORMAL }
    );

    return res.json({ token, user });
  } catch (error) {
    if (isMissingTableError(error)) {
      const normalizedEmail = String(email).trim().toLowerCase();
      const user = await loginFromUsersTable({ email: normalizedEmail, password, role });

      if (!user) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      if (requireOrganization && !(Number.isInteger(Number(user.organization_id)) && Number(user.organization_id) > 0)) {
        return res.status(403).json({ message: 'This account is not attached to a hospital. Ask an administrator to attach it.' });
      }

      const token = jwt.sign(
        { id: user.id, role: user.role, organization_id: user.organization_id },
        JWT_CONFIG.SECRET,
        { expiresIn: JWT_CONFIG.EXPIRY.NORMAL }
      );

      const { password: _password, ...safeUser } = user;
      return res.json({ token, user: safeUser });
    }

    console.error(`${role} login error:`, error);
    return res.status(500).json({ message: 'Department login failed' });
  }
};
