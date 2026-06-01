/**
 * useSmartBenefits — data loading for SmartBenefitsHub (plans, claims, family).
 * Extracted from SmartBenefitsHub.tsx (Phase 3 modularisation).
 */

import { useState, useEffect, useCallback } from 'react';
import api from '@/utils/api';

export interface BenefitPlan {
  id: string;
  name: string;
  type: string;
  provider: string;
  coverageAmount: number;
  sumInsured: number;
  premium: number;
  startDate: string;
  endDate: string;
  status: 'active' | 'expired' | 'pending';
  members: number;
  policyNumber: string;
  benefits: string[];
  eCardAvailable: boolean;
  cashlessNetwork: number;
  roomRentLimit?: string;
  copay?: number;
}

export interface FamilyMember {
  id: string;
  name: string;
  relationship: string;
  age: number;
  covered: boolean;
  planId: string;
}

export interface Claim {
  id: string;
  claimNumber: string;
  type: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected' | 'processing';
  submittedDate: string;
  processedDate?: string;
  hospital: string;
  description: string;
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
