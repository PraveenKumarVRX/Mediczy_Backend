import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from '../utils/excel-compat.js';
import { authUser } from '../middleware/auth.middleware.js';
import pool from '../db/pgPool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

router.use(authUser);

// Base paths for provider data
const PROVIDERS_BASE = '/tmp/rag_cache/all_providers';
const HOSPITALS_BASE = path.join(PROVIDERS_BASE, 'hospitals');
const LABS_BASE = path.join(PROVIDERS_BASE, 'labs');
const CLINICS_BASE = path.join(PROVIDERS_BASE, 'clinics');
const PHARMACIES_BASE = path.join(PROVIDERS_BASE, 'pharmacies');

// Ensure provider directories exist to avoid ENOENT on first read
async function ensureDirectory(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Get all hospitals with pagination, search, and filtering
 * Source: hospitals table in PostgreSQL
 */
router.get('/hospitals', async (req, res) => {
    try {
        const { page = 1, limit = 50, search = '', city = '', state = '', area = '' } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const conditions = [];
        const params = [];

        if (search) {
            params.push(`%${search}%`);
            conditions.push(`(hospital_name ILIKE $${params.length} OR address ILIKE $${params.length})`);
        }
        if (city) {
            params.push(`%${city}%`);
            conditions.push(`city ILIKE $${params.length}`);
        }
        if (state) {
            params.push(`%${state}%`);
            conditions.push(`state ILIKE $${params.length}`);
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const countResult = await pool.query(
            `SELECT COUNT(*) FROM hospitals ${where}`, params
        );
        const total = parseInt(countResult.rows[0].count);

        const dataResult = await pool.query(
            `SELECT id, unique_id, hospital_name, address, city, state, pincode,
                    latitude, longitude, phone_number, email, status, is_verified,
                    specializations, facilities, total_beds, available_beds,
                    network_type, cashless_enabled, created_at
             FROM hospitals ${where}
             ORDER BY hospital_name ASC
             LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
            [...params, parseInt(limit), offset]
        );

        const transformed = dataResult.rows.map(h => ({
            id: h.unique_id || h.id,
            name: h.hospital_name,
            address: h.address || '',
            area: null,
            city: h.city || null,
            state: h.state || null,
            pincode: h.pincode || null,
            latitude: h.latitude ? parseFloat(h.latitude) : null,
            longitude: h.longitude ? parseFloat(h.longitude) : null,
            services: Array.isArray(h.specializations) ? h.specializations : [],
            facilities: Array.isArray(h.facilities) ? h.facilities : [],
            classification: 'hospital',
            total_beds: h.total_beds || 0,
            available_beds: h.available_beds || 0,
            network_type: h.network_type || null,
            cashless_enabled: h.cashless_enabled || false,
            quality_score: 0.7,
            contact: {
                phone: h.phone_number || '',
                email: h.email || ''
            },
            status: h.status,
            is_verified: h.is_verified,
            timestamp: h.created_at
        }));

        res.json({
            success: true,
            data: transformed,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Error fetching hospitals:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get all labs with pagination and filtering
 * Source: labs table in PostgreSQL (address is JSONB)
 */
router.get('/labs', async (req, res) => {
    try {
        const { page = 1, limit = 50, search = '', city = '', state = '', area = '' } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const conditions = [];
        const params = [];

        if (search) {
            params.push(`%${search}%`);
            conditions.push(`(name ILIKE $${params.length} OR address->>'street' ILIKE $${params.length})`);
        }
        if (city) {
            params.push(`%${city}%`);
            conditions.push(`address->>'city' ILIKE $${params.length}`);
        }
        if (state) {
            params.push(`%${state}%`);
            conditions.push(`address->>'state' ILIKE $${params.length}`);
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const countResult = await pool.query(
            `SELECT COUNT(*) FROM labs ${where}`, params
        );
        const total = parseInt(countResult.rows[0].count);

        const dataResult = await pool.query(
            `SELECT id, unique_id, name, "phoneNumber", email, address, services,
                    facilities, status, "isVerified", rating, metadata, "createdAt"
             FROM labs ${where}
             ORDER BY name ASC
             LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
            [...params, parseInt(limit), offset]
        );

        const transformed = dataResult.rows.map(l => {
            const addr = l.address || {};
            const coords = addr.coordinates || {};
            return {
                id: l.unique_id || l.id,
                name: l.name,
                address: addr.street || addr.formatted || '',
                area: addr.area || addr.locality || null,
                city: addr.city || null,
                state: addr.state || null,
                pincode: addr.pincode || addr.zip || null,
                latitude: coords.latitude ? parseFloat(coords.latitude) : null,
                longitude: coords.longitude ? parseFloat(coords.longitude) : null,
                services: Array.isArray(l.services) ? l.services : [],
                facilities: Array.isArray(l.facilities) ? l.facilities : [],
                classification: 'lab',
                rating: l.rating ? parseFloat(l.rating) : null,
                quality_score: 0.7,
                contact: {
                    phone: l.phoneNumber || '',
                    email: l.email || ''
                },
                status: l.status,
                is_verified: l.isVerified,
                timestamp: l.createdAt
            };
        });

        res.json({
            success: true,
            data: transformed,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Error fetching labs:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get all clinics with pagination and filtering
 * Source: provider_clinics table in PostgreSQL
 */
router.get('/clinics', async (req, res) => {
    try {
        const { page = 1, limit = 50, search = '', city = '', state = '', type = '' } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        // Build WHERE clauses dynamically
        const conditions = [];
        const params = [];

        if (search) {
            params.push(`%${search}%`);
            conditions.push(`(name ILIKE $${params.length} OR location->>'address' ILIKE $${params.length})`);
        }
        if (city) {
            params.push(`%${city}%`);
            conditions.push(`location->>'city' ILIKE $${params.length}`);
        }
        if (state) {
            params.push(`%${state}%`);
            conditions.push(`location->>'state' ILIKE $${params.length}`);
        }
        if (type) {
            params.push(`%${type}%`);
            conditions.push(`type ILIKE $${params.length}`);
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        // Count total matching rows
        const countResult = await pool.query(
            `SELECT COUNT(*) FROM provider_clinics ${where}`,
            params
        );
        const total = parseInt(countResult.rows[0].count);

        // Fetch paginated rows
        const dataResult = await pool.query(
            `SELECT id, unique_id, name, type, specialty, location, services,
                    phone, email, status, latitude, longitude, created_at
             FROM provider_clinics ${where}
             ORDER BY name ASC
             LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
            [...params, parseInt(limit), offset]
        );

        const transformed = dataResult.rows.map(c => ({
            id: c.unique_id || c.id,
            name: c.name,
            address: c.location?.address || '',
            area: c.location?.area || null,
            city: c.location?.city || null,
            state: c.location?.state || null,
            pincode: c.location?.pincode || null,
            latitude: c.latitude ? parseFloat(c.latitude) : null,
            longitude: c.longitude ? parseFloat(c.longitude) : null,
            services: Array.isArray(c.services) ? c.services : [],
            classification: c.type || 'clinic',
            sub_type: c.specialty || c.type,
            quality_score: 0.7,
            contact: { phone: c.phone || '', email: c.email || '' },
            status: c.status,
            timestamp: c.created_at
        }));

        res.json({
            success: true,
            data: transformed,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Error fetching clinics:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get all pharmacies with pagination and filtering
 */
router.get('/pharmacies', async (req, res) => {
    try {
        const { page = 1, limit = 50, search = '', city = '', state = '' } = req.query;
        
        const pharmaciesDir = path.join(PROVIDERS_BASE, 'pharmacies');
        let files = [];
        try {
            files = await fs.readdir(pharmaciesDir);
        } catch (e) {
            // directory missing or empty — fall through to DB
        }
        
        if (files.length === 0) {
            // Fall back to DB
            const conditions = [];
            const values = [];
            if (search) { conditions.push(`(name ILIKE $${values.length+1} OR address::text ILIKE $${values.length+1})`); values.push(`%${search}%`); }
            if (city) { conditions.push(`address->>'city' ILIKE $${values.length+1}`); values.push(`%${city}%`); }
            if (state) { conditions.push(`address->>'state' ILIKE $${values.length+1}`); values.push(`%${state}%`); }
            const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
            const countResult = await pool.query(`SELECT COUNT(*) FROM pharmacies ${where}`, values);
            const total = parseInt(countResult.rows[0].count);
            const offset = (page - 1) * limit;
            const rows = await pool.query(`SELECT id, name, address, "phoneNumber", email, status, "createdAt" FROM pharmacies ${where} ORDER BY name LIMIT $${values.length+1} OFFSET $${values.length+2}`, [...values, limit, offset]);
            return res.json({
                success: true,
                data: rows.rows.map(p => ({
                    id: p.id, name: p.name, address: p.address,
                    city: p.address?.city, state: p.address?.state,
                    contact: p.phoneNumber, email: p.email, status: p.status
                })),
                pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) }
            });
        }
        
        // Load pharmacy profiles
        let pharmacies = await Promise.all(
            files.map(async (file) => {
                const content = await fs.readFile(path.join(pharmaciesDir, file), 'utf-8');
                return JSON.parse(content);
            })
        );
        
        // Filter pharmacies
        if (search) {
            const searchLower = search.toLowerCase();
            pharmacies = pharmacies.filter(p => 
                p.basic_info.name.toLowerCase().includes(searchLower) ||
                (p.basic_info.address || '').toLowerCase().includes(searchLower)
            );
        }
        
        if (city) {
            pharmacies = pharmacies.filter(p => 
                (p.basic_info.city || '').toLowerCase().includes(city.toLowerCase())
            );
        }
        
        if (state) {
            pharmacies = pharmacies.filter(p => 
                (p.basic_info.state || '').toLowerCase().includes(state.toLowerCase())
            );
        }
        
        // Pagination
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + parseInt(limit);
        const paginatedPharmacies = pharmacies.slice(startIndex, endIndex);
        
        // Transform to admin format
        const transformed = paginatedPharmacies.map(p => ({
            id: p.id,
            name: p.basic_info.name,
            address: p.basic_info.address,
            area: p.basic_info.area,
            city: p.basic_info.city,
            state: p.basic_info.state,
            pincode: p.basic_info.pincode,
            latitude: p.basic_info.coordinates?.latitude,
            longitude: p.basic_info.coordinates?.longitude,
            services: p.services || [],
            classification: p.classification?.type,
            chain: p.classification?.chain,
            chain_name: p.classification?.chain_name,
            quality_score: p.quality_indicators?.overall_score || 0.8,
            contact: p.basic_info.contact,
            email: p.basic_info.email,
            home_delivery: p.quality_indicators?.home_delivery || false,
            timestamp: p.timestamp
        }));
        
        res.json({
            success: true,
            data: transformed,
            pagination: {
                total: pharmacies.length,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(pharmacies.length / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching pharmacies:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get all corporates with pagination and filtering
 */
router.get('/corporates', async (req, res) => {
    try {
        const { page = 1, limit = 50, search = '', city = '', state = '' } = req.query;
        
        const corporatesDir = path.join(PROVIDERS_BASE, 'corporates');
        const files = await fs.readdir(corporatesDir);
        
        // Load corporate profiles
        let corporates = await Promise.all(
            files.map(async (file) => {
                const content = await fs.readFile(path.join(corporatesDir, file), 'utf-8');
                return JSON.parse(content);
            })
        );
        
        // Filter corporates
        if (search) {
            const searchLower = search.toLowerCase();
            corporates = corporates.filter(c => 
                c.basic_info.name.toLowerCase().includes(searchLower) ||
                (c.basic_info.company_type || '').toLowerCase().includes(searchLower)
            );
        }
        
        if (city) {
            corporates = corporates.filter(c => 
                (c.basic_info.city || '').toLowerCase().includes(city.toLowerCase())
            );
        }
        
        if (state) {
            corporates = corporates.filter(c => 
                (c.basic_info.state || '').toLowerCase().includes(state.toLowerCase())
            );
        }
        
        // Pagination
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + parseInt(limit);
        const paginatedCorporates = corporates.slice(startIndex, endIndex);
        
        // Transform to admin format
        const transformed = paginatedCorporates.map(c => ({
            id: c.id,
            name: c.basic_info.name,
            company_type: c.basic_info.company_type,
            address: c.basic_info.address,
            city: c.basic_info.city,
            state: c.basic_info.state,
            pincode: c.basic_info.pincode,
            contact: c.basic_info.contact,
            email: c.basic_info.email,
            website: c.basic_info.website,
            employee_count: c.employee_info?.employee_count || 0,
            covered_employees: c.employee_info?.covered_employees || 0,
            covered_dependents: c.employee_info?.covered_dependents || 0,
            plan_type: c.health_plan?.plan_type,
            insurance_provider: c.health_plan?.insurance_provider,
            coverage_amount: c.health_plan?.coverage_amount,
            services: c.services || [],
            quality_score: c.quality_indicators?.overall_score || 0.85,
            active: c.quality_indicators?.active || true,
            timestamp: c.timestamp
        }));
        
        res.json({
            success: true,
            data: transformed,
            pagination: {
                total: corporates.length,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(corporates.length / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching corporates:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get all doctors with pagination and filtering
 */
router.get('/doctors', async (req, res) => {
    try {
        const { page = 1, limit = 50, search = '', city = '', state = '', specialty = '' } = req.query;
        
        // Read from Excel file
        const doctorsFile = path.join(__dirname, '..', 'db', 'Master Data', 'Doctors Data', 'Doctors List 624.xlsx');
        const workbook = await XLSX.readFile(doctorsFile);
        const sheetName = workbook.SheetNames[0];
        let doctors = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
        
        // Filter doctors
        if (search) {
            const searchLower = search.toLowerCase();
            doctors = doctors.filter(d => 
                (d['Doctor Name'] || '').toLowerCase().includes(searchLower) ||
                (d['UIN Speciality'] || '').toLowerCase().includes(searchLower) ||
                (d['Division Speciality'] || '').toLowerCase().includes(searchLower)
            );
        }
        
        if (city) {
            doctors = doctors.filter(d => 
                (d['Area/Patch'] || '').toLowerCase().includes(city.toLowerCase()) ||
                (d['Locality'] || '').toLowerCase().includes(city.toLowerCase())
            );
        }
        
        if (state) {
            doctors = doctors.filter(d => 
                (d['State'] || '').toLowerCase().includes(state.toLowerCase())
            );
        }
        
        if (specialty) {
            doctors = doctors.filter(d => 
                (d['UIN Speciality'] || '').toLowerCase().includes(specialty.toLowerCase()) ||
                (d['Division Speciality'] || '').toLowerCase().includes(specialty.toLowerCase())
            );
        }
        
        // Pagination
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + parseInt(limit);
        const paginatedDoctors = doctors.slice(startIndex, endIndex);
        
        // Transform to admin format
        const transformed = paginatedDoctors.map((d, index) => {
            const specialty = d['UIN Speciality'] || d['Division Speciality'] || '';
            return {
                id: `doctor_${d['S.no'] || index + 1}`,
                name: d['Doctor Name'] || '',
                gender: d['Gender'] || '',
                specialties: specialty ? [specialty] : [],
                specialty: specialty,
                qualification: d['UIN Qualification'] || '',
                city: d['Area/Patch'] || d['Locality'] || '',
                locality: d['Locality'] || '',
                state: d['State'] || '',
                contact: d['Mobile Number'] ? String(d['Mobile Number']) : '',
                phone: d['Mobile Number'] ? String(d['Mobile Number']) : '',
                landline: d['Landline No.'] ? String(d['Landline No.']) : '',
                email: d['Email'] || '',
                clinic_name: d['Clinic Name'] || d['Clinic name'] || '',
                clinic_address: d['Clinic Address'] || '',
                registration_number: '',
                verified: !!(d['UIN Qualification'] && d['Mobile Number']),
                quality_score: (d['Mobile Number'] && d['Email']) ? 0.9 : 
                              (d['Mobile Number'] || d['Email']) ? 0.7 : 0.5
            };
        });
        
        res.json({
            success: true,
            data: transformed,
            pagination: {
                total: doctors.length,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(doctors.length / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching doctors:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ success: false, error: error.message, stack: error.stack });
    }
});

/**
 * Get statistics for all providers
 */
router.get('/stats', async (req, res) => {
    try {
        const hospitalsDir = path.join(PROVIDERS_BASE, 'hospitals');
        const labsDir = LABS_BASE;
        const clinicsDir = path.join(PROVIDERS_BASE, 'clinics');
        const pharmaciesDir = path.join(PROVIDERS_BASE, 'pharmacies');
        const corporatesDir = path.join(PROVIDERS_BASE, 'corporates');
        const doctorsFile = path.join(__dirname, '..', 'db', 'Master Data', 'Doctors Data', 'Doctors List 624.xlsx');
        
        const [hospitalFiles, labFiles, clinicFiles, pharmacyFiles, corporateFiles] = await Promise.all([
            fs.readdir(hospitalsDir).catch(() => []),
            fs.readdir(labsDir).catch(() => []),
            fs.readdir(clinicsDir).catch(() => []),
            fs.readdir(pharmaciesDir).catch(() => []),
            fs.readdir(corporatesDir).catch(() => [])
        ]);
        
        // Read doctors from Excel
        let doctorCount = 0;
        try {
            const workbook = await XLSX.readFile(doctorsFile);
            const sheetName = workbook.SheetNames[0];
            const doctors = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
            doctorCount = doctors.length;
        } catch (error) {
            console.error('Error reading doctors file:', error);
        }
        
        // Load sample data for geographic distribution
        const sampleLabs = await Promise.all(
            labFiles.slice(0, 100).map(async (file) => {
                const content = await fs.readFile(path.join(labsDir, file), 'utf-8');
                return JSON.parse(content);
            })
        );
        
        const cities = new Set();
        const states = new Set();
        const areas = new Set();
        
        sampleLabs.forEach(lab => {
            if (lab.basic_info.city) cities.add(lab.basic_info.city);
            if (lab.basic_info.state) states.add(lab.basic_info.state);
            if (lab.basic_info.area) areas.add(lab.basic_info.area);
        });
        
        res.json({
            success: true,
            data: {
                hospitals: {
                    total: hospitalFiles.length,
                    active: hospitalFiles.length
                },
                labs: {
                    total: labFiles.length,
                    active: labFiles.length,
                    pincode_mapped: Math.floor(labFiles.length * 0.612)
                },
                clinics: {
                    total: clinicFiles.length,
                    active: clinicFiles.length
                },
                pharmacies: {
                    total: pharmacyFiles.length,
                    active: pharmacyFiles.length
                },
                corporates: {
                    total: corporateFiles.length,
                    active: corporateFiles.length
                },
                doctors: {
                    total: doctorCount,
                    active: doctorCount
                },
                geographic: {
                    cities: cities.size,
                    states: states.size,
                    areas: areas.size
                },
                total_providers: hospitalFiles.length + labFiles.length + clinicFiles.length + pharmacyFiles.length + corporateFiles.length + doctorCount
            }
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get unique cities for filtering
 */
router.get('/cities', async (req, res) => {
    try {
        const [clinicsResult, hospitalsResult, labsResult] = await Promise.all([
            pool.query(`SELECT DISTINCT location->>'city' AS city FROM provider_clinics WHERE location->>'city' IS NOT NULL`),
            pool.query(`SELECT DISTINCT city FROM hospitals WHERE city IS NOT NULL AND city != ''`),
            pool.query(`SELECT DISTINCT address->>'city' AS city FROM labs WHERE address->>'city' IS NOT NULL AND address->>'city' != ''`)
        ]);
        const cities = [...new Set([
            ...clinicsResult.rows.map(r => r.city),
            ...hospitalsResult.rows.map(r => r.city),
            ...labsResult.rows.map(r => r.city)
        ])].filter(Boolean).sort();
        res.json({ success: true, data: cities });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get unique states for filtering
 */
router.get('/states', async (req, res) => {
    try {
        const [clinicsResult, hospitalsResult, labsResult] = await Promise.all([
            pool.query(`SELECT DISTINCT location->>'state' AS state FROM provider_clinics WHERE location->>'state' IS NOT NULL`),
            pool.query(`SELECT DISTINCT state FROM hospitals WHERE state IS NOT NULL AND state != ''`),
            pool.query(`SELECT DISTINCT address->>'state' AS state FROM labs WHERE address->>'state' IS NOT NULL AND address->>'state' != ''`)
        ]);
        const states = [...new Set([
            ...clinicsResult.rows.map(r => r.state),
            ...hospitalsResult.rows.map(r => r.state),
            ...labsResult.rows.map(r => r.state)
        ])].filter(Boolean).sort();
        res.json({ success: true, data: states });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get unique areas for filtering
 */
router.get('/areas', async (req, res) => {
    try {
        const { city } = req.query;
        const labsDir = LABS_BASE;
        const files = await fs.readdir(labsDir);
        
        let labs = await Promise.all(
            files.map(async (file) => {
                const content = await fs.readFile(path.join(labsDir, file), 'utf-8');
                return JSON.parse(content);
            })
        );
        
        if (city) {
            labs = labs.filter(l => l.basic_info.city === city);
        }
        
        const areas = [...new Set(labs.map(l => l.basic_info.area).filter(Boolean))].sort();
        
        res.json({
            success: true,
            data: areas
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get unique specialties for filtering doctors
 */
router.get('/specialties', async (req, res) => {
    try {
        const doctorsFile = path.join(__dirname, '..', 'db', 'Master Data', 'Doctors Data', 'Doctors List 624.xlsx');
        const workbook = await XLSX.readFile(doctorsFile);
        const sheetName = workbook.SheetNames[0];
        const doctors = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
        
        const specialtiesSet = new Set();
        doctors.forEach(d => {
            if (d['UIN Speciality']) specialtiesSet.add(d['UIN Speciality']);
            if (d['Division Speciality']) specialtiesSet.add(d['Division Speciality']);
        });
        
        const specialties = [...specialtiesSet].filter(Boolean).sort();
        
        res.json({
            success: true,
            data: specialties
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get single provider by ID
 */
router.get('/:type/:id', async (req, res) => {
    try {
        const { type, id } = req.params;
        
        let filePath;
        if (type === 'hospital') {
            filePath = path.join(PROVIDERS_BASE, 'hospitals', `${id}.json`);
        } else if (type === 'lab') {
            filePath = path.join(LABS_BASE, `${id}.json`);
        } else if (type === 'clinic') {
            filePath = path.join(PROVIDERS_BASE, 'clinics', `${id}.json`);
        } else if (type === 'doctor') {
            filePath = path.join(PROVIDERS_BASE, 'doctors', `${id}.json`);
        } else {
            return res.status(400).json({ success: false, error: 'Invalid provider type' });
        }
        
        const content = await fs.readFile(filePath, 'utf-8');
        const provider = JSON.parse(content);
        
        res.json({
            success: true,
            data: provider
        });
    } catch (error) {
        if (error.code === 'ENOENT') {
            return res.status(404).json({ success: false, error: 'Provider not found' });
        }
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
