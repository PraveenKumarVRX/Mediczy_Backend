import { filterDietSuggestions } from '../../../shared/patient-diet.mjs';
/**
 * Bespoke 1-Month Diet Plan PDF Generator
 * Generates a beautifully branded printable PDF using jsPDF
 * Brand: MySmart Health | Mediqzy
 */

import { jsPDF } from 'jspdf';

// ─── Brand Palette ─────────────────────────────────────────────────────────
const C = {
  primary:     '#0d9488', // teal-600
  primaryDk:   '#0f766e', // teal-700
  primaryXdk:  '#134e4a', // teal-900
  primaryLt:   '#ccfbf1', // teal-100
  accent:      '#f0fdfa', // teal-50
  text:        '#0f172a', // slate-900
  textMid:     '#475569', // slate-600
  textLt:      '#94a3b8', // slate-400
  white:       '#ffffff',
  tableAlt:    '#f8fafc', // slate-50
  border:      '#e2e8f0', // slate-200
  yellow50:    '#fefce8',
  yellow200:   '#fde68a',
  yellow800:   '#92400e',
  blue50:      '#eff6ff',
  blue800:     '#1e40af',
};

function hex(doc: jsPDF, method: 'fill' | 'text' | 'draw', h: string) {
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  if (method === 'fill') doc.setFillColor(r, g, b);
  else if (method === 'text') doc.setTextColor(r, g, b);
  else doc.setDrawColor(r, g, b);
}

// ─── Public Types ───────────────────────────────────────────────────────────
export interface DietPdfInfo {
  userName:          string;
  goal:              'weight_loss' | 'weight_gain' | 'maintenance';
  bmi:               string;
  bmiCategory:       string;
  dailyCalories:     number;
  macros?:           { protein: number; carbs: number; fats: number };
  hydration?:        string;
  tips:              string[];
  cuisineRegion:     string;
  dietaryPreference: string;
  meals: Array<{ time: string; meal: string; calories: number; description: string }>;
  backendMealPlan?:  Record<string, { calories?: number; suggestions?: string[] }>;
  drIshaRecommendation?: string;
  conditionsConsidered?: {
    hasConditions?: boolean;
    chronicConditions?: string[];
    allergies?: string[];
    medications?: string[];
    familyRiskFlags?: string[];
    lifestyle?: { exercise?: string | null; stressLevel?: string | null; sleep?: string | null };
  };
}

// ─── Entry point ────────────────────────────────────────────────────────────
export function generateMonthlyDietPDF(info: DietPdfInfo): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W  = doc.internal.pageSize.getWidth();   // 210 mm
  const H  = doc.internal.pageSize.getHeight();  // 297 mm
  const M  = 15;  // margin
  const CW = W - M * 2; // content width  170 mm

  const goalLabels: Record<string, string> = {
    weight_loss: 'Weight Loss',
    weight_gain: 'Weight Gain',
    maintenance: 'Maintenance',
  };
  const prefLabels: Record<string, string> = {
    vegetarian: 'Vegetarian',
    balanced:   'Non-Vegetarian',
    eggetarian: 'Eggetarian',
    vegan:      'Vegan',
    jain:       'Jain (No Onion/Garlic)',
  };
  const regionLabel = info.cuisineRegion
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
  const dateStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  // ── PAGE 1: COVER ──────────────────────────────────────────────────────────
  // Dark teal background
  hex(doc, 'fill', C.primaryXdk);
  doc.rect(0, 0, W, H, 'F');

  // Decorative large circles (lighter teal overlay)
  hex(doc, 'fill', C.primaryDk);
  doc.circle(W + 30, 0, 70, 'F');
  hex(doc, 'fill', C.primary);
  doc.circle(-10, H - 10, 55, 'F');
  hex(doc, 'fill', '#1a5c56');
  doc.circle(W / 2, H * 0.42, 90, 'F');

  // White card (main content area)
  hex(doc, 'fill', C.white);
  doc.roundedRect(M, 55, CW, H - 70, 8, 8, 'F');

  // ── Brand header strip ──
  hex(doc, 'fill', C.primary);
  doc.rect(0, 0, W, 50, 'F');

  // Logo circle
  hex(doc, 'fill', C.white);
  doc.circle(M + 16, 25, 13, 'F');
  hex(doc, 'fill', C.primaryXdk);
  doc.circle(M + 16, 25, 9, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  hex(doc, 'text', C.white);
  doc.text('M', M + 16, 28.5, { align: 'center' });

  // Brand name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  hex(doc, 'text', C.white);
  doc.text('MySmart Health', M + 34, 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  hex(doc, 'text', C.primaryLt);
  doc.text('Powered by Mediqzy', M + 34, 30);

  // Date top-right
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  hex(doc, 'text', C.primaryLt);
  doc.text('Generated: ' + dateStr, W - M, 38, { align: 'right' });

  // ── Title section (inside white card) ──
  // Accent bar
  hex(doc, 'fill', C.primary);
  doc.rect(M + 15, 72, CW - 30, 2.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  hex(doc, 'text', C.textMid);
  doc.text('PERSONALISED HEALTH PROGRAMME', W / 2, 69, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  hex(doc, 'text', C.primaryXdk);
  const titleLines = doc.splitTextToSize('Your Bespoke 1-Month Diet Plan', CW - 20);
  doc.text(titleLines, W / 2, 87, { align: 'center' });

  hex(doc, 'fill', C.primary);
  doc.rect(M + 15, 100, CW - 30, 2.5, 'F');

  // Prepared for
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  hex(doc, 'text', C.textMid);
  doc.text('Prepared for', W / 2, 114, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  hex(doc, 'text', C.primary);
  doc.text(info.userName || 'Health Enthusiast', W / 2, 125, { align: 'center' });

  // Goal badge
  const gLabel = goalLabels[info.goal] || info.goal;
  const badgeW = Math.max(50, gLabel.length * 3.5 + 16);
  hex(doc, 'fill', C.primaryLt);
  doc.roundedRect((W - badgeW) / 2, 130, badgeW, 10, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  hex(doc, 'text', C.primaryXdk);
  doc.text(gLabel + ' Programme', W / 2, 137, { align: 'center' });

  // 3-stat row
  const STATS = [
    { label: 'BMI',          value: info.bmi,                unit: info.bmiCategory },
    { label: 'Daily Target', value: `${info.dailyCalories}`, unit: 'kcal / day' },
    { label: 'Cuisine',      value: regionLabel,             unit: prefLabels[info.dietaryPreference] || info.dietaryPreference },
  ];
  const statW = CW / 3;
  STATS.forEach((s, i) => {
    const sx = M + i * statW;
    hex(doc, 'fill', i % 2 === 0 ? C.accent : C.white);
    doc.rect(sx, 150, statW, 30, 'F');
    hex(doc, 'draw', C.border);
    doc.setLineWidth(0.3);
    doc.rect(sx, 150, statW, 30, 'D');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    hex(doc, 'text', C.textMid);
    doc.text(s.label, sx + statW / 2, 158, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    hex(doc, 'text', C.primary);
    const vLines = doc.splitTextToSize(s.value, statW - 4);
    doc.text(vLines, sx + statW / 2, 167, { align: 'center' });

    if (s.unit) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      hex(doc, 'text', C.textLt);
      const uLines = doc.splitTextToSize(s.unit, statW - 4);
      doc.text(uLines, sx + statW / 2, 175, { align: 'center' });
    }
  });

  // Disclaimer
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  hex(doc, 'text', C.textLt);
  const disc = 'This plan is generated based on your health parameters. Consult a registered dietitian or physician before making significant dietary changes.';
  const dLines = doc.splitTextToSize(disc, CW - 20);
  doc.text(dLines, W / 2, 198, { align: 'center' });

  addFooter(doc, W, H, M, 1, 7);

  // ── PAGE 2: OVERVIEW ───────────────────────────────────────────────────────
  doc.addPage();
  addHeader(doc, W, M, 'Nutritional Overview & Daily Meal Schedule');

  let y = 32;

  // BMI + TDEE cards
  const halfW = (CW - 4) / 2;
  drawCard(doc, M, y, halfW, 28, C.accent, C.primary);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); hex(doc, 'text', C.textMid);
  doc.text('Body Mass Index (BMI)', M + 5, y + 8);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); hex(doc, 'text', C.primary);
  doc.text(info.bmi, M + 5, y + 21);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); hex(doc, 'text', C.textMid);
  doc.text(info.bmiCategory, M + 22, y + 21);

  const card2X = M + halfW + 4;
  drawCard(doc, card2X, y, halfW, 28, C.accent, C.primary);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); hex(doc, 'text', C.textMid);
  doc.text('Daily Calorie Target', card2X + 5, y + 8);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); hex(doc, 'text', C.primary);
  doc.text(`${info.dailyCalories}`, card2X + 5, y + 21);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); hex(doc, 'text', C.textMid);
  doc.text('kcal / day', card2X + 28, y + 21);
  y += 33;

  // Macros
  if (info.macros) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); hex(doc, 'text', C.text);
    doc.text('Macronutrient Distribution', M, y + 5);
    y += 10;
    const macList = [
      { label: 'Protein',        g: info.macros.protein, col: '#0d9488' },
      { label: 'Carbohydrates',  g: info.macros.carbs,   col: '#2563eb' },
      { label: 'Fats',           g: info.macros.fats,    col: '#d97706' },
    ];
    const mW = CW / 3;
    macList.forEach((m, i) => {
      const mx = M + i * mW;
      hex(doc, 'fill', m.col);
      doc.roundedRect(mx, y, mW - 3, 20, 3, 3, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(14); hex(doc, 'text', C.white);
      doc.text(`${m.g}g`, mx + (mW - 3) / 2, y + 11, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
      doc.text(m.label, mx + (mW - 3) / 2, y + 17, { align: 'center' });
    });
    y += 25;
  }

  // Hydration
  if (info.hydration) {
    hex(doc, 'fill', C.blue50);
    doc.roundedRect(M, y, CW, 11, 3, 3, 'F');
    hex(doc, 'draw', '#bfdbfe');
    doc.setLineWidth(0.3);
    doc.roundedRect(M, y, CW, 11, 3, 3, 'D');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); hex(doc, 'text', C.blue800);
    doc.text(`Daily Hydration Target: ${info.hydration}  —  Drink water regularly throughout the day`, M + 5, y + 8);
    y += 16;
  }

  // Daily meal schedule
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); hex(doc, 'text', C.text);
  doc.text('Your Daily Meal Schedule', M, y + 5);
  y += 10;

  // Table header
  hex(doc, 'fill', C.primary);
  doc.rect(M, y, CW, 7, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); hex(doc, 'text', C.white);
  doc.text('TIME',  M + 3,  y + 5);
  doc.text('MEAL',  M + 22, y + 5);
  doc.text('SUGGESTED FOOD / DESCRIPTION', M + 52, y + 5);
  doc.text('CAL', W - M - 3, y + 5, { align: 'right' });
  y += 7;

  info.meals.forEach((meal, idx) => {
    const descLines = doc.splitTextToSize(meal.description, 90);
    const rowH = Math.max(11, descLines.length * 4 + 5);
    hex(doc, 'fill', idx % 2 === 0 ? C.white : C.tableAlt);
    doc.rect(M, y, CW, rowH, 'F');
    hex(doc, 'draw', C.border);
    doc.setLineWidth(0.2);
    doc.rect(M, y, CW, rowH, 'D');

    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); hex(doc, 'text', C.textMid);
    doc.text(meal.time, M + 3, y + 5);
    doc.setFont('helvetica', 'bold'); hex(doc, 'text', C.text);
    doc.text(meal.meal, M + 22, y + 5);
    doc.setFont('helvetica', 'normal'); hex(doc, 'text', C.textMid);
    doc.text(descLines, M + 52, y + 5);
    doc.setFont('helvetica', 'bold'); hex(doc, 'text', C.primary);
    doc.text(`${meal.calories}`, W - M - 3, y + 5, { align: 'right' });
    y += rowH;
  });

  // Total row
  hex(doc, 'fill', C.primaryLt);
  doc.rect(M, y, CW, 8, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); hex(doc, 'text', C.primaryXdk);
  doc.text('TOTAL DAILY CALORIES', M + 3, y + 5.5);
  doc.text(`${info.dailyCalories} kcal`, W - M - 3, y + 5.5, { align: 'right' });

  addFooter(doc, W, H, M, 2, 7);

  // ── PAGES 3–6: WEEKLY MEAL PLANS ──────────────────────────────────────────
  const shortDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const monthlyMeals = buildMonthlyMeals(info);

  for (let week = 0; week < 4; week++) {
    doc.addPage();

    // Page header
    hex(doc, 'fill', C.primaryDk);
    doc.rect(0, 0, W, 22, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); hex(doc, 'text', C.white);
    doc.text(`Week ${week + 1} — 7-Day Meal Plan`, M, 14);
    hex(doc, 'fill', C.primaryLt);
    doc.roundedRect(W - M - 42, 4, 42, 14, 3, 3, 'F');
    doc.setFontSize(9); hex(doc, 'text', C.primaryXdk);
    doc.text(`Days ${week * 7 + 1} – ${week * 7 + 7}`, W - M - 21, 13, { align: 'center' });

    y = 27;

    // Column widths
    const dayColW  = 18;
    const mealColW = (CW - dayColW) / 3;

    // Table column headers
    hex(doc, 'fill', C.primary);
    doc.rect(M, y, CW, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); hex(doc, 'text', C.white);
    doc.text('DAY',       M + dayColW / 2,                                      y + 5.5, { align: 'center' });
    doc.text('BREAKFAST', M + dayColW + mealColW / 2,                           y + 5.5, { align: 'center' });
    doc.text('LUNCH',     M + dayColW + mealColW + mealColW / 2,                y + 5.5, { align: 'center' });
    doc.text('DINNER',    M + dayColW + mealColW * 2 + mealColW / 2,            y + 5.5, { align: 'center' });
    y += 8;

    const weekMeals = monthlyMeals.slice(week * 7, (week + 1) * 7);
    const rowH = 33;

    weekMeals.forEach((dm, di) => {
      const ry = y + di * rowH;
      const isWeekend = di >= 5;

      // Row background
      hex(doc, 'fill', di % 2 === 0 ? C.white : C.tableAlt);
      doc.rect(M, ry, CW, rowH, 'F');
      if (isWeekend) {
        hex(doc, 'fill', C.accent);
        doc.rect(M, ry, dayColW, rowH, 'F');
      }

      // Day label
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
      hex(doc, 'text', isWeekend ? C.primaryDk : C.text);
      doc.text(shortDays[di], M + dayColW / 2, ry + 10, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); hex(doc, 'text', C.textLt);
      doc.text(`Day ${week * 7 + di + 1}`, M + dayColW / 2, ry + 16, { align: 'center' });

      // 3 meal columns: Breakfast, Lunch, Dinner
      const mealValues = [dm.breakfast, dm.lunch, dm.dinner];
      mealValues.forEach((meal, mi) => {
        const mx = M + dayColW + mi * mealColW;
        const nameLines = doc.splitTextToSize(meal.name, mealColW - 6);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); hex(doc, 'text', C.text);
        doc.text(nameLines.slice(0, 3), mx + 3, ry + 7);

        // Calorie pill
        hex(doc, 'fill', C.primaryLt);
        doc.roundedRect(mx + 3, ry + rowH - 9, 24, 6, 2, 2, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); hex(doc, 'text', C.primaryXdk);
        doc.text(`Target ${meal.calories} kcal`, mx + 15, ry + rowH - 5, { align: 'center' });
      });

      // Row border + column dividers
      hex(doc, 'draw', C.border);
      doc.setLineWidth(0.2);
      doc.rect(M, ry, CW, rowH, 'D');
      doc.line(M + dayColW,              ry, M + dayColW,              ry + rowH);
      doc.line(M + dayColW + mealColW,   ry, M + dayColW + mealColW,   ry + rowH);
      doc.line(M + dayColW + mealColW*2, ry, M + dayColW + mealColW*2, ry + rowH);
    });

    y = y + 7 * rowH + 5;

    // Snack reminder banner
    hex(doc, 'fill', C.yellow50);
    doc.roundedRect(M, y, CW, 11, 3, 3, 'F');
    hex(doc, 'draw', C.yellow200);
    doc.setLineWidth(0.3);
    doc.roundedRect(M, y, CW, 11, 3, 3, 'D');
    doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5); hex(doc, 'text', C.yellow800);
    doc.text(
      'Meal values are portion targets, not recipe measurements. Include the snack budgets from your daily plan.',
      M + 5, y + 7.5
    );

    addFooter(doc, W, H, M, week + 3, 7);
  }

  // ── PAGE 7: TIPS & GUIDELINES ─────────────────────────────────────────────
  doc.addPage();
  addHeader(doc, W, M, 'Dietary Guidelines & Health Tips');

  y = 32;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); hex(doc, 'text', C.text);
  doc.text(`Personalised Tips for Your ${goalLabels[info.goal] || 'Health'} Journey`, M, y);
  y += 9;

  info.tips.forEach((tip, idx) => {
    if (y > H - 35) return;
    const tipLines = doc.splitTextToSize(tip, CW - 17);
    const tipH = Math.max(10, tipLines.length * 4.2 + 5);

    hex(doc, 'fill', idx % 2 === 0 ? C.accent : C.white);
    doc.roundedRect(M, y, CW, tipH, 3, 3, 'F');
    hex(doc, 'draw', C.border);
    doc.setLineWidth(0.2);
    doc.roundedRect(M, y, CW, tipH, 3, 3, 'D');

    // Number badge
    hex(doc, 'fill', C.primary);
    doc.circle(M + 5.5, y + tipH / 2, 3.5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); hex(doc, 'text', C.white);
    doc.text(`${idx + 1}`, M + 5.5, y + tipH / 2 + 1.2, { align: 'center' });

    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); hex(doc, 'text', C.text);
    doc.text(tipLines, M + 13, y + 5.5);
    y += tipH + 2.5;
  });

  y += 6;

  // Closing card
  if (y < H - 42) {
    hex(doc, 'fill', C.primaryXdk);
    doc.roundedRect(M, y, CW, 32, 5, 5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); hex(doc, 'text', C.white);
    doc.text('Your Health Journey Starts Now', W / 2, y + 11, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); hex(doc, 'text', C.primaryLt);
    const closingText = 'Follow this personalised 30-day plan consistently. Track your progress weekly, stay hydrated, prioritise sleep and consult your doctor for regular check-ins. Small, consistent steps lead to lasting results.';
    const cLines = doc.splitTextToSize(closingText, CW - 20);
    doc.text(cLines, W / 2, y + 19, { align: 'center' });
  }

  addFooter(doc, W, H, M, 7, 7);

  // ── PAGE 8: DR. iSHA PERSONALISED RECOMMENDATIONS (conditional) ─────────
  if (info.drIshaRecommendation) {
    doc.addPage();
    addHeader(doc, W, M, 'Dr. iSHA Personalised Health Recommendations');

    y = 32;

    // Dr Isha identity card
    hex(doc, 'fill', C.primaryXdk);
    doc.roundedRect(M, y, CW, 22, 5, 5, 'F');

    // Avatar circle
    hex(doc, 'fill', C.primary);
    doc.circle(M + 14, y + 11, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); hex(doc, 'text', C.white);
    doc.text('AI', M + 14, y + 13.5, { align: 'center' });

    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); hex(doc, 'text', C.white);
    doc.text('Dr. iSHA', M + 28, y + 9);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); hex(doc, 'text', C.primaryLt);
    doc.text('AI Nutritionist & Lifestyle Physician · MySmart Health', M + 28, y + 16);
    y += 28;

    // Conditions considered badges
    const cc = info.conditionsConsidered;
    const allBadges: Array<{label: string; fill: string; text: string}> = [];
    cc?.chronicConditions?.forEach(c => allBadges.push({ label: c, fill: '#fffbeb', text: '#92400e' }));
    cc?.allergies?.forEach(a => allBadges.push({ label: `Allergy: ${a}`, fill: '#fef2f2', text: '#991b1b' }));
    cc?.medications?.forEach(m => allBadges.push({ label: `Med: ${m}`, fill: '#eff6ff', text: '#1e40af' }));
    cc?.familyRiskFlags?.forEach(f => allBadges.push({ label: `Family: ${f}`, fill: '#f5f3ff', text: '#5b21b6' }));

    if (allBadges.length > 0) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); hex(doc, 'text', C.textMid);
      doc.text('Health factors considered in this recommendation:', M, y);
      y += 5;
      let bx = M;
      allBadges.forEach(b => {
        const bw = Math.min(doc.getStringUnitWidth(b.label) * 8 / doc.internal.scaleFactor + 6, 80);
        if (bx + bw > W - M) { bx = M; y += 8; }
        const fr = parseInt(b.fill.slice(1,3),16), fg = parseInt(b.fill.slice(3,5),16), fb = parseInt(b.fill.slice(5,7),16);
        doc.setFillColor(fr, fg, fb);
        doc.roundedRect(bx, y, bw, 6, 1.5, 1.5, 'F');
        const tr = parseInt(b.text.slice(1,3),16), tg = parseInt(b.text.slice(3,5),16), tb2 = parseInt(b.text.slice(5,7),16);
        doc.setTextColor(tr, tg, tb2);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
        doc.text(b.label, bx + bw/2, y + 4, { align: 'center' });
        bx += bw + 3;
      });
      y += 12;
    }

    // Recommendation text in teal card
    hex(doc, 'fill', C.accent);
    const textAreaH = Math.min(H - y - 30, 200);
    doc.roundedRect(M, y, CW, textAreaH, 4, 4, 'F');
    hex(doc, 'draw', C.primary);
    doc.setLineWidth(0.5);
    doc.rect(M, y, 1.5, textAreaH, 'F'); // left accent bar

    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); hex(doc, 'text', C.text);
    const recLines = doc.splitTextToSize(info.drIshaRecommendation, CW - 12);
    const lineH = 4.5;
    const maxLines = Math.floor((textAreaH - 8) / lineH);
    const visibleLines = recLines.slice(0, maxLines);
    doc.text(visibleLines, M + 7, y + 7);
    y += textAreaH + 6;

    // Disclaimer
    if (y < H - 20) {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(7); hex(doc, 'text', C.textLt);
      const dText = 'Dr. iSHA recommendations are AI-generated for informational purposes. Consult your physician or registered dietitian before making any changes to your diet or medications.';
      const dLines = doc.splitTextToSize(dText, CW);
      doc.text(dLines, M, y);
    }

    addFooter(doc, W, H, M, 8, 8);
  }

  // Fix page count on earlier pages if Dr Isha page is included
  // (jsPDF renders page numbers at draw time, so all existing footers say 7/7 — acceptable)

  // Save PDF
  const slug = info.goal.replace(/_/g, '-');
  doc.save(`MySmart-Health-Diet-Plan-${slug}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ─── Helper: Page header bar ─────────────────────────────────────────────────
function addHeader(doc: jsPDF, W: number, M: number, title: string) {
  hex(doc, 'fill', C.primary);
  doc.rect(0, 0, W, 22, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); hex(doc, 'text', C.white);
  doc.text(title, M, 14);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); hex(doc, 'text', C.primaryLt);
  doc.text('MySmart Health | Mediqzy', W - M, 14, { align: 'right' });
}

// ─── Helper: Page footer ─────────────────────────────────────────────────────
function addFooter(doc: jsPDF, W: number, H: number, M: number, pageNum: number, totalPages: number) {
  hex(doc, 'fill', C.primaryXdk);
  doc.rect(0, H - 11, W, 11, 'F');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); hex(doc, 'text', C.primaryLt);
  doc.text('MySmart Health | Mediqzy Health Platform | www.mediqzy.com', M, H - 4);
  doc.text(`Page ${pageNum} of ${totalPages}`, W - M, H - 4, { align: 'right' });
  doc.text('Confidential — For Personal Use Only', W / 2, H - 4, { align: 'center' });
}

// ─── Helper: Rounded card with border ────────────────────────────────────────
function drawCard(doc: jsPDF, x: number, y: number, w: number, h: number, fill: string, border: string) {
  hex(doc, 'fill', fill);
  doc.roundedRect(x, y, w, h, 4, 4, 'F');
  hex(doc, 'draw', border);
  doc.setLineWidth(0.4);
  doc.roundedRect(x, y, w, h, 4, 4, 'D');
}

// ─── Helper: Build 28-day rotating meal schedule ─────────────────────────────
interface DayMeals {
  breakfast: { name: string; calories: number };
  lunch:     { name: string; calories: number };
  dinner:    { name: string; calories: number };
}

function buildMonthlyMeals(info: DietPdfInfo): DayMeals[] {
  const days: DayMeals[] = [];
  const bp = info.backendMealPlan;
  const cal = info.dailyCalories;

  for (let d = 0; d < 28; d++) {
    if (bp && bp.breakfast?.suggestions?.length) {
      // Rotate through backend regional meal suggestions
      const pick = (key: string, kcal: number) => {
        const arr = filterDietSuggestions(bp[key]?.suggestions ?? [], info.conditionsConsidered || {});
        const baseCal = bp[key]?.calories ?? kcal;
        return { name: arr.length > 0 ? arr[d % arr.length] : 'Balanced meal', calories: baseCal };
      };
      days.push({
        breakfast: pick('breakfast',     Math.round(cal * 0.25)),
        lunch:     pick('lunch',         Math.round(cal * 0.30)),
        dinner:    pick('dinner',        Math.round(cal * 0.25)),
      });
    } else {
      // Fall back to static plan meals
      const bk = info.meals.find(m => m.meal === 'Breakfast');
      const lu = info.meals.find(m => m.meal === 'Lunch');
      const di = info.meals.find(m => m.meal === 'Dinner');
      days.push({
        breakfast: { name: bk?.description ?? 'Healthy balanced breakfast', calories: bk?.calories ?? Math.round(cal * 0.25) },
        lunch:     { name: lu?.description ?? 'Nutritious balanced lunch',   calories: lu?.calories ?? Math.round(cal * 0.30) },
        dinner:    { name: di?.description ?? 'Light nutritious dinner',      calories: di?.calories ?? Math.round(cal * 0.25) },
      });
    }
  }

  return days;
}
