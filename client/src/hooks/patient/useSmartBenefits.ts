/**
 * useSmartBenefits — data loading for SmartBenefitsHub (plans, claims, family).
 * Extracted from SmartBenefitsHub.tsx (Phase 3 modularisation).
 */

import { useState, useEffect, useCallback } from 'react';
import api from '@/utils/api';

// Matches the real shape returned by GET /employee/benefits (employee-network.route.js).
// insurer/policyNumber are null for employer-funded plans -- never fabricated.
export interface BenefitPlan {
  id: string;
  source?: 'user_health_packages' | string;
  packageId?: string | null;
  name: string;
  type: 'gmc' | 'gpa' | 'gtl' | 'opd' | 'dental' | 'vision' | 'wellness' | 'topup' | 'parents' | 'personal';
  benefitCategory?: 'insurance' | 'wellness' | 'health_checkup' | string;
  insurer: string | null;
  isEmployerFunded?: boolean;
  policyNumber: string | null;
  sumInsured: number;
  utilized: number;
  remaining: number;
  familyCovered: number;
  validFrom: string;
  validTo: string;
  features: string[];
  sublimits: { name: string; limit: number; used: number }[];
  status?: string;
  bookingEligible?: boolean;
  familyEligible?: boolean;
  familyDiscountPercent?: number;
  familyPrice?: number | null;
  usedAt?: string | null;
}

export interface FamilyMember {
  id: string;
  name: string;
  relationship: string;
  relation?: string;
  age: number;
  gender?: string;
  covered: boolean;
  planId: string;
}

// Matches the real shape returned by GET /employee/claims (employee-network.route.js).
export interface Claim {
  id: string;
  claimNumber: string;
  type: string;
  benefitCategory: 'insurance' | 'wellness';
  amount: number;
  approvedAmount?: number;
  status: 'submitted' | 'under_review' | 'approved' | 'rejected' | 'settled' | 'info_needed';
  hospital?: string;
  date: string;
  member: string;
  documents: unknown[];
  timeline: { step: string; date: string; status: string }[];
}

const getToken = () => localStorage.getItem('token');

const calculateAge = (dateOfBirth?: string | null) => {
  if (!dateOfBirth) return 0;
  const birthDate = new Date(dateOfBirth);
  if (Number.isNaN(birthDate.getTime())) return 0;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age -= 1;
  return Math.max(0, age);
};

const normalizeFamilyMember = (member: any): FamilyMember => {
  const relationship = String(member.relationship || member.relation || 'family').trim();
  const name = String(
    member.name ||
    [member.firstName, member.lastName].filter(Boolean).join(' ') ||
    'Family member'
  ).trim();

  return {
    id: String(member.id),
    name,
    relationship,
    relation: relationship.charAt(0).toUpperCase() + relationship.slice(1),
    age: Number(member.age) || calculateAge(member.dateOfBirth),
    gender: member.gender || '',
    covered: member.covered !== false,
    planId: member.planId || '',
  };
};

// Maps GET /membership/my/current (the individual/retail plan a person
// subscribed to directly - same source Membership Card and Claims Express
// already use) into the BenefitPlan shape this page renders. Returns null
// when there's no active individual plan either (genuinely no coverage).
async function mapIndividualPlanToBenefitPlan(): Promise<BenefitPlan | null> {
  try {
    const { data } = await api.get('/membership/my/current');
    const plan = data?.plan;
    const userPlan = data?.userPlan;
    if (!plan || !userPlan) return null;

    const benefitsList: string[] = Array.isArray(plan.benefits) ? plan.benefits : [];
    const familyMembers = Number(plan.features?.familyMembers) || 0;

    return {
      id: String(userPlan.id),
      name: plan.name || 'My Plan',
      type: 'personal',
      insurer: null,
      isEmployerFunded: false,
      policyNumber: null,
      // This is a service-entitlement plan (consult counts, discounts), not a
      // monetary sum-insured policy - 0 renders as "Included" in the UI
      // rather than a misleading ₹0.
      sumInsured: 0,
      utilized: 0,
      remaining: 0,
      familyCovered: familyMembers + 1,
      validFrom: userPlan.startDate,
      validTo: userPlan.endDate,
      features: benefitsList,
      sublimits: [],
      status: userPlan.status || 'active',
    };
  } catch {
    return null;
  }
}

export function useSmartBenefits() {
  const [plans, setPlans]   = useState<BenefitPlan[]>([]);
  const [family, setFamily] = useState<FamilyMember[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimsDataStatus, setClaimsDataStatus] = useState<'live' | 'unavailable'>('unavailable');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = getToken();
      if (!token) { setLoading(false); return; }

      const [benefitsRes, claimsRes, familyRes] = await Promise.all([
        api.get('/employee/benefits').catch(() => null),
        api.get('/employee/claims').catch(() => null),
        api.get('/family-members').catch(() => null),
      ]);

      const employeePlans = Array.isArray(benefitsRes?.data?.plans) ? benefitsRes.data.plans : [];
      if (employeePlans.length > 0) {
        setPlans(employeePlans);
      } else {
        // /employee/benefits only covers corporate-employee plan assignments.
        // An individual/retail plan holder (e.g. a self-purchased Silver plan)
        // has no corporate assignment at all, so that call correctly returns
        // nothing - fall back to the same source Membership Card and Claims
        // Express already read from, instead of showing "no active plans" for
        // an account that genuinely has one.
        const individualPlan = await mapIndividualPlanToBenefitPlan();
        setPlans(individualPlan ? [individualPlan] : []);
      }

      const familyPayload = Array.isArray(familyRes?.data?.familyMembers)
        ? familyRes.data.familyMembers
        : Array.isArray(familyRes?.data?.data)
          ? familyRes.data.data
          : [];
      setFamily(familyPayload.map(normalizeFamilyMember));

      if (Array.isArray(claimsRes?.data?.claims)) {
        setClaims(claimsRes.data.claims);
        setClaimsDataStatus('live');
      } else {
        setClaimsDataStatus('unavailable');
      }
    } catch (err) {
      console.error('[useSmartBenefits]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const activePlans  = plans.filter(p => p.status === 'active');
  const expiredPlans = plans.filter(p => p.status === 'expired');
  const pendingClaims   = claims.filter(c => ['pending', 'processing'].includes(c.status));
  const settledClaims   = claims.filter(c => ['approved', 'rejected'].includes(c.status));
  const totalCovered    = family.filter(f => f.covered).length;
  const totalClaimAmount = claims.filter(c => c.status === 'approved').reduce((s, c) => s + c.amount, 0);

  return {
    plans, family, claims, loading, claimsDataStatus,
    activePlans, expiredPlans, pendingClaims, settledClaims,
    totalCovered, totalClaimAmount,
    refresh: load,
    setPlans, setFamily, setClaims,
  };
}
