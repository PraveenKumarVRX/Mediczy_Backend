/**
 * Health Insurance Policy Rule Engine
 * Evaluates policy rules for eligibility, coverage, claims adjudication
 */

import { InsurancePolicy, PolicyRule, PolicyMember } from '../models/insurance-policy.model.intelligent.js';
import { Op } from 'sequelize';

class PolicyRuleEngine {
  
  /**
   * Evaluate all rules for a specific context
   */
  async evaluateRules(policyId, context, category = null) {
    try {
      const whereClause = {
        policyId,
        isActive: true,
        [Op.or]: [
          { effectiveFrom: { [Op.lte]: new Date() } },
          { effectiveFrom: null }
        ],
        [Op.or]: [
          { effectiveTo: { [Op.gte]: new Date() } },
          { effectiveTo: null }
        ]
      };
      
      if (category) {
        whereClause.ruleCategory = category;
      }
      
      const rules = await PolicyRule.findAll({
        where: whereClause,
        order: [['priority', 'ASC']]
      });
      
      const results = {
        passed: [],
        failed: [],
        warnings: [],
        actions: []
      };
      
      for (const rule of rules) {
        const evaluation = await this.evaluateSingleRule(rule, context);
        
        if (evaluation.passed) {
          results.passed.push(evaluation);
        } else {
          results.failed.push(evaluation);
        }
        
        if (evaluation.warnings) {
          results.warnings.push(...evaluation.warnings);
        }
        
        if (evaluation.actions) {
          results.actions.push(...evaluation.actions);
        }
      }
      
      return results;
    } catch (error) {
      console.error('Rule evaluation error:', error);
      throw error;
    }
  }
  
  /**
   * Evaluate a single rule
   */
  async evaluateSingleRule(rule, context) {
    const result = {
      ruleCode: rule.ruleCode,
      ruleName: rule.ruleName,
      category: rule.ruleCategory,
      passed: false,
      message: '',
      warnings: [],
      actions: []
    };
    
    try {
      switch (rule.ruleCode) {
        // ELIGIBILITY RULES
        case 'ELIG_FAMILY_DEF':
          return this.evaluateFamilyDefinition(rule, context, result);
        
        case 'ELIG_ENTRY_AGE':
          return this.evaluateEntryAge(rule, context, result);
        
        // WAITING PERIOD RULES
        case 'WAIT_INITIAL_30':
          return this.evaluateInitialWaiting(rule, context, result);
        
        case 'WAIT_SPECIFIC_DISEASE':
          return this.evaluateSpecificDiseaseWaiting(rule, context, result);
        
        case 'WAIT_PED':
          return this.evaluatePEDWaiting(rule, context, result);
        
        // HOSPITALIZATION RULES
        case 'ROOM_RENT_LIMIT':
          return this.evaluateRoomRentLimit(rule, context, result);
        
        case 'PROP_DEDUCTION':
          return this.evaluateProportionateDeduction(rule, context, result);
        
        case 'HOSP_MIN_DURATION':
          return this.evaluateMinHospitalization(rule, context, result);
        
        // COVERAGE RULES
        case 'MATERNITY':
          return this.evaluateMaternity(rule, context, result);
        
        case 'NEWBORN_DAY1':
          return this.evaluateNewborn(rule, context, result);
        
        case 'DAY_CARE':
          return this.evaluateDayCare(rule, context, result);
        
        case 'AYUSH':
          return this.evaluateAYUSH(rule, context, result);
        
        case 'DOMICILIARY':
          return this.evaluateDomiciliary(rule, context, result);
        
        case 'SUBLIMIT_DISEASE':
          return this.evaluateDiseaseSubLimit(rule, context, result);
        
        // FINANCIAL RULES
        case 'DEDUCTIBLE':
          return this.evaluateDeductible(rule, context, result);
        
        case 'COPAY':
          return this.evaluateCopayment(rule, context, result);
        
        case 'CONSUMABLES':
          return this.evaluateConsumables(rule, context, result);
        
        // NETWORK RULES
        case 'CASHLESS':
          return this.evaluateCashless(rule, context, result);
        
        case 'PPN':
          return this.evaluatePPN(rule, context, result);
        
        case 'CLAIM_INTIMATION':
          return this.evaluateClaimIntimation(rule, context, result);
        
        // ADD-ON RULES
        case 'ADDON':
          return this.evaluateAddon(rule, context, result);
        
        default:
          result.passed = true;
          result.message = 'Rule evaluation not implemented';
          return result;
      }
    } catch (error) {
      result.passed = false;
      result.message = `Rule evaluation error: ${error.message}`;
      return result;
    }
  }
  
  // =========================================================================
  // ELIGIBILITY RULE EVALUATORS
  // =========================================================================
  
  evaluateFamilyDefinition(rule, context, result) {
    const { members } = context;
    const params = rule.parameters;
    
    // Check allowed relationships
    const allowedRelations = params.allowed_relations || ['self', 'spouse', 'son', 'daughter', 'father', 'mother'];
    const invalidMembers = members.filter(m => !allowedRelations.includes(m.relationship));
    
    if (invalidMembers.length > 0) {
      result.passed = false;
      result.message = `Invalid relationships: ${invalidMembers.map(m => m.relationship).join(', ')}`;
      return result;
    }
    
    // Check max members
    if (params.max_members && members.length > params.max_members) {
      result.passed = false;
      result.message = `Exceeds maximum members: ${params.max_members}`;
      return result;
    }
    
    result.passed = true;
    result.message = 'Family definition validated';
    return result;
  }
  
  evaluateEntryAge(rule, context, result) {
    const { age, relationship } = context;
    const params = rule.parameters;
    
    const minAge = params.min_age || 0;
    const maxAge = params.max_age || 100;
    
    if (age < minAge || age > maxAge) {
      result.passed = false;
      result.message = `Age ${age} outside allowed range: ${minAge}-${maxAge}`;
      return result;
    }
    
    result.passed = true;
    result.message = 'Entry age validated';
    return result;
  }
  
  // =========================================================================
  // WAITING PERIOD EVALUATORS
  // =========================================================================
  
  evaluateInitialWaiting(rule, context, result) {
    const { policyStartDate, claimDate, claimType } = context;
    const daysPassed = Math.floor((claimDate - policyStartDate) / (1000 * 60 * 60 * 24));
    
    // Exception for accidents
    if (rule.exceptions?.includes('accident') && claimType === 'accident') {
      result.passed = true;
      result.message = 'Accident exception - no waiting period';
      return result;
    }
    
    if (daysPassed < 30) {
      result.passed = false;
      result.message = `Initial 30-day waiting period not complete (${daysPassed} days)`;
      return result;
    }
    
    result.passed = true;
    result.message = 'Initial waiting period completed';
    return result;
  }
  
  evaluateSpecificDiseaseWaiting(rule, context, result) {
    const { disease, policyStartDate, claimDate } = context;
    const params = rule.parameters;
    
    const waitingMonths = params.waiting_period_months || 12;
    const diseaseList = params.disease_list || [];
    
    if (diseaseList.includes(disease)) {
      const monthsPassed = Math.floor((claimDate - policyStartDate) / (1000 * 60 * 60 * 24 * 30));
      
      if (monthsPassed < waitingMonths) {
        result.passed = false;
        result.message = `Disease waiting period: ${waitingMonths} months (${monthsPassed} completed)`;
        return result;
      }
    }
    
    result.passed = true;
    result.message = 'Disease waiting period validated';
    return result;
  }
  
  evaluatePEDWaiting(rule, context, result) {
    const { preExistingDisease, policyStartDate, claimDate } = context;
    const params = rule.parameters;
    
    if (preExistingDisease) {
      const waitingMonths = params.waiting_period_months || 36;
      const monthsPassed = Math.floor((claimDate - policyStartDate) / (1000 * 60 * 60 * 24 * 30));
      
      if (monthsPassed < waitingMonths) {
        result.passed = false;
        result.message = `PED waiting period: ${waitingMonths} months (${monthsPassed} completed)`;
        return result;
      }
    }
    
    result.passed = true;
    result.message = 'PED waiting period validated';
    return result;
  }
  
  // =========================================================================
  // HOSPITALIZATION EVALUATORS
  // =========================================================================
  
  evaluateRoomRentLimit(rule, context, result) {
    const { roomType, roomRentPerDay, isICU } = context;
    const params = rule.parameters;
    
    const limit = isICU ? params.icu_cap : params.room_cap;
    
    if (limit && roomRentPerDay > limit) {
      result.passed = false;
      result.message = `Room rent ₹${roomRentPerDay} exceeds limit ₹${limit}`;
      result.actions.push({
        type: 'apply_proportionate_deduction',
        roomRent: roomRentPerDay,
        limit: limit
      });
      return result;
    }
    
    result.passed = true;
    result.message = 'Room rent within limits';
    return result;
  }
  
  evaluateProportionateDeduction(rule, context, result) {
    const { roomRentActual, roomRentLimit, totalClaimAmount } = context;
    
    if (rule.parameters.applicable && roomRentActual > roomRentLimit) {
      const deductionPercentage = ((roomRentActual - roomRentLimit) / roomRentLimit) * 100;
      const deductionAmount = (totalClaimAmount * deductionPercentage) / 100;
      
      result.passed = true;
      result.message = `Proportionate deduction: ${deductionPercentage.toFixed(2)}%`;
      result.actions.push({
        type: 'deduct_amount',
        reason: 'proportionate_deduction',
        amount: deductionAmount
      });
    } else {
      result.passed = true;
      result.message = 'No proportionate deduction required';
    }
    
    return result;
  }
  
  evaluateMinHospitalization(rule, context, result) {
    const { admissionDate, dischargeDate, procedure } = context;
    const params = rule.parameters;
    
    const minHours = params.min_hours || 24;
    const exceptions = params.exceptions || ['day_care'];
    
    // Check exceptions
    if (exceptions.includes(procedure)) {
      result.passed = true;
      result.message = 'Day care procedure exception';
      return result;
    }
    
    const hoursDiff = (dischargeDate - admissionDate) / (1000 * 60 * 60);
    
    if (hoursDiff < minHours) {
      result.passed = false;
      result.message = `Minimum ${minHours} hours hospitalization required (${hoursDiff.toFixed(1)} hours)`;
      return result;
    }
    
    result.passed = true;
    result.message = 'Hospitalization duration validated';
    return result;
  }
  
  // =========================================================================
  // COVERAGE EVALUATORS
  // =========================================================================
  
  evaluateMaternity(rule, context, result) {
    const { policyStartDate, claimDate } = context;
    const params = rule.parameters;
    
    const waitingMonths = params.waiting_period_months || 48;
    const monthsPassed = Math.floor((claimDate - policyStartDate) / (1000 * 60 * 60 * 24 * 30));
    
    if (monthsPassed < waitingMonths) {
      result.passed = false;
      result.message = `Maternity waiting period: ${waitingMonths} months (${monthsPassed} completed)`;
      return result;
    }
    
    result.passed = true;
    result.message = 'Maternity coverage validated';
    
    if (params.limit) {
      result.actions.push({
        type: 'apply_sublimit',
        reason: 'maternity',
        limit: params.limit
      });
    }
    
    return result;
  }
  
  evaluateNewborn(rule, context, result) {
    const { newborn } = context;
    const params = rule.parameters;
    
    if (newborn && params.covered) {
      result.passed = true;
      result.message = 'Newborn covered from day 1';
    } else if (newborn && !params.covered) {
      result.passed = false;
      result.message = 'Newborn coverage not available';
    } else {
      result.passed = true;
      result.message = 'Not applicable';
    }
    
    return result;
  }
  
  evaluateDayCare(rule, context, result) {
    const { procedure } = context;
    const params = rule.parameters;
    
    const approvedProcedures = params.procedure_list || [];
    
    if (approvedProcedures.length > 0 && !approvedProcedures.includes(procedure)) {
      result.passed = false;
      result.message = `Day care procedure not covered: ${procedure}`;
      return result;
    }
    
    result.passed = true;
    result.message = 'Day care procedure validated';
    return result;
  }
  
  evaluateAYUSH(rule, context, result) {
    const { treatmentType } = context;
    const params = rule.parameters;
    
    if (!params.coverage) {
      result.passed = false;
      result.message = 'AYUSH treatment not covered';
      return result;
    }
    
    result.passed = true;
    result.message = 'AYUSH treatment covered';
    
    if (params.limit) {
      result.actions.push({
        type: 'apply_sublimit',
        reason: 'ayush',
        limit: params.limit
      });
    }
    
    return result;
  }
  
  evaluateDomiciliary(rule, context, result) {
    const params = rule.parameters;
    
    if (!params.coverage) {
      result.passed = false;
      result.message = 'Domiciliary hospitalization not covered';
      return result;
    }
    
    result.passed = true;
    result.message = 'Domiciliary hospitalization covered';
    return result;
  }
  
  evaluateDiseaseSubLimit(rule, context, result) {
    const { disease, claimAmount } = context;
    const params = rule.parameters;
    
    if (params.disease === disease && params.limit) {
      if (claimAmount > params.limit) {
        result.passed = true;
        result.message = `Sub-limit applicable: ₹${params.limit}`;
        result.actions.push({
          type: 'apply_sublimit',
          reason: disease,
          limit: params.limit,
          excess: claimAmount - params.limit
        });
      } else {
        result.passed = true;
        result.message = 'Within sub-limit';
      }
    } else {
      result.passed = true;
      result.message = 'No sub-limit applicable';
    }
    
    return result;
  }
  
  // =========================================================================
  // FINANCIAL EVALUATORS
  // =========================================================================
  
  evaluateDeductible(rule, context, result) {
    const { claimAmount } = context;
    const params = rule.parameters;
    
    const deductible = params.per_claim || params.aggregate || 0;
    
    if (deductible > 0) {
      result.passed = true;
      result.message = `Deductible: ₹${deductible}`;
      result.actions.push({
        type: 'deduct_amount',
        reason: 'deductible',
        amount: deductible
      });
    } else {
      result.passed = true;
      result.message = 'No deductible';
    }
    
    return result;
  }
  
  evaluateCopayment(rule, context, result) {
    const { claimAmount } = context;
    const params = rule.parameters;
    
    const copayPercentage = params.percentage || 0;
    
    if (copayPercentage > 0) {
      const copayAmount = (claimAmount * copayPercentage) / 100;
      
      result.passed = true;
      result.message = `Co-payment: ${copayPercentage}%`;
      result.actions.push({
        type: 'deduct_amount',
        reason: 'copayment',
        amount: copayAmount,
        percentage: copayPercentage
      });
    } else {
      result.passed = true;
      result.message = 'No co-payment';
    }
    
    return result;
  }
  
  evaluateConsumables(rule, context, result) {
    const { consumablesAmount } = context;
    const params = rule.parameters;
    
    if (!params.covered && consumablesAmount > 0) {
      result.passed = true;
      result.message = 'Consumables not covered';
      result.actions.push({
        type: 'deduct_amount',
        reason: 'consumables',
        amount: consumablesAmount
      });
    } else {
      result.passed = true;
      result.message = 'Consumables covered';
    }
    
    return result;
  }
  
  // =========================================================================
  // NETWORK EVALUATORS
  // =========================================================================
  
  evaluateCashless(rule, context, result) {
    const { hospitalId, networkHospitals } = context;
    const params = rule.parameters;
    
    if (params.ppn_required && !networkHospitals.includes(hospitalId)) {
      result.passed = false;
      result.message = 'Hospital not in network - cashless not available';
      result.warnings.push('Consider reimbursement claim');
      return result;
    }
    
    result.passed = true;
    result.message = 'Cashless facility available';
    return result;
  }
  
  evaluatePPN(rule, context, result) {
    const { hospitalId, networkHospitals } = context;
    const params = rule.parameters;
    
    if (params.mandatory && !networkHospitals.includes(hospitalId)) {
      result.passed = false;
      result.message = 'Treatment must be at network hospital (PPN mandatory)';
      return result;
    }
    
    result.passed = true;
    result.message = 'PPN validated';
    return result;
  }
  
  evaluateClaimIntimation(rule, context, result) {
    const { intimationDate, admissionDate } = context;
    const params = rule.parameters;
    
    const timelineHours = params.timeline_hours || 24;
    const hoursDiff = (intimationDate - admissionDate) / (1000 * 60 * 60);
    
    if (hoursDiff > timelineHours) {
      result.passed = false;
      result.message = `Intimation timeline exceeded: ${timelineHours} hours (${hoursDiff.toFixed(1)} hours)`;
      result.warnings.push('May affect claim processing');
      return result;
    }
    
    result.passed = true;
    result.message = 'Intimation timeline met';
    return result;
  }
  
  // =========================================================================
  // ADD-ON EVALUATORS
  // =========================================================================
  
  evaluateAddon(rule, context, result) {
    const params = rule.parameters;
    
    if (params.enabled) {
      result.passed = true;
      result.message = `Add-on available: ${params.addon_name}`;
    } else {
      result.passed = false;
      result.message = `Add-on not enabled: ${params.addon_name}`;
    }
    
    return result;
  }
  
  // =========================================================================
  // CLAIM ADJUDICATION
  // =========================================================================
  
  async adjudicateClaim(claimId) {
    try {
      const claim = await InsuranceClaim.findByPk(claimId, {
        include: [
          { model: InsurancePolicy, as: 'policy' },
          { model: PolicyMember, as: 'member' }
        ]
      });
      
      if (!claim) {
        throw new Error('Claim not found');
      }
      
      const context = {
        policyStartDate: new Date(claim.policy.policyStartDate),
        claimDate: new Date(claim.admissionDate || claim.intimationDate),
        claimType: claim.claimType,
        disease: claim.diagnosis,
        icdCode: claim.icdCode,
        admissionDate: new Date(claim.admissionDate),
        dischargeDate: new Date(claim.dischargeDate),
        claimAmount: parseFloat(claim.claimedAmount),
        hospitalId: claim.hospitalId,
        networkHospitals: claim.policy.networkConfig?.networkHospitals || [],
        intimationDate: new Date(claim.intimationDate)
      };
      
      // Evaluate all rules
      const evaluation = await this.evaluateRules(claim.policyId, context);
      
      // Calculate approved amount
      let approvedAmount = parseFloat(claim.claimedAmount);
      let deductions = {
        roomRentDeduction: 0,
        proportionateDeduction: 0,
        copayment: 0,
        deductible: 0,
        nonMedicalExpenses: 0,
        exclusions: 0
      };
      
      // Apply deduction actions
      for (const action of evaluation.actions) {
        if (action.type === 'deduct_amount') {
          approvedAmount -= action.amount;
          deductions[action.reason] = action.amount;
        } else if (action.type === 'apply_sublimit' && approvedAmount > action.limit) {
          const excess = approvedAmount - action.limit;
          approvedAmount = action.limit;
          deductions.exclusions += excess;
        }
      }
      
      const settledAmount = Math.max(0, approvedAmount);
      const deductedAmount = parseFloat(claim.claimedAmount) - settledAmount;
      
      return {
        claimId,
        claimedAmount: claim.claimedAmount,
        approvedAmount: settledAmount,
        deductedAmount,
        deductions,
        evaluation,
        status: evaluation.failed.length > 0 ? 'partially_approved' : 'approved'
      };
      
    } catch (error) {
      console.error('Claim adjudication error:', error);
      throw error;
    }
  }
}

export default new PolicyRuleEngine();
