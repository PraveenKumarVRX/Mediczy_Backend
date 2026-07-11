#!/usr/bin/env node

/**
 * Backfill doctors.weeklyAvailability from doctors.weeklySchedule.
 *
 * Usage:
 *   node scripts/backfill-doctor-weekly-availability.mjs --dry-run
 *   node scripts/backfill-doctor-weekly-availability.mjs --execute
 *   node scripts/backfill-doctor-weekly-availability.mjs --execute --doctor-id 1303
 *   node scripts/backfill-doctor-weekly-availability.mjs --dry-run --limit 100
 */

import pool from '../db/pgPool.js';

const DEFAULT_WEEKLY_SCHEDULE = {
  monday: { isOff: false, online: { enabled: true, startTime: '09:00', endTime: '13:00' }, inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' } },
  tuesday: { isOff: false, online: { enabled: true, startTime: '09:00', endTime: '13:00' }, inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' } },
  wednesday: { isOff: false, online: { enabled: true, startTime: '09:00', endTime: '13:00' }, inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' } },
  thursday: { isOff: false, online: { enabled: true, startTime: '09:00', endTime: '13:00' }, inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' } },
  friday: { isOff: false, online: { enabled: true, startTime: '09:00', endTime: '13:00' }, inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' } },
  saturday: { isOff: false, online: { enabled: true, startTime: '10:00', endTime: '14:00' }, inPerson: { enabled: false, startTime: '14:00', endTime: '18:00' } },
  sunday: { isOff: true, online: { enabled: false, startTime: '09:00', endTime: '13:00' }, inPerson: { enabled: false, startTime: '14:00', endTime: '18:00' } }
};

const DAY_KEYS = Object.keys(DEFAULT_WEEKLY_SCHEDULE);

function parseArgs(argv) {
  const args = argv.slice(2);
  const execute = args.includes('--execute');
  const dryRun = args.includes('--dry-run') || !execute;

  const doctorIdFlagIndex = args.findIndex((arg) => arg === '--doctor-id');
  const doctorIdRaw = doctorIdFlagIndex >= 0 ? args[doctorIdFlagIndex + 1] : null;
  const doctorIdEq = args.find((arg) => arg.startsWith('--doctor-id='));
  const doctorId = Number.parseInt(doctorIdRaw || doctorIdEq?.split('=')[1] || '', 10);

  const limitFlagIndex = args.findIndex((arg) => arg === '--limit');
  const limitRaw = limitFlagIndex >= 0 ? args[limitFlagIndex + 1] : null;
  const limitEq = args.find((arg) => arg.startsWith('--limit='));
  const limitInput = limitRaw || limitEq?.split('=')[1] || null;
  const limit = limitInput ? Number.parseInt(limitInput, 10) : null;

  return {
    execute,
    dryRun,
    doctorId: Number.isFinite(doctorId) && doctorId > 0 ? doctorId : null,
    limit: Number.isFinite(limit) && limit > 0 ? limit : null,
  };
}

function normalizeJsonValue(value, fallback) {
  if (!value) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeWeeklySchedule(rawSchedule) {
  const weeklySchedule = normalizeJsonValue(rawSchedule, { ...DEFAULT_WEEKLY_SCHEDULE });

  DAY_KEYS.forEach((day) => {
    const savedDay = weeklySchedule[day] || {};
    const defaultDay = DEFAULT_WEEKLY_SCHEDULE[day];
    const hasLegacyWindow = savedDay.startTime && savedDay.endTime;
    const legacyEnabled = savedDay.isAvailable !== false && hasLegacyWindow;

    weeklySchedule[day] = {
      isOff: savedDay.isOff ?? (savedDay.isAvailable === false ? true : defaultDay.isOff),
      online: {
        enabled: savedDay.online?.enabled ?? (legacyEnabled ? true : defaultDay.online.enabled),
        startTime: savedDay.online?.startTime || savedDay.startTime || defaultDay.online.startTime,
        endTime: savedDay.online?.endTime || savedDay.endTime || defaultDay.online.endTime,
      },
      inPerson: {
        enabled: savedDay.inPerson?.enabled ?? false,
        startTime: savedDay.inPerson?.startTime || defaultDay.inPerson.startTime,
        endTime: savedDay.inPerson?.endTime || defaultDay.inPerson.endTime,
        ...(savedDay.inPerson?.locationId ? { locationId: savedDay.inPerson.locationId } : {}),
      },
      blockedSlots: Array.isArray(savedDay.blockedSlots) ? savedDay.blockedSlots : [],
    };
  });

  return weeklySchedule;
}

function deriveWeeklyAvailabilityFromSchedule(weeklySchedule = {}) {
  const normalizedSchedule = normalizeWeeklySchedule(weeklySchedule);
  const derived = {};

  DAY_KEYS.forEach((day) => {
    const dayConfig = normalizedSchedule[day] || DEFAULT_WEEKLY_SCHEDULE[day];
    const slots = [];

    if (dayConfig.online?.enabled && dayConfig.online.startTime && dayConfig.online.endTime) {
      slots.push({
        startTime: dayConfig.online.startTime,
        endTime: dayConfig.online.endTime,
        consultationType: 'online',
      });
    }

    if (dayConfig.inPerson?.enabled && dayConfig.inPerson.startTime && dayConfig.inPerson.endTime) {
      slots.push({
        startTime: dayConfig.inPerson.startTime,
        endTime: dayConfig.inPerson.endTime,
        consultationType: 'walkIn',
      });
    }

    derived[day] = {
      isAvailable: dayConfig.isOff !== true && slots.length > 0,
      slots,
    };
  });

  return derived;
}

function sortJson(value) {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortJson(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(sortJson(value));
}

function buildDoctorName(row) {
  return [row.firstName, row.lastName].filter(Boolean).join(' ').trim() || `doctor:${row.id}`;
}

async function main() {
  const { dryRun, doctorId, limit } = parseArgs(process.argv);

  const client = await pool.connect();
  try {
    const where = [];
    const params = [];

    if (doctorId) {
      params.push(doctorId);
      where.push(`id = $${params.length}`);
    }

    const sql = `
      SELECT id, "firstName", "lastName", "weeklySchedule", "weeklyAvailability"
      FROM doctors
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY id ASC
      ${limit ? `LIMIT $${params.push(limit)}` : ''}
    `;

    const { rows } = await client.query(sql, params);
    const summary = {
      mode: dryRun ? 'dry-run' : 'execute',
      doctorId: doctorId || null,
      limit: limit || 'all',
      scanned: rows.length,
      skippedNoWeeklySchedule: 0,
      unchanged: 0,
      updated: 0,
      changedDoctors: [],
    };

    if (!dryRun) {
      await client.query('BEGIN');
    }

    for (const row of rows) {
      const weeklySchedule = normalizeJsonValue(row.weeklySchedule, null);
      const currentAvailability = normalizeJsonValue(row.weeklyAvailability, null);

      if (!weeklySchedule || typeof weeklySchedule !== 'object') {
        summary.skippedNoWeeklySchedule += 1;
        continue;
      }

      const nextAvailability = deriveWeeklyAvailabilityFromSchedule(weeklySchedule);
      const changed = stableStringify(currentAvailability || {}) !== stableStringify(nextAvailability);

      if (!changed) {
        summary.unchanged += 1;
        continue;
      }

      if (!dryRun) {
        await client.query(
          `UPDATE doctors
           SET "weeklyAvailability" = $2::jsonb,
               "updatedAt" = NOW()
           WHERE id = $1`,
          [row.id, JSON.stringify(nextAvailability)]
        );
      }

      summary.updated += 1;
      if (summary.changedDoctors.length < 50) {
        summary.changedDoctors.push({
          id: row.id,
          name: buildDoctorName(row),
          beforeSaturday: currentAvailability?.saturday || null,
          afterSaturday: nextAvailability.saturday,
        });
      }
    }

    if (!dryRun) {
      await client.query('COMMIT');
    }

    console.log(JSON.stringify(summary, null, 2));
    if (dryRun) {
      console.log('\nDry run only. Re-run with --execute to apply.');
    }
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    console.error(JSON.stringify({ success: false, message: error.message }, null, 2));
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();