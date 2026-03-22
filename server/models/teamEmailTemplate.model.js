import { DataTypes } from 'sequelize';
import { postgresSequelize } from '../db/postgres-sequelize.js';

const TeamEmailTemplate = postgresSequelize.define('TeamEmailTemplate', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  teamMemberId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'team_member_id',
  },
  name: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  subject: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  body: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  category: {
    type: DataTypes.STRING(100),
    defaultValue: 'general',
  },
  isShared: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_shared',
  },
}, {
  tableName: 'team_email_templates',
  timestamps: true,
  underscored: true,
});

export default TeamEmailTemplate;
