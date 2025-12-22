import { useEffect } from 'react';
import MainLayout from "@/components/layout/MainLayoutdoctor";

const HealthMonitoringDashboardWrapper = () => {
  useEffect(() => {
    // Debug logging
    console.log('🏥 Health Monitoring Dashboard Loaded');
    console.log('📍 Current path:', window.location.pathname);
    console.log('🔑 userType:', localStorage.getItem('userType'));
    console.log('🔑 doctorToken:', localStorage.getItem('doctorToken') ? 'Present' : 'Missing');
    console.log('🔑 token:', localStorage.getItem('token') ? 'Present' : 'Missing');
  }, []);

  return (
    <MainLayout>
      <div className="p-6">
        <h1 className="text-xl font-semibold">Health Monitoring</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This dashboard is currently unavailable.
        </p>
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-md text-sm">
          <p className="font-semibold text-blue-900">Debug Info:</p>
          <p className="text-blue-800">If you're seeing this page, the route is working correctly!</p>
          <p className="text-blue-800 mt-2">Check the browser console (F12) for authentication details.</p>
        </div>
      </div>
    </MainLayout>
  );
};

export default HealthMonitoringDashboardWrapper;
