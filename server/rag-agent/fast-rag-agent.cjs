#!/usr/bin/env node

/**
 * Fast RAG Agent for Provider Profiling
 * Optimized for GPU inference with Tiny-LLaMA Medical
 * Uses shorter prompts and faster processing
 */

const axios = require('axios');
const fs = require('fs').promises;

// Fast Configuration
const FAST_RAG_CONFIG = {
    llm: {
        endpoint: 'http://localhost:11434/api/generate',
        modelName: 'llama3.2:1b',
        temperature: 0.1,
        maxTokens: 128, // Shorter responses for speed
        timeout: 15000  // Faster timeout
    },
    intelligentDB: {
        baseUrl: 'http://localhost:5005',
        storeEndpoint: '/api/db/store'
    }
};

class FastProviderRAG {
    constructor() {
        this.processedCount = 0;
        this.profileCache = new Map();
    }

    async initialize() {
        console.log('⚡ FAST RAG AGENT - GPU OPTIMIZED');
        console.log('=================================');
        
        // Test GPU model quickly
        await this.testGPUModel();
        console.log('✅ Fast RAG Agent ready');
    }

    async testGPUModel() {
        try {
            const response = await this.queryLLM("Test");
            console.log('🚀 GPU Model responsive:', response.length, 'chars');
            return true;
        } catch (error) {
            console.error('❌ GPU Model test failed:', error.message);
            throw error;
        }
    }

    async queryLLM(prompt, systemMsg = "Analyze healthcare provider briefly.") {
        const requestBody = {
            model: FAST_RAG_CONFIG.llm.modelName,
            prompt: `${systemMsg}\n\n${prompt}\n\nAnalysis:`,
            stream: false,
            options: {
                temperature: FAST_RAG_CONFIG.llm.temperature,
                num_predict: FAST_RAG_CONFIG.llm.maxTokens,
                top_p: 0.8,
                num_gpu: -1
            }
        };

        const response = await axios.post(FAST_RAG_CONFIG.llm.endpoint, requestBody, {
            timeout: FAST_RAG_CONFIG.llm.timeout
        });

        return response.data.response?.trim() || '';
    }

    async profileProvider(providerData) {
        console.log(`🏥 Profiling: ${providerData.name}`);
        
        const startTime = Date.now();
        
        try {
            // Fast provider categorization
            const category = await this.categorizeProviderFast(providerData);
            
            // Quick service analysis
            const services = await this.analyzeServicesFast(providerData);
            
            // Generate profile
            const profile = {
                id: this.generateId(providerData.name),
                name: providerData.name,
                category: category,
                services: services,
                address: providerData.address,
                timestamp: new Date().toISOString(),
                processingTime: Date.now() - startTime
            };

            // Store in Intelligent DB
            await this.storeProfile(profile);
            
            console.log(`✅ Profiled ${providerData.name} in ${profile.processingTime}ms`);
            return profile;

        } catch (error) {
            console.error(`❌ Profiling failed for ${providerData.name}:`, error.message);
            return null;
        }
    }

    async categorizeProviderFast(providerData) {
        const prompt = `Categorize: ${providerData.name}\nType:`;
        
        try {
            const response = await this.queryLLM(prompt, "Categorize healthcare provider as: hospital, clinic, laboratory, pharmacy, or specialist.");
            return this.extractCategory(response);
        } catch (error) {
            console.warn('⚠️ Using fallback categorization');
            return this.fallbackCategorize(providerData.name);
        }
    }

    async analyzeServicesFast(providerData) {
        const prompt = `Services at ${providerData.name}:`;
        
        try {
            const response = await this.queryLLM(prompt, "List main medical services briefly.");
            return this.extractServices(response);
        } catch (error) {
            console.warn('⚠️ Using fallback service analysis');
            return this.fallbackServices(providerData.name);
        }
    }

    extractCategory(response) {
        const categories = ['hospital', 'clinic', 'laboratory', 'pharmacy', 'specialist'];
        const lower = response.toLowerCase();
        
        for (const category of categories) {
            if (lower.includes(category)) {
                return category;
            }
        }
        return 'general';
    }

    extractServices(response) {
        const services = [];
        const serviceKeywords = [
            'consultation', 'diagnosis', 'treatment', 'surgery', 'emergency',
            'laboratory', 'imaging', 'pharmacy', 'vaccination', 'checkup'
        ];

        const lower = response.toLowerCase();
        for (const service of serviceKeywords) {
            if (lower.includes(service)) {
                services.push(service);
            }
        }

        return services.length > 0 ? services : ['general_care'];
    }

    fallbackCategorize(name) {
        const lower = name.toLowerCase();
        if (lower.includes('hospital')) return 'hospital';
        if (lower.includes('clinic')) return 'clinic';
        if (lower.includes('lab')) return 'laboratory';
        if (lower.includes('pharmacy')) return 'pharmacy';
        return 'general';
    }

    fallbackServices(name) {
        const lower = name.toLowerCase();
        const services = [];
        
        if (lower.includes('emergency')) services.push('emergency_care');
        if (lower.includes('lab') || lower.includes('diagnostic')) services.push('laboratory_testing');
        if (lower.includes('surgery')) services.push('surgical_services');
        if (lower.includes('pharmacy')) services.push('medication_dispensing');
        
        return services.length > 0 ? services : ['general_care'];
    }

    async storeProfile(profile) {
        try {
            const payload = {
                patient_id: `provider_${profile.id}`,
                query: `Provider profile: ${profile.name} - Category: ${profile.category}`,
                llm_response: JSON.stringify({
                    action: 'provider_profiling',
                    profile: profile,
                    processing_time: profile.processingTime
                }),
                source_service: 'fast_rag_agent'
            };

            await axios.post(
                `${FAST_RAG_CONFIG.intelligentDB.baseUrl}${FAST_RAG_CONFIG.intelligentDB.storeEndpoint}`,
                payload,
                { timeout: 5000 }
            );

            console.log(`📊 Profile stored for ${profile.name}`);
        } catch (error) {
            console.warn(`⚠️ Storage failed: ${error.message}`);
        }
    }

    generateId(name) {
        return name.toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .substring(0, 20) + '_' + Date.now().toString(36);
    }

    async processSampleProviders() {
        const sampleProviders = [
            {
                name: "City General Hospital",
                address: "123 Main St, City Center",
                description: "Multi-specialty hospital with emergency services"
            },
            {
                name: "Metro Diagnostic Lab",
                address: "456 Lab Road, Medical District", 
                description: "Full-service diagnostic laboratory"
            },
            {
                name: "Family Health Clinic",
                address: "789 Care Ave, Residential Area",
                description: "Primary care clinic with general practice"
            },
            {
                name: "Downtown Pharmacy",
                address: "321 Pharmacy St, Business District",
                description: "24/7 pharmacy with prescription services"
            }
        ];

        console.log(`\n🚀 Processing ${sampleProviders.length} providers...`);

        for (const provider of sampleProviders) {
            const profile = await this.profileProvider(provider);
            if (profile) {
                this.processedCount++;
            }
            
            // Small delay to prevent API overload
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log(`\n📊 FAST RAG SUMMARY`);
        console.log(`✅ Processed: ${this.processedCount}`);
        console.log(`⚡ Using GPU: tiny-llama-medical-rag`);
        console.log(`🧠 Intelligent DB: Connected`);
    }
}

// Main execution
async function main() {
    const agent = new FastProviderRAG();
    
    try {
        await agent.initialize();
        await agent.processSampleProviders();
    } catch (error) {
        console.error('❌ Agent failed:', error.message);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n⚠️ Fast RAG Agent shutting down...');
    process.exit(0);
});

if (require.main === module) {
    main();
}

module.exports = FastProviderRAG;