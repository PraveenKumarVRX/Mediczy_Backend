import { connectToDb } from '../db/mariadb.js';

let intelligentDB = null;

async function getDB() {
  if (!intelligentDB) {
    intelligentDB = await connectToDb();
  }
  return intelligentDB;
}

const MembershipPlan = {
  findOne: async (options) => {
    const db = await getDB();
    return await db.MembershipPlan.findOne(options);
  },

  findByPk: async (id, options = {}) => {
    const db = await getDB();
    return await db.MembershipPlan.findByPk(id, options);
  },

  create: async (planData) => {
    const db = await getDB();
    return await db.MembershipPlan.create(planData);
  },

  findAll: async (options = {}) => {
    const db = await getDB();
    return await db.MembershipPlan.findAll(options);
  },

  update: async (values, options) => {
    const db = await getDB();
    return await db.MembershipPlan.update(values, options);
  },

  destroy: async (options) => {
    const db = await getDB();
    return await db.MembershipPlan.destroy(options);
  },

  count: async (options = {}) => {
    const db = await getDB();
    return await db.MembershipPlan.count(options);
  }
};

const UserPlan = {
  findOne: async (options) => {
    const db = await getDB();
    return await db.UserPlan.findOne(options);
  },

  findByPk: async (id, options = {}) => {
    const db = await getDB();
    return await db.UserPlan.findByPk(id, options);
  },

  create: async (userPlanData) => {
    const db = await getDB();
    return await db.UserPlan.create(userPlanData);
  },

  findAll: async (options = {}) => {
    const db = await getDB();
    return await db.UserPlan.findAll(options);
  },

  update: async (values, options) => {
    const db = await getDB();
    return await db.UserPlan.update(values, options);
  },

  destroy: async (options) => {
    const db = await getDB();
    return await db.UserPlan.destroy(options);
  },

  count: async (options = {}) => {
    const db = await getDB();
    return await db.UserPlan.count(options);
  }
};

export { MembershipPlan, UserPlan };
export default MembershipPlan;