/**
 * Kafka Configuration (Stub/Mock)
 * 
 * Note: Kafka disabled in production to reduce memory/disk footprint
 * All event publishing is stubbed to prevent errors
 */

export const KAFKA_TOPICS = {
  DOCTOR_EVENTS: 'doctor_events',
  PATIENT_EVENTS: 'patient_events',
  APPOINTMENT_EVENTS: 'appointment_events',
  NOTIFICATION_EVENTS: 'notification_events',
  VIDEO_EVENTS: 'video_events',
  PAYMENT_EVENTS: 'payment_events'
};

/**
 * Stub function - does not actually publish to Kafka
 * Use for development/production without Kafka infrastructure
 */
export const publishEvent = async (topic, message) => {
  // Silently discard - Kafka disabled for production
  return Promise.resolve(true);
};

/**
 * Connect Kafka Producer (Stub)
 */
export const connectKafkaProducer = async () => {
  console.log('📝 Kafka producer: Disabled (using stub)');
  return {
    send: async () => true,
    disconnect: async () => true
  };
};

/**
 * Connect Kafka Consumer (Stub)
 */
export const connectKafkaConsumer = async () => {
  console.log('📝 Kafka consumer: Disabled (using stub)');
  return {
    connect: async () => true,
    disconnect: async () => true,
    subscribe: async () => true,
    run: async () => true
  };
};

/**
 * Kafka Consumer Instance (Stub)
 */
export const kafkaConsumer = {
  connect: async () => true,
  subscribe: async () => true,
  run: async () => true,
  disconnect: async () => true
};
