import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Badge } from "../../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../../components/ui/dialog";
import { Alert, AlertDescription } from "../../components/ui/alert";
import AdminLayout from '../../components/layout/AdminLayout';
import { useToast } from '../../hooks/use-toast';
import { 
  Key, Plus, Search, Eye, EyeOff, RefreshCw, Trash2, 
  AlertTriangle, CheckCircle, Copy, Clock, Shield,
  Activity, TrendingUp, Calendar, AlertCircle
} from 'lucide-react';
import apiCredentialsService, { ApiCredential } from '../../services/api-credentials.service';

interface CredentialWithDetails extends ApiCredential {
  name?: string;
  description?: string;
  integration_type?: string;
  organization_name?: string;
  scopes?: string[];
  metadata?: any;
}

interface GenerateFormState {
  name: string;
  description: string;
  integration_type: string;
  organization_id: string;
  expires_in_days: string;
  rotation_required_in_days: string;
  scopes: string[];
}

const ApiCredentialsManagement = () => {
  const { toast } = useToast();
  
  // State management
  const [loading, setLoading] = useState(false);
  const [credentials, setCredentials] = useState<CredentialWithDetails[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('list');
  
  // Dialog states
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [showRotateDialog, setShowRotateDialog] = useState(false);
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [showSecretDialog, setShowSecretDialog] = useState(false);
  const [selectedCredential, setSelectedCredential] = useState<CredentialWithDetails | null>(null);
  
  // Generated credentials (shown only once)
  const [generatedCredentials, setGeneratedCredentials] = useState<{
    client_id: string;
    client_secret: string;
    credential_id: string;
  } | null>(null);
  
  // Form states
  const [generateForm, setGenerateForm] = useState<GenerateFormState>({
    name: '',
    description: '',
    integration_type: 'smarthealth-rn',
    organization_id: '1',
    expires_in_days: '365',
    rotation_required_in_days: '90',
    scopes: ['mobile:auth', 'doctors:search', 'appointments:book', 'wellness:order']
  });
  
  const [gracePeriodDays, setGracePeriodDays] = useState('7');
  const [revokeReason, setRevokeReason] = useState('');
  const [secretVisible, setSecretVisible] = useState(false);

  // Fetch credentials on mount
  useEffect(() => {
    fetchCredentials();
  }, []);

  const fetchCredentials = async () => {
    try {
      setLoading(true);
      const data = await apiCredentialsService.getAllCredentials();
      setCredentials(data as CredentialWithDetails[]);
    } catch (err: any) {
      console.error('Failed to fetch credentials:', err);
      toast({
        title: "Error",
        description: err.message || "Failed to fetch API credentials",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Filtered credentials
  const filteredCredentials = useMemo(() => {
    return credentials.filter(cred => {
      const searchMatch = searchQuery === '' || 
        (cred.name?.toLowerCase().includes(searchQuery.toLowerCase()) || false) ||
        cred.client_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (cred.integration_type?.toLowerCase().includes(searchQuery.toLowerCase()) || false);

      const statusMatch = statusFilter === 'all' || cred.status === statusFilter;

      return searchMatch && statusMatch;
    });
  }, [credentials, searchQuery, statusFilter]);

  // Generate new credentials
  const handleGenerate = async () => {
    try {
      setLoading(true);
      
      // Validate form
      if (!generateForm.name || !generateForm.organization_id) {
        toast({
          title: "Validation Error",
          description: "Name and Organization ID are required",
          variant: "destructive"
        });
        return;
      }

      const result = await apiCredentialsService.generateCredentialsForAggregator(
        parseInt(generateForm.organization_id),
        generateForm.name,
        generateForm.description
      );

      setGeneratedCredentials(result);
      setShowGenerateDialog(false);
      setShowSecretDialog(true);
      
      toast({
        title: "Success",
        description: "API credentials generated successfully",
      });

      // Refresh list
      await fetchCredentials();
      
      // Reset form
      setGenerateForm({
        name: '',
        description: '',
        integration_type: 'smarthealth-rn',
        organization_id: '1',
        expires_in_days: '365',
        rotation_required_in_days: '90',
        scopes: ['mobile:auth', 'doctors:search', 'appointments:book', 'wellness:order']
      });
      
    } catch (err: any) {
      console.error('Failed to generate credentials:', err);
      toast({
        title: "Error",
        description: err.message || "Failed to generate credentials",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Rotate credentials
  const handleRotate = async () => {
    if (!selectedCredential) return;
    
    try {
      setLoading(true);
      await apiCredentialsService.rotateCredentials(
        selectedCredential.id,
        parseInt(gracePeriodDays)
      );
      
      toast({
        title: "Success",
        description: `Credentials rotated with ${gracePeriodDays} day grace period`,
      });
      
      setShowRotateDialog(false);
      setSelectedCredential(null);
      setGracePeriodDays('7');
      
      // Refresh list
      await fetchCredentials();
      
    } catch (err: any) {
      console.error('Failed to rotate credentials:', err);
      toast({
        title: "Error",
        description: err.message || "Failed to rotate credentials",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Revoke credentials
  const handleRevoke = async () => {
    if (!selectedCredential) return;
    
    try {
      setLoading(true);
      await apiCredentialsService.revokeCredentials(
        selectedCredential.id,
        revokeReason
      );
      
      toast({
        title: "Success",
        description: "Credentials revoked successfully",
      });
      
      setShowRevokeDialog(false);
      setSelectedCredential(null);
      setRevokeReason('');
      
      // Refresh list
      await fetchCredentials();
      
    } catch (err: any) {
      console.error('Failed to revoke credentials:', err);
      toast({
        title: "Error",
        description: err.message || "Failed to revoke credentials",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: `${label} copied to clipboard`,
    });
  };

  // Status badge component
  const StatusBadge = ({ status }: { status: ApiCredential['status'] }) => {
    const variants: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      expired: 'bg-red-100 text-red-800',
      rotated: 'bg-yellow-100 text-yellow-800',
      revoked: 'bg-gray-100 text-gray-800',
    };
    
    return (
      <Badge className={variants[status] || 'bg-gray-100 text-gray-800'}>
        {status.toUpperCase()}
      </Badge>
    );
  };

  // Warning badge for rotation/expiration
  const HealthBadge = ({ credential }: { credential: CredentialWithDetails }) => {
    const needsRotation = credential.rotation_required_at && 
      new Date(credential.rotation_required_at) <= new Date();
    const isExpired = credential.expires_at && 
      new Date(credential.expires_at) <= new Date();
    const expiringsSoon = credential.expires_at && 
      new Date(credential.expires_at) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    if (isExpired) {
      return (
        <Badge className="bg-red-100 text-red-800">
          <AlertTriangle className="h-3 w-3 mr-1" />
          EXPIRED
        </Badge>
      );
    }
    
    if (needsRotation) {
      return (
        <Badge className="bg-orange-100 text-orange-800">
          <RefreshCw className="h-3 w-3 mr-1" />
          ROTATION DUE
        </Badge>
      );
    }
    
    if (expiringsSoon) {
      return (
        <Badge className="bg-yellow-100 text-yellow-800">
          <Clock className="h-3 w-3 mr-1" />
          EXPIRING SOON
        </Badge>
      );
    }
    
    return (
      <Badge className="bg-green-100 text-green-800">
        <CheckCircle className="h-3 w-3 mr-1" />
        HEALTHY
      </Badge>
    );
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">API Credentials Management</h1>
            <p className="text-muted-foreground">
              Generate and manage API credentials for mobile apps and integrations
            </p>
          </div>
          <Button onClick={() => setShowGenerateDialog(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Generate New Credential
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Credentials</CardTitle>
              <Key className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{credentials.length}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {credentials.filter(c => c.status === 'active').length}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Need Rotation</CardTitle>
              <RefreshCw className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {credentials.filter(c => 
                  c.rotation_required_at && new Date(c.rotation_required_at) <= new Date()
                ).length}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Expired/Revoked</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {credentials.filter(c => c.status === 'expired' || c.status === 'revoked').length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Card>
          <CardHeader>
            <CardTitle>API Credentials</CardTitle>
            <CardDescription>
              Manage credentials for SmartHealth RN and other integrations
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Filters */}
            <div className="flex flex-col lg:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, client ID, or integration type..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full lg:w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="rotated">Rotated</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="revoked">Revoked</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Credentials Table */}
            {loading ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Loading credentials...</p>
              </div>
            ) : filteredCredentials.length === 0 ? (
              <div className="text-center py-8">
                <Key className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No API credentials found</p>
                <Button 
                  onClick={() => setShowGenerateDialog(true)} 
                  className="mt-4"
                  variant="outline"
                >
                  Generate First Credential
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name & Client ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Health</TableHead>
                      <TableHead>Usage</TableHead>
                      <TableHead>Expiration</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCredentials.map((credential) => (
                      <TableRow key={credential.id}>
                        <TableCell>
                          <div className="font-medium">{credential.name || 'Unnamed'}</div>
                          <div className="text-sm text-muted-foreground flex items-center gap-2">
                            <code className="text-xs bg-muted px-2 py-1 rounded">
                              {credential.client_id}
                            </code>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(credential.client_id, 'Client ID')}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                          {credential.integration_type && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Type: {credential.integration_type}
                            </div>
                          )}
                        </TableCell>
                        
                        <TableCell>
                          <StatusBadge status={credential.status} />
                          {credential.version > 1 && (
                            <div className="text-xs text-muted-foreground mt-1">
                              v{credential.version}
                            </div>
                          )}
                        </TableCell>
                        
                        <TableCell>
                          <HealthBadge credential={credential} />
                        </TableCell>
                        
                        <TableCell>
                          <div className="text-sm">
                            <div className="font-medium flex items-center gap-1">
                              <Activity className="h-3 w-3" />
                              {credential.usage_count || 0} calls
                            </div>
                            {credential.last_used_at && (
                              <div className="text-xs text-muted-foreground">
                                Last: {new Date(credential.last_used_at).toLocaleDateString()}
                              </div>
                            )}
                            {credential.failed_attempts && credential.failed_attempts > 0 && (
                              <div className="text-xs text-red-600">
                                {credential.failed_attempts} failed
                              </div>
                            )}
                          </div>
                        </TableCell>
                        
                        <TableCell>
                          {credential.expires_at ? (
                            <div className="text-sm">
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {new Date(credential.expires_at).toLocaleDateString()}
                              </div>
                              {credential.rotation_required_at && (
                                <div className="text-xs text-muted-foreground">
                                  Rotate: {new Date(credential.rotation_required_at).toLocaleDateString()}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">No expiration</span>
                          )}
                        </TableCell>
                        
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedCredential(credential);
                                setShowRotateDialog(true);
                              }}
                              disabled={credential.status !== 'active'}
                            >
                              <RefreshCw className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedCredential(credential);
                                setShowRevokeDialog(true);
                              }}
                              disabled={credential.status === 'revoked'}
                              className="text-red-600"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Generate Dialog */}
        <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Generate New API Credentials</DialogTitle>
              <DialogDescription>
                Create new API credentials for mobile app or integration. The secret will only be shown once.
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  placeholder="SmartHealth RN - Mayden Health"
                  value={generateForm.name}
                  onChange={(e) => setGenerateForm({...generateForm, name: e.target.value})}
                />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Mobile wellness app for Mayden employees"
                  value={generateForm.description}
                  onChange={(e) => setGenerateForm({...generateForm, description: e.target.value})}
                  rows={2}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="integration_type">Integration Type</Label>
                  <Select
                    value={generateForm.integration_type}
                    onValueChange={(value) => setGenerateForm({...generateForm, integration_type: value})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="smarthealth-rn">SmartHealth RN</SelectItem>
                      <SelectItem value="aggregator_api">Aggregator API</SelectItem>
                      <SelectItem value="partner_api">Partner API</SelectItem>
                      <SelectItem value="webhook">Webhook</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="organization_id">Organization ID *</Label>
                  <Input
                    id="organization_id"
                    type="number"
                    placeholder="1"
                    value={generateForm.organization_id}
                    onChange={(e) => setGenerateForm({...generateForm, organization_id: e.target.value})}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="expires_in_days">Expires In (days)</Label>
                  <Input
                    id="expires_in_days"
                    type="number"
                    placeholder="365"
                    value={generateForm.expires_in_days}
                    onChange={(e) => setGenerateForm({...generateForm, expires_in_days: e.target.value})}
                  />
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="rotation_required_in_days">Rotation Required (days)</Label>
                  <Input
                    id="rotation_required_in_days"
                    type="number"
                    placeholder="90"
                    value={generateForm.rotation_required_in_days}
                    onChange={(e) => setGenerateForm({...generateForm, rotation_required_in_days: e.target.value})}
                  />
                </div>
              </div>
              
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  The client secret will only be displayed once. Make sure to copy and store it securely.
                </AlertDescription>
              </Alert>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleGenerate} disabled={loading}>
                {loading ? 'Generating...' : 'Generate Credentials'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Secret Display Dialog */}
        <Dialog open={showSecretDialog} onOpenChange={setShowSecretDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                Credentials Generated Successfully
              </DialogTitle>
              <DialogDescription>
                Copy these credentials now. The secret will not be shown again.
              </DialogDescription>
            </DialogHeader>
            
            {generatedCredentials && (
              <div className="space-y-4 py-4">
                <Alert className="bg-yellow-50 border-yellow-200">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <AlertDescription className="text-yellow-800">
                    <strong>Important:</strong> This is the only time you'll see the client secret. 
                    Copy it now and store it securely.
                  </AlertDescription>
                </Alert>
                
                <div className="space-y-3">
                  <div className="grid gap-2">
                    <Label>Client ID</Label>
                    <div className="flex gap-2">
                      <Input
                        value={generatedCredentials.client_id}
                        readOnly
                        className="font-mono text-sm"
                      />
                      <Button
                        variant="outline"
                        onClick={() => copyToClipboard(generatedCredentials.client_id, 'Client ID')}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="grid gap-2">
                    <Label>Client Secret</Label>
                    <div className="flex gap-2">
                      <Input
                        type={secretVisible ? 'text' : 'password'}
                        value={generatedCredentials.client_secret}
                        readOnly
                        className="font-mono text-sm"
                      />
                      <Button
                        variant="outline"
                        onClick={() => setSecretVisible(!secretVisible)}
                      >
                        {secretVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => copyToClipboard(generatedCredentials.client_secret, 'Client Secret')}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="bg-muted p-4 rounded-lg">
                    <p className="text-sm font-medium mb-2">Usage Example (React Native):</p>
                    <pre className="text-xs bg-background p-3 rounded overflow-x-auto">
{`const credentials = {
  client_id: '${generatedCredentials.client_id}',
  client_secret: '${generatedCredentials.client_secret}'
};

// Store in secure storage
await SecureStore.setItemAsync('api_client_id', credentials.client_id);
await SecureStore.setItemAsync('api_client_secret', credentials.client_secret);`}
                    </pre>
                  </div>
                </div>
              </div>
            )}
            
            <DialogFooter>
              <Button onClick={() => {
                setShowSecretDialog(false);
                setGeneratedCredentials(null);
                setSecretVisible(false);
              }}>
                I've Saved the Credentials
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rotate Dialog */}
        <Dialog open={showRotateDialog} onOpenChange={setShowRotateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rotate API Credentials</DialogTitle>
              <DialogDescription>
                Generate a new secret while keeping the old one active during a grace period
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="gracePeriod">Grace Period (days)</Label>
                <Input
                  id="gracePeriod"
                  type="number"
                  placeholder="7"
                  value={gracePeriodDays}
                  onChange={(e) => setGracePeriodDays(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  Old credentials will remain valid for this many days
                </p>
              </div>
              
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  After rotation, both old and new credentials will work during the grace period. 
                  Update your app with the new secret before the grace period ends.
                </AlertDescription>
              </Alert>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRotateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleRotate} disabled={loading}>
                {loading ? 'Rotating...' : 'Rotate Credentials'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Revoke Dialog */}
        <Dialog open={showRevokeDialog} onOpenChange={setShowRevokeDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-red-600">Revoke API Credentials</DialogTitle>
              <DialogDescription>
                This will immediately invalidate the credentials. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="reason">Reason for Revocation</Label>
                <Textarea
                  id="reason"
                  placeholder="Security incident, credentials compromised, etc."
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  rows={3}
                />
              </div>
              
              <Alert className="bg-red-50 border-red-200">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800">
                  <strong>Warning:</strong> The credentials will be revoked immediately. 
                  All API calls using these credentials will fail.
                </AlertDescription>
              </Alert>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRevokeDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleRevoke} 
                disabled={loading}
                className="bg-red-600 hover:bg-red-700"
              >
                {loading ? 'Revoking...' : 'Revoke Credentials'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default ApiCredentialsManagement;
