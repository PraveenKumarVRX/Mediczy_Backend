import express from "express";
import {
  normalizeCorporateAccess,
  isRestrictedCorporateAccess,
  corporateScopeSql,
} from "../services/corporate-access-policy.js";
export function createCorporateAccessRouter({ database, authenticate, audit }) {
  const router = express.Router();
  const select = (sql, replacements, transaction) =>
    database.query(sql, {
      replacements,
      transaction,
      type: database.QueryTypes.SELECT,
    });
  const handle = (fn) => async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      await fn(req, res);
    } catch (error) {
      res
        .status(error.statusCode || 500)
        .json({
          success: false,
          message: error.statusCode
            ? error.message
            : "Corporate access could not be loaded",
        });
    }
  };
  const owner = (req) => {
    if (!["corporate", "corporate_admin"].includes(req.user.role))
      throw Object.assign(
        new Error("Only Super HR can manage team permissions"),
        { statusCode: 403 },
      );
  };
  router.get(
    "/access/me",
    authenticate,
    handle(async (req, res) => {
      res.json({
        success: true,
        data: {
          role: req.user.role,
          restricted: isRestrictedCorporateAccess(req.corporateAccess),
          policy: req.corporateAccess || {
            level: "staff",
            departments: [],
            businessUnits: [],
            branches: [],
          },
        },
      });
    }),
  );
  router.get(
    "/access/team",
    authenticate,
    handle(async (req, res) => {
      owner(req);
      const members = await select(
        `SELECT u.id,u."firstName",u."lastName",u.email,u.role,u.metadata->'corporateAccess' AS access
    FROM users u JOIN corporates c ON c.unique_id=u.organization_uid WHERE c.id= :corporateId AND u.organization_type='corporate' AND u.role='hr_staff' AND u.status='active' ORDER BY u."firstName",u.id`,
        { corporateId: req.user.corporateId },
      );
      const rows = await select(
        `SELECT DISTINCT department,business_unit,COALESCE(NULLIF(ce.metadata->>'branch',''),(SELECT CASE WHEN COUNT(*)=1 THEN MIN(d.location) ELSE NULL END FROM corporate_departments d WHERE d.corporate_id=ce.corporate_id AND d.name=ce.department),'') AS branch FROM corporate_employees ce WHERE ce.corporate_id= :corporateId AND ce."isActive"=true`,
        { corporateId: req.user.corporateId },
      );
      const choices = (key) =>
        [...new Set(rows.map((row) => row[key]).filter(Boolean))].sort();
      res.json({
        success: true,
        data: {
          members,
          departments: choices("department"),
          businessUnits: choices("business_unit"),
          branches: choices("branch"),
        },
      });
    }),
  );
  router.put(
    "/access/team/:id",
    authenticate,
    handle(async (req, res) => {
      owner(req);
      const policy = normalizeCorporateAccess(req.body);
      await database.transaction(async (transaction) => {
        const rows = await select(
          `UPDATE users u SET metadata=jsonb_set(COALESCE(u.metadata,'{}'),'{corporateAccess}',:policy::jsonb),"updatedAt"=NOW()
     FROM corporates c WHERE c.id= :corporateId AND c.unique_id=u.organization_uid AND u.id::text = :id AND u.organization_type='corporate' AND u.role='hr_staff' AND u.status='active' RETURNING u.id`,
          {
            corporateId: req.user.corporateId,
            id: req.params.id,
            policy: JSON.stringify(policy),
          },
          transaction,
        );
        if (!rows.length)
          throw Object.assign(
            new Error("Active HR staff member not found in this corporate"),
            { statusCode: 404 },
          );
        await audit.record(
          req,
          {
            resourceId: `hr-user:${rows[0].id}`,
            title: "HR role and employee scope",
            action: "update",
          },
          transaction,
        );
      });
      res.json({ success: true });
    }),
  );
  router.get(
    "/access/assigned-employees",
    authenticate,
    handle(async (req, res) => {
      const scope = req.corporateAccess
        ? corporateScopeSql(req.corporateAccess)
        : { sql: "TRUE", replacements: {} };
      const employees = await select(
        `SELECT ce."employeeId",COALESCE(NULLIF(CONCAT_WS(' ',u."firstName",u."lastName"),''),ce.email,ce."employeeId") AS name,COALESCE(NULLIF(ce.email,''),u.email) AS email,ce.department,ce.business_unit AS "businessUnit"
    FROM corporate_employees ce LEFT JOIN users u ON u.id=ce."userId" WHERE ce.corporate_id= :corporateId AND ce."isActive"=true AND ${scope.sql} ORDER BY name LIMIT 1000`,
        { corporateId: req.user.corporateId, ...scope.replacements },
      );
      res.json({ success: true, data: { employees } });
    }),
  );
  router.get(
    "/access/appointments",
    authenticate,
    handle(async (req, res) => {
      const scope = req.corporateAccess
        ? corporateScopeSql(req.corporateAccess)
        : { sql: "TRUE", replacements: {} };
      const appointments = await select(
        `SELECT a.id,a."employeeId",a."employeeName",a."appointmentType",a.date,a.time,a.status,a."doctorName",a.facility
    FROM corporate_scheduled_appointments a JOIN corporate_employees ce ON ce.corporate_id=a.corporate_id AND ce."employeeId"=a."employeeId" WHERE a.corporate_id= :corporateId AND ce."isActive"=true AND ${scope.sql} ORDER BY a.date DESC,a.id DESC LIMIT 500`,
        { corporateId: req.user.corporateId, ...scope.replacements },
      );
      res.json({ success: true, data: { appointments } });
    }),
  );
  return router;
}
