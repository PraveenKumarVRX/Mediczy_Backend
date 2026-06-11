import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes } from 'sequelize';
import bcrypt from 'bcrypt';
import { hashPasswordIfPlaintext } from '../utils/passwordHashing.js';

/**
 * TPA (Third Party Administrator) Model
 * Manages TPAs for insurance claim processing
 */
const TPA = sequelize.define('TPA', {
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
  tpaName: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'tpa_name'
  },
  contactPersonName: {
    type: DataTypes.STRING(200),
    allowNull: false,
    field: 'contact_person_name'
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
  irdaiLicenseNumber: {
    type: DataTypes.STRING(100),
    unique: true,
    field: 'irdai_license_number'
  },
  panNumber: {
    type: DataTypes.STRING(10),
    field: 'pan_number'
  },
  gstin: {
    type: DataTypes.STRING(15)
  },
  officeAddress: {
    type: DataTypes.TEXT,
    field: 'office_address'
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
  networkHospitals: {
    type: DataTypes.JSONB,
    defaultValue: [],
    field: 'network_hospitals'
  },
  serviceAreas: {
    type: DataTypes.JSONB,
    defaultValue: [],
    field: 'service_areas'
  },
  claimsProcessed: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'claims_processed'
  },
  averageSettlementTime: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'average_settlement_time',
    comment: 'In hours'
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
  tableName: 'tpas',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

TPA.beforeCreate(async (tpa) => {
  if (tpa.password) {
    tpa.password = await hashPasswordIfPlaintext(tpa.password, 10);
  }
});

TPA.beforeUpdate(async (tpa) => {
  if (tpa.changed('password') && tpa.password) {
    tpa.password = await hashPasswordIfPlaintext(tpa.password, 10);
  }
});

TPA.prototype.comparePassword = async function(candidatePassword) {
  if (!this.password) {
    return false;
  }
  return await bcrypt.compare(candidatePassword, this.password);
};

export { TPA };
export default TPA;
