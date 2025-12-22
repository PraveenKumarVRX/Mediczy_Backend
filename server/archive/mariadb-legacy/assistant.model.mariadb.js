import { DataTypes } from 'sequelize';
import { sequelize } from '../db/mariadb.js';

const Assistant = sequelize.define('Assistant', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  firstName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  lastName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  phoneNumber: {
    type: DataTypes.STRING,
    allowNull: false
  },
  linkedDoctorIds: {
    type: DataTypes.JSON,
    defaultValue: [],
    comment: 'Array of doctor IDs this assistant works with (max 5)',
    validate: {
      isValidDoctorList(value) {
        if (!Array.isArray(value)) {
          throw new Error('linkedDoctorIds must be an array');
        }
        if (value.length > 5) {
          throw new Error('Assistant can be linked to maximum 5 doctors');
        }
      }
    }
  },
  primaryDoctorId: {
    type: DataTypes.STRING,
    comment: 'Primary/default doctor for this assistant'
  },
  linkedFacilityId: {
    type: DataTypes.STRING,
    comment: 'ID of the clinic or hospital this assistant is assigned to'
  },
  linkedFacilityType: {
    type: DataTypes.ENUM('clinic', 'hospital'),
    comment: 'Type of facility: clinic or hospital'
  },
  linkedFacilityName: {
    type: DataTypes.STRING,
    comment: 'Name of the linked facility for quick reference'
  },
  roleTitle: {
    type: DataTypes.STRING,
    defaultValue: 'Doctor Assistant',
    comment: 'Secretary, Medical Assistant, Office Manager, etc.'
  },
  workSchedule: {
    type: DataTypes.JSON,
    comment: 'Working hours and days'
  },
  permissions: {
    type: DataTypes.JSON,
    defaultValue: [
      'Manage Appointments',
      'View Patient List',
      'Update Appointment Status',
      'Send Notifications',
      'Manage Schedule',
      'View Reports',
      'Handle Queries',
      'Document Management'
    ]
  },
  canAccessDoctorCalendar: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  canManagePatients: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Can view and manage patient records'
  },
  emergencyContact: {
    type: DataTypes.STRING
  },
  canLogin: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  lastLogin: {
    type: DataTypes.DATE
  }
}, {
  timestamps: true,
  tableName: 'assistants'
});

export default Assistant;
