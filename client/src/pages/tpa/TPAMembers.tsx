import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Search, Building2, Phone, Mail } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '@/utils/api';
import TPASidebar from '@/components/tpa/TPASidebar';

const TPAMembers = () => {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    try {
      const { data } = await api.get('/tpa/members');
      setMembers(data.members || []);
    } catch (err) {
      console.error('Failed to fetch members:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <TPASidebar />
      
      <div className="flex-1 md:ml-64 overflow-auto">
        <div className="px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Members Management</h1>
            <p className="text-gray-600 mt-1">Manage insured members and dependents</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Active Members</CardTitle>
              <CardDescription>View and manage all insured members</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Loading members...</div>
              ) : (
                <div className="space-y-4">
                  {members.map((member: any) => (
                    <div key={member.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Users className="h-5 w-5 text-blue-600" />
                            <h3 className="font-semibold text-lg">{member.name}</h3>
                            <span className="text-sm text-gray-500">({member.employeeId})</span>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-gray-400" />
                              <span>{member.corporate}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Phone className="h-4 w-4 text-gray-400" />
                              <span>{member.phone}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Mail className="h-4 w-4 text-gray-400" />
                              <span>{member.email}</span>
                            </div>
                            <div>
                              <span className="text-gray-600">Policy:</span>
                              <span className="ml-2 font-medium">{member.policyNumber}</span>
                            </div>
                            <div>
                              <span className="text-gray-600">Coverage:</span>
                              <span className="ml-2 font-medium">₹{member.coverageAmount.toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="text-gray-600">Dependents:</span>
                              <span className="ml-2 font-medium">{member.dependents}</span>
                            </div>
                          </div>
                        </div>
                        <Button size="sm" variant="outline">View Details</Button>
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

export default TPAMembers;
