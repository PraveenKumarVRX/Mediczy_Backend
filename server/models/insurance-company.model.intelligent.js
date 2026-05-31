/**
 * Insurance Company & Corporate Models
 * Insurance companies manage policies, corporates purchase them
 */

import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import bcrypt from 'bcrypt';

// ============================================================================
// INSURANCE COMPANY MODEL
// ============================================================================

export const InsuranceCompany = sequelize.define('InsuranceCompany', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // Company Details
  companyName: {
    type: DataTypes.STRING(200),
    allowNull: false,
    unique: true
  },
  companyCode: {
    type: DataTypes.STRING(50),
    unique: true,
    comment: 'Short code for company (e.g., HDFC, ICICI, STAR)'
  },
  
  // Authentication
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
  
  // Contact Information
  phone: {
    type: DataTypes.STRING(20)
  },
  website: {
    type: DataTypes.STRING(255)
  },
  
  // Address
  address: {
    type: DataTypes.JSONB,
    defaultValue: {
      street: '',
      city: '',
      state: '',
      pincode: '',
      country: 'India'
    }
  },
  
  // Regulatory Information
  irdaiRegistrationNumber: {
    type: DataTypes.STRING(100),
    unique: true,
    comment: 'IRDAI registration number'
  },
  gstin: {
    type: DataTypes.STRING(15),
    comment: 'GST identification number'
  },
  
  // Company Profile
  logo: {
    type: DataTypes.TEXT,
    comment: 'Company logo URL'
  },
  description: {
    type: DataTypes.TEXT
  },
  
  // Business Configuration
  supportedPolicyTypes: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: ['individual', 'family_floater', 'group', 'corporate']
  },
  
  // Network & Partners
  networkHospitals: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'List of network hospital IDs'
  },
  tpaPartners: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Third Party Administrator partners'
  },
  
  // Status
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Admin verification status'
  },
  
  // Contact Person
  contactPerson: {
    type: DataTypes.JSONB,
    defaultValue: {
      name: '',
      designation: '',
      email: '',
      phone: ''
    }
  },
  
  // Settings
  settings: {
    type: DataTypes.JSONB,
    defaultValue: {
      claimProcessingTime: '7-10 days',
      cashlessEnabled: true,
      minPolicyAmount: 100000,
      maxPolicyAmount: 10000000
    }
  },
  
  // Metadata
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
}, {
  tableName: 'insurance_companies',
  timestamps: true,
  hooks: {
    beforeCreate: async (company) => {
      if (company.password) {
        company.password = await bcrypt.hash(company.password, 10);
      }
    },
    beforeUpdate: async (company) => {
      if (company.changed('password')) {
        company.password = await bcrypt.hash(company.password, 10);
      }
    }
  },
  indexes: [
    { fields: ['email'], unique: true },
    { fields: ['companyCode'], unique: true },
    { fields: ['irdaiRegistrationNumber'], unique: true },
    { fields: ['isActive'] }
  ]
});

// Instance methods
InsuranceCompany.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

InsuranceCompany.prototype.toJSON = function() {
  const values = { ...this.get() };
  delete values.password;
  return values;
};

// ============================================================================
// CORPORATE MODEL
// ============================================================================

export const Corporate = sequelize.define('Corporate', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // Corporate Details
  corporateName: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  corporateCode: {
    type: DataTypes.STRING(50),
    unique: true
  },
  
  // Authentication
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
  
  // Contact Information
  phone: {
    type: DataTypes.STRING(20)
  },
  website: {
    type: DataTypes.STRING(255)
  },
  
  // Address
  address: {
    type: DataTypes.JSONB,
    defaultValue: {
      street: '',
      city: '',
      state: '',
      pincode: '',
      country: 'India'
    }
  },
  
  // Business Information
  industry: {
    type: DataTypes.STRING(100),
    comment: 'Industry sector (IT, Manufacturing, Healthcare, etc.)'
  },
  employeeCount: {
    type: DataTypes.INTEGER,
    comment: 'Total number of employees'
  },
  
  // Registration Details
  cin: {
    type: DataTypes.STRING(21),
    comment: 'Corporate Identification Number'
  },
  gstin: {
    type: DataTypes.STRING(15),
    comment: 'GST identification number'
  },
  pan: {
    type: DataTypes.STRING(10),
    comment: 'PAN number'
  },
  
  // HR Contact
  hrContact: {
    type: DataTypes.JSONB,
    defaultValue: {
      name: '',
      designation: '',
      email: '',
      phone: ''
    }
  },
  
  // Status
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  
  // Password Reset
  passwordResetToken: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  passwordResetExpires: {
    type: DataTypes.DATE,
    allowNull: true
  },
  
  // Metadata
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
}, {
  tableName: 'corporates',
  timestamps: true,
  hooks: {
    beforeCreate: async (corporate) => {
      if (corporate.password) {
        corporate.password = await bcrypt.hash(corporate.password, 10);
      }
    },
    beforeUpdate: async (corporate) => {
      if (corporate.changed('password')) {
        corporate.password = await bcrypt.hash(corporate.password, 10);
      }
    }
  },
  indexes: [
    { fields: ['email'], unique: true },
    { fields: ['corporateCode'], unique: true },
    { fields: ['isActive'] }
  ]
});

// Instance methods
Corporate.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

Corporate.prototype.toJSON = function() {
  const values = { ...this.get() };
  delete values.password;
  return values;
};

// ============================================================================
// CORPORATE EMPLOYEE MODEL
// ============================================================================

export const CorporateEmployee = sequelize.define('CorporateEmployee', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  corporateId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'corporate_id',
    references: {
      model: 'corporates',
      key: 'id'
    }
  },
  
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Link to users table'
  },
  
  // Employee Details
  employeeId: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Corporate employee ID'
  },
  
  department: {
    type: DataTypes.STRING(100)
  },
  designation: {
    type: DataTypes.STRING(100)
  },
  
  // Employment Status
  joiningDate: {
    type: DataTypes.DATE
  },
  exitDate: {
    type: DataTypes.DATE
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  
  // Dependent Information
  dependents: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'List of family members covered under policy'
  },
  
  // Metadata
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
}, {
  tableName: 'corporate_employees',
  timestamps: true,
  indexes: [
    { fields: ['corporate_id'] },
    { fields: ['userId'] },
    { fields: ['employeeId'] },
    { fields: ['isActive'] },
    { 
      fields: ['corporate_id', 'employeeId'],
      unique: true,
      name: 'unique_corporate_employee'
    }
  ]
});

// ============================================================================
// ASSOCIATIONS
// ============================================================================

// Insurance Company has many policies - TEMPORARILY DISABLED
// InsuranceCompany.hasMany(sequelize.models.InsurancePolicy || {}, {
//   foreignKey: 'insuranceCompanyId',
//   as: 'policies'
// });

// Corporate has many employees - TEMPORARILY DISABLED
// Corporate.hasMany(CorporateEmployee, {
//   foreignKey: 'corporateId',
//   as: 'employees'
// });

CorporateEmployee.belongsTo(Corporate, {
  foreignKey: 'corporateId',
  as: 'corporate'
});

// Corporate has many policies - TEMPORARILY DISABLED
// Corporate.hasMany(sequelize.models.InsurancePolicy || {}, {
//   foreignKey: 'corporateId',
//   as: 'policies'
// });

export default {
  InsuranceCompany,
  Corporate,
  CorporateEmployee
};
