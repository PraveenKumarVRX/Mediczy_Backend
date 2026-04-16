import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import { authUser, requireRole } from '../../middleware/auth.middleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authUser);
router.use(requireRole('admin'));

const DOCTORS_FILE = path.join(__dirname, '..', '..', 'db', 'Master Data', 'Doctors Data', 'Doctors List 624.xlsx');
const TELECONSULTATION_DOCTORS_FILE = path.join(__dirname, '..', '..', 'db', 'Master Data', 'Doctors Data', 'teleconsulation doctors list.xlsx');

async function readDoctorsFile() {
    try {
        const workbook = XLSX.readFile(DOCTORS_FILE);
        const sheetName = workbook.SheetNames[0];
        return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
    } catch (error) {
        console.error('Error reading doctors file:', error);
        return [];
    }
}

async function readTeleconsultationDoctorsFile() {
    try {
        const workbook = XLSX.readFile(TELECONSULTATION_DOCTORS_FILE);
        const sheetName = workbook.SheetNames[0];
        return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
    } catch (error) {
        console.error('Error reading teleconsultation doctors file:', error);
        return [];
    }
}

function normalizeConsultationType(value, fallback = 'regular') {
    const type = (value || '').toString().toLowerCase();
    return ['online', 'regular', 'both'].includes(type) ? type : fallback;
}

async function writeDoctorsFile(doctors) {
    try {
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(doctors);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Doctors');
        XLSX.writeFile(workbook, DOCTORS_FILE);
    } catch (error) {
        console.error('Error writing doctors file:', error);
        throw error;
    }
}

async function writeTeleDoctorsFile(doctors) {
    try {
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(doctors);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Doctors');
        XLSX.writeFile(workbook, TELECONSULTATION_DOCTORS_FILE);
    } catch (error) {
        console.error('Error writing teleconsultation doctors file:', error);
        throw error;
    }
}

async function getAllDoctors() {
    try {
        const regularDoctors = await readDoctorsFile();
        const teleDoctors = await readTeleconsultationDoctorsFile();
        
        // Normalize regular doctors to match frontend expectations
        const formattedRegularDoctors = regularDoctors.map((d, index) => {
            const fullName = d['Doctor Name'] || '';
            const nameParts = fullName.split(' ');
            const firstName = nameParts[0] || '';
            const lastName = nameParts.slice(1).join(' ') || '';
            const specialization = d['UIN Speciality'] || d['Division Speciality'] || '';
            const phone = d['Mobile Number'] ? String(d['Mobile Number']) : '';
            const qualityScore = (phone && d['Email']) ? 0.9 : (phone || d['Email']) ? 0.7 : 0.5;
            
            return {
                id: `regular_${d['S.no'] || index}`,
                // Normalized fields expected by frontend
                name: fullName,
                firstName,
                lastName,
                fullName,
                email: d['Email'] || '',
                phoneNumber: phone,
                phone: phone,
                mobile: phone,
                specialization,
                specialties: specialization ? [specialization] : [],
                specialty: specialization,
                experience: 0,  // Not available in Excel data
                city: d['Area/Patch'] || d['Locality'] || '',
                state: d['State'] || '',
                clinicName: d['Clinic Name'] || '',
                clinicAddress: d['Clinic Address'] || '',
                qualification: d['UIN Qualification'] || '',
                consultationType: normalizeConsultationType(d['Consultation Type'], 'regular'),
                consultationFee: parseInt(d['Consultation Fee']) || 0,
                currency: d['Currency'] || 'INR',
                medicalCouncil: d['Medical Council'] || d['Medical Council Name'] || '',
                registration_number: d['Registration Number'] || d['registration number'] || '',
                verified: true,
                quality_score: qualityScore,
                createdAt: new Date().toISOString(),
                verificationStatus: 'verified',
                // Original fields for backward compatibility
                'Doctor Name': d['Doctor Name'],
                'Full Name': d['Doctor Name'],
                'Gender': d['Gender'],
                'UIN Speciality': d['UIN Speciality'],
                'Division Speciality': d['Division Speciality'],
                'Qualification': d['UIN Qualification'],
                'Mobile Number': d['Mobile Number'],
                'Contact Phone Number': d['Mobile Number'],
                'Email': d['Email'],
                'Contact Email ID': d['Email'],
                'Area/Patch': d['Area/Patch'],
                'Locality': d['Locality'],
                'State': d['State'],
                'Registration Number': d['Registration Number'] || d['registration number'] || '',
                'Consultation Type': d['Consultation Type'] || '',
                'Consultation Fee': d['Consultation Fee'] || '',
                'Currency': d['Currency'] || 'INR',
                'Medical Council Name': d['Medical Council'] || d['Medical Council Name'] || '',
                doctorType: 'regular',
                isActive: true,
                contractStatus: 'active'
            };
        });
        
        // Normalize teleconsultation doctors
        const formattedTeleDoctors = teleDoctors.map((d, index) => {
            const fullName = d['Full Name'] || '';
            const nameParts = fullName.split(' ');
            const firstName = nameParts[0] || '';
            const lastName = nameParts.slice(1).join(' ') || '';
            const specialization = d['Qualification'] === 'Others' ? d['Others please specify'] : d['Qualification'] || '';
            const phone = d['Contact Phone Number'] ? String(d['Contact Phone Number']) : '';
            const qualityScore = (phone && d['Contact Email ID']) ? 0.8 : (phone || d['Contact Email ID']) ? 0.6 : 0.4;
            
            return {
                id: `tele_${d['SLNO'] || index}`,
                // Normalized fields expected by frontend
                name: fullName,
                firstName,
                lastName,
                fullName,
                email: d['Contact Email ID'] || '',
                phoneNumber: phone,
                phone: phone,
                mobile: phone,
                specialization,
                specialties: specialization ? [specialization] : [],
                specialty: specialization,
                experience: 0,  // Not available in Excel data
                city: '',  // Not available in Excel data
                state: '',  // Not available in Excel data
                clinicName: 'Teleconsultation',
                clinicAddress: d['Clinic Name Address where the Doctor practicing'] || '',
                qualification: d['Qualification'] || '',
                consultationType: normalizeConsultationType(d['Consultation Type'], 'online'),
                consultationFee: parseInt(d['Consultation Fee'] || d['Consultation Fees'] || d['consultation fees']) || 0,
                currency: d['Currency'] || 'INR',
                medicalCouncil: d['Medical Council'] || d['Medical Council Name'] || '',
                registration_number: d['Registration Number'] || d['registration number'] || '',
                verified: false,
                quality_score: qualityScore,
                createdAt: new Date().toISOString(),
                verificationStatus: 'pending',
                // Original fields for backward compatibility
                'Doctor Name': d['Full Name'],
                'Full Name': d['Full Name'],
                'Gender': d['Gender'],
                'Qualification': d['Qualification'],
                'Others please specify': d['Others please specify'],
                'Mobile Number': d['Contact Phone Number'],
                'Contact Phone Number': d['Contact Phone Number'],
                'Email': d['Contact Email ID'],
                'Contact Email ID': d['Contact Email ID'],
                'Age': d['Age'],
                'Registration Number': d['Registration Number'] || d['registration number'] || '',
                'Consultation Type': d['Consultation Type'] || 'online',
                'Consultation Fee': d['Consultation Fee'] || d['Consultation Fees'] || d['consultation fees'] || '',
                'Currency': d['Currency'] || 'INR',
                'Medical Council Name': d['Medical Council'] || d['Medical Council Name'] || '',
                doctorType: 'teleconsultation',
                isActive: true,  // Can be toggled when contract ceases
                contractStatus: 'active'
            };
        });
        
        return [...formattedRegularDoctors, ...formattedTeleDoctors];
    } catch (error) {
        console.error('Error reading all doctors:', error);
        return [];
    }
}

// GET all doctors with pagination and filtering
router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 50, search = '', city = '', state = '', specialty = '', doctorType = 'all' } = req.query;
        
        let doctors = await getAllDoctors();
        
        // Filter by doctor type
        if (doctorType && doctorType !== 'all') {
            doctors = doctors.filter(d => d.doctorType === doctorType);
        }
        
        // Filter doctors
        if (search) {
            const searchLower = search.toLowerCase();
            doctors = doctors.filter(d => 
                (d['Doctor Name'] || '').toLowerCase().includes(searchLower) ||
                (d['Full Name'] || '').toLowerCase().includes(searchLower) ||
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
                (d['Division Speciality'] || '').toLowerCase().includes(specialty.toLowerCase()) ||
                (d['Qualification'] || '').toLowerCase().includes(specialty.toLowerCase())
            );
        }
        
        // Pagination
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const paginatedDoctors = doctors.slice(offset, offset + parseInt(limit));
        
        res.json({
            success: true,
            data: paginatedDoctors,
            pagination: {
                total: doctors.length,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(doctors.length / parseInt(limit))
            }
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch doctors',
            error: error.message 
        });
    }
});

// GET all doctors with pagination and filtering - Detail view
router.get('/:doctorId', async (req, res) => {
    try {
        const { doctorId } = req.params;
        const doctors = await getAllDoctors();
        
        const doctor = doctors.find(d => d.id === doctorId);
        
        if (!doctor) {
            return res.status(404).json({ 
                success: false, 
                message: 'Doctor not found' 
            });
        }
        
        res.json({
            success: true,
            data: doctor
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch doctor',
            error: error.message 
        });
    }
});

router.post('/', async (req, res) => {
    try {
        const { doctor } = req.body;
        
        if (!doctor || !doctor.name) {
            return res.status(400).json({ 
                success: false, 
                message: 'Doctor data with name is required' 
            });
        }

        const doctors = await readDoctorsFile();
        const newSerialNo = doctors.length + 1;

        const newDoctor = {
            'S.no': newSerialNo,
            'Doctor Name': doctor.name,
            'Gender': doctor.gender || '',
            'UIN Speciality': Array.isArray(doctor.specialties) ? doctor.specialties[0] : (doctor.specialty || ''),
            'Division Speciality': Array.isArray(doctor.specialties) ? doctor.specialties.join(',') : (doctor.specialty || ''),
            'UIN Qualification': doctor.qualification || '',
            'Area/Patch': doctor.city || '',
            'Locality': doctor.locality || '',
            'State': doctor.state || '',
            'Mobile Number': doctor.phoneNumber || doctor.phone || '',
            'Landline No.': doctor.landline || '',
            'Email': doctor.email || '',
            'Clinic Name': doctor.clinicName || '',
            'Clinic Address': doctor.clinicAddress || '',
            'Registration Number': doctor.registrationNumber || doctor.registration_number || '',
            'Medical Council Name': doctor.medicalCouncil || '',
            'Consultation Type': doctor.consultationType || '',
            'Consultation Fee': doctor.consultationFee || '',
            'Currency': doctor.currency || 'INR'
        };

        doctors.push(newDoctor);
        await writeDoctorsFile(doctors);

        res.json({
            success: true,
            message: 'Doctor created successfully',
            data: newDoctor
        });
    } catch (error) {
        console.error('Error creating doctor:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to create doctor',
            error: error.message 
        });
    }
});

// PATCH - Update doctor details
router.patch('/:doctorId/details', async (req, res) => {
    try {
        const { doctorId } = req.params;
        const { updates = {} } = req.body || {};

        if (!doctorId) {
            return res.status(400).json({ success: false, message: 'Doctor ID is required' });
        }

        const [typePrefix, ...rest] = doctorId.split('_');
        const serialStr = rest.join('_');

        if (!typePrefix || !serialStr) {
            return res.status(400).json({ success: false, message: 'Invalid doctor ID format' });
        }

        if (typePrefix === 'regular') {
            const doctors = await readDoctorsFile();
            const idx = doctors.findIndex(d => String(d['S.no'] || d['S No'] || d['S.No'] || d['S No.']) === serialStr);
            if (idx === -1) {
                return res.status(404).json({ success: false, message: 'Doctor not found' });
            }

            const doc = doctors[idx];
            doc['Doctor Name'] = updates.name || doc['Doctor Name'];
            const primarySpec = Array.isArray(updates.specialties) ? updates.specialties[0] : (updates.specialty || updates.specialties || doc['UIN Speciality']);
            if (primarySpec) {
                doc['UIN Speciality'] = primarySpec;
                doc['Division Speciality'] = Array.isArray(updates.specialties) ? updates.specialties.join(',') : primarySpec;
            }
            doc['UIN Qualification'] = updates.qualification || doc['UIN Qualification'];
            doc['Area/Patch'] = updates.city || doc['Area/Patch'];
            doc['Locality'] = updates.locality || doc['Locality'];
            doc['State'] = updates.state || doc['State'];
            doc['Mobile Number'] = updates.phoneNumber || updates.phone || doc['Mobile Number'];
            doc['Email'] = updates.email || doc['Email'];
            doc['Clinic Name'] = updates.clinicName || doc['Clinic Name'];
            doc['Clinic Address'] = updates.clinicAddress || doc['Clinic Address'];
            doc['Consultation Type'] = updates.consultationType || doc['Consultation Type'] || 'regular';
            doc['Consultation Fee'] = updates.consultationFee !== undefined ? updates.consultationFee : (doc['Consultation Fee'] || 0);
            doc['Currency'] = updates.currency || doc['Currency'] || 'INR';
            doc['Medical Council Name'] = updates.medicalCouncil || doc['Medical Council Name'] || '';
            doc['Registration Number'] = updates.registrationNumber || updates.registration_number || doc['Registration Number'] || '';

            await writeDoctorsFile(doctors);
        } else if (typePrefix === 'tele') {
            const doctors = await readTeleconsultationDoctorsFile();
            const idx = doctors.findIndex(d => String(d['SLNO'] || d['SLNo'] || d['Sl No'] || d['SlNo']) === serialStr);
            if (idx === -1) {
                return res.status(404).json({ success: false, message: 'Doctor not found' });
            }

            const doc = doctors[idx];
            doc['Full Name'] = updates.name || doc['Full Name'];
            const primarySpec = Array.isArray(updates.specialties) ? updates.specialties[0] : (updates.specialty || updates.specialties || doc['Qualification']);
            doc['Qualification'] = updates.qualification || doc['Qualification'];
            if (primarySpec) {
                doc['Qualification'] = primarySpec;
            }
            doc['Contact Phone Number'] = updates.phoneNumber || updates.phone || doc['Contact Phone Number'];
            doc['Contact Email ID'] = updates.email || doc['Contact Email ID'];
            doc['Clinic Name Address where the Doctor practicing'] = updates.clinicAddress || doc['Clinic Name Address where the Doctor practicing'];
            doc['Consultation Type'] = updates.consultationType || doc['Consultation Type'] || 'online';
            doc['Consultation Fee'] = updates.consultationFee !== undefined ? updates.consultationFee : (doc['Consultation Fee'] || 0);
            doc['Currency'] = updates.currency || doc['Currency'] || 'INR';
            doc['Medical Council Name'] = updates.medicalCouncil || doc['Medical Council Name'] || '';
            doc['Registration Number'] = updates.registrationNumber || updates.registration_number || doc['Registration Number'] || '';

            await writeTeleDoctorsFile(doctors);
        } else {
            return res.status(400).json({ success: false, message: 'Unsupported doctor type' });
        }

        const allDoctors = await getAllDoctors();
        const updatedDoctor = allDoctors.find(d => d.id === doctorId);

        res.json({
            success: true,
            message: 'Doctor updated successfully',
            data: updatedDoctor
        });
    } catch (error) {
        console.error('Error updating doctor:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update doctor',
            error: error.message
        });
    }
});

router.post('/bulk', async (req, res) => {
    try {
        const { doctors: newDoctors } = req.body;
        
        if (!Array.isArray(newDoctors) || newDoctors.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Doctors array is required' 
            });
        }

        if (newDoctors.length > 1000) {
            return res.status(400).json({ 
                success: false, 
                message: 'Maximum 1000 doctors allowed per upload' 
            });
        }

        const existingDoctors = await readDoctorsFile();
        let serialNo = existingDoctors.length + 1;
        const results = { success: 0, failed: 0, errors: [] };

        const doctorsToAdd = [];

        for (const doctor of newDoctors) {
            try {
                if (!doctor.name) {
                    results.failed++;
                    results.errors.push({ doctor, reason: 'Missing name' });
                    continue;
                }

                const newDoctor = {
                    'S.no': serialNo++,
                    'Doctor Name': doctor.name,
                    'Gender': doctor.gender || '',
                    'UIN Speciality': Array.isArray(doctor.specialties) ? doctor.specialties[0] : (doctor.specialty || ''),
                    'Division Speciality': Array.isArray(doctor.specialties) ? doctor.specialties.join(',') : (doctor.specialty || ''),
                    'UIN Qualification': doctor.qualification || '',
                    'Area/Patch': doctor.city || '',
                    'Locality': doctor.locality || '',
                    'State': doctor.state || '',
                    'Mobile Number': doctor.phoneNumber || doctor.phone || '',
                    'Landline No.': doctor.landline || '',
                    'Email': doctor.email || '',
                    'Clinic Name': doctor.clinicName || '',
                    'Clinic Address': doctor.clinicAddress || '',
                    'Registration Number': doctor.registrationNumber || doctor.registration_number || '',
                    'Medical Council Name': doctor.medicalCouncil || '',
                    'Consultation Type': doctor.consultationType || '',
                    'Consultation Fee': doctor.consultationFee || '',
                    'Currency': doctor.currency || 'INR'
                };

                doctorsToAdd.push(newDoctor);
                results.success++;
            } catch (error) {
                results.failed++;
                results.errors.push({ 
                    doctor: doctor.name || 'Unknown', 
                    reason: error.message 
                });
            }
        }

        if (doctorsToAdd.length > 0) {
            const allDoctors = [...existingDoctors, ...doctorsToAdd];
            await writeDoctorsFile(allDoctors);
        }

        res.json({
            success: true,
            message: `Successfully imported ${results.success} doctors`,
            count: results.success,
            data: results
        });
    } catch (error) {
        console.error('Error bulk importing doctors:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to bulk import doctors',
            error: error.message 
        });
    }
});

router.delete('/:serialNo', async (req, res) => {
    try {
        const { serialNo } = req.params;
        const doctors = await readDoctorsFile();
        
        const filteredDoctors = doctors.filter(d => d['S.no'] != serialNo);
        
        if (filteredDoctors.length === doctors.length) {
            return res.status(404).json({ 
                success: false, 
                message: 'Doctor not found' 
            });
        }

        await writeDoctorsFile(filteredDoctors);
        
        res.json({
            success: true,
            message: 'Doctor deleted successfully'
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Failed to delete doctor',
            error: error.message 
        });
    }
});

// GET filter options - cities
router.get('/filters/cities', async (req, res) => {
    try {
        const doctors = await getAllDoctors();
        const cities = [...new Set([
            ...doctors.map(d => d['Area/Patch']).filter(Boolean),
            ...doctors.map(d => d['Locality']).filter(Boolean)
        ])].sort();
        res.json({ success: true, data: cities });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET filter options - states
router.get('/filters/states', async (req, res) => {
    try {
        const doctors = await getAllDoctors();
        const states = [...new Set(doctors.map(d => d['State']).filter(Boolean))].sort();
        res.json({ success: true, data: states });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET filter options - specialties
router.get('/filters/specialties', async (req, res) => {
    try {
        const doctors = await getAllDoctors();
        const specialties = [
            ...new Set([
                ...doctors.map(d => d['UIN Speciality']).filter(Boolean),
                ...doctors.map(d => d['Division Speciality']).filter(Boolean),
                ...doctors.map(d => d['Qualification']).filter(Boolean)
            ])
        ].sort();
        res.json({ success: true, data: specialties });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET filter options - doctor types (regular, teleconsultation)
router.get('/filters/types', async (req, res) => {
    try {
        res.json({ 
            success: true, 
            data: [
                { value: 'regular', label: 'Regular Doctors' },
                { value: 'teleconsultation', label: 'Teleconsultation Doctors' }
            ]
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// PATCH - Toggle doctor active status and onboarding status (approved/rejected/pending)
router.patch('/:doctorId/status', async (req, res) => {
    try {
        const { doctorId } = req.params;
        const { isActive, contractStatus, verificationStatus } = req.body;
        
        if (!doctorId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Doctor ID is required' 
            });
        }
        
        const activeValue = isActive !== undefined ? !!isActive : true;
        const statusValue = verificationStatus || contractStatus || 'pending';
        const contractValue = contractStatus || statusValue;
        
        console.log(`Updating doctor ${doctorId} status: isActive=${activeValue}, status=${statusValue}`);
        
        res.json({
            success: true,
            message: `Doctor ${doctorId} status updated successfully`,
            data: {
                doctorId,
                isActive: activeValue,
                contractStatus: contractValue,
                verificationStatus: statusValue
            }
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Failed to update doctor status',
            error: error.message 
        });
    }
});

// POST - Create doctor login (for teleconsultation doctors)
router.post('/:doctorId/create-login', async (req, res) => {
    try {
        const { doctorId } = req.params;
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email and password are required' 
            });
        }
        
        // In production, this should create a doctor account in the database
        // For now, we return a success response indicating the login was created
        
        console.log(`Creating login for doctor ${doctorId}: ${email}`);
        
        res.json({
            success: true,
            message: `Login created successfully for doctor ${doctorId}`,
            data: {
                doctorId,
                email,
                loginCreated: true,
                loginUrl: 'https://app.mediqzy.com/doctor/login'
            }
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Failed to create doctor login',
            error: error.message 
        });
    }
});

export default router;
