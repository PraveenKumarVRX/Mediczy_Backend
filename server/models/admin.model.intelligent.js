import { connectToDb } from '../db/mariadb.js';

let intelligentDB = null;

async function getDB() {
  if (!intelligentDB) {
    intelligentDB = await connectToDb();
  }
  return intelligentDB;
}

const adminModel = {
  findOne: async (options) => {
    const db = await getDB();
    return await db.Admin.findOne(options);
  },

  create: async (adminData) => {
    const db = await getDB();
    return await db.Admin.create(adminData);
  }
};

export default adminModel;