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

export const createDeptLogin = (Model, role) => async (req, res) => {
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

    const token = jwt.sign(
      { id: user.id, role },
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
