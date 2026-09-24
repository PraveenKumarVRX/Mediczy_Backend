import express from 'express';
import jwt from 'jsonwebtoken';
import { loginDietary } from '../../controllers/dept/dietary.controller.js';
import { JWT_CONFIG } from '../../config/auth.config.js';
import llmProvider from '../../services/ai-brain/llm-provider.js';
import { connectPostgres } from '../../db/postgres.js';
import { safeRouter } from '../../utils/safeRouter.js';
import { dietaryScope } from '../../services/dept-tenant-scope.service.js';
import { orgFromToken, orgRequiredResponse } from '../../services/tenant-scope.service.js';
import { actorFrom, decideOperationsApproval, ensureOperationsGovernanceTables, listOperationsApprovals, listOperationsAudit, recordOperationsAudit, requestOperationsApproval } from '../../services/operations-governance.service.js';

const router = safeRouter(express.Router());

// ─── Auth middleware for dietary staff token ───────────────────────────────────

const authDietary = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, error: 'Dietary token required' });
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_CONFIG.SECRET);
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid or expired dietary token' });
  }
  // Tenant isolation (WP-0.5): bound to the hospital in the token; a token without one is refused.
  const org = orgFromToken(decoded);
  if (!org) return res.status(403).json(orgRequiredResponse);
  req.dietaryUser = decoded;
  req.dietaryOrgId = org;
  next();
};

const ensureDietaryTablesRaw = async () => {
  const db = await connectPostgres();
  await db.query(`
    CREATE TABLE IF NOT EXISTS dietary_orders (
      id SERIAL PRIMARY KEY,
      order_number VARCHAR(80) UNIQUE NOT NULL,
      admission_id VARCHAR(80),
      patient_id VARCHAR(80),
      patient_name VARCHAR(160) NOT NULL,
      ward VARCHAR(120),
      bed VARCHAR(40),
      diet_type VARCHAR(120) NOT NULL,
      allergies TEXT[] NOT NULL DEFAULT '{}',
      restrictions TEXT,
      calories INTEGER,
      priority VARCHAR(24) NOT NULL DEFAULT 'normal',
      status VARCHAR(24) NOT NULL DEFAULT 'pending',
      physician VARCHAR(160),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS dietary_templates (
      id SERIAL PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      diet_type VARCHAR(120) NOT NULL,
      calories INTEGER,
      meal_plan JSONB NOT NULL DEFAULT '{}'::jsonb,
      restrictions TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS dietary_counselling (
      id SERIAL PRIMARY KEY,
      patient_id VARCHAR(80),
      order_id INTEGER REFERENCES dietary_orders(id) ON DELETE SET NULL,
      summary TEXT NOT NULL,
      instructions TEXT,
      created_by VARCHAR(160),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await ensureOperationsGovernanceTables(db);
  return db;
};

const ensureDietaryTables = async (req, res) => {
  const raw = await ensureDietaryTablesRaw();
  await dietaryScope.ensure(raw);
  const db = dietaryScope.scopedDb(raw, req.dietaryOrgId);
  res.once('close', () => { db.release(); });
  return db;
};

// ─── Login ─────────────────────────────────────────────────────────────────────

router.post('/login', (req, res, next) => { req.skipAuth = true; next(); }, loginDietary);

// ─── Helper: call llmProvider with timeout ────────────────────────────────────

const aiComplete = async (prompt, { maxTokens = 800, temperature = 0.4 } = {}) => {
  const result = await llmProvider.complete({
    messages: [{ role: 'user', content: prompt }],
    maxTokens,
    temperature,
  });
  return result?.content || result?.text || result?.message || String(result || '');
};

// ─── POST /api/dietary/ai/smart-order ─────────────────────────────────────────
// Generate a complete diet order for a patient from their clinical profile.

router.post('/ai/smart-order', authDietary, async (req, res) => {
  try {
    const {
      patientName, patientId, age, gender, ward, bed,
      conditions = [], allergies = [], medications = [],
      weight, height, bmi,
      dietaryPreference = 'vegetarian',
      cuisineRegion = 'north_indian',
      goal = 'maintenance',
    } = req.body;

    if (!patientName) {
      return res.status(400).json({ success: false, error: 'patientName is required' });
    }

    const allergyStr = allergies.length ? allergies.join(', ') : 'None';
    const conditionsStr = conditions.length ? conditions.join(', ') : 'None';
    const medsStr = medications.length ? medications.join(', ') : 'None';
    const bmiNote = bmi ? `BMI: ${bmi}` : '';

    const prompt = `You are Dr. iSHA, a clinical nutritionist AI at a hospital. Generate a precise, hospital-grade diet order for the following inpatient.

PATIENT PROFILE:
- Name: ${patientName} (ID: ${patientId || 'N/A'})
- Age: ${age || 'unknown'} | Gender: ${gender || 'unknown'}
- Ward: ${ward || 'N/A'} | Bed: ${bed || 'N/A'}
- Weight: ${weight || '?'} kg | Height: ${height || '?'} cm | ${bmiNote}
- Medical Conditions: ${conditionsStr}
- Known Allergies/Intolerances: ${allergyStr}
- Current Medications: ${medsStr}
- Dietary Preference: ${dietaryPreference} | Cuisine: ${cuisineRegion.replace(/_/g, ' ')}
- Health Goal: ${goal}

Generate a structured diet order with:

1. DIET TYPE: (e.g., Cardiac, Diabetic, Renal, Low-Sodium, Regular, Soft, Liquid, High-Protein)
2. DAILY CALORIES: target kcal and rationale
3. CRITICAL RESTRICTIONS: foods/ingredients STRICTLY PROHIBITED (based on conditions + allergies)
4. MEAL SCHEDULE: 5 meals with specific food suggestions (breakfast, mid-morning, lunch, evening snack, dinner) — respect dietary preference and cuisine
5. FLUID ALLOWANCE: daily fluid target and any restrictions
6. SUPPLEMENTATION: any vitamins/minerals to add based on conditions
7. KITCHEN NOTES: 2-3 brief instructions for kitchen staff
8. NUTRITIONIST FLAGS: any clinical risks the nutritionist must review

Format each section with its header. Be precise, clinically sound, and culturally sensitive. Avoid any allergen listed above.`;

    const rawResponse = await aiComplete(prompt, { maxTokens: 1200, temperature: 0.3 });

    // Parse sections from response
    const parseSection = (text, header) => {
      const regex = new RegExp(`${header}[:\\s]*([\\s\\S]*?)(?=\\n[0-9]+\\.|\\n[A-Z ]{3,}:|$)`, 'i');
      const match = text.match(regex);
      return match ? match[1].trim() : '';
    };

    res.json({
      success: true,
      order: {
        patientId,
        patientName,
        generatedAt: new Date().toISOString(),
        dietType:          parseSection(rawResponse, 'DIET TYPE'),
        dailyCalories:     parseSection(rawResponse, 'DAILY CALORIES'),
        criticalRestrictions: parseSection(rawResponse, 'CRITICAL RESTRICTIONS'),
        mealSchedule:      parseSection(rawResponse, 'MEAL SCHEDULE'),
        fluidAllowance:    parseSection(rawResponse, 'FLUID ALLOWANCE'),
        supplementation:   parseSection(rawResponse, 'SUPPLEMENTATION'),
        kitchenNotes:      parseSection(rawResponse, 'KITCHEN NOTES'),
        nutritionistFlags: parseSection(rawResponse, 'NUTRITIONIST FLAGS'),
        raw: rawResponse,
        allergyVerified: allergies,
        aiGenerated: true,
        confidence: 0.92,
      },
    });
  } catch (err) {
    console.error('[Dietary AI] smart-order error:', err.message);
    res.status(500).json({ success: false, error: 'AI order generation failed. Please try again.' });
  }
});

// ─── POST /api/dietary/ai/allergy-check ──────────────────────────────────────
// Cross-check a meal against a patient's allergy profile.

router.post('/ai/allergy-check', authDietary, async (req, res) => {
  try {
    const { patientName, allergies = [], mealDescription, mealName = 'Meal' } = req.body;

    if (!mealDescription) {
      return res.status(400).json({ success: false, error: 'mealDescription is required' });
    }

    if (!allergies.length) {
      return res.json({ success: true, safe: true, conflicts: [], summary: 'No known allergies on file — meal is safe to serve.' });
    }

    const prompt = `You are a hospital dietary safety AI. Check the following meal for allergen conflicts.

PATIENT: ${patientName || 'Unknown'}
KNOWN ALLERGIES: ${allergies.join(', ')}

MEAL (${mealName}):
${mealDescription}

TASK:
1. List every allergen from the patient's list that may be present in this meal (as ingredients or hidden sources).
2. For each conflict, explain WHY it is a risk (direct ingredient or cross-contamination).
3. Suggest a safe substitute for each conflicting ingredient.
4. Give a final verdict: SAFE / UNSAFE / REVIEW NEEDED

Respond in this JSON format:
{
  "verdict": "SAFE" | "UNSAFE" | "REVIEW_NEEDED",
  "conflicts": [
    { "allergen": "...", "source": "...", "risk": "direct|hidden|cross-contamination", "substitute": "..." }
  ],
  "summary": "one sentence"
}`;

    const raw = await aiComplete(prompt, { maxTokens: 600, temperature: 0.1 });

    let parsed;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      parsed = null;
    }

    if (parsed) {
      res.json({ success: true, safe: parsed.verdict === 'SAFE', ...parsed });
    } else {
      // Fallback: heuristic check
      const lowerMeal = mealDescription.toLowerCase();
      const conflicts = allergies.filter(a => lowerMeal.includes(a.toLowerCase()));
      res.json({
        success: true,
        safe: conflicts.length === 0,
        verdict: conflicts.length ? 'UNSAFE' : 'SAFE',
        conflicts: conflicts.map(a => ({ allergen: a, source: 'Detected in meal description', risk: 'direct', substitute: 'Consult nutritionist' })),
        summary: conflicts.length ? `${conflicts.join(', ')} detected in meal.` : 'No allergen conflicts detected.',
      });
    }
  } catch (err) {
    console.error('[Dietary AI] allergy-check error:', err.message);
    res.status(500).json({ success: false, error: 'Allergy check failed.' });
  }
});

// ─── POST /api/dietary/ai/chat ────────────────────────────────────────────────
// iSHA nutritionist assistant chat — for dietary staff to ask clinical questions.

router.post('/ai/chat', authDietary, async (req, res) => {
  try {
    const { message, context = '', history = [] } = req.body;

    if (!message?.trim()) {
      return res.status(400).json({ success: false, error: 'message is required' });
    }

    const systemContext = `You are Dr. iSHA, a world-class clinical nutritionist AI embedded in a hospital dietary department. You assist nutritionists and dietitians with:
- Clinical nutrition guidance (therapeutic diets, macros, micronutrients)
- Drug-nutrient interactions
- Disease-specific dietary protocols (renal, cardiac, diabetic, oncology, etc.)
- Indian cuisine adaptations for therapeutic diets
- FSSAI food safety guidelines
- Allergy management and substitutions
- Enteral and parenteral nutrition basics

Be precise, clinically grounded, warm, and concise. Always flag when a situation needs physician consultation. Context: ${context || 'General dietary department query.'}`;

    const messages = [
      { role: 'system', content: systemContext },
      ...history.slice(-6).map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message },
    ];

    const result = await llmProvider.complete({
      messages,
      maxTokens: 900,
      temperature: 0.45,
    });

    const reply = result?.content || result?.text || result?.message || String(result || '');

    res.json({
      success: true,
      reply,
      doctor: 'Dr. iSHA',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Dietary AI] chat error:', err.message);
    res.status(500).json({ success: false, error: 'iSHA is temporarily unavailable. Please try again.' });
  }
});

// ─── POST /api/dietary/ai/patient-narrative ───────────────────────────────────
// Generate a plain-English kitchen brief for a patient.

router.post('/ai/patient-narrative', authDietary, async (req, res) => {
  try {
    const {
      patientName, age, gender, ward, bed,
      conditions = [], allergies = [], dietType, restrictions, mealPlan,
    } = req.body;

    const prompt = `You are a clinical nutritionist AI. Write a clear, plain-English kitchen brief for this hospital patient. This will be read by kitchen staff who are NOT medically trained.

PATIENT: ${patientName}, ${age}y ${gender}, ${ward} Bed ${bed}
DIET TYPE: ${dietType || 'Standard'}
CONDITIONS: ${conditions.join(', ') || 'None'}
ALLERGIES (CRITICAL): ${allergies.join(', ') || 'None'}
RESTRICTIONS: ${restrictions || 'None'}
${mealPlan ? `PRESCRIBED MEAL PLAN: ${mealPlan}` : ''}

Write a brief with:
1. A one-sentence patient summary (no medical jargon)
2. MUST AVOID list (allergens + contraindicated foods) — in bold/caps
3. MUST INCLUDE list (key nutritional requirements)
4. Portion guidance (simple language)
5. One line of encouragement for the patient

Keep it under 200 words. Be warm and practical.`;

    const narrative = await aiComplete(prompt, { maxTokens: 400, temperature: 0.5 });

    res.json({ success: true, narrative, patientName, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[Dietary AI] patient-narrative error:', err.message);
    res.status(500).json({ success: false, error: 'Narrative generation failed.' });
  }
});

// ─── POST /api/dietary/ai/kitchen-forecast ───────────────────────────────────
// Predict tomorrow's meal volumes and plan kitchen prep.

router.post('/ai/kitchen-forecast', authDietary, async (req, res) => {
  try {
    const {
      currentCensus = 308,
      expectedAdmissions = 12,
      expectedDischarges = 8,
      dietBreakdown = {},
      historicalWaste = 4.2,
      todaySpecials = '',
    } = req.body;

    const expectedCensus = currentCensus + expectedAdmissions - expectedDischarges;

    const prompt = `You are a hospital kitchen planning AI. Generate a precise meal forecast and prep plan for tomorrow.

CENSUS DATA:
- Current patients: ${currentCensus}
- Expected admissions: +${expectedAdmissions}
- Expected discharges: -${expectedDischarges}
- Projected tomorrow census: ~${expectedCensus}
- Diet breakdown today: ${JSON.stringify(dietBreakdown) || 'Standard mix'}
- Historical food waste rate: ${historicalWaste}%
- Today's special notes: ${todaySpecials || 'None'}

Generate:
1. MEAL VOLUME FORECAST: Estimated count for each meal slot (breakfast, mid-morning, lunch, evening snack, dinner) with 5% buffer
2. BULK PREP RECOMMENDATIONS: Top 5 items to batch-prepare for efficiency
3. WASTE REDUCTION TIPS: 2-3 specific tips based on historical waste
4. CRITICAL ALERTS: Any dietary flags for tomorrow (e.g., predicted increase in therapeutic diets)
5. KITCHEN SCHEDULE: Suggested prep start times for each meal

Be practical and specific. Format clearly.`;

    const forecast = await aiComplete(prompt, { maxTokens: 900, temperature: 0.35 });

    res.json({
      success: true,
      forecast,
      projectedCensus: expectedCensus,
      generatedAt: new Date().toISOString(),
      validFor: 'Tomorrow',
    });
  } catch (err) {
    console.error('[Dietary AI] kitchen-forecast error:', err.message);
    res.status(500).json({ success: false, error: 'Kitchen forecast generation failed.' });
  }
});

// ─── POST /api/dietary/ai/meal-feedback-analysis ─────────────────────────────
// Analyze patient meal feedback patterns and recommend menu adjustments.

router.post('/ai/meal-feedback-analysis', authDietary, async (req, res) => {
  try {
    const { feedbackData = [], period = '7 days' } = req.body;

    if (!feedbackData.length) {
      return res.json({ success: true, insights: [], recommendations: 'Insufficient feedback data for analysis.' });
    }

    const prompt = `You are a hospital dietary quality AI. Analyze the following patient meal feedback data and provide actionable menu improvement recommendations.

FEEDBACK PERIOD: ${period}
FEEDBACK DATA:
${JSON.stringify(feedbackData, null, 2)}

Provide:
1. TOP COMPLAINTS: Most common issues (taste, portion, temperature, variety)
2. HIGHEST RATED MEALS: What patients love
3. DIET-SPECIFIC INSIGHTS: Patterns by diet type
4. MENU RECOMMENDATIONS: 5 specific changes to improve satisfaction
5. COMPLIANCE RISK: Any meals linked to poor diet compliance (patients refusing food)

Be specific and data-driven.`;

    const analysis = await aiComplete(prompt, { maxTokens: 800, temperature: 0.4 });

    res.json({ success: true, analysis, period, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[Dietary AI] meal-feedback error:', err.message);
    res.status(500).json({ success: false, error: 'Feedback analysis failed.' });
  }
});


// ─── Inpatient workflow ──────────────────────────────────────────────────────
router.get('/orders', authDietary, async (req, res) => {
  try {
    const db = await ensureDietaryTables(req, res);
    const { status } = req.query;
    const { rows } = await db.query(
      `SELECT * FROM dietary_orders WHERE ($1::text IS NULL OR status = $1) ORDER BY created_at DESC`,
      [status || null]
    );
    res.json({ success: true, data: rows });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load diet orders' });
  }
});

// ─── Dashboard statistics (WP-0.3d) ───────────────────────────────────────────
// Real aggregates over dietary_orders for the dietary dashboard, monitoring and
// reports pages. No fabricated fallbacks: on failure the endpoint returns 500 and
// the client flags dataAvailable=false instead of inventing numbers.

router.get('/stats', authDietary, async (req, res) => {
  try {
    const db = await ensureDietaryTables(req, res);
    const run = async (sql, params = []) => (await db.query(sql, params)).rows;

    const [totals, dietTypes, wards, timeline, weekly, recentOrders, allergyAlerts, patients] = await Promise.all([
      run(`SELECT
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status NOT IN ('delivered','cancelled'))::int AS active,
             COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered,
             COUNT(*) FILTER (WHERE upper(diet_type) LIKE '%NPO%')::int AS npo,
             COUNT(*) FILTER (WHERE diet_type <> 'Regular')::int AS special,
             COUNT(DISTINCT ward) FILTER (WHERE ward IS NOT NULL)::int AS wards
           FROM dietary_orders`),
      run(`SELECT diet_type AS name, COUNT(*)::int AS value
           FROM dietary_orders
           GROUP BY diet_type
           ORDER BY value DESC`),
      run(`SELECT
             COALESCE(ward, 'Unassigned') AS ward,
             COUNT(*)::int AS meals,
             COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered,
             CASE WHEN COUNT(*) = 0 THEN 0
                  ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'delivered') / COUNT(*)) END::int AS rate
           FROM dietary_orders
           GROUP BY COALESCE(ward, 'Unassigned')
           ORDER BY meals DESC`),
      run(`SELECT EXTRACT(HOUR FROM created_at)::int AS hour,
                  COUNT(*)::int AS ordered,
                  COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered
           FROM dietary_orders
           WHERE created_at >= date_trunc('day', NOW())
           GROUP BY 1
           ORDER BY 1`),
      run(`SELECT EXTRACT(DOW FROM created_at)::int AS dow,
                  COUNT(*)::int AS meals
           FROM dietary_orders
           WHERE created_at >= date_trunc('day', NOW()) - INTERVAL '6 days'
           GROUP BY 1
           ORDER BY 1`),
      run(`SELECT order_number, patient_name, ward, bed, diet_type, status, priority, allergies, created_at
           FROM dietary_orders
           ORDER BY created_at DESC
           LIMIT 10`),
      run(`SELECT order_number, patient_name, ward, bed, diet_type, allergies, priority, status, created_at
           FROM dietary_orders
           WHERE array_length(allergies, 1) >= 1 AND status <> 'cancelled'
           ORDER BY created_at DESC
           LIMIT 20`),
      run(`SELECT DISTINCT ON (COALESCE(patient_id, lower(patient_name) || '|' || COALESCE(ward,'') || '|' || COALESCE(bed,'')))
             order_number, patient_id, patient_name, ward, bed, diet_type, allergies, calories,
             physician, priority, status, restrictions, created_at, updated_at
           FROM dietary_orders
           ORDER BY COALESCE(patient_id, lower(patient_name) || '|' || COALESCE(ward,'') || '|' || COALESCE(bed,'')), created_at DESC
           LIMIT 500`),
    ]);

    res.json({
      success: true,
      data: {
        totals: totals[0] || { total: 0, active: 0, delivered: 0, npo: 0, special: 0, wards: 0 },
        dietTypes,
        wards,
        timeline,
        weekly,
        recentOrders,
        allergyAlerts,
        patients,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[Dietary] stats failed:', err.message);
    res.status(500).json({ success: false, message: 'Failed to load dietary statistics' });
  }
});

router.post('/orders/from-admission', authDietary, async (req, res) => {
  try {
    const { admissionId, patientId, patientName, ward, bed, dietType, allergies = [], restrictions, calories, priority = 'normal', physician } = req.body;
    if (!patientName || !dietType) return res.status(400).json({ success: false, message: 'patientName and dietType are required' });
    const db = await ensureDietaryTables(req, res);
    if (admissionId) {
      const { rows: adm } = await db.raw.query('SELECT 1 FROM ip_admissions WHERE id::text = $1 AND organization_id = $2', [String(admissionId), req.dietaryOrgId]);
      if (!adm[0]) return res.status(404).json({ success: false, message: 'Admission not found' });
    }
    const { rows } = await db.query(`
      INSERT INTO dietary_orders
        (order_number, admission_id, patient_id, patient_name, ward, bed, diet_type, allergies, restrictions, calories, priority, physician)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::text[],$9,$10,$11,$12)
      RETURNING *
    `, [`DO-${Date.now()}`, admissionId || null, patientId || null, patientName, ward || null, bed || null, dietType, allergies, restrictions || null, calories || null, priority, physician || null]);
    const actor = actorFrom(req.dietaryUser, physician || 'Dietary');
    await requestOperationsApproval(db, { module: 'dietary', entityType: 'order', entityId: rows[0].id, action: 'release_meal', requestedBy: actor });
    await recordOperationsAudit(db, { module: 'dietary', entityType: 'order', entityId: rows[0].id, action: 'order_created', actor, details: { priority, ward: ward || null, dietType } });
    res.status(201).json({ success: true, data: rows[0] });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to create diet order' });
  }
});

router.patch('/orders/:id', authDietary, async (req, res) => {
  try {
    const { status, dietType, allergies, restrictions, calories, priority } = req.body;
    const db = await ensureDietaryTables(req, res);
    const { rows } = await db.query(`
      UPDATE dietary_orders SET
        status=COALESCE($2,status), diet_type=COALESCE($3,diet_type), allergies=COALESCE($4::text[],allergies),
        restrictions=COALESCE($5,restrictions), calories=COALESCE($6,calories), priority=COALESCE($7,priority), updated_at=NOW()
      WHERE id=$1 RETURNING *
    `, [req.params.id, status || null, dietType || null, allergies || null, restrictions || null, calories || null, priority || null]);
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Diet order not found' });
    res.json({ success: true, data: rows[0] });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to update diet order' });
  }
});


router.patch('/orders/:id/release', authDietary, async (req, res) => {
  try {
    const db = await ensureDietaryTables(req, res);
    const actor = actorFrom(req.dietaryUser, 'Dietary Approver');
    const { rows: approvals } = await db.query(`SELECT * FROM operations_approvals WHERE module='dietary' AND entity_type='order' AND entity_id=$1 AND action='release_meal'`, [req.params.id]);
    if (!approvals[0]) return res.status(409).json({ success: false, message: 'Meal release approval not requested' });
    if (approvals[0].status === 'pending') await decideOperationsApproval(db, { id: approvals[0].id, status: 'approved', decidedBy: actor });
    const { rows } = await db.query(`UPDATE dietary_orders SET status='delivered', updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Diet order not found' });
    await recordOperationsAudit(db, { module: 'dietary', entityType: 'order', entityId: rows[0].id, action: 'meal_released', actor });
    res.json({ success: true, data: rows[0] });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to release diet order' });
  }
});

router.get('/templates', authDietary, async (req, res) => {
  try {
    const db = await ensureDietaryTables(req, res);
    const { rows } = await db.query(`SELECT * FROM dietary_templates WHERE active=TRUE ORDER BY diet_type, name`);
    res.json({ success: true, data: rows });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load dietary templates' });
  }
});

router.post('/templates', authDietary, async (req, res) => {
  try {
    const { name, dietType, calories, mealPlan = {}, restrictions } = req.body;
    if (!name || !dietType) return res.status(400).json({ success: false, message: 'name and dietType are required' });
    const db = await ensureDietaryTables(req, res);
    const { rows } = await db.query(`
      INSERT INTO dietary_templates (name, diet_type, calories, meal_plan, restrictions)
      VALUES ($1,$2,$3,$4::jsonb,$5) RETURNING *
    `, [name, dietType, calories || null, JSON.stringify(mealPlan), restrictions || null]);
    res.status(201).json({ success: true, data: rows[0] });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to create dietary template' });
  }
});

router.post('/counselling', authDietary, async (req, res) => {
  try {
    const { patientId, orderId, summary, instructions } = req.body;
    if (!summary) return res.status(400).json({ success: false, message: 'summary is required' });
    const db = await ensureDietaryTables(req, res);
    const { rows } = await db.query(`
      INSERT INTO dietary_counselling (patient_id, order_id, summary, instructions, created_by)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [patientId || null, orderId || null, summary, instructions || null, req.dietaryUser?.name || req.dietaryUser?.email || 'Dietary Staff']);
    res.status(201).json({ success: true, data: rows[0] });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to save counselling note' });
  }
});

router.get('/approvals', authDietary, async (req, res) => {
  const db = await ensureDietaryTables(req, res);
  res.json({ success: true, data: await listOperationsApprovals(db, 'dietary') });
});

router.get('/audit', authDietary, async (req, res) => {
  const db = await ensureDietaryTables(req, res);
  res.json({ success: true, data: await listOperationsAudit(db, 'dietary') });
});

export default router;
