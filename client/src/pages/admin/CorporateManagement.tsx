import AdminLayout from "@/components/layout/AdminLayout";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Plus, Search, Mail, Phone, Calendar, Building2, KeyRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import api from "@/utils/api";

interface Corporate {
  id: string;
  organizationName: string;
  contactPersonName: string;
  contactEmail: string;
  contactPhone: string;
  employeeCount?: number;
  contractStatus?: string;
  isActive?: boolean;
  createdAt: string;
}

const CorporateManagement = () => {
  const [corporates, setCorporates] = useState<Corporate[]>([]);
  const [filtered, setFiltered] = useState<Corporate[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);

  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [selectedCorporate, setSelectedCorporate] = useState<Corporate | null>(null);
  const [creatingLogin, setCreatingLogin] = useState(false);
  const [newLogin, setNewLogin] = useState({
    email: "",
    name: "",
    phoneNumber: "",
    password: "",
  });

  const [newCorporate, setNewCorporate] = useState({
    organizationName: "",
    contactPersonName: "",
    contactEmail: "",
    contactPhone: "",
    employeeCount: "",
    contractStatus: "Active",
  });

  const fetchCorporates = async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/admin/corporates");
      const list = (data as any).data || data || [];
      setCorporates(list);
      setFiltered(list);
    } catch (err) {
      console.error("Failed to fetch corporates", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCorporates();
  }, []);

  useEffect(() => {
    let f = corporates;
    if (searchTerm) {
      f = f.filter((c) =>
        c.organizationName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.contactPersonName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.contactEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.contactPhone.includes(searchTerm)
      );
    }
    setFiltered(f);
  }, [searchTerm, corporates]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const { data } = await api.post("/admin/corporates", { corporate: newCorporate });
      const created = (data as any).corporate || data;
      setCorporates((prev) => [created, ...prev]);
      setNewCorporate({
        organizationName: "",
        contactPersonName: "",
        contactEmail: "",
        contactPhone: "",
        employeeCount: "",
        contractStatus: "Active",
      });
    } catch (err) {
      console.error("Failed to create corporate", err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold">Corporate Management</h2>
            <p className="text-muted-foreground">Configure corporate logins and contracts</p>
          </div>
        </div>

        <Tabs defaultValue="list" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="list">View All Corporates</TabsTrigger>
            <TabsTrigger value="create">Create Corporate</TabsTrigger>
          </TabsList>

          <TabsContent value="list">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-blue-500" />
                  <span>Corporates ({filtered.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-4 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by organization or contact..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading corporates...</div>
                ) : filtered.length ? (
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Organization</TableHead>
                          <TableHead>Contact</TableHead>
                          <TableHead>Employees</TableHead>
                          <TableHead>Contract</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Joined</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map((corp) => (
                          <TableRow key={corp.id}>
                            <TableCell>
                              <div className="font-medium">{corp.organizationName}</div>
                              <div className="text-xs text-muted-foreground">ID: {corp.id}</div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1 text-sm text-muted-foreground">
                                <div className="flex items-center gap-2">
                                  <Mail className="h-3 w-3" />
                                  <span>{corp.contactEmail}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Phone className="h-3 w-3" />
                                  <span>{corp.contactPhone}</span>
                                </div>
                                <div className="text-xs">{corp.contactPersonName}</div>
                              </div>
                            </TableCell>
                            <TableCell>{corp.employeeCount ?? "-"}</TableCell>
                            <TableCell>{corp.contractStatus || "Active"}</TableCell>
                            <TableCell>
                              <button
                                type="button"
                                onClick={() =>
                                  setCorporates((prev) =>
                                    prev.map((d) =>
                                      d.id === corp.id ? { ...d, isActive: !d.isActive } : d
                                    )
                                  )
                                }
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                  corp.isActive ? "bg-green-500" : "bg-gray-300"
                                }`}
                              >
                                <span
                                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                                    corp.isActive ? "translate-x-5" : "translate-x-1"
                                  }`}
                                />
                              </button>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                {formatDate(corp.createdAt)}
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                className="mt-2 text-xs"
                                onClick={() => {
                                  setSelectedCorporate(corp);
                                  setNewLogin({
                                    email: corp.contactEmail || "",
                                    name: corp.contactPersonName || corp.organizationName,
                                    phoneNumber: corp.contactPhone || "",
                                    password: "",
                                  });
                                  setLoginDialogOpen(true);
                                }}
                              >
                                <KeyRound className="h-3 w-3 mr-1" />
                                Manage Logins
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">No corporates found.</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="create">
            <Card>
              <CardHeader>
                <CardTitle>Create Corporate</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <Label>Organization Name</Label>
                      <Input
                        required
                        value={newCorporate.organizationName}
                        onChange={(e) => setNewCorporate({ ...newCorporate, organizationName: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Contact Person</Label>
                      <Input
                        required
                        value={newCorporate.contactPersonName}
                        onChange={(e) => setNewCorporate({ ...newCorporate, contactPersonName: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Contact Email</Label>
                      <Input
                        type="email"
                        required
                        value={newCorporate.contactEmail}
                        onChange={(e) => setNewCorporate({ ...newCorporate, contactEmail: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Contact Phone</Label>
                      <Input
                        required
                        value={newCorporate.contactPhone}
                        onChange={(e) => setNewCorporate({ ...newCorporate, contactPhone: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Employee Count</Label>
                      <Input
                        type="number"
                        value={newCorporate.employeeCount}
                        onChange={(e) => setNewCorporate({ ...newCorporate, employeeCount: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Contract Status</Label>
                      <Input
                        value={newCorporate.contractStatus}
                        onChange={(e) => setNewCorporate({ ...newCorporate, contractStatus: e.target.value })}
                      />
                    </div>
                  </div>
                  <Button type="submit" disabled={loading} className="w-full">
                    <Plus className="mr-2 h-4 w-4" />
                    {loading ? "Creating..." : "Create Corporate"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={loginDialogOpen} onOpenChange={setLoginDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Manage Corporate Login{selectedCorporate ? ` - ${selectedCorporate.organizationName}` : ""}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Email (login)</Label>
                  <Input
                    type="email"
                    value={newLogin.email}
                    onChange={(e) => setNewLogin({ ...newLogin, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Contact Name</Label>
                  <Input
                    value={newLogin.name}
                    onChange={(e) => setNewLogin({ ...newLogin, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Phone Number</Label>
                  <Input
                    value={newLogin.phoneNumber}
                    onChange={(e) => setNewLogin({ ...newLogin, phoneNumber: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Temporary Password</Label>
                  <Input
                    type="password"
                    value={newLogin.password}
                    onChange={(e) => setNewLogin({ ...newLogin, password: e.target.value })}
                    placeholder="Set or regenerate later"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setLoginDialogOpen(false)}
                  disabled={creatingLogin}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={creatingLogin || !selectedCorporate}
                  onClick={async () => {
                    if (!selectedCorporate) return;
                    try {
                      setCreatingLogin(true);
                      await api.post("/admin/corporate-users", {
                        corporateId: selectedCorporate.id,
                        email: newLogin.email,
                        name: newLogin.name,
                        phoneNumber: newLogin.phoneNumber,
                        password: newLogin.password,
                      });
                      setLoginDialogOpen(false);
                    } catch (err) {
                      console.error("Failed to create corporate login", err);
                    } finally {
                      setCreatingLogin(false);
                    }
                  }}
                >
                  {creatingLogin ? "Saving..." : "Create / Update Login"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default CorporateManagement;
