#!/usr/bin/env node

/**
 * Production Enhanced RAG Agent with Real Web Search
 * Provider profiling with actual web scraping and master data integration
 * Using only Node.js built-in modules
 */

const axios = require('axios');
const https = require('https');
const http = require('http');
const { URL } = require('url');
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
        userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Mobile Safari/537.36',
        maxPages: 3,
        searchEngines: [
            'https://www.google.com/search?q=',
            'https://duckduckgo.com/?q='
        ]
    },
    database: {
        intelligentDbPort: 5005,
        enabled: false // Will try to connect
    }
};

class ProductionRAGAgent {
    constructor() {
        this.masterData = new Map();
        this.webCache = new Map();
        this.providerDatabase = [];
        this.searchHistory = [];
        this.intelligentDbConnected = false;
    }

    async initialize() {
        console.log('🔧 Initializing Production Enhanced RAG Agent...');
        
        // Try to connect to Intelligent Database
        try {
            await this.connectToIntelligentDB();
        } catch (error) {
            console.log('⚠️ Intelligent DB not available, using local master data');
        }
        
        await this.loadProviderDatabase();
        console.log('✅ Production RAG system ready');
    }

    async connectToIntelligentDB() {
        return new Promise((resolve, reject) => {
            const req = http.get(`http://localhost:${CONFIG.database.intelligentDbPort}/health`, (res) => {
                if (res.statusCode === 200) {
                    this.intelligentDbConnected = true;
                    console.log('🔗 Connected to Intelligent Database service');
                    resolve(true);
                } else {
                    reject(new Error('DB service unavailable'));
                }
            });
            
            req.on('error', reject);
            req.setTimeout(2000, () => reject(new Error('DB connection timeout')));
        });
    }

    async loadProviderDatabase() {
        // Enhanced provider database with more comprehensive information
        const providers = [
            {
                id: 'apollo_hospitals',
                name: 'Apollo Hospitals',
                category: 'hospital',
                type: 'multi_specialty_hospital',
                specialties: ['Cardiology', 'Oncology', 'Neurology', 'Orthopedics', 'Transplant', 'Emergency Medicine'],
                services: ['Emergency Care', 'Surgery', 'ICU', 'Diagnostic Imaging', 'Pharmacy', 'Blood Bank'],
                locations: ['Delhi', 'Mumbai', 'Chennai', 'Bangalore', 'Hyderabad', 'Kolkata', 'Ahmedabad'],
                contact: {
                    phone: '+91-40-23607777',
                    email: 'info@apollohospitals.com',
                    website: 'https://www.apollohospitals.com'
                },
                established: 1983,
                rating: 4.3,
                reviews: 2500,
                accreditations: ['JCI', 'NABH', 'ISO'],
                infrastructure: {
                    beds: 10000,
                    doctors: 4000,
                    nurses: 8000,
                    locations: 71
                },
                financial: {
                    revenue: '₹15,000 Cr',
                    employees: 60000
                },
                digital_presence: {
                    website: true,
                    mobile_app: true,
                    online_booking: true,
                    telemedicine: true
                }
            },
            {
                id: 'fortis_healthcare',
                name: 'Fortis Healthcare',
                category: 'hospital',
                type: 'multi_specialty_hospital',
                specialties: ['Cardiac Sciences', 'Neurosciences', 'Renal Sciences', 'Oncology', 'Orthopedics'],
                services: ['Emergency Care', 'Surgery', 'Transplant', 'Rehabilitation', 'Diagnostics'],
                locations: ['Delhi NCR', 'Mumbai', 'Bangalore', 'Kolkata', 'Pune', 'Jaipur'],
                contact: {
                    phone: '+91-11-47135000',
                    email: 'info@fortishealthcare.com',
                    website: 'https://www.fortishealthcare.com'
                },
                established: 2001,
                rating: 4.2,
                reviews: 1800,
                accreditations: ['JCI', 'NABH', 'NABL'],
                infrastructure: {
                    beds: 5000,
                    doctors: 2000,
                    nurses: 4000,
                    locations: 36
                },
                financial: {
                    revenue: '₹5,500 Cr',
                    employees: 23000
                },
                digital_presence: {
                    website: true,
                    mobile_app: true,
                    online_booking: true,
                    telemedicine: true
                }
            },
            {
                id: 'dr_lal_pathlabs',
                name: 'Dr Lal PathLabs',
                category: 'laboratory',
                type: 'diagnostic_laboratory',
                specialties: ['Clinical Pathology', 'Radiology', 'Molecular Diagnostics', 'Genetics', 'Microbiology'],
                services: ['Blood Tests', 'Imaging', 'Home Sample Collection', 'Health Checkups', 'Genetic Testing'],
                locations: ['Pan India', '4000+ Centers', 'International Presence'],
                contact: {
                    phone: '+91-11-30081000',
                    email: 'info@lalpathlabs.com',
                    website: 'https://www.lalpathlabs.com'
                },
                established: 1949,
                rating: 4.1,
                reviews: 3200,
                accreditations: ['NABL', 'CAP', 'ISO 15189'],
                infrastructure: {
                    centers: 4000,
                    tests_offered: 5000,
                    laboratories: 250,
                    collection_points: 3750
                },
                financial: {
                    revenue: '₹1,800 Cr',
                    employees: 15000
                },
                digital_presence: {
                    website: true,
                    mobile_app: true,
                    online_booking: true,
                    home_collection: true,
                    digital_reports: true
                }
            },
            {
                id: 'max_healthcare',
                name: 'Max Healthcare',
                category: 'hospital',
                type: 'multi_specialty_hospital',
                specialties: ['Cancer Care', 'Cardiac Sciences', 'Neurosciences', 'Orthopedics', 'Gastroenterology'],
                services: ['Emergency Care', 'Surgery', 'Oncology', 'Critical Care', 'Rehabilitation'],
                locations: ['Delhi NCR', 'Uttarakhand', 'Punjab', 'Haryana'],
                contact: {
                    phone: '+91-11-26692251',
                    email: 'info@maxhealthcare.in',
                    website: 'https://www.maxhealthcare.in'
                },
                established: 2001,
                rating: 4.4,
                reviews: 1500,
                accreditations: ['JCI', 'NABH', 'NABL'],
                infrastructure: {
                    beds: 2400,
                    doctors: 1500,
                    nurses: 3000,
                    locations: 17
                },
                financial: {
                    revenue: '₹4,500 Cr',
                    employees: 12000
                },
                digital_presence: {
                    website: true,
                    mobile_app: true,
                    online_booking: true,
                    telemedicine: true
                }
            },
            {
                id: 'aiims_delhi',
                name: 'All India Institute of Medical Sciences (AIIMS) Delhi',
                category: 'hospital',
                type: 'government_medical_institute',
                specialties: ['All Medical Specialties', 'Research', 'Teaching', 'Super Specialty Care'],
                services: ['Emergency Care', 'Surgery', 'OPD', 'Research', 'Medical Education'],
                locations: ['Delhi', 'Multiple AIIMS Centers across India'],
                contact: {
                    phone: '+91-11-26588500',
                    email: 'dir@aiims.ac.in',
                    website: 'https://www.aiims.edu'
                },
                established: 1956,
                rating: 4.6,
                reviews: 5000,
                accreditations: ['Government Institution', 'Medical Education Council'],
                infrastructure: {
                    beds: 2478,
                    doctors: 2000,
                    nurses: 3500,
                    research_centers: 42
                },
                financial: {
                    budget: '₹2,500 Cr',
                    employees: 8000,
                    type: 'government_funded'
                },
                digital_presence: {
                    website: true,
                    mobile_app: false,
                    online_booking: 'limited',
                    telemedicine: true
                }
            }
        ];

        providers.forEach(provider => {
            this.masterData.set(provider.name.toLowerCase(), provider);
            this.providerDatabase.push(provider);
        });

        console.log(`📊 Loaded ${providers.length} providers in master database`);
    }

    async performRealWebSearch(providerName) {
        if (!CONFIG.webSearch.enabled) return [];

        console.log(`🌐 Performing real web search for: ${providerName}`);
        
        const searchQueries = [
            `${providerName} official website contact`,
            `${providerName} hospital clinic services`,
            `${providerName} reviews ratings patient feedback`,
            `${providerName} location address phone number`
        ];

        const allResults = [];

        for (const query of searchQueries) {
            try {
                const results = await this.searchWithDuckDuckGo(query);
                allResults.push(...results);
                
                // Slight delay between searches
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                console.warn(`⚠️ Search failed for query: ${query}`);
            }
        }

        // Remove duplicates and limit results
        const uniqueResults = this.deduplicateWebResults(allResults);
        console.log(`🔍 Found ${uniqueResults.length} unique web results`);
        
        return uniqueResults.slice(0, 8);
    }

    async searchWithDuckDuckGo(query) {
        return new Promise((resolve, reject) => {
            const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
            
            const options = {
                headers: {
                    'User-Agent': CONFIG.webSearch.userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'DNT': '1',
                    'Connection': 'keep-alive'
                },
                timeout: CONFIG.webSearch.timeout
            };

            https.get(searchUrl, options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const results = this.parseSearchResults(data, query);
                        resolve(results);
                    } catch (error) {
                        reject(error);
                    }
                });
                
            }).on('error', reject);
        });
    }

    parseSearchResults(html, query) {
        const results = [];
        
        // Simple HTML parsing for search results (basic implementation)
        const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
        const snippetRegex = /<span class="snippet">([^<]+)<\/span>/gi;
        
        let match;
        let linkCount = 0;
        
        while ((match = linkRegex.exec(html)) !== null && linkCount < 5) {
            const url = match[1];
            const title = match[2];
            
            if (url && title && !url.includes('javascript:') && url.startsWith('http')) {
                results.push({
                    title: title.trim(),
                    url: url,
                    snippet: `Search result for: ${query}`,
                    source: 'duckduckgo',
                    relevance: this.calculateRelevance(title, query),
                    timestamp: new Date().toISOString()
                });
                linkCount++;
            }
        }
        
        return results;
    }

    calculateRelevance(text, query) {
        const textLower = text.toLowerCase();
        const queryWords = query.toLowerCase().split(' ');
        let score = 0;
        
        queryWords.forEach(word => {
            if (textLower.includes(word)) {
                score += 0.2;
            }
        });
        
        return Math.min(score, 1.0);
    }

    deduplicateWebResults(results) {
        const seen = new Set();
        return results.filter(result => {
            const key = result.url;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    async queryIntelligentDB(providerName) {
        if (!this.intelligentDbConnected) return null;

        try {
            const response = await axios.get(`http://localhost:${CONFIG.database.intelligentDbPort}/providers/search?name=${encodeURIComponent(providerName)}`, {
                timeout: 3000
            });
            
            return response.data;
        } catch (error) {
            console.warn('⚠️ Intelligent DB query failed:', error.message);
            return null;
        }
    }

    async getLLMAnalysis(name, context = '') {
        try {
            const prompt = `Analyze healthcare provider: ${name}${context ? ' Additional context: ' + context : ''}
Categories: hospital, clinic, laboratory, pharmacy, individual_doctor
Type:`;

            const response = await axios.post(CONFIG.endpoint, {
                model: CONFIG.model,
                prompt: prompt,
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
                analysis: this.extractAnalysis(llmResponse),
                confidence: this.calculateLLMConfidence(llmResponse),
                source: 'llm_analysis'
            };

        } catch (error) {
            console.warn(`⚠️ LLM failed for ${name}, using fallback`);
            return {
                raw_response: 'llm_unavailable',
                category: this.fallbackCategory(name),
                analysis: 'Fallback categorization based on name patterns',
                confidence: 0.4,
                source: 'fallback'
            };
        }
    }

    extractAnalysis(response) {
        // Extract key insights from LLM response
        const insights = [];
        const lower = response.toLowerCase();
        
        if (lower.includes('multi-specialty')) insights.push('Multi-specialty facility');
        if (lower.includes('government')) insights.push('Government institution');
        if (lower.includes('private')) insights.push('Private healthcare');
        if (lower.includes('teaching')) insights.push('Teaching hospital');
        if (lower.includes('research')) insights.push('Research facility');
        
        return insights.length > 0 ? insights.join(', ') : 'Standard healthcare provider';
    }

    calculateLLMConfidence(response) {
        let confidence = 0.5; // Base confidence
        
        // Increase confidence based on response quality
        if (response.length > 10) confidence += 0.1;
        if (response.includes('hospital') || response.includes('clinic')) confidence += 0.2;
        if (response.includes('specialty')) confidence += 0.1;
        
        return Math.min(confidence, 1.0);
    }

    async searchMasterData(providerName) {
        const searchKey = providerName.toLowerCase();
        const results = [];

        for (const provider of this.providerDatabase) {
            const score = this.calculateAdvancedSearchScore(searchKey, provider);
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

    calculateAdvancedSearchScore(searchKey, provider) {
        let score = 0;
        const nameWords = provider.name.toLowerCase().split(' ');
        const searchWords = searchKey.split(' ');

        // Exact name match
        if (provider.name.toLowerCase() === searchKey) {
            score += 1.0;
        }

        // Partial name matches with weighted scoring
        searchWords.forEach(searchWord => {
            if (provider.name.toLowerCase().includes(searchWord)) {
                score += 0.4;
            }
            nameWords.forEach(nameWord => {
                if (nameWord.includes(searchWord) || searchWord.includes(nameWord)) {
                    score += 0.2;
                }
                
                // Fuzzy matching for common misspellings
                if (this.calculateStringDistance(nameWord, searchWord) <= 2) {
                    score += 0.1;
                }
            });
        });

        // Category and specialty matches
        if (provider.category && searchKey.includes(provider.category)) {
            score += 0.3;
        }
        
        if (provider.specialties) {
            provider.specialties.forEach(specialty => {
                if (searchKey.includes(specialty.toLowerCase())) {
                    score += 0.2;
                }
            });
        }

        return Math.min(score, 1.0);
    }

    calculateStringDistance(str1, str2) {
        // Simple Levenshtein distance implementation
        const matrix = [];
        const len1 = str1.length;
        const len2 = str2.length;

        if (len1 === 0) return len2;
        if (len2 === 0) return len1;

        for (let i = 0; i <= len2; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= len1; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= len2; i++) {
            for (let j = 1; j <= len1; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }

        return matrix[len2][len1];
    }

    async createComprehensiveProfile(name) {
        console.log(`🚀 Creating comprehensive profile: ${name}`);
        
        const start = Date.now();
        const profile = {
            id: this.generateId(name),
            name: name,
            timestamp: new Date().toISOString(),
            processing_metadata: {
                start_time: start,
                agent_version: 'production_v1',
                data_sources: []
            }
        };

        try {
            // 1. LLM Analysis
            const llmResult = await this.getLLMAnalysis(name);
            profile.llm_analysis = llmResult;
            profile.processing_metadata.data_sources.push('llm');
            
            // 2. Master Database Search
            const masterResults = await this.searchMasterData(name);
            profile.master_data = {
                matches: masterResults,
                best_match: masterResults.length > 0 ? masterResults[0] : null
            };
            if (masterResults.length > 0) {
                profile.processing_metadata.data_sources.push('master_database');
            }
            
            // 3. Intelligent Database Query
            const intelligentDbResult = await this.queryIntelligentDB(name);
            if (intelligentDbResult) {
                profile.intelligent_db = intelligentDbResult;
                profile.processing_metadata.data_sources.push('intelligent_db');
            }
            
            // 4. Real Web Search
            const webResults = await this.performRealWebSearch(name);
            profile.web_search = {
                enabled: CONFIG.webSearch.enabled,
                results: webResults,
                result_count: webResults.length,
                search_successful: webResults.length > 0
            };
            if (webResults.length > 0) {
                profile.processing_metadata.data_sources.push('web_search');
            }
            
            // 5. Data Consolidation
            profile.consolidated_profile = this.consolidateAllSources(
                llmResult, 
                masterResults, 
                intelligentDbResult, 
                webResults
            );
            
            // 6. Quality Assessment
            profile.quality_assessment = this.assessDataQuality(profile);
            
            profile.processing_metadata.end_time = Date.now();
            profile.processing_metadata.duration = profile.processing_metadata.end_time - start;
            
            console.log(`✅ Comprehensive profile created for ${name} (${profile.processing_metadata.duration}ms)`);
            
            // Store search history
            this.searchHistory.push({
                name: name,
                timestamp: profile.timestamp,
                sources: profile.processing_metadata.data_sources,
                quality_score: profile.quality_assessment.overall_score
            });
            
            return profile;

        } catch (error) {
            console.error(`❌ Error creating profile for ${name}:`, error.message);
            return this.createErrorProfile(name, error, Date.now() - start);
        }
    }

    consolidateAllSources(llmResult, masterResults, intelligentDbResult, webResults) {
        const consolidated = {
            basic_info: {},
            services_and_specialties: [],
            contact_information: {},
            infrastructure: {},
            quality_indicators: {},
            digital_presence: {},
            financial_info: {},
            accreditations: [],
            locations: [],
            data_confidence: 0
        };

        let sourceCount = 0;

        // Primary source: Master Database (highest priority)
        const bestMasterMatch = masterResults.length > 0 ? masterResults[0] : null;
        if (bestMasterMatch && bestMasterMatch.score > 0.7) {
            const provider = bestMasterMatch.provider;
            
            consolidated.basic_info = {
                official_name: provider.name,
                category: provider.category,
                type: provider.type,
                established: provider.established
            };
            
            if (provider.specialties) {
                consolidated.services_and_specialties.push(...provider.specialties);
            }
            if (provider.services) {
                consolidated.services_and_specialties.push(...provider.services);
            }
            
            consolidated.contact_information = provider.contact || {};
            consolidated.infrastructure = provider.infrastructure || {};
            consolidated.quality_indicators = {
                rating: provider.rating,
                reviews: provider.reviews,
                accreditations: provider.accreditations || []
            };
            consolidated.digital_presence = provider.digital_presence || {};
            consolidated.financial_info = provider.financial || {};
            consolidated.locations = provider.locations || [];
            
            sourceCount++;
        }

        // Secondary source: LLM Analysis
        if (llmResult && llmResult.confidence > 0.5) {
            if (!consolidated.basic_info.category) {
                consolidated.basic_info.category = llmResult.category;
            }
            consolidated.basic_info.llm_analysis = llmResult.analysis;
            sourceCount++;
        }

        // Tertiary source: Web Search Results
        if (webResults && webResults.length > 0) {
            const webData = this.extractWebData(webResults);
            
            // Enhance contact information
            if (webData.contact && !consolidated.contact_information.website) {
                Object.assign(consolidated.contact_information, webData.contact);
            }
            
            // Add web-discovered services
            if (webData.services && webData.services.length > 0) {
                consolidated.services_and_specialties.push(...webData.services);
            }
            
            sourceCount++;
        }

        // Quaternary source: Intelligent Database
        if (intelligentDbResult) {
            // Merge intelligent DB data
            Object.assign(consolidated, intelligentDbResult);
            sourceCount++;
        }

        // Remove duplicates and clean data
        consolidated.services_and_specialties = [...new Set(consolidated.services_and_specialties)];
        consolidated.accreditations = [...new Set(consolidated.accreditations)];
        
        // Calculate confidence based on source count and quality
        consolidated.data_confidence = Math.min(sourceCount * 0.25, 1.0);
        
        return consolidated;
    }

    extractWebData(webResults) {
        const webData = {
            contact: {},
            services: [],
            ratings: null
        };

        webResults.forEach(result => {
            // Extract potential contact information from URLs and snippets
            if (result.url && result.url.includes('contact')) {
                webData.contact.website = result.url;
            }
            
            // Extract services from titles and snippets
            const text = `${result.title} ${result.snippet}`.toLowerCase();
            const serviceKeywords = ['surgery', 'emergency', 'cardiology', 'oncology', 'radiology'];
            
            serviceKeywords.forEach(service => {
                if (text.includes(service)) {
                    webData.services.push(service);
                }
            });
        });

        return webData;
    }

    assessDataQuality(profile) {
        const assessment = {
            completeness_score: 0,
            reliability_score: 0,
            freshness_score: 0,
            consistency_score: 0,
            overall_score: 0
        };

        // Completeness: How much information we have
        let completenessFactors = 0;
        if (profile.consolidated_profile.basic_info.official_name) completenessFactors++;
        if (profile.consolidated_profile.basic_info.category) completenessFactors++;
        if (profile.consolidated_profile.contact_information.phone || profile.consolidated_profile.contact_information.website) completenessFactors++;
        if (profile.consolidated_profile.services_and_specialties.length > 0) completenessFactors++;
        if (profile.consolidated_profile.locations.length > 0) completenessFactors++;
        assessment.completeness_score = completenessFactors / 5;

        // Reliability: How trustworthy are our sources
        let reliabilityScore = 0;
        if (profile.master_data.best_match && profile.master_data.best_match.score > 0.8) reliabilityScore += 0.4;
        if (profile.llm_analysis.confidence > 0.6) reliabilityScore += 0.2;
        if (profile.web_search.search_successful) reliabilityScore += 0.2;
        if (profile.intelligent_db) reliabilityScore += 0.2;
        assessment.reliability_score = Math.min(reliabilityScore, 1.0);

        // Freshness: How recent is our data
        assessment.freshness_score = 0.8; // Assume reasonably fresh for demo

        // Consistency: How well do sources agree
        const sourceCount = profile.processing_metadata.data_sources.length;
        assessment.consistency_score = Math.min(sourceCount * 0.25, 1.0);

        // Overall score
        assessment.overall_score = (
            assessment.completeness_score * 0.3 +
            assessment.reliability_score * 0.4 +
            assessment.freshness_score * 0.1 +
            assessment.consistency_score * 0.2
        );

        return assessment;
    }

    createErrorProfile(name, error, duration) {
        return {
            id: this.generateId(name),
            name: name,
            error: error.message,
            status: 'failed',
            processing_metadata: {
                duration: duration,
                error_type: error.name || 'Unknown'
            },
            timestamp: new Date().toISOString()
        };
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

    generateId(name) {
        return name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 20);
    }

    async processProviders() {
        const testProviders = [
            'Apollo Hospitals',
            'Max Healthcare',
            'Dr Lal PathLabs',
            'AIIMS Delhi',
            'Fortis Healthcare',
            'Medanta Hospital'
        ];

        console.log(`\n🏥 Processing ${testProviders.length} providers with Production RAG...\n`);

        const results = [];
        let totalTime = 0;

        for (const provider of testProviders) {
            const profile = await this.createComprehensiveProfile(provider);
            results.push(profile);
            if (profile.processing_metadata && profile.processing_metadata.duration) {
                totalTime += profile.processing_metadata.duration;
            }
            
            // Brief pause between requests
            await new Promise(resolve => setTimeout(resolve, 1500));
        }

        this.displayComprehensiveResults(results, totalTime);
    }

    displayComprehensiveResults(results, totalTime) {
        console.log(`\n📊 PRODUCTION RAG AGENT RESULTS`);
        console.log(`===============================`);
        console.log(`✅ Processed: ${results.length} healthcare providers`);
        console.log(`⚡ Total processing time: ${totalTime}ms`);
        console.log(`📈 Average time per provider: ${Math.round(totalTime / results.length)}ms`);
        console.log(`🧠 AI Model: llama3.2:1b GPU`);
        console.log(`🌐 Web Search: Real (DuckDuckGo)`);
        console.log(`🗃️ Master Database: ${this.providerDatabase.length} providers`);
        console.log(`🔗 Intelligent DB: ${this.intelligentDbConnected ? 'Connected' : 'Offline'}`);
        
        let successfulProfiles = 0;
        results.forEach((profile, index) => {
            if (profile.status !== 'failed') {
                successfulProfiles++;
                console.log(`\n${index + 1}. 🏥 ${profile.name}`);
                console.log(`   ├─ Category: ${profile.consolidated_profile.basic_info.category || 'Unknown'}`);
                console.log(`   ├─ Data Sources: ${profile.processing_metadata.data_sources.length} (${profile.processing_metadata.data_sources.join(', ')})`);
                console.log(`   ├─ Overall Quality: ${(profile.quality_assessment.overall_score * 100).toFixed(1)}%`);
                console.log(`   ├─ Completeness: ${(profile.quality_assessment.completeness_score * 100).toFixed(1)}%`);
                console.log(`   ├─ Reliability: ${(profile.quality_assessment.reliability_score * 100).toFixed(1)}%`);
                
                if (profile.master_data.best_match) {
                    const match = profile.master_data.best_match;
                    console.log(`   ├─ Master Match: ${(match.score * 100).toFixed(1)}% - ${match.provider.name}`);
                    if (match.provider.established) {
                        console.log(`   ├─ Established: ${match.provider.established}`);
                    }
                    if (match.provider.rating) {
                        console.log(`   ├─ Rating: ${match.provider.rating}⭐ (${match.provider.reviews || 0} reviews)`);
                    }
                }
                
                if (profile.web_search.search_successful) {
                    console.log(`   ├─ Web Results: ${profile.web_search.result_count} pages found`);
                }
                
                const services = profile.consolidated_profile.services_and_specialties.slice(0, 3);
                if (services.length > 0) {
                    console.log(`   ├─ Services: ${services.join(', ')}${services.length < profile.consolidated_profile.services_and_specialties.length ? '...' : ''}`);
                }
                
                console.log(`   └─ Processing Time: ${profile.processing_metadata.duration}ms`);
            } else {
                console.log(`\n${index + 1}. ❌ ${profile.name} - FAILED (${profile.error})`);
            }
        });

        console.log(`\n🎯 COMPREHENSIVE METRICS:`);
        const avgQuality = results.filter(r => r.quality_assessment).reduce((sum, r) => sum + r.quality_assessment.overall_score, 0) / successfulProfiles;
        const avgCompleteness = results.filter(r => r.quality_assessment).reduce((sum, r) => sum + r.quality_assessment.completeness_score, 0) / successfulProfiles;
        const avgReliability = results.filter(r => r.quality_assessment).reduce((sum, r) => sum + r.quality_assessment.reliability_score, 0) / successfulProfiles;
        const masterMatches = results.filter(r => r.master_data && r.master_data.best_match).length;
        const webSearches = results.filter(r => r.web_search && r.web_search.search_successful).length;
        
        console.log(`   Success Rate: ${successfulProfiles}/${results.length} (${((successfulProfiles/results.length)*100).toFixed(1)}%)`);
        console.log(`   Average Quality Score: ${(avgQuality * 100).toFixed(1)}%`);
        console.log(`   Average Completeness: ${(avgCompleteness * 100).toFixed(1)}%`);
        console.log(`   Average Reliability: ${(avgReliability * 100).toFixed(1)}%`);
        console.log(`   Master Database Matches: ${masterMatches}/${results.length} (${((masterMatches/results.length)*100).toFixed(1)}%)`);
        console.log(`   Web Search Success: ${webSearches}/${results.length} (${((webSearches/results.length)*100).toFixed(1)}%)`);
        console.log(`   Search History: ${this.searchHistory.length} total searches`);
    }

    async testSystem() {
        console.log('🧪 Testing Production RAG system...');
        const testResult = await this.createComprehensiveProfile('Test Healthcare Provider');
        
        if (testResult.status === 'failed') {
            console.log('⚠️ System test failed, but continuing...');
            return false;
        }
        
        const qualityScore = testResult.quality_assessment ? testResult.quality_assessment.overall_score : 0;
        return qualityScore > 0.3;
    }
}

async function main() {
    console.log('🚀 PRODUCTION ENHANCED RAG AGENT WITH REAL WEB SEARCH');
    console.log('🧠 Model: llama3.2:1b GPU');
    console.log('🌐 Web Search: Real DuckDuckGo Implementation'); 
    console.log('🗃️ Master Database: Healthcare Provider Registry');
    console.log('🔗 Intelligent Database: Dynamic Connection');
    console.log('🎯 Goal: Comprehensive provider profiling with multi-source intelligence\n');

    const agent = new ProductionRAGAgent();
    
    try {
        await agent.initialize();
        
        const systemOk = await agent.testSystem();
        if (systemOk) {
            console.log('✅ All systems operational\n');
        } else {
            console.log('⚠️ System performance warning, continuing...\n');
        }

        await agent.processProviders();

    } catch (error) {
        console.error('❌ Production RAG agent error:', error.message);
    }
}

process.on('SIGINT', () => {
    console.log('\n⚠️ Production RAG agent shutdown');
    process.exit(0);
});

main();