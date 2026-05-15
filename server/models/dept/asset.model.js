import { DataTypes } from 'sequelize';
import sequelize from '../../db/postgres-sequelize.js';
import bcrypt from 'bcrypt';

const Asset = sequelize.define('Asset', {
  email: { type: DataTypes.STRING, unique: true, allowNull: false },
  password: { type: DataTypes.STRING, allowNull: false },
  name: { type: DataTypes.STRING },
}, {
  tableName: 'Assets',
});

Asset.beforeCreate(async (user) => {
  user.password = await bcrypt.hash(user.password, 10);
});

Asset.prototype.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

export default Asset;
