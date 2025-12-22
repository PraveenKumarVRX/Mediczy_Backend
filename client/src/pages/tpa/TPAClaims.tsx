import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Search, Filter, Download, Eye, Clock, CheckCircle, XCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '@/utils/api';
import TPASidebar from '@/components/tpa/TPASidebar';

const TPAClaims = () => {
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchClaims();
  }, [filter]);

  const fetchClaims = async () => {
    try {
      const { data } = await api.get('/tpa/claims', {
        params: { status: filter }
      });
      setClaims(data.claims || []);
    } catch (err) {
      console.error('Failed to fetch claims:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'pending': return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'rejected': return <XCircle className="h-4 w-4 text-red-600" />;
      default: return null;
    }
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      approved: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      rejected: 'bg-red-100 text-red-800'
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <TPASidebar />
      
      <div className="flex-1 md:ml-64 overflow-auto">
        <div className="px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Claims Management</h1>
            <p className="text-gray-600 mt-1">Process and manage insurance claims</p>
          </div>

          <div className="flex gap-4 mb-6">
            <Button
              variant={filter === 'all' ? 'default' : 'outline'}
              onClick={() => setFilter('all')}
            >
              All Claims
            </Button>
            <Button
              variant={filter === 'pending' ? 'default' : 'outline'}
              onClick={() => setFilter('pending')}
            >
              Pending
            </Button>
            <Button
              variant={filter === 'approved' ? 'default' : 'outline'}
              onClick={() => setFilter('approved')}
            >
              Approved
            </Button>
            <Button
              variant={filter === 'rejected' ? 'default' : 'outline'}
              onClick={() => setFilter('rejected')}
            >
              Rejected
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Claims List</CardTitle>
              <CardDescription>View and process insurance claims</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Loading claims...</div>
              ) : (
                <div className="space-y-4">
                  {claims.map((claim: any) => (
                    <div key={claim.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <FileText className="h-5 w-5 text-blue-600" />
                            <h3 className="font-semibold text-lg">{claim.id}</h3>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(claim.status)}`}>
                              {claim.status}
                            </span>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-gray-600">Employee:</span>
                              <span className="ml-2 font-medium">{claim.employeeName}</span>
                            </div>
                            <div>
                              <span className="text-gray-600">Corporate:</span>
                              <span className="ml-2 font-medium">{claim.corporate}</span>
                            </div>
                            <div>
                              <span className="text-gray-600">Type:</span>
                              <span className="ml-2 font-medium">{claim.claimType}</span>
                            </div>
                            <div>
                              <span className="text-gray-600">Amount:</span>
                              <span className="ml-2 font-medium">₹{claim.claimAmount.toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="text-gray-600">Hospital:</span>
                              <span className="ml-2 font-medium">{claim.hospitalName}</span>
                            </div>
                            <div>
                              <span className="text-gray-600">Claimed Date:</span>
                              <span className="ml-2 font-medium">{new Date(claim.claimedDate).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline">
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default TPAClaims;
