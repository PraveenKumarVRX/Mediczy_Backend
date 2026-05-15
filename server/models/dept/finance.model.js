import { DataTypes } from 'sequelize';
import sequelize from '../../db/postgres-sequelize.js';
import bcrypt from 'bcrypt';

const Finance = sequelize.define('Finance', {
  email: { type: DataTypes.STRING, unique: true, allowNull: false },
  password: { type: DataTypes.STRING, allowNull: false },
  name: { type: DataTypes.STRING },
}, {
  tableName: 'Finances',
});

Finance.beforeCreate(async (user) => {
  user.password = await bcrypt.hash(user.password, 10);
});

Finance.prototype.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

export default Finance;
