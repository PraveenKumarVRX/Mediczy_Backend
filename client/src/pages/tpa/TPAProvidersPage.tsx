import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Shield,
  CheckCircle2,
  XCircle,
  Search,
  Activity,
  FileText,
  CreditCard,
  Hospital,
  Upload,
  Lock,
  Info
} from "lucide-react";
import api from "@/utils/api";
import { useToast } from "@/hooks/use-toast";

interface Provider {
  id: string;
  name: string;
  status: string;
  capabilities: string[];
  endpoints: number;
  authType: string;
  baseUrl: string;
}

export default function TPAProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    fetchProviders();
  }, []);

  const fetchProviders = async () => {
    try {
      setLoading(true);
      const response = await api.get("/api/tpa/providers");
      setProviders(response.data.providers || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to fetch TPA providers",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredProviders = providers.filter((provider) =>
    provider.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    provider.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500"><CheckCircle2 className="w-3 h-3 mr-1" />Active</Badge>;
      case "configured":
        return <Badge variant="secondary"><Activity className="w-3 h-3 mr-1" />Configured</Badge>;
      default:
        return <Badge variant="outline"><XCircle className="w-3 h-3 mr-1" />Inactive</Badge>;
    }
  };

  const getCapabilityIcon = (capability: string) => {
    switch (capability) {
      case "enrollment":
        return <Shield className="w-4 h-4" />;
      case "claims":
        return <FileText className="w-4 h-4" />;
      case "ecard":
        return <CreditCard className="w-4 h-4" />;
      case "hospitals":
        return <Hospital className="w-4 h-4" />;
      case "upload":
        return <Upload className="w-4 h-4" />;
      case "preauth":
        return <Lock className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">TPA Providers</h1>
        <p className="text-muted-foreground">
          Manage and monitor all Third-Party Administrator integrations
        </p>
      </div>

      {/* Search and Stats */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search providers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary" className="px-4 py-2">
            {providers.length} Total Providers
          </Badge>
          <Badge className="bg-green-500 px-4 py-2">
            {providers.filter((p) => p.status === "active").length} Active
          </Badge>
        </div>
      </div>

      {/* Providers Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredProviders.map((provider) => (
          <Card key={provider.id} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-xl">{provider.name}</CardTitle>
                  <CardDescription className="text-xs font-mono">
                    {provider.id}
                  </CardDescription>
                </div>
                {getStatusBadge(provider.status)}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Auth Type & Endpoints */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Auth:</span>
                <Badge variant="outline">{provider.authType}</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Endpoints:</span>
                <span className="font-medium">{provider.endpoints}</span>
              </div>

              {/* Capabilities */}
              <div className="space-y-2">
                <span className="text-sm font-medium">Capabilities</span>
                <div className="flex flex-wrap gap-2">
                  {provider.capabilities.map((capability) => (
                    <div
                      key={capability}
                      className="flex items-center gap-1 px-2 py-1 bg-secondary rounded-md text-xs"
                    >
                      {getCapabilityIcon(capability)}
                      <span>{capability}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" className="flex-1">
                  <Info className="w-4 h-4 mr-2" />
                  Details
                </Button>
                <Button size="sm" className="flex-1">
                  <Activity className="w-4 h-4 mr-2" />
                  Test
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredProviders.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Search className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No providers found</h3>
            <p className="text-muted-foreground text-center">
              Try adjusting your search term or check back later for new providers
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
