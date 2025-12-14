import { Appointment } from './index.js';

const IntelligentAppointment = {
  findOne: async (options) => {
    return await Appointment.findOne(options);
  },

  findByPk: async (id, options = {}) => {
    return await Appointment.findByPk(id, options);
  },

  create: async (appointmentData) => {
    return await Appointment.create(appointmentData);
  },

  findAll: async (options = {}) => {
    return await Appointment.findAll(options);
  },

  update: async (values, options) => {
    return await Appointment.update(values, options);
  },

  destroy: async (options) => {
    return await Appointment.destroy(options);
  },

  count: async (options = {}) => {
    return await Appointment.count(options);
  }
};

export default IntelligentAppointment;