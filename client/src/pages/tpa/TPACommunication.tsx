import React, { useEffect, useState } from 'react';
import CommunicationModule from '@/components/shared/CommunicationModule';
import TPASidebar from '@/components/tpa/TPASidebar';
import { useNavigate } from 'react-router-dom';
import { Shield } from 'lucide-react';

const TPACommunication: React.FC = () => {
  const navigate = useNavigate();
  const [tpaData, setTpaData] = useState<any>(null);

  useEffect(() => {
    // Check authentication
    const token = localStorage.getItem('tpaToken');
    if (!token) {
      navigate('/tpa/login');
      return;
    }

    // Get TPA data from localStorage
    const storedData = localStorage.getItem('tpaData');
    if (storedData) {
      setTpaData(JSON.parse(storedData));
    }
  }, [navigate]);

  return (
    <div className="flex h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Sidebar */}
      <TPASidebar />

      {/* Main Content */}
      <div className="flex-1 md:ml-64 overflow-auto">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
          <div className="px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Shield className="h-8 w-8 text-blue-600" />
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Communication Center</h1>
                  <p className="text-sm text-gray-600">
                    Manage messages and notifications
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">
                  {tpaData?.contact_person_name || `${tpaData?.firstName} ${tpaData?.lastName}`}
                </p>
                <p className="text-xs text-gray-600">{tpaData?.email}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="px-4 sm:px-6 lg:px-8 py-8">
          <CommunicationModule
            userType="tpa"
            userId={tpaData?.id}
            organizationId={tpaData?.id}
          />
        </main>
      </div>
    </div>
  );
};

export default TPACommunication;
