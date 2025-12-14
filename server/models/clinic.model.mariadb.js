import { DataTypes } from 'sequelize';
import { sequelize } from '../db/mariadb.js';

const Clinic = sequelize.define('Clinic', {
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
  clinicType: {
    type: DataTypes.ENUM('general', 'specialty', 'polyclinic', 'daycare'),
    defaultValue: 'general'
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
  
  // Location
  latitude: {
    type: DataTypes.DECIMAL(10, 8)
  },
  longitude: {
    type: DataTypes.DECIMAL(11, 8)
  },
  
  // Facilities
  numberOfRooms: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  hasPharmacy: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  hasLab: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  
  // Specializations
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
  
  // Services
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
  
  // Owner/Doctor Information
  ownerName: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  ownerPhone: {
    type: DataTypes.STRING(20)
  },
  ownerEmail: {
    type: DataTypes.STRING(255)
  },
  
  // Operating Hours
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
  
  // Consultation Fee Range
  minConsultationFee: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  maxConsultationFee: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
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
  
  description: {
    type: DataTypes.TEXT
  }
}, {
  timestamps: true,
  tableName: 'clinics',
  indexes: [
    { fields: ['email'] },
    { fields: ['registrationNumber'] },
    { fields: ['city'] },
    { fields: ['isActive'] }
  ]
});

export default Clinic;
