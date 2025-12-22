"""
🔄 KAFKA INTEGRATION LAYER
Multi-service event streaming and data synchronization
Connects Node.js Backend, Flask AI Server, and Intelligent Database
"""

from kafka import KafkaProducer, KafkaConsumer
from kafka.errors import KafkaError
import json
import logging
import threading
import time
from datetime import datetime
from typing import Dict, List, Callable, Any, Optional
import asyncio
from concurrent.futures import ThreadPoolExecutor

# Kafka Topics Configuration
KAFKA_TOPICS = {
    'patient_events': 'mediczy.patient.events',
    'consultation_events': 'mediczy.consultation.events',
    'appointment_events': 'mediczy.appointment.events',
    'health_metrics': 'mediczy.health.metrics',
    'ai_analysis': 'mediczy.ai.analysis',
    'doctor_events': 'mediczy.doctor.events',
    'insurance_events': 'mediczy.insurance.events',
    'system_events': 'mediczy.system.events',
    'notifications': 'mediczy.notifications',
    'analytics': 'mediczy.analytics'
}

class MediczyKafkaService:
    """
    Comprehensive Kafka service for the Mediczy platform
    Handles event streaming between all microservices
    """
    
    def __init__(self, 
                 bootstrap_servers: List[str] = None,
                 service_name: str = "mediczy-service",
                 enable_auto_commit: bool = True):
        """
        Initialize Kafka service
        
        Args:
            bootstrap_servers: List of Kafka broker addresses
            service_name: Name of the service using this client
            enable_auto_commit: Whether to auto-commit message offsets
        """
        self.bootstrap_servers = bootstrap_servers or ['localhost:9092']
        self.service_name = service_name
        self.enable_auto_commit = enable_auto_commit
        
        # Initialize producer and consumer
        self.producer = None
        self.consumers = {}
        self.consumer_threads = {}
        self.message_handlers = {}
        
        # Threading control
        self.running = False
        self.executor = ThreadPoolExecutor(max_workers=10)
        
        # Metrics and monitoring
        self.metrics = {
            'messages_produced': 0,
            'messages_consumed': 0,
            'failed_messages': 0,
            'active_consumers': 0,
            'last_activity': None
        }
        
        # Setup logging
        self.logger = logging.getLogger(f"kafka.{service_name}")
        
        self.initialize_kafka()

    def initialize_kafka(self):
        """Initialize Kafka producer and basic configuration"""
        try:
            # Initialize producer with optimal settings for medical data
            self.producer = KafkaProducer(
                bootstrap_servers=self.bootstrap_servers,
                value_serializer=lambda v: json.dumps(v, ensure_ascii=False, default=str).encode('utf-8'),
                key_serializer=lambda k: k.encode('utf-8') if k else None,
                acks='all',  # Wait for all replicas to acknowledge
                retries=3,
                retry_backoff_ms=1000,
                batch_size=16384,
                linger_ms=10,  # Small delay for batching
                compression_type='gzip',
                max_in_flight_requests_per_connection=1,  # Ensure ordering
                enable_idempotence=True  # Prevent duplicate messages
            )
            
            self.running = True
            self.logger.info(f"🔄 Kafka service initialized for {self.service_name}")
            
        except Exception as e:
            self.logger.error(f"❌ Kafka initialization failed: {e}")
            raise

    # 📤 PRODUCER METHODS

    def send_event(self, topic_key: str, event_data: Dict, key: str = None) -> bool:
        """
        Send event to Kafka topic
        
        Args:
            topic_key: Key from KAFKA_TOPICS dict
            event_data: Event payload
            key: Optional message key for partitioning
            
        Returns:
            bool: Success status
        """
        try:
            if not self.producer:
                raise Exception("Producer not initialized")
                
            topic = KAFKA_TOPICS.get(topic_key)
            if not topic:
                raise ValueError(f"Unknown topic key: {topic_key}")

            # Enhance event data with metadata
            enhanced_event = {
                **event_data,
                'timestamp': datetime.now().isoformat(),
                'service_name': self.service_name,
                'event_id': f"{self.service_name}_{int(time.time() * 1000)}",
                'version': '1.0'
            }

            # Send message
            future = self.producer.send(
                topic=topic,
                value=enhanced_event,
                key=key
            )
            
            # Wait for confirmation
            result = future.get(timeout=10)
            
            self.metrics['messages_produced'] += 1
            self.metrics['last_activity'] = datetime.now().isoformat()
            
            self.logger.debug(f"✅ Event sent to {topic}: {result}")
            return True
            
        except Exception as e:
            self.metrics['failed_messages'] += 1
            self.logger.error(f"❌ Failed to send event to {topic_key}: {e}")
            return False

    def send_patient_event(self, event_type: str, patient_data: Dict) -> bool:
        """Send patient-related events"""
        event_data = {
            'event_type': event_type,
            'patient_id': patient_data.get('patient_id'),
            'data': patient_data
        }
        return self.send_event('patient_events', event_data, key=patient_data.get('patient_id'))

    def send_consultation_event(self, consultation_data: Dict) -> bool:
        """Send AI consultation events"""
        event_data = {
            'event_type': 'ai_consultation',
            'consultation_id': consultation_data.get('consultation_id'),
            'patient_id': consultation_data.get('patient_id'),
            'ai_model': consultation_data.get('ai_model', 'dr_isha'),
            'data': consultation_data
        }
        return self.send_event('consultation_events', event_data, 
                             key=consultation_data.get('patient_id'))

    def send_appointment_event(self, event_type: str, appointment_data: Dict) -> bool:
        """Send appointment-related events"""
        event_data = {
            'event_type': event_type,
            'appointment_id': appointment_data.get('appointment_id'),
            'patient_id': appointment_data.get('patient_id'),
            'doctor_id': appointment_data.get('doctor_id'),
            'data': appointment_data
        }
        return self.send_event('appointment_events', event_data, 
                             key=appointment_data.get('patient_id'))

    def send_health_metric(self, metric_data: Dict) -> bool:
        """Send health metrics for real-time monitoring"""
        event_data = {
            'event_type': 'health_metric_update',
            'patient_id': metric_data.get('patient_id'),
            'metric_type': metric_data.get('metric_type'),
            'value': metric_data.get('value'),
            'unit': metric_data.get('unit'),
            'data': metric_data
        }
        return self.send_event('health_metrics', event_data, 
                             key=metric_data.get('patient_id'))

    def send_ai_analysis_result(self, analysis_data: Dict) -> bool:
        """Send AI analysis results"""
        event_data = {
            'event_type': 'ai_analysis_complete',
            'patient_id': analysis_data.get('patient_id'),
            'analysis_type': analysis_data.get('analysis_type'),
            'confidence': analysis_data.get('confidence'),
            'results': analysis_data.get('results'),
            'data': analysis_data
        }
        return self.send_event('ai_analysis', event_data, 
                             key=analysis_data.get('patient_id'))

    def send_notification(self, notification_data: Dict) -> bool:
        """Send notifications (SMS, email, push)"""
        event_data = {
            'event_type': 'notification',
            'recipient_id': notification_data.get('recipient_id'),
            'notification_type': notification_data.get('type'),
            'channel': notification_data.get('channel'),  # sms, email, push
            'priority': notification_data.get('priority', 'normal'),
            'data': notification_data
        }
        return self.send_event('notifications', event_data, 
                             key=notification_data.get('recipient_id'))

    # 📥 CONSUMER METHODS

    def subscribe_to_topic(self, topic_key: str, handler: Callable[[Dict], None], 
                          group_id: str = None) -> bool:
        """
        Subscribe to a Kafka topic with a message handler
        
        Args:
            topic_key: Key from KAFKA_TOPICS dict
            handler: Function to handle incoming messages
            group_id: Consumer group ID
            
        Returns:
            bool: Success status
        """
        try:
            topic = KAFKA_TOPICS.get(topic_key)
            if not topic:
                raise ValueError(f"Unknown topic key: {topic_key}")

            if not group_id:
                group_id = f"{self.service_name}-{topic_key}-group"

            # Create consumer
            consumer = KafkaConsumer(
                topic,
                bootstrap_servers=self.bootstrap_servers,
                group_id=group_id,
                value_deserializer=lambda m: json.loads(m.decode('utf-8')),
                key_deserializer=lambda k: k.decode('utf-8') if k else None,
                enable_auto_commit=self.enable_auto_commit,
                auto_commit_interval_ms=1000,
                auto_offset_reset='latest',
                consumer_timeout_ms=1000
            )

            # Store consumer and handler
            consumer_key = f"{topic_key}_{group_id}"
            self.consumers[consumer_key] = consumer
            self.message_handlers[consumer_key] = handler

            # Start consumer thread
            consumer_thread = threading.Thread(
                target=self._consumer_loop,
                args=(consumer, handler, consumer_key),
                daemon=True
            )
            consumer_thread.start()
            self.consumer_threads[consumer_key] = consumer_thread

            self.metrics['active_consumers'] += 1
            self.logger.info(f"✅ Subscribed to {topic} with group {group_id}")
            return True

        except Exception as e:
            self.logger.error(f"❌ Failed to subscribe to {topic_key}: {e}")
            return False

    def _consumer_loop(self, consumer: KafkaConsumer, handler: Callable, consumer_key: str):
        """Internal consumer loop for processing messages"""
        self.logger.info(f"🔄 Consumer loop started for {consumer_key}")
        
        while self.running:
            try:
                # Poll for messages
                message_batch = consumer.poll(timeout_ms=1000)
                
                if not message_batch:
                    continue

                for topic_partition, messages in message_batch.items():
                    for message in messages:
                        try:
                            # Process message
                            self.metrics['messages_consumed'] += 1
                            self.metrics['last_activity'] = datetime.now().isoformat()
                            
                            # Call handler with message data
                            handler(message.value)
                            
                        except Exception as e:
                            self.metrics['failed_messages'] += 1
                            self.logger.error(f"❌ Message processing failed: {e}")

            except Exception as e:
                self.logger.error(f"❌ Consumer loop error: {e}")
                time.sleep(1)  # Brief pause before retrying

        # Cleanup
        consumer.close()
        self.logger.info(f"🛑 Consumer loop stopped for {consumer_key}")

    # 🔧 SPECIALIZED HANDLERS FOR MEDICZY PLATFORM

    def setup_patient_event_handler(self, handler: Callable[[Dict], None]):
        """Setup handler for patient events"""
        return self.subscribe_to_topic('patient_events', handler)

    def setup_consultation_event_handler(self, handler: Callable[[Dict], None]):
        """Setup handler for AI consultation events"""
        return self.subscribe_to_topic('consultation_events', handler)

    def setup_appointment_event_handler(self, handler: Callable[[Dict], None]):
        """Setup handler for appointment events"""
        return self.subscribe_to_topic('appointment_events', handler)

    def setup_health_metrics_handler(self, handler: Callable[[Dict], None]):
        """Setup handler for health metrics"""
        return self.subscribe_to_topic('health_metrics', handler)

    def setup_ai_analysis_handler(self, handler: Callable[[Dict], None]):
        """Setup handler for AI analysis results"""
        return self.subscribe_to_topic('ai_analysis', handler)

    def setup_notification_handler(self, handler: Callable[[Dict], None]):
        """Setup handler for notifications"""
        return self.subscribe_to_topic('notifications', handler)

    # 📊 MONITORING AND MANAGEMENT

    def get_metrics(self) -> Dict:
        """Get service metrics"""
        return {
            **self.metrics,
            'active_consumers': len([t for t in self.consumer_threads.values() if t.is_alive()]),
            'total_topics': len(KAFKA_TOPICS),
            'subscribed_topics': len(self.consumers),
            'service_name': self.service_name,
            'bootstrap_servers': self.bootstrap_servers,
            'running': self.running
        }

    def health_check(self) -> Dict:
        """Check Kafka service health"""
        try:
            if self.producer:
                # Test producer by sending to a test topic (if it exists)
                producer_healthy = True
            else:
                producer_healthy = False

            consumer_healthy = len([t for t in self.consumer_threads.values() if t.is_alive()]) > 0

            return {
                'status': 'healthy' if (producer_healthy and self.running) else 'unhealthy',
                'producer_healthy': producer_healthy,
                'consumers_healthy': consumer_healthy,
                'metrics': self.get_metrics()
            }

        except Exception as e:
            return {
                'status': 'unhealthy',
                'error': str(e),
                'metrics': self.get_metrics()
            }

    def stop(self):
        """Gracefully stop the Kafka service"""
        self.logger.info("🛑 Stopping Kafka service...")
        self.running = False
        
        # Close producer
        if self.producer:
            self.producer.flush()
            self.producer.close()
            
        # Close consumers
        for consumer in self.consumers.values():
            consumer.close()
            
        # Wait for consumer threads to finish
        for thread in self.consumer_threads.values():
            thread.join(timeout=5)
            
        self.executor.shutdown(wait=True)
        self.logger.info("✅ Kafka service stopped")

# Example usage for different services
class NodeJSKafkaHandler(MediczyKafkaService):
    """Kafka handler specifically for Node.js Backend"""
    
    def __init__(self):
        super().__init__(service_name="nodejs-backend")
        self.setup_handlers()
    
    def setup_handlers(self):
        """Setup handlers specific to Node.js backend needs"""
        self.setup_ai_analysis_handler(self.handle_ai_analysis_result)
        self.setup_notification_handler(self.handle_notification_request)
    
    def handle_ai_analysis_result(self, message: Dict):
        """Handle AI analysis results from Flask server"""
        # Update patient records, trigger notifications, etc.
        print(f"📊 AI Analysis Result: {message}")
    
    def handle_notification_request(self, message: Dict):
        """Handle notification requests"""
        # Send SMS, email, push notifications
        print(f"📱 Notification Request: {message}")

class FlaskKafkaHandler(MediczyKafkaService):
    """Kafka handler specifically for Flask AI Server"""
    
    def __init__(self):
        super().__init__(service_name="flask-ai-server")
        self.setup_handlers()
    
    def setup_handlers(self):
        """Setup handlers specific to AI server needs"""
        self.setup_patient_event_handler(self.handle_patient_event)
        self.setup_consultation_event_handler(self.handle_consultation_event)
    
    def handle_patient_event(self, message: Dict):
        """Handle patient events for AI context building"""
        # Update AI knowledge base, patient context
        print(f"👤 Patient Event for AI: {message}")
    
    def handle_consultation_event(self, message: Dict):
        """Handle consultation events"""
        # Process through AI models, generate insights
        print(f"🤖 Consultation Event: {message}")

# Export for easy imports
__all__ = ['MediczyKafkaService', 'NodeJSKafkaHandler', 'FlaskKafkaHandler', 'KAFKA_TOPICS']