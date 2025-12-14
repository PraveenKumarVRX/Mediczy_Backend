#!/usr/bin/env node

/**
 * Enhanced RAG Agent with Web Search (Simple Version)
 * Provider profiling with web search and master data integration
 * No external dependencies - pure Node.js
 */

const axios = require('axios');
const https = require('https');
const fs = require('fs').promises;

// Configuration
const CONFIG = {
    model: 'llama3.2:1b',
    endpoint: 'http://localhost:11434/api/generate',
    timeout: 8000,
    maxTokens: 64,
    webSearch: {
        enabled: true,
        timeout: 5000,
        userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36'
    }
};

class SimpleEnhancedRAG {
    constructor() {
        this.masterData = new Map();
        this.webCache = new Map();
        this.providerDatabase = [];
    }

    async initialize() {
        console.log('🔧 Initializing Enhanced RAG with Simple Web Search...');
        await this.loadProviderDatabase();
        console.log('✅ Enhanced RAG system ready');
    }

    async loadProviderDatabase() {
        // Mock provider database with comprehensive information
        const providers = [
            {
                id: 'apollo_hospitals',
                name: 'Apollo Hospitals',
                category: 'hospital',
                specialties: ['Cardiology', 'Oncology', 'Neurology', 'Orthopedics'],
                services: ['Emergency Care', 'Surgery', 'ICU', 'Diagnostic Imaging'],
                locations: ['Delhi', 'Mumbai', 'Chennai', 'Bangalore', 'Hyderabad'],
                phone: '+91-40-23607777',
                website: 'https://www.apollohospitals.com',
                established: 1983,
                rating: 4.3,
                reviews: 2500,
                accreditations: ['JCI', 'NABH'],
                beds: 10000,
                doctors: 4000
            },
            {
                id: 'fortis_healthcare',
                name: 'Fortis Healthcare',
                category: 'hospital',
                specialties: ['Cardiac Sciences', 'Neurosciences', 'Renal Sciences'],
                services: ['Emergency Care', 'Surgery', 'Transplant', 'Rehabilitation'],
                locations: ['Delhi NCR', 'Mumbai', 'Bangalore', 'Kolkata'],
                phone: '+91-11-47135000',
                website: 'https://www.fortishealthcare.com',
                established: 2001,
                rating: 4.2,
                reviews: 1800,
                accreditations: ['JCI', 'NABH'],
                beds: 5000,
                doctors: 2000
            },
            {
                id: 'dr_lal_pathlabs',
                name: 'Dr Lal PathLabs',
                category: 'laboratory',
                specialties: ['Clinical Pathology', 'Radiology', 'Molecular Diagnostics'],
                services: ['Blood Tests', 'Imaging', 'Home Sample Collection', 'Health Checkups'],
                locations: ['Pan India', '4000+ Centers'],
                phone: '+91-11-30081000',
                website: 'https://www.lalpathlabs.com',
                established: 1949,
                rating: 4.1,
                reviews: 3200,
                accreditations: ['NABL', 'CAP'],
                centers: 4000,
                tests_offered: 5000
            },
            {
                id: 'max_healthcare',
                name: 'Max Healthcare',
                category: 'hospital',
                specialties: ['Cancer Care', 'Cardiac Sciences', 'Neurosciences'],
                services: ['Emergency Care', 'Surgery', 'Oncology', 'Critical Care'],
                locations: ['Delhi NCR', 'Uttarakhand', 'Punjab'],
                phone: '+91-11-26692251',
                website: 'https://www.maxhealthcare.in',
                established: 2001,
                rating: 4.4,
                reviews: 1500,
                accreditations: ['JCI', 'NABH'],
                beds: 2400,
                doctors: 1500
            },
            {
                id: 'aiims_delhi',
                name: 'All India Institute of Medical Sciences (AIIMS) Delhi',
                category: 'hospital',
                specialties: ['All Medical Specialties', 'Research', 'Teaching'],
                services: ['Emergency Care', 'Surgery', 'OPD', 'Research'],
                locations: ['Delhi', 'Multiple AIIMS Centers'],
                phone: '+91-11-26588500',
                website: 'https://www.aiims.edu',
                established: 1956,
                rating: 4.6,
                reviews: 5000,
                accreditations: ['Government Institution', 'Medical Education'],
                beds: 2478,
                doctors: 2000,
                type: 'government'
            }
        ];

        providers.forEach(provider => {
            this.masterData.set(provider.name.toLowerCase(), provider);
            this.providerDatabase.push(provider);
        });

        console.log(`📊 Loaded ${providers.length} providers in master database`);
    }

    async searchMasterData(providerName) {
        const searchKey = providerName.toLowerCase();
        const results = [];

        for (const provider of this.providerDatabase) {
            const score = this.calculateSearchScore(searchKey, provider);
            if (score > 0.3) {
                results.push({
                    provider: provider,
                    score: score,
                    source: 'master_database'
                });
            }
        }

        results.sort((a, b) => b.score - a.score);
        console.log(`🗃️ Found ${results.length} master data matches for "${providerName}"`);
        
        return results.slice(0, 3);
    }

    calculateSearchScore(searchKey, provider) {
        let score = 0;
        const nameWords = provider.name.toLowerCase().split(' ');
        const searchWords = searchKey.split(' ');

        // Exact name match
        if (provider.name.toLowerCase() === searchKey) {
            score += 1.0;
        }

        // Partial name matches
        searchWords.forEach(searchWord => {
            if (provider.name.toLowerCase().includes(searchWord)) {
                score += 0.3;
            }
            nameWords.forEach(nameWord => {
                if (nameWord.includes(searchWord) || searchWord.includes(nameWord)) {
                    score += 0.2;
                }
            });
        });

        // Category and specialty matches
        if (provider.category && searchKey.includes(provider.category)) {
            score += 0.2;
        }

        return Math.min(score, 1.0);
    }

    async performWebSearch(providerName) {
        if (!CONFIG.webSearch.enabled) return [];

        console.log(`🌐 Simulating web search for: ${providerName}`);

        // Simulate web search with realistic mock data
        const webResults = [
            {
                title: `${providerName} - Official Website`,
                url: `https://www.${providerName.toLowerCase().replace(/\s+/g, '')}.com`,
                snippet: `Official website of ${providerName}. Book appointments, find doctors, view services and contact information.`,
                type: 'official_website',
                relevance: 0.95
            },
            {
                title: `${providerName} Reviews and Ratings`,
                url: `https://www.healthgrades.com/${providerName.replace(/\s+/g, '-')}`,
                snippet: `Patient reviews, ratings and feedback for ${providerName}. Read experiences and book verified appointments.`,
                type: 'reviews',
                rating: (4.0 + Math.random() * 1.0).toFixed(1),
                reviews: Math.floor(Math.random() * 2000) + 500,
                relevance: 0.85
            },
            {
                title: `${providerName} Contact Information`,
                url: `https://www.justdial.com/search/${providerName}`,
                snippet: `Find ${providerName} contact details, address, phone numbers, working hours and location map.`,
                type: 'contact_info',
                phone: this.generateRealisticPhone(),
                address: this.generateRealisticAddress(providerName),
                relevance: 0.80
            },
            {
                title: `${providerName} Services and Specialties`,
                url: `https://www.practo.com/search/${providerName}`,
                snippet: `Complete list of medical services, specialties, and departments available at ${providerName}.`,
                type: 'services',
                services: this.generateRealisticServices(),
                relevance: 0.75
            }
        ];

        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 500));
        
        console.log(`🔍 Generated ${webResults.length} web search results`);
        return webResults;
    }

    generateRealisticPhone() {
        const areaCodes = ['011', '022', '040', '080', '044', '033'];
        const areaCode = areaCodes[Math.floor(Math.random() * areaCodes.length)];
        const number = Math.floor(Math.random() * 90000000) + 10000000;
        return `+91-${areaCode}-${number}`;
    }

    generateRealisticAddress(providerName) {
        const areas = [
            'Medical District, Central Delhi',
            'Healthcare Zone, Bandra West, Mumbai',
            'HITEC City, Madhapur, Hyderabad',
            'Electronic City, Bangalore',
            'Adyar, Chennai',
            'Salt Lake, Kolkata'
        ];
        const area = areas[Math.floor(Math.random() * areas.length)];
        const buildingNumber = Math.floor(Math.random() * 999) + 1;
        return `${buildingNumber}, ${providerName} Campus, ${area}`;
    }

    generateRealisticServices() {
        const allServices = [
            'Emergency Care', 'General Medicine', 'Surgery', 'Cardiology',
            'Neurology', 'Orthopedics', 'Pediatrics', 'Gynecology',
            'Oncology', 'Radiology', 'Pathology', 'ICU', 'NICU',
            'Dialysis', 'Physiotherapy', 'Pharmacy', 'Blood Bank'
        ];
        const count = Math.floor(Math.random() * 8) + 5;
        return allServices.slice(0, count);
    }

    async quickProfile(name) {
        console.log(`🚀 Creating enhanced profile: ${name}`);
        
        const start = Date.now();
        
        try {
            // 1. Quick LLM categorization
            const llmResult = await this.getLLMCategorization(name);
            
            // 2. Search master database
            const masterResults = await this.searchMasterData(name);
            
            // 3. Perform web search
            const webResults = await this.performWebSearch(name);
            
            // 4. Combine all data sources
            const enhancedProfile = this.createEnhancedProfile(name, llmResult, masterResults, webResults);
            
            enhancedProfile.processingTime = Date.now() - start;
            
            console.log(`✅ Enhanced profile created for ${name} (${enhancedProfile.processingTime}ms)`);
            return enhancedProfile;

        } catch (error) {
            console.log(`❌ ${name} -> error (${error.message})`);
            return this.createFallbackProfile(name, Date.now() - start);
        }
    }

    async getLLMCategorization(name) {
        try {
            const response = await axios.post(CONFIG.endpoint, {
                model: CONFIG.model,
                prompt: `Healthcare provider: ${name}\nType:`,
                stream: false,
                options: {
                    num_predict: CONFIG.maxTokens,
                    temperature: 0.1,
                    top_k: 10,
                    num_gpu: -1
                }
            }, { timeout: CONFIG.timeout });

            const llmResponse = response.data.response?.trim() || 'unknown';
            
            return {
                raw_response: llmResponse,
                category: this.extractCategory(llmResponse),
                confidence: 0.7,
                source: 'llm_analysis'
            };

        } catch (error) {
            console.warn(`⚠️ LLM failed for ${name}, using fallback`);
            return {
                raw_response: 'llm_unavailable',
                category: this.fallbackCategory(name),
                confidence: 0.4,
                source: 'fallback'
            };
        }
    }

    createEnhancedProfile(name, llmResult, masterResults, webResults) {
        const masterMatch = masterResults.length > 0 ? masterResults[0] : null;
        const webData = this.consolidateWebData(webResults);
        
        const profile = {
            // Basic Information
            id: this.generateId(name),
            name: name,
            category: this.getBestCategory(llmResult, masterMatch),
            
            // LLM Analysis
            llm_analysis: {
                raw_response: llmResult.raw_response,
                category: llmResult.category,
                confidence: llmResult.confidence,
                source: llmResult.source
            },
            
            // Master Database Match
            master_data: masterMatch ? {
                match_score: masterMatch.score,
                provider_info: masterMatch.provider,
                data_quality: 'verified'
            } : null,
            
            // Web Search Results
            web_presence: {
                found_results: webResults.length > 0,
                official_website: webData.website,
                contact_info: webData.contact,
                services_found: webData.services,
                ratings: webData.ratings,
                search_relevance: webData.avgRelevance
            },
            
            // Consolidated Information
            consolidated_info: this.consolidateAllData(masterMatch, webData),
            
            // Data Quality Metrics
            data_quality: {
                sources_used: this.countDataSources(masterMatch, webResults),
                completeness_score: this.calculateCompletenessScore(masterMatch, webData),
                reliability_score: this.calculateReliabilityScore(llmResult, masterMatch, webResults),
                last_updated: new Date().toISOString()
            },
            
            // Metadata
            timestamp: new Date().toISOString(),
            enhanced: true,
            rag_agent: 'simple_enhanced_v1'
        };

        return profile;
    }

    getBestCategory(llmResult, masterMatch) {
        if (masterMatch && masterMatch.provider.category) {
            return masterMatch.provider.category;
        }
        return llmResult.category;
    }

    consolidateWebData(webResults) {
        const data = {
            website: null,
            contact: {},
            services: [],
            ratings: null,
            avgRelevance: 0
        };

        if (webResults.length === 0) return data;

        webResults.forEach(result => {
            // Extract website
            if (result.type === 'official_website' && !data.website) {
                data.website = result.url;
            }
            
            // Extract contact info
            if (result.phone && !data.contact.phone) {
                data.contact.phone = result.phone;
            }
            if (result.address && !data.contact.address) {
                data.contact.address = result.address;
            }
            
            // Extract services
            if (result.services) {
                data.services.push(...result.services);
            }
            
            // Extract ratings
            if (result.rating && !data.ratings) {
                data.ratings = {
                    rating: result.rating,
                    reviews: result.reviews || 0
                };
            }
        });

        // Calculate average relevance
        data.avgRelevance = webResults.reduce((sum, r) => sum + r.relevance, 0) / webResults.length;
        
        // Remove duplicate services
        data.services = [...new Set(data.services)];

        return data;
    }

    consolidateAllData(masterMatch, webData) {
        const consolidated = {
            basic_info: {},
            services: [],
            contact: {},
            quality_indicators: {}
        };

        // Use master data as primary source if available
        if (masterMatch) {
            const provider = masterMatch.provider;
            consolidated.basic_info = {
                name: provider.name,
                category: provider.category,
                established: provider.established,
                type: provider.type || 'private'
            };
            
            consolidated.services = provider.services || [];
            
            if (provider.specialties) {
                consolidated.services.push(...provider.specialties);
            }
            
            consolidated.contact = {
                phone: provider.phone,
                website: provider.website,
                locations: provider.locations
            };
            
            consolidated.quality_indicators = {
                rating: provider.rating,
                reviews: provider.reviews,
                accreditations: provider.accreditations || [],
                beds: provider.beds,
                doctors: provider.doctors
            };
        }

        // Enhance with web data
        if (webData.website && !consolidated.contact.website) {
            consolidated.contact.website = webData.website;
        }
        
        if (webData.contact.phone && !consolidated.contact.phone) {
            consolidated.contact.phone = webData.contact.phone;
        }
        
        if (webData.contact.address) {
            consolidated.contact.address = webData.contact.address;
        }
        
        if (webData.services.length > 0) {
            consolidated.services.push(...webData.services);
            consolidated.services = [...new Set(consolidated.services)]; // Remove duplicates
        }
        
        if (webData.ratings && !consolidated.quality_indicators.rating) {
            consolidated.quality_indicators.rating = webData.ratings.rating;
            consolidated.quality_indicators.reviews = webData.ratings.reviews;
        }

        return consolidated;
    }

    countDataSources(masterMatch, webResults) {
        let sources = 1; // Always have LLM
        if (masterMatch) sources++;
        if (webResults.length > 0) sources++;
        return sources;
    }

    calculateCompletenessScore(masterMatch, webData) {
        let score = 0;
        const maxScore = 10;
        
        // Basic info
        if (masterMatch || webData.website) score += 2;
        
        // Contact info
        if ((masterMatch && masterMatch.provider.phone) || webData.contact.phone) score += 2;
        
        // Services
        if ((masterMatch && masterMatch.provider.services) || webData.services.length > 0) score += 2;
        
        // Location
        if ((masterMatch && masterMatch.provider.locations) || webData.contact.address) score += 2;
        
        // Quality indicators
        if ((masterMatch && masterMatch.provider.rating) || webData.ratings) score += 2;
        
        return score / maxScore;
    }

    calculateReliabilityScore(llmResult, masterMatch, webResults) {
        let score = 0.3; // Base score
        
        if (llmResult.source === 'llm_analysis') score += 0.2;
        if (masterMatch) score += 0.3;
        if (webResults.length > 0) score += 0.2;
        
        return Math.min(score, 1.0);
    }

    extractCategory(response) {
        const lower = response.toLowerCase();
        if (lower.includes('hospital') || lower.includes('medical center')) return 'hospital';
        if (lower.includes('clinic')) return 'clinic'; 
        if (lower.includes('lab') || lower.includes('pathology') || lower.includes('diagnostic')) return 'laboratory';
        if (lower.includes('pharmacy') || lower.includes('medical store')) return 'pharmacy';
        if (lower.includes('doctor') || lower.includes('physician')) return 'individual_doctor';
        return 'general_healthcare';
    }

    fallbackCategory(name) {
        const lower = name.toLowerCase();
        if (lower.includes('hospital') || lower.includes('medical center')) return 'hospital';
        if (lower.includes('clinic')) return 'clinic';
        if (lower.includes('lab') || lower.includes('pathology') || lower.includes('diagnostic')) return 'laboratory';
        if (lower.includes('pharmacy') || lower.includes('medical store')) return 'pharmacy';
        if (lower.includes('aiims') || lower.includes('institute')) return 'hospital';
        return 'general_healthcare';
    }

    createFallbackProfile(name, processingTime) {
        return {
            id: this.generateId(name),
            name: name,
            category: this.fallbackCategory(name),
            llm_analysis: { source: 'fallback', confidence: 0.3 },
            master_data: null,
            web_presence: { found_results: false },
            data_quality: { sources_used: 1, completeness_score: 0.2, reliability_score: 0.3 },
            timestamp: new Date().toISOString(),
            enhanced: false,
            processingTime: processingTime
        };
    }

    generateId(name) {
        return name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 20);
    }

    async testModel() {
        console.log('🧪 Testing enhanced RAG system...');
        const result = await this.quickProfile('Test Medical Center');
        return result.data_quality.reliability_score > 0.5;
    }

    async processProviders() {
        const testProviders = [
            'Apollo Hospitals',
            'Fortis Healthcare', 
            'Dr Lal PathLabs',
            'Max Healthcare',
            'AIIMS Delhi',
            'Medanta Hospital',
            'Narayana Health'
        ];

        console.log(`\n🏥 Processing ${testProviders.length} providers with Enhanced RAG...\n`);

        const results = [];
        let totalTime = 0;

        for (const provider of testProviders) {
            const profile = await this.quickProfile(provider);
            results.push(profile);
            totalTime += profile.processingTime || 0;
            
            // Brief pause between requests
            await new Promise(resolve => setTimeout(resolve, 800));
        }

        this.displayResults(results, totalTime);
    }

    displayResults(results, totalTime) {
        console.log(`\n📊 ENHANCED RAG AGENT RESULTS`);
        console.log(`==============================`);
        console.log(`✅ Processed: ${results.length} healthcare providers`);
        console.log(`⚡ Total processing time: ${totalTime}ms`);
        console.log(`📈 Average time per provider: ${Math.round(totalTime / results.length)}ms`);
        console.log(`🧠 AI Model: llama3.2:1b GPU`);
        console.log(`🌐 Web Search: Enabled (Mock)`);
        console.log(`🗃️ Master Database: ${this.providerDatabase.length} providers`);
        
        results.forEach((profile, index) => {
            console.log(`\n${index + 1}. 🏥 ${profile.name}`);
            console.log(`   ├─ Category: ${profile.category}`);
            console.log(`   ├─ Data Sources: ${profile.data_quality.sources_used} (LLM + ${profile.master_data ? 'Master' : 'No Master'} + ${profile.web_presence.found_results ? 'Web' : 'No Web'})`);
            console.log(`   ├─ Completeness: ${(profile.data_quality.completeness_score * 100).toFixed(1)}%`);
            console.log(`   ├─ Reliability: ${(profile.data_quality.reliability_score * 100).toFixed(1)}%`);
            
            if (profile.master_data) {
                const provider = profile.master_data.provider_info;
                console.log(`   ├─ Master Match: ${(profile.master_data.match_score * 100).toFixed(1)}% - ${provider.specialties ? provider.specialties.slice(0,2).join(', ') : 'N/A'}`);
                console.log(`   ├─ Established: ${provider.established || 'Unknown'}`);
                if (provider.rating) {
                    console.log(`   ├─ Rating: ${provider.rating}⭐ (${provider.reviews || 0} reviews)`);
                }
            }
            
            if (profile.web_presence.found_results) {
                console.log(`   ├─ Web Presence: Found (${profile.web_presence.search_relevance ? (profile.web_presence.search_relevance * 100).toFixed(1) + '% relevance' : 'N/A'})`);
                if (profile.web_presence.contact_info && profile.web_presence.contact_info.phone) {
                    console.log(`   ├─ Contact: ${profile.web_presence.contact_info.phone}`);
                }
            }
            
            console.log(`   └─ Processing Time: ${profile.processingTime || 'N/A'}ms`);
        });

        console.log(`\n🎯 SUMMARY METRICS:`);
        const avgCompleteness = results.reduce((sum, r) => sum + r.data_quality.completeness_score, 0) / results.length;
        const avgReliability = results.reduce((sum, r) => sum + r.data_quality.reliability_score, 0) / results.length;
        const masterDataMatches = results.filter(r => r.master_data).length;
        const webSearchSuccesses = results.filter(r => r.web_presence.found_results).length;
        
        console.log(`   Average Completeness: ${(avgCompleteness * 100).toFixed(1)}%`);
        console.log(`   Average Reliability: ${(avgReliability * 100).toFixed(1)}%`);
        console.log(`   Master Data Matches: ${masterDataMatches}/${results.length} (${((masterDataMatches/results.length)*100).toFixed(1)}%)`);
        console.log(`   Web Search Success: ${webSearchSuccesses}/${results.length} (${((webSearchSuccesses/results.length)*100).toFixed(1)}%)`);
    }
}

async function main() {
    console.log('⚡ ENHANCED RAG AGENT WITH WEB SEARCH');
    console.log('🧠 Model: llama3.2:1b GPU');
    console.log('🌐 Web Search: Mock Implementation'); 
    console.log('🗃️ Master Database: Healthcare Providers');
    console.log('🎯 Goal: Comprehensive provider profiling\n');

    const agent = new SimpleEnhancedRAG();
    
    try {
        await agent.initialize();
        
        const systemOk = await agent.testModel();
        if (systemOk) {
            console.log('✅ All systems operational\n');
        } else {
            console.log('⚠️ System performance warning, continuing...\n');
        }

        await agent.processProviders();

    } catch (error) {
        console.error('❌ Enhanced RAG agent error:', error.message);
    }
}

process.on('SIGINT', () => {
    console.log('\n⚠️ Enhanced RAG agent shutdown');
    process.exit(0);
});

main();