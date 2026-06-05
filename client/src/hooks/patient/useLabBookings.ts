/**
 * useLabBookings — fetches and manages the patient's lab test order history.
 * Extracted from LabTests.tsx (Phase 3 modularisation).
 */

import { useState, useCallback } from 'react';
import api from '@/utils/api';

export interface LabTest {
  id: string;
  testName: string;
  testType: string;
  category: string;
  orderedBy: string;
  orderDate: string;
  status: 'pending' | 'pending_confirmation' | 'confirmed' | 'sample_collected' | 'processing' | 'completed' | 'cancelled';
  sampleCollected: boolean;
  results?: string;
  reportUrl?: string;
  estimatedDate?: string;
  hospitalId?: number;
  labName?: string;
  labAddress?: string;
  urgency?: string;
  notes?: string;
}

const CATEGORY_MAP: Record<string, string> = {
  blood_test: 'Hematology', pathology: 'Pathology', radiology: 'Radiology',
  scan: 'Imaging', ultrasound: 'Imaging', xray: 'Imaging',
  ct_scan: 'Imaging', mri: 'Imaging', ecg: 'Cardiac',
  echo: 'Cardiac', eeg: 'Neurology', endoscopy: 'Gastroenterology',
  colonoscopy: 'Gastroenterology', other: 'Other',
};

export function useLabBookings() {
  const [tests, setTests] = useState<LabTest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const getCategory = (type: string) => CATEGORY_MAP[type] ?? 'General';

  const fetch = useCallback(async () => {
    if (!localStorage.getItem('token')) { setTests([]); setIsLoading(false); return; }
    try {
      setIsLoading(true);
      const res = await api.get('/lab-tests', { params: { limit: 100 } });
      const arr = res.data?.labTests || res.data?.data || [];
      if (res.data?.success) {
        setTests(arr.map((lt: any): LabTest => ({
          id:             lt.id.toString(),
          testName:       lt.testName || lt.testType,
          testType:       lt.testType,
          category:       getCategory(lt.testType),
          orderedBy:      'Self-booked',
          orderDate:      lt.createdAt?.split('T')[0] ?? new Date().toISOString().split('T')[0],
          status:         lt.status,
          sampleCollected: ['sample_collected','processing','completed'].includes(lt.status),
          results:        lt.results,
          reportUrl:      lt.reportUrl,
          estimatedDate:  lt.expectedCompletionDate?.split('T')[0],
          hospitalId:     lt.hospitalId,
          labName:        lt.labName,
          labAddress:     lt.labAddress,
          urgency:        lt.urgency,
          notes:          lt.notes,
        })));
      }
    } catch (err) {
      console.error('[useLabBookings]', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const filtered = tests.filter(t => {
    const matchStatus = filterStatus === 'all' || t.status === filterStatus;
    const matchSearch = !searchTerm || t.testName.toLowerCase().includes(searchTerm.toLowerCase());
    return matchStatus && matchSearch;
  });

  return { tests: filtered, allTests: tests, isLoading, filterStatus, setFilterStatus, searchTerm, setSearchTerm, refresh: fetch };
}
