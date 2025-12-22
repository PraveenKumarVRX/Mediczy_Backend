import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FileText, Upload, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import TPAProviderSelection from './TPAProviderSelection';

interface ClaimSubmissionProps {
  onSuccess?: (claimNumber: string) => void;
}

const ClaimSubmissionUI: React.FC<ClaimSubmissionProps> = ({ onSuccess }) => {
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [claimNumber, setClaimNumber] = useState('');
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    policyNumber: '',
    memberId: '',
    claimType: 'cashless',
    hospitalName: '',
    dateOfAdmission: '',
    ailmentDetails: '',
    estimatedAmount: '',
    contactNumber: '',
    emailId: ''
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedProvider) {
      toast({
        title: 'Provider Required',
        description: 'Please select a TPA provider',
        variant: 'destructive'
      });
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(`/api/tpa/${selectedProvider}/claim-intimation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(formData)
      });

      if (!response.ok) throw new Error('Failed to submit claim');

      const data = await response.json();
      
      setSubmitted(true);
      setClaimNumber(data.claimNumber || 'Pending');
      
      toast({
        title: 'Claim Submitted Successfully',
        description: `Claim Number: ${data.claimNumber || 'Pending'}`,
      });

      onSuccess?.(data.claimNumber);
    } catch (error) {
      toast({
        title: 'Submission Failed',
        description: 'Failed to submit claim intimation',
        variant: 'destructive'
      });
      console.error('Error submitting claim:', error);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="flex flex-col items-center justify-center p-8 text-center">
          <div className="rounded-full bg-green-500/10 p-3 mb-4">
            <CheckCircle className="h-12 w-12 text-green-500" />
          </div>
          <h3 className="text-2xl font-semibold mb-2">Claim Submitted Successfully!</h3>
          <p className="text-muted-foreground mb-4">
            Your claim intimation has been submitted to {selectedProvider}
          </p>
          <div className="bg-muted p-4 rounded-lg mb-6">
            <p className="text-sm text-muted-foreground mb-1">Claim Number</p>
            <p className="text-2xl font-bold">{claimNumber}</p>
          </div>
          <Button onClick={() => {
            setSubmitted(false);
            setFormData({
              policyNumber: '',
              memberId: '',
              claimType: 'cashless',
              hospitalName: '',
              dateOfAdmission: '',
              ailmentDetails: '',
              estimatedAmount: '',
              contactNumber: '',
              emailId: ''
            });
            setSelectedProvider('');
          }}>
            Submit Another Claim
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Submit Claim Intimation
          </CardTitle>
          <CardDescription>
            Submit a claim intimation to your TPA provider
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
            <CardTitle>Claim Details</CardTitle>
            <CardDescription>
              Fill in the details for your claim intimation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="policyNumber">Policy Number *</Label>
                  <Input
                    id="policyNumber"
                    required
                    value={formData.policyNumber}
                    onChange={(e) => handleInputChange('policyNumber', e.target.value)}
                    placeholder="Enter policy number"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="memberId">Member ID *</Label>
                  <Input
                    id="memberId"
                    required
                    value={formData.memberId}
                    onChange={(e) => handleInputChange('memberId', e.target.value)}
                    placeholder="Enter member ID"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="claimType">Claim Type *</Label>
                  <Select
                    value={formData.claimType}
                    onValueChange={(value) => handleInputChange('claimType', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cashless">Cashless</SelectItem>
                      <SelectItem value="reimbursement">Reimbursement</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="hospitalName">Hospital Name *</Label>
                  <Input
                    id="hospitalName"
                    required
                    value={formData.hospitalName}
                    onChange={(e) => handleInputChange('hospitalName', e.target.value)}
                    placeholder="Enter hospital name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dateOfAdmission">Date of Admission *</Label>
                  <Input
                    id="dateOfAdmission"
                    type="date"
                    required
                    value={formData.dateOfAdmission}
                    onChange={(e) => handleInputChange('dateOfAdmission', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="estimatedAmount">Estimated Amount *</Label>
                  <Input
                    id="estimatedAmount"
                    type="number"
                    required
                    value={formData.estimatedAmount}
                    onChange={(e) => handleInputChange('estimatedAmount', e.target.value)}
                    placeholder="Enter estimated amount"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contactNumber">Contact Number</Label>
                  <Input
                    id="contactNumber"
                    type="tel"
                    value={formData.contactNumber}
                    onChange={(e) => handleInputChange('contactNumber', e.target.value)}
                    placeholder="Enter contact number"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="emailId">Email ID</Label>
                  <Input
                    id="emailId"
                    type="email"
                    value={formData.emailId}
                    onChange={(e) => handleInputChange('emailId', e.target.value)}
                    placeholder="Enter email ID"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ailmentDetails">Ailment Details *</Label>
                <Textarea
                  id="ailmentDetails"
                  required
                  value={formData.ailmentDetails}
                  onChange={(e) => handleInputChange('ailmentDetails', e.target.value)}
                  placeholder="Describe the ailment/condition"
                  rows={4}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelectedProvider('')}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Submit Claim
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ClaimSubmissionUI;
