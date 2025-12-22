import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

const AdminLoginFix = () => {
  const [email, setEmail] = useState('admin@mediczy.com');
  const [password, setPassword] = useState('SecurePass123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const navigate = useNavigate();

  const testDirectLogin = async () => {
    setError(null);
    setSuccess(null);
    setLoading(true);
    
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
      
      console.log('Testing direct login to:', `${apiUrl}/admin/login`);
      
      const response = await fetch(`${apiUrl}/admin/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password })
      });
      
      const data = await response.json();
      console.log('Response:', { status: response.status, data });
      
      if (!response.ok) {
        throw new Error(data.message || `HTTP ${response.status}`);
      }
      
      // Store admin token
      localStorage.setItem('adminToken', data.token);
      localStorage.setItem('adminData', JSON.stringify(data.admin));
      
      setSuccess('Login successful! Redirecting to dashboard...');
      
      setTimeout(() => {
        navigate('/admin/dashboard');
      }, 2000);
      
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const checkAuthStatus = () => {
    const token = localStorage.getItem('adminToken');
    const adminData = localStorage.getItem('adminData');
    
    console.log('Auth Status:', {
      hasToken: !!token,
      tokenLength: token?.length,
      hasAdminData: !!adminData,
      adminData: adminData ? JSON.parse(adminData) : null
    });
    
    if (token) {
      setSuccess('Found existing admin token. You should be able to access the dashboard.');
    } else {
      setError('No admin token found. Please login first.');
    }
  };

  const clearAuth = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminData');
    setSuccess('Auth data cleared');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-md mx-auto">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-center text-red-600">Admin Login Fix</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <Alert className="border-red-200 bg-red-50">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-red-600 text-sm">{error}</AlertDescription>
              </Alert>
            )}
            
            {success && (
              <Alert className="border-green-200 bg-green-50">
                <AlertDescription className="text-green-600 text-sm">{success}</AlertDescription>
              </Alert>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@mediczy.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="SecurePass123"
              />
            </div>

            <Button
              onClick={testDirectLogin}
              disabled={loading}
              className="w-full bg-red-600 hover:bg-red-700"
            >
              {loading ? 'Testing Login...' : 'Test Admin Login'}
            </Button>

            <div className="flex gap-2">
              <Button onClick={checkAuthStatus} variant="outline" size="sm" className="flex-1">
                Check Auth
              </Button>
              <Button onClick={clearAuth} variant="outline" size="sm" className="flex-1">
                Clear Auth
              </Button>
            </div>

            <div className="text-center">
              <Button
                onClick={() => navigate('/admin/dashboard')}
                variant="link"
                size="sm"
              >
                Try Dashboard
              </Button>
            </div>

            <div className="text-xs text-gray-500 mt-4">
              <p><strong>API URL:</strong> {import.meta.env.VITE_API_URL}</p>
              <p><strong>Mode:</strong> {import.meta.env.MODE}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminLoginFix;