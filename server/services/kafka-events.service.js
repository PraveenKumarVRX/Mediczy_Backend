/**
 * Kafka Events Service (Stub/Mock)
 * 
 * Note: Kafka disabled in production
 * All Kafka event publishing is stubbed
 */

export class KafkaEventsService {
  static async publishAppointmentEvent(eventType, appointmentData) {
    // Stub - silently discard
    return Promise.resolve(true);
  }

  static async publishPaymentEvent(eventType, paymentData) {
    // Stub - silently discard
    return Promise.resolve(true);
  }

  static async publishUserEvent(eventType, userData) {
    // Stub - silently discard
    return Promise.resolve(true);
  }

  static async publishNotificationEvent(eventType, notificationData) {
    // Stub - silently discard
    return Promise.resolve(true);
  }

  static async publishVideoEvent(eventType, videoData) {
    // Stub - silently discard
    return Promise.resolve(true);
  }
}

export default KafkaEventsService;
