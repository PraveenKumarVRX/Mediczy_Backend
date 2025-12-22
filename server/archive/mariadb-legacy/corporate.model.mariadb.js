import { DataTypes } from 'sequelize';
import { sequelize } from '../db/mariadb.js';

const Corporate = sequelize.define('Corporate', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  companyName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  contactPerson: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  phoneNumber: {
    type: DataTypes.STRING,
    allowNull: false
  },
  alternatePhone: {
    type: DataTypes.STRING
  },
  
  // Company Details
  industry: {
    type: DataTypes.STRING
  },
  employeeCount: {
    type: DataTypes.INTEGER
  },
  gstNumber: {
    type: DataTypes.STRING
  },
  panNumber: {
    type: DataTypes.STRING
  },
  
  // Address
  address: {
    type: DataTypes.TEXT,
    get() {
      const rawValue = this.getDataValue('address');
      return rawValue ? JSON.parse(rawValue) : {};
    },
    set(value) {
      this.setDataValue('address', JSON.stringify(value || {}));
    }
  },
  
  // Package Details
  packageType: {
    type: DataTypes.ENUM('Basic', 'Standard', 'Premium', 'Enterprise', 'Custom'),
    defaultValue: 'Standard'
  },
  packageStartDate: {
    type: DataTypes.DATE
  },
  packageEndDate: {
    type: DataTypes.DATE
  },
  packageAmount: {
    type: DataTypes.DECIMAL(10, 2)
  },
  
  // Services
  services: {
    type: DataTypes.TEXT,
    get() {
      const rawValue = this.getDataValue('services');
      return rawValue ? JSON.parse(rawValue) : [];
    },
    set(value) {
      this.setDataValue('services', JSON.stringify(value || []));
    }
  },
  
  // Contract
  contractDocument: {
    type: DataTypes.STRING
  },
  
  // Status
  status: {
    type: DataTypes.ENUM('Active', 'Inactive', 'Suspended', 'Pending'),
    defaultValue: 'Pending'
  },
  
  // CRM Fields
  leadSource: {
    type: DataTypes.STRING
  },
  salesRep: {
    type: DataTypes.STRING
  },
  notes: {
    type: DataTypes.TEXT
  },
  
  // Billing
  billingCycle: {
    type: DataTypes.ENUM('Monthly', 'Quarterly', 'Yearly'),
    defaultValue: 'Yearly'
  },
  paymentMethod: {
    type: DataTypes.STRING
  },
  
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  timestamps: true,
  tableName: 'corporates'
});

export default Corporate;
