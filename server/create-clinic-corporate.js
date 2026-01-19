import { sequelize } from './config/databases.js';
import Hospital from './models/hospital.model.intelligent.js';
import { Corporate } from './models/crm.model.intelligent.js';

(async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected');

    // Create SmartHealth Clinic
    const clinic = await Hospital.create({
      hospitalName: 'SmartHealth Clinic',
      email: 'smarthealthclinics@gmail.com',
      phoneNumber: '+91-9876543210',
      address: '123 Healthcare Avenue, Mumbai, Maharashtra 400001',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      registrationNumber: 'SHC-2026-001',
      hospitalType: 'clinic',
      specialties: ['General Medicine', 'Pediatrics', 'Orthopedics'],
      facilities: ['OPD', 'Diagnostics', 'Pharmacy'],
      isActive: true,
      isVerified: true,
      rating: 4.5,
      totalBeds: 20,
      availableBeds: 15,
      emergencyServices: true,
      ambulanceService: true,
      description: 'Premier healthcare clinic providing comprehensive medical services'
    });

    console.log('✅ Clinic created:', {
      id: clinic.id,
      name: clinic.hospitalName,
      email: clinic.email,
      type: clinic.hospitalType
    });

    // Create My SmartHealth Corporate
    const corporate = await Corporate.create({
      name: 'My SmartHealth',
      email: 'corporate@mysmarthelth.com',
      phoneNumber: '+91-9876543211',
      address: 'Corporate Tower, Mumbai, Maharashtra 400002',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400002',
      industry: 'Technology',
      registrationNumber: 'MSH-CORP-2026-001',
      gstNumber: 'GST-MSH-2026',
      employeeCount: 500,
      contactPerson: {
        name: 'HR Manager',
        email: 'hr@mysmarthelth.com',
        phone: '+91-9876543211',
        designation: 'HR Manager'
      },
      isActive: true,
      membershipTier: 'premium',
      description: 'Technology company focused on healthcare solutions'
    });

    console.log('✅ Corporate created:', {
      id: corporate.id,
      name: corporate.name,
      email: corporate.email,
      employees: corporate.employeeCount
    });

    console.log('\n🎉 Both entities created successfully!');
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
})();
