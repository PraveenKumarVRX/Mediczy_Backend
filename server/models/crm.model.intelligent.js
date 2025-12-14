import { connectToDb } from '../db/mariadb.js';

let intelligentDB = null;

async function getDB() {
  if (!intelligentDB) {
    intelligentDB = await connectToDb();
  }
  return intelligentDB;
}

const Lead = {
  findOne: async (options) => {
    const db = await getDB();
    return await db.Lead.findOne(options);
  },

  findByPk: async (id, options = {}) => {
    const db = await getDB();
    return await db.Lead.findByPk(id, options);
  },

  create: async (leadData) => {
    const db = await getDB();
    return await db.Lead.create(leadData);
  },

  findAll: async (options = {}) => {
    const db = await getDB();
    return await db.Lead.findAll(options);
  },

  update: async (values, options) => {
    const db = await getDB();
    return await db.Lead.update(values, options);
  },

  destroy: async (options) => {
    const db = await getDB();
    return await db.Lead.destroy(options);
  },

  count: async (options = {}) => {
    const db = await getDB();
    return await db.Lead.count(options);
  }
};

const LeadActivity = {
  findOne: async (options) => {
    const db = await getDB();
    return await db.LeadActivity.findOne(options);
  },

  findByPk: async (id, options = {}) => {
    const db = await getDB();
    return await db.LeadActivity.findByPk(id, options);
  },

  create: async (activityData) => {
    const db = await getDB();
    return await db.LeadActivity.create(activityData);
  },

  findAll: async (options = {}) => {
    const db = await getDB();
    return await db.LeadActivity.findAll(options);
  },

  update: async (values, options) => {
    const db = await getDB();
    return await db.LeadActivity.update(values, options);
  },

  destroy: async (options) => {
    const db = await getDB();
    return await db.LeadActivity.destroy(options);
  }
};

const LeadNote = {
  findOne: async (options) => {
    const db = await getDB();
    return await db.LeadNote.findOne(options);
  },

  findByPk: async (id, options = {}) => {
    const db = await getDB();
    return await db.LeadNote.findByPk(id, options);
  },

  create: async (noteData) => {
    const db = await getDB();
    return await db.LeadNote.create(noteData);
  },

  findAll: async (options = {}) => {
    const db = await getDB();
    return await db.LeadNote.findAll(options);
  },

  update: async (values, options) => {
    const db = await getDB();
    return await db.LeadNote.update(values, options);
  },

  destroy: async (options) => {
    const db = await getDB();
    return await db.LeadNote.destroy(options);
  }
};

const LeadTask = {
  findOne: async (options) => {
    const db = await getDB();
    return await db.LeadTask.findOne(options);
  },

  findByPk: async (id, options = {}) => {
    const db = await getDB();
    return await db.LeadTask.findByPk(id, options);
  },

  create: async (taskData) => {
    const db = await getDB();
    return await db.LeadTask.create(taskData);
  },

  findAll: async (options = {}) => {
    const db = await getDB();
    return await db.LeadTask.findAll(options);
  },

  update: async (values, options) => {
    const db = await getDB();
    return await db.LeadTask.update(values, options);
  },

  destroy: async (options) => {
    const db = await getDB();
    return await db.LeadTask.destroy(options);
  }
};

const Corporate = {
  findOne: async (options) => {
    const db = await getDB();
    return await db.Corporate.findOne(options);
  },

  findByPk: async (id, options = {}) => {
    const db = await getDB();
    return await db.Corporate.findByPk(id, options);
  },

  create: async (corporateData) => {
    const db = await getDB();
    return await db.Corporate.create(corporateData);
  },

  findAll: async (options = {}) => {
    const db = await getDB();
    return await db.Corporate.findAll(options);
  },

  update: async (values, options) => {
    const db = await getDB();
    return await db.Corporate.update(values, options);
  },

  destroy: async (options) => {
    const db = await getDB();
    return await db.Corporate.destroy(options);
  }
};

export { Lead, LeadActivity, LeadNote, LeadTask, Corporate };
export default Lead;