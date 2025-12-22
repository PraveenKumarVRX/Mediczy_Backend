import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';

/**
 * Address Model
 * Stores user addresses with Google Places integration
 * Supports multiple addresses with labels (home, office, etc.)
 */
const Address = sequelize.define('Address', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    onDelete: 'CASCADE',
    comment: 'User who owns this address'
  },
  
  // Address Label/Type
  label: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'home',
    comment: 'Address label: home, office, other, etc.'
  },
  
  isDefault: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Primary/default address for deliveries'
  },
  
  // Google Places API Data
  placeId: {
    type: DataTypes.STRING(255),
    comment: 'Google Place ID for geocoding and validation'
  },
  
  formattedAddress: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Complete formatted address from Google Places'
  },
  
  // Address Components
  street: {
    type: DataTypes.STRING(255),
    comment: 'Street address line 1'
  },
  
  street2: {
    type: DataTypes.STRING(255),
    comment: 'Street address line 2 (apartment, suite, etc.)'
  },
  
  city: {
    type: DataTypes.STRING(100),
    comment: 'City name'
  },
  
  state: {
    type: DataTypes.STRING(100),
    comment: 'State/Province'
  },
  
  zipCode: {
    type: DataTypes.STRING(20),
    comment: 'Postal/ZIP code'
  },
  
  country: {
    type: DataTypes.STRING(100),
    comment: 'Country name'
  },
  
  countryCode: {
    type: DataTypes.STRING(2),
    comment: 'ISO 2-letter country code (IN, US, etc.)'
  },
  
  // Geographic Coordinates
  latitude: {
    type: DataTypes.DECIMAL(10, 8),
    comment: 'Latitude for mapping'
  },
  
  longitude: {
    type: DataTypes.DECIMAL(11, 8),
    comment: 'Longitude for mapping'
  },
  
  // Additional Details
  landmark: {
    type: DataTypes.STRING(255),
    comment: 'Nearby landmark for easier navigation'
  },
  
  deliveryInstructions: {
    type: DataTypes.TEXT,
    comment: 'Special delivery instructions'
  },
  
  // Google Places Full Response (for reference)
  placeData: {
    type: DataTypes.JSONB,
    comment: 'Complete Google Places API response'
  },
  
  // Status
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Address is active and usable'
  },
  
  // Timestamps
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
  tableName: 'addresses',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['placeId'] },
    { fields: ['isDefault'] },
    { fields: ['label'] }
  ]
});

// Instance Methods
Address.prototype.toJSON = function() {
  const values = Object.assign({}, this.get());
  // Don't expose internal placeData in API responses
  if (values.placeData && Object.keys(values.placeData).length > 100) {
    delete values.placeData;
  }
  return values;
};

// Class Methods
Address.associate = function(models) {
  Address.belongsTo(models.User, {
    foreignKey: 'userId',
    as: 'user'
  });
};

/**
 * Set an address as default and unset others
 */
Address.setAsDefault = async function(addressId, userId) {
  const transaction = await sequelize.transaction();
  
  try {
    // Unset all other defaults for this user
    await Address.update(
      { isDefault: false },
      { 
        where: { userId, isDefault: true },
        transaction 
      }
    );
    
    // Set this address as default
    await Address.update(
      { isDefault: true },
      { 
        where: { id: addressId, userId },
        transaction 
      }
    );
    
    await transaction.commit();
    return true;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

/**
 * Get user's default address
 */
Address.getDefault = async function(userId) {
  return await Address.findOne({
    where: { userId, isDefault: true, isActive: true }
  });
};

/**
 * Get all addresses for a user
 */
Address.getUserAddresses = async function(userId, activeOnly = true) {
  const where = { userId };
  if (activeOnly) {
    where.isActive = true;
  }
  
  return await Address.findAll({
    where,
    order: [
      ['isDefault', 'DESC'],
      ['createdAt', 'DESC']
    ]
  });
};

export default Address;
