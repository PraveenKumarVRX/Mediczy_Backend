import { useState } from 'react';
import InsurancePortalLayout from '@/components/hospital-insurance/InsurancePortalLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import api from '@/utils/api';
import { Search, FileText, User, CreditCard, Clock, ExternalLink, Loader2 } from 'lucide-react';

const InsuranceSearchPage = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState('all');
  const [results, setResults] = useState<any[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) {
      toast({ title: 'Enter search term', variant: 'destructive' });
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const { data } = await api.post('/hospital/insurance/dashboard/search', { searchTerm: query.trim() });
      if (data.success) {
        setResults((data.results || []).map((r: any) => ({
          type: 'claim',
          id: r.claimNumber || r.id,
          title: r.patient ? `${r.patient.firstName} ${r.patient.lastName}` : `Claim ${r.claimNumber}`,
          status: r.status || 'unknown',
          amount: `₹${(r.claimAmount || 0).toLocaleString('en-IN')}`,
          date: r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-IN') : '—',
          link: '/hospital-insurance/claims',
        })));
      }
    } catch (err) {
      console.warn('Search error:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case 'claim': return <CreditCard className="h-4 w-4 text-indigo-600" />;
      case 'preauth': return <Clock className="h-4 w-4 text-amber-600" />;
      case 'patient': return <User className="h-4 w-4 text-green-600" />;
      case 'document': return <FileText className="h-4 w-4 text-blue-600" />;
      default: return <Search className="h-4 w-4" />;
    }
  };

  return (
    <InsurancePortalLayout title="Search" subtitle="Search across claims, pre-auths, patients, and documents">
      <div className="space-y-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9 text-lg h-12"
                  placeholder="Search by claim no, patient name, policy no, ABHA ID..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
              </div>
              <Select value={searchType} onValueChange={setSearchType}>
                <SelectTrigger className="w-40 h-12"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="claim">Claims</SelectItem>
                  <SelectItem value="preauth">Pre-Auth</SelectItem>
                  <SelectItem value="patient">Patients</SelectItem>
                  <SelectItem value="document">Documents</SelectItem>
                </SelectContent>
              </Select>
              <Button className="h-12 px-6 bg-indigo-600 hover:bg-indigo-700" onClick={handleSearch} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Search className="h-4 w-4 mr-1" />} Search
              </Button>
            </div>
          </CardContent>
        </Card>

        {searched && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {loading ? 'Searching...' : `${results.length} result${results.length !== 1 ? 's' : ''} found`}
            </p>
            {results.map((result, idx) => (
              <Card key={idx} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate(result.link)}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {typeIcon(result.type)}
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{result.title}</p>
                        <Badge variant="outline" className="text-xs">{result.id}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{result.amount} • {result.date}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={['approved','active','uploaded','settled'].includes(result.status) ? 'bg-green-100 text-green-700' : ['rejected','denied'].includes(result.status) ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}>
                      {result.status}
                    </Badge>
                    <Button variant="ghost" size="sm"><ExternalLink className="h-3 w-3" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            {results.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Search className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No results found for "{query}"</p>
                  <p className="text-sm mt-1">Try a different search term or change the filter.</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {!searched && (
          <div className="grid grid-cols-4 gap-4 mt-8">
            {[
              { label: 'Search Claims', icon: <CreditCard className="h-8 w-8" />, desc: 'Find by claim no, patient, insurer' },
              { label: 'Search Pre-Auth', icon: <Clock className="h-8 w-8" />, desc: 'Find by PA number, member ID' },
              { label: 'Search Patients', icon: <User className="h-8 w-8" />, desc: 'Find by name, ABHA, phone' },
              { label: 'Search Documents', icon: <FileText className="h-8 w-8" />, desc: 'Find by document type, claim' },
            ].map((item, i) => (
              <Card key={i} className="text-center cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setSearchType(['all', 'claim', 'preauth', 'patient', 'document'][i + 1] || 'all'); }}>
                <CardContent className="p-6">
                  <div className="text-indigo-400 mb-3 flex justify-center">{item.icon}</div>
                  <p className="font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </InsurancePortalLayout>
  );
};

export default InsuranceSearchPage;
