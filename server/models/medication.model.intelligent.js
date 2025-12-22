import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes } from 'sequelize';

// Define Medication model - NOW USING POSTGRESQL
const MedicationModel = sequelize.define('Medication', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  prescriptionId: { type: DataTypes.INTEGER },
  name: { type: DataTypes.STRING(255), allowNull: false },
  genericName: { type: DataTypes.STRING(255) },
  dosage: { type: DataTypes.STRING(100) },
  frequency: { type: DataTypes.STRING(100) },
  duration: { type: DataTypes.STRING(100) },
  route: { type: DataTypes.STRING(50), defaultValue: 'oral' },
  instructions: { type: DataTypes.TEXT },
  startDate: { type: DataTypes.DATEONLY },
  endDate: { type: DataTypes.DATEONLY },
  quantity: { type: DataTypes.INTEGER },
  refills: { type: DataTypes.INTEGER, defaultValue: 0 },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  sideEffects: { type: DataTypes.ARRAY(DataTypes.TEXT), defaultValue: [] },
  interactions: { type: DataTypes.ARRAY(DataTypes.TEXT), defaultValue: [] },
  metadata: { type: DataTypes.JSONB, defaultValue: {} }
}, { tableName: 'medications', timestamps: true });

const medicationModel = {
  create: async (data) => MedicationModel.create(data),
  findAll: async (options = {}) => MedicationModel.findAll(options),
  findOne: async (options) => MedicationModel.findOne(options),
  findByPk: async (id, options = {}) => MedicationModel.findByPk(id, options),
  update: async (values, options) => MedicationModel.update(values, options),
  destroy: async (options) => MedicationModel.destroy(options)
};

export default medicationModel;
