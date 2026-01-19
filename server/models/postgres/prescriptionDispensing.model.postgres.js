import { DataTypes } from 'sequelize';
import { JWT_CONFIG } from '../../config/auth.config.js';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const PrescriptionDispensing = sequelize.define('PrescriptionDispensing', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  dispensingNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'dispensing_number'
  },
  prescriptionId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'prescription_id',
    references: {
      model: 'prescriptions',
      key: 'id'
    }
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
  medicineId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'medicine_id',
    references: {
      model: 'pharmacy_inventory',
      key: 'id'
    }
  },
  dosage: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  frequency: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Once daily, Twice daily, etc.'
  },
  duration: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: '7 days, 14 days, etc.'
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  dispensed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  dispensedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'dispensed_at'
  },
  dispensedBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'dispensed_by',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  organizationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'organization_id'
  }
}, {
  tableName: 'prescription_dispensing',
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
      fields: ['medicine_id']
    },
    {
      fields: ['dispensing_number'],
      unique: true
    },
    {
      fields: ['dispensed']
    }
  ]
});

export default PrescriptionDispensing;
