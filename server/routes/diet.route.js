/**
 * Diet Plan Route Alias
 * 
 * This creates a shortcut /api/diet/* routes that redirect to /api/ai-health/diet/*
 * for backwards compatibility and convenience
 */

import express from 'express';
import auth from '../middleware/auth.js';

const router = express.Router();

// Redirect /api/diet/generate to /api/ai-health/diet/generate
router.post('/generate', auth, async (req, res) => {
  try {
    const { age, weight, height, goal, dietaryRestrictions, activityLevel, gender, dietaryPreference } = req.body;
    
    if (!age || !weight || !height) {
      return res.status(400).json({
        success: false,
        message: 'Age, weight, and height are required'
      });
    }

    // Calculate BMI
    const heightInMeters = height / 100;
    const bmi = (weight / (heightInMeters * heightInMeters)).toFixed(1);
    
    // Calculate BMR (Basal Metabolic Rate) using Mifflin-St Jeor Equation
    let bmr;
    if (gender === 'male' || gender === 'Male') {
      bmr = (10 * weight) + (6.25 * height) - (5 * age) + 5;
    } else {
      bmr = (10 * weight) + (6.25 * height) - (5 * age) - 161;
    }

    // Calculate TDEE (Total Daily Energy Expenditure)
    const activityMultipliers = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      very_active: 1.9
    };
    
    const multiplier = activityMultipliers[activityLevel] || activityMultipliers.moderate;
    const tdee = Math.round(bmr * multiplier);

    // Adjust calories based on goal
    let targetCalories = tdee;
    if (goal === 'weight_loss') {
      targetCalories = tdee - 500; // 500 calorie deficit for gradual weight loss
    } else if (goal === 'weight_gain') {
      targetCalories = tdee + 500; // 500 calorie surplus for muscle gain
    }

    // Macronutrient distribution
    const proteinGrams = Math.round(weight * 1.6); // 1.6g per kg bodyweight
    const fatGrams = Math.round((targetCalories * 0.25) / 9); // 25% of calories from fat
    const carbGrams = Math.round((targetCalories - (proteinGrams * 4 + fatGrams * 9)) / 4);

    // Generate meal plan based on dietary preferences
    const mealPlan = generateMealPlan(dietaryPreference || dietaryRestrictions, targetCalories);

    const dietPlan = {
      success: true,
      plan: {
        personalInfo: {
          age,
          weight: `${weight} kg`,
          height: `${height} cm`,
          bmi: parseFloat(bmi),
          bmiCategory: getBMICategory(parseFloat(bmi)),
          activityLevel,
          goal: goal || 'maintenance'
        },
        calories: {
          bmr: Math.round(bmr),
          tdee,
          target: targetCalories,
          description: getCalorieDescription(goal)
        },
        macronutrients: {
          protein: { grams: proteinGrams, calories: proteinGrams * 4, percentage: Math.round((proteinGrams * 4 / targetCalories) * 100) },
          carbs: { grams: carbGrams, calories: carbGrams * 4, percentage: Math.round((carbGrams * 4 / targetCalories) * 100) },
          fats: { grams: fatGrams, calories: fatGrams * 9, percentage: Math.round((fatGrams * 9 / targetCalories) * 100) }
        },
        mealPlan,
        hydration: {
          daily: `${Math.round(weight * 35 / 1000 * 10) / 10} liters`,
          recommendation: 'Drink water regularly throughout the day, especially before and after workouts'
        },
        tips: getHealthTips(goal, bmi),
        dietaryPreference: dietaryPreference || dietaryRestrictions || 'balanced'
      }
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

// Helper functions
function getBMICategory(bmi) {
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25) return 'Normal weight';
  if (bmi < 30) return 'Overweight';
  return 'Obese';
}

function getCalorieDescription(goal) {
  const descriptions = {
    weight_loss: 'Caloric deficit for gradual weight loss (0.5-1 kg per week)',
    weight_gain: 'Caloric surplus for muscle gain (0.5 kg per week)',
    maintenance: 'Maintenance calories to sustain current weight'
  };
  return descriptions[goal] || descriptions.maintenance;
}

function generateMealPlan(dietaryPreference, targetCalories) {
  const meals = {
    breakfast: Math.round(targetCalories * 0.25),
    midMorningSnack: Math.round(targetCalories * 0.10),
    lunch: Math.round(targetCalories * 0.30),
    eveningSnack: Math.round(targetCalories * 0.10),
    dinner: Math.round(targetCalories * 0.25)
  };

  const mealSuggestions = {
    vegetarian: {
      breakfast: ['Oatmeal with fruits and nuts', 'Whole wheat toast with peanut butter and banana', 'Greek yogurt with granola and berries'],
      midMorningSnack: ['Apple with almond butter', 'Handful of mixed nuts', 'Protein smoothie'],
      lunch: ['Quinoa bowl with mixed vegetables', 'Chickpea curry with brown rice', 'Paneer wrap with salad'],
      eveningSnack: ['Hummus with carrot sticks', 'Fruit salad', 'Cottage cheese with cucumber'],
      dinner: ['Grilled tofu with steamed vegetables', 'Lentil soup with whole wheat bread', 'Vegetable stir-fry with brown rice']
    },
    vegan: {
      breakfast: ['Overnight oats with chia seeds', 'Avocado toast on whole grain bread', 'Smoothie bowl with plant protein'],
      midMorningSnack: ['Mixed nuts and dried fruits', 'Apple slices with almond butter', 'Energy balls'],
      lunch: ['Buddha bowl with quinoa and vegetables', 'Black bean tacos', 'Lentil and vegetable curry'],
      eveningSnack: ['Roasted chickpeas', 'Fresh fruit', 'Vegetable sticks with hummus'],
      dinner: ['Stir-fried tempeh with vegetables', 'Vegetable and bean chili', 'Tofu curry with brown rice']
    },
    balanced: {
      breakfast: ['Scrambled eggs with whole wheat toast', 'Protein pancakes with fruits', 'Omelette with vegetables'],
      midMorningSnack: ['Greek yogurt', 'Protein bar', 'Mixed nuts'],
      lunch: ['Grilled chicken with quinoa and vegetables', 'Fish with sweet potato and broccoli', 'Turkey wrap with salad'],
      eveningSnack: ['Cottage cheese with fruit', 'Hard-boiled eggs', 'Protein shake'],
      dinner: ['Grilled salmon with asparagus', 'Lean beef with mixed vegetables', 'Chicken stir-fry with brown rice']
    }
  };

  const preference = dietaryPreference?.toLowerCase() || 'balanced';
  const suggestions = mealSuggestions[preference] || mealSuggestions.balanced;

  return {
    breakfast: { calories: meals.breakfast, suggestions: suggestions.breakfast },
    midMorningSnack: { calories: meals.midMorningSnack, suggestions: suggestions.midMorningSnack },
    lunch: { calories: meals.lunch, suggestions: suggestions.lunch },
    eveningSnack: { calories: meals.eveningSnack, suggestions: suggestions.eveningSnack },
    dinner: { calories: meals.dinner, suggestions: suggestions.dinner }
  };
}

function getHealthTips(goal, bmi) {
  const tips = [
    'Eat slowly and mindfully to better recognize fullness',
    'Include protein in every meal to maintain muscle mass',
    'Stay hydrated - drink water before meals',
    'Get 7-9 hours of quality sleep each night',
    'Manage stress through meditation or exercise'
  ];

  if (goal === 'weight_loss') {
    tips.push('Focus on whole, unprocessed foods');
    tips.push('Include more vegetables and fiber in your diet');
    tips.push('Practice portion control');
  } else if (goal === 'weight_gain') {
    tips.push('Eat more frequently (5-6 meals per day)');
    tips.push('Include calorie-dense healthy foods');
    tips.push('Strength training 3-4 times per week');
  }

  if (bmi > 25) {
    tips.push('Increase physical activity gradually');
    tips.push('Focus on sustainable lifestyle changes');
  }

  return tips;
}

export default router;
