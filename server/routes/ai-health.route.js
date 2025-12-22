import express from 'express';
import auth from '../middleware/auth.js';

const router = express.Router();

// AI Doctor Chat endpoint
router.post('/chat', auth, async (req, res) => {
  try {
    const { message, symptoms } = req.body;
    
    if (!message && !symptoms) {
      return res.status(400).json({ success: false, message: 'Message or symptoms required' });
    }

    const userInput = message || symptoms;

    // Mock AI response - replace with actual AI integration later
    const aiResponse = {
      success: true,
      message: `I understand you mentioned: "${userInput}". Based on this, here's my assessment:`,
      analysis: {
        severity: 'moderate',
        possibleConditions: ['Common cold', 'Viral infection', 'Flu'],
        recommendations: [
          'Stay hydrated - drink at least 8 glasses of water daily',
          'Get adequate rest - aim for 7-8 hours of sleep',
          'Monitor your symptoms - track any changes',
          'Take over-the-counter pain relievers if needed'
        ],
        urgency: 'Consult a doctor if symptoms persist beyond 3 days or worsen'
      },
      suggestedActions: [
        { action: 'Book Consultation', type: 'primary' },
        { action: 'Find Nearby Pharmacy', type: 'secondary' },
        { action: 'Track Symptoms', type: 'secondary' }
      ],
      disclaimer: 'This is an AI-generated response and should not replace professional medical advice. Please consult a healthcare provider for accurate diagnosis and treatment.'
    };

    res.json(aiResponse);
  } catch (error) {
    console.error('AI chat error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process AI request',
      error: error.message
    });
  }
});

// Health consultation with Dr. ISHA
router.post('/dr-isha/consult', auth, async (req, res) => {
  try {
    const { message, symptoms, medicalHistory } = req.body;

    const response = {
      success: true,
      drIshaResponse: {
        greeting: 'Hello! I\'m Dr. ISHA, your AI health assistant.',
        analysis: `Based on your input about "${message || symptoms}", here's what I can help you with:`,
        insights: [
          'Your symptoms suggest you should monitor your condition closely',
          'Consider maintaining a symptom diary to track patterns',
          'Stay hydrated and maintain a balanced diet',
          'Ensure you\'re getting enough rest'
        ],
        recommendations: [
          {
            title: 'Immediate Care',
            steps: ['Rest adequately', 'Stay hydrated', 'Monitor temperature']
          },
          {
            title: 'When to See a Doctor',
            steps: ['If symptoms worsen', 'Fever above 101°F', 'Difficulty breathing']
          }
        ],
        nextSteps: [
          'Track your symptoms daily',
          'Book a consultation if needed',
          'Follow up in 2-3 days'
        ]
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Dr. ISHA consult error:', error);
    res.status(500).json({
      success: false,
      message: 'Dr. ISHA consultation failed',
      error: error.message
    });
  }
});

// Generate personalized diet plan
router.post('/diet/generate', auth, async (req, res) => {
  try {
    const { age, weight, height, goal, dietaryRestrictions, activityLevel, gender } = req.body;
    
    // Calculate BMI
    const heightInMeters = height / 100;
    const bmi = weight / (heightInMeters * heightInMeters);
    
    // Calculate daily calorie needs based on inputs
    let baseCaloriculate = gender === 'male' ? 2200 : 2000;
    const activityMultiplier = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      veryActive: 1.9
    };
    
    const multiplier = activityMultiplier[activityLevel] || 1.55;
    let dailyCalories = Math.round(baseCaloriculate * multiplier);
    
    // Adjust for goals
    if (goal === 'weight_loss') dailyCalories -= 500;
    if (goal === 'weight_gain') dailyCalories += 500;
    if (goal === 'muscle_gain') dailyCalories += 300;
    
    // Generate personalized meal plan
    const mealPlans = {
      weight_loss: {
        breakfast: [
          { item: 'Oatmeal with berries and chia seeds', calories: 300, protein: '10g', carbs: '45g', fats: '8g' },
          { item: 'Green tea', calories: 0, protein: '0g', carbs: '0g', fats: '0g' }
        ],
        midMorningSnack: [
          { item: 'Apple with almond butter', calories: 150, protein: '4g', carbs: '20g', fats: '7g' }
        ],
        lunch: [
          { item: 'Grilled chicken breast', calories: 250, protein: '40g', carbs: '0g', fats: '8g' },
          { item: 'Mixed greens salad with olive oil', calories: 150, protein: '3g', carbs: '10g', fats: '12g' },
          { item: 'Quinoa (1/2 cup)', calories: 110, protein: '4g', carbs: '20g', fats: '2g' }
        ],
        afternoonSnack: [
          { item: 'Greek yogurt (low-fat)', calories: 120, protein: '18g', carbs: '12g', fats: '2g' }
        ],
        dinner: [
          { item: 'Baked fish (salmon/tilapia)', calories: 300, protein: '35g', carbs: '0g', fats: '18g' },
          { item: 'Steamed broccoli and carrots', calories: 80, protein: '4g', carbs: '15g', fats: '1g' }
        ],
        eveningSnack: [
          { item: 'Herbal tea with lemon', calories: 0, protein: '0g', carbs: '0g', fats: '0g' }
        ]
      },
      muscle_gain: {
        breakfast: [
          { item: 'Scrambled eggs (3 whole + 2 whites)', calories: 280, protein: '28g', carbs: '2g', fats: '18g' },
          { item: 'Whole grain toast (2 slices)', calories: 160, protein: '6g', carbs: '30g', fats: '2g' },
          { item: 'Banana', calories: 105, protein: '1g', carbs: '27g', fats: '0g' }
        ],
        midMorningSnack: [
          { item: 'Protein shake with milk', calories: 250, protein: '30g', carbs: '20g', fats: '6g' }
        ],
        lunch: [
          { item: 'Chicken breast (200g)', calories: 330, protein: '62g', carbs: '0g', fats: '7g' },
          { item: 'Brown rice (1 cup)', calories: 215, protein: '5g', carbs: '45g', fats: '2g' },
          { item: 'Mixed vegetables', calories: 100, protein: '4g', carbs: '18g', fats: '1g' }
        ],
        afternoonSnack: [
          { item: 'Mixed nuts (almonds, walnuts)', calories: 200, protein: '6g', carbs: '8g', fats: '18g' }
        ],
        dinner: [
          { item: 'Lean beef steak', calories: 350, protein: '42g', carbs: '0g', fats: '20g' },
          { item: 'Sweet potato', calories: 180, protein: '4g', carbs: '41g', fats: '0g' },
          { item: 'Green beans', calories: 60, protein: '2g', carbs: '14g', fats: '0g' }
        ],
        beforeBed: [
          { item: 'Casein protein shake', calories: 150, protein: '25g', carbs: '5g', fats: '2g' }
        ]
      },
      maintenance: {
        breakfast: [
          { item: 'Whole grain cereal with milk', calories: 250, protein: '10g', carbs: '45g', fats: '5g' },
          { item: 'Fresh fruit salad', calories: 120, protein: '2g', carbs: '30g', fats: '0g' }
        ],
        midMorningSnack: [
          { item: 'Handful of almonds', calories: 160, protein: '6g', carbs: '6g', fats: '14g' }
        ],
        lunch: [
          { item: 'Turkey sandwich on whole wheat', calories: 350, protein: '25g', carbs: '40g', fats: '10g' },
          { item: 'Vegetable soup', calories: 150, protein: '6g', carbs: '22g', fats: '4g' }
        ],
        afternoonSnack: [
          { item: 'Hummus with carrot sticks', calories: 130, protein: '5g', carbs: '15g', fats: '6g' }
        ],
        dinner: [
          { item: 'Grilled chicken with herbs', calories: 280, protein: '38g', carbs: '0g', fats: '13g' },
          { item: 'Pasta with tomato sauce', calories: 250, protein: '8g', carbs: '45g', fats: '4g' },
          { item: 'Side salad', calories: 80, protein: '2g', carbs: '10g', fats: '4g' }
        ]
      }
    };

    const selectedPlan = mealPlans[goal] || mealPlans.maintenance;
    
    // Generate tips based on goal and restrictions
    const tips = [
      'Drink at least 8-10 glasses of water daily',
      'Eat meals at regular intervals (every 3-4 hours)',
      'Avoid processed foods and sugary drinks',
      'Include a variety of colorful vegetables',
      'Get 7-8 hours of quality sleep'
    ];

    if (goal === 'weight_loss') {
      tips.push('Maintain a consistent calorie deficit');
      tips.push('Focus on high-protein, low-carb meals');
      tips.push('Avoid eating 2-3 hours before bedtime');
    } else if (goal === 'muscle_gain') {
      tips.push('Consume protein within 30 minutes post-workout');
      tips.push('Never skip meals, especially breakfast');
      tips.push('Include complex carbs for energy');
    }

    if (dietaryRestrictions) {
      if (dietaryRestrictions.includes('vegetarian')) {
        tips.push('Supplement with plant-based protein sources');
        tips.push('Include legumes, tofu, and tempeh');
      }
      if (dietaryRestrictions.includes('gluten-free')) {
        tips.push('Replace wheat with rice, quinoa, or millet');
      }
    }

    const dietPlan = {
      success: true,
      profile: {
        age,
        weight,
        height,
        bmi: bmi.toFixed(1),
        bmiCategory: bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese',
        goal,
        activityLevel: activityLevel || 'moderate',
        gender: gender || 'not specified'
      },
      dailyCalories,
      macros: {
        protein: goal === 'muscle_gain' ? '35%' : goal === 'weight_loss' ? '30%' : '25%',
        carbs: goal === 'weight_loss' ? '35%' : goal === 'muscle_gain' ? '40%' : '50%',
        fats: goal === 'muscle_gain' ? '25%' : goal === 'weight_loss' ? '35%' : '25%'
      },
      meals: selectedPlan,
      hydration: {
        daily: '2.5-3 liters',
        timing: 'Drink a glass of water before each meal'
      },
      supplements: goal === 'muscle_gain' 
        ? ['Whey protein', 'Creatine', 'Multivitamin', 'Omega-3']
        : goal === 'weight_loss'
        ? ['Multivitamin', 'Omega-3', 'Fiber supplement']
        : ['Multivitamin', 'Omega-3'],
      tips,
      restrictions: dietaryRestrictions || [],
      createdAt: new Date().toISOString()
    };

    res.json(dietPlan);
  } catch (error) {
    console.error('Diet plan generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate diet plan',
      error: error.message
    });
  }
});

export default router;
