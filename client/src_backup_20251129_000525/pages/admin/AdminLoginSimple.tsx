import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Eye, EyeOff, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

const AdminLoginSimple = () => {
  const [email, setEmail] = useState('admin@mediczy.com');
  const [password, setPassword] = useState('SecurePass123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [testResults, setTestResults] = useState<string[]>([]);
  const navigate = useNavigate();

  const log = (message: string) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
    console.log(message);
  };

  const testLogin = async () => {
    setError(null);
    setLoading(true);
    setTestResults([]);
    
    const apiUrl = import.meta.env.VITE_API_URL || 'http://192.168.1.72:8000/api';
    log(`Starting login test with API: ${apiUrl}`);
    
    try {
      log('Attempting admin login...');
      
      const response = await fetch(`${apiUrl}/admin/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password })
      });
      
      log(`Response status: ${response.status}`);
      
      if (!response.ok) {
        const errorData = await response.text();
        log(`Error response: ${errorData}`);
        throw new Error(`Login failed: ${response.status}`);
      }
      
      const data = await response.json();
      log('Login response received');
      
      if (!data.token) {
        throw new Error('No token in response');
      }
      
      log('Token received, storing in localStorage');
      localStorage.setItem('adminToken', data.token);
      localStorage.setItem('adminData', JSON.stringify(data.admin || { email }));
      
      log('Login successful! Redirecting...');
      setTimeout(() => {
        navigate('/admin/system-test');
      }, 1000);
      
    } catch (err: any) {
      log(`Login failed: ${err.message}`);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const clearAuth = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminData');
    setTestResults([]);
    log('Authentication data cleared');
  };

  const checkCurrentAuth = () => {
    const token = localStorage.getItem('adminToken');
    const adminData = localStorage.getItem('adminData');
    
    setTestResults([
      `Token: ${token ? 'Present ✓' : 'Missing ✗'}`,
      `Admin Data: ${adminData ? 'Present ✓' : 'Missing ✗'}`,
      `Current Time: ${new Date().toLocaleTimeString()}`
    ]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <Shield className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Admin Login Test
          </h1>
          <p className="text-gray-600 mt-2">Simple diagnostic tool</p>
        </div>

        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-xl mb-6">
          <CardHeader>
            <CardTitle>Login Form</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <Alert className="border-red-200 bg-red-50">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-red-600">
                  {error}
                </AlertDescription>
              </Alert>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Button
                onClick={testLogin}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {loading ? 'Testing...' : 'Test Login'}
              </Button>
              <Button
                onClick={checkCurrentAuth}
                variant="outline"
              >
                Check Auth
              </Button>
              <Button
                onClick={clearAuth}
                variant="outline"
              >
                Clear Auth
              </Button>
            </div>
          </CardContent>
        </Card>

        {testResults.length > 0 && (
          <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-xl">
            <CardHeader>
              <CardTitle>Test Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-gray-50 p-4 rounded-lg max-h-60 overflow-y-auto">
                {testResults.map((result, index) => (
                  <div key={index} className="text-sm font-mono text-gray-700 mb-1">
                    {result}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="mt-6 text-center space-x-4">
          <Button
            onClick={() => navigate('/admin/system-test')}
            variant="outline"
          >
            Go to System Test
          </Button>
          <Button
            onClick={() => navigate('/admin/dashboard')}
            variant="outline"
          >
            Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AdminLoginSimple;