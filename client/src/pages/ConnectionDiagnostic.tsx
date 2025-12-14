import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  RefreshCw, 
  Globe,
  Server,
  Database,
  Wifi,
  Activity
} from 'lucide-react';

interface ConnectionStatus {
  service: string;
  status: 'connected' | 'disconnected' | 'error' | 'testing';
  message: string;
  details?: any;
  responseTime?: number;
}

const ConnectionDiagnostic = () => {
  const [connections, setConnections] = useState<ConnectionStatus[]>([]);
  const [testing, setTesting] = useState(false);

  const apiUrl = import.meta.env.VITE_API_URL || '/api';
  const apiOrigin = apiUrl.replace(/\/api$/, '');

  const testConnections = async () => {
    setTesting(true);
    const results: ConnectionStatus[] = [];

    // Test 1: Backend Health Check
    try {
      const start = Date.now();
      const response = await fetch(`${apiOrigin}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      const responseTime = Date.now() - start;
      
      if (response.ok) {
        const data = await response.json();
        results.push({
          service: 'Backend Server',
          status: 'connected',
          message: 'Server is healthy and responsive',
          responseTime,
          details: data
        });
      } else {
        results.push({
          service: 'Backend Server',
          status: 'error',
          message: `Health check failed: ${response.status}`,
          responseTime,
        });
      }
    } catch (error: any) {
      results.push({
        service: 'Backend Server',
        status: 'disconnected',
        message: `Connection failed: ${error.message}`,
        details: error
      });
    }

    // Test 2: Admin Login API
    try {
      const start = Date.now();
      const response = await fetch(`${apiUrl}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@mediczy.com',
          password: 'SecurePass123'
        })
      });
      const responseTime = Date.now() - start;
      
      if (response.ok) {
        const data = await response.json();
        results.push({
          service: 'Admin Login API',
          status: 'connected',
          message: 'Authentication endpoint working',
          responseTime,
          details: { hasToken: !!data.token, hasAdmin: !!data.admin }
        });
      } else {
        const data = await response.json().catch(() => null);
        results.push({
          service: 'Admin Login API',
          status: 'error',
          message: `Login API error: ${response.status}`,
          responseTime,
          details: data
        });
      }
    } catch (error: any) {
      results.push({
        service: 'Admin Login API',
        status: 'disconnected',
        message: `API connection failed: ${error.message}`,
        details: error
      });
    }

    // Test 3: Activity Logs API
    try {
      const start = Date.now();
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`${apiUrl}/admin/activity-logs?limit=1`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        }
      });
      const responseTime = Date.now() - start;
      
      if (response.ok) {
        const data = await response.json();
        results.push({
          service: 'Activity Logs API',
          status: 'connected',
          message: 'Activity logging system operational',
          responseTime,
          details: { logsCount: data.logs?.length || 0 }
        });
      } else if (response.status === 401) {
        results.push({
          service: 'Activity Logs API',
          status: 'error',
          message: 'Authentication required (admin token missing)',
          responseTime,
        });
      } else {
        results.push({
          service: 'Activity Logs API',
          status: 'error',
          message: `API error: ${response.status}`,
          responseTime,
        });
      }
    } catch (error: any) {
      results.push({
        service: 'Activity Logs API',
        status: 'disconnected',
        message: `Connection failed: ${error.message}`,
        details: error
      });
    }

    // Test 4: Environment Configuration
    const envConfig = {
      apiUrl: import.meta.env.VITE_API_URL,
      socketUrl: import.meta.env.VITE_SOCKET_URL,
      mode: import.meta.env.MODE,
      dev: import.meta.env.DEV
    };

    results.push({
      service: 'Environment Config',
      status: envConfig.apiUrl ? 'connected' : 'error',
      message: envConfig.apiUrl ? 'Configuration loaded correctly' : 'Missing API URL configuration',
      details: envConfig
    });

    setConnections(results);
    setTesting(false);
  };

  useEffect(() => {
    testConnections();
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected': return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'disconnected': return <XCircle className="h-5 w-5 text-red-600" />;
      case 'error': return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      case 'testing': return <RefreshCw className="h-5 w-5 text-blue-600 animate-spin" />;
      default: return <Globe className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'bg-green-100 text-green-800 border-green-200';
      case 'disconnected': return 'bg-red-100 text-red-800 border-red-200';
      case 'error': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'testing': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getServiceIcon = (service: string) => {
    switch (service) {
      case 'Backend Server': return <Server className="h-5 w-5 text-blue-600" />;
      case 'Admin Login API': return <Activity className="h-5 w-5 text-green-600" />;
      case 'Activity Logs API': return <Database className="h-5 w-5 text-purple-600" />;
      case 'Environment Config': return <Wifi className="h-5 w-5 text-orange-600" />;
      default: return <Globe className="h-5 w-5 text-gray-600" />;
    }
  };

  const overallStatus = connections.every(c => c.status === 'connected') ? 'connected' :
                      connections.some(c => c.status === 'connected') ? 'partial' : 'disconnected';

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/20 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <Wifi className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Connection Diagnostic
          </h1>
          <p className="text-gray-600 mt-2">
            Backend connectivity and API health status
          </p>
          
          {/* Overall Status */}
          <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg border bg-white/80">
            {overallStatus === 'connected' && (
              <>
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="font-medium text-green-800">All Systems Connected</span>
              </>
            )}
            {overallStatus === 'partial' && (
              <>
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                <span className="font-medium text-yellow-800">Partial Connectivity</span>
              </>
            )}
            {overallStatus === 'disconnected' && (
              <>
                <XCircle className="h-5 w-5 text-red-600" />
                <span className="font-medium text-red-800">Connection Issues</span>
              </>
            )}
          </div>
        </div>

        {/* Test Controls */}
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-xl">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Connectivity Tests</h3>
                <p className="text-sm text-gray-600">Run comprehensive backend connection diagnostics</p>
              </div>
              <Button onClick={testConnections} disabled={testing} className="gap-2">
                {testing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {testing ? 'Testing...' : 'Run Tests'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Connection Status */}
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-blue-600" />
              Service Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {connections.length === 0 ? (
              <div className="text-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
                <p className="text-gray-600">Running connectivity tests...</p>
              </div>
            ) : (
              connections.map((connection, index) => (
                <div key={index} className="flex items-start gap-4 p-4 rounded-lg border bg-gray-50/50">
                  <div className="flex-shrink-0 mt-0.5">
                    {getServiceIcon(connection.service)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-gray-900">{connection.service}</h3>
                      <Badge className={`${getStatusColor(connection.status)} border`}>
                        <div className="flex items-center gap-1">
                          {getStatusIcon(connection.status)}
                          {connection.status.toUpperCase()}
                        </div>
                      </Badge>
                      {connection.responseTime && (
                        <Badge variant="outline" className="text-xs">
                          {connection.responseTime}ms
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{connection.message}</p>
                    {connection.details && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-blue-600 hover:text-blue-800">
                          View Details
                        </summary>
                        <pre className="mt-2 p-2 bg-gray-100 rounded border overflow-x-auto">
                          {JSON.stringify(connection.details, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Environment Information */}
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-green-600" />
              Environment Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold text-gray-700 mb-2">Frontend Configuration</h4>
                <div className="space-y-1 text-sm">
                  <p><strong>Mode:</strong> {import.meta.env.MODE}</p>
                  <p><strong>Dev:</strong> {import.meta.env.DEV ? 'Yes' : 'No'}</p>
                  <p><strong>API URL:</strong> {import.meta.env.VITE_API_URL || 'Not configured'}</p>
                  <p><strong>Socket URL:</strong> {import.meta.env.VITE_SOCKET_URL || 'Not configured'}</p>
                </div>
              </div>
              <div>
                <h4 className="font-semibold text-gray-700 mb-2">Connection Details</h4>
                <div className="space-y-1 text-sm">
                  <p><strong>Frontend Port:</strong> 9443 (HTTPS)</p>
                  <p><strong>Backend Port:</strong> 8000 (HTTP)</p>
                  <p><strong>Host:</strong> 192.168.1.72</p>
                  <p><strong>Protocol:</strong> HTTP/HTTPS</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button 
                onClick={() => window.location.href = '/admin/login'}
                variant="outline"
                className="gap-2"
              >
                <Activity className="h-4 w-4" />
                Admin Login
              </Button>
              <Button 
                onClick={() => window.location.href = '/admin/activity-log'}
                variant="outline"
                className="gap-2"
              >
                <Database className="h-4 w-4" />
                Activity Log
              </Button>
              <Button 
                onClick={() => window.location.href = '/admin/dashboard'}
                variant="outline"
                className="gap-2"
              >
                <Server className="h-4 w-4" />
                Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ConnectionDiagnostic;