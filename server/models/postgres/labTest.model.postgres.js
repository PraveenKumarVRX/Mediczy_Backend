/**
import { JWT_CONFIG } from '../../config/auth.config.js';
 * PostgreSQL Lab Test Model
 * Manages lab test bookings, confirmations, and tracking
 */

import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const LabTest = sequelize.define('LabTest', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },

  // Multi-Tenant Fields
  organization_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    index: true,
    comment: 'Organization ID for multi-tenant isolation'
  },

  // User Information
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    onDelete: 'CASCADE',
    index: true,
    comment: 'Patient user ID'
  },

  // Hospital/Lab Information
  hospitalId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'hospitals',
      key: 'id'
    },
    onDelete: 'SET NULL',
    comment: 'Hospital/Lab location ID'
  },

  // Test Type Classification
  testType: {
    type: DataTypes.ENUM(
      'blood_test',
      'pathology',
      'radiology',
      'scan',
      'ultrasound',
      'xray',
      'ct_scan',
      'mri',
      'ecg',
      'echo',
      'eeg',
      'endoscopy',
      'colonoscopy',
      'other'
    ),
    allowNull: false,
    index: true,
    comment: 'Type of test'
  },

  testName: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Specific test name (e.g., "Complete Blood Count")'
  },

  // Appointment Details
  appointmentDate: {
    type: DataTypes.DATE,
    allowNull: false,
    index: true,
    comment: 'Scheduled test date'
  },

  appointmentTime: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'Scheduled time in HH:MM format'
  },

  // Status Fields
  status: {
    type: DataTypes.ENUM(
      'pending_confirmation',
      'booked',
      'completed',
      'cancelled',
      'no_show',
      'rescheduled'
    ),
    allowNull: false,
    defaultValue: 'pending_confirmation',
    index: true,
    comment: 'Booking status'
  },

  confirmationStatus: {
    type: DataTypes.ENUM('pending', 'confirmed', 'rejected'),
    allowNull: false,
    defaultValue: 'pending',
    index: true,
    comment: 'Hospital confirmation status'
  },

  // Urgency & Priority
  urgency: {
    type: DataTypes.ENUM('routine', 'urgent', 'stat'),
    allowNull: false,
    defaultValue: 'routine',
    comment: 'Test urgency level'
  },

  priority: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Priority level (1-5, 1=highest)'
  },

  // Clinical Information
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Patient notes/symptoms/concerns'
  },

  doctorNotes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Doctor prescribed notes'
  },

  referralNote: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Referral information from doctor'
  },

  // Fasting & Preparation
  requiresFasting: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Whether patient needs to fast'
  },

  fastingHours: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Hours of fasting required'
  },

  preparationInstructions: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Special preparation instructions'
  },

  // Results
  resultStatus: {
    type: DataTypes.ENUM('pending', 'ready', 'reviewed', 'abnormal', 'normal'),
    allowNull: true,
    defaultValue: 'pending',
    comment: 'Result availability status'
  },

  resultReportId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'reports',
      key: 'id'
    },
    onDelete: 'SET NULL',
    comment: 'Link to result report'
  },

  resultDate: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When results became available'
  },

  // Tracking
  confirmationDeadline: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'By when hospital needs confirmation'
  },

  reminderSent: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Whether reminder was sent to patient'
  },

  reminderSentAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When reminder was sent'
  },

  // Cancellation
  cancelledAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When the booking was cancelled'
  },

  cancellationReason: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Reason for cancellation'
  },

  cancelledBy: {
    type: DataTypes.ENUM('patient', 'hospital', 'system'),
    allowNull: true,
    comment: 'Who initiated cancellation'
  },

  // Pricing
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    comment: 'Base price of the test (INR)'
  },

  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'INR',
    comment: 'Currency code'
  },

  discount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Discount applied (INR)'
  },

  total_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    comment: 'Final amount after discount (INR)'
  },

  // Additional Metadata
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Additional metadata'
  },

  // Timestamps
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },

  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'lab_tests',
  timestamps: true,
  indexes: [
    {
      fields: ['userId', 'appointmentDate'],
      name: 'idx_labtest_user_date'
    },
    {
      fields: ['userId', 'status'],
      name: 'idx_labtest_user_status'
    },
    {
      fields: ['hospitalId', 'appointmentDate'],
      name: 'idx_labtest_hospital_date'
    },
    {
      fields: ['organization_id', 'userId'],
      name: 'idx_labtest_org_user'
    },
    {
      fields: ['status', 'confirmationStatus'],
      name: 'idx_labtest_status'
    },
    {
      fields: ['appointmentDate'],
      name: 'idx_labtest_appointment_date'
    },
    {
      fields: ['confirmationDeadline'],
      name: 'idx_labtest_confirmation_deadline'
    }
  ]
});

export default LabTest;
