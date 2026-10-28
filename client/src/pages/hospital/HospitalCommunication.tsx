import React from 'react';
import CommunicationModule from '@/components/shared/CommunicationModule';
import { useAuth } from '@/auth/AuthProvider';
import HospitalLayout from '@/components/hospital/HospitalLayout';

const HospitalCommunication: React.FC = () => {
  const { currentUser } = useAuth();

  return (
    <HospitalLayout title="Communication Hub" subtitle="Messages, calls, and notifications">
      <CommunicationModule
        userType="hospital"
        userId={currentUser?.id == null ? undefined : String(currentUser.id)}
        organizationId={currentUser?.organizationId}
      />
    </HospitalLayout>
  );
};

export default HospitalCommunication;
