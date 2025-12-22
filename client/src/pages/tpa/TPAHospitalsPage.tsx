import HospitalSearchComponent from "@/components/tpa/HospitalSearchComponent";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Hospital, MapPin, Search } from "lucide-react";

export default function TPAHospitalsPage() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Network Hospital Search</h1>
        <p className="text-muted-foreground">
          Find network hospitals across all TPA providers with detailed information and directions
        </p>
      </div>

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Hospitals</CardTitle>
            <Hospital className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">10,000+</div>
            <p className="text-xs text-muted-foreground">Across all TPAs</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Search Options</CardTitle>
            <Search className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">4</div>
            <p className="text-xs text-muted-foreground">Search criteria</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Coverage</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">All India</div>
            <p className="text-xs text-muted-foreground">Pan-India network</p>
          </CardContent>
        </Card>
      </div>

      {/* Hospital Search */}
      <Card>
        <CardHeader>
          <CardTitle>Search Network Hospitals</CardTitle>
          <CardDescription>
            Search by location, name, or specialty to find hospitals in your TPA network
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HospitalSearchComponent />
        </CardContent>
      </Card>

      {/* Search Tips */}
      <Card className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
        <CardHeader>
          <CardTitle className="text-green-900 dark:text-green-100">Search Tips</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-green-800 dark:text-green-200">
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-green-600 mt-2"></div>
            <div className="flex-1">
              <p className="text-sm">
                <strong>Location-based search:</strong> Enter city, state, or pincode for hospitals in your area
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-green-600 mt-2"></div>
            <div className="flex-1">
              <p className="text-sm">
                <strong>Name search:</strong> Search for specific hospitals by name for quick results
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-green-600 mt-2"></div>
            <div className="flex-1">
              <p className="text-sm">
                <strong>TPA selection:</strong> Select your TPA provider first to see only relevant network hospitals
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-green-600 mt-2"></div>
            <div className="flex-1">
              <p className="text-sm">
                <strong>Directions:</strong> Click on any hospital card to get Google Maps directions
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
