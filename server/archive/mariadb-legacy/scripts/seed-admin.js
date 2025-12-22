import dotenv from 'dotenv';
dotenv.config();
import { connectToDb, sequelize } from '../db/mariadb.js';
import { QueryTypes } from 'sequelize';
import bcrypt from 'bcrypt';

async function seedAdmin() {
  await connectToDb();
  const email = process.env.ADMIN_EMAIL || 'admin@mediczy.local';
  const password = process.env.ADMIN_PASSWORD || 'Admin@1234';
  try {
    const normalizedEmail = String(email).toLowerCase();

    const existing = await sequelize.query(
      'SELECT id, email, isAdmin FROM users WHERE email = ? LIMIT 1',
      {
        replacements: [normalizedEmail],
        type: QueryTypes.SELECT
      }
    );

    if (Array.isArray(existing) && existing.length > 0) {
      const row = existing[0];
      if (row?.isAdmin === 1 || row?.isAdmin === true) {
        console.log(`Admin already exists: ${normalizedEmail}`);
        console.log('You can login with these credentials (password may differ). Change them ASAP in production.');
        process.exit(0);
      }
    }

    const table = await sequelize.getQueryInterface().describeTable('users');
    const now = new Date();
    const passwordHash = await bcrypt.hash(password, 10);

    const insertData = {
      email: normalizedEmail,
      password: passwordHash,
      firstName: 'Platform',
      lastName: 'Admin',
      isAdmin: 1,
      role: 'admin',
      gender: 'Other',
      dateOfBirth: new Date('1990-01-01'),
      phoneNumber: '0000000000',
      isActive: 1,
      isEmailVerified: 1,
      isPhoneVerified: 1,
      createdAt: now,
      updatedAt: now
    };

    // Keep only fields that actually exist in the current schema.
    const filtered = {};
    for (const [key, value] of Object.entries(insertData)) {
      if (table[key]) filtered[key] = value;
    }

    // Best-effort fill for any required non-null columns we didn't set.
    for (const [colName, colDef] of Object.entries(table)) {
      if (filtered[colName] !== undefined) continue;
      if (colDef?.allowNull === false && colDef?.defaultValue == null) {
        if (colName === 'id') continue;

        const type = String(colDef?.type || '').toUpperCase();
        if (type.includes('DATE') || type.includes('TIME')) {
          filtered[colName] = now;
        } else if (type.includes('INT') || type.includes('DEC') || type.includes('FLOAT') || type.includes('DOUBLE')) {
          filtered[colName] = 0;
        } else if (type.includes('BOOL')) {
          filtered[colName] = 1;
        } else {
          filtered[colName] = '';
        }
      }
    }

    const cols = Object.keys(filtered);
    const placeholders = cols.map(() => '?').join(', ');
    const values = cols.map((c) => filtered[c]);

    await sequelize.query(
      `INSERT INTO users (${cols.join(', ')}) VALUES (${placeholders})`,
      {
        replacements: values,
        type: QueryTypes.INSERT
      }
    );

    console.log(`Admin created: ${normalizedEmail}`);
    console.log('You can login with these credentials. Change them ASAP in production.');
  } catch (e) {
    console.error('Failed to seed admin:', e.message);
  } finally {
    process.exit(0);
  }
}

seedAdmin();