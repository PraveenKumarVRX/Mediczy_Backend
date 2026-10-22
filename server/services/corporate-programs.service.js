export const programError = (message, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });
export function reportYear(value, now = new Date()) {
  const year = Number(value ?? now.getFullYear());
  if (!Number.isInteger(year) || year < 2020 || year > now.getFullYear() + 1)
    throw programError("Select a valid reporting year");
  return year;
}
export function csvDocument(rows, columns) {
  const cell = (value) => {
    let text = value == null ? "" : String(value);
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return [
    columns.map(cell).join(","),
    ...rows.map((row) => columns.map((key) => cell(row[key])).join(",")),
  ].join("\r\n");
}

// Distinguish HR scheduling records, doctor consultations and completed lab checkups.
// Spending is paid transaction value, never a catalog price or a made-up estimate.
export const CARE_CTE = `WITH roster AS (
 SELECT ce."employeeId" AS employee_id, ce."userId" AS user_id, ce.department, u."dateOfBirth" AS dob
 FROM corporate_employees ce LEFT JOIN users u ON u.id=ce."userId"
 WHERE ce.corporate_id= :corporateId AND (ce."joiningDate" IS NULL OR ce."joiningDate" < :endDate) AND (ce."exitDate" IS NULL OR ce."exitDate" >= :startDate)
), care AS (
 SELECT 'consultation' AS kind, a.id::text AS care_id, r.employee_id, r.department, r.dob,
   a."appointmentDate" AS care_date, LOWER(a.status) AS status,
   'doctor:'||COALESCE(a."doctorId"::text,'unknown') AS provider_key,
   COALESCE(NULLIF(a."doctorName",''),'Unassigned doctor') AS provider_name,
   CASE WHEN LOWER(COALESCE(a."paymentStatus",'')) IN ('paid','success','captured','completed') AND COALESCE(UPPER(a."paymentDetails"->>'currency'),'INR')='INR' THEN COALESCE(a."paymentAmount",0) ELSE 0 END AS paid
 FROM appointments a JOIN roster r ON r.user_id=a."userId"
 WHERE a.corporate_tenant_id= :corporateId AND a."appointmentDate">= :startDate AND a."appointmentDate"< :endDate
 UNION ALL
 SELECT 'lab_checkup', b.id::text, r.employee_id, r.department, r.dob, b.appointment_date, LOWER(b.status),
   'lab:'||b.lab_id::text, COALESCE(NULLIF(b.lab_snapshot->>'name',''),'Lab '||b.lab_id::text),
   CASE WHEN LOWER(b.payment_status) IN ('paid','success','captured','completed') AND UPPER(b.currency)='INR' THEN b.payment_amount ELSE 0 END
 FROM health_checkup_bookings b JOIN roster r ON r.user_id=b.user_id
 WHERE b.corporate_id= :corporateId AND b.appointment_date>= :startDate AND b.appointment_date< :endDate
 UNION ALL
 SELECT 'hr_schedule', a.id::text, r.employee_id, r.department, r.dob, a.date, LOWER(a.status),
   'hr:'||COALESCE(NULLIF(a.facility,''),'unassigned'), COALESCE(NULLIF(a.facility,''),'Unassigned facility'), 0::numeric
 FROM corporate_scheduled_appointments a JOIN roster r ON r.employee_id=a."employeeId"
 WHERE a.corporate_id= :corporateId AND a.date>= :startDate AND a.date< :endDate
)`;

export function corporatePrograms(
  database,
  withClinicalContext = async (_tx, action) => action(),
) {
  const select = (sql, replacements, transaction) =>
    database.query(sql, {
      replacements,
      transaction,
      type: database.QueryTypes.SELECT,
    });
  async function analytics(corporateId, yearInput) {
    const year = reportYear(yearInput);
    const replacements = {
      corporateId,
      startDate: `${year}-01-01`,
      endDate: `${year + 1}-01-01`,
    };
    return database.transaction(async (transaction) =>
      withClinicalContext(transaction, async () => {
        const monthly = await select(
          `${CARE_CTE}
        SELECT TO_CHAR(months.month,'YYYY-MM') AS month,
          COUNT(care.care_id) FILTER (WHERE kind='consultation')::int AS consultations,
          COUNT(care.care_id) FILTER (WHERE kind='lab_checkup')::int AS checkups,
          COUNT(care.care_id) FILTER (WHERE kind='hr_schedule')::int AS hr_schedules,
          COUNT(care.care_id) FILTER (WHERE status='completed')::int AS completed,
          COUNT(DISTINCT employee_id) FILTER (WHERE status='completed')::int AS participating,
          COALESCE(SUM(paid),0)::numeric AS paid_spend
        FROM generate_series(:startDate::date,(:endDate::date-INTERVAL '1 month'),INTERVAL '1 month') months(month)
        LEFT JOIN care ON care_date>=months.month AND care_date<months.month+INTERVAL '1 month'
        GROUP BY months.month ORDER BY months.month`,
          replacements,
          transaction,
        );
        const departments = await select(
          `${CARE_CTE}
        SELECT COALESCE(NULLIF(r.department,''),'General') AS department, COUNT(DISTINCT r.employee_id)::int AS eligible,
          COUNT(DISTINCT c.employee_id) FILTER (WHERE c.status='completed')::int AS participating,
          COUNT(c.care_id) FILTER (WHERE c.status='completed')::int AS completed,
          COALESCE(SUM(c.paid),0)::numeric AS paid_spend
        FROM roster r LEFT JOIN care c ON c.employee_id=r.employee_id GROUP BY 1 ORDER BY 1`,
          replacements,
          transaction,
        );
        const ages = await select(
          `${CARE_CTE}
        SELECT CASE WHEN dob IS NULL THEN 'Unknown' WHEN EXTRACT(YEAR FROM AGE(:endDate::date-1,dob))<25 THEN 'Under 25'
          WHEN EXTRACT(YEAR FROM AGE(:endDate::date-1,dob))<35 THEN '25–34' WHEN EXTRACT(YEAR FROM AGE(:endDate::date-1,dob))<45 THEN '35–44'
          WHEN EXTRACT(YEAR FROM AGE(:endDate::date-1,dob))<55 THEN '45–54' ELSE '55+' END AS age_band,
          COUNT(DISTINCT employee_id)::int AS participating, COUNT(*)::int AS completed
        FROM care WHERE status='completed' GROUP BY 1 ORDER BY 1`,
          replacements,
          transaction,
        );
        const vendors = await select(
          `${CARE_CTE}
        SELECT provider_key, MAX(provider_name) AS provider_name, kind, COUNT(*)::int AS booked,
          COUNT(*) FILTER (WHERE status='completed')::int AS completed,
          COUNT(*) FILTER (WHERE status IN ('cancelled','canceled','no-show','no_show'))::int AS cancelled_or_missed,
          COALESCE(SUM(paid),0)::numeric AS paid_spend
        FROM care GROUP BY provider_key,kind ORDER BY booked DESC,provider_name`,
          replacements,
          transaction,
        );
        const feedback = await select(
          `SELECT COUNT(*)::int AS responses, ROUND(AVG((f.value->>'rating')::numeric),2) AS average_rating
        FROM corporate_employees ce CROSS JOIN LATERAL jsonb_each(COALESCE(ce.metadata->'careFeedback','{}'::jsonb)) f
        WHERE ce.corporate_id= :corporateId AND (ce."joiningDate" IS NULL OR ce."joiningDate" < :endDate) AND (ce."exitDate" IS NULL OR ce."exitDate" >= :startDate)
          AND f.value->>'year'= :year AND f.value->>'rating' ~ '^[1-5]$'`,
          { ...replacements, year: String(year) },
          transaction,
        );
        const [settings] = await select(
          "SELECT settings FROM corporate_settings WHERE corporate_id= :corporateId",
          { corporateId },
          transaction,
        );
        const budgetValue = settings?.settings?.programs?.budgets?.[year];
        const budget = budgetValue == null ? null : Number(budgetValue);
        const paidSpend = monthly.reduce(
          (sum, row) => sum + Number(row.paid_spend || 0),
          0,
        );
        return {
          year,
          currency: "INR",
          monthly,
          departments,
          ages,
          vendors,
          feedback: feedback[0] || { responses: 0, average_rating: null },
          budget: {
            annual: budget,
            paidSpend,
            remaining: budget == null ? null : budget - paidSpend,
            utilizationPercent:
              budget > 0
                ? Math.round((paidSpend / budget) * 10000) / 100
                : null,
          },
          notes: [
            "Completed care determines participation. HR scheduling records are shown separately from consultations.",
            "Paid spending includes recorded paid consultations and lab checkups; unrecorded or refunded costs are excluded.",
            "Age bands use age at the end of the reporting year.",
          ],
        };
      }),
    );
  }
  async function updateSettings(corporateId, mutate, transaction) {
    await database.query(
      `INSERT INTO corporate_settings (corporate_id,settings) VALUES (:corporateId,'{}') ON CONFLICT DO NOTHING`,
      { replacements: { corporateId }, transaction },
    );
    const [row] = await select(
      "SELECT settings FROM corporate_settings WHERE corporate_id= :corporateId FOR UPDATE",
      { corporateId },
      transaction,
    );
    const programs = { ...(row.settings?.programs || {}) };
    await mutate(programs);
    await database.query(
      `UPDATE corporate_settings SET settings=jsonb_set(COALESCE(settings,'{}'),'{programs}',:programs::jsonb),"updatedAt"=NOW() WHERE corporate_id= :corporateId`,
      {
        replacements: { corporateId, programs: JSON.stringify(programs) },
        transaction,
      },
    );
    return programs;
  }
  return { analytics, updateSettings };
}

export function validatedHours(input) {
  if (!Array.isArray(input) || input.length > 90)
    throw programError("Provide at most 90 availability windows");
  const hours = input
    .map((row) => {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(row.date || "") ||
        Number.isNaN(Date.parse(`${row.date}T00:00:00Z`)) ||
        new Date(`${row.date}T00:00:00Z`).toISOString().slice(0, 10) !==
          row.date
      )
        throw programError("Availability requires a valid date");
      if (
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.start || "") ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.end || "") ||
        row.start >= row.end
      )
        throw programError("Availability end time must follow start time");
      return { date: row.date, start: row.start, end: row.end };
    })
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start),
    );
  for (let i = 1; i < hours.length; i++)
    if (
      hours[i].date === hours[i - 1].date &&
      hours[i].start < hours[i - 1].end
    )
      throw programError("Availability windows cannot overlap");
  return hours;
}
