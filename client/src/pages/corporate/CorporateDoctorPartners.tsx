import React, { useEffect, useState } from 'react';
import { Stethoscope, Search, Star } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import api from '@/utils/api';
import { useToast } from '@/hooks/use-toast';
import CorporateLayout from '@/components/corporate/CorporateLayout';
import CorporatePageHeader from '@/components/corporate/CorporatePageHeader';

interface Doctor {
  id: number;
  name: string;
  specialization: string | null;
  fee: number | null;
  rating: number | null;
  status: string;
  avatar: string | null;
  registrationNumber: string | null;
}

const CorporateDoctorPartners: React.FC = () => {
  const { toast } = useToast();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [search, setSearch] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/corporate/doctors', { params: { search, specialization } });
      setDoctors(data?.data?.doctors || []);
    } catch (error: any) {
      toast({ title: 'Failed to load doctors', description: error?.response?.data?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, specialization]);

  return (
    <CorporateLayout>
      <CorporatePageHeader
        title="Doctor Partners"
        description="Browse doctors available for employee teleconsultations and appointments."
        icon={Stethoscope}
      />

      <div className="p-6 space-y-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <Input
              placeholder="Search by doctor name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Input
            placeholder="Filter by specialization..."
            value={specialization}
            onChange={(e) => setSpecialization(e.target.value)}
            className="max-w-xs"
          />
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Loading doctors...</p>
        ) : doctors.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-slate-500">
              No doctors match your search.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {doctors.map((doc) => (
              <Card key={doc.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm">{doc.name}</p>
                    <Badge variant="outline" className="text-xs">{doc.status}</Badge>
                  </div>
                  <p className="text-sm text-slate-500">{doc.specialization || 'General Physician'}</p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1 text-amber-500">
                      <Star className="h-3.5 w-3.5 fill-current" />
                      {doc.rating ? Number(doc.rating).toFixed(1) : 'N/A'}
                    </span>
                    {doc.fee != null && <span className="text-slate-500">₹{doc.fee} / consult</span>}
                  </div>
                  {doc.registrationNumber && (
                    <p className="text-xs text-slate-400">Reg. No: {doc.registrationNumber}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </CorporateLayout>
  );
};

export default CorporateDoctorPartners;
