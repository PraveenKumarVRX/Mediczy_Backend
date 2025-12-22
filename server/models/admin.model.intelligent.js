// Admin operations use the User model with role='admin'
import { User } from './user.model.intelligent.js';

const adminModel = {
  findOne: async (options) => {
    // Admin is a user with role='admin'
    return await User.findOne({
      ...options,
      where: { ...options.where, role: 'admin' }
    });
  },

  create: async (adminData) => {
    // Create admin as a user with role='admin'
    return await User.create({
      ...adminData,
      role: 'admin'
    });
  }
};

export default adminModel;