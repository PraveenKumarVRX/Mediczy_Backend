import { DataTypes } from 'sequelize';
import sequelize from '../../db/postgres-sequelize.js';
import bcrypt from 'bcrypt';
import { hashPasswordIfPlaintext } from '../../utils/passwordHashing.js';

const Scm = sequelize.define('Scm', {
  email: { type: DataTypes.STRING, unique: true, allowNull: false },
  password: { type: DataTypes.STRING, allowNull: false },
  name: { type: DataTypes.STRING },
  scm_role: { type: DataTypes.STRING, defaultValue: 'admin' },
  organization_id: { type: DataTypes.INTEGER },
}, {
  tableName: 'scm_staff',
});

Scm.beforeCreate(async (user) => {
  user.password = await hashPasswordIfPlaintext(user.password, 10);
});

Scm.prototype.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

export default Scm;
