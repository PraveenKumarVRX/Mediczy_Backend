import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, MessageSquare, CheckCircle, XCircle, Clock, User, Bot } from 'lucide-react';

interface TestResult {
  test: string;
  status: 'PASS' | 'FAIL' | 'RUNNING';
  details: string;
  responseTime?: number;
  timestamp: string;
}

interface AIResponse {
  success: boolean;
  response?: string;
  error?: string;
  responseTime: number;
  endpoint?: string;
}

const AIChatbotTestComponent: React.FC = () => {
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentTest, setCurrentTest] = useState('');
  const [authToken, setAuthToken] = useState<string>('');
  const [testQuery, setTestQuery] = useState('I have been having headaches for the past 3 days. What could be the cause?');
  const [aiResponse, setAIResponse] = useState<string>('');
  const [manualTestRunning, setManualTestRunning] = useState(false);

  // Get authentication token
  const getAuthToken = (): string => {
    const token = localStorage.getItem('token') || localStorage.getItem('authToken');
    return token || '';
  };

  useEffect(() => {
    const token = getAuthToken();
    setAuthToken(token);
  }, []);

  const addTestResult = (test: string, status: 'PASS' | 'FAIL' | 'RUNNING', details: string, responseTime?: number) => {
    setTestResults(prev => [
      ...prev.filter(r => r.test !== test),
      {
        test,
        status,
        details,
        responseTime,
        timestamp: new Date().toISOString()
      }
    ]);
  };

  const testAuthentication = async (): Promise<boolean> => {
    setCurrentTest('Authentication Check');
    addTestResult('Authentication Check', 'RUNNING', 'Checking user authentication...');

    try {
      const token = getAuthToken();
      if (!token) {
        addTestResult('Authentication Check', 'FAIL', 'No authentication token found. Please login first.');
        return false;
      }

      // Test token validity with a simple API call
      const response = await fetch('/api/users/profile', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        addTestResult('Authentication Check', 'PASS', 'User authentication valid');
        return true;
      } else {
        addTestResult('Authentication Check', 'FAIL', 'Authentication token invalid or expired');
        return false;
      }
    } catch (error) {
      addTestResult('Authentication Check', 'FAIL', `Authentication error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  };

  const testAIEndpoint = async (endpoint: string, data: any): Promise<AIResponse> => {
    const startTime = Date.now();
    
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      const responseTime = Date.now() - startTime;
      
      if (response.ok) {
        const result = await response.json();
        const aiResponseText = result.response || 
                              result.primary_response || 
                              result.message || 
                              result.data?.response || 
                              result.content ||
                              JSON.stringify(result);

        return {
          success: true,
          response: aiResponseText,
          responseTime,
          endpoint
        };
      } else {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          responseTime
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime: Date.now() - startTime
      };
    }
  };

  const testAIConsultation = async () => {
    setCurrentTest('AI Medical Consultation');
    addTestResult('AI Medical Consultation', 'RUNNING', 'Testing AI medical consultation endpoints...');

    const testData = {
      query: 'I have fever and cough. What should I do?',
      userContext: {
        patient_id: `test_${Date.now()}`,
        session_id: `session_${Date.now()}`
      }
    };

    // Test multiple AI endpoints
    const endpoints = [
      { path: '/api/medical-ai/consult', name: 'Medical AI Endpoint' },
      { path: '/api/ai', name: 'General AI Endpoint', data: { message: testData.query } }
    ];

    let success = false;
    let bestResponse = '';
    let workingEndpoint = '';

    for (const endpoint of endpoints) {
      const result = await testAIEndpoint(endpoint.path, endpoint.data || testData);
      
      if (result.success && result.response) {
        success = true;
        bestResponse = result.response;
        workingEndpoint = endpoint.name;
        break;
      }
    }

    if (success) {
      addTestResult('AI Medical Consultation', 'PASS', 
        `AI consultation working via ${workingEndpoint}. Response length: ${bestResponse.length} chars`);
    } else {
      addTestResult('AI Medical Consultation', 'FAIL', 'No AI consultation endpoints responding');
    }

    return success;
  };

  const testDrISHA = async () => {
    setCurrentTest('Dr. iSHA Integration');
    addTestResult('Dr. iSHA Integration', 'RUNNING', 'Testing Dr. iSHA medical consultation system...');

    const consultationData = {
      query: 'I have been feeling tired and have a persistent cough',
      patient_id: `test_${Date.now()}`,
      session_id: `session_${Date.now()}`,
      language: 'en'
    };

    try {
      const result = await testAIEndpoint('http://localhost:5000/api/dr-isha-consultation', consultationData);
      
      if (result.success) {
        addTestResult('Dr. iSHA Integration', 'PASS', 
          `Dr. iSHA system operational. Response time: ${result.responseTime}ms`);
        return true;
      } else {
        addTestResult('Dr. iSHA Integration', 'FAIL', 
          `Dr. iSHA system error: ${result.error}`);
        return false;
      }
    } catch (error) {
      addTestResult('Dr. iSHA Integration', 'FAIL', 
        `Dr. iSHA connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  };

  const testAIResponseQuality = async (query: string) => {
    setCurrentTest('AI Response Quality');
    addTestResult('AI Response Quality', 'RUNNING', 'Testing AI response relevance and quality...');

    const testData = {
      query,
      userContext: { patient_id: `test_${Date.now()}` }
    };

    const result = await testAIEndpoint('/api/medical-ai/consult', testData);
    
    if (result.success && result.response) {
      const response = result.response.toLowerCase();
      const medicalKeywords = ['medical', 'doctor', 'health', 'symptoms', 'treatment', 'condition', 'advice'];
      const hasRelevantContent = medicalKeywords.some(keyword => response.includes(keyword));
      const hasGoodLength = result.response.length > 100;

      if (hasRelevantContent && hasGoodLength) {
        addTestResult('AI Response Quality', 'PASS', 
          `AI provided relevant medical response (${result.response.length} chars, ${result.responseTime}ms)`);
        return result.response;
      } else {
        addTestResult('AI Response Quality', 'FAIL', 
          'AI response lacks medical relevance or insufficient detail');
        return null;
      }
    } else {
      addTestResult('AI Response Quality', 'FAIL', 
        `AI response failed: ${result.error}`);
      return null;
    }
  };

  const runManualTest = async () => {
    if (!testQuery.trim()) return;
    
    setManualTestRunning(true);
    setAIResponse('');

    try {
      const response = await testAIResponseQuality(testQuery);
      if (response) {
        setAIResponse(response);
      } else {
        setAIResponse('AI test failed - check test results for details');
      }
    } finally {
      setManualTestRunning(false);
    }
  };

  const runComprehensiveTest = async () => {
    setIsRunning(true);
    setTestResults([]);
    
    try {
      // Test 1: Authentication
      const authOk = await testAuthentication();
      
      if (!authOk) {
        setIsRunning(false);
        return;
      }

      // Test 2: AI Medical Consultation
      await testAIConsultation();

      // Test 3: Dr. iSHA Integration
      await testDrISHA();

      // Test 4: AI Response Quality
      await testAIResponseQuality('What are the symptoms of common cold?');

      setCurrentTest('');
    } finally {
      setIsRunning(false);
    }
  };

  const getTestStatusIcon = (status: string) => {
    switch (status) {
      case 'PASS': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'FAIL': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'RUNNING': return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      default: return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const passedTests = testResults.filter(r => r.status === 'PASS').length;
  const totalTests = testResults.length;
  const successRate = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="w-6 h-6" />
            AI Chatbot Integration Test
          </CardTitle>
          <CardDescription>
            Test AI medical consultation system with user authentication
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Authentication Status */}
          <Alert>
            <User className="h-4 w-4" />
            <AlertDescription>
              Authentication Token: {authToken ? 
                <Badge variant="outline" className="text-green-600">Active</Badge> : 
                <Badge variant="destructive">Missing - Please Login</Badge>
              }
            </AlertDescription>
          </Alert>

          {/* Test Controls */}
          <div className="flex gap-2">
            <Button 
              onClick={runComprehensiveTest} 
              disabled={isRunning || !authToken}
              className="flex items-center gap-2"
            >
              {isRunning && <Loader2 className="w-4 h-4 animate-spin" />}
              Run AI Chatbot Test
            </Button>
            {isRunning && (
              <Badge variant="outline" className="flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                {currentTest}
              </Badge>
            )}
          </div>

          {/* Test Results Summary */}
          {testResults.length > 0 && (
            <div className="grid grid-cols-3 gap-4">
              <Card className="p-4">
                <div className="text-2xl font-bold text-green-600">{passedTests}</div>
                <div className="text-sm text-gray-600">Tests Passed</div>
              </Card>
              <Card className="p-4">
                <div className="text-2xl font-bold text-red-600">{totalTests - passedTests}</div>
                <div className="text-sm text-gray-600">Tests Failed</div>
              </Card>
              <Card className="p-4">
                <div className="text-2xl font-bold text-blue-600">{successRate}%</div>
                <div className="text-sm text-gray-600">Success Rate</div>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual AI Test */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Manual AI Consultation Test
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Test Query</label>
            <Textarea 
              value={testQuery}
              onChange={(e) => setTestQuery(e.target.value)}
              placeholder="Enter a medical question to test AI response..."
              className="min-h-[80px]"
            />
          </div>
          <Button 
            onClick={runManualTest}
            disabled={manualTestRunning || !authToken || !testQuery.trim()}
            className="flex items-center gap-2"
          >
            {manualTestRunning && <Loader2 className="w-4 h-4 animate-spin" />}
            Test AI Response
          </Button>
          
          {aiResponse && (
            <div className="space-y-2">
              <label className="text-sm font-medium">AI Response</label>
              <Card className="p-4 bg-gray-50">
                <p className="text-sm whitespace-pre-wrap">{aiResponse}</p>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Test Results */}
      {testResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Test Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {testResults.map((result, index) => (
                <div key={index} className="flex items-start gap-3 p-3 border rounded-lg">
                  {getTestStatusIcon(result.status)}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{result.test}</span>
                      <Badge variant={result.status === 'PASS' ? 'default' : result.status === 'FAIL' ? 'destructive' : 'secondary'}>
                        {result.status}
                      </Badge>
                      {result.responseTime && (
                        <Badge variant="outline">{result.responseTime}ms</Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{result.details}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(result.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Readiness Assessment */}
      {testResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>AI Chatbot Readiness Assessment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {successRate >= 90 && (
                <Alert className="border-green-200 bg-green-50">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    <strong>EXCELLENT</strong> - AI Chatbot is fully operational and ready for user interaction.
                    All major features are working correctly.
                  </AlertDescription>
                </Alert>
              )}
              
              {successRate >= 75 && successRate < 90 && (
                <Alert className="border-yellow-200 bg-yellow-50">
                  <Clock className="h-4 w-4 text-yellow-600" />
                  <AlertDescription className="text-yellow-800">
                    <strong>GOOD</strong> - AI Chatbot is mostly functional with minor issues.
                    Core medical consultation features are working.
                  </AlertDescription>
                </Alert>
              )}
              
              {successRate >= 50 && successRate < 75 && (
                <Alert className="border-orange-200 bg-orange-50">
                  <Clock className="h-4 w-4 text-orange-600" />
                  <AlertDescription className="text-orange-800">
                    <strong>FAIR</strong> - AI Chatbot is partially functional.
                    Some features need attention before user release.
                  </AlertDescription>
                </Alert>
              )}
              
              {successRate < 50 && (
                <Alert className="border-red-200 bg-red-50">
                  <XCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">
                    <strong>POOR</strong> - AI Chatbot is not ready for user interaction.
                    Significant issues need to be resolved.
                  </AlertDescription>
                </Alert>
              )}

              <div className="text-sm text-gray-600">
                <h4 className="font-medium mb-2">Features Tested:</h4>
                <ul className="list-disc list-inside space-y-1">
                  <li>User authentication integration</li>
                  <li>AI medical consultation endpoints</li>
                  <li>Dr. iSHA consultation system</li>
                  <li>AI response quality and relevance</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AIChatbotTestComponent;