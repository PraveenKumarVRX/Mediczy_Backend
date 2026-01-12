import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';

/**
 * MedicalReport Model
 * Stores uploaded medical reports and documents
 */
const MedicalReport = sequelize.define('MedicalReport', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'user_id',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  fileName: {
    type: DataTypes.STRING(500),
    allowNull: false,
    field: 'file_name'
  },
  originalName: {
    type: DataTypes.STRING(500),
    allowNull: false,
    field: 'original_name'
  },
  filePath: {
    type: DataTypes.STRING(1000),
    allowNull: false,
    field: 'file_path'
  },
  fileSize: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'file_size'
  },
  mimeType: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'mime_type'
  },
  reportType: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'report_type',
    comment: 'Type of medical report: lab, radiology, prescription, etc.'
  },
  uploadedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'uploaded_at'
  },
  analyzed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Whether the report has been analyzed by AI'
  },
  analysisData: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'analysis_data',
    comment: 'Extracted data and analysis results'
  }
}, {
  tableName: 'medical_reports',
  timestamps: true,
  createdAt: 'uploadedAt',
  updatedAt: false,
  indexes: [
    {
      fields: ['user_id']
    },
    {
      fields: ['report_type']
    },
    {
      fields: ['uploaded_at']
    }
  ]
});

export default MedicalReport;
