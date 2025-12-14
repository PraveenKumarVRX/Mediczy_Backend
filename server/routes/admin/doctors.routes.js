import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const DOCTORS_FILE = path.join(__dirname, '..', '..', 'db', 'Master Data', 'Doctors Data', 'Doctors List 624.xlsx');

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

async function writeDoctorsFile(doctors) {
    try {
        const worksheet = XLSX.utils.json_to_sheet(doctors);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Doctors');
        XLSX.writeFile(workbook, DOCTORS_FILE);
    } catch (error) {
        console.error('Error writing doctors file:', error);
        throw error;
    }
}

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
            'Clinic Address': doctor.clinicAddress || ''
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
                    'Clinic Address': doctor.clinicAddress || ''
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

export default router;
