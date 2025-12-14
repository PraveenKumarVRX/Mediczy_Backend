import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const CLINICS_BASE = '/tmp/rag_cache/all_providers/clinics';

async function ensureDirectory() {
    try {
        await fs.mkdir(CLINICS_BASE, { recursive: true });
    } catch (error) {
        console.error('Error creating clinics directory:', error);
    }
}

router.post('/', async (req, res) => {
    try {
        await ensureDirectory();
        const { clinic } = req.body;
        
        if (!clinic || !clinic.name) {
            return res.status(400).json({ 
                success: false, 
                message: 'Clinic data with name is required' 
            });
        }

        const id = crypto.randomBytes(8).toString('hex');
        const timestamp = new Date().toISOString();

        const clinicProfile = {
            id,
            timestamp,
            basic_info: {
                name: clinic.name,
                address: `${clinic.address?.street || ''}, ${clinic.address?.city || ''}, ${clinic.address?.state || ''} ${clinic.address?.pincode || ''}`.trim(),
                city: clinic.address?.city || null,
                state: clinic.address?.state || null,
                pincode: clinic.address?.pincode || null,
                area: clinic.address?.area || null,
                contact: {
                    phone: clinic.phoneNumber || clinic.phone || '',
                    email: clinic.email || ''
                },
                coordinates: clinic.coordinates || null
            },
            classification: {
                type: 'clinic',
                sub_type: clinic.type || clinic.specialization || 'general',
                confidence: 1.0
            },
            services: clinic.services || clinic.specializations || [],
            quality_indicators: {
                completeness: 0.9,
                data_quality: 'excellent'
            },
            metadata: {
                doctor_name: clinic.doctorName || null,
                consultation_fee: clinic.consultationFee || null,
                timings: clinic.timings || null,
                website: clinic.website || null,
                active: clinic.isActive !== false
            },
            timestamp
        };

        const filePath = path.join(CLINICS_BASE, `${id}.json`);
        await fs.writeFile(filePath, JSON.stringify(clinicProfile, null, 2));

        res.json({
            success: true,
            message: 'Clinic created successfully',
            data: clinicProfile
        });
    } catch (error) {
        console.error('Error creating clinic:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to create clinic',
            error: error.message 
        });
    }
});

router.post('/bulk', async (req, res) => {
    try {
        await ensureDirectory();
        const { clinics } = req.body;
        
        if (!Array.isArray(clinics) || clinics.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Clinics array is required' 
            });
        }

        if (clinics.length > 1000) {
            return res.status(400).json({ 
                success: false, 
                message: 'Maximum 1000 clinics allowed per upload' 
            });
        }

        const results = { success: 0, failed: 0, errors: [] };

        for (const clinic of clinics) {
            try {
                if (!clinic.name) {
                    results.failed++;
                    results.errors.push({ clinic, reason: 'Missing name' });
                    continue;
                }

                const id = crypto.randomBytes(8).toString('hex');
                const timestamp = new Date().toISOString();

                const clinicProfile = {
                    id,
                    timestamp,
                    basic_info: {
                        name: clinic.name,
                        address: `${clinic.address?.street || ''}, ${clinic.address?.city || ''}, ${clinic.address?.state || ''} ${clinic.address?.pincode || ''}`.trim(),
                        city: clinic.address?.city || null,
                        state: clinic.address?.state || null,
                        pincode: clinic.address?.pincode || null,
                        area: clinic.address?.area || null,
                        contact: {
                            phone: clinic.phoneNumber || clinic.phone || '',
                            email: clinic.email || ''
                        },
                        coordinates: clinic.coordinates || null
                    },
                    classification: {
                        type: 'clinic',
                        sub_type: clinic.type || clinic.specialization || 'general',
                        confidence: 1.0
                    },
                    services: clinic.services || clinic.specializations || [],
                    quality_indicators: {
                        completeness: 0.9,
                        data_quality: 'excellent'
                    },
                    metadata: {
                        doctor_name: clinic.doctorName || null,
                        consultation_fee: clinic.consultationFee || null,
                        timings: clinic.timings || null,
                        website: clinic.website || null,
                        active: clinic.isActive !== false
                    },
                    timestamp
                };

                const filePath = path.join(CLINICS_BASE, `${id}.json`);
                await fs.writeFile(filePath, JSON.stringify(clinicProfile, null, 2));
                results.success++;
            } catch (error) {
                results.failed++;
                results.errors.push({ 
                    clinic: clinic.name || 'Unknown', 
                    reason: error.message 
                });
            }
        }

        res.json({
            success: true,
            message: `Successfully imported ${results.success} clinics`,
            count: results.success,
            data: results
        });
    } catch (error) {
        console.error('Error bulk importing clinics:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to bulk import clinics',
            error: error.message 
        });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const filePath = path.join(CLINICS_BASE, `${id}.json`);
        
        await fs.unlink(filePath);
        
        res.json({
            success: true,
            message: 'Clinic deleted successfully'
        });
    } catch (error) {
        if (error.code === 'ENOENT') {
            return res.status(404).json({ 
                success: false, 
                message: 'Clinic not found' 
            });
        }
        res.status(500).json({ 
            success: false, 
            message: 'Failed to delete clinic',
            error: error.message 
        });
    }
});

export default router;
