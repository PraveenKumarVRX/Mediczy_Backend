/**
 * 🔌 INTELLIGENT DATABASE CLIENT - Node.js Integration
 * Connects server.js to the Ultra-Fast Intelligent Database Service
 * Provides seamless data sharing across the multi-service architecture
 */

const axios = require('axios');
const { EventEmitter } = require('events');

class IntelligentDatabaseClient extends EventEmitter {
    constructor(options = {}) {
        super();
        this.baseUrl = options.baseUrl || 'http://localhost:5005';
        this.timeout = options.timeout || 5000;
        this.retries = options.retries || 3;
        this.cache = new Map();
        this.cacheTTL = options.cacheTTL || 300000; // 5 minutes
        
        // Initialize axios client with intelligent configurations
        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: this.timeout,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mediczy-NodeJS-Backend/1.0'
            }
        });

        // Add request/response interceptors for monitoring
        this.setupInterceptors();
        
        console.log('🧠 Intelligent Database Client initialized for Node.js Backend');
    }

    setupInterceptors() {
        // Request interceptor
        this.client.interceptors.request.use(
            (config) => {
                config.metadata = { startTime: Date.now() };
                this.emit('request', { url: config.url, method: config.method });
                return config;
            },
            (error) => Promise.reject(error)
        );

        // Response interceptor
        this.client.interceptors.response.use(
            (response) => {
                const duration = Date.now() - response.config.metadata.startTime;
                this.emit('response', { 
                    url: response.config.url, 
                    status: response.status, 
                    duration 
                });
                return response;
            },
            (error) => {
                this.emit('error', { 
                    url: error.config?.url, 
                    error: error.message 
                });
                return Promise.reject(error);
            }
        );
    }

    /**
     * 🔬 INTELLIGENT MEDICAL ANALYSIS
     * Analyzes patient queries with advanced medical intelligence
     */
    async analyzeMedicalQuery(queryData) {
        try {
            const cacheKey = `analyze_${JSON.stringify(queryData)}`;
            
            // Check cache first
            if (this.cache.has(cacheKey)) {
                const cached = this.cache.get(cacheKey);
                if (Date.now() - cached.timestamp < this.cacheTTL) {
                    return cached.data;
                }
            }

            const response = await this.client.post('/api/intelligent/analyze', {
                query: queryData.query || queryData.symptoms,
                patient_id: queryData.patient_id,
                context: queryData.context || {},
                analysis_type: queryData.analysis_type || 'comprehensive'
            });

            // Cache the result
            this.cache.set(cacheKey, {
                data: response.data,
                timestamp: Date.now()
            });

            return response.data;
        } catch (error) {
            console.error('❌ Medical analysis failed:', error.message);
            throw new Error(`Medical analysis failed: ${error.message}`);
        }
    }

    /**
     * 👤 PATIENT PROFILE MANAGEMENT
     * Comprehensive patient data management with intelligent insights
     */
    async createPatientProfile(patientData) {
        try {
            const response = await this.client.post('/api/intelligent/patient-profile', {
                action: 'create',
                ...patientData
            });
            
            this.emit('patientCreated', response.data);
            return response.data;
        } catch (error) {
            console.error('❌ Patient profile creation failed:', error.message);
            throw error;
        }
    }

    async getPatientProfile(patientId) {
        try {
            const cacheKey = `patient_${patientId}`;
            
            // Check cache first
            if (this.cache.has(cacheKey)) {
                const cached = this.cache.get(cacheKey);
                if (Date.now() - cached.timestamp < this.cacheTTL) {
                    return cached.data;
                }
            }

            const response = await this.client.get(`/api/intelligent/patient-profile/${patientId}`);
            
            // Cache the result
            this.cache.set(cacheKey, {
                data: response.data,
                timestamp: Date.now()
            });

            return response.data;
        } catch (error) {
            console.error('❌ Patient profile retrieval failed:', error.message);
            throw error;
        }
    }

    async updatePatientProfile(patientId, updateData) {
        try {
            const response = await this.client.put(`/api/intelligent/patient-profile/${patientId}`, {
                action: 'update',
                ...updateData
            });

            // Invalidate cache
            this.cache.delete(`patient_${patientId}`);
            this.emit('patientUpdated', { patientId, data: response.data });
            
            return response.data;
        } catch (error) {
            console.error('❌ Patient profile update failed:', error.message);
            throw error;
        }
    }

    /**
     * 👩‍⚕️ DOCTOR MANAGEMENT
     * Intelligent doctor profiles and availability management
     */
    async createDoctorProfile(doctorData) {
        try {
            const response = await this.client.post('/api/intelligent/doctor-profile', {
                action: 'create',
                ...doctorData
            });
            
            this.emit('doctorCreated', response.data);
            return response.data;
        } catch (error) {
            console.error('❌ Doctor profile creation failed:', error.message);
            throw error;
        }
    }

    async getDoctorsBySpecialty(specialty, filters = {}) {
        try {
            const response = await this.client.get('/api/intelligent/doctor-profile', {
                params: {
                    specialty,
                    available: filters.available || true,
                    rating_min: filters.rating_min || 0,
                    location: filters.location,
                    telemedicine: filters.telemedicine
                }
            });

            return response.data;
        } catch (error) {
            console.error('❌ Doctor search failed:', error.message);
            throw error;
        }
    }

    /**
     * 📅 APPOINTMENT MANAGEMENT
     * Intelligent appointment scheduling and management
     */
    async scheduleAppointment(appointmentData) {
        try {
            const response = await this.client.post('/api/intelligent/appointment', {
                action: 'schedule',
                ...appointmentData
            });

            this.emit('appointmentScheduled', response.data);
            return response.data;
        } catch (error) {
            console.error('❌ Appointment scheduling failed:', error.message);
            throw error;
        }
    }

    async getPatientAppointments(patientId, filters = {}) {
        try {
            const response = await this.client.get('/api/intelligent/appointment', {
                params: {
                    patient_id: patientId,
                    status: filters.status || 'all',
                    date_from: filters.date_from,
                    date_to: filters.date_to
                }
            });

            return response.data;
        } catch (error) {
            console.error('❌ Appointment retrieval failed:', error.message);
            throw error;
        }
    }

    /**
     * 📊 HEALTH METRICS TRACKING
     * Intelligent health data analysis and trends
     */
    async recordHealthMetric(healthData) {
        try {
            const response = await this.client.post('/api/intelligent/health-metric', {
                action: 'record',
                ...healthData
            });

            this.emit('healthMetricRecorded', response.data);
            return response.data;
        } catch (error) {
            console.error('❌ Health metric recording failed:', error.message);
            throw error;
        }
    }

    async getHealthTrends(patientId, metricType, timeRange = '30d') {
        try {
            const response = await this.client.get('/api/intelligent/health-metric/trends', {
                params: {
                    patient_id: patientId,
                    metric_type: metricType,
                    time_range: timeRange
                }
            });

            return response.data;
        } catch (error) {
            console.error('❌ Health trends retrieval failed:', error.message);
            throw error;
        }
    }

    /**
     * 📈 ANALYTICS & REPORTING
     * Real-time platform analytics and insights
     */
    async getAnalytics(filters = {}) {
        try {
            const response = await this.client.get('/api/intelligent/analytics', {
                params: filters
            });

            return response.data;
        } catch (error) {
            console.error('❌ Analytics retrieval failed:', error.message);
            throw error;
        }
    }

    async getPatientInsights(patientId) {
        try {
            const response = await this.client.get(`/api/intelligent/analytics/patient/${patientId}`);
            return response.data;
        } catch (error) {
            console.error('❌ Patient insights retrieval failed:', error.message);
            throw error;
        }
    }

    /**
     * 🔄 BULK OPERATIONS
     * Efficient bulk data operations
     */
    async bulkOperation(operation, dataArray) {
        try {
            const response = await this.client.post('/api/intelligent/bulk', {
                operation,
                data: dataArray
            });

            this.emit('bulkOperationCompleted', { operation, count: dataArray.length });
            return response.data;
        } catch (error) {
            console.error('❌ Bulk operation failed:', error.message);
            throw error;
        }
    }

    /**
     * 🏥 HEALTH CHECK & STATUS
     */
    async healthCheck() {
        try {
            const response = await this.client.get('/health');
            return response.data;
        } catch (error) {
            console.error('❌ Intelligent Database health check failed:', error.message);
            return { status: 'unhealthy', error: error.message };
        }
    }

    /**
     * 🧹 CACHE MANAGEMENT
     */
    clearCache() {
        this.cache.clear();
        console.log('🧹 Intelligent Database Client cache cleared');
    }

    getCacheStats() {
        return {
            size: this.cache.size,
            maxAge: this.cacheTTL,
            hitRatio: this.hitRatio || 0
        };
    }
}

module.exports = IntelligentDatabaseClient;