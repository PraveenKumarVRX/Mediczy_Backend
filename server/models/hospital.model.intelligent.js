import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes } from 'sequelize';
import bcrypt from 'bcrypt';

/**
 * Hospital Model
 */
const Hospital = sequelize.define('Hospital', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
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
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
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
    const salt = await bcrypt.genSalt(10);
    hospital.password = await bcrypt.hash(hospital.password, salt);
  }
});

Hospital.beforeUpdate(async (hospital) => {
  if (hospital.changed('password') && hospital.password) {
    const salt = await bcrypt.genSalt(10);
    hospital.password = await bcrypt.hash(hospital.password, salt);
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
