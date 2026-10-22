import { programError, validatedHours } from "./corporate-programs.service.js";
export function futureSchedule(date, time, now = Date.now()) {
  const day = String(date || "").slice(0, 10),
    clock = String(time || "");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(clock)
  )
    throw programError("Provide a valid appointment date and time");
  const timestamp = Date.parse(
    `${day}T${clock.length === 5 ? clock + ":00" : clock}+05:30`,
  );
  if (
    Number.isNaN(timestamp) ||
    new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day ||
    timestamp <= now
  )
    throw programError("Appointment time must be in the future (India time)");
  return { date: day, time: clock.slice(0, 5) };
}
export async function prepareCorporateSchedule(
  database,
  corporateId,
  input,
  transaction,
) {
  const select = (sql, replacements) =>
    database.query(sql, {
      replacements,
      transaction,
      type: database.QueryTypes.SELECT,
    });
  const scheduled = futureSchedule(input.date, input.time);
  const [employee] = await select(
    `SELECT ce."employeeId",ce.department,COALESCE(NULLIF(CONCAT_WS(' ',u."firstName",u."lastName"),''),NULLIF(CONCAT_WS(' ',ce.metadata->>'firstName',ce.metadata->>'lastName'),''),ce.email,ce."employeeId") AS name
 FROM corporate_employees ce LEFT JOIN users u ON u.id=ce."userId" WHERE ce.corporate_id= :corporateId AND ce."employeeId"= :employeeId AND ce."isActive"=true`,
    { corporateId, employeeId: input.employeeId },
  );
  if (!employee)
    throw programError("Active employee not found in this corporate", 404);
  let doctorUid = input.doctor_uid || null;
  let doctorName = input.doctorName || "TBD";
  if (input.doctorId || doctorUid) {
    const [doctor] = await select(
      `SELECT unique_id,CONCAT_WS(' ',"firstName","lastName") AS name FROM doctors WHERE (CASE WHEN :doctorId <>'' THEN id::text = :doctorId ELSE unique_id= :doctorUid END) AND LOWER(status::text)='active'`,
      { doctorId: String(input.doctorId || ""), doctorUid: doctorUid || "" },
    );
    if (!doctor?.unique_id) throw programError("Active doctor not found", 404);
    doctorUid = doctor.unique_id;
    doctorName = doctor.name;
    const [settings] = await select(
      "SELECT settings FROM corporate_settings WHERE corporate_id= :corporateId",
      { corporateId },
    );
    const hours = settings?.settings?.programs?.availability?.[doctorUid];
    if (
      hours != null &&
      !validatedHours(hours).some(
        (window) =>
          window.date === scheduled.date &&
          window.start <= scheduled.time &&
          window.end > scheduled.time,
      )
    )
      throw programError(
        "This time is outside the corporate scheduling windows for the selected doctor",
        409,
      );
  }
  return {
    ...scheduled,
    employeeId: employee.employeeId,
    employeeName: employee.name,
    department: employee.department || "General",
    doctorUid,
    doctorName,
  };
}
