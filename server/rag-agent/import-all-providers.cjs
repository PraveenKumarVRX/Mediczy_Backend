#!/usr/bin/env node

/**
 * Import All Healthcare Providers from Master Data
 * Processes hospitals, clinics, doctors, and labs with pincode mapping
 */

const XLSX = require('../utils/excel-compat.cjs');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const { ProviderProfilingRAGAgent } = require('./provider-profiling-agent.cjs');

const MASTER_DATA_FILES = {
    hospitals: [
        '../../server/db/Master Data/Hospitals Data/Hospital list.xlsx',
        '../../server/db/Master Data/Hospitals Data/SmartHealth Hospital master list.xlsx'
    ],
    labs: [
        '../../server/db/Master Data/Labs/labs list.xlsx'
    ],
    clinics: [
        '../../server/db/Master Data/Clinics/Poly Clinics/clinics list.xlsx',
        '../../server/db/Master Data/Clinics/Dental Clinics/Clove dental 2.xlsx'
    ],
    doctors: [
        '../../server/db/Master Data/Doctors Data/Doctors List 624.xlsx',
        '../../server/db/Master Data/Doctors Data/teleconsulation doctors list.xlsx'
    ]
};

const PINCODE_MASTER = '../../server/db/masters/pincodes.csv';
const OUTPUT_DIR = '/tmp/rag_cache/all_providers';

class MasterDataImporter {
    constructor() {
        this.ragAgent = null;
        this.pincodeData = new Map();
        this.stats = {
            hospitals: { total: 0, processed: 0, success: 0, errors: 0 },
            labs: { total: 0, processed: 0, success: 0, errors: 0 },
            clinics: { total: 0, processed: 0, success: 0, errors: 0 },
            doctors: { total: 0, processed: 0, success: 0, errors: 0 }
        };
    }

    async initialize() {
        console.log('🏥 MASTER DATA IMPORTER - ALL PROVIDERS');
        console.log('='.repeat(70));
        
        // Load pincode master
        await this.loadPincodeMaster();
        
        // Initialize RAG Agent
        this.ragAgent = new ProviderProfilingRAGAgent();
        await this.ragAgent.initialize();
        
        // Create output directory
        await fs.mkdir(OUTPUT_DIR, { recursive: true });
        await fs.mkdir(`${OUTPUT_DIR}/hospitals`, { recursive: true });
        await fs.mkdir(`${OUTPUT_DIR}/labs`, { recursive: true });
        await fs.mkdir(`${OUTPUT_DIR}/clinics`, { recursive: true });
        await fs.mkdir(`${OUTPUT_DIR}/doctors`, { recursive: true });
        
        console.log('\n✅ Importer Ready\n');
    }

    async loadPincodeMaster() {
        console.log('📂 Loading pincode master...');
        
        const filePath = path.join(__dirname, PINCODE_MASTER);
        const csvContent = await fs.readFile(filePath, 'utf-8');
        
        const records = parse(csvContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true
        });

        records.forEach(record => {
            const pincode = record.key ? record.key.split('/')[1] : null;
            if (pincode) {
                this.pincodeData.set(pincode, {
                    pincode: pincode,
                    place_name: record.place_name,
                    admin_name: record.admin_name1,
                    latitude: parseFloat(record.latitude) || null,
                    longitude: parseFloat(record.longitude) || null
                });
            }
        });

        console.log(`✅ Loaded ${this.pincodeData.size} pincode records`);
    }

    extractPincode(address) {
        const pincodeMatch = address.match(/\b(\d{6})\b/);
        return pincodeMatch ? pincodeMatch[1] : null;
    }

    enhanceWithPincode(data, address) {
        const pincode = this.extractPincode(address);
        if (!pincode) return data;

        const pincodeInfo = this.pincodeData.get(pincode);
        if (!pincodeInfo) return data;

        return {
            ...data,
            pincode: pincode,
            area: pincodeInfo.place_name,
            locality: pincodeInfo.place_name,
            district: pincodeInfo.admin_name,
            latitude: pincodeInfo.latitude,
            longitude: pincodeInfo.longitude
        };
    }

    async processHospitals() {
        console.log('\n🏥 PROCESSING HOSPITALS');
        console.log('─'.repeat(70));

        for (const file of MASTER_DATA_FILES.hospitals) {
            const filePath = path.join(__dirname, file);
            const workbook = await XLSX.readFile(filePath);
            const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

            console.log(`\n📄 File: ${path.basename(file)}`);
            console.log(`   Records: ${data.length}`);

            this.stats.hospitals.total += data.length;

            await this.processBatch(data, 'hospital', this.stats.hospitals);
        }
    }

    async processLabs() {
        console.log('\n🧪 PROCESSING LABS');
        console.log('─'.repeat(70));

        for (const file of MASTER_DATA_FILES.labs) {
            const filePath = path.join(__dirname, file);
            const workbook = await XLSX.readFile(filePath);
            const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

            console.log(`\n📄 File: ${path.basename(file)}`);
            console.log(`   Records: ${data.length}`);

            this.stats.labs.total += data.length;

            await this.processBatch(data, 'laboratory', this.stats.labs);
        }
    }

    async processClinics() {
        console.log('\n🏨 PROCESSING CLINICS');
        console.log('─'.repeat(70));

        for (const file of MASTER_DATA_FILES.clinics) {
            const filePath = path.join(__dirname, file);
            const workbook = await XLSX.readFile(filePath);
            const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

            console.log(`\n📄 File: ${path.basename(file)}`);
            console.log(`   Records: ${data.length}`);

            this.stats.clinics.total += data.length;

            await this.processBatch(data, 'clinic', this.stats.clinics);
        }
    }

    async processDoctors() {
        console.log('\n👨‍⚕️ PROCESSING DOCTORS');
        console.log('─'.repeat(70));

        for (const file of MASTER_DATA_FILES.doctors) {
            const filePath = path.join(__dirname, file);
            const workbook = await XLSX.readFile(filePath);
            const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

            console.log(`\n📄 File: ${path.basename(file)}`);
            console.log(`   Records: ${data.length}`);

            this.stats.doctors.total += data.length;

            await this.processBatch(data, 'individual_doctor', this.stats.doctors);
        }
    }

    async processBatch(data, providerType, stats) {
        const batchSize = 50;
        
        for (let i = 0; i < data.length; i += batchSize) {
            const batch = data.slice(i, i + batchSize);
            
            const results = await Promise.all(batch.map(async (item) => {
                try {
                    const normalized = this.normalizeProviderData(item, providerType);
                    const profile = await this.ragAgent.analyzeProvider(normalized);
                    
                    // Save profile
                    const outputPath = `${OUTPUT_DIR}/${providerType === 'individual_doctor' ? 'doctors' : providerType === 'laboratory' ? 'labs' : providerType}s/${profile.id}.json`;
                    await fs.writeFile(outputPath, JSON.stringify(profile, null, 2));
                    
                    stats.success++;
                    return { success: true };
                } catch (error) {
                    stats.errors++;
                    return { success: false, error: error.message };
                }
            }));

            stats.processed += batch.length;
            
            const progress = ((stats.processed / stats.total) * 100).toFixed(1);
            process.stdout.write(`\r   Progress: ${stats.processed}/${stats.total} (${progress}%) | ✓ ${stats.success} | ✗ ${stats.errors}`);
            
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        console.log(''); // New line after progress
    }

    normalizeProviderData(data, type) {
        const normalized = {
            type: type
        };

        // Common fields
        normalized.name = data.entity_name || data.name || data['Hospital Name'] || data['Clinic Name'] || data['Doctor Name'] || 'Unknown';
        normalized.address = data.Full_Address || data['Full Address'] || data.entity_address || data.address || data.Address || '';
        
        if (data.city) normalized.city = data.city;
        if (data.state) normalized.state = data.state;
        if (data.pincode) normalized.pincode = data.pincode;
        if (data.Latitude) normalized.latitude = data.Latitude;
        if (data.Longitude) normalized.longitude = data.Longitude;

        // Enhance with pincode data
        const enhanced = this.enhanceWithPincode(normalized, normalized.address);

        // Type-specific fields
        if (type === 'hospital') {
            enhanced.services = 'Emergency Care, Inpatient Services, Outpatient Services, Surgery';
            enhanced.description = `Multi-specialty hospital in ${enhanced.city || 'India'}`;
        } else if (type === 'laboratory') {
            enhanced.services = 'Diagnostic Testing, Laboratory Services, Pathology';
            enhanced.description = `Laboratory services in ${enhanced.city || 'India'}`;
        } else if (type === 'clinic') {
            enhanced.services = 'General Consultation, Minor Procedures, Diagnostics';
            enhanced.description = `Clinical services in ${enhanced.city || 'India'}`;
            if (data['Clinic Name'] && data['Clinic Name'].toLowerCase().includes('dental')) {
                enhanced.services = 'Dental Care, Oral Surgery, Teeth Cleaning';
                enhanced.description = 'Dental clinic services';
            }
        } else if (type === 'individual_doctor') {
            enhanced.specialization = data.Specialization || data.specialization || 'General Physician';
            enhanced.qualification = data.Qualification || data.qualification || '';
            enhanced.services = `${enhanced.specialization} Consultation, Diagnosis, Treatment`;
            enhanced.description = `${enhanced.specialization} practicing in ${enhanced.city || 'India'}`;
        }

        return enhanced;
    }

    async generateFinalReport() {
        console.log('\n' + '='.repeat(70));
        console.log('📊 FINAL IMPORT REPORT');
        console.log('='.repeat(70));

        const grandTotal = Object.values(this.stats).reduce((sum, s) => sum + s.total, 0);
        const grandSuccess = Object.values(this.stats).reduce((sum, s) => sum + s.success, 0);
        const grandErrors = Object.values(this.stats).reduce((sum, s) => sum + s.errors, 0);

        console.log(`\n📈 OVERALL STATISTICS:`);
        console.log(`   Total Providers:  ${grandTotal}`);
        console.log(`   ✅ Successful:    ${grandSuccess} (${((grandSuccess/grandTotal)*100).toFixed(1)}%)`);
        console.log(`   ❌ Errors:        ${grandErrors} (${((grandErrors/grandTotal)*100).toFixed(1)}%)`);

        console.log(`\n📋 BY CATEGORY:`);
        
        Object.entries(this.stats).forEach(([category, stat]) => {
            const successRate = stat.total > 0 ? ((stat.success/stat.total)*100).toFixed(1) : '0.0';
            console.log(`\n   ${category.toUpperCase()}:`);
            console.log(`      Total:     ${stat.total}`);
            console.log(`      Success:   ${stat.success} (${successRate}%)`);
            console.log(`      Errors:    ${stat.errors}`);
        });

        console.log(`\n💾 OUTPUT LOCATIONS:`);
        console.log(`   Hospitals: ${OUTPUT_DIR}/hospitals/`);
        console.log(`   Labs:      ${OUTPUT_DIR}/labs/`);
        console.log(`   Clinics:   ${OUTPUT_DIR}/clinics/`);
        console.log(`   Doctors:   ${OUTPUT_DIR}/doctors/`);

        // Save report
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                total: grandTotal,
                success: grandSuccess,
                errors: grandErrors,
                success_rate: ((grandSuccess/grandTotal)*100).toFixed(2) + '%'
            },
            by_category: this.stats
        };

        await fs.writeFile('/tmp/master_data_import_report.json', JSON.stringify(report, null, 2));
        console.log(`\n📄 Detailed report: /tmp/master_data_import_report.json`);
        console.log('\n✅ Import completed!\n');
    }

    async cleanup() {
        if (this.ragAgent) {
            await this.ragAgent.cleanup();
        }
    }
}

// Main execution
async function main() {
    const importer = new MasterDataImporter();
    
    try {
        await importer.initialize();
        
        // Process all categories
        await importer.processHospitals();
        await importer.processLabs();
        await importer.processClinics();
        await importer.processDoctors();
        
        await importer.generateFinalReport();
    } catch (error) {
        console.error('\n❌ Fatal Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        await importer.cleanup();
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = MasterDataImporter;
