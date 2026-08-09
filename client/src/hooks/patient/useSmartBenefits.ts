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
  name: string;
  type: 'gmc' | 'gpa' | 'gtl' | 'opd' | 'dental' | 'vision' | 'wellness' | 'topup' | 'parents' | 'personal';
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
}

export interface FamilyMember {
  id: string;
  name: string;
  relationship: string;
  age: number;
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

      if (Array.isArray(benefitsRes?.data?.plans)) setPlans(benefitsRes.data.plans);
      if (Array.isArray(familyRes?.data?.familyMembers)) setFamily(familyRes.data.familyMembers);

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
