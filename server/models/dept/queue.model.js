import { DataTypes } from 'sequelize';
import sequelize from '../../db/postgres-sequelize.js';
import bcrypt from 'bcrypt';
import { hashPasswordIfPlaintext } from '../../utils/passwordHashing.js';

const Queue = sequelize.define('Queue', {
  email: { type: DataTypes.STRING, unique: true, allowNull: false },
  password: { type: DataTypes.STRING, allowNull: false },
  name: { type: DataTypes.STRING },
}, {
  tableName: 'Queues',
});

Queue.beforeCreate(async (user) => {
  user.password = await hashPasswordIfPlaintext(user.password, 10);
});

Queue.prototype.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

export default Queue;
