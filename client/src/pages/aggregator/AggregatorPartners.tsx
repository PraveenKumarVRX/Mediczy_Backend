import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Heart,
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import AggregatorLayout from "@/components/aggregator/AggregatorLayout";
import api from "@/utils/api";

const AggregatorPartners = () => {
  const [loading, setLoading] = useState(false);
  const [partners, setPartners] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    loadPartners();
  }, []);

  const loadPartners = async () => {
    setLoading(true);
    try {
      const response = await api.get("/aggregators/wellness-partners");
      if (response.data?.data) {
        setPartners(Array.isArray(response.data.data) ? response.data.data : []);
      }
    } catch (error) {
      console.error("Failed to load partners", error);
      toast.error("Failed to load wellness partners");
    } finally {
      setLoading(false);
    }
  };

  const filteredPartners = partners.filter((partner) =>
    partner.providerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    partner.specialization?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getSpecializationColor = (spec: string) => {
    const colors: { [key: string]: string } = {
      hospital: "bg-blue-500/20 text-blue-400",
      clinic: "bg-green-500/20 text-green-400",
      pharmacy: "bg-purple-500/20 text-purple-400",
      lab: "bg-orange-500/20 text-orange-400",
      ambulance: "bg-red-500/20 text-red-400",
      diagnostic: "bg-yellow-500/20 text-yellow-400",
    };
    return colors[spec] || "bg-slate-500/20 text-slate-400";
  };

  return (
    <AggregatorLayout title="Wellness Partners" subtitle="Manage your network of healthcare providers">
      <div className="space-y-6">
        {/* Header with Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by provider name or specialization..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-slate-800 border-slate-700"
              />
            </div>
            <Button
              variant="outline"
              className="border-slate-700 text-slate-300 hover:text-white"
            >
              <Filter className="w-4 h-4 mr-2" />
              Filter
            </Button>
          </div>
          <Button
            onClick={() => {}}
            className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 w-full sm:w-auto"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Partner
          </Button>
        </div>

        {/* Partners Grid */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
          </div>
        ) : filteredPartners.length === 0 ? (
          <Card className="border-slate-700 bg-slate-800/50">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Heart className="w-12 h-12 text-slate-600 mb-4" />
              <p className="text-slate-400">No wellness partners found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPartners.map((partner, idx) => (
              <Card
                key={idx}
                className="border-slate-700 bg-slate-800/50 hover:border-indigo-500/50 transition-colors"
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{partner.providerName || "Provider"}</CardTitle>
                      <CardDescription>
                        {partner.specialization || "Healthcare Provider"}
                      </CardDescription>
                    </div>
                    {partner.rating && (
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`w-4 h-4 ${
                              i < partner.rating
                                ? "fill-yellow-400 text-yellow-400"
                                : "text-slate-600"
                            }`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Specialization</p>
                    <Badge className={`${getSpecializationColor(partner.specialization)}`}>
                      {partner.specialization || "General"}
                    </Badge>
                  </div>

                  {partner.location && (
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Location</p>
                      <p className="text-sm text-white">{partner.location}</p>
                    </div>
                  )}

                  {partner.email && (
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Contact</p>
                      <p className="text-sm text-white break-all">{partner.email}</p>
                    </div>
                  )}

                  {partner.status && (
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Status</p>
                      <Badge
                        variant="outline"
                        className={`border ${
                          partner.status === "active"
                            ? "border-green-500/30 text-green-400 bg-green-500/10"
                            : "border-yellow-500/30 text-yellow-400 bg-yellow-500/10"
                        }`}
                      >
                        {partner.status}
                      </Badge>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2 border-t border-slate-700">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 border-slate-600 text-indigo-400 hover:text-indigo-300"
                    >
                      View Details
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-slate-600 text-slate-300 hover:text-white"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AggregatorLayout>
  );
};

export default AggregatorPartners;
