// import { validationResult } from "express-validator";
import { JWT_CONFIG } from '../config/auth.config.js';
// import doctorModel from "../models/doctor.model.js";
// import jwt from "jsonwebtoken";

// export async function registerDoctor(req, res) {
//   try {
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       return res.status(400).json({ errors: errors.array() });
//     }

//     const { email } = req.body;

//     const existingDoctor = await doctorModel.findOne({ email });
//     if (existingDoctor) {
//       return res.status(409).json({ message: "Email already exists" });
//     }

//     // Create doctor with plain password, hashing will happen via schema pre-save hook
//     const newDoctor = new doctorModel(req.body);
//     await newDoctor.save(); // Triggers password hash & validation

//     const token = newDoctor.generateAuthToken();
//     const doctorResponse = newDoctor.toObject();
//     delete doctorResponse.password;

//     return res.status(201).json({
//       message: "Doctor registered successfully",
//       token,
//       doctor: doctorResponse,
//     });
//   } catch (error) {
//     console.error("Registration error:", error);
//     return res.status(500).json({ message: "Internal Server Error" });
//   }
// }

// export async function signInDoctor(req, res) {
//   try {
//     // Validate request input
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       return res.status(400).json({ errors: errors.array() });
//     }

//     const { email, password } = req.body;

//     // Check if doctor exists
//     const doctor = await doctorModel.findOne({ email }).select("+password");

//     if (!doctor) {
//       return res.status(401).json({ message: "Invalid email or password" });
//     }

//     // Validate password
//     try {
//       const isPasswordValid = await doctor.comparePassword(password);

//       if (!isPasswordValid) {
//         return res.status(401).json({ message: "Invalid email or password" });
//       }

//       // Generate authentication token
//       const token = doctor.generateAuthToken();

//       // Remove password from response
//       const doctorResponse = doctor.toObject();
//       delete doctorResponse.password;

//       // Update online status without validation
//       await doctorModel.findByIdAndUpdate(
//         doctor._id,
//         {
//           $set: {
//             isOnline: true,
//             lastActive: new Date()
//           }
//         },
//         { 
//           new: true,
//           validateBeforeSave: false
//         }
//       );

//       // Respond with doctor data & token
//       return res.status(200).json({
//         message: "Login successful",
//         token,
//         doctor: doctorResponse,
//       });
//     } catch (passwordError) {
//       console.error("Password comparison error:", passwordError);
//       return res.status(401).json({ message: "Invalid email or password" });
//     }
//   } catch (error) {
//     console.error("Login error:", error);
//     return res.status(500).json({ message: "Internal Server Error" });
//   }
// }

// export const getDoctorProfile = async (req, res) => {
//   try {
//     if (!req.doctor) {
//       return res.status(404).json({ message: "Doctor not found" });
//     }

//     // Remove password from doctor data before sending response
//     const doctorResponse = req.doctor.toObject();
//     delete doctorResponse.password;

//     return res.status(200).json(doctorResponse);
//   } catch (error) {
//     console.error("Profile retrieval error:", error);
//     return res.status(500).json({ message: "Internal Server Error" });
//   }
// };

// export const updateDoctorStatus = async (req, res) => {
//   try {
//     console.log('hello from asy');

//     // Extract token from headers
//     const token = req.headers.authorization?.split(" ")[1];

//     if (!token) {
//       return res.status(401).json({
//         success: false,
//         message: "Unauthorized. No token provided.",
//       });
//     }

//     // Verify and decode token
//     const decoded = jwt.verify(token, process.env.SECRET_TOKEN);
//     const userId = decoded._id; // Ensure your JWT contains `id`

//     // Extract status from request
//     const { isOnline } = req.body;

//     if (typeof isOnline !== "boolean") {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid status. Must be a boolean value.",
//       });
//     }

//     // Update user status
//     const updatedUser = await doctorModel
//       .findByIdAndUpdate(
//         userId,
//         {
//           isOnline,
//           lastActive: new Date(),
//           updatedAt: new Date(),
//         },
//         { new: true, runValidators: true }
//       )
//       .select("-password");

//     if (!updatedUser) {
//       return res.status(404).json({
//         success: false,
//         message: "User not found.",
//       });
//     }

//     res.status(200).json({
//       success: true,
//       message: `Status updated to ${isOnline ? "online" : "offline"}.`,
//       data: {
//         isOnline: updatedUser.isOnline,
//         lastActive: updatedUser.lastActive,
//       },
//     });
//   } catch (error) {
//     console.error("Error updating status:", error);
//     res.status(500).json({
//       success: false,
//       message: "Server error while updating status.",
//       error: error.message,
//     });
//   }
// };

// export const getAvailableDoctors = async (req, res) => {
//   try {
//     const { specialization, isOnline } = req.query;

//     // Build the query object
//     const query = {};

//     // Add online status to query if provided
//     if (isOnline !== undefined) {
//       // Convert string to boolean
//       query.isOnline = isOnline === "true";
//     }

//     // Add specialization to query if provided
//     if (specialization) {
//       query.specialization = specialization;
//     }

//     // Find doctors matching the criteria
//     const doctors = await doctorModel.find(query)
//       .select({
//         firstName: 1,
//         lastName: 1,
//         specialization: 1,
//         experience: 1,
//         phoneNumber: 1,
//         isOnline: 1,
//         qualifications: 1,
//         reviews: 1,
//         availability: 1,
//       })
//       .sort({ experience: -1 }); // Sort by experience (most experienced first)

//     res.status(200).json({
//       success: true,
//       count: doctors.length,
//       data: doctors,
//     });
//   } catch (error) {
//     console.error("Error finding doctors:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error fetching doctors",
//       error: error.message,
//     });
//   }
// };

import { validationResult } from "express-validator";
import doctorModel from "../models/doctor.model.intelligent.js";
import { User } from "../models/user.model.intelligent.js";
import jwt from "jsonwebtoken";
import intelligentDb from "../utils/intelligentDbClient.js";
import { auditLoginAttempt } from "../middleware/audit.middleware.js";
import { fn, col, where as sequelizeWhere } from "sequelize";
import nodemailer from "nodemailer";

// ─── Mailer helper (reusable inside this controller) ─────────────────────────
function getDoctorMailTransporter() {
  const port = parseInt(process.env.SMTP_PORT) || 587;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: { user: (process.env.SMTP_USER || '').trim(), pass: (process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '').trim() },
  });
}

// ─── Send confirmation email TO THE DOCTOR with signed agreement ──────────────
async function sendDoctorConfirmationEmail(doctor, docs) {
  try {
    const transporter = getDoctorMailTransporter();
    const submittedAt = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
    const doctorName = `${doctor.prefix || ''} ${doctor.firstName} ${doctor.lastName}`.trim();
    const agreementId = docs.agreement?.agreementId || 'N/A';
    const signedAt    = docs.agreement?.signedAt ? new Date(docs.agreement.signedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : submittedAt;

    // Build submitted-documents list
    const docLabels = { idProof: 'ID Proof', addressProof: 'Address Proof', medicalDegree: 'Medical Degree', councilCertificate: 'Council Certificate' };
    const docRows = Object.entries(docLabels)
      .filter(([k]) => docs[k])
      .map(([k, label], i) => `<tr${i%2!==0?' style="background:#f8fafc"':''}><td style="padding:8px 0;color:#64748b;font-weight:600;width:160px">${label}</td><td style="padding:8px 0;color:#0f172a">${docs[k].name || '—'}</td></tr>`)
      .join('');

    // Attach signed agreement PDF
    const attachments = [];
    if (docs.agreement?.pdf) {
      try {
        const base64 = docs.agreement.pdf.replace(/^data:application\/pdf;base64,/, '');
        attachments.push({
          filename: `Mediqzy_Agreement_${doctorName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.pdf`,
          content: Buffer.from(base64, 'base64'),
          contentType: 'application/pdf',
        });
      } catch { /* skip if decode fails */ }
    }

    await transporter.sendMail({
      from: `"Mediqzy" <${process.env.SMTP_USER || 'noreply@mediczy.com'}>`,
      to: doctor.email,
      subject: `✅ Application Received — Your Signed Agreement | Mediqzy`,
      attachments,
      html: `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f0f4f8">
<tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.09);">
  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,#1d4ed8,#0284c7);padding:36px 40px;">
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:800">Application Received!</h1>
    <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:13px">Submitted on ${submittedAt} IST</p>
  </td></tr>
  <!-- Body -->
  <tr><td style="padding:36px 40px;">
    <p style="margin:0 0 20px;font-size:15px;color:#0f172a;line-height:1.7">
      Dear <strong>${doctorName}</strong>,<br><br>
      Thank you for registering on <strong>Mediqzy</strong>. We have received your application and all submitted documents. Our team will verify your credentials and activate your account within <strong>1–2 business days</strong>.
    </p>

    <!-- Agreement box -->
    <div style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:12px;padding:20px 24px;margin-bottom:28px">
      <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#1e40af">📄 Practitioner Engagement Agreement</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr><td style="padding:6px 0;color:#64748b;font-weight:600;width:140px">Agreement ID</td><td style="padding:6px 0;color:#0f172a">${agreementId}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;font-weight:600">Signed At</td><td style="padding:6px 0;color:#0f172a">${signedAt}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;font-weight:600">Between</td><td style="padding:6px 0;color:#0f172a">Mayden SmartHealth Pvt Ltd &amp; ${doctorName}</td></tr>
      </table>
      ${attachments.length > 0 ? '<p style="margin:12px 0 0;font-size:13px;color:#059669;font-weight:600">✅ Your signed agreement PDF is attached to this email.</p>' : ''}
    </div>

    <!-- Documents -->
    ${docRows ? `
    <h2 style="margin:0 0 14px;font-size:14px;font-weight:700;color:#0f172a;border-bottom:1px solid #e2e8f0;padding-bottom:10px">Documents Submitted</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:28px">${docRows}</table>
    ` : ''}

    <!-- What's next -->
    <div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:12px;padding:20px 24px;margin-bottom:28px">
      <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#15803d">⏳ What happens next?</p>
      <ul style="margin:0;padding-left:18px;font-size:13px;color:#166534;line-height:1.9">
        <li>Our team will verify your ID proof, address proof, and medical credentials.</li>
        <li>You will receive an <strong>activation email</strong> once your account is approved.</li>
        <li>Activation typically takes <strong>1–2 business days</strong>.</li>
      </ul>
    </div>

    <p style="margin:0;font-size:13px;color:#64748b">
      Questions? Reply to this email or write to us at <a href="mailto:support@mediqzy.com" style="color:#1d4ed8">support@mediqzy.com</a>.
    </p>
  </td></tr>
  <!-- Footer -->
  <tr><td style="padding:16px 40px;border-top:1px solid #e2e8f0;text-align:center">
    <p style="margin:0;font-size:11px;color:#94a3b8">Mediqzy · Mayden SmartHealth Pvt Ltd · Chennai, Tamil Nadu, India</p>
  </td></tr>
</table></td></tr></table>
</body></html>`,
    });
    console.log(`[DoctorReg] Confirmation email with signed agreement sent to ${doctor.email}`);
  } catch (mailErr) {
    console.warn('[DoctorReg] Doctor confirmation email failed (non-critical):', mailErr.message);
  }
}

// ─── Send registration notification to support@mediqzy.com ───────────────────
async function sendDoctorRegistrationAlert(doctor, docs) {
  try {
    const transporter = getDoctorMailTransporter();
    const submittedAt = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
    const doctorName = `${doctor.prefix || ''} ${doctor.firstName} ${doctor.lastName}`.trim();

    // Build document attachment list for email body
    const docLabels = { idProof: 'ID Proof', addressProof: 'Address Proof', medicalDegree: 'Medical Degree', councilCertificate: 'Council Certificate' };
    const docRows = Object.entries(docLabels)
      .filter(([k]) => docs[k])
      .map(([k, label], i) => `<tr${i%2!==0?' style="background:#f1f5f9"':''}><td style="padding:9px 0;color:#64748b;font-weight:600;width:170px">${label}</td><td style="padding:9px 0;color:#0f172a">${docs[k].name || '—'} <span style="color:#94a3b8;font-size:11px">(${docs[k].type || ''})</span></td></tr>`)
      .join('');

    const agreementId = docs.agreement?.agreementId || 'N/A';
    const signedAt    = docs.agreement?.signedAt ? new Date(docs.agreement.signedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—';

    // Attach PDF if present (data URI → buffer)
    const attachments = [];
    if (docs.agreement?.pdf) {
      try {
        const base64 = docs.agreement.pdf.replace(/^data:application\/pdf;base64,/, '');
        attachments.push({
          filename: `Agreement_${doctorName.replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.pdf`,
          content: Buffer.from(base64, 'base64'),
          contentType: 'application/pdf',
        });
      } catch { /* skip attachment on decode error */ }
    }

    await transporter.sendMail({
      from: `"Mediczy Registrations" <${process.env.SMTP_USER || 'noreply@mediczy.com'}>`,
      to: 'support@mediqzy.com',
      subject: `🩺 New Doctor Registration — ${doctorName} | Pending Verification`,
      attachments,
      html: `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f0f4f8">
<tr><td align="center" style="padding:40px 20px;">
<table width="620" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.09);">
  <tr><td style="background:linear-gradient(135deg,#1d4ed8,#0284c7);padding:36px 40px;">
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:800">🩺 New Doctor Registration</h1>
    <p style="margin:6px 0 0;color:rgba(255,255,255,0.82);font-size:13px">Received on ${submittedAt} IST · Pending manual verification</p>
  </td></tr>
  <tr><td style="padding:36px 40px;">
    <h2 style="margin:0 0 20px;font-size:15px;color:#0f172a;border-bottom:1px solid #e2e8f0;padding-bottom:12px">Doctor Details</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr><td style="padding:9px 0;color:#64748b;font-weight:600;width:170px">Full Name</td><td style="padding:9px 0;color:#0f172a;font-weight:700">${doctorName}</td></tr>
      <tr style="background:#f1f5f9"><td style="padding:9px 8px;color:#64748b;font-weight:600">Email</td><td style="padding:9px 8px;color:#0f172a"><a href="mailto:${doctor.email}" style="color:#1d4ed8">${doctor.email}</a></td></tr>
      <tr><td style="padding:9px 0;color:#64748b;font-weight:600">Phone</td><td style="padding:9px 0;color:#0f172a">${doctor.phoneNumber || '—'}</td></tr>
      <tr style="background:#f1f5f9"><td style="padding:9px 8px;color:#64748b;font-weight:600">Specialization</td><td style="padding:9px 8px;color:#0f172a">${doctor.specialization || '—'}</td></tr>
      <tr><td style="padding:9px 0;color:#64748b;font-weight:600">Experience</td><td style="padding:9px 0;color:#0f172a">${doctor.experience || '—'} years</td></tr>
      <tr style="background:#f1f5f9"><td style="padding:9px 8px;color:#64748b;font-weight:600">Qualifications</td><td style="padding:9px 8px;color:#0f172a">${(doctor.qualifications||[]).join(', ') || '—'}</td></tr>
      <tr><td style="padding:9px 0;color:#64748b;font-weight:600">Reg. Number</td><td style="padding:9px 0;color:#0f172a">${doctor.registrationNumber || doctor.medicalCouncilRegistrationNumber || '—'}</td></tr>
      <tr style="background:#f1f5f9"><td style="padding:9px 8px;color:#64748b;font-weight:600">Medical Council</td><td style="padding:9px 8px;color:#0f172a">${doctor.medicalCouncilName || '—'}</td></tr>
      <tr><td style="padding:9px 0;color:#64748b;font-weight:600">Practice Address</td><td style="padding:9px 0;color:#0f172a">${[doctor.practiceAddress, doctor.practiceCity, doctor.practiceState, doctor.practiceZipCode].filter(Boolean).join(', ') || '—'}</td></tr>
    </table>

    <h2 style="margin:28px 0 16px;font-size:15px;color:#0f172a;border-bottom:1px solid #e2e8f0;padding-bottom:12px">Submitted Documents</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px">${docRows || '<tr><td colspan="2" style="color:#94a3b8;padding:8px 0">No documents uploaded</td></tr>'}</table>

    <h2 style="margin:28px 0 16px;font-size:15px;color:#0f172a;border-bottom:1px solid #e2e8f0;padding-bottom:12px">Agreement</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr><td style="padding:9px 0;color:#64748b;font-weight:600;width:170px">Agreement ID</td><td style="padding:9px 0;color:#0f172a">${agreementId}</td></tr>
      <tr style="background:#f1f5f9"><td style="padding:9px 8px;color:#64748b;font-weight:600">Signed At</td><td style="padding:9px 8px;color:#0f172a">${signedAt}</td></tr>
      <tr><td style="padding:9px 0;color:#64748b;font-weight:600">Parties</td><td style="padding:9px 0;color:#0f172a">Mayden SmartHealth Pvt Ltd ↔ ${doctorName}</td></tr>
      ${attachments.length > 0 ? '<tr style="background:#f1f5f9"><td style="padding:9px 8px;color:#64748b;font-weight:600">PDF Agreement</td><td style="padding:9px 8px;color:#059669;font-weight:600">✅ Attached to this email</td></tr>' : ''}
    </table>

    <div style="margin-top:28px;background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:12px;padding:18px 22px">
      <p style="margin:0;font-size:13px;color:#1e40af;font-weight:700">⏳ Action Required</p>
      <p style="margin:8px 0 0;font-size:13px;color:#1d4ed8;line-height:1.6">
        This doctor account is <strong>pending manual activation</strong>. Log in to the team portal and go to
        <strong>Doctor Management</strong> to review documents and activate or reject this registration.
      </p>
    </div>
  </td></tr>
  <tr><td style="padding:16px 40px;border-top:1px solid #e2e8f0;text-align:center">
    <p style="margin:0;font-size:11px;color:#94a3b8">Mediczy · Mayden SmartHealth Pvt Ltd · support@mediqzy.com</p>
  </td></tr>
</table></td></tr></table>
</body></html>`,
    });
    console.log(`[DoctorReg] Registration alert sent to support@mediqzy.com for ${doctorName}`);
  } catch (mailErr) {
    console.warn('[DoctorReg] Registration alert email failed (non-critical):', mailErr.message);
  }
}

const toPlainDoctor = (doctorInstance) => {
  if (!doctorInstance) return null;
  if (typeof doctorInstance.toJSON === 'function') {
    return doctorInstance.toJSON();
  }
  if (typeof doctorInstance.get === 'function') {
    return doctorInstance.get({ plain: true });
  }
  return doctorInstance;
};

export async function registerDoctor(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;

    // Check if doctor already exists using Sequelize
    const existingDoctor = await doctorModel.findOne({ where: { email } });
    if (existingDoctor) {
      return res.status(409).json({ message: "Email already exists" });
    }

    // Create doctor (password will be hashed automatically by beforeCreate hook)
    // isVerified defaults to false — manual activation required
    const newDoctor = await doctorModel.create({ ...req.body, isVerified: false });

    // Send registration alert to support (fire-and-forget)
    const docsPayload = req.body.documents || {};
    sendDoctorRegistrationAlert(newDoctor, docsPayload);
    // Send confirmation email with signed agreement to the doctor (fire-and-forget)
    sendDoctorConfirmationEmail(newDoctor, docsPayload);

    // Mirror doctor profile into intelligent DB (fire-and-forget)
    (async () => {
      try {
        const payload = {
          id: newDoctor.id,
          prefix: newDoctor.prefix,
          firstName: newDoctor.firstName,
          lastName: newDoctor.lastName,
          email: newDoctor.email,
          phoneNumber: newDoctor.phoneNumber,
          specialization: newDoctor.specialization,
          experience: newDoctor.experience,
          isVerified: newDoctor.isVerified,
          createdAt: newDoctor.createdAt,
          updatedAt: newDoctor.updatedAt
        };
        await intelligentDb.ingest("doctors_v1", payload);
      } catch (err) {
        console.error("Intelligent DB ingest (doctor) failed:", err.message || err);
      }
    })();

    // Return WITHOUT auth token — account needs manual activation by team
    return res.status(201).json({
      message: "Registration submitted successfully. Your application is under review. You will receive an email once your account is activated.",
      pendingActivation: true,
      doctor: {
        id: newDoctor.id,
        prefix: newDoctor.prefix,
        firstName: newDoctor.firstName,
        lastName: newDoctor.lastName,
        email: newDoctor.email,
        specialization: newDoctor.specialization,
        experience: newDoctor.experience,
        phoneNumber: newDoctor.phoneNumber
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function signInDoctor(req, res) {
  console.log('💚 [signInDoctor] Function called');
  try {
    // Validate request input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('💚 [signInDoctor] Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    const normalizedEmail = String(email || '').toLowerCase();
    console.log('💚 [signInDoctor] Email:', normalizedEmail);
    console.log('💚 [signInDoctor] doctorModel type:', typeof doctorModel);

    // Check if doctor exists using Sequelize
    console.log('💚 [signInDoctor] About to query database...');
    let doctor;
    try {
      doctor = await doctorModel.findOne({ where: { email: normalizedEmail } });
      console.log('💚 [signInDoctor] Query completed');
    } catch (queryError) {
      console.error('❌ [signInDoctor] Database query error:', queryError);
      console.error('❌ [signInDoctor] Query error message:', queryError.message);
      console.error('❌ [signInDoctor] Query error stack:', queryError.stack);
      throw queryError; // Re-throw to outer catch
    }

    console.log('💚 [signInDoctor] Doctor found:', !!doctor);
    console.log('💚 [signInDoctor] Doctor object keys:', doctor ? Object.keys(doctor.dataValues || doctor) : 'null');

    if (!doctor) {
      console.log('💚 [signInDoctor] No doctor found, returning 401');
      await auditLoginAttempt(req, null, normalizedEmail, false, 'Doctor not found');
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // CROSS-ROLE GUARD: Prevent patient/user accounts from using doctor login endpoint
    // This provides server-side validation in addition to client-side routing
    // Allow users with role='doctor' to proceed (they may have accounts in both tables)
    const userRecord = await User.findOne({
      where: sequelizeWhere(fn("lower", col("email")), normalizedEmail),
      attributes: ["id", "isAdmin", "role"]
    });
    
    if (userRecord && userRecord.role !== 'doctor' && !userRecord.isAdmin) {
      console.log('💚 [signInDoctor] User/patient account found, blocking doctor login');
      await auditLoginAttempt(req, userRecord.id, normalizedEmail, false, 'Patient/user attempted doctor login');
      return res.status(403).json({ 
        message: "Please use the patient login portal" 
      });
    }

    console.log('💚 [signInDoctor] About to compare password...');
    // Validate password
    try {
      const isPasswordValid = await doctor.comparePassword(password);
      console.log('💚 [signInDoctor] Password valid:', isPasswordValid);

      if (!isPasswordValid) {
        await auditLoginAttempt(req, doctor.id, normalizedEmail, false, 'Invalid password');
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // ── Manual activation gate ─────────────────────────────────────────────
      if (!doctor.isVerified) {
        await auditLoginAttempt(req, doctor.id, normalizedEmail, false, 'Account pending activation');
        return res.status(403).json({
          message: "Your registration is under review. Our team will activate your account after document verification. Please check your email for updates.",
          pendingActivation: true,
        });
      }

      console.log('💚 [signInDoctor] About to generate token...');
      // Generate authentication token
      const token = doctor.generateAuthToken();
      console.log('💚 [signInDoctor] Token generated successfully');

      // Update online status
      await doctor.update({
        isOnline: true,
        lastLoginAt: new Date(),
        lastActivityAt: new Date()
      });

      // Respond with doctor data & token
      await auditLoginAttempt(req, doctor.id, normalizedEmail, true);
      return res.status(200).json({
        message: "Login successful",
        token,
        doctor: {
          id: doctor.id,
          firstName: doctor.firstName,
          lastName: doctor.lastName,
          email: doctor.email,
          specialization: doctor.specialization,
          experience: doctor.experience,
          isOnline: doctor.isOnline,
          lastActive: doctor.lastActivityAt || doctor.lastLoginAt || null
        },
      });
    } catch (passwordError) {
      console.error("❌ Password comparison error:", passwordError);
      console.error("❌ Error stack:", passwordError.stack);
      return res.status(401).json({ message: "Invalid email or password" });
    }
  } catch (error) {
    console.error("❌ LOGIN ERROR:", error);
    console.error("❌ Error message:", error.message);
    console.error("❌ Error stack:", error.stack);
    console.error("❌ Error name:", error.name);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

export const getDoctorProfile = async (req, res) => {
  try {
    console.log('=== getDoctorProfile CALLED ===');
    console.log('req.doctor exists:', !!req.doctor);
    
    if (!req.doctor) {
      console.log('=== No doctor found, returning 404 ===');
      return res.status(404).json({ 
        success: false,
        message: "Doctor not found" 
      });
    }

    const doctorResponse = toPlainDoctor(req.doctor);
    if (doctorResponse && doctorResponse.password) {
      delete doctorResponse.password;
    }

    console.log('=== Sending response with structure: {success: true, doctor: {...}} ===');
    console.log('Doctor has service fields:', {
      offersSecondOpinion: doctorResponse.offersSecondOpinion,
      secondOpinionFee: doctorResponse.secondOpinionFee
    });

    return res.status(200).json({
      success: true,
      doctor: doctorResponse
    });
  } catch (error) {
    console.error("Profile retrieval error:", error);
    return res.status(500).json({ 
      success: false,
      message: "Internal Server Error" 
    });
  }
};

export const updateDoctorStatus = async (req, res) => {
  try {
    let doctorId = req.doctor?.id || req.doctor?._id || null;

    // Backward-compatible fallback for any legacy callers not using authDoctor
    if (!doctorId) {
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized. No token provided.",
        });
      }
      const decoded = jwt.verify(token, JWT_CONFIG.SECRET);
      if (decoded?.role !== "doctor") {
        return res.status(403).json({
          success: false,
          message: "Access denied. Doctor role required.",
        });
      }
      doctorId = decoded.id || decoded._id;
    }

    // Extract status from request
    const { isOnline } = req.body;

    if (typeof isOnline !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be a boolean value.",
      });
    }

    const doctor = await doctorModel.findByPk(doctorId);

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    await doctor.update({
      isOnline,
      lastActive: new Date(),
      updatedAt: new Date(),
    });

    const updatedUser = toPlainDoctor(doctor);
    if (updatedUser && updatedUser.password) {
      delete updatedUser.password;
    }

    res.status(200).json({
      success: true,
      message: `Status updated to ${isOnline ? "online" : "offline"}.`,
      data: {
        isOnline: updatedUser.isOnline,
        lastActive: updatedUser.lastActive,
      },
    });
  } catch (error) {
    console.error("Error updating status:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating status.",
      error: error.message,
    });
  }
};

export const getAvailableDoctors = async (req, res) => {
  try {
    const { specialization, isOnline } = req.query;

    // Build the query object
    const query = {};

    // Add online status to query if provided
    if (isOnline !== undefined) {
      // Convert string to boolean
      query.isOnline = isOnline === "true";
    }

    // Add specialization to query if provided
    if (specialization) {
      query.specialization = specialization;
    }

    // Find doctors matching the criteria using Sequelize
    const doctors = await doctorModel.findAll({
      where: query,
      attributes: [
        'id',
        'prefix',
        'firstName',
        'lastName',
        'specialization',
        'qualification',
        'experience',
        'phoneNumber',
        'email',
        'isOnline',
        'isVerified',
        'status',
        'profileImage',
        'languages',
        'rating',
        'totalReviews',
        'consultationFees',
        'onlineConsultationFee',
        'inPersonConsultationFee',
        'clinicAddress',
        'clinicAddress_json',
        'weeklySchedule',
        'availableSlots',
        'reviews',
        'servicesOffered',
        'totalAppointments',
        'feeStructure',
        'slotDuration',
        'registrationNumber'
      ],
      order: [
        ['isOnline', 'DESC'],
        ['rating', 'DESC'],
        ['experience', 'DESC']
      ]
    });

    res.status(200).json({
      success: true,
      count: doctors.length,
      data: doctors,
    });
  } catch (error) {
    console.error("Error finding doctors:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching doctors",
      error: error.message,
    });
  }
};
