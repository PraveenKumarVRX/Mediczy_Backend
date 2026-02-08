import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Building,
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import AggregatorLayout from "@/components/aggregator/AggregatorLayout";
import api from "@/utils/api";

const AggregatorCorporates = () => {
  const [loading, setLoading] = useState(false);
  const [corporates, setCorporates] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    loadCorporates();
  }, []);

  const loadCorporates = async () => {
    setLoading(true);
    try {
      const response = await api.get("/api/aggregators/corporates");
      if (response.data?.data) {
        setCorporates(Array.isArray(response.data.data) ? response.data.data : []);
      }
    } catch (error) {
      console.error("Failed to load corporates", error);
      toast.error("Failed to load corporates");
    } finally {
      setLoading(false);
    }
  };

  const filteredCorporates = corporates.filter((corp) =>
    corp.companyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    corp.hrContactEmail?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      case "pending":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "suspended":
        return "bg-red-500/20 text-red-400 border-red-500/30";
      default:
        return "bg-slate-500/20 text-slate-400 border-slate-500/30";
    }
  };

  return (
    <AggregatorLayout title="Corporates" subtitle="Manage corporate clients in your network">
      <div className="space-y-6">
        {/* Header with Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by company name or email..."
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
            Add Corporate
          </Button>
        </div>

        {/* Corporates List */}
        <Card className="border-slate-700 bg-slate-800/50">
          <CardHeader>
            <CardTitle>Corporate Clients</CardTitle>
            <CardDescription>{filteredCorporates.length} corporates in your network</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
              </div>
            ) : filteredCorporates.length === 0 ? (
              <div className="text-center py-12">
                <Building className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">No corporates found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-300">Company Name</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-300">Contact</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-300">Status</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-300">Employees</th>
                      <th className="text-center py-3 px-4 text-sm font-semibold text-slate-300">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCorporates.map((corp, idx) => (
                      <tr key={idx} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                        <td className="py-3 px-4">
                          <p className="font-medium text-white">{corp.companyName || "—"}</p>
                        </td>
                        <td className="py-3 px-4">
                          <p className="text-sm text-slate-400">{corp.hrContactEmail || "—"}</p>
                        </td>
                        <td className="py-3 px-4">
                          <Badge className={`border ${getStatusColor(corp.status || "active")}`}>
                            {corp.status || "active"}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          <p className="text-sm text-white">{corp.totalEmployees || 0}</p>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-slate-400 hover:text-white"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AggregatorLayout>
  );
};

export default AggregatorCorporates;
