import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import PharmacyLayout from "@/components/pharmacy/PharmacyLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import pharmacyService from "@/services/pharmacy.service";
import { Plus, Search, Users, Receipt, Activity, Download, Phone, Mail, HelpCircle } from "lucide-react";

type StatCard = { title: string; value: string; helper?: string };

type AsyncState<T> = {
  data: T | null;
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
};

const getErrorMessage = (error: any, fallback = "Request failed") =>
  error?.response?.data?.message || error?.message || fallback;

const asArray = <T,>(value: any, keys: string[] = []): T[] => {
  if (Array.isArray(value)) return value;
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  return [];
};

const money = (value: any) => `Rs.${Number(value || 0).toLocaleString("en-IN")}`;

const dateText = (value: any) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-IN");
};

const escapeCsvCell = (value: unknown) => {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
};

const downloadCsv = (filename: string, headers: string[], rows: Array<Array<string | number>>) => {
  const csv = [headers.map(escapeCsvCell).join(","), ...rows.map((r) => r.map(escapeCsvCell).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const StatGrid = ({ items }: { items: StatCard[] }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
    {items.map((item) => (
      <Card key={item.title}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">{item.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold text-slate-900">{item.value}</p>
          {item.helper && <p className="text-xs text-muted-foreground mt-1">{item.helper}</p>}
        </CardContent>
      </Card>
    ))}
  </div>
);

const LoadingState = ({ label = "Loading..." }: { label?: string }) => (
  <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
    <Activity className="h-4 w-4 animate-spin" />
    {label}
  </div>
);

const EmptyState = ({ label }: { label: string }) => (
  <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{label}</div>
);

const ErrorState = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center justify-between gap-3">
    <span>{message}</span>
    <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button>
  </div>
);

const PageHeader = ({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      <p className="text-muted-foreground">{subtitle}</p>
    </div>
    {action}
  </div>
);

const DataCard = ({ title, loading, error, onRetry, emptyLabel, hasRows, children }: { title: string; loading: boolean; error: string; onRetry: () => void; emptyLabel: string; hasRows: boolean; children: ReactNode }) => (
  <Card>
    <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
    <CardContent>{loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={onRetry} /> : hasRows ? children : <EmptyState label={emptyLabel} />}</CardContent>
  </Card>
);

const InputField = ({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) => (
  <div className="space-y-1">
    <Label>{label}</Label>
    <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
  </div>
);

const normalizeMedicine = (medicine: any) => ({
  id: Number(medicine.id || medicine.medicine_id || medicine.medicineId || 0),
  name: medicine.medicineName || medicine.name || medicine.brand_name || "Medicine",
  genericName: medicine.genericName || medicine.generic_name || "-",
  manufacturer: medicine.manufacturer || "-",
  quantity: Number(medicine.quantity || medicine.stock || 0),
  reorderLevel: Number(medicine.reorderLevel || medicine.reorder_level || 0),
  unitPrice: Number(medicine.unitPrice || medicine.unit_price || medicine.price || medicine.mrp || 0),
  mrp: Number(medicine.mrp || medicine.unitPrice || medicine.unit_price || 0),
  expiryDate: medicine.expiryDate || medicine.expiry_date,
  batchNumber: medicine.batchNumber || medicine.batch_number || "-",
  category: medicine.category || "General",
});

const usePharmacyAsync = <T,>(loader: () => Promise<T>, deps: any[] = []): AsyncState<T> => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      setData(await loader());
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, reload: load };
};

export const PharmacyPOSPage = () => {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [medicineResults, setMedicineResults] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [submitting, setSubmitting] = useState(false);
  const transactions = usePharmacyAsync(() => pharmacyService.sales.getAll({ limit: 20 }), []);
  const rows = asArray<any>(transactions.data, ["transactions", "data"]);
  const total = cart.reduce((sum, item) => sum + item.quantity * item.price, 0);

  const searchMedicines = async () => {
    if (searchQuery.trim().length < 2) {
      toast({ title: "Search required", description: "Enter at least 2 characters.", variant: "destructive" });
      return;
    }
    try {
      const response = await pharmacyService.inventory.getMedicines({ search: searchQuery, limit: 10 });
      setMedicineResults(asArray<any>(response?.data?.medicines || response, ["medicines", "data"]).map(normalizeMedicine));
    } catch (error: any) {
      toast({ title: "Search failed", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  const addToCart = (medicine: any) => {
    setCart((current) => {
      const existing = current.find((item) => item.medicineId === medicine.id);
      if (existing) return current.map((item) => item.medicineId === medicine.id ? { ...item, quantity: item.quantity + 1 } : item);
      return [...current, { medicineId: medicine.id, name: medicine.name, quantity: 1, price: medicine.unitPrice || medicine.mrp || 0 }];
    });
  };

  const completeSale = async () => {
    if (!cart.length) {
      toast({ title: "Cart is empty", description: "Add at least one medicine.", variant: "destructive" });
      return;
    }
    try {
      setSubmitting(true);
      await pharmacyService.sales.create({ items: cart.map((item) => ({ ...item, batchId: 0 })), totalAmount: total, paymentMethod });
      toast({ title: "Sale completed", description: `Transaction posted for ${money(total)}.` });
      setCart([]);
      setMedicineResults([]);
      setSearchQuery("");
      await transactions.reload();
    } catch (error: any) {
      toast({ title: "Sale failed", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return <PharmacyLayout><div className="space-y-6"><PageHeader title="Point of Sale" subtitle="Search medicines, build a cart, and post real transactions" /><StatGrid items={[{ title: "Transactions", value: String(rows.length), helper: "Latest loaded" }, { title: "Cart Items", value: String(cart.length), helper: money(total) }, { title: "Sales Loaded", value: money(rows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0)), helper: "Recent rows" }, { title: "Payment", value: paymentMethod, helper: "Current method" }]} /><div className="grid grid-cols-1 xl:grid-cols-3 gap-6"><Card className="xl:col-span-2"><CardHeader><CardTitle>Medicine Search</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex gap-2"><Input placeholder="Search medicine or scan barcode..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchMedicines()} /><Button onClick={searchMedicines}><Search className="w-4 h-4 mr-2" />Search</Button></div>{medicineResults.length === 0 ? <EmptyState label="Search results will appear here." /> : <Table><TableHeader><TableRow><TableHead>Medicine</TableHead><TableHead>Stock</TableHead><TableHead>Price</TableHead><TableHead /></TableRow></TableHeader><TableBody>{medicineResults.map((medicine) => <TableRow key={medicine.id}><TableCell><div className="font-medium">{medicine.name}</div><div className="text-xs text-muted-foreground">{medicine.genericName}</div></TableCell><TableCell>{medicine.quantity}</TableCell><TableCell>{money(medicine.unitPrice)}</TableCell><TableCell className="text-right"><Button size="sm" onClick={() => addToCart(medicine)}>Add</Button></TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card><Card><CardHeader><CardTitle>Cart</CardTitle></CardHeader><CardContent className="space-y-4">{cart.length === 0 ? <EmptyState label="No items added." /> : cart.map((item) => <div key={item.medicineId} className="flex items-center justify-between gap-3 border rounded-lg p-3"><div><p className="font-medium text-sm">{item.name}</p><p className="text-xs text-muted-foreground">{item.quantity} x {money(item.price)}</p></div><Input className="w-20" type="number" min="1" value={item.quantity} onChange={(e) => setCart((current) => current.map((row) => row.medicineId === item.medicineId ? { ...row, quantity: Math.max(1, Number(e.target.value) || 1) } : row))} /></div>)}<Select value={paymentMethod} onValueChange={setPaymentMethod}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Cash">Cash</SelectItem><SelectItem value="Card">Card</SelectItem><SelectItem value="UPI">UPI</SelectItem></SelectContent></Select><div className="flex items-center justify-between font-semibold"><span>Total</span><span>{money(total)}</span></div><Button className="w-full" onClick={completeSale} disabled={submitting}>{submitting ? "Posting..." : "Complete Sale"}</Button></CardContent></Card></div><DataCard title="Recent Transactions" loading={transactions.loading} error={transactions.error} onRetry={transactions.reload} emptyLabel="No transactions found." hasRows={rows.length > 0}><Table><TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Customer</TableHead><TableHead>Amount</TableHead><TableHead>Payment</TableHead><TableHead>Date</TableHead></TableRow></TableHeader><TableBody>{rows.map((txn) => <TableRow key={txn.id}><TableCell>{txn.id}</TableCell><TableCell>{txn.customer_name || "Walk-in"}</TableCell><TableCell>{money(txn.total_amount)}</TableCell><TableCell>{txn.payment_method || "-"}</TableCell><TableCell>{dateText(txn.created_at)}</TableCell></TableRow>)}</TableBody></Table></DataCard></div></PharmacyLayout>;
};

export const PharmacyPrescriptionsPage = () => {
  const { toast } = useToast();
  const prescriptions = usePharmacyAsync(() => pharmacyService.prescriptions.getAll({ limit: 50 }), []);
  const rows = asArray<any>(prescriptions.data, ["data", "prescriptions"]);
  const updateStatus = async (row: any, status: string) => {
    try {
      const needsReview = ["Ready", "Completed"].includes(status);
      await pharmacyService.prescriptions.updateStatus(Number(String(row.id).replace(/\D/g, "")) || row.id, status, { pharmacistReviewConfirmed: needsReview, notes: needsReview ? "Pharmacist review confirmed from dashboard" : undefined });
      toast({ title: "Prescription updated", description: `Status changed to ${status}.` });
      prescriptions.reload();
    } catch (error: any) {
      toast({ title: "Update failed", description: getErrorMessage(error), variant: "destructive" });
    }
  };
  return <PharmacyLayout><div className="space-y-6"><PageHeader title="Prescriptions" subtitle="Review and update prescription workflow status" /><StatGrid items={[{ title: "Total", value: String(rows.length), helper: "Loaded prescriptions" }, { title: "Pending", value: String(rows.filter((r) => String(r.status).toLowerCase().includes("pending")).length), helper: "Need review" }, { title: "Ready", value: String(rows.filter((r) => String(r.status).toLowerCase().includes("ready")).length), helper: "Ready to dispense" }, { title: "Completed", value: String(rows.filter((r) => String(r.status).toLowerCase().includes("completed")).length), helper: "Closed" }]} /><DataCard title="Prescription Queue" loading={prescriptions.loading} error={prescriptions.error} onRetry={prescriptions.reload} emptyLabel="No prescriptions found." hasRows={rows.length > 0}><Table><TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Patient</TableHead><TableHead>Doctor</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead><TableHead /></TableRow></TableHeader><TableBody>{rows.map((rx) => <TableRow key={rx.id}><TableCell>{rx.prescriptionNumber || rx.prescription_number || rx.id}</TableCell><TableCell>{rx.patientName || rx.patient_name || "-"}</TableCell><TableCell>{rx.doctorName || rx.doctor_name || "-"}</TableCell><TableCell><Badge>{rx.status || "Pending"}</Badge></TableCell><TableCell>{dateText(rx.createdAt || rx.created_at || rx.date)}</TableCell><TableCell className="text-right"><Select onValueChange={(value) => updateStatus(rx, value)}><SelectTrigger className="w-36"><SelectValue placeholder="Update" /></SelectTrigger><SelectContent><SelectItem value="Pending">Pending</SelectItem><SelectItem value="Ready">Ready</SelectItem><SelectItem value="Completed">Completed</SelectItem><SelectItem value="Rejected">Rejected</SelectItem></SelectContent></Select></TableCell></TableRow>)}</TableBody></Table></DataCard></div></PharmacyLayout>;
};

export const PharmacyInventoryPage = () => {
  const { toast } = useToast();
  const [showAddItem, setShowAddItem] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", genericName: "", manufacturer: "", category: "", quantity: "", unit: "tablet", price: "", mrp: "", batchNumber: "", expiryDate: "", reorderLevel: "" });
  const inventory = usePharmacyAsync(() => pharmacyService.inventory.getMedicines({ search: search || undefined, limit: 100 }), []);
  const rows = asArray<any>(inventory.data?.data?.medicines || inventory.data, ["medicines", "data"]).map(normalizeMedicine);
  const addMedicine = async () => { try { await pharmacyService.inventory.addMedicine({ ...form, quantity: Number(form.quantity), price: Number(form.price), mrp: Number(form.mrp), reorderLevel: Number(form.reorderLevel) } as any); toast({ title: "Medicine added", description: form.name }); setShowAddItem(false); inventory.reload(); } catch (error: any) { toast({ title: "Add failed", description: getErrorMessage(error), variant: "destructive" }); } };
  const exportCsv = () => downloadCsv("pharmacy-inventory.csv", ["Medicine", "Generic", "Stock", "Price", "Expiry"], rows.map((r) => [r.name, r.genericName, r.quantity, r.unitPrice, r.expiryDate || ""]));
  return <PharmacyLayout><div className="space-y-6"><PageHeader title="Medicine Stock" subtitle="API-backed inventory list and stock entry" action={<div className="flex gap-2"><Button variant="outline" onClick={exportCsv}><Download className="w-4 h-4 mr-2" />Export</Button><Button onClick={() => setShowAddItem(true)}><Plus className="w-4 h-4 mr-2" />Add Medicine</Button></div>} /><StatGrid items={[{ title: "Medicines", value: String(rows.length), helper: "Loaded items" }, { title: "Low Stock", value: String(rows.filter((r) => r.quantity <= r.reorderLevel).length), helper: "At threshold" }, { title: "Expiring Soon", value: String(rows.filter((r) => r.expiryDate && new Date(r.expiryDate) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)).length), helper: "Within 30 days" }, { title: "Value", value: money(rows.reduce((sum, r) => sum + r.quantity * r.unitPrice, 0)), helper: "Loaded stock" }]} /><Card><CardHeader><div className="flex gap-2"><Input placeholder="Search inventory..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && inventory.reload()} /><Button onClick={inventory.reload}><Search className="w-4 h-4 mr-2" />Search</Button></div></CardHeader><CardContent>{inventory.loading ? <LoadingState /> : inventory.error ? <ErrorState message={inventory.error} onRetry={inventory.reload} /> : rows.length === 0 ? <EmptyState label="No inventory items found." /> : <Table><TableHeader><TableRow><TableHead>Medicine</TableHead><TableHead>Category</TableHead><TableHead>Stock</TableHead><TableHead>MRP</TableHead><TableHead>Batch</TableHead><TableHead>Expiry</TableHead></TableRow></TableHeader><TableBody>{rows.map((item) => <TableRow key={item.id}><TableCell><div className="font-medium">{item.name}</div><div className="text-xs text-muted-foreground">{item.genericName}</div></TableCell><TableCell>{item.category}</TableCell><TableCell><Badge variant={item.quantity <= item.reorderLevel ? "destructive" : "default"}>{item.quantity}</Badge></TableCell><TableCell>{money(item.mrp)}</TableCell><TableCell>{item.batchNumber}</TableCell><TableCell>{dateText(item.expiryDate)}</TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card><Dialog open={showAddItem} onOpenChange={setShowAddItem}><DialogContent><DialogHeader><DialogTitle>Add Medicine</DialogTitle><DialogDescription>Create a pharmacy inventory record.</DialogDescription></DialogHeader><div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2"><InputField label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} /><InputField label="Generic" value={form.genericName} onChange={(v) => setForm({ ...form, genericName: v })} /><InputField label="Manufacturer" value={form.manufacturer} onChange={(v) => setForm({ ...form, manufacturer: v })} /><InputField label="Category" value={form.category} onChange={(v) => setForm({ ...form, category: v })} /><InputField label="Quantity" type="number" value={form.quantity} onChange={(v) => setForm({ ...form, quantity: v })} /><InputField label="Unit Price" type="number" value={form.price} onChange={(v) => setForm({ ...form, price: v })} /><InputField label="MRP" type="number" value={form.mrp} onChange={(v) => setForm({ ...form, mrp: v })} /><InputField label="Expiry" type="date" value={form.expiryDate} onChange={(v) => setForm({ ...form, expiryDate: v })} /></div><DialogFooter><Button variant="outline" onClick={() => setShowAddItem(false)}>Cancel</Button><Button onClick={addMedicine}>Save</Button></DialogFooter></DialogContent></Dialog></div></PharmacyLayout>;
};

export const PharmacyStockAlertsPage = () => {
  const { toast } = useToast();
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [form, setForm] = useState({ medicineId: "", quantity: "", supplier: "", priority: "normal", notes: "" });
  const alerts = usePharmacyAsync(() => pharmacyService.stockAlerts.getAll({ limit: 50 }), []);
  const rows = asArray<any>(alerts.data, ["alerts", "data"]);
  const createAlert = async () => { try { await pharmacyService.stockAlerts.create({ medicineId: Number(form.medicineId), quantity: Number(form.quantity), supplier: form.supplier, priority: form.priority, notes: form.notes }); toast({ title: "Stock alert created" }); setShowCreateOrder(false); alerts.reload(); } catch (error: any) { toast({ title: "Create failed", description: getErrorMessage(error), variant: "destructive" }); } };
  return <PharmacyLayout><div className="space-y-6"><PageHeader title="Stock Alerts" subtitle="Create and monitor reorder alerts" action={<Button onClick={() => setShowCreateOrder(true)}><Plus className="w-4 h-4 mr-2" />Create Alert</Button>} /><StatGrid items={[{ title: "Alerts", value: String(rows.length), helper: "Loaded" }, { title: "Pending", value: String(rows.filter((r) => r.status === "pending").length), helper: "Open" }, { title: "High Priority", value: String(rows.filter((r) => r.priority === "high").length), helper: "Critical" }, { title: "Suppliers", value: String(new Set(rows.map((r) => r.supplier).filter(Boolean)).size), helper: "In alerts" }]} /><DataCard title="Alerts" loading={alerts.loading} error={alerts.error} onRetry={alerts.reload} emptyLabel="No alerts found." hasRows={rows.length > 0}><Table><TableHeader><TableRow><TableHead>Medicine</TableHead><TableHead>Quantity</TableHead><TableHead>Supplier</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell>{row.medicine_name || row.medicineId || row.medicine_id}</TableCell><TableCell>{row.quantity}</TableCell><TableCell>{row.supplier || "-"}</TableCell><TableCell><Badge variant={row.priority === "high" ? "destructive" : "secondary"}>{row.priority || "normal"}</Badge></TableCell><TableCell>{row.status || "pending"}</TableCell></TableRow>)}</TableBody></Table></DataCard><Dialog open={showCreateOrder} onOpenChange={setShowCreateOrder}><DialogContent><DialogHeader><DialogTitle>Create Stock Alert</DialogTitle></DialogHeader><div className="space-y-3"><InputField label="Medicine ID" type="number" value={form.medicineId} onChange={(v) => setForm({ ...form, medicineId: v })} /><InputField label="Quantity" type="number" value={form.quantity} onChange={(v) => setForm({ ...form, quantity: v })} /><InputField label="Supplier" value={form.supplier} onChange={(v) => setForm({ ...form, supplier: v })} /><Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="normal">Normal</SelectItem><SelectItem value="high">High</SelectItem></SelectContent></Select><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes" /></div><DialogFooter><Button variant="outline" onClick={() => setShowCreateOrder(false)}>Cancel</Button><Button onClick={createAlert}>Create</Button></DialogFooter></DialogContent></Dialog></div></PharmacyLayout>;
};

export const PharmacyBatchesPage = () => {
  const { toast } = useToast();
  const [showAddBatch, setShowAddBatch] = useState(false);
  const [form, setForm] = useState({ medicineId: "", batchNumber: "", quantity: "", expiryDate: "", manufacturingDate: "", costPrice: "", supplier: "" });
  const batches = usePharmacyAsync(() => pharmacyService.batches.getAll({ limit: 100 }), []);
  const rows = asArray<any>(batches.data, ["batches", "data"]);
  const addBatch = async () => { try { await pharmacyService.batches.create({ medicineId: Number(form.medicineId), batchNumber: form.batchNumber, quantity: Number(form.quantity), expiryDate: form.expiryDate, manufacturingDate: form.manufacturingDate, costPrice: Number(form.costPrice), supplier: form.supplier }); toast({ title: "Batch added" }); setShowAddBatch(false); batches.reload(); } catch (error: any) { toast({ title: "Add failed", description: getErrorMessage(error), variant: "destructive" }); } };
  return <PharmacyLayout><div className="space-y-6"><PageHeader title="Batch Management" subtitle="Track received medicine batches and expiry dates" action={<Button onClick={() => setShowAddBatch(true)}><Plus className="w-4 h-4 mr-2" />Add Batch</Button>} /><StatGrid items={[{ title: "Batches", value: String(rows.length), helper: "Loaded" }, { title: "Expiring", value: String(rows.filter((r) => r.expiry_date && new Date(r.expiry_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)).length), helper: "Within 30 days" }, { title: "Quantity", value: String(rows.reduce((s, r) => s + Number(r.quantity || 0), 0)), helper: "Units" }, { title: "Suppliers", value: String(new Set(rows.map((r) => r.supplier).filter(Boolean)).size), helper: "Unique" }]} /><DataCard title="Batches" loading={batches.loading} error={batches.error} onRetry={batches.reload} emptyLabel="No batches found." hasRows={rows.length > 0}><Table><TableHeader><TableRow><TableHead>Batch</TableHead><TableHead>Medicine</TableHead><TableHead>Quantity</TableHead><TableHead>Expiry</TableHead><TableHead>Supplier</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell>{row.batch_number || row.batchNumber}</TableCell><TableCell>{row.medicine_name || row.medicine_id}</TableCell><TableCell>{row.quantity}</TableCell><TableCell>{dateText(row.expiry_date || row.expiryDate)}</TableCell><TableCell>{row.supplier || "-"}</TableCell></TableRow>)}</TableBody></Table></DataCard><Dialog open={showAddBatch} onOpenChange={setShowAddBatch}><DialogContent><DialogHeader><DialogTitle>Add Batch</DialogTitle></DialogHeader><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><InputField label="Medicine ID" type="number" value={form.medicineId} onChange={(v) => setForm({ ...form, medicineId: v })} /><InputField label="Batch Number" value={form.batchNumber} onChange={(v) => setForm({ ...form, batchNumber: v })} /><InputField label="Quantity" type="number" value={form.quantity} onChange={(v) => setForm({ ...form, quantity: v })} /><InputField label="Expiry" type="date" value={form.expiryDate} onChange={(v) => setForm({ ...form, expiryDate: v })} /><InputField label="Mfg Date" type="date" value={form.manufacturingDate} onChange={(v) => setForm({ ...form, manufacturingDate: v })} /><InputField label="Cost" type="number" value={form.costPrice} onChange={(v) => setForm({ ...form, costPrice: v })} /><InputField label="Supplier" value={form.supplier} onChange={(v) => setForm({ ...form, supplier: v })} /></div><DialogFooter><Button variant="outline" onClick={() => setShowAddBatch(false)}>Cancel</Button><Button onClick={addBatch}>Save</Button></DialogFooter></DialogContent></Dialog></div></PharmacyLayout>;
};

export const PharmacyPurchaseOrdersPage = () => {
  const { toast } = useToast();
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [form, setForm] = useState({ supplier: "", medicineId: "", quantity: "", unitPrice: "", expectedDeliveryDate: "", notes: "" });
  const orders = usePharmacyAsync(() => pharmacyService.purchaseOrders.getAll({ limit: 100 }), []);
  const rows = asArray<any>(orders.data, ["orders", "data"]);
  const createOrder = async () => { try { await pharmacyService.purchaseOrders.create({ supplier: form.supplier, expectedDeliveryDate: form.expectedDeliveryDate, notes: form.notes, items: [{ medicineId: Number(form.medicineId), quantity: Number(form.quantity), unitPrice: Number(form.unitPrice) }] }); toast({ title: "Purchase order created" }); setShowNewOrder(false); orders.reload(); } catch (error: any) { toast({ title: "Create failed", description: getErrorMessage(error), variant: "destructive" }); } };
  const receiveOrder = async (row: any) => { try { await pharmacyService.purchaseOrders.receive(Number(row.id)); toast({ title: "Purchase order received", description: "Stock has been updated." }); orders.reload(); } catch (error: any) { toast({ title: "Receive failed", description: getErrorMessage(error), variant: "destructive" }); } };
  return <PharmacyLayout><div className="space-y-6"><PageHeader title="Purchase Orders" subtitle="Create and track supplier procurement" action={<Button onClick={() => setShowNewOrder(true)}><Plus className="w-4 h-4 mr-2" />New Order</Button>} /><StatGrid items={[{ title: "Orders", value: String(rows.length), helper: "Loaded" }, { title: "Pending", value: String(rows.filter((r) => r.status === "pending").length), helper: "Open" }, { title: "Value", value: money(rows.reduce((s, r) => s + Number(r.total_amount || 0), 0)), helper: "Loaded" }, { title: "Suppliers", value: String(new Set(rows.map((r) => r.supplier).filter(Boolean)).size), helper: "Unique" }]} /><DataCard title="Purchase Orders" loading={orders.loading} error={orders.error} onRetry={orders.reload} emptyLabel="No purchase orders found." hasRows={rows.length > 0}><Table><TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Supplier</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead><TableHead>Expected</TableHead><TableHead /></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell>{row.id}</TableCell><TableCell>{row.supplier || "-"}</TableCell><TableCell>{money(row.total_amount)}</TableCell><TableCell><Badge>{row.status || "pending"}</Badge></TableCell><TableCell>{dateText(row.expected_delivery_date)}</TableCell><TableCell className="text-right">{String(row.status || "pending").toLowerCase() === "received" ? <Badge variant="secondary">Received</Badge> : <Button size="sm" variant="outline" onClick={() => receiveOrder(row)}>Receive</Button>}</TableCell></TableRow>)}</TableBody></Table></DataCard><Dialog open={showNewOrder} onOpenChange={setShowNewOrder}><DialogContent><DialogHeader><DialogTitle>New Purchase Order</DialogTitle></DialogHeader><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><InputField label="Supplier" value={form.supplier} onChange={(v) => setForm({ ...form, supplier: v })} /><InputField label="Medicine ID" type="number" value={form.medicineId} onChange={(v) => setForm({ ...form, medicineId: v })} /><InputField label="Quantity" type="number" value={form.quantity} onChange={(v) => setForm({ ...form, quantity: v })} /><InputField label="Unit Price" type="number" value={form.unitPrice} onChange={(v) => setForm({ ...form, unitPrice: v })} /><InputField label="Expected Delivery" type="date" value={form.expectedDeliveryDate} onChange={(v) => setForm({ ...form, expectedDeliveryDate: v })} /></div><Textarea className="mt-3" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes" /><DialogFooter><Button variant="outline" onClick={() => setShowNewOrder(false)}>Cancel</Button><Button onClick={createOrder}>Create</Button></DialogFooter></DialogContent></Dialog></div></PharmacyLayout>;
};

export const PharmacyCustomersPage = () => {
  const { toast } = useToast();
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "" });
  const customers = usePharmacyAsync(() => pharmacyService.customers.getAll({ limit: 100 }), []);
  const rows = asArray<any>(customers.data, ["customers", "data"]);
  const addCustomer = async () => { try { await pharmacyService.customers.create(form); toast({ title: "Customer added" }); setShowAddCustomer(false); setForm({ name: "", phone: "", email: "", address: "" }); customers.reload(); } catch (error: any) { toast({ title: "Add failed", description: getErrorMessage(error), variant: "destructive" }); } };
  return <PharmacyLayout><div className="space-y-6"><PageHeader title="Customers" subtitle="Manage pharmacy customer records" action={<Button onClick={() => setShowAddCustomer(true)}><Plus className="w-4 h-4 mr-2" />Add Customer</Button>} /><StatGrid items={[{ title: "Customers", value: String(rows.length), helper: "Loaded" }, { title: "With Email", value: String(rows.filter((r) => r.email).length), helper: "Reachable" }, { title: "With Address", value: String(rows.filter((r) => r.address).length), helper: "Delivery-ready" }, { title: "Loyalty Points", value: String(rows.reduce((s, r) => s + Number(r.loyalty_points || 0), 0)), helper: "Total" }]} /><DataCard title="Customers" loading={customers.loading} error={customers.error} onRetry={customers.reload} emptyLabel="No customers found." hasRows={rows.length > 0}><Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Phone</TableHead><TableHead>Email</TableHead><TableHead>Address</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell>{row.name}</TableCell><TableCell>{row.phone}</TableCell><TableCell>{row.email || "-"}</TableCell><TableCell>{row.address || "-"}</TableCell></TableRow>)}</TableBody></Table></DataCard><Dialog open={showAddCustomer} onOpenChange={setShowAddCustomer}><DialogContent><DialogHeader><DialogTitle>Add Customer</DialogTitle></DialogHeader><div className="space-y-3"><InputField label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} /><InputField label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} /><InputField label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} /><InputField label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} /></div><DialogFooter><Button variant="outline" onClick={() => setShowAddCustomer(false)}>Cancel</Button><Button onClick={addCustomer}>Save</Button></DialogFooter></DialogContent></Dialog></div></PharmacyLayout>;
};

export const PharmacyReportsPage = () => {
  const { toast } = useToast();
  const [returnForm, setReturnForm] = useState({ transactionId: "", medicineId: "", quantity: "", price: "", reason: "" });
  const transactions = usePharmacyAsync(() => pharmacyService.sales.getAll({ limit: 200 }), []);
  const returnsData = usePharmacyAsync(() => pharmacyService.returns.getAll({ limit: 50 }), []);
  const auditData = usePharmacyAsync(() => pharmacyService.compliance.getAuditLogs({ limit: 50 }), []);
  const compliance = usePharmacyAsync(() => pharmacyService.compliance.getDispensingReport(), []);
  const rows = asArray<any>(transactions.data, ["transactions", "data"]);
  const returnRows = asArray<any>(returnsData.data, ["returns", "data"]);
  const auditRows = asArray<any>(auditData.data, ["auditLogs", "data"]);
  const report = compliance.data?.report || {};
  const controlled = report.controlledDispensing || {};
  const exportReport = () => downloadCsv("pharmacy-sales-report.csv", ["ID", "Customer", "Amount", "Payment", "Date"], rows.map((r) => [r.id, r.customer_name || "Walk-in", r.total_amount || 0, r.payment_method || "", r.created_at || ""]));
  const createReturn = async () => {
    try {
      await pharmacyService.returns.create({ transactionId: Number(returnForm.transactionId), reason: returnForm.reason, items: [{ medicineId: Number(returnForm.medicineId), quantity: Number(returnForm.quantity), price: Number(returnForm.price) }] });
      toast({ title: "Return recorded", description: "Stock and compliance logs were updated." });
      setReturnForm({ transactionId: "", medicineId: "", quantity: "", price: "", reason: "" });
      returnsData.reload();
      auditData.reload();
      transactions.reload();
    } catch (error: any) {
      toast({ title: "Return failed", description: getErrorMessage(error), variant: "destructive" });
    }
  };
  return <PharmacyLayout><div className="space-y-6"><PageHeader title="Sales, Returns & Compliance" subtitle="Export transactions, record returns, and review dispensing audit activity" action={<Button onClick={exportReport}><Download className="w-4 h-4 mr-2" />Export CSV</Button>} /><StatGrid items={[{ title: "Transactions", value: String(rows.length), helper: "Loaded" }, { title: "Revenue", value: money(rows.reduce((s, r) => s + Number(r.total_amount || 0), 0)), helper: "Loaded" }, { title: "Returns", value: String(returnRows.length), helper: money(returnRows.reduce((s, r) => s + Number(r.total_amount || 0), 0)) }, { title: "Controlled Rx", value: String(controlled.prescriptions || 0), helper: String(controlled.units || 0) + " units" }]} /><Card><CardHeader><CardTitle>Record Return / Refund</CardTitle></CardHeader><CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3"><InputField label="Transaction ID" type="number" value={returnForm.transactionId} onChange={(v) => setReturnForm({ ...returnForm, transactionId: v })} /><InputField label="Medicine ID" type="number" value={returnForm.medicineId} onChange={(v) => setReturnForm({ ...returnForm, medicineId: v })} /><InputField label="Quantity" type="number" value={returnForm.quantity} onChange={(v) => setReturnForm({ ...returnForm, quantity: v })} /><InputField label="Unit Price" type="number" value={returnForm.price} onChange={(v) => setReturnForm({ ...returnForm, price: v })} /><div className="space-y-1"><Label>Reason</Label><Input value={returnForm.reason} onChange={(e) => setReturnForm({ ...returnForm, reason: e.target.value })} /></div><div className="md:col-span-5 flex justify-end"><Button onClick={createReturn}>Record Return</Button></div></CardContent></Card><DataCard title="Transactions" loading={transactions.loading} error={transactions.error} onRetry={transactions.reload} emptyLabel="No transactions found." hasRows={rows.length > 0}><Table><TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Customer</TableHead><TableHead>Amount</TableHead><TableHead>Payment</TableHead><TableHead>Date</TableHead></TableRow></TableHeader><TableBody>{rows.map((r) => <TableRow key={r.id}><TableCell>{r.id}</TableCell><TableCell>{r.customer_name || "Walk-in"}</TableCell><TableCell>{money(r.total_amount)}</TableCell><TableCell>{r.payment_method}</TableCell><TableCell>{dateText(r.created_at)}</TableCell></TableRow>)}</TableBody></Table></DataCard><DataCard title="Return Register" loading={returnsData.loading} error={returnsData.error} onRetry={returnsData.reload} emptyLabel="No returns found." hasRows={returnRows.length > 0}><Table><TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Transaction</TableHead><TableHead>Customer</TableHead><TableHead>Amount</TableHead><TableHead>Reason</TableHead><TableHead>Date</TableHead></TableRow></TableHeader><TableBody>{returnRows.map((r) => <TableRow key={r.id}><TableCell>{r.id}</TableCell><TableCell>{r.transaction_id}</TableCell><TableCell>{r.customer_name || "Walk-in"}</TableCell><TableCell>{money(r.total_amount)}</TableCell><TableCell>{r.reason || "-"}</TableCell><TableCell>{dateText(r.created_at)}</TableCell></TableRow>)}</TableBody></Table></DataCard><DataCard title="Compliance Audit Trail" loading={auditData.loading} error={auditData.error} onRetry={auditData.reload} emptyLabel="No audit logs found." hasRows={auditRows.length > 0}><Table><TableHeader><TableRow><TableHead>Action</TableHead><TableHead>Resource</TableHead><TableHead>Reference</TableHead><TableHead>Date</TableHead></TableRow></TableHeader><TableBody>{auditRows.map((row) => <TableRow key={row.id}><TableCell>{row.action}</TableCell><TableCell>{row.resource_type}</TableCell><TableCell>{row.resource_id || "-"}</TableCell><TableCell>{dateText(row.created_at)}</TableCell></TableRow>)}</TableBody></Table></DataCard></div></PharmacyLayout>;
};

export const PharmacyInvoicesPage = () => {
  const { toast } = useToast();
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [form, setForm] = useState({ customerId: "", medicineId: "", quantity: "", price: "", paymentMethod: "Cash", notes: "" });
  const invoices = usePharmacyAsync(() => pharmacyService.invoices.getAll({ limit: 50 }), []);
  const rows = asArray<any>(invoices.data, ["invoices", "data"]);
  const createInvoice = async () => { const totalAmount = Number(form.quantity) * Number(form.price); try { await pharmacyService.invoices.create({ customerId: form.customerId ? Number(form.customerId) : undefined, totalAmount, paymentMethod: form.paymentMethod, notes: form.notes, items: [{ medicineId: Number(form.medicineId), quantity: Number(form.quantity), price: Number(form.price) }] }); toast({ title: "Invoice created" }); setShowInvoiceDialog(false); invoices.reload(); } catch (error: any) { toast({ title: "Create failed", description: getErrorMessage(error), variant: "destructive" }); } };
  return <PharmacyLayout><div className="space-y-6"><PageHeader title="Invoices" subtitle="Create and view pharmacy invoices" action={<Button onClick={() => setShowInvoiceDialog(true)}><Plus className="w-4 h-4 mr-2" />Create Invoice</Button>} /><StatGrid items={[{ title: "Invoices", value: String(rows.length), helper: "Loaded" }, { title: "Issued", value: String(rows.filter((r) => r.status === "issued").length), helper: "Open" }, { title: "Value", value: money(rows.reduce((s, r) => s + Number(r.total_amount || 0), 0)), helper: "Loaded" }, { title: "Customers", value: String(new Set(rows.map((r) => r.customer_id).filter(Boolean)).size), helper: "Unique" }]} /><DataCard title="Invoices" loading={invoices.loading} error={invoices.error} onRetry={invoices.reload} emptyLabel="No invoices found." hasRows={rows.length > 0}><Table><TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Customer</TableHead><TableHead>Amount</TableHead><TableHead>Payment</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell>{row.id}</TableCell><TableCell>{row.customer_name || row.customer_id || "Walk-in"}</TableCell><TableCell>{money(row.total_amount)}</TableCell><TableCell>{row.payment_method || "-"}</TableCell><TableCell><Badge>{row.status || "issued"}</Badge></TableCell><TableCell>{dateText(row.created_at)}</TableCell></TableRow>)}</TableBody></Table></DataCard><Dialog open={showInvoiceDialog} onOpenChange={setShowInvoiceDialog}><DialogContent><DialogHeader><DialogTitle>Create Invoice</DialogTitle></DialogHeader><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><InputField label="Customer ID (optional)" type="number" value={form.customerId} onChange={(v) => setForm({ ...form, customerId: v })} /><InputField label="Medicine ID" type="number" value={form.medicineId} onChange={(v) => setForm({ ...form, medicineId: v })} /><InputField label="Quantity" type="number" value={form.quantity} onChange={(v) => setForm({ ...form, quantity: v })} /><InputField label="Price" type="number" value={form.price} onChange={(v) => setForm({ ...form, price: v })} /></div><div className="mt-3"><Select value={form.paymentMethod} onValueChange={(v) => setForm({ ...form, paymentMethod: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Cash">Cash</SelectItem><SelectItem value="Card">Card</SelectItem><SelectItem value="UPI">UPI</SelectItem></SelectContent></Select></div><DialogFooter><Button variant="outline" onClick={() => setShowInvoiceDialog(false)}>Cancel</Button><Button onClick={createInvoice}>Create</Button></DialogFooter></DialogContent></Dialog></div></PharmacyLayout>;
};

export const PharmacyExpiryPage = () => {
  const inventory = usePharmacyAsync(() => pharmacyService.inventory.getMedicines({ limit: 200 }), []);
  const rows = asArray<any>(inventory.data?.data?.medicines || inventory.data, ["medicines", "data"]).map(normalizeMedicine).filter((r) => r.expiryDate).sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
  return <PharmacyLayout><div className="space-y-6"><PageHeader title="Expiry Tracking" subtitle="Monitor stock by expiry date" /><StatGrid items={[{ title: "Tracked", value: String(rows.length), helper: "With expiry date" }, { title: "Expired", value: String(rows.filter((r) => new Date(r.expiryDate) < new Date()).length), helper: "Past due" }, { title: "30 Days", value: String(rows.filter((r) => new Date(r.expiryDate) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)).length), helper: "Next month" }, { title: "Quantity", value: String(rows.reduce((s, r) => s + r.quantity, 0)), helper: "Units" }]} /><DataCard title="Expiry Register" loading={inventory.loading} error={inventory.error} onRetry={inventory.reload} emptyLabel="No expiring inventory found." hasRows={rows.length > 0}><Table><TableHeader><TableRow><TableHead>Medicine</TableHead><TableHead>Batch</TableHead><TableHead>Quantity</TableHead><TableHead>Expiry</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{rows.map((r) => <TableRow key={`${r.id}-${r.batchNumber}`}><TableCell>{r.name}</TableCell><TableCell>{r.batchNumber}</TableCell><TableCell>{r.quantity}</TableCell><TableCell>{dateText(r.expiryDate)}</TableCell><TableCell><Badge variant={new Date(r.expiryDate) < new Date() ? "destructive" : "secondary"}>{new Date(r.expiryDate) < new Date() ? "Expired" : "Valid"}</Badge></TableCell></TableRow>)}</TableBody></Table></DataCard></div></PharmacyLayout>;
};

export const PharmacyAnalyticsPage = () => {
  const dashboard = usePharmacyAsync(() => pharmacyService.analytics.getDashboard(), []);
  const sales = usePharmacyAsync(() => pharmacyService.analytics.getSales(30), []);
  const analytics = dashboard.data?.analytics || {};
  const salesRows = asArray<any>(sales.data, ["sales", "data"]);
  return <PharmacyLayout><div className="space-y-6"><PageHeader title="Analytics" subtitle="Operational analytics from pharmacy transactions and stock" /><StatGrid items={[{ title: "Today's Sales", value: money(analytics.sales?.total), helper: "Current day" }, { title: "Stock Items", value: String(analytics.stock?.totalItems || 0), helper: "In stock" }, { title: "Low Stock", value: String(analytics.stock?.lowStockItems || 0), helper: "Need action" }, { title: "Sales Days", value: String(salesRows.length), helper: "Daily buckets" }]} /><DataCard title="Sales Trend" loading={sales.loading} error={sales.error} onRetry={sales.reload} emptyLabel="No sales analytics found." hasRows={salesRows.length > 0}><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Transactions</TableHead><TableHead>Sales</TableHead></TableRow></TableHeader><TableBody>{salesRows.map((row) => <TableRow key={row.date}><TableCell>{dateText(row.date)}</TableCell><TableCell>{row.transaction_count}</TableCell><TableCell>{money(row.daily_sales)}</TableCell></TableRow>)}</TableBody></Table></DataCard></div></PharmacyLayout>;
};

export const PharmacySettingsPage = () => {
  const { toast } = useToast();
  const profile = usePharmacyAsync(() => pharmacyService.getProfile(), []);
  const pharmacy = profile.data?.pharmacy || {};
  const [form, setForm] = useState<any>({});
  useEffect(() => setForm(pharmacy || {}), [profile.data]);
  const save = async () => { try { await pharmacyService.updateProfile(form); toast({ title: "Settings saved" }); profile.reload(); } catch (error: any) { toast({ title: "Save failed", description: getErrorMessage(error), variant: "destructive" }); } };
  return <PharmacyLayout><div className="space-y-6"><PageHeader title="Settings" subtitle="Update pharmacy profile and operating settings" action={<Button onClick={save}>Save Changes</Button>} />{profile.loading ? <LoadingState /> : profile.error ? <ErrorState message={profile.error} onRetry={profile.reload} /> : <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><Card><CardHeader><CardTitle>Profile</CardTitle></CardHeader><CardContent className="space-y-3"><InputField label="Pharmacy Name" value={form.name || ""} onChange={(v) => setForm({ ...form, name: v })} /><InputField label="Email" value={form.email || ""} onChange={(v) => setForm({ ...form, email: v })} /><InputField label="Phone" value={form.phone || form.phoneNumber || ""} onChange={(v) => setForm({ ...form, phoneNumber: v })} /><InputField label="License Number" value={form.license_number || form.licenseNumber || ""} onChange={(v) => setForm({ ...form, licenseNumber: v })} /></CardContent></Card><Card><CardHeader><CardTitle>Operational Rules</CardTitle></CardHeader><CardContent className="space-y-3"><InputField label="Expiry Alert Days" value={String(form.expiryAlertDays || 30)} onChange={(v) => setForm({ ...form, expiryAlertDays: v })} /><InputField label="Low Stock Threshold" value={String(form.lowStockThreshold || 50)} onChange={(v) => setForm({ ...form, lowStockThreshold: v })} /><Textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Internal notes" /></CardContent></Card></div>}</div></PharmacyLayout>;
};

export const PharmacySupportPage = () => <PharmacyLayout><div className="space-y-6"><PageHeader title="Support" subtitle="Get help with pharmacy operations" /><div className="grid grid-cols-1 md:grid-cols-3 gap-4"><Card><CardContent className="p-5"><HelpCircle className="w-6 h-6 text-teal-600 mb-3" /><h3 className="font-semibold">Help Desk</h3><p className="text-sm text-muted-foreground">Create a support ticket from team support if an operational issue blocks sales or dispensing.</p></CardContent></Card><Card><CardContent className="p-5"><Phone className="w-6 h-6 text-teal-600 mb-3" /><h3 className="font-semibold">Phone</h3><p className="text-sm text-muted-foreground">Use the registered support line for urgent POS or prescription failures.</p></CardContent></Card><Card><CardContent className="p-5"><Mail className="w-6 h-6 text-teal-600 mb-3" /><h3 className="font-semibold">Email</h3><p className="text-sm text-muted-foreground">support@mediczy.com</p></CardContent></Card></div></div></PharmacyLayout>;
