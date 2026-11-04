import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import api from '@/utils/api';

type CaseView = { status: string; positionTitle?: string | null; appointmentAt?: string | null; venue?: Record<string, unknown> };

export default function PreEmploymentConsent() {
  const { token } = useParams<{ token: string }>();
  const [caseView, setCaseView] = useState<CaseView | null>(null);
  const [candidateName, setCandidateName] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.get(`/pre-employment/invitations/${encodeURIComponent(token)}`, { skipAuth: true } as any)
      .then(({ data }) => { setCaseView(data.case); setCandidateName(data.candidateName || 'Candidate'); })
      .catch((error) => setMessage(error?.response?.data?.message || 'This invitation is invalid or has expired.'))
      .finally(() => setLoading(false));
  }, [token]);

  const submit = async () => {
    if (!token || !accepted) return;
    setSubmitting(true);
    try {
      await api.post(`/pre-employment/invitations/${encodeURIComponent(token)}/consent`, { accepted: true, consentVersion: 'peme-v1' }, { skipAuth: true } as any);
      setCaseView((current) => current ? { ...current, status: 'consented' } : current);
      setMessage('Consent recorded. The corporate health team will share appointment details separately.');
    } catch (error: any) {
      setMessage(error?.response?.data?.message || 'We could not record your consent. Please try again.');
    } finally { setSubmitting(false); }
  };

  return <main className="min-h-screen bg-slate-50 px-4 py-12 flex justify-center">
    <Card className="w-full max-w-xl self-start">
      <CardHeader><CardTitle>Pre-employment health check</CardTitle></CardHeader>
      <CardContent className="space-y-5 text-sm text-slate-700">
        {loading && <p>Loading secure invitation…</p>}
        {!loading && !caseView && <p className="text-red-700">{message}</p>}
        {!loading && caseView && <>
          <p>Hello {candidateName}. This assessment is part of a recruitment process. It is not an employee health-plan benefit and does not create an employee account.</p>
          {caseView.positionTitle && <p><span className="font-medium">Position:</span> {caseView.positionTitle}</p>}
          {caseView.status === 'consented' || caseView.status === 'scheduled' || caseView.status === 'completed' ? (
            <p className="rounded-md bg-emerald-50 p-3 text-emerald-800">{message || 'Your consent has already been recorded.'}</p>
          ) : <>
            <label className="flex gap-3 items-start cursor-pointer">
              <input className="mt-1" type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
              <span>I confirm that I have read the pre-employment health-check notice and consent to this assessment and the processing needed to administer it.</span>
            </label>
            {message && <p className="text-red-700">{message}</p>}
            <Button onClick={submit} disabled={!accepted || submitting}>{submitting ? 'Recording consent…' : 'Consent and continue'}</Button>
          </>}
        </>}
      </CardContent>
    </Card>
  </main>;
}
