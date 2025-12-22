import AdminLayout from "@/components/layout/AdminLayout";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Plus, Search, Mail, Phone, Calendar, KeyRound } from "lucide-react";
import api from "@/utils/api";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface Nurse {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  department?: string;
  shift?: string;
  isActive?: boolean;
  createdAt: string;
  hasLogin?: boolean;
}

const NursesManagement = () => {
  const { toast } = useToast();
  const [nurses, setNurses] = useState<Nurse[]>([]);
  const [filtered, setFiltered] = useState<Nurse[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [selectedNurse, setSelectedNurse] = useState<Nurse | null>(null);
  const [loginPassword, setLoginPassword] = useState("");

  const [newNurse, setNewNurse] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phoneNumber: "",
    department: "",
    shift: "",
  });

  const fetchNurses = async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/admin/nurses");
      const list = (data as any).data || data || [];
      setNurses(list);
      setFiltered(list);
    } catch (err) {
      console.error("Failed to fetch nurses", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNurses();
  }, []);

  useEffect(() => {
    let f = nurses;
    if (searchTerm) {
      f = f.filter((n) =>
        `${n.firstName} ${n.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        n.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        n.phoneNumber.includes(searchTerm)
      );
    }
    setFiltered(f);
  }, [searchTerm, nurses]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const { data } = await api.post("/admin/nurses", { nurse: newNurse });
      const created = (data as any).nurse || data;
      setNurses((prev) => [created, ...prev]);
      setNewNurse({ firstName: "", lastName: "", email: "", phoneNumber: "", department: "", shift: "" });
    } catch (err) {
      console.error("Failed to create nurse", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLogin = async () => {
    if (!selectedNurse) return;
    if (!loginPassword.trim()) {
      toast({
        title: "Password required",
        description: "Please enter a password for the nurse login.",
        variant: "destructive",
      } as any);
      return;
    }

    try {
      setLoading(true);
      await api.post("/admin/nurse-users", {
        nurseId: selectedNurse.id,
        email: selectedNurse.email,
        firstName: selectedNurse.firstName,
        lastName: selectedNurse.lastName,
        phoneNumber: selectedNurse.phoneNumber,
        password: loginPassword,
      });
      toast({
        title: "Login created",
        description: `Login created for ${selectedNurse.firstName} ${selectedNurse.lastName}.`,
      } as any);
      setLoginDialogOpen(false);
      setSelectedNurse(null);
      setLoginPassword("");
    } catch (err: any) {
      const message = err?.response?.data?.message || "Failed to create nurse login";
      console.error("Failed to create nurse login", err);
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      } as any);
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
            <h2 className="text-3xl font-bold">Nurses Management</h2>
            <p className="text-muted-foreground">Configure nurse accounts and access</p>
          </div>
        </div>

        <Tabs defaultValue="list" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="list">View All Nurses</TabsTrigger>
            <TabsTrigger value="create">Create Nurse</TabsTrigger>
          </TabsList>

          <TabsContent value="list">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span>Nurses ({filtered.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-4 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search nurses by name, email, or phone..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading nurses...</div>
                ) : filtered.length ? (
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nurse</TableHead>
                          <TableHead>Contact</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead>Shift</TableHead>
                          <TableHead>Status</TableHead>
                            <TableHead>Login</TableHead>
                          <TableHead>Joined</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map((nurse) => (
                          <TableRow key={nurse.id}>
                            <TableCell>
                              <div className="font-medium">
                                {nurse.firstName} {nurse.lastName}
                              </div>
                              <div className="text-xs text-muted-foreground">ID: {nurse.id}</div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1 text-sm text-muted-foreground">
                                <div className="flex items-center gap-2">
                                  <Mail className="h-3 w-3" />
                                  <span>{nurse.email}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Phone className="h-3 w-3" />
                                  <span>{nurse.phoneNumber}</span>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>{nurse.department || "-"}</TableCell>
                            <TableCell>{nurse.shift || "-"}</TableCell>
                            <TableCell>
                              <button
                                type="button"
                                onClick={async () => {
                                  const next = !nurse.isActive;
                                  try {
                                    setNurses((prev) =>
                                      prev.map((d) =>
                                        d.id === nurse.id ? { ...d, isActive: next } : d
                                      )
                                    );
                                    await api.put(`/admin/nurses/${nurse.id}/status`, {
                                      isActive: next,
                                    });
                                  } catch (err) {
                                    console.error("Failed to update nurse status", err);
                                    // Revert on error
                                    setNurses((prev) =>
                                      prev.map((d) =>
                                        d.id === nurse.id ? { ...d, isActive: nurse.isActive } : d
                                      )
                                    );
                                  }
                                }}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                  nurse.isActive ? "bg-green-500" : "bg-gray-300"
                                }`}
                              >
                                <span
                                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                                    nurse.isActive ? "translate-x-5" : "translate-x-1"
                                  }`}
                                />
                              </button>
                            </TableCell>
                            <TableCell>
                              {nurse.hasLogin ? (
                                <Badge variant="outline" className="text-xs">
                                  Login Exists
                                </Badge>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedNurse(nurse);
                                    setLoginPassword("");
                                    setLoginDialogOpen(true);
                                  }}
                                >
                                  <KeyRound className="h-4 w-4 mr-1" />
                                  Create Login
                                </Button>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                {formatDate(nurse.createdAt)}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">No nurses found.</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="create">
            <Card>
              <CardHeader>
                <CardTitle>Create Nurse</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <Label>First Name</Label>
                      <Input
                        required
                        value={newNurse.firstName}
                        onChange={(e) => setNewNurse({ ...newNurse, firstName: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Last Name</Label>
                      <Input
                        required
                        value={newNurse.lastName}
                        onChange={(e) => setNewNurse({ ...newNurse, lastName: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Email</Label>
                      <Input
                        type="email"
                        required
                        value={newNurse.email}
                        onChange={(e) => setNewNurse({ ...newNurse, email: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Phone Number</Label>
                      <Input
                        required
                        value={newNurse.phoneNumber}
                        onChange={(e) => setNewNurse({ ...newNurse, phoneNumber: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Department</Label>
                      <Input
                        value={newNurse.department}
                        onChange={(e) => setNewNurse({ ...newNurse, department: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Shift</Label>
                      <Input
                        value={newNurse.shift}
                        onChange={(e) => setNewNurse({ ...newNurse, shift: e.target.value })}
                      />
                    </div>
                  </div>
                  <Button type="submit" disabled={loading} className="w-full">
                    <Plus className="mr-2 h-4 w-4" />
                    {loading ? "Creating..." : "Create Nurse"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        <Dialog open={loginDialogOpen} onOpenChange={setLoginDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Nurse Login</DialogTitle>
              <DialogDescription>
                Set an initial password for {selectedNurse?.firstName} {selectedNurse?.lastName}. Share it securely
                with the nurse; they can change it later.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 mt-2">
              <Label>Password</Label>
              <Input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Enter temporary password"
              />
            </div>
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setLoginDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateLogin} disabled={loading}>
                {loading ? "Creating..." : "Create Login"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default NursesManagement;
