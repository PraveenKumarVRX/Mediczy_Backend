/**
 * Mediqzy PaaS Event System
 * 
 * Event-driven architecture for platform-wide communication
 * Supports: Tenant lifecycle, User activities, Healthcare workflows
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

// =============================================================================
// EVENT TYPES CATALOG
// =============================================================================
export const EventTypes = {
  // Platform Events
  PLATFORM: {
    TENANT_CREATED: 'platform.tenant.created',
    TENANT_UPDATED: 'platform.tenant.updated',
    TENANT_SUSPENDED: 'platform.tenant.suspended',
    TENANT_ACTIVATED: 'platform.tenant.activated',
    TENANT_DELETED: 'platform.tenant.deleted',
    TENANT_PROVISIONED: 'platform.tenant.provisioned',
    DOMAIN_ADDED: 'platform.domain.added',
    DOMAIN_VERIFIED: 'platform.domain.verified',
    DOMAIN_REMOVED: 'platform.domain.removed',
    SUBSCRIPTION_CREATED: 'platform.subscription.created',
    SUBSCRIPTION_UPGRADED: 'platform.subscription.upgraded',
    SUBSCRIPTION_DOWNGRADED: 'platform.subscription.downgraded',
    SUBSCRIPTION_CANCELLED: 'platform.subscription.cancelled',
    SUBSCRIPTION_RENEWED: 'platform.subscription.renewed',
  },

  // Tenant Events
  TENANT: {
    ENTITY_CREATED: 'tenant.entity.created',
    ENTITY_UPDATED: 'tenant.entity.updated',
    ENTITY_DELETED: 'tenant.entity.deleted',
    USER_INVITED: 'tenant.user.invited',
    USER_JOINED: 'tenant.user.joined',
    USER_REMOVED: 'tenant.user.removed',
    ROLE_CREATED: 'tenant.role.created',
    ROLE_UPDATED: 'tenant.role.updated',
    ROLE_DELETED: 'tenant.role.deleted',
    CONFIG_UPDATED: 'tenant.config.updated',
  },

  // Entity Events
  ENTITY: {
    USER_ADDED: 'entity.user.added',
    USER_REMOVED: 'entity.user.removed',
    ROLE_ASSIGNED: 'entity.role.assigned',
    SETTINGS_UPDATED: 'entity.settings.updated',
  },

  // Authentication Events
  AUTH: {
    LOGIN_SUCCESS: 'auth.login.success',
    LOGIN_FAILED: 'auth.login.failed',
    LOGOUT: 'auth.logout',
    PASSWORD_CHANGED: 'auth.password.changed',
    PASSWORD_RESET_REQUESTED: 'auth.password.reset_requested',
    MFA_ENABLED: 'auth.mfa.enabled',
    MFA_DISABLED: 'auth.mfa.disabled',
    SESSION_CREATED: 'auth.session.created',
    SESSION_EXPIRED: 'auth.session.expired',
    TOKEN_REFRESHED: 'auth.token.refreshed',
  },

  // Patient Events
  PATIENT: {
    REGISTERED: 'patient.registered',
    UPDATED: 'patient.updated',
    MERGED: 'patient.merged',
    CONSENT_GIVEN: 'patient.consent.given',
    CONSENT_REVOKED: 'patient.consent.revoked',
  },

  // Appointment Events
  APPOINTMENT: {
    CREATED: 'appointment.created',
    CONFIRMED: 'appointment.confirmed',
    RESCHEDULED: 'appointment.rescheduled',
    CANCELLED: 'appointment.cancelled',
    COMPLETED: 'appointment.completed',
    NO_SHOW: 'appointment.no_show',
    REMINDER_SENT: 'appointment.reminder.sent',
  },

  // Medical Record Events
  MEDICAL_RECORD: {
    CREATED: 'medical_record.created',
    UPDATED: 'medical_record.updated',
    ACCESSED: 'medical_record.accessed',
    SHARED: 'medical_record.shared',
  },

  // Billing Events
  BILLING: {
    INVOICE_CREATED: 'billing.invoice.created',
    INVOICE_SENT: 'billing.invoice.sent',
    PAYMENT_RECEIVED: 'billing.payment.received',
    PAYMENT_FAILED: 'billing.payment.failed',
    REFUND_ISSUED: 'billing.refund.issued',
  },

  // Claims Events (Insurance)
  CLAIM: {
    SUBMITTED: 'claim.submitted',
    UNDER_REVIEW: 'claim.under_review',
    APPROVED: 'claim.approved',
    REJECTED: 'claim.rejected',
    SETTLED: 'claim.settled',
    APPEALED: 'claim.appealed',
  },

  // Pre-authorization Events
  PREAUTH: {
    REQUESTED: 'preauth.requested',
    APPROVED: 'preauth.approved',
    REJECTED: 'preauth.rejected',
    EXTENDED: 'preauth.extended',
  },

  // Prescription Events
  PRESCRIPTION: {
    CREATED: 'prescription.created',
    UPDATED: 'prescription.updated',
    CANCELLED: 'prescription.cancelled',
    DISPENSED: 'prescription.dispensed',
    REFILL_REQUESTED: 'prescription.refill.requested',
  },

  // Lab Events
  LAB: {
    ORDER_CREATED: 'lab.order.created',
    SAMPLE_COLLECTED: 'lab.sample.collected',
    SAMPLE_RECEIVED: 'lab.sample.received',
    RESULT_ENTERED: 'lab.result.entered',
    RESULT_VERIFIED: 'lab.result.verified',
    RESULT_PUBLISHED: 'lab.result.published',
    CRITICAL_VALUE: 'lab.result.critical',
  },

  // Ambulance Events
  AMBULANCE: {
    TRIP_REQUESTED: 'ambulance.trip.requested',
    TRIP_ASSIGNED: 'ambulance.trip.assigned',
    TRIP_EN_ROUTE: 'ambulance.trip.en_route',
    TRIP_ARRIVED: 'ambulance.trip.arrived',
    TRIP_COMPLETED: 'ambulance.trip.completed',
    TRIP_CANCELLED: 'ambulance.trip.cancelled',
  },

  // Communication Events
  COMMUNICATION: {
    MESSAGE_SENT: 'communication.message.sent',
    MESSAGE_DELIVERED: 'communication.message.delivered',
    MESSAGE_READ: 'communication.message.read',
    NOTIFICATION_SENT: 'communication.notification.sent',
    BROADCAST_SENT: 'communication.broadcast.sent',
  },
};

// =============================================================================
// EVENT ENVELOPE SCHEMA
// =============================================================================

/**
 * Create a standardized event envelope
 * @param {string} eventType - Event type from EventTypes catalog
 * @param {Object} payload - Event-specific data
 * @param {Object} context - Platform context (tenant, entity, user)
 * @param {Object} actor - Who triggered the event
 * @param {Object} metadata - Additional metadata
 */
export function createEventEnvelope(eventType, payload, context = {}, actor = {}, metadata = {}) {
  return {
    // Event Identity
    eventId: uuidv4(),
    eventType,
    eventVersion: '1.0',
    timestamp: new Date().toISOString(),

    // Platform Context
    platformContext: {
      tenantId: context.tenantId || null,
      entityId: context.entityId || null,
      domain: context.domain || null,
    },

    // Actor (who triggered the event)
    actor: {
      userId: actor.userId || null,
      email: actor.email || null,
      role: actor.role || null,
      ipAddress: actor.ipAddress || null,
      userAgent: actor.userAgent || null,
    },

    // Event-specific payload
    payload,

    // Metadata
    metadata: {
      correlationId: metadata.correlationId || uuidv4(),
      causationId: metadata.causationId || null,
      source: metadata.source || 'mediqzy-platform',
      environment: process.env.NODE_ENV || 'development',
      ...metadata,
    },
  };
}

// =============================================================================
// EVENT BUS (In-memory for development, Redis/Kafka for production)
// =============================================================================

class MediqzyEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100); // Allow many subscribers
    this.subscribers = new Map();
    this.deadLetterQueue = [];
    this.retryPolicy = {
      maxRetries: 3,
      backoffMultiplier: 2,
      initialDelayMs: 1000,
    };
  }

  /**
   * Emit an event with the standard envelope
   */
  emitEvent(eventType, payload, context = {}, actor = {}, metadata = {}) {
    const event = createEventEnvelope(eventType, payload, context, actor, metadata);
    
    // Log event for audit
    this.logEvent(event);
    
    // Emit to all listeners
    this.emit(eventType, event);
    this.emit('*', event); // Wildcard for catch-all listeners
    
    return event;
  }

  /**
   * Subscribe to an event type
   */
  subscribe(eventType, handler, options = {}) {
    const wrappedHandler = async (event) => {
      try {
        await handler(event);
      } catch (error) {
        await this.handleSubscriberError(eventType, event, error, options);
      }
    };

    this.on(eventType, wrappedHandler);
    
    // Track subscriber for management
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, []);
    }
    this.subscribers.get(eventType).push({ handler: wrappedHandler, options });

    return () => this.off(eventType, wrappedHandler); // Return unsubscribe function
  }

  /**
   * Subscribe to multiple event types
   */
  subscribeMany(eventTypes, handler, options = {}) {
    const unsubscribers = eventTypes.map(type => this.subscribe(type, handler, options));
    return () => unsubscribers.forEach(unsub => unsub());
  }

  /**
   * Handle subscriber errors with retry logic
   */
  async handleSubscriberError(eventType, event, error, options) {
    const retryCount = event.metadata._retryCount || 0;
    
    console.error(`[EventBus] Error handling ${eventType}:`, {
      eventId: event.eventId,
      error: error.message,
      retryCount,
    });

    if (retryCount < this.retryPolicy.maxRetries && options.retry !== false) {
      // Schedule retry with exponential backoff
      const delay = this.retryPolicy.initialDelayMs * Math.pow(this.retryPolicy.backoffMultiplier, retryCount);
      
      setTimeout(() => {
        event.metadata._retryCount = retryCount + 1;
        this.emit(eventType, event);
      }, delay);
    } else {
      // Move to dead letter queue
      this.deadLetterQueue.push({
        event,
        error: error.message,
        failedAt: new Date().toISOString(),
      });
      
      this.emit('event.failed', { event, error: error.message });
    }
  }

  /**
   * Log event for audit trail
   */
  logEvent(event) {
    // In production, this would write to a persistent store
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[Event] ${event.eventType}`, {
        eventId: event.eventId,
        tenantId: event.platformContext.tenantId,
        actorId: event.actor.userId,
        timestamp: event.timestamp,
      });
    }
  }

  /**
   * Get dead letter queue
   */
  getDeadLetterQueue() {
    return [...this.deadLetterQueue];
  }

  /**
   * Retry failed event
   */
  retryFromDeadLetter(eventId) {
    const index = this.deadLetterQueue.findIndex(item => item.event.eventId === eventId);
    if (index !== -1) {
      const { event } = this.deadLetterQueue.splice(index, 1)[0];
      event.metadata._retryCount = 0;
      this.emit(event.eventType, event);
      return true;
    }
    return false;
  }

  /**
   * Get subscriber count for an event type
   */
  getSubscriberCount(eventType) {
    return this.subscribers.get(eventType)?.length || 0;
  }
}

// Singleton instance
export const eventBus = new MediqzyEventBus();

// =============================================================================
// EVENT PAYLOAD SCHEMAS (Type definitions for TypeScript / validation)
// =============================================================================

export const EventPayloadSchemas = {
  // Tenant Created
  'platform.tenant.created': {
    tenantId: 'uuid',
    tenantCode: 'string',
    tenantName: 'string',
    tenantType: 'string',
    dbStrategy: 'string',
    primaryDomain: 'string?',
  },

  // Tenant Suspended
  'platform.tenant.suspended': {
    tenantId: 'uuid',
    reason: 'string',
    suspendedBy: 'uuid',
  },

  // Entity Created
  'tenant.entity.created': {
    entityId: 'uuid',
    entityCode: 'string',
    entityName: 'string',
    entityType: 'string',
  },

  // User Added to Entity
  'entity.user.added': {
    userId: 'uuid',
    email: 'string',
    roles: 'string[]',
    employeeId: 'string?',
  },

  // Appointment Created
  'appointment.created': {
    appointmentId: 'uuid',
    patientId: 'uuid',
    doctorId: 'uuid',
    scheduledAt: 'datetime',
    appointmentType: 'string',
    duration: 'number',
  },

  // Claim Approved
  'claim.approved': {
    claimId: 'uuid',
    claimNumber: 'string',
    amountRequested: 'number',
    amountApproved: 'number',
    currency: 'string',
    approvedBy: 'uuid',
  },

  // Lab Result Published
  'lab.result.published': {
    orderId: 'uuid',
    patientId: 'uuid',
    testCode: 'string',
    resultStatus: 'string',
    isCritical: 'boolean',
  },
};

// =============================================================================
// COMMON EVENT HELPERS
// =============================================================================

/**
 * Create tenant lifecycle events
 */
export const TenantEvents = {
  created: (tenant, actor) => eventBus.emitEvent(
    EventTypes.PLATFORM.TENANT_CREATED,
    {
      tenantId: tenant.tenant_id,
      tenantCode: tenant.tenant_code,
      tenantName: tenant.tenant_name,
      tenantType: tenant.tenant_type,
      dbStrategy: tenant.db_strategy,
      primaryDomain: tenant.primary_domain,
    },
    { tenantId: tenant.tenant_id },
    actor
  ),

  suspended: (tenantId, reason, actor) => eventBus.emitEvent(
    EventTypes.PLATFORM.TENANT_SUSPENDED,
    { tenantId, reason },
    { tenantId },
    actor
  ),

  activated: (tenantId, actor) => eventBus.emitEvent(
    EventTypes.PLATFORM.TENANT_ACTIVATED,
    { tenantId },
    { tenantId },
    actor
  ),

  provisioned: (tenantId, resources, actor) => eventBus.emitEvent(
    EventTypes.PLATFORM.TENANT_PROVISIONED,
    { tenantId, resources },
    { tenantId },
    actor
  ),
};

/**
 * Create authentication events
 */
export const AuthEvents = {
  loginSuccess: (user, context) => eventBus.emitEvent(
    EventTypes.AUTH.LOGIN_SUCCESS,
    {
      userId: user.user_id,
      email: user.email,
      authMethod: context.authMethod || 'password',
    },
    { tenantId: context.tenantId, entityId: context.entityId },
    { userId: user.user_id, email: user.email, ipAddress: context.ipAddress }
  ),

  loginFailed: (email, reason, context) => eventBus.emitEvent(
    EventTypes.AUTH.LOGIN_FAILED,
    { email, reason },
    {},
    { email, ipAddress: context.ipAddress }
  ),

  logout: (userId, context) => eventBus.emitEvent(
    EventTypes.AUTH.LOGOUT,
    { userId },
    { tenantId: context.tenantId },
    { userId }
  ),
};

/**
 * Create appointment events
 */
export const AppointmentEvents = {
  created: (appointment, context, actor) => eventBus.emitEvent(
    EventTypes.APPOINTMENT.CREATED,
    {
      appointmentId: appointment.id,
      patientId: appointment.patient_id,
      doctorId: appointment.doctor_id,
      scheduledAt: appointment.scheduled_at,
      appointmentType: appointment.type,
      duration: appointment.duration,
    },
    context,
    actor
  ),

  confirmed: (appointmentId, context, actor) => eventBus.emitEvent(
    EventTypes.APPOINTMENT.CONFIRMED,
    { appointmentId },
    context,
    actor
  ),

  cancelled: (appointmentId, reason, context, actor) => eventBus.emitEvent(
    EventTypes.APPOINTMENT.CANCELLED,
    { appointmentId, reason },
    context,
    actor
  ),

  completed: (appointmentId, context, actor) => eventBus.emitEvent(
    EventTypes.APPOINTMENT.COMPLETED,
    { appointmentId },
    context,
    actor
  ),
};

/**
 * Create claim events
 */
export const ClaimEvents = {
  submitted: (claim, context, actor) => eventBus.emitEvent(
    EventTypes.CLAIM.SUBMITTED,
    {
      claimId: claim.id,
      claimNumber: claim.claim_number,
      policyId: claim.policy_id,
      amountRequested: claim.amount_requested,
      claimType: claim.claim_type,
    },
    context,
    actor
  ),

  approved: (claim, amountApproved, context, actor) => eventBus.emitEvent(
    EventTypes.CLAIM.APPROVED,
    {
      claimId: claim.id,
      claimNumber: claim.claim_number,
      amountRequested: claim.amount_requested,
      amountApproved,
      currency: claim.currency || 'INR',
    },
    context,
    actor
  ),

  rejected: (claim, reason, context, actor) => eventBus.emitEvent(
    EventTypes.CLAIM.REJECTED,
    {
      claimId: claim.id,
      claimNumber: claim.claim_number,
      reason,
    },
    context,
    actor
  ),
};

/**
 * Create lab events
 */
export const LabEvents = {
  orderCreated: (order, context, actor) => eventBus.emitEvent(
    EventTypes.LAB.ORDER_CREATED,
    {
      orderId: order.id,
      patientId: order.patient_id,
      testCodes: order.test_codes,
      priority: order.priority,
    },
    context,
    actor
  ),

  resultPublished: (result, context, actor) => eventBus.emitEvent(
    EventTypes.LAB.RESULT_PUBLISHED,
    {
      orderId: result.order_id,
      patientId: result.patient_id,
      testCode: result.test_code,
      resultStatus: result.status,
      isCritical: result.is_critical || false,
    },
    context,
    actor
  ),

  criticalValue: (result, context, actor) => eventBus.emitEvent(
    EventTypes.LAB.CRITICAL_VALUE,
    {
      orderId: result.order_id,
      patientId: result.patient_id,
      testCode: result.test_code,
      value: result.value,
      referenceRange: result.reference_range,
    },
    context,
    actor
  ),
};

// =============================================================================
// EVENT SUBSCRIBERS (Built-in handlers)
// =============================================================================

/**
 * Register built-in event subscribers
 */
export function registerBuiltInSubscribers() {
  // Audit Log Subscriber - writes all events to audit table
  eventBus.subscribe('*', async (event) => {
    // Write to platform_audit_logs table
    // This would be implemented with actual DB write
    if (process.env.AUDIT_EVENTS === 'true') {
      console.log('[Audit]', JSON.stringify(event, null, 2));
    }
  });

  // Notification Subscriber - send notifications for important events
  eventBus.subscribe(EventTypes.APPOINTMENT.CREATED, async (event) => {
    // Send appointment confirmation notification
    console.log('[Notification] Appointment confirmation:', event.payload.appointmentId);
  });

  eventBus.subscribe(EventTypes.CLAIM.APPROVED, async (event) => {
    // Send claim approved notification
    console.log('[Notification] Claim approved:', event.payload.claimId);
  });

  eventBus.subscribe(EventTypes.LAB.CRITICAL_VALUE, async (event) => {
    // Send urgent notification for critical lab values
    console.log('[URGENT] Critical lab value:', event.payload);
  });

  // Analytics Subscriber - track metrics
  eventBus.subscribe('*', async (event) => {
    // Send to analytics service
    // This would integrate with your analytics/metrics system
  });

  console.log('[EventBus] Built-in subscribers registered');
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  EventTypes,
  createEventEnvelope,
  eventBus,
  EventPayloadSchemas,
  TenantEvents,
  AuthEvents,
  AppointmentEvents,
  ClaimEvents,
  LabEvents,
  registerBuiltInSubscribers,
};
