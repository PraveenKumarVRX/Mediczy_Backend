import { DataTypes } from 'sequelize';
import { JWT_CONFIG } from '../../config/auth.config.js';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const PharmacyInventory = sequelize.define('PharmacyInventory', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    medicineName: {
      type: DataTypes.STRING(200),
      allowNull: false,
      field: 'medicine_name'
    },
    genericName: {
      type: DataTypes.STRING(200),
      allowNull: true,
      field: 'generic_name'
    },
    manufacturer: {
      type: DataTypes.STRING(200),
      allowNull: true
    },
    batchNumber: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'batch_number'
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    unit: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'tablets, ml, mg, capsules, etc.'
    },
    unitPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: 'unit_price'
    },
    expiryDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'expiry_date'
    },
    reorderLevel: {
      type: DataTypes.INTEGER,
      defaultValue: 10,
      field: 'reorder_level'
    },
    organizationId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'organization_id'
    }
  }, {
    tableName: 'pharmacy_inventory',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['organization_id']
      },
      {
        fields: ['medicine_name']
      },
      {
        fields: ['quantity']
      }
    ]
  });

export default PharmacyInventory;
