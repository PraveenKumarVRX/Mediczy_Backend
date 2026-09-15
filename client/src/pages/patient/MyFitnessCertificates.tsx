import { useEffect, useState } from 'react';
import { ShieldCheck, FileDown, Loader2, CheckCircle2, AlertTriangle, XCircle, CalendarDays } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';

interface Certificate {
  id: number;
  employer_name: string;
  certificate_type: string;
  fitness_status: string;
  examination_date: string;
  valid_from: string;
  valid_until: string;
  issued_by: string;
  restrictions: string | null;
  created_at: string;
}

const STATUS_META: Record<string, { label: string; icon: any; className: string }> = {
  fit: { label: 'Fit for duty', icon: CheckCircle2, className: 'text-green-600 border-green-500/30 bg-green-500/5' },
  fit_with_restrictions: { label: 'Fit — with restrictions', icon: ShieldCheck, className: 'text-amber-600 border-amber-500/30 bg-amber-500/5' },
  temporarily_unfit: { label: 'Temporarily unfit', icon: AlertTriangle, className: 'text-orange-600 border-orange-500/30 bg-orange-500/5' },
  unfit: { label: 'Unfit for duty', icon: XCircle, className: 'text-red-600 border-red-500/30 bg-red-500/5' },
};

const MyFitnessCertificates = () => {
  const { toast } = useToast();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/user/fitness-certificates')
      .then((r) => setCertificates(r.data?.data || []))
      .catch((err) => console.error('Failed to load certificates', err))
      .finally(() => setLoading(false));
  }, []);

  const download = (id: number) => {
    api.get(`/user/fitness-certificates/${id}/pdf`, { responseType: 'blob' })
      .then((res) => {
        const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
        const a = document.createElement('a');
        a.href = url; a.download = `fitness-certificate-${id}.pdf`; a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => toast({ title: 'Download failed', variant: 'destructive' }));
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-emerald-500" />
          My Fitness Certificates
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">Medical Examination Reports and General Fitness Certificates issued to you.</p>
      </div>

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : certificates.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No certificates yet"
          description="Certificates issued after a health camp or clinic visit will show up here."
        />
      ) : (
        <div className="space-y-3">
          {certificates.map((c) => {
            const meta = STATUS_META[c.fitness_status] || { label: c.fitness_status, icon: ShieldCheck, className: 'text-muted-foreground border-border' };
            const Icon = meta.icon;
            return (
              <Card key={c.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <CardTitle className="text-base">{c.employer_name || 'Fitness Certificate'}</CardTitle>
                      <CardDescription className="flex items-center gap-1.5 mt-1">
                        <CalendarDays className="h-3.5 w-3.5" />
                        Examined {new Date(c.examination_date).toLocaleDateString()} by {c.issued_by}
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className={`text-xs py-1 px-2.5 ${meta.className}`}>
                      <Icon className="h-3.5 w-3.5 mr-1" />
                      {meta.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {c.restrictions && (
                    <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Restrictions:</span> {c.restrictions}</p>
                  )}
                  <div className="flex items-center justify-between pt-2">
                    <p className="text-xs text-muted-foreground">
                      Valid {new Date(c.valid_from).toLocaleDateString()} – {new Date(c.valid_until).toLocaleDateString()}
                    </p>
                    <Button size="sm" variant="outline" onClick={() => download(c.id)}>
                      <FileDown className="h-3.5 w-3.5 mr-1" /> Download PDF
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MyFitnessCertificates;
