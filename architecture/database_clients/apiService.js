/**
 * 🌐 API SERVICE LAYER - React Client Integration
 * Connects React frontend to Node.js backend and AI services
 * Provides seamless data sharing across the multi-service architecture
 */

import axios from 'axios';
import { EventEmitter } from 'events';

// API Configuration
const API_CONFIG = {
    backend: process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000',
    ai_server: process.env.REACT_APP_AI_SERVER_URL || 'http://localhost:5000',
    websocket: process.env.REACT_APP_WEBSOCKET_URL || 'ws://localhost:8000',
    timeout: 10000,
    retries: 3
};

class APIService extends EventEmitter {
    constructor() {
        super();
        
        // Initialize HTTP clients
        this.backendClient = this.createClient(API_CONFIG.backend);
        this.aiClient = this.createClient(API_CONFIG.ai_server);
        
        // WebSocket connection for real-time updates
        this.websocket = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        
        // Cache for performance optimization
        this.cache = new Map();
        this.cacheTTL = 300000; // 5 minutes
        
        // Request queue for offline support
        this.requestQueue = [];
        this.isOnline = navigator.onLine;
        
        this.initializeEventListeners();
        console.log('🌐 API Service initialized for React Client');
    }

    createClient(baseURL) {
        const client = axios.create({
            baseURL,
            timeout: API_CONFIG.timeout,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // Request interceptor for authentication
        client.interceptors.request.use(
            (config) => {
                const token = localStorage.getItem('auth_token');
                if (token) {
                    config.headers.Authorization = `Bearer ${token}`;
                }
                
                // Add request timestamp for performance tracking
                config.metadata = { startTime: Date.now() };
                
                this.emit('requestStart', { url: config.url, method: config.method });
                return config;
            },
            (error) => Promise.reject(error)
        );

        // Response interceptor for error handling and performance tracking
        client.interceptors.response.use(
            (response) => {
                const duration = Date.now() - response.config.metadata.startTime;
                this.emit('requestComplete', { 
                    url: response.config.url, 
                    status: response.status, 
                    duration 
                });
                return response;
            },
            (error) => {
                this.emit('requestError', { 
                    url: error.config?.url, 
                    error: error.message,
                    status: error.response?.status
                });
                
                // Handle specific error cases
                if (error.response?.status === 401) {
                    this.handleAuthError();
                }
                
                return Promise.reject(error);
            }
        );

        return client;
    }

    initializeEventListeners() {
        // Online/offline status
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.processRequestQueue();
            this.reconnectWebSocket();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.emit('offline');
        });

        // Initialize WebSocket connection
        this.connectWebSocket();
    }

    // 🔐 AUTHENTICATION METHODS

    async login(credentials) {
        try {
            const response = await this.backendClient.post('/api/auth/login', credentials);
            const { token, user } = response.data;
            
            localStorage.setItem('auth_token', token);
            localStorage.setItem('user_data', JSON.stringify(user));
            
            this.emit('authenticated', user);
            return { token, user };
        } catch (error) {
            this.emit('authError', error.response?.data?.message || 'Login failed');
            throw error;
        }
    }

    async logout() {
        try {
            await this.backendClient.post('/api/auth/logout');
        } finally {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user_data');
            this.disconnectWebSocket();
            this.emit('unauthenticated');
        }
    }

    async refreshToken() {
        try {
            const response = await this.backendClient.post('/api/auth/refresh');
            const { token } = response.data;
            localStorage.setItem('auth_token', token);
            return token;
        } catch (error) {
            this.handleAuthError();
            throw error;
        }
    }

    handleAuthError() {
        this.logout();
        this.emit('authRequired');
    }

    // 👤 PATIENT MANAGEMENT

    async createPatient(patientData) {
        try {
            const response = await this.backendClient.post('/api/patients', patientData);
            this.emit('patientCreated', response.data);
            return response.data;
        } catch (error) {
            console.error('Patient creation failed:', error);
            throw error;
        }
    }

    async getPatient(patientId) {
        try {
            const cacheKey = `patient_${patientId}`;
            const cached = this.getFromCache(cacheKey);
            if (cached) return cached;

            const response = await this.backendClient.get(`/api/patients/${patientId}`);
            this.setCache(cacheKey, response.data);
            return response.data;
        } catch (error) {
            console.error('Patient retrieval failed:', error);
            throw error;
        }
    }

    async updatePatient(patientId, updateData) {
        try {
            const response = await this.backendClient.put(`/api/patients/${patientId}`, updateData);
            
            // Invalidate cache
            this.cache.delete(`patient_${patientId}`);
            this.emit('patientUpdated', { patientId, data: response.data });
            
            return response.data;
        } catch (error) {
            console.error('Patient update failed:', error);
            throw error;
        }
    }

    async getPatientHealthMetrics(patientId, timeRange = '30d') {
        try {
            const response = await this.backendClient.get(`/api/patients/${patientId}/health-metrics`, {
                params: { timeRange }
            });
            return response.data;
        } catch (error) {
            console.error('Health metrics retrieval failed:', error);
            throw error;
        }
    }

    // 🤖 AI CONSULTATION METHODS

    async startDrIshaSConsultation(consultationData) {
        try {
            const response = await this.aiClient.post('/api/dr-isha-consultation', consultationData);
            
            this.emit('consultationStarted', {
                consultationId: response.data.consultation_id,
                aiResponse: response.data
            });
            
            return response.data;
        } catch (error) {
            console.error('Dr. iSHA consultation failed:', error);
            throw error;
        }
    }

    async sendMessageToDrIsha(message, consultationId) {
        try {
            const response = await this.aiClient.post('/api/dr-isha-consultation', {
                message,
                consultation_id: consultationId,
                continue_conversation: true
            });
            
            this.emit('aiResponse', response.data);
            return response.data;
        } catch (error) {
            console.error('Dr. iSHA message failed:', error);
            throw error;
        }
    }

    async getConsultationHistory(patientId) {
        try {
            const response = await this.backendClient.get(`/api/consultations/history/${patientId}`);
            return response.data;
        } catch (error) {
            console.error('Consultation history retrieval failed:', error);
            throw error;
        }
    }

    // 👩‍⚕️ DOCTOR & APPOINTMENT MANAGEMENT

    async searchDoctors(searchCriteria) {
        try {
            const response = await this.backendClient.get('/api/doctors/search', {
                params: searchCriteria
            });
            return response.data;
        } catch (error) {
            console.error('Doctor search failed:', error);
            throw error;
        }
    }

    async getDoctorAvailability(doctorId, date) {
        try {
            const response = await this.backendClient.get(`/api/doctors/${doctorId}/availability`, {
                params: { date }
            });
            return response.data;
        } catch (error) {
            console.error('Doctor availability check failed:', error);
            throw error;
        }
    }

    async scheduleAppointment(appointmentData) {
        try {
            const response = await this.backendClient.post('/api/appointments', appointmentData);
            
            this.emit('appointmentScheduled', response.data);
            return response.data;
        } catch (error) {
            console.error('Appointment scheduling failed:', error);
            throw error;
        }
    }

    async getAppointments(patientId, filters = {}) {
        try {
            const response = await this.backendClient.get('/api/appointments', {
                params: { patientId, ...filters }
            });
            return response.data;
        } catch (error) {
            console.error('Appointments retrieval failed:', error);
            throw error;
        }
    }

    // 📊 ANALYTICS & INSIGHTS

    async getPatientInsights(patientId) {
        try {
            const response = await this.backendClient.get(`/api/analytics/patient-insights/${patientId}`);
            return response.data;
        } catch (error) {
            console.error('Patient insights retrieval failed:', error);
            throw error;
        }
    }

    async getDashboardData(timeRange = '7d') {
        try {
            const cacheKey = `dashboard_${timeRange}`;
            const cached = this.getFromCache(cacheKey);
            if (cached) return cached;

            const response = await this.backendClient.get('/api/analytics/dashboard', {
                params: { timeRange }
            });
            
            this.setCache(cacheKey, response.data, 60000); // 1 minute cache for dashboard
            return response.data;
        } catch (error) {
            console.error('Dashboard data retrieval failed:', error);
            throw error;
        }
    }

    // 💳 INSURANCE & BILLING

    async verifyInsurance(insuranceData) {
        try {
            const response = await this.backendClient.post('/api/insurance/verify', insuranceData);
            return response.data;
        } catch (error) {
            console.error('Insurance verification failed:', error);
            throw error;
        }
    }

    async submitInsuranceClaim(claimData) {
        try {
            const response = await this.backendClient.post('/api/insurance/claims', claimData);
            
            this.emit('claimSubmitted', response.data);
            return response.data;
        } catch (error) {
            console.error('Insurance claim submission failed:', error);
            throw error;
        }
    }

    // 📱 REAL-TIME FEATURES (WebSocket)

    connectWebSocket() {
        try {
            this.websocket = new WebSocket(API_CONFIG.websocket);
            
            this.websocket.onopen = () => {
                console.log('🔌 WebSocket connected');
                this.reconnectAttempts = 0;
                this.emit('websocketConnected');
            };
            
            this.websocket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                this.emit('realTimeUpdate', data);
                
                // Handle specific real-time events
                switch (data.type) {
                    case 'appointment_update':
                        this.emit('appointmentUpdate', data.payload);
                        break;
                    case 'health_alert':
                        this.emit('healthAlert', data.payload);
                        break;
                    case 'ai_response':
                        this.emit('aiRealTimeResponse', data.payload);
                        break;
                    default:
                        this.emit('genericUpdate', data);
                }
            };
            
            this.websocket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.emit('websocketError', error);
            };
            
            this.websocket.onclose = () => {
                console.log('🔌 WebSocket disconnected');
                this.emit('websocketDisconnected');
                this.handleWebSocketReconnect();
            };
            
        } catch (error) {
            console.error('WebSocket connection failed:', error);
        }
    }

    handleWebSocketReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts && this.isOnline) {
            this.reconnectAttempts++;
            const delay = Math.pow(2, this.reconnectAttempts) * 1000; // Exponential backoff
            
            setTimeout(() => {
                console.log(`🔄 WebSocket reconnect attempt ${this.reconnectAttempts}`);
                this.connectWebSocket();
            }, delay);
        }
    }

    reconnectWebSocket() {
        if (this.websocket?.readyState !== WebSocket.OPEN) {
            this.connectWebSocket();
        }
    }

    disconnectWebSocket() {
        if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
        }
    }

    sendWebSocketMessage(message) {
        if (this.websocket?.readyState === WebSocket.OPEN) {
            this.websocket.send(JSON.stringify(message));
        } else {
            console.warn('WebSocket not connected, queueing message');
            this.requestQueue.push({ type: 'websocket', message });
        }
    }

    // 🔄 CACHE MANAGEMENT

    getFromCache(key) {
        if (this.cache.has(key)) {
            const { data, timestamp, ttl } = this.cache.get(key);
            if (Date.now() - timestamp < ttl) {
                return data;
            } else {
                this.cache.delete(key);
            }
        }
        return null;
    }

    setCache(key, data, customTTL = null) {
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl: customTTL || this.cacheTTL
        });
    }

    clearCache() {
        this.cache.clear();
        console.log('🧹 API Service cache cleared');
    }

    // 📱 OFFLINE SUPPORT

    async addToQueue(request) {
        this.requestQueue.push({
            ...request,
            timestamp: Date.now()
        });
    }

    async processRequestQueue() {
        if (!this.isOnline || this.requestQueue.length === 0) return;

        console.log(`📤 Processing ${this.requestQueue.length} queued requests`);
        
        const requests = [...this.requestQueue];
        this.requestQueue = [];
        
        for (const request of requests) {
            try {
                // Retry the original request
                if (request.type === 'api') {
                    await this.retryApiRequest(request);
                } else if (request.type === 'websocket') {
                    this.sendWebSocketMessage(request.message);
                }
            } catch (error) {
                console.error('Queued request failed:', error);
                // Re-queue if still relevant (not too old)
                if (Date.now() - request.timestamp < 300000) { // 5 minutes
                    this.requestQueue.push(request);
                }
            }
        }
        
        this.emit('queueProcessed', { processed: requests.length });
    }

    async retryApiRequest(request) {
        // Implementation depends on the specific request structure
        // This is a placeholder for offline request retry logic
        console.log('Retrying API request:', request);
    }

    // 📊 HEALTH CHECK & MONITORING

    async healthCheck() {
        try {
            const [backendHealth, aiHealth] = await Promise.allSettled([
                this.backendClient.get('/health'),
                this.aiClient.get('/health')
            ]);
            
            return {
                backend: backendHealth.status === 'fulfilled' ? 
                    backendHealth.value.data : { status: 'unhealthy' },
                ai_server: aiHealth.status === 'fulfilled' ? 
                    aiHealth.value.data : { status: 'unhealthy' }
            };
        } catch (error) {
            console.error('Health check failed:', error);
            return {
                backend: { status: 'unhealthy' },
                ai_server: { status: 'unhealthy' }
            };
        }
    }

    getMetrics() {
        return {
            cacheSize: this.cache.size,
            queuedRequests: this.requestQueue.length,
            isOnline: this.isOnline,
            websocketConnected: this.websocket?.readyState === WebSocket.OPEN,
            reconnectAttempts: this.reconnectAttempts
        };
    }
}

// Export singleton instance
const apiService = new APIService();
export default apiService;

// Export specific methods for easier importing
export const {
    login,
    logout,
    createPatient,
    getPatient,
    startDrIshaSConsultation,
    searchDoctors,
    scheduleAppointment,
    getPatientInsights,
    verifyInsurance
} = apiService;