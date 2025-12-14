import bcrypt from 'bcrypt';
import userModel from '../models/user.model.intelligent.js';
import { sequelize } from '../db/mariadb.js';

const oldEmail = 'corporate.hr.demo@mediczy.com';
const newEmail = 'corporate@mediqzy.com';
const newPassword = 'HrPass123';

(async () => {
  try {
    const user = await userModel.findOne({ where: { email: oldEmail } });
    if (!user) {
      console.log('❌ User not found with email:', oldEmail);
      process.exit(1);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await user.update({ email: newEmail, password: hashedPassword });

    console.log('✅ Corporate credentials updated successfully');
    console.log('----------------------------------------');
    console.log('Email   : ' + newEmail);
    console.log('Password: ' + newPassword);
    console.log('----------------------------------------');

    await sequelize.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message || err);
    process.exit(1);
  }
})();
