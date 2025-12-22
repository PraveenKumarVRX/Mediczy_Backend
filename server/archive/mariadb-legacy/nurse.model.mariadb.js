import { DataTypes } from 'sequelize';
import { sequelize } from '../db/mariadb.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const Nurse = sequelize.define('Nurse', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  firstName: { type: DataTypes.STRING, allowNull: false },
  lastName: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false, unique: true, validate: { isEmail: true } },
  password: { type: DataTypes.STRING, allowNull: false },
  phoneNumber: { type: DataTypes.STRING },
  licenseNumber: { type: DataTypes.STRING },
  department: { type: DataTypes.STRING },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
}, {
  timestamps: true,
  tableName: 'nurses',
  hooks: {
    beforeCreate: async (nurse) => {
      if (nurse.password) nurse.password = await bcrypt.hash(nurse.password, 10);
    },
    beforeUpdate: async (nurse) => {
      if (nurse.changed('password')) nurse.password = await bcrypt.hash(nurse.password, 10);
    }
  }
});

Nurse.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

Nurse.prototype.generateAuthToken = function() {
  if (!process.env.JWT_SECRET) throw new Error('FATAL: JWT_SECRET not configured');
  const payload = { id: this.id, email: this.email, role: 'nurse' };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
};

export default Nurse;
