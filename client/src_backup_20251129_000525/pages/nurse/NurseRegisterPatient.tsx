import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import PatientRegistrationForm from '@/components/PatientRegistrationForm';

const NurseRegisterPatient = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-4">
      <div className="container mx-auto py-6">
        <Button 
          variant="ghost" 
          onClick={() => navigate('/nurse/dashboard')}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>

        <PatientRegistrationForm 
          role="nurse"
          onSuccess={() => navigate('/nurse/dashboard')}
          onCancel={() => navigate('/nurse/dashboard')}
        />
      </div>
    </div>
  );
};

export default NurseRegisterPatient;
