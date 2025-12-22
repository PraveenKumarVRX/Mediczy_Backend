import { DataTypes } from 'sequelize';
import { sequelize } from '../db/mariadb.js';

const Appointment = sequelize.define('Appointment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // Patient Information
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  patientName: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  patientEmail: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  patientPhone: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  
  // Doctor Information
  doctorId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'doctors',
      key: 'id'
    }
  },
  doctorName: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  specialization: {
    type: DataTypes.STRING(100)
  },
  
  // Appointment Details
  appointmentDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    validate: {
      isDate: true,
      isAfterToday(value) {
        if (new Date(value) < new Date().setHours(0, 0, 0, 0)) {
          throw new Error('Appointment date must be in the future');
        }
      }
    }
  },
  appointmentTime: {
    type: DataTypes.TIME,
    allowNull: false
  },
  duration: {
    type: DataTypes.INTEGER, // in minutes (multiples of 15, max 60)
    defaultValue: 15,
    validate: {
      min: 15,
      max: 60,
      isMultipleOf15(value) {
        if (value % 15 !== 0) {
          throw new Error('Duration must be in multiples of 15 minutes (15, 30, 45, or 60)');
        }
      }
    }
  },
  
  // Type & Status (simplified to online/in-person)
  consultationType: {
    type: DataTypes.ENUM('online', 'in-person'),
    defaultValue: 'online'
  },
  status: {
    type: DataTypes.ENUM(
      'pending',      // Waiting for doctor to accept
      'accepted',     // Doctor accepted, waiting for payment
      'scheduled',    // Legacy - same as pending
      'confirmed',    // Payment received, appointment confirmed
      'in-progress',  // Video call in progress
      'completed',    // Consultation completed
      'cancelled',    // Cancelled by patient/doctor
      'rejected',     // Rejected by doctor
      'no-show',      // Patient didn't show up
      'rescheduled'   // Rescheduled to another time
    ),
    defaultValue: 'pending'
  },
  
  // Payment Information
  consultationFee: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: 0
    }
  },
  paymentStatus: {
    type: DataTypes.ENUM('pending', 'paid', 'refunded', 'failed'),
    defaultValue: 'pending'
  },
  paymentMethod: {
    type: DataTypes.STRING(50) // razorpay, stripe, cash, etc.
  },
  transactionId: {
    type: DataTypes.STRING(255),
    unique: true
  },
  
  // Additional Information
  symptoms: {
    type: DataTypes.TEXT
  },
  reason: {
    type: DataTypes.TEXT
  },
  notes: {
    type: DataTypes.TEXT // Doctor's notes after consultation
  },
  prescription: {
    type: DataTypes.TEXT // JSON string or link to prescription
  },
  
  // Meeting Information
  meetingLink: {
    type: DataTypes.STRING(500)
  },
  meetingId: {
    type: DataTypes.STRING(255)
  },
  recordingUrl: {
    type: DataTypes.STRING(500)
  },
  
  // Notifications
  reminderSent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  reminderSentAt: {
    type: DataTypes.DATE
  },
  
  // Cancellation
  cancelledBy: {
    type: DataTypes.ENUM('patient', 'doctor', 'admin'),
    allowNull: true
  },
  cancellationReason: {
    type: DataTypes.TEXT
  },
  cancelledAt: {
    type: DataTypes.DATE
  },
  
  // Rescheduling
  rescheduledFrom: {
    type: DataTypes.INTEGER, // Reference to original appointment ID
    allowNull: true
  },
  rescheduledTo: {
    type: DataTypes.INTEGER, // Reference to new appointment ID
    allowNull: true
  },
  
  // Rating & Feedback
  rating: {
    type: DataTypes.INTEGER,
    validate: {
      min: 1,
      max: 5
    }
  },
  feedback: {
    type: DataTypes.TEXT
  }
}, {
  timestamps: true,
  tableName: 'appointments',
  indexes: [
    {
      fields: ['userId']
    },
    {
      fields: ['doctorId']
    },
    {
      fields: ['appointmentDate', 'appointmentTime']
    },
    {
      fields: ['status']
    },
    {
      fields: ['paymentStatus']
    }
  ]
});

// Instance methods
Appointment.prototype.canBeCancelled = function() {
  const appointmentDateTime = new Date(`${this.appointmentDate} ${this.appointmentTime}`);
  const now = new Date();
  const hoursDifference = (appointmentDateTime - now) / (1000 * 60 * 60);
  
  return hoursDifference > 2 && ['scheduled', 'confirmed'].includes(this.status);
};

Appointment.prototype.canBeRescheduled = function() {
  return this.canBeCancelled();
};

Appointment.prototype.isUpcoming = function() {
  const appointmentDateTime = new Date(`${this.appointmentDate} ${this.appointmentTime}`);
  return appointmentDateTime > new Date() && ['scheduled', 'confirmed'].includes(this.status);
};

Appointment.prototype.isPast = function() {
  const appointmentDateTime = new Date(`${this.appointmentDate} ${this.appointmentTime}`);
  return appointmentDateTime < new Date();
};

export default Appointment;
