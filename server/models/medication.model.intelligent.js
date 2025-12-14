import { connectToDb } from '../db/mariadb.js';

let intelligentDB = null;
async function getDB() {
  if (!intelligentDB) intelligentDB = await connectToDb();
  return intelligentDB;
}

const medicationModel = {
  create: async (data) => {
    const db = await getDB();
    return await db.MedicationAdministration.create(data);
  },
  findAll: async (options = {}) => {
    const db = await getDB();
    return await db.MedicationAdministration.findAll(options);
  }
};

export default medicationModel;
