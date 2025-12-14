import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import { sequelize } from '../db/mariadb.js';
import userModel from '../models/user.model.intelligent.js';
import Corporate from '../models/corporate.model.mariadb.js';

(async () => {
  try {
    dotenv.config();

    const targetEmail = process.env.CORPORATE_TEST_EMAIL || 'corporate.hr.demo@mediczy.com';
    const targetPassword = process.env.CORPORATE_TEST_PASSWORD || 'Corporate@123';
    const fallbackCorporatePayload = {
      companyName: 'TCS Limited',
      contactPerson: 'Priya Nair',
      email: 'hr@tcs.com',
      phoneNumber: '+91-8067890123',
      alternatePhone: '+91-8067890456',
      industry: 'IT Services',
      employeeCount: 5000,
      gstNumber: '29AAACT2702F1ZJ',
      panNumber: 'AAACT2702F',
      address: {
        line1: 'Prestige Tech Park, Marathahalli',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560037',
      },
      packageType: 'Enterprise',
      packageStartDate: new Date('2025-04-01'),
      packageEndDate: new Date('2026-03-31'),
      packageAmount: 1250000,
      services: [
        'Annual Health Checkup',
        'Telemedicine',
        'Wellness Programs',
        'Mental Health Support',
      ],
      contractDocument: 'https://mediczy-docs.s3.ap-south-1.amazonaws.com/contracts/tcs-enterprise.pdf',
      status: 'Active',
      leadSource: 'Enterprise Sales',
      salesRep: 'Arjun Rao',
      notes: 'Demo corporate seeded for HR login testing',
      billingCycle: 'Yearly',
      paymentMethod: 'Wire Transfer',
      isActive: true,
    };

    await sequelize.authenticate();
    await Corporate.sync();

    let corporate = await Corporate.findOne({ where: { companyName: fallbackCorporatePayload.companyName } });
    if (!corporate) {
      corporate = await Corporate.create(fallbackCorporatePayload);
      console.log('ℹ️  Seeded fallback corporate record for demo use');
    }

    const existingUser = await userModel.findOne({ where: { email: targetEmail } });
    if (existingUser) {
      console.log(`ℹ️  Corporate login already exists for ${targetEmail}`);
      console.log(`   Corporate: ${corporate.companyName} (ID: ${corporate.id})`);
      process.exit(0);
    }

    const hashedPassword = await bcrypt.hash(targetPassword, 10);

    const corporateUser = await userModel.create({
      firstName: corporate.contactPerson || 'Corporate',
      lastName: 'Admin',
      email: targetEmail,
      phoneNumber: corporate.phoneNumber,
      password: hashedPassword,
      role: 'corporate',
      corporateId: corporate.id,
      isAdmin: false,
      isActive: true,
    });

    console.log('✅ Corporate HR login created successfully');
    console.log('----------------------------------------');
    console.log(`Organization : ${corporate.companyName}`);
    console.log(`Corporate ID : ${corporate.id}`);
    console.log(`Login Email  : ${targetEmail}`);
    console.log(`Password     : ${targetPassword}`);
    console.log('Portal URL   : /corporate/login (or https://<your-domain>/corporate/login)');

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to create corporate login:', error.message || error);
    process.exit(1);
  }
})();
