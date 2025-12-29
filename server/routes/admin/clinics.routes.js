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

const formatClinicProfile = (profile) => ({
    id: profile.id,
    name: profile.basic_info?.name || '',
    city: profile.basic_info?.city || '',
    state: profile.basic_info?.state || '',
    area: profile.basic_info?.area || '',
    pincode: profile.basic_info?.pincode || '',
    address: profile.basic_info?.address || '',
    phone: profile.basic_info?.contact?.phone || '',
    email: profile.basic_info?.contact?.email || '',
    clinic_type: profile.classification?.sub_type || profile.classification?.type || 'clinic',
    sub_type: profile.classification?.sub_type || '',
    specialization: Array.isArray(profile.services) ? profile.services[0] : profile.services || '',
    quality_score: profile.quality_indicators?.completeness,
    metadata: profile.metadata,
    basic_info: profile.basic_info,
    classification_info: profile.classification,
});

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

router.patch('/:id/details', async (req, res) => {
    try {
        await ensureDirectory();
        const { id } = req.params;
        const { updates = {} } = req.body || {};
        const filePath = path.join(CLINICS_BASE, `${id}.json`);

        const exists = await fs.stat(filePath).then(() => true).catch(() => false);
        if (!exists) {
            return res.status(404).json({ success: false, message: 'Clinic not found' });
        }

        const profile = JSON.parse(await fs.readFile(filePath, 'utf-8'));

        profile.basic_info = {
            ...profile.basic_info,
            name: updates.name ?? profile.basic_info?.name,
            city: updates.city ?? profile.basic_info?.city,
            state: updates.state ?? profile.basic_info?.state,
            address: updates.address || profile.basic_info?.address,
            pincode: updates.pincode ?? profile.basic_info?.pincode,
            area: updates.area ?? profile.basic_info?.area,
            contact: {
                ...profile.basic_info?.contact,
                phone: updates.phone ?? profile.basic_info?.contact?.phone,
                email: updates.email ?? profile.basic_info?.contact?.email,
            },
        };

        profile.classification = {
            ...profile.classification,
            type: 'clinic',
            sub_type: updates.type ?? updates.specialization ?? profile.classification?.sub_type,
        };

        profile.services = updates.specialization
            ? Array.isArray(updates.specialization) ? updates.specialization : [updates.specialization]
            : profile.services;

        profile.metadata = {
            ...profile.metadata,
            doctor_name: updates.doctorName ?? profile.metadata?.doctor_name,
            consultation_fee: updates.consultationFee ?? profile.metadata?.consultation_fee,
            website: updates.website ?? profile.metadata?.website,
            active: updates.isActive !== undefined ? !!updates.isActive : profile.metadata?.active,
        };

        await fs.writeFile(filePath, JSON.stringify(profile, null, 2));

        const formatted = formatClinicProfile(profile);
        res.json({ success: true, message: 'Clinic updated successfully', data: formatted });
    } catch (error) {
        console.error('Error updating clinic:', error);
        res.status(500).json({ success: false, message: 'Failed to update clinic', error: error.message });
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
