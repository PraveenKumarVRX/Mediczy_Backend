import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TPAProviderSelection from "@/components/tpa/TPAProviderSelection";
import ClaimSubmissionUI from "@/components/tpa/ClaimSubmissionUI";
import ECardDisplay from "@/components/tpa/ECardDisplay";
import HospitalSearchComponent from "@/components/tpa/HospitalSearchComponent";
import {
  Shield,
  FileText,
  CreditCard,
  Hospital,
  Activity,
  CheckCircle2
} from "lucide-react";

export default function TPAIntegrationPage() {
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">TPA Integration Hub</h1>
        <p className="text-muted-foreground">
          Comprehensive Third-Party Administrator integration for seamless insurance operations
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total TPAs</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">17</div>
            <p className="text-xs text-muted-foreground">9 active, 8 coming soon</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">API Endpoints</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">184+</div>
            <p className="text-xs text-muted-foreground">Across all providers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Capabilities</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">10+</div>
            <p className="text-xs text-muted-foreground">Unified operations</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">99.8%</div>
            <p className="text-xs text-muted-foreground">API uptime</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="providers" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="providers">
            <Shield className="w-4 h-4 mr-2" />
            Providers
          </TabsTrigger>
          <TabsTrigger value="claims">
            <FileText className="w-4 h-4 mr-2" />
            Claims
          </TabsTrigger>
          <TabsTrigger value="ecard">
            <CreditCard className="w-4 h-4 mr-2" />
            E-Card
          </TabsTrigger>
          <TabsTrigger value="hospitals">
            <Hospital className="w-4 h-4 mr-2" />
            Hospitals
          </TabsTrigger>
        </TabsList>

        <TabsContent value="providers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>TPA Provider Selection</CardTitle>
              <CardDescription>
                Select one or more TPA providers to view their capabilities and integrate with their services
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TPAProviderSelection
                multiSelect={true}
                onSelect={setSelectedProviders}
                selectedProviders={selectedProviders}
              />
            </CardContent>
          </Card>

          {selectedProviders.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Selected Providers</CardTitle>
                <CardDescription>
                  {selectedProviders.length} provider(s) selected
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {selectedProviders.map((provider) => (
                    <div
                      key={provider}
                      className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium"
                    >
                      {provider.toUpperCase()}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="claims" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Claim Submission</CardTitle>
              <CardDescription>
                Submit insurance claims to any TPA provider through our unified interface
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ClaimSubmissionUI
                onSuccess={(claimNumber) => {
                  console.log("Claim submitted successfully:", claimNumber);
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ecard" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>E-Card Retrieval</CardTitle>
              <CardDescription>
                Retrieve and display digital health insurance cards from TPA providers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ECardDisplay policyNumber="" memberId="" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hospitals" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Network Hospital Search</CardTitle>
              <CardDescription>
                Search for network hospitals across all TPA providers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <HospitalSearchComponent />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common TPA operations for quick access</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <button className="flex flex-col items-center p-4 border rounded-lg hover:bg-accent transition-colors">
              <FileText className="h-8 w-8 mb-2 text-primary" />
              <span className="font-medium">View Claims</span>
              <span className="text-xs text-muted-foreground mt-1">Check claim status</span>
            </button>
            <button className="flex flex-col items-center p-4 border rounded-lg hover:bg-accent transition-colors">
              <CreditCard className="h-8 w-8 mb-2 text-primary" />
              <span className="font-medium">Download E-Card</span>
              <span className="text-xs text-muted-foreground mt-1">Get digital card</span>
            </button>
            <button className="flex flex-col items-center p-4 border rounded-lg hover:bg-accent transition-colors">
              <Hospital className="h-8 w-8 mb-2 text-primary" />
              <span className="font-medium">Find Hospital</span>
              <span className="text-xs text-muted-foreground mt-1">Network search</span>
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
