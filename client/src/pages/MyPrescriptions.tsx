import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  FileText,
  Download,
  Eye,
  Search,
  Filter,
  Loader2,
  User,
  Calendar,
  Pill,
  Stethoscope,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  Phone,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/auth/AuthProvider";
import api from "@/utils/api";
import MainLayout from "@/components/layout/MainLayout";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Medication {
  name: string;
  composition?: string;
  dosage: string;
  frequency: string;
  duration: string;
  quantity?: string;
  instructions?: string;
}

interface Vitals {
  bloodPressure?: string;
  pulse?: string;
  temperature?: string;
  weight?: string;
  height?: string;
  spo2?: string;
}

interface Prescription {
  id: number;
  prescriptionNumber: string;
  appointmentId?: number;
  doctorId: number;
  doctorName?: string;
  doctorQualifications?: string;
  clinicName?: string;
  patientName: string;
  patientAge?: number;
  patientGender?: string;
  patientPhone?: string;
  vitals?: Vitals;
  chiefComplaints?: string;
  diagnosis?: string;
  medications: Medication[];
  instructions: string[];
  labTests: string[];
  followUpDate?: string;
  validityDays: number;
  status: "draft" | "issued" | "cancelled" | "expired";
  issuedAt?: string;
  createdAt: string;
  updatedAt: string;
}

const MyPrescriptions = () => {
  const { toast } = useToast();
  const { currentUser } = useAuth();

  const [selectedPrescription, setSelectedPrescription] = useState<Prescription | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  // Fetch patient prescriptions
  const { data: prescriptions = [], isLoading } = useQuery({
    queryKey: ["myPrescriptions", currentUser?._id],
    queryFn: async () => {
      const { data } = await api.get("/prescriptions/patient");
      return (data as any).prescriptions || data || [];
    },
    enabled: !!currentUser?._id,
  });

  const handleDownloadPDF = async (id: number, prescriptionNumber?: string) => {
    try {
      const response = await api.get(`/prescriptions/${id}/pdf`, {
        responseType: "blob",
      });
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `prescription-${prescriptionNumber || id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast({
        title: "Downloaded",
        description: "Prescription PDF downloaded successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to download PDF",
        variant: "destructive",
      });
    }
  };

  const openViewDialog = (prescription: Prescription) => {
    setSelectedPrescription(prescription);
    setViewDialogOpen(true);
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
      draft: { variant: "secondary", icon: Clock },
      issued: { variant: "default", icon: CheckCircle },
      cancelled: { variant: "destructive", icon: XCircle },
      expired: { variant: "outline", icon: AlertCircle },
    };
    const { variant, icon: Icon } = styles[status] || styles.issued;
    return (
      <Badge variant={variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  // Check if prescription is expired
  const isExpired = (prescription: Prescription): boolean => {
    if (!prescription.issuedAt || prescription.status === "expired" || prescription.status === "cancelled") {
      return prescription.status === "expired";
    }
    const issuedDate = new Date(prescription.issuedAt);
    const expiryDate = new Date(issuedDate);
    expiryDate.setDate(expiryDate.getDate() + (prescription.validityDays || 30));
    return new Date() > expiryDate;
  };

  // Filter prescriptions - only show issued prescriptions to patients (not drafts)
  const filteredPrescriptions = prescriptions.filter((rx: Prescription) => {
    const matchesSearch =
      rx.doctorName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rx.prescriptionNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rx.diagnosis?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === "all" || rx.status === filterStatus;
    // Only show issued prescriptions to patients
    const isVisible = rx.status !== "draft";
    return matchesSearch && matchesStatus && isVisible;
  });

  return (
    <MainLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <FileText className="h-8 w-8 text-blue-600" />
              My Prescriptions
            </h1>
            <p className="text-muted-foreground mt-1">
              View and download your medical prescriptions
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Prescriptions</p>
                  <h3 className="text-2xl font-bold">
                    {prescriptions.filter((rx: Prescription) => rx.status !== "draft").length}
                  </h3>
                </div>
                <FileText className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active</p>
                  <h3 className="text-2xl font-bold">
                    {prescriptions.filter((rx: Prescription) => 
                      rx.status === "issued" && !isExpired(rx)
                    ).length}
                  </h3>
                </div>
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Expired</p>
                  <h3 className="text-2xl font-bold">
                    {prescriptions.filter((rx: Prescription) => 
                      rx.status === "expired" || (rx.status === "issued" && isExpired(rx))
                    ).length}
                  </h3>
                </div>
                <AlertCircle className="h-8 w-8 text-orange-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by doctor name, prescription number, or diagnosis..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[180px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filter Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="issued">Active</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Prescriptions List */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center items-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            ) : filteredPrescriptions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No prescriptions found</h3>
                <p className="text-muted-foreground">
                  {searchQuery 
                    ? "Try adjusting your search" 
                    : "Your prescriptions will appear here after a doctor consultation"}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rx #</TableHead>
                      <TableHead>Doctor</TableHead>
                      <TableHead>Diagnosis</TableHead>
                      <TableHead>Medications</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPrescriptions.map((rx: Prescription) => (
                      <TableRow key={rx.id}>
                        <TableCell className="font-mono text-sm">
                          {rx.prescriptionNumber || `RX-${rx.id}`}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="font-medium">Dr. {rx.doctorName || "Unknown"}</p>
                              {rx.clinicName && (
                                <p className="text-xs text-muted-foreground">{rx.clinicName}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {rx.diagnosis || "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="flex items-center gap-1 w-fit">
                            <Pill className="h-3 w-3" />
                            {rx.medications?.length || 0} meds
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {isExpired(rx) && rx.status === "issued" 
                            ? getStatusBadge("expired")
                            : getStatusBadge(rx.status)}
                        </TableCell>
                        <TableCell>
                          {rx.issuedAt 
                            ? format(new Date(rx.issuedAt), "MMM dd, yyyy")
                            : format(new Date(rx.createdAt), "MMM dd, yyyy")}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => openViewDialog(rx)} 
                              title="View Details"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleDownloadPDF(rx.id, rx.prescriptionNumber)} 
                              title="Download PDF"
                            >
                              <Download className="h-4 w-4" />
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

        {/* View Prescription Dialog */}
        <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                Prescription #{selectedPrescription?.prescriptionNumber || selectedPrescription?.id}
                {selectedPrescription && (
                  isExpired(selectedPrescription) && selectedPrescription.status === "issued"
                    ? getStatusBadge("expired")
                    : getStatusBadge(selectedPrescription.status)
                )}
              </DialogTitle>
              <DialogDescription>
                View your prescription details
              </DialogDescription>
            </DialogHeader>

            {selectedPrescription && (
              <div className="space-y-6">
                {/* Doctor Info */}
                <Card className="p-4 bg-blue-50 border-blue-200">
                  <div className="flex items-start gap-4">
                    <div className="bg-blue-100 p-3 rounded-full">
                      <Stethoscope className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">Dr. {selectedPrescription.doctorName || "Unknown"}</h3>
                      {selectedPrescription.doctorQualifications && (
                        <p className="text-sm text-muted-foreground">{selectedPrescription.doctorQualifications}</p>
                      )}
                      {selectedPrescription.clinicName && (
                        <p className="text-sm text-muted-foreground mt-1">{selectedPrescription.clinicName}</p>
                      )}
                    </div>
                  </div>
                </Card>

                {/* Issue Date & Validity */}
                <div className="grid grid-cols-2 gap-4">
                  <Card className="p-3">
                    <p className="text-sm text-muted-foreground">Issued On</p>
                    <p className="font-medium">
                      {selectedPrescription.issuedAt 
                        ? format(new Date(selectedPrescription.issuedAt), "MMMM dd, yyyy")
                        : format(new Date(selectedPrescription.createdAt), "MMMM dd, yyyy")}
                    </p>
                  </Card>
                  <Card className="p-3">
                    <p className="text-sm text-muted-foreground">Valid For</p>
                    <p className="font-medium">{selectedPrescription.validityDays || 30} days</p>
                  </Card>
                </div>

                {/* Vitals */}
                {selectedPrescription.vitals && Object.values(selectedPrescription.vitals).some(v => v) && (
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <Stethoscope className="h-4 w-4" /> Recorded Vitals
                    </h4>
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                      {selectedPrescription.vitals.bloodPressure && (
                        <Card className="p-3 text-center">
                          <p className="text-xs text-muted-foreground">BP</p>
                          <p className="font-bold text-blue-600">{selectedPrescription.vitals.bloodPressure}</p>
                        </Card>
                      )}
                      {selectedPrescription.vitals.pulse && (
                        <Card className="p-3 text-center">
                          <p className="text-xs text-muted-foreground">Pulse</p>
                          <p className="font-bold text-blue-600">{selectedPrescription.vitals.pulse} bpm</p>
                        </Card>
                      )}
                      {selectedPrescription.vitals.temperature && (
                        <Card className="p-3 text-center">
                          <p className="text-xs text-muted-foreground">Temp</p>
                          <p className="font-bold text-blue-600">{selectedPrescription.vitals.temperature}°F</p>
                        </Card>
                      )}
                      {selectedPrescription.vitals.weight && (
                        <Card className="p-3 text-center">
                          <p className="text-xs text-muted-foreground">Weight</p>
                          <p className="font-bold text-blue-600">{selectedPrescription.vitals.weight} kg</p>
                        </Card>
                      )}
                    </div>
                  </div>
                )}

                {/* Diagnosis */}
                {selectedPrescription.chiefComplaints && (
                  <div>
                    <h4 className="font-semibold mb-2">Chief Complaints</h4>
                    <p className="text-muted-foreground bg-yellow-50 p-3 rounded border-l-4 border-yellow-400">
                      {selectedPrescription.chiefComplaints}
                    </p>
                  </div>
                )}
                {selectedPrescription.diagnosis && (
                  <div>
                    <h4 className="font-semibold mb-2">Diagnosis</h4>
                    <p className="text-muted-foreground bg-blue-50 p-3 rounded border-l-4 border-blue-400">
                      {selectedPrescription.diagnosis}
                    </p>
                  </div>
                )}

                {/* Medications */}
                <div>
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <Pill className="h-4 w-4 text-blue-600" /> 
                    Prescribed Medications ({selectedPrescription.medications?.length || 0})
                  </h4>
                  <div className="space-y-3">
                    {selectedPrescription.medications?.map((med, i) => (
                      <Card key={i} className="p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <h5 className="font-medium flex items-center gap-2">
                              <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded">
                                {i + 1}
                              </span>
                              {med.name}
                            </h5>
                            {med.composition && (
                              <p className="text-xs text-muted-foreground mt-1">{med.composition}</p>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-sm">
                          <div>
                            <span className="text-muted-foreground">Dosage:</span>
                            <p className="font-medium">{med.dosage || "-"}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Frequency:</span>
                            <p className="font-medium">{med.frequency || "-"}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Duration:</span>
                            <p className="font-medium">{med.duration || "-"}</p>
                          </div>
                          {med.quantity && (
                            <div>
                              <span className="text-muted-foreground">Quantity:</span>
                              <p className="font-medium">{med.quantity}</p>
                            </div>
                          )}
                        </div>
                        {med.instructions && (
                          <p className="text-sm text-muted-foreground mt-2 bg-green-50 p-2 rounded">
                            ℹ️ {med.instructions}
                          </p>
                        )}
                      </Card>
                    ))}
                  </div>
                </div>

                {/* Instructions */}
                {selectedPrescription.instructions?.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">Instructions & Precautions</h4>
                    <ul className="space-y-2">
                      {selectedPrescription.instructions.map((inst, i) => (
                        inst && (
                          <li key={i} className="flex items-start gap-2 bg-green-50 p-3 rounded">
                            <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                            <span>{inst}</span>
                          </li>
                        )
                      ))}
                    </ul>
                  </div>
                )}

                {/* Lab Tests */}
                {selectedPrescription.labTests?.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">Lab Tests Advised</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedPrescription.labTests.map((test, i) => (
                        test && (
                          <Badge key={i} variant="outline" className="bg-red-50 text-red-700">
                            🔬 {test}
                          </Badge>
                        )
                      ))}
                    </div>
                  </div>
                )}

                {/* Follow-up */}
                {selectedPrescription.followUpDate && (
                  <Card className="p-4 bg-blue-50 border-blue-200">
                    <div className="flex items-center gap-3">
                      <Calendar className="h-5 w-5 text-blue-600" />
                      <div>
                        <p className="text-sm text-muted-foreground">Follow-up Visit</p>
                        <p className="font-medium">
                          {format(new Date(selectedPrescription.followUpDate), "MMMM dd, yyyy")}
                        </p>
                      </div>
                    </div>
                  </Card>
                )}

                {/* Expiry Warning */}
                {isExpired(selectedPrescription) && selectedPrescription.status === "issued" && (
                  <Card className="p-4 bg-orange-50 border-orange-200">
                    <div className="flex items-center gap-3">
                      <AlertCircle className="h-5 w-5 text-orange-600" />
                      <div>
                        <p className="font-medium text-orange-700">This prescription has expired</p>
                        <p className="text-sm text-orange-600">
                          Please consult your doctor for a new prescription if needed.
                        </p>
                      </div>
                    </div>
                  </Card>
                )}
              </div>
            )}

            <DialogFooter className="mt-6">
              <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
                Close
              </Button>
              <Button onClick={() => handleDownloadPDF(selectedPrescription!.id, selectedPrescription!.prescriptionNumber)}>
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
};

export default MyPrescriptions;
