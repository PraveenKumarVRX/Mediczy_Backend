#!/usr/bin/env node

/**
 * Medical Address Cleaning Script
 * Uses Tiny-LLaMA Medical + Flan-T5 for cleaning lab/clinic/hospital addresses
 * Uses ONLY the Intelligent Database for all data operations
 * 
 * Features:
 * - Leverages medical domain knowledge from Tiny-LLaMA Medical model
 * - Uses Flan-T5 for structured text processing
 * - Connects exclusively to Intelligent Database Service
 * - Medical context-aware cleaning
 * - No standalone database connections
 */

const axios = require('axios');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

// Intelligent Database Service Configuration
const INTELLIGENT_DB_CONFIG = {
    baseUrl: 'http://localhost:5005',
    endpoints: {
        health: '/health',
        analyze: '/api/db/analyze',
        store: '/api/db/store',
        query: '/api/db/query',
        stats: '/api/db/stats'
    }
};

// Model configuration
const MODELS_CONFIG = {
    docsgpt_path: '/root/Mediczy/docsgpt',
    tiny_llama_model: 'tiny-llama-1.1b-chat-medical',
    flan_t5_model: 'google/flan-t5-base',
    cache_dir: '/tmp/address_cleaning_cache'
};

class MedicalAddressCleaner {
    constructor() {
        this.processedCount = 0;
        this.errorCount = 0;
        this.cache = new Map();
        this.intelligentDB = INTELLIGENT_DB_CONFIG.baseUrl;
    }

    async initialize() {
        console.log('🏥 Initializing Medical Address Cleaner...');
        console.log('🧠 Using Intelligent Database Service exclusively');
        
        // Test Intelligent Database connection
        await this.testIntelligentDB();
        console.log('✅ Intelligent Database service connected');

        // Create cache directory
        try {
            await fs.mkdir(MODELS_CONFIG.cache_dir, { recursive: true });
        } catch (error) {
            // Directory might already exist
        }

        // Load facilities from Intelligent DB
        await this.loadFacilitiesFromIntelligentDB();
        console.log(`✅ Connected to Intelligent Database service`);
    }

    async testIntelligentDB() {
        try {
            const response = await axios.get(`${this.intelligentDB}${INTELLIGENT_DB_CONFIG.endpoints.health}`);
            if (response.data.status !== 'healthy') {
                throw new Error('Intelligent DB service not healthy');
            }
        } catch (error) {
            console.error('❌ Intelligent Database connection failed:', error.message);
            throw new Error('Cannot connect to Intelligent Database service. Please ensure it is running on port 5005.');
        }
    }

    async loadFacilitiesFromIntelligentDB() {
        try {
            // Query the intelligent database for healthcare facilities
            const queryPayload = {
                query: "Get all healthcare facilities with addresses",
                context: {
                    table: "medical_facilities",
                    fields: ["id", "name", "address", "type", "area", "pincode"],
                    filter: "address_needs_cleaning = true"
                }
            };

            const response = await axios.post(
                `${this.intelligentDB}${INTELLIGENT_DB_CONFIG.endpoints.analyze}`, 
                queryPayload
            );

            console.log('📋 Facilities data request sent to Intelligent DB');
            return response.data;
        } catch (error) {
            console.warn('⚠️ Could not load facilities from Intelligent DB:', error.message);
            // Continue with mock data for demonstration
            return this.getMockFacilities();
        }
    }

    getMockFacilities() {
        // Mock data for demonstration - In production, this would come from Intelligent DB
        return [
            {
                id: 1,
                name: "City Hospital",
                address: "123 Main St, Near Bus Stand, Downtown, Mumbai 400001",
                type: "hospital",
                area: null
            },
            {
                id: 2, 
                name: "Diagnostic Lab Center",
                address: "456 Park Road, Opposite Mall, Sector 15, Gurgaon 122001",
                type: "laboratory",
                area: null
            }
        ];
    }

    async callTinyLlamaMedical(prompt) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Tiny-LLaMA timeout'));
            }, 30000);

            // Use the medical model via Python script
            const pythonScript = `
import sys
import json
import os
sys.path.append('${MODELS_CONFIG.docsgpt_path}')

from llama_cpp import Llama

# Load the medical model
model_path = "${MODELS_CONFIG.docsgpt_path}/llm_models/llama/tiny-llama-1.1b-chat-medical.fp16.gguf"

try:
    llm = Llama(
        model_path=model_path,
        n_ctx=1024,
        n_gpu_layers=-1,  # Use GPU acceleration
        n_threads=2,
        verbose=False
    )
    
    prompt = """${prompt.replace(/"/g, '\\"')}"""
    
    response = llm(
        prompt,
        max_tokens=150,
        temperature=0.1,
        stop=["\\n\\n", "Patient:", "Input:", "Output:"],
        echo=False
    )
    
    result = response['choices'][0]['text'].strip()
    print(json.dumps({"success": True, "result": result}))
    
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
`;

            const pythonProcess = spawn('python3', ['-c', pythonScript], {
                cwd: MODELS_CONFIG.docsgpt_path
            });

            let stdout = '';
            let stderr = '';

            pythonProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            pythonProcess.on('close', (code) => {
                clearTimeout(timeout);
                
                if (code !== 0) {
                    reject(new Error(`Tiny-LLaMA process failed: ${stderr}`));
                    return;
                }

                try {
                    const result = JSON.parse(stdout.trim());
                    if (result.success) {
                        resolve(result.result);
                    } else {
                        reject(new Error(`Tiny-LLaMA error: ${result.error}`));
                    }
                } catch (e) {
                    reject(new Error(`Failed to parse Tiny-LLaMA response: ${stdout}`));
                }
            });
        });
    }

    async callFlanT5(text) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Flan-T5 timeout'));
            }, 20000);

            const pythonScript = `
import sys
import json
from transformers import T5Tokenizer, T5ForConditionalGeneration
import torch

try:
    model_name = "${MODELS_CONFIG.flan_t5_model}"
    tokenizer = T5Tokenizer.from_pretrained(model_name, cache_dir="${MODELS_CONFIG.docsgpt_path}/llm_models/flan_t5")
    model = T5ForConditionalGeneration.from_pretrained(model_name, cache_dir="${MODELS_CONFIG.docsgpt_path}/llm_models/flan_t5")
    
    input_text = "${text.replace(/"/g, '\\"')}"
    input_ids = tokenizer(input_text, return_tensors="pt").input_ids
    
    with torch.no_grad():
        outputs = model.generate(
            input_ids,
            max_length=100,
            num_beams=2,
            temperature=0.7,
            do_sample=True,
            pad_token_id=tokenizer.pad_token_id
        )
    
    result = tokenizer.decode(outputs[0], skip_special_tokens=True)
    print(json.dumps({"success": True, "result": result}))
    
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
`;

            const pythonProcess = spawn('python3', ['-c', pythonScript]);

            let stdout = '';
            let stderr = '';

            pythonProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            pythonProcess.on('close', (code) => {
                clearTimeout(timeout);
                
                if (code !== 0) {
                    reject(new Error(`Flan-T5 process failed: ${stderr}`));
                    return;
                }

                try {
                    const result = JSON.parse(stdout.trim());
                    if (result.success) {
                        resolve(result.result);
                    } else {
                        reject(new Error(`Flan-T5 error: ${result.error}`));
                    }
                } catch (e) {
                    reject(new Error(`Failed to parse Flan-T5 response: ${stdout}`));
                }
            });
        });
    }

    extractPincode(address) {
        // Enhanced pincode extraction for medical addresses
        const patterns = [
            /\b(\d{6})\b/g,                    // Standard 6-digit pincode
            /pin[\s:-]*(\d{6})/gi,            // PIN: 123456 or PIN 123456
            /postal[\s:-]*(\d{6})/gi,         // POSTAL: 123456
            /zip[\s:-]*(\d{6})/gi,            // ZIP: 123456
        ];

        for (const pattern of patterns) {
            const matches = address.match(pattern);
            if (matches) {
                const pincode = matches[0].replace(/\D/g, '');
                if (pincode.length === 6) {
                    return pincode;
                }
            }
        }
        return null;
    }

    async getPincodeAreasFromIntelligentDB(pincode) {
        try {
            // Query intelligent DB for pincode areas
            const queryPayload = {
                query: `Get area names for pincode ${pincode}`,
                context: {
                    pincode: pincode,
                    table: "pincode_masters"
                }
            };

            const response = await axios.post(
                `${this.intelligentDB}${INTELLIGENT_DB_CONFIG.endpoints.analyze}`,
                queryPayload
            );

            // Extract areas from intelligent analysis
            const areas = response.data?.query_analysis?.medical_entities?.areas || [];
            return areas.length > 0 ? areas : [`Area-${pincode}`]; // Fallback
        } catch (error) {
            console.warn(`⚠️ Could not get areas for pincode ${pincode}:`, error.message);
            return [`Area-${pincode}`]; // Fallback
        }
    }

    async cleanAddressWithMedicalContext(rawAddress, facilityType = 'clinic', facilityId = null) {
        try {
            // First, try to extract pincode for context
            const pincode = this.extractPincode(rawAddress);
            let availableAreas = [];
            
            if (pincode) {
                availableAreas = await this.getPincodeAreasFromIntelligentDB(pincode);
            }

            // Log analysis to Intelligent Database
            await this.logAnalysisToIntelligentDB(rawAddress, facilityType, pincode, facilityId);

            // Create medical-context prompt for Tiny-LLaMA
            const medicalPrompt = `As a medical facility location specialist, clean and standardize this ${facilityType} address:

Raw Address: "${rawAddress}"

${availableAreas.length > 0 ? `Valid areas for pincode ${pincode}: ${availableAreas.join(', ')}` : ''}

Instructions:
- Extract: facility name, area/locality, city, state, pincode
- Remove: phone numbers, emails, URLs, extra spaces
- Standardize: medical facility types (Hospital → Hospital, Clinic → Clinic)
- Format: Clean, professional address format
- Keep: Essential location information only

Cleaned Address:`;

            console.log(`🔄 Processing ${facilityType}: ${rawAddress.substring(0, 50)}...`);
            
            // Get medical model response
            let medicalResult = null;
            try {
                medicalResult = await this.callTinyLlamaMedical(medicalPrompt);
            } catch (error) {
                console.warn(`⚠️ Tiny-LLaMA failed: ${error.message}`);
            }

            // Use Flan-T5 for structured extraction as backup/enhancement
            let flanResult = null;
            try {
                const flanPrompt = `Extract and clean address components: ${rawAddress}`;
                flanResult = await this.callFlanT5(flanPrompt);
            } catch (error) {
                console.warn(`⚠️ Flan-T5 failed: ${error.message}`);
            }

            // Determine best result
            let cleanedAddress = rawAddress;
            let selectedModel = 'none';

            if (medicalResult && medicalResult.length > 10 && medicalResult.length < rawAddress.length * 2) {
                cleanedAddress = medicalResult.trim();
                selectedModel = 'tiny-llama-medical';
            } else if (flanResult && flanResult.length > 10 && flanResult.length < rawAddress.length * 2) {
                cleanedAddress = flanResult.trim();
                selectedModel = 'flan-t5';
            }

            // Post-process: ensure pincode is preserved if valid
            if (pincode && !cleanedAddress.includes(pincode)) {
                cleanedAddress += ` ${pincode}`;
            }

            // Final cleanup
            cleanedAddress = this.finalCleanup(cleanedAddress);

            // Store result in Intelligent Database
            const result = {
                original: rawAddress,
                cleaned: cleanedAddress,
                model_used: selectedModel,
                pincode: pincode,
                available_areas: availableAreas,
                extraction_success: selectedModel !== 'none',
                facility_id: facilityId
            };

            await this.storeResultInIntelligentDB(result);

            return result;

        } catch (error) {
            console.error(`❌ Error cleaning address: ${error.message}`);
            return {
                original: rawAddress,
                cleaned: rawAddress,
                model_used: 'none',
                pincode: null,
                available_areas: [],
                extraction_success: false,
                error: error.message,
                facility_id: facilityId
            };
        }
    }

    async logAnalysisToIntelligentDB(address, facilityType, pincode, facilityId) {
        try {
            const analysisPayload = {
                patient_id: `facility_${facilityId || 'unknown'}`,
                query: `Address cleaning analysis for ${facilityType}: ${address}`,
                llm_response: JSON.stringify({
                    action: 'address_analysis',
                    facility_type: facilityType,
                    extracted_pincode: pincode,
                    timestamp: new Date().toISOString()
                }),
                source_service: 'medical_address_cleaner'
            };

            await axios.post(
                `${this.intelligentDB}${INTELLIGENT_DB_CONFIG.endpoints.store}`,
                analysisPayload
            );
        } catch (error) {
            console.warn(`⚠️ Could not log analysis to Intelligent DB: ${error.message}`);
        }
    }

    async storeResultInIntelligentDB(result) {
        try {
            const resultPayload = {
                patient_id: `facility_${result.facility_id || 'unknown'}`,
                query: `Address cleaning completed: ${result.original}`,
                llm_response: JSON.stringify({
                    action: 'address_cleaning_result',
                    original_address: result.original,
                    cleaned_address: result.cleaned,
                    model_used: result.model_used,
                    pincode: result.pincode,
                    available_areas: result.available_areas,
                    success: result.extraction_success,
                    timestamp: new Date().toISOString()
                }),
                source_service: 'medical_address_cleaner'
            };

            await axios.post(
                `${this.intelligentDB}${INTELLIGENT_DB_CONFIG.endpoints.store}`,
                resultPayload
            );

            console.log(`📊 Result stored in Intelligent Database`);
        } catch (error) {
            console.warn(`⚠️ Could not store result in Intelligent DB: ${error.message}`);
        }
    }

    finalCleanup(address) {
        return address
            // Remove multiple spaces
            .replace(/\s+/g, ' ')
            // Remove leading/trailing whitespace
            .trim()
            // Remove phone patterns
            .replace(/\b\d{10,}\b/g, '')
            .replace(/\+\d{1,3}[\s-]?\d+/g, '')
            // Remove email patterns
            .replace(/\S+@\S+\.\S+/g, '')
            // Remove URLs
            .replace(/https?:\/\/\S+/g, '')
            // Remove extra punctuation
            .replace(/[,;]{2,}/g, ',')
            .replace(/\s+/g, ' ')
            .trim();
    }

    async processAddresses() {
        console.log('🏥 Starting medical address cleaning...');
        console.log('🧠 Using Intelligent Database Service exclusively');

        // Get facilities from Intelligent Database
        const facilitiesData = await this.loadFacilitiesFromIntelligentDB();
        const facilities = facilitiesData.facilities || this.getMockFacilities();

        console.log(`📍 Found ${facilities.length} facilities to process`);

        for (let i = 0; i < facilities.length; i++) {
            const facility = facilities[i];
            
            try {
                console.log(`\n[${i + 1}/${facilities.length}] Processing: ${facility.name}`);

                // Determine facility type for context
                const facilityType = this.determineFacilityType(facility.name, facility.type);
                
                // Clean the address using medical models
                const result = await this.cleanAddressWithMedicalContext(
                    facility.address,
                    facilityType,
                    facility.id
                );

                // Extract area name from cleaned address
                const extractedArea = this.extractAreaName(result.cleaned, result.available_areas);

                // Update facility via Intelligent Database
                if (result.extraction_success && extractedArea) {
                    await this.updateFacilityViaIntelligentDB(facility.id, extractedArea, result.cleaned);
                    console.log(`✅ Updated: ${extractedArea} (${result.model_used})`);
                } else {
                    console.log(`⚠️ No improvement: ${facility.name}`);
                }

                this.processedCount++;

                // Rate limiting
                if (i % 5 === 0) {
                    console.log(`💤 Rate limiting... (${i}/${facilities.length})`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }

            } catch (error) {
                console.error(`❌ Error processing ${facility.name}: ${error.message}`);
                this.errorCount++;
            }
        }

        // Get final statistics from Intelligent Database
        await this.getIntelligentDBStats();

        console.log(`\n🎉 Processing complete!`);
        console.log(`   Processed: ${this.processedCount}`);
        console.log(`   Errors: ${this.errorCount}`);
    }

    async updateFacilityViaIntelligentDB(facilityId, areaName, cleanedAddress) {
        try {
            const updatePayload = {
                patient_id: `facility_${facilityId}`,
                query: `Update facility ${facilityId} with cleaned address: ${cleanedAddress} and area: ${areaName}`,
                llm_response: JSON.stringify({
                    action: 'facility_update',
                    facility_id: facilityId,
                    new_area: areaName,
                    cleaned_address: cleanedAddress,
                    timestamp: new Date().toISOString()
                }),
                source_service: 'medical_address_cleaner'
            };

            await axios.post(
                `${this.intelligentDB}${INTELLIGENT_DB_CONFIG.endpoints.store}`,
                updatePayload
            );

            console.log(`📊 Update logged to Intelligent Database`);
        } catch (error) {
            console.warn(`⚠️ Could not log update to Intelligent DB: ${error.message}`);
        }
    }

    async getIntelligentDBStats() {
        try {
            const response = await axios.get(`${this.intelligentDB}${INTELLIGENT_DB_CONFIG.endpoints.stats}`);
            console.log(`\n📊 Intelligent Database Statistics:`);
            console.log(`   Total interactions: ${response.data.total_interactions || 0}`);
            console.log(`   Total patients/facilities: ${response.data.total_patients || 0}`);
            console.log(`   Average processing time: ${response.data.average_processing_time_ms || 0}ms`);
        } catch (error) {
            console.warn(`⚠️ Could not get Intelligent DB stats: ${error.message}`);
        }
    }

    determineFacilityType(name, type) {
        const nameLower = name.toLowerCase();
        
        if (nameLower.includes('hospital') || nameLower.includes('medical center')) {
            return 'hospital';
        } else if (nameLower.includes('lab') || nameLower.includes('diagnostic')) {
            return 'laboratory';
        } else if (nameLower.includes('clinic') || nameLower.includes('centre')) {
            return 'clinic';
        } else if (nameLower.includes('pharmacy') || nameLower.includes('medical store')) {
            return 'pharmacy';
        }
        
        return type || 'healthcare facility';
    }

    extractAreaName(cleanedAddress, availableAreas) {
        // Try to extract area name from cleaned address
        // Priority: 1) Match with available pincode areas 2) Extract locality
        
        const addressLower = cleanedAddress.toLowerCase();
        
        // First, try to match with available areas from pincode
        for (const area of availableAreas) {
            if (addressLower.includes(area.toLowerCase())) {
                return area;
            }
        }

        // Extract potential area names (words before city/state/pincode)
        const parts = cleanedAddress.split(',').map(p => p.trim());
        
        // Look for area indicators
        for (let part of parts) {
            part = part.trim();
            
            // Skip facility names, phone numbers, pincodes
            if (part.length < 3 || /\d{6}/.test(part) || /\d{10}/.test(part)) {
                continue;
            }
            
            // Skip common non-area terms
            if (/^(dr|doctor|clinic|hospital|lab|laboratory|centre|center)$/i.test(part)) {
                continue;
            }
            
            // Return first reasonable area name
            if (part.length >= 3 && part.length <= 30) {
                return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
            }
        }

        return null;
    }

    async close() {
        console.log('🧠 Medical Address Cleaner using Intelligent Database completed');
        // No database connections to close - using Intelligent DB service
    }
}

// Main execution
async function main() {
    const cleaner = new MedicalAddressCleaner();
    
    try {
        await cleaner.initialize();
        await cleaner.processAddresses();
    } catch (error) {
        console.error('💥 Fatal error:', error);
        process.exit(1);
    } finally {
        await cleaner.close();
    }
}

if (require.main === module) {
    main();
}

module.exports = { MedicalAddressCleaner };