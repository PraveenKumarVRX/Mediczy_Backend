import React from 'react';
import CommunicationModule from '@/components/shared/CommunicationModule';
import { useAuth } from '@/auth/AuthProvider';

const InsuranceCommunication: React.FC = () => {
  const { currentUser } = useAuth();

  return (
    <div className="p-6">
      <CommunicationModule
        userType="insurer"
        userId={currentUser?.id == null ? undefined : String(currentUser.id)}
        organizationId={currentUser?.organizationId}
      />
    </div>
  );
};

export default InsuranceCommunication;
