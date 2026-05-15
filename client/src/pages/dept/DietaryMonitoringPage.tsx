/**
 * DietaryMonitoringPage — real-time patient diet monitoring dashboard.
 *
 * Features
 * ────────
 * • Live patient meal-slot feed with consumed / partial / refused / upcoming status
 * • Compliance heatmap (patients × meal slots)
 * • Patient drill-down drawer — 7-day trend, macro breakdown, notes
 * • Alert panel — zero-intake, below-threshold, allergy flags
 * • Ward-wise summary cards
 * • Dr. iSHA AI floating assistant
 */
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DeptStaffLayout from "@/components/hosp-dept/DeptStaffLayout";
import { dietaryNav } from "./DepartmentDashboards";
import { DietaryAIAssistant } from "@/components/dietary/DietaryAIAssistant";
import {
  Utensils, Users, AlertTriangle, CheckCircle2, Clock, Search,
  X, TrendingUp, TrendingDown, Activity, ChevronRight, ShieldCheck,
  Leaf, Droplets, Flame, Egg, Soup, Apple, Wheat, Fish,
  AlertCircle, Info, BarChart3, Bell, RefreshCw, Filter, Star,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

// ─── Types ─────────────────────────────────────────────────────────────────────

type MealStatus = "consumed" | "partial" | "refused" | "pending" | "upcoming" | "npo";

interface MealSlot {
  prescribed: string;
  status: MealStatus;
  calories: number;
  targetCalories: number;
  time: string;
  note?: string;
}

interface PatientMonitor {
  id: string;
  name: string;
  ward: string;
  bed: string;
  age: number;
  gender: string;
  dietType: string;
  targetCalories: number;
  intakeCalories: number;
  allergies: string[];
  conditions: string[];
  physician: string;
  admitDate: string;
  lastUpdated: string;
  staffNotes: string;
  meals: Record<string, MealSlot>;
  compliance7Day: number[];
  macros: { protein: number; carbs: number; fat: number; fiber: number };
  weight: number;
  npo: boolean;
}

// ─── Static monitoring data ────────────────────────────────────────────────────

const MEAL_KEYS = ["earlyMorning", "breakfast", "midMorning", "lunch", "eveningSnack", "dinner"];
const MEAL_LABELS: Record<string, string> = {
  earlyMorning: "Early",
  breakfast: "Breakfast",
  midMorning: "Mid-Morn",
  lunch: "Lunch",
  eveningSnack: "Eve Snack",
  dinner: "Dinner",
};
const MEAL_ICONS: Record<string, React.ElementType> = {
  earlyMorning: Droplets,
  breakfast: Egg,
  midMorning: Apple,
  lunch: Soup,
  eveningSnack: Wheat,
  dinner: Fish,
};

const patientsData: PatientMonitor[] = [
  {
    id: "P-1001", name: "Ramesh Kumar", ward: "ICU-3", bed: "B4", age: 62, gender: "Male",
    dietType: "Cardiac", targetCalories: 1800, intakeCalories: 720,
    allergies: [], conditions: ["Hypertension", "CHF"], physician: "Dr. Kapoor",
    admitDate: "2026-05-10", lastUpdated: "12:48 PM", npo: false,
    staffNotes: "Patient requested less salt. Accepted breakfast well. Lunch partially consumed.",
    meals: {
      earlyMorning: { prescribed: "Warm water, herbal tea",  status: "consumed", calories: 10,  targetCalories: 10,  time: "06:00" },
      breakfast:    { prescribed: "Idli (2), sambar, fruit", status: "consumed", calories: 310, targetCalories: 320, time: "08:00" },
      midMorning:   { prescribed: "Papaya, mixed nuts",      status: "partial",  calories: 90,  targetCalories: 180, time: "10:30", note: "Refused nuts" },
      lunch:        { prescribed: "Rice, dal, sabzi, curd",  status: "partial",  calories: 310, targetCalories: 520, time: "13:00", note: "Ate ~60%" },
      eveningSnack: { prescribed: "Roasted chana, tea",      status: "upcoming", calories: 0,   targetCalories: 150, time: "16:30" },
      dinner:       { prescribed: "2 chapatis, curry, dal",  status: "upcoming", calories: 0,   targetCalories: 500, time: "19:00" },
    },
    compliance7Day: [92, 88, 94, 78, 86, 90, 82],
    macros: { protein: 65, carbs: 58, fat: 72, fiber: 45 },
    weight: 72,
  },
  {
    id: "P-1002", name: "Priya Sharma", ward: "Maternity", bed: "A7", age: 28, gender: "Female",
    dietType: "Regular", targetCalories: 2200, intakeCalories: 1480,
    allergies: [], conditions: ["Pregnancy — 32 weeks"], physician: "Dr. Menon",
    admitDate: "2026-05-12", lastUpdated: "12:51 PM", npo: false,
    staffNotes: "Excellent compliance. Enjoys South Indian meals. Iron supplements given at breakfast.",
    meals: {
      earlyMorning: { prescribed: "Warm milk, dates",            status: "consumed", calories: 180, targetCalories: 180, time: "06:00" },
      breakfast:    { prescribed: "Upma, coconut chutney, milk", status: "consumed", calories: 380, targetCalories: 400, time: "08:00" },
      midMorning:   { prescribed: "Banana, almonds",             status: "consumed", calories: 195, targetCalories: 200, time: "10:30" },
      lunch:        { prescribed: "Rice, rasam, sabzi, curd",    status: "consumed", calories: 520, targetCalories: 540, time: "13:00" },
      eveningSnack: { prescribed: "Sprouts, coconut water",      status: "pending",  calories: 0,   targetCalories: 160, time: "16:30" },
      dinner:       { prescribed: "Chapati, curry, dal",         status: "upcoming", calories: 0,   targetCalories: 580, time: "19:00" },
    },
    compliance7Day: [98, 100, 96, 98, 100, 97, 99],
    macros: { protein: 88, carbs: 92, fat: 85, fiber: 78 },
    weight: 68,
  },
  {
    id: "P-1003", name: "Vikram Singh", ward: "General-2", bed: "C12", age: 45, gender: "Male",
    dietType: "Diabetic", targetCalories: 1600, intakeCalories: 540,
    allergies: ["Peanuts"], conditions: ["T2DM", "Hypertension"], physician: "Dr. Agarwal",
    admitDate: "2026-05-08", lastUpdated: "11:20 AM", npo: false,
    staffNotes: "ALLERGY: Peanuts — strictly avoided. Patient complained food too bland. Counselled on diabetic diet necessity.",
    meals: {
      earlyMorning: { prescribed: "Methi water, nuts (no peanuts)", status: "consumed", calories: 30,  targetCalories: 30,  time: "06:00" },
      breakfast:    { prescribed: "Moong dal cheela, chutney",      status: "consumed", calories: 280, targetCalories: 300, time: "08:00" },
      midMorning:   { prescribed: "Guava, walnuts",                 status: "refused",  calories: 0,   targetCalories: 120, time: "10:30", note: "Refused — said not hungry" },
      lunch:        { prescribed: "Brown rice (½ cup), dal, sabzi", status: "partial",  calories: 230, targetCalories: 450, time: "13:00", note: "Ate only dal + sabzi, refused rice" },
      eveningSnack: { prescribed: "Cucumber, buttermilk",           status: "upcoming", calories: 0,   targetCalories: 80,  time: "16:30" },
      dinner:       { prescribed: "2 chapatis, chicken curry",      status: "upcoming", calories: 0,   targetCalories: 450, time: "19:00" },
    },
    compliance7Day: [78, 72, 80, 68, 75, 82, 70],
    macros: { protein: 55, carbs: 42, fat: 60, fiber: 30 },
    weight: 88,
  },
  {
    id: "P-1004", name: "Anita Patel", ward: "Ortho", bed: "D3", age: 55, gender: "Female",
    dietType: "Low-Sodium", targetCalories: 1900, intakeCalories: 1180,
    allergies: [], conditions: ["Osteoporosis", "HTN"], physician: "Dr. Reddy",
    admitDate: "2026-05-11", lastUpdated: "01:05 PM", npo: false,
    staffNotes: "High-calcium requirements noted. Patient accepting meals well post-surgery. Morning milk supplement given.",
    meals: {
      earlyMorning: { prescribed: "Warm milk (calcium fortified)",   status: "consumed", calories: 120, targetCalories: 120, time: "06:00" },
      breakfast:    { prescribed: "Poha, sprouts, juice",            status: "consumed", calories: 340, targetCalories: 360, time: "08:00" },
      midMorning:   { prescribed: "Fruit bowl",                      status: "consumed", calories: 160, targetCalories: 160, time: "10:30" },
      lunch:        { prescribed: "Rice, dal, sabzi (low-sodium)",   status: "consumed", calories: 480, targetCalories: 520, time: "13:00" },
      eveningSnack: { prescribed: "Dhokla (low-salt), herbal tea",   status: "pending",  calories: 0,   targetCalories: 130, time: "16:30" },
      dinner:       { prescribed: "Chapati, paneer sabzi, curd",     status: "upcoming", calories: 0,   targetCalories: 560, time: "19:00" },
    },
    compliance7Day: [90, 93, 88, 95, 91, 94, 92],
    macros: { protein: 72, carbs: 68, fat: 65, fiber: 60 },
    weight: 71,
  },
  {
    id: "P-1005", name: "Suresh Reddy", ward: "Cardio-1", bed: "B8", age: 70, gender: "Male",
    dietType: "Renal", targetCalories: 1500, intakeCalories: 320,
    allergies: ["Dairy"], conditions: ["CKD Stage 3", "CAD"], physician: "Dr. Sharma",
    admitDate: "2026-05-07", lastUpdated: "10:30 AM", npo: false,
    staffNotes: "ALLERGY: Dairy — no milk, curd, paneer, ghee. Very poor appetite. Physician notified. Consider appetite stimulant.",
    meals: {
      earlyMorning: { prescribed: "Warm water, herbal tea",         status: "consumed", calories: 5,   targetCalories: 5,   time: "06:00" },
      breakfast:    { prescribed: "Rice idli, coconut chutney",     status: "partial",  calories: 180, targetCalories: 280, time: "08:00", note: "Ate 1 idli only" },
      midMorning:   { prescribed: "Apple, rice crackers",           status: "refused",  calories: 0,   targetCalories: 130, time: "10:30", note: "Nauseous" },
      lunch:        { prescribed: "Rice, dal (low-K), sabzi",       status: "partial",  calories: 135, targetCalories: 420, time: "13:00", note: "Poor appetite — ate ~30%" },
      eveningSnack: { prescribed: "Rice puffs, tea (dairy-free)",   status: "upcoming", calories: 0,   targetCalories: 100, time: "16:30" },
      dinner:       { prescribed: "Chapati, egg curry",             status: "upcoming", calories: 0,   targetCalories: 430, time: "19:00" },
    },
    compliance7Day: [62, 58, 70, 55, 65, 60, 72],
    macros: { protein: 30, carbs: 28, fat: 38, fiber: 20 },
    weight: 69,
  },
  {
    id: "P-1006", name: "Kavya Menon", ward: "General-1", bed: "A3", age: 32, gender: "Female",
    dietType: "Vegan", targetCalories: 1800, intakeCalories: 1620,
    allergies: ["Gluten"], conditions: ["Celiac Disease"], physician: "Dr. Nair",
    admitDate: "2026-05-13", lastUpdated: "01:00 PM", npo: false,
    staffNotes: "ALLERGY: Gluten — strictly gluten-free. All meals prepared in separate utensils. Patient very cooperative.",
    meals: {
      earlyMorning: { prescribed: "Coconut water",                  status: "consumed", calories: 45,  targetCalories: 45,  time: "06:00" },
      breakfast:    { prescribed: "Rice poha, sprouts, juice",      status: "consumed", calories: 320, targetCalories: 340, time: "08:00" },
      midMorning:   { prescribed: "Papaya, seeds",                  status: "consumed", calories: 175, targetCalories: 180, time: "10:30" },
      lunch:        { prescribed: "Rice, rajma, sabzi, salad",      status: "consumed", calories: 560, targetCalories: 580, time: "13:00" },
      eveningSnack: { prescribed: "Rice crackers, coconut chutney", status: "consumed", calories: 120, targetCalories: 120, time: "16:30" },
      dinner:       { prescribed: "Rice, dal, stir-fry veg",        status: "upcoming", calories: 0,   targetCalories: 500, time: "19:00" },
    },
    compliance7Day: [95, 98, 94, 97, 96, 98, 95],
    macros: { protein: 82, carbs: 90, fat: 78, fiber: 88 },
    weight: 58,
  },
  {
    id: "P-1007", name: "Ravi Prasad", ward: "ICU-1", bed: "I2", age: 68, gender: "Male",
    dietType: "Liquid", targetCalories: 1200, intakeCalories: 600,
    allergies: ["Soy"], conditions: ["Post-op bowel surgery"], physician: "Dr. Gupta",
    admitDate: "2026-05-09", lastUpdated: "12:30 PM", npo: false,
    staffNotes: "Post-surgical liquid diet. Tube-feeding initiated for 40% of caloric needs. Oral intake improving.",
    meals: {
      earlyMorning: { prescribed: "ORS / water",                    status: "consumed", calories: 0,   targetCalories: 0,   time: "06:00" },
      breakfast:    { prescribed: "Vegetable broth, juice",         status: "consumed", calories: 180, targetCalories: 200, time: "08:00" },
      midMorning:   { prescribed: "Buttermilk (soy-free), water",   status: "consumed", calories: 40,  targetCalories: 50,  time: "10:30" },
      lunch:        { prescribed: "Rice water, dal water, juice",   status: "consumed", calories: 220, targetCalories: 300, time: "13:00" },
      eveningSnack: { prescribed: "Coconut water, clear soup",      status: "pending",  calories: 0,   targetCalories: 100, time: "16:30" },
      dinner:       { prescribed: "Thin rice gruel, broth",         status: "upcoming", calories: 0,   targetCalories: 300, time: "19:00" },
    },
    compliance7Day: [100, 100, 98, 100, 100, 100, 98],
    macros: { protein: 48, carbs: 72, fat: 30, fiber: 10 },
    weight: 65,
  },
  {
    id: "P-1008", name: "Sunita Verma", ward: "Oncology", bed: "O4", age: 51, gender: "Female",
    dietType: "High-Protein", targetCalories: 2400, intakeCalories: 820,
    allergies: [], conditions: ["Breast Cancer", "Chemo — Day 3"], physician: "Dr. Mehta",
    admitDate: "2026-05-06", lastUpdated: "11:50 AM", npo: false,
    staffNotes: "Post-chemo nausea significant. Small frequent meals attempted. Protein supplement prescribed. Physician aware.",
    meals: {
      earlyMorning: { prescribed: "Ginger tea, dry toast",          status: "consumed", calories: 80,  targetCalories: 80,  time: "06:00" },
      breakfast:    { prescribed: "Egg whites (3), toast, juice",   status: "partial",  calories: 220, targetCalories: 450, time: "08:00", note: "Nauseous — ate 50%" },
      midMorning:   { prescribed: "Protein shake, banana",          status: "refused",  calories: 0,   targetCalories: 360, time: "10:30", note: "Vomiting after chemo" },
      lunch:        { prescribed: "Chicken broth, khichdi, curd",   status: "partial",  calories: 320, targetCalories: 680, time: "13:00", note: "Ate ~45%" },
      eveningSnack: { prescribed: "Protein bar, fruit",             status: "upcoming", calories: 0,   targetCalories: 280, time: "16:30" },
      dinner:       { prescribed: "Chapati, paneer, egg curry",     status: "upcoming", calories: 0,   targetCalories: 680, time: "19:00" },
    },
    compliance7Day: [72, 65, 80, 58, 70, 62, 68],
    macros: { protein: 42, carbs: 35, fat: 48, fiber: 22 },
    weight: 57,
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

const mealStatusConfig: Record<MealStatus, { label: string; bg: string; dot: string; text: string }> = {
  consumed:  { label: "Consumed",  bg: "bg-green-100 dark:bg-green-950",  dot: "bg-green-500",  text: "text-green-700 dark:text-green-400" },
  partial:   { label: "Partial",   bg: "bg-amber-100 dark:bg-amber-950",  dot: "bg-amber-500",  text: "text-amber-700 dark:text-amber-400" },
  refused:   { label: "Refused",   bg: "bg-red-100 dark:bg-red-950",      dot: "bg-red-500",    text: "text-red-700 dark:text-red-400" },
  pending:   { label: "Due Now",   bg: "bg-blue-100 dark:bg-blue-950",    dot: "bg-blue-500 animate-pulse", text: "text-blue-700 dark:text-blue-400" },
  upcoming:  { label: "Upcoming",  bg: "bg-slate-100 dark:bg-slate-800",  dot: "bg-slate-300",  text: "text-slate-500 dark:text-slate-400" },
  npo:       { label: "NPO",       bg: "bg-red-50 dark:bg-red-950/50",    dot: "bg-red-700",    text: "text-red-800 dark:text-red-300" },
};

const getCompliancePct = (p: PatientMonitor) =>
  p.npo ? 100 : Math.round((p.intakeCalories / p.targetCalories) * 100);

const getComplianceColor = (pct: number) =>
  pct >= 85 ? "text-green-600" : pct >= 60 ? "text-amber-600" : "text-red-600";

const getAlertLevel = (p: PatientMonitor): "critical" | "warning" | "info" | null => {
  const refused = Object.values(p.meals).filter(m => m.status === "refused").length;
  const pct = getCompliancePct(p);
  if (refused >= 2 || pct < 40) return "critical";
  if (refused >= 1 || pct < 65) return "warning";
  if (p.allergies.length > 0) return "info";
  return null;
};

const wardSummary = [
  { ward: "ICU",       patients: 2, avgCompliance: 91, alerts: 0 },
  { ward: "Cardio",    patients: 1, avgCompliance: 46, alerts: 2 },
  { ward: "Ortho",     patients: 1, avgCompliance: 92, alerts: 0 },
  { ward: "General",   patients: 2, avgCompliance: 79, alerts: 1 },
  { ward: "Maternity", patients: 1, avgCompliance: 98, alerts: 0 },
  { ward: "Oncology",  patients: 1, avgCompliance: 62, alerts: 1 },
];

// ─── Patient detail drawer ─────────────────────────────────────────────────────

const PatientDetailDrawer = ({ patient, onClose }: { patient: PatientMonitor; onClose: () => void }) => {
  const pct = getCompliancePct(patient);
  const alert = getAlertLevel(patient);

  const trend7Day = patient.compliance7Day.map((v, i) => ({
    day: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i],
    compliance: v,
  }));

  const macroData = [
    { subject: "Protein",   value: patient.macros.protein },
    { subject: "Carbs",     value: patient.macros.carbs },
    { subject: "Fat",       value: patient.macros.fat },
    { subject: "Fiber",     value: patient.macros.fiber },
  ];

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 35 }}
        className="fixed right-0 top-0 h-full w-full max-w-lg bg-white dark:bg-slate-900 z-50 shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-lg">
              {patient.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-lg">{patient.name}</h3>
              <p className="text-xs text-slate-500">{patient.id} · {patient.ward}, Bed {patient.bed} · {patient.age}y {patient.gender}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Alert Banner */}
          {alert && (
            <div className={`flex items-start gap-3 p-3 rounded-xl border ${
              alert === "critical" ? "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800" :
              alert === "warning"  ? "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800" :
              "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800"
            }`}>
              {alert === "critical" ? <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" /> :
               alert === "warning"  ? <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" /> :
               <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />}
              <div className="text-xs">
                <p className={`font-bold ${alert === "critical" ? "text-red-700" : alert === "warning" ? "text-amber-700" : "text-blue-700"} dark:text-current`}>
                  {alert === "critical" ? "CRITICAL — Nutritional Deficit Alert" :
                   alert === "warning"  ? "WARNING — Below Target Intake" :
                   "Allergy on File — Verify All Meals"}
                </p>
                <p className="mt-0.5 opacity-80">{patient.staffNotes}</p>
              </div>
            </div>
          )}

          {/* Today's Calorie Progress */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Today's Calorie Intake</p>
                <span className={`text-lg font-bold ${getComplianceColor(pct)}`}>{pct}%</span>
              </div>
              <div className="relative h-4 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mb-2">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(pct, 100)}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className={`h-full rounded-full ${pct >= 85 ? "bg-green-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500"}`}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>{patient.intakeCalories} kcal consumed</span>
                <span>Target: {patient.targetCalories} kcal</span>
              </div>
            </CardContent>
          </Card>

          {/* Meal-by-meal breakdown */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Today's Meal Log</p>
            <div className="space-y-2">
              {MEAL_KEYS.map(key => {
                const meal = patient.meals[key];
                const MealIcon = MEAL_ICONS[key];
                const cfg = mealStatusConfig[meal.status];
                const mealPct = meal.targetCalories > 0 ? Math.round((meal.calories / meal.targetCalories) * 100) : null;
                return (
                  <div key={key} className={`flex items-start gap-3 p-3 rounded-xl ${cfg.bg}`}>
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${cfg.text} bg-white/60 dark:bg-black/20`}>
                      <MealIcon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-800 dark:text-white">{MEAL_LABELS[key]}</p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          <span className={`text-[10px] font-semibold ${cfg.text}`}>{cfg.label}</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">{meal.prescribed}</p>
                      {meal.note && <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 italic">{meal.note}</p>}
                    </div>
                    {mealPct !== null && meal.status !== "upcoming" && meal.status !== "pending" && (
                      <div className="text-right shrink-0">
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{meal.calories} kcal</p>
                        <p className="text-[9px] text-slate-400">{mealPct}% of {meal.targetCalories}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 7-Day Compliance Trend */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-600" />
                7-Day Compliance Trend
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={trend7Day} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="compGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis domain={[40, 105]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: "10px", border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", fontSize: 12 }}
                    formatter={(v) => [`${v}%`, "Compliance"]}
                  />
                  <Area type="monotone" dataKey="compliance" stroke="#22c55e" strokeWidth={2.5} fill="url(#compGrad)" dot={{ r: 3, fill: "#22c55e" }} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Macro Breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-green-600" />
                Nutrient Targets Met (Today)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {macroData.map(({ subject, value }) => (
                <div key={subject}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600 dark:text-slate-400 font-medium">{subject}</span>
                    <span className={`font-bold ${getComplianceColor(value)}`}>{value}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${value}%` }}
                      transition={{ duration: 0.6 }}
                      className={`h-full rounded-full ${value >= 80 ? "bg-green-500" : value >= 55 ? "bg-amber-500" : "bg-red-500"}`}
                    />
                  </div>
                </div>
              ))}
              <p className="text-[10px] text-slate-400">% of daily target consumed as of last meal update</p>
            </CardContent>
          </Card>

          {/* Allergy panel */}
          {patient.allergies.length > 0 && (
            <div className="p-4 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <p className="text-xs font-bold text-red-700 dark:text-red-300">ALLERGEN ALERT — Do Not Serve</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                {patient.allergies.map(a => (
                  <Badge key={a} className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 border-0 font-semibold">{a}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Staff Notes */}
          {patient.staffNotes && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-800">
              <p className="text-[10px] font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wide mb-1">Kitchen / Nutrition Notes</p>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{patient.staffNotes}</p>
              <p className="text-[10px] text-slate-400 mt-2">Last updated: {patient.lastUpdated} · {patient.physician}</p>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm">Update Meal Status</Button>
            <Button variant="outline" className="flex-1 text-sm">Print Summary</Button>
          </div>
        </div>
      </motion.div>
    </>
  );
};

// ─── Compliance Heatmap ────────────────────────────────────────────────────────

const ComplianceHeatmap = ({ patients, onSelect }: { patients: PatientMonitor[]; onSelect: (p: PatientMonitor) => void }) => (
  <Card>
    <CardHeader className="pb-3">
      <div className="flex items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-green-600" />
          Meal Compliance Heatmap
        </CardTitle>
        <div className="flex items-center gap-3 text-[10px] text-slate-500">
          {(["consumed", "partial", "refused", "pending", "upcoming"] as MealStatus[]).map(s => (
            <div key={s} className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full ${mealStatusConfig[s].dot.split(" ")[0]}`} />
              {mealStatusConfig[s].label}
            </div>
          ))}
        </div>
      </div>
    </CardHeader>
    <CardContent className="overflow-x-auto p-0 px-5 pb-4">
      <table className="w-full text-xs min-w-[560px]">
        <thead>
          <tr>
            <th className="text-left py-2 pr-4 font-semibold text-slate-500 w-36">Patient</th>
            {MEAL_KEYS.map(k => (
              <th key={k} className="text-center py-2 px-1 font-semibold text-slate-500">{MEAL_LABELS[k]}</th>
            ))}
            <th className="text-right py-2 pl-2 font-semibold text-slate-500">Today %</th>
          </tr>
        </thead>
        <tbody>
          {patients.map((p) => {
            const pct = getCompliancePct(p);
            return (
              <tr
                key={p.id}
                onClick={() => onSelect(p)}
                className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
              >
                <td className="py-2.5 pr-4">
                  <p className="font-medium text-slate-800 dark:text-white truncate">{p.name}</p>
                  <p className="text-[10px] text-slate-400">{p.ward} · {p.bed}</p>
                </td>
                {MEAL_KEYS.map(k => {
                  const meal = p.meals[k];
                  const cfg = mealStatusConfig[meal.status];
                  return (
                    <td key={k} className="text-center py-2.5 px-1">
                      <div className={`mx-auto w-8 h-8 rounded-lg flex items-center justify-center ${cfg.bg}`}>
                        <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                      </div>
                    </td>
                  );
                })}
                <td className="text-right py-2.5 pl-2">
                  <span className={`font-bold ${getComplianceColor(pct)}`}>{pct}%</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </CardContent>
  </Card>
);

// ─── Main monitoring content ───────────────────────────────────────────────────

const DietaryMonitoringContent = () => {
  const [search, setSearch] = useState("");
  const [filterAlert, setFilterAlert] = useState<"all" | "critical" | "warning" | "info">("all");
  const [selectedPatient, setSelectedPatient] = useState<PatientMonitor | null>(null);
  const [view, setView] = useState<"list" | "heatmap">("list");

  const filtered = useMemo(() =>
    patientsData.filter(p => {
      const matchSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.ward.toLowerCase().includes(search.toLowerCase()) ||
        p.id.toLowerCase().includes(search.toLowerCase());
      const matchAlert = filterAlert === "all" || getAlertLevel(p) === filterAlert;
      return matchSearch && matchAlert;
    }),
    [search, filterAlert]
  );

  const criticalCount = patientsData.filter(p => getAlertLevel(p) === "critical").length;
  const warningCount  = patientsData.filter(p => getAlertLevel(p) === "warning").length;
  const onTrack       = patientsData.filter(p => !getAlertLevel(p)).length;

  return (
    <>
      <div className="space-y-6">

        {/* ── Hero Banner ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl p-5 text-white"
          style={{ background: "linear-gradient(135deg, #052e16 0%, #166534 45%, #15803d 75%, #16a34a 100%)" }}
        >
          <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)", backgroundSize: "28px 28px" }} />
          <div className="absolute -top-12 -right-12 w-56 h-56 bg-white/5 rounded-full" />

          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge className="bg-white/15 text-white border-white/25 text-[10px] font-semibold">Live Monitoring</Badge>
                <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              </div>
              <h2 className="text-2xl font-bold">Patient Diet Monitoring</h2>
              <p className="text-white/60 text-sm mt-0.5">Real-time meal tracking, compliance, and nutrition analytics for all inpatients</p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "On Track",   value: onTrack,       color: "text-green-300" },
                { label: "Warnings",   value: warningCount,  color: "text-amber-300" },
                { label: "Critical",   value: criticalCount, color: "text-red-300" },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center">
                  <p className={`text-3xl font-bold ${color}`}>{value}</p>
                  <p className="text-white/50 text-xs mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Mini stats */}
          <div className="relative z-10 mt-4 pt-4 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { icon: Users,        label: "Patients",          value: patientsData.length },
              { icon: CheckCircle2, label: "Meals On Track",    value: `${Math.round(patientsData.filter(p => getCompliancePct(p) >= 85).length / patientsData.length * 100)}%` },
              { icon: AlertTriangle,label: "Refused Meals",     value: patientsData.reduce((s, p) => s + Object.values(p.meals).filter(m => m.status === "refused").length, 0) },
              { icon: ShieldCheck,  label: "Allergy Patients",  value: patientsData.filter(p => p.allergies.length > 0).length },
            ].map(({ icon: Ic, label, value }) => (
              <div key={label} className="flex items-center gap-3">
                <Ic className="h-5 w-5 text-green-300 shrink-0" />
                <div>
                  <p className="text-white font-bold text-xl leading-none">{value}</p>
                  <p className="text-white/50 text-xs mt-0.5">{label}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ── Alert Strip ── */}
        {criticalCount > 0 && (
          <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl">
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 animate-pulse" />
            <div className="flex-1">
              <p className="text-sm font-bold text-red-700 dark:text-red-300">{criticalCount} Patient{criticalCount > 1 ? "s" : ""} with Critical Nutritional Deficit</p>
              <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-0.5">
                {patientsData.filter(p => getAlertLevel(p) === "critical").map(p => p.name).join(", ")} — immediate attention required
              </p>
            </div>
            <Button size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-400 shrink-0"
              onClick={() => setFilterAlert("critical")}>
              View Only
            </Button>
          </motion.div>
        )}

        {/* ── Ward Summary Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          {wardSummary.map((w) => (
            <Card key={w.ward} className={`py-3 px-4 cursor-pointer hover:shadow-md transition-shadow ${w.alerts > 0 ? "border-amber-200 dark:border-amber-800" : ""}`}>
              <p className="text-xs font-bold text-slate-600 dark:text-slate-400">{w.ward}</p>
              <p className={`text-2xl font-bold mt-1 ${getComplianceColor(w.avgCompliance)}`}>{w.avgCompliance}%</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{w.patients} patient{w.patients > 1 ? "s" : ""}</p>
              {w.alerts > 0 && (
                <div className="flex items-center gap-1 mt-1">
                  <div className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                  <span className="text-[10px] text-amber-600 font-semibold">{w.alerts} alert</span>
                </div>
              )}
            </Card>
          ))}
        </div>

        {/* ── Controls ── */}
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex gap-3 flex-1 min-w-0">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input placeholder="Search patient, ward, ID..." value={search} onChange={e => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm" />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex gap-1.5">
              {([
                { key: "all",      label: "All" },
                { key: "critical", label: "Critical" },
                { key: "warning",  label: "Warning" },
                { key: "info",     label: "Allergy" },
              ] as const).map(({ key, label }) => (
                <button key={key} onClick={() => setFilterAlert(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterAlert === key ? "bg-green-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => setView("list")} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${view === "list" ? "bg-green-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}>
              List
            </button>
            <button onClick={() => setView("heatmap")} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${view === "heatmap" ? "bg-green-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}>
              Heatmap
            </button>
          </div>
        </div>

        {/* ── Patient List / Heatmap ── */}
        {view === "heatmap" ? (
          <ComplianceHeatmap patients={filtered} onSelect={setSelectedPatient} />
        ) : (
          <div className="space-y-3">
            {filtered.map((patient, i) => {
              const pct = getCompliancePct(patient);
              const alert = getAlertLevel(patient);
              return (
                <motion.div
                  key={patient.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <Card
                    className={`cursor-pointer hover:shadow-md transition-all duration-200 ${
                      alert === "critical" ? "border-red-200 dark:border-red-800" :
                      alert === "warning"  ? "border-amber-200 dark:border-amber-800" : ""
                    }`}
                    onClick={() => setSelectedPatient(patient)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        {/* Avatar + Info */}
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                          {patient.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-slate-800 dark:text-white text-sm">{patient.name}</p>
                            <Badge className="text-[10px] bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-0">{patient.dietType}</Badge>
                            {patient.allergies.map(a => (
                              <Badge key={a} className="text-[9px] bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400 border-0">⚠ {a}</Badge>
                            ))}
                            {alert && (
                              <Badge className={`text-[9px] border-0 font-semibold ${
                                alert === "critical" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" :
                                alert === "warning"  ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" :
                                "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                              }`}>
                                {alert === "critical" ? "CRITICAL" : alert === "warning" ? "WARNING" : "ALLERGY"}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{patient.id} · {patient.ward}, Bed {patient.bed} · {patient.age}y · {patient.physician}</p>

                          {/* Meal Slot Row */}
                          <div className="flex gap-2 mt-3 flex-wrap">
                            {MEAL_KEYS.map(key => {
                              const meal = patient.meals[key];
                              const MealIcon = MEAL_ICONS[key];
                              const cfg = mealStatusConfig[meal.status];
                              return (
                                <div key={key} className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-xl ${cfg.bg}`}>
                                  <MealIcon className={`h-3.5 w-3.5 ${cfg.text}`} />
                                  <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                  <span className={`text-[9px] font-medium ${cfg.text}`}>{MEAL_LABELS[key]}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Calorie Progress */}
                        <div className="text-right shrink-0 min-w-[100px]">
                          <p className={`text-2xl font-bold ${getComplianceColor(pct)}`}>{pct}%</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">of {patient.targetCalories} kcal</p>
                          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mt-0.5">{patient.intakeCalories} consumed</p>
                          <div className="mt-2 h-1.5 w-24 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden ml-auto">
                            <div
                              className={`h-full rounded-full ${pct >= 85 ? "bg-green-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500"}`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-end gap-1 mt-2 text-[10px] text-slate-400">
                            <Clock className="h-3 w-3" />
                            {patient.lastUpdated}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
            {filtered.length === 0 && (
              <div className="py-16 flex flex-col items-center gap-3 text-slate-400">
                <Users className="h-10 w-10 opacity-30" />
                <p className="text-sm font-medium">No patients match your filters</p>
              </div>
            )}
          </div>
        )}

        {/* ── Weekly Compliance Chart ── */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-green-600" />
                Today's Calorie Intake vs. Target — All Patients
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={patientsData.map(p => ({
                  name: p.name.split(" ")[0],
                  intake: p.intakeCalories,
                  target: p.targetCalories,
                  pct: getCompliancePct(p),
                }))}
                margin={{ top: 4, right: 4, left: -10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: "10px", border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", fontSize: 12 }}
                  formatter={(v, name) => [name === "intake" ? `${v} kcal consumed` : `${v} kcal target`, ""]}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="target" name="Target" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
                <Bar dataKey="intake" name="Intake" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Patient Drawer */}
      <AnimatePresence>
        {selectedPatient && (
          <PatientDetailDrawer patient={selectedPatient} onClose={() => setSelectedPatient(null)} />
        )}
      </AnimatePresence>

      <DietaryAIAssistant />
    </>
  );
};

// ─── Exported page ─────────────────────────────────────────────────────────────

export const DietaryMonitoring = () => (
  <DeptStaffLayout
    deptKey="dietary"
    deptName="Dietary Services"
    badgeLabel="DIETARY"
    loginPath="/dietary/login"
    DeptIcon={Utensils}
    navSections={dietaryNav}
    title="Patient Monitoring"
    subtitle="Real-time diet tracking & compliance"
  >
    <DietaryMonitoringContent />
  </DeptStaffLayout>
);
