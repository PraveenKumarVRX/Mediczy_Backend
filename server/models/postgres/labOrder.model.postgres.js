import { DataTypes } from 'sequelize';
import { JWT_CONFIG } from '../../config/auth.config.js';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const LabOrder = sequelize.define('LabOrder', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    orderNumber: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      field: 'order_number'
    },
    patientId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'patient_id',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    doctorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'doctor_id',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    testType: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'test_type'
    },
    testCategory: {
      type: DataTypes.STRING(50),
      field: 'test_category',
      comment: 'Blood, Urine, X-Ray, CT Scan, MRI, etc.'
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'pending',
      validate: {
        isIn: [['pending', 'sample_collected', 'in_progress', 'completed', 'cancelled']]
      }
    },
    priority: {
      type: DataTypes.STRING(20),
      defaultValue: 'normal',
      validate: {
        isIn: [['urgent', 'normal', 'routine']]
      }
    },
    sampleCollectedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'sample_collected_at'
    },
    results: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    organizationId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'organization_id'
    }
  }, {
    tableName: 'lab_orders',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['organization_id']
      },
      {
        fields: ['patient_id']
      },
      {
        fields: ['doctor_id']
      },
      {
        fields: ['status']
      },
      {
        fields: ['order_number'],
        unique: true
      }
    ]
  });

export default LabOrder;
