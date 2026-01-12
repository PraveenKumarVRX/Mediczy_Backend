/**
 * Proactive Health Reminder Service
 * Dr. iSHA's Predictive Intelligence System
 * 
 * Monitors user health data and provides personalized proactive reminders:
 * - Medication adherence
 * - Preventive health checkups
 * - Lifestyle modifications
 * - Diet and activity suggestions
 * - Chronic condition management
 */

import { User } from '../models/index.js';
import { HealthDiary } from '../models/index.js';
import { Appointment } from '../models/index.js';
import { Prescription } from '../models/index.js';
import { connectPostgres } from '../db/postgres.js';

class HealthReminderService {
  constructor() {
    this.reminderTypes = {
      MEDICATION: 'medication',
      CHECKUP: 'checkup',
      LIFESTYLE: 'lifestyle',
      DIET: 'diet',
      ACTIVITY: 'activity',
      VITALS: 'vitals',
      LAB_TEST: 'lab_test'
    };
  }

  /**
   * Generate personalized health reminders for a user
   * @param {number} userId - User ID
   * @returns {Promise<Array>} - Array of reminder objects
   */
  async generateReminders(userId) {
    try {
      // Fetch user profile and health data
      const user = await User.findByPk(userId);
      if (!user) {
        return [];
      }

      const reminders = [];

      // 1. Medication adherence reminders
      const medicationReminders = await this.getMedicationReminders(userId);
      reminders.push(...medicationReminders);

      // 2. Preventive health checkups
      const checkupReminders = await this.getCheckupReminders(userId, user);
      reminders.push(...checkupReminders);

      // 3. Lifestyle modification reminders
      const lifestyleReminders = await this.getLifestyleReminders(userId);
      reminders.push(...lifestyleReminders);

      // 4. Diet recommendations based on conditions
      const dietReminders = await this.getDietReminders(userId, user);
      reminders.push(...dietReminders);

      // 5. Physical activity suggestions
      const activityReminders = await this.getActivityReminders(userId, user);
      reminders.push(...activityReminders);

      // 6. Vital signs monitoring
      const vitalsReminders = await this.getVitalsReminders(userId, user);
      reminders.push(...vitalsReminders);

      // 7. Lab test reminders
      const labReminders = await this.getLabTestReminders(userId, user);
      reminders.push(...labReminders);

      // Sort by priority
      return reminders.sort((a, b) => b.priority - a.priority);

    } catch (error) {
      console.error('Error generating health reminders:', error);
      return [];
    }
  }

  /**
   * Get medication adherence reminders
   */
  async getMedicationReminders(userId) {
    const reminders = [];
    
    try {
      // Check for active prescriptions
      const prescriptions = await Prescription.findAll({
        where: { 
          user_id: userId,
          status: 'active'
        },
        order: [['created_at', 'DESC']],
        limit: 10
      });

      for (const prescription of prescriptions) {
        const medications = prescription.medications || [];
        
        for (const med of medications) {
          // Check if medication schedule is being followed
          reminders.push({
            type: this.reminderTypes.MEDICATION,
            priority: 10,
            title: `💊 Medication Reminder: ${med.name}`,
            message: `Remember to take ${med.name} ${med.dosage} ${med.frequency}`,
            actionable: true,
            action: {
              type: 'mark_taken',
              medication_id: med.id
            },
            timestamp: new Date()
          });
        }
      }
    } catch (error) {
      console.error('Error getting medication reminders:', error);
    }

    return reminders;
  }

  /**
   * Get preventive health checkup reminders
   */
  async getCheckupReminders(userId, user) {
    const reminders = [];
    const age = this.calculateAge(user.date_of_birth);

    try {
      // Age-based screening recommendations
      if (age >= 40 && !user.last_annual_checkup) {
        reminders.push({
          type: this.reminderTypes.CHECKUP,
          priority: 8,
          title: '🏥 Annual Health Checkup Due',
          message: 'It\'s time for your annual health screening. Dr. iSHA recommends a comprehensive checkup including blood pressure, cholesterol, and diabetes screening.',
          actionable: true,
          action: {
            type: 'book_checkup',
            specialty: 'general_physician'
          },
          timestamp: new Date()
        });
      }

      // Gender-specific screenings
      if (user.gender === 'Female' && age >= 40) {
        reminders.push({
          type: this.reminderTypes.CHECKUP,
          priority: 9,
          title: '🎗️ Mammogram Screening Recommended',
          message: 'Dr. iSHA suggests scheduling a mammogram screening as part of preventive breast cancer detection.',
          actionable: true,
          action: {
            type: 'book_checkup',
            specialty: 'radiology'
          },
          timestamp: new Date()
        });
      }

      // Chronic condition checkups
      const conditions = user.medical_conditions || [];
      if (conditions.includes('diabetes') || conditions.includes('Diabetes')) {
        reminders.push({
          type: this.reminderTypes.CHECKUP,
          priority: 9,
          title: '🔬 Diabetes Monitoring',
          message: 'Schedule HbA1c test every 3 months to monitor diabetes control.',
          actionable: true,
          action: {
            type: 'book_lab_test',
            test: 'HbA1c'
          },
          timestamp: new Date()
        });
      }

      if (conditions.includes('hypertension') || conditions.includes('Hypertension')) {
        reminders.push({
          type: this.reminderTypes.CHECKUP,
          priority: 8,
          title: '💓 Blood Pressure Monitoring',
          message: 'Check your blood pressure regularly. Dr. iSHA recommends monitoring at least twice a week.',
          actionable: true,
          action: {
            type: 'log_vitals',
            vital: 'blood_pressure'
          },
          timestamp: new Date()
        });
      }

    } catch (error) {
      console.error('Error getting checkup reminders:', error);
    }

    return reminders;
  }

  /**
   * Get lifestyle modification reminders
   */
  async getLifestyleReminders(userId) {
    const reminders = [];

    try {
      // Fetch recent health diary entries using Sequelize
      const diaryEntries = await HealthDiary.findAll({
        where: { userId: userId },
        order: [['entryDate', 'DESC']],
        limit: 30,
        raw: true
      });

      // Extract sleep and stress data from JSONB data field
      const entriesWithData = diaryEntries.map(entry => ({
        ...entry,
        sleep_hours: entry.data?.sleep_hours,
        stress_level: entry.data?.stress_level,
        date: entry.entryDate
      }));

      // Sleep analysis
      const avgSleep = this.calculateAverageSleep(entriesWithData);
      if (avgSleep > 0 && avgSleep < 7) {
        reminders.push({
          type: this.reminderTypes.LIFESTYLE,
          priority: 7,
          title: '😴 Sleep Improvement Needed',
          message: `Your average sleep is ${avgSleep.toFixed(1)} hours. Dr. iSHA recommends aiming for 7-9 hours for optimal health.`,
          suggestions: [
            'Maintain a consistent sleep schedule',
            'Avoid screens 1 hour before bed',
            'Create a relaxing bedtime routine',
            'Keep bedroom cool and dark'
          ],
          timestamp: new Date()
        });
      }

      // Stress management
      const avgStress = this.calculateAverageStress(entriesWithData);
      if (avgStress > 6) {
        reminders.push({
          type: this.reminderTypes.LIFESTYLE,
          priority: 8,
          title: '🧘 High Stress Alert - Immediate Care Needed',
          message: `Your stress levels are elevated (avg: ${avgStress.toFixed(1)}/10). Dr. iSHA suggests immediate stress reduction techniques.`,
          recommendations: {
            immediate: [
              'Practice deep breathing: 4-7-8 technique (breathe in 4, hold 7, out 8)',
              'Try a 5-minute guided meditation (Headspace, Calm, Insight Timer)',
              'Take a brief walk outdoors (10-15 minutes)',
              'Listen to calming music or nature sounds'
            ],
            daily_practices: [
              'Morning meditation (10 minutes)',
              'Journaling before bed',
              'Progressive muscle relaxation',
              'Gratitude practice (list 3 things daily)',
              'Limit caffeine and alcohol'
            ],
            professional_help: [
              'Consider talking to a mental health counselor',
              'Explore therapy options (CBT, mindfulness-based therapy)',
              'Join a support group',
              'Consult doctor if stress affects daily functioning'
            ],
            lifestyle_changes: [
              'Set healthy boundaries at work and home',
              'Learn to say "no" to overwhelming commitments',
              'Prioritize self-care activities',
              'Maintain regular sleep schedule',
              'Connect with supportive friends/family'
            ]
          },
          timestamp: new Date()
        });
      } else if (avgStress > 3 || diaryEntries.length === 0) {
        // Moderate stress or no data - provide general mental wellness tips
        reminders.push({
          type: this.reminderTypes.LIFESTYLE,
          priority: 6,
          title: '🧠 Mental Health & Wellness Tips',
          message: 'Dr. iSHA recommends proactive mental health care for overall well-being.',
          recommendations: {
            daily_habits: [
              'Start your day with 5 minutes of mindfulness or meditation',
              'Practice gratitude: write down 3 positive things daily',
              'Stay physically active (boosts mood and reduces stress)',
              'Maintain social connections (call a friend, family time)',
              'Limit social media and news consumption to reduce anxiety'
            ],
            stress_prevention: [
              'Set realistic goals and break tasks into smaller steps',
              'Take regular breaks during work (5-10 min every hour)',
              'Practice time management and prioritization',
              'Engage in hobbies you enjoy',
              'Spend time in nature when possible'
            ],
            self_care: [
              'Ensure 7-9 hours of quality sleep',
              'Eat balanced meals at regular times',
              'Stay hydrated throughout the day',
              'Practice deep breathing when feeling overwhelmed',
              'Schedule "me time" weekly for activities you love'
            ],
            warning_signs: [
              '⚠️ Seek help if you experience: persistent sadness, anxiety, irritability',
              '⚠️ Changes in appetite or sleep patterns',
              '⚠️ Difficulty concentrating or making decisions',
              '⚠️ Loss of interest in activities you usually enjoy',
              '⚠️ Thoughts of self-harm (call crisis helpline immediately)'
            ],
            resources: [
              'Mental health apps: Headspace, Calm, BetterHelp',
              'Crisis helpline: 1800-599-0019 (KIRAN - India)',
              'Talk to your doctor about mental health concerns',
              'Explore online therapy platforms for convenient access'
            ]
          },
          timestamp: new Date()
        });
      }

      // Mental health for specific moods detected in diary
      if (diaryEntries.length > 0) {
        const recentEntries = diaryEntries.slice(0, 7);
        
        // Check for low mood ratings (1-2 out of 5) or negative mood descriptions
        const negativeMoodCount = recentEntries.filter(e => {
          // Low mood rating (1-2 is concerning)
          if (e.mood && e.mood <= 2) return true;
          
          // Check description for negative keywords
          const desc = e.description?.toLowerCase() || '';
          return ['anxious', 'sad', 'depressed', 'overwhelmed', 'stressed', 'angry', 'hopeless', 'worried'].some(word => desc.includes(word));
        }).length;
        
        if (negativeMoodCount >= 3) {
          reminders.push({
            type: this.reminderTypes.LIFESTYLE,
            priority: 9,
            title: '💙 Mental Health Check-In Recommended',
            message: `Dr. iSHA noticed ${negativeMoodCount} days of challenging emotions in the past week. Your mental health matters.`,
            recommendations: {
              immediate_support: [
                'Reach out to someone you trust - talk about how you\'re feeling',
                'If thoughts of self-harm arise, call crisis helpline: 1800-599-0019',
                'Practice grounding technique: 5-4-3-2-1 (5 things you see, 4 you touch, 3 you hear, 2 you smell, 1 you taste)',
                'Remember: It\'s okay to not be okay. Seeking help is a sign of strength.'
              ],
              professional_care: [
                'Schedule appointment with mental health professional',
                'Consider teletherapy for convenient access',
                'Ask your doctor about therapy or medication options',
                'Explore employee assistance programs (EAP) if available at work'
              ],
              self_compassion: [
                'Be kind to yourself - you\'re doing the best you can',
                'Avoid self-criticism; practice self-compassion',
                'Acknowledge your feelings without judgment',
                'Celebrate small wins and progress'
              ]
            },
            actionable: true,
            action: {
              type: 'mental_health_assessment',
              priority: 'high'
            },
            timestamp: new Date()
          });
        }
      }

    } catch (error) {
      console.error('Error getting lifestyle reminders:', error);
    }

    return reminders;
  }

  /**
   * Get personalized diet recommendations
   */
  async getDietReminders(userId, user) {
    const reminders = [];
    const conditions = user.medical_conditions || [];

    try {
      // Diabetes diet recommendations
      if (conditions.includes('diabetes') || conditions.includes('Diabetes')) {
        reminders.push({
          type: this.reminderTypes.DIET,
          priority: 9,
          title: '🍎 Diabetes-Friendly Diet',
          message: 'Dr. iSHA recommends a balanced diet to manage blood sugar levels.',
          recommendations: {
            include: [
              'High-fiber foods (oats, whole grains, legumes)',
              'Leafy green vegetables (spinach, kale, broccoli)',
              'Lean proteins (fish, chicken, tofu)',
              'Healthy fats (nuts, avocado, olive oil)',
              'Low glycemic index fruits (berries, apples)'
            ],
            avoid: [
              'Refined sugars and sweets',
              'White bread and white rice',
              'Sugary beverages',
              'Processed snacks',
              'Fried foods'
            ],
            tips: [
              'Eat smaller meals more frequently',
              'Monitor carbohydrate intake',
              'Stay hydrated (8-10 glasses water/day)',
              'Check blood sugar before and after meals'
            ]
          },
          timestamp: new Date()
        });
      }

      // Hypertension diet recommendations
      if (conditions.includes('hypertension') || conditions.includes('Hypertension')) {
        reminders.push({
          type: this.reminderTypes.DIET,
          priority: 9,
          title: '🥗 Heart-Healthy DASH Diet',
          message: 'Dr. iSHA recommends the DASH diet to manage blood pressure.',
          recommendations: {
            include: [
              'Fruits and vegetables (5-9 servings/day)',
              'Whole grains (brown rice, quinoa, oats)',
              'Low-fat dairy products',
              'Lean meats, fish, poultry',
              'Nuts, seeds, and legumes',
              'Potassium-rich foods (bananas, sweet potatoes)'
            ],
            avoid: [
              'High sodium foods (processed meats, canned soups)',
              'Excessive salt (limit to 1500mg/day)',
              'Saturated fats and trans fats',
              'Alcohol (or limit to 1 drink/day)',
              'Caffeine excess'
            ],
            tips: [
              'Read nutrition labels for sodium content',
              'Use herbs and spices instead of salt',
              'Cook at home more often',
              'Choose fresh over processed foods'
            ]
          },
          timestamp: new Date()
        });
      }

      // General healthy eating
      if (conditions.length === 0) {
        reminders.push({
          type: this.reminderTypes.DIET,
          priority: 5,
          title: '🥙 Balanced Nutrition Tips',
          message: 'Dr. iSHA suggests maintaining a balanced diet for overall wellness.',
          recommendations: {
            include: [
              'Colorful vegetables and fruits (variety is key)',
              'Whole grains for sustained energy',
              'Lean proteins (fish, chicken, legumes)',
              'Healthy fats (nuts, seeds, avocado)',
              'Adequate hydration (8-10 glasses water)'
            ],
            tips: [
              'Follow the "plate method": 50% vegetables, 25% protein, 25% grains',
              'Eat mindfully and chew slowly',
              'Avoid skipping meals',
              'Limit processed foods and added sugars',
              'Plan meals ahead to avoid unhealthy choices'
            ]
          },
          timestamp: new Date()
        });
      }

    } catch (error) {
      console.error('Error getting diet reminders:', error);
    }

    return reminders;
  }

  /**
   * Get physical activity recommendations
   */
  async getActivityReminders(userId, user) {
    const reminders = [];
    const age = this.calculateAge(user.date_of_birth);
    const conditions = user.medical_conditions || [];

    try {
      // General activity recommendations based on age and conditions
      if (conditions.includes('diabetes') || conditions.includes('Diabetes')) {
        reminders.push({
          type: this.reminderTypes.ACTIVITY,
          priority: 8,
          title: '🏃 Exercise for Diabetes Management',
          message: 'Dr. iSHA recommends regular physical activity to improve insulin sensitivity.',
          recommendations: {
            aerobic: [
              'Brisk walking: 30 minutes, 5 days/week',
              'Swimming: 20-30 minutes, 3 times/week',
              'Cycling: 20-40 minutes, 3-4 times/week',
              'Dancing: 30 minutes, 2-3 times/week'
            ],
            strength: [
              'Resistance band exercises: 2-3 times/week',
              'Light weights or body weight exercises',
              'Yoga for flexibility and strength'
            ],
            timing: [
              'Exercise 1-2 hours after meals for best blood sugar control',
              'Check blood sugar before and after exercise',
              'Keep glucose tablets handy during exercise',
              'Stay hydrated before, during, and after'
            ],
            precautions: [
              'Start slowly and gradually increase intensity',
              'Wear proper footwear to prevent injuries',
              'Stop if you feel dizzy, short of breath, or chest pain',
              'Consult doctor before starting new exercise program'
            ]
          },
          timestamp: new Date()
        });
      } else if (conditions.includes('hypertension') || conditions.includes('Hypertension')) {
        reminders.push({
          type: this.reminderTypes.ACTIVITY,
          priority: 8,
          title: '💪 Exercise for Blood Pressure Control',
          message: 'Dr. iSHA recommends moderate aerobic exercise to lower blood pressure.',
          recommendations: {
            aerobic: [
              'Brisk walking: 30-45 minutes, most days',
              'Jogging (if cleared by doctor): 20-30 minutes',
              'Swimming: Excellent low-impact option',
              'Cycling: 30-45 minutes, moderate pace'
            ],
            other: [
              'Yoga and meditation for stress reduction',
              'Tai chi for gentle movement and balance',
              'Gardening or active hobbies'
            ],
            precautions: [
              'Avoid heavy weightlifting or straining',
              'Monitor blood pressure before and after exercise',
              'Start with low intensity and progress gradually',
              'Stop if you experience chest pain or severe shortness of breath'
            ]
          },
          timestamp: new Date()
        });
      } else if (age >= 60) {
        reminders.push({
          type: this.reminderTypes.ACTIVITY,
          priority: 7,
          title: '🧓 Senior Fitness Recommendations',
          message: 'Dr. iSHA suggests age-appropriate exercises for strength, balance, and mobility.',
          recommendations: {
            balance: [
              'Tai chi or yoga for balance improvement',
              'Single-leg stands (hold chair for support)',
              'Heel-to-toe walking',
              'Balance board exercises (supervised)'
            ],
            strength: [
              'Light resistance exercises 2-3 times/week',
              'Chair exercises for seated strength training',
              'Water aerobics for gentle resistance'
            ],
            flexibility: [
              'Gentle stretching daily (10-15 minutes)',
              'Yoga or gentle stretching classes',
              'Range-of-motion exercises for joints'
            ],
            precautions: [
              'Always warm up before and cool down after',
              'Exercise with a buddy or in supervised settings',
              'Use proper equipment and footwear',
              'Listen to your body and rest when needed'
            ]
          },
          timestamp: new Date()
        });
      } else {
        reminders.push({
          type: this.reminderTypes.ACTIVITY,
          priority: 6,
          title: '🏋️ Healthy Activity Guidelines',
          message: 'Dr. iSHA recommends 150 minutes of moderate exercise per week.',
          recommendations: {
            weekly_goal: '150 minutes moderate aerobic + 2 days strength training',
            aerobic: [
              'Brisk walking, jogging, or running',
              'Swimming or water aerobics',
              'Cycling (outdoor or stationary)',
              'Dancing, sports, or active recreation'
            ],
            strength: [
              'Weightlifting or resistance bands',
              'Body weight exercises (push-ups, squats)',
              'Pilates or strength yoga'
            ],
            tips: [
              'Break exercise into 10-minute sessions if needed',
              'Find activities you enjoy for better adherence',
              'Mix cardio and strength for balanced fitness',
              'Track progress to stay motivated'
            ]
          },
          timestamp: new Date()
        });
      }

    } catch (error) {
      console.error('Error getting activity reminders:', error);
    }

    return reminders;
  }

  /**
   * Get vital signs monitoring reminders
   */
  async getVitalsReminders(userId, user) {
    const reminders = [];
    const conditions = user.medical_conditions || [];

    try {
      if (conditions.includes('diabetes') || conditions.includes('Diabetes')) {
        reminders.push({
          type: this.reminderTypes.VITALS,
          priority: 9,
          title: '🩸 Blood Sugar Monitoring',
          message: 'Dr. iSHA recommends regular glucose monitoring.',
          schedule: [
            'Fasting blood sugar: Every morning before breakfast',
            'Post-meal: 2 hours after main meals',
            'Before bed: If taking insulin',
            'Target range: 70-130 mg/dL (fasting), <180 mg/dL (post-meal)'
          ],
          actionable: true,
          action: {
            type: 'log_vitals',
            vital: 'blood_glucose'
          },
          timestamp: new Date()
        });
      }

      if (conditions.includes('hypertension') || conditions.includes('Hypertension')) {
        reminders.push({
          type: this.reminderTypes.VITALS,
          priority: 8,
          title: '💉 Blood Pressure Tracking',
          message: 'Monitor your blood pressure regularly.',
          schedule: [
            'Frequency: At least twice a week',
            'Timing: Same time each day (morning preferred)',
            'Position: Seated, arm supported at heart level',
            'Target: <130/80 mmHg'
          ],
          actionable: true,
          action: {
            type: 'log_vitals',
            vital: 'blood_pressure'
          },
          timestamp: new Date()
        });
      }

    } catch (error) {
      console.error('Error getting vitals reminders:', error);
    }

    return reminders;
  }

  /**
   * Get lab test reminders
   */
  async getLabTestReminders(userId, user) {
    const reminders = [];
    const age = this.calculateAge(user.date_of_birth);
    const conditions = user.medical_conditions || [];

    try {
      // Age-based routine screenings
      if (age >= 40) {
        reminders.push({
          type: this.reminderTypes.LAB_TEST,
          priority: 7,
          title: '🔬 Annual Health Screening',
          message: 'Dr. iSHA recommends annual lab tests for preventive health.',
          tests: [
            'Complete Blood Count (CBC)',
            'Lipid Profile (Cholesterol)',
            'Fasting Blood Sugar',
            'Liver Function Test (LFT)',
            'Kidney Function Test (KFT)',
            'Thyroid Function Test (TSH)',
            'Vitamin D and B12 levels'
          ],
          actionable: true,
          action: {
            type: 'book_lab_test',
            tests: 'comprehensive_panel'
          },
          timestamp: new Date()
        });
      }

      // Condition-specific tests
      if (conditions.includes('diabetes') || conditions.includes('Diabetes')) {
        reminders.push({
          type: this.reminderTypes.LAB_TEST,
          priority: 9,
          title: '📊 Diabetes Monitoring Tests',
          message: 'Regular lab tests to monitor diabetes control.',
          tests: [
            'HbA1c: Every 3 months',
            'Fasting Blood Sugar: Monthly',
            'Lipid Profile: Every 6 months',
            'Kidney Function (Creatinine, Microalbumin): Annually',
            'Eye exam: Annually'
          ],
          actionable: true,
          action: {
            type: 'book_lab_test',
            tests: 'diabetes_panel'
          },
          timestamp: new Date()
        });
      }

    } catch (error) {
      console.error('Error getting lab test reminders:', error);
    }

    return reminders;
  }

  /**
   * Helper: Calculate age from date of birth
   */
  calculateAge(dateOfBirth) {
    if (!dateOfBirth) return 0;
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }

  /**
   * Helper: Calculate average sleep from diary entries
   */
  calculateAverageSleep(diaryEntries) {
    if (!diaryEntries || diaryEntries.length === 0) return 7; // Default assumption
    
    const sleepValues = diaryEntries
      .filter(entry => entry.sleep_hours && entry.sleep_hours > 0)
      .map(entry => entry.sleep_hours);
    
    if (sleepValues.length === 0) return 7;
    
    return sleepValues.reduce((sum, val) => sum + val, 0) / sleepValues.length;
  }

  /**
   * Helper: Calculate average stress from diary entries
   */
  calculateAverageStress(diaryEntries) {
    if (!diaryEntries || diaryEntries.length === 0) return 5; // Default assumption
    
    const stressValues = diaryEntries
      .filter(entry => entry.stress_level && entry.stress_level > 0)
      .map(entry => entry.stress_level);
    
    if (stressValues.length === 0) return 5;
    
    return stressValues.reduce((sum, val) => sum + val, 0) / stressValues.length;
  }
}

export default new HealthReminderService();
