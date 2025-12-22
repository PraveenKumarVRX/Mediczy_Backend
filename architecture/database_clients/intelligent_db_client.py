"""
🔌 INTELLIGENT DATABASE CLIENT - Python Flask Integration
Connects app.py to the Ultra-Fast Intelligent Database Service
Provides seamless AI-powered medical analysis integration
"""

import requests
import asyncio
import aiohttp
import json
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Union
import logging
from functools import wraps
from concurrent.futures import ThreadPoolExecutor
import threading

class IntelligentDatabaseClient:
    def __init__(self, 
                 base_url: str = "http://localhost:5005",
                 timeout: int = 10,
                 max_retries: int = 3,
                 cache_ttl: int = 300):
        """
        Initialize the Intelligent Database Client for Flask AI Server
        
        Args:
            base_url: Base URL of the intelligent database service
            timeout: Request timeout in seconds
            max_retries: Maximum number of retry attempts
            cache_ttl: Cache time-to-live in seconds
        """
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout
        self.max_retries = max_retries
        self.cache_ttl = cache_ttl
        
        # Thread-safe cache for performance optimization
        self._cache = {}
        self._cache_lock = threading.RLock()
        
        # Performance metrics tracking
        self.metrics = {
            'total_requests': 0,
            'successful_requests': 0,
            'cache_hits': 0,
            'average_response_time': 0.0,
            'last_health_check': None
        }
        
        # Thread pool for async operations
        self.executor = ThreadPoolExecutor(max_workers=10)
        
        # Setup logging
        self.logger = logging.getLogger(__name__)
        
        # Session for connection pooling
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'Mediczy-Flask-AI-Server/1.0'
        })
        
        print("🧠 Intelligent Database Client initialized for Flask AI Server")

    def _cache_key(self, method: str, endpoint: str, params: Dict = None) -> str:
        """Generate cache key for requests"""
        key_data = f"{method}:{endpoint}:{json.dumps(params, sort_keys=True) if params else ''}"
        return key_data

    def _get_from_cache(self, cache_key: str) -> Optional[Any]:
        """Thread-safe cache retrieval"""
        with self._cache_lock:
            if cache_key in self._cache:
                data, timestamp = self._cache[cache_key]
                if time.time() - timestamp < self.cache_ttl:
                    self.metrics['cache_hits'] += 1
                    return data
                else:
                    del self._cache[cache_key]
            return None

    def _set_cache(self, cache_key: str, data: Any) -> None:
        """Thread-safe cache storage"""
        with self._cache_lock:
            self._cache[cache_key] = (data, time.time())

    def _make_request(self, method: str, endpoint: str, data: Dict = None, params: Dict = None) -> Dict:
        """Make HTTP request with retry logic and metrics tracking"""
        url = f"{self.base_url}{endpoint}"
        
        # Check cache for GET requests
        if method.upper() == 'GET':
            cache_key = self._cache_key(method, endpoint, params)
            cached_result = self._get_from_cache(cache_key)
            if cached_result:
                return cached_result

        start_time = time.time()
        
        for attempt in range(self.max_retries):
            try:
                self.metrics['total_requests'] += 1
                
                if method.upper() == 'GET':
                    response = self.session.get(url, params=params, timeout=self.timeout)
                elif method.upper() == 'POST':
                    response = self.session.post(url, json=data, params=params, timeout=self.timeout)
                elif method.upper() == 'PUT':
                    response = self.session.put(url, json=data, params=params, timeout=self.timeout)
                elif method.upper() == 'DELETE':
                    response = self.session.delete(url, params=params, timeout=self.timeout)
                else:
                    raise ValueError(f"Unsupported HTTP method: {method}")

                response.raise_for_status()
                result = response.json()
                
                # Update metrics
                response_time = time.time() - start_time
                self.metrics['successful_requests'] += 1
                self.metrics['average_response_time'] = (
                    (self.metrics['average_response_time'] * (self.metrics['successful_requests'] - 1) + response_time) 
                    / self.metrics['successful_requests']
                )
                
                # Cache GET requests
                if method.upper() == 'GET':
                    cache_key = self._cache_key(method, endpoint, params)
                    self._set_cache(cache_key, result)
                
                return result
                
            except requests.exceptions.RequestException as e:
                self.logger.warning(f"Request attempt {attempt + 1} failed: {e}")
                if attempt == self.max_retries - 1:
                    raise Exception(f"Request failed after {self.max_retries} attempts: {e}")
                time.sleep(2 ** attempt)  # Exponential backoff

    # 🔬 INTELLIGENT MEDICAL ANALYSIS
    
    def analyze_medical_query(self, query_data: Dict) -> Dict:
        """
        Analyze medical queries with advanced AI intelligence
        
        Args:
            query_data: Dictionary containing query, patient_id, context, etc.
            
        Returns:
            Dictionary with analysis results including symptoms, urgency, specialty
        """
        try:
            payload = {
                'query': query_data.get('query') or query_data.get('symptoms'),
                'patient_id': query_data.get('patient_id'),
                'context': query_data.get('context', {}),
                'analysis_type': query_data.get('analysis_type', 'comprehensive'),
                'include_recommendations': True,
                'include_urgency_assessment': True
            }
            
            result = self._make_request('POST', '/api/intelligent/analyze', data=payload)
            
            # Enhance with AI-specific metadata
            result['ai_enhanced'] = True
            result['processed_at'] = datetime.now().isoformat()
            result['processing_source'] = 'flask_ai_server'
            
            return result
            
        except Exception as e:
            self.logger.error(f"Medical analysis failed: {e}")
            raise

    def get_patient_medical_context(self, patient_id: str) -> Dict:
        """Get comprehensive patient context for AI analysis"""
        try:
            params = {
                'include_history': True,
                'include_vitals': True,
                'include_medications': True,
                'include_allergies': True
            }
            
            result = self._make_request('GET', f'/api/intelligent/patient-profile/{patient_id}', params=params)
            return result
            
        except Exception as e:
            self.logger.error(f"Patient context retrieval failed: {e}")
            raise

    def store_ai_interaction(self, interaction_data: Dict) -> Dict:
        """Store AI interaction results for learning and improvement"""
        try:
            payload = {
                'interaction_type': 'ai_consultation',
                'timestamp': datetime.now().isoformat(),
                'ai_model': interaction_data.get('ai_model', 'dr_isha'),
                'patient_query': interaction_data.get('patient_query'),
                'ai_response': interaction_data.get('ai_response'),
                'confidence_score': interaction_data.get('confidence_score'),
                'patient_id': interaction_data.get('patient_id'),
                'session_id': interaction_data.get('session_id'),
                'feedback_score': interaction_data.get('feedback_score'),
                'metadata': interaction_data.get('metadata', {})
            }
            
            result = self._make_request('POST', '/api/intelligent/ai-interaction', data=payload)
            return result
            
        except Exception as e:
            self.logger.error(f"AI interaction storage failed: {e}")
            raise

    # 👤 PATIENT PROFILE MANAGEMENT

    def create_patient_profile(self, patient_data: Dict) -> Dict:
        """Create comprehensive patient profile with AI insights"""
        try:
            payload = {
                'action': 'create',
                **patient_data,
                'ai_created': True,
                'created_by': 'flask_ai_server'
            }
            
            result = self._make_request('POST', '/api/intelligent/patient-profile', data=payload)
            return result
            
        except Exception as e:
            self.logger.error(f"Patient profile creation failed: {e}")
            raise

    def update_patient_context(self, patient_id: str, context_data: Dict) -> Dict:
        """Update patient context with AI-derived insights"""
        try:
            payload = {
                'action': 'update_context',
                'ai_insights': context_data.get('ai_insights', {}),
                'conversation_history': context_data.get('conversation_history', []),
                'risk_factors': context_data.get('risk_factors', []),
                'health_trends': context_data.get('health_trends', {}),
                'updated_by': 'ai_analysis'
            }
            
            result = self._make_request('PUT', f'/api/intelligent/patient-profile/{patient_id}', data=payload)
            return result
            
        except Exception as e:
            self.logger.error(f"Patient context update failed: {e}")
            raise

    # 📊 HEALTH METRICS & ANALYTICS

    def record_health_metric_with_ai_analysis(self, health_data: Dict) -> Dict:
        """Record health metrics with AI-powered trend analysis"""
        try:
            payload = {
                'action': 'record_with_ai_analysis',
                **health_data,
                'ai_analysis_enabled': True,
                'trend_analysis': True,
                'anomaly_detection': True
            }
            
            result = self._make_request('POST', '/api/intelligent/health-metric', data=payload)
            return result
            
        except Exception as e:
            self.logger.error(f"Health metric recording with AI analysis failed: {e}")
            raise

    def get_ai_health_insights(self, patient_id: str, timeframe: str = '30d') -> Dict:
        """Get AI-powered health insights and predictions"""
        try:
            params = {
                'patient_id': patient_id,
                'timeframe': timeframe,
                'include_predictions': True,
                'include_risk_assessment': True,
                'include_recommendations': True
            }
            
            result = self._make_request('GET', '/api/intelligent/analytics/health-insights', params=params)
            return result
            
        except Exception as e:
            self.logger.error(f"AI health insights retrieval failed: {e}")
            raise

    # 🤖 AI-SPECIFIC OPERATIONS

    def get_similar_cases(self, symptoms: List[str], patient_demographics: Dict = None) -> Dict:
        """Find similar medical cases using AI similarity matching"""
        try:
            payload = {
                'symptoms': symptoms,
                'patient_demographics': patient_demographics or {},
                'similarity_threshold': 0.7,
                'max_results': 10,
                'include_outcomes': True
            }
            
            result = self._make_request('POST', '/api/intelligent/similar-cases', data=payload)
            return result
            
        except Exception as e:
            self.logger.error(f"Similar cases search failed: {e}")
            raise

    def get_treatment_recommendations(self, condition: str, patient_context: Dict = None) -> Dict:
        """Get AI-powered treatment recommendations"""
        try:
            payload = {
                'condition': condition,
                'patient_context': patient_context or {},
                'include_contraindications': True,
                'include_drug_interactions': True,
                'evidence_based': True
            }
            
            result = self._make_request('POST', '/api/intelligent/treatment-recommendations', data=payload)
            return result
            
        except Exception as e:
            self.logger.error(f"Treatment recommendations failed: {e}")
            raise

    def validate_diagnosis(self, symptoms: List[str], proposed_diagnosis: str, patient_data: Dict = None) -> Dict:
        """AI-powered diagnosis validation"""
        try:
            payload = {
                'symptoms': symptoms,
                'proposed_diagnosis': proposed_diagnosis,
                'patient_data': patient_data or {},
                'confidence_threshold': 0.8
            }
            
            result = self._make_request('POST', '/api/intelligent/validate-diagnosis', data=payload)
            return result
            
        except Exception as e:
            self.logger.error(f"Diagnosis validation failed: {e}")
            raise

    # 🏥 SYSTEM HEALTH & MONITORING

    async def health_check_async(self) -> Dict:
        """Async health check for the intelligent database service"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{self.base_url}/health", timeout=5) as response:
                    result = await response.json()
                    self.metrics['last_health_check'] = datetime.now().isoformat()
                    return result
        except Exception as e:
            self.logger.error(f"Async health check failed: {e}")
            return {'status': 'unhealthy', 'error': str(e)}

    def health_check(self) -> Dict:
        """Synchronous health check"""
        try:
            result = self._make_request('GET', '/health')
            self.metrics['last_health_check'] = datetime.now().isoformat()
            return result
        except Exception as e:
            self.logger.error(f"Health check failed: {e}")
            return {'status': 'unhealthy', 'error': str(e)}

    def get_performance_metrics(self) -> Dict:
        """Get client performance metrics"""
        return {
            **self.metrics,
            'cache_size': len(self._cache),
            'cache_hit_ratio': self.metrics['cache_hits'] / max(self.metrics['total_requests'], 1),
            'success_rate': self.metrics['successful_requests'] / max(self.metrics['total_requests'], 1)
        }

    def clear_cache(self) -> None:
        """Clear the client cache"""
        with self._cache_lock:
            self._cache.clear()
        print("🧹 Intelligent Database Client cache cleared")

# Async wrapper functions for Flask integration
async def create_async_client(**kwargs) -> IntelligentDatabaseClient:
    """Create an async-enabled intelligent database client"""
    return IntelligentDatabaseClient(**kwargs)

def with_intelligent_db_retry(retries: int = 3):
    """Decorator for automatic retry of database operations"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(retries):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    if attempt == retries - 1:
                        raise
                    time.sleep(2 ** attempt)
        return wrapper
    return decorator