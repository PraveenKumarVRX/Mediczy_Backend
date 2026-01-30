import { DataTypes } from 'sequelize';
import { JWT_CONFIG } from '../../config/auth.config.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import postgresSequelize from '../../db/postgres-sequelize.js';
import { generateUniqueId } from '../../utils/uniqueIdGenerator.js';

/**
 * Nurse Model (PostgreSQL)
 * Represents nursing professionals for homecare and hospital services
 * 
 * Features:
 * - Password hashing with bcrypt
 * - JWT token generation
 * - JSONB for availability schedules and documents
 * - Rating system
 * - Verification workflow
 */

const Nurse = postgresSequelize.define('Nurse', {
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
  unique_id: {
    type: DataTypes.STRING(6),
    unique: true,
    allowNull: true,
    comment: 'Public-facing unique ID with N prefix'
  },
  firstName: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  lastName: {
    type: DataTypes.STRING(100),
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
  phoneNumber: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  qualification: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'e.g., BSc Nursing, GNM, ANM'
  },
  specialization: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'e.g., ICU, Pediatric, Geriatric'
  },
  experience: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 0
    },
    comment: 'Years of experience'
  },
  registrationNumber: {
    type: DataTypes.STRING(100),
    allowNull: true,
    unique: true,
    comment: 'Nursing council registration'
  },
  licenseNumber: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'State license number'
  },
  workType: {
    type: DataTypes.STRING(50),
    allowNull: true,
    validate: {
      isIn: [['Homecare', 'Hospital', 'Both', 'Elder Care', 'Child Care', 'ICU']]
    }
  },
  // JSONB for weekly availability
  availability: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Structure: {monday: [{start, end, available}], ...}'
  },
  hourlyRate: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    validate: {
      min: 0
    }
  },
  rating: {
    type: DataTypes.DECIMAL(3, 2),
    defaultValue: 0,
    validate: {
      min: 0,
      max: 5
    }
  },
  totalReviews: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  // JSONB for address
  address: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    comment: 'Structure: {street, city, state, zipCode, coordinates}'
  },
  // JSONB for documents
  documents: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Structure: {certificates: [], idProof, photoUrl, resumeUrl}'
  },
  status: {
    type: DataTypes.STRING(50),
    defaultValue: 'pending',
    validate: {
      isIn: [['pending', 'verified', 'active', 'inactive', 'suspended', 'rejected']]
    }
  },
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional data: {languages, skills, preferences, emergencyContact}'
  },
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
  tableName: 'nurses',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['email']
    },
    {
      fields: ['phoneNumber']
    },
    {
      fields: ['status']
    },
    {
      fields: ['isVerified']
    },
    {
      fields: ['workType']
    },
    {
      fields: ['rating']
    },
    {
      using: 'gin',
      fields: ['availability'],
      name: 'idx_nurses_availability_gin'
    },
    {
      using: 'gin',
      fields: ['metadata'],
      name: 'idx_nurses_metadata_gin'
    }
  ],
  hooks: {
    beforeCreate: async (nurse) => {
      // Generate unique ID if not set
      if (!nurse.unique_id) {
        nurse.unique_id = generateUniqueId('nurse');
      }
      
      if (nurse.password) {
        nurse.password = await bcrypt.hash(nurse.password, 10);
      }
      if (nurse.email) {
        nurse.email = nurse.email.toLowerCase();
      }
    },
    beforeUpdate: async (nurse) => {
      if (nurse.changed('password')) {
        nurse.password = await bcrypt.hash(nurse.password, 10);
      }
      if (nurse.changed('email')) {
        nurse.email = nurse.email.toLowerCase();
      }
    }
  }
});

// Instance methods
Nurse.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

Nurse.prototype.generateAuthToken = function() {
  const payload = {
    id: this.id,
    email: this.email,
    role: 'nurse',
    isVerified: this.isVerified
  };
  
  return jwt.sign(payload, JWT_CONFIG.SECRET, {
    expiresIn: '7d'
  });
};

Nurse.prototype.getFullName = function() {
  return `${this.firstName} ${this.lastName}`;
};

Nurse.prototype.isAvailable = function() {
  return this.status === 'active' && this.isVerified;
};

Nurse.prototype.toJSON = function() {
  const values = { ...this.get() };
  delete values.password;
  return values;
};

// Static methods
Nurse.findByEmail = async function(email) {
  return await this.findOne({
    where: { email: email.toLowerCase() }
  });
};

Nurse.findAvailable = async function(workType = null) {
  const where = {
    status: 'active',
    isVerified: true
  };
  
  if (workType) {
    where[postgresSequelize.Sequelize.Op.or] = [
      { workType },
      { workType: 'Both' }
    ];
  }
  
  return await this.findAll({
    where,
    order: [['rating', 'DESC'], ['totalReviews', 'DESC']]
  });
};

Nurse.findByRating = async function(minRating = 4.0) {
  return await this.findAll({
    where: {
      status: 'active',
      isVerified: true,
      rating: {
        [postgresSequelize.Sequelize.Op.gte]: minRating
      }
    },
    order: [['rating', 'DESC']]
  });
};

export default Nurse;
