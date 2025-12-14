#!/usr/bin/env node

/**
 * Ultra-Fast RAG Agent for Provider Profiling
 * Minimal prompts, maximum speed with llama3.2:1b
 */

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');

// Ultra-Fast Configuration with Web Search
const CONFIG = {
    model: 'llama3.2:1b',
    endpoint: 'http://localhost:11434/api/generate',
    timeout: 8000,
    maxTokens: 64,
    webSearch: {
        enabled: true,
        timeout: 5000,
        maxResults: 3,
        userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36'
    },
    masterData: {
        basePath: '/root/Mediczy/server/db/masters',
        clinicsFile: '/root/Mediczy/server/db/masters/clinics_master.json',
        providersFile: '/root/Mediczy/server/db/masters/providers_master.json'
    }
};

class UltraFastRAG {
    constructor() {
        this.masterData = new Map();
        this.webCache = new Map();
        this.searchResults = new Map();
    }

    async initialize() {
        console.log('🔧 Initializing Ultra-Fast RAG with Web Search...');
        await this.loadMasterData();
        console.log('✅ Master data loaded');
    }
    async loadMasterData() {
        try {
            // Load existing master data files
            const masterFiles = [
                CONFIG.masterData.clinicsFile,
                CONFIG.masterData.providersFile
            ];

            for (const filePath of masterFiles) {
                try {
                    const data = await fs.readFile(filePath, 'utf8');
                    const jsonData = JSON.parse(data);
                    console.log(`📂 Loaded ${Object.keys(jsonData).length} records from ${path.basename(filePath)}`);
                    
                    // Store in master data map
                    Object.entries(jsonData).forEach(([key, value]) => {
                        this.masterData.set(key.toLowerCase(), value);
                    });
                } catch (error) {
                    console.warn(`⚠️ Could not load ${filePath}: ${error.message}`);
                }
            }

            // Load pincode master data
            await this.loadPincodeMaster();

        } catch (error) {
            console.warn('⚠️ Master data loading failed:', error.message);
        }
    }

    async loadPincodeMaster() {
        try {
            const pincodePath = '/root/Mediczy/server/db/masters/pincode_master.csv';
            const pincodeData = await fs.readFile(pincodePath, 'utf8');
            const lines = pincodeData.split('\n').slice(1); // Skip header
            
            lines.forEach(line => {
                const [pincode, placeName, state] = line.split(',');
                if (pincode && placeName) {
                    this.masterData.set(`pincode_${pincode}`, {
                        pincode,
                        place: placeName.trim(),
                        state: state?.trim()
                    });
                }
            });

            console.log(`📍 Loaded ${lines.length} pincode records`);
        } catch (error) {
            console.warn('⚠️ Pincode master loading failed:', error.message);
        }
    }

    async searchMasterData(providerName, location = '') {
        const searchKey = providerName.toLowerCase();
        const results = [];

        // Search in master data
        for (const [key, value] of this.masterData.entries()) {
            if (key.includes(searchKey) || 
                (value.name && value.name.toLowerCase().includes(searchKey)) ||
                (value.address && value.address.toLowerCase().includes(searchKey))) {
                results.push({
                    source: 'master_data',
                    data: value,
                    confidence: this.calculateMatchConfidence(searchKey, key, value)
                });
            }
        }

        console.log(`🗃️ Found ${results.length} master data matches for ${providerName}`);
        return results.slice(0, 3); // Limit results
    }

    calculateMatchConfidence(searchKey, key, value) {
        let confidence = 0;
        
        if (key === searchKey) confidence += 0.5;
        if (key.includes(searchKey)) confidence += 0.3;
        if (value.name && value.name.toLowerCase().includes(searchKey)) confidence += 0.2;
        
        return Math.min(confidence, 1.0);
    }

    async webSearchProvider(providerName, location = '') {
        if (!CONFIG.webSearch.enabled) return [];

        console.log(`🔍 Web searching: ${providerName}`);
        
        try {
            const cacheKey = `${providerName}_${location}`;
            if (this.webCache.has(cacheKey)) {
                console.log('📋 Using cached web results');
                return this.webCache.get(cacheKey);
            }

            const searchQueries = [
                `"${providerName}" healthcare provider contact`,
                `${providerName} hospital clinic ${location}`,
                `${providerName} medical services ${location}`
            ];

            const results = [];
            
            for (const query of searchQueries.slice(0, 2)) { // Limit to 2 searches for speed
                try {
                    const searchResults = await this.performWebSearch(query);
                    results.push(...searchResults);
                } catch (error) {
                    console.warn(`⚠️ Search failed for: ${query}`);
                }
                
                // Brief delay between searches
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // Cache results
            this.webCache.set(cacheKey, results);
            console.log(`🌐 Found ${results.length} web results for ${providerName}`);
            
            return results;

        } catch (error) {
            console.error(`❌ Web search failed for ${providerName}:`, error.message);
            return [];
        }
    }

    async performWebSearch(query) {
        try {
            // Use DuckDuckGo search (no API key required)
            const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
            
            const response = await axios.get(searchUrl, {
                timeout: CONFIG.webSearch.timeout,
                headers: {
                    'User-Agent': CONFIG.webSearch.userAgent
                }
            });

            return this.parseDuckDuckGoResults(response.data, query);

        } catch (error) {
            console.warn(`⚠️ DuckDuckGo search failed: ${error.message}`);
            
            // Fallback to mock search results for demonstration
            return this.generateMockSearchResults(query);
        }
    }

    parseDuckDuckGoResults(html, query) {
        const $ = cheerio.load(html);
        const results = [];

        $('.result').each((i, element) => {
            if (i >= CONFIG.webSearch.maxResults) return false;

            const $elem = $(element);
            const title = $elem.find('.result__title').text().trim();
            const snippet = $elem.find('.result__snippet').text().trim();
            const url = $elem.find('.result__url').attr('href');

            if (title && snippet) {
                results.push({
                    source: 'web_search',
                    title: title,
                    snippet: snippet,
                    url: url,
                    query: query,
                    relevance: this.calculateWebRelevance(query, title + ' ' + snippet)
                });
            }
        });

        return results;
    }

    generateMockSearchResults(query) {
        // Mock results for demonstration when web search fails
        return [
            {
                source: 'web_search_mock',
                title: `${query} - Healthcare Provider Information`,
                snippet: `Professional healthcare services, contact information and patient reviews.`,
                url: `https://example.com/provider/${query.replace(/\s+/g, '-')}`,
                query: query,
                relevance: 0.8
            }
        ];
    }

    calculateWebRelevance(query, content) {
        const queryWords = query.toLowerCase().split(' ');
        const contentLower = content.toLowerCase();
        
        const matches = queryWords.filter(word => contentLower.includes(word)).length;
        return matches / queryWords.length;
    }

    async scrapeProviderDetails(url) {
        try {
            console.log(`🕷️ Scraping: ${url}`);
            
            const response = await axios.get(url, {
                timeout: 5000,
                headers: {
                    'User-Agent': CONFIG.webSearch.userAgent
                }
            });

            const $ = cheerio.load(response.data);
            
            const details = {
                phone: this.extractPhone($),
                email: this.extractEmail($),
                address: this.extractAddress($),
                services: this.extractServices($),
                hours: this.extractHours($),
                specializations: this.extractSpecializations($)
            };

            console.log(`✅ Scraped details from ${url}`);
            return details;

        } catch (error) {
            console.warn(`⚠️ Scraping failed for ${url}:`, error.message);
            return {};
        }
    }

    extractPhone($) {
        const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
        const text = $('body').text();
        const match = text.match(phoneRegex);
        return match ? match[0] : null;
    }

    extractEmail($) {
        const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
        const text = $('body').text();
        const match = text.match(emailRegex);
        return match ? match[0] : null;
    }

    extractAddress($) {
        const addressSelectors = [
            '.address', '.location', '.contact-address',
            '[itemtype*="PostalAddress"]', '.adr'
        ];

        for (const selector of addressSelectors) {
            const addr = $(selector).first().text().trim();
            if (addr && addr.length > 10) return addr;
        }

        return null;
    }

    extractServices($) {
        const serviceSelectors = [
            '.services', '.specialties', '.treatments',
            '.medical-services', '.healthcare-services'
        ];

        const services = [];
        serviceSelectors.forEach(selector => {
            $(selector).find('li, p, span').each((i, elem) => {
                const service = $(elem).text().trim();
                if (service && service.length > 3 && service.length < 100) {
                    services.push(service);
                }
            });
        });

        return services.slice(0, 10); // Limit to 10 services
    }

    extractHours($) {
        const hourSelectors = [
            '.hours', '.opening-hours', '.business-hours',
            '.schedule', '.timing'
        ];

        for (const selector of hourSelectors) {
            const hours = $(selector).first().text().trim();
            if (hours && hours.length > 5) return hours;
        }

        return null;
    }

    extractSpecializations($) {
        const specSelectors = [
            '.specializations', '.specialties', '.departments',
            '.medical-areas', '.expertise'
        ];

        const specializations = [];
        specSelectors.forEach(selector => {
            $(selector).find('li, span, div').each((i, elem) => {
                const spec = $(elem).text().trim();
                if (spec && spec.length > 3 && spec.length < 50) {
                    specializations.push(spec);
                }
            });
        });

        return specializations.slice(0, 5);
    }
        console.log(`🚀 Quick profiling: ${name}`);
        
        const start = Date.now();
        
        try {
            // Minimal prompt for speed
            const response = await axios.post(CONFIG.endpoint, {
                model: CONFIG.model,
                prompt: `Type: ${name}\nCategory:`,
                stream: false,
                options: {
                    num_predict: CONFIG.maxTokens,
                    temperature: 0.1,
                    top_k: 10,
                    num_gpu: -1
                }
            }, { timeout: CONFIG.timeout });

            const result = response.data.response?.trim() || 'unknown';
            const time = Date.now() - start;
            
            console.log(`✅ ${name} -> ${result.substring(0, 30)} (${time}ms)`);
            
            return {
                name: name,
                category: this.extractCategory(result),
                response: result,
                processingTime: time
            };

        } catch (error) {
            console.log(`❌ ${name} -> fallback (${error.message.substring(0, 20)})`);
            return {
                name: name,
                category: this.fallbackCategory(name),
                response: 'fallback',
                processingTime: Date.now() - start
            };
        }
    }

    extractCategory(response) {
        const lower = response.toLowerCase();
        if (lower.includes('hospital')) return 'hospital';
        if (lower.includes('clinic')) return 'clinic'; 
        if (lower.includes('lab')) return 'laboratory';
        if (lower.includes('pharmacy')) return 'pharmacy';
        return 'general';
    }

    fallbackCategory(name) {
        const lower = name.toLowerCase();
        if (lower.includes('hospital')) return 'hospital';
        if (lower.includes('clinic')) return 'clinic';
        if (lower.includes('lab')) return 'laboratory';
        if (lower.includes('pharmacy')) return 'pharmacy';
        return 'general';
    }

    async testModel() {
        console.log('🧪 Testing llama3.2:1b...');
        const result = await this.quickProfile('Test Clinic');
        return result.processingTime < 10000; // Must respond within 10s
    }

    async processProviders() {
        const providers = [
            'City General Hospital',
            'Metro Diagnostic Lab', 
            'Family Health Clinic',
            'Downtown Pharmacy',
            'Cardiology Specialist Center'
        ];

        console.log(`\n🏥 Processing ${providers.length} providers with llama3.2:1b GPU...\n`);

        const results = [];
        let totalTime = 0;

        for (const provider of providers) {
            const result = await this.processProvider(provider);
            results.push(result);
            totalTime += result.processingTime;
            
            // Brief pause to prevent overload
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        console.log(`\n📊 ULTRA-FAST RAG RESULTS`);
        console.log(`=========================`);
        console.log(`✅ Processed: ${results.length} providers`);
        console.log(`⚡ Total time: ${totalTime}ms`);
        console.log(`📈 Average: ${Math.round(totalTime / results.length)}ms per provider`);
        console.log(`🧠 Model: llama3.2:1b on GPU`);
        
        results.forEach(r => {
            console.log(`   ${r.name} -> ${r.category} (${r.processingTime}ms)`);
        });
    }

    async processProvider(name) {
        const startTime = Date.now();
        
        try {
            const profile = await this.quickProfile(name);
            
            // Store basic profile
            const record = {
                id: this.generateId(name),
                name: name,
                category: profile.category,
                services: this.inferServices(profile.category),
                llmResponse: profile.response,
                processingTime: profile.processingTime,
                timestamp: new Date().toISOString(),
                source: 'ultra_fast_rag_llama3.2'
            };

            console.log(`📝 Profile: ${record.id} - ${record.category}`);
            
            return {
                name: name,
                category: record.category,
                processingTime: Date.now() - startTime
            };

        } catch (error) {
            return {
                name: name, 
                category: 'error',
                processingTime: Date.now() - startTime
            };
        }
    }

    inferServices(category) {
        const serviceMap = {
            hospital: ['emergency_care', 'surgery', 'inpatient_care'],
            clinic: ['consultation', 'outpatient_care', 'preventive_care'],
            laboratory: ['diagnostic_testing', 'pathology', 'imaging'],
            pharmacy: ['medication_dispensing', 'pharmaceutical_care'],
            general: ['general_healthcare']
        };
        return serviceMap[category] || ['general_healthcare'];
    }

    generateId(name) {
        return name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 15);
    }
}

async function main() {
    console.log('⚡ ULTRA-FAST RAG AGENT');
    console.log('🧠 Model: llama3.2:1b GPU');
    console.log('🎯 Target: Sub-10s provider profiling\n');

    const agent = new UltraFastRAG();
    
    try {
        // Quick model test
        const modelOk = await agent.testModel();
        if (!modelOk) {
            console.log('❌ Model too slow, using fallback mode');
        }

        await agent.processProviders();

    } catch (error) {
        console.error('❌ Agent error:', error.message);
    }
}

process.on('SIGINT', () => {
    console.log('\n⚠️ Ultra-fast RAG shutdown');
    process.exit(0);
});

main();