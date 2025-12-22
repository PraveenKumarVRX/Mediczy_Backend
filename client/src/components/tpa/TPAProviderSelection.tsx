import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Building2,
  CheckCircle,
  XCircle,
  AlertCircle,
  FileText,
  CreditCard,
  Hospital,
  Users,
  Shield,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface TPAProvider {
  id: string;
  name: string;
  displayName: string;
  capabilities: {
    enrollment: boolean;
    claims: boolean;
    ecard: boolean;
    hospitals: boolean;
    policy: boolean;
    claimStatus: boolean;
    upload: boolean;
    preauth: boolean;
  };
  status: 'active' | 'inactive' | 'configured' | 'not-configured';
}

interface TPAProviderSelectionProps {
  onSelect?: (providers: string[]) => void;
  selectedProviders?: string[];
  multiSelect?: boolean;
}

const TPAProviderSelection: React.FC<TPAProviderSelectionProps> = ({
  onSelect,
  selectedProviders = [],
  multiSelect = true
}) => {
  const [providers, setProviders] = useState<TPAProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedProviders));
  const { toast } = useToast();

  useEffect(() => {
    fetchProviders();
  }, []);

  const fetchProviders = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/tpa/providers', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) throw new Error('Failed to fetch providers');

      const data = await response.json();
      setProviders(data.providers || []);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load TPA providers',
        variant: 'destructive'
      });
      console.error('Error fetching TPA providers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (providerId: string) => {
    const newSelected = new Set(selected);
    
    if (multiSelect) {
      if (newSelected.has(providerId)) {
        newSelected.delete(providerId);
      } else {
        newSelected.add(providerId);
      }
    } else {
      newSelected.clear();
      newSelected.add(providerId);
    }

    setSelected(newSelected);
    onSelect?.(Array.from(newSelected));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500';
      case 'configured':
        return 'bg-blue-500';
      case 'inactive':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-4 w-4" />;
      case 'configured':
        return <AlertCircle className="h-4 w-4" />;
      case 'inactive':
        return <XCircle className="h-4 w-4" />;
      default:
        return <Shield className="h-4 w-4" />;
    }
  };

  const getCapabilityIcon = (capability: string) => {
    const icons: Record<string, React.ReactNode> = {
      enrollment: <Users className="h-4 w-4" />,
      claims: <FileText className="h-4 w-4" />,
      ecard: <CreditCard className="h-4 w-4" />,
      hospitals: <Hospital className="h-4 w-4" />,
      policy: <Shield className="h-4 w-4" />,
      claimStatus: <AlertCircle className="h-4 w-4" />,
      upload: <FileText className="h-4 w-4" />,
      preauth: <CheckCircle className="h-4 w-4" />
    };
    return icons[capability] || <Building2 className="h-4 w-4" />;
  };

  const getCapabilityLabel = (capability: string) => {
    const labels: Record<string, string> = {
      enrollment: 'Enrollment',
      claims: 'Claims',
      ecard: 'E-Card',
      hospitals: 'Network Hospitals',
      policy: 'Policy Details',
      claimStatus: 'Claim Status',
      upload: 'Document Upload',
      preauth: 'Pre-Authorization'
    };
    return labels[capability] || capability;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Select TPA Provider{multiSelect && 's'}</h3>
        <Badge variant="outline">
          {providers.length} Provider{providers.length !== 1 && 's'} Available
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {providers.map((provider) => {
          const isSelected = selected.has(provider.id);
          const capabilities = Object.entries(provider.capabilities)
            .filter(([_, enabled]) => enabled)
            .map(([key]) => key);

          return (
            <Card
              key={provider.id}
              className={cn(
                'cursor-pointer transition-all hover:shadow-md',
                isSelected && 'ring-2 ring-primary'
              )}
              onClick={() => handleSelect(provider.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-base flex items-center gap-2">
                      {multiSelect && (
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => handleSelect(provider.id)}
                        />
                      )}
                      {provider.displayName || provider.name}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {provider.id}
                    </CardDescription>
                  </div>
                  <div className={cn('p-1 rounded-full', getStatusColor(provider.status))}>
                    {getStatusIcon(provider.status)}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Capabilities:</p>
                    <div className="flex flex-wrap gap-1">
                      {capabilities.map((capability) => (
                        <Badge
                          key={capability}
                          variant="secondary"
                          className="text-xs px-2 py-0.5"
                        >
                          <span className="mr-1">{getCapabilityIcon(capability)}</span>
                          {getCapabilityLabel(capability)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  
                  {capabilities.length === 0 && (
                    <div className="text-xs text-muted-foreground italic">
                      No capabilities configured
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {providers.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-8 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No TPA Providers Available</h3>
            <p className="text-sm text-muted-foreground">
              Configure TPA providers in the system settings to get started.
            </p>
          </CardContent>
        </Card>
      )}

      {selected.size > 0 && (
        <Card className="bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-primary" />
                <span className="font-medium">
                  {selected.size} Provider{selected.size !== 1 && 's'} Selected
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelected(new Set());
                  onSelect?.([]);
                }}
              >
                Clear Selection
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TPAProviderSelection;
