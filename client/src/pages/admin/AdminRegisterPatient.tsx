import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import PatientRegistrationForm from '@/components/PatientRegistrationForm';

const AdminRegisterPatient = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!localStorage.getItem('adminToken')) {
      navigate('/admin/login', { replace: true });
    }
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="container mx-auto py-6">
        <Button 
          variant="ghost" 
          onClick={() => navigate('/admin/users')}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Users
        </Button>

        <PatientRegistrationForm 
          role="admin"
          onSuccess={() => navigate('/admin/users')}
          onCancel={() => navigate('/admin/users')}
        />
      </div>
    </div>
  );
};

export default AdminRegisterPatient;
