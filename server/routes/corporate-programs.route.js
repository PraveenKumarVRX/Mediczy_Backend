import express from "express";
import {
  corporatePrograms,
  programError,
  reportYear,
  validatedHours,
  csvDocument,
} from "../services/corporate-programs.service.js";

export function createCorporateProgramsRouter({
  database,
  authenticate,
  authenticateEmployee,
  audit,
  withClinicalContext,
}) {
  const router = express.Router();
  const service = corporatePrograms(database, withClinicalContext);
  const select = (sql, replacements, transaction) =>
    database.query(sql, {
      replacements,
      transaction,
      type: database.QueryTypes.SELECT,
    });
  const handle = (action) => async (req, res) => {
    try {
      await action(req, res);
    } catch (error) {
      res
        .status(error.statusCode || 500)
        .json({
          success: false,
          message: error.statusCode
            ? error.message
            : "The corporate workflow could not be completed",
        });
    }
  };
  const owner = (req) => {
    if (!["corporate", "corporate_admin"].includes(req.user.role))
      throw programError("Only Super HR can manage this setting", 403);
  };
  router.get(
    "/programs/analytics",
    authenticate,
    handle(async (req, res) => {
      const data = await service.analytics(
        req.user.corporateId,
        req.query.year,
      );
      res.setHeader("Cache-Control", "no-store");
      res.json({ success: true, data });
    }),
  );
  router.get(
    "/programs/analytics/export",
    authenticate,
    handle(async (req, res) => {
      const data = await service.analytics(
        req.user.corporateId,
        req.query.year,
      );
      const rows = [
        ...data.monthly.map((row) => ({ section: "monthly", ...row })),
        ...data.departments.map((row) => ({ section: "department", ...row })),
        ...data.ages.map((row) => ({ section: "age", ...row })),
        ...data.vendors.map((row) => ({ section: "vendor", ...row })),
        {
          section: "budget",
          annual_budget: data.budget.annual,
          paid_spend: data.budget.paidSpend,
          remaining: data.budget.remaining,
        },
        {
          section: "feedback",
          responses: data.feedback.responses,
          average_rating: data.feedback.average_rating,
        },
      ];
      await audit.record(req, {
        resourceId: `programs:${data.year}`,
        title: "Annual program utilization",
        action: "export",
      });
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="program-utilization-${data.year}.csv"`,
      );
      res.send(
        csvDocument(rows, [
          "section",
          "month",
          "department",
          "age_band",
          "provider_name",
          "kind",
          "eligible",
          "participating",
          "consultations",
          "checkups",
          "hr_schedules",
          "booked",
          "completed",
          "cancelled_or_missed",
          "paid_spend",
          "annual_budget",
          "remaining",
          "responses",
          "average_rating",
        ]),
      );
    }),
  );
  router.put(
    "/programs/budget",
    authenticate,
    handle(async (req, res) => {
      owner(req);
      const year = reportYear(req.body.year);
      const amount = req.body.amount;
      if (
        typeof amount !== "number" ||
        !Number.isFinite(amount) ||
        amount < 0 ||
        amount > 1e12
      )
        throw programError(
          "Enter a budget between 0 and 1,000,000,000,000 INR",
        );
      await database.transaction(async (transaction) => {
        await service.updateSettings(
          req.user.corporateId,
          (programs) => {
            programs.budgets = {
              ...programs.budgets,
              [year]: Math.round(amount * 100) / 100,
            };
          },
          transaction,
        );
        await audit.record(
          req,
          {
            resourceId: `budget:${year}`,
            title: "Annual program budget",
            action: "update",
          },
          transaction,
        );
      });
      res.json({ success: true });
    }),
  );
  router.get(
    "/programs/doctors/:id/availability",
    authenticate,
    handle(async (req, res) => {
      const [doctor] = await select(
        `SELECT id,unique_id,"weeklySchedule" FROM doctors WHERE id::text = :id AND LOWER(status::text)='active'`,
        { id: req.params.id },
      );
      if (!doctor) throw programError("Active doctor not found", 404);
      const [settings] = await select(
        "SELECT settings FROM corporate_settings WHERE corporate_id= :corporateId",
        { corporateId: req.user.corporateId },
      );
      const configured =
        settings?.settings?.programs?.availability?.[doctor.unique_id];
      res.json({
        success: true,
        data: {
          hours: configured ?? [],
          configured: configured != null,
          weeklySchedule: doctor.weeklySchedule || null,
          timezone: "Asia/Kolkata",
        },
      });
    }),
  );
  router.put(
    "/programs/doctors/:id/availability",
    authenticate,
    handle(async (req, res) => {
      owner(req);
      const hours =
        req.body.hours === null ? null : validatedHours(req.body.hours);
      const [doctor] = await select(
        `SELECT id,unique_id FROM doctors WHERE id::text = :id AND LOWER(status::text)='active'`,
        { id: req.params.id },
      );
      if (!doctor?.unique_id)
        throw programError("Active doctor not found", 404);
      await database.transaction(async (transaction) => {
        await service.updateSettings(
          req.user.corporateId,
          (programs) => {
            programs.availability = { ...programs.availability };
            if (hours === null) delete programs.availability[doctor.unique_id];
            else programs.availability[doctor.unique_id] = hours;
          },
          transaction,
        );
        await audit.record(
          req,
          {
            resourceId: doctor.unique_id,
            title: "Corporate doctor availability",
            action: "update",
          },
          transaction,
        );
      });
      res.json({ success: true });
    }),
  );

  router.get(
    "/programs/wellness/:id/registrations/export",
    authenticate,
    handle(async (req, res) => {
      const [event] = await select(
        "SELECT id,title FROM corporate_wellness_events WHERE corporate_id=:corporateId AND id::text=:id",
        { corporateId: req.user.corporateId, id: req.params.id },
      );
      if (!event) throw programError("Wellness event not found", 404);
      const rows = await select(
        `SELECT r."employeeId" AS employee_id,COALESCE(NULLIF(CONCAT_WS(' ',u."firstName",u."lastName"),''),r."employeeId") AS name,ce.department,r.status,r.invited_at,r.responded_at
      FROM corporate_wellness_event_rsvps r JOIN corporate_wellness_events e ON e.id=r.event_id AND e.corporate_id=:corporateId
      LEFT JOIN users u ON u.id=r."userId" LEFT JOIN corporate_employees ce ON ce.corporate_id=e.corporate_id AND ce."employeeId"=r."employeeId"
      WHERE e.id::text=:id ORDER BY r.id`,
        { corporateId: req.user.corporateId, id: req.params.id },
      );
      await audit.record(req, {
        resourceId: `wellness:${event.id}`,
        title: "Wellness registration export",
        action: "export",
      });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="wellness-registrations-${event.id}.csv"`,
      );
      res.send(
        csvDocument(rows, [
          "employee_id",
          "name",
          "department",
          "status",
          "invited_at",
          "responded_at",
        ]),
      );
    }),
  );
  router.get(
    "/programs/compliance/:type/export",
    authenticate,
    handle(async (req, res) => {
      const corporateId = req.user.corporateId;
      let rows, columns;
      if (req.params.type === "consents") {
        rows = await select(
          `SELECT ce."employeeId" AS employee_id,COALESCE(NULLIF(CONCAT_WS(' ',u."firstName",u."lastName"),''),ce.email,ce."employeeId") AS name,COALESCE(NULLIF(ce.email,''),u.email) AS email,ce.department,c.granted,c.granted_at,c.revoked_at
        FROM corporate_employees ce LEFT JOIN users u ON u.id=ce."userId" LEFT JOIN corporate_employee_consents c ON c.corporate_id=ce.corporate_id AND c.employee_id=ce."employeeId" AND c.consent_type='health_data'
        WHERE ce.corporate_id=:corporateId AND ce."isActive"=true ORDER BY ce."employeeId"`,
          { corporateId },
        );
        columns = [
          "employee_id",
          "name",
          "email",
          "department",
          "granted",
          "granted_at",
          "revoked_at",
        ];
      } else if (req.params.type === "audit") {
        rows = await select(
          `SELECT report_id,report_title,accessed_by_type,accessed_by_name,action,ip_address,accessed_at FROM corporate_report_access_log WHERE corporate_id=:corporateId ORDER BY accessed_at DESC LIMIT 10000`,
          { corporateId },
        );
        columns = [
          "report_id",
          "report_title",
          "accessed_by_type",
          "accessed_by_name",
          "action",
          "ip_address",
          "accessed_at",
        ];
      } else throw programError("Unknown compliance export", 404);
      await audit.record(req, {
        resourceId: `compliance:${req.params.type}`,
        title: "Compliance export",
        action: "export",
      });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${req.params.type}-report.csv"`,
      );
      res.send(csvDocument(rows, columns));
    }),
  );

  // Employees rate only completed care that belongs to their own active roster entry.
  router.get(
    "/programs/employee/feedback",
    authenticateEmployee,
    handle(async (req, res) => {
      const entries = await database.transaction(async (transaction) => {
        const action = async () =>
          select(
            `WITH employee AS (
        SELECT ce.*,c."companyName" FROM corporate_employees ce JOIN corporates c ON c.id=ce.corporate_id
        WHERE ce."userId"= :userId AND ce."isActive"=true
      ) SELECT 'consultation:'||a.id::text AS key,a."appointmentDate"::text AS date,a."doctorName" AS provider,e."companyName" AS company,
        e.metadata->'careFeedback'->('consultation:'||a.id::text) AS feedback
        FROM appointments a JOIN employee e ON e."userId"=a."userId" WHERE LOWER(a.status)='completed' AND a.corporate_tenant_id=e.corporate_id
      UNION ALL SELECT 'lab_checkup:'||b.id::text,b.appointment_date::text,b.lab_snapshot->>'name',e."companyName",
        e.metadata->'careFeedback'->('lab_checkup:'||b.id::text)
        FROM health_checkup_bookings b JOIN employee e ON e."userId"=b.user_id AND e.corporate_id=b.corporate_id WHERE LOWER(b.status)='completed'
      ORDER BY date DESC LIMIT 100`,
            { userId: req.user.id },
            transaction,
          );
        return withClinicalContext
          ? withClinicalContext(transaction, action)
          : action();
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ success: true, data: entries });
    }),
  );
  router.post(
    "/programs/employee/feedback",
    authenticateEmployee,
    handle(async (req, res) => {
      const { key, rating, comment = "" } = req.body;
      if (
        !/^(consultation|lab_checkup):[1-9]\d{0,18}$/.test(key || "") ||
        !Number.isInteger(rating) ||
        rating < 1 ||
        rating > 5 ||
        typeof comment !== "string" ||
        comment.length > 1000
      )
        throw programError(
          "Provide a completed visit, a rating from 1 to 5 and at most 1,000 comment characters",
        );
      const [kind, id] = key.split(":");
      await database.transaction(async (transaction) => {
        const action = async () => {
          const visits =
            kind === "consultation"
              ? await select(
                  `SELECT ce.id,a."appointmentDate" AS date FROM appointments a JOIN corporate_employees ce ON ce."userId"=a."userId" AND ce."isActive"=true WHERE a.id::text = :id AND a."userId"= :userId AND LOWER(a.status)='completed' AND a.corporate_tenant_id=ce.corporate_id`,
                  { id, userId: req.user.id },
                  transaction,
                )
              : await select(
                  `SELECT ce.id,b.appointment_date AS date FROM health_checkup_bookings b JOIN corporate_employees ce ON ce."userId"=b.user_id AND ce.corporate_id=b.corporate_id AND ce."isActive"=true WHERE b.id::text = :id AND b.user_id= :userId AND LOWER(b.status)='completed'`,
                  { id, userId: req.user.id },
                  transaction,
                );
          if (!visits.length)
            throw programError("Completed visit not found", 404);
          for (const visit of visits) {
            const year = new Date(visit.date).getUTCFullYear();
            await database.query(
              `UPDATE corporate_employees SET metadata=jsonb_set(COALESCE(metadata,'{}'),'{careFeedback}',COALESCE(metadata->'careFeedback','{}')||jsonb_build_object(:key,:feedback::jsonb)),"updatedAt"=NOW() WHERE id= :employeeId AND "userId"= :userId AND "isActive"=true`,
              {
                replacements: {
                  employeeId: visit.id,
                  userId: req.user.id,
                  key,
                  feedback: JSON.stringify({
                    rating,
                    comment: comment.trim(),
                    year,
                    submittedAt: new Date().toISOString(),
                  }),
                },
                transaction,
              },
            );
          }
        };
        if (withClinicalContext) await withClinicalContext(transaction, action);
        else await action();
      });
      res.json({ success: true });
    }),
  );
  return router;
}
