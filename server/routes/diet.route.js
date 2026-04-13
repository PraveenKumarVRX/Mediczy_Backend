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
    const { age, weight, height, goal, dietaryRestrictions, activityLevel, gender, dietaryPreference, cuisineRegion } = req.body;
    
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

    // Generate meal plan based on dietary preferences and cuisine region
    const mealPlan = generateMealPlan(dietaryPreference || dietaryRestrictions, targetCalories, cuisineRegion);

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
        dietaryPreference: dietaryPreference || dietaryRestrictions || 'balanced',
        cuisineRegion: cuisineRegion || 'north_indian'
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

function generateMealPlan(dietaryPreference, targetCalories, cuisineRegion) {
  const meals = {
    breakfast: Math.round(targetCalories * 0.25),
    midMorningSnack: Math.round(targetCalories * 0.10),
    lunch: Math.round(targetCalories * 0.30),
    eveningSnack: Math.round(targetCalories * 0.10),
    dinner: Math.round(targetCalories * 0.25)
  };

  // Regional Indian cuisine meal databases
  const regionalMeals = {
    north_indian: {
      vegetarian: {
        breakfast: ['Aloo Paratha with curd and pickle', 'Poha with peanuts and sev', 'Chole Bhature (small portion)', 'Stuffed Moong Dal Paratha with butter', 'Besan Cheela with mint chutney'],
        midMorningSnack: ['Lassi (sweet or salted)', 'Roasted chana with jaggery', 'Fruit chaat with chaat masala', 'Sattu drink with lemon'],
        lunch: ['Rajma Chawal with salad and raita', 'Dal Makhani with jeera rice and roti', 'Chole with rice, onion salad', 'Kadhi Pakora with steamed rice', 'Paneer Butter Masala with naan and salad'],
        eveningSnack: ['Masala chai with mathri', 'Makhana (fox nuts) roasted with ghee', 'Aloo tikki chaat', 'Bread pakora with green chutney'],
        dinner: ['Palak Paneer with 2 rotis and salad', 'Mixed Dal with roti and lauki sabzi', 'Shahi Paneer with jeera rice', 'Aloo Gobi with roti and dal', 'Malai Kofta with 2 rotis']
      },
      non_vegetarian: {
        breakfast: ['Egg Paratha with curd', 'Omelette with buttered toast and chai', 'Keema Paratha with raita', 'Anda Bhurji with 2 rotis'],
        midMorningSnack: ['Boiled eggs (2) with pepper', 'Lassi with dry fruits', 'Fruit chaat with chaat masala', 'Sattu drink'],
        lunch: ['Chicken Curry with rice and raita', 'Mutton Rogan Josh with naan', 'Butter Chicken with jeera rice and salad', 'Fish curry with rice and dal', 'Egg Curry with roti and salad'],
        eveningSnack: ['Chicken Seekh Kebab (2 pieces)', 'Egg roll with onion', 'Masala chai with bun maska', 'Tandoori chicken (2 pieces)'],
        dinner: ['Chicken Biryani with raita', 'Dal with Grilled Fish and 2 rotis', 'Keema Matar with roti and salad', 'Chicken Korma with naan', 'Egg Bhurji with 2 rotis and dal']
      },
      eggetarian: {
        breakfast: ['Egg Paratha with curd', 'Omelette with buttered toast', 'Anda Bhurji with 2 rotis', 'Bread Omelette with chai'],
        midMorningSnack: ['Boiled eggs (2) with pepper', 'Lassi with dry fruits', 'Roasted chana with jaggery', 'Fruit chaat'],
        lunch: ['Egg Curry with rice and raita', 'Paneer Tikka Masala with naan and egg salad', 'Rajma Chawal with egg bhurji', 'Chole with rice and fried egg'],
        eveningSnack: ['Egg roll', 'Makhana roasted with ghee', 'Bread pakora with green chutney', 'Masala chai with mathri'],
        dinner: ['Egg Biryani with raita', 'Palak with egg and 2 rotis', 'Dal with omelette and roti', 'Egg Masala with jeera rice']
      },
      vegan: {
        breakfast: ['Poha with peanuts and vegetables', 'Besan Cheela with coconut chutney', 'Aloo Paratha (no butter) with pickle', 'Upma with cashews'],
        midMorningSnack: ['Sattu drink', 'Roasted chana with jaggery', 'Mixed nuts and dates', 'Fruit chaat'],
        lunch: ['Rajma Chawal with salad', 'Chole with rice and onion salad', 'Dal Tadka with roti and sabzi', 'Kadhi (besan-based, no curd) with rice'],
        eveningSnack: ['Masala chai (plant milk) with makhana', 'Aloo tikki with chutney', 'Roasted peanuts with jaggery', 'Sprouts chaat'],
        dinner: ['Mixed Dal with roti and baingan bharta', 'Aloo Gobi with 2 rotis and dal', 'Chana Masala with rice', 'Lauki ki sabzi with roti and dal']
      },
      jain: {
        breakfast: ['Sabudana Khichdi with peanuts', 'Makhana Poha', 'Moong Dal Cheela (no onion/garlic)', 'Upma with cashews (no onion/garlic)'],
        midMorningSnack: ['Mixed dry fruits', 'Fresh fruit plate', 'Sabudana vada', 'Makhana roasted with ghee'],
        lunch: ['Kadhi with rice (no onion/garlic)', 'Moong Dal with roti and lauki sabzi', 'Paneer sabzi (no onion/garlic) with rice', 'Toor Dal with roti and pumpkin sabzi'],
        eveningSnack: ['Fruit salad', 'Dry fruit laddoo', 'Roasted makhana', 'Coconut water'],
        dinner: ['Paneer in tomato gravy with roti (no onion/garlic)', 'Dal with roti and tinda sabzi', 'Khichdi with kadhi', 'Moong Dal Cheela with chutney']
      }
    },
    south_indian: {
      vegetarian: {
        breakfast: ['Masala Dosa with sambar and coconut chutney', 'Idli (3) with sambar and chutney', 'Upma with coconut chutney', 'Pongal with sambar', 'Appam with vegetable stew'],
        midMorningSnack: ['Filter coffee with murukku', 'Banana (nendhran) chips', 'Sundal (chickpea sundal)', 'Tender coconut water'],
        lunch: ['Sambar Rice with papad and pickle', 'Rasam with rice, poriyal, and curd', 'Bisi Bele Bath with raita', 'Curd rice with pickle and papad', 'Lemon rice with sambar and poriyal'],
        eveningSnack: ['Medu Vada with sambar', 'Bajji (banana or onion)', 'Filter coffee with bonda', 'Mysore Pak (small piece)'],
        dinner: ['Dosa with chutney and sambar', 'Chapati with vegetable kurma', 'Idiyappam with vegetable stew', 'Adai with avial', 'Pesarattu with ginger chutney']
      },
      non_vegetarian: {
        breakfast: ['Egg Dosa with chutney', 'Idli with egg curry', 'Appam with chicken stew', 'Puttu with kadala curry and egg'],
        midMorningSnack: ['Filter coffee with murukku', 'Boiled eggs with pepper', 'Banana chips', 'Sundal'],
        lunch: ['Chicken Chettinad with rice and rasam', 'Fish Curry (meen kuzhambhu) with rice', 'Andhra Chicken Curry with rice', 'Mutton Kuzhambu with rice and poriyal'],
        eveningSnack: ['Chicken 65 (3 pieces)', 'Fish cutlet', 'Egg bajji', 'Filter coffee with bonda'],
        dinner: ['Malabar Fish Curry with appam', 'Chicken Biryani (Hyderabadi) with raita', 'Neer Dosa with chicken curry', 'Kerala Prawn Curry with rice']
      },
      eggetarian: {
        breakfast: ['Egg Dosa with chutney', 'Idli with egg curry', 'Egg Uttapam', 'Appam with egg stew'],
        midMorningSnack: ['Boiled eggs with pepper', 'Filter coffee with murukku', 'Sundal', 'Banana chips'],
        lunch: ['Egg Curry with sambar rice', 'Egg Biryani (Hyderabadi) with raita', 'Rasam rice with egg poriyal', 'Curd rice with egg thokku'],
        eveningSnack: ['Egg bajji', 'Egg puffs', 'Filter coffee with bonda', 'Medu Vada with sambar'],
        dinner: ['Egg Masala with dosa', 'Egg Curry with chapati and poriyal', 'Egg Biryani with raita', 'Idiyappam with egg curry']
      },
      vegan: {
        breakfast: ['Plain Dosa with sambar and coconut chutney', 'Idli (3) with sambar', 'Upma with coconut chutney', 'Pongal with sambar', 'Pesarattu with chutney'],
        midMorningSnack: ['Tender coconut water', 'Sundal', 'Banana chips (coconut oil)', 'Mixed nuts'],
        lunch: ['Sambar Rice with poriyal', 'Rasam rice with beans poriyal', 'Bisi Bele Bath', 'Lemon rice with dal and poriyal'],
        eveningSnack: ['Bajji (banana)', 'Murukku', 'Sundal', 'Fruit plate'],
        dinner: ['Chapati with avial', 'Idiyappam with vegetable stew (coconut milk)', 'Adai with poriyal', 'Dosa with sambar']
      },
      jain: {
        breakfast: ['Rice Idli with tomato chutney (no onion/garlic)', 'Rava Dosa (no onion)', 'Pongal (no garlic)', 'Upma with cashews (no onion/garlic)'],
        midMorningSnack: ['Fresh fruit plate', 'Tender coconut water', 'Dry fruit mix', 'Makhana'],
        lunch: ['Sambar (no onion/garlic) with rice', 'Rasam rice with pumpkin poriyal', 'Lemon rice with papad', 'Curd rice with pickle'],
        eveningSnack: ['Banana chips', 'Fruit salad', 'Coconut laddoo', 'Filter coffee'],
        dinner: ['Dosa with tomato chutney', 'Chapati with vegetable kurma (no onion/garlic)', 'Idli with sambar (no onion/garlic)', 'Rice with dal and poriyal']
      }
    },
    bengali: {
      vegetarian: {
        breakfast: ['Luchi with Aloo Dum', 'Radhaballabhi with chholar dal', 'Chirer Polao (flattened rice)', 'Mishti Doi with muri'],
        midMorningSnack: ['Sandesh (1 piece)', 'Telebhaja (fried snacks)', 'Muri mixture', 'Narkel Naru'],
        lunch: ['Shukto, Dal, Aloo Posto, Rice', 'Cholar Dal with Luchi and salad', 'Moong Dal with rice, begun bhaja, chutney', 'Bengali Khichuri with begun bhaja'],
        eveningSnack: ['Singara (samosa) with chai', 'Beguni with chai', 'Rosogolla', 'Jhalmuri'],
        dinner: ['Paneer Dalna with roti', 'Mochar Ghonto with rice and dal', 'Shorshe Paneer with rice', 'Dhokar Dalna with rice and dal']
      },
      non_vegetarian: {
        breakfast: ['Luchi with Kosha Mangsho', 'Dim Paratha (egg paratha)', 'Kochuri with chholar dal'],
        midMorningSnack: ['Fish cutlet', 'Dim Devil (deviled eggs)', 'Muri with chanachur', 'Narkel Naru'],
        lunch: ['Maach Bhaat (fish with rice), dal, sabzi', 'Kosha Mangsho with Luchi', 'Ilish Bhapa with rice and dal', 'Chicken Rezala with Pulao'],
        eveningSnack: ['Fish fry', 'Chicken Pakora', 'Singara with chai', 'Mughlai Paratha'],
        dinner: ['Chingri Malai Curry with rice', 'Doi Maach with rice and dal', 'Chicken Chaap with paratha', 'Macher Jhol with rice and dal']
      },
      eggetarian: {
        breakfast: ['Dim Paratha with chai', 'Luchi with Aloo Dum and boiled egg', 'Egg toast Bengali style'],
        midMorningSnack: ['Dim Devil', 'Muri mixture', 'Sandesh', 'Narkel Naru'],
        lunch: ['Dimer Dalna with rice and dal', 'Egg Curry with rice and begun bhaja', 'Bengali Egg Biryani with raita'],
        eveningSnack: ['Egg roll (Kolkata style)', 'Singara with chai', 'Jhalmuri', 'Beguni'],
        dinner: ['Dimer Jhol with rice and dal', 'Egg Bhuna with roti', 'Egg Malai Curry with rice']
      },
      vegan: {
        breakfast: ['Chirer Polao (no ghee)', 'Luchi (no ghee) with Aloo Dum', 'Muri with vegetables'],
        midMorningSnack: ['Muri mixture', 'Narkel Naru (jaggery)', 'Fresh fruits', 'Chanachur'],
        lunch: ['Shukto with rice and dal', 'Aloo Posto with rice and dal', 'Bengali Khichuri (no ghee)', 'Moong Dal with rice and sabzi'],
        eveningSnack: ['Jhalmuri', 'Telebhaja', 'Coconut laddoo', 'Sprouts'],
        dinner: ['Mochar Ghonto with rice', 'Mixed vegetable with rice and dal', 'Shorshe Begun with rice and dal']
      },
      jain: {
        breakfast: ['Chirer Polao (no onion/garlic)', 'Luchi with tomato chutney'],
        midMorningSnack: ['Dry fruits', 'Sandesh', 'Narkel Naru', 'Fresh fruits'],
        lunch: ['Moong Dal (no onion/garlic) with rice', 'Paneer sabzi with roti', 'Khichuri (no onion/garlic)'],
        eveningSnack: ['Fruit salad', 'Makhana', 'Coconut laddoo'],
        dinner: ['Dal with rice and pumpkin sabzi', 'Paneer with roti and dal']
      }
    },
    gujarati: {
      vegetarian: {
        breakfast: ['Thepla with pickle and curd', 'Handvo with green chutney', 'Dhokla with chutney', 'Fafda with jalebi', 'Khakhra with tea'],
        midMorningSnack: ['Khandvi (3 pieces)', 'Gathiya with chai', 'Buttermilk (chaas)', 'Khakhra'],
        lunch: ['Gujarati Thali - Dal, Kadhi, Rotli, Rice, Sabzi, Salad', 'Undhiyu with Puri and shrikhand', 'Dal Dhokli', 'Ringan no Olo with dal and rotli'],
        eveningSnack: ['Sev Khamani', 'Dabeli', 'Ganthia with chai', 'Dhokla with chutney'],
        dinner: ['Rotli with sabzi and dal', 'Khichdi with kadhi and papad', 'Bajra no Rotlo with ringan bharta', 'Mag ni Dal with rice and sabzi']
      },
      non_vegetarian: {
        breakfast: ['Egg Thepla with pickle', 'Kheema Pav', 'Omelette with khakhra'],
        midMorningSnack: ['Boiled eggs', 'Khandvi', 'Chaas', 'Khakhra'],
        lunch: ['Chicken curry with rotli and dal', 'Mutton with rice and kadhi', 'Fish curry with rice and salad'],
        eveningSnack: ['Chicken kebab', 'Egg Dabeli', 'Sev Khamani', 'Dhokla'],
        dinner: ['Surti chicken with rotli and dal', 'Fish Tikka with khichdi', 'Egg curry with rotli and sabzi']
      },
      eggetarian: {
        breakfast: ['Egg Thepla', 'Egg Bhurji with toast', 'Dhokla with egg curry'],
        midMorningSnack: ['Boiled eggs', 'Khandvi', 'Chaas', 'Gathiya'],
        lunch: ['Egg Curry with Gujarati Thali', 'Egg Biryani with kadhi', 'Dal with egg and rotli'],
        eveningSnack: ['Egg roll', 'Sev Khamani', 'Dabeli', 'Dhokla'],
        dinner: ['Egg Masala with rotli and dal', 'Egg Bhurji with khichdi', 'Omelette with sabzi and roti']
      },
      vegan: {
        breakfast: ['Thepla (no ghee) with pickle', 'Handvo with chutney', 'Khakhra with tea', 'Poha'],
        midMorningSnack: ['Gathiya', 'Chaas (coconut)', 'Mixed nuts', 'Fruits'],
        lunch: ['Dal with rice and sabzi', 'Undhiyu with roti', 'Dal Dhokli (no ghee)', 'Khichdi with papad'],
        eveningSnack: ['Sev Khamani', 'Roasted peanuts', 'Sprouts chaat', 'Masala chai (plant milk)'],
        dinner: ['Bajra Rotlo with ringan bharta', 'Dal with roti and sabzi', 'Khichdi with kadhi (besan-based)']
      },
      jain: {
        breakfast: ['Khakhra with ghee', 'Sabudana Khichdi', 'Makhana phool', 'Dhokla (no onion/garlic)'],
        midMorningSnack: ['Dry fruits and nuts', 'Fresh fruit plate', 'Makhana', 'Coconut water'],
        lunch: ['Moong Dal (no onion/garlic) with rice and sabzi', 'Kadhi (no onion/garlic) with khichdi', 'Rotli with paneer sabzi'],
        eveningSnack: ['Dry fruit laddoo', 'Fruit salad', 'Khakhra', 'Makhana'],
        dinner: ['Dal with rotli and pumpkin sabzi', 'Khichdi with papad and curd', 'Paneer sabzi with roti']
      }
    },
    maharashtrian: {
      vegetarian: {
        breakfast: ['Misal Pav', 'Pohe with Sev and lemon', 'Sabudana Khichdi with curd', 'Thalipeeth with butter and curd', 'Upma with coconut chutney'],
        midMorningSnack: ['Kokum sharbat', 'Bhakarwadi', 'Sol Kadhi', 'Chivda'],
        lunch: ['Varan Bhaat with toop, Koshimbir, Bhaji, Papad', 'Pithla Bhakri with thecha', 'Amti with rice and sabzi', 'Masale Bhat with papad and raita'],
        eveningSnack: ['Vada Pav', 'Batata Vada', 'Kothimbir Vadi', 'Sabudana Vada with chutney'],
        dinner: ['Zunka Bhakri with thecha', 'Bharli Vangi with chapati and dal', 'Usal with pav', 'Matki Usal with rice and chapati']
      },
      non_vegetarian: {
        breakfast: ['Kheema Pav', 'Egg Bhurji with pav', 'Anda Poha'],
        midMorningSnack: ['Chicken lollipop (2)', 'Sol kadhi', 'Kokum sharbat', 'Chivda'],
        lunch: ['Kombdi Vade (chicken with puri)', 'Fish curry with rice (Koliwada style)', 'Mutton Kolhapuri with bhakri'],
        eveningSnack: ['Chicken Vada Pav', 'Fish fry', 'Batata Vada', 'Bhakarwadi'],
        dinner: ['Surmai (fish) fry with chapati', 'Chicken Sukka with rice and dal', 'Mutton curry with bhakri', 'Bombil fry with rice']
      },
      eggetarian: {
        breakfast: ['Egg Bhurji Pav', 'Anda Poha', 'Egg Thalipeeth'],
        midMorningSnack: ['Boiled eggs', 'Sol Kadhi', 'Chivda', 'Kokum sharbat'],
        lunch: ['Egg Curry with Varan Bhaat', 'Egg Masala with chapati and sabzi', 'Anda Biryani with raita'],
        eveningSnack: ['Egg Vada Pav', 'Egg Bhaji', 'Batata Vada', 'Kothimbir Vadi'],
        dinner: ['Egg Rassa with chapati', 'Anda Bhurji with bhakri', 'Egg curry with rice and dal']
      },
      vegan: {
        breakfast: ['Pohe with peanuts', 'Thalipeeth (no ghee)', 'Upma with coconut', 'Misal Pav'],
        midMorningSnack: ['Kokum sharbat', 'Chivda', 'Roasted peanuts', 'Sol Kadhi (coconut milk)'],
        lunch: ['Pithla Bhakri', 'Amti with rice and sabzi', 'Usal with pav', 'Masale Bhat'],
        eveningSnack: ['Batata Vada', 'Bhakarwadi', 'Sprouts chaat', 'Fruit plate'],
        dinner: ['Zunka Bhakri with thecha', 'Matki Usal with rice', 'Bharli Vangi with chapati']
      },
      jain: {
        breakfast: ['Sabudana Khichdi', 'Rajgira Thalipeeth', 'Makhana Poha'],
        midMorningSnack: ['Dry fruits', 'Fresh fruits', 'Kokum sharbat', 'Makhana'],
        lunch: ['Moong Dal rice (no onion/garlic) with sabzi', 'Pumpkin sabzi with chapati and dal'],
        eveningSnack: ['Sabudana Vada', 'Fruit salad', 'Dry fruit laddoo'],
        dinner: ['Dal (no onion/garlic) with chapati and sabzi', 'Khichdi with papad', 'Paneer sabzi with roti']
      }
    },
    punjabi: {
      vegetarian: {
        breakfast: ['Makki di Roti with Sarson da Saag', 'Chole Bhature', 'Aloo Paratha with white butter and lassi', 'Paneer Paratha with curd'],
        midMorningSnack: ['Lassi (sweet/salted)', 'Gur with makkhan', 'Pinni', 'Roasted peanuts'],
        lunch: ['Rajma Chawal with salad and pickle', 'Dal Makhani with naan and raita', 'Paneer Tikka with tandoori roti', 'Chole with kulche and onion'],
        eveningSnack: ['Amritsari Kulcha', 'Paneer Tikka', 'Chai with biscuits', 'Golgappe'],
        dinner: ['Malai Kofta with naan', 'Shahi Paneer with jeera rice', 'Kadhi Pakora with rice', 'Palak Paneer with 2 rotis']
      },
      non_vegetarian: {
        breakfast: ['Keema Paratha with raita', 'Anda Paratha with pickle', 'Chole Bhature with lassi'],
        midMorningSnack: ['Tandoori Chicken (2 pieces)', 'Lassi', 'Pinni', 'Gur and makkhan'],
        lunch: ['Butter Chicken with naan and raita', 'Amritsari Fish with rice', 'Mutton Rogan Josh with naan', 'Chicken Tikka Masala with jeera rice'],
        eveningSnack: ['Chicken Tikka', 'Seekh Kebab', 'Amritsari Kulcha', 'Tandoori Chicken momos'],
        dinner: ['Tandoori Chicken with dal and roti', 'Chicken Curry with rice and salad', 'Mutton with naan and raita', 'Fish Amritsari with rice']
      },
      eggetarian: {
        breakfast: ['Anda Paratha with pickle', 'Egg Bhurji with buttered toast', 'Omelette Paratha'],
        midMorningSnack: ['Boiled eggs', 'Lassi', 'Roasted peanuts', 'Pinni'],
        lunch: ['Egg Curry with Rajma rice', 'Anda Biryani with raita', 'Chole with egg and kulche'],
        eveningSnack: ['Egg roll', 'Paneer Tikka', 'Chai with biscuits', 'Golgappe'],
        dinner: ['Egg Masala with naan', 'Egg Curry with rice and dal', 'Anda Bhurji with roti']
      },
      vegan: {
        breakfast: ['Aloo Paratha (no butter) with pickle', 'Chole with puri', 'Poha with peanuts'],
        midMorningSnack: ['Roasted peanuts', 'Sattu drink', 'Fruit chaat', 'Gur chana'],
        lunch: ['Rajma Chawal with salad', 'Chole with kulche', 'Dal Tadka with roti and sabzi', 'Chana Masala with rice'],
        eveningSnack: ['Aloo Tikki with chutney', 'Golgappe', 'Sprouts chaat', 'Masala chai (plant milk)'],
        dinner: ['Dal with roti and aloo gobi', 'Chole with rice', 'Mixed veg with 2 rotis and dal']
      },
      jain: {
        breakfast: ['Sabudana Khichdi', 'Makhana Paratha', 'Khakhra with ghee'],
        midMorningSnack: ['Dry fruits', 'Lassi', 'Fresh fruits', 'Makhana'],
        lunch: ['Moong Dal with rice and paneer sabzi (no onion/garlic)', 'Kadhi khichdi (no onion/garlic)'],
        eveningSnack: ['Dry fruit laddoo', 'Fruit salad', 'Makhana roasted'],
        dinner: ['Paneer sabzi with roti and dal (no onion/garlic)', 'Khichdi with curd and papad']
      }
    },
    kerala: {
      vegetarian: {
        breakfast: ['Appam with vegetable stew', 'Puttu with kadala curry', 'Idiyappam with coconut milk', 'Dosa with sambar and chutney', 'Upma with banana'],
        midMorningSnack: ['Tender coconut water', 'Banana chips (nendhran)', 'Pazham pori (banana fritter)', 'Ela ada'],
        lunch: ['Kerala Sadya - rice, sambar, avial, olan, thoran, pickle, papad, payasam', 'Sambar rice with thoran and pickle', 'Aviyal with rice and rasam'],
        eveningSnack: ['Unniyappam', 'Sukhiyan', 'Banana chips', 'Chai with parippu vada'],
        dinner: ['Chapati with vegetable stew', 'Dosa with sambar', 'Idiyappam with egg curry', 'Appam with coconut chutney and sambar']
      },
      non_vegetarian: {
        breakfast: ['Appam with chicken stew', 'Puttu with fish curry', 'Idiyappam with egg roast', 'Dosa with fish molee'],
        midMorningSnack: ['Banana chips', 'Tender coconut water', 'Fish cutlet', 'Pazham pori'],
        lunch: ['Meen Kuzhambhu (fish curry) with rice', 'Kerala Chicken Curry with appam', 'Prawn Masala with rice and thoran', 'Fish Moilee with appam'],
        eveningSnack: ['Chicken cutlet', 'Fish fry', 'Unniyappam', 'Chai with parippu vada'],
        dinner: ['Malabar Chicken Biryani', 'Fish Pollichathu with rice', 'Beef Ularthiyathu with pathiri', 'Prawn Curry with appam']
      },
      eggetarian: {
        breakfast: ['Appam with egg curry', 'Puttu with kadala curry and egg', 'Idiyappam with egg roast'],
        midMorningSnack: ['Boiled eggs', 'Banana chips', 'Tender coconut', 'Pazham pori'],
        lunch: ['Egg Curry with rice and sambar', 'Egg Roast with appam', 'Egg Biryani with raita'],
        eveningSnack: ['Egg cutlet', 'Unniyappam', 'Banana chips', 'Parippu vada'],
        dinner: ['Egg Masala with chapati', 'Egg Curry with idiyappam', 'Egg Roast with rice and thoran']
      },
      vegan: {
        breakfast: ['Puttu (no egg) with kadala curry', 'Dosa with sambar', 'Appam with coconut milk stew', 'Idiyappam with coconut chutney'],
        midMorningSnack: ['Tender coconut water', 'Banana chips', 'Mixed nuts', 'Fresh fruits'],
        lunch: ['Sambar rice with avial and thoran', 'Rasam rice with poriyal', 'Kerala Sadya (vegan portions)'],
        eveningSnack: ['Pazham pori', 'Sundal', 'Parippu vada', 'Fruit plate'],
        dinner: ['Chapati with vegetable stew (coconut milk)', 'Dosa with sambar', 'Appam with vegetable stew']
      },
      jain: {
        breakfast: ['Dosa (no onion/garlic) with coconut chutney', 'Upma with cashews', 'Puttu with coconut'],
        midMorningSnack: ['Tender coconut water', 'Fresh fruits', 'Dry fruits', 'Banana chips'],
        lunch: ['Sambar (no onion/garlic) with rice and thoran', 'Rasam rice with sabzi'],
        eveningSnack: ['Banana chips', 'Fruit salad', 'Coconut laddoo'],
        dinner: ['Chapati with vegetable stew (no onion/garlic)', 'Dosa with chutney']
      }
    },
    rajasthani: {
      vegetarian: {
        breakfast: ['Pyaaz ki Kachori with aloo sabzi', 'Dal Baati Churma', 'Mirchi Vada with chai'],
        midMorningSnack: ['Chaas (buttermilk)', 'Ghevar', 'Bikaneri Bhujia', 'Mawa Kachori'],
        lunch: ['Dal Baati Churma with salad', 'Gatte ki Sabzi with rice and roti', 'Ker Sangri with bajre ki roti', 'Papad ki sabzi with rice'],
        eveningSnack: ['Pyaaz ki Kachori', 'Mirchi Vada', 'Bikaneri Bhujia with chai', 'Laddu'],
        dinner: ['Bajre ki Roti with lehsun chutney and sabzi', 'Gatte ki Sabzi with roti', 'Papad ki Sabzi with dal and rice']
      },
      non_vegetarian: {
        breakfast: ['Kheema Baati', 'Egg Kachori', 'Omelette with paratha'],
        midMorningSnack: ['Chaas', 'Bikaneri Bhujia', 'Boiled eggs', 'Ghevar'],
        lunch: ['Laal Maas with bajre ki roti', 'Safed Maas with rice', 'Jungli Maas with roti and dal'],
        eveningSnack: ['Mutton Kebab', 'Mirchi Vada', 'Chai with kachori'],
        dinner: ['Laal Maas with chapati', 'Chicken curry with dal baati', 'Mutton with rice and dal']
      },
      eggetarian: {
        breakfast: ['Egg Kachori', 'Omelette with paratha', 'Egg Bhurji Baati'],
        midMorningSnack: ['Boiled eggs', 'Chaas', 'Bikaneri Bhujia'],
        lunch: ['Egg Curry with dal and rice', 'Gatte ki Sabzi with egg and roti'],
        eveningSnack: ['Egg Mirchi Vada', 'Egg roll', 'Chai with kachori'],
        dinner: ['Egg Masala with bajre ki roti', 'Egg Curry with rice and dal']
      },
      vegan: {
        breakfast: ['Pyaaz Kachori (no ghee)', 'Bajre ki Roti with thecha', 'Poha'],
        midMorningSnack: ['Chaas (coconut)', 'Bikaneri Bhujia', 'Fruits', 'Peanuts'],
        lunch: ['Gatte ki Sabzi (no curd) with roti', 'Ker Sangri with bajre ki roti', 'Dal with rice and sabzi'],
        eveningSnack: ['Mirchi Vada', 'Sprouts chaat', 'Masala chai (plant milk)'],
        dinner: ['Bajre ki Roti with sabzi and dal', 'Papad ki Sabzi with rice']
      },
      jain: {
        breakfast: ['Sabudana Khichdi', 'Makhana with dry fruits', 'Rajgira Roti'],
        midMorningSnack: ['Dry fruits', 'Fresh fruit', 'Makhana'],
        lunch: ['Moong Dal with rice (no onion/garlic)', 'Paneer sabzi with roti', 'Khichdi'],
        eveningSnack: ['Fruit salad', 'Dry fruit laddoo', 'Makhana'],
        dinner: ['Dal with roti and pumpkin sabzi', 'Paneer with roti']
      }
    }
  };

  const region = cuisineRegion?.toLowerCase() || 'north_indian';
  const preference = dietaryPreference?.toLowerCase() || 'balanced';
  
  // Map 'balanced' to 'non_vegetarian' for Indian context
  const mappedPreference = preference === 'balanced' ? 'non_vegetarian' : preference;
  
  const regionMeals = regionalMeals[region] || regionalMeals.north_indian;
  const suggestions = regionMeals[mappedPreference] || regionMeals.vegetarian;

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
