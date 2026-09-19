/**
 * Patient Engagement Portal — Screen 2: Patient Login
 * MVP shell. Clinic is already selected on the previous screen (ClinicSearch)
 * and passed via router state; POST /api/patient/login needs it to resolve
 * which tenant's patient record to authenticate against.
 */
import { useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import api from '@/utils/api';

interface LocationState {
  clinic_id?: number | string;
  clinic_name?: string;
}

export default function PatientLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { clinic_id, clinic_name } = (location.state as LocationState) || {};

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinic_id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.post(
        '/patient/login',
        { clinic_id, email, password },
        { skipAuth: true } as any
      );
      const { token, patient } = res.data?.data || {};
      if (!token) {
        throw new Error('Login response missing token');
      }
      localStorage.setItem('patientToken', token);
      localStorage.setItem('patientData', JSON.stringify(patient || {}));
      navigate('/patient-portal/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  if (!clinic_id) {
    return (
      <div className="min-h-screen bg-sky-50 flex items-center justify-center px-4">
        <Card className="w-full max-w-sm bg-white">
          <CardContent className="p-6 text-center space-y-4">
            <p className="text-slate-700">No clinic selected yet.</p>
            <Link to="/patient-portal" className="text-sky-700 underline text-sm">
              Find your clinic
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-sky-50 flex items-center justify-center px-4">
      <Card className="w-full max-w-sm bg-white">
        <CardHeader>
          <CardTitle className="text-xl text-sky-900">Sign in</CardTitle>
          <p className="text-sm text-slate-500">{clinic_name}</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>

            <p className="text-center text-sm text-slate-500">
              <Link to="/patient-portal" className="text-sky-700 underline">
                Wrong clinic?
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
