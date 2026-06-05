/**
 * useLabSearch — lab discovery (city/pincode search + corporate lab lookup).
 * Extracted from LabTests.tsx (Phase 3 modularisation).
 */

import { useState, useEffect } from 'react';
import api from '@/utils/api';

export interface LabFromAPI {
  id: number;
  name: string;
  address: { city: string; state: string; street: string; zipCode: string; coordinates?: { lat: number; lng: number } };
  services: Array<{ name: string; category: string }>;
  rating: string;
  accreditation: string;
  facilities: string[];
}

export function useLabSearch() {
  const [labs, setLabs]           = useState<LabFromAPI[]>([]);
  const [corpLabs, setCorpLabs]   = useState<LabFromAPI[]>([]);
  const [loading, setLoading]     = useState(false);
  const [corpLoading, setCorpLoading] = useState(false);
  const [isCorporate, setIsCorporate] = useState(false);
  const [corporateName, setCorporateName] = useState('');
  const [searchCity, setSearchCity]   = useState('');
  const [selectedLabId, setSelectedLabId] = useState('');
  const [selectedLab, setSelectedLab]     = useState<LabFromAPI | null>(null);

  const search = async (query?: string) => {
    try {
      setLoading(true);
      const params: Record<string, string | number> = { limit: 100 };
      if (query && query.length >= 2) {
        /^\d{6}$/.test(query) ? (params.pincode = query) : (params.city = query);
      }
      const res = await api.get('/labs', { params });
      if (res.data?.success) setLabs(res.data.labs ?? []);
    } catch (err) {
      console.error('[useLabSearch]', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCorpLabs = async () => {
    if (!localStorage.getItem('token')) return;
    try {
      setCorpLoading(true);
      const res = await api.get('/employee/my-labs');
      if (res.data?.success && res.data?.isCorporateEmployee) {
        setIsCorporate(true);
        setCorporateName(res.data.corporateName ?? '');
        setCorpLabs(res.data.labs ?? []);
      }
    } catch { /* silent */ }
    finally { setCorpLoading(false); }
  };

  // Auto-load when selection changes to in-lab
  useEffect(() => {
    if (selectedLabId === 'in_lab') search(searchCity);
  }, [selectedLabId]);

  return {
    labs, corpLabs, loading, corpLoading,
    isCorporate, corporateName,
    searchCity, setSearchCity,
    selectedLabId, setSelectedLabId,
    selectedLab, setSelectedLab,
    search, fetchCorpLabs,
  };
}
