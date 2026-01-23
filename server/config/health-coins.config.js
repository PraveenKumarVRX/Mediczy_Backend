/**
 * Health Coins Rewards Configuration
 * Defines coin rewards for various user activities
 */

export const HEALTH_COINS_REWARDS = {
  // Daily Activities
  DAILY_LOGIN: 1,                    // Login to app daily
  DAILY_LOGIN_STREAK_BONUS: {        // Bonus for consecutive days
    7: 5,    // 7 days streak = 5 HC bonus
    14: 10,  // 14 days = 10 HC
    30: 25,  // 30 days = 25 HC
    60: 50,  // 60 days = 50 HC
    90: 100  // 90 days = 100 HC
  },
  
  // Fitness Activities
  STEPS_PER_100: 1,                  // 1 HC per 100 steps (max 10 per day = 1000 steps)
  STEPS_MAX_PER_DAY: 10,             // Maximum HC from steps per day
  
  // Health Management
  HEALTH_ASSESSMENT: 5,              // Complete health risk assessment
  VITAL_SIGNS_LOG: 2,                // Log vital signs (BP, weight, etc.)
  MEDICATION_ADHERENCE: 2,           // Take medication on time
  HEALTH_DIARY_ENTRY: 1,             // Create health diary entry
  
  // Appointments
  APPOINTMENT_BOOKING: 3,            // Book an appointment
  APPOINTMENT_COMPLETED: 5,          // Attend and complete appointment
  
  // Profile & Setup
  PROFILE_COMPLETION: 10,            // Complete full profile
  FAMILY_MEMBER_ADDED: 2,            // Add family member
  EMERGENCY_CONTACT_ADDED: 2,        // Add emergency contact
  
  // Engagement
  REFERRAL: 20,                      // Refer a friend who signs up
  REVIEW: 5,                         // Leave a review/feedback
  
  // Goals
  WEEKLY_STEPS_GOAL: 15,            // Achieve weekly steps goal
  MONTHLY_HEALTH_GOAL: 30,          // Achieve monthly health goal
  
  // Special
  BIRTHDAY_BONUS: 50,               // Birthday bonus
  ANNIVERSARY_BONUS: 100            // 1 year anniversary
};

export const HEALTH_COINS_PRICING = {
  // Purchase packages (INR to Health Coins)
  packages: [
    { coins: 100, price: 99, discount: 0, popular: false },
    { coins: 250, price: 199, discount: 20, popular: true },
    { coins: 500, price: 349, discount: 30, popular: false },
    { coins: 1000, price: 599, discount: 40, popular: false },
    { coins: 2500, price: 1299, discount: 48, popular: false }
  ],
  
  // HC to INR conversion rate for payments
  // 1 HC = ₹1 INR (can be adjusted for promotional rates)
  HC_TO_INR_RATE: 1,
  
  // Bonus when paying with HC (percentage extra value)
  // e.g., 10 means 10% bonus - 100 HC gives ₹110 value
  HC_PAYMENT_BONUS_PERCENT: 10,
  
  // Spending (Health Coins to services)
  services: {
    CONSULTATION_DISCOUNT: {
      50: 50,    // 50 HC = ₹50 off
      100: 120,  // 100 HC = ₹120 off (20% bonus)
      200: 260   // 200 HC = ₹260 off (30% bonus)
    },
    LAB_TEST_DISCOUNT: {
      50: 50,
      100: 120,
      200: 260
    },
    MEDICATION_DISCOUNT: {
      25: 25,
      50: 60,
      100: 130
    },
    // Full payment with HC (includes bonus)
    CONSULTATION_FULL_PAYMENT: {
      enabled: true,
      bonusPercent: 10  // 10% bonus when paying fully with HC
    }
  }
};

export default {
  HEALTH_COINS_REWARDS,
  HEALTH_COINS_PRICING
};
