import { useEffect, useState, useCallback } from 'react';
import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ShieldCheck, ClipboardList, FileText, Building2, UserCheck,
  Search, BarChart3, Settings, HelpCircle, RefreshCw, Loader2, AlertTriangle,
} from 'lucide-react';
import api from '@/utils/api';

const navSections: DeptNavSection[] = [
  { title: 'Overview', items: [{ icon: ShieldCheck, label: 'Dashboard', href: '/insurance-desk/dashboard' }] },
  { title: 'Claims & Auth', items: [
    { icon: ClipboardList, label: 'Pre-Authorization',   href: '/insurance-desk/pre-auth' },
    { icon: FileText,      label: 'Active Claims',       href: '/insurance-desk/claims' },
    { icon: FileText,      label: 'Documents',           href: '/insurance-desk/documents' },
  ]},
  { title: 'Management', items: [
    { icon: Building2,  label: 'TPA Management',      href: '/insurance-desk/tpa' },
    { icon: UserCheck,  label: 'Patient Insurance',   href: '/insurance-desk/patient-insurance' },
    { icon: Search,     label: 'Claim Search',        href: '/insurance-desk/search' },
  ]},
  { title: 'Reports', items: [
    { icon: BarChart3,  label: 'Analytics', href: '/insurance-desk/analytics' },
    { icon: Settings,   label: 'Settings',  href: '/insurance-desk/settings' },
    { icon: HelpCircle, label: 'Support',   href: '/insurance-desk/support' },
  ]},
];

interface MissingDoc {
  claimId: number;
  claimNumber: string;
  patientName: string;
  requiredDocuments: string[];
  uploadedDocuments: string[];
}

const InsuranceDeskDocuments = () => {
  const [rows, setRows] = useState<MissingDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/hospital/insurance/documents/missing');
      setRows(data.missingDocuments || []);
      if (data.degraded) setError(data.message || 'Document data may be unavailable.');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not load document status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <HospDeptLayout deptKey="insurance-desk" deptName="Insurance Desk" badgeLabel="Ins. Desk"
      loginPath="/insurance-desk/login" DeptIcon={ShieldCheck} navSections={navSections}
      title="Documents" subtitle="Claims with missing or incomplete documentation" copilotModule="insurance">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Incomplete Claim Documents</CardTitle>
          <Button variant="outline" size="sm" className="gap-1" onClick={load}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-amber-600 mb-3">{error}</p>}
          {loading ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-xl">
              <FileText className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">No claims are missing documents right now.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Claim #</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead>Still Missing</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const missing = row.requiredDocuments.filter((d) => !row.uploadedDocuments.includes(d));
                    return (
                      <TableRow key={row.claimId}>
                        <TableCell className="font-mono text-xs">{row.claimNumber}</TableCell>
                        <TableCell>{row.patientName}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {row.uploadedDocuments.length
                              ? row.uploadedDocuments.map((d) => <Badge key={d} variant="secondary">{d}</Badge>)
                              : <span className="text-muted-foreground text-sm">None</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {missing.map((d) => (
                              <Badge key={d} variant="outline" className="gap-1 border-amber-400 text-amber-700 dark:text-amber-300">
                                <AlertTriangle className="h-3 w-3" />{d}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </HospDeptLayout>
  );
};

export default InsuranceDeskDocuments;
