/**
import { JWT_CONFIG } from '../../config/auth.config.js';
 * PostgreSQL Appointment Model
 * Enhanced with PostgreSQL JSONB and advanced features
 */

import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const Appointment = sequelize.define('Appointment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // Multi-Tenant Fields
  organization_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Organization ID for multi-tenant isolation'
  },
  organization_type: {
    type: DataTypes.ENUM('hospital', 'clinic', 'corporate', 'individual'),
    allowNull: true
  },
  
  // Patient Information
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true, // Allow null for walk-in/hospital-created appointments
    references: {
      model: 'users',
      key: 'id'
    }
  },
  patientName: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  patientEmail: {
    type: DataTypes.STRING(255),
    allowNull: true // Allow null for walk-in patients
  },
  patientPhone: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  
  // Patient Details as JSONB
  patientDetails: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional patient info like age, gender, address'
  },
  
  // Doctor Information
  doctorId: {
    type: DataTypes.INTEGER,
    allowNull: true, // Allow null for unassigned appointments
    references: {
      model: 'doctors',
      key: 'id'
    }
  },
  doctorName: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  specialization: {
    type: DataTypes.STRING(100)
  },
  
  // Doctor Details as JSONB
  doctorDetails: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Doctor info snapshot at time of booking'
  },
  
  // Appointment Date/Time
  appointmentDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  appointmentTime: {
    type: DataTypes.TIME,
    allowNull: false
  },
  
  // PostgreSQL TIMESTAMP for better queries
  appointmentDateTime: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Combined date+time for range queries'
  },
  
  duration: {
    type: DataTypes.INTEGER,
    defaultValue: 15,
    comment: 'Duration in minutes'
  },
  
  // Type & Mode
  consultationType: {
    type: DataTypes.ENUM('online', 'in-person'),
    defaultValue: 'online'
  },
  
  // Status with more granular options
  status: {
    type: DataTypes.ENUM(
      'pending',
      'accepted',
      'scheduled',
      'confirmed',
      'in-progress',
      'completed',
      'cancelled',
      'rejected',
      'no-show',
      'rescheduled'
    ),
    defaultValue: 'pending'
  },
  
  // Status History as JSONB Array
  statusHistory: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of { status, timestamp, changedBy, reason }'
  },
  
  // Symptoms as Array
  symptoms: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Patient symptoms reported'
  },
  
  // Reason for Visit
  reason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  
  // Notes as JSONB
  notes_json: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Structured notes { patient: "", doctor: "", admin: "" }'
  },
  
  // Payment Information
  paymentStatus: {
    type: DataTypes.ENUM('pending', 'paid', 'failed', 'refunded'),
    defaultValue: 'pending'
  },
  paymentAmount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  
  // Payment Details as JSONB
  paymentDetails: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Payment info { method, transactionId, timestamp, gateway }'
  },
  
  // Meeting Information
  meetingLink: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  meetingId: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  meetingPassword: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  
  // Meeting Details as JSONB
  meetingDetails: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Video call details { platform, roomId, startedAt, endedAt, duration }'
  },
  
  // Call Initiation Tracking
  callInitiatedBy: {
    type: DataTypes.ENUM('doctor', 'patient'),
    allowNull: true,
    comment: 'Who initiated the video call'
  },
  callInitiatedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When the video call was initiated'
  },
  
  // Prescription
  prescriptionId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'prescriptions',
      key: 'id'
    }
  },
  
  // Reminders as JSONB Array
  reminders: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Reminder settings { type, time, sent, channel }'
  },
  
  // Automation Tracking
  automationRules: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Applied automation rules for this appointment'
  },
  
  // Cancellation
  cancellationReason: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  cancelledBy: {
    type: DataTypes.ENUM('patient', 'doctor', 'admin', 'system'),
    allowNull: true
  },
  cancelledAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  
  // Rescheduling
  rescheduledFrom: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Original appointment ID if rescheduled'
  },
  rescheduledTo: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'New appointment ID after rescheduling'
  },
  
  // Feedback
  patientRating: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 1,
      max: 5
    }
  },
  patientFeedback: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  doctorRating: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 1,
      max: 5
    }
  },
  doctorFeedback: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  
  // Feedback as JSONB
  feedback: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Comprehensive feedback from both parties'
  },
  
  // Insurance
  insuranceUsed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  insuranceDetails: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Insurance claim details if applicable'
  },
  
  // Metadata
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Flexible metadata for additional fields'
  },
  
  // Analytics
  sourceChannel: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'How appointment was booked (web, mobile, call, etc.)'
  },
  
  // Full-Text Search
  search_vector: {
    type: DataTypes.TSVECTOR,
    allowNull: true
  },
  
  // Timestamps
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'appointments',
  timestamps: true,
  
  indexes: [
    { fields: ['userId'] },
    { fields: ['doctorId'] },
    { fields: ['organization_id'] },
    { fields: ['appointmentDate'] },
    { fields: ['appointmentDateTime'] },
    { fields: ['status'] },
    { fields: ['paymentStatus'] },
    { fields: ['consultationType'] },
    
    // JSONB indexes
    {
      name: 'idx_appointments_payment_details',
      using: 'GIN',
      fields: ['paymentDetails']
    },
    {
      name: 'idx_appointments_meeting_details',
      using: 'GIN',
      fields: ['meetingDetails']
    },
    {
      name: 'idx_appointments_metadata',
      using: 'GIN',
      fields: ['metadata']
    },
    {
      name: 'idx_appointments_status_history',
      using: 'GIN',
      fields: ['statusHistory']
    },
    
    // Array index
    {
      name: 'idx_appointments_symptoms',
      using: 'GIN',
      fields: ['symptoms']
    },
    
    // Full-text search
    {
      name: 'idx_appointments_search',
      using: 'GIN',
      fields: ['search_vector']
    },
    
    // Composite indexes
    {
      name: 'idx_appointments_doctor_date',
      fields: ['doctorId', 'appointmentDate']
    },
    {
      name: 'idx_appointments_user_status',
      fields: ['userId', 'status']
    },
    {
      name: 'idx_appointments_org_date',
      fields: ['organization_id', 'appointmentDate']
    }
  ],
  
  hooks: {
    beforeCreate: async (appointment) => {
      // Combine date and time into datetime
      if (appointment.appointmentDate && appointment.appointmentTime) {
        const dateStr = appointment.appointmentDate;
        const timeStr = appointment.appointmentTime;
        appointment.appointmentDateTime = new Date(`${dateStr}T${timeStr}`);
      }
      
      // Initialize status history
      appointment.statusHistory = [{
        status: appointment.status,
        timestamp: new Date(),
        changedBy: 'system',
        reason: 'Initial creation'
      }];
    },
    
    beforeUpdate: async (appointment) => {
      // Update datetime if date or time changed
      if (appointment.changed('appointmentDate') || appointment.changed('appointmentTime')) {
        const dateStr = appointment.appointmentDate;
        const timeStr = appointment.appointmentTime;
        appointment.appointmentDateTime = new Date(`${dateStr}T${timeStr}`);
      }
      
      // Track status changes
      if (appointment.changed('status')) {
        const history = appointment.statusHistory || [];
        history.push({
          status: appointment.status,
          timestamp: new Date(),
          changedBy: 'system',
          reason: appointment.cancellationReason || 'Status updated'
        });
        appointment.statusHistory = history;
      }
    }
  }
});

// Static Methods
Appointment.findUpcoming = async function(doctorId, days = 7) {
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + days);
  
  return await Appointment.findAll({
    where: {
      doctorId,
      appointmentDateTime: {
        [sequelize.Sequelize.Op.between]: [startDate, endDate]
      },
      status: {
        [sequelize.Sequelize.Op.in]: ['pending', 'accepted', 'confirmed']
      }
    },
    order: [['appointmentDateTime', 'ASC']]
  });
};

Appointment.findByOrganization = async function(organization_id, options = {}) {
  return await Appointment.findAll({
    where: { organization_id },
    ...options
  });
};

export default Appointment;
