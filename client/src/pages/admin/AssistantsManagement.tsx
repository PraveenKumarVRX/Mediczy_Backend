import AdminLayout from "@/components/layout/AdminLayout";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Plus, Search, Mail, Phone, Calendar, Users, KeyRound } from "lucide-react";
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

interface Assistant {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  linkedDoctorId?: string;
  roleTitle?: string;
  isActive?: boolean;
  createdAt: string;
  hasLogin?: boolean;
}

const AssistantsManagement = () => {
  const { toast } = useToast();
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [filtered, setFiltered] = useState<Assistant[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [selectedAssistant, setSelectedAssistant] = useState<Assistant | null>(null);
  const [loginPassword, setLoginPassword] = useState("");

  const [newAssistant, setNewAssistant] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phoneNumber: "",
    linkedDoctorId: "",
    roleTitle: "",
  });

  const fetchAssistants = async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/admin/assistants");
      const list = (data as any).data || data || [];
      setAssistants(list);
      setFiltered(list);
    } catch (err) {
      console.error("Failed to fetch assistants", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssistants();
  }, []);

  useEffect(() => {
    let f = assistants;
    if (searchTerm) {
      f = f.filter((a) =>
        `${a.firstName} ${a.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.phoneNumber.includes(searchTerm)
      );
    }
    setFiltered(f);
  }, [searchTerm, assistants]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const { data } = await api.post("/admin/assistants", { assistant: newAssistant });
      const created = (data as any).assistant || data;
      setAssistants((prev) => [created, ...prev]);
      setNewAssistant({ firstName: "", lastName: "", email: "", phoneNumber: "", linkedDoctorId: "", roleTitle: "" });
    } catch (err) {
      console.error("Failed to create assistant", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLogin = async () => {
    if (!selectedAssistant) return;
    if (!loginPassword.trim()) {
      toast({
        title: "Password required",
        description: "Please enter a password for the assistant login.",
        variant: "destructive",
      } as any);
      return;
    }

    try {
      setLoading(true);
      await api.post("/admin/assistant-users", {
        assistantId: selectedAssistant.id,
        email: selectedAssistant.email,
        firstName: selectedAssistant.firstName,
        lastName: selectedAssistant.lastName,
        phoneNumber: selectedAssistant.phoneNumber,
        password: loginPassword,
      });
      toast({
        title: "Login created",
        description: `Login created for ${selectedAssistant.firstName} ${selectedAssistant.lastName}.`,
      } as any);
      setLoginDialogOpen(false);
      setSelectedAssistant(null);
      setLoginPassword("");
    } catch (err: any) {
      const message = err?.response?.data?.message || "Failed to create assistant login";
      console.error("Failed to create assistant login", err);
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
            <h2 className="text-3xl font-bold">Doctor Assistants Management</h2>
            <p className="text-muted-foreground">Configure doctor assistant logins and mapping</p>
          </div>
        </div>

        <Tabs defaultValue="list" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="list">View All Assistants</TabsTrigger>
            <TabsTrigger value="create">Create Assistant</TabsTrigger>
          </TabsList>

          <TabsContent value="list">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-blue-500" />
                  <span>Assistants ({filtered.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-4 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search assistants by name, email, or phone..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading assistants...</div>
                ) : filtered.length ? (
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Assistant</TableHead>
                          <TableHead>Contact</TableHead>
                          <TableHead>Linked Doctor</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Login</TableHead>
                          <TableHead>Joined</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map((assistant) => (
                          <TableRow key={assistant.id}>
                            <TableCell>
                              <div className="font-medium">
                                {assistant.firstName} {assistant.lastName}
                              </div>
                              <div className="text-xs text-muted-foreground">ID: {assistant.id}</div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1 text-sm text-muted-foreground">
                                <div className="flex items-center gap-2">
                                  <Mail className="h-3 w-3" />
                                  <span>{assistant.email}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Phone className="h-3 w-3" />
                                  <span>{assistant.phoneNumber}</span>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>{assistant.linkedDoctorId || "-"}</TableCell>
                            <TableCell>{assistant.roleTitle || "Doctor Assistant"}</TableCell>
                            <TableCell>
                              <button
                                type="button"
                                onClick={async () => {
                                  const next = !assistant.isActive;
                                  try {
                                    setAssistants((prev) =>
                                      prev.map((d) =>
                                        d.id === assistant.id ? { ...d, isActive: next } : d
                                      )
                                    );
                                    await api.put(`/admin/assistants/${assistant.id}/status`, {
                                      isActive: next,
                                    });
                                  } catch (err) {
                                    console.error("Failed to update assistant status", err);
                                    // Revert on error
                                    setAssistants((prev) =>
                                      prev.map((d) =>
                                        d.id === assistant.id ? { ...d, isActive: assistant.isActive } : d
                                      )
                                    );
                                  }
                                }}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                  assistant.isActive ? "bg-green-500" : "bg-gray-300"
                                }`}
                              >
                                <span
                                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                                    assistant.isActive ? "translate-x-5" : "translate-x-1"
                                  }`}
                                />
                              </button>
                            </TableCell>
                            <TableCell>
                              {assistant.hasLogin ? (
                                <Badge variant="outline" className="text-xs">
                                  Login Exists
                                </Badge>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedAssistant(assistant);
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
                                {formatDate(assistant.createdAt)}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">No assistants found.</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="create">
            <Card>
              <CardHeader>
                <CardTitle>Create Assistant</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <Label>First Name</Label>
                      <Input
                        required
                        value={newAssistant.firstName}
                        onChange={(e) => setNewAssistant({ ...newAssistant, firstName: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Last Name</Label>
                      <Input
                        required
                        value={newAssistant.lastName}
                        onChange={(e) => setNewAssistant({ ...newAssistant, lastName: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Email</Label>
                      <Input
                        type="email"
                        required
                        value={newAssistant.email}
                        onChange={(e) => setNewAssistant({ ...newAssistant, email: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Phone Number</Label>
                      <Input
                        required
                        value={newAssistant.phoneNumber}
                        onChange={(e) => setNewAssistant({ ...newAssistant, phoneNumber: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Linked Doctor ID</Label>
                      <Input
                        value={newAssistant.linkedDoctorId}
                        onChange={(e) => setNewAssistant({ ...newAssistant, linkedDoctorId: e.target.value })}
                        placeholder="e.g., dr_001"
                      />
                    </div>
                    <div>
                      <Label>Role Title</Label>
                      <Input
                        value={newAssistant.roleTitle}
                        onChange={(e) => setNewAssistant({ ...newAssistant, roleTitle: e.target.value })}
                        placeholder="e.g., Physician Assistant"
                      />
                    </div>
                  </div>
                  <Button type="submit" disabled={loading} className="w-full">
                    <Plus className="mr-2 h-4 w-4" />
                    {loading ? "Creating..." : "Create Assistant"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        <Dialog open={loginDialogOpen} onOpenChange={setLoginDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Assistant Login</DialogTitle>
              <DialogDescription>
                Set an initial password for {selectedAssistant?.firstName} {selectedAssistant?.lastName}. Share it
                securely with the assistant; they can change it later.
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

export default AssistantsManagement;
