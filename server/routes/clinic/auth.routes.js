import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { Sequelize } from 'sequelize';
import nodemailer from 'nodemailer';
import twilio from 'twilio';
import { JWT_CONFIG } from '../../config/auth.config.js';
import { authLimiter } from '../../middleware/rateLimiter.middleware.js';
import { auditLoginAttempt } from '../../middleware/audit.middleware.js';
import Hospital from '../../models/hospital.model.intelligent.js';
import OTP from '../../models/otp.model.intelligent.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  }
});

const router = express.Router();
const JWT_SECRET = JWT_CONFIG.SECRET;

// Database connection
const sequelize = new Sequelize(
  process.env.POSTGRES_DATABASE || 'mediczy_ai',
  process.env.POSTGRES_USER || 'mediczy_helper',
  process.env.POSTGRES_PASSWORD || 'Mediczy2024Helper',
  {
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    dialect: 'postgres',
    logging: false
  }
);

// Clinic Login - Now using database
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('🏥 Clinic login attempt:', { email });

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Query hospital/clinic from database
    const clinics = await sequelize.query(
      `SELECT id, hospital_name, email, password, phone_number, city, state,
              registration_number, total_beds, available_beds, specializations,
              facilities, metadata, status, is_verified
       FROM hospitals 
       WHERE email = :email 
       LIMIT 1`,
      {
        replacements: { email },
        type: Sequelize.QueryTypes.SELECT
      }
    );

    if (!clinics || clinics.length === 0) {
      console.warn('⚠️ Clinic not found:', email);
      await auditLoginAttempt(req, null, email, false, 'Clinic not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials or clinic not found'
      });
    }

    const clinic = clinics[0];

    if (!clinic.password) {
      console.error('❌ Clinic has no password hash:', clinic.id);
      return res.status(500).json({
        success: false,
        message: 'Account configuration error. Please contact support.'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, clinic.password);
    if (!isPasswordValid) {
      await auditLoginAttempt(req, clinic.id, email, false, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if clinic is pending approval
    if (clinic.status === 'pending') {
      await auditLoginAttempt(req, clinic.id, email, false, 'Clinic pending approval');
      return res.status(403).json({
        success: false,
        pending: true,
        message: 'Your account is under review by our team. You will receive an email once approved.'
      });
    }
    // Check if clinic is active
    if (clinic.status !== 'active') {
      await auditLoginAttempt(req, clinic.id, email, false, 'Clinic inactive');
      return res.status(403).json({
        success: false,
        message: 'Account is inactive. Please contact support.'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: clinic.id,
        email: clinic.email,
        type: 'clinic',
        name: clinic.hospital_name,
        userType: 'clinic',
        role: 'clinic'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('✅ Clinic login successful:', clinic.hospital_name);

    await auditLoginAttempt(req, clinic.id, email, true);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      clinic: {
        id: clinic.id,
        name: clinic.hospital_name,
        email: clinic.email,
        phone: clinic.phone_number,
        registrationNumber: clinic.registration_number,
        clinicType: clinic.metadata?.clinicType || 'General',
        numberOfRooms: clinic.metadata?.numberOfRooms || 0,
        city: clinic.city,
        state: clinic.state,
        totalBeds: clinic.total_beds,
        availableBeds: clinic.available_beds,
        specializations: clinic.specializations || [],
        facilities: clinic.facilities || [],
        isVerified: clinic.is_verified
      }
    });
  } catch (error) {
    console.error('❌ Clinic login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
});

// Verify Token
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    res.json({
      success: true,
      clinic: decoded
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
});

// Logout
router.post('/logout', (req, res) => {
  res.json({
    success: true,
    message: 'Logout successful'
  });
});

/**
 * POST /api/clinic/register
 * Register a new clinic
 */
router.post('/register', authLimiter, upload.array('documents', 5), async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      confirmPassword,
      phone,
      clinicType = 'general',
      address,
      city,
      state,
      registrationNumber
    } = req.body;

    if (!name || !email || !password || !phone || !city) {
      return res.status(400).json({ success: false, message: 'Name, email, password, phone, and city are required' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }

    const existing = await Hospital.findOne({ where: { email: email.toLowerCase() } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    // Upload registration documents to MinIO (optional — graceful fallback)
    const registrationDocs = [];
    if (req.files?.length > 0) {
      for (const file of req.files) {
        try {
          const { uploadToMinio } = await import('../../services/minio-upload.service.js');
          const result = await uploadToMinio({ buffer: file.buffer, originalName: file.originalname, mimeType: file.mimetype, keyPrefix: 'registrations/clinic' });
          if (result.success) registrationDocs.push({ name: file.originalname, url: result.url, key: result.key, size: file.size, uploadedAt: new Date() });
        } catch (e) { console.warn('Clinic doc upload skipped:', e.message); }
      }
    }

    const clinic = await Hospital.create({
      hospitalName: name,
      email: email.toLowerCase(),
      password,
      phoneNumber: phone,
      city,
      state: state || '',
      address: address || '',
      registrationNumber: registrationNumber || null,
      metadata: { clinicType, registeredAs: 'clinic', registrationDocs, submittedAt: new Date() },
      status: 'pending',
      isVerified: false
    });

    res.status(201).json({
      success: true,
      message: 'Application submitted. Our team will review and activate your account within 24–48 hours.',
      registrationId: clinic.id,
      entityType: 'clinic'
    });

    // ── Fire-and-forget: notify admin of new clinic lead ─────────────────
    try {
      const smtpPort = parseInt(process.env.SMTP_PORT) || 587;
      const adminTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: (process.env.SMTP_USER || '').trim(),
          pass: (process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '').trim()
        }
      });
      const submittedAt = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
      await adminTransporter.sendMail({
        from: `"Mediczy Leads" <${process.env.SMTP_USER || 'support@mediqzy.com'}>`,
        to: 'info@mysmarthealth.in',
        subject: `🏥 New Clinic Lead: ${name} — ${city || 'India'}`,
        html: `
          <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
            <div style="background:linear-gradient(135deg,#0d9488,#0891b2);padding:28px 32px">
              <h1 style="margin:0;color:#fff;font-size:20px;font-weight:800;letter-spacing:-0.3px">🏥 New Clinic Registration Lead</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:13px">Received on ${submittedAt} IST</p>
            </div>
            <div style="padding:28px 32px">
              <table style="width:100%;border-collapse:collapse;font-size:14px">
                <tr><td style="padding:10px 0;color:#64748b;font-weight:600;width:160px">Clinic Name</td><td style="padding:10px 0;color:#0f172a;font-weight:700">${name}</td></tr>
                <tr style="background:#f1f5f9;border-radius:6px"><td style="padding:10px 8px;color:#64748b;font-weight:600">Email</td><td style="padding:10px 8px;color:#0f172a"><a href="mailto:${email}" style="color:#0d9488;text-decoration:none">${email}</a></td></tr>
                <tr><td style="padding:10px 0;color:#64748b;font-weight:600">Phone</td><td style="padding:10px 0;color:#0f172a">+91 ${phone}</td></tr>
                <tr style="background:#f1f5f9"><td style="padding:10px 8px;color:#64748b;font-weight:600">Clinic Type</td><td style="padding:10px 8px;color:#0f172a">${clinicType}</td></tr>
                <tr><td style="padding:10px 0;color:#64748b;font-weight:600">City</td><td style="padding:10px 0;color:#0f172a">${city}${state ? ', ' + state : ''}</td></tr>
                ${registrationNumber ? `<tr style="background:#f1f5f9"><td style="padding:10px 8px;color:#64748b;font-weight:600">Reg. Number</td><td style="padding:10px 8px;color:#0f172a">${registrationNumber}</td></tr>` : ''}
                <tr><td style="padding:10px 0;color:#64748b;font-weight:600">Documents</td><td style="padding:10px 0;color:#0f172a">${registrationDocs.length} file(s) uploaded</td></tr>
              </table>
              <div style="margin-top:24px;padding:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px">
                <p style="margin:0;font-size:13px;color:#166534">✅ Registration ID: <strong>${clinic.id}</strong> — Status: <strong>Pending Review</strong></p>
              </div>
              <div style="margin-top:20px;text-align:center">
                <a href="https://mediqzy.com/super-admin/clinics" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#0d9488,#0891b2);color:#fff;font-weight:700;font-size:13px;border-radius:8px;text-decoration:none">View in Admin Panel →</a>
              </div>
            </div>
            <div style="padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center">
              <p style="margin:0;font-size:11px;color:#94a3b8">Mediczy · support@mediqzy.com · Bengaluru, India</p>
            </div>
          </div>
        `,
        text: `New Clinic Lead\n\nClinic: ${name}\nEmail: ${email}\nPhone: +91 ${phone}\nType: ${clinicType}\nCity: ${city}${state ? ', ' + state : ''}\nRegistration ID: ${clinic.id}\nSubmitted: ${submittedAt} IST`
      });
      console.log(`Admin lead notification sent for clinic: ${name} (${email})`);
    } catch (mailErr) {
      console.warn('Admin lead email failed (non-critical):', mailErr.message);
    }
  } catch (error) {
    console.error('Clinic registration error:', error);
    res.status(500).json({ success: false, message: 'Registration failed', error: error.message });
  }
});

// ─── OTP: Send Email OTP for registration ───────────────────────────────────
router.post('/send-email-otp', authLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, message: 'Valid email required' });
  }
  try {
    const otp = await OTP.generate({ email, purpose: 'registration', expiryMinutes: 10 });

    // Send email
    const port = parseInt(process.env.SMTP_PORT) || 587;
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port,
      secure: port === 465,
      auth: {
        user: (process.env.SMTP_USER || '').trim(),
        pass: (process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '').trim()
      }
    });

    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#07101f;color:#e2e8f0;border-radius:16px;overflow:hidden">
        <div style="background:linear-gradient(135deg,#0d9488,#0891b2);padding:28px 32px">
          <h1 style="margin:0;color:#fff;font-size:22px;font-weight:800">Mediczy Clinic Portal</h1>
          <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:14px">Email Verification</p>
        </div>
        <div style="padding:32px">
          <p style="margin:0 0 24px;color:#94a3b8;font-size:14px">Use the OTP below to verify your email address for clinic registration.</p>
          <div style="background:rgba(13,148,136,0.15);border:1px solid rgba(13,148,136,0.3);border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
            <p style="margin:0 0 8px;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:2px">Your OTP</p>
            <p style="margin:0;font-size:40px;font-weight:900;letter-spacing:12px;color:#2dd4bf">${otp.code}</p>
          </div>
          <p style="margin:0;color:#64748b;font-size:12px;text-align:center">This OTP expires in 10 minutes. Do not share it with anyone.</p>
        </div>
      </div>`;

    await transporter.sendMail({
      from: `"Mediczy" <${process.env.SMTP_USER || 'noreply@mediczy.com'}>`,
      to: email,
      subject: `${otp.code} — Your Mediczy Email Verification OTP`,
      html
    });

    res.json({ success: true, message: 'OTP sent to your email address' });
  } catch (err) {
    console.error('Clinic email OTP error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to send OTP. Please try again.' });
  }
});

// ─── OTP: Verify Email OTP ───────────────────────────────────────────────────
router.post('/verify-email-otp', async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ success: false, message: 'Email and code required' });
  try {
    const result = await OTP.verify({ email, code, purpose: 'registration' });
    if (result.success) return res.json({ success: true, message: 'Email verified successfully' });
    return res.status(400).json({ success: false, message: result.message || 'Invalid or expired OTP' });
  } catch (err) {
    console.error('Clinic email OTP verify error:', err.message);
    res.status(500).json({ success: false, message: 'Verification failed' });
  }
});

// ─── OTP: Send Phone OTP via WhatsApp ────────────────────────────────────────
router.post('/send-phone-otp', authLimiter, async (req, res) => {
  let { phone } = req.body;
  if (!phone) return res.status(400).json({ success: false, message: 'Phone number required' });

  // Normalize phone to E.164
  phone = phone.replace(/\s+/g, '');
  if (!phone.startsWith('+')) phone = `+91${phone.replace(/^0/, '')}`;

  try {
    const otp = await OTP.generate({ phone, purpose: 'registration', expiryMinutes: 10 });

    // Try WhatsApp via Twilio
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const whatsappFrom = process.env.TWILIO_WHATSAPP_NUMBER;

    if (accountSid && authToken && whatsappFrom) {
      const client = twilio(accountSid, authToken);
      await client.messages.create({
        from: whatsappFrom,
        to: `whatsapp:${phone}`,
        contentSid: 'HX33ae0014bd63fad4404789d2373b6174',
        contentVariables: JSON.stringify({ 1: otp.code })
      });
      console.log(`✅ Clinic registration WhatsApp OTP → ${phone}`);
    } else {
      console.warn('⚠️  Twilio not configured — OTP generated but not sent via WhatsApp');
    }

    res.json({ success: true, message: 'OTP sent via WhatsApp', phone });
  } catch (err) {
    console.error('Clinic phone OTP error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to send OTP. Please verify your phone number.' });
  }
});

// ─── OTP: Verify Phone OTP ───────────────────────────────────────────────────
router.post('/verify-phone-otp', async (req, res) => {
  let { phone, code } = req.body;
  if (!phone || !code) return res.status(400).json({ success: false, message: 'Phone and code required' });
  phone = phone.replace(/\s+/g, '');
  if (!phone.startsWith('+')) phone = `+91${phone.replace(/^0/, '')}`;
  try {
    const result = await OTP.verify({ phone, code, purpose: 'registration' });
    if (result.success) return res.json({ success: true, message: 'Phone verified successfully' });
    return res.status(400).json({ success: false, message: result.message || 'Invalid or expired OTP' });
  } catch (err) {
    console.error('Clinic phone OTP verify error:', err.message);
    res.status(500).json({ success: false, message: 'Verification failed' });
  }
});

export default router;
