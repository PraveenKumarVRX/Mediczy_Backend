import './models/doctor.model.mariadb.js';
import Doctor from './models/doctor.model.mariadb.js';
import { connectToDb } from './db/mariadb.js';

async function createTestDoctors() {
  try {
    // Connect to database
    await connectToDb();
    console.log('Connected to database...');

    // Create General Practitioner Doctor
    try {
      const gpDoctor = await Doctor.create({
        firstName: 'Dr. Sarah',
        lastName: 'Johnson',
        email: 'doctor@mediczy.com',
        password: 'doctorpass123',
        phoneNumber: '+1555123456',
        specialization: 'General Practitioner',
        experience: 8,
        qualifications: 'MD, MBBS, Family Medicine Residency',
        consultationFee: 150,
        
        // Professional Details
        education: 'Harvard Medical School',
        hospitalAffiliations: 'City General Hospital, MediCenter',
        languages: 'English, Spanish',
        bio: 'Experienced family physician dedicated to providing comprehensive healthcare for patients of all ages.',
        
        // Practice Information  
        clinicName: 'Family Care Clinic',
        clinicAddress: '123 Healthcare Ave, Medical District',
        consultationHours: 'Mon-Fri: 9AM-5PM, Sat: 9AM-2PM',
        
        // Availability
        availableDays: 'Monday,Tuesday,Wednesday,Thursday,Friday,Saturday',
        availableTimeSlots: '09:00-12:00,14:00-17:00',
        
        // Status
        isVerified: true,
        isAvailable: true,
        averageRating: 4.8,
        totalReviews: 127
      });

      console.log('✅ General Practitioner doctor created successfully!');
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        console.log('✅ General Practitioner doctor already exists!');
      } else {
        throw error;
      }
    }

    // Create Cardiologist Doctor
    try {
      const cardioDoctor = await Doctor.create({
        firstName: 'Dr. Michael',
        lastName: 'Chen',
        email: 'cardiologist@mediczy.com',
        password: 'cardiopass123',
        phoneNumber: '+1555234567',
        specialization: 'Cardiologist',
        experience: 12,
        qualifications: 'MD, Cardiology Fellowship, Board Certified',
        consultationFee: 300,
        
        // Professional Details
        education: 'Johns Hopkins Medical School',
        hospitalAffiliations: 'Heart Institute, University Medical Center',
        languages: 'English, Mandarin',
        bio: 'Board-certified cardiologist specializing in preventive cardiology and interventional procedures.',
        
        // Practice Information
        clinicName: 'Advanced Cardiology Center',
        clinicAddress: '456 Heart Lane, Medical Plaza',
        consultationHours: 'Mon-Fri: 8AM-6PM',
        
        // Availability
        availableDays: 'Monday,Tuesday,Wednesday,Thursday,Friday',
        availableTimeSlots: '08:00-12:00,13:00-18:00',
        
        // Status
        isVerified: true,
        isAvailable: true,
        averageRating: 4.9,
        totalReviews: 89
      });

      console.log('✅ Cardiologist doctor created successfully!');
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        console.log('✅ Cardiologist doctor already exists!');
      } else {
        throw error;
      }
    }

    // Create Pediatrician Doctor
    try {
      const pedDoctor = await Doctor.create({
        firstName: 'Dr. Emily',
        lastName: 'Rodriguez',
        email: 'pediatrician@mediczy.com',
        password: 'pedpass123',
        phoneNumber: '+1555345678',
        specialization: 'Pediatrician',
        experience: 6,
        qualifications: 'MD, Pediatrics Residency, Child Development Certification',
        consultationFee: 200,
        
        // Professional Details
        education: 'Stanford Medical School',
        hospitalAffiliations: 'Children\'s Hospital, Pediatric Care Center',
        languages: 'English, Spanish, French',
        bio: 'Dedicated pediatrician focused on comprehensive child healthcare from infancy through adolescence.',
        
        // Practice Information
        clinicName: 'Little Hearts Pediatric Clinic',
        clinicAddress: '789 Kids Care Blvd, Family District',
        consultationHours: 'Mon-Sat: 9AM-6PM',
        
        // Availability
        availableDays: 'Monday,Tuesday,Wednesday,Thursday,Friday,Saturday',
        availableTimeSlots: '09:00-13:00,14:00-18:00',
        
        // Status
        isVerified: true,
        isAvailable: true,
        averageRating: 4.7,
        totalReviews: 156
      });

      console.log('✅ Pediatrician doctor created successfully!');
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        console.log('✅ Pediatrician doctor already exists!');
      } else {
        throw error;
      }
    }

    console.log('');
    console.log('👩‍⚕️ DOCTOR TEST CREDENTIALS:');
    console.log('');
    console.log('🏥 GENERAL PRACTITIONER:');
    console.log('📧 Email: doctor@mediczy.com');
    console.log('🔐 Password: doctorpass123');
    console.log('👤 Name: Dr. Sarah Johnson');
    console.log('🩺 Specialization: General Practitioner');
    console.log('💰 Consultation Fee: $150');
    console.log('');
    console.log('❤️ CARDIOLOGIST:');
    console.log('📧 Email: cardiologist@mediczy.com');
    console.log('🔐 Password: cardiopass123');
    console.log('👤 Name: Dr. Michael Chen');
    console.log('🩺 Specialization: Cardiologist');
    console.log('💰 Consultation Fee: $300');
    console.log('');
    console.log('👶 PEDIATRICIAN:');
    console.log('📧 Email: pediatrician@mediczy.com');
    console.log('🔐 Password: pedpass123');
    console.log('👤 Name: Dr. Emily Rodriguez');
    console.log('🩺 Specialization: Pediatrician');
    console.log('💰 Consultation Fee: $200');
    console.log('');
    console.log('🌐 Doctor Login Endpoint:');
    console.log('   POST https://localhost:9443/api/doctors/login');
    console.log('');
    console.log('📋 Available API Endpoints:');
    console.log('   📝 Register: POST /api/doctors/register');
    console.log('   🔐 Login: POST /api/doctors/login');
    console.log('   👤 Profile: GET /api/doctors/profile');
    console.log('   📊 Available: GET /api/doctors/available');

  } catch (error) {
    console.error('❌ Error creating test doctors:', error);
    if (error.name === 'SequelizeValidationError') {
      console.log('Validation errors:');
      error.errors.forEach(err => {
        console.log(`  - ${err.path}: ${err.message}`);
      });
    }
  }

  process.exit(0);
}

createTestDoctors().catch(console.error);