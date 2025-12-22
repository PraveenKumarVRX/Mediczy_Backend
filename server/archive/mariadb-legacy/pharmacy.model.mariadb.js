import { DataTypes } from 'sequelize';
import { sequelize } from '../db/mariadb.js';

const Pharmacy = sequelize.define('Pharmacy', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, validate: { isEmail: true } },
  phoneNumber: { type: DataTypes.STRING },
  address: { type: DataTypes.TEXT, get(){ const v=this.getDataValue('address'); return v?JSON.parse(v):{}; }, set(val){ this.setDataValue('address', JSON.stringify(val||{})); }},
  services: { type: DataTypes.TEXT, get(){ const v=this.getDataValue('services'); return v?JSON.parse(v):[]; }, set(val){ this.setDataValue('services', JSON.stringify(val||[])); }},
  licenseNumber: { type: DataTypes.STRING },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
}, { timestamps: true, tableName: 'pharmacies' });

export default Pharmacy;