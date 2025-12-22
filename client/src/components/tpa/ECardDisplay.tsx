import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CreditCard, Download, Loader2, AlertCircle, User, Calendar, Shield } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import TPAProviderSelection from './TPAProviderSelection';

interface ECardDisplayProps {
  policyNumber?: string;
  memberId?: string;
}

const ECardDisplay: React.FC<ECardDisplayProps> = ({
  policyNumber: initialPolicyNumber = '',
  memberId: initialMemberId = ''
}) => {
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [eCardData, setECardData] = useState<any>(null);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    policyNumber: initialPolicyNumber,
    memberId: initialMemberId
  });

  const handleFetchECard = async () => {
    if (!selectedProvider) {
      toast({
        title: 'Provider Required',
        description: 'Please select a TPA provider',
        variant: 'destructive'
      });
      return;
    }

    if (!formData.policyNumber || !formData.memberId) {
      toast({
        title: 'Missing Information',
        description: 'Please enter both policy number and member ID',
        variant: 'destructive'
      });
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(`/api/tpa/${selectedProvider}/ecard`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(formData)
      });

      if (!response.ok) throw new Error('Failed to fetch E-card');

      const data = await response.json();
      setECardData(data);
      
      toast({
        title: 'E-Card Retrieved',
        description: 'E-card fetched successfully',
      });
    } catch (error) {
      toast({
        title: 'Fetch Failed',
        description: 'Failed to retrieve E-card',
        variant: 'destructive'
      });
      console.error('Error fetching E-card:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!eCardData) return;

    // If E-card has a PDF URL
    if (eCardData.pdfUrl || eCardData.cardUrl) {
      window.open(eCardData.pdfUrl || eCardData.cardUrl, '_blank');
      return;
    }

    // Otherwise, create a simple printable version
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Health Insurance E-Card</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .ecard { max-width: 600px; margin: 0 auto; border: 2px solid #333; padding: 20px; }
          .header { background: #0066cc; color: white; padding: 10px; margin-bottom: 20px; }
          .field { margin-bottom: 10px; }
          .label { font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="ecard">
          <div class="header">
            <h2>Health Insurance E-Card</h2>
            <p>Provider: ${selectedProvider}</p>
          </div>
          <div class="field"><span class="label">Policy Number:</span> ${formData.policyNumber}</div>
          <div class="field"><span class="label">Member ID:</span> ${formData.memberId}</div>
          <div class="field"><span class="label">Member Name:</span> ${eCardData.memberName || 'N/A'}</div>
          <div class="field"><span class="label">Validity:</span> ${eCardData.validity || 'N/A'}</div>
          <div class="field"><span class="label">Sum Insured:</span> ${eCardData.sumInsured || 'N/A'}</div>
        </div>
        <script>window.print();</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Get Health Insurance E-Card
          </CardTitle>
          <CardDescription>
            Retrieve your digital health insurance card
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TPAProviderSelection
            multiSelect={false}
            onSelect={(providers) => setSelectedProvider(providers[0] || '')}
            selectedProviders={selectedProvider ? [selectedProvider] : []}
          />
        </CardContent>
      </Card>

      {selectedProvider && (
        <Card>
          <CardHeader>
            <CardTitle>Member Information</CardTitle>
            <CardDescription>
              Enter your policy and member details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="policyNumber">Policy Number</Label>
                <Input
                  id="policyNumber"
                  value={formData.policyNumber}
                  onChange={(e) => setFormData(prev => ({ ...prev, policyNumber: e.target.value }))}
                  placeholder="Enter policy number"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="memberId">Member ID</Label>
                <Input
                  id="memberId"
                  value={formData.memberId}
                  onChange={(e) => setFormData(prev => ({ ...prev, memberId: e.target.value }))}
                  placeholder="Enter member ID"
                />
              </div>
            </div>

            <Button onClick={handleFetchECard} disabled={loading} className="w-full">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Fetch E-Card
            </Button>
          </CardContent>
        </Card>
      )}

      {eCardData && (
        <Card className="border-2 border-primary">
          <CardHeader className="bg-primary/5">
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Health Insurance E-Card
              </span>
              <Button size="sm" variant="outline" onClick={handleDownload}>
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <User className="h-4 w-4" />
                    <span>Member Name</span>
                  </div>
                  <p className="font-medium">{eCardData.memberName || 'N/A'}</p>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Shield className="h-4 w-4" />
                    <span>Policy Number</span>
                  </div>
                  <p className="font-medium">{formData.policyNumber}</p>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CreditCard className="h-4 w-4" />
                    <span>Member ID</span>
                  </div>
                  <p className="font-medium">{formData.memberId}</p>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>Validity</span>
                  </div>
                  <p className="font-medium">{eCardData.validity || 'N/A'}</p>
                </div>
              </div>

              {eCardData.sumInsured && (
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Sum Insured</p>
                  <p className="text-2xl font-bold">₹{eCardData.sumInsured.toLocaleString()}</p>
                </div>
              )}

              {eCardData.imageUrl && (
                <div className="mt-4">
                  <img
                    src={eCardData.imageUrl}
                    alt="E-Card"
                    className="w-full rounded-lg border"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ECardDisplay;
