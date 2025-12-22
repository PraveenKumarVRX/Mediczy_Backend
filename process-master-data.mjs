#!/usr/bin/env node

/**
 * Process Master Data Excel Files using Task Managing RAG Agent
 * Imports hospitals and labs into the system with intelligent profiling
 */

import XLSX from 'xlsx';
import axios from 'axios';
import { readFileSync, writeFileSync } from 'fs';

const EXCEL_FILES = {
    hospitals: [
        'server/db/Master Data/Hospitals Data/Hospital list.xlsx',
        'server/db/Master Data/Hospitals Data/SmartHealth Hospital master list.xlsx'
    ],
    labs: [
        'server/db/Master Data/Labs/labs list.xlsx'
    ]
};

const API_BASE = 'http://localhost:8000/api';
const INTELLIGENT_DB = 'http://localhost:5005';

class MasterDataProcessor {
    constructor() {
        this.processedCount = {
            hospitals: 0,
            labs: 0,
            errors: []
        };
    }

    async initialize() {
        console.log('🚀 Master Data Processor - Task Manager Mode');
        console.log('=' .repeat(60));
        
        // Check connections
        await this.checkConnections();
    }

    async checkConnections() {
        try {
            console.log('🔍 Checking API connections...');
            
            // Check main API
            try {
                await axios.get(`${API_BASE}/health`, { timeout: 3000 });
                console.log('✅ Main API: Connected');
            } catch (e) {
                console.log('⚠️  Main API: Offline (will use Intelligent DB only)');
            }

            // Check Intelligent DB
            try {
                await axios.get(`${INTELLIGENT_DB}/health`, { timeout: 3000 });
                console.log('✅ Intelligent DB: Connected');
            } catch (e) {
                console.log('❌ Intelligent DB: Offline (required for task management)');
                throw new Error('Intelligent DB is required');
            }

        } catch (error) {
            console.error('❌ Connection check failed:', error.message);
            throw error;
        }
    }

    async processAllFiles() {
        console.log('\n📊 Processing Master Data Files...\n');

        // Process hospitals
        for (const file of EXCEL_FILES.hospitals) {
            await this.processHospitalFile(file);
        }

        // Process labs
        for (const file of EXCEL_FILES.labs) {
            await this.processLabFile(file);
        }

        // Create summary task
        await this.createSummaryTask();

        this.printSummary();
    }

    async processHospitalFile(filePath) {
        console.log(`\n🏥 Processing: ${filePath}`);
        console.log('-'.repeat(60));

        try {
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

            console.log(`📋 Found ${data.length} hospitals`);

            // Process in batches of 10
            const batchSize = 10;
            for (let i = 0; i < data.length; i += batchSize) {
                const batch = data.slice(i, i + batchSize);
                await this.processBatch('hospital', batch, i);
            }

            this.processedCount.hospitals += data.length;

        } catch (error) {
            console.error(`❌ Error processing ${filePath}:`, error.message);
            this.processedCount.errors.push({ file: filePath, error: error.message });
        }
    }

    async processLabFile(filePath) {
        console.log(`\n🔬 Processing: ${filePath}`);
        console.log('-'.repeat(60));

        try {
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

            console.log(`�� Found ${data.length} labs`);

            // Process in batches of 10
            const batchSize = 10;
            for (let i = 0; i < data.length; i += batchSize) {
                const batch = data.slice(i, i + batchSize);
                await this.processBatch('lab', batch, i);
            }

            this.processedCount.labs += data.length;

        } catch (error) {
            console.error(`❌ Error processing ${filePath}:`, error.message);
            this.processedCount.errors.push({ file: filePath, error: error.message });
        }
    }

    async processBatch(type, batch, startIndex) {
        console.log(`  📦 Batch ${Math.floor(startIndex / 10) + 1}: Processing ${batch.length} ${type}s...`);

        for (const record of batch) {
            try {
                // Create provider profile using Intelligent DB
                await this.createProviderProfile(type, record);
                
                // Create automated tasks for this provider
                await this.createProviderTasks(type, record);
                
                process.stdout.write('.');
            } catch (error) {
                process.stdout.write('x');
                this.processedCount.errors.push({
                    type,
                    name: record.name || record.Name || 'Unknown',
                    error: error.message
                });
            }
        }
        console.log(' ✓');
    }

    async createProviderProfile(type, record) {
        // Normalize record data
        const providerData = this.normalizeRecord(type, record);

        // Store in Intelligent DB for RAG agent processing
        const payload = {
            patient_id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            query: `New ${type} provider profile: ${providerData.name}`,
            llm_response: JSON.stringify({
                action: 'provider_profile_created',
                provider_type: type,
                provider_data: providerData,
                timestamp: new Date().toISOString(),
                source: 'master_data_import'
            }),
            source_service: 'master_data_processor'
        };

        await axios.post(`${INTELLIGENT_DB}/api/db/store`, payload);
    }

    async createProviderTasks(type, record) {
        const providerName = record.name || record.Name || record.HospitalName || 
                           record['Hospital Name'] || record.LabName || 'Unknown';

        // Create verification task
        const taskPayload = {
            patient_id: `task_${type}_${Date.now()}`,
            query: `Automated task: Verify ${type} provider - ${providerName}`,
            llm_response: JSON.stringify({
                action: 'task_created',
                task_type: 'provider_verification',
                provider_type: type,
                provider_name: providerName,
                priority: 'medium',
                automation_level: 'semi_automated',
                created_by: 'master_data_processor',
                timestamp: new Date().toISOString()
            }),
            source_service: 'task_managing_rag_agent'
        };

        await axios.post(`${INTELLIGENT_DB}/api/db/store`, taskPayload);
    }

    normalizeRecord(type, record) {
        if (type === 'hospital') {
            return {
                name: record.HospitalName || record['Hospital Name'] || record.name || record.Name,
                address: record.Address || record.address,
                city: record.City || record.city,
                state: record.State || record.state,
                pincode: record.Pincode || record.pincode || record.PIN,
                phone: record.Phone || record.phone || record.ContactNo,
                email: record.Email || record.email,
                type: record.Type || record.type || 'General',
                specializations: record.Specializations || record.specializations,
                bedCapacity: record.BedCapacity || record['Bed Capacity'] || record.beds,
                emergencyServices: record.Emergency || record.emergency || 'Yes'
            };
        } else if (type === 'lab') {
            return {
                name: record.LabName || record['Lab Name'] || record.name || record.Name,
                address: record.Address || record.address,
                city: record.City || record.city,
                state: record.State || record.state,
                pincode: record.Pincode || record.pincode || record.PIN,
                phone: record.Phone || record.phone || record.ContactNo,
                email: record.Email || record.email,
                type: record.Type || record.type || 'Diagnostic',
                tests: record.Tests || record.tests || record.TestCategories,
                accreditation: record.Accreditation || record.accreditation
            };
        }
    }

    async createSummaryTask() {
        console.log('\n📝 Creating summary task...');

        const summaryPayload = {
            patient_id: `summary_task_${Date.now()}`,
            query: 'Master data import completed - Generate comprehensive report',
            llm_response: JSON.stringify({
                action: 'task_created',
                task_type: 'analytics_summary',
                summary: {
                    hospitals_processed: this.processedCount.hospitals,
                    labs_processed: this.processedCount.labs,
                    total_providers: this.processedCount.hospitals + this.processedCount.labs,
                    errors: this.processedCount.errors.length,
                    timestamp: new Date().toISOString()
                },
                priority: 'high',
                created_by: 'master_data_processor'
            }),
            source_service: 'task_managing_rag_agent'
        };

        await axios.post(`${INTELLIGENT_DB}/api/db/store`, summaryPayload);
    }

    printSummary() {
        console.log('\n' + '='.repeat(60));
        console.log('📊 PROCESSING COMPLETE');
        console.log('='.repeat(60));
        console.log(`🏥 Hospitals Processed: ${this.processedCount.hospitals}`);
        console.log(`🔬 Labs Processed: ${this.processedCount.labs}`);
        console.log(`📦 Total Providers: ${this.processedCount.hospitals + this.processedCount.labs}`);
        console.log(`❌ Errors: ${this.processedCount.errors.length}`);
        
        if (this.processedCount.errors.length > 0) {
            console.log('\n⚠️  Error Details:');
            this.processedCount.errors.slice(0, 5).forEach(err => {
                console.log(`   - ${err.file || err.name}: ${err.error}`);
            });
            if (this.processedCount.errors.length > 5) {
                console.log(`   ... and ${this.processedCount.errors.length - 5} more`);
            }
        }

        console.log('\n✅ All data stored in Intelligent DB');
        console.log('🤖 Task Managing RAG Agent will process providers');
        console.log('📋 Check tasks at: http://localhost:5005/api/db/stats\n');
    }
}

// Main execution
async function main() {
    const processor = new MasterDataProcessor();
    
    try {
        await processor.initialize();
        await processor.processAllFiles();
    } catch (error) {
        console.error('\n❌ Fatal Error:', error.message);
        process.exit(1);
    }
}

main();
