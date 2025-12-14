import { connectToDb } from '../db/mariadb.js';

let intelligentDB = null;
async function getDB() {
  if (!intelligentDB) intelligentDB = await connectToDb();
  return intelligentDB;
}

const vitalsRecordModel = {
  create: async (data) => {
    const db = await getDB();
    return await db.VitalsRecord.create(data);
  },
  findAll: async (options = {}) => {
    const db = await getDB();
    return await db.VitalsRecord.findAll(options);
  }
};

export default vitalsRecordModel;
