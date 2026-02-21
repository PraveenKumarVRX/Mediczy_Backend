const { sequelize } = require('./server/models');
const Appointment = require('./server/models/appointment.model.postgres');
const User = require('./server/models/user.model.postgres');

(async () => {
  try {
    const user = await User.findOne({ where: { email: 'user@mediczy.com' } });
    if (!user) {
      console.log('User not found');
      process.exit(1);
    }
    
    console.log('User ID:', user.id);
    
    const appointments = await Appointment.findAll({
      where: { userId: user.id },
      order: [['createdAt', 'DESC']],
      limit: 10
    });
    
    console.log('\n=== Recent Appointments for user@mediczy.com ===');
    appointments.forEach(apt => {
      console.log({
        id: apt.id,
        appointmentDate: apt.appointmentDate,
        appointmentTime: apt.appointmentTime,
        status: apt.status,
        consultationType: apt.consultationType,
        createdAt: apt.createdAt.toISOString()
      });
    });
    
    const feb20Appointments = appointments.filter(apt => {
      const dateStr = apt.appointmentDate;
      return dateStr && dateStr.includes('2026-02-20');
    });
    
    if (feb20Appointments.length > 0) {
      console.log('\n=== Feb 20, 2026 Appointments ===');
      feb20Appointments.forEach(apt => {
        console.log('Found:', apt.id, apt.appointmentDate, apt.appointmentTime, apt.status);
      });
    } else {
      console.log('\nNo appointments found for Feb 20, 2026');
    }
    
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
