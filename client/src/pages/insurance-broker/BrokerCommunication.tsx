import React from 'react';
import CommunicationModule from '@/components/shared/CommunicationModule';
import { useAuth } from '@/auth/AuthProvider';

const BrokerCommunication: React.FC = () => {
  const { currentUser } = useAuth();

  return (
    <div className="p-6">
      <CommunicationModule
        userType="broker"
        userId={currentUser?.id}
        organizationId={currentUser?.organizationId}
      />
    </div>
  );
};

export default BrokerCommunication;
