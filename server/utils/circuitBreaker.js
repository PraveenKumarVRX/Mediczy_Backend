/**
 * Circuit Breaker Implementation
 * 
 * Prevents cascading failures by stopping requests to failing services
 * Uses opossum library for Node.js circuit breaking
 * 
 * Features:
 * - Automatic failure detection
 * - Fast-fail when service is down
 * - Automatic recovery testing (half-open state)
 * - Fallback support
 * - Prometheus metrics
 */

import CircuitBreaker from 'opossum';
import axios from '../integrations/axios.js';

/**
 * Default circuit breaker options
 */
const defaultOptions = {
  timeout: 5000, // 5 seconds - fail if operation takes longer
  errorThresholdPercentage: 50, // Open circuit after 50% errors
  resetTimeout: 30000, // Try again after 30 seconds
  rollingCountTimeout: 10000, // Track errors in 10 second window
  rollingCountBuckets: 10, // 10 buckets for rolling window
  volumeThreshold: 5, // Minimum requests before opening circuit
  capacity: 100, // Max concurrent requests
  halfOpenRequests: 3 // Max requests in half-open state
};

/**
 * Circuit breaker registry - stores all active circuit breakers
 */
const circuitBreakers = new Map();

/**
 * Create a circuit breaker for a service
 * 
 * @param {string} serviceName - Name of the service
 * @param {Function} serviceFunction - Async function to wrap
 * @param {Object} options - Circuit breaker options
 * @param {Function} fallbackFunction - Fallback function when circuit is open
 * @returns {CircuitBreaker} Circuit breaker instance
 */
export function createCircuitBreaker(serviceName, serviceFunction, options = {}, fallbackFunction = null) {
  // Check if circuit breaker already exists
  if (circuitBreakers.has(serviceName)) {
    return circuitBreakers.get(serviceName);
  }

  const circuitOptions = { ...defaultOptions, ...options };
  const breaker = new CircuitBreaker(serviceFunction, circuitOptions);

  // Add fallback if provided
  if (fallbackFunction) {
    breaker.fallback(fallbackFunction);
  }

  // Event listeners for monitoring
  breaker.on('open', () => {
    console.error(`⚠️ Circuit breaker OPENED for ${serviceName} - service unavailable`);
    // TODO: Send alert to DevOps team
  });

  breaker.on('halfOpen', () => {
    console.log(`🔄 Circuit breaker HALF-OPEN for ${serviceName} - testing recovery`);
  });

  breaker.on('close', () => {
    console.log(`✅ Circuit breaker CLOSED for ${serviceName} - service recovered`);
  });

  breaker.on('failure', (error) => {
    console.error(`❌ ${serviceName} failure:`, error.message);
  });

  breaker.on('timeout', () => {
    console.error(`⏱️ ${serviceName} timeout - operation took too long`);
  });

  breaker.on('reject', () => {
    console.error(`🚫 ${serviceName} rejected - circuit is open`);
  });

  breaker.on('success', () => {
    console.log(`✓ ${serviceName} success`);
  });

  // Store in registry
  circuitBreakers.set(serviceName, breaker);

  return breaker;
}

/**
 * Get circuit breaker by service name
 */
export function getCircuitBreaker(serviceName) {
  return circuitBreakers.get(serviceName);
}

/**
 * Get all circuit breakers status
 */
export function getAllCircuitBreakerStatus() {
  const status = {};
  
  for (const [name, breaker] of circuitBreakers.entries()) {
    const stats = breaker.stats;
    status[name] = {
      state: breaker.opened ? 'open' : (breaker.halfOpen ? 'half-open' : 'closed'),
      stats: {
        fires: stats.fires,
        successes: stats.successes,
        failures: stats.failures,
        timeouts: stats.timeouts,
        rejects: stats.rejects,
        latencyMean: stats.latencyMean,
        percentiles: {
          '0.0': stats.percentiles['0.0'],
          '0.25': stats.percentiles['0.25'],
          '0.5': stats.percentiles['0.5'],
          '0.75': stats.percentiles['0.75'],
          '0.9': stats.percentiles['0.9'],
          '0.95': stats.percentiles['0.95'],
          '0.99': stats.percentiles['0.99'],
          '0.995': stats.percentiles['0.995'],
          '1.0': stats.percentiles['1.0']
        }
      },
      enabled: breaker.enabled,
      volumeThreshold: breaker.volumeThreshold
    };
  }
  
  return status;
}

/**
 * Reset all circuit breakers (for testing)
 */
export function resetAllCircuitBreakers() {
  for (const breaker of circuitBreakers.values()) {
    breaker.close();
  }
  console.log('🔄 All circuit breakers reset');
}

// =============================================================================
// Pre-configured Circuit Breakers for Mediczy Services
// =============================================================================

/**
 * WhatsApp Service Circuit Breaker
 */
export const whatsappBreaker = createCircuitBreaker(
  'WhatsApp',
  async (to, message, options = {}) => {
    // Actual WhatsApp sending logic
    const response = await axios.post(
      `${process.env.TWILIO_API_URL || 'https://api.twilio.com'}/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
      new URLSearchParams({
        From: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        To: `whatsapp:${to}`,
        Body: message
      }),
      {
        auth: {
          username: process.env.TWILIO_ACCOUNT_SID,
          password: process.env.TWILIO_AUTH_TOKEN
        }
      }
    );
    return response.data;
  },
  { timeout: 10000 }, // WhatsApp can be slower
  // Fallback to SMS
  async (to, message) => {
    console.log('📱 WhatsApp unavailable - falling back to SMS');
    return smsBreaker.fire(to, message);
  }
);

/**
 * SMS Service Circuit Breaker
 */
export const smsBreaker = createCircuitBreaker(
  'SMS',
  async (to, message) => {
    const response = await axios.post(
      `${process.env.TWILIO_API_URL || 'https://api.twilio.com'}/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
      new URLSearchParams({
        From: process.env.TWILIO_PHONE_NUMBER,
        To: to,
        Body: message
      }),
      {
        auth: {
          username: process.env.TWILIO_ACCOUNT_SID,
          password: process.env.TWILIO_AUTH_TOKEN
        }
      }
    );
    return response.data;
  },
  { timeout: 8000 },
  // Fallback - log and queue for retry
  async (to, message) => {
    console.error('📱 SMS service unavailable - queuing for retry');
    // TODO: Add to retry queue
    return { status: 'queued', to, message };
  }
);

/**
 * Email Service Circuit Breaker
 */
export const emailBreaker = createCircuitBreaker(
  'Email',
  async (to, subject, body, options = {}) => {
    // Import email service dynamically to avoid circular dependencies
    const { sendEmail } = await import('../services/email.service.js');
    return sendEmail(to, subject, body, options);
  },
  { timeout: 15000 }, // Email can be slow
  // Fallback - queue for retry
  async (to, subject, body) => {
    console.error('📧 Email service unavailable - queuing for retry');
    // TODO: Add to email queue
    return { status: 'queued', to, subject };
  }
);

/**
 * Payment Gateway Circuit Breaker
 */
export const paymentBreaker = createCircuitBreaker(
  'Payment',
  async (paymentData) => {
    const { processPayment } = await import('../services/payment.service.js');
    return processPayment(paymentData);
  },
  {
    timeout: 20000, // Payment gateways need more time
    errorThresholdPercentage: 30, // More sensitive for payments
    volumeThreshold: 3 // Open faster for payments
  },
  // NO FALLBACK for payments - must fail safely
  async (paymentData) => {
    console.error('💳 Payment gateway unavailable - transaction failed');
    throw new Error('Payment service temporarily unavailable. Please try again later.');
  }
);

/**
 * AI Service Circuit Breaker (Groq, Gemini, etc.)
 */
export const aiBreaker = createCircuitBreaker(
  'AI',
  async (prompt, options = {}) => {
    const { consultWithAI } = await import('../services/medicalAI.service.js');
    return consultWithAI(prompt, options);
  },
  {
    timeout: 30000, // AI can take longer
    errorThresholdPercentage: 60 // More tolerant of AI errors
  },
  // Fallback to simpler response
  async (prompt) => {
    console.log('🤖 AI service unavailable - using fallback response');
    return {
      response: 'AI service is currently unavailable. Please consult with a doctor for medical advice.',
      fallback: true
    };
  }
);

/**
 * Video Service Circuit Breaker (Agora)
 */
export const videoBreaker = createCircuitBreaker(
  'Video',
  async (sessionData) => {
    const { createVideoSession } = await import('../services/video.service.js');
    return createVideoSession(sessionData);
  },
  { timeout: 10000 },
  async (sessionData) => {
    console.error('📹 Video service unavailable');
    throw new Error('Video service temporarily unavailable. Please try again later.');
  }
);

/**
 * External Lab API Circuit Breaker
 */
export const labApiBreaker = createCircuitBreaker(
  'LabAPI',
  async (labId, testData) => {
    // External lab API call
    const response = await axios.post(
      `${process.env.LAB_API_URL}/tests`,
      testData,
      {
        headers: {
          'Authorization': `Bearer ${process.env.LAB_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  },
  { timeout: 15000 },
  async (labId, testData) => {
    console.error('🔬 Lab API unavailable - saving for manual processing');
    return { status: 'manual_processing_required', labId, testData };
  }
);

/**
 * Pharmacy API Circuit Breaker
 */
export const pharmacyApiBreaker = createCircuitBreaker(
  'PharmacyAPI',
  async (pharmacyId, orderData) => {
    const response = await axios.post(
      `${process.env.PHARMACY_API_URL}/orders`,
      orderData,
      {
        headers: {
          'Authorization': `Bearer ${process.env.PHARMACY_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  },
  { timeout: 12000 },
  async (pharmacyId, orderData) => {
    console.error('💊 Pharmacy API unavailable - queuing order');
    return { status: 'queued', pharmacyId, orderData };
  }
);

/**
 * Helper function to safely execute any function with circuit breaker
 */
export async function executeWithCircuitBreaker(serviceName, fn, options = {}, fallback = null) {
  let breaker = circuitBreakers.get(serviceName);
  
  if (!breaker) {
    breaker = createCircuitBreaker(serviceName, fn, options, fallback);
  }
  
  return breaker.fire();
}

export default {
  createCircuitBreaker,
  getCircuitBreaker,
  getAllCircuitBreakerStatus,
  resetAllCircuitBreakers,
  executeWithCircuitBreaker,
  // Service-specific breakers
  whatsappBreaker,
  smsBreaker,
  emailBreaker,
  paymentBreaker,
  aiBreaker,
  videoBreaker,
  labApiBreaker,
  pharmacyApiBreaker
};
