import ReactMarkdown from 'react-markdown';
import { filterDietSuggestions, scaleMealBudgets, isDietAdvice } from '../../../shared/patient-diet.mjs';
import { useState, useEffect, useMemo } from "react";
import {
  Scale,
  Apple,
  TrendingUp,
  TrendingDown,
  Minus,
  CalendarRange,
  Clock,
  Utensils,
  Info,
  Calculator,
  Plus,
  X,
  List,
  Droplets,
  Loader2,
  User,
  FileDown,
} from "lucide-react";
import { generateMonthlyDietPDF } from "@/utils/dietPdfGenerator";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import MainLayout from "@/components/layout/MainLayout";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/auth/AuthProvider";
import api from "@/utils/api";

interface MealPlan {
  time: string;
  meal: string;
  calories: number;
  description: string;
}

interface DietPlan {
  type: "weight_loss" | "weight_gain" | "maintenance";
  dailyCalories: number;
  meals: MealPlan[];
  tips: string[];
  suggestions: string[];
}

interface FoodItem {
  name: string;
  calories: number;
  image: string;
  quantity: number;
}

interface SavedMeal {
  name: string;
  foods: FoodItem[];
  totalCalories: number;
  date: string;
}

// Helper function to categorize BMI - defined outside component for use in getPersonalizedSuggestions
const getBMICategory = (bmi: number): string => {
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Normal";
  if (bmi < 30) return "Overweight";
  return "Obese";
};

const getPersonalizedSuggestions = (
  bmi: number,
  weight: number,
  height: number,
  goal: "weight_loss" | "weight_gain" | "maintenance"
): string[] => {
  const suggestions: string[] = [];
  const bmiCategory = getBMICategory(bmi);

  // Base suggestions based on BMI
  if (bmiCategory === "Underweight") {
    suggestions.push(
      "Focus on nutrient-dense Indian foods like ghee, dry fruits, and paneer",
      "Include healthy fats like desi ghee, coconut, and groundnuts",
      "Eat more frequently - add mid-morning and evening snacks"
    );
  } else if (bmiCategory === "Overweight" || bmiCategory === "Obese") {
    suggestions.push(
      "Practice portion control using small katoris instead of large plates",
      "Choose lean proteins like dal, fish, chicken and reduce fried foods",
      "Increase fiber intake through sabzis, salads, and whole grains like jowar, bajra"
    );
  }

  // Goal-specific suggestions
  if (goal === "weight_loss") {
    suggestions.push(
      "Replace white rice with brown rice or millets (ragi, jowar, bajra)",
      "Include protein-rich dal, sprouts, or paneer in every meal",
      "Avoid fried snacks - choose roasted makhana, chana instead",
      "Drink jeera water or methi water to boost metabolism",
      "Have an early dinner before 8 PM"
    );
  } else if (goal === "weight_gain") {
    suggestions.push(
      "Add ghee to rotis and rice for healthy calories",
      "Include paneer, eggs, or chicken in every meal",
      "Drink banana shake, badam milk, or lassi between meals",
      "Eat soaked almonds, dates, and anjeer (figs) daily",
      "Have haldi doodh (turmeric milk) before bed"
    );
  } else {
    suggestions.push(
      "Follow a balanced thali - dal, sabzi, roti/rice, salad, curd",
      "Use traditional spices like turmeric, cumin for health benefits",
      "Stay consistent with Indian meal timings",
      "Include seasonal local fruits and vegetables",
      "Drink buttermilk (chaas) or coconut water for hydration"
    );
  }

  // Add personalized caloric suggestions
  const idealWeight = 22 * (height / 100) * (height / 100); // Using BMI 22 as target
  if (goal === "weight_loss" && weight > idealWeight) {
    suggestions.push(`Target weight range: ${Math.round(idealWeight - 5)} to ${Math.round(idealWeight)} kg`);
  } else if (goal === "weight_gain" && weight < idealWeight) {
    suggestions.push(`Target weight range: ${Math.round(idealWeight)} to ${Math.round(idealWeight + 5)} kg`);
  }

  return suggestions;
};

const dietPlans: Record<string, DietPlan> = {
  weight_loss: {
    type: "weight_loss",
    dailyCalories: 1500,
    meals: [
      {
        time: "7:00 AM",
        meal: "Breakfast",
        calories: 300,
        description: "Vegetable poha with peanuts, or 2 idlis with sambar and coconut chutney",
      },
      {
        time: "10:00 AM",
        meal: "Morning Snack",
        calories: 150,
        description: "1 cup buttermilk (chaas) with roasted chana or a small bowl of sprouts chaat",
      },
      {
        time: "1:00 PM",
        meal: "Lunch",
        calories: 400,
        description: "2 rotis with dal, mixed vegetable sabzi, cucumber raita, and salad",
      },
      {
        time: "4:00 PM",
        meal: "Evening Snack",
        calories: 150,
        description: "Green tea with roasted makhana (fox nuts) or 1 small fruit",
      },
      {
        time: "7:00 PM",
        meal: "Dinner",
        calories: 500,
        description: "1 bowl khichdi with vegetables, or grilled fish with steamed vegetables and 1 roti",
      },
    ],
    tips: [
      "Replace white rice with brown rice, millets (jowar, bajra, ragi) for better fiber",
      "Use mustard oil or cold-pressed coconut oil instead of refined oils",
      "Include dal or legumes in every meal for protein and satiety",
      "Drink jeera water or ajwain water to boost metabolism",
      "Avoid fried snacks like samosas, pakoras - opt for roasted alternatives",
      "Have an early dinner before 8 PM and maintain a 12-hour fasting window",
      "Replace sugar with jaggery (gur) in moderation",
      "Include plenty of sabzis (vegetables) with minimal oil",
      "Drink warm water with lemon and honey in the morning",
      "Avoid sugary drinks, choose nimbu pani or coconut water instead"
    ],
    suggestions: []
  },
  weight_gain: {
    type: "weight_gain",
    dailyCalories: 3000,
    meals: [
      {
        time: "7:00 AM",
        meal: "Breakfast",
        calories: 600,
        description: "Paneer paratha (2) with curd, banana shake with dry fruits and honey",
      },
      {
        time: "10:00 AM",
        meal: "Morning Snack",
        calories: 400,
        description: "Handful of mixed dry fruits (almonds, cashews, dates) with a glass of full-fat milk",
      },
      {
        time: "1:00 PM",
        meal: "Lunch",
        calories: 800,
        description: "Rice with rajma/chole curry, paneer sabzi, roti, curd, and pickle",
      },
      {
        time: "4:00 PM",
        meal: "Evening Snack",
        calories: 400,
        description: "Banana milkshake with peanut butter, or aloo paratha with butter",
      },
      {
        time: "7:00 PM",
        meal: "Dinner",
        calories: 800,
        description: "Chicken biryani or veg pulao with raita, dal makhani, and 2 rotis with ghee",
      },
    ],
    tips: [
      "Add ghee or white butter to rotis and rice for healthy calories",
      "Include protein-rich foods like paneer, eggs, chicken, and dal in every meal",
      "Drink lassi, milkshakes, or badam milk between meals",
      "Eat soaked almonds, walnuts, and dates daily",
      "Include calorie-dense foods like dry fruits, ghee, and full-fat dairy",
      "Have a glass of warm milk with turmeric (haldi doodh) before bed",
      "Add peanuts and sesame seeds (til) to your meals",
      "Eat banana with milk and honey as a pre-workout or evening snack",
      "Include eggs (if non-vegetarian) - 3-4 per day",
      "Don't skip meals - eat 5-6 times a day with proper portions"
    ],
    suggestions: []
  },
  maintenance: {
    type: "maintenance",
    dailyCalories: 2000,
    meals: [
      {
        time: "7:00 AM",
        meal: "Breakfast",
        calories: 400,
        description: "Upma with vegetables and coconut chutney, or stuffed moong dal cheela with mint chutney",
      },
      {
        time: "10:00 AM",
        meal: "Morning Snack",
        calories: 200,
        description: "Fresh fruit (papaya, guava, or apple) with a handful of mixed nuts",
      },
      {
        time: "1:00 PM",
        meal: "Lunch",
        calories: 500,
        description: "2 rotis with dal, seasonal vegetable sabzi, salad, and buttermilk",
      },
      {
        time: "4:00 PM",
        meal: "Evening Snack",
        calories: 200,
        description: "Roasted chana or makhana with masala chai (less sugar)",
      },
      {
        time: "7:00 PM",
        meal: "Dinner",
        calories: 700,
        description: "Rice/roti with fish curry or palak paneer, dal, raita, and salad",
      },
    ],
    tips: [
      "Follow a balanced thali approach - dal, sabzi, roti/rice, salad, and curd",
      "Use traditional cooking methods - pressure cooking, steaming, tadka",
      "Include seasonal fruits and vegetables available locally",
      "Maintain regular meal timings aligned with Indian meal patterns",
      "Include curd or buttermilk daily for gut health",
      "Use a variety of spices like turmeric, cumin, and coriander for health benefits",
      "Practice portion control - eat in katoris instead of large plates",
      "Include traditional superfoods like amla, tulsi, and moringa",
      "Balance your meals with 50% vegetables, 25% protein, 25% carbs",
      "Stay hydrated with water, coconut water, and herbal drinks like kahwa"
    ],
    suggestions: []
  },
};

// invented-data-check: static-reference -- food reference catalogs, not patient records.
const commonFoods: FoodItem[] = [
  { name: "Roti (1 piece)", calories: 120, image: "🫓", quantity: 0 },
  { name: "Rice (1 katori)", calories: 130, image: "🍚", quantity: 0 },
  { name: "Dal (1 katori)", calories: 150, image: "🥘", quantity: 0 },
  { name: "Sabzi (1 katori)", calories: 80, image: "🥗", quantity: 0 },
  { name: "Dahi/Curd (1 katori)", calories: 100, image: "🍶", quantity: 0 },
  { name: "Paneer (100g)", calories: 265, image: "🧀", quantity: 0 },
  { name: "Egg", calories: 70, image: "🥚", quantity: 0 },
  { name: "Banana", calories: 105, image: "🍌", quantity: 0 },
  { name: "Milk (1 glass)", calories: 120, image: "🥛", quantity: 0 },
  { name: "Poha (1 plate)", calories: 250, image: "🍛", quantity: 0 },
];

// invented-data-check: static-reference -- food category reference, not patient records.
const foodCategories = [
  {
    name: "Indian Staples",
    items: [
      { name: "Roti/Chapati", calories: 120, image: "🫓", quantity: 0 },
      { name: "Paratha (plain)", calories: 180, image: "🫓", quantity: 0 },
      { name: "Rice (1 katori)", calories: 130, image: "🍚", quantity: 0 },
      { name: "Dal (1 katori)", calories: 150, image: "🥘", quantity: 0 },
      { name: "Rajma (1 katori)", calories: 170, image: "🥘", quantity: 0 },
      { name: "Chole (1 katori)", calories: 180, image: "🥘", quantity: 0 },
      { name: "Khichdi (1 katori)", calories: 200, image: "🍛", quantity: 0 },
      { name: "Pulao (1 katori)", calories: 220, image: "🍛", quantity: 0 },
      { name: "Biryani (1 katori)", calories: 250, image: "🍛", quantity: 0 },
    ],
  },
  {
    name: "Indian Breakfast",
    items: [
      { name: "Poha (1 plate)", calories: 250, image: "🍛", quantity: 0 },
      { name: "Upma (1 plate)", calories: 230, image: "🍛", quantity: 0 },
      { name: "Idli (2 pieces)", calories: 80, image: "⚪", quantity: 0 },
      { name: "Dosa (plain)", calories: 120, image: "🥞", quantity: 0 },
      { name: "Masala Dosa", calories: 250, image: "🥞", quantity: 0 },
      { name: "Uttapam", calories: 200, image: "🥞", quantity: 0 },
      { name: "Paratha (stuffed)", calories: 300, image: "🫓", quantity: 0 },
      { name: "Moong Dal Cheela", calories: 150, image: "🥞", quantity: 0 },
      { name: "Besan Cheela", calories: 180, image: "🥞", quantity: 0 },
    ],
  },
  {
    name: "Indian Curries & Sabzis",
    items: [
      { name: "Paneer Bhurji (100g)", calories: 265, image: "🧀", quantity: 0 },
      { name: "Palak Paneer (1 katori)", calories: 280, image: "🍛", quantity: 0 },
      { name: "Butter Chicken (1 katori)", calories: 290, image: "🍗", quantity: 0 },
      { name: "Chicken Curry (1 katori)", calories: 250, image: "🍗", quantity: 0 },
      { name: "Fish Curry (1 katori)", calories: 200, image: "🐟", quantity: 0 },
      { name: "Aloo Gobi (1 katori)", calories: 150, image: "🥔", quantity: 0 },
      { name: "Bhindi Sabzi (1 katori)", calories: 100, image: "🥬", quantity: 0 },
      { name: "Baingan Bharta (1 katori)", calories: 120, image: "🍆", quantity: 0 },
      { name: "Mixed Veg (1 katori)", calories: 130, image: "🥗", quantity: 0 },
    ],
  },
  {
    name: "Indian Snacks",
    items: [
      { name: "Samosa (1 piece)", calories: 260, image: "🔺", quantity: 0 },
      { name: "Pakora (5 pieces)", calories: 200, image: "🍘", quantity: 0 },
      { name: "Vada (1 piece)", calories: 180, image: "🍩", quantity: 0 },
      { name: "Dhokla (2 pieces)", calories: 120, image: "🟨", quantity: 0 },
      { name: "Kachori (1 piece)", calories: 280, image: "🔴", quantity: 0 },
      { name: "Roasted Chana (50g)", calories: 180, image: "🥜", quantity: 0 },
      { name: "Makhana (1 katori)", calories: 100, image: "⚪", quantity: 0 },
      { name: "Sprouts Chaat", calories: 150, image: "🥗", quantity: 0 },
      { name: "Pani Puri (6 pieces)", calories: 200, image: "🟡", quantity: 0 },
    ],
  },
  {
    name: "Dairy & Drinks",
    items: [
      { name: "Milk (1 glass)", calories: 120, image: "🥛", quantity: 0 },
      { name: "Dahi/Curd (1 katori)", calories: 100, image: "🍶", quantity: 0 },
      { name: "Buttermilk/Chaas (1 glass)", calories: 40, image: "🥛", quantity: 0 },
      { name: "Lassi (sweet)", calories: 180, image: "🥤", quantity: 0 },
      { name: "Paneer (100g)", calories: 265, image: "🧀", quantity: 0 },
      { name: "Badam Milk (1 glass)", calories: 200, image: "🥛", quantity: 0 },
      { name: "Chai (1 cup)", calories: 80, image: "☕", quantity: 0 },
      { name: "Coconut Water (1 glass)", calories: 45, image: "🥥", quantity: 0 },
      { name: "Nimbu Pani (1 glass)", calories: 30, image: "🍋", quantity: 0 },
    ],
  },
  {
    name: "Fruits & Dry Fruits",
    items: [
      { name: "Apple", calories: 95, image: "🍎", quantity: 0 },
      { name: "Banana", calories: 105, image: "🍌", quantity: 0 },
      { name: "Mango", calories: 150, image: "🥭", quantity: 0 },
      { name: "Papaya (1 katori)", calories: 60, image: "🍈", quantity: 0 },
      { name: "Guava", calories: 70, image: "🍐", quantity: 0 },
      { name: "Almonds (10 pieces)", calories: 70, image: "🌰", quantity: 0 },
      { name: "Cashews (10 pieces)", calories: 90, image: "🥜", quantity: 0 },
      { name: "Dates (3 pieces)", calories: 80, image: "🌴", quantity: 0 },
      { name: "Walnuts (5 halves)", calories: 90, image: "🌰", quantity: 0 },
    ],
  },
  {
    name: "Proteins",
    items: [
      { name: "Egg (boiled)", calories: 70, image: "🥚", quantity: 0 },
      { name: "Egg Bhurji (2 eggs)", calories: 180, image: "🍳", quantity: 0 },
      { name: "Chicken (100g)", calories: 165, image: "🍗", quantity: 0 },
      { name: "Fish (100g)", calories: 140, image: "🐟", quantity: 0 },
      { name: "Paneer (100g)", calories: 265, image: "🧀", quantity: 0 },
      { name: "Tofu (100g)", calories: 80, image: "🧊", quantity: 0 },
      { name: "Soya Chunks (50g dry)", calories: 170, image: "🫘", quantity: 0 },
      { name: "Sprouts (1 katori)", calories: 100, image: "🌱", quantity: 0 },
      { name: "Moong Dal (1 katori)", calories: 150, image: "🥘", quantity: 0 },
    ],
  },
];

const Diet = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<string>("maintenance");
  const [personalizedPlan, setPersonalizedPlan] = useState<DietPlan | null>(null);
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [heightUnit, setHeightUnit] = useState("cm");
  const [feet, setFeet] = useState("");
  const [inches, setInches] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("male");
  const [activityLevel, setActivityLevel] = useState("moderate");
  const [dietaryPreference, setDietaryPreference] = useState("balanced");
  const [cuisineRegion, setCuisineRegion] = useState("north_indian");
  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([]);
  const [backendPlan, setBackendPlan] = useState<any>(null);
  const [backendLoading, setBackendLoading] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [drIshaRec, setDrIshaRec] = useState<{recommendation: string; healthProfile: any} | null>(null);
  const [drIshaLoading, setDrIshaLoading] = useState(false);

  // Download 1-month diet plan as branded PDF
  const handleDownloadPDF = async () => {
    if (!bmi || !tdee) return;
    setPdfGenerating(true);
    try {
      const activePlan = personalizedPlan || dietPlans[selectedPlan];
      await generateMonthlyDietPDF({
        userName:          [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ') || currentUser?.name || 'Member',
        goal:              selectedPlan as 'weight_loss' | 'weight_gain' | 'maintenance',
        bmi:               bmi!,
        bmiCategory:       getBMICategory(parseFloat(bmi!)),
        dailyCalories:     activePlan.dailyCalories,
        macros:            backendPlan?.macronutrients ? {
          protein: backendPlan.macronutrients.protein.grams,
          carbs:   backendPlan.macronutrients.carbs.grams,
          fats:    backendPlan.macronutrients.fats.grams,
        } : undefined,
        hydration:         backendPlan?.hydration?.daily,
        tips:              activePlan.tips,
        cuisineRegion,
        dietaryPreference,
        meals:             activePlan.meals,
        backendMealPlan:   backendPlan?.mealPlan,
        drIshaRecommendation: drIshaRec?.recommendation,
        conditionsConsidered: drIshaRec?.healthProfile,
      });
    } finally {
      setPdfGenerating(false);
    }
  };

  // Auto-populate from user profile
  useEffect(() => {
    if (currentUser) {
      if (currentUser.weight) setWeight(String(currentUser.weight));
      if (currentUser.height) setHeight(String(currentUser.height));
      if (currentUser.gender) setGender(currentUser.gender.toLowerCase());
      if (currentUser.personalHistory?.exercise) {
        const exerciseMap: Record<string, string> = {
          sedentary: "sedentary", light: "light", moderate: "moderate",
          active: "active", "very-active": "veryActive", intense: "veryActive",
        };
        setActivityLevel(exerciseMap[currentUser.personalHistory.exercise] || "moderate");
      }
      if (currentUser.personalHistory?.diet) {
        const dietMap: Record<string, string> = {
          vegetarian: "vegetarian", vegan: "vegan", mixed: "balanced",
          "non-vegetarian": "balanced", eggetarian: "vegetarian",
        };
        setDietaryPreference(dietMap[currentUser.personalHistory.diet] || "balanced");
      }
      if (currentUser.dateOfBirth || currentUser.dob) {
        const dob = new Date(currentUser.dateOfBirth || currentUser.dob || "");
        if (!isNaN(dob.getTime())) {
          const ageDiff = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
          if (ageDiff > 0 && ageDiff < 150) setAge(String(ageDiff));
        }
      }
    }
  }, [currentUser]);

  // Load saved meals when component mounts
  useEffect(() => {
    const meals = JSON.parse(localStorage.getItem("savedMeals") || "[]");
    setSavedMeals(meals);
  }, []);

  const getHeightInCm = () => {
    try {
      if (heightUnit === "cm") {
        const h = parseFloat(height);
        return (isNaN(h) || h <= 0) ? 0 : h;
      } else {
        // Convert feet and inches to cm
        const feetNum = parseFloat(feet) || 0;
        const inchesNum = parseFloat(inches) || 0;
        const result = (feetNum * 30.48) + (inchesNum * 2.54);
        return (isNaN(result) || result <= 0) ? 0 : result;
      }
    } catch (error) {
      console.error('Error calculating height:', error);
      return 0;
    }
  };

  const calculateBMI = () => {
    const weightNum = parseFloat(weight);
    const heightInCm = getHeightInCm();
    const heightNum = heightInCm / 100; // convert cm to m
    if (weightNum && heightNum) {
      const bmi = weightNum / (heightNum * heightNum);
      return bmi.toFixed(1);
    }
    return null;
  };

  // Note: getBMICategory is now defined at module level (above getPersonalizedSuggestions)

  const calculateTDEE = () => {
    const weightNum = parseFloat(weight);
    const heightInCm = getHeightInCm();
    const ageNum = parseFloat(age);

    if (weightNum && heightInCm && ageNum) {
      // Calculate BMR using Mifflin-St Jeor Equation
      let bmr;
      if (gender === "male") {
        bmr = 10 * weightNum + 6.25 * heightInCm - 5 * ageNum + 5;
      } else {
        bmr = 10 * weightNum + 6.25 * heightInCm - 5 * ageNum - 161;
      }

      // Apply activity multiplier
      const multipliers = {
        sedentary: 1.2,
        light: 1.375,
        moderate: 1.55,
        active: 1.725,
        veryActive: 1.9,
      };

      return Math.round(bmr * multipliers[activityLevel as keyof typeof multipliers]);
    }
    return null;
  };

  const handlePlanChange = (type: "weight_loss" | "weight_gain" | "maintenance") => {
    try {
      const weightNum = parseFloat(weight);
      const heightInCm = getHeightInCm();
      
      // Validate inputs before proceeding
      if (!weightNum || isNaN(weightNum) || weightNum <= 0) {
        console.warn('Invalid weight value');
        setSelectedPlan(type);
        setPersonalizedPlan(null);
        return;
      }
      
      if (!heightInCm || isNaN(heightInCm) || heightInCm <= 0) {
        console.warn('Invalid height value');
        setSelectedPlan(type);
        setPersonalizedPlan(null);
        return;
      }
      
      const bmiNum = weightNum / ((heightInCm / 100) * (heightInCm / 100));
      
      // Check if the plan type exists
      if (!dietPlans[type]) {
        console.error('Invalid diet plan type:', type);
        return;
      }
      
      const plan = { ...dietPlans[type] };
      
      if (weightNum && heightInCm && !isNaN(bmiNum)) {
        plan.suggestions = getPersonalizedSuggestions(bmiNum, weightNum, heightInCm, type);
        
        // Adjust daily calories based on TDEE
        const calculatedTDEE = calculateTDEE();
        if (calculatedTDEE && !isNaN(calculatedTDEE)) {
          if (type === "weight_loss") {
            plan.dailyCalories = Math.max(1200, calculatedTDEE - 500);
          } else if (type === "weight_gain") {
            plan.dailyCalories = calculatedTDEE + 500;
          } else {
            plan.dailyCalories = calculatedTDEE;
          }
        }
      }
      
      plan.meals = scaleMealBudgets(plan.meals, plan.dailyCalories);
      setSelectedPlan(type);
      setPersonalizedPlan(plan);
    } catch (error) {
      console.error('Error changing diet plan:', error);
      setSelectedPlan(type);
      setPersonalizedPlan(null);
    }
  };

  // Fetch personalized diet data from backend
  const fetchBackendDiet = async (goal: string) => {
    const heightInCm = getHeightInCm();
    const weightNum = parseFloat(weight);
    const ageNum = parseFloat(age);
    if (!weightNum || !heightInCm || !ageNum) return;
    
    setBackendLoading(true);
    try {
      const { data } = await api.post('/diet/generate', {
        age: ageNum,
        weight: weightNum,
        height: heightInCm,
        goal,
        gender,
        activityLevel: activityLevel === 'veryActive' ? 'very_active' : activityLevel,
        dietaryPreference,
        cuisineRegion,
        dietaryRestrictions: currentUser?.allergies?.join(', ') || '',
      });
      if (data.success) {
        for (const meal of Object.values(data.plan.mealPlan || {}) as any[]) meal.suggestions = filterDietSuggestions(meal.suggestions, currentUser || {});
        setBackendPlan(data.plan);
      }
    } catch (err) {
      console.error('Backend diet fetch failed, using client-side plan:', err);
    } finally {
      setBackendLoading(false);
    }
  };

  // Fetch Dr. iSHA bespoke diet recommendation from health profile
  const fetchDrIshaRec = async (goal: string) => {
    const heightInCm = getHeightInCm();
    const weightNum = parseFloat(weight);
    const ageNum = parseFloat(age);
    if (!weightNum || !heightInCm || !ageNum) return;
    if (!currentUser) return;

    setDrIshaLoading(true);
    setDrIshaRec(null);
    try {
      const { data } = await api.post('/medical-ai/diet-plan', {
        goal,
        weight: weightNum,
        height: heightInCm,
        age: ageNum,
        gender,
        bmi,
        dailyCalories: (personalizedPlan || dietPlans[goal])?.dailyCalories,
        dietaryPreference,
        cuisineRegion,
      }, {
        timeout: 10000, // 10s fast-fail — falls through to client-side plan gracefully
      });
      if (data.success && isDietAdvice(data.recommendation)) {
        setDrIshaRec({ recommendation: data.recommendation, healthProfile: data.healthProfile });
      }
    } catch (err: any) {
      // Timeout or network error — client-side plan is already displayed; no console noise in prod
      if (import.meta.env.DEV) console.warn('Dr. iSHA diet unavailable (using local plan):', err?.code ?? err?.message);
    } finally {
      setDrIshaLoading(false);
    }
  };

  // Debounced effect — only re-fetches after user stops changing inputs for 800ms
  useEffect(() => {
    const hasWeight = Boolean(weight);
    const hasHeight = heightUnit === "cm" ? Boolean(height) : Boolean(feet || inches);
    if (!hasWeight || !hasHeight) return;

    handlePlanChange(selectedPlan as "weight_loss" | "weight_gain" | "maintenance");
    fetchBackendDiet(selectedPlan);

    const timer = setTimeout(() => {
      fetchDrIshaRec(selectedPlan);
    }, 800);

    return () => clearTimeout(timer);
  }, [weight, height, feet, inches, heightUnit, age, gender, activityLevel, selectedPlan, dietaryPreference, cuisineRegion]);

  const bmi = calculateBMI();
  const tdee = calculateTDEE();

  return (
    // <MainLayout>
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-slate-800 dark:text-white">
            Personalized Diet Plan
          </h1>
          <div className="flex gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2 border-slate-200 dark:border-slate-700 dark:bg-slate-800/50 dark:text-white hover:bg-teal-50 dark:hover:bg-teal-900/20 hover:border-teal-300 dark:hover:border-teal-600">
                  <List className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                  Saved Meals
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                <DialogHeader>
                  <DialogTitle>Your Saved Meals</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  {savedMeals.length === 0 ? (
                    <p className="text-center text-slate-500 dark:text-slate-400">No saved meals yet</p>
                  ) : (
                    savedMeals.map((meal, index) => (
                      <Card key={index} className="p-4 bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="text-lg font-semibold text-slate-800 dark:text-white">{meal.name}</h3>
                          <Badge className="bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400">{meal.totalCalories} cal</Badge>
                        </div>
                        <div className="space-y-2">
                          {meal.foods.map((food, foodIndex) => (
                            <div key={foodIndex} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                              <span>{food.image}</span>
                              <span className="flex-1">{food.name}</span>
                              <span className="text-slate-500 dark:text-slate-400">
                                {food.quantity} × {food.calories} cal
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                          Saved on {new Date(meal.date).toLocaleDateString('en-IN')}
                        </div>
                      </Card>
                    ))
                  )}
                </div>
              </DialogContent>
            </Dialog>
            <Button
              onClick={() => navigate("/calorie-calculator")}
              className="flex items-center gap-2 border-slate-200 dark:border-slate-700 dark:bg-slate-800/50 dark:text-white hover:bg-teal-50 dark:hover:bg-teal-900/20 hover:border-teal-300 dark:hover:border-teal-600"
              variant="outline"
            >
              <Calculator className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              Calorie Calculator
            </Button>
            {bmi && tdee && (
              <Button
                onClick={handleDownloadPDF}
                disabled={pdfGenerating}
                className="flex items-center gap-2 bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white shadow-md hover:shadow-teal-500/30 transition-all"
              >
                {pdfGenerating ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <FileDown className="h-5 w-5" />
                )}
                {pdfGenerating ? 'Generating…' : 'Download 1-Month Plan'}
              </Button>
            )}
          </div>
        </div>

        {/* BMI and Diet Plan Section */}
        <div className="grid md:grid-cols-2 gap-8">
          <Card className="p-6 shadow-lg hover:shadow-xl transition-shadow duration-300 bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
            <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2 text-slate-800 dark:text-white">
              <Scale className="h-6 w-6 text-teal-600 dark:text-teal-400" />
              Calculate Your Needs
            </h2>
            <div className="space-y-5">
              <div className="group">
                <Label htmlFor="weight" className="text-sm font-medium mb-1.5 block text-slate-700 dark:text-slate-300">
                  Weight (kg)
                </Label>
                <Input
                  id="weight"
                  type="number"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="Enter your weight"
                  className="transition-all duration-200 focus:ring-2 focus:ring-teal-500/20 bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
              </div>
              <div className="group">
                <div className="flex items-center justify-between mb-1.5">
                  <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Height</Label>
                  <Select value={heightUnit} onValueChange={setHeightUnit}>
                    <SelectTrigger className="w-[100px] focus:ring-2 focus:ring-teal-500/20 bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white">
                      <SelectValue placeholder="Unit" />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                      <SelectItem value="cm" className="text-slate-800 dark:text-white focus:bg-teal-50 dark:focus:bg-teal-900/20">cm</SelectItem>
                      <SelectItem value="ft" className="text-slate-800 dark:text-white focus:bg-teal-50 dark:focus:bg-teal-900/20">ft/in</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {heightUnit === "cm" ? (
                  <Input
                    type="number"
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                    placeholder="Enter height in cm"
                    className="transition-all duration-200 focus:ring-2 focus:ring-teal-500/20 bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  />
                ) : (
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <Input
                        type="number"
                        value={feet}
                        onChange={(e) => setFeet(e.target.value)}
                        placeholder="Feet"
                        className="transition-all duration-200 focus:ring-2 focus:ring-teal-500/20 bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
                      />
                    </div>
                    <div className="flex-1">
                      <Input
                        type="number"
                        value={inches}
                        onChange={(e) => setInches(e.target.value)}
                        placeholder="Inches"
                        className="transition-all duration-200 focus:ring-2 focus:ring-teal-500/20 bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
                      />
                    </div>
                  </div>
                )}
              </div>
              <div className="group">
                <Label htmlFor="age" className="text-sm font-medium mb-1.5 block text-slate-700 dark:text-slate-300">
                  Age
                </Label>
                <Input
                  id="age"
                  type="number"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="Enter your age"
                  className="transition-all duration-200 focus:ring-2 focus:ring-teal-500/20 bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
              </div>
              <div className="group">
                <Label className="text-sm font-medium mb-1.5 block text-slate-700 dark:text-slate-300">Gender</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger className="w-full focus:ring-2 focus:ring-teal-500/20 bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white">
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                    <SelectItem value="male" className="text-slate-800 dark:text-white focus:bg-teal-50 dark:focus:bg-teal-900/20">Male</SelectItem>
                    <SelectItem value="female" className="text-slate-800 dark:text-white focus:bg-teal-50 dark:focus:bg-teal-900/20">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="group">
                <Label className="text-sm font-medium mb-1.5 block text-slate-700 dark:text-slate-300">Activity Level</Label>
                <Select value={activityLevel} onValueChange={setActivityLevel}>
                  <SelectTrigger className="w-full focus:ring-2 focus:ring-teal-500/20 bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white">
                    <SelectValue placeholder="Select activity level" />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                    <SelectItem value="sedentary" className="text-slate-800 dark:text-white focus:bg-teal-50 dark:focus:bg-teal-900/20">Sedentary (little or no exercise)</SelectItem>
                    <SelectItem value="light" className="text-slate-800 dark:text-white focus:bg-teal-50 dark:focus:bg-teal-900/20">Light (exercise 1-3 times/week)</SelectItem>
                    <SelectItem value="moderate" className="text-slate-800 dark:text-white focus:bg-teal-50 dark:focus:bg-teal-900/20">Moderate (exercise 3-5 times/week)</SelectItem>
                    <SelectItem value="active" className="text-slate-800 dark:text-white focus:bg-teal-50 dark:focus:bg-teal-900/20">Active (exercise 6-7 times/week)</SelectItem>
                    <SelectItem value="veryActive" className="text-slate-800 dark:text-white focus:bg-teal-50 dark:focus:bg-teal-900/20">Very Active (hard exercise daily)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="group">
                <Label className="text-sm font-medium mb-1.5 block text-slate-700 dark:text-slate-300">Food Type</Label>
                <Select value={dietaryPreference} onValueChange={setDietaryPreference}>
                  <SelectTrigger className="w-full focus:ring-2 focus:ring-teal-500/20 bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white">
                    <SelectValue placeholder="Select food type" />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                    <SelectItem value="vegetarian" className="text-slate-800 dark:text-white focus:bg-teal-50 dark:focus:bg-teal-900/20">🥬 Vegetarian</SelectItem>
                    <SelectItem value="balanced" className="text-slate-800 dark:text-white focus:bg-teal-50 dark:focus:bg-teal-900/20">🍗 Non-Vegetarian</SelectItem>
                    <SelectItem value="eggetarian" className="text-slate-800 dark:text-white focus:bg-teal-50 dark:focus:bg-teal-900/20">🥚 Eggetarian</SelectItem>
                    <SelectItem value="vegan" className="text-slate-800 dark:text-white focus:bg-teal-50 dark:focus:bg-teal-900/20">🌱 Vegan</SelectItem>
                    <SelectItem value="jain" className="text-slate-800 dark:text-white focus:bg-teal-50 dark:focus:bg-teal-900/20">🙏 Jain (No onion/garlic)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="group">
                <Label className="text-sm font-medium mb-1.5 block text-slate-700 dark:text-slate-300">Cuisine Region</Label>
                <Select value={cuisineRegion} onValueChange={setCuisineRegion}>
                  <SelectTrigger className="w-full focus:ring-2 focus:ring-teal-500/20 bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white">
                    <SelectValue placeholder="Select cuisine region" />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                    <SelectItem value="north_indian" className="text-slate-800 dark:text-white focus:bg-teal-50 dark:focus:bg-teal-900/20">🏔️ North Indian</SelectItem>
                    <SelectItem value="south_indian" className="text-slate-800 dark:text-white focus:bg-teal-50 dark:focus:bg-teal-900/20">🌴 South Indian</SelectItem>
                    <SelectItem value="bengali" className="text-slate-800 dark:text-white focus:bg-teal-50 dark:focus:bg-teal-900/20">🐟 Bengali</SelectItem>
                    <SelectItem value="gujarati" className="text-slate-800 dark:text-white focus:bg-teal-50 dark:focus:bg-teal-900/20">🫓 Gujarati</SelectItem>
                    <SelectItem value="maharashtrian" className="text-slate-800 dark:text-white focus:bg-teal-50 dark:focus:bg-teal-900/20">🌶️ Maharashtrian</SelectItem>
                    <SelectItem value="punjabi" className="text-slate-800 dark:text-white focus:bg-teal-50 dark:focus:bg-teal-900/20">🫘 Punjabi</SelectItem>
                    <SelectItem value="kerala" className="text-slate-800 dark:text-white focus:bg-teal-50 dark:focus:bg-teal-900/20">🥥 Kerala</SelectItem>
                    <SelectItem value="rajasthani" className="text-slate-800 dark:text-white focus:bg-teal-50 dark:focus:bg-teal-900/20">🏜️ Rajasthani</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {currentUser && (
                <div className="flex items-center gap-2 p-3 bg-teal-50 dark:bg-teal-900/20 rounded-lg border border-teal-200 dark:border-teal-800">
                  <User className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  <span className="text-xs text-teal-700 dark:text-teal-300">Auto-filled from your profile</span>
                </div>
              )}
            </div>

            {bmi && tdee && (
              <div className="mt-8 space-y-4">
                <div className="p-5 bg-teal-50 dark:bg-teal-900/20 rounded-xl border border-teal-200 dark:border-teal-800 hover:border-teal-300 dark:hover:border-teal-700 transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">Your BMI</p>
                      <p className="text-3xl font-bold text-teal-600 dark:text-teal-400 mt-1">{bmi}</p>
                    </div>
                    <Badge className="bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 hover:bg-teal-200 dark:hover:bg-teal-900/60 transition-colors text-sm py-1.5">
                      {getBMICategory(parseFloat(bmi))}
                    </Badge>
                  </div>
                </div>
                <div className="p-5 bg-teal-50 dark:bg-teal-900/20 rounded-xl border border-teal-200 dark:border-teal-800 hover:border-teal-300 dark:hover:border-teal-700 transition-colors">
                  <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">Daily Calorie Needs (TDEE)</p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <p className="text-3xl font-bold text-teal-600 dark:text-teal-400">{tdee}</p>
                    <span className="text-slate-500 dark:text-slate-400">calories</span>
                  </div>
                </div>
                
                {/* Macronutrient Breakdown from Backend */}
                {backendLoading && (
                  <div className="flex items-center gap-2 p-4 bg-slate-50 dark:bg-slate-900/30 rounded-xl border border-slate-200 dark:border-slate-700">
                    <Loader2 className="h-4 w-4 animate-spin text-teal-500" />
                    <span className="text-sm text-slate-500 dark:text-slate-400">Generating personalized plan...</span>
                  </div>
                )}
                {backendPlan?.macronutrients && !backendLoading && (
                  <div className="p-5 bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-900/20 dark:to-cyan-900/20 rounded-xl border border-teal-200 dark:border-teal-800">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Macronutrient Breakdown</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center p-3 bg-white dark:bg-slate-800/60 rounded-lg">
                        <p className="text-xs text-slate-500 dark:text-slate-400">Protein</p>
                        <p className="text-lg font-bold text-teal-600 dark:text-teal-400">{backendPlan.macronutrients.protein.grams}g</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">{backendPlan.macronutrients.protein.percentage}%</p>
                      </div>
                      <div className="text-center p-3 bg-white dark:bg-slate-800/60 rounded-lg">
                        <p className="text-xs text-slate-500 dark:text-slate-400">Carbs</p>
                        <p className="text-lg font-bold text-cyan-600 dark:text-cyan-400">{backendPlan.macronutrients.carbs.grams}g</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">{backendPlan.macronutrients.carbs.percentage}%</p>
                      </div>
                      <div className="text-center p-3 bg-white dark:bg-slate-800/60 rounded-lg">
                        <p className="text-xs text-slate-500 dark:text-slate-400">Fats</p>
                        <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{backendPlan.macronutrients.fats.grams}g</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">{backendPlan.macronutrients.fats.percentage}%</p>
                      </div>
                    </div>
                  </div>
                )}
                {backendPlan?.hydration && !backendLoading && (
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800 flex items-center gap-3">
                    <Droplets className="h-5 w-5 text-blue-500 dark:text-blue-400" />
                    <div>
                      <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Daily Hydration: {backendPlan.hydration.daily}</p>
                      <p className="text-xs text-blue-500 dark:text-blue-400">{backendPlan.hydration.recommendation}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card className="p-6 shadow-lg hover:shadow-xl transition-shadow duration-300 bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
            <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2 text-slate-800 dark:text-white">
              <Apple className="h-6 w-6 text-teal-600 dark:text-teal-400" />
              Your Diet Plan
            </h2>
            <Tabs
              defaultValue="maintenance"
              className="w-full"
              onValueChange={(value) => handlePlanChange(value as "weight_loss" | "weight_gain" | "maintenance")}
            >
              <TabsList className="grid w-full grid-cols-3 mb-6 bg-slate-100 dark:bg-slate-900/50 p-1 rounded-lg">
                <TabsTrigger value="weight_loss" className="flex items-center gap-2 text-slate-600 dark:text-slate-400 data-[state=active]:bg-gradient-to-r data-[state=active]:from-teal-500 data-[state=active]:to-teal-600 data-[state=active]:text-white data-[state=active]:shadow-md rounded-md transition-all">
                  <TrendingDown className="h-4 w-4" />
                  Loss
                </TabsTrigger>
                <TabsTrigger value="maintenance" className="flex items-center gap-2 text-slate-600 dark:text-slate-400 data-[state=active]:bg-gradient-to-r data-[state=active]:from-teal-500 data-[state=active]:to-teal-600 data-[state=active]:text-white data-[state=active]:shadow-md rounded-md transition-all">
                  <Minus className="h-4 w-4" />
                  Maintain
                </TabsTrigger>
                <TabsTrigger value="weight_gain" className="flex items-center gap-2 text-slate-600 dark:text-slate-400 data-[state=active]:bg-gradient-to-r data-[state=active]:from-teal-500 data-[state=active]:to-teal-600 data-[state=active]:text-white data-[state=active]:shadow-md rounded-md transition-all">
                  <TrendingUp className="h-4 w-4" />
                  Gain
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="mt-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-medium text-slate-800 dark:text-white">Daily Calories</h3>
                <Badge className="text-lg px-4 py-1 bg-gradient-to-r from-teal-500 to-teal-600 text-white">
                  {(personalizedPlan || dietPlans[selectedPlan])?.dailyCalories} cal
                </Badge>
              </div>

              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">Meal calories below are portion targets. Actual energy depends on ingredients and serving size.</p>
                {(personalizedPlan || dietPlans[selectedPlan])?.meals.map((meal, index) => (
                  <div
                    key={index}
                    className="p-4 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-teal-300 dark:hover:border-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-all duration-200 group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-teal-500 dark:text-teal-400 group-hover:text-teal-600 dark:group-hover:text-teal-300 transition-colors" />
                        <span className="text-sm text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors">{meal.time}</span>
                      </div>
                      <Badge variant="outline" className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 group-hover:bg-teal-100 dark:group-hover:bg-teal-900/30 group-hover:border-teal-300 dark:group-hover:border-teal-600 group-hover:text-teal-700 dark:group-hover:text-teal-300 transition-colors">
                        {meal.calories} cal
                      </Badge>
                    </div>
                    <h4 className="font-medium text-slate-800 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">{meal.meal}</h4>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 group-hover:text-slate-700 dark:group-hover:text-slate-300 transition-colors">
                      {meal.description}
                    </p>
                  </div>
                ))}
              </div>

              {(personalizedPlan || dietPlans[selectedPlan])?.suggestions.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-xl font-medium mb-4 flex items-center gap-2 text-slate-800 dark:text-white">
                    <Utensils className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                    Personalized Suggestions
                  </h3>
                  <ul className="space-y-3">
                    {(personalizedPlan || dietPlans[selectedPlan])?.suggestions.map((suggestion, index) => (
                      <li key={index} className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors p-2 rounded-lg hover:bg-teal-50 dark:hover:bg-teal-900/20">
                        <Info className="h-4 w-4 text-teal-600 dark:text-teal-400 shrink-0" />
                        {suggestion}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Regional Meal Suggestions from Backend */}
              {backendPlan?.mealPlan && !backendLoading && (
                <div className="mt-8">
                  <h3 className="text-xl font-medium mb-4 flex items-center gap-2 text-slate-800 dark:text-white">
                    <Utensils className="h-5 w-5 text-orange-500 dark:text-orange-400" />
                    Regional Meal Ideas
                    <Badge variant="outline" className="text-xs bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800">
                      {cuisineRegion.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} • {dietaryPreference === 'balanced' ? 'Non-Veg' : dietaryPreference.charAt(0).toUpperCase() + dietaryPreference.slice(1)}
                    </Badge>
                  </h3>
                  <div className="space-y-4">
                    {Object.entries(backendPlan.mealPlan).map(([mealKey, mealData]: [string, any]) => {
                      const mealLabels: Record<string, string> = {
                        breakfast: '🌅 Breakfast',
                        midMorningSnack: '🍎 Mid-Morning',
                        lunch: '☀️ Lunch',
                        eveningSnack: '🫖 Evening Snack',
                        dinner: '🌙 Dinner',
                      };
                      return (
                        <div key={mealKey} className="p-4 border border-orange-200 dark:border-orange-800/50 rounded-xl bg-orange-50/50 dark:bg-orange-900/10">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-slate-800 dark:text-white">{mealLabels[mealKey] || mealKey}</span>
                            <Badge variant="outline" className="text-xs bg-white dark:bg-slate-800 border-orange-200 dark:border-orange-700 text-orange-600 dark:text-orange-400">
                              ~{mealData.calories} cal
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {mealData.suggestions?.map((item: string, i: number) => (
                              <span key={i} className="text-xs px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-slate-700 dark:text-slate-300 hover:border-orange-300 dark:hover:border-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors cursor-default">
                                {item}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {backendLoading && (
                <div className="mt-8 flex items-center gap-2 p-4 bg-slate-50 dark:bg-slate-900/30 rounded-xl border border-slate-200 dark:border-slate-700">
                  <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                  <span className="text-sm text-slate-500 dark:text-slate-400">Loading regional meal suggestions...</span>
                </div>
              )}
            </div>
          </Card>

          <Card className="md:col-span-2 p-6 shadow-lg bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold flex items-center gap-2 text-slate-800 dark:text-white">
                <Info className="h-6 w-6 text-teal-600 dark:text-teal-400" />
                Diet Tips
              </h2>
            </div>
            
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                {selectedPlan && (personalizedPlan || dietPlans[selectedPlan])?.tips.map((tip, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 rounded-lg bg-teal-50 dark:bg-teal-900/20 border border-teal-100 dark:border-teal-800/50">
                    <div className="mt-1">
                      <Badge className="w-6 h-6 flex items-center justify-center rounded-full bg-gradient-to-r from-teal-500 to-teal-600 text-white text-xs">
                        {index + 1}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-300">{tip}</p>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Dr. iSHA Personalised Recommendations */}
          {(drIshaLoading || drIshaRec) && (
            <Card className="md:col-span-2 p-6 shadow-lg bg-white dark:bg-slate-800/50 border-teal-200 dark:border-teal-700/50">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  AI
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-slate-800 dark:text-white">Dr. iSHA Personalised Recommendations</h2>
                  <p className="text-xs text-teal-600 dark:text-teal-400">MySmart Health · AI Nutritionist · Based on the profile information available</p>
                </div>
              </div>

              {drIshaLoading ? (
                <div className="flex items-center gap-3 py-8 justify-center text-slate-500 dark:text-slate-400">
                  <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
                  <span>Dr. iSHA is analysing your health profile…</span>
                </div>
              ) : drIshaRec && (
                <>
                  {/* Condition badges */}
                  {drIshaRec.healthProfile?.hasConditions && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {drIshaRec.healthProfile.chronicConditions?.filter((c: string) => c.trim() && !/^(nothing|none|n\/a)$/i.test(c.trim())).map((c: string) => (
                        <Badge key={c} className="bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-700/50">{c}</Badge>
                      ))}
                      {drIshaRec.healthProfile.allergies?.filter((a: string) => a.trim() && !/^(nothing|none|n\/a)$/i.test(a.trim())).map((a: string) => (
                        <Badge key={a} className="bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-700/50">Allergy: {a}</Badge>
                      ))}
                      {drIshaRec.healthProfile.familyRiskFlags?.map((f: string) => (
                        <Badge key={f} className="bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-700/50">Family: {f}</Badge>
                      ))}
                    </div>
                  )}

                  {/* Recommendation text */}
                  <div className="bg-teal-50 dark:bg-teal-900/20 rounded-lg p-4 border border-teal-100 dark:border-teal-800/50">
                    <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                      <ReactMarkdown>{drIshaRec.recommendation.replace(/\b911\b/g, "112 or 108")}</ReactMarkdown>
                    </div>
                  </div>

                  <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
                    This advice is generated by Dr. iSHA AI and is for informational purposes only. Consult your physician before making dietary changes.
                  </p>
                </>
              )}
            </Card>
          )}
        </div>
      </div>
    // </MainLayout>
  );
};

export default Diet; 