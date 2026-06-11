import { DataTypes } from 'sequelize';
import sequelize from '../../db/postgres-sequelize.js';
import bcrypt from 'bcrypt';
import { hashPasswordIfPlaintext } from '../../utils/passwordHashing.js';

const Mortuary = sequelize.define('Mortuary', {
  email: { type: DataTypes.STRING, unique: true, allowNull: false },
  password: { type: DataTypes.STRING, allowNull: false },
  name: { type: DataTypes.STRING },
}, {
  tableName: 'Mortuaries',
});

Mortuary.beforeCreate(async (user) => {
  user.password = await hashPasswordIfPlaintext(user.password, 10);
});

Mortuary.prototype.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

export default Mortuary;
