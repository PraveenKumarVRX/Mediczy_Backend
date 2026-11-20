/**
 * Days health check-ups cannot be booked (owner decision 2026-11-20): every Sunday (in code) and
 * the national + main festival holidays (this table, editable by admin/team at
 * /api/admin/checkup-holidays). Team staff may override for an emergency, with a reason.
 *
 * Seeded for financial year 2026-27 (1 Apr 2026 - 31 Mar 2027) from the Government of India
 * gazetted holiday list:
 *  - 2026: DoPT O.M. F.No.12/2/2023-JCA dated 03.07.2025 (list as published by CGEWCC Dehradun).
 *  - Jan-Mar 2027: DoPT O.M. dated 16.07.2026 as reproduced by India Briefing (11 Nov 2026);
 *    Id-ul-Fitr is provisional until moon sighting. Next year's list is added the same way.
 *
 * Run: node scripts/ssm-env-loader.mjs scripts/run-one-migration.mjs migrations/20261120000400-health-checkup-holidays.migration.js
 */
const S2026 = 'Govt of India gazetted holidays 2026 (DoPT OM 12/2/2023-JCA, 03.07.2025)';
const S2027 = 'Govt of India gazetted holidays 2027 (DoPT OM 16.07.2026, via India Briefing)';

export const FY_2026_27 = [
  ['2026-04-03', 'Good Friday', 'festival', false, S2026],
  ['2026-05-01', 'Budha Purnima', 'festival', false, S2026],
  ['2026-05-27', 'Id-ul-Zuha (Bakrid)', 'festival', false, S2026],
  ['2026-06-26', 'Muharram', 'festival', false, S2026],
  ['2026-08-15', 'Independence Day', 'national', false, S2026],
  ['2026-08-26', 'Milad-un-Nabi (Id-e-Milad)', 'festival', false, S2026],
  ['2026-09-04', 'Janmashtami', 'festival', false, S2026],
  ['2026-10-02', "Mahatma Gandhi's Birthday", 'national', false, S2026],
  ['2026-10-20', 'Dussehra', 'festival', false, S2026],
  ['2026-11-08', 'Diwali (Deepavali)', 'festival', false, S2026],
  ['2026-11-24', "Guru Nanak's Birthday", 'festival', false, S2026],
  ['2026-12-25', 'Christmas Day', 'festival', false, S2026],
  ['2027-01-26', 'Republic Day', 'national', false, S2027],
  ['2027-03-10', 'Id-ul-Fitr', 'festival', true, S2027],
  ['2027-03-23', 'Holi', 'festival', false, S2027],
  ['2027-03-26', 'Good Friday', 'festival', false, S2027],
];

export async function up(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS health_checkup_holidays (
      id           serial PRIMARY KEY,
      holiday_date date NOT NULL UNIQUE,
      name         text NOT NULL,
      kind         text NOT NULL DEFAULT 'festival' CHECK (kind IN ('national', 'festival', 'other')),
      provisional  boolean NOT NULL DEFAULT false,
      source       text,
      is_active    boolean NOT NULL DEFAULT true,
      created_by   integer,
      created_at   timestamptz NOT NULL DEFAULT now(),
      updated_at   timestamptz NOT NULL DEFAULT now()
    )`);
  for (const [date, name, kind, provisional, source] of FY_2026_27) {
    await client.query(
      `INSERT INTO health_checkup_holidays (holiday_date, name, kind, provisional, source)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (holiday_date) DO NOTHING`,
      [date, name, kind, provisional, source]
    );
  }
}

export async function down(client) {
  await client.query('DROP TABLE IF EXISTS health_checkup_holidays');
}
