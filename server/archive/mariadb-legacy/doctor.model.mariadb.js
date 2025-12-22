import { DataTypes } from 'sequelize';
import { sequelize } from '../db/mariadb.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// Default weekly schedule helper
const getDefaultWeeklySchedule = () => ({
  monday: {
    isOff: false,
    online: { enabled: true, startTime: '09:00', endTime: '13:00' },
    inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' }
  },
  tuesday: {
    isOff: false,
    online: { enabled: true, startTime: '09:00', endTime: '13:00' },
    inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' }
  },
  wednesday: {
    isOff: false,
    online: { enabled: true, startTime: '09:00', endTime: '13:00' },
    inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' }
  },
  thursday: {
    isOff: false,
    online: { enabled: true, startTime: '09:00', endTime: '13:00' },
    inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' }
  },
  friday: {
    isOff: false,
    online: { enabled: true, startTime: '09:00', endTime: '13:00' },
    inPerson: { enabled: true, startTime: '14:00', endTime: '18:00' }
  },
  saturday: {
    isOff: false,
    online: { enabled: true, startTime: '09:00', endTime: '13:00' },
    inPerson: { enabled: false, startTime: '', endTime: '' }
  },
  sunday: {
    isOff: true,
    online: { enabled: false, startTime: '', endTime: '' },
    inPerson: { enabled: false, startTime: '', endTime: '' }
  }
});

const Doctor = sequelize.define('Doctor', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  prefix: {
    type: DataTypes.ENUM('Dr', 'Mr', 'Ms', 'Mrs', 'Prof'),
    defaultValue: 'Dr',
    allowNull: false
  },
  firstName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  lastName: {
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
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  phoneNumber: {
    type: DataTypes.STRING,
    allowNull: false
  },
  profileImage: {
    type: DataTypes.STRING,
    allowNull: true
  },
  specialization: {
    type: DataTypes.ENUM(
      'General Practitioner',
      'Cardiologist', 
      'Dermatologist',
      'Pediatrician',
      'Orthopedist',
      'Neurologist',
      'Psychiatrist',
      'Psychologist',
      'Gynecologist',
      'ENT Specialist',
      'Ophthalmologist',
      'Rheumatologist',
      'Pulmonologist',
      'Physiotherapist',
      'Occupational Therapist',
      'Nutritionist',
      'Dietician',
      'Nephrologist',
      'Urologist',
      'Diabetologist',
      'Intensivist',
      'Cardio Thoracic Surgeon',
      'Vascular Surgeon',
      'Neuro Surgeon',
      'Cardio Vascular Surgeon',
      'Gastroenterologist',
      'Gastro Surgeon',
      'General Surgeon',
      'Proctologist',
      'Podiatrician',
      'Dentist',
      'Endocrinologist',
      'Oncologist',
      'Other'
    ),
    allowNull: false
  },
  qualification: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  experience: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  registrationNumber: {
    type: DataTypes.STRING,
    allowNull: true
  },
  clinicAddress: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  consultationFees: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  availableSlots: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  reviews: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  averageRating: {
    type: DataTypes.DECIMAL(3, 2),
    allowNull: true,
    defaultValue: 0
  },
  totalReviews: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0
  },
  expertise: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  languages: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  about: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  awards: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  publications: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  isAvailable: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  isOnline: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  lastActive: {
    type: DataTypes.DATE,
    allowNull: true
  },
  // OAuth2 Fields
  googleId: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true
  },
  facebookId: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true
  },
  oauthProvider: {
    type: DataTypes.STRING,
    allowNull: true
  },
  emailVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  profilePhoto: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // Appointment Configuration
  slotDuration: {
    type: DataTypes.INTEGER, // 15, 30, 45, or 60 minutes
    defaultValue: 15,
    validate: {
      isIn: [[15, 30, 45, 60]]
    }
  },
  weeklySchedule: {
    type: DataTypes.TEXT, // JSON: { monday: { isOff: false, online: {...}, inPerson: {...} }, ... }
    allowNull: true,
    get() {
      const raw = this.getDataValue('weeklySchedule');
      if (!raw) return getDefaultWeeklySchedule();
      try {
        return JSON.parse(raw);
      } catch (e) {
        return getDefaultWeeklySchedule();
      }
    },
    set(value) {
      this.setDataValue('weeklySchedule', typeof value === 'string' ? value : JSON.stringify(value));
    }
  },
  offDays: {
    type: DataTypes.TEXT, // JSON array of off day names: ["sunday"]
    allowNull: true,
    get() {
      const raw = this.getDataValue('offDays');
      if (!raw) return ['sunday'];
      try {
        return JSON.parse(raw);
      } catch (e) {
        return ['sunday'];
      }
    },
    set(value) {
      this.setDataValue('offDays', typeof value === 'string' ? value : JSON.stringify(value));
    }
  },
  onlineConsultationEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  inPersonConsultationEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  onlineConsultationFee: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  inPersonConsultationFee: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  qualifications: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'doctors',
  timestamps: true,
  hooks: {
    beforeCreate: async (doctor) => {
      if (doctor.password) {
        doctor.password = await bcrypt.hash(doctor.password, 10);
      }
    },
    beforeUpdate: async (doctor) => {
      if (doctor.changed('password')) {
        doctor.password = await bcrypt.hash(doctor.password, 10);
      }
    }
  }
});

// Instance methods
Doctor.prototype.comparePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

Doctor.prototype.generateAuthToken = function() {
  const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';
  return jwt.sign(
    { 
      id: this.id, 
      email: this.email,
      role: 'doctor'
    }, 
    JWT_SECRET, 
    { expiresIn: '7d' }
  );
};

export default Doctor;
