import express from "express";
import multer from "multer";
const error = (message, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });
export function createCorporateCertificateUploadRouter({
  database,
  authenticate,
  uploadEncrypted,
  removeEncrypted,
  audit,
}) {
  const router = express.Router();
  const parse = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  }).single("file");
  router.post(
    "/fitness-certificates/upload",
    authenticate,
    (req, res, next) =>
      parse(req, res, (err) =>
        err
          ? res
              .status(400)
              .json({
                success: false,
                message:
                  err.code === "LIMIT_FILE_SIZE"
                    ? "Certificate PDF must be 10 MB or smaller"
                    : "Upload one PDF file",
              })
          : next(),
      ),
    async (req, res) => {
      let uploaded;
      try {
        const body = req.body;
        const statuses = [
          "fit",
          "fit_with_restrictions",
          "temporarily_unfit",
          "unfit",
          "permanently_unfit",
        ];
        if (
          !req.file ||
          req.file.mimetype !== "application/pdf" ||
          req.file.buffer.subarray(0, 5).toString() !== "%PDF-"
        )
          throw error("Choose a valid PDF certificate");
        if (
          !body.employeeId ||
          !statuses.includes(body.fitnessStatus) ||
          typeof body.issuedBy !== "string" ||
          !body.issuedBy.trim() ||
          body.issuedBy.length > 150
        )
          throw error(
            "Employee, fitness status and the issuing clinician are required",
          );
        const validDate = (value) =>
          /^\d{4}-\d{2}-\d{2}$/.test(value || "") &&
          !Number.isNaN(Date.parse(value)) &&
          new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
        const today = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Kolkata",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());
        if (
          !validDate(body.examinationDate) ||
          body.examinationDate > today ||
          (body.validUntil &&
            (!validDate(body.validUntil) ||
              body.validUntil < body.examinationDate))
        )
          throw error(
            "Provide a valid examination date and optional expiry date",
          );
        const result = await database.transaction(async (transaction) => {
          const select = (sql, replacements) =>
            database.query(sql, {
              replacements,
              transaction,
              type: database.QueryTypes.SELECT,
            });
          const [employee] = await select(
            `SELECT ce."userId",ce."employeeId",c.unique_id AS corporate_uid,c."companyName",COALESCE(NULLIF(CONCAT_WS(' ',u."firstName",u."lastName"),''),ce.email,ce."employeeId") AS name
     FROM corporate_employees ce JOIN corporates c ON c.id=ce.corporate_id JOIN users u ON u.id=ce."userId"
     WHERE ce.corporate_id= :corporateId AND ce."employeeId"= :employeeId AND ce."isActive"=true`,
            { corporateId: req.user.corporateId, employeeId: body.employeeId },
          );
          if (!employee)
            throw error(
              "An active employee with a linked account is required",
              404,
            );
          uploaded = await uploadEncrypted({
            buffer: req.file.buffer,
            originalName: "fitness-certificate.pdf",
            mimeType: "application/pdf",
            keyPrefix: `corporate-certificates/${employee.corporate_uid}`,
          });
          const metadata = {
            source: "hr_upload",
            uploadedAt: new Date().toISOString(),
            uploadedBy:
              req.user.role === "corporate"
                ? employee.corporate_uid
                : `user:${req.user.userId}`,
            storage: {
              key: uploaded.key,
              bucket: uploaded.bucket,
              ...uploaded.encryption,
              compressionMethod: uploaded.compressionMethod,
              mimeType: "application/pdf",
              originalSize: req.file.size,
            },
          };
          const [cert] = await select(
            `INSERT INTO fitness_certificates (organization_id,employer_uid,patient_id,employee_id,patient_name,employer_name,certificate_type,issued_by,doctor_reg_no,examination_date,fitness_status,valid_from,valid_until,certificate_data,signed_at)
     VALUES (:corporateId,:corporateUid,:patientId,:employeeId,:name,:companyName,'external_upload',:issuedBy,:registration,:date,:status,:date,:validUntil,:metadata::jsonb,NULL) RETURNING id`,
            {
              corporateId: req.user.corporateId,
              corporateUid: employee.corporate_uid,
              patientId: employee.userId,
              employeeId: employee.employeeId,
              name: employee.name,
              companyName: employee.companyName,
              issuedBy: body.issuedBy.trim(),
              registration: String(body.doctorRegNo || "").slice(0, 80) || null,
              date: body.examinationDate,
              status: body.fitnessStatus,
              validUntil: body.validUntil || null,
              metadata: JSON.stringify(metadata),
            },
          );
          await audit.record(
            req,
            {
              resourceId: `certificate:${cert.id}`,
              title: "External fitness certificate uploaded",
              action: "upload",
            },
            transaction,
          );
          return cert;
        });
        res.status(201).json({ success: true, data: { id: result.id } });
      } catch (err) {
        if (uploaded && removeEncrypted)
          await removeEncrypted(uploaded).catch(() => {});
        res
          .status(err.statusCode || 500)
          .json({
            success: false,
            message: err.statusCode
              ? err.message
              : "Certificate upload could not be completed",
          });
      }
    },
  );
  return router;
}
