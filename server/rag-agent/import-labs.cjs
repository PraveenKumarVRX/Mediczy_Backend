#!/usr/bin/env node

/**
 * Import Labs from Excel using Provider Profiling RAG Agent
 * Processes lab data with intelligent task management
 */

const XLSX = require('xlsx');
const fs = require('fs').promises;
const path = require('path');

// Import the RAG Agent
const { ProviderProfilingRAGAgent } = require('./provider-profiling-agent.cjs');

const LAB_FILE = '../../server/db/Master Data/Labs/labs list.xlsx';

class LabImporter {
    constructor() {
        this.ragAgent = null;
        this.stats = {
            total: 0,
            processed: 0,
            success: 0,
            errors: 0,
            errorDetails: []
        };
    }

    async initialize() {
        console.log('🧪 LAB IMPORTER - RAG AGENT MODE');
        console.log('='.repeat(70));
        
        // Initialize RAG Agent
        this.ragAgent = new ProviderProfilingRAGAgent();
        await this.ragAgent.initialize();
        
        console.log('\n✅ Lab Importer Ready\n');
    }

    async loadLabData() {
        console.log('📂 Loading lab data from Excel...');
        
        const filePath = path.join(__dirname, LAB_FILE);
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
        
        this.stats.total = data.length;
        console.log(`✅ Loaded ${data.length} labs\n`);
        
        return data;
    }

    normalizeLabData(lab) {
        return {
            name: lab.entity_name || 'Unknown Lab',
            address: lab.Full_Address || lab['Full Address'] || 
                     `${lab.entity_address || ''}, ${lab.city || ''}, ${lab.state || ''} ${lab.pincode || ''}`.trim(),
            city: lab.city || '',
            state: lab.state || '',
            pincode: lab.pincode || '',
            latitude: lab.Latitude || null,
            longitude: lab.Longitude || null,
            discipline: lab.discipline || 'General Laboratory',
            type: 'laboratory',
            services: 'Diagnostic Testing, Laboratory Services, Pathology',
            description: `Laboratory services in ${lab.city || 'India'}`
        };
    }

    async processLabs(labs, batchSize = 50) {
        console.log(`🔄 Processing ${labs.length} labs in batches of ${batchSize}...\n`);
        
        for (let i = 0; i < labs.length; i += batchSize) {
            const batch = labs.slice(i, i + batchSize);
            const batchNum = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(labs.length / batchSize);
            
            console.log(`📦 Batch ${batchNum}/${totalBatches} (${batch.length} labs)`);
            
            const results = await this.processBatch(batch);
            
            // Update stats
            results.forEach(result => {
                if (result.success) {
                    this.stats.success++;
                } else {
                    this.stats.errors++;
                    this.stats.errorDetails.push({
                        lab: result.lab,
                        error: result.error
                    });
                }
            });
            
            this.stats.processed += batch.length;
            
            // Progress indicator
            const progress = ((this.stats.processed / this.stats.total) * 100).toFixed(1);
            console.log(`   ✓ Success: ${this.stats.success} | ✗ Errors: ${this.stats.errors} | Progress: ${progress}%\n`);
            
            // Small delay between batches
            if (i + batchSize < labs.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
    }

    async processBatch(batch) {
        const promises = batch.map(async (lab) => {
            try {
                const normalizedLab = this.normalizeLabData(lab);
                
                // Analyze provider using RAG agent
                const profile = await this.ragAgent.analyzeProvider(normalizedLab);
                
                return {
                    success: true,
                    lab: normalizedLab.name,
                    profile: profile
                };
            } catch (error) {
                return {
                    success: false,
                    lab: lab.entity_name || 'Unknown',
                    error: error.message
                };
            }
        });

        return await Promise.all(promises);
    }

    async generateReport() {
        console.log('\n' + '='.repeat(70));
        console.log('📊 IMPORT SUMMARY REPORT');
        console.log('='.repeat(70));
        console.log(`\n📈 Statistics:`);
        console.log(`   Total Labs:      ${this.stats.total}`);
        console.log(`   Processed:       ${this.stats.processed}`);
        console.log(`   ✅ Successful:   ${this.stats.success} (${((this.stats.success/this.stats.total)*100).toFixed(1)}%)`);
        console.log(`   ❌ Errors:       ${this.stats.errors} (${((this.stats.errors/this.stats.total)*100).toFixed(1)}%)`);
        
        if (this.stats.errorDetails.length > 0 && this.stats.errorDetails.length <= 10) {
            console.log(`\n⚠️  Error Details:`);
            this.stats.errorDetails.forEach((err, idx) => {
                console.log(`   ${idx + 1}. ${err.lab}: ${err.error}`);
            });
        } else if (this.stats.errorDetails.length > 10) {
            console.log(`\n⚠️  ${this.stats.errorDetails.length} errors occurred (showing first 5):`);
            this.stats.errorDetails.slice(0, 5).forEach((err, idx) => {
                console.log(`   ${idx + 1}. ${err.lab}: ${err.error}`);
            });
        }

        // Save detailed report
        const reportPath = '/tmp/lab_import_report.json';
        await fs.writeFile(reportPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            stats: this.stats,
            errors: this.stats.errorDetails
        }, null, 2));
        
        console.log(`\n💾 Detailed report saved: ${reportPath}`);
        console.log('\n✅ Lab import completed!\n');
    }

    async cleanup() {
        if (this.ragAgent) {
            await this.ragAgent.cleanup();
        }
    }
}

// Main execution
async function main() {
    const importer = new LabImporter();
    
    try {
        await importer.initialize();
        const labs = await importer.loadLabData();
        await importer.processLabs(labs);
        await importer.generateReport();
    } catch (error) {
        console.error('\n❌ Fatal Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        await importer.cleanup();
    }
}

// Run if executed directly
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = LabImporter;
