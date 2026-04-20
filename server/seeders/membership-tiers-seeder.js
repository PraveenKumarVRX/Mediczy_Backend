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

// ── Mediqzy Plan Definitions ──────────────────────────────────────────────────
// Personal: Basic (Free Trial) → Silver → Silver Plus → Silver Elite → Gold (Couple) → Platinum (Family 4) → Diamond (Family 6)
// Corporate: Corporate Basic → Basic Plus → Premium → Elite → Signature → Exclusive
const MEDIQZY_PLANS = [
  // ── PERSONAL PLANS ────────────────────────────────────────────────────────
  {
    name: 'Basic', code: 'BASIC_FREE',
    description: 'Try Mediqzy free for 3 months — 10 GP teleconsultations, wellness tools & emergency care for yourself',
    type: 'personal', planType: 'primary', tier: 0, tierName: 'Basic',
    price: 0.00, discountedPrice: null, durationMonths: 3,
    isMaster: true, isActive: true, isFeatured: false, sortOrder: 1,
    features: { videoCalls: 10, audioCalls: 10, chat: 'unlimited', pharmacy: false, homecare: false, ambulance: false, familyMembers: 0, aiScribe: false },
    benefits: [
      '10 GP teleconsultations (3-month trial)',
      '3 emergency consultations',
      'HRA (Health Risk Assessment)',
      'AI health chat assistant',
      'Activity tracker',
      'Personalised diet plan',
      'Digital prescriptions',
      '1 member (self only)',
    ],
    limitations: { pharmacy: 'Not included', homecare: 'Not included', ambulance: 'Not included', familyMembers: 'Self only', labTests: 'Not included', insurance: 'Not included' },
    metadata: {
      color: '#6b7280', icon: 'zap', trialDays: 90,
      annualPrice: null,
      coverageDetails: {
        onlineConsult: { limit: 10, unit: 'GP only, 3-month trial' },
        physicalConsult: { limit: 0 },
        labTests: { limitINR: 0 },
        pharmacy: { limitINR: 0, discountPct: 0 },
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
    name: 'Silver', code: 'SILVER',
    description: 'Unlimited GP consultations for 1 member — pharmacy credit, lab discounts & annual health checkup',
    type: 'personal', planType: 'primary', tier: 1, tierName: 'Silver',
    price: 199.00, discountedPrice: null, durationMonths: 1,
    isMaster: true, isActive: true, isFeatured: false, sortOrder: 2,
    features: { videoCalls: 999, audioCalls: 999, chat: 'unlimited', pharmacy: true, homecare: false, ambulance: false, familyMembers: 0, aiScribe: true },
    benefits: [
      'Unlimited GP teleconsultations (fair-use: 10/month)',
      '1 annual health checkup',
      '₹500 pharmacy credit/year',
      'Specialist & in-person consultations at 50% discount',
      'Lab tests at 30% discount',
      'Pharmacy at 20% discount',
      'HRA, AI Chat, Activity Tracker, Diet Plan',
      '3 emergency consultations/year',
      '1 member (self only)',
    ],
    limitations: { familyMembers: 'Self only', homecare: 'Not included', ambulance: 'Not included', insurance: 'Not included' },
    metadata: {
      color: '#94a3b8', icon: 'shield',
      annualPrice: 2199,
      discounts: { specialist: 50, labTests: 30, pharmacy: 20 },
      coverageDetails: {
        onlineConsult: { limit: 10, unit: 'GP/month (fair-use)', unlimited: true },
        physicalConsult: { limit: 0, discountPct: 50 },
        labTests: { limitINR: 0, discountPct: 30 },
        pharmacy: { limitINR: 500, discountPct: 20, note: '₹500 credit + 20% discount' },
        homeCare: { limitINR: 0 },
        ambulance: { limitINR: 0 },
        healthCheck: { package: 'Basic Annual Checkup', count: 1 },
        emergencyConsult: { limit: 3 },
        dental: { limitINR: 0 },
        insurance: { health: 0, accident: 0, life: 0 },
      },
      wellness: { hra: true, aiChat: true, activityTracker: true, dietPlan: true, mentalHealth: false },
    }
  },
  {
    name: 'Silver Plus', code: 'SILVER_PLUS',
    description: 'Everything in Silver plus 5 Lakh Health Insurance & 5 Lakh Accident Insurance',
    type: 'personal', planType: 'primary', tier: 2, tierName: 'Silver Plus',
    price: 499.00, discountedPrice: null, durationMonths: 1,
    isMaster: true, isActive: true, isFeatured: false, sortOrder: 3,
    features: { videoCalls: 999, audioCalls: 999, chat: 'unlimited', pharmacy: true, homecare: false, ambulance: false, familyMembers: 0, aiScribe: true, healthInsurance: true, accidentInsurance: true },
    benefits: [
      'All Silver benefits included',
      '₹5,00,000 Health Insurance (₹3L + ₹2L)',
      '₹5,00,000 Accident Insurance',
      'Unlimited GP teleconsultations (fair-use: 10/month)',
      '1 annual health checkup',
      '₹500 pharmacy credit/year',
      'Specialist & in-person at 50% discount',
      'Lab tests at 30% discount',
      'Pharmacy at 20% discount',
      '1 member (self only)',
    ],
    limitations: { familyMembers: 'Self only', homecare: 'Not included', ambulance: 'Not included', lifeInsurance: 'Not included' },
    metadata: {
      color: '#64748b', icon: 'shield',
      annualPrice: 5499,
      badge: 'With Insurance',
      discounts: { specialist: 50, labTests: 30, pharmacy: 20 },
      insurance: { health: 500000, healthBreakdown: '3L base + 2L top-up', accident: 500000, life: 0 },
      insuranceNote: 'Via IRDAI-licensed insurer partnership. Subject to insurer T&C.',
      coverageDetails: {
        onlineConsult: { limit: 10, unit: 'GP/month (fair-use)', unlimited: true },
        physicalConsult: { limit: 0, discountPct: 50 },
        labTests: { limitINR: 0, discountPct: 30 },
        pharmacy: { limitINR: 500, discountPct: 20 },
        homeCare: { limitINR: 0 },
        ambulance: { limitINR: 0 },
        healthCheck: { package: 'Basic Annual Checkup', count: 1 },
        emergencyConsult: { limit: 3 },
        dental: { limitINR: 0 },
        insurance: { health: 500000, accident: 500000, life: 0 },
      },
      wellness: { hra: true, aiChat: true, activityTracker: true, dietPlan: true, mentalHealth: false },
    }
  },
  {
    name: 'Silver Elite', code: 'SILVER_ELITE',
    description: 'Everything in Silver Plus plus 5 Lakh Life Insurance coverage',
    type: 'personal', planType: 'primary', tier: 3, tierName: 'Silver Elite',
    price: 699.00, discountedPrice: null, durationMonths: 1,
    isMaster: true, isActive: true, isFeatured: false, sortOrder: 4,
    features: { videoCalls: 999, audioCalls: 999, chat: 'unlimited', pharmacy: true, homecare: false, ambulance: false, familyMembers: 0, aiScribe: true, healthInsurance: true, accidentInsurance: true, lifeInsurance: true },
    benefits: [
      'All Silver Plus benefits included',
      '₹5,00,000 Life Insurance',
      '₹5,00,000 Health Insurance (₹3L + ₹2L)',
      '₹5,00,000 Accident Insurance',
      'Unlimited GP teleconsultations (fair-use: 10/month)',
      '1 annual health checkup',
      '₹500 pharmacy credit/year',
      'Specialist & in-person at 50% discount',
      'Lab tests at 30% discount',
      '1 member (self only)',
    ],
    limitations: { familyMembers: 'Self only', homecare: 'Not included', ambulance: 'Not included' },
    metadata: {
      color: '#475569', icon: 'shield',
      annualPrice: 7799,
      badge: 'Full Protection',
      discounts: { specialist: 50, labTests: 30, pharmacy: 20 },
      insurance: { health: 500000, healthBreakdown: '3L base + 2L top-up', accident: 500000, life: 500000 },
      insuranceNote: 'Via IRDAI-licensed insurer partnership. Subject to insurer T&C.',
      coverageDetails: {
        onlineConsult: { limit: 10, unit: 'GP/month (fair-use)', unlimited: true },
        physicalConsult: { limit: 0, discountPct: 50 },
        labTests: { limitINR: 0, discountPct: 30 },
        pharmacy: { limitINR: 500, discountPct: 20 },
        homeCare: { limitINR: 0 },
        ambulance: { limitINR: 0 },
        healthCheck: { package: 'Basic Annual Checkup', count: 1 },
        emergencyConsult: { limit: 3 },
        dental: { limitINR: 0 },
        insurance: { health: 500000, accident: 500000, life: 500000 },
      },
      wellness: { hra: true, aiChat: true, activityTracker: true, dietPlan: true, mentalHealth: false },
    }
  },
  {
    name: 'Gold', code: 'GOLD',
    description: 'Unlimited GP consultations for couples — 2 health checkups, pharmacy credit & full wellness suite',
    type: 'personal', planType: 'primary', tier: 4, tierName: 'Gold',
    price: 399.00, discountedPrice: null, durationMonths: 1,
    isMaster: true, isActive: true, isFeatured: true, sortOrder: 5,
    features: { videoCalls: 999, audioCalls: 999, chat: 'unlimited', pharmacy: true, homecare: false, ambulance: false, familyMembers: 1, aiScribe: true },
    benefits: [
      'Unlimited GP teleconsultations (fair-use: 15/month combined)',
      '2 annual health checkups (1 per person)',
      '₹1,000 pharmacy credit/year',
      'Specialist & in-person at 50% discount',
      'Lab tests at 30% discount',
      'Pharmacy at 20% discount',
      'HRA, AI Chat, Activity Tracker, Diet Plan',
      '3 emergency consultations/year',
      'Couple plan (self + spouse/partner)',
    ],
    limitations: { homecare: 'Not included', ambulance: 'Not included', insurance: 'Not included' },
    metadata: {
      color: '#f59e0b', icon: 'star', badge: 'Most Popular',
      annualPrice: 4399,
      members: 2, membersLabel: 'Couple',
      discounts: { specialist: 50, labTests: 30, pharmacy: 20 },
      coverageDetails: {
        onlineConsult: { limit: 15, unit: 'combined/month (fair-use)', unlimited: true },
        physicalConsult: { limit: 0, discountPct: 50 },
        labTests: { limitINR: 0, discountPct: 30 },
        pharmacy: { limitINR: 1000, discountPct: 20, note: '₹1,000 credit + 20% discount' },
        homeCare: { limitINR: 0 },
        ambulance: { limitINR: 0 },
        healthCheck: { package: 'Basic Annual Checkup', count: 2 },
        emergencyConsult: { limit: 3 },
        dental: { limitINR: 0 },
        insurance: { health: 0, accident: 0, life: 0 },
      },
      wellness: { hra: true, aiChat: true, activityTracker: true, dietPlan: true, mentalHealth: false },
    }
  },
  {
    name: 'Platinum', code: 'PLATINUM',
    description: 'Family of 4 plan — unlimited GP, 4 health checkups, pharmacy credit & full wellness suite',
    type: 'personal', planType: 'primary', tier: 5, tierName: 'Platinum',
    price: 499.00, discountedPrice: null, durationMonths: 1,
    isMaster: true, isActive: true, isFeatured: false, sortOrder: 6,
    features: { videoCalls: 999, audioCalls: 999, chat: 'unlimited', pharmacy: true, homecare: false, ambulance: false, familyMembers: 3, aiScribe: true },
    benefits: [
      'Unlimited GP teleconsultations (fair-use: 20/month combined)',
      '4 annual health checkups (1 per family member, including children)',
      '₹1,500 pharmacy credit/year',
      'Specialist & in-person at 50% discount',
      'Lab tests at 30% discount',
      'Pharmacy at 20% discount',
      'HRA, AI Chat, Activity Tracker, Diet Plan',
      '3 emergency consultations/year',
      'Family plan: husband, wife & 2 children',
    ],
    limitations: { homecare: 'Not included', ambulance: 'Not included', insurance: 'Not included' },
    metadata: {
      color: '#0ea5e9', icon: 'crown',
      annualPrice: 5599,
      members: 4, membersLabel: 'Family (4)',
      discounts: { specialist: 50, labTests: 30, pharmacy: 20 },
      coverageDetails: {
        onlineConsult: { limit: 20, unit: 'combined/month (fair-use)', unlimited: true },
        physicalConsult: { limit: 0, discountPct: 50 },
        labTests: { limitINR: 0, discountPct: 30 },
        pharmacy: { limitINR: 1500, discountPct: 20, note: '₹1,500 credit + 20% discount' },
        homeCare: { limitINR: 0 },
        ambulance: { limitINR: 0 },
        healthCheck: { package: 'Basic Annual Checkup', count: 4 },
        emergencyConsult: { limit: 3 },
        dental: { limitINR: 0 },
        insurance: { health: 0, accident: 0, life: 0 },
      },
      wellness: { hra: true, aiChat: true, activityTracker: true, dietPlan: true, mentalHealth: false },
    }
  },
  {
    name: 'Diamond', code: 'DIAMOND',
    description: 'Extended family of 6 — unlimited GP for all, health checkups for everyone & premium pharmacy benefit',
    type: 'personal', planType: 'primary', tier: 6, tierName: 'Diamond',
    price: 1499.00, discountedPrice: null, durationMonths: 1,
    isMaster: true, isActive: true, isFeatured: false, sortOrder: 7,
    features: { videoCalls: 999, audioCalls: 999, chat: 'unlimited', pharmacy: true, homecare: false, ambulance: false, familyMembers: 5, aiScribe: true },
    benefits: [
      'Unlimited GP teleconsultations (fair-use: 30/month combined)',
      '6 annual health checkups (1 per member)',
      '₹3,000 pharmacy credit/year',
      'Specialist & in-person at 50% discount',
      'Lab tests at 30% discount',
      'Pharmacy at 20% discount',
      'HRA, AI Chat, Activity Tracker, Diet Plan',
      '3 emergency consultations/year',
      'Extended family: husband, wife, 2 children & 2 grandparents',
    ],
    limitations: { homecare: 'Not included', ambulance: 'Not included', insurance: 'Not included' },
    metadata: {
      color: '#7c3aed', icon: 'gem', badge: 'Best Value',
      annualPrice: 16999,
      members: 6, membersLabel: 'Family (6)',
      discounts: { specialist: 50, labTests: 30, pharmacy: 20 },
      coverageDetails: {
        onlineConsult: { limit: 30, unit: 'combined/month (fair-use)', unlimited: true },
        physicalConsult: { limit: 0, discountPct: 50 },
        labTests: { limitINR: 0, discountPct: 30 },
        pharmacy: { limitINR: 3000, discountPct: 20, note: '₹3,000 credit + 20% discount' },
        homeCare: { limitINR: 0 },
        ambulance: { limitINR: 0 },
        healthCheck: { package: 'Basic Annual Checkup', count: 6 },
        emergencyConsult: { limit: 3 },
        dental: { limitINR: 0 },
        insurance: { health: 0, accident: 0, life: 0 },
      },
      wellness: { hra: true, aiChat: true, activityTracker: true, dietPlan: true, mentalHealth: false },
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
];

/**
 * Seed the 13 Mediqzy plans (upsert by code — safe to re-run).
 * Personal : Basic (Free) · Silver · Silver Plus · Silver Elite · Gold · Platinum · Diamond
 * Corporate: Basic · Basic Plus · Premium · Elite · Signature · Exclusive
 */
export async function seedMediqzyPlans() {
  console.log('🏥 Seeding Mediqzy Plans...\n');
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
    // Deactivate any legacy plans not in the new set
    const legacyCodes = ['INDIVIDUAL', 'COUPLE', 'FAMILY', 'CORPORATE'];
    const [deactivated] = await MembershipPlan.update({ isActive: false }, { where: { code: legacyCodes } });
    if (deactivated) console.log(`\n🗂️  Deactivated ${deactivated} legacy plan(s)`);
    console.log(`\n✅ Mediqzy plans seeding complete: ${created} created, ${updated} updated`);
    console.log('   Personal : Basic (Free) · Silver · Silver Plus · Silver Elite · Gold · Platinum · Diamond');
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
