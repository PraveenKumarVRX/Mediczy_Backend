import { useState } from 'react';
import api from '@/utils/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';

interface BulkResult { message: string; count?: number }

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [doctorsJson, setDoctorsJson] = useState('');
  const [labsJson, setLabsJson] = useState('');
  const [pharmaciesJson, setPharmaciesJson] = useState('');
  const [result, setResult] = useState<BulkResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const token = localStorage.getItem('adminToken');

  if (!token) {
    return (
      <div className="container mx-auto py-10">
        <Card>
          <CardHeader><CardTitle>Unauthorized</CardTitle></CardHeader>
          <CardContent>
            <p className="mb-4">You must login as admin.</p>
            <Button onClick={()=>navigate('/admin/login')}>Go to Admin Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const postBulk = async (path: string, payload: any) => {
    setLoading(true); setError(null); setResult(null);
    try {
      const { data } = await api.post(path, payload, { headers: { Authorization: `Bearer ${token}` } });
      setResult(data);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Upload failed');
    } finally { setLoading(false); }
  };

  const handleDoctorsUpload = () => {
    try {
      const parsed = JSON.parse(doctorsJson);
      postBulk('/admin/masters/doctors', { doctors: parsed });
    } catch { setError('Invalid JSON for doctors'); }
  };
  const handleLabsUpload = () => {
    try { const parsed = JSON.parse(labsJson); postBulk('/admin/masters/labs', { labs: parsed }); } catch { setError('Invalid JSON for labs'); }
  };
  const handlePharmaciesUpload = () => {
    try { const parsed = JSON.parse(pharmaciesJson); postBulk('/admin/masters/pharmacies', { pharmacies: parsed }); } catch { setError('Invalid JSON for pharmacies'); }
  };

  return (
    <div className="container mx-auto py-10 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Admin Master Uploads</h1>
        <div className="space-x-2">
          <Button variant="secondary" onClick={()=>window.open('https://github.com','_blank')}>Docs</Button>
          <Button variant="destructive" onClick={()=>{ localStorage.removeItem('adminToken'); navigate('/admin/login'); }}>Logout</Button>
        </div>
      </div>
      {error && <div className="text-red-600">{error}</div>}
      {result && <div className="text-green-600">{result.message}{result.count!==undefined?` (Count: ${result.count})`:''}</div>}
      <div className="grid md:grid-cols-3 gap-6">
        <Card>
          <CardHeader><CardTitle>Doctors JSON</CardTitle></CardHeader>
          <CardContent>
            <Textarea placeholder='[ { "firstName": "Alice", "lastName": "Doe", "email": "alice@example.com" } ]' value={doctorsJson} onChange={e=>setDoctorsJson(e.target.value)} className="h-48" />
            <Button className="mt-2 w-full" disabled={loading} onClick={handleDoctorsUpload}>Upload Doctors</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Labs JSON</CardTitle></CardHeader>
          <CardContent>
            <Textarea placeholder='[ { "name": "City Lab", "email": "lab@example.com" } ]' value={labsJson} onChange={e=>setLabsJson(e.target.value)} className="h-48" />
            <Button className="mt-2 w-full" disabled={loading} onClick={handleLabsUpload}>Upload Labs</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Pharmacies JSON</CardTitle></CardHeader>
          <CardContent>
            <Textarea placeholder='[ { "name": "Main Pharmacy", "email": "pharm@example.com" } ]' value={pharmaciesJson} onChange={e=>setPharmaciesJson(e.target.value)} className="h-48" />
            <Button className="mt-2 w-full" disabled={loading} onClick={handlePharmaciesUpload}>Upload Pharmacies</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboard;
