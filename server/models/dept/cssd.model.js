import { DataTypes } from 'sequelize';
import sequelize from '../../db/postgres-sequelize.js';
import bcrypt from 'bcrypt';
import { hashPasswordIfPlaintext } from '../../utils/passwordHashing.js';

const CSSD = sequelize.define('CSSD', {
  email: { type: DataTypes.STRING, unique: true, allowNull: false },
  password: { type: DataTypes.STRING, allowNull: false },
  name: { type: DataTypes.STRING },
}, {
  tableName: 'CSSDs',
});

CSSD.beforeCreate(async (user) => {
  user.password = await hashPasswordIfPlaintext(user.password, 10);
});

CSSD.prototype.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

export default CSSD;
