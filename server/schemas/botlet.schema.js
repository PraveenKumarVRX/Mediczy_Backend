/**
 * Botlet Schema Definition
 * 
 * A Botlet is an autonomous, specialized AI agent that handles specific
 * intent categories with domain expertise and configurable behavior.
 * 
 * Botlets are dynamically routed based on intent classification confidence
 * and can escalate to human agents or other botlets when needed.
 */

/**
 * Botlet Configuration Schema
 */
export const BotletSchema = {
  // Unique identifier for the botlet
  id: {
    type: String,
    required: true,
    unique: true,
    pattern: /^[a-z0-9-]+$/,
    description: 'Unique botlet identifier (e.g., "appointment-scheduler", "emergency-triage")'
  },

  // Human-readable name
  name: {
    type: String,
    required: true,
    maxLength: 100,
    description: 'Display name for the botlet'
  },

  // Botlet type/category
  type: {
    type: String,
    required: true,
    enum: [
      'triage',           // Emergency triage and routing
      'scheduler',        // Appointment booking
      'consultant',       // Medical consultation
      'specialist',       // Domain-specific specialist (pregnancy, pediatrics, etc.)
      'navigator',        // Doctor search and navigation
      'informational',    // General information and FAQs
      'support'           // Patient support and follow-up
    ],
    description: 'Botlet category'
  },

  // Intent handling capabilities
  intents: {
    type: Array,
    required: true,
    items: {
      type: Object,
      properties: {
        intentName: {
          type: String,
          required: true,
          description: 'Intent name (e.g., "appointment", "emergency", "pregnancy")'
        },
        priority: {
          type: Number,
          required: true,
          min: 0,
          max: 5,
          description: 'Priority level (0 = highest, 5 = lowest)'
        },
        minConfidence: {
          type: Number,
          required: true,
          min: 0,
          max: 100,
          description: 'Minimum confidence threshold to activate this botlet (%)'
        },
        maxConfidence: {
          type: Number,
          required: false,
          min: 0,
          max: 100,
          description: 'Maximum confidence threshold (optional, for routing ranges)'
        }
      }
    },
    description: 'List of intents this botlet can handle'
  },

  // Confidence thresholds
  confidenceThresholds: {
    type: Object,
    required: true,
    properties: {
      minimum: {
        type: Number,
        min: 0,
        max: 100,
        default: 30,
        description: 'Minimum confidence to activate (reject below this)'
      },
      preferred: {
        type: Number,
        min: 0,
        max: 100,
        default: 60,
        description: 'Preferred confidence for autonomous operation'
      },
      escalationThreshold: {
        type: Number,
        min: 0,
        max: 100,
        default: 40,
        description: 'Below this, consider escalation or fallback'
      },
      handoffThreshold: {
        type: Number,
        min: 0,
        max: 100,
        default: 25,
        description: 'Below this, handoff to human or higher-tier botlet'
      }
    }
  },

  // Autonomy level
  autonomyLevel: {
    type: String,
    required: true,
    enum: [
      'fully_autonomous',    // Can complete tasks without human intervention
      'semi_autonomous',     // Can handle routine tasks, escalates complex cases
      'assisted',            // Provides suggestions, requires human approval
      'supervised'           // All actions reviewed by human before execution
    ],
    default: 'semi_autonomous',
    description: 'Level of autonomous decision-making'
  },

  // Capabilities and features
  capabilities: {
    type: Object,
    required: true,
    properties: {
      canSchedule: {
        type: Boolean,
        default: false,
        description: 'Can schedule appointments'
      },
      canPrescribe: {
        type: Boolean,
        default: false,
        description: 'Can suggest prescriptions (requires verification)'
      },
      canDiagnose: {
        type: Boolean,
        default: false,
        description: 'Can provide diagnostic suggestions (not final diagnosis)'
      },
      canEscalate: {
        type: Boolean,
        default: true,
        description: 'Can escalate to human agents or other botlets'
      },
      canAccessRecords: {
        type: Boolean,
        default: false,
        description: 'Can access patient medical records'
      },
      multiLanguage: {
        type: Boolean,
        default: true,
        description: 'Supports multiple languages'
      },
      contextAware: {
        type: Boolean,
        default: true,
        description: 'Maintains conversation context across sessions'
      }
    }
  },

  // Escalation rules
  escalation: {
    type: Object,
    required: true,
    properties: {
      enabled: {
        type: Boolean,
        default: true,
        description: 'Enable escalation to higher tiers'
      },
      triggers: {
        type: Array,
        items: {
          type: String,
          enum: [
            'low_confidence',
            'complex_query',
            'patient_request',
            'safety_concern',
            'legal_requirement',
            'timeout',
            'error_threshold',
            'manual_override'
          ]
        },
        description: 'Conditions that trigger escalation'
      },
      escalationPath: {
        type: Array,
        items: {
          type: Object,
          properties: {
            tier: {
              type: Number,
              description: 'Escalation tier (1, 2, 3...)'
            },
            targetType: {
              type: String,
              enum: ['botlet', 'human_agent', 'specialist', 'emergency'],
              description: 'Type of escalation target'
            },
            targetId: {
              type: String,
              description: 'ID of target botlet or agent pool'
            },
            condition: {
              type: String,
              description: 'Condition for this escalation tier'
            }
          }
        },
        description: 'Multi-tier escalation path'
      }
    }
  },

  // Response configuration
  responseConfig: {
    type: Object,
    required: true,
    properties: {
      maxResponseTime: {
        type: Number,
        default: 5000,
        description: 'Maximum response time in milliseconds'
      },
      retryAttempts: {
        type: Number,
        default: 2,
        min: 0,
        max: 5,
        description: 'Number of retry attempts on failure'
      },
      fallbackBehavior: {
        type: String,
        enum: ['escalate', 'default_response', 'queue', 'offline_message'],
        default: 'escalate',
        description: 'Behavior when botlet cannot respond'
      },
      tone: {
        type: String,
        enum: ['professional', 'friendly', 'empathetic', 'urgent', 'educational'],
        default: 'professional',
        description: 'Communication tone'
      }
    }
  },

  // Learning and adaptation
  learning: {
    type: Object,
    properties: {
      feedbackEnabled: {
        type: Boolean,
        default: true,
        description: 'Collect user feedback on responses'
      },
      adaptiveThresholds: {
        type: Boolean,
        default: false,
        description: 'Automatically adjust confidence thresholds based on performance'
      },
      trainingMode: {
        type: Boolean,
        default: false,
        description: 'Log all interactions for model improvement'
      }
    }
  },

  // Metadata
  metadata: {
    type: Object,
    properties: {
      version: {
        type: String,
        pattern: /^\d+\.\d+\.\d+$/,
        description: 'Semantic version'
      },
      created: {
        type: Date,
        required: true,
        description: 'Creation timestamp'
      },
      updated: {
        type: Date,
        required: true,
        description: 'Last update timestamp'
      },
      author: {
        type: String,
        description: 'Creator/owner of the botlet'
      },
      tags: {
        type: Array,
        items: { type: String },
        description: 'Tags for categorization and search'
      },
      description: {
        type: String,
        maxLength: 500,
        description: 'Detailed description of botlet purpose and capabilities'
      }
    }
  },

  // Performance metrics
  metrics: {
    type: Object,
    properties: {
      totalInteractions: {
        type: Number,
        default: 0,
        description: 'Total number of interactions handled'
      },
      successfulResolutions: {
        type: Number,
        default: 0,
        description: 'Number of successfully resolved queries'
      },
      escalations: {
        type: Number,
        default: 0,
        description: 'Number of escalations to higher tiers'
      },
      averageConfidence: {
        type: Number,
        min: 0,
        max: 100,
        description: 'Average confidence score'
      },
      averageResponseTime: {
        type: Number,
        description: 'Average response time in milliseconds'
      },
      satisfactionScore: {
        type: Number,
        min: 0,
        max: 5,
        description: 'User satisfaction rating (1-5 stars)'
      }
    }
  },

  // Status and availability
  status: {
    type: String,
    enum: ['active', 'inactive', 'maintenance', 'deprecated'],
    default: 'active',
    required: true,
    description: 'Current operational status'
  },

  // Rate limiting
  rateLimits: {
    type: Object,
    properties: {
      maxConcurrentSessions: {
        type: Number,
        default: 100,
        description: 'Maximum concurrent conversations'
      },
      maxRequestsPerMinute: {
        type: Number,
        default: 60,
        description: 'Rate limit per user'
      },
      maxSessionDuration: {
        type: Number,
        default: 3600000, // 1 hour
        description: 'Maximum session duration in milliseconds'
      }
    }
  }
};

/**
 * Example Botlet Configurations
 */
export const ExampleBotlets = {
  emergencyTriageBotlet: {
    id: 'emergency-triage',
    name: 'Emergency Triage Assistant',
    type: 'triage',
    intents: [
      {
        intentName: 'emergency',
        priority: 0,
        minConfidence: 60
      }
    ],
    confidenceThresholds: {
      minimum: 60,
      preferred: 80,
      escalationThreshold: 70,
      handoffThreshold: 50
    },
    autonomyLevel: 'supervised',
    capabilities: {
      canSchedule: false,
      canPrescribe: false,
      canDiagnose: false,
      canEscalate: true,
      canAccessRecords: true,
      multiLanguage: true,
      contextAware: true
    },
    escalation: {
      enabled: true,
      triggers: ['safety_concern', 'complex_query', 'low_confidence'],
      escalationPath: [
        {
          tier: 1,
          targetType: 'emergency',
          targetId: 'emergency-dispatch',
          condition: 'any_emergency_keyword'
        },
        {
          tier: 2,
          targetType: 'human_agent',
          targetId: 'emergency-medical-team',
          condition: 'life_threatening'
        }
      ]
    },
    responseConfig: {
      maxResponseTime: 2000,
      retryAttempts: 0,
      fallbackBehavior: 'escalate',
      tone: 'urgent'
    },
    status: 'active'
  },

  appointmentSchedulerBotlet: {
    id: 'appointment-scheduler',
    name: 'Appointment Booking Assistant',
    type: 'scheduler',
    intents: [
      {
        intentName: 'appointment',
        priority: 1,
        minConfidence: 50
      }
    ],
    confidenceThresholds: {
      minimum: 50,
      preferred: 70,
      escalationThreshold: 40,
      handoffThreshold: 30
    },
    autonomyLevel: 'fully_autonomous',
    capabilities: {
      canSchedule: true,
      canPrescribe: false,
      canDiagnose: false,
      canEscalate: true,
      canAccessRecords: true,
      multiLanguage: true,
      contextAware: true
    },
    escalation: {
      enabled: true,
      triggers: ['low_confidence', 'complex_query', 'patient_request'],
      escalationPath: [
        {
          tier: 1,
          targetType: 'botlet',
          targetId: 'doctor-search-navigator',
          condition: 'needs_specialist_search'
        },
        {
          tier: 2,
          targetType: 'human_agent',
          targetId: 'scheduling-team',
          condition: 'complex_scheduling'
        }
      ]
    },
    responseConfig: {
      maxResponseTime: 5000,
      retryAttempts: 2,
      fallbackBehavior: 'escalate',
      tone: 'friendly'
    },
    status: 'active'
  },

  pregnancySpecialistBotlet: {
    id: 'pregnancy-specialist',
    name: 'Pregnancy Care Specialist',
    type: 'specialist',
    intents: [
      {
        intentName: 'pregnancy',
        priority: 2,
        minConfidence: 55
      }
    ],
    confidenceThresholds: {
      minimum: 55,
      preferred: 75,
      escalationThreshold: 45,
      handoffThreshold: 35
    },
    autonomyLevel: 'semi_autonomous',
    capabilities: {
      canSchedule: true,
      canPrescribe: false,
      canDiagnose: false,
      canEscalate: true,
      canAccessRecords: true,
      multiLanguage: true,
      contextAware: true
    },
    escalation: {
      enabled: true,
      triggers: ['safety_concern', 'complex_query', 'low_confidence'],
      escalationPath: [
        {
          tier: 1,
          targetType: 'specialist',
          targetId: 'obgyn-specialist',
          condition: 'high_risk_pregnancy'
        },
        {
          tier: 2,
          targetType: 'human_agent',
          targetId: 'maternal-health-team',
          condition: 'medical_emergency'
        }
      ]
    },
    responseConfig: {
      maxResponseTime: 5000,
      retryAttempts: 2,
      fallbackBehavior: 'escalate',
      tone: 'empathetic'
    },
    status: 'active'
  },

  medicalConsultantBotlet: {
    id: 'medical-consultant',
    name: 'General Medical Consultant',
    type: 'consultant',
    intents: [
      {
        intentName: 'medical_consult',
        priority: 3,
        minConfidence: 40
      },
      {
        intentName: 'medication',
        priority: 3,
        minConfidence: 45
      },
      {
        intentName: 'lab_test',
        priority: 3,
        minConfidence: 45
      }
    ],
    confidenceThresholds: {
      minimum: 40,
      preferred: 65,
      escalationThreshold: 35,
      handoffThreshold: 25
    },
    autonomyLevel: 'semi_autonomous',
    capabilities: {
      canSchedule: false,
      canPrescribe: false,
      canDiagnose: true,
      canEscalate: true,
      canAccessRecords: true,
      multiLanguage: true,
      contextAware: true
    },
    escalation: {
      enabled: true,
      triggers: ['low_confidence', 'complex_query', 'safety_concern'],
      escalationPath: [
        {
          tier: 1,
          targetType: 'specialist',
          targetId: 'domain-specialist',
          condition: 'requires_specialist_knowledge'
        },
        {
          tier: 2,
          targetType: 'human_agent',
          targetId: 'medical-team',
          condition: 'diagnostic_uncertainty'
        }
      ]
    },
    responseConfig: {
      maxResponseTime: 8000,
      retryAttempts: 2,
      fallbackBehavior: 'escalate',
      tone: 'professional'
    },
    status: 'active'
  }
};

export default BotletSchema;
