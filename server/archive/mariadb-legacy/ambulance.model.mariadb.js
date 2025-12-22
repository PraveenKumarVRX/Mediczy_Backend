import { DataTypes } from 'sequelize';
import { sequelize } from '../db/mariadb.js';

const Ambulance = sequelize.define('Ambulance', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // Provider Information
  providerName: {
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
  
  // Vehicle Information
  vehicleNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  vehicleType: {
    type: DataTypes.ENUM('basic', 'advanced', 'air', 'cardiac', 'neonatal'),
    defaultValue: 'basic'
  },
  vehicleModel: {
    type: DataTypes.STRING(100)
  },
  manufacturingYear: {
    type: DataTypes.INTEGER
  },
  
  // Contact Information
  email: {
    type: DataTypes.STRING(255),
    validate: {
      isEmail: true
    }
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  emergencyPhone: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  
  // Base Location
  baseAddress: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  baseCity: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  baseState: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  basePincode: {
    type: DataTypes.STRING(10)
  },
  
  // Current Location (for real-time tracking)
  currentLatitude: {
    type: DataTypes.DECIMAL(10, 8)
  },
  currentLongitude: {
    type: DataTypes.DECIMAL(11, 8)
  },
  lastLocationUpdate: {
    type: DataTypes.DATE
  },
  
  // Service Coverage
  serviceRadius: {
    type: DataTypes.INTEGER, // in kilometers
    defaultValue: 50
  },
  serviceCities: {
    type: DataTypes.TEXT,
    get() {
      const value = this.getDataValue('serviceCities');
      return value ? JSON.parse(value) : [];
    },
    set(value) {
      this.setDataValue('serviceCities', JSON.stringify(value || []));
    }
  },
  
  // Equipment & Facilities
  equipment: {
    type: DataTypes.TEXT,
    get() {
      const value = this.getDataValue('equipment');
      return value ? JSON.parse(value) : [];
    },
    set(value) {
      this.setDataValue('equipment', JSON.stringify(value || []));
    }
    // Examples: oxygen cylinder, ventilator, defibrillator, cardiac monitor, etc.
  },
  hasOxygenSupport: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  hasVentilator: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  hasDefibrillator: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  hasICU: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  
  // Staff Information
  driverName: {
    type: DataTypes.STRING(200)
  },
  driverPhone: {
    type: DataTypes.STRING(20)
  },
  driverLicenseNumber: {
    type: DataTypes.STRING(100)
  },
  hasParamedic: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  paramedicName: {
    type: DataTypes.STRING(200)
  },
  paramedicPhone: {
    type: DataTypes.STRING(20)
  },
  
  // Pricing
  baseCharge: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 500.00
  },
  perKmCharge: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 15.00
  },
  
  // Availability & Status
  isAvailable: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  currentStatus: {
    type: DataTypes.ENUM('available', 'on-duty', 'maintenance', 'unavailable'),
    defaultValue: 'available'
  },
  
  // Availability Schedule
  availability24x7: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
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
  
  // Verification & Compliance
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  licenseNumber: {
    type: DataTypes.STRING(100)
  },
  licenseExpiryDate: {
    type: DataTypes.DATEONLY
  },
  insuranceNumber: {
    type: DataTypes.STRING(100)
  },
  insuranceExpiryDate: {
    type: DataTypes.DATEONLY
  },
  
  // Rating & Reviews
  rating: {
    type: DataTypes.DECIMAL(3, 2),
    defaultValue: 0.00,
    validate: {
      min: 0,
      max: 5
    }
  },
  totalTrips: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  totalReviews: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  
  // Hospital Affiliations
  affiliatedHospitals: {
    type: DataTypes.TEXT,
    get() {
      const value = this.getDataValue('affiliatedHospitals');
      return value ? JSON.parse(value) : [];
    },
    set(value) {
      this.setDataValue('affiliatedHospitals', JSON.stringify(value || []));
    }
  },
  
  // Images & Documents
  vehicleImage: {
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
  specialFeatures: {
    type: DataTypes.TEXT
  }
}, {
  timestamps: true,
  tableName: 'ambulances',
  indexes: [
    { fields: ['vehicleNumber'] },
    { fields: ['baseCity'] },
    { fields: ['isAvailable'] },
    { fields: ['currentStatus'] }
  ]
});

export default Ambulance;
