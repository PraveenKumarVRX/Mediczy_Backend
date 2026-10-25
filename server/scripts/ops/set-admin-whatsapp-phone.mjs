import pool from '../../db/pgPool.js';
const PHONE = '7010142245';
const E164 = `+91${PHONE}`;

// phoneNumber is NOT NULL, so the conflicting account (id 7058, a disposable
// inactive kiosk walk-up registration with no real activity) gets a
// retired, distinguishable sentinel value instead of being cleared, freeing
// the real number for admin while keeping the column populated.
const cleared = await pool.query(
  `UPDATE users SET "phoneNumber" = '+91retired' || id, "updatedAt" = NOW() WHERE id = 7058 AND regexp_replace("phoneNumber", '[^0-9]', '', 'g') LIKE $1 RETURNING id, email, "phoneNumber"`,
  [`%${PHONE}`]
);
console.log('Retired on conflicting account:', cleared.rows);

const updated = await pool.query(
  `UPDATE users SET "phoneNumber" = $1, "updatedAt" = NOW() WHERE email = 'admin@mediqzy.com' RETURNING id, email, "phoneNumber"`,
  [E164]
);
console.log('Set on admin account:', updated.rows);

const remaining = await pool.query(
  `SELECT id, email FROM users WHERE regexp_replace("phoneNumber", '[^0-9]', '', 'g') LIKE $1`,
  [`%${PHONE}`]
);
console.log('All accounts now holding this phone (should be just admin):', remaining.rows);
process.exit(0);
