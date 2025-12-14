#!/usr/bin/env node

/**
 * RAG Agent for Provider Profiling & Transaction Management
 * Using Tiny-LLaMA Medical Model for Intelligent Healthcare Provider Analysis
 * 
 * Features:
 * - Provider profiling (Labs, Clinics, Doctors, Hospitals)
 * - Service categorization and analysis
 * - Transaction tracking and interconnectivity mapping
 * - RAG-based knowledge retrieval and augmentation
 * - Intelligent relationship mapping
 */

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Configuration
const RAG_CONFIG = {
    intelligentDB: {
        baseUrl: 'http://localhost:5005',
        endpoints: {
            health: '/health',
            analyze: '/api/db/analyze',
            store: '/api/db/store',
            query: '/api/db/query',
            stats: '/api/db/stats'
        }
    },
    tinyLlama: {
        useLlamaCpp: true,
        modelPath: '/home/ubuntu/Mediczy/docsgpt/llm_models/llama/tiny-llama-1.1b-chat-medical.fp16.gguf',
        maxTokens: 150,
        temperature: 0.3,
        useGPU: false,
        contextSize: 512,
        threads: 4,
        batchSize: 256
    },
    embedding: {
        dimension: 384, // For sentence-transformer models
        similarity_threshold: 0.7
    },
    cache: {
        dir: '/tmp/rag_cache',
        ttl: 3600 // 1 hour
    }
};

class ProviderProfilingRAGAgent {
    constructor() {
        this.cache = new Map();
        this.vectorStore = new Map();
        this.providerProfiles = new Map();
        this.transactionGraph = new Map();
        this.serviceCategories = this.initializeServiceCategories();
        this.providerTypes = this.initializeProviderTypes();
    }

    async initialize() {
        console.log('🤖 Initializing Provider Profiling RAG Agent...');
        
        // Setup directories
        await this.setupDirectories();
        
        // Connect to Intelligent Database
        await this.connectToIntelligentDB();
        
        // Initialize Tiny-LLaMA model
        await this.initializeTinyLlama();
        
        // Load existing provider profiles
        await this.loadExistingProfiles();
        
        console.log('✅ RAG Agent initialized successfully');
    }

    async setupDirectories() {
        try {
            await fs.mkdir(RAG_CONFIG.cache.dir, { recursive: true });
            await fs.mkdir(path.join(RAG_CONFIG.cache.dir, 'profiles'), { recursive: true });
            await fs.mkdir(path.join(RAG_CONFIG.cache.dir, 'vectors'), { recursive: true });
            await fs.mkdir(path.join(RAG_CONFIG.cache.dir, 'transactions'), { recursive: true });
        } catch (error) {
            console.warn('⚠️ Directory setup warning:', error.message);
        }
    }

    async connectToIntelligentDB() {
        try {
            const response = await axios.get(`${RAG_CONFIG.intelligentDB.baseUrl}${RAG_CONFIG.intelligentDB.endpoints.health}`);
            if (response.data.status !== 'healthy') {
                throw new Error('Intelligent DB not healthy');
            }
            console.log('✅ Connected to Intelligent Database');
        } catch (error) {
            console.error('❌ Intelligent Database connection failed:', error.message);
            throw error;
        }
    }

    async initializeTinyLlama() {
        console.log('🚀 Initializing Tiny-LLaMA Medical 1.1B via llama.cpp...');
        
        try {
            // Check if model file exists
            const modelExists = await fs.access(RAG_CONFIG.tinyLlama.modelPath)
                .then(() => true)
                .catch(() => false);

            if (!modelExists) {
                throw new Error(`Model file not found: ${RAG_CONFIG.tinyLlama.modelPath}`);
            }
            
            console.log('✅ Tiny-LLaMA Medical model file found');
            console.log('📍 Model path:', RAG_CONFIG.tinyLlama.modelPath);

            // Test inference with llama.cpp
            await this.testLlamaCppInference();
            
            console.log('🎯 Tiny-LLaMA Medical 1.1B initialization complete');

        } catch (error) {
            console.error('❌ Initialization failed:', error.message);
            throw new Error('Failed to initialize Tiny-LLaMA: ' + error.message);
        }
    }

    async pullLlama31Model() {
        // Legacy method - redirects to import
        return await this.importTinyLlamaModel();
    }

    async testLlamaCppInference() {
        try {
            console.log('🧪 Testing Tiny-LLaMA inference with llama.cpp...');
            
            const testPrompt = "What is a hospital?";
            
            const response = await this.queryTinyLlamaViaCpp(testPrompt);
            
            if (response && response.length > 5) {
                console.log('✅ Tiny-LLaMA inference working correctly');
                console.log('📊 Test response:', response.substring(0, 100) + '...');
                return true;
            } else {
                throw new Error('Invalid response from Tiny-LLaMA');
            }
        } catch (error) {
            console.error('❌ Tiny-LLaMA test failed:', error.message);
            throw error;
        }
    }

    async queryTinyLlamaViaCpp(prompt, systemMessage = null) {
        try {
            const fullSystemMessage = systemMessage || 
                "You are a medical data analyst specializing in healthcare provider profiling. Analyze provider information concisely.";

            const fullPrompt = `${fullSystemMessage}\n\nUser: ${prompt}\n\nAssistant:`;

            // Use Python script for llama.cpp
            const scriptPath = path.join(__dirname, 'query-tinyllama.py');
            const escapedPrompt = fullPrompt.replace(/'/g, "'\"'\"'");
            
            const command = `python3 '${scriptPath}' '${RAG_CONFIG.tinyLlama.modelPath}' '${escapedPrompt}' ${RAG_CONFIG.tinyLlama.maxTokens} ${RAG_CONFIG.tinyLlama.temperature}`;

            const { stdout, stderr } = await execAsync(command, {
                timeout: 30000,
                maxBuffer: 1024 * 1024
            });

            if (stderr && !stdout) {
                throw new Error(`llama.cpp error: ${stderr}`);
            }

            const result = JSON.parse(stdout.trim());
            
            if (!result.success) {
                throw new Error(result.error || 'Unknown error from Tiny-LLaMA');
            }

            return result.response;

        } catch (error) {
            console.error('❌ Tiny-LLaMA query failed:', error.message);
            throw error;
        }
    }

    // Alias for compatibility
    async queryTinyLlamaGPU(prompt, systemMessage = null) {
        return await this.queryTinyLlamaViaCpp(prompt, systemMessage);
    }

    async importTinyLlamaModel() {
        try {
            // Check if model already exists in Ollama
            const listResponse = await axios.get('http://localhost:11434/api/tags');
            const existingModels = listResponse.data.models || [];
            
            const modelExists = existingModels.some(model => 
                model.name.includes('tiny-llama-medical-rag')
            );

            if (!modelExists) {
                console.log('📦 Importing Tiny-LLaMA for RAG operations...');
                
                // Create enhanced Modelfile for RAG using local GGUF file
                const modelfile = `FROM ${RAG_CONFIG.tinyLlama.modelPath}
TEMPLATE """<|system|>
You are a medical provider profiling and relationship analysis expert. You analyze healthcare providers (labs, clinics, doctors, hospitals) and their interconnections.
Focus on:
1. Provider categorization and service analysis
2. Transaction pattern recognition
3. Network relationship mapping
4. Quality and compliance assessment
5. Service capability profiling

Provide structured, factual responses based on the given context.
<|im_end|>
<|im_start|>user
{{ .Prompt }}
<|im_end|>
<|im_start|>assistant"""

PARAMETER stop "<|im_end|>"
PARAMETER temperature 0.2
PARAMETER top_p 0.9
PARAMETER top_k 40`;

                // Save Modelfile
                const modelfilePath = '/tmp/Modelfile.rag';
                await fs.writeFile(modelfilePath, modelfile);

                // Import model using Ollama CLI
                const { exec } = require('child_process');
                await new Promise((resolve, reject) => {
                    exec(`cd /tmp && ollama create ${RAG_CONFIG.tinyLlama.modelName} -f Modelfile.rag`, 
                        (error, stdout, stderr) => {
                            if (error) reject(error);
                            else resolve(stdout);
                        });
                });

                console.log('✅ Tiny-LLaMA RAG model imported successfully');
            }
        } catch (error) {
            console.warn('⚠️ Model import warning:', error.message);
        }
    }

    initializeServiceCategories() {
        return {
            diagnostic: {
                keywords: ['lab', 'laboratory', 'diagnostic', 'pathology', 'radiology', 'imaging', 'scan', 'test', 'blood', 'urine', 'xray', 'mri', 'ct'],
                services: ['blood_test', 'urine_test', 'imaging', 'pathology', 'microbiology', 'biochemistry']
            },
            clinical: {
                keywords: ['clinic', 'medical_center', 'health_center', 'consultation', 'checkup', 'treatment'],
                services: ['consultation', 'treatment', 'vaccination', 'minor_surgery', 'health_screening']
            },
            hospital: {
                keywords: ['hospital', 'medical_college', 'institute', 'emergency', 'icu', 'surgery', 'ward'],
                services: ['emergency_care', 'surgery', 'icu', 'ward_care', 'specialized_treatment', 'trauma_care']
            },
            specialized: {
                keywords: ['cardiology', 'neurology', 'oncology', 'orthopedic', 'pediatric', 'gynecology', 'dermatology'],
                services: ['specialist_consultation', 'specialized_procedures', 'chronic_care']
            },
            pharmacy: {
                keywords: ['pharmacy', 'medical_store', 'chemist', 'drug', 'medicine'],
                services: ['medication_dispensing', 'pharmaceutical_consultation', 'health_products']
            }
        };
    }

    initializeProviderTypes() {
        return {
            individual_doctor: {
                identifiers: ['dr', 'doctor', 'physician', 'md', 'mbbs'],
                profile_fields: ['specialization', 'qualification', 'experience', 'consultation_fee', 'availability']
            },
            clinic: {
                identifiers: ['clinic', 'medical_center', 'health_center'],
                profile_fields: ['services', 'doctors', 'equipment', 'capacity', 'operating_hours']
            },
            laboratory: {
                identifiers: ['lab', 'laboratory', 'diagnostic', 'pathology'],
                profile_fields: ['test_categories', 'equipment', 'accreditation', 'turnaround_time', 'sample_collection']
            },
            hospital: {
                identifiers: ['hospital', 'medical_college', 'institute'],
                profile_fields: ['departments', 'bed_capacity', 'emergency_services', 'specializations', 'facilities']
            },
            pharmacy: {
                identifiers: ['pharmacy', 'medical_store', 'chemist'],
                profile_fields: ['medication_categories', 'prescription_services', 'health_products', 'delivery_services']
            }
        };
    }

    async loadExistingProfiles() {
        try {
            // Load profiles from Intelligent Database
            const queryPayload = {
                query: "Retrieve all healthcare provider profiles",
                context: {
                    action: "load_profiles",
                    source: "rag_agent"
                }
            };

            const response = await axios.post(
                `${RAG_CONFIG.intelligentDB.baseUrl}${RAG_CONFIG.intelligentDB.endpoints.analyze}`,
                queryPayload
            );

            console.log('📋 Loaded existing provider profiles from Intelligent Database');
        } catch (error) {
            console.warn('⚠️ Could not load existing profiles:', error.message);
        }
    }

    async analyzeProvider(providerData) {
        console.log(`🏥 Analyzing: ${providerData.name || 'Unknown'}`);

        try {
            // Step 1: Categorize provider type
            const providerType = await this.categorizeProvider(providerData);
            
            // Step 2: Analyze services
            const serviceAnalysis = await this.analyzeProviderServicesWithGPU(providerData, providerType);
            
            // Step 3: Extract capabilities
            const capabilities = await this.extractCapabilities(providerData, serviceAnalysis);
            
            // Step 4: Generate profile
            const profileAnalysis = await this.generateProviderProfileWithGPU(providerData, providerType, serviceAnalysis, capabilities);
            
            // Step 5: Create provider record
            const providerProfile = {
                id: this.generateProviderId(providerData),
                timestamp: new Date().toISOString(),
                basic_info: {
                    name: providerData.name || 'Unknown Provider',
                    address: providerData.address || 'Not specified',
                    contact: {
                        phone: providerData.phone || '',
                        email: providerData.email || ''
                    }
                },
                classification: {
                    type: providerType.type || 'unknown',
                    sub_type: providerType.sub_type || 'general',
                    confidence: providerType.confidence || 0.5
                },
                services: serviceAnalysis.identified_services || ['General Services'],
                capabilities: capabilities || [],
                profile_analysis: profileAnalysis || {},
                quality_indicators: {
                    completeness: 0.7,
                    data_quality: 'good'
                },
                network_connections: []
            };

            // Store profile
            await this.storeProviderProfile(providerProfile);
            
            console.log(`✅ Complete: ${providerProfile.classification.type}`);
            return providerProfile;

        } catch (error) {
            console.error(`❌ Analysis error: ${error.message}`);
            // Return minimal profile instead of throwing
            return {
                id: this.generateProviderId(providerData),
                timestamp: new Date().toISOString(),
                basic_info: { name: providerData.name || 'Unknown' },
                classification: { type: 'unknown', sub_type: 'general', confidence: 0.3 },
                services: ['General Services'],
                capabilities: [],
                profile_analysis: { summary: 'Basic profile', confidence: 0.3 },
                error: error.message
            };
        }
    }

    async categorizeProvider(providerData) {
        const name = (providerData.name || '').toLowerCase();
        const address = (providerData.address || '').toLowerCase();
        const services = (providerData.services || '').toLowerCase();
        const allText = `${name} ${address} ${services}`.toLowerCase();

        let bestMatch = {
            type: 'unknown',
            sub_type: 'general',
            confidence: 0.0,
            keywords_matched: []
        };

        // Analyze against provider types
        for (const [type, config] of Object.entries(this.providerTypes)) {
            const matchedKeywords = config.identifiers.filter(keyword => 
                allText.includes(keyword)
            );

            const confidence = matchedKeywords.length / config.identifiers.length;
            
            if (confidence > bestMatch.confidence) {
                bestMatch = {
                    type,
                    sub_type: this.determineSubType(allText, type),
                    confidence,
                    keywords_matched: matchedKeywords
                };
            }
        }

        return bestMatch;
    }

    determineSubType(text, providerType) {
        const subTypePatterns = {
            individual_doctor: {
                'cardiologist': ['cardio', 'heart'],
                'neurologist': ['neuro', 'brain'],
                'orthopedic': ['orthopedic', 'bone', 'joint'],
                'pediatrician': ['pediatric', 'child', 'kids'],
                'gynecologist': ['gynec', 'women', 'obstetric']
            },
            clinic: {
                'multi_specialty': ['multi', 'general'],
                'dental': ['dental', 'teeth'],
                'eye': ['eye', 'vision', 'optical'],
                'skin': ['derma', 'skin']
            },
            laboratory: {
                'pathology': ['pathology', 'blood', 'tissue'],
                'radiology': ['radio', 'imaging', 'scan'],
                'microbiology': ['micro', 'culture']
            }
        };

        const patterns = subTypePatterns[providerType];
        if (!patterns) return 'general';

        for (const [subType, keywords] of Object.entries(patterns)) {
            if (keywords.some(keyword => text.includes(keyword))) {
                return subType;
            }
        }

        return 'general';
    }

    async analyzeProviderServices(providerData, providerType) {
        const allText = `${providerData.name || ''} ${providerData.address || ''} ${providerData.services || ''}`.toLowerCase();
        
        const identifiedServices = [];
        const serviceCategories = [];

        // Match against service categories
        for (const [category, config] of Object.entries(this.serviceCategories)) {
            const matchedKeywords = config.keywords.filter(keyword => 
                allText.includes(keyword)
            );

            if (matchedKeywords.length > 0) {
                serviceCategories.push({
                    category,
                    matched_keywords: matchedKeywords,
                    services: config.services,
                    confidence: matchedKeywords.length / config.keywords.length
                });

                identifiedServices.push(...config.services);
            }
        }

        return {
            identified_services: [...new Set(identifiedServices)],
            service_categories: serviceCategories,
            primary_category: serviceCategories.length > 0 ? serviceCategories[0].category : 'general'
        };
    }

    async extractCapabilities(providerData, serviceAnalysis) {
        try {
            // Generate capabilities from services without LLM
            return this.generateFallbackCapabilities(serviceAnalysis);
        } catch (error) {
            return ['General healthcare capability'];
        }
    }

    async generateProviderProfile(providerData, providerType, serviceAnalysis, capabilities) {
        const prompt = `Generate a comprehensive healthcare provider profile:

Provider Name: ${providerData.name}
Provider Type: ${providerType.type} (${providerType.sub_type})
Services: ${serviceAnalysis.identified_services.join(', ')}
Capabilities: ${JSON.stringify(capabilities, null, 2)}

Create a detailed provider profile including:
1. Provider classification and specialization
2. Service offerings and capabilities  
3. Quality indicators and certifications
4. Network positioning and partnerships
5. Patient care focus areas
6. Operational characteristics

Profile Analysis:`;

        try {
            const response = await this.callTinyLlama(prompt);
            return this.parseProfileAnalysis(response);
        } catch (error) {
            console.warn('⚠️ Profile generation failed, using structured fallback:', error.message);
            return this.generateFallbackProfile(providerType, serviceAnalysis, capabilities);
        }
    }

    async callTinyLlama(prompt) {
        try {
            // Use llama.cpp instead of Ollama
            return await this.queryTinyLlamaViaCpp(prompt);
        } catch (error) {
            console.error('❌ Tiny-LLaMA call failed:', error.message);
            throw error;
        }
    }

    async generateProviderProfileWithGPU(providerData, providerType, serviceAnalysis, capabilities) {
        try {
            // Use basic profile generation without LLM
            return this.generateBasicProfile(providerData, providerType, serviceAnalysis, capabilities);
        } catch (error) {
            console.error('❌ Profile generation error:', error.message);
            return {
                raw_analysis: `${providerData.name} - ${providerType.type} healthcare provider`,
                provider_category: providerType.type,
                quality_indicators: { data_completeness: 0.5 },
                specialization_areas: [],
                service_capabilities: serviceAnalysis.identified_services || [],
                operational_metrics: {},
                network_potential: 'standard',
                risk_assessment: 'low',
                confidence_score: 0.5,
                analysis_timestamp: new Date().toISOString()
            };
        }
    }

    async analyzeProviderServicesWithGPU(providerData, providerType) {
        try {
            // Use basic analysis without LLM to avoid errors
            return this.analyzeServicesBasic(providerData, providerType);
        } catch (error) {
            console.warn('⚠️ Service analysis fallback:', error.message);
            return {
                identified_services: this.getDefaultServicesForType(providerType.type),
                primary_services: [],
                secondary_services: [],
                specialized_procedures: [],
                diagnostic_capabilities: [],
                emergency_services: [],
                care_levels: ['basic'],
                service_quality: 'standard',
                confidence: 0.5
            };
        }
    }

    getDefaultServicesForType(type) {
        const defaults = {
            hospital: ['Emergency Care', 'Inpatient Services', 'Outpatient Services', 'Surgery'],
            clinic: ['General Consultation', 'Diagnostics', 'Minor Procedures'],
            laboratory: ['Blood Tests', 'Pathology', 'Radiology', 'Diagnostic Imaging'],
            pharmacy: ['Prescription Medicines', 'OTC Products', 'Health Consultation'],
            individual_doctor: ['Consultation', 'Diagnosis', 'Treatment', 'Follow-up']
        };
        return defaults[type] || ['General Healthcare Services'];
    }

    parseProfileAnalysisGPU(response, providerData) {
        console.log('📊 Parsing GPU-generated profile analysis...');

        const analysis = {
            raw_analysis: response,
            provider_category: this.extractCategory(response),
            quality_indicators: this.extractQualityIndicators(response),
            specialization_areas: this.extractSpecializations(response),
            service_capabilities: this.extractServiceCapabilities(response),
            operational_metrics: this.extractOperationalMetrics(response),
            network_potential: this.extractNetworkPotential(response),
            risk_assessment: this.extractRiskAssessment(response),
            confidence_score: this.calculateGPUConfidence(response),
            analysis_timestamp: new Date().toISOString()
        };

        return analysis;
    }

    parseServiceAnalysisGPU(response) {
        console.log('🔬 Parsing GPU service analysis...');

        const serviceAnalysis = {
            primary_services: this.extractPrimaryServices(response),
            secondary_services: this.extractSecondaryServices(response),
            specialized_procedures: this.extractSpecializedProcedures(response),
            diagnostic_capabilities: this.extractDiagnosticCapabilities(response),
            emergency_services: this.extractEmergencyServices(response),
            care_levels: this.extractCareLevels(response),
            service_quality: this.assessServiceQuality(response),
            identified_services: [], // Will be populated by extraction methods
            confidence: this.calculateServiceConfidence(response)
        };

        // Populate identified services array
        serviceAnalysis.identified_services = [
            ...serviceAnalysis.primary_services,
            ...serviceAnalysis.secondary_services,
            ...serviceAnalysis.specialized_procedures
        ];

        return serviceAnalysis;
    }

    // GPU Response Parsing Helper Functions
    extractCategory(response) {
        const categoryPatterns = [
            /category[:\s]+([^\n]+)/i,
            /type[:\s]+([^\n]+)/i,
            /classification[:\s]+([^\n]+)/i
        ];
        
        for (const pattern of categoryPatterns) {
            const match = response.match(pattern);
            if (match) return match[1].trim();
        }
        return 'general_healthcare';
    }

    extractQualityIndicators(response) {
        const indicators = [];
        const qualityPattern = /quality|accredit|certif|standard|grade/gi;
        const matches = response.match(qualityPattern) || [];
        return matches.length > 2 ? ['high_quality'] : ['standard_quality'];
    }

    extractSpecializations(response) {
        const specializations = [];
        const specPattern = /specializ\w*[:\s]*([^\n]+)/gi;
        let match;
        while ((match = specPattern.exec(response)) !== null) {
            specializations.push(match[1].trim());
        }
        return specializations;
    }

    extractServiceCapabilities(response) {
        const capabilities = [];
        const servicePattern = /service\w*[:\s]*([^\n]+)/gi;
        let match;
        while ((match = servicePattern.exec(response)) !== null) {
            capabilities.push(match[1].trim());
        }
        return capabilities;
    }

    extractOperationalMetrics(response) {
        return {
            availability: response.includes('24/7') || response.includes('emergency') ? 'full_time' : 'business_hours',
            capacity: response.includes('large') || response.includes('hospital') ? 'high' : 'medium',
            response_time: response.includes('emergency') ? 'immediate' : 'standard'
        };
    }

    extractNetworkPotential(response) {
        const networkKeywords = ['referral', 'network', 'partner', 'affiliate', 'collaborate'];
        const hasNetworkIndicators = networkKeywords.some(keyword => 
            response.toLowerCase().includes(keyword)
        );
        return hasNetworkIndicators ? 'high' : 'medium';
    }

    extractRiskAssessment(response) {
        const riskIndicators = ['emergency', 'critical', 'advanced', 'specialized'];
        const riskLevel = riskIndicators.some(indicator => 
            response.toLowerCase().includes(indicator)
        ) ? 'medium' : 'low';
        
        return {
            operational_risk: riskLevel,
            patient_risk: response.includes('emergency') ? 'high' : 'low',
            regulatory_compliance: 'standard'
        };
    }

    calculateGPUConfidence(response) {
        const length = response.length;
        const structure = response.includes(':') && response.includes('\n') ? 0.2 : 0;
        const medical_terms = (response.match(/medical|health|clinical|diagnostic|treatment/gi) || []).length * 0.1;
        
        return Math.min(0.95, 0.6 + structure + Math.min(medical_terms, 0.2));
    }

    extractPrimaryServices(response) {
        const services = [];
        const primaryPattern = /primary[:\s]*([^\n]+)/i;
        const match = response.match(primaryPattern);
        if (match) {
            services.push(...match[1].split(',').map(s => s.trim()));
        }
        return services;
    }

    extractSecondaryServices(response) {
        const services = [];
        const secondaryPattern = /secondary[:\s]*([^\n]+)/i;
        const match = response.match(secondaryPattern);
        if (match) {
            services.push(...match[1].split(',').map(s => s.trim()));
        }
        return services;
    }

    extractSpecializedProcedures(response) {
        const procedures = [];
        const procPattern = /procedure\w*[:\s]*([^\n]+)/gi;
        let match;
        while ((match = procPattern.exec(response)) !== null) {
            procedures.push(match[1].trim());
        }
        return procedures;
    }

    extractDiagnosticCapabilities(response) {
        const capabilities = [];
        const diagPattern = /diagnostic\w*[:\s]*([^\n]+)/gi;
        let match;
        while ((match = diagPattern.exec(response)) !== null) {
            capabilities.push(match[1].trim());
        }
        return capabilities;
    }

    extractEmergencyServices(response) {
        return response.toLowerCase().includes('emergency');
    }

    extractCareLevels(response) {
        const levels = [];
        if (response.includes('basic')) levels.push('basic');
        if (response.includes('intermediate')) levels.push('intermediate');
        if (response.includes('advanced')) levels.push('advanced');
        return levels.length > 0 ? levels : ['standard'];
    }

    assessServiceQuality(response) {
        const qualityIndicators = ['excellent', 'high-quality', 'accredited', 'certified', 'advanced'];
        const score = qualityIndicators.reduce((acc, indicator) => {
            return acc + (response.toLowerCase().includes(indicator) ? 1 : 0);
        }, 0);
        
        if (score >= 3) return 'high';
        if (score >= 2) return 'good';
        return 'standard';
    }

    calculateServiceConfidence(response) {
        const serviceKeywords = ['service', 'treatment', 'care', 'diagnostic', 'procedure'];
        const keywordCount = serviceKeywords.reduce((count, keyword) => {
            return count + (response.toLowerCase().match(new RegExp(keyword, 'g')) || []).length;
        }, 0);
        
        return Math.min(0.9, 0.4 + (keywordCount * 0.1));
    }

    generateBasicProfile(providerData, providerType, serviceAnalysis, capabilities) {
        return {
            raw_analysis: `Basic profile for ${providerData.name}`,
            provider_category: providerType.type,
            quality_indicators: ['standard'],
            specialization_areas: [providerType.sub_type],
            service_capabilities: capabilities.medical_services || [],
            operational_metrics: {
                availability: 'business_hours',
                capacity: 'medium',
                response_time: 'standard'
            },
            network_potential: 'medium',
            risk_assessment: {
                operational_risk: 'low',
                patient_risk: 'low',
                regulatory_compliance: 'standard'
            },
            confidence_score: 0.6,
            analysis_timestamp: new Date().toISOString()
        };
    }

    analyzeServicesBasic(providerData, providerType) {
        const services = [];
        const name = (providerData.name || '').toLowerCase();
        
        if (name.includes('lab') || name.includes('diagnostic')) {
            services.push('diagnostic_testing', 'laboratory_services');
        }
        if (name.includes('clinic')) {
            services.push('consultation', 'treatment');
        }
        if (name.includes('hospital')) {
            services.push('emergency_care', 'surgery', 'inpatient_care');
        }
        
        return {
            primary_services: services,
            secondary_services: [],
            specialized_procedures: [],
            diagnostic_capabilities: name.includes('diagnostic') ? ['basic_testing'] : [],
            emergency_services: name.includes('hospital') || name.includes('emergency'),
            care_levels: ['standard'],
            service_quality: 'standard',
            identified_services: services,
            confidence: 0.7
        };
    }

    parseProfileAnalysis(response) {
        return {
            raw_analysis: response,
            structured_profile: this.extractStructuredProfile(response),
            quality_score: this.calculateQualityScore(response),
            specialization_focus: this.extractSpecializationFocus(response),
            generated_at: new Date().toISOString()
        };
    }

    extractStructuredProfile(response) {
        // Extract key information from the profile analysis
        const profile = {
            classification: 'unknown',
            service_focus: [],
            quality_indicators: [],
            network_position: 'independent',
            patient_focus: 'general'
        };

        try {
            const lines = response.toLowerCase().split('\n');
            
            for (const line of lines) {
                if (line.includes('classification') || line.includes('type')) {
                    // Extract classification information
                } else if (line.includes('service') || line.includes('offering')) {
                    // Extract service information
                } else if (line.includes('quality') || line.includes('certification')) {
                    // Extract quality indicators
                }
            }
        } catch (error) {
            console.warn('⚠️ Profile structure extraction error:', error.message);
        }

        return profile;
    }

    calculateQualityScore(response) {
        // Calculate quality score based on analysis content
        let score = 0.5; // Base score

        const qualityIndicators = [
            'certified', 'accredited', 'licensed', 'qualified',
            'experienced', 'specialized', 'modern', 'advanced'
        ];

        const responseText = response.toLowerCase();
        for (const indicator of qualityIndicators) {
            if (responseText.includes(indicator)) {
                score += 0.1;
            }
        }

        return Math.min(score, 1.0);
    }

    extractSpecializationFocus(response) {
        const specializations = [];
        const responseText = response.toLowerCase();
        
        const medicalSpecialties = [
            'cardiology', 'neurology', 'orthopedic', 'pediatric', 'gynecology',
            'dermatology', 'ophthalmology', 'psychiatry', 'oncology', 'emergency'
        ];

        for (const specialty of medicalSpecialties) {
            if (responseText.includes(specialty)) {
                specializations.push(specialty);
            }
        }

        return specializations;
    }

    generateFallbackCapabilities(serviceAnalysis) {
        return {
            medical_services: serviceAnalysis.identified_services || [],
            equipment: ['basic_medical_equipment'],
            specializations: [serviceAnalysis.primary_category],
            certifications: ['standard_medical_license'],
            emergency_services: serviceAnalysis.primary_category === 'hospital',
            patient_capacity: serviceAnalysis.primary_category === 'hospital' ? 'high' : 'medium'
        };
    }

    generateFallbackProfile(providerType, serviceAnalysis, capabilities) {
        return {
            raw_analysis: `Fallback profile for ${providerType.type} provider`,
            structured_profile: {
                classification: providerType.type,
                service_focus: serviceAnalysis.identified_services,
                quality_indicators: capabilities.certifications,
                network_position: 'independent',
                patient_focus: providerType.sub_type || 'general'
            },
            quality_score: 0.6,
            specialization_focus: capabilities.specializations,
            generated_at: new Date().toISOString()
        };
    }

    async generateProfileEmbedding(profileAnalysis) {
        // Create a text representation for embedding
        const profileText = `
            ${profileAnalysis.raw_analysis}
            Classification: ${profileAnalysis.structured_profile.classification}
            Services: ${profileAnalysis.structured_profile.service_focus.join(' ')}
            Specializations: ${profileAnalysis.specialization_focus.join(' ')}
            Quality Score: ${profileAnalysis.quality_score}
        `;

        // Generate simple hash-based embedding (in production, use proper embeddings)
        const hash = crypto.createHash('sha256').update(profileText).digest('hex');
        const embedding = Array.from({ length: RAG_CONFIG.embedding.dimension }, (_, i) => {
            return parseInt(hash.substr(i % hash.length, 2), 16) / 255;
        });

        return {
            vector: embedding,
            text: profileText.trim(),
            dimension: RAG_CONFIG.embedding.dimension
        };
    }

    async assessQualityIndicators(providerData, profileAnalysis) {
        const indicators = {
            data_completeness: this.calculateDataCompleteness(providerData),
            profile_quality: profileAnalysis.quality_score,
            service_clarity: this.assessServiceClarity(providerData),
            contact_availability: this.assessContactAvailability(providerData),
            overall_score: 0
        };

        indicators.overall_score = (
            indicators.data_completeness * 0.3 +
            indicators.profile_quality * 0.3 +
            indicators.service_clarity * 0.2 +
            indicators.contact_availability * 0.2
        );

        return indicators;
    }

    calculateDataCompleteness(providerData) {
        const requiredFields = ['name', 'address', 'phone', 'email', 'services'];
        const providedFields = requiredFields.filter(field => 
            providerData[field] && providerData[field].toString().trim().length > 0
        );
        
        return providedFields.length / requiredFields.length;
    }

    assessServiceClarity(providerData) {
        const services = providerData.services || '';
        if (!services) return 0;
        
        const serviceKeywords = Object.values(this.serviceCategories)
            .flatMap(cat => cat.keywords);
        
        const foundKeywords = serviceKeywords.filter(keyword => 
            services.toLowerCase().includes(keyword)
        );
        
        return Math.min(foundKeywords.length / 3, 1.0); // Normalize to max 1.0
    }

    assessContactAvailability(providerData) {
        let score = 0;
        if (providerData.phone && providerData.phone.match(/\d{10}/)) score += 0.5;
        if (providerData.email && providerData.email.includes('@')) score += 0.5;
        return score;
    }

    async identifyNetworkConnections(providerData) {
        // Analyze potential connections with other providers
        const connections = {
            nearby_providers: [],
            referral_network: [],
            shared_services: [],
            partnership_indicators: []
        };

        try {
            // Query similar providers from vector store
            const similarProviders = await this.findSimilarProviders(providerData);
            connections.nearby_providers = similarProviders.slice(0, 5);

            // Look for referral patterns in text
            const text = `${providerData.name} ${providerData.address} ${providerData.services}`.toLowerCase();
            if (text.includes('refer') || text.includes('network') || text.includes('partner')) {
                connections.partnership_indicators.push('referral_language_detected');
            }

        } catch (error) {
            console.warn('⚠️ Network connection analysis failed:', error.message);
        }

        return connections;
    }

    async findSimilarProviders(providerData) {
        // Simple similarity matching (in production, use vector similarity)
        const currentLocation = this.extractLocation(providerData.address || '');
        const similarProviders = [];

        // Search through existing profiles
        for (const [id, profile] of this.providerProfiles) {
            if (id === this.generateProviderId(providerData)) continue;

            const similarity = this.calculateProviderSimilarity(providerData, profile);
            if (similarity > RAG_CONFIG.embedding.similarity_threshold) {
                similarProviders.push({
                    id,
                    name: profile.basic_info.name,
                    similarity_score: similarity,
                    type: profile.classification.type
                });
            }
        }

        return similarProviders.sort((a, b) => b.similarity_score - a.similarity_score);
    }

    calculateProviderSimilarity(provider1, provider2) {
        // Simple text-based similarity (in production, use vector similarity)
        const text1 = `${provider1.name} ${provider1.services}`.toLowerCase();
        const text2 = `${provider2.basic_info.name} ${provider2.services.identified_services.join(' ')}`.toLowerCase();
        
        const words1 = new Set(text1.split(/\s+/));
        const words2 = new Set(text2.split(/\s+/));
        
        const intersection = new Set([...words1].filter(x => words2.has(x)));
        const union = new Set([...words1, ...words2]);
        
        return intersection.size / union.size; // Jaccard similarity
    }

    extractLocation(address) {
        // Extract city/area from address for location-based matching
        const parts = address.split(',').map(p => p.trim());
        return parts.length > 1 ? parts[parts.length - 2] : address;
    }

    generateProviderId(providerData) {
        // Generate unique provider ID based on name and address
        const key = `${providerData.name || 'unknown'}_${providerData.address || 'unknown'}`;
        return crypto.createHash('md5').update(key.toLowerCase()).digest('hex').substring(0, 16);
    }

    async storeProviderProfile(profile) {
        try {
            // Store in local cache
            this.providerProfiles.set(profile.id, profile);

            // Store in vector store for RAG retrieval (if exists)
            if (profile.vector_embedding) {
                this.vectorStore.set(profile.id, profile.vector_embedding);
            }

            // Save to file cache
            try {
                const profilePath = path.join(RAG_CONFIG.cache.dir, 'profiles', `${profile.id}.json`);
                await fs.writeFile(profilePath, JSON.stringify(profile, null, 2));
            } catch (e) {
                // Create directory if needed
                const profileDir = path.join(RAG_CONFIG.cache.dir, 'profiles');
                try {
                    await fs.mkdir(profileDir, { recursive: true });
                    const profilePath = path.join(profileDir, `${profile.id}.json`);
                    await fs.writeFile(profilePath, JSON.stringify(profile, null, 2));
                } catch (err) {
                    console.warn('⚠️ File storage issue:', err.message);
                }
            }

            console.log(`✅ Stored: ${profile.id}`);
        } catch (error) {
            console.warn(`⚠️ Profile storage warning: ${error.message}`);
            // Don't throw - continue processing
        }
    }

    async trackTransaction(transaction) {
        try {
            const transactionId = this.generateTransactionId(transaction);
            
            // Simple transaction record without complex analysis
            const transactionRecord = {
                id: transactionId,
                timestamp: new Date().toISOString(),
                basic_info: transaction,
                analysis: { summary: 'Transaction tracked' },
                network_effects: {},
                providers_involved: this.extractInvolvedProviders(transaction)
            };

            await this.storeTransactionRecord(transactionRecord);
            
            console.log(`✅ Tracked: ${transactionId}`);
            return transactionRecord;

        } catch (error) {
            console.warn(`⚠️ Transaction warning: ${error.message}`);
            return { id: 'error', error: error.message };
        }
    }

    generateTransactionId(transaction) {
        const key = `${transaction.from || 'unknown'}_${transaction.to || 'unknown'}_${transaction.timestamp || Date.now()}`;
        return crypto.createHash('md5').update(key).digest('hex').substring(0, 16);
    }

    async analyzeTransaction(transaction) {
        const prompt = `Analyze this healthcare transaction:

Transaction Type: ${transaction.type}
From: ${transaction.from}
To: ${transaction.to}
Service: ${transaction.service || 'Unknown'}
Value: ${transaction.value || 'Unknown'}
Date: ${transaction.date || 'Unknown'}

Analyze the transaction for:
1. Transaction category and purpose
2. Provider relationship type
3. Service delivery pattern
4. Network connectivity impact
5. Quality and compliance indicators

Transaction Analysis:`;

        try {
            const response = await this.callTinyLlama(prompt);
            return this.parseTransactionAnalysis(response);
        } catch (error) {
            console.warn('⚠️ Transaction analysis failed, using fallback:', error.message);
            return this.generateFallbackTransactionAnalysis(transaction);
        }
    }

    parseTransactionAnalysis(response) {
        return {
            raw_analysis: response,
            transaction_category: this.extractTransactionCategory(response),
            relationship_type: this.extractRelationshipType(response),
            service_pattern: this.extractServicePattern(response),
            network_impact: this.extractNetworkImpact(response),
            quality_indicators: this.extractTransactionQuality(response),
            analyzed_at: new Date().toISOString()
        };
    }

    extractTransactionCategory(response) {
        const categories = ['consultation', 'diagnostic', 'treatment', 'referral', 'follow_up', 'emergency'];
        const responseText = response.toLowerCase();
        
        for (const category of categories) {
            if (responseText.includes(category)) {
                return category;
            }
        }
        return 'unknown';
    }

    extractRelationshipType(response) {
        const types = ['direct_service', 'referral', 'collaboration', 'consultation', 'support'];
        const responseText = response.toLowerCase();
        
        for (const type of types) {
            if (responseText.includes(type.replace('_', ' '))) {
                return type;
            }
        }
        return 'direct_service';
    }

    extractServicePattern(response) {
        const patterns = ['routine', 'urgent', 'specialized', 'follow_up', 'emergency'];
        const responseText = response.toLowerCase();
        
        for (const pattern of patterns) {
            if (responseText.includes(pattern)) {
                return pattern;
            }
        }
        return 'routine';
    }

    extractNetworkImpact(response) {
        const responseText = response.toLowerCase();
        
        if (responseText.includes('network') || responseText.includes('connection')) {
            return 'high';
        } else if (responseText.includes('relationship') || responseText.includes('partner')) {
            return 'medium';
        }
        return 'low';
    }

    extractTransactionQuality(response) {
        const qualityKeywords = ['quality', 'satisfaction', 'outcome', 'success', 'effective'];
        const responseText = response.toLowerCase();
        
        let qualityScore = 0.5;
        for (const keyword of qualityKeywords) {
            if (responseText.includes(keyword)) {
                qualityScore += 0.1;
            }
        }
        
        return Math.min(qualityScore, 1.0);
    }

    generateFallbackTransactionAnalysis(transaction) {
        return {
            raw_analysis: `Fallback analysis for ${transaction.type} transaction`,
            transaction_category: transaction.type || 'unknown',
            relationship_type: 'direct_service',
            service_pattern: 'routine',
            network_impact: 'low',
            quality_indicators: 0.6,
            analyzed_at: new Date().toISOString()
        };
    }

    async updateProviderRelationships(transaction, analysis) {
        // Update relationship graph between providers
        const fromProvider = transaction.from;
        const toProvider = transaction.to;

        if (!this.transactionGraph.has(fromProvider)) {
            this.transactionGraph.set(fromProvider, new Map());
        }

        const relationships = this.transactionGraph.get(fromProvider);
        if (!relationships.has(toProvider)) {
            relationships.set(toProvider, {
                transaction_count: 0,
                relationship_type: analysis.relationship_type,
                last_transaction: null,
                quality_score: 0
            });
        }

        const relationship = relationships.get(toProvider);
        relationship.transaction_count++;
        relationship.last_transaction = transaction.date || new Date().toISOString();
        relationship.quality_score = (relationship.quality_score + analysis.quality_indicators) / 2;
    }

    async analyzeNetworkEffects(transaction) {
        return {
            connectivity_change: 'maintained',
            network_strength: this.calculateNetworkStrength(transaction.from, transaction.to),
            community_impact: 'local',
            referral_potential: this.assessReferralPotential(transaction)
        };
    }

    calculateNetworkStrength(provider1, provider2) {
        // Calculate network strength between two providers
        const relationships1 = this.transactionGraph.get(provider1) || new Map();
        const relationships2 = this.transactionGraph.get(provider2) || new Map();
        
        const commonConnections = [...relationships1.keys()].filter(provider => 
            relationships2.has(provider)
        );
        
        return commonConnections.length / Math.max(relationships1.size, relationships2.size, 1);
    }

    assessReferralPotential(transaction) {
        const transactionText = `${transaction.service} ${transaction.type}`.toLowerCase();
        
        if (transactionText.includes('refer') || transactionText.includes('specialist')) {
            return 'high';
        } else if (transactionText.includes('follow') || transactionText.includes('consult')) {
            return 'medium';
        }
        return 'low';
    }

    extractInvolvedProviders(transaction) {
        return [
            {
                id: this.generateProviderId({ name: transaction.from }),
                role: 'service_provider',
                name: transaction.from
            },
            {
                id: this.generateProviderId({ name: transaction.to }),
                role: 'service_recipient',
                name: transaction.to
            }
        ];
    }

    async storeTransactionRecord(record) {
        try {
            // Store in transaction graph
            if (!this.transactionGraph.has('all_transactions')) {
                this.transactionGraph.set('all_transactions', new Map());
            }
            this.transactionGraph.get('all_transactions').set(record.id, record);

            // Save to file cache
            try {
                const transactionPath = path.join(RAG_CONFIG.cache.dir, 'transactions', `${record.id}.json`);
                await fs.writeFile(transactionPath, JSON.stringify(record, null, 2));
            } catch (e) {
                // Create directory if needed
                const txDir = path.join(RAG_CONFIG.cache.dir, 'transactions');
                try {
                    await fs.mkdir(txDir, { recursive: true });
                    const transactionPath = path.join(txDir, `${record.id}.json`);
                    await fs.writeFile(transactionPath, JSON.stringify(record, null, 2));
                } catch (err) {
                    console.warn('⚠️ File storage issue:', err.message);
                }
            }

        } catch (error) {
            console.error(`❌ Transaction storage failed: ${error.message}`);
            throw error;
        }
    }

    async generateNetworkReport() {
        console.log('📊 Generating provider network analysis report...');

        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                total_providers: this.providerProfiles.size,
                total_transactions: 0,
                network_density: 0,
                most_connected_providers: [],
                service_distribution: {}
            },
            provider_analysis: [],
            transaction_patterns: [],
            network_insights: []
        };

        // Calculate network statistics
        const allTransactions = this.transactionGraph.get('all_transactions') || new Map();
        report.summary.total_transactions = allTransactions.size;

        // Analyze provider connections
        for (const [providerId, provider] of this.providerProfiles) {
            const connections = this.transactionGraph.get(providerId) || new Map();
            
            report.provider_analysis.push({
                id: providerId,
                name: provider.basic_info?.name || 'Unknown',
                type: provider.classification?.type || 'unknown',
                connections: connections.size,
                quality_score: provider.quality_indicators?.overall_score || 0.5,
                services: Array.isArray(provider.services) ? provider.services : (provider.services?.identified_services || [])
            });
        }

        // Sort by connections
        report.provider_analysis.sort((a, b) => b.connections - a.connections);
        report.summary.most_connected_providers = report.provider_analysis.slice(0, 5);

        // Service distribution analysis
        for (const provider of report.provider_analysis) {
            const services = Array.isArray(provider.services) ? provider.services : [];
            for (const service of services) {
                report.summary.service_distribution[service] = 
                    (report.summary.service_distribution[service] || 0) + 1;
            }
        }

        // Generate insights using RAG
        const insights = await this.generateNetworkInsights(report);
        report.network_insights = insights;

        // Store report
        await this.storeNetworkReport(report);

        return report;
    }

    async generateNetworkInsights(report) {
        const prompt = `Analyze this healthcare provider network report and generate insights:

Total Providers: ${report.summary.total_providers}
Total Transactions: ${report.summary.total_transactions}
Top Connected Providers: ${report.summary.most_connected_providers.map(p => p.name).join(', ')}
Service Distribution: ${Object.entries(report.summary.service_distribution).map(([s, c]) => `${s}: ${c}`).join(', ')}

Generate strategic insights about:
1. Network health and connectivity patterns
2. Service gaps and opportunities
3. Provider collaboration potential
4. Quality improvement recommendations
5. Network growth strategies

Network Analysis Insights:`;

        try {
            const response = await this.callTinyLlama(prompt);
            return this.parseNetworkInsights(response);
        } catch (error) {
            console.warn('⚠️ Insight generation failed:', error.message);
            return this.generateFallbackInsights(report);
        }
    }

    parseNetworkInsights(response) {
        const insights = [];
        const lines = response.split('\n').filter(line => line.trim());

        for (const line of lines) {
            if (line.length > 20) { // Filter out short lines
                insights.push({
                    insight: line.trim(),
                    category: this.categorizeInsight(line),
                    priority: this.assessInsightPriority(line)
                });
            }
        }

        return insights;
    }

    categorizeInsight(insight) {
        const insightText = insight.toLowerCase();
        
        if (insightText.includes('gap') || insightText.includes('opportunity')) {
            return 'opportunity';
        } else if (insightText.includes('risk') || insightText.includes('issue')) {
            return 'risk';
        } else if (insightText.includes('strength') || insightText.includes('advantage')) {
            return 'strength';
        }
        return 'general';
    }

    assessInsightPriority(insight) {
        const insightText = insight.toLowerCase();
        
        if (insightText.includes('critical') || insightText.includes('urgent')) {
            return 'high';
        } else if (insightText.includes('important') || insightText.includes('significant')) {
            return 'medium';
        }
        return 'low';
    }

    generateFallbackInsights(report) {
        const insights = [];
        
        if (report.summary.total_providers > 0) {
            insights.push({
                insight: `Network contains ${report.summary.total_providers} healthcare providers with diverse service offerings.`,
                category: 'general',
                priority: 'low'
            });
        }

        if (report.summary.most_connected_providers.length > 0) {
            insights.push({
                insight: `${report.summary.most_connected_providers[0].name} shows highest connectivity in the network.`,
                category: 'strength',
                priority: 'medium'
            });
        }

        return insights;
    }

    async storeNetworkReport(report) {
        try {
            // Save to file only
            try {
                await fs.mkdir(RAG_CONFIG.cache.dir, { recursive: true });
            } catch (e) {}
            
            const reportPath = path.join(RAG_CONFIG.cache.dir, `network_report_${Date.now()}.json`);
            await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

            console.log(`📊 Report saved: ${reportPath}`);
        } catch (error) {
            console.warn('⚠️ Report storage warning:', error.message);
        }
    }

    async cleanup() {
        console.log('🧹 Cleaning up RAG Agent resources...');
        // Cleanup cache, close connections, etc.
        this.cache.clear();
        console.log('✅ RAG Agent cleanup complete');
    }
}

// Export for use as module
module.exports = { ProviderProfilingRAGAgent };

// CLI interface
if (require.main === module) {
    async function main() {
        console.log('\n🤖 PROVIDER PROFILING RAG AGENT');
        console.log('=================================');
        console.log('🧠 Using: Tiny-LLaMA Medical Model');
        console.log('📊 Database: Intelligent Medical Database');
        console.log('🎯 Target: Healthcare provider profiling & network analysis');
        
        const agent = new ProviderProfilingRAGAgent();
        
        try {
            await agent.initialize();
            
            // Example usage: analyze some sample providers
            const sampleProviders = [
                {
                    name: "City Medical Center",
                    address: "123 Health Street, Medical District, Mumbai 400001",
                    phone: "9876543210",
                    email: "info@citymedical.com",
                    services: "General consultation, emergency care, diagnostics, surgery"
                },
                {
                    name: "Diagnostic Lab Solutions",
                    address: "456 Lab Avenue, Science Park, Bangalore 560001", 
                    phone: "9876543211",
                    email: "contact@diagnosticlabs.com",
                    services: "Blood tests, pathology, radiology, imaging services"
                }
            ];

            console.log('\n🏥 Analyzing sample providers...');
            
            for (const provider of sampleProviders) {
                const profile = await agent.analyzeProvider(provider);
                console.log(`✅ Profiled: ${profile.basic_info.name} as ${profile.classification.type}`);
            }

            // Example transaction tracking
            console.log('\n💳 Tracking sample transactions...');
            
            const sampleTransactions = [
                {
                    type: "patient_referral",
                    from: "City Medical Center",
                    to: "Diagnostic Lab Solutions", 
                    service: "Blood test referral",
                    date: new Date().toISOString()
                }
            ];

            for (const transaction of sampleTransactions) {
                const record = await agent.trackTransaction(transaction);
                console.log(`✅ Tracked: ${record.analysis.transaction_category} transaction`);
            }

            // Generate network report
            console.log('\n📊 Generating network analysis report...');
            const report = await agent.generateNetworkReport();
            console.log(`✅ Network report generated with ${report.network_insights.length} insights`);

        } catch (error) {
            console.error('❌ Agent execution failed:', error.message);
            process.exit(1);
        } finally {
            await agent.cleanup();
        }
    }

    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n⚠️ Received SIGINT, shutting down gracefully...');
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        console.log('\n⚠️ Received SIGTERM, shutting down gracefully...');
        process.exit(0);
    });

    main().catch(error => {
        console.error('❌ Application failed:', error.message);
        process.exit(1);
    });
}