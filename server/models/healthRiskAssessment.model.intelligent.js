import { connectToDb } from '../db/mariadb.js';

let intelligentDB = null;

async function getDB() {
  if (!intelligentDB) {
    intelligentDB = await connectToDb();
  }
  return intelligentDB;
}

const healthRiskAssessmentModel = {
  create: async (assessmentData) => {
    const db = await getDB();
    return db.HealthRiskAssessment.create(assessmentData);
  },

  findAll: async (options = {}) => {
    const db = await getDB();
    return db.HealthRiskAssessment.findAll(options);
  },

  findByPk: async (id) => {
    const db = await getDB();
    return db.HealthRiskAssessment.findByPk(id);
  },

  findAndCountAll: async (options = {}) => {
    const db = await getDB();
    return db.HealthRiskAssessment.findAndCountAll(options);
  },

  count: async (options = {}) => {
    const db = await getDB();
    return db.HealthRiskAssessment.count(options);
  }
};

export default healthRiskAssessmentModel;
