import React, { useEffect, useState } from 'react';
import api from '@/utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Users, Search } from 'lucide-react';

interface Patient {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  age?: number;
  ward?: string;
  bedNumber?: string;
  condition?: string;
}

const NursePatients: React.FC = () => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const fetchPatients = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('nurseToken');
      const { data } = await api.get('/nurse/patients', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (data.success) {
        setPatients(data.patients || []);
      } else {
        setError('Failed to load patients');
      }
    } catch (e: any) {
      console.error('Fetch nurse patients error:', e);
      setError(e.response?.data?.message || 'Unable to load patients');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, []);

  const filtered = patients.filter(p => {
    const term = search.toLowerCase();
    const fullName = (p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim()).toLowerCase();
    return (
      fullName.includes(term) ||
      (p.email || '').toLowerCase().includes(term) ||
      (p.phoneNumber || '').includes(term)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Users className="h-6 w-6" /> Patients</h1>
        <div className="flex items-center gap-2">
          <Input placeholder="Search by name, email, phone" value={search} onChange={e => setSearch(e.target.value)} className="w-72" />
          <Button variant="outline" onClick={fetchPatients}>
            <Search className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <p className="text-muted-foreground">Loading patients...</p>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground">No patients found.</p>
        ) : (
          filtered.map(p => (
            <Card key={p.id} className="group transition-all duration-500 hover:shadow-xl bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20 backdrop-blur-xl relative overflow-hidden">
              <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 100% 100%, rgba(59, 130, 246, 0.05) 0%, transparent 50%)' }} />
              <CardHeader className="relative">
                <CardTitle className="text-base flex items-center gap-2">
                  {p.name || ((p.firstName || 'Patient') + ' ' + (p.lastName || '')).trim()}
                </CardTitle>
              </CardHeader>
              <CardContent className="relative text-sm space-y-1">
                {p.email && <p>Email: {p.email}</p>}
                {p.phoneNumber && <p>Phone: {p.phoneNumber}</p>}
                {p.ward && <p>Ward: {p.ward}</p>}
                {p.bedNumber && <p>Bed: {p.bedNumber}</p>}
                {p.condition && <p>Condition: {p.condition}</p>}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default NursePatients;
