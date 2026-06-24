/**
 * Admit Patient Form
 *
 * Used by hospital staff (doctors, nurses, front office) to:
 * - Create new inpatient admission
 * - Convert OPD consultation to inpatient
 * - Convert ER visit to inpatient
 */

import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import api from '@/utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  User, Bed, Stethoscope, Shield, Building2, AlertCircle,
  CheckCircle2, Loader2, ArrowLeft, Search
} from 'lucide-react';

type AdmissionType = 'elective' | 'emergency' | 'op_converted' | 'corporate' | 'day_care';

interface FormData {
  patientId: string;
  patientName: string;
  admissionType: AdmissionType;
  admissionDiagnosis: string;
  admittingDoctorId: string;
  wardPreference: string;
  expectedLosDays: string;
  mlcCase: boolean;
  insuranceClaimId: string;
  corporateAccountId: string;
  depositAmount: string;
  notes: string;
  sourceConsultationId: string;
  sourceErId: string;
}

const ADMISSION_TYPES: { value: AdmissionType; label: string; description: string }[] = [
  { value: 'elective', label: 'Elective', description: 'Planned surgery or admission' },
  { value: 'emergency', label: 'Emergency', description: 'Urgent/emergency admission' },
  { value: 'op_converted', label: 'OPD → IPD', description: 'OPD visit converted to inpatient' },
  { value: 'corporate', label: 'Corporate', description: 'Employer / factory referral' },
  { value: 'day_care', label: 'Day Care', description: 'Same-day procedure' },
];

export default function AdmitPatientForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [form, setForm] = useState<FormData>({
    patientId: searchParams.get('patientId') || '',
    patientName: searchParams.get('name') ? decodeURIComponent(searchParams.get('name')!) : '',
    admissionType: (searchParams.get('type') as AdmissionType) || 'elective',
    admissionDiagnosis: '',
    admittingDoctorId: '',
    wardPreference: 'general',
    expectedLosDays: '4',
    mlcCase: searchParams.get('mlc') === 'true',
    insuranceClaimId: '',
    corporateAccountId: '',
    depositAmount: '',
    notes: '',
    sourceConsultationId: searchParams.get('consultationId') || '',
    sourceErId: searchParams.get('erId') || '',
  });

  const [allocatedBed, setAllocatedBed] = useState<{ id: number; bed_number: string; ward_name: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [bedSearching, setBedSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ admissionNumber: string; bedNumber: string; wardName: string } | null>(null);

  const set = (field: keyof FormData, value: string | boolean) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const searchBed = async () => {
    setBedSearching(true);
    setAllocatedBed(null);
    try {
      const res = await api.post('/v1/beds/allocate', {
        wardType: form.wardPreference,
        isCritical: form.admissionType === 'emergency',
      });
      const json = res.data;
      if (json.success && json.data) {
        setAllocatedBed({ id: json.data.id, bed_number: json.data.bed_number, ward_name: json.data.ward_name });
      } else {
        setError('No beds available for the selected ward type');
      }
    } catch {
      setError('Could not check bed availability');
    }
    setBedSearching(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.patientId || !form.admissionDiagnosis) {
      setError('Patient ID and admission diagnosis are required');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      let endpoint = '/v1/adt/admit';
      if (form.sourceErId) endpoint = '/v1/adt/er-to-ip';
      else if (form.sourceConsultationId || form.admissionType === 'op_converted') endpoint = '/v1/adt/convert-op-to-ip';

      const res = await api.post(endpoint, {
        patientId: parseInt(form.patientId),
        admissionType: form.admissionType,
        admissionDiagnosis: form.admissionDiagnosis,
        admittingDoctorId: form.admittingDoctorId ? parseInt(form.admittingDoctorId) : undefined,
        bedId: allocatedBed?.id,
        expectedLosDays: parseInt(form.expectedLosDays) || 4,
        mlcCase: form.mlcCase,
        insuranceClaimId: form.insuranceClaimId ? parseInt(form.insuranceClaimId) : undefined,
        corporateAccountId: form.corporateAccountId ? parseInt(form.corporateAccountId) : undefined,
        depositAmount: form.depositAmount ? parseFloat(form.depositAmount) : 0,
        notes: form.notes,
        sourceConsultationId: form.sourceConsultationId ? parseInt(form.sourceConsultationId) : undefined,
        erRecordId: form.sourceErId ? parseInt(form.sourceErId) : undefined,
        consultationId: form.sourceConsultationId ? parseInt(form.sourceConsultationId) : undefined,
      });
      const json = res.data;
      if (json.success) {
        setSuccess({
          admissionNumber: json.data.admission_number,
          bedNumber: allocatedBed?.bed_number || 'TBD',
          wardName: allocatedBed?.ward_name || 'TBD'
        });
      } else {
        setError(json.message || 'Admission failed');
      }
    } catch {
      setError('Network error. Please try again.');
    }
    setLoading(false);
  };

  if (success) {
    return (
      <HospitalLayout>
        <div className="p-6 max-w-md mx-auto">
          <Card className="border shadow-sm text-center">
            <CardContent className="p-8 space-y-4">
              <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto" />
              <h2 className="text-xl font-bold text-slate-800">Admission Successful</h2>
              <div className="bg-slate-50 rounded-lg p-4 text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Admission No</span>
                  <span className="font-bold text-slate-800">{success.admissionNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Ward</span>
                  <span className="font-medium">{success.wardName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Bed</span>
                  <span className="font-medium">{success.bedNumber}</span>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => navigate('/hospital/ward')}>
                  Ward Dashboard
                </Button>
                <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => navigate('/hospital/ot/schedule')}>
                  Schedule OT
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </HospitalLayout>
    );
  }

  return (
    <HospitalLayout>
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Admit Patient</h1>
            <p className="text-sm text-slate-500">Create inpatient admission record</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Patient Identity */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <User className="h-4 w-4 text-blue-600" /> Patient Identity
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Patient ID *</label>
                  <Input value={form.patientId} onChange={e => set('patientId', e.target.value)}
                    placeholder="Patient ID" required className="h-9" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Patient Name</label>
                  <Input value={form.patientName} onChange={e => set('patientName', e.target.value)}
                    placeholder="Full name" className="h-9" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Admission Type */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Stethoscope className="h-4 w-4 text-teal-600" /> Admission Details
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-2">Admission Type *</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {ADMISSION_TYPES.map(t => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => set('admissionType', t.value)}
                      className={`p-2 rounded-lg border text-left transition-all ${
                        form.admissionType === t.value
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-slate-200 hover:border-slate-300 text-slate-600'
                      }`}
                    >
                      <div className="text-xs font-semibold">{t.label}</div>
                      <div className="text-xs opacity-70 mt-0.5">{t.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Admission Diagnosis *</label>
                <Input value={form.admissionDiagnosis} onChange={e => set('admissionDiagnosis', e.target.value)}
                  placeholder="e.g. Acute appendicitis, Unstable angina..." required className="h-9" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Attending Doctor ID</label>
                  <Input value={form.admittingDoctorId} onChange={e => set('admittingDoctorId', e.target.value)}
                    placeholder="Doctor ID" className="h-9" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Expected LOS (days)</label>
                  <Input value={form.expectedLosDays} onChange={e => set('expectedLosDays', e.target.value)}
                    type="number" min="1" className="h-9" />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" id="mlc" checked={form.mlcCase} onChange={e => set('mlcCase', e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300" />
                <label htmlFor="mlc" className="text-sm text-slate-600">Medico-Legal Case (MLC)</label>
              </div>
            </CardContent>
          </Card>

          {/* Bed Allocation */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Bed className="h-4 w-4 text-purple-600" /> Bed Allocation
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="text-xs font-medium text-slate-600 block mb-1">Ward Preference</label>
                  <select
                    value={form.wardPreference}
                    onChange={e => set('wardPreference', e.target.value)}
                    className="w-full h-9 rounded-md border border-slate-300 px-2 text-sm bg-white"
                  >
                    {['general','private','semi_private','icu','day_care'].map(w => (
                      <option key={w} value={w}>{w.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                    ))}
                  </select>
                </div>
                <Button type="button" variant="outline" onClick={searchBed} disabled={bedSearching} className="h-9 gap-1 shrink-0">
                  {bedSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                  {allocatedBed ? 'Re-search' : 'Find Bed'}
                </Button>
              </div>

              {allocatedBed && (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <div className="text-sm">
                    <span className="font-semibold text-emerald-700">Bed {allocatedBed.bed_number}</span>
                    <span className="text-emerald-600"> · {allocatedBed.ward_name}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Financial */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Shield className="h-4 w-4 text-amber-600" /> Financial & Insurance
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Insurance Claim ID</label>
                  <Input value={form.insuranceClaimId} onChange={e => set('insuranceClaimId', e.target.value)}
                    placeholder="Optional" className="h-9" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Corporate Account ID</label>
                  <Input value={form.corporateAccountId} onChange={e => set('corporateAccountId', e.target.value)}
                    placeholder="Optional" className="h-9" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Deposit Collected (₹)</label>
                <Input value={form.depositAmount} onChange={e => set('depositAmount', e.target.value)}
                  type="number" placeholder="0" className="h-9" />
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card className="border shadow-sm">
            <CardContent className="p-4">
              <label className="text-xs font-medium text-slate-600 block mb-1">Clinical Notes</label>
              <textarea
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                placeholder="Additional clinical notes..."
                rows={3}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </CardContent>
          </Card>

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base gap-2"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
            {loading ? 'Creating Admission...' : 'Confirm Admission'}
          </Button>
        </form>
      </div>
    </HospitalLayout>
  );
}
