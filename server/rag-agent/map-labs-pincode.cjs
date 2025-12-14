#!/usr/bin/env node

/**
 * Map Lab Addresses with Pincode Master
 * Enhances lab profiles with accurate area/locality information from pincode master
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const PINCODE_MASTER = '../../server/db/masters/pincodes.csv';
const LAB_PROFILES_DIR = '/tmp/rag_cache/profiles';
const OUTPUT_DIR = '/tmp/rag_cache/profiles_enhanced';

class PincodeMapper {
    constructor() {
        this.pincodeData = new Map();
        this.stats = {
            totalLabs: 0,
            matched: 0,
            unmatched: 0,
            enhanced: 0
        };
    }

    async initialize() {
        console.log('🗺️  PINCODE MAPPER - LAB ADDRESS ENHANCEMENT');
        console.log('='.repeat(70));
        
        await this.loadPincodeMaster();
        console.log('\n✅ Mapper Ready\n');
    }

    async loadPincodeMaster() {
        console.log('📂 Loading pincode master data...');
        
        const filePath = path.join(__dirname, PINCODE_MASTER);
        const csvContent = await fs.readFile(filePath, 'utf-8');
        
        // Parse CSV
        const records = parse(csvContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true
        });

        // Build pincode lookup map
        records.forEach(record => {
            const pincode = record.key ? record.key.split('/')[1] : null;
            if (pincode) {
                this.pincodeData.set(pincode, {
                    pincode: pincode,
                    place_name: record.place_name,
                    admin_name: record.admin_name1,
                    latitude: parseFloat(record.latitude) || null,
                    longitude: parseFloat(record.longitude) || null,
                    accuracy: record.accuracy
                });
            }
        });

        console.log(`✅ Loaded ${this.pincodeData.size} pincode records`);
    }

    extractPincode(address) {
        // Match 6-digit pincode in address
        const pincodeMatch = address.match(/\b(\d{6})\b/);
        return pincodeMatch ? pincodeMatch[1] : null;
    }

    async processLabProfiles() {
        console.log('🔄 Processing lab profiles...\n');

        // Create output directory
        try {
            await fs.mkdir(OUTPUT_DIR, { recursive: true });
        } catch (e) {}

        // Get all profile files
        const files = await fs.readdir(LAB_PROFILES_DIR);
        const labFiles = files.filter(f => f.endsWith('.json'));
        
        this.stats.totalLabs = labFiles.length;
        console.log(`Found ${labFiles.length} lab profiles to process\n`);

        let processed = 0;
        for (const file of labFiles) {
            const profilePath = path.join(LAB_PROFILES_DIR, file);
            const profile = JSON.parse(await fs.readFile(profilePath, 'utf-8'));

            const enhanced = this.enhanceProfile(profile);
            
            // Save enhanced profile
            const outputPath = path.join(OUTPUT_DIR, file);
            await fs.writeFile(outputPath, JSON.stringify(enhanced, null, 2));

            processed++;
            if (processed % 500 === 0) {
                const progress = ((processed / this.stats.totalLabs) * 100).toFixed(1);
                console.log(`   Processed: ${processed}/${this.stats.totalLabs} (${progress}%) | Matched: ${this.stats.matched} | Enhanced: ${this.stats.enhanced}`);
            }
        }

        console.log(`\n✅ All profiles processed and saved to ${OUTPUT_DIR}`);
    }

    enhanceProfile(profile) {
        const address = profile.basic_info.address || '';
        const pincode = this.extractPincode(address);

        if (!pincode) {
            this.stats.unmatched++;
            return profile;
        }

        const pincodeInfo = this.pincodeData.get(pincode);
        
        if (!pincodeInfo) {
            this.stats.unmatched++;
            return profile;
        }

        this.stats.matched++;

        // Extract existing location data
        const existingCity = profile.basic_info.address.match(/(CHENNAI|BANGALORE|HYDERABAD|MUMBAI|DELHI|PUNE|KOLKATA|AHMEDABAD)/i);
        const existingState = profile.basic_info.address.match(/(TAMILNADU|KARNATAKA|KERALA|MAHARASHTRA|DELHI|TELANGANA|ANDHRA PRADESH|GUJARAT|WEST BENGAL|RAJASTHAN|UTTAR PRADESH)/i);

        // Enhance profile with pincode data
        const enhanced = {
            ...profile,
            basic_info: {
                ...profile.basic_info,
                pincode: pincode,
                area: pincodeInfo.place_name,
                locality: pincodeInfo.place_name,
                district: pincodeInfo.admin_name,
                city: existingCity ? existingCity[0] : pincodeInfo.admin_name,
                state: existingState ? existingState[0] : null,
                coordinates: {
                    latitude: pincodeInfo.latitude,
                    longitude: pincodeInfo.longitude,
                    accuracy: pincodeInfo.accuracy
                },
                address_structured: {
                    original: address,
                    area: pincodeInfo.place_name,
                    city: existingCity ? existingCity[0] : pincodeInfo.admin_name,
                    state: existingState ? existingState[0] : null,
                    pincode: pincode
                }
            },
            metadata: {
                ...profile.metadata,
                pincode_mapped: true,
                pincode_source: 'master_data',
                mapping_timestamp: new Date().toISOString()
            }
        };

        this.stats.enhanced++;
        return enhanced;
    }

    generateReport() {
        console.log('\n' + '='.repeat(70));
        console.log('📊 PINCODE MAPPING REPORT');
        console.log('='.repeat(70));
        
        console.log(`\n📈 Statistics:`);
        console.log(`   Total Labs:           ${this.stats.totalLabs}`);
        console.log(`   ✅ Matched & Enhanced: ${this.stats.enhanced} (${((this.stats.enhanced/this.stats.totalLabs)*100).toFixed(1)}%)`);
        console.log(`   ⚠️  Unmatched:         ${this.stats.unmatched} (${((this.stats.unmatched/this.stats.totalLabs)*100).toFixed(1)}%)`);
        
        console.log(`\n💾 Enhanced Profiles: ${OUTPUT_DIR}`);
        console.log(`   Use these profiles for accurate area-based searches and analytics\n`);
    }

    async createSampleComparison() {
        console.log('\n📋 Sample Comparison (Before vs After):\n');
        
        const files = await fs.readdir(LAB_PROFILES_DIR);
        const sampleFile = files.find(f => f.endsWith('.json'));
        
        if (!sampleFile) return;

        const original = JSON.parse(await fs.readFile(path.join(LAB_PROFILES_DIR, sampleFile), 'utf-8'));
        const enhanced = JSON.parse(await fs.readFile(path.join(OUTPUT_DIR, sampleFile), 'utf-8'));

        console.log('BEFORE:');
        console.log(`  Name: ${original.basic_info.name}`);
        console.log(`  Address: ${original.basic_info.address.substring(0, 80)}...`);
        console.log(`  Area: ${original.basic_info.area || 'N/A'}`);
        console.log(`  Pincode: ${original.basic_info.pincode || 'N/A'}`);
        
        console.log('\nAFTER:');
        console.log(`  Name: ${enhanced.basic_info.name}`);
        console.log(`  Address: ${enhanced.basic_info.address.substring(0, 80)}...`);
        console.log(`  Area: ${enhanced.basic_info.area || 'N/A'}`);
        console.log(`  Locality: ${enhanced.basic_info.locality || 'N/A'}`);
        console.log(`  Pincode: ${enhanced.basic_info.pincode || 'N/A'}`);
        console.log(`  Coordinates: ${enhanced.basic_info.coordinates?.latitude}, ${enhanced.basic_info.coordinates?.longitude}`);
        console.log(`  Mapped: ${enhanced.metadata?.pincode_mapped ? 'Yes' : 'No'}`);
    }
}

// Main execution
async function main() {
    const mapper = new PincodeMapper();
    
    try {
        await mapper.initialize();
        await mapper.processLabProfiles();
        await mapper.createSampleComparison();
        mapper.generateReport();
    } catch (error) {
        console.error('\n❌ Fatal Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = PincodeMapper;
