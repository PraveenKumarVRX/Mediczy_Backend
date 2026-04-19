/**
import { JWT_CONFIG } from '../../config/auth.config.js';
 * PostgreSQL Report Model
 * Stores patient medical reports (lab results, imaging, prescriptions, etc.)
 */

import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const Report = sequelize.define('Report', {
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
    index: true
  },

  // Family Member (optional — null means report belongs to the primary user)
  familyMemberId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'family_member_id',
    references: {
      model: 'family_members',
      key: 'id'
    },
    onDelete: 'SET NULL',
    index: true,
    comment: 'Links report to a family member; null = primary account holder'
  },

  // File Information
  fileName: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Original file name'
  },

  filePath: {
    type: DataTypes.STRING(500),
    allowNull: false,
    comment: 'Path to stored file (local or S3 URL)'
  },

  fileUrl: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Public URL for downloading file'
  },

  fileSize: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'File size in bytes'
  },

  mimeType: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'MIME type (application/pdf, image/jpeg, etc.)'
  },

  // Report Classification
  reportType: {
    type: DataTypes.ENUM('lab', 'imaging', 'prescription', 'general'),
    allowNull: false,
    defaultValue: 'general',
    index: true,
    comment: 'Type of medical report'
  },

  // Report Metadata
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'User-provided description or notes'
  },

  testName: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Name of the test/procedure (e.g., "Blood Test", "CT Scan")'
  },

  labName: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Name of the laboratory or imaging center'
  },

  reportDate: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Date when the test/report was created'
  },

  // Status Tracking
  status: {
    type: DataTypes.ENUM('active', 'archived', 'deleted', 'pending_review'),
    allowNull: false,
    defaultValue: 'active',
    index: true,
    comment: 'Status of the report'
  },

  // AI Analysis (Optional)
  aiAnalysis: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'AI-generated analysis/insights about the report'
  },

  analysisStatus: {
    type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed'),
    allowNull: true,
    defaultValue: 'pending',
    comment: 'Status of AI analysis'
  },

  // Sharing & Permissions
  isPublic: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Whether report is shared publicly'
  },

  sharedWith: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Array of user IDs with whom report is shared'
  },

  // Additional Metadata
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Additional metadata (tags, source, etc.)'
  },

  // Timestamps
  uploadedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'When the report was uploaded'
  },

  archivedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When the report was archived'
  },

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
  tableName: 'reports',
  timestamps: true,
  indexes: [
    {
      fields: ['userId', 'uploadedAt'],
      name: 'idx_reports_user_date'
    },
    {
      fields: ['userId', 'reportType'],
      name: 'idx_reports_user_type'
    },
    {
      fields: ['userId', 'family_member_id'],
      name: 'idx_reports_user_family'
    },
    {
      fields: ['organization_id', 'userId'],
      name: 'idx_reports_org_user'
    },
    {
      fields: ['status'],
      name: 'idx_reports_status'
    },
    {
      fields: ['uploadedAt'],
      name: 'idx_reports_uploaded_at'
    }
  ]
});

export default Report;
