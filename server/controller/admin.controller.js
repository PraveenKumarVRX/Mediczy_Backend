import userModel from '../models/user.model.intelligent.js';
import doctorModel from '../models/doctor.model.intelligent.js';
import Lab from '../models/lab.model.mariadb.js';
import Pharmacy from '../models/pharmacy.model.mariadb.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { sequelize } from '../db/mariadb.js';
import { QueryTypes } from 'sequelize';

// Production-level rate limiting store (would be Redis in production cluster)
const loginAttempts = new Map();

// Security configuration
const SECURITY_CONFIG = {
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION: 15 * 60 * 1000, // 15 minutes
  PASSWORD_MIN_LENGTH: 8,
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
};

// Helper function for rate limiting
const checkRateLimit = (clientIP) => {
  const now = Date.now();
  const attempts = loginAttempts.get(clientIP) || { count: 0, lastAttempt: now, locked: false };
  
  // Reset if lockout period expired
  if (attempts.locked && (now - attempts.lastAttempt) > SECURITY_CONFIG.LOCKOUT_DURATION) {
    attempts.locked = false;
    attempts.count = 0;
  }
  
  if (attempts.locked) {
    const remainingTime = Math.ceil((SECURITY_CONFIG.LOCKOUT_DURATION - (now - attempts.lastAttempt)) / 1000 / 60);
    throw new Error(`Too many failed login attempts. Try again in ${remainingTime} minutes.`);
  }
  
  return attempts;
};

// Helper function to log failed attempts
const logFailedAttempt = (clientIP, email, reason) => {
  const now = Date.now();
  const attempts = loginAttempts.get(clientIP) || { count: 0, lastAttempt: now, locked: false };
  attempts.count += 1;
  attempts.lastAttempt = now;
  
  if (attempts.count >= SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS) {
    attempts.locked = true;
    console.warn(`SECURITY ALERT: IP ${clientIP} locked out after ${attempts.count} failed login attempts for email: ${email}`);
  }
  
  loginAttempts.set(clientIP, attempts);
  console.warn(`Failed admin login attempt ${attempts.count}/${SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS} from IP: ${clientIP}, Email: ${email}, Reason: ${reason}`);
};

export const adminLogin = async (req, res) => {
  const { email, password } = req.body;
  const clientIP = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';
  
  // Enhanced input validation
  if (!email || !password) {
    logFailedAttempt(clientIP, email || 'missing', 'Missing credentials');
    return res.status(400).json({ 
      success: false,
      message: 'Email and password are required',
      code: 'MISSING_CREDENTIALS'
    });
  }

  // Email format validation
  if (!SECURITY_CONFIG.EMAIL_REGEX.test(email)) {
    logFailedAttempt(clientIP, email, 'Invalid email format');
    return res.status(400).json({ 
      success: false,
      message: 'Invalid email format',
      code: 'INVALID_EMAIL'
    });
  }

  // Password length validation
  if (password.length < SECURITY_CONFIG.PASSWORD_MIN_LENGTH) {
    logFailedAttempt(clientIP, email, 'Password too short');
    return res.status(400).json({ 
      success: false,
      message: 'Invalid credentials',
      code: 'INVALID_CREDENTIALS'
    });
  }
  
  try {
    // Check rate limiting
    checkRateLimit(clientIP);
    
    console.log(`🔐 Admin login attempt - IP: ${clientIP}, Email: ${email.substring(0, 3)}***`);
    
    // Production authentication - check database first using raw query
    const users = await sequelize.query(
      'SELECT * FROM users WHERE email = ? AND isAdmin = 1 LIMIT 1',
      { 
        replacements: [email.toLowerCase()],
        type: QueryTypes.SELECT
      }
    );
    
    const adminUser = users[0];
    
    if (adminUser && await bcrypt.compare(password, adminUser.password)) {
      // Update last login
      await sequelize.query(
        'UPDATE users SET lastLogin = NOW() WHERE id = ?',
        { 
          replacements: [adminUser.id],
          type: QueryTypes.UPDATE
        }
      );
      
      const token = jwt.sign(
        { 
          id: adminUser.id, 
          email: adminUser.email, 
          role: 'admin',
          isAdmin: true,
          loginTime: new Date().toISOString()
        },
        process.env.JWT_SECRET || 'MediczYJWTK3yS3cur3AndStr0ng2024!',
        { expiresIn: '8h' }
      );
      
      // Clear any failed attempts on successful login
      loginAttempts.delete(clientIP);
      
      // Security audit log
      console.log(`✅ Admin login successful - ID: ${adminUser.id}, Email: ${adminUser.email}, IP: ${clientIP}`);
      
      return res.json({ 
        success: true,
        message: 'Admin login successful', 
        token,
        user: { 
          id: adminUser.id, 
          email: adminUser.email, 
          firstName: adminUser.firstName,
          lastName: adminUser.lastName,
          role: 'admin',
          isAdmin: true,
          lastLogin: adminUser.lastLogin
        } 
      });
    }
    
    // Failed login attempt
    logFailedAttempt(clientIP, email, 'Invalid credentials');
    console.warn(`❌ Failed admin login - Email: ${email}, IP: ${clientIP}, UA: ${userAgent}`);
    return res.status(401).json({ message: 'Invalid credentials' });
  } catch (e) {
    console.error('Admin login error:', e);
    return res.status(500).json({ message: 'Internal server error. Please try again later.' });
  }
};

// Validate current admin and return minimal profile
export const adminProfile = async (req, res) => {
  try {
    // req.user is populated by authUser middleware
    if (!req.user || !req.user.isAdmin) {
      const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
      console.warn(`Unauthorized admin profile access attempt from IP: ${clientIP}`);
      return res.status(403).json({ message: 'Forbidden: not an admin' });
    }
    
    // Log profile access for security audit
    console.log(`Admin profile accessed - ID: ${req.user.id}, Email: ${req.user.email}, IP: ${req.ip}`);
    
    // Set security headers
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block'
    });
    
    return res.json({
      id: req.user.id,
      email: req.user.email,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      role: 'admin'
    });
  } catch (e) {
    console.error('Admin profile error:', e);
    return res.status(500).json({ message: 'Failed to fetch admin profile', error: e.message });
  }
};

// Utility to normalize array input
const ensureArray = (data) => Array.isArray(data) ? data : [data];

const normalizeObjectField = (value) => {
  if (value === null || value === undefined) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (error) {
      return {};
    }
  }
  return typeof value === 'object' ? value : {};
};

const normalizeArrayField = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }
  return [];
};

export const bulkUploadDoctors = async (req, res) => {
  try {
    const records = ensureArray(req.body.doctors || []);
    if (!records.length) return res.status(400).json({ message: 'No doctor data provided' });
    const created = [];
    for (const d of records) {
      // Minimal required fields with fallbacks
      if (!d.email || !d.firstName || !d.lastName) continue;
      const exists = await doctorModel.findOne({ where: { email: d.email } });
      if (exists) continue;
      const password = d.password || Math.random().toString(36).slice(-8);
      const doctor = await doctorModel.create({
        firstName: d.firstName,
        lastName: d.lastName,
        email: d.email,
        password,
        phoneNumber: d.phoneNumber || '',
        specialization: d.specialization || 'General Practitioner',
        experience: d.experience || 0,
        registrationNumber: d.registrationNumber || null,
        clinicAddress: d.clinicAddress ? (typeof d.clinicAddress === 'string' ? d.clinicAddress : JSON.stringify(d.clinicAddress)) : null,
        consultationFees: d.consultationFees || null,
        availableSlots: d.availableSlots ? (typeof d.availableSlots === 'string' ? d.availableSlots : JSON.stringify(d.availableSlots)) : null,
        expertise: d.expertise ? (typeof d.expertise === 'string' ? d.expertise : JSON.stringify(d.expertise)) : null,
        languages: d.languages ? (typeof d.languages === 'string' ? d.languages : JSON.stringify(d.languages)) : null,
        about: d.about || '',
        awards: d.awards ? (typeof d.awards === 'string' ? d.awards : JSON.stringify(d.awards)) : null,
        publications: d.publications ? (typeof d.publications === 'string' ? d.publications : JSON.stringify(d.publications)) : null
      });
      created.push({ id: doctor.id, email: doctor.email });
    }
    return res.json({ message: 'Doctors uploaded', count: created.length, created });
  } catch (e) {
    return res.status(500).json({ message: 'Upload failed', error: e.message });
  }
};

export const bulkUploadLabs = async (req, res) => {
  try {
    const records = ensureArray(req.body.labs || []);
    if (!records.length) return res.status(400).json({ message: 'No lab data provided' });
    
    const created = [];
    for (const l of records) {
      if (!l.email || !l.name) continue;
      
      const exists = await Lab.findOne({ where: { email: l.email } });
      if (exists) continue;
      
      const lab = await Lab.create({
        name: l.name,
        email: l.email,
        phoneNumber: l.phoneNumber || '',
        address: normalizeObjectField(l.address),
        services: normalizeArrayField(l.services),
        accreditation: l.accreditation || null,
        isActive: l.isActive !== undefined ? l.isActive : true
      });
      created.push({ id: lab.id, email: lab.email });
    }
    return res.json({ message: 'Labs uploaded', count: created.length, created });
  } catch (e) {
    console.error('Lab upload error:', e);
    return res.status(500).json({ message: 'Upload failed', error: e.message });
  }
};

export const bulkUploadPharmacies = async (req, res) => {
  try {
    const records = ensureArray(req.body.pharmacies || []);
    if (!records.length) return res.status(400).json({ message: 'No pharmacy data provided' });
    
    const created = [];
    for (const p of records) {
      if (!p.email || !p.name) continue;
      
      const exists = await Pharmacy.findOne({ where: { email: p.email } });
      if (exists) continue;
      
      const pharmacy = await Pharmacy.create({
        name: p.name,
        email: p.email,
        phoneNumber: p.phoneNumber || '',
        address: normalizeObjectField(p.address),
        services: normalizeArrayField(p.services),
        licenseNumber: p.licenseNumber || null,
        isActive: p.isActive !== undefined ? p.isActive : true
      });
      created.push({ id: pharmacy.id, email: pharmacy.email });
    }
    return res.json({ message: 'Pharmacies uploaded', count: created.length, created });
  } catch (e) {
    console.error('Pharmacy upload error:', e);
    return res.status(500).json({ message: 'Upload failed', error: e.message });
  }
};

export const bulkUploadCorporates = async (req, res) => {
  try {
    return res.status(501).json({ 
      message: 'Corporate management not yet implemented in intelligent database',
      details: 'Corporate model needs to be created in intelligent database adapter'
    });
    
    /* TODO: Implement when Corporate model is available
    const records = ensureArray(req.body.corporates || []);
    if (!records.length) return res.status(400).json({ message: 'No corporate data provided' });
    const created = await Corporate.bulkCreate(records.map(c => ({
      companyName: c.companyName,
      contactPerson: c.contactPerson,
      email: c.email,
      phoneNumber: c.phoneNumber,
      alternatePhone: c.alternatePhone || null,
      industry: c.industry || null,
      employeeCount: c.employeeCount || null,
      gstNumber: c.gstNumber || null,
      panNumber: c.panNumber || null,
      address: c.address || {},
      packageType: c.packageType || 'Standard',
      packageStartDate: c.packageStartDate || null,
      packageEndDate: c.packageEndDate || null,
      packageAmount: c.packageAmount || null,
      services: c.services || [],
      contractDocument: c.contractDocument || null,
      status: c.status || 'Pending',
      leadSource: c.leadSource || null,
      salesRep: c.salesRep || null,
      notes: c.notes || null,
      billingCycle: c.billingCycle || 'Yearly',
      paymentMethod: c.paymentMethod || null,
      isActive: c.isActive !== undefined ? c.isActive : true
    })), { validate: true });
    return res.json({ message: 'Corporates uploaded', count: created.length });
    */
  } catch (e) {
    console.error('Corporate upload error:', e);
    return res.status(500).json({ message: 'Upload failed', error: e.message });
  }
};

// Get dashboard stats

// List all entities with pagination


export const listLabs = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    const { count, rows } = await Lab.findAndCountAll({
      limit: parseInt(limit),
      offset
    });
    
    console.log(`Fetched ${rows.length} labs, page ${page}`);
    return res.json({ 
      success: true,
      total: count, 
      data: rows, 
      page: parseInt(page), 
      limit: parseInt(limit) 
    });
  } catch (e) {
    console.error('List labs error:', e);
    return res.status(500).json({ message: 'Failed to fetch labs', error: e.message });
  }
};

export const listPharmacies = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    const { count, rows } = await Pharmacy.findAndCountAll({
      limit: parseInt(limit),
      offset
    });
    
    console.log(`Fetched ${rows.length} pharmacies, page ${page}`);
    return res.json({ 
      success: true,
      total: count, 
      data: rows, 
      page: parseInt(page), 
      limit: parseInt(limit) 
    });
  } catch (e) {
    console.error('List pharmacies error:', e);
    return res.status(500).json({ message: 'Failed to fetch pharmacies', error: e.message });
  }
};

export const listCorporates = async (req, res) => {
  try {
    return res.status(501).json({ 
      message: 'Corporate management not yet implemented in intelligent database',
      details: 'Corporate model needs to be created in intelligent database adapter'
    });
    
    /* TODO: Implement when Corporate model is available
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const { count, rows } = await Corporate.findAndCountAll({
      limit: parseInt(limit),
      offset,
      order: [['createdAt', 'DESC']]
    });
    return res.json({ total: count, data: rows, page: parseInt(page), limit: parseInt(limit) });
    */
  } catch (e) {
    console.error('List corporates error:', e);
    return res.status(500).json({ message: 'Failed to fetch corporates', error: e.message });
  }
};




// Create single internal user (admin managed)
export const createInternalUser = async (req, res) => {
  try {
    const { firstName, lastName, email, password, phoneNumber, dateOfBirth, gender } = req.body;
    if (!firstName || !lastName || !email || !password || !phoneNumber || !dateOfBirth || !gender) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    const exists = await userModel.findOne({ where: { email } });
    if (exists) return res.status(409).json({ message: 'Email already exists' });
    const user = await userModel.create({
      firstName,
      lastName,
      email,
      password,
      phoneNumber,
      dateOfBirth: new Date(dateOfBirth),
      gender,
      isAdmin: false
    });
    return res.status(201).json({ message: 'User created', user: { id: user.id, email: user.email } });
  } catch (e) {
    return res.status(500).json({ message: 'Failed to create user', error: e.message });
  }
};





export const getDashboardStats = async (req, res) => {
  try {
    // Import mysql for direct database queries
    const mysql = (await import('mysql2/promise')).default;
    const fs = (await import('fs/promises')).default;
    const path = (await import('path')).default;
    const XLSX = (await import('xlsx')).default;
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    // Create database connection pool
    const pool = mysql.createPool({
      host: 'localhost',
      user: process.env.DB_USER || 'mediczy',
      password: process.env.DB_PASSWORD || 'Mediczy2024Secure',
      database: process.env.DB_NAME || 'mediczy',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
    
    // Get users count
    const [usersResult] = await pool.query('SELECT COUNT(*) as count FROM users');
    const userCount = usersResult[0].count;
    
    // Get doctors count from database
    const [doctorsResult] = await pool.query('SELECT COUNT(*) as count FROM doctors');
    const doctorCountDB = doctorsResult[0].count;
    
    // Get nurses count
    const [nursesResult] = await pool.query('SELECT COUNT(*) as count FROM nurses');
    const nursesCount = nursesResult[0].count;
    
    // Get active users count
    const [activeUsersResult] = await pool.query('SELECT COUNT(*) as count FROM users WHERE isActive = 1');
    const activeUsersCount = activeUsersResult[0].count;
    
    // Get admin users count
    const [adminUsersResult] = await pool.query('SELECT COUNT(*) as count FROM users WHERE isAdmin = 1');
    const adminUsersCount = adminUsersResult[0].count;

    // Get recent users (last 5 created)
    const [recentUsers] = await pool.query(`
      SELECT id, firstName, lastName, email, createdAt 
      FROM users 
      ORDER BY createdAt DESC 
      LIMIT 5
    `);

    // Get recent doctors (last 5 created)
    const [recentDoctors] = await pool.query(`
      SELECT id, firstName, lastName, email, specialization, createdAt 
      FROM doctors 
      ORDER BY createdAt DESC 
      LIMIT 5
    `);
    
    // Get masterdata counts from files
    const PROVIDERS_BASE = '/tmp/rag_cache/all_providers';
    const LABS_BASE = '/tmp/rag_cache/profiles_enhanced';
    
    let hospitalCount = 0;
    let labCount = 0;
    let clinicCount = 0;
    let pharmacyCount = 0;
    let corporateCount = 0;
    let doctorCountMaster = 0;
    
    try {
      const [hospitalFiles, labFiles, clinicFiles, pharmacyFiles, corporateFiles] = await Promise.all([
        fs.readdir(path.join(PROVIDERS_BASE, 'hospitals')).catch(() => []),
        fs.readdir(LABS_BASE).catch(() => []),
        fs.readdir(path.join(PROVIDERS_BASE, 'clinics')).catch(() => []),
        fs.readdir(path.join(PROVIDERS_BASE, 'pharmacies')).catch(() => []),
        fs.readdir(path.join(PROVIDERS_BASE, 'corporates')).catch(() => [])
      ]);
      
      hospitalCount = hospitalFiles.length;
      labCount = labFiles.length;
      clinicCount = clinicFiles.length;
      pharmacyCount = pharmacyFiles.length;
      corporateCount = corporateFiles.length;
      
      // Get doctors count from Excel
      const doctorsFile = path.join(__dirname, '..', 'db', 'Master Data', 'Doctors Data', 'Doctors List 624.xlsx');
      const workbook = XLSX.readFile(doctorsFile);
      const sheetName = workbook.SheetNames[0];
      const doctors = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
      doctorCountMaster = doctors.length;
    } catch (error) {
      console.error('Error reading masterdata counts:', error);
    }

    const stats = {
      users: userCount,
      activeUsers: activeUsersCount,
      adminUsers: adminUsersCount,
      doctors: doctorCountDB + doctorCountMaster, // Combine DB and masterdata doctors
      nurses: nursesCount,
      labs: labCount,
      clinics: clinicCount,
      pharmacies: pharmacyCount,
      hospitals: hospitalCount,
      corporates: corporateCount
    };

    console.log('Dashboard stats generated successfully:', stats);
    
    // Close the pool
    await pool.end();
    
    return res.json({ 
      success: true,
      stats, 
      recentUsers,
      recentDoctors
    });
  } catch (e) {
    console.error('Failed to fetch dashboard stats:', e);
    return res.status(500).json({ 
      success: false,
      message: "Failed to fetch dashboard stats", 
      error: e.message 
    });
  }
};

export const listUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    const { count, rows } = await userModel.findAndCountAll({
      attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'createdAt'],
      limit: parseInt(limit),
      offset,
      order: [['createdAt', 'DESC']]
    });
    
    console.log(`Fetched ${rows.length} users, page ${page}`);
    return res.json({ 
      total: count, 
      data: rows, 
      page: parseInt(page), 
      limit: parseInt(limit) 
    });
  } catch (e) {
    console.error('Failed to fetch users:', e);
    return res.status(500).json({ message: "Failed to fetch users", error: e.message });
  }
};

export const listDoctors = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    const { count, rows } = await doctorModel.findAndCountAll({
      attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'specialization', 'experience', 'createdAt'],
      limit: parseInt(limit),
      offset,
      order: [['createdAt', 'DESC']]
    });
    
    console.log(`Fetched ${rows.length} doctors, page ${page}`);
    return res.json({ 
      total: count, 
      data: rows, 
      page: parseInt(page), 
      limit: parseInt(limit) 
    });
  } catch (e) {
    console.error('Failed to fetch doctors:', e);
    return res.status(500).json({ message: "Failed to fetch doctors", error: e.message });
  }
};
