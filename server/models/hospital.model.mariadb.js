import { DataTypes } from 'sequelize';
import { sequelize } from '../db/mariadb.js';

const Hospital = sequelize.define('Hospital', {
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
    unique: true,
    allowNull: false
  },
  hospitalType: {
    type: DataTypes.ENUM('government', 'private', 'trust', 'corporate'),
    defaultValue: 'private'
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
  website: {
    type: DataTypes.STRING(255)
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
  
  // Location
  latitude: {
    type: DataTypes.DECIMAL(10, 8)
  },
  longitude: {
    type: DataTypes.DECIMAL(11, 8)
  },
  
  // Facilities
  numberOfBeds: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  numberOfICUBeds: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  hasEmergency: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  hasAmbulance: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  hasPharmacy: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  hasLab: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  
  // Specializations (stored as JSON)
  specializations: {
    type: DataTypes.TEXT,
    get() {
      const value = this.getDataValue('specializations');
      return value ? JSON.parse(value) : [];
    },
    set(value) {
      this.setDataValue('specializations', JSON.stringify(value || []));
    }
  },
  
  // Services (stored as JSON)
  services: {
    type: DataTypes.TEXT,
    get() {
      const value = this.getDataValue('services');
      return value ? JSON.parse(value) : [];
    },
    set(value) {
      this.setDataValue('services', JSON.stringify(value || []));
    }
  },
  
  // Accreditations
  accreditations: {
    type: DataTypes.TEXT,
    get() {
      const value = this.getDataValue('accreditations');
      return value ? JSON.parse(value) : [];
    },
    set(value) {
      this.setDataValue('accreditations', JSON.stringify(value || []));
    }
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
  
  // Operating Hours
  operatingHours: {
    type: DataTypes.TEXT,
    get() {
      const value = this.getDataValue('operatingHours');
      return value ? JSON.parse(value) : { open: '00:00', close: '23:59', is24x7: true };
    },
    set(value) {
      this.setDataValue('operatingHours', JSON.stringify(value));
    }
  },
  
  // Insurance
  insuranceAccepted: {
    type: DataTypes.TEXT,
    get() {
      const value = this.getDataValue('insuranceAccepted');
      return value ? JSON.parse(value) : [];
    },
    set(value) {
      this.setDataValue('insuranceAccepted', JSON.stringify(value || []));
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
  establishedYear: {
    type: DataTypes.INTEGER
  }
}, {
  timestamps: true,
  tableName: 'hospitals',
  indexes: [
    { fields: ['email'] },
    { fields: ['registrationNumber'] },
    { fields: ['city'] },
    { fields: ['isActive'] },
    { fields: ['isVerified'] }
  ]
});

export default Hospital;
