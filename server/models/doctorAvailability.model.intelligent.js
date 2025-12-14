import { connectToDb } from '../db/mariadb.js';

let intelligentDB = null;

async function getDB() {
  if (!intelligentDB) {
    intelligentDB = await connectToDb();
  }
  return intelligentDB;
}

const DoctorAvailability = {
  findOne: async (options) => {
    const db = await getDB();
    return await db.DoctorAvailability.findOne(options);
  },

  findByPk: async (id, options = {}) => {
    const db = await getDB();
    return await db.DoctorAvailability.findByPk(id, options);
  },

  create: async (availabilityData) => {
    const db = await getDB();
    return await db.DoctorAvailability.create(availabilityData);
  },

  findAll: async (options = {}) => {
    const db = await getDB();
    return await db.DoctorAvailability.findAll(options);
  },

  update: async (values, options) => {
    const db = await getDB();
    return await db.DoctorAvailability.update(values, options);
  },

  destroy: async (options) => {
    const db = await getDB();
    return await db.DoctorAvailability.destroy(options);
  },

  count: async (options = {}) => {
    const db = await getDB();
    return await db.DoctorAvailability.count(options);
  }
};

export default DoctorAvailability;