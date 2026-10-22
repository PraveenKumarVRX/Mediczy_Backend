import { corporateDisplayName } from '../../utils/corporate-data-quality.js';
import { DataTypes } from 'sequelize';
import bcrypt from 'bcrypt';
import { JWT_CONFIG } from '../../config/auth.config.js';
import postgresSequelize from '../../db/postgres-sequelize.js';
import { hashPasswordIfPlaintext } from '../../utils/passwordHashing.js';
import { generateUniqueIdForModel } from '../../utils/uniqueIdGenerator.js';

/**
 * Corporate Model (PostgreSQL)
 * Represents company/organization accounts with B2B healthcare packages
 * 
 * Features:
 * - JSONB for services and address with GIN indexes
 * - Package management with date ranges
 * - Contract tracking
 * - Status workflow
 */

const Corporate = postgresSequelize.define('Corporate', {
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
  companyName: {
    type: DataTypes.STRING(255),
    set(value) { this.setDataValue('companyName',typeof value === 'string' ? corporateDisplayName(value) : value); },
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  contactPerson: {
    type: DataTypes.STRING(255),
    allowNull: false
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
    allowNull: true,
    comment: 'Hashed password for corporate admin login'
  },
  phoneNumber: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  alternatePhone: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  industry: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  employeeCount: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 0
    }
  },
  gstNumber: {
    type: DataTypes.STRING(50),
    allowNull: true,
    unique: true
  },
  panNumber: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  // JSONB for complex address
  address: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    comment: 'Structure: {street, city, state, zipCode, country, coordinates}'
  },
  packageType: {
    type: DataTypes.STRING(50),
    defaultValue: 'Standard',
    validate: {
      isIn: [['Basic', 'Standard', 'Premium', 'Enterprise', 'Custom']]
    }
  },
  packageStartDate: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  packageEndDate: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  packageAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    validate: {
      min: 0
    }
  },
  // JSONB for services array
  services: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of services: [{name, description, price, isActive}]'
  },
  contractDocument: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Path to contract document'
  },
  status: {
    type: DataTypes.STRING(50),
    defaultValue: 'Pending',
    validate: {
      isIn: [['Pending', 'Active', 'Inactive', 'Suspended', 'Cancelled']]
    }
  },
  leadSource: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'How this lead was acquired'
  },
  assignedTo: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Sales/Account Manager ID'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // JSONB for additional metadata
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional corporate data: {billingInfo, preferences, integrations}'
  },
  // Password Reset fields
  passwordResetToken: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Hashed password reset token'
  },
  passwordResetExpires: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Expiry time for password reset token'
  },

  // === FIELDS ADDED VIA SQL MIGRATIONS ===
  tenantId: { type: DataTypes.INTEGER, allowNull: true, field: 'tenant_id' },
  uniqueId: { type: DataTypes.STRING(20), allowNull: true, field: 'unique_id' },
  onboardedBy: { type: DataTypes.STRING, allowNull: true, field: 'onboarded_by' },
  onboardedById: { type: DataTypes.INTEGER, allowNull: true, field: 'onboarded_by_id' },
  aggregatorId: { type: DataTypes.INTEGER, allowNull: true, field: 'aggregator_id' },
  aggregatorType: { type: DataTypes.STRING, allowNull: true, field: 'aggregator_type' },

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
  tableName: 'corporates',
  timestamps: true,
  hooks: {
    beforeCreate: async (corporate) => {
      if (!corporate.uniqueId) {
        corporate.uniqueId = await generateUniqueIdForModel(Corporate, 'corporate', 'uniqueId');
      }
      if (corporate.password) {
        corporate.password = await hashPasswordIfPlaintext(corporate.password, 10);
      }
    },
    beforeUpdate: async (corporate) => {
      if (corporate.changed('password') && corporate.password) {
        corporate.password = await hashPasswordIfPlaintext(corporate.password, 10);
      }
    }
  },
  indexes: [
    {
      unique: true,
      fields: ['email']
    },
    {
      fields: ['companyName']
    },
    {
      fields: ['status']
    },
    {
      fields: ['packageType']
    },
    {
      fields: ['assignedTo']
    },
    {
      using: 'gin',
      fields: ['services'],
      name: 'idx_corporates_services_gin'
    },
    {
      using: 'gin',
      fields: ['address'],
      name: 'idx_corporates_address_gin'
    },
    {
      using: 'gin',
      fields: ['metadata'],
      name: 'idx_corporates_metadata_gin'
    }
  ]
});

// Instance methods
Corporate.prototype.isActive = function() {
  return this.status === 'Active';
};

Corporate.prototype.comparePassword = async function(candidatePassword) {
  if (!this.password) {
    return false;
  }
  return await bcrypt.compare(candidatePassword, this.password);
};

Corporate.prototype.isPackageValid = function() {
  if (!this.packageEndDate) return false;
  return new Date(this.packageEndDate) >= new Date();
};

Corporate.prototype.toJSON = function() {
  const values = { ...this.get() };
  // Don't expose internal fields
  delete values.notes;
  return values;
};

// Static methods
Corporate.findByEmail = async function(email) {
  return await this.findOne({
    where: { email: email.toLowerCase() }
  });
};

Corporate.findActiveCompanies = async function() {
  return await this.findAll({
    where: { 
      status: 'Active',
      packageEndDate: {
        [postgresSequelize.Sequelize.Op.gte]: new Date()
      }
    },
    order: [['companyName', 'ASC']]
  });
};

Corporate.findByIndustry = async function(industry) {
  return await this.findAll({
    where: { industry },
    order: [['companyName', 'ASC']]
  });
};

Corporate.findExpiringPackages = async function(daysFromNow = 30) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + daysFromNow);
  
  return await this.findAll({
    where: {
      status: 'Active',
      packageEndDate: {
        [postgresSequelize.Sequelize.Op.between]: [new Date(), futureDate]
      }
    },
    order: [['packageEndDate', 'ASC']]
  });
};

export default Corporate;
