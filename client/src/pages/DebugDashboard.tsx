import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDebug } from '@/contexts/DebugContext';
import { 
  Terminal, 
  Network, 
  Database, 
  Shield, 
  Trash2, 
  Copy, 
  Download,
  RefreshCw,
  Eye,
  EyeOff,
  Send,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  Key,
  User,
  Settings,
  Lock
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const DebugDashboard = () => {
  const navigate = useNavigate();
  const { logs, networkRequests, isDebugMode, toggleDebugMode, clearLogs, clearNetworkRequests } = useDebug();
  const { toast } = useToast();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [apiUrl, setApiUrl] = useState('/api/users/me');
  const [apiMethod, setApiMethod] = useState('GET');
  const [apiBody, setApiBody] = useState('');
  const [apiResponse, setApiResponse] = useState('');
  const [showTokens, setShowTokens] = useState(false);

  // Check if user is admin
  useEffect(() => {
    const adminToken = localStorage.getItem('adminToken');
    const userType = localStorage.getItem('userType');
    
    if (adminToken && userType === 'admin') {
      setIsAuthorized(true);
    } else {
      setIsAuthorized(false);
      toast({
        variant: 'destructive',
        title: 'Access Denied',
        description: 'Debug dashboard is only accessible to administrators'
      });
      setTimeout(() => {
        navigate('/admin/login');
      }, 2000);
    }
    setIsChecking(false);
  }, [navigate, toast]);

  // Get auth state
  const token = localStorage.getItem('token');
  const doctorToken = localStorage.getItem('doctorToken');
  const adminToken = localStorage.getItem('adminToken');
  const userType = localStorage.getItem('userType');

  const getLogIcon = (type: string) => {
    switch (type) {
      case 'error': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'warn': return <AlertCircle className="w-4 h-4 text-orange-500" />;
      case 'info': return <CheckCircle className="w-4 h-4 text-blue-500" />;
      default: return <Terminal className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status?: number) => {
    if (!status) return 'gray';
    if (status >= 200 && status < 300) return 'green';
    if (status >= 400 && status < 500) return 'orange';
    if (status >= 500) return 'red';
    return 'blue';
  };

  const handleApiTest = async () => {
    try {
      const options: RequestInit = {
        method: apiMethod,
        headers: {
          'Content-Type': 'application/json'
        }
      };

      // Add auth token if available
      if (token) {
        options.headers = {
          ...options.headers,
          'Authorization': `Bearer ${token}`
        };
      }

      // Add body for POST/PUT/PATCH
      if (['POST', 'PUT', 'PATCH'].includes(apiMethod) && apiBody) {
        options.body = apiBody;
      }

      const response = await fetch(apiUrl, options);
      const data = await response.json();
      
      setApiResponse(JSON.stringify({
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        data
      }, null, 2));

      toast({
        title: 'API Test Complete',
        description: `Status: ${response.status} ${response.statusText}`
      });
    } catch (error) {
      setApiResponse(JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, null, 2));
      
      toast({
        variant: 'destructive',
        title: 'API Test Failed',
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied to clipboard',
      description: 'Content copied successfully'
    });
  };

  const downloadLogs = () => {
    const logsText = logs.map(log => 
      `[${log.timestamp.toISOString()}] ${log.type.toUpperCase()}: ${log.message}`
    ).join('\n');
    
    const blob = new Blob([logsText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mediczy-logs-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast({
      title: 'Logs Downloaded',
      description: 'Console logs saved to file'
    });
  };

  const clearAllCache = () => {
    // Clear localStorage except debug mode
    const debugMode = localStorage.getItem('mediczy_debug_mode');
    localStorage.clear();
    if (debugMode) localStorage.setItem('mediczy_debug_mode', debugMode);
    
    // Clear sessionStorage
    sessionStorage.clear();
    
    toast({
      title: 'Cache Cleared',
      description: 'All local storage and session storage cleared'
    });
  };

  const purgeCloudflareCache = () => {
    toast({
      title: 'Cloudflare Cache Purge',
      description: 'Please purge cache manually from Cloudflare dashboard'
    });
  };

  // Show loading while checking authorization
  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Verifying access...</p>
        </div>
      </div>
    );
  }

  // Show access denied if not authorized
  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <Lock className="w-6 h-6" />
              Access Denied
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 dark:text-gray-400">
              Debug dashboard is only accessible to administrators.
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Redirecting to admin login...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Settings className="w-8 h-8" />
              Debug Dashboard
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Development tools and diagnostics
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={isDebugMode ? 'default' : 'outline'}
              onClick={toggleDebugMode}
            >
              {isDebugMode ? <Eye className="w-4 h-4 mr-2" /> : <EyeOff className="w-4 h-4 mr-2" />}
              {isDebugMode ? 'Debug ON' : 'Debug OFF'}
            </Button>
          </div>
        </div>

        <Tabs defaultValue="console" className="space-y-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="console">
              <Terminal className="w-4 h-4 mr-2" />
              Console
            </TabsTrigger>
            <TabsTrigger value="network">
              <Network className="w-4 h-4 mr-2" />
              Network
            </TabsTrigger>
            <TabsTrigger value="api">
              <Send className="w-4 h-4 mr-2" />
              API Tester
            </TabsTrigger>
            <TabsTrigger value="state">
              <Database className="w-4 h-4 mr-2" />
              State
            </TabsTrigger>
            <TabsTrigger value="auth">
              <Shield className="w-4 h-4 mr-2" />
              Auth
            </TabsTrigger>
          </TabsList>

          {/* Console Tab */}
          <TabsContent value="console">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Console Logs</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={downloadLogs}>
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                  <Button variant="outline" size="sm" onClick={clearLogs}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="bg-black text-green-400 font-mono text-xs p-4 rounded-lg h-96 overflow-y-auto space-y-1">
                  {logs.length === 0 ? (
                    <div className="text-gray-500 text-center py-8">
                      No logs yet. Enable debug mode and interact with the app.
                    </div>
                  ) : (
                    logs.map(log => (
                      <div key={log.id} className="flex items-start gap-2 hover:bg-gray-900 px-2 py-1 rounded">
                        {getLogIcon(log.type)}
                        <span className="text-gray-400 text-xs">
                          {log.timestamp.toLocaleTimeString()}
                        </span>
                        <span className={
                          log.type === 'error' ? 'text-red-400' :
                          log.type === 'warn' ? 'text-orange-400' :
                          log.type === 'info' ? 'text-blue-400' :
                          'text-green-400'
                        }>
                          {log.message}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Network Tab */}
          <TabsContent value="network">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Network Requests</CardTitle>
                <Button variant="outline" size="sm" onClick={clearNetworkRequests}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 h-96 overflow-y-auto">
                  {networkRequests.length === 0 ? (
                    <div className="text-gray-500 text-center py-8">
                      No network requests yet. Enable debug mode and make API calls.
                    </div>
                  ) : (
                    networkRequests.map(req => (
                      <div key={req.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:shadow">
                        <div className="flex items-center gap-3 flex-1">
                          <Badge variant="outline" className="font-mono text-xs">
                            {req.method}
                          </Badge>
                          <span className="text-sm truncate flex-1">{req.url}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {req.duration && (
                            <Badge variant="secondary" className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {req.duration}ms
                            </Badge>
                          )}
                          {req.status && (
                            <Badge 
                              className={`bg-${getStatusColor(req.status)}-500 text-white`}
                            >
                              {req.status}
                            </Badge>
                          )}
                          {req.error && (
                            <Badge variant="destructive">
                              Error
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* API Tester Tab */}
          <TabsContent value="api">
            <Card>
              <CardHeader>
                <CardTitle>API Endpoint Tester</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-4 gap-2">
                  <select
                    value={apiMethod}
                    onChange={(e) => setApiMethod(e.target.value)}
                    className="px-3 py-2 border rounded-lg"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="PATCH">PATCH</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                  <Input
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    placeholder="API URL"
                    className="col-span-3"
                  />
                </div>

                {['POST', 'PUT', 'PATCH'].includes(apiMethod) && (
                  <textarea
                    value={apiBody}
                    onChange={(e) => setApiBody(e.target.value)}
                    placeholder='{"key": "value"}'
                    className="w-full p-3 border rounded-lg font-mono text-sm h-32"
                  />
                )}

                <Button onClick={handleApiTest} className="w-full">
                  <Send className="w-4 h-4 mr-2" />
                  Send Request
                </Button>

                {apiResponse && (
                  <div className="relative">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(apiResponse)}
                      className="absolute top-2 right-2"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    <pre className="bg-black text-green-400 p-4 rounded-lg overflow-x-auto text-xs">
                      {apiResponse}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* State Tab */}
          <TabsContent value="state">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Application State</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={clearAllCache}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear Cache
                  </Button>
                  <Button variant="outline" size="sm" onClick={purgeCloudflareCache}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Purge Cloudflare
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    LocalStorage
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg space-y-1 max-h-64 overflow-y-auto">
                    {Object.entries(localStorage).map(([key, value]) => (
                      <div key={key} className="flex justify-between items-start text-sm border-b border-gray-200 dark:border-gray-700 py-1">
                        <span className="font-mono text-blue-600 dark:text-blue-400">{key}:</span>
                        <span className="text-gray-600 dark:text-gray-400 ml-2 text-right truncate max-w-md">
                          {value.substring(0, 100)}{value.length > 100 ? '...' : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Environment</h3>
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-mono">NODE_ENV:</span>
                      <Badge>{import.meta.env.MODE}</Badge>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="font-mono">API URL:</span>
                      <span className="text-gray-600">{import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Auth Tab */}
          <TabsContent value="auth">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Authentication State
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <User className="w-4 h-4" />
                      <span className="font-semibold">User Type</span>
                    </div>
                    <Badge variant={userType ? 'default' : 'secondary'}>
                      {userType || 'Not logged in'}
                    </Badge>
                  </div>

                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Key className="w-4 h-4" />
                      <span className="font-semibold">Tokens</span>
                    </div>
                    <div className="flex gap-2">
                      {token && <Badge variant="outline">User</Badge>}
                      {doctorToken && <Badge variant="outline">Doctor</Badge>}
                      {adminToken && <Badge variant="outline">Admin</Badge>}
                      {!token && !doctorToken && !adminToken && (
                        <Badge variant="secondary">None</Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">Token Values</h3>
                    <Button variant="ghost" size="sm" onClick={() => setShowTokens(!showTokens)}>
                      {showTokens ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                  
                  <div className="space-y-2">
                    {token && (
                      <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm font-semibold">User Token</span>
                          <Button variant="ghost" size="sm" onClick={() => copyToClipboard(token)}>
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                        <code className="text-xs break-all">
                          {showTokens ? token : '••••••••••••••••'}
                        </code>
                      </div>
                    )}
                    
                    {doctorToken && (
                      <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm font-semibold">Doctor Token</span>
                          <Button variant="ghost" size="sm" onClick={() => copyToClipboard(doctorToken)}>
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                        <code className="text-xs break-all">
                          {showTokens ? doctorToken : '••••••••••••••••'}
                        </code>
                      </div>
                    )}
                    
                    {adminToken && (
                      <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm font-semibold">Admin Token</span>
                          <Button variant="ghost" size="sm" onClick={() => copyToClipboard(adminToken)}>
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                        <code className="text-xs break-all">
                          {showTokens ? adminToken : '••••••••••••••••'}
                        </code>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default DebugDashboard;
