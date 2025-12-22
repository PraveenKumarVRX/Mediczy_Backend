import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminAuthGuard from '@/components/admin/AdminAuthGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Settings,
  Users,
  Stethoscope,
  Building2,
  RefreshCw,
  ExternalLink,
  Database,
  Server,
  Globe
} from 'lucide-react';

interface TestResult {
  name: string;
  status: 'success' | 'error' | 'warning' | 'pending';
  message: string;
  details?: any;
}

const AdminTestPage = () => {
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [adminData, setAdminData] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const data = localStorage.getItem('adminData');
    if (data) {
      setAdminData(JSON.parse(data));
    }
    runAllTests();
  }, []);

  const runAllTests = async () => {
    setLoading(true);
    const results: TestResult[] = [];

    // Test 1: Authentication Check
    try {
      const token = localStorage.getItem('adminToken');
      const adminData = localStorage.getItem('adminData');
      
      if (token && adminData) {
        results.push({
          name: 'Authentication',
          status: 'success',
          message: 'Admin token and data found',
          details: { tokenLength: token.length, admin: JSON.parse(adminData) }
        });
      } else {
        results.push({
          name: 'Authentication',
          status: 'error',
          message: 'Missing admin token or data'
        });
      }
    } catch (error: any) {
      results.push({
        name: 'Authentication',
        status: 'error',
        message: `Auth check failed: ${error.message}`
      });
    }

    // Test 2: API Connection
    try {
      const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
      const token = localStorage.getItem('adminToken');
      
      const response = await fetch(`${apiBaseUrl}/admin/test`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        results.push({
          name: 'API Connection',
          status: 'success',
          message: 'Successfully connected to API',
          details: { url: apiBaseUrl, status: response.status }
        });
      } else {
        results.push({
          name: 'API Connection',
          status: 'warning',
          message: `API responded with ${response.status}`,
          details: { url: apiBaseUrl, status: response.status }
        });
      }
    } catch (error: any) {
      results.push({
        name: 'API Connection',
        status: 'error',
        message: `API connection failed: ${error.message}`
      });
    }

    // Test 3: Dashboard Data
    try {
      const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
      const token = localStorage.getItem('adminToken');
      
      const response = await fetch(`${apiBaseUrl}/admin/dashboard/stats`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        results.push({
          name: 'Dashboard Data',
          status: 'success',
          message: 'Dashboard stats loaded successfully',
          details: data.stats
        });
      } else {
        results.push({
          name: 'Dashboard Data',
          status: 'warning',
          message: 'Dashboard stats unavailable',
          details: { status: response.status }
        });
      }
    } catch (error: any) {
      results.push({
        name: 'Dashboard Data',
        status: 'error',
        message: `Dashboard data failed: ${error.message}`
      });
    }

    setTestResults(results);
    setLoading(false);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'error': return <XCircle className="h-5 w-5 text-red-600" />;
      case 'warning': return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      default: return <RefreshCw className="h-5 w-5 text-gray-400 animate-spin" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'bg-green-100 text-green-800 border-green-200';
      case 'error': return 'bg-red-100 text-red-800 border-red-200';
      case 'warning': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <AdminAuthGuard>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/20 p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="mx-auto w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
              <Settings className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Admin System Test Panel
            </h1>
            <p className="text-gray-600 mt-2">
              Comprehensive testing of admin login and functionality
            </p>
            {adminData && (
              <div className="mt-4 inline-block bg-white/80 backdrop-blur-sm rounded-lg px-4 py-2 border">
                <span className="text-sm text-gray-600">Logged in as: </span>
                <span className="font-semibold text-blue-600">{adminData.email}</span>
              </div>
            )}
          </div>

          {/* Test Results */}
          <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-blue-600" />
                System Test Results
              </CardTitle>
              <Button 
                onClick={runAllTests}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {loading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                {loading ? 'Testing...' : 'Run Tests'}
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {testResults.map((result, index) => (
                  <div key={index} className="flex items-start gap-4 p-4 rounded-lg border bg-gray-50/50">
                    <div className="flex-shrink-0 mt-0.5">
                      {getStatusIcon(result.status)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-gray-900">{result.name}</h3>
                        <Badge className={`${getStatusColor(result.status)} border`}>
                          {result.status.toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{result.message}</p>
                      {result.details && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-blue-600 hover:text-blue-800">
                            View Details
                          </summary>
                          <pre className="mt-2 p-2 bg-gray-100 rounded border overflow-x-auto">
                            {JSON.stringify(result.details, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-green-600" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <Button
                  onClick={() => navigate('/admin/dashboard')}
                  className="bg-blue-500 hover:bg-blue-600 h-auto p-4 flex-col gap-2 text-white"
                >
                  <Shield className="h-5 w-5" />
                  <span className="font-medium">Main Dashboard</span>
                  <ExternalLink className="h-3 w-3" />
                </Button>
                <Button
                  onClick={() => navigate('/admin/login')}
                  variant="outline"
                  className="h-auto p-4 flex-col gap-2"
                >
                  <Settings className="h-5 w-5" />
                  <span className="font-medium">Back to Login</span>
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* System Information */}
          <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5 text-purple-600" />
                System Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2">Environment</h4>
                  <div className="space-y-1 text-sm">
                    <p><strong>Mode:</strong> {import.meta.env.MODE}</p>
                    <p><strong>Dev:</strong> {import.meta.env.DEV ? 'Yes' : 'No'}</p>
                    <p><strong>API URL:</strong> {import.meta.env.VITE_API_URL || 'Default'}</p>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2">Authentication</h4>
                  <div className="space-y-1 text-sm">
                    <p><strong>Token:</strong> {localStorage.getItem('adminToken') ? 'Present' : 'Missing'}</p>
                    <p><strong>Admin Data:</strong> {localStorage.getItem('adminData') ? 'Present' : 'Missing'}</p>
                    <p><strong>Session:</strong> Active</p>
                  </div>
                </div>
              </div>
              
              <div className="mt-6 pt-4 border-t">
                <h4 className="font-semibold text-gray-700 mb-3">Actions</h4>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => {
                      localStorage.removeItem('adminToken');
                      localStorage.removeItem('adminData');
                      navigate('/admin/login');
                    }}
                  >
                    Logout
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => window.location.reload()}
                  >
                    Refresh Page
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminAuthGuard>
  );
};

export default AdminTestPage;