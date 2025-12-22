import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes } from 'sequelize';

// Define PatientNote model - NOW USING POSTGRESQL
const PatientNoteModel = sequelize.define('PatientNote', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  patientId: { type: DataTypes.INTEGER, allowNull: false },
  doctorId: { type: DataTypes.INTEGER },
  appointmentId: { type: DataTypes.INTEGER },
  type: { type: DataTypes.STRING(50), defaultValue: 'general' },
  title: { type: DataTypes.STRING(255) },
  content: { type: DataTypes.TEXT },
  isPrivate: { type: DataTypes.BOOLEAN, defaultValue: false },
  attachments: { type: DataTypes.JSONB, defaultValue: [] },
  tags: { type: DataTypes.ARRAY(DataTypes.TEXT), defaultValue: [] },
  metadata: { type: DataTypes.JSONB, defaultValue: {} }
}, { tableName: 'patient_notes', timestamps: true });

const patientNoteModel = {
  create: async (data) => PatientNoteModel.create(data),
  findAll: async (options = {}) => PatientNoteModel.findAll(options),
  findOne: async (options) => PatientNoteModel.findOne(options),
  findByPk: async (id, options = {}) => PatientNoteModel.findByPk(id, options),
  update: async (values, options) => PatientNoteModel.update(values, options),
  destroy: async (options) => PatientNoteModel.destroy(options)
};

export default patientNoteModel;
