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

// ── SmartHealth Plan Definitions (Annual-Only) ───────────────────────────────
// Personal: Smart Basic → Silver → Silver+ → Silver Pro → Gold → Gold+ → Gold Pro → Platinum → Platinum+ → Platinum Pro → Diamond → Diamond+ → Diamond Pro
// Add-on  : VitalTrack (standalone, tier 20)
// Corporate: Corporate Basic → Basic Plus → Premium → Elite → Signature → Exclusive
const MEDIQZY_PLANS = [
  // ── PERSONAL PLANS ────────────────────────────────────────────────────────
  {
    name: 'Smart Basic', code: 'SMART_BASIC', slug: 'smart-basic',
    description: 'Try MediQzy free for 3 months — 6 GP teleconsultations/year, wellness tools & pharmacy/lab discounts',
    type: 'personal', planType: 'primary', tier: 0, tierName: 'Smart Basic',
    price: 0.00, discountedPrice: null, durationMonths: 3,
    isMaster: true, isActive: true, isFeatured: false, sortOrder: 1,
    features: { videoCalls: 6, audioCalls: 6, chat: 'unlimited', pharmacy: false, homecare: false, ambulance: false, familyMembers: 0, aiScribe: false, insuranceAccess: { enabled: false } },
    benefits: [
      '6 GP teleconsultations/year',
      '3 emergency consultations',
      'HRA (Health Risk Assessment)',
      'AI health chat assistant',
      'Pharmacy discounts: 10–15%',
      'Lab discounts: 15–20%',
      'Digital prescriptions',
      '1 member (self only)',
    ],
    limitations: { pharmacy: 'Not included', homecare: 'Not included', ambulance: 'Not included', familyMembers: 'Self only', labTests: 'Not included', insurance: 'Not included' },
    metadata: {
      color: '#6b7280', icon: 'zap', trialDays: 90,
      annualPrice: 499, annualPriceNote: 'After trial: ₹499/year',
      coverageDetails: {
        onlineConsult: { limit: 6, unit: 'GP/year (3-month trial)' },
        physicalConsult: { limit: 0 },
        labTests: { limitINR: 0, discountPct: 20 },
        pharmacy: { limitINR: 0, discountPct: 15 },
        homeCare: { limitINR: 0 },
        ambulance: { limitINR: 0 },
        healthCheck: { package: 'None' },
        emergencyConsult: { limit: 3 },
        dental: { limitINR: 0 },
        insurance: { health: 0, accident: 0, life: 0 },
      },
      wellness: { hra: true, aiChat: true, activityTracker: true, dietPlan: true, mentalHealth: false },
    }
  },
  {
    name: 'Silver', code: 'SILVER', slug: 'silver',
    description: 'Annual plan — 10 GP consults/year, 2 specialist consults, OPD network discounts & annual health checkup',
    type: 'personal', planType: 'primary', tier: 1, tierName: 'Silver',
    price: 1499.00, discountedPrice: null, durationMonths: 12,
    isMaster: true, isActive: true, isFeatured: false, sortOrder: 2,
    features: { videoCalls: 10, audioCalls: 10, specialistConsults: 2, chat: 'unlimited', pharmacy: true, homecare: false, ambulance: false, familyMembers: 0, aiScribe: true, insuranceAccess: { enabled: false } },
    benefits: [
      '10 GP teleconsultations/year',
      '2 specialist consultations/year',
      '1 annual health checkup',
      'OPD network discounts: 20–30%',
      'Pharmacy discounts: 10–20%',
      '1 mental health session/year',
      '3 emergency consultations/year',
      '1 member (self only)',
    ],
    limitations: { familyMembers: 'Self only', homecare: 'Not included', ambulance: 'Not included', insurance: 'Not included' },
    metadata: {
      color: '#94a3b8', icon: 'shield',
      annualPrice: 1499,
      discounts: { opdNetwork: 30, pharmacy: 20 },
      coverageDetails: {
        onlineConsult: { limit: 10, unit: 'GP/year' },
        specialistConsult: { limit: 2, unit: 'year' },
        physicalConsult: { limit: 0, discountPct: 30, type: 'network-discount' },
        labTests: { limitINR: 0, discountPct: 20 },
        pharmacy: { limitINR: 0, discountPct: 20 },
        homeCare: { limitINR: 0 },
        ambulance: { limitINR: 0 },
        healthCheck: { package: 'Basic Annual Checkup', count: 1 },
        emergencyConsult: { limit: 3 },
        dental: { limitINR: 0 },
        insurance: { health: 0, accident: 0, life: 0 },
      },
      wellness: { hra: true, aiChat: true, activityTracker: true, dietPlan: true, mentalHealth: true, mentalHealthSessions: 1 },
    }
  },
  {
    name: 'Silver+', code: 'SILVER_INS', slug: 'silver-insurance',
    description: 'Silver plan + ₹3L health insurance & ₹5L accident insurance',
    type: 'personal', planType: 'primary', tier: 2, tierName: 'Silver',
    price: 3699.00, discountedPrice: null, durationMonths: 12,
    isMaster: true, isActive: true, isFeatured: false, sortOrder: 3,
    features: { videoCalls: 10, audioCalls: 10, specialistConsults: 2, chat: 'unlimited', pharmacy: true, homecare: false, ambulance: false, familyMembers: 0, aiScribe: true, insuranceAccess: { enabled: true, healthCoverINR: 300000, accidentCoverINR: 500000 } },
    benefits: [
      'All Silver plan benefits included',
      '₹3,00,000 Health Insurance (via IRDAI partner)',
      '₹5,00,000 Accident Insurance (via IRDAI partner)',
      '10 GP teleconsultations/year',
      '2 specialist consultations/year',
      '1 annual health checkup',
      'OPD network discounts: 20–30%',
      '1 member (self only)',
    ],
    limitations: { familyMembers: 'Self only', homecare: 'Not included', ambulance: 'Not included', lifeInsurance: 'Not included' },
    metadata: {
      color: '#64748b', icon: 'shield-check', badge: 'With Insurance',
      annualPrice: 3699, baseSlug: 'silver',
      insuranceNote: 'Insurance via IRDAI-licensed insurer. Subject to insurer T&C.',
      insurance: { health: 300000, accident: 500000, life: 0 },
      discounts: { opdNetwork: 30, pharmacy: 20 },
      coverageDetails: {
        onlineConsult: { limit: 10, unit: 'GP/year' },
        specialistConsult: { limit: 2, unit: 'year' },
        physicalConsult: { limit: 0, discountPct: 30, type: 'network-discount' },
        labTests: { limitINR: 0, discountPct: 20 },
        pharmacy: { limitINR: 0, discountPct: 20 },
        homeCare: { limitINR: 0 },
        ambulance: { limitINR: 0 },
        healthCheck: { package: 'Basic Annual Checkup', count: 1 },
        emergencyConsult: { limit: 3 },
        dental: { limitINR: 0 },
        insurance: { health: 300000, accident: 500000, life: 0 },
      },
      wellness: { hra: true, aiChat: true, activityTracker: true, dietPlan: true, mentalHealth: true, mentalHealthSessions: 1 },
    }
  },
  {
    name: 'Silver Pro', code: 'SILVER_PRO', slug: 'silver-pro',
    description: 'Silver + Insurance + VitalTrack — full remote monitoring, insurance & healthcare in one plan',
    type: 'personal', planType: 'primary', tier: 3, tierName: 'Silver',
    price: 11999.00, discountedPrice: null, durationMonths: 12,
    isMaster: true, isActive: true, isFeatured: false, sortOrder: 4,
    features: { videoCalls: 10, audioCalls: 10, specialistConsults: 2, chat: 'unlimited', pharmacy: true, homecare: false, ambulance: false, familyMembers: 0, aiScribe: true, insuranceAccess: { enabled: true, healthCoverINR: 300000, accidentCoverINR: 500000 }, vitalTrack: { enabled: true, includedDeviceType: 'smart_band', includedDevices: 1, watchUpgradePriceINR: null, supportedDevices: ['smartwatch', 'smart_ring', 'smart_band'], additionalDevicePricing: { smartwatch: 3999, smart_ring: 3499, smart_band: 2499 } } },
    benefits: [
      'All Silver+ plan benefits included',
      'VitalTrack remote health monitoring',
      'Continuous ECG, SpO₂ & heart rate monitoring',
      'Sleep tracking & AI health risk scoring',
      '₹3,00,000 Health Insurance (via IRDAI partner)',
      '₹5,00,000 Accident Insurance (via IRDAI partner)',
      '10 GP teleconsultations/year',
      '2 specialist consultations/year',
      '1 member (self only)',
    ],
    limitations: { familyMembers: 'Self only', homecare: 'Not included', ambulance: 'Not included' },
    metadata: {
      color: '#6366f1', icon: 'shield-check', badge: 'Pro',
      annualPrice: 11999, baseSlug: 'silver',
      insuranceNote: 'Insurance via IRDAI-licensed insurer. Subject to insurer T&C.',
      insurance: { health: 300000, accident: 500000, life: 0 },
      vitalTrack: { included: true },
      discounts: { opdNetwork: 30, pharmacy: 20 },
      coverageDetails: {
        onlineConsult: { limit: 10, unit: 'GP/year' },
        specialistConsult: { limit: 2, unit: 'year' },
        physicalConsult: { limit: 0, discountPct: 30, type: 'network-discount' },
        labTests: { limitINR: 0, discountPct: 20 },
        pharmacy: { limitINR: 0, discountPct: 20 },
        homeCare: { limitINR: 0 },
        ambulance: { limitINR: 0 },
        healthCheck: { package: 'Basic Annual Checkup + VitalTrack Monitoring', count: 1 },
        emergencyConsult: { limit: 3 },
        dental: { limitINR: 0 },
        insurance: { health: 300000, accident: 500000, life: 0 },
      },
      wellness: { hra: true, aiChat: true, activityTracker: true, dietPlan: true, mentalHealth: true, mentalHealthSessions: 1 },
    }
  },
  {
    name: 'Gold', code: 'GOLD', slug: 'gold',
    description: 'Annual plan — 12 GP consults/year, 4 specialists, ₹2,000 OPD subsidy (network) & full wellness suite',
    type: 'personal', planType: 'primary', tier: 4, tierName: 'Gold',
    price: 2999.00, discountedPrice: null, durationMonths: 12,
    isMaster: true, isActive: true, isFeatured: true, sortOrder: 5,
    features: { videoCalls: 12, audioCalls: 12, specialistConsults: 4, chat: 'unlimited', pharmacy: true, homecare: false, ambulance: false, familyMembers: 1, aiScribe: true, insuranceAccess: { enabled: false }, opdWallet: { enabled: true, limitINR: 2000, type: 'subsidy', networkOnly: true } },
    benefits: [
      '12 GP teleconsultations/year (1/month cap)',
      '4 specialist consultations/year',
      '2 annual health checkups',
      '₹2,000 OPD subsidy (network providers only)',
      'Diagnostics: fixed package or 30% network discount',
      '2–3 mental health sessions/year',
      '3 emergency consultations/year',
      'Couple plan (self + spouse/partner)',
    ],
    limitations: { homecare: 'Not included', ambulance: 'Not included', insurance: 'Not included' },
    metadata: {
      color: '#f59e0b', icon: 'star', badge: 'Most Popular',
      annualPrice: 2999, members: 2, membersLabel: 'Couple',
      discounts: { diagnostics: 30, labTests: 30, pharmacy: 20 },
      coverageDetails: {
        onlineConsult: { limit: 12, unit: 'GP/year', monthCap: 1 },
        specialistConsult: { limit: 4, unit: 'year' },
        physicalConsult: { limit: 0, discountPct: 30, opdWalletINR: 2000, walletType: 'subsidy', networkOnly: true },
        labTests: { limitINR: 0, discountPct: 30 },
        pharmacy: { limitINR: 0, discountPct: 20 },
        homeCare: { limitINR: 0 },
        ambulance: { limitINR: 0 },
        healthCheck: { package: 'Standard Annual Checkup', count: 2 },
        emergencyConsult: { limit: 3 },
        dental: { limitINR: 0 },
        insurance: { health: 0, accident: 0, life: 0 },
      },
      wellness: { hra: true, aiChat: true, activityTracker: true, dietPlan: true, mentalHealth: true, mentalHealthSessions: 3 },
    }
  },
  {
    name: 'Gold+', code: 'GOLD_INS', slug: 'gold-insurance',
    description: 'Gold plan + ₹5L health insurance & ₹10L accident insurance',
    type: 'personal', planType: 'primary', tier: 5, tierName: 'Gold',
    price: 7998.00, discountedPrice: null, durationMonths: 12,
    isMaster: true, isActive: true, isFeatured: false, sortOrder: 6,
    features: { videoCalls: 12, audioCalls: 12, specialistConsults: 4, chat: 'unlimited', pharmacy: true, homecare: false, ambulance: false, familyMembers: 1, aiScribe: true, insuranceAccess: { enabled: true, healthCoverINR: 500000, accidentCoverINR: 1000000 }, opdWallet: { enabled: true, limitINR: 2000, type: 'subsidy', networkOnly: true } },
    benefits: [
      'All Gold plan benefits included',
      '₹5,00,000 Health Insurance (floater)',
      '₹10,00,000 Accident Insurance',
      '12 GP teleconsultations/year (1/month cap)',
      '4 specialist consultations/year',
      '₹2,000 OPD subsidy (network only)',
      'Couple plan (self + spouse/partner)',
    ],
    limitations: { homecare: 'Not included', ambulance: 'Not included', lifeInsurance: 'Not included' },
    metadata: {
      color: '#d97706', icon: 'star', badge: 'With Insurance',
      annualPrice: 7998, baseSlug: 'gold',
      members: 2, membersLabel: 'Couple',
      insurance: { health: 500000, accident: 1000000, life: 0 },
      insuranceNote: 'Insurance via IRDAI-licensed insurer. Subject to insurer T&C.',
      discounts: { diagnostics: 30, labTests: 30, pharmacy: 20 },
      coverageDetails: {
        onlineConsult: { limit: 12, unit: 'GP/year', monthCap: 1 },
        specialistConsult: { limit: 4, unit: 'year' },
        physicalConsult: { limit: 0, discountPct: 30, opdWalletINR: 2000, walletType: 'subsidy', networkOnly: true },
        labTests: { limitINR: 0, discountPct: 30 },
        pharmacy: { limitINR: 0, discountPct: 20 },
        homeCare: { limitINR: 0 },
        ambulance: { limitINR: 0 },
        healthCheck: { package: 'Standard Annual Checkup', count: 2 },
        emergencyConsult: { limit: 3 },
        dental: { limitINR: 0 },
        insurance: { health: 500000, accident: 1000000, life: 0 },
      },
      wellness: { hra: true, aiChat: true, activityTracker: true, dietPlan: true, mentalHealth: true, mentalHealthSessions: 3 },
    }
  },
  {
    name: 'Gold Pro', code: 'GOLD_PRO', slug: 'gold-pro',
    description: 'Gold + Insurance + VitalTrack — remote monitoring, insurance & full wellness for couples',
    type: 'personal', planType: 'primary', tier: 6, tierName: 'Gold',
    price: 15999.00, discountedPrice: null, durationMonths: 12,
    isMaster: true, isActive: true, isFeatured: false, sortOrder: 7,
    features: { videoCalls: 12, audioCalls: 12, specialistConsults: 4, chat: 'unlimited', pharmacy: true, homecare: false, ambulance: false, familyMembers: 1, aiScribe: true, insuranceAccess: { enabled: true, healthCoverINR: 500000, accidentCoverINR: 1000000 }, opdWallet: { enabled: true, limitINR: 2000, type: 'subsidy', networkOnly: true }, vitalTrack: { enabled: true, includedDeviceType: 'smart_band', includedDevices: 1, watchUpgradePriceINR: 2999, supportedDevices: ['smartwatch', 'smart_ring', 'smart_band'], additionalDevicePricing: { smartwatch: 3499, smart_ring: 2999, smart_band: 2199 } } },
    benefits: [
      'All Gold+ plan benefits included',
      'VitalTrack remote health monitoring',
      'Continuous ECG, SpO₂ & heart rate monitoring',
      'Sleep tracking & AI health risk scoring',
      '₹5,00,000 Health Insurance (floater)',
      '₹10,00,000 Accident Insurance',
      '12 GP teleconsultations/year (1/month cap)',
      '4 specialist consultations/year',
      '₹2,000 OPD subsidy (network only)',
      'Couple plan (self + spouse/partner)',
    ],
    limitations: { homecare: 'Not included', ambulance: 'Not included' },
    metadata: {
      color: '#b45309', icon: 'star', badge: 'Pro',
      annualPrice: 15999, baseSlug: 'gold',
      members: 2, membersLabel: 'Couple',
      insurance: { health: 500000, accident: 1000000, life: 0 },
      insuranceNote: 'Insurance via IRDAI-licensed insurer. Subject to insurer T&C.',
      vitalTrack: { included: true },
      discounts: { diagnostics: 30, labTests: 30, pharmacy: 20 },
      coverageDetails: {
        onlineConsult: { limit: 12, unit: 'GP/year', monthCap: 1 },
        specialistConsult: { limit: 4, unit: 'year' },
        physicalConsult: { limit: 0, discountPct: 30, opdWalletINR: 2000, walletType: 'subsidy', networkOnly: true },
        labTests: { limitINR: 0, discountPct: 30 },
        pharmacy: { limitINR: 0, discountPct: 20 },
        homeCare: { limitINR: 0 },
        ambulance: { limitINR: 0 },
        healthCheck: { package: 'Standard Annual Checkup + VitalTrack Monitoring', count: 2 },
        emergencyConsult: { limit: 3 },
        dental: { limitINR: 0 },
        insurance: { health: 500000, accident: 1000000, life: 0 },
      },
      wellness: { hra: true, aiChat: true, activityTracker: true, dietPlan: true, mentalHealth: true, mentalHealthSessions: 3 },
    }
  },
  {
    name: 'Platinum', code: 'PLATINUM', slug: 'platinum',
    description: 'Annual family plan — 18 GP consults/year, 6 specialists, ₹4,000 OPD subsidy & premium wellness',
    type: 'personal', planType: 'primary', tier: 7, tierName: 'Platinum',
    price: 5999.00, discountedPrice: null, durationMonths: 12,
    isMaster: true, isActive: true, isFeatured: false, sortOrder: 8,
    features: { videoCalls: 18, audioCalls: 18, specialistConsults: 6, chat: 'unlimited', pharmacy: true, homecare: false, ambulance: false, familyMembers: 3, aiScribe: true, insuranceAccess: { enabled: false }, opdWallet: { enabled: true, limitINR: 4000, type: 'subsidy', networkOnly: true }, offlineConsult: { enabled: true } },
    benefits: [
      '18 GP teleconsultations/year',
      '6 specialist consultations/year',
      '4 annual health checkups',
      '₹4,000 OPD subsidy (network providers only)',
      'Diagnostics: up to 40% network discount',
      '4 mental health sessions/year',
      'At-home lab sample collection (limited)',
      'Family plan: husband, wife & 2 children',
    ],
    limitations: { homecare: 'Not included', ambulance: 'Not included', insurance: 'Not included' },
    metadata: {
      color: '#0ea5e9', icon: 'crown',
      annualPrice: 5999, members: 4, membersLabel: 'Family (4)',
      discounts: { diagnostics: 40, labTests: 40, pharmacy: 20 },
      coverageDetails: {
        onlineConsult: { limit: 18, unit: 'GP/year' },
        specialistConsult: { limit: 6, unit: 'year' },
        physicalConsult: { limit: 0, discountPct: 40, opdWalletINR: 4000, walletType: 'subsidy', networkOnly: true },
        labTests: { limitINR: 0, discountPct: 40 },
        pharmacy: { limitINR: 0, discountPct: 20 },
        homeCare: { limitINR: 0 },
        ambulance: { limitINR: 0 },
        healthCheck: { package: 'Comprehensive Panel', count: 4 },
        emergencyConsult: { limit: 3 },
        dental: { limitINR: 0 },
        insurance: { health: 0, accident: 0, life: 0 },
      },
      wellness: { hra: true, aiChat: true, activityTracker: true, dietPlan: true, mentalHealth: true, mentalHealthSessions: 4, nutritionist: true },
    }
  },
  {
    name: 'Platinum+', code: 'PLATINUM_INS', slug: 'platinum-insurance',
    description: 'Platinum plan + ₹10L health insurance & ₹15L accident insurance for family of 4',
    type: 'personal', planType: 'primary', tier: 8, tierName: 'Platinum',
    price: 14998.00, discountedPrice: null, durationMonths: 12,
    isMaster: true, isActive: true, isFeatured: false, sortOrder: 9,
    features: { videoCalls: 18, audioCalls: 18, specialistConsults: 6, chat: 'unlimited', pharmacy: true, homecare: false, ambulance: false, familyMembers: 3, aiScribe: true, insuranceAccess: { enabled: true, healthCoverINR: 1000000, accidentCoverINR: 1500000 }, opdWallet: { enabled: true, limitINR: 4000, type: 'subsidy', networkOnly: true }, offlineConsult: { enabled: true }, familyFloater: { enabled: true } },
    benefits: [
      'All Platinum plan benefits included',
      '₹10,00,000 Health Insurance (family floater)',
      '₹15,00,000 Accident Insurance (family floater)',
      '18 GP teleconsultations/year',
      '6 specialist consultations/year',
      '₹4,000 OPD subsidy (network only)',
      'Family plan: husband, wife & 2 children',
    ],
    limitations: { homecare: 'Not included', ambulance: 'Not included', lifeInsurance: 'Not included' },
    metadata: {
      color: '#0284c7', icon: 'crown', badge: 'With Insurance',
      annualPrice: 14998, baseSlug: 'platinum',
      members: 4, membersLabel: 'Family (4)',
      insurance: { health: 1000000, accident: 1500000, life: 0 },
      insuranceNote: 'Insurance via IRDAI-licensed insurer. Family floater. Subject to T&C.',
      discounts: { diagnostics: 40, labTests: 40, pharmacy: 20 },
      coverageDetails: {
        onlineConsult: { limit: 18, unit: 'GP/year' },
        specialistConsult: { limit: 6, unit: 'year' },
        physicalConsult: { limit: 0, discountPct: 40, opdWalletINR: 4000, walletType: 'subsidy', networkOnly: true },
        labTests: { limitINR: 0, discountPct: 40 },
        pharmacy: { limitINR: 0, discountPct: 20 },
        homeCare: { limitINR: 0 },
        ambulance: { limitINR: 0 },
        healthCheck: { package: 'Comprehensive Panel', count: 4 },
        emergencyConsult: { limit: 3 },
        dental: { limitINR: 0 },
        insurance: { health: 1000000, accident: 1500000, life: 0 },
      },
      wellness: { hra: true, aiChat: true, activityTracker: true, dietPlan: true, mentalHealth: true, mentalHealthSessions: 4, nutritionist: true },
    }
  },
  {
    name: 'Platinum Pro', code: 'PLATINUM_PRO', slug: 'platinum-pro',
    description: 'Platinum + Insurance + VitalTrack — full family ecosystem with monitoring, insurance & premium care',
    type: 'personal', planType: 'primary', tier: 9, tierName: 'Platinum',
    price: 22999.00, discountedPrice: null, durationMonths: 12,
    isMaster: true, isActive: true, isFeatured: false, sortOrder: 10,
    features: { videoCalls: 18, audioCalls: 18, specialistConsults: 6, chat: 'unlimited', pharmacy: true, homecare: false, ambulance: false, familyMembers: 3, aiScribe: true, insuranceAccess: { enabled: true, healthCoverINR: 1000000, accidentCoverINR: 1500000 }, opdWallet: { enabled: true, limitINR: 4000, type: 'subsidy', networkOnly: true }, offlineConsult: { enabled: true }, familyFloater: { enabled: true }, vitalTrack: { enabled: true, includedDeviceType: 'smartwatch', includedDevices: 1, supportedDevices: ['glucose_watch', 'smartwatch', 'smart_ring', 'smart_band'], additionalDevicePricing: { glucose_watch: 5999, smartwatch: 2999, smart_ring: 2699, smart_band: 1999 } } },
    benefits: [
      'All Platinum+ plan benefits included',
      'VitalTrack remote health monitoring',
      'Continuous ECG, SpO₂ & heart rate monitoring',
      'Sleep tracking & AI health risk scoring',
      '₹10,00,000 Health Insurance (family floater)',
      '₹15,00,000 Accident Insurance (family floater)',
      '18 GP teleconsultations/year',
      '6 specialist consultations/year',
      '₹4,000 OPD subsidy (network only)',
      'Family plan: husband, wife & 2 children',
    ],
    limitations: { homecare: 'Not included', ambulance: 'Not included' },
    metadata: {
      color: '#5b21b6', icon: 'crown', badge: 'Pro',
      annualPrice: 22999, baseSlug: 'platinum',
      members: 4, membersLabel: 'Family (4)',
      insurance: { health: 1000000, accident: 1500000, life: 0 },
      insuranceNote: 'Insurance via IRDAI-licensed insurer. Family floater. Subject to T&C.',
      vitalTrack: { included: true },
      discounts: { diagnostics: 40, labTests: 40, pharmacy: 20 },
      coverageDetails: {
        onlineConsult: { limit: 18, unit: 'GP/year' },
        specialistConsult: { limit: 6, unit: 'year' },
        physicalConsult: { limit: 0, discountPct: 40, opdWalletINR: 4000, walletType: 'subsidy', networkOnly: true },
        labTests: { limitINR: 0, discountPct: 40 },
        pharmacy: { limitINR: 0, discountPct: 20 },
        homeCare: { limitINR: 0 },
        ambulance: { limitINR: 0 },
        healthCheck: { package: 'Comprehensive Panel + VitalTrack Monitoring', count: 4 },
        emergencyConsult: { limit: 3 },
        dental: { limitINR: 0 },
        insurance: { health: 1000000, accident: 1500000, life: 0 },
      },
      wellness: { hra: true, aiChat: true, activityTracker: true, dietPlan: true, mentalHealth: true, mentalHealthSessions: 4, nutritionist: true },
    }
  },
  {
    name: 'Diamond', code: 'DIAMOND', slug: 'diamond',
    description: 'Annual premium family plan — 24 GP consults/year, 8 specialists, ₹7,000 OPD subsidy & care manager',
    type: 'personal', planType: 'primary', tier: 10, tierName: 'Diamond',
    price: 9999.00, discountedPrice: null, durationMonths: 12,
    isMaster: true, isActive: true, isFeatured: false, sortOrder: 11,
    features: { videoCalls: 24, audioCalls: 24, specialistConsults: 8, chat: 'unlimited', pharmacy: true, homecare: false, ambulance: false, familyMembers: 5, aiScribe: true, insuranceAccess: { enabled: false }, opdWallet: { enabled: true, limitINR: 7000, type: 'subsidy', networkOnly: true }, offlineConsult: { enabled: true }, familyFloater: { enabled: true }, dedicatedCareManager: { enabled: true } },
    benefits: [
      '24 GP teleconsultations/year',
      '8 specialist consultations/year',
      '6 annual health checkups',
      '₹7,000 OPD subsidy (network providers only)',
      'Dedicated care manager',
      'Mental health: unlimited (fair usage)',
      'Home lab collection (limited)',
      'Emergency coordination support',
      'Extended family: husband, wife, 2 children & 2 grandparents',
    ],
    limitations: { homecare: 'Not included', ambulance: 'Not included', insurance: 'Not included' },
    metadata: {
      color: '#7c3aed', icon: 'gem', badge: 'Best Value',
      annualPrice: 9999, members: 6, membersLabel: 'Family (6)',
      discounts: { diagnostics: 50, labTests: 50, pharmacy: 25 },
      coverageDetails: {
        onlineConsult: { limit: 24, unit: 'GP/year' },
        specialistConsult: { limit: 8, unit: 'year' },
        physicalConsult: { limit: 0, discountPct: 50, opdWalletINR: 7000, walletType: 'subsidy', networkOnly: true },
        labTests: { limitINR: 0, discountPct: 50 },
        pharmacy: { limitINR: 0, discountPct: 25 },
        homeCare: { limitINR: 0 },
        ambulance: { limitINR: 0 },
        healthCheck: { package: 'Premium Full Body Checkup', count: 6 },
        emergencyConsult: { limit: 3 },
        dental: { limitINR: 0 },
        insurance: { health: 0, accident: 0, life: 0 },
      },
      wellness: { hra: true, aiChat: true, activityTracker: true, dietPlan: true, mentalHealth: true, mentalHealthSessions: 'unlimited', nutritionist: true, fitnessCoaching: true },
    }
  },
  {
    name: 'Diamond+', code: 'DIAMOND_INS', slug: 'diamond-insurance',
    description: 'Diamond plan + ₹25L health insurance & ₹25L accident insurance for family of 6',
    type: 'personal', planType: 'primary', tier: 11, tierName: 'Diamond',
    price: 24998.00, discountedPrice: null, durationMonths: 12,
    isMaster: true, isActive: true, isFeatured: false, sortOrder: 12,
    features: { videoCalls: 24, audioCalls: 24, specialistConsults: 8, chat: 'unlimited', pharmacy: true, homecare: false, ambulance: false, familyMembers: 5, aiScribe: true, insuranceAccess: { enabled: true, healthCoverINR: 1000000, superTopUpINR: 1500000, accidentCoverINR: 2500000 }, opdWallet: { enabled: true, limitINR: 7000, type: 'subsidy', networkOnly: true }, offlineConsult: { enabled: true }, familyFloater: { enabled: true }, dedicatedCareManager: { enabled: true } },
    benefits: [
      'All Diamond plan benefits included',
      '₹25,00,000 Health Insurance (family floater)',
      '₹25,00,000 Accident Insurance (family floater)',
      '24 GP teleconsultations/year',
      '8 specialist consultations/year',
      '₹7,000 OPD subsidy (network only)',
      'Dedicated care manager',
      'Extended family: husband, wife, 2 children & 2 grandparents',
    ],
    limitations: { homecare: 'Not included', ambulance: 'Not included', lifeInsurance: 'Not included' },
    metadata: {
      color: '#6d28d9', icon: 'gem', badge: 'With Insurance',
      annualPrice: 24998, baseSlug: 'diamond',
      members: 6, membersLabel: 'Family (6)',
      insurance: { health: 2500000, accident: 2500000, life: 0 },
      insuranceNote: 'Insurance via IRDAI-licensed insurer. Family floater. Subject to T&C.',
      discounts: { diagnostics: 50, labTests: 50, pharmacy: 25 },
      coverageDetails: {
        onlineConsult: { limit: 24, unit: 'GP/year' },
        specialistConsult: { limit: 8, unit: 'year' },
        physicalConsult: { limit: 0, discountPct: 50, opdWalletINR: 7000, walletType: 'subsidy', networkOnly: true },
        labTests: { limitINR: 0, discountPct: 50 },
        pharmacy: { limitINR: 0, discountPct: 25 },
        homeCare: { limitINR: 0 },
        ambulance: { limitINR: 0 },
        healthCheck: { package: 'Premium Full Body Checkup', count: 6 },
        emergencyConsult: { limit: 3 },
        dental: { limitINR: 0 },
        insurance: { health: 2500000, accident: 2500000, life: 0 },
      },
      wellness: { hra: true, aiChat: true, activityTracker: true, dietPlan: true, mentalHealth: true, mentalHealthSessions: 'unlimited', nutritionist: true, fitnessCoaching: true },
    }
  },
  {
    name: 'Diamond Pro', code: 'DIAMOND_PRO', slug: 'diamond-pro',
    description: 'Diamond + Insurance + VitalTrack — the complete premium family health ecosystem',
    type: 'personal', planType: 'primary', tier: 12, tierName: 'Diamond',
    price: 32999.00, discountedPrice: null, durationMonths: 12,
    isMaster: true, isActive: true, isFeatured: false, sortOrder: 13,
    features: { videoCalls: 24, audioCalls: 24, specialistConsults: 8, chat: 'unlimited', pharmacy: true, homecare: false, ambulance: false, familyMembers: 5, aiScribe: true, insuranceAccess: { enabled: true, healthCoverINR: 1000000, superTopUpINR: 1500000, accidentCoverINR: 2500000 }, opdWallet: { enabled: true, limitINR: 7000, type: 'subsidy', networkOnly: true }, offlineConsult: { enabled: true }, familyFloater: { enabled: true }, dedicatedCareManager: { enabled: true }, vitalTrack: { enabled: true, includedDeviceType: 'smartwatch', includedDevices: 2, supportedDevices: ['glucose_watch', 'smartwatch', 'smart_ring', 'smart_band'], additionalDevicePricing: { glucose_watch: 5499, smartwatch: 2499, smart_ring: 2299, smart_band: 1799 } } },
    benefits: [
      'All Diamond+ plan benefits included',
      'VitalTrack remote health monitoring',
      'Continuous ECG, SpO₂ & heart rate monitoring',
      'Sleep tracking & AI health risk scoring',
      '₹25,00,000 Health Insurance (family floater)',
      '₹25,00,000 Accident Insurance (family floater)',
      '24 GP teleconsultations/year',
      '8 specialist consultations/year',
      '₹7,000 OPD subsidy (network only)',
      'Dedicated care manager',
      'Extended family: husband, wife, 2 children & 2 grandparents',
    ],
    limitations: { homecare: 'Not included', ambulance: 'Not included' },
    metadata: {
      color: '#4c1d95', icon: 'gem', badge: 'Pro',
      annualPrice: 32999, baseSlug: 'diamond',
      members: 6, membersLabel: 'Family (6)',
      insurance: { health: 2500000, accident: 2500000, life: 0 },
      insuranceNote: 'Insurance via IRDAI-licensed insurer. Family floater. Subject to T&C.',
      vitalTrack: { included: true },
      discounts: { diagnostics: 50, labTests: 50, pharmacy: 25 },
      coverageDetails: {
        onlineConsult: { limit: 24, unit: 'GP/year' },
        specialistConsult: { limit: 8, unit: 'year' },
        physicalConsult: { limit: 0, discountPct: 50, opdWalletINR: 7000, walletType: 'subsidy', networkOnly: true },
        labTests: { limitINR: 0, discountPct: 50 },
        pharmacy: { limitINR: 0, discountPct: 25 },
        homeCare: { limitINR: 0 },
        ambulance: { limitINR: 0 },
        healthCheck: { package: 'Premium Full Body Checkup + VitalTrack Monitoring', count: 6 },
        emergencyConsult: { limit: 3 },
        dental: { limitINR: 0 },
        insurance: { health: 2500000, accident: 2500000, life: 0 },
      },
      wellness: { hra: true, aiChat: true, activityTracker: true, dietPlan: true, mentalHealth: true, mentalHealthSessions: 'unlimited', nutritionist: true, fitnessCoaching: true },
    }
  },
  {
    name: 'VitalTrack', code: 'VITALTRACK', slug: 'vitaltrack',
    description: 'Health monitoring add-on — continuous BP, SpO2, sleep & activity tracking with monthly report',
    type: 'personal', planType: 'addon', tier: 20, tierName: 'VitalTrack',
    price: 8999.00, discountedPrice: null, durationMonths: 12,
    isMaster: true, isActive: true, isFeatured: false, sortOrder: 14,
    features: { bpMonitoring: true, spo2Monitoring: true, sleepTracking: true, activityTracking: true, monthlyHealthReport: true, familyMembers: 0, aiScribe: false },
    benefits: [
      'Continuous BP monitoring',
      'SpO2 & heart rate monitoring',
      'Sleep quality tracking',
      'Activity & step tracker',
      'Monthly personalised health report',
      'Wearable device integration (BLE)',
      'Add-on for any Silver+ plan',
    ],
    limitations: { requiresBasePlan: 'Silver or higher required' },
    metadata: {
      color: '#06b6d4', icon: 'activity', badge: 'Add-on',
      annualPrice: 8999, addonType: 'health-monitoring',
      coverageDetails: {
        onlineConsult: { limit: 0 }, physicalConsult: { limit: 0 },
        labTests: { limitINR: 0 }, pharmacy: { limitINR: 0 },
        homeCare: { limitINR: 0 }, ambulance: { limitINR: 0 },
        healthCheck: { package: 'Monthly Monitoring Report' },
        emergencyConsult: { limit: 0 }, dental: { limitINR: 0 },
        insurance: { health: 0, accident: 0, life: 0 },
      },
      wellness: { hra: true, aiChat: false, activityTracker: true, dietPlan: false, mentalHealth: false },
    }
  },
  // ── CORPORATE PLANS ───────────────────────────────────────────────────────
  {
    name: 'Corporate Basic', code: 'CORP_BASIC', description: 'Entry-level corporate health benefits — essential coverage per employee',
    type: 'corporate', planType: 'primary', tier: 1, tierName: 'Corporate Basic',
    price: 249.00, discountedPrice: null, durationMonths: 1,
    isMaster: true, isActive: true, isFeatured: false, sortOrder: 11,
    features: { videoCalls: 3, audioCalls: 5, chat: 'unlimited', pharmacy: true, homecare: false, ambulance: false, familyMembers: 2, aiScribe: 2, corporateDashboard: true },
    benefits: ['3 online consultations/month', '2 physical consultations/month', 'Lab tests ₹1,000/month', 'Pharmacy ₹1,000/month', 'Basic screening included', '2 family members', 'Employee health dashboard', 'Wellness programs access'],
    limitations: { homecare: 'Not included', ambulance: 'Not included', dental: 'Not included' },
    metadata: { color: '#2563eb', icon: 'briefcase', coverageDetails: { onlineConsult: { limit: 3 }, physicalConsult: { limit: 2 }, labTests: { limitINR: 1000 }, pharmacy: { limitINR: 1000 }, homeCare: { limitINR: 0 }, ambulance: { limitINR: 0 }, healthCheck: { package: 'Basic Screening' }, emergencyConsult: { limit: 2 }, dental: { limitINR: 0 } } }
  },
  {
    name: 'Corporate Basic Plus', code: 'CORP_BASIC_PLUS', description: 'Enhanced entry-level plan with home care and preventive screenings',
    type: 'corporate', planType: 'primary', tier: 2, tierName: 'Corporate Basic Plus',
    price: 449.00, discountedPrice: null, durationMonths: 1,
    isMaster: true, isActive: true, isFeatured: false, sortOrder: 12,
    features: { videoCalls: 8, audioCalls: 12, chat: 'unlimited', pharmacy: true, homecare: true, ambulance: false, familyMembers: 3, aiScribe: 5, corporateDashboard: true },
    benefits: ['8 online consultations/month', '4 physical consultations/month', 'Lab tests ₹2,000/month', 'Pharmacy ₹2,000/month', 'Home care ₹2,000/month', 'Preventive health panel', 'Dental ₹500/month', '3 family members', 'Bulk appointment booking', 'Health analytics reports'],
    limitations: { ambulance: 'Not included' },
    metadata: { color: '#1d4ed8', icon: 'briefcase', coverageDetails: { onlineConsult: { limit: 8 }, physicalConsult: { limit: 4 }, labTests: { limitINR: 2000 }, pharmacy: { limitINR: 2000 }, homeCare: { limitINR: 2000 }, ambulance: { limitINR: 0 }, healthCheck: { package: 'Preventive Panel' }, emergencyConsult: { limit: 4 }, dental: { limitINR: 500 } } }
  },
  {
    name: 'Corporate Premium', code: 'CORP_PREMIUM', description: 'Mid-tier corporate plan with ambulance, comprehensive diagnostics & wellness programs',
    type: 'corporate', planType: 'primary', tier: 3, tierName: 'Corporate Premium',
    price: 749.00, discountedPrice: null, durationMonths: 1,
    isMaster: true, isActive: true, isFeatured: true, sortOrder: 13,
    features: { videoCalls: 15, audioCalls: 'unlimited', chat: 'unlimited', pharmacy: true, homecare: true, ambulance: true, familyMembers: 4, aiScribe: 'unlimited', corporateDashboard: true, onsiteClinic: true },
    benefits: ['15 online consultations/month', '6 physical consultations/month', 'Lab tests ₹4,000/month', 'Pharmacy ₹4,000/month', 'Home care ₹5,000/month', 'Ambulance ₹3,000/month', 'Comprehensive panel', 'Dental ₹2,000/month', '4 family members', 'On-site clinic support', '5 mental health sessions/month'],
    limitations: {},
    metadata: { color: '#7c3aed', icon: 'briefcase', badge: 'Most Popular', coverageDetails: { onlineConsult: { limit: 15 }, physicalConsult: { limit: 6 }, labTests: { limitINR: 4000 }, pharmacy: { limitINR: 4000 }, homeCare: { limitINR: 5000 }, ambulance: { limitINR: 3000 }, healthCheck: { package: 'Comprehensive Panel' }, emergencyConsult: { limit: 6 }, dental: { limitINR: 2000 } } }
  },
  {
    name: 'Corporate Elite', code: 'CORP_ELITE', description: 'High-tier corporate plan with extended limits, priority access & HR analytics',
    type: 'corporate', planType: 'primary', tier: 4, tierName: 'Corporate Elite',
    price: 1199.00, discountedPrice: null, durationMonths: 1,
    isMaster: true, isActive: true, isFeatured: false, sortOrder: 14,
    features: { videoCalls: 25, audioCalls: 'unlimited', chat: 'unlimited', pharmacy: true, homecare: true, ambulance: true, familyMembers: 6, aiScribe: 'unlimited', corporateDashboard: true, dedicatedManager: true },
    benefits: ['25 online consultations/month', '10 physical consultations/month', 'Lab tests ₹7,000/month', 'Pharmacy ₹7,000/month', 'Home care ₹10,000/month', 'Ambulance ₹8,000/month', 'Advanced panel', 'Dental ₹4,000/month', '6 family members', 'Dedicated account manager', 'HR health analytics', 'Claims management support'],
    limitations: {},
    metadata: { color: '#dc2626', icon: 'crown', coverageDetails: { onlineConsult: { limit: 25 }, physicalConsult: { limit: 10 }, labTests: { limitINR: 7000 }, pharmacy: { limitINR: 7000 }, homeCare: { limitINR: 10000 }, ambulance: { limitINR: 8000 }, healthCheck: { package: 'Advanced Panel' }, emergencyConsult: { limit: 10 }, dental: { limitINR: 4000 } } }
  },
  {
    name: 'Corporate Signature', code: 'CORP_SIGNATURE', description: 'Signature-grade enterprise benefits with near-unlimited coverage per employee',
    type: 'corporate', planType: 'primary', tier: 5, tierName: 'Corporate Signature',
    price: 1999.00, discountedPrice: null, durationMonths: 1,
    isMaster: true, isActive: true, isFeatured: false, sortOrder: 15,
    features: { videoCalls: 40, audioCalls: 'unlimited', chat: 'unlimited', pharmacy: true, homecare: true, ambulance: true, familyMembers: 8, aiScribe: 'unlimited', corporateDashboard: true, dedicatedManager: true, brandedWellness: true },
    benefits: ['40 online consultations/month', '15 physical consultations/month', 'Lab tests ₹10,000/month', 'Pharmacy ₹10,000/month', 'Home care ₹15,000/month', 'Ambulance ₹12,000/month', 'Premium panel', 'Dental ₹6,000/month', '8 family members', 'Branded wellness programs', 'Quarterly health checkups', 'Priority emergency line', 'Insurance coordination'],
    limitations: {},
    metadata: { color: '#059669', icon: 'gem', coverageDetails: { onlineConsult: { limit: 40 }, physicalConsult: { limit: 15 }, labTests: { limitINR: 10000 }, pharmacy: { limitINR: 10000 }, homeCare: { limitINR: 15000 }, ambulance: { limitINR: 12000 }, healthCheck: { package: 'Premium Panel' }, emergencyConsult: { limit: 15 }, dental: { limitINR: 6000 } } }
  },
  {
    name: 'Corporate Exclusive', code: 'CORP_EXCLUSIVE', description: 'White-glove corporate health solution — unlimited access, concierge support, custom programs',
    type: 'corporate', planType: 'primary', tier: 6, tierName: 'Corporate Exclusive',
    price: 2999.00, discountedPrice: null, durationMonths: 1,
    isMaster: true, isActive: true, isFeatured: false, sortOrder: 16,
    features: { videoCalls: 'unlimited', audioCalls: 'unlimited', chat: 'unlimited', pharmacy: true, homecare: true, ambulance: true, familyMembers: 'unlimited', aiScribe: 'unlimited', corporateDashboard: true, dedicatedManager: true, concierge: true },
    benefits: ['Unlimited online consultations', 'Unlimited physical consultations', 'Lab tests ₹20,000/month', 'Pharmacy ₹20,000/month', 'Home care ₹30,000/month', 'Ambulance ₹25,000/month', 'Executive Full Body checkup', 'Dental ₹12,000/month', 'Unlimited family members', 'White-glove concierge health team', '24/7 priority emergency line', 'Custom wellness programs', 'Full insurance coordination', 'Annual predictive health report'],
    limitations: {},
    metadata: { color: '#d97706', icon: 'gem', badge: 'Enterprise', coverageDetails: { onlineConsult: { limit: 999 }, physicalConsult: { limit: 999 }, labTests: { limitINR: 20000 }, pharmacy: { limitINR: 20000 }, homeCare: { limitINR: 30000 }, ambulance: { limitINR: 25000 }, healthCheck: { package: 'Executive Full Body' }, emergencyConsult: { limit: 999 }, dental: { limitINR: 12000 } } }
  },

  // ─── Clinical Rider Add-Ons ────────────────────────────────────────────────
  {
    name: 'Diabetes Care Program', code: 'RIDER_DIABETES',
    description: 'Continuous glucose monitoring, certified diabetes coach, dietician, and quarterly clinical reviews',
    type: 'personal', planType: 'addon', tier: 21, tierName: 'Clinical Rider',
    price: 4999.00, discountedPrice: null, durationMonths: 12,
    isMaster: false, isActive: true, isFeatured: false, sortOrder: 1,
    features: { riderType: 'diabetes', includes: ['diabetes_coach', 'dietician', 'quarterly_review', 'glucotrack_device_eligibility', 'hba1c_monitoring', 'medication_adherence'], deviceEligible: 'glucose_watch', consultations: { coach: 12, dietician: 4, doctor: 4 } },
    benefits: ['Certified diabetes educator (12 sessions/year)', 'Dietician consultations (4/year)', 'Quarterly clinical review with doctor', 'GlucoTrack device eligibility (add-on)', 'HbA1c & medication tracking', 'Diet & lifestyle plan'],
    metadata: { category: 'clinical_rider', targetCondition: 'diabetes', color: '#f59e0b', icon: 'activity' },
  },
  {
    name: 'Cardiac Care Program', code: 'RIDER_CARDIAC',
    description: 'ECG-based cardiac risk monitoring, cardiologist review, and emergency alert system',
    type: 'personal', planType: 'addon', tier: 22, tierName: 'Clinical Rider',
    price: 5999.00, discountedPrice: null, durationMonths: 12,
    isMaster: false, isActive: true, isFeatured: false, sortOrder: 2,
    features: { riderType: 'cardiac', includes: ['ecg_watch_eligibility', 'cardiac_risk_alerts', 'monthly_review', 'cardiologist_consult', 'emergency_escalation', 'bp_monitoring'], deviceEligible: 'smartwatch', consultations: { cardiologist: 2, gp: 6 } },
    benefits: ['ECG smartwatch eligibility (add-on)', 'Monthly cardiac risk review', '2 cardiologist consultations/year', '6 GP consultations/year', 'Emergency escalation protocol', 'BP & rhythm monitoring alerts'],
    metadata: { category: 'clinical_rider', targetCondition: 'cardiac', color: '#ef4444', icon: 'heart' },
  },
  {
    name: 'Weight & Metabolic Program', code: 'RIDER_WEIGHT',
    description: 'Structured weight loss with nutritionist, activity coach, and metabolic health tracking',
    type: 'personal', planType: 'addon', tier: 23, tierName: 'Clinical Rider',
    price: 3999.00, discountedPrice: null, durationMonths: 12,
    isMaster: false, isActive: true, isFeatured: false, sortOrder: 3,
    features: { riderType: 'weight_metabolic', includes: ['nutritionist', 'activity_coach', 'metabolic_tracking', 'smart_band_eligibility', 'weekly_checkin'], deviceEligible: 'smart_band', consultations: { nutritionist: 12, activity_coach: 12 } },
    benefits: ['Nutritionist consultations (12/year)', 'Activity coach (12/year)', 'Smart band eligibility (add-on)', 'Weekly check-in & progress tracking', 'Personalized diet & workout plan', 'Metabolic health reports'],
    metadata: { category: 'clinical_rider', targetCondition: 'obesity_metabolic', color: '#10b981', icon: 'trending-down' },
  },
  {
    name: 'Elderly Care Program', code: 'RIDER_ELDERLY',
    description: '24x7 fall detection, vitals monitoring, medicine adherence, and emergency alerts for senior members',
    type: 'personal', planType: 'addon', tier: 24, tierName: 'Clinical Rider',
    price: 7999.00, discountedPrice: null, durationMonths: 12,
    isMaster: false, isActive: true, isFeatured: false, sortOrder: 4,
    features: { riderType: 'elderly', includes: ['fall_detection', 'vitals_monitoring', 'medicine_adherence', 'emergency_alerts_24x7', 'caregiver_dashboard', 'smartwatch_eligibility', 'monthly_geriatric_review'], deviceEligible: 'smartwatch', consultations: { geriatrician: 2, gp: 12 } },
    benefits: ['24x7 fall detection & emergency alerts', 'SmartWatch eligibility (add-on)', 'Medicine adherence reminders', 'Caregiver dashboard access', 'Monthly geriatric review', '12 GP consultations/year', '2 geriatrician consultations/year'],
    metadata: { category: 'clinical_rider', targetCondition: 'elderly', color: '#8b5cf6', icon: 'shield' },
  },
  {
    name: 'Mental Wellness Program', code: 'RIDER_MENTAL',
    description: 'Therapist sessions, stress management, sleep coaching, and mindfulness support',
    type: 'personal', planType: 'addon', tier: 25, tierName: 'Clinical Rider',
    price: 2999.00, discountedPrice: null, durationMonths: 12,
    isMaster: false, isActive: true, isFeatured: false, sortOrder: 5,
    features: { riderType: 'mental_wellness', includes: ['therapist_sessions', 'stress_management', 'sleep_coaching', 'mindfulness_app', 'smart_ring_eligibility', 'crisis_support'], deviceEligible: 'smart_ring', consultations: { therapist: 6, counsellor: 6 } },
    benefits: ['6 therapist sessions/year', '6 counsellor sessions/year', 'Smart Ring eligibility (add-on)', 'Sleep & stress coaching', 'Mindfulness & meditation support', 'Crisis support line access'],
    metadata: { category: 'clinical_rider', targetCondition: 'mental_health', color: '#06b6d4', icon: 'brain' },
  },
];

/**
 * Seed the SmartHealth plans (upsert by code — safe to re-run).
 * Personal : Smart Basic · Silver · Silver+Ins · Gold · Gold+Ins · Platinum · Platinum+Ins · Diamond · Diamond+Ins · VitalTrack
 * Corporate: Basic · Basic Plus · Premium · Elite · Signature · Exclusive
 * Clinical Riders: Diabetes · Cardiac · Weight · Elderly · Mental Wellness
 */
export async function seedMediqzyPlans() {
  console.log('🏥 Seeding SmartHealth Plans...\n');
  try {
    let created = 0, updated = 0;
    for (const planData of MEDIQZY_PLANS) {
      const existing = await MembershipPlan.findOne({ where: { code: planData.code } });
      if (existing) {
        await existing.update(planData);
        console.log(`🔄 Updated: ${planData.name}`);
        updated++;
      } else {
        await MembershipPlan.create(planData);
        console.log(`✅ Created: ${planData.name}`);
        created++;
      }
    }
    // Deactivate legacy plans replaced by SmartHealth structure
    const legacyCodes = ['INDIVIDUAL', 'COUPLE', 'FAMILY', 'CORPORATE', 'BASIC_FREE', 'SILVER_PLUS', 'SILVER_ELITE'];
    const [deactivated] = await MembershipPlan.update({ isActive: false }, { where: { code: legacyCodes } });
    if (deactivated) console.log(`\n🗂️  Deactivated ${deactivated} legacy plan(s)`);
    console.log(`\n✅ SmartHealth plans seeding complete: ${created} created, ${updated} updated`);
    console.log('   Personal : Smart Basic · Silver · Silver+Ins · Gold · Gold+Ins · Platinum · Platinum+Ins · Diamond · Diamond+Ins · VitalTrack');
    console.log('   Corporate: Basic · Basic Plus · Premium · Elite · Signature · Exclusive\n');
  } catch (error) {
    console.error('❌ Error seeding Mediqzy plans:', error);
    throw error;
  }
}

/**
 * Run seeder if called directly
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const target = process.argv[2] === '--mediqzy' ? seedMediqzyPlans : seedMembershipTiers;
  target()
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
