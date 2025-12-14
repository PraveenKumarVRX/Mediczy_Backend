import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const PHARMACIES_BASE = '/tmp/rag_cache/all_providers/pharmacies';

async function ensureDirectory() {
    try {
        await fs.mkdir(PHARMACIES_BASE, { recursive: true });
    } catch (error) {
        console.error('Error creating pharmacies directory:', error);
    }
}

router.post('/', async (req, res) => {
    try {
        await ensureDirectory();
        const { pharmacy } = req.body;
        
        if (!pharmacy || !pharmacy.name) {
            return res.status(400).json({ 
                success: false, 
                message: 'Pharmacy data with name is required' 
            });
        }

        const id = crypto.randomBytes(8).toString('hex');
        const timestamp = new Date().toISOString();

        const pharmacyProfile = {
            id,
            timestamp,
            basic_info: {
                name: pharmacy.name,
                address: `${pharmacy.address?.street || ''}, ${pharmacy.address?.city || ''}, ${pharmacy.address?.state || ''} ${pharmacy.address?.pincode || ''}`.trim(),
                city: pharmacy.address?.city || null,
                state: pharmacy.address?.state || null,
                pincode: pharmacy.address?.pincode || null,
                area: pharmacy.address?.area || null,
                contact: {
                    phone: pharmacy.phoneNumber || pharmacy.phone || '',
                    email: pharmacy.email || ''
                },
                email: pharmacy.email || '',
                coordinates: pharmacy.coordinates || null
            },
            classification: {
                type: 'pharmacy',
                chain: pharmacy.isChain || false,
                chain_name: pharmacy.chainName || null,
                confidence: 1.0
            },
            services: pharmacy.services || [],
            quality_indicators: {
                overall_score: 0.85,
                home_delivery: pharmacy.homeDelivery || false,
                online_ordering: pharmacy.onlineOrdering || false,
                twenty_four_seven: pharmacy.twentyFourSeven || false
            },
            metadata: {
                license_number: pharmacy.licenseNumber || null,
                gst_number: pharmacy.gstNumber || null,
                website: pharmacy.website || null,
                active: pharmacy.isActive !== false
            },
            timestamp
        };

        const filePath = path.join(PHARMACIES_BASE, `${id}.json`);
        await fs.writeFile(filePath, JSON.stringify(pharmacyProfile, null, 2));

        res.json({
            success: true,
            message: 'Pharmacy created successfully',
            data: pharmacyProfile
        });
    } catch (error) {
        console.error('Error creating pharmacy:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to create pharmacy',
            error: error.message 
        });
    }
});

router.post('/bulk', async (req, res) => {
    try {
        await ensureDirectory();
        const { pharmacies } = req.body;
        
        if (!Array.isArray(pharmacies) || pharmacies.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Pharmacies array is required' 
            });
        }

        if (pharmacies.length > 1000) {
            return res.status(400).json({ 
                success: false, 
                message: 'Maximum 1000 pharmacies allowed per upload' 
            });
        }

        const results = { success: 0, failed: 0, errors: [] };

        for (const pharmacy of pharmacies) {
            try {
                if (!pharmacy.name) {
                    results.failed++;
                    results.errors.push({ pharmacy, reason: 'Missing name' });
                    continue;
                }

                const id = crypto.randomBytes(8).toString('hex');
                const timestamp = new Date().toISOString();

                const pharmacyProfile = {
                    id,
                    timestamp,
                    basic_info: {
                        name: pharmacy.name,
                        address: `${pharmacy.address?.street || ''}, ${pharmacy.address?.city || ''}, ${pharmacy.address?.state || ''} ${pharmacy.address?.pincode || ''}`.trim(),
                        city: pharmacy.address?.city || null,
                        state: pharmacy.address?.state || null,
                        pincode: pharmacy.address?.pincode || null,
                        area: pharmacy.address?.area || null,
                        contact: {
                            phone: pharmacy.phoneNumber || pharmacy.phone || '',
                            email: pharmacy.email || ''
                        },
                        email: pharmacy.email || '',
                        coordinates: pharmacy.coordinates || null
                    },
                    classification: {
                        type: 'pharmacy',
                        chain: pharmacy.isChain || false,
                        chain_name: pharmacy.chainName || null,
                        confidence: 1.0
                    },
                    services: pharmacy.services || [],
                    quality_indicators: {
                        overall_score: 0.85,
                        home_delivery: pharmacy.homeDelivery || false,
                        online_ordering: pharmacy.onlineOrdering || false,
                        twenty_four_seven: pharmacy.twentyFourSeven || false
                    },
                    metadata: {
                        license_number: pharmacy.licenseNumber || null,
                        gst_number: pharmacy.gstNumber || null,
                        website: pharmacy.website || null,
                        active: pharmacy.isActive !== false
                    },
                    timestamp
                };

                const filePath = path.join(PHARMACIES_BASE, `${id}.json`);
                await fs.writeFile(filePath, JSON.stringify(pharmacyProfile, null, 2));
                results.success++;
            } catch (error) {
                results.failed++;
                results.errors.push({ 
                    pharmacy: pharmacy.name || 'Unknown', 
                    reason: error.message 
                });
            }
        }

        res.json({
            success: true,
            message: `Successfully imported ${results.success} pharmacies`,
            count: results.success,
            data: results
        });
    } catch (error) {
        console.error('Error bulk importing pharmacies:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to bulk import pharmacies',
            error: error.message 
        });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const filePath = path.join(PHARMACIES_BASE, `${id}.json`);
        
        await fs.unlink(filePath);
        
        res.json({
            success: true,
            message: 'Pharmacy deleted successfully'
        });
    } catch (error) {
        if (error.code === 'ENOENT') {
            return res.status(404).json({ 
                success: false, 
                message: 'Pharmacy not found' 
            });
        }
        res.status(500).json({ 
            success: false, 
            message: 'Failed to delete pharmacy',
            error: error.message 
        });
    }
});

export default router;
