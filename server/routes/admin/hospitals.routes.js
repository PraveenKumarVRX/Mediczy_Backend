import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Base path for hospital data
const HOSPITALS_BASE = '/tmp/rag_cache/all_providers/hospitals';

// Ensure directory exists
async function ensureDirectory() {
    try {
        await fs.mkdir(HOSPITALS_BASE, { recursive: true });
    } catch (error) {
        console.error('Error creating hospitals directory:', error);
    }
}

const formatHospitalProfile = (profile) => ({
    id: profile.id,
    name: profile.basic_info?.name || profile.name || '',
    address: profile.basic_info?.address || '',
    city: profile.basic_info?.city || '',
    state: profile.basic_info?.state || '',
    area: profile.basic_info?.area || '',
    pincode: profile.basic_info?.pincode || '',
    contact: profile.basic_info?.contact || profile.contact || {},
    phone: profile.basic_info?.contact?.phone || '',
    email: profile.basic_info?.contact?.email || '',
    classification: profile.classification?.type || 'hospital',
    sub_type: profile.classification?.sub_type || '',
    services: profile.services || [],
    quality_score: profile.quality_indicators?.overall_score || profile.quality_indicators?.completeness,
    metadata: profile.metadata,
    capabilities: profile.capabilities,
});

/**
 * Create a single hospital
 * POST /api/admin/hospitals
 */
router.post('/', async (req, res) => {
    try {
        await ensureDirectory();
        const { hospital } = req.body;
        
        if (!hospital || !hospital.name) {
            return res.status(400).json({ 
                success: false, 
                message: 'Hospital data with name is required' 
            });
        }

        // Generate ID
        const id = crypto.randomBytes(8).toString('hex');
        const timestamp = new Date().toISOString();

        // Create hospital profile
        const hospitalProfile = {
            id,
            timestamp,
            basic_info: {
                name: hospital.name,
                address: `${hospital.address?.street || ''}, ${hospital.address?.city || ''}, ${hospital.address?.state || ''} ${hospital.address?.pincode || ''}`.trim(),
                city: hospital.address?.city || null,
                state: hospital.address?.state || null,
                pincode: hospital.address?.pincode || null,
                area: hospital.address?.area || null,
                contact: {
                    phone: hospital.phoneNumber || '',
                    email: hospital.email || ''
                },
                coordinates: hospital.coordinates || null
            },
            classification: {
                type: hospital.type === 'Pharmacy' || hospital.type === 'pharmacy' ? 'pharmacy' : 
                      hospital.type === 'Clinic' || hospital.type === 'clinic' ? 'clinic' : 
                      'hospital',
                sub_type: hospital.type || 'general',
                confidence: 1.0
            },
            services: hospital.specialties || [],
            capabilities: {
                medical_services: hospital.specialties || [],
                equipment: ['basic_medical_equipment'],
                specializations: hospital.specialties || [],
                certifications: hospital.accreditation ? [hospital.accreditation] : ['standard_medical_license'],
                emergency_services: hospital.emergencyServices || false,
                patient_capacity: hospital.totalBeds > 500 ? 'high' : hospital.totalBeds > 100 ? 'medium' : 'low',
                bed_count: hospital.totalBeds || null,
                available_beds: hospital.availableBeds || null
            },
            profile_analysis: {
                raw_analysis: `Hospital profile for ${hospital.name}`,
                provider_category: hospital.type || 'hospital',
                quality_indicators: hospital.accreditation ? [hospital.accreditation] : ['standard'],
                specialization_areas: hospital.specialties || ['general'],
                service_capabilities: hospital.specialties || [],
                operational_metrics: {
                    availability: 'business_hours',
                    capacity: hospital.totalBeds > 500 ? 'high' : hospital.totalBeds > 100 ? 'medium' : 'low',
                    response_time: hospital.emergencyServices ? 'immediate' : 'standard'
                },
                network_potential: hospital.accreditation ? 'high' : 'medium',
                risk_assessment: {
                    operational_risk: 'low',
                    patient_risk: 'low',
                    regulatory_compliance: hospital.accreditation ? 'high' : 'standard'
                },
                confidence_score: 0.9,
                analysis_timestamp: timestamp
            },
            quality_indicators: {
                completeness: 0.95,
                data_quality: 'excellent',
                overall_score: 0.9
            },
            network_connections: [],
            metadata: {
                registration_number: hospital.registrationNumber || null,
                website: hospital.website || null,
                active: hospital.isActive !== false
            }
        };

        // Save to file
        const filePath = path.join(HOSPITALS_BASE, `${id}.json`);
        await fs.writeFile(filePath, JSON.stringify(hospitalProfile, null, 2));

        res.json({
            success: true,
            message: 'Hospital created successfully',
            data: hospitalProfile
        });
    } catch (error) {
        console.error('Error creating hospital:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to create hospital',
            error: error.message 
        });
    }
});

router.patch('/:id/details', async (req, res) => {
    try {
        await ensureDirectory();
        const { id } = req.params;
        const { updates = {} } = req.body || {};
        const filePath = path.join(HOSPITALS_BASE, `${id}.json`);

        const exists = await fs.stat(filePath).then(() => true).catch(() => false);
        if (!exists) {
            return res.status(404).json({ success: false, message: 'Hospital not found' });
        }

        const profile = JSON.parse(await fs.readFile(filePath, 'utf-8'));

        profile.basic_info = {
            ...profile.basic_info,
            name: updates.name ?? profile.basic_info?.name,
            address: updates.address || profile.basic_info?.address,
            city: updates.city ?? profile.basic_info?.city,
            state: updates.state ?? profile.basic_info?.state,
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
            type: updates.classification || profile.classification?.type || 'hospital',
            sub_type: updates.type || updates.classification || profile.classification?.sub_type,
            confidence: profile.classification?.confidence || 1.0,
        };

        profile.metadata = {
            ...profile.metadata,
            registration_number: updates.registrationNumber ?? profile.metadata?.registration_number,
            website: updates.website ?? profile.metadata?.website,
            active: updates.isActive !== undefined ? !!updates.isActive : profile.metadata?.active,
        };

        profile.capabilities = {
            ...profile.capabilities,
            emergency_services: updates.emergencyServices !== undefined ? !!updates.emergencyServices : profile.capabilities?.emergency_services,
            bed_count: updates.totalBeds !== undefined ? updates.totalBeds : profile.capabilities?.bed_count,
            available_beds: updates.availableBeds !== undefined ? updates.availableBeds : profile.capabilities?.available_beds,
        };

        await fs.writeFile(filePath, JSON.stringify(profile, null, 2));

        const formatted = formatHospitalProfile(profile);
        res.json({ success: true, message: 'Hospital updated successfully', data: formatted });
    } catch (error) {
        console.error('Error updating hospital:', error);
        res.status(500).json({ success: false, message: 'Failed to update hospital', error: error.message });
    }
});

/**
 * Bulk import hospitals
 * POST /api/admin/hospitals/bulk
 */
router.post('/bulk', async (req, res) => {
    try {
        await ensureDirectory();
        const { hospitals } = req.body;
        
        if (!Array.isArray(hospitals) || hospitals.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Hospitals array is required' 
            });
        }

        if (hospitals.length > 1000) {
            return res.status(400).json({ 
                success: false, 
                message: 'Maximum 1000 hospitals allowed per upload' 
            });
        }

        const results = {
            success: 0,
            failed: 0,
            errors: []
        };

        for (const hospital of hospitals) {
            try {
                if (!hospital.name) {
                    results.failed++;
                    results.errors.push({ hospital, reason: 'Missing name' });
                    continue;
                }

                const id = crypto.randomBytes(8).toString('hex');
                const timestamp = new Date().toISOString();

                const hospitalProfile = {
                    id,
                    timestamp,
                    basic_info: {
                        name: hospital.name,
                        address: `${hospital.address?.street || ''}, ${hospital.address?.city || ''}, ${hospital.address?.state || ''} ${hospital.address?.pincode || ''}`.trim(),
                        city: hospital.address?.city || null,
                        state: hospital.address?.state || null,
                        pincode: hospital.address?.pincode || null,
                        area: hospital.address?.area || null,
                        contact: {
                            phone: hospital.phoneNumber || hospital.phone || '',
                            email: hospital.email || ''
                        },
                        coordinates: hospital.coordinates || null
                    },
                    classification: {
                        type: hospital.type === 'Pharmacy' || hospital.type === 'pharmacy' ? 'pharmacy' : 
                              hospital.type === 'Clinic' || hospital.type === 'clinic' ? 'clinic' : 
                              'hospital',
                        sub_type: hospital.type || 'general',
                        confidence: 1.0
                    },
                    services: hospital.specialties || [],
                    capabilities: {
                        medical_services: hospital.specialties || [],
                        equipment: ['basic_medical_equipment'],
                        specializations: hospital.specialties || [],
                        certifications: hospital.accreditation ? [hospital.accreditation] : ['standard_medical_license'],
                        emergency_services: hospital.emergencyServices || false,
                        patient_capacity: hospital.totalBeds > 500 ? 'high' : hospital.totalBeds > 100 ? 'medium' : 'low',
                        bed_count: hospital.totalBeds || null,
                        available_beds: hospital.availableBeds || null
                    },
                    profile_analysis: {
                        raw_analysis: `Hospital profile for ${hospital.name}`,
                        provider_category: hospital.type || 'hospital',
                        quality_indicators: hospital.accreditation ? [hospital.accreditation] : ['standard'],
                        specialization_areas: hospital.specialties || ['general'],
                        service_capabilities: hospital.specialties || [],
                        operational_metrics: {
                            availability: 'business_hours',
                            capacity: hospital.totalBeds > 500 ? 'high' : hospital.totalBeds > 100 ? 'medium' : 'low',
                            response_time: hospital.emergencyServices ? 'immediate' : 'standard'
                        },
                        network_potential: hospital.accreditation ? 'high' : 'medium',
                        risk_assessment: {
                            operational_risk: 'low',
                            patient_risk: 'low',
                            regulatory_compliance: hospital.accreditation ? 'high' : 'standard'
                        },
                        confidence_score: 0.9,
                        analysis_timestamp: timestamp
                    },
                    quality_indicators: {
                        completeness: 0.95,
                        data_quality: 'excellent',
                        overall_score: 0.9
                    },
                    network_connections: [],
                    metadata: {
                        registration_number: hospital.registrationNumber || null,
                        website: hospital.website || null,
                        active: hospital.isActive !== false
                    }
                };

                const filePath = path.join(HOSPITALS_BASE, `${id}.json`);
                await fs.writeFile(filePath, JSON.stringify(hospitalProfile, null, 2));
                results.success++;
            } catch (error) {
                results.failed++;
                results.errors.push({ 
                    hospital: hospital.name || 'Unknown', 
                    reason: error.message 
                });
            }
        }

        res.json({
            success: true,
            message: `Successfully imported ${results.success} hospitals`,
            count: results.success,
            data: results
        });
    } catch (error) {
        console.error('Error bulk importing hospitals:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to bulk import hospitals',
            error: error.message 
        });
    }
});

/**
 * Delete hospital
 * DELETE /api/admin/hospitals/:id
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const filePath = path.join(HOSPITALS_BASE, `${id}.json`);
        
        await fs.unlink(filePath);
        
        res.json({
            success: true,
            message: 'Hospital deleted successfully'
        });
    } catch (error) {
        if (error.code === 'ENOENT') {
            return res.status(404).json({ 
                success: false, 
                message: 'Hospital not found' 
            });
        }
        res.status(500).json({ 
            success: false, 
            message: 'Failed to delete hospital',
            error: error.message 
        });
    }
});

export default router;
