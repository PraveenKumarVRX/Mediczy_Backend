#!/usr/bin/env node
/**
 * Safely remove dummy / test patient accounts from the patient app.
 *
 * Does NOT hard-delete users (FK / HIPAA). Instead:
 *  - Anonymizes PII on users row (status = deleted)
 *  - Clears junction PHI tables
 *  - Redacts appointment patient fields
 *  - Revokes refresh tokens
 *  - Bumps metadata.tokenVersion to invalidate JWTs
 *
 * Usage (from server/):
 *   node scripts/admin/remove-dummy-patient-users.mjs --dry-run
 *   node scripts/admin/remove-dummy-patient-users.mjs --execute
 *
 * Requires server/.env with production PostgreSQL credentials.
 */

import pool from '../../db/pgPool.js';

const TARGET_EMAILS = [
  'parinitha2@gmail.com',
  'raoshashank809@gmail.com',
  'gk.madhusudan@gmail.com',
  'prernagk409@gmail.com',
  'lathasathish04@gmail.com',
  'tenth71@gmail.com',
  'letsmailamruta@gmail.com',
];

const TARGET_PHONES = [
  '8956493837',
  '8830955916',
  '9371922536',
  '9326593837',
  '9480511390',
  '9148433224',
  '7337650428',
];

function parseArgs(argv) {
  const execute = argv.includes('--execute');
  const dryRun = argv.includes('--dry-run') || !execute;
  return { dryRun, execute };
}

function normalizePhoneLast10(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

async function tableCount(client, sql, params) {
  try {
    const { rows } = await client.query(sql, params);
    return Number(rows[0]?.count || 0);
  } catch {
    return null;
  }
}

async function findUserByEmail(client, email) {
  const { rows } = await client.query(
    `SELECT id, email, "phoneNumber", status, role, "firstName", "lastName"
     FROM users
     WHERE lower(email) = lower($1)
     LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

async function findUsersByPhone(client, phoneLast10) {
  const { rows } = await client.query(
    `SELECT id, email, "phoneNumber", status, role, "firstName", "lastName"
     FROM users
     WHERE RIGHT(REGEXP_REPLACE("phoneNumber", '[^0-9]', '', 'g'), 10) = $1`,
    [phoneLast10]
  );
  return rows;
}

async function getPatientRowId(client, userId) {
  const { rows } = await client.query(
    `SELECT id FROM patients WHERE "userId" = $1 LIMIT 1`,
    [userId]
  );
  return rows[0]?.id ?? null;
}

async function getUserFootprint(client, userId, patientRowId) {
  const counts = {};
  const checks = [
    ['appointments', `SELECT COUNT(*)::int AS count FROM appointments WHERE "userId" = $1`, [userId]],
    ['prescriptions', `SELECT COUNT(*)::int AS count FROM prescriptions WHERE "patientId" = $1`, [userId]],
    ['notifications', `SELECT COUNT(*)::int AS count FROM notifications WHERE "userId" = $1`, [userId]],
    ['family_members', `SELECT COUNT(*)::int AS count FROM family_members WHERE "userId" = $1`, [userId]],
    ['patient_allergies', `SELECT COUNT(*)::int AS count FROM patient_allergies WHERE user_id = $1`, [userId]],
    ['user_plans', `SELECT COUNT(*)::int AS count FROM user_plans WHERE "userId" = $1`, [userId]],
  ];
  if (patientRowId) {
    checks.push([
      'ai_health_risk_scores',
      `SELECT COUNT(*)::int AS count FROM ai_health_risk_scores WHERE patient_id = $1`,
      [patientRowId],
    ]);
  }
  for (const [name, sql, params] of checks) {
    counts[name] = await tableCount(client, sql, params);
  }
  return counts;
}

async function revokeTokens(client, userId) {
  const idStr = String(userId);
  const idNum = Number(userId);
  await client.query(
    `UPDATE portal_refresh_tokens SET revoked = TRUE
     WHERE user_id = $1 AND revoked = FALSE`,
    [idStr]
  ).catch(() => {});
  await client.query(
    `UPDATE api_v2_refresh_tokens SET revoked = TRUE, revoked_at = NOW(), updated_at = NOW()
     WHERE user_id = $1 AND revoked = FALSE`,
    [idNum]
  ).catch(() => {});
  await client.query(
    `UPDATE hospital_refresh_tokens SET revoked = TRUE
     WHERE user_id = $1 AND revoked = FALSE`,
    [idStr]
  ).catch(() => {});
  await client.query(
    `UPDATE team_refresh_tokens SET revoked = TRUE
     WHERE user_id = $1 AND revoked = FALSE`,
    [idStr]
  ).catch(() => {});
}

async function purgePatientUser(client, user, { dryRun }) {
  const userId = user.id;
  const patientRowId = await getPatientRowId(client, userId);
  const footprint = await getUserFootprint(client, userId, patientRowId);

  if (user.status === 'deleted') {
    return {
      userId,
      email: user.email,
      phone: user.phoneNumber,
      skipped: true,
      reason: 'already_deleted',
      footprint,
    };
  }

  if (user.role && user.role !== 'user') {
    return {
      userId,
      email: user.email,
      phone: user.phoneNumber,
      skipped: true,
      reason: `non_patient_role:${user.role}`,
      footprint,
    };
  }

  const anonymizedEmail = `deleted_${userId}_${Date.now()}@mediczy.invalid`;

  if (!dryRun) {
    await client.query(
      `UPDATE users SET
         email = $1,
         "firstName" = 'Deleted',
         "lastName" = 'User',
         "phoneNumber" = '0000000000',
         "dateOfBirth" = '1900-01-01',
         "medicalHistory" = '{}',
         "familyHistory" = '{}',
         "personalHistory" = '{}',
         allergies = '{}',
         medications = '{}',
         "chronicConditions" = '{}',
         "abhaHealthId" = NULL,
         "profileImage" = NULL,
         status = 'deleted',
         metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
         "updatedAt" = NOW()
       WHERE id = $3`,
      [
        anonymizedEmail,
        JSON.stringify({
          erasure_requested: true,
          admin_dummy_removal: true,
          removed_at: new Date().toISOString(),
        }),
        userId,
      ]
    );

    // Bump tokenVersion in metadata for JWT invalidation
    await client.query(
      `UPDATE users SET metadata = jsonb_set(
         COALESCE(metadata, '{}'::jsonb),
         '{tokenVersion}',
         to_jsonb(COALESCE((metadata->>'tokenVersion')::int, 0) + 1)
       )
       WHERE id = $1`,
      [userId]
    );

    await client.query(`DELETE FROM patient_allergies WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM patient_medications WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM patient_conditions WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM family_members WHERE "userId" = $1`, [userId]);
    await client.query(`DELETE FROM patient_consents WHERE user_id = $1`, [userId]).catch(() => {});
    await client.query(`DELETE FROM notifications WHERE "userId" = $1`, [userId]).catch(() => {});

    if (patientRowId) {
      await client.query(
        `DELETE FROM ai_health_risk_scores WHERE patient_id = $1`,
        [patientRowId]
      ).catch(() => {});
      await client.query(
        `UPDATE patients SET status = 'inactive', "updatedAt" = NOW() WHERE id = $1`,
        [patientRowId]
      ).catch(() => {});
    }

    await client.query(
      `UPDATE appointments SET
         "patientName" = 'Deleted Patient',
         "patientEmail" = NULL,
         "patientPhone" = '0000000000',
         "patientDetails" = '{}'
       WHERE "userId" = $1`,
      [userId]
    );

    await revokeTokens(client, userId);

    await client.query(
      `INSERT INTO data_deletion_requests (user_id, request_type, status, completed_at, tables_affected, records_deleted, notes)
       VALUES ($1, 'erasure', 'completed', NOW(), $2::text[], 1, $3)`,
      [
        userId,
        ['users', 'patient_allergies', 'patient_medications', 'patient_conditions', 'family_members', 'appointments', 'notifications'],
        'Admin dummy patient removal script',
      ]
    ).catch(() => {});
  }

  return {
    userId,
    email: user.email,
    phone: user.phoneNumber,
    name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
    anonymizedEmail: dryRun ? `(would become) ${anonymizedEmail}` : anonymizedEmail,
    patientRowId,
    footprint,
    purged: !dryRun,
    dryRun,
  };
}

async function main() {
  const { dryRun } = parseArgs(process.argv);
  const client = await pool.connect();

  const resolved = new Map();
  const notFound = { emails: [], phones: [] };
  const matchLog = [];

  try {
    console.log(`\n=== Dummy patient removal (${dryRun ? 'DRY RUN' : 'EXECUTE'}) ===\n`);

    for (const email of TARGET_EMAILS) {
      const user = await findUserByEmail(client, email);
      if (!user) {
        notFound.emails.push(email);
        continue;
      }
      resolved.set(user.id, { user, matchedBy: [`email:${email}`] });
      matchLog.push({ type: 'email', value: email, userId: user.id });
    }

    for (const phone of TARGET_PHONES) {
      const last10 = normalizePhoneLast10(phone);
      if (!last10) {
        notFound.phones.push({ phone, reason: 'invalid' });
        continue;
      }
      const users = await findUsersByPhone(client, last10);
      if (!users.length) {
        notFound.phones.push({ phone, reason: 'not_found' });
        continue;
      }
      for (const user of users) {
        const existing = resolved.get(user.id);
        if (existing) {
          existing.matchedBy.push(`phone:${phone}`);
        } else {
          resolved.set(user.id, { user, matchedBy: [`phone:${phone}`] });
        }
        matchLog.push({ type: 'phone', value: phone, userId: user.id, email: user.email });
      }
    }

    console.log(`Matched ${resolved.size} unique user(s) from ${TARGET_EMAILS.length} emails + ${TARGET_PHONES.length} phones.\n`);

    if (notFound.emails.length) {
      console.log('Emails not found:', notFound.emails.join(', '));
    }
    if (notFound.phones.length) {
      console.log('Phones not found:', notFound.phones.map((p) => (typeof p === 'string' ? p : p.phone)).join(', '));
    }

    if (resolved.size === 0) {
      console.log('\nNothing to do.');
      return;
    }

    await client.query('BEGIN');

    const results = [];
    for (const { user, matchedBy } of resolved.values()) {
      console.log(`\n--- User #${user.id} (${user.email}) matched by: ${matchedBy.join(', ')} ---`);
      const result = await purgePatientUser(client, user, { dryRun });
      results.push({ ...result, matchedBy });
      console.log(JSON.stringify(result, null, 2));
    }

    if (dryRun) {
      await client.query('ROLLBACK');
      console.log('\n✓ DRY RUN complete — no changes committed. Re-run with --execute to apply.');
    } else {
      await client.query('COMMIT');
      console.log('\n✓ EXECUTE complete — all matched dummy patients anonymized and sessions revoked.');
    }

    console.log('\nSummary:', JSON.stringify({ dryRun, processed: results.length, results, notFound }, null, 2));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Script failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
