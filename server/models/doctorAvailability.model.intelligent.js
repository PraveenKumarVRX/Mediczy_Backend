import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes } from 'sequelize';

// Define DoctorAvailability model - NOW USING POSTGRESQL
const DoctorAvailabilityModel = sequelize.define('DoctorAvailability', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  doctorId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  dayOfWeek: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: { min: 0, max: 6 }
  },
  startTime: {
    type: DataTypes.TIME,
    allowNull: false
  },
  endTime: {
    type: DataTypes.TIME,
    allowNull: false
  },
  slotDuration: {
    type: DataTypes.INTEGER,
    defaultValue: 30
  },
  isAvailable: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  consultationType: {
    type: DataTypes.STRING(50),
    defaultValue: 'both'
  },
  maxAppointments: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
}, {
  tableName: 'doctor_availability',
  timestamps: true
});

const DoctorAvailability = {
  findOne: async (options) => {
    return await DoctorAvailabilityModel.findOne(options);
  },

  findByPk: async (id, options = {}) => {
    return await DoctorAvailabilityModel.findByPk(id, options);
  },

  create: async (availabilityData) => {
    return await DoctorAvailabilityModel.create(availabilityData);
  },

  findAll: async (options = {}) => {
    return await DoctorAvailabilityModel.findAll(options);
  },

  update: async (values, options) => {
    return await DoctorAvailabilityModel.update(values, options);
  },

  destroy: async (options) => {
    return await DoctorAvailabilityModel.destroy(options);
  },

  count: async (options = {}) => {
    return await DoctorAvailabilityModel.count(options);
  },
  
  bulkCreate: async (records, options = {}) => {
    return await DoctorAvailabilityModel.bulkCreate(records, options);
  }
};

export default DoctorAvailability;