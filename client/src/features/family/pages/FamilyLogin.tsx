import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { HeartPulse, Loader2 } from 'lucide-react';
import { verifyFamilyAccess } from '@/services/careos.service';

/** Family portal login — patient ID + access code (shared by care team) */
export default function FamilyLogin() {
  const navigate = useNavigate();
  const [patientId, setPatientId] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pid = Number(patientId);
    if (!pid || Number.isNaN(pid)) {
      setError('Enter a valid patient ID from your care team.');
      return;
    }
    if (!accessCode.trim()) {
      setError('Enter the access code shared by the hospital.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await verifyFamilyAccess(pid, accessCode.trim());
      if (!res?.success) {
        setError(res?.message || 'Invalid access code.');
        return;
      }
      sessionStorage.setItem('family_patient_id', String(pid));
      sessionStorage.setItem('family_access', accessCode.trim());
      navigate(`/family/patient/${pid}`);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not verify access. Check your code and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-rose-50 to-white p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <HeartPulse className="h-10 w-10 text-rose-500 mx-auto mb-2" />
          <CardTitle>Family Care Portal</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            View plain-language updates about your loved one&apos;s hospital stay.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Patient ID</label>
              <Input
                placeholder="Provided by nurse"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Access code</label>
              <Input
                type="password"
                placeholder="Last 4 digits of registered mobile"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                className="mt-1"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full bg-rose-600 hover:bg-rose-700" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'View updates'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
