import { connectToDb } from '../db/mariadb.js';

let intelligentDB = null;

async function getDB() {
  if (!intelligentDB) {
    intelligentDB = await connectToDb();
  }
  return intelligentDB;
}

const InsuranceProvider = {
  findOne: async (options) => {
    const db = await getDB();
    return await db.InsuranceProvider.findOne(options);
  },

  findByPk: async (id, options = {}) => {
    const db = await getDB();
    return await db.InsuranceProvider.findByPk(id, options);
  },

  create: async (data) => {
    const db = await getDB();
    return await db.InsuranceProvider.create(data);
  },

  findAll: async (options = {}) => {
    const db = await getDB();
    return await db.InsuranceProvider.findAll(options);
  },

  update: async (values, options) => {
    const db = await getDB();
    return await db.InsuranceProvider.update(values, options);
  },

  destroy: async (options) => {
    const db = await getDB();
    return await db.InsuranceProvider.destroy(options);
  }
};

const InsurancePolicy = {
  findOne: async (options) => {
    const db = await getDB();
    return await db.InsurancePolicy.findOne(options);
  },

  findByPk: async (id, options = {}) => {
    const db = await getDB();
    return await db.InsurancePolicy.findByPk(id, options);
  },

  create: async (data) => {
    const db = await getDB();
    return await db.InsurancePolicy.create(data);
  },

  findAll: async (options = {}) => {
    const db = await getDB();
    return await db.InsurancePolicy.findAll(options);
  },

  update: async (values, options) => {
    const db = await getDB();
    return await db.InsurancePolicy.update(values, options);
  },

  destroy: async (options) => {
    const db = await getDB();
    return await db.InsurancePolicy.destroy(options);
  }
};

const UserInsurance = {
  findOne: async (options) => {
    const db = await getDB();
    return await db.UserInsurance.findOne(options);
  },

  findByPk: async (id, options = {}) => {
    const db = await getDB();
    return await db.UserInsurance.findByPk(id, options);
  },

  create: async (data) => {
    const db = await getDB();
    return await db.UserInsurance.create(data);
  },

  findAll: async (options = {}) => {
    const db = await getDB();
    return await db.UserInsurance.findAll(options);
  },

  update: async (values, options) => {
    const db = await getDB();
    return await db.UserInsurance.update(values, options);
  },

  destroy: async (options) => {
    const db = await getDB();
    return await db.UserInsurance.destroy(options);
  }
};

const InsuranceClaim = {
  findOne: async (options) => {
    const db = await getDB();
    return await db.InsuranceClaim.findOne(options);
  },

  findByPk: async (id, options = {}) => {
    const db = await getDB();
    return await db.InsuranceClaim.findByPk(id, options);
  },

  create: async (data) => {
    const db = await getDB();
    return await db.InsuranceClaim.create(data);
  },

  findAll: async (options = {}) => {
    const db = await getDB();
    return await db.InsuranceClaim.findAll(options);
  },

  update: async (values, options) => {
    const db = await getDB();
    return await db.InsuranceClaim.update(values, options);
  },

  destroy: async (options) => {
    const db = await getDB();
    return await db.InsuranceClaim.destroy(options);
  }
};

export { InsuranceProvider, InsurancePolicy, UserInsurance, InsuranceClaim };