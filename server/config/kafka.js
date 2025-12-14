import { Kafka, logLevel } from 'kafkajs';
import dotenv from 'dotenv';
dotenv.config();

// Kafka should be explicitly enabled via config.
// In production deployments without Kafka, trying to connect creates noisy errors.
const kafkaEnabled = process.env.KAFKA_ENABLED === 'true';
const brokersEnv = (process.env.KAFKA_BROKERS || '').trim();
const hasKafkaBrokers = brokersEnv.length > 0;

// Check if Kafka is disabled
const isKafkaDisabled =
  process.env.DISABLE_KAFKA === 'true' ||
  process.env.NODE_ENV === 'development' ||
  !kafkaEnabled ||
  !hasKafkaBrokers;

// Only create Kafka instance if not disabled
let kafka, kafkaProducer, kafkaConsumer;

if (!isKafkaDisabled) {
  // Kafka configuration
  kafka = new Kafka({
    clientId: process.env.KAFKA_CLIENT_ID || 'mediczy-server',
    brokers: brokersEnv.split(',').map((b) => b.trim()).filter(Boolean),
    logLevel: logLevel.ERROR,
    retry: {
      initialRetryTime: 100,
      retries: 3 // Reduced retries for faster failure
    },
    connectionTimeout: 3000, // 3 second timeout
    requestTimeout: 5000, // 5 second timeout
  });

  // Create producer
  kafkaProducer = kafka.producer({
    allowAutoTopicCreation: true,
    transactionTimeout: 30000,
  });

  // Create consumer
  kafkaConsumer = kafka.consumer({
    groupId: process.env.KAFKA_CONSUMER_GROUP || 'mediczy-consumer-group',
    sessionTimeout: 30000,
    heartbeatInterval: 3000,
  });
} else {
  // Create null objects to prevent errors
  kafkaProducer = null;
  kafkaConsumer = null;
  const reason = process.env.DISABLE_KAFKA === 'true'
    ? 'DISABLE_KAFKA=true'
    : (process.env.NODE_ENV === 'development'
      ? 'development mode'
      : (!kafkaEnabled
        ? 'KAFKA_ENABLED not true'
        : 'KAFKA_BROKERS not set'));
  console.log(`📝 Kafka initialization skipped (${reason})`);
}

// Export the instances (may be null if disabled)
export { kafkaProducer, kafkaConsumer };

// Kafka topics
export const KAFKA_TOPICS = {
  USER_EVENTS: 'user-events',
  DOCTOR_EVENTS: 'doctor-events',
  APPOINTMENT_EVENTS: 'appointment-events',
  SYSTEM_EVENTS: 'system-events',
  ANALYTICS_EVENTS: 'analytics-events',
  NOTIFICATION_EVENTS: 'notification-events',
  EMBEDDING_EVENTS: 'embedding-events',
  // Video streaming events
  VIDEO_STREAM_STARTED: 'video-stream-started',
  VIDEO_STREAM_ENDED: 'video-stream-ended',
  VIDEO_STREAM_QUALITY: 'video-stream-quality',
  VIDEO_PARTICIPANT_JOINED: 'video-participant-joined',
  VIDEO_PARTICIPANT_LEFT: 'video-participant-left',
  VIDEO_RECORDING_STARTED: 'video-recording-started',
  VIDEO_RECORDING_STOPPED: 'video-recording-stopped',
  VIDEO_STREAM_ERROR: 'video-stream-error',
};

// Producer connection
let producerConnected = false;

export const connectKafkaProducer = async () => {
  if (producerConnected) return;
  
  // Check if Kafka is disabled via environment variable
  if (isKafkaDisabled || !kafkaProducer) {
    console.log('ℹ️  Kafka disabled or in development mode, skipping connection');
    return;
  }
  
  try {
    // Set a timeout promise to fail fast
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
    
    await Promise.race([
      kafkaProducer.connect(),
      timeoutPromise
    ]);
    
    producerConnected = true;
    console.log('✅ Kafka producer connected');
  } catch (error) {
    console.log('⚠️  Kafka not available:', error.message);
    console.log('📝 Application will continue without event streaming');
    // Gracefully continue without Kafka
  }
};

// Consumer connection
let consumerConnected = false;

export const connectKafkaConsumer = async () => {
  if (consumerConnected) return;
  
  // Check if Kafka is disabled
  if (isKafkaDisabled || !kafkaConsumer) {
    console.log('ℹ️  Kafka consumer disabled, skipping connection');
    return;
  }
  
  try {
    // Set a timeout promise to fail fast
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
    
    await Promise.race([
      kafkaConsumer.connect(),
      timeoutPromise
    ]);
    
    consumerConnected = true;
    console.log('✅ Kafka consumer connected');
    
    // Subscribe to topics
    await kafkaConsumer.subscribe({
      topics: Object.values(KAFKA_TOPICS),
      fromBeginning: false,
    });
    
    console.log('✅ Kafka consumer subscribed to topics');
  } catch (error) {
    console.log('⚠️  Kafka consumer not available:', error.message);
    // Gracefully continue without Kafka
  }
};

// Publish event to Kafka
export const publishEvent = async (topic, message) => {
  if (!producerConnected || !kafkaProducer) {
    console.warn('⚠️  Kafka producer not connected, skipping event publish');
    return;
  }
  
  try {
    await kafkaProducer.send({
      topic,
      messages: [
        {
          key: message.key || Date.now().toString(),
          value: JSON.stringify(message),
          timestamp: Date.now().toString(),
        },
      ],
    });
    console.log(`📤 Event published to ${topic}:`, message.type || message.action);
  } catch (error) {
    console.error('❌ Failed to publish event:', error.message);
  }
};

// Start consuming messages
export const startKafkaConsumer = async (messageHandler) => {
  if (!consumerConnected || !kafkaConsumer) {
    console.warn('⚠️  Kafka consumer not connected, skipping');
    return;
  }
  
  try {
    await kafkaConsumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const value = JSON.parse(message.value.toString());
          console.log(`📥 Received message from ${topic}:`, value.type || value.action);
          
          if (messageHandler) {
            await messageHandler(topic, value, { partition, offset: message.offset });
          }
        } catch (error) {
          console.error('❌ Error processing Kafka message:', error);
        }
      },
    });
    console.log('✅ Kafka consumer started');
  } catch (error) {
    console.error('❌ Failed to start Kafka consumer:', error.message);
  }
};

// Graceful shutdown
const shutdown = async () => {
  console.log('Disconnecting Kafka...');
  try {
    if (producerConnected && kafkaProducer) await kafkaProducer.disconnect();
    if (consumerConnected && kafkaConsumer) await kafkaConsumer.disconnect();
    console.log('✅ Kafka disconnected');
  } catch (error) {
    console.error('❌ Error disconnecting Kafka:', error);
  }
};

process.on('SIGINT', async () => {
  await shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await shutdown();
  process.exit(0);
});

export default kafka;
