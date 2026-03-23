import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import pool from '../../db/pgPool.js';

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
        const { id } = req.params;
        const { updates = {} } = req.body || {};

        // Look up in provider_clinics by unique_id or numeric id
        const isNumeric = /^\d+$/.test(id);
        const findResult = await pool.query(
            isNumeric
                ? 'SELECT * FROM provider_clinics WHERE id = $1'
                : 'SELECT * FROM provider_clinics WHERE unique_id = $1',
            [isNumeric ? parseInt(id) : id]
        );

        if (findResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Clinic not found' });
        }

        const clinic = findResult.rows[0];

        // Build SET clauses for columns we allow updating
        const setClauses = [];
        const params = [];

        if (updates.name !== undefined) {
            params.push(updates.name);
            setClauses.push(`name = $${params.length}`);
        }
        if (updates.phone !== undefined) {
            params.push(updates.phone);
            setClauses.push(`phone = $${params.length}`);
        }
        if (updates.email !== undefined) {
            params.push(updates.email);
            setClauses.push(`email = $${params.length}`);
        }
        if (updates.type !== undefined) {
            params.push(updates.type);
            setClauses.push(`type = $${params.length}`);
        }
        if (updates.specialization !== undefined) {
            params.push(updates.specialization);
            setClauses.push(`specialty = $${params.length}`);
        }
        if (updates.isActive !== undefined) {
            params.push(updates.isActive ? 'active' : 'inactive');
            setClauses.push(`status = $${params.length}`);
        }

        // Merge location JSONB fields
        const currentLoc = clinic.location || {};
        const newLoc = {
            ...currentLoc,
            ...(updates.address !== undefined && { address: updates.address }),
            ...(updates.city !== undefined    && { city: updates.city }),
            ...(updates.state !== undefined   && { state: updates.state }),
            ...(updates.pincode !== undefined && { pincode: updates.pincode }),
            ...(updates.area !== undefined    && { area: updates.area }),
        };
        params.push(JSON.stringify(newLoc));
        setClauses.push(`location = $${params.length}`);

        // Merge services array
        if (updates.specialization !== undefined) {
            const svc = Array.isArray(updates.specialization)
                ? updates.specialization
                : [updates.specialization];
            params.push(JSON.stringify(svc));
            setClauses.push(`services = $${params.length}`);
        }

        params.push(new Date().toISOString());
        setClauses.push(`updated_at = $${params.length}`);

        // Push the record id last for the WHERE clause
        params.push(clinic.id);
        const updateResult = await pool.query(
            `UPDATE provider_clinics SET ${setClauses.join(', ')} WHERE id = $${params.length} RETURNING *`,
            params
        );

        const updated = updateResult.rows[0];
        res.json({
            success: true,
            message: 'Clinic updated successfully',
            data: {
                id: updated.unique_id || updated.id,
                name: updated.name,
                phone: updated.phone,
                email: updated.email,
                type: updated.type,
                specialty: updated.specialty,
                status: updated.status,
                city: updated.location?.city,
                state: updated.location?.state,
                address: updated.location?.address,
                pincode: updated.location?.pincode,
                area: updated.location?.area,
                services: updated.services,
            }
        });
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
