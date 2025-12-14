import { connectToDb } from '../db/mariadb.js';

let intelligentDB = null;
async function getDB() {
  if (!intelligentDB) intelligentDB = await connectToDb();
  return intelligentDB;
}

const patientNoteModel = {
  create: async (data) => {
    const db = await getDB();
    return await db.PatientNote.create(data);
  },
  findAll: async (options = {}) => {
    const db = await getDB();
    return await db.PatientNote.findAll(options);
  }
};

export default patientNoteModel;
