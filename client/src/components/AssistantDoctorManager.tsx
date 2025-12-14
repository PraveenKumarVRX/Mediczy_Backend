import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Users, 
  UserPlus, 
  UserMinus, 
  Star,
  AlertCircle,
  CheckCircle,
  Stethoscope
} from 'lucide-react';
import axios from 'axios';

interface Doctor {
  id: string;
  name: string;
  specialty?: string;
  email?: string;
  phone?: string;
  isPrimary?: boolean;
}

interface AssistantDoctorManagerProps {
  assistantId: string;
  role: 'admin' | 'assistant';
}

const AssistantDoctorManager = ({ assistantId, role }: AssistantDoctorManagerProps) => {
  const [linkedDoctors, setLinkedDoctors] = useState<Doctor[]>([]);
  const [availableDoctors, setAvailableDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const apiUrl = import.meta.env.VITE_API_URL || '/api';

  useEffect(() => {
    fetchLinkedDoctors();
    if (role === 'admin') {
      fetchAvailableDoctors();
    }
  }, [assistantId]);

  const fetchLinkedDoctors = async () => {
    try {
      const tokenKey = role === 'admin' ? 'token' : 'assistantToken';
      const token = localStorage.getItem(tokenKey);
      
      const { data } = await axios.get(
        `${apiUrl}/assistant/linked-doctors`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (data.success) {
        setLinkedDoctors(data.doctors || []);
      }
    } catch (err: any) {
      console.error('Error fetching linked doctors:', err);
      setError(err.response?.data?.message || 'Failed to load linked doctors');
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableDoctors = async () => {
    try {
      const token = localStorage.getItem('token');
      
      // Mock available doctors - in production, fetch from /api/doctors
      const mockDoctors = [
        { id: 'doc_002', name: 'Dr. Sarah Johnson', specialty: 'Cardiology' },
        { id: 'doc_003', name: 'Dr. James Wilson', specialty: 'Pediatrics' },
        { id: 'doc_004', name: 'Dr. Emily Chen', specialty: 'Dermatology' },
        { id: 'doc_005', name: 'Dr. Robert Brown', specialty: 'Orthopedics' },
        { id: 'doc_006', name: 'Dr. Lisa Anderson', specialty: 'Neurology' },
      ];
      
      setAvailableDoctors(mockDoctors);
    } catch (err) {
      console.error('Error fetching available doctors:', err);
    }
  };

  const linkDoctor = async (doctorId: string, setPrimary: boolean = false) => {
    setActionLoading(doctorId);
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('token');
      
      const { data } = await axios.post(
        `${apiUrl}/assistant/link-doctor`,
        { assistantId, doctorId, setPrimary },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (data.success) {
        setSuccess('Doctor linked successfully!');
        await fetchLinkedDoctors();
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (err: any) {
      console.error('Error linking doctor:', err);
      if (err.response?.status === 400 && err.response?.data?.message?.includes('maximum')) {
        setError('Cannot link more doctors. Maximum 5 doctors allowed. Remove one to add another.');
      } else {
        setError(err.response?.data?.message || 'Failed to link doctor');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const unlinkDoctor = async (doctorId: string) => {
    if (!confirm('Are you sure you want to unlink this doctor?')) {
      return;
    }

    setActionLoading(doctorId);
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('token');
      
      const { data } = await axios.post(
        `${apiUrl}/assistant/unlink-doctor`,
        { assistantId, doctorId },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (data.success) {
        setSuccess('Doctor unlinked successfully!');
        await fetchLinkedDoctors();
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (err: any) {
      console.error('Error unlinking doctor:', err);
      setError(err.response?.data?.message || 'Failed to unlink doctor');
    } finally {
      setActionLoading(null);
    }
  };

  const setPrimaryDoctor = async (doctorId: string) => {
    setActionLoading(doctorId);
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('token');
      
      const { data } = await axios.post(
        `${apiUrl}/assistant/set-primary-doctor`,
        { assistantId, doctorId },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (data.success) {
        setSuccess('Primary doctor updated!');
        await fetchLinkedDoctors();
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (err: any) {
      console.error('Error setting primary doctor:', err);
      setError(err.response?.data?.message || 'Failed to set primary doctor');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="bg-green-50 text-green-800 border-green-200">
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {/* Linked Doctors */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              <CardTitle>Linked Doctors</CardTitle>
            </div>
            <Badge variant="outline">
              {linkedDoctors.length} / 5 doctors
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {linkedDoctors.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              No doctors linked yet
            </p>
          ) : (
            <div className="space-y-3">
              {linkedDoctors.map((doctor) => (
                <Card key={doctor.id} className="border-2">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="bg-blue-100 dark:bg-blue-900 p-2 rounded-full">
                          <Stethoscope className="h-4 w-4 text-blue-600" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{doctor.name}</p>
                            {doctor.isPrimary && (
                              <Badge variant="default" className="bg-yellow-500">
                                <Star className="h-3 w-3 mr-1" />
                                Primary
                              </Badge>
                            )}
                          </div>
                          {doctor.specialty && (
                            <p className="text-sm text-muted-foreground">
                              {doctor.specialty}
                            </p>
                          )}
                        </div>
                      </div>
                      
                      {role === 'admin' && (
                        <div className="flex gap-2">
                          {!doctor.isPrimary && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setPrimaryDoctor(doctor.id)}
                              disabled={actionLoading === doctor.id}
                            >
                              <Star className="h-3 w-3 mr-1" />
                              Set Primary
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => unlinkDoctor(doctor.id)}
                            disabled={actionLoading === doctor.id}
                          >
                            <UserMinus className="h-3 w-3 mr-1" />
                            Remove
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Available Doctors (Admin only) */}
      {role === 'admin' && linkedDoctors.length < 5 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              <CardTitle>Add Doctor</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">
              Select a doctor to link (maximum 5 doctors per assistant)
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {availableDoctors
                .filter(doc => !linkedDoctors.some(ld => ld.id === doc.id))
                .map((doctor) => (
                  <Card key={doctor.id} className="border">
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="bg-gray-100 dark:bg-gray-800 p-2 rounded-full">
                            <Stethoscope className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-medium">{doctor.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {doctor.specialty}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => linkDoctor(doctor.id, linkedDoctors.length === 0)}
                            disabled={actionLoading === doctor.id}
                          >
                            <UserPlus className="h-3 w-3 mr-1" />
                            {linkedDoctors.length === 0 ? 'Add as Primary' : 'Add'}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AssistantDoctorManager;
