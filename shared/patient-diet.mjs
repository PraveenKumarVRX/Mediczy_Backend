// General meal-planning filters, not a treatment plan or allergy guarantee.
export function dietRiskFlags(profile = {}) {
  const text = JSON.stringify(profile).toLowerCase();
  return { diabetes: /diabet|prediabet/.test(text), bloodPressure: /hypertens|high blood pressure/.test(text) };
}

export function filterDietSuggestions(suggestions = [], profile = {}) {
  const risk = dietRiskFlags(profile);
  return suggestions.filter(text => {
    if (risk.diabetes && /jaggery|sweet|sugar|laddu|rosogolla|milkshake|bun maska|juice|halwa|churma/i.test(text)) return false;
    if ((risk.diabetes || risk.bloodPressure) && /butter|makhani|rogan josh|keema|korma|pakora|pakoda|samosa|bhature|kachori|pickle|bhujia|gathiya|ganthia|mathri|fried/i.test(text)) return false;
    return true;
  });
}

export function scaleMealBudgets(meals, target) {
  const total = meals.reduce((sum, meal) => sum + Number(meal.calories || 0), 0);
  if (!total || !Number.isFinite(target) || target <= 0) return meals;
  let allocated = 0;
  return meals.map((meal, index) => {
    const calories = index === meals.length - 1 ? Math.round(target) - allocated : Math.round(Number(meal.calories) / total * target);
    allocated += calories;
    return { ...meal, calories };
  });
}

export function isDietAdvice(text) {
  return typeof text === 'string' && /diet|nutrition|meal|protein|vegetable/i.test(text) && !/thank you for sharing your health concern|understanding your concern|temporarily unavailable|unable to.*(respond|process)|call 911/i.test(text);
}
