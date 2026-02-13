/**
 * Membership Plans Configuration
 * Defines all available membership plans with features and pricing
 */

export const PLAN_TYPES = {
  PERSONAL: 'PERSONAL',
  CORPORATE: 'CORPORATE'
};

export const PLAN_SLUGS = {
  FREE_BASIC: 'free-basic',
  BASIC: 'basic',
  PREMIUM: 'premium',
  ENTERPRISE: 'enterprise',
  CORPORATE_BASIC: 'corporate-basic',
  CORPORATE_PREMIUM: 'corporate-premium',
  CORPORATE_ENTERPRISE: 'corporate-enterprise'
};

export const MEMBERSHIP_PLANS = [
  // Personal Plans
  {
    name: 'Free Basic',
    slug: PLAN_SLUGS.FREE_BASIC,
    type: PLAN_TYPES.PERSONAL,
    tier: 0,
    price: 0,
    annualPrice: 0,
    billingCycle: 'LIFETIME',
    description: 'Free forever plan for new users with referral code',
    requiresReferral: true,
    isActive: true,
    isPopular: false,
    allowsUpgrade: true,
    features: {
      // Consultations
      videoCalls: { enabled: true, limit: 2, period: 'month', description: '2 video consultations per month' },
      audioCalls: { enabled: true, limit: 3, period: 'month', description: '3 audio consultations per month' },
      chatConsultations: { enabled: true, limit: 5, period: 'month', description: '5 chat consultations per month' },
      doctorOnChat: { enabled: true, limit: 5, period: 'month', description: 'Chat with doctors' },
      
      // Health Testing & Assessment
      healthTestPackage: { enabled: true, limit: 1, period: 'month', description: '1 health test package per month' },
      healthRiskAssessment: { enabled: true, limit: 1, period: 'month', description: '1 risk assessment per month' },
      healthMonitoring: { enabled: true, description: 'Basic health monitoring' },
      
      // Health & Wellness Services
      pharmacy: { enabled: true, description: 'Access to pharmacy services' },
      homecare: { enabled: false },
      ambulance: { enabled: false },
      
      // Wellness & Education
      dietPlans: { enabled: true, limit: 1, description: '1 basic diet plan' },
      wellnessChallenges: { enabled: true, limit: 2, period: 'month', description: 'Join 2 wellness challenges per month' },
      healthFeed: { enabled: true, description: 'Access health feed & articles' },
      healthBlogs: { enabled: true, limit: 'unlimited', description: 'Read unlimited health blogs' },
      healthDiary: { enabled: true, description: 'Daily health diary' },
      
      // Community & Events
      healthWeekly: { enabled: true, limit: 4, period: 'month', description: 'Join 4 webinars per month' },
      healthCamp: { enabled: true, limit: 2, period: 'year', description: 'Attend 2 health camps per year' },
      
      // Insurance & Support
      insuranceAccess: { enabled: false },
      
      // Health Tracking
      healthTracker: { enabled: true, description: 'Basic health metrics tracking' },
      vitalSigns: { enabled: true, limit: 10, period: 'month', description: 'Log 10 vital signs per month' },
      healthGoals: { enabled: true, limit: 2, description: 'Set up to 2 health goals' },
      
      // Records & Reports
      healthRecords: { enabled: true, limit: 5, description: 'Upload 5 health records' },
      prescriptions: { enabled: true, limit: 5, period: 'month', description: '5 e-prescriptions per month' },
      labReports: { enabled: true, limit: 3, period: 'month', description: 'Upload 3 lab reports per month' },
      
      // AI Features
      aiScribe: { enabled: false },
      symptomChecker: { enabled: true, limit: 5, period: 'month', description: '5 symptom checks per month' },
      
      // Family & Appointments
      familyMembers: { enabled: true, limit: 2, description: 'Add up to 2 family members' },
      appointmentBooking: { enabled: true, limit: 3, period: 'month', description: 'Book 3 appointments per month' },
      appointmentReminders: { enabled: true },
      
      // Health Coins
      healthCoins: { enabled: true, description: 'Earn and spend health coins' },
      coinsEarningRate: { multiplier: 1.0, description: 'Standard earning rate' },
      coinsDiscount: { percentage: 0, description: 'No discount on coin purchases' },
      
      // Support
      support: { type: 'email', responseTime: '48 hours', description: 'Email support within 48 hours' },
      priorityBooking: { enabled: false },
      
      // Additional
      storageLimit: { amount: 100, unit: 'MB', description: '100 MB cloud storage' },
      dataExport: { enabled: false },
      adFree: { enabled: false }
    }
  },
  {
    name: 'Basic',
    slug: PLAN_SLUGS.BASIC,
    type: PLAN_TYPES.PERSONAL,
    tier: 1,
    price: 199,
    annualPrice: 1999, // ~17% discount
    billingCycle: 'MONTHLY',
    description: 'Essential healthcare features for individuals',
    requiresReferral: false,
    isActive: true,
    isPopular: false,
    allowsUpgrade: true,
    features: {
      videoCalls: { enabled: true, limit: 5, period: 'month', description: '5 video consultations per month' },
      audioCalls: { enabled: true, limit: 10, period: 'month', description: '10 audio consultations per month' },
      chatConsultations: { enabled: true, limit: 20, period: 'month', description: '20 chat consultations per month' },
      doctorOnChat: { enabled: true, limit: 20, period: 'month', description: '20 doctor chats per month' },
      
      healthTestPackage: { enabled: true, limit: 2, period: 'month', description: '2 health test packages per month' },
      healthRiskAssessment: { enabled: true, limit: 4, period: 'month', description: '4 risk assessments per month' },
      healthMonitoring: { enabled: true, description: 'Complete health monitoring' },
      
      pharmacy: { enabled: true, description: 'Premium pharmacy access' },
      homecare: { enabled: true, limit: 1, period: 'month', description: '1 homecare visit per month' },
      ambulance: { enabled: false },
      
      dietPlans: { enabled: true, limit: 'unlimited', description: 'Unlimited personalized diet plans' },
      wellnessChallenges: { enabled: true, limit: 'unlimited', description: 'Unlimited wellness challenges' },
      healthFeed: { enabled: true, description: 'Priority health feed access' },
      healthBlogs: { enabled: true, limit: 'unlimited', description: 'Unlimited premium health blogs' },
      healthDiary: { enabled: true, description: 'Advanced health diary with analytics' },
      
      healthWeekly: { enabled: true, limit: 'unlimited', description: 'Unlimited webinar attendance' },
      healthCamp: { enabled: true, limit: 4, period: 'year', description: '4 health camps per year' },
      
      insuranceAccess: { enabled: false },
      
      healthTracker: { enabled: true, description: 'Complete health metrics tracking' },
      vitalSigns: { enabled: true, limit: 'unlimited', description: 'Unlimited vital signs logging' },
      healthGoals: { enabled: true, limit: 5, description: 'Set up to 5 health goals' },
      
      healthRecords: { enabled: true, limit: 20, description: 'Upload 20 health records' },
      prescriptions: { enabled: true, limit: 'unlimited', description: 'Unlimited e-prescriptions' },
      labReports: { enabled: true, limit: 10, period: 'month', description: 'Upload 10 lab reports per month' },
      
      aiScribe: { enabled: true, limit: 5, period: 'month', description: '5 AI-scribed consultations' },
      symptomChecker: { enabled: true, limit: 20, period: 'month', description: '20 symptom checks per month' },
      
      familyMembers: { enabled: true, limit: 4, description: 'Add up to 4 family members' },
      appointmentBooking: { enabled: true, limit: 10, period: 'month', description: 'Book 10 appointments per month' },
      appointmentReminders: { enabled: true },
      
      healthCoins: { enabled: true, description: 'Earn and spend health coins' },
      coinsEarningRate: { multiplier: 1.2, description: '20% bonus on coin earnings' },
      coinsDiscount: { percentage: 10, description: '10% discount on coin purchases' },
      
      support: { type: 'chat', responseTime: '24 hours', description: 'Chat support within 24 hours' },
      priorityBooking: { enabled: false },
      
      storageLimit: { amount: 500, unit: 'MB', description: '500 MB cloud storage' },
      dataExport: { enabled: true, description: 'Export your health data' },
      adFree: { enabled: true, description: 'Ad-free experience' }
    }
  },
  {
    name: 'Premium',
    slug: PLAN_SLUGS.PREMIUM,
    type: PLAN_TYPES.PERSONAL,
    tier: 2,
    price: 499,
    annualPrice: 4999, // ~17% discount
    billingCycle: 'MONTHLY',
    description: 'Complete healthcare with priority access and AI features',
    requiresReferral: false,
    isActive: true,
    isPopular: true,
    allowsUpgrade: true,
    features: {
      videoCalls: { enabled: true, limit: 'unlimited', description: 'Unlimited video consultations' },
      audioCalls: { enabled: true, limit: 'unlimited', description: 'Unlimited audio consultations' },
      chatConsultations: { enabled: true, limit: 'unlimited', description: 'Unlimited chat consultations' },
      doctorOnChat: { enabled: true, limit: 'unlimited', description: 'Unlimited doctor chat access' },
      
      healthTestPackage: { enabled: true, limit: 'unlimited', description: 'Unlimited health test packages' },
      healthRiskAssessment: { enabled: true, limit: 'unlimited', description: 'Unlimited risk assessments' },
      healthMonitoring: { enabled: true, description: 'Advanced health analytics & insights' },
      
      pharmacy: { enabled: true, description: 'Priority pharmacy with delivery' },
      homecare: { enabled: true, limit: 4, period: 'month', description: '4 homecare visits per month' },
      ambulance: { enabled: true, description: 'Priority ambulance access' },
      
      dietPlans: { enabled: true, limit: 'unlimited', description: 'Unlimited diet plans with AI coaching' },
      wellnessChallenges: { enabled: true, limit: 'unlimited', description: 'Unlimited wellness challenges' },
      healthFeed: { enabled: true, description: 'Exclusive health feed content' },
      healthBlogs: { enabled: true, limit: 'unlimited', description: 'Unlimited exclusive health blogs' },
      healthDiary: { enabled: true, description: 'Premium health diary with insights' },
      
      healthWeekly: { enabled: true, limit: 'unlimited', description: 'Unlimited webinar & expert sessions' },
      healthCamp: { enabled: true, limit: 'unlimited', description: 'Unlimited health camps & events' },
      
      insuranceAccess: { enabled: false },
      
      healthTracker: { enabled: true, description: 'Advanced health analytics & insights' },
      vitalSigns: { enabled: true, limit: 'unlimited', description: 'Unlimited vital signs with trends' },
      healthGoals: { enabled: true, limit: 'unlimited', description: 'Unlimited health goals' },
      
      healthRecords: { enabled: true, limit: 'unlimited', description: 'Unlimited health records' },
      prescriptions: { enabled: true, limit: 'unlimited', description: 'Unlimited e-prescriptions' },
      labReports: { enabled: true, limit: 'unlimited', description: 'Unlimited lab reports' },
      
      aiScribe: { enabled: true, limit: 'unlimited', description: 'Unlimited AI-scribed consultations' },
      symptomChecker: { enabled: true, limit: 'unlimited', description: 'Unlimited symptom checks' },
      aiHealthInsights: { enabled: true, description: 'AI-powered personalized health insights' },
      
      familyMembers: { enabled: true, limit: 8, description: 'Add up to 8 family members' },
      appointmentBooking: { enabled: true, limit: 'unlimited', description: 'Unlimited appointment booking' },
      appointmentReminders: { enabled: true, description: 'SMS + Email + Push notifications' },
      priorityBooking: { enabled: true, description: 'Priority appointment slots' },
      
      healthCoins: { enabled: true, description: 'Earn and spend health coins' },
      coinsEarningRate: { multiplier: 1.5, description: '50% bonus on coin earnings' },
      coinsDiscount: { percentage: 20, description: '20% discount on coin purchases' },
      
      support: { type: 'priority', responseTime: '4 hours', description: 'Priority support within 4 hours' },
      dedicatedManager: { enabled: true, description: 'Dedicated health manager' },
      
      storageLimit: { amount: 5, unit: 'GB', description: '5 GB cloud storage' },
      dataExport: { enabled: true, description: 'Export your health data anytime' },
      adFree: { enabled: true, description: 'Completely ad-free' },
      
      // Premium exclusives
      secondOpinion: { enabled: true, limit: 2, period: 'month', description: '2 second opinions per month' },
      homeVisit: { enabled: true, limit: 1, period: 'month', description: '1 home visit per month' },
      labTestDiscount: { percentage: 15, description: '15% discount on lab tests' },
      pharmacyDiscount: { percentage: 10, description: '10% discount on medicines' }
    }
  },
  {
    name: 'Enterprise',
    slug: PLAN_SLUGS.ENTERPRISE,
    type: PLAN_TYPES.PERSONAL,
    tier: 3,
    price: 999,
    annualPrice: 9999, // ~17% discount
    billingCycle: 'MONTHLY',
    description: 'Ultimate healthcare with concierge service and unlimited access',
    requiresReferral: false,
    isActive: true,
    isPopular: false,
    allowsUpgrade: false,
    features: {
      // All Premium features plus
      videoCalls: { enabled: true, limit: 'unlimited', description: 'Unlimited 4K video consultations' },
      audioCalls: { enabled: true, limit: 'unlimited', description: 'Unlimited HD audio consultations' },
      chatConsultations: { enabled: true, limit: 'unlimited', description: 'Unlimited priority chat' },
      doctorOnChat: { enabled: true, limit: 'unlimited', description: '24/7 doctor chat priority access' },
      
      healthTestPackage: { enabled: true, limit: 'unlimited', description: 'Unlimited comprehensive health tests' },
      healthRiskAssessment: { enabled: true, limit: 'unlimited', description: 'Continuous risk monitoring' },
      healthMonitoring: { enabled: true, description: 'Enterprise health analytics with ML insights' },
      
      pharmacy: { enabled: true, description: 'Concierge pharmacy service' },
      homecare: { enabled: true, limit: 'unlimited', description: 'Unlimited homecare visits' },
      ambulance: { enabled: true, description: 'Priority 24/7 ambulance service' },
      
      dietPlans: { enabled: true, limit: 'unlimited', description: 'Unlimited personalized diet coaching' },
      wellnessChallenges: { enabled: true, limit: 'unlimited', description: 'Exclusive wellness programs' },
      healthFeed: { enabled: true, description: 'Exclusive premium health content' },
      healthBlogs: { enabled: true, limit: 'unlimited', description: 'Unlimited exclusive expert blogs' },
      healthDiary: { enabled: true, description: 'AI-powered health diary with predictions' },
      
      healthWeekly: { enabled: true, limit: 'unlimited', description: '24/7 access to webinars & experts' },
      healthCamp: { enabled: true, limit: 'unlimited', description: 'VIP access to all health camps' },
      
      insuranceAccess: { enabled: false },
      
      healthTracker: { enabled: true, description: 'Enterprise health analytics with ML insights' },
      vitalSigns: { enabled: true, limit: 'unlimited', description: 'Real-time vital signs monitoring' },
      healthGoals: { enabled: true, limit: 'unlimited', description: 'Unlimited goals with AI coaching' },
      
      healthRecords: { enabled: true, limit: 'unlimited', description: 'Unlimited encrypted records' },
      prescriptions: { enabled: true, limit: 'unlimited', description: 'Digital prescriptions with delivery' },
      labReports: { enabled: true, limit: 'unlimited', description: 'Unlimited reports with AI analysis' },
      
      aiScribe: { enabled: true, limit: 'unlimited', description: 'Unlimited AI medical scribe' },
      symptomChecker: { enabled: true, limit: 'unlimited', description: 'Unlimited AI symptom analysis' },
      aiHealthInsights: { enabled: true, description: 'Advanced AI health predictions' },
      
      familyMembers: { enabled: true, limit: 'unlimited', description: 'Unlimited family members' },
      appointmentBooking: { enabled: true, limit: 'unlimited', description: 'VIP appointment booking' },
      appointmentReminders: { enabled: true, description: 'Multi-channel reminders' },
      priorityBooking: { enabled: true, description: 'Top priority booking' },
      
      healthCoins: { enabled: true, description: 'Premium health coins' },
      coinsEarningRate: { multiplier: 2.0, description: '100% bonus on coin earnings' },
      coinsDiscount: { percentage: 30, description: '30% discount on coin purchases' },
      
      support: { type: 'concierge', responseTime: '1 hour', description: '24/7 concierge support' },
      dedicatedManager: { enabled: true, description: 'Personal health concierge' },
      
      storageLimit: { amount: 'unlimited', unit: 'GB', description: 'Unlimited cloud storage' },
      dataExport: { enabled: true, description: 'Export to any format anytime' },
      adFree: { enabled: true, description: 'Premium ad-free experience' },
      
      secondOpinion: { enabled: true, limit: 'unlimited', description: 'Unlimited second opinions' },
      homeVisit: { enabled: true, limit: 4, period: 'month', description: '4 home visits per month' },
      labTestDiscount: { percentage: 25, description: '25% discount on lab tests' },
      pharmacyDiscount: { percentage: 20, description: '20% discount on medicines' },
      
      // Enterprise exclusives
      annualHealthCheckup: { enabled: true, description: 'Comprehensive annual checkup' },
      geneticTesting: { enabled: true, limit: 1, period: 'year', description: '1 genetic test per year' },
      nutritionistAccess: { enabled: true, description: 'Personal nutritionist consultations' },
      fitnessCoach: { enabled: true, description: 'Personal fitness coach' },
      mentalHealthSupport: { enabled: true, description: 'Unlimited counseling sessions' },
      travelInsurance: { enabled: true, description: 'International travel health insurance' }
    }
  },

  // Corporate Plans
  {
    name: 'Corporate Basic',
    slug: PLAN_SLUGS.CORPORATE_BASIC,
    type: PLAN_TYPES.CORPORATE,
    tier: 1,
    price: 149, // Per employee per month
    annualPrice: 1499,
    billingCycle: 'MONTHLY',
    description: 'Essential healthcare for corporate employees',
    requiresReferral: false,
    isActive: true,
    isPopular: false,
    allowsUpgrade: true,
    maxUsers: null, // Unlimited employees
    features: {
      videoCalls: { enabled: true, limit: 3, period: 'month', description: '3 video consultations per month' },
      audioCalls: { enabled: true, limit: 5, period: 'month', description: '5 audio consultations per month' },
      chatConsultations: { enabled: true, limit: 10, period: 'month', description: '10 chat consultations per month' },
      doctorOnChat: { enabled: true, limit: 10, period: 'month', description: 'Chat with doctors' },
      
      healthTestPackage: { enabled: true, limit: 1, period: 'month', description: '1 health test package per month' },
      healthRiskAssessment: { enabled: true, limit: 2, period: 'month', description: '2 assessments per month' },
      healthMonitoring: { enabled: true, description: 'Employee health monitoring' },
      
      pharmacy: { enabled: true, description: 'Employee pharmacy access' },
      homecare: { enabled: false },
      ambulance: { enabled: false },
      
      dietPlans: { enabled: true, limit: 2, description: '2 diet plans' },
      wellnessChallenges: { enabled: true, description: 'Company wellness programs' },
      healthFeed: { enabled: true, description: 'Health feed access' },
      healthBlogs: { enabled: true, limit: 'unlimited', description: 'Unlimited health blogs' },
      healthDiary: { enabled: true, description: 'Health diary' },
      
      healthWeekly: { enabled: true, limit: 4, period: 'month', description: '4 webinars per month' },
      healthCamp: { enabled: true, limit: 2, period: 'year', description: '2 health camps per year' },
      
      insuranceAccess: { enabled: false },
      
      healthTracker: { enabled: true, description: 'Employee health tracking' },
      vitalSigns: { enabled: true, limit: 20, period: 'month', description: '20 vital signs per month' },
      healthGoals: { enabled: true, limit: 3, description: '3 health goals' },
      
      healthRecords: { enabled: true, limit: 10, description: '10 health records' },
      prescriptions: { enabled: true, limit: 10, period: 'month', description: '10 e-prescriptions per month' },
      labReports: { enabled: true, limit: 5, period: 'month', description: '5 lab reports per month' },
      
      aiScribe: { enabled: true, limit: 3, period: 'month', description: '3 AI-scribed consultations' },
      symptomChecker: { enabled: true, limit: 10, period: 'month', description: '10 symptom checks' },
      
      familyMembers: { enabled: true, limit: 3, description: 'Add 3 family members' },
      appointmentBooking: { enabled: true, limit: 5, period: 'month', description: '5 appointments per month' },
      appointmentReminders: { enabled: true },
      
      healthCoins: { enabled: true, description: 'Employee health coins' },
      coinsEarningRate: { multiplier: 1.1, description: '10% bonus on earnings' },
      
      support: { type: 'chat', responseTime: '24 hours', description: 'Corporate support' },
      
      storageLimit: { amount: 300, unit: 'MB', description: '300 MB storage' },
      dataExport: { enabled: true },
      adFree: { enabled: true },
      
      // Corporate features
      corporateDashboard: { enabled: true, description: 'Employee health dashboard' },
      bulkBooking: { enabled: true, description: 'Bulk appointment booking' },
      wellnessChallenges: { enabled: true, description: 'Company wellness programs' },
      healthReports: { enabled: true, description: 'Aggregated health reports' }
    }
  },
  {
    name: 'Corporate Premium',
    slug: PLAN_SLUGS.CORPORATE_PREMIUM,
    type: PLAN_TYPES.CORPORATE,
    tier: 2,
    price: 299,
    annualPrice: 2999,
    billingCycle: 'MONTHLY',
    description: 'Advanced corporate wellness with priority features',
    requiresReferral: false,
    isActive: true,
    isPopular: true,
    allowsUpgrade: true,
    maxUsers: null,
    features: {
      videoCalls: { enabled: true, limit: 10, period: 'month', description: '10 video consultations' },
      audioCalls: { enabled: true, limit: 15, period: 'month', description: '15 audio consultations' },
      chatConsultations: { enabled: true, limit: 30, period: 'month', description: '30 chat consultations' },
      doctorOnChat: { enabled: true, limit: 30, period: 'month', description: 'Priority doctor chats' },
      
      healthTestPackage: { enabled: true, limit: 4, period: 'month', description: '4 health test packages per month' },
      healthRiskAssessment: { enabled: true, limit: 'unlimited', description: 'Unlimited assessments' },
      healthMonitoring: { enabled: true, description: 'Advanced employee analytics' },
      
      pharmacy: { enabled: true, description: 'Premium pharmacy access' },
      homecare: { enabled: true, limit: 2, period: 'month', description: '2 homecare visits per month' },
      ambulance: { enabled: false },
      
      dietPlans: { enabled: true, limit: 'unlimited', description: 'Unlimited personalized diets' },
      wellnessChallenges: { enabled: true, limit: 'unlimited', description: 'Custom wellness programs' },
      healthFeed: { enabled: true, description: 'Priority health feed' },
      healthBlogs: { enabled: true, limit: 'unlimited', description: 'Unlimited expert blogs' },
      healthDiary: { enabled: true, description: 'Advanced health diary' },
      
      healthWeekly: { enabled: true, limit: 'unlimited', description: 'Unlimited webinar access' },
      healthCamp: { enabled: true, limit: 4, period: 'year', description: '4 health camps per year' },
      
      insuranceAccess: { enabled: false },
      
      healthTracker: { enabled: true, description: 'Advanced employee analytics' },
      vitalSigns: { enabled: true, limit: 'unlimited', description: 'Unlimited vital signs' },
      healthGoals: { enabled: true, limit: 10, description: '10 health goals' },
      
      healthRecords: { enabled: true, limit: 'unlimited', description: 'Unlimited records' },
      prescriptions: { enabled: true, limit: 'unlimited', description: 'Unlimited prescriptions' },
      labReports: { enabled: true, limit: 'unlimited', description: 'Unlimited lab reports' },
      
      aiScribe: { enabled: true, limit: 10, period: 'month', description: '10 AI-scribed consultations' },
      symptomChecker: { enabled: true, limit: 'unlimited', description: 'Unlimited symptom checks' },
      aiHealthInsights: { enabled: true, description: 'AI health insights' },
      
      familyMembers: { enabled: true, limit: 5, description: 'Add 5 family members' },
      appointmentBooking: { enabled: true, limit: 20, period: 'month', description: '20 appointments' },
      appointmentReminders: { enabled: true },
      priorityBooking: { enabled: true, description: 'Priority slots' },
      
      healthCoins: { enabled: true, description: 'Premium health coins' },
      coinsEarningRate: { multiplier: 1.3, description: '30% bonus earnings' },
      coinsDiscount: { percentage: 15, description: '15% discount' },
      
      support: { type: 'priority', responseTime: '8 hours', description: 'Priority corporate support' },
      
      storageLimit: { amount: 2, unit: 'GB', description: '2 GB storage' },
      dataExport: { enabled: true },
      adFree: { enabled: true },
      
      corporateDashboard: { enabled: true, description: 'Advanced analytics dashboard' },
      bulkBooking: { enabled: true, description: 'Priority bulk booking' },
      wellnessChallenges: { enabled: true, description: 'Custom wellness programs' },
      healthReports: { enabled: true, description: 'Detailed health insights' },
      
      // Premium corporate features
      annualCheckups: { enabled: true, description: 'Annual health checkups' },
      onsiteClinic: { enabled: true, description: 'On-site clinic support' },
      mentalHealthSupport: { enabled: true, limit: 5, period: 'month', description: '5 counseling sessions' },
      labTestDiscount: { percentage: 20, description: '20% lab test discount' }
    }
  },
  {
    name: 'Corporate Enterprise',
    slug: PLAN_SLUGS.CORPORATE_ENTERPRISE,
    type: PLAN_TYPES.CORPORATE,
    tier: 3,
    price: 599,
    annualPrice: 5999,
    billingCycle: 'MONTHLY',
    description: 'Complete corporate wellness solution with dedicated support',
    requiresReferral: false,
    isActive: true,
    isPopular: false,
    allowsUpgrade: false,
    maxUsers: null,
    features: {
      videoCalls: { enabled: true, limit: 'unlimited', description: 'Unlimited video consultations' },
      audioCalls: { enabled: true, limit: 'unlimited', description: 'Unlimited audio consultations' },
      chatConsultations: { enabled: true, limit: 'unlimited', description: 'Unlimited chat consultations' },
      doctorOnChat: { enabled: true, limit: 'unlimited', description: '24/7 priority doctor chat' },
      
      healthTestPackage: { enabled: true, limit: 'unlimited', description: 'Unlimited comprehensive tests' },
      healthRiskAssessment: { enabled: true, limit: 'unlimited', description: 'Continuous monitoring' },
      healthMonitoring: { enabled: true, description: 'Enterprise health platform' },
      
      pharmacy: { enabled: true, description: 'Concierge pharmacy service' },
      homecare: { enabled: true, limit: 4, period: 'month', description: '4 homecare visits per month' },
      ambulance: { enabled: true, description: 'Dedicated ambulance service' },
      
      dietPlans: { enabled: true, limit: 'unlimited', description: 'Unlimited diet planning' },
      wellnessChallenges: { enabled: true, limit: 'unlimited', description: 'Branded wellness programs' },
      healthFeed: { enabled: true, description: 'Exclusive premium content' },
      healthBlogs: { enabled: true, limit: 'unlimited', description: 'Unlimited premium blogs' },
      healthDiary: { enabled: true, description: 'AI-powered health diary' },
      
      healthWeekly: { enabled: true, limit: 'unlimited', description: '24/7 webinar access' },
      healthCamp: { enabled: true, limit: 'unlimited', description: 'VIP health camp events' },
      
      insuranceAccess: { enabled: false },
      
      healthTracker: { enabled: true, description: 'Enterprise health platform' },
      vitalSigns: { enabled: true, limit: 'unlimited', description: 'Real-time monitoring' },
      healthGoals: { enabled: true, limit: 'unlimited', description: 'Unlimited goals' },
      
      healthRecords: { enabled: true, limit: 'unlimited', description: 'Unlimited records' },
      prescriptions: { enabled: true, limit: 'unlimited', description: 'Unlimited prescriptions' },
      labReports: { enabled: true, limit: 'unlimited', description: 'Unlimited lab reports' },
      
      aiScribe: { enabled: true, limit: 'unlimited', description: 'Unlimited AI scribe' },
      symptomChecker: { enabled: true, limit: 'unlimited', description: 'Unlimited symptom checks' },
      aiHealthInsights: { enabled: true, description: 'Enterprise AI insights' },
      
      familyMembers: { enabled: true, limit: 'unlimited', description: 'Unlimited family members' },
      appointmentBooking: { enabled: true, limit: 'unlimited', description: 'Unlimited bookings' },
      appointmentReminders: { enabled: true },
      priorityBooking: { enabled: true, description: 'VIP priority' },
      
      healthCoins: { enabled: true, description: 'Enterprise health coins' },
      coinsEarningRate: { multiplier: 1.5, description: '50% bonus earnings' },
      coinsDiscount: { percentage: 25, description: '25% discount' },
      
      support: { type: 'dedicated', responseTime: '2 hours', description: '24/7 dedicated support' },
      dedicatedManager: { enabled: true, description: 'Corporate health manager' },
      
      storageLimit: { amount: 'unlimited', unit: 'GB', description: 'Unlimited storage' },
      dataExport: { enabled: true },
      adFree: { enabled: true },
      
      corporateDashboard: { enabled: true, description: 'Custom enterprise dashboard' },
      bulkBooking: { enabled: true, description: 'Enterprise booking system' },
      wellnessChallenges: { enabled: true, description: 'Branded wellness programs' },
      healthReports: { enabled: true, description: 'Custom analytics & insights' },
      
      annualCheckups: { enabled: true, description: 'Comprehensive checkups' },
      onsiteClinic: { enabled: true, description: 'Dedicated on-site clinic' },
      mentalHealthSupport: { enabled: true, limit: 'unlimited', description: 'Unlimited counseling' },
      labTestDiscount: { percentage: 30, description: '30% lab test discount' },
      
      // Enterprise exclusives
      customIntegration: { enabled: true, description: 'Custom HRMS integration' },
      whiteLabel: { enabled: true, description: 'White-label platform' },
      apiAccess: { enabled: true, description: 'Full API access' },
      dataAnalytics: { enabled: true, description: 'Advanced analytics suite' },
      complianceReporting: { enabled: true, description: 'Regulatory compliance reports' },
      dedicatedInfrastructure: { enabled: true, description: 'Dedicated servers' }
    }
  }
];

// Helper functions
export const getPlanBySlug = (slug) => {
  return MEMBERSHIP_PLANS.find(plan => plan.slug === slug);
};

export const getPlansByType = (type) => {
  return MEMBERSHIP_PLANS.filter(plan => plan.type === type);
};

export const getPersonalPlans = () => {
  return getPlansByType(PLAN_TYPES.PERSONAL);
};

export const getCorporatePlans = () => {
  return getPlansByType(PLAN_TYPES.CORPORATE);
};

export const canUpgrade = (currentTier, targetTier) => {
  return targetTier > currentTier;
};
