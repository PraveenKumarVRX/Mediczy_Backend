#!/usr/bin/env node
/**
 * Update Labs with Services
 * Adds realistic services to all labs based on their metadata
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import Lab from '../models/postgres/lab.model.postgres.js';

/**
 * Comprehensive lab services catalog
 */
const LAB_SERVICES = {
  core: [
    { name: 'Pathology', category: 'diagnostic', icon: 'microscope' },
    { name: 'Clinical Laboratory', category: 'diagnostic', icon: 'flask' },
    { name: 'Blood Tests', category: 'diagnostic', icon: 'droplet' },
    { name: 'Home Collection', category: 'service', icon: 'home' }
  ],
  
  imaging: [
    { name: 'Radiology', category: 'imaging', icon: 'scan' },
    { name: 'X-Ray', category: 'imaging', icon: 'x-ray' },
    { name: 'Ultrasound/Sonology', category: 'imaging', icon: 'ultrasound' },
    { name: 'CT Scan', category: 'imaging', icon: 'ct-scan' },
    { name: 'MRI', category: 'imaging', icon: 'mri' },
    { name: 'Mammography', category: 'imaging', icon: 'mammography' },
    { name: 'Digital X-Ray', category: 'imaging', icon: 'digital-xray' }
  ],
  
  specialized: [
    { name: 'Cardiology Tests', category: 'specialized', icon: 'heart' },
    { name: 'Diabetes Screening', category: 'specialized', icon: 'diabetes' },
    { name: 'Thyroid Function Tests', category: 'specialized', icon: 'thyroid' },
    { name: 'Liver Function Tests', category: 'specialized', icon: 'liver' },
    { name: 'Kidney Function Tests', category: 'specialized', icon: 'kidney' },
    { name: 'Hormone Tests', category: 'specialized', icon: 'hormone' },
    { name: 'Cancer Screening', category: 'specialized', icon: 'cancer' },
    { name: 'Genetic Testing', category: 'specialized', icon: 'dna' }
  ],
  
  additional: [
    { name: 'Health Checkup Packages', category: 'service', icon: 'package' },
    { name: 'Corporate Health Packages', category: 'service', icon: 'corporate' },
    { name: 'Women Health Packages', category: 'service', icon: 'women' },
    { name: 'Online Reports', category: 'service', icon: 'report' },
    { name: 'Same Day Results', category: 'service', icon: 'fast' },
    { name: 'NABL Accredited', category: 'quality', icon: 'certificate' }
  ]
};

/**
 * Assign services based on lab type/discipline
 */
function getServicesForLab(labName, discipline, rating) {
  const services = [];
  const nameLower = labName.toLowerCase();
  const ratingNum = parseFloat(rating);
  
  // Special case: Redcliffe labs only have pathology and home collection
  if (nameLower.includes('redcliffe') || nameLower.includes('radcliffe')) {
    services.push(
      LAB_SERVICES.core[0], // Pathology
      LAB_SERVICES.core[3]  // Home Collection
    );
    return services;
  }
  
  // All labs get core services
  services.push(...LAB_SERVICES.core);
  
  // Add imaging services based on lab capabilities
  // Higher-rated labs or specific chains get more imaging
  if (ratingNum >= 4.5 || nameLower.includes('diagnostic') || nameLower.includes('imaging')) {
    // Full imaging suite for premium labs
    services.push(...LAB_SERVICES.imaging);
  } else if (ratingNum >= 4.2) {
    // Basic imaging for mid-tier labs
    services.push(
      LAB_SERVICES.imaging[0], // Radiology
      LAB_SERVICES.imaging[1], // X-Ray
      LAB_SERVICES.imaging[2]  // Ultrasound
    );
  } else {
    // Minimum imaging for smaller labs
    services.push(
      LAB_SERVICES.imaging[1], // X-Ray
      LAB_SERVICES.imaging[2]  // Ultrasound
    );
  }
  
  // Add specialized tests based on rating
  if (ratingNum >= 4.5) {
    // Premium labs get all specialized tests
    services.push(...LAB_SERVICES.specialized);
  } else if (ratingNum >= 4.0) {
    // Mid-tier labs get common specialized tests
    services.push(
      LAB_SERVICES.specialized[0], // Cardiology
      LAB_SERVICES.specialized[1], // Diabetes
      LAB_SERVICES.specialized[2], // Thyroid
      LAB_SERVICES.specialized[3], // Liver
      LAB_SERVICES.specialized[4]  // Kidney
    );
  } else {
    // Basic labs get essential specialized tests
    services.push(
      LAB_SERVICES.specialized[1], // Diabetes
      LAB_SERVICES.specialized[2]  // Thyroid
    );
  }
  
  // Additional services
  services.push(...LAB_SERVICES.additional.slice(0, 4)); // Health packages, online reports, same day
  
  // Premium labs get NABL accreditation
  if (ratingNum >= 4.3) {
    services.push(LAB_SERVICES.additional[5]); // NABL Accredited
  }
  
  return services;
}

/**
 * Update all labs with services
 */
async function updateLabServices() {
  console.log('🔧 Starting Lab Services Update...\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Get all labs
    const labs = await Lab.findAll({
      attributes: ['id', 'name', 'rating', 'metadata']
    });

    console.log(`📊 Found ${labs.length} labs to update\n`);

    let updated = 0;
    const BATCH_SIZE = 100;

    for (let i = 0; i < labs.length; i++) {
      const lab = labs[i];
      const discipline = lab.metadata?.discipline || 'Diagnostic Lab';
      const services = getServicesForLab(lab.name, discipline, lab.rating);

      await lab.update({ services });
      updated++;

      if (updated % BATCH_SIZE === 0) {
        console.log(`✅ Updated ${updated}/${labs.length} labs with services...`);
      }
    }

    console.log(`\n✅ Updated all ${updated} labs with services\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Lab Services Update Complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Show sample lab with services
    const sampleLab = await Lab.findOne({
      where: { id: 1 },
      attributes: ['name', 'rating', 'services']
    });

    console.log('📋 Sample Lab Services:\n');
    console.log(`   Lab: ${sampleLab.name}`);
    console.log(`   Rating: ${sampleLab.rating}/5.0`);
    console.log(`   Services (${sampleLab.services.length}):`);
    sampleLab.services.forEach(service => {
      console.log(`      - ${service.name} (${service.category})`);
    });
    console.log('');

    // Show statistics
    const stats = await sequelize.query(`
      SELECT 
        jsonb_array_length(services) as service_count,
        COUNT(*) as lab_count
      FROM labs
      WHERE services IS NOT NULL AND services != '[]'::jsonb
      GROUP BY service_count
      ORDER BY service_count DESC
      LIMIT 5
    `, { type: sequelize.QueryTypes.SELECT });

    console.log('📊 Service Distribution:\n');
    stats.forEach(({ service_count, lab_count }) => {
      console.log(`   ${lab_count} labs with ${service_count} services`);
    });
    console.log('');

  } catch (error) {
    console.error('❌ Update failed:', error);
    throw error;
  }
}

/**
 * Run updater if called directly
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  updateLabServices()
    .then(() => {
      console.log('✅ Update completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Update failed:', error);
      process.exit(1);
    });
}

export default updateLabServices;
