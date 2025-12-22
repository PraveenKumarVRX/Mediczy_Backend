import { DataTypes } from 'sequelize';
import { sequelize } from '../db/mariadb.js';

const HomecareProvider = sequelize.define('HomecareProvider', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // Basic Information
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  registrationNumber: {
    type: DataTypes.STRING(100),
    unique: true
  },
  providerType: {
    type: DataTypes.ENUM('individual', 'agency', 'organization'),
    defaultValue: 'agency'
  },
  
  // Contact Information
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  alternatePhone: {
    type: DataTypes.STRING(20)
  },
  
  // Address
  address: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  city: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  state: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  pincode: {
    type: DataTypes.STRING(10),
    allowNull: false
  },
  country: {
    type: DataTypes.STRING(100),
    defaultValue: 'India'
  },
  
  // Service Areas (cities/localities covered)
  serviceAreas: {
    type: DataTypes.TEXT,
    get() {
      const value = this.getDataValue('serviceAreas');
      return value ? JSON.parse(value) : [];
    },
    set(value) {
      this.setDataValue('serviceAreas', JSON.stringify(value || []));
    }
  },
  
  // Services Offered
  services: {
    type: DataTypes.TEXT,
    get() {
      const value = this.getDataValue('services');
      return value ? JSON.parse(value) : [];
    },
    set(value) {
      this.setDataValue('services', JSON.stringify(value || []));
    }
    // Examples: nursing care, physiotherapy, elderly care, post-surgery care, etc.
  },
  
  // Staff Information
  numberOfNurses: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  numberOfPhysiotherapists: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  numberOfCaregivers: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  
  // Certifications
  certifications: {
    type: DataTypes.TEXT,
    get() {
      const value = this.getDataValue('certifications');
      return value ? JSON.parse(value) : [];
    },
    set(value) {
      this.setDataValue('certifications', JSON.stringify(value || []));
    }
  },
  
  // Availability
  availability: {
    type: DataTypes.ENUM('24x7', 'daytime', 'custom'),
    defaultValue: '24x7'
  },
  operatingHours: {
    type: DataTypes.TEXT,
    get() {
      const value = this.getDataValue('operatingHours');
      return value ? JSON.parse(value) : {};
    },
    set(value) {
      this.setDataValue('operatingHours', JSON.stringify(value));
    }
  },
  
  // Pricing
  hourlyRate: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  dailyRate: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  monthlyRate: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  
  // Contact Person
  contactPersonName: {
    type: DataTypes.STRING(200)
  },
  contactPersonPhone: {
    type: DataTypes.STRING(20)
  },
  contactPersonEmail: {
    type: DataTypes.STRING(255)
  },
  
  // Equipment Available
  equipmentAvailable: {
    type: DataTypes.TEXT,
    get() {
      const value = this.getDataValue('equipmentAvailable');
      return value ? JSON.parse(value) : [];
    },
    set(value) {
      this.setDataValue('equipmentAvailable', JSON.stringify(value || []));
    }
    // Examples: wheelchair, oxygen concentrator, hospital bed, etc.
  },
  
  // Emergency Services
  providesEmergencyCare: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
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
  
  // Rating
  rating: {
    type: DataTypes.DECIMAL(3, 2),
    defaultValue: 0.00,
    validate: {
      min: 0,
      max: 5
    }
  },
  totalReviews: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  
  // Images
  logo: {
    type: DataTypes.STRING(500)
  },
  images: {
    type: DataTypes.TEXT,
    get() {
      const value = this.getDataValue('images');
      return value ? JSON.parse(value) : [];
    },
    set(value) {
      this.setDataValue('images', JSON.stringify(value || []));
    }
  },
  
  // Additional Info
  description: {
    type: DataTypes.TEXT
  },
  yearsOfExperience: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  timestamps: true,
  tableName: 'homecare_providers',
  indexes: [
    { fields: ['email'] },
    { fields: ['city'] },
    { fields: ['isActive'] }
  ]
});

export default HomecareProvider;
