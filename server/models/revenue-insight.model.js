/**
 * Revenue Insights Model - Per-Service Profitability Tracking
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes } from 'sequelize';

const RevenueInsight = sequelize.define('RevenueInsight', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // Doctor/Provider
  doctorId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'doctors',
      key: 'id'
    }
  },
  
  // Service Details
  serviceType: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Type of service provided'
  },
  serviceName: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  cptCode: {
    type: DataTypes.STRING(10),
    comment: 'CPT procedure code'
  },
  icd10Code: {
    type: DataTypes.STRING(10),
    comment: 'Associated diagnosis code'
  },
  
  // Financial Data
  chargedAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'Amount charged to patient/insurance'
  },
  allowedAmount: {
    type: DataTypes.DECIMAL(10, 2),
    comment: 'Insurance allowed amount'
  },
  paidAmount: {
    type: DataTypes.DECIMAL(10, 2),
    comment: 'Actual amount received'
  },
  adjustmentAmount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  writeOffAmount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  
  // Patient Responsibility
  patientCoPayment: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  patientDeductible: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  patientCoInsurance: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  patientPaidAmount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  patientBalanceRemaining: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  
  // Cost Analysis
  serviceCost: {
    type: DataTypes.DECIMAL(10, 2),
    comment: 'Actual cost to provide service'
  },
  profitMargin: {
    type: DataTypes.DECIMAL(10, 2),
    comment: 'Calculated profit/loss'
  },
  profitMarginPercentage: {
    type: DataTypes.DECIMAL(5, 2),
    comment: 'Profit margin as percentage'
  },
  
  // Time Tracking
  serviceDuration: {
    type: DataTypes.INTEGER,
    comment: 'Duration in minutes'
  },
  revenuePerMinute: {
    type: DataTypes.DECIMAL(10, 2)
  },
  
  // Claim Information
  claimId: {
    type: DataTypes.STRING(100),
    index: true
  },
  claimStatus: {
    type: DataTypes.ENUM(
      'pending',
      'submitted',
      'in_review',
      'approved',
      'partially_paid',
      'paid',
      'denied',
      'appealed',
      'written_off'
    ),
    defaultValue: 'pending'
  },
  claimSubmittedDate: {
    type: DataTypes.DATE
  },
  claimProcessedDate: {
    type: DataTypes.DATE
  },
  claimPaidDate: {
    type: DataTypes.DATE
  },
  
  // Denial Management
  denialReason: {
    type: DataTypes.TEXT
  },
  denialCode: {
    type: DataTypes.STRING(50)
  },
  isDenied: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  denialCategory: {
    type: DataTypes.ENUM(
      'missing_information',
      'authorization_required',
      'not_covered',
      'coding_error',
      'timely_filing',
      'duplicate_claim',
      'medical_necessity',
      'other'
    )
  },
  appealStatus: {
    type: DataTypes.ENUM('not_appealed', 'appealed', 'approved_on_appeal', 'denied_on_appeal')
  },
  appealedAt: {
    type: DataTypes.DATE
  },
  
  // Insurance Information
  insuranceCompany: {
    type: DataTypes.STRING(200)
  },
  insurancePlanType: {
    type: DataTypes.STRING(100)
  },
  payerId: {
    type: DataTypes.STRING(50)
  },
  
  // Patient Context
  patientId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  appointmentId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'appointments',
      key: 'id'
    }
  },
  
  // Service Date
  serviceDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    index: true
  },
  
  // Payment Tracking
  paymentMethod: {
    type: DataTypes.STRING(50)
  },
  paymentHistory: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of payment transactions'
  },
  
  // Performance Metrics
  daysToPayment: {
    type: DataTypes.INTEGER,
    comment: 'Number of days from service to payment'
  },
  collectionRate: {
    type: DataTypes.DECIMAL(5, 2),
    comment: 'Percentage collected vs charged'
  },
  
  // Modifiers
  modifiers: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'CPT modifiers applied'
  },
  
  // Units
  units: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    comment: 'Number of units of service'
  },
  
  // Place of Service
  placeOfService: {
    type: DataTypes.STRING(50)
  },
  
  // Notes
  billingNotes: {
    type: DataTypes.TEXT
  },
  
  // Reconciliation
  isReconciled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  reconciledAt: {
    type: DataTypes.DATE
  }
}, {
  tableName: 'revenue_insights',
  timestamps: true,
  indexes: [
    { fields: ['doctorId', 'serviceDate'] },
    { fields: ['claimStatus'] },
    { fields: ['serviceDate'] },
    { fields: ['patientId'] },
    { fields: ['cptCode'] },
    { fields: ['isDenied'] }
  ]
});

export default RevenueInsight;
