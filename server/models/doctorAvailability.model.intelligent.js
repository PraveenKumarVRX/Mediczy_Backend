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

// Instance method: generate all time slots for a given date based on startTime/endTime/slotDuration
DoctorAvailabilityModel.prototype.generateTimeSlots = function(date) {
  const slots = [];
  const startParts = (this.startTime || '09:00').split(':').map(Number);
  const endParts   = (this.endTime   || '17:00').split(':').map(Number);
  const duration   = this.slotDuration || 30;

  let current = startParts[0] * 60 + startParts[1];
  const end   = endParts[0]   * 60 + endParts[1];

  while (current + duration <= end) {
    const h = Math.floor(current / 60).toString().padStart(2, '0');
    const m = (current % 60).toString().padStart(2, '0');
    slots.push({ time: `${h}:${m}`, label: `${h}:${m}` });
    current += duration;
  }
  return slots;
};

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