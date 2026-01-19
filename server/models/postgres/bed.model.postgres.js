import { DataTypes } from 'sequelize';
import { JWT_CONFIG } from '../../config/auth.config.js';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const Bed = sequelize.define('Bed', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    bedNumber: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'bed_number'
    },
    ward: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    bedType: {
      type: DataTypes.STRING(50),
      field: 'bed_type',
      comment: 'ICU, General, Private, Semi-Private, etc.'
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'available',
      validate: {
        isIn: [['available', 'occupied', 'maintenance', 'reserved']]
      }
    },
    patientId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'patient_id',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    organizationId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'organization_id'
    },
    assignedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'assigned_at'
    },
    releasedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'released_at'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'beds',
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
        fields: ['status']
      },
      {
        fields: ['bed_number', 'organization_id'],
        unique: true
      }
    ]
  });

export default Bed;
