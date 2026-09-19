/**
 * Patient Engagement Portal — Screen 1: Clinic Search
 * MVP shell (per implementation plan, deferred as a smaller stub module).
 * A patient picks which clinic/tenant they belong to before logging in,
 * since GET /api/patient/login is a single multi-tenant endpoint.
 *
 * Not SaMD: administrative/booking-adjacent, no clinical decision content.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import api from '@/utils/api';

interface ClinicResult {
  id: number | string;
  name: string;
  slug?: string;
  type?: string;
  city?: string | null;
  state?: string | null;
}

export default function ClinicSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ClinicResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const res = await api.get('/patient/clinics/search', {
        params: { query },
        skipAuth: true,
      } as any);
      const clinics = res.data?.data?.clinics ?? [];
      setResults(clinics);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not search clinics. Please try again.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (clinic: ClinicResult) => {
    navigate('/patient-portal/login', {
      state: { clinic_id: clinic.id, clinic_name: clinic.name },
    });
  };

  return (
    <div className="min-h-screen bg-sky-50 flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-xl">
        <header className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-sky-900">Patient Portal</h1>
          <p className="text-sm text-sky-700 mt-1">
            Find your clinic to view your appointments and reports.
          </p>
        </header>

        <form onSubmit={handleSearch} className="flex gap-2 mb-6">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by clinic name or city..."
            className="bg-white"
          />
          <Button type="submit" disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </Button>
        </form>

        {error && (
          <p className="text-sm text-red-600 mb-4 text-center">{error}</p>
        )}

        <div className="space-y-3">
          {results.map((clinic) => (
            <Card
              key={clinic.id}
              className="cursor-pointer hover:shadow-md transition-shadow bg-white"
              onClick={() => handleSelect(clinic)}
            >
              <CardContent className="p-4">
                <p className="font-medium text-slate-900">{clinic.name}</p>
                <p className="text-sm text-slate-500">
                  {[clinic.type, clinic.city, clinic.state].filter(Boolean).join(' · ') || 'Clinic'}
                </p>
              </CardContent>
            </Card>
          ))}

          {!loading && searched && results.length === 0 && !error && (
            <p className="text-sm text-slate-500 text-center">
              No clinics found. Try a different search.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
