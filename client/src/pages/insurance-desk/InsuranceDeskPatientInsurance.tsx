import { useState } from 'react';
import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ShieldCheck, ClipboardList, FileText, Building2, UserCheck,
  Search, BarChart3, Settings, HelpCircle, Loader2, CheckCircle2, XCircle,
} from 'lucide-react';
import api from '@/utils/api';

import { navSections } from './navSections';

interface PatientResult {
  id: number;
  firstName: string;
  lastName: string;
  email?: string;
  phoneNumber?: string;
  policyNumber?: string;
  insurerName?: string | null;
}

interface Eligibility {
  eligible?: boolean;
  isEligible?: boolean;
  coverageAmount?: number;
  remainingCoverage?: number;
  policyStatus?: string;
  message?: string;
}

const SEARCH_TYPES = [
  { value: 'name', label: 'Patient Name' },
  { value: 'mobile', label: 'Mobile Number' },
  { value: 'policy', label: 'Policy Number' },
  { value: 'uhid', label: 'UHID' },
  { value: 'abha', label: 'ABHA ID' },
];

const formatCurrency = (amount?: number) =>
  amount == null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

const InsuranceDeskPatientInsurance = () => {
  const [searchType, setSearchType] = useState('name');
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<PatientResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedPatient, setSelectedPatient] = useState<PatientResult | null>(null);
  const [policyNumber, setPolicyNumber] = useState('');
  const [checkingEligibility, setCheckingEligibility] = useState(false);
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [eligibilityError, setEligibilityError] = useState<string | null>(null);

  const search = async () => {
    if (!searchTerm.trim()) return;
    setSearching(true);
    setError(null);
    setResults([]);
    try {
      const { data } = await api.post('/hospital/insurance/patient/search', { searchTerm: searchTerm.trim(), searchType });
      setResults(data.patients || data.results || []);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Search failed.');
    } finally {
      setSearching(false);
    }
  };

  const checkEligibility = async (patient: PatientResult) => {
    const policy = patient.policyNumber || policyNumber;
    if (!policy) {
      setSelectedPatient(patient);
      setEligibility(null);
      setEligibilityError('Enter a policy number to check eligibility.');
      return;
    }
    setSelectedPatient(patient);
    setCheckingEligibility(true);
    setEligibilityError(null);
    setEligibility(null);
    try {
      const { data } = await api.get(`/hospital/insurance/patient/${patient.id}/eligibility`, {
        params: { policyNumber: policy, insuranceProvider: patient.insurerName || undefined },
      });
      setEligibility(data.eligibility || data);
    } catch (err: any) {
      setEligibilityError(err?.response?.data?.message || 'Could not check eligibility.');
    } finally {
      setCheckingEligibility(false);
    }
  };

  return (
    <HospDeptLayout deptKey="insurance-desk" deptName="Insurance Desk" badgeLabel="Ins. Desk"
      loginPath="/insurance-desk/login" DeptIcon={ShieldCheck} navSections={navSections}
      title="Patient Insurance" subtitle="Patient policy & beneficiary info" copilotModule="insurance">
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Find a Patient</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={searchType} onValueChange={setSearchType}>
              <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SEARCH_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              placeholder="Enter search value…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
              className="flex-1"
            />
            <Button onClick={search} disabled={searching} className="gap-1 bg-teal-600 hover:bg-teal-700">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Search
            </Button>
          </div>
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}

          {results.length > 0 && (
            <div className="overflow-x-auto mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Policy #</TableHead>
                    <TableHead>Insurer</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.firstName} {p.lastName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.phoneNumber || p.email || '—'}</TableCell>
                      <TableCell>{p.policyNumber || '—'}</TableCell>
                      <TableCell>{p.insurerName || '—'}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => checkEligibility(p)}>Check Eligibility</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {!searching && results.length === 0 && searchTerm && !error && (
            <p className="text-sm text-muted-foreground mt-3">No patients found. Try a different search term or type.</p>
          )}
        </CardContent>
      </Card>

      {selectedPatient && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Eligibility — {selectedPatient.firstName} {selectedPatient.lastName}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedPatient.policyNumber && (
              <div className="flex gap-2 mb-4">
                <Input
                  placeholder="Policy number"
                  value={policyNumber}
                  onChange={(e) => setPolicyNumber(e.target.value)}
                />
                <Button onClick={() => checkEligibility(selectedPatient)} disabled={checkingEligibility}>
                  {checkingEligibility ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Check'}
                </Button>
              </div>
            )}
            {checkingEligibility && (
              <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking eligibility…</div>
            )}
            {eligibilityError && <p className="text-sm text-red-600">{eligibilityError}</p>}
            {eligibility && (
              <div className="flex flex-wrap items-center gap-4">
                <Badge className={eligibility.eligible ?? eligibility.isEligible
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'} variant="outline">
                  {(eligibility.eligible ?? eligibility.isEligible) ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                  {(eligibility.eligible ?? eligibility.isEligible) ? 'Eligible' : 'Not Eligible'}
                </Badge>
                {eligibility.policyStatus && <span className="text-sm">Status: <strong>{eligibility.policyStatus}</strong></span>}
                {eligibility.coverageAmount != null && <span className="text-sm">Coverage: <strong>{formatCurrency(eligibility.coverageAmount)}</strong></span>}
                {eligibility.remainingCoverage != null && <span className="text-sm">Remaining: <strong>{formatCurrency(eligibility.remainingCoverage)}</strong></span>}
                {eligibility.message && <p className="text-sm text-muted-foreground w-full">{eligibility.message}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </HospDeptLayout>
  );
};

export default InsuranceDeskPatientInsurance;
