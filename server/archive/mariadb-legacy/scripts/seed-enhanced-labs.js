#!/usr/bin/env node

/**
 * Enhanced Laboratory Database Seeding Script
 * ==========================================
 * 
 * Seeds comprehensive laboratory data with real Indian lab chains
 * and detailed test categories, equipment, and service information.
 */

import { sequelize } from '../db/mariadb.js';
import Lab from '../models/lab.model.enhanced.js';

// Comprehensive Lab Data
const ENHANCED_LAB_DATA = [
  {
    // Dr Lal PathLabs - National Leader
    name: 'Dr Lal PathLabs',
    registrationNumber: 'DL-LAB-1949-001',
    email: 'info@lalpathlabs.com',
    phoneNumber: '+91-11-30081000',
    website: 'https://www.lalpathlabs.com',
    address: {
      street: 'Block E, Sector 18',
      city: 'Rohini',
      state: 'Delhi',
      pincode: '110085',
      country: 'India',
      landmark: 'Near Metro Station'
    },
    services: [
      'Diagnostic Testing',
      'Pathology Services',
      'Radiology & Imaging',
      'Home Sample Collection',
      'Corporate Health Checkups',
      'Preventive Health Packages',
      'Specialized Testing',
      'Digital Reports'
    ],
    testCategories: [
      'clinical_pathology',
      'microbiology',
      'molecular_diagnostics',
      'immunology_serology',
      'histopathology',
      'specialized_testing'
    ],
    equipment: {
      automated_analyzers: [
        'Beckman Coulter DxH 900',
        'Abbott Alinity ci-series',
        'Roche Cobas e801',
        'Sysmex XN-Series'
      ],
      molecular_platforms: [
        'Applied Biosystems 7500',
        'Cepheid GeneXpert',
        'Abbott RealTime PCR'
      ],
      imaging_equipment: [
        'Digital X-Ray Systems',
        'Ultrasound Machines',
        'CT Scan',
        'MRI'
      ],
      specialized: [
        'Flow Cytometer',
        'Mass Spectrometer',
        'Next Generation Sequencer',
        'Digital Pathology System'
      ]
    },
    accreditation: [
      'NABL',
      'CAP',
      'ISO 15189',
      'ISO 9001',
      'NABH'
    ],
    operatingHours: {
      monday: '6:00 AM - 10:00 PM',
      tuesday: '6:00 AM - 10:00 PM',
      wednesday: '6:00 AM - 10:00 PM',
      thursday: '6:00 AM - 10:00 PM',
      friday: '6:00 AM - 10:00 PM',
      saturday: '6:00 AM - 10:00 PM',
      sunday: '7:00 AM - 8:00 PM',
      holidays: 'Emergency services only'
    },
    sampleCollection: {
      walk_in: true,
      home_collection: true,
      appointment_based: true,
      corporate_visits: true,
      emergency_collection: true,
      collection_charges: {
        home_collection: '₹150',
        corporate: 'Custom pricing'
      }
    },
    turnaroundTime: {
      routine_tests: '4-6 hours',
      specialized_tests: '24-48 hours',
      genetic_tests: '7-14 days',
      histopathology: '3-5 days',
      urgent_tests: '1-2 hours',
      culture_tests: '2-7 days'
    },
    digitalFeatures: {
      online_booking: true,
      mobile_app: 'Dr Lal PathLabs Mobile App',
      digital_reports: true,
      sms_alerts: true,
      email_notifications: true,
      whatsapp_reports: true,
      ai_powered_insights: true
    },
    networkInfo: {
      total_centers: 4000,
      cities_covered: 200,
      states_covered: 35,
      countries: ['India', 'Nepal', 'Bangladesh'],
      franchise_model: true,
      partner_hospitals: 500
    },
    qualityMetrics: {
      accuracy_rate: 99.8,
      customer_satisfaction: 4.3,
      report_turnaround: 95.5,
      sample_rejection_rate: 0.2,
      critical_value_notification: '15 minutes'
    },
    staffInfo: {
      pathologists: 150,
      microbiologists: 200,
      technicians: 2500,
      phlebotomists: 3000,
      customer_service: 500,
      total_staff: 6350
    },
    isActive: true,
    isVerified: true,
    featured: true,
    rating: 4.3,
    totalReviews: 25000,
    monthlyTests: 2500000,
    emergencyServices: true,
    homeSampleCollection: true
  },
  
  {
    // SRL Diagnostics - Advanced Technology Leader
    name: 'SRL Diagnostics',
    registrationNumber: 'DL-LAB-1995-002',
    email: 'info@srldiagnostics.com',
    phoneNumber: '+91-124-4982300',
    website: 'https://www.srldiagnostics.com',
    address: {
      street: 'Plot No. 8, Sector 18',
      city: 'Gurgaon',
      state: 'Haryana',
      pincode: '122015',
      country: 'India'
    },
    services: [
      'Clinical Laboratory',
      'Radiology & Imaging',
      'Genomics',
      'Clinical Trials',
      'Wellness Programs',
      'Specialized Testing',
      'Molecular Diagnostics'
    ],
    testCategories: [
      'clinical_pathology',
      'microbiology',
      'molecular_diagnostics',
      'immunology_serology',
      'specialized_testing'
    ],
    equipment: {
      automated_analyzers: [
        'Abbott Architect series',
        'Beckman Coulter AU series',
        'Roche Cobas series'
      ],
      molecular_platforms: [
        'Cepheid GeneXpert',
        'bioMérieux BioFire',
        'Hologic Panther'
      ],
      advanced_technology: [
        'Artificial Intelligence Systems',
        'Laboratory Information Management System',
        'Robotic Sample Processing'
      ]
    },
    accreditation: [
      'NABL',
      'CAP',
      'ISO 15189',
      'CLIA'
    ],
    digitalFeatures: {
      online_booking: true,
      mobile_app: 'SRL Diagnostics App',
      digital_reports: true,
      ai_insights: true,
      telemedicine_integration: true
    },
    networkInfo: {
      total_centers: 500,
      cities_covered: 700,
      reference_labs: 12
    },
    isActive: true,
    isVerified: true,
    featured: true,
    rating: 4.2,
    totalReviews: 18000,
    monthlyTests: 1800000,
    emergencyServices: true,
    homeSampleCollection: true
  },
  
  {
    // Thyrocare - Specialized in Preventive Healthcare
    name: 'Thyrocare Technologies',
    registrationNumber: 'MH-LAB-1996-003',
    email: 'info@thyrocare.com',
    phoneNumber: '+91-22-67791000',
    website: 'https://www.thyrocare.com',
    address: {
      street: 'D-37/1, TTC Industrial Area',
      city: 'Navi Mumbai',
      state: 'Maharashtra',
      pincode: '400709',
      country: 'India'
    },
    services: [
      'Preventive Health Checkups',
      'Thyroid Testing',
      'Diabetes Monitoring',
      'Cardiac Risk Assessment',
      'Cancer Screening',
      'Infection Testing',
      'Nutritional Assessment'
    ],
    testCategories: [
      'clinical_pathology',
      'immunology_serology',
      'specialized_testing'
    ],
    equipment: {
      specialized_platforms: [
        'Fully Automated Thyroid Testing',
        'High-Throughput Analyzers',
        'Robotic Sample Processing'
      ]
    },
    accreditation: [
      'NABL',
      'ISO 15189',
      'ISO 9001'
    ],
    digitalFeatures: {
      online_booking: true,
      mobile_app: 'Thyrocare Mobile App',
      digital_reports: true,
      health_risk_assessment: true
    },
    networkInfo: {
      total_centers: 2000,
      cities_covered: 2000,
      collection_centers: 4000
    },
    isActive: true,
    isVerified: true,
    featured: true,
    rating: 4.1,
    totalReviews: 15000,
    monthlyTests: 2000000,
    emergencyServices: false,
    homeSampleCollection: true
  },
  
  {
    // Metropolis Healthcare - Premium Diagnostics
    name: 'Metropolis Healthcare',
    registrationNumber: 'MH-LAB-1980-004',
    email: 'care@metropolisindia.com',
    phoneNumber: '+91-22-30988888',
    website: 'https://www.metropolisindia.com',
    address: {
      street: '250-D, Udyog Vihar Phase 1',
      city: 'Gurgaon',
      state: 'Haryana',
      pincode: '122016',
      country: 'India'
    },
    services: [
      'Clinical Diagnostics',
      'Radiology',
      'Genomics',
      'Digital Health',
      'Corporate Wellness',
      'Specialized Testing'
    ],
    testCategories: [
      'clinical_pathology',
      'microbiology',
      'molecular_diagnostics',
      'immunology_serology',
      'histopathology'
    ],
    equipment: {
      premium_analyzers: [
        'Siemens Atellica series',
        'Abbott Alinity series',
        'Beckman Coulter DxH series'
      ],
      molecular_diagnostics: [
        'Applied Biosystems QuantStudio',
        'Illumina NextSeq',
        'Cepheid GeneXpert'
      ]
    },
    accreditation: [
      'NABL',
      'CAP',
      'ISO 15189'
    ],
    digitalFeatures: {
      online_booking: true,
      mobile_app: 'TruHealth by Metropolis',
      digital_reports: true,
      ai_powered_insights: true,
      genetic_counseling: true
    },
    networkInfo: {
      total_centers: 4000,
      cities_covered: 220,
      reference_labs: 15
    },
    isActive: true,
    isVerified: true,
    featured: true,
    rating: 4.4,
    totalReviews: 20000,
    monthlyTests: 1500000,
    emergencyServices: true,
    homeSampleCollection: true
  },
  
  {
    // Vijaya Diagnostic Centre - South India Leader
    name: 'Vijaya Diagnostic Centre',
    registrationNumber: 'AP-LAB-1981-005',
    email: 'info@vijayadiagnostic.com',
    phoneNumber: '+91-40-44766666',
    website: 'https://www.vijayadiagnostic.com',
    address: {
      street: '5-9-22, Chapel Road',
      city: 'Hyderabad',
      state: 'Telangana',
      pincode: '500001',
      country: 'India'
    },
    services: [
      'Clinical Laboratory',
      'Radiology & Imaging',
      'Cardiac Testing',
      'Women\'s Health',
      'Pediatric Testing',
      'Genomics'
    ],
    testCategories: [
      'clinical_pathology',
      'microbiology',
      'immunology_serology',
      'molecular_diagnostics'
    ],
    equipment: {
      comprehensive_analyzers: [
        'Roche Cobas series',
        'Abbott Architect',
        'Beckman Coulter'
      ],
      imaging_equipment: [
        '3T MRI',
        '128 Slice CT',
        'Digital Mammography',
        'Color Doppler'
      ]
    },
    accreditation: [
      'NABL',
      'ISO 15189',
      'NABH'
    ],
    digitalFeatures: {
      online_booking: true,
      mobile_app: 'Vijaya Diagnostic App',
      digital_reports: true,
      telemedicine: true
    },
    networkInfo: {
      total_centers: 140,
      cities_covered: 25,
      focus_regions: ['Andhra Pradesh', 'Telangana', 'Tamil Nadu']
    },
    isActive: true,
    isVerified: true,
    featured: true,
    rating: 4.2,
    totalReviews: 12000,
    monthlyTests: 800000,
    emergencyServices: true,
    homeSampleCollection: true
  }
];

// Additional Specialized Labs
const SPECIALIZED_LABS = [
  {
    name: 'Neuberg Diagnostics',
    registrationNumber: 'KA-LAB-2003-006',
    email: 'info@neubergdiagnostics.com',
    phoneNumber: '+91-80-26622244',
    website: 'https://www.neubergdiagnostics.com',
    address: {
      street: '208/1A, 4th Cross, 2nd Stage',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560086',
      country: 'India'
    },
    specialization: 'Genetic Testing & Molecular Diagnostics',
    services: [
      'Genetic Testing',
      'Molecular Diagnostics',
      'Clinical Genomics',
      'Personalized Medicine',
      'Cancer Genomics',
      'Rare Disease Testing'
    ],
    testCategories: ['molecular_diagnostics', 'specialized_testing'],
    rating: 4.3,
    isActive: true,
    isVerified: true,
    featured: true
  },
  
  {
    name: 'Pathkind Diagnostics',
    registrationNumber: 'UP-LAB-2010-007',
    email: 'care@pathkind.com',
    phoneNumber: '+91-11-40101010',
    website: 'https://www.pathkind.com',
    address: {
      street: 'A-304, Logix Technova',
      city: 'Noida',
      state: 'Uttar Pradesh',
      pincode: '201301',
      country: 'India'
    },
    specialization: 'Affordable Diagnostics',
    services: [
      'Routine Diagnostics',
      'Health Checkups',
      'Home Collection',
      'Corporate Health'
    ],
    testCategories: ['clinical_pathology', 'microbiology'],
    rating: 4.0,
    isActive: true,
    isVerified: true,
    featured: false
  },
  
  {
    name: 'Apollo Diagnostics',
    registrationNumber: 'TN-LAB-1996-008',
    email: 'info@apollodiagnostics.in',
    phoneNumber: '+91-44-28296000',
    website: 'https://www.apollodiagnostics.in',
    address: {
      street: '21, Greams Lane',
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600006',
      country: 'India'
    },
    specialization: 'Hospital Chain Diagnostics',
    services: [
      'Clinical Laboratory',
      'Imaging Services',
      'Cardiac Testing',
      'Oncology Testing',
      'Emergency Diagnostics'
    ],
    testCategories: [
      'clinical_pathology',
      'microbiology',
      'immunology_serology',
      'histopathology'
    ],
    rating: 4.5,
    isActive: true,
    isVerified: true,
    featured: true
  }
];

async function seedEnhancedLabData() {
  try {
    console.log('🧬 Starting Enhanced Laboratory Database Seeding...\n');
    
    // Ensure database connection
    await sequelize.authenticate();
    console.log('✅ Database connection established');
    
    // Sync the enhanced lab model
    await Lab.sync({ alter: true });
    console.log('✅ Enhanced lab model synchronized');
    
    // Clear existing data
    await Lab.destroy({ where: {}, truncate: true });
    console.log('✅ Existing lab data cleared');
    
    console.log('\n📊 Seeding major laboratory chains...\n');
    
    // Seed major lab chains
    for (const [index, labData] of ENHANCED_LAB_DATA.entries()) {
      const lab = await Lab.create(labData);
      console.log(`${index + 1}. ✅ Created: ${lab.name}`);
      console.log(`   📍 Location: ${lab.address.city}, ${lab.address.state}`);
      console.log(`   🔬 Test Categories: ${lab.testCategories.length}`);
      console.log(`   ⭐ Rating: ${lab.rating}/5 (${lab.totalReviews} reviews)`);
      console.log(`   📊 Monthly Tests: ${lab.monthlyTests?.toLocaleString()}`);
      console.log(`   🏆 Accreditations: ${lab.accreditation.join(', ')}`);
      console.log(`   📱 Digital Features: ${Object.keys(lab.digitalFeatures).filter(key => lab.digitalFeatures[key]).length} features`);
      console.log('');
    }
    
    console.log('📊 Seeding specialized laboratories...\n');
    
    // Seed specialized labs
    for (const [index, labData] of SPECIALIZED_LABS.entries()) {
      const lab = await Lab.create(labData);
      console.log(`${index + 1}. ✅ Created: ${lab.name}`);
      console.log(`   🎯 Specialization: ${labData.specialization}`);
      console.log(`   📍 Location: ${lab.address.city}, ${lab.address.state}`);
      console.log('');
    }
    
    // Generate statistics
    const totalLabs = await Lab.count();
    const verifiedLabs = await Lab.count({ where: { isVerified: true } });
    const featuredLabs = await Lab.count({ where: { featured: true } });
    const avgRating = await Lab.findAll({
      attributes: [[sequelize.fn('AVG', sequelize.col('rating')), 'avgRating']]
    });
    
    console.log('📈 DATABASE SEEDING COMPLETED');
    console.log('==============================');
    console.log(`📊 Total Laboratories: ${totalLabs}`);
    console.log(`✅ Verified Laboratories: ${verifiedLabs}`);
    console.log(`🌟 Featured Laboratories: ${featuredLabs}`);
    console.log(`⭐ Average Rating: ${parseFloat(avgRating[0].dataValues.avgRating).toFixed(2)}/5`);
    
    console.log('\n🔬 Test Categories Available:');
    Object.keys(Lab.COMPREHENSIVE_TEST_CATEGORIES).forEach((category, index) => {
      console.log(`   ${index + 1}. ${Lab.COMPREHENSIVE_TEST_CATEGORIES[category].name}`);
    });
    
    console.log('\n🏆 Accreditation Types:');
    Lab.ACCREDITATION_TYPES.slice(0, 6).forEach((accreditation, index) => {
      console.log(`   ${index + 1}. ${accreditation}`);
    });
    
    console.log('\n💡 Enhanced Features:');
    console.log('   • Comprehensive test categories with 500+ tests');
    console.log('   • Equipment tracking and capabilities');
    console.log('   • Quality metrics and performance indicators');
    console.log('   • Digital integration features');
    console.log('   • Accreditation and compliance tracking');
    console.log('   • Network and partnership information');
    console.log('   • Turnaround time specifications');
    console.log('   • Sample collection options');
    console.log('   • Staff information and expertise');
    console.log('   • Geographic coverage data');
    
    console.log('\n🎯 Ready for Production Use!');
    
  } catch (error) {
    console.error('❌ Error seeding enhanced lab data:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Export seeding function for use in other scripts
export { seedEnhancedLabData, ENHANCED_LAB_DATA, SPECIALIZED_LABS };

// Run seeding if script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedEnhancedLabData()
    .then(() => {
      console.log('\n✨ Enhanced lab database seeding completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Failed to seed enhanced lab database:', error);
      process.exit(1);
    });
}