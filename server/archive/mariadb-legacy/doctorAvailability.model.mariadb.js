import { DataTypes } from 'sequelize';
import { sequelize } from '../db/mariadb.js';

const DoctorAvailability = sequelize.define('DoctorAvailability', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  doctorId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'doctors',
      key: 'id'
    }
  },
  
  // Day of week (0 = Sunday, 6 = Saturday)
  dayOfWeek: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 0,
      max: 6
    }
  },
  
  // Time slots
  startTime: {
    type: DataTypes.TIME,
    allowNull: false
  },
  endTime: {
    type: DataTypes.TIME,
    allowNull: false,
    validate: {
      isAfterStartTime(value) {
        if (value <= this.startTime) {
          throw new Error('End time must be after start time');
        }
      }
    }
  },
  
  // Slot configuration
  slotDuration: {
    type: DataTypes.INTEGER, // in minutes
    defaultValue: 30,
    validate: {
      isIn: [[15, 30, 45, 60]]
    }
  },
  
  // Break times (stored as JSON array)
  breakTimes: {
    type: DataTypes.TEXT,
    get() {
      const value = this.getDataValue('breakTimes');
      return value ? JSON.parse(value) : [];
    },
    set(value) {
      this.setDataValue('breakTimes', JSON.stringify(value || []));
    }
  },
  
  // Availability status
  isAvailable: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  
  // Consultation type availability
  allowVideoConsultation: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  allowAudioConsultation: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  allowChatConsultation: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  allowInPersonConsultation: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  
  // Pricing per consultation type
  videoConsultationFee: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 500.00
  },
  audioConsultationFee: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 300.00
  },
  chatConsultationFee: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 200.00
  },
  inPersonConsultationFee: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 800.00
  },
  
  // Max appointments per slot
  maxAppointmentsPerSlot: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    validate: {
      min: 1,
      max: 10
    }
  }
}, {
  timestamps: true,
  tableName: 'doctor_availability',
  indexes: [
    {
      fields: ['doctorId', 'dayOfWeek']
    },
    {
      fields: ['isAvailable']
    }
  ]
});

// Generate time slots for a specific date
DoctorAvailability.prototype.generateTimeSlots = function(date) {
  const slots = [];
  const start = new Date(`2000-01-01 ${this.startTime}`);
  const end = new Date(`2000-01-01 ${this.endTime}`);
  const duration = this.slotDuration * 60 * 1000; // Convert to milliseconds
  
  let current = start;
  while (current < end) {
    const slotTime = current.toTimeString().slice(0, 5); // HH:MM format
    
    // Check if slot is in break time
    const isBreak = this.breakTimes.some(breakTime => {
      const breakStart = new Date(`2000-01-01 ${breakTime.start}`);
      const breakEnd = new Date(`2000-01-01 ${breakTime.end}`);
      return current >= breakStart && current < breakEnd;
    });
    
    if (!isBreak) {
      slots.push({
        time: slotTime,
        available: true // This will be checked against existing appointments
      });
    }
    
    current = new Date(current.getTime() + duration);
  }
  
  return slots;
};

export default DoctorAvailability;
