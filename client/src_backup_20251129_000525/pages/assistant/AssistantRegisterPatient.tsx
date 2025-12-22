import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import PatientRegistrationForm from '@/components/PatientRegistrationForm';

const AssistantRegisterPatient = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-4">
      <div className="container mx-auto py-6">
        <Button 
          variant="ghost" 
          onClick={() => navigate('/assistant/dashboard')}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>

        <PatientRegistrationForm 
          role="assistant"
          onSuccess={() => navigate('/assistant/dashboard')}
          onCancel={() => navigate('/assistant/dashboard')}
        />
      </div>
    </div>
  );
};

export default AssistantRegisterPatient;
