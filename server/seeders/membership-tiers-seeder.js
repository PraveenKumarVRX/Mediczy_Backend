/**
 * Membership Tiers Seeder
 * Seeds membership plans with family member limits
 */

import { MembershipPlan } from '../models/postgres/membershipPlan.model.postgres.js';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';

/**
 * Membership Plans Configuration
 */
const MEMBERSHIP_PLANS = [
  {
    name: 'Individual Plan',
    code: 'INDIVIDUAL',
    description: 'Basic healthcare access for individual users',
    type: 'individual',
    price: 0.00,
    discountedPrice: null,
    durationMonths: 12,
    features: {
      familyMembers: {
        maxMembers: 0,
        allowedRelations: [],
        description: 'No family members allowed'
      },
      consultations: {
        videoCalls: 5,
        inPerson: 2,
        chat: 'unlimited'
      },
      healthRecords: {
        storage: '500MB',
        reports: 'unlimited'
      },
      labTests: {
        discount: '5%',
        homeCollection: false
      },
      prescriptions: {
        digital: true,
        homeDelivery: false
      }
    },
    benefits: [
      '5 video consultations per month',
      '2 in-person consultations per month',
      'Unlimited chat with doctors',
      '500MB health record storage',
      '5% discount on lab tests',
      'Digital prescriptions',
      'Basic health tracking'
    ],
    limitations: {
      familyMembers: 'No family members allowed',
      labTests: 'No home collection',
      prescriptions: 'No home delivery'
    },
    maxUsers: null,
    isActive: true,
    isFeatured: false,
    sortOrder: 1,
    metadata: {
      color: '#3B82F6',
      icon: 'user',
      popularityRank: 3
    }
  },
  {
    name: 'Couple Plan',
    code: 'COUPLE',
    description: 'Healthcare coverage for you and your partner',
    type: 'couple',
    price: 2999.00,
    discountedPrice: 2499.00,
    durationMonths: 12,
    features: {
      familyMembers: {
        maxMembers: 1,
        allowedRelations: ['spouse', 'partner'],
        description: 'Add your spouse or partner'
      },
      consultations: {
        videoCalls: 15,
        inPerson: 6,
        chat: 'unlimited'
      },
      healthRecords: {
        storage: '2GB',
        reports: 'unlimited'
      },
      labTests: {
        discount: '15%',
        homeCollection: true,
        freeTests: 2
      },
      prescriptions: {
        digital: true,
        homeDelivery: true,
        discount: '10%'
      },
      emergencySupport: {
        ambulance: '24/7',
        priorityBooking: true
      }
    },
    benefits: [
      'Add 1 family member (spouse/partner)',
      '15 video consultations per month',
      '6 in-person consultations per month',
      'Unlimited chat with doctors',
      '2GB health record storage',
      '15% discount on all lab tests',
      'Free home sample collection',
      '2 free lab tests per year',
      'Medicine home delivery with 10% discount',
      '24/7 emergency ambulance support',
      'Priority appointment booking',
      'Personalized health reports'
    ],
    limitations: {
      familyMembers: 'Maximum 1 member (spouse/partner only)'
    },
    maxUsers: null,
    isActive: true,
    isFeatured: true,
    sortOrder: 2,
    metadata: {
      color: '#8B5CF6',
      icon: 'users',
      badge: 'Popular',
      popularityRank: 1
    }
  },
  {
    name: 'Family Plan',
    code: 'FAMILY',
    description: 'Comprehensive healthcare for your entire family',
    type: 'family',
    price: 5999.00,
    discountedPrice: 4999.00,
    durationMonths: 12,
    features: {
      familyMembers: {
        maxMembers: 4,
        allowedRelations: ['spouse', 'partner', 'son', 'daughter', 'child'],
        description: 'Add up to 4 family members (spouse and children)'
      },
      consultations: {
        videoCalls: 30,
        inPerson: 12,
        chat: 'unlimited',
        specialists: 6
      },
      healthRecords: {
        storage: '10GB',
        reports: 'unlimited',
        sharedAccess: true
      },
      labTests: {
        discount: '25%',
        homeCollection: true,
        freeTests: 6
      },
      prescriptions: {
        digital: true,
        homeDelivery: true,
        discount: '20%'
      },
      emergencySupport: {
        ambulance: '24/7',
        priorityBooking: true,
        telemedicine: true
      },
      wellness: {
        aiHealthAssistant: true,
        dietPlans: true,
        exercisePlans: true,
        mentalHealth: '3 sessions'
      }
    },
    benefits: [
      'Add up to 4 family members',
      '30 video consultations per month',
      '12 in-person consultations per month',
      '6 specialist consultations per year',
      'Unlimited chat with doctors',
      '10GB shared health record storage',
      '25% discount on all lab tests',
      'Free home sample collection',
      '6 free lab tests per year',
      'Medicine home delivery with 20% discount',
      '24/7 emergency services',
      'AI health assistant',
      'Personalized diet & exercise plans',
      '3 mental health counseling sessions',
      'Annual health checkup for all members',
      'Health insurance coordination'
    ],
    limitations: {
      familyMembers: 'Maximum 4 members (immediate family only)'
    },
    maxUsers: null,
    isActive: true,
    isFeatured: true,
    sortOrder: 3,
    metadata: {
      color: '#10B981',
      icon: 'home',
      badge: 'Best Value',
      popularityRank: 2
    }
  },
  {
    name: 'Corporate Plan',
    code: 'CORPORATE',
    description: 'Enterprise healthcare solutions for organizations',
    type: 'corporate',
    price: 9999.00,
    discountedPrice: 8499.00,
    durationMonths: 12,
    features: {
      familyMembers: {
        maxMembers: 6,
        allowedRelations: ['spouse', 'partner', 'son', 'daughter', 'child', 'father', 'mother', 'dependent'],
        description: 'Add up to 6 dependents including parents'
      },
      consultations: {
        videoCalls: 50,
        inPerson: 20,
        chat: 'unlimited',
        specialists: 12,
        secondOpinion: 3
      },
      healthRecords: {
        storage: '50GB',
        reports: 'unlimited',
        sharedAccess: true,
        analytics: true
      },
      labTests: {
        discount: '30%',
        homeCollection: true,
        freeTests: 12,
        corporatePackages: true
      },
      prescriptions: {
        digital: true,
        homeDelivery: true,
        discount: '25%'
      },
      emergencySupport: {
        ambulance: '24/7',
        priorityBooking: true,
        telemedicine: true,
        dedicatedLine: true
      },
      wellness: {
        aiHealthAssistant: true,
        dietPlans: true,
        exercisePlans: true,
        mentalHealth: '12 sessions',
        wellnessChallenges: true
      },
      corporate: {
        hrDashboard: true,
        healthAnalytics: true,
        claimsManagement: true,
        dedicatedSupport: true
      }
    },
    benefits: [
      'Add up to 6 family members (including parents)',
      '50 video consultations per month',
      '20 in-person consultations per month',
      '12 specialist consultations per year',
      '3 second opinion consultations',
      'Unlimited chat with doctors',
      '50GB health record storage',
      'Advanced health analytics',
      '30% discount on all lab tests',
      'Free home sample collection',
      '12 free lab tests per year',
      'Corporate health packages',
      'Medicine home delivery with 25% discount',
      '24/7 dedicated emergency line',
      'AI health assistant',
      'Comprehensive wellness programs',
      '12 mental health counseling sessions',
      'Quarterly health checkups',
      'Health insurance coordination',
      'HR dashboard & analytics',
      'Dedicated account manager',
      'Priority claims processing'
    ],
    limitations: {},
    maxUsers: null,
    isActive: true,
    isFeatured: true,
    sortOrder: 4,
    metadata: {
      color: '#F59E0B',
      icon: 'briefcase',
      badge: 'Premium',
      popularityRank: 4
    }
  }
];

/**
 * Seed membership plans
 */
export async function seedMembershipTiers() {
  console.log('👥 Starting Membership Tiers Seeder...\n');
  
  try {
    // Check if plans already exist
    const existingCount = await MembershipPlan.count();
    
    if (existingCount > 0) {
      console.log(`⚠️  Found ${existingCount} existing membership plans in database`);
      console.log('ℹ️  Skipping seeding (plans already exist)\n');
      return;
    }
    
    console.log('📋 Creating Membership Plans...\n');
    
    // Create membership plans
    for (const planData of MEMBERSHIP_PLANS) {
      const plan = await MembershipPlan.create(planData);
      
      console.log(`✅ Created: ${plan.name}`);
      console.log(`   - Code: ${plan.code}`);
      console.log(`   - Type: ${plan.type}`);
      console.log(`   - Price: ₹${plan.price} ${plan.discountedPrice ? `(Discounted: ₹${plan.discountedPrice})` : ''}`);
      console.log(`   - Family Members: ${plan.features.familyMembers.maxMembers}`);
      console.log(`   - Allowed Relations: ${plan.features.familyMembers.allowedRelations.join(', ') || 'None'}`);
      console.log(`   - Benefits: ${plan.benefits.length} items\n`);
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Membership Tiers Seeding Complete!');
    console.log(`📦 Created ${MEMBERSHIP_PLANS.length} membership plans`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('📊 Membership Summary:');
    console.log('   • Individual: 0 family members - FREE');
    console.log('   • Couple: 1 family member (spouse) - ₹2,499/year');
    console.log('   • Family: 4 family members (spouse + children) - ₹4,999/year');
    console.log('   • Corporate: 6 family members (incl. parents) - ₹8,499/year\n');
    
  } catch (error) {
    console.error('❌ Error seeding membership tiers:', error);
    throw error;
  }
}

/**
 * Run seeder if called directly
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  seedMembershipTiers()
    .then(() => {
      console.log('✅ Seeder completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Seeder failed:', error);
      process.exit(1);
    });
}

export default seedMembershipTiers;
