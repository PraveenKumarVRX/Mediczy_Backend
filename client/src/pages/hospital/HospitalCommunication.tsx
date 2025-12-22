import React from 'react';
import CommunicationModule from '@/components/shared/CommunicationModule';
import { useAuth } from '@/auth/AuthProvider';

const HospitalCommunication: React.FC = () => {
  const { currentUser } = useAuth();

  return (
    <div className="p-6">
      <CommunicationModule
        userType="hospital"
        userId={currentUser?.id}
        organizationId={currentUser?.organizationId}
      />
    </div>
  );
};

export default HospitalCommunication;
