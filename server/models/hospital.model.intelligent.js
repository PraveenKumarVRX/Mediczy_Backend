import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes } from 'sequelize';
import bcrypt from 'bcrypt';
import { hashPasswordIfPlaintext } from '../utils/passwordHashing.js';

/**
 * Hospital Model
 */
const Hospital = sequelize.define('Hospital', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  uid: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    unique: true,
    allowNull: false,
    comment: 'Public-facing unique identifier (UUID)'
  },
  // Unique alphanumeric ID (e.g., H4K7NP)
  unique_id: {
    type: DataTypes.STRING(6),
    unique: true,
    allowNull: true,
    comment: 'Public-facing unique ID with H prefix'
  },
  hospitalName: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'hospital_name'
  },
  registrationNumber: {
    type: DataTypes.STRING(100),
    unique: true,
    field: 'registration_number'
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  phoneNumber: {
    type: DataTypes.STRING(20),
    field: 'phone_number'
  },
  address: {
    type: DataTypes.TEXT
  },
  city: {
    type: DataTypes.STRING(100)
  },
  state: {
    type: DataTypes.STRING(100)
  },
  pincode: {
    type: DataTypes.STRING(10)
  },
  totalBeds: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'total_beds'
  },
  availableBeds: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'available_beds'
  },
  specializations: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  facilities: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  networkType: {
    type: DataTypes.STRING(50),
    field: 'network_type',
    comment: 'preferred, empanelled, non-network'
  },
  cashlessEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'cashless_enabled'
  },
  status: {
    type: DataTypes.STRING(20),
    defaultValue: 'active'
  },
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_verified'
  },
  passwordResetToken: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'password_reset_token'
  },
  passwordResetExpires: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'password_reset_expires'
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  tenantId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'tenant_id',
    comment: 'Link to tenants table — hospital is a tenant'
  }
}, {
  tableName: 'hospitals',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

Hospital.beforeCreate(async (hospital) => {
  if (hospital.password) {
    hospital.password = await hashPasswordIfPlaintext(hospital.password, 10);
  }
  // unique_id is issued by the database (trg_entity_uid_* / generate_entity_uid), never here:
  // CLAUDE.md entity-UID rule 1. Omitting it lets the trigger mint and register it.
});

Hospital.beforeUpdate(async (hospital) => {
  if (hospital.changed('password') && hospital.password) {
    hospital.password = await hashPasswordIfPlaintext(hospital.password, 10);
  }
});

Hospital.prototype.comparePassword = async function(candidatePassword) {
  if (!this.password) {
    return false;
  }
  return await bcrypt.compare(candidatePassword, this.password);
};

export { Hospital };
export default Hospital;
