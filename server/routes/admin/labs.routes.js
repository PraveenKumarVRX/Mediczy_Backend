import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const LABS_BASE = '/tmp/rag_cache/profiles_enhanced';

async function ensureDirectory() {
    try {
        await fs.mkdir(LABS_BASE, { recursive: true });
    } catch (error) {
        console.error('Error creating labs directory:', error);
    }
}

router.post('/', async (req, res) => {
    try {
        await ensureDirectory();
        const { lab } = req.body;
        
        if (!lab || !lab.name) {
            return res.status(400).json({ 
                success: false, 
                message: 'Lab data with name is required' 
            });
        }

        const id = crypto.randomBytes(8).toString('hex');
        const timestamp = new Date().toISOString();

        const labProfile = {
            id,
            timestamp,
            basic_info: {
                name: lab.name,
                address: `${lab.address?.street || ''}, ${lab.address?.city || ''}, ${lab.address?.state || ''} ${lab.address?.pincode || ''}`.trim(),
                city: lab.address?.city || null,
                state: lab.address?.state || null,
                pincode: lab.address?.pincode || null,
                area: lab.address?.area || null,
                locality: lab.address?.locality || null,
                contact: {
                    phone: lab.phoneNumber || lab.phone || '',
                    email: lab.email || ''
                },
                coordinates: lab.coordinates || null
            },
            classification: {
                type: 'lab',
                sub_type: lab.type || 'diagnostic_lab',
                confidence: 1.0
            },
            services: lab.services || lab.testTypes || [],
            quality_indicators: {
                data_quality: 'excellent',
                completeness: 0.95
            },
            metadata: {
                nabl_accredited: lab.nablAccredited || false,
                iso_certified: lab.isoCertified || false,
                home_collection: lab.homeCollection || false,
                online_reports: lab.onlineReports || false,
                pincode_mapped: !!lab.address?.pincode,
                website: lab.website || null,
                active: lab.isActive !== false
            },
            timestamp
        };

        const filePath = path.join(LABS_BASE, `${id}.json`);
        await fs.writeFile(filePath, JSON.stringify(labProfile, null, 2));

        res.json({
            success: true,
            message: 'Lab created successfully',
            data: labProfile
        });
    } catch (error) {
        console.error('Error creating lab:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to create lab',
            error: error.message 
        });
    }
});

router.post('/bulk', async (req, res) => {
    try {
        await ensureDirectory();
        const { labs } = req.body;
        
        if (!Array.isArray(labs) || labs.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Labs array is required' 
            });
        }

        if (labs.length > 1000) {
            return res.status(400).json({ 
                success: false, 
                message: 'Maximum 1000 labs allowed per upload' 
            });
        }

        const results = { success: 0, failed: 0, errors: [] };

        for (const lab of labs) {
            try {
                if (!lab.name) {
                    results.failed++;
                    results.errors.push({ lab, reason: 'Missing name' });
                    continue;
                }

                const id = crypto.randomBytes(8).toString('hex');
                const timestamp = new Date().toISOString();

                const labProfile = {
                    id,
                    timestamp,
                    basic_info: {
                        name: lab.name,
                        address: `${lab.address?.street || ''}, ${lab.address?.city || ''}, ${lab.address?.state || ''} ${lab.address?.pincode || ''}`.trim(),
                        city: lab.address?.city || null,
                        state: lab.address?.state || null,
                        pincode: lab.address?.pincode || null,
                        area: lab.address?.area || null,
                        locality: lab.address?.locality || null,
                        contact: {
                            phone: lab.phoneNumber || lab.phone || '',
                            email: lab.email || ''
                        },
                        coordinates: lab.coordinates || null
                    },
                    classification: {
                        type: 'lab',
                        sub_type: lab.type || 'diagnostic_lab',
                        confidence: 1.0
                    },
                    services: lab.services || lab.testTypes || [],
                    quality_indicators: {
                        data_quality: 'excellent',
                        completeness: 0.95
                    },
                    metadata: {
                        nabl_accredited: lab.nablAccredited || false,
                        iso_certified: lab.isoCertified || false,
                        home_collection: lab.homeCollection || false,
                        online_reports: lab.onlineReports || false,
                        pincode_mapped: !!lab.address?.pincode,
                        website: lab.website || null,
                        active: lab.isActive !== false
                    },
                    timestamp
                };

                const filePath = path.join(LABS_BASE, `${id}.json`);
                await fs.writeFile(filePath, JSON.stringify(labProfile, null, 2));
                results.success++;
            } catch (error) {
                results.failed++;
                results.errors.push({ 
                    lab: lab.name || 'Unknown', 
                    reason: error.message 
                });
            }
        }

        res.json({
            success: true,
            message: `Successfully imported ${results.success} labs`,
            count: results.success,
            data: results
        });
    } catch (error) {
        console.error('Error bulk importing labs:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to bulk import labs',
            error: error.message 
        });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const filePath = path.join(LABS_BASE, `${id}.json`);
        
        await fs.unlink(filePath);
        
        res.json({
            success: true,
            message: 'Lab deleted successfully'
        });
    } catch (error) {
        if (error.code === 'ENOENT') {
            return res.status(404).json({ 
                success: false, 
                message: 'Lab not found' 
            });
        }
        res.status(500).json({ 
            success: false, 
            message: 'Failed to delete lab',
            error: error.message 
        });
    }
});

export default router;
