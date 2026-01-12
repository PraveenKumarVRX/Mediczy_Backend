/**
 * Lab Tests Seeder
 * Seeds common medical laboratory tests and diagnostic centers
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import Lab from '../models/postgres/lab.model.postgres.js';
import bcrypt from 'bcryptjs';

/**
 * Common Lab Test Categories
 */
const LAB_TEST_CATALOG = {
  hematology: [
    { name: 'Complete Blood Count (CBC)', price: 350, duration: '4-6 hours', code: 'CBC001' },
    { name: 'ESR (Erythrocyte Sedimentation Rate)', price: 200, duration: '2-4 hours', code: 'ESR001' },
    { name: 'Hemoglobin Test', price: 150, duration: '2-4 hours', code: 'HGB001' },
    { name: 'Blood Grouping & RH Typing', price: 250, duration: '2-4 hours', code: 'BGT001' },
    { name: 'Platelet Count', price: 200, duration: '4-6 hours', code: 'PLT001' }
  ],
  biochemistry: [
    { name: 'Lipid Profile', price: 600, duration: '6-8 hours', code: 'LIP001' },
    { name: 'Liver Function Test (LFT)', price: 700, duration: '6-8 hours', code: 'LFT001' },
    { name: 'Kidney Function Test (KFT)', price: 650, duration: '6-8 hours', code: 'KFT001' },
    { name: 'Blood Sugar (Fasting)', price: 120, duration: '4-6 hours', code: 'BSF001' },
    { name: 'Blood Sugar (Random)', price: 120, duration: '2-4 hours', code: 'BSR001' },
    { name: 'HbA1c (Glycated Hemoglobin)', price: 450, duration: '6-8 hours', code: 'HBA001' },
    { name: 'Uric Acid Test', price: 200, duration: '4-6 hours', code: 'URC001' },
    { name: 'Serum Creatinine', price: 200, duration: '4-6 hours', code: 'CRT001' },
    { name: 'Blood Urea Nitrogen (BUN)', price: 180, duration: '4-6 hours', code: 'BUN001' },
    { name: 'Total Protein', price: 220, duration: '4-6 hours', code: 'TPR001' },
    { name: 'Serum Albumin', price: 200, duration: '4-6 hours', code: 'ALB001' }
  ],
  thyroid: [
    { name: 'Thyroid Profile (Total)', price: 800, duration: '8-12 hours', code: 'THY001' },
    { name: 'T3 (Triiodothyronine)', price: 300, duration: '6-8 hours', code: 'T3001' },
    { name: 'T4 (Thyroxine)', price: 300, duration: '6-8 hours', code: 'T4001' },
    { name: 'TSH (Thyroid Stimulating Hormone)', price: 350, duration: '6-8 hours', code: 'TSH001' }
  ],
  hormones: [
    { name: 'Testosterone (Total)', price: 500, duration: '12-24 hours', code: 'TST001' },
    { name: 'Estradiol', price: 550, duration: '12-24 hours', code: 'EST001' },
    { name: 'Prolactin', price: 450, duration: '8-12 hours', code: 'PRL001' },
    { name: 'Cortisol', price: 500, duration: '8-12 hours', code: 'COR001' },
    { name: 'Insulin (Fasting)', price: 450, duration: '8-12 hours', code: 'INS001' }
  ],
  vitamins: [
    { name: 'Vitamin D (25-OH)', price: 1200, duration: '24-48 hours', code: 'VTD001' },
    { name: 'Vitamin B12', price: 800, duration: '12-24 hours', code: 'VTB001' },
    { name: 'Folic Acid', price: 700, duration: '12-24 hours', code: 'FOL001' },
    { name: 'Iron Studies', price: 900, duration: '8-12 hours', code: 'IRN001' }
  ],
  infection: [
    { name: 'Malaria Antigen Test', price: 300, duration: '2-4 hours', code: 'MAL001' },
    { name: 'Dengue NS1 Antigen', price: 600, duration: '4-6 hours', code: 'DEN001' },
    { name: 'Typhoid IgM/IgG', price: 450, duration: '6-8 hours', code: 'TYP001' },
    { name: 'HIV I & II (ELISA)', price: 500, duration: '12-24 hours', code: 'HIV001' },
    { name: 'Hepatitis B Surface Antigen', price: 400, duration: '6-8 hours', code: 'HBV001' },
    { name: 'Hepatitis C Antibody', price: 500, duration: '6-8 hours', code: 'HCV001' },
    { name: 'COVID-19 RT-PCR', price: 800, duration: '12-24 hours', code: 'COV001' },
    { name: 'COVID-19 Rapid Antigen', price: 300, duration: '30 minutes', code: 'COV002' }
  ],
  urine: [
    { name: 'Urine Routine & Microscopy', price: 200, duration: '2-4 hours', code: 'URN001' },
    { name: 'Urine Culture & Sensitivity', price: 600, duration: '48-72 hours', code: 'URC001' },
    { name: 'Urine Pregnancy Test', price: 150, duration: '30 minutes', code: 'UPG001' }
  ],
  packages: [
    { name: 'Basic Health Checkup', price: 2500, duration: '24 hours', code: 'PKG001', includes: ['CBC', 'LFT', 'KFT', 'Lipid Profile', 'Blood Sugar'] },
    { name: 'Diabetes Package', price: 1800, duration: '24 hours', code: 'PKG002', includes: ['FBS', 'PPBS', 'HbA1c', 'Urine Sugar', 'Kidney Profile'] },
    { name: 'Thyroid Package', price: 1200, duration: '24 hours', code: 'PKG003', includes: ['T3', 'T4', 'TSH'] },
    { name: 'Full Body Checkup', price: 5000, duration: '48 hours', code: 'PKG004', includes: ['CBC', 'LFT', 'KFT', 'Lipid', 'Thyroid', 'Vitamin D', 'HbA1c'] },
    { name: 'Women Wellness Package', price: 4500, duration: '48 hours', code: 'PKG005', includes: ['CBC', 'Thyroid', 'Iron', 'Vitamin D', 'B12', 'Calcium', 'Pap Smear'] },
    { name: 'Cardiac Risk Assessment', price: 3500, duration: '24 hours', code: 'PKG006', includes: ['Lipid Profile', 'hs-CRP', 'Homocysteine', 'LDH', 'CPK-MB'] }
  ]
};

/**
 * Sample Diagnostic Labs
 */
const SAMPLE_LABS = [
  {
    name: 'PathLabs Diagnostic Center',
    email: 'contact@pathlabs.com',
    password: 'Lab123!@#',
    phoneNumber: '+91-9876543210',
    alternatePhone: '+91-9876543211',
    address: {
      street: '123 MG Road',
      city: 'Bangalore',
      state: 'Karnataka',
      zipCode: '560001',
      country: 'India',
      coordinates: { lat: 12.9716, lng: 77.5946 }
    },
    accreditation: 'NABL, CAP',
    accreditationNumber: 'NABL-2024-001',
    licenseNumber: 'LAB-KA-2024-001',
    facilities: ['home-collection', 'urgent', 'online-reports', 'parking', 'wheelchair-access'],
    rating: 4.5,
    isVerified: true,
    featured: true,
    operatingHours: {
      monday: { open: '07:00', close: '20:00', is24Hour: false },
      tuesday: { open: '07:00', close: '20:00', is24Hour: false },
      wednesday: { open: '07:00', close: '20:00', is24Hour: false },
      thursday: { open: '07:00', close: '20:00', is24Hour: false },
      friday: { open: '07:00', close: '20:00', is24Hour: false },
      saturday: { open: '07:00', close: '18:00', is24Hour: false },
      sunday: { open: '08:00', close: '14:00', is24Hour: false }
    }
  },
  {
    name: 'Dr. Lal PathLab',
    email: 'info@lalpathlabs.com',
    password: 'Lab123!@#',
    phoneNumber: '+91-9876543212',
    alternatePhone: '+91-9876543213',
    address: {
      street: '456 Commercial Street',
      city: 'Bangalore',
      state: 'Karnataka',
      zipCode: '560002',
      country: 'India',
      coordinates: { lat: 12.9780, lng: 77.6094 }
    },
    accreditation: 'NABL, ISO 9001:2015',
    accreditationNumber: 'NABL-2024-002',
    licenseNumber: 'LAB-KA-2024-002',
    facilities: ['home-collection', 'urgent', 'online-reports', 'parking'],
    rating: 4.7,
    isVerified: true,
    featured: true,
    operatingHours: {
      monday: { open: '06:30', close: '21:00', is24Hour: false },
      tuesday: { open: '06:30', close: '21:00', is24Hour: false },
      wednesday: { open: '06:30', close: '21:00', is24Hour: false },
      thursday: { open: '06:30', close: '21:00', is24Hour: false },
      friday: { open: '06:30', close: '21:00', is24Hour: false },
      saturday: { open: '06:30', close: '19:00', is24Hour: false },
      sunday: { open: '07:00', close: '15:00', is24Hour: false }
    }
  },
  {
    name: 'Thyrocare Technologies',
    email: 'care@thyrocare.com',
    password: 'Lab123!@#',
    phoneNumber: '+91-9876543214',
    address: {
      street: '789 Koramangala',
      city: 'Bangalore',
      state: 'Karnataka',
      zipCode: '560034',
      country: 'India',
      coordinates: { lat: 12.9352, lng: 77.6245 }
    },
    accreditation: 'NABL, CAP, ISO 15189',
    accreditationNumber: 'NABL-2024-003',
    licenseNumber: 'LAB-KA-2024-003',
    facilities: ['home-collection', 'online-reports', 'express-delivery'],
    rating: 4.3,
    isVerified: true,
    featured: false,
    operatingHours: {
      monday: { open: '08:00', close: '19:00', is24Hour: false },
      tuesday: { open: '08:00', close: '19:00', is24Hour: false },
      wednesday: { open: '08:00', close: '19:00', is24Hour: false },
      thursday: { open: '08:00', close: '19:00', is24Hour: false },
      friday: { open: '08:00', close: '19:00', is24Hour: false },
      saturday: { open: '08:00', close: '17:00', is24Hour: false },
      sunday: { open: '09:00', close: '13:00', is24Hour: false }
    }
  },
  {
    name: 'Apollo Diagnostics',
    email: 'diagnostics@apollo.com',
    password: 'Lab123!@#',
    phoneNumber: '+91-9876543215',
    alternatePhone: '+91-9876543216',
    address: {
      street: '101 Bannerghatta Road',
      city: 'Bangalore',
      state: 'Karnataka',
      zipCode: '560076',
      country: 'India',
      coordinates: { lat: 12.9034, lng: 77.5965 }
    },
    accreditation: 'NABL, CAP, JCI',
    accreditationNumber: 'NABL-2024-004',
    licenseNumber: 'LAB-KA-2024-004',
    facilities: ['home-collection', 'urgent', 'online-reports', 'parking', 'wheelchair-access', '24x7'],
    rating: 4.8,
    isVerified: true,
    featured: true,
    operatingHours: {
      monday: { is24Hour: true },
      tuesday: { is24Hour: true },
      wednesday: { is24Hour: true },
      thursday: { is24Hour: true },
      friday: { is24Hour: true },
      saturday: { is24Hour: true },
      sunday: { is24Hour: true }
    }
  },
  {
    name: 'SRL Diagnostics',
    email: 'info@srldiagnostics.com',
    password: 'Lab123!@#',
    phoneNumber: '+91-9876543217',
    address: {
      street: '234 Whitefield Main Road',
      city: 'Bangalore',
      state: 'Karnataka',
      zipCode: '560066',
      country: 'India',
      coordinates: { lat: 12.9698, lng: 77.7499 }
    },
    accreditation: 'NABL, ISO 9001:2015',
    accreditationNumber: 'NABL-2024-005',
    licenseNumber: 'LAB-KA-2024-005',
    facilities: ['home-collection', 'online-reports', 'parking'],
    rating: 4.4,
    isVerified: true,
    featured: false,
    operatingHours: {
      monday: { open: '07:30', close: '20:00', is24Hour: false },
      tuesday: { open: '07:30', close: '20:00', is24Hour: false },
      wednesday: { open: '07:30', close: '20:00', is24Hour: false },
      thursday: { open: '07:30', close: '20:00', is24Hour: false },
      friday: { open: '07:30', close: '20:00', is24Hour: false },
      saturday: { open: '07:30', close: '18:00', is24Hour: false },
      sunday: { open: '08:00', close: '14:00', is24Hour: false }
    }
  }
];

/**
 * Build complete test catalog
 */
function buildTestCatalog() {
  const catalog = {};
  
  Object.entries(LAB_TEST_CATALOG).forEach(([category, tests]) => {
    catalog[category] = tests;
  });
  
  return catalog;
}

/**
 * Build services array (flattened test list)
 */
function buildServicesArray() {
  const services = [];
  
  Object.entries(LAB_TEST_CATALOG).forEach(([category, tests]) => {
    tests.forEach(test => {
      services.push({
        ...test,
        category
      });
    });
  });
  
  return services;
}

/**
 * Seed labs into database
 */
export async function seedLabs() {
  console.log('🧪 Starting Lab Tests Seeder...\n');
  
  try {
    // Check if labs already exist
    const existingCount = await Lab.count();
    
    if (existingCount > 0) {
      console.log(`⚠️  Found ${existingCount} existing labs in database`);
      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      // For non-interactive mode, skip if data exists
      console.log('ℹ️  Skipping seeding (labs already exist)\n');
      return;
    }
    
    const testCatalog = buildTestCatalog();
    const services = buildServicesArray();
    
    console.log(`📊 Test Catalog Summary:`);
    Object.entries(testCatalog).forEach(([category, tests]) => {
      console.log(`   - ${category}: ${tests.length} tests`);
    });
    console.log(`   Total Tests: ${services.length}\n`);
    
    // Hash password
    const hashedPassword = await bcrypt.hash('Lab123!@#', 10);
    
    // Create labs
    for (const labData of SAMPLE_LABS) {
      const lab = await Lab.create({
        ...labData,
        password: hashedPassword,
        status: 'active',  // Set status to active
        testCatalog,
        services
      });
      
      console.log(`✅ Created: ${lab.name} (ID: ${lab.id})`);
      console.log(`   - Email: ${lab.email}`);
      console.log(`   - Tests: ${services.length}`);
      console.log(`   - Rating: ${lab.rating}/5.0`);
      console.log(`   - Facilities: ${lab.facilities.join(', ')}\n`);
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Lab Seeding Complete!');
    console.log(`📍 Created ${SAMPLE_LABS.length} diagnostic labs`);
    console.log(`🧬 Each lab has ${services.length} tests available`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('🔐 Lab Login Credentials:');
    console.log('   Email: Any lab email from above');
    console.log('   Password: Lab123!@#\n');
    
  } catch (error) {
    console.error('❌ Error seeding labs:', error);
    throw error;
  }
}

/**
 * Run seeder if called directly
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  seedLabs()
    .then(() => {
      console.log('✅ Seeder completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Seeder failed:', error);
      process.exit(1);
    });
}

export default seedLabs;
