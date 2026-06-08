import { DataTypes } from 'sequelize';
import sequelize from '../../db/postgres-sequelize.js';
import bcrypt from 'bcrypt';
import { hashPasswordIfPlaintext } from '../../utils/passwordHashing.js';

const Feedback = sequelize.define('Feedback', {
  email: { type: DataTypes.STRING, unique: true, allowNull: false },
  password: { type: DataTypes.STRING, allowNull: false },
  name: { type: DataTypes.STRING },
}, {
  tableName: 'Feedbacks',
});

Feedback.beforeCreate(async (user) => {
  user.password = await hashPasswordIfPlaintext(user.password, 10);
});

Feedback.prototype.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

export default Feedback;
