import { DataTypes } from 'sequelize';
import { sequelize } from '../db/mariadb.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { encrypt, decrypt } from '../utils/encryption.js';

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
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
  dateOfBirth: {
    type: DataTypes.DATE,
    allowNull: false
  },
  gender: {
    type: DataTypes.ENUM('Male', 'Female', 'Other'),
    allowNull: false
  },
  phoneNumber: {
    type: DataTypes.STRING,
    allowNull: false
  },
  // Address fields (PII - potentially encrypted)
  address_street: {
    type: DataTypes.TEXT,
    get() {
      const rawValue = this.getDataValue('address_street');
      if (!rawValue || !process.env.ENCRYPTION_KEY) return rawValue;
      try {
        // Try to decrypt - if it fails, assume it's plain text (for migration)
        return rawValue.includes(':') ? decrypt(rawValue) : rawValue;
      } catch (e) {
        return rawValue;
      }
    },
    set(value) {
      if (!value || !process.env.ENCRYPTION_KEY) {
        this.setDataValue('address_street', value);
      } else {
        this.setDataValue('address_street', encrypt(value));
      }
    }
  },
  address_city: DataTypes.STRING,
  address_state: DataTypes.STRING,
  address_zipCode: DataTypes.STRING,
  address_country: DataTypes.STRING,
  
  // Emergency Contact
  emergencyContact_name: DataTypes.STRING,
  emergencyContact_relationship: DataTypes.STRING,
  emergencyContact_phoneNumber: DataTypes.STRING,
  
  // Medical Information (PHI - ENCRYPTED)
  bloodType: {
    type: DataTypes.TEXT,
    get() {
      const rawValue = this.getDataValue('bloodType');
      if (!rawValue || !process.env.ENCRYPTION_KEY) return rawValue;
      try {
        return rawValue.includes(':') ? decrypt(rawValue) : rawValue;
      } catch (e) {
        return rawValue;
      }
    },
    set(value) {
      if (!value || !process.env.ENCRYPTION_KEY) {
        this.setDataValue('bloodType', value);
      } else {
        this.setDataValue('bloodType', encrypt(value));
      }
    }
  },
  allergies: {
    type: DataTypes.TEXT,
    get() {
      const rawValue = this.getDataValue('allergies');
      if (!rawValue || !process.env.ENCRYPTION_KEY) return rawValue;
      try {
        return rawValue.includes(':') ? decrypt(rawValue) : rawValue;
      } catch (e) {
        return rawValue;
      }
    },
    set(value) {
      if (!value || !process.env.ENCRYPTION_KEY) {
        this.setDataValue('allergies', value);
      } else {
        this.setDataValue('allergies', encrypt(value));
      }
    }
  },
  chronicConditions: {
    type: DataTypes.TEXT,
    get() {
      const rawValue = this.getDataValue('chronicConditions');
      if (!rawValue || !process.env.ENCRYPTION_KEY) return rawValue;
      try {
        return rawValue.includes(':') ? decrypt(rawValue) : rawValue;
      } catch (e) {
        return rawValue;
      }
    },
    set(value) {
      if (!value || !process.env.ENCRYPTION_KEY) {
        this.setDataValue('chronicConditions', value);
      } else {
        this.setDataValue('chronicConditions', encrypt(value));
      }
    }
  },
  currentMedications: {
    type: DataTypes.TEXT,
    get() {
      const rawValue = this.getDataValue('currentMedications');
      if (!rawValue || !process.env.ENCRYPTION_KEY) return rawValue;
      try {
        return rawValue.includes(':') ? decrypt(rawValue) : rawValue;
      } catch (e) {
        return rawValue;
      }
    },
    set(value) {
      if (!value || !process.env.ENCRYPTION_KEY) {
        this.setDataValue('currentMedications', value);
      } else {
        this.setDataValue('currentMedications', encrypt(value));
      }
    }
  },
  
  // Insurance Information (PHI - ENCRYPTED)
  insurance_provider: DataTypes.STRING,
  insurance_policyNumber: {
    type: DataTypes.TEXT,
    get() {
      const rawValue = this.getDataValue('insurance_policyNumber');
      if (!rawValue || !process.env.ENCRYPTION_KEY) return rawValue;
      try {
        return rawValue.includes(':') ? decrypt(rawValue) : rawValue;
      } catch (e) {
        return rawValue;
      }
    },
    set(value) {
      if (!value || !process.env.ENCRYPTION_KEY) {
        this.setDataValue('insurance_policyNumber', value);
      } else {
        this.setDataValue('insurance_policyNumber', encrypt(value));
      }
    }
  },
  insurance_groupNumber: {
    type: DataTypes.TEXT,
    get() {
      const rawValue = this.getDataValue('insurance_groupNumber');
      if (!rawValue || !process.env.ENCRYPTION_KEY) return rawValue;
      try {
        return rawValue.includes(':') ? decrypt(rawValue) : rawValue;
      } catch (e) {
        return rawValue;
      }
    },
    set(value) {
      if (!value || !process.env.ENCRYPTION_KEY) {
        this.setDataValue('insurance_groupNumber', value);
      } else {
        this.setDataValue('insurance_groupNumber', encrypt(value));
      }
    }
  },
  insurance_validUntil: DataTypes.DATE,
  
  // Preferences
  preferredLanguage: {
    type: DataTypes.STRING,
    defaultValue: 'English'
  },
  notificationsEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  
  // Profile
  profilePicture: DataTypes.STRING,
  
  // OAuth2 Integration
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
    type: DataTypes.ENUM('local', 'google', 'facebook'),
    defaultValue: 'local'
  },
  emailVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  
  // Account status
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  isOnline: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  lastActive: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  lastLogin: DataTypes.DATE,
  // Roles / Admin
  isAdmin: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  
  // Verification
  isEmailVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  verificationToken: DataTypes.STRING,
  resetPasswordToken: DataTypes.STRING,
  resetPasswordExpires: DataTypes.DATE
}, {
  timestamps: true,
  tableName: 'users',
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        user.password = await bcrypt.hash(user.password, 10);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password')) {
        user.password = await bcrypt.hash(user.password, 10);
      }
    }
  }
});

// Instance methods
User.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

User.prototype.generateAuthToken = function() {
  // CRITICAL SECURITY: Fail immediately if JWT_SECRET not set
  if (!process.env.JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET environment variable not configured');
  }
  
  const payload = { id: this.id, email: this.email, role: this.isAdmin ? 'admin' : 'user' };
  const token = jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
  return token;
};

export default User;
