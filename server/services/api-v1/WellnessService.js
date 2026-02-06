/**
 * Wellness Service - Mediqzy API v1
 */

import BaseService from '../BaseService.js';

class WellnessService extends BaseService {
  constructor() {
    super('api_hra_assessments');
  }

  async createHRA(tenantId, data) {
    const assessmentId = this.generateId('hra');
    
    // Calculate risk score and level
    const { risk_score, risk_level } = this.calculateRisk(data);
    const risk_factors = this.identifyRiskFactors(data);
    const recommendations = this.generateRecommendations(risk_factors);

    const result = await this.query(
      `INSERT INTO api_hra_assessments 
       (assessment_id, tenant_id, user_id, responses, risk_score, risk_level, 
        risk_factors, recommendations, bmi, bp_systolic, bp_diastolic, heart_rate,
        blood_sugar, smoking_status, alcohol_consumption, exercise_frequency, 
        diet_pattern, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'completed')
       RETURNING *`,
      [assessmentId, tenantId, data.user_id, JSON.stringify(data.responses),
       risk_score, risk_level, JSON.stringify(risk_factors), JSON.stringify(recommendations),
       data.bmi, data.bp_systolic, data.bp_diastolic, data.heart_rate, data.blood_sugar,
       data.smoking_status, data.alcohol_consumption, data.exercise_frequency, data.diet_pattern]
    );

    return result.rows[0];
  }

  calculateRisk(data) {
    let score = 0;
   
    // BMI score
    if (data.bmi > 30) score += 30;
    else if (data.bmi > 25) score += 15;

    // BP score
    if (data.bp_systolic > 140) score += 20;
    else if (data.bp_systolic > 130) score += 10;

    // Lifestyle factors
    if (data.smoking_status === 'current') score += 25;
    if (data.alcohol_consumption === 'heavy') score += 15;
    if (data.exercise_frequency === 'never') score += 10;

    const risk_level = score >= 70 ? 'critical' : score >= 50 ? 'high' : score >= 30 ? 'moderate' : 'low';
    
    return { risk_score: Math.min(score, 100), risk_level };
  }

  identifyRiskFactors(data) {
    const factors = [];
    if (data.bmi > 25) factors.push({ factor: 'overweight', level: data.bmi > 30 ? 'high' : 'moderate' });
    if (data.bp_systolic > 130) factors.push({ factor: 'hypertension', level: data.bp_systolic > 140 ? 'high' : 'moderate' });
    if (data.smoking_status === 'current') factors.push({ factor: 'smoking', level: 'high' });
    return factors;
  }

  generateRecommendations(risk_factors) {
    return risk_factors.map(rf => ({
      category: rf.factor,
      action: this.getRecommendationForFactor(rf.factor),
      priority: rf.level === 'high' ? 'urgent' : 'recommended'
    }));
  }

  getRecommendationForFactor(factor) {
    const recommendations = {
      'overweight': 'Consult a nutritionist for weight management plan',
      'hypertension': 'Schedule appointment with cardiologist',
      'smoking': 'Join smoking cessation program',
      'diabetes': 'Regular blood sugar monitoring and diet modification'
    };
    return recommendations[factor] || 'Consult healthcare provider';
  }

  async getHRA(tenantId, assessmentId) {
    return await this.findById(assessmentId, tenantId, 'assessment_id');
  }

  async listHRAs(tenantId, userId, options = {}) {
    return await this.findAll(tenantId, { ...options, where: { user_id: userId }, sortBy: 'created_at' });
  }

  async listWellnessPlans(tenantId, options = {}) {
    const { page = 1, limit = 20, category } = options;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE tenant_id = $1 AND status = $2';
    let params = [tenantId, 'active'];
    let paramIndex = 3;

    if (category) {
      whereClause += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    const result = await this.query(
      `SELECT * FROM api_wellness_plans
       ${whereClause}
       ORDER BY name ASC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    return result.rows;
  }
}

export default new WellnessService();
