import { DataTypes } from 'sequelize';
import { sequelize } from '../db/mariadb.js';

const Lab = sequelize.define('Lab', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, validate: { isEmail: true } },
  phoneNumber: { type: DataTypes.STRING },
  address: { type: DataTypes.TEXT, get(){ const v=this.getDataValue('address'); return v?JSON.parse(v):{}; }, set(val){ this.setDataValue('address', JSON.stringify(val||{})); }},
  services: { type: DataTypes.TEXT, get(){ const v=this.getDataValue('services'); return v?JSON.parse(v):[]; }, set(val){ this.setDataValue('services', JSON.stringify(val||[])); }},
  accreditation: { type: DataTypes.STRING },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
}, { timestamps: true, tableName: 'labs' });

export default Lab;