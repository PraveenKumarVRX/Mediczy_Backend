import { useState } from 'react';
import InsurancePortalLayout from '@/components/hospital-insurance/InsurancePortalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Truck, Search, Copy, Plus } from 'lucide-react';

const InsuranceCourierTrackingPage = () => {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [showAddCourier, setShowAddCourier] = useState(false);

  const [newCourier, setNewCourier] = useState({
    claimNo: '', insurer: '', provider: 'bluedart', trackingNo: '', ackNo: '', sentDate: '', contents: '',
  });

  const [couriers] = useState([
    { id: 1, claimNo: 'CLM-2025-0042', insurer: 'Star Health', provider: 'Blue Dart', trackingNo: 'BD9876543210', ackNo: 'ACK-SH-0042', sentDate: '2025-06-15', receivedDate: '2025-06-17', status: 'delivered', contents: 'Claim form, discharge summary, investigation reports' },
    { id: 2, claimNo: 'CLM-2025-0041', insurer: 'ICICI Lombard', provider: 'DTDC', trackingNo: 'DT1234567890', ackNo: '', sentDate: '2025-06-18', receivedDate: '', status: 'in_transit', contents: 'Pre-auth documents, ID proof, policy copy' },
    { id: 3, claimNo: 'CLM-2025-0039', insurer: 'HDFC Ergo', provider: 'Professional Couriers', trackingNo: 'PC5678901234', ackNo: 'ACK-HE-0039', sentDate: '2025-06-12', receivedDate: '2025-06-14', status: 'delivered', contents: 'Original bills, discharge summary' },
    { id: 4, claimNo: 'CLM-2025-0038', insurer: 'Bajaj Allianz', provider: 'Blue Dart', trackingNo: 'BD5432109876', ackNo: '', sentDate: '2025-06-19', receivedDate: '', status: 'dispatched', contents: 'Enhancement documents, updated cost estimate' },
  ]);

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      dispatched: 'bg-blue-100 text-blue-700',
      in_transit: 'bg-amber-100 text-amber-700',
      delivered: 'bg-green-100 text-green-700',
      returned: 'bg-red-100 text-red-700',
    };
    return <Badge className={styles[status] || 'bg-slate-100'}>{status.replace('_', ' ')}</Badge>;
  };

  const handleAdd = () => {
    if (!newCourier.claimNo || !newCourier.trackingNo) {
      toast({ title: 'Error', description: 'Claim No and Tracking No required.', variant: 'destructive' });
      return;
    }
    toast({ title: 'Courier Added', description: `Tracking added for ${newCourier.claimNo}` });
    setShowAddCourier(false);
    setNewCourier({ claimNo: '', insurer: '', provider: 'bluedart', trackingNo: '', ackNo: '', sentDate: '', contents: '' });
  };

  const copyTracking = (no: string) => {
    navigator.clipboard.writeText(no);
    toast({ title: 'Copied', description: 'Tracking number copied to clipboard.' });
  };

  const filtered = couriers.filter(c =>
    c.claimNo.toLowerCase().includes(search.toLowerCase()) ||
    c.trackingNo.toLowerCase().includes(search.toLowerCase()) ||
    c.insurer.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <InsurancePortalLayout title="Courier Tracking" subtitle="Track document courier dispatches and acknowledgements">
      <div className="space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Total Dispatched', count: couriers.length, color: 'text-indigo-600' },
            { label: 'In Transit', count: couriers.filter(c => c.status === 'in_transit' || c.status === 'dispatched').length, color: 'text-amber-600' },
            { label: 'Delivered', count: couriers.filter(c => c.status === 'delivered').length, color: 'text-green-600' },
            { label: 'Pending Ack', count: couriers.filter(c => !c.ackNo).length, color: 'text-red-600' },
          ].map((stat, i) => (
            <Card key={i}><CardContent className="p-3 text-center">
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.count}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </CardContent></Card>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search claim, tracking no, insurer..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button onClick={() => setShowAddCourier(!showAddCourier)}>
            <Plus className="h-4 w-4 mr-1" /> Add Courier Entry
          </Button>
        </div>

        {/* Add Form */}
        {showAddCourier && (
          <Card className="border-2 border-indigo-200">
            <CardHeader><CardTitle className="text-base">Add Courier Entry</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <Input value={newCourier.claimNo} onChange={(e) => setNewCourier({...newCourier, claimNo: e.target.value})} placeholder="Claim No (CLM-2025-xxxx)" />
                <Input value={newCourier.insurer} onChange={(e) => setNewCourier({...newCourier, insurer: e.target.value})} placeholder="Insurer Name" />
                <Select value={newCourier.provider} onValueChange={(v) => setNewCourier({...newCourier, provider: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bluedart">Blue Dart</SelectItem>
                    <SelectItem value="dtdc">DTDC</SelectItem>
                    <SelectItem value="professional">Professional Couriers</SelectItem>
                    <SelectItem value="delhivery">Delhivery</SelectItem>
                    <SelectItem value="fedex">FedEx</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <Input value={newCourier.trackingNo} onChange={(e) => setNewCourier({...newCourier, trackingNo: e.target.value})} placeholder="Tracking Number" />
                <Input value={newCourier.ackNo} onChange={(e) => setNewCourier({...newCourier, ackNo: e.target.value})} placeholder="Acknowledgement No (optional)" />
                <Input type="date" value={newCourier.sentDate} onChange={(e) => setNewCourier({...newCourier, sentDate: e.target.value})} />
              </div>
              <Input value={newCourier.contents} onChange={(e) => setNewCourier({...newCourier, contents: e.target.value})} placeholder="Contents description" className="mb-3" />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowAddCourier(false)}>Cancel</Button>
                <Button onClick={handleAdd}><Truck className="h-4 w-4 mr-1" /> Add Courier</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Courier Table */}
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="py-2 px-3 text-left font-medium">Claim No</th>
                  <th className="py-2 px-3 text-left font-medium">Insurer</th>
                  <th className="py-2 px-3 text-left font-medium">Provider</th>
                  <th className="py-2 px-3 text-left font-medium">Tracking No</th>
                  <th className="py-2 px-3 text-left font-medium">Ack No</th>
                  <th className="py-2 px-3 text-left font-medium">Sent</th>
                  <th className="py-2 px-3 text-left font-medium">Received</th>
                  <th className="py-2 px-3 text-center font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-2 px-3 font-medium">{c.claimNo}</td>
                    <td className="py-2 px-3">{c.insurer}</td>
                    <td className="py-2 px-3">{c.provider}</td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1">
                        <code className="text-xs bg-slate-100 dark:bg-slate-700 px-1 rounded">{c.trackingNo}</code>
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => copyTracking(c.trackingNo)}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                    <td className="py-2 px-3">{c.ackNo || <span className="text-amber-600 text-xs">Pending</span>}</td>
                    <td className="py-2 px-3">{c.sentDate}</td>
                    <td className="py-2 px-3">{c.receivedDate || '-'}</td>
                    <td className="py-2 px-3 text-center">{statusBadge(c.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </InsurancePortalLayout>
  );
};

export default InsuranceCourierTrackingPage;
