import { DataTypes } from 'sequelize';
import sequelize from '../../db/postgres-sequelize.js';
import bcrypt from 'bcrypt';

const Dietary = sequelize.define('Dietary', {
  email: { type: DataTypes.STRING, unique: true, allowNull: false },
  password: { type: DataTypes.STRING, allowNull: false },
  name: { type: DataTypes.STRING },
}, {
  tableName: 'Dietaries',
});

Dietary.beforeCreate(async (user) => {
  user.password = await bcrypt.hash(user.password, 10);
});

Dietary.prototype.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

export default Dietary;
