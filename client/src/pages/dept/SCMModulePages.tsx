import { useEffect, useState } from 'react';
import {
  Package, ShoppingCart, Warehouse, ClipboardList, FileText, Stethoscope,
  Truck, ShieldCheck, Thermometer, Pill, BarChart3, PlusCircle, Boxes,
  CheckCircle2, Archive, MonitorCheck,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';
import DeptStaffLayout from '@/components/hosp-dept/DeptStaffLayout';
import { scmNav } from './DepartmentDashboards';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SCMAIAssistant } from '@/components/scm/SCMAIAssistant';
import api from '@/utils/api';

type Item = { id: number; item_code: string; name: string; category?: string; reorder_level?: number };
type Vendor = { id: number; vendor_code: string; name: string; risk_score?: number; status: string };
type Order = { id: number; po_number: string; vendor_name?: string; total_amount: number; status: string; lines?: any[] };
type Invoice = { id: number; invoice_number: string; vendor_name?: string; amount: number; status: string; match_status: string };

type Grn = { id: number; grn_number: string; po_number?: string; vendor_name?: string; posted?: boolean };
type Approval = { id: number; action: string; entity_type: string; entity_id: number; status: string; requested_by?: string };
type AuditEntry = { id: number; action: string; actor?: string; created_at?: string; entity_type?: string };

const Wrap = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <>
    <DeptStaffLayout
      deptKey="scm"
      deptName="Supply Chain"
      badgeLabel="SCM"
      loginPath="/scm/login"
      DeptIcon={Package}
      navSections={scmNav}
      title={title}
      subtitle="Hospital supply chain management"
    >
      {children}
    </DeptStaffLayout>
    <SCMAIAssistant />
  </>
);

const useScmList = <T,>(path: string) => {
  const [rows, setRows] = useState<T[]>([]);
  const refresh = async () => {
    const { data } = await api.get(path);
    setRows(data.data || []);
  };
  useEffect(() => { refresh(); }, [path]);
  return { rows, refresh };
};

// ─── Foundation pages ────────────────────────────────────────────────────────

export const ScmItems = () => {
  const { rows, refresh } = useScmList<Item>('/scm/items');
  const [itemCode, setItemCode] = useState('');
  const [name, setName] = useState('');
  const create = async () => {
    if (!itemCode || !name) return;
    await api.post('/scm/items', { itemCode, name, category: 'Consumable' });
    setItemCode(''); setName(''); refresh();
  };
  return (
    <Wrap title="Item Master">
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Add Item</CardTitle></CardHeader>
          <CardContent className="flex gap-2">
            <Input placeholder="Item code" value={itemCode} onChange={(e) => setItemCode(e.target.value)} />
            <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <Button onClick={create}><PlusCircle className="h-4 w-4 mr-2" />Add</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Boxes className="h-4 w-4" />Catalog</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-3">
            {rows.map((item) => (
              <div key={item.id} className="border rounded-md p-3">
                <div className="font-medium">{item.name}</div>
                <div className="text-xs text-muted-foreground">{item.item_code} · {item.category || 'General'}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </Wrap>
  );
};

export const ScmOrders = () => {
  const { rows: vendors } = useScmList<Vendor>('/scm/vendors');
  const { rows: items } = useScmList<Item>('/scm/items');
  const { rows: orders, refresh } = useScmList<Order>('/scm/orders');
  const [grns, setGrns] = useState<Grn[]>([]);
  const [vendorId, setVendorId] = useState('');
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState('10');
  const [unitPrice, setUnitPrice] = useState('25');

  const loadGrns = async () => {
    const { data } = await api.get('/scm/grns');
    setGrns(data.data || []);
  };
  useEffect(() => { loadGrns(); }, []);

  const create = async () => {
    if (!vendorId || !itemId) return;
    const item = items.find((i) => i.id === Number(itemId));
    await api.post('/scm/orders', {
      vendorId: Number(vendorId),
      department: 'Central Stores',
      requestedBy: 'SCM',
      lines: [{ itemId: Number(itemId), description: item?.name || 'Item', quantity: Number(quantity), unitPrice: Number(unitPrice) }],
    });
    refresh();
  };
  const approve = async (id: number) => {
    await api.patch(`/scm/orders/${id}/approve`);
    refresh();
  };
  const receive = async (order: Order) => {
    await api.post(`/scm/orders/${order.id}/grn`, {
      receivedBy: 'Stores',
      lines: (order.lines || []).map((line: any) => ({ lineId: line.id, itemId: line.itemId, receivedQuantity: line.quantity })),
    });
    await Promise.all([refresh(), loadGrns()]);
  };
  const postGrn = async (id: number) => {
    await api.patch(`/scm/grns/${id}/post`);
    await Promise.all([refresh(), loadGrns()]);
  };
  return (
    <Wrap title="Purchase Orders">
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Create PO</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-5 gap-2">
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger><SelectValue placeholder="Vendor" /></SelectTrigger>
              <SelectContent>
                {vendors.map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={itemId} onValueChange={setItemId}>
              <SelectTrigger><SelectValue placeholder="Item" /></SelectTrigger>
              <SelectContent>
                {items.map((i) => <SelectItem key={i.id} value={String(i.id)}>{i.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Qty" />
            <Input value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="Unit price" />
            <Button onClick={create}><PlusCircle className="h-4 w-4 mr-2" />Create</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShoppingCart className="h-4 w-4" />Orders</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {orders.map((order) => (
              <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 border rounded-md p-3">
                <div>
                  <div className="font-medium">{order.po_number}</div>
                  <div className="text-xs text-muted-foreground">{order.vendor_name || 'Vendor'} · ₹{order.total_amount}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge>{order.status}</Badge>
                  {['draft', 'submitted'].includes(order.status) && (
                    <Button size="sm" variant="outline" onClick={() => approve(order.id)}>Approve</Button>
                  )}
                  {['approved', 'partial_receipt'].includes(order.status) && (
                    <Button size="sm" onClick={() => receive(order)}>Create GRN</Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Goods Receipt (GRN) — Post to Inventory</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {grns.filter((g) => !g.posted).map((g) => (
              <div key={g.id} className="flex items-center justify-between border rounded-md p-3">
                <div className="text-sm">{g.grn_number} · {g.po_number} · {g.vendor_name}</div>
                <Button size="sm" onClick={() => postGrn(g.id)}>Post to Stock</Button>
              </div>
            ))}
            {!grns.filter((g) => !g.posted).length && (
              <p className="text-sm text-muted-foreground">No GRNs pending inventory post.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </Wrap>
  );
};

export const ScmWarehouses = () => {
  const { rows, refresh } = useScmList<{ id: number; code: string; name: string; store_type: string }>('/scm/warehouses');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const create = async () => {
    if (!code || !name) return;
    await api.post('/scm/warehouses', { code, name, storeType: 'central' });
    setCode(''); setName(''); refresh();
  };
  return (
    <Wrap title="Warehouses">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Warehouse className="h-4 w-4" />Stores</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} />
            <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <Button onClick={create}>Add</Button>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {rows.map((w) => (
              <div key={w.id} className="border rounded-md p-3">
                <div className="font-medium">{w.name}</div>
                <div className="text-xs text-muted-foreground">{w.code} · {w.store_type}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </Wrap>
  );
};

export const ScmIndents = () => {
  const { rows: items } = useScmList<Item>('/scm/items');
  const { rows: vendors } = useScmList<Vendor>('/scm/vendors');
  const { rows, refresh } = useScmList<{ id: number; indent_number: string; department: string; status: string; po_id?: number }>('/scm/indents');
  const [department, setDepartment] = useState('OT');
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState('5');
  const [convertVendor, setConvertVendor] = useState<Record<number, string>>({});
  const create = async () => {
    if (!itemId) return;
    await api.post('/scm/indents', { department, requestedBy: 'Dept', lines: [{ itemId: Number(itemId), quantity: Number(quantity) }] });
    refresh();
  };
  const approve = async (id: number) => { await api.patch(`/scm/indents/${id}/approve`); refresh(); };
  const convertToPo = async (id: number) => {
    const vendorId = convertVendor[id];
    if (!vendorId) return;
    await api.post(`/scm/indents/${id}/convert-to-po`, { vendorId: Number(vendorId) });
    refresh();
  };
  return (
    <Wrap title="Department Indents">
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Raise Indent</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-4 gap-2">
            <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Department" />
            <Select value={itemId} onValueChange={setItemId}>
              <SelectTrigger><SelectValue placeholder="Item" /></SelectTrigger>
              <SelectContent>{items.map((i) => <SelectItem key={i.id} value={String(i.id)}>{i.name}</SelectItem>)}</SelectContent>
            </Select>
            <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            <Button onClick={create}><ClipboardList className="h-4 w-4 mr-2" />Submit</Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 pt-6">
            {rows.map((indent) => (
              <div key={indent.id} className="flex flex-wrap items-center justify-between gap-2 border rounded-md p-3">
                <div>{indent.indent_number} · {indent.department} {indent.po_id ? `· PO #${indent.po_id}` : ''}</div>
                <div className="flex items-center gap-2">
                  <Badge>{indent.status}</Badge>
                  {indent.status === 'submitted' && <Button size="sm" variant="outline" onClick={() => approve(indent.id)}>Approve</Button>}
                  {indent.status === 'approved' && !indent.po_id && (
                    <>
                      <Select value={convertVendor[indent.id] || ''} onValueChange={(v) => setConvertVendor((s) => ({ ...s, [indent.id]: v }))}>
                        <SelectTrigger className="w-36 h-8"><SelectValue placeholder="Vendor" /></SelectTrigger>
                        <SelectContent>{vendors.map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}</SelectContent>
                      </Select>
                      <Button size="sm" onClick={() => convertToPo(indent.id)}>Create PO</Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </Wrap>
  );
};

export const ScmInventory = () => {
  const { rows, refresh } = useScmList<{ item_id: number; item_code: string; name: string; warehouse_code?: string; quantity_on_hand: number }>('/scm/inventory/balances');
  return (
    <Wrap title="Inventory Balances">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Archive className="h-4 w-4" />Stock on Hand</CardTitle>
          <Button size="sm" variant="outline" onClick={refresh}>Refresh</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {rows.map((row, idx) => (
            <div key={`${row.item_id}-${row.warehouse_code || idx}`} className="flex justify-between border rounded-md p-3 text-sm">
              <div>
                <div className="font-medium">{row.name}</div>
                <div className="text-xs text-muted-foreground">{row.item_code} · {row.warehouse_code || 'All stores'}</div>
              </div>
              <Badge variant={Number(row.quantity_on_hand) <= 0 ? 'destructive' : 'secondary'}>
                {Number(row.quantity_on_hand)} on hand
              </Badge>
            </div>
          ))}
          {!rows.length && <p className="text-sm text-muted-foreground">No inventory movements yet. Approve PO → GRN → Post to stock.</p>}
        </CardContent>
      </Card>
    </Wrap>
  );
};

export const ScmApprovals = () => {
  const { rows: orders, refresh } = useScmList<Order>('/scm/orders');
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const loadGovernance = async () => {
    const [a, b] = await Promise.all([api.get('/scm/approvals'), api.get('/scm/audit')]);
    setApprovals(a.data.data || []);
    setAudit(b.data.data || []);
  };
  useEffect(() => { loadGovernance(); }, []);
  const approveOrder = async (id: number) => {
    await api.patch(`/scm/orders/${id}/approve`);
    await Promise.all([refresh(), loadGovernance()]);
  };
  const pendingOrders = orders.filter((o) => o.status === 'draft' || o.status === 'submitted');
  return (
    <Wrap title="Approvals & Audit">
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><MonitorCheck className="h-4 w-4" />Pending PO Approvals</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {pendingOrders.map((o) => (
              <div key={o.id} className="flex justify-between border rounded-md p-3">
                <span>{o.po_number} · ₹{o.total_amount}</span>
                <Button size="sm" onClick={() => approveOrder(o.id)}>Approve</Button>
              </div>
            ))}
            {!pendingOrders.length && <p className="text-sm text-muted-foreground">No POs awaiting approval.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Governance Queue ({approvals.filter((a) => a.status === 'pending').length})</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {approvals.slice(0, 10).map((a) => (
              <div key={a.id} className="flex justify-between py-1 border-b">
                <span>{a.action} · {a.entity_type} #{a.entity_id}</span>
                <Badge>{a.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Audit Trail</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm max-h-64 overflow-y-auto">
            {audit.slice(0, 20).map((e) => (
              <div key={e.id} className="flex justify-between py-1 border-b text-xs">
                <span>{e.action} · {e.entity_type}</span>
                <span className="text-muted-foreground">{e.actor} · {e.created_at ? new Date(e.created_at).toLocaleString() : ''}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </Wrap>
  );
};

// ─── Phase 2-5 pages ─────────────────────────────────────────────────────────

export const ScmApInvoices = () => {
  const { rows: vendors } = useScmList<Vendor>('/scm/vendors');
  const { rows, refresh } = useScmList<Invoice>('/scm/ap/invoices');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [amount, setAmount] = useState('1000');
  const create = async () => {
    if (!invoiceNumber || !vendorId) return;
    await api.post('/scm/ap/invoices', { invoiceNumber, vendorId: Number(vendorId), amount: Number(amount) });
    setInvoiceNumber(''); refresh();
  };
  const match = async (id: number) => { await api.post(`/scm/ap/invoices/${id}/match`); refresh(); };
  const approve = async (id: number) => { await api.patch(`/scm/ap/invoices/${id}/approve`); refresh(); };
  const pay = async (id: number) => { await api.post(`/scm/ap/invoices/${id}/pay`, { paymentMethod: 'neft' }); refresh(); };
  return (
    <Wrap title="AP Invoices">
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Record Invoice</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-4 gap-2">
            <Input placeholder="Invoice #" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            <Input placeholder="Vendor ID" value={vendorId} onChange={(e) => setVendorId(e.target.value)} />
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Button onClick={create}>Save</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" />Invoices</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {rows.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 border rounded-md p-3">
                <div>
                  <div className="font-medium">{inv.invoice_number}</div>
                  <div className="text-xs text-muted-foreground">{inv.vendor_name || 'Vendor'} · ₹{inv.amount} · {inv.match_status}</div>
                </div>
                <div className="flex gap-2">
                  <Badge>{inv.status}</Badge>
                  <Button size="sm" variant="outline" onClick={() => match(inv.id)}>Match</Button>
                  <Button size="sm" variant="outline" onClick={() => approve(inv.id)}>Approve</Button>
                  <Button size="sm" onClick={() => pay(inv.id)}>Pay</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">Vendors: {vendors.map((v) => `${v.id}:${v.name}`).join(' · ')}</p>
      </div>
    </Wrap>
  );
};

export const ScmClinicalSupply = () => {
  const { rows: cards, refresh: refreshCards } = useScmList<any>('/scm/preference-cards');
  const { rows: carts, refresh: refreshCarts } = useScmList<any>('/scm/case-carts');
  const { rows: formulary } = useScmList<any>('/scm/formulary');
  const [procedureCode, setProcedureCode] = useState('PROC-001');
  const [procedureName, setProcedureName] = useState('Lap Cholecystectomy');
  const createCard = async () => {
    await api.post('/scm/preference-cards', { procedureCode, procedureName, surgeonName: 'Dr. SCM' });
    refreshCards();
  };
  const createCart = async () => {
    await api.post('/scm/case-carts', { procedureCode, otRoom: 'OT-1', scheduledAt: new Date().toISOString() });
    refreshCarts();
  };
  return (
    <Wrap title="Clinical Supply">
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Stethoscope className="h-4 w-4" />Preference Cards & Case Carts</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid md:grid-cols-3 gap-2">
              <Input value={procedureCode} onChange={(e) => setProcedureCode(e.target.value)} />
              <Input value={procedureName} onChange={(e) => setProcedureName(e.target.value)} />
              <Button onClick={createCard}>Add Preference Card</Button>
            </div>
            <Button variant="outline" onClick={createCart}>Prepare Case Cart</Button>
          </CardContent>
        </Card>
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Preference Cards ({cards.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {cards.map((c) => <div key={c.id} className="border rounded-md p-2 text-sm">{c.procedure_name}</div>)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Case Carts ({carts.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {carts.map((c) => <div key={c.id} className="border rounded-md p-2 text-sm">{c.cart_number} · <Badge>{c.status}</Badge></div>)}
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Pill className="h-4 w-4" />Formulary ({formulary.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {formulary.map((f: any) => (
              <div key={f.id} className="flex justify-between border rounded-md p-2 text-sm">
                <span>{f.item_name || f.item_id}</span>
                <Badge>{f.tier || 'standard'}</Badge>
              </div>
            ))}
            {!formulary.length && <p className="text-sm text-muted-foreground">No formulary entries yet.</p>}
          </CardContent>
        </Card>
      </div>
    </Wrap>
  );
};

export const ScmSupplierOps = () => {
  const { rows: vendors, refresh: refreshVendors } = useScmList<Vendor>('/scm/vendors');
  const { rows: items } = useScmList<Item>('/scm/items');
  const { rows: asn, refresh: refreshAsn } = useScmList<any>('/scm/asn');
  const { rows: blankets, refresh: refreshBlankets } = useScmList<any>('/scm/blanket-orders');
  const [vendorCode, setVendorCode] = useState('');
  const [name, setName] = useState('');
  const [selectedVendor, setSelectedVendor] = useState('');
  const [catalogue, setCatalogue] = useState<any[]>([]);
  const [riskScore, setRiskScore] = useState('50');
  const [catItemId, setCatItemId] = useState('');
  const [catPrice, setCatPrice] = useState('100');
  const loadCatalogue = async (vendorId: string) => {
    setSelectedVendor(vendorId);
    if (!vendorId) return;
    const { data } = await api.get(`/scm/vendors/${vendorId}/catalogue`);
    setCatalogue(data.data || []);
  };
  const createVendor = async () => {
    if (!vendorCode || !name) return;
    await api.post('/scm/vendors', { vendorCode, name, category: 'Medical supplies', riskScore: Number(riskScore) });
    setVendorCode(''); setName(''); refreshVendors();
  };
  const updateRisk = async (id: number) => {
    await api.patch(`/scm/vendors/${id}/risk`, { riskScore: Number(riskScore) });
    refreshVendors();
  };
  const addCatalogue = async () => {
    if (!selectedVendor || !catItemId) return;
    await api.post(`/scm/vendors/${selectedVendor}/catalogue`, { itemId: Number(catItemId), contractPrice: Number(catPrice) });
    loadCatalogue(selectedVendor);
  };
  const ingestEdi = async () => {
    if (!vendors[0]) return;
    await api.post('/scm/asn/ingest', {
      documentType: '856', externalId: `EDI-${Date.now()}`, vendorId: vendors[0].id,
      lines: items.slice(0, 2).map((i) => ({ itemId: i.id, quantity: 10 })),
    });
    refreshAsn();
  };
  const createBlanket = async () => {
    if (!vendors[0]) return;
    await api.post('/scm/blanket-orders', { vendorId: vendors[0].id, maxAmount: 500000 });
    refreshBlankets();
  };
  return (
    <Wrap title="Supplier Operations">
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Vendor & Catalogue</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Input placeholder="Code" value={vendorCode} onChange={(e) => setVendorCode(e.target.value)} />
              <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
              <Input className="w-20" value={riskScore} onChange={(e) => setRiskScore(e.target.value)} placeholder="Risk" />
              <Button onClick={createVendor}><Truck className="h-4 w-4 mr-2" />Add Vendor</Button>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <Select value={selectedVendor} onValueChange={loadCatalogue}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Select vendor" /></SelectTrigger>
                <SelectContent>{vendors.map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={catItemId} onValueChange={setCatItemId}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Catalogue item" /></SelectTrigger>
                <SelectContent>{items.map((i) => <SelectItem key={i.id} value={String(i.id)}>{i.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input className="w-24" value={catPrice} onChange={(e) => setCatPrice(e.target.value)} />
              <Button variant="outline" onClick={addCatalogue}>Add to Catalogue</Button>
              {selectedVendor && <Button variant="outline" size="sm" onClick={() => updateRisk(Number(selectedVendor))}>Update Risk</Button>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={ingestEdi}>Ingest EDI ASN (856)</Button>
              <Button variant="outline" onClick={createBlanket}>Blanket Order</Button>
            </div>
          </CardContent>
        </Card>
        <div className="grid md:grid-cols-3 gap-4">
          <Card><CardHeader><CardTitle className="text-sm">Vendors ({vendors.length})</CardTitle></CardHeader><CardContent>{vendors.map((v) => <div key={v.id} className="text-sm py-1 flex justify-between"><span>{v.name}</span><Badge variant={Number(v.risk_score) > 70 ? 'destructive' : 'secondary'}>risk {v.risk_score}</Badge></div>)}</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">Catalogue ({catalogue.length})</CardTitle></CardHeader><CardContent>{catalogue.map((c) => <div key={c.id} className="text-sm py-1">{c.item_name} · ₹{c.contract_price}</div>)}</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">ASN ({asn.length})</CardTitle></CardHeader><CardContent>{asn.slice(0, 5).map((a) => <div key={a.id} className="text-sm py-1">{a.asn_number} · {a.status}</div>)}</CardContent></Card>
        </div>
      </div>
    </Wrap>
  );
};

export const ScmOpsControl = () => {
  const { rows: counts, refresh: refreshCounts } = useScmList<any>('/scm/cycle-counts');
  const { rows: coldChain, refresh: refreshCold } = useScmList<any>('/scm/cold-chain');
  const { rows: controlled, refresh: refreshControlled } = useScmList<any>('/scm/controlled-substances');
  const { rows: warehouses } = useScmList<{ id: number; name: string }>('/scm/warehouses');
  const { rows: locations, refresh: refreshLoc } = useScmList<any>('/scm/locations');
  const [temperature, setTemperature] = useState('4.5');
  const [itemId, setItemId] = useState('1');
  const [warehouseId, setWarehouseId] = useState('1');
  const [parLevel, setParLevel] = useState('20');
  const [countedQty, setCountedQty] = useState('10');
  const logCold = async () => {
    await api.post('/scm/cold-chain', { itemId: Number(itemId), temperatureC: Number(temperature), recordedBy: 'SCM' });
    refreshCold();
  };
  const scheduleCount = async () => {
    await api.post('/scm/cycle-counts', { warehouseId: Number(warehouseId), lines: [] });
    refreshCounts();
  };
  const completeCount = async (countId: number) => {
    await api.patch(`/scm/cycle-counts/${countId}/complete`, {
      countedBy: 'SCM',
      lines: [{ lineId: 1, itemId: Number(itemId), systemQty: 0, countedQty: Number(countedQty) }],
    });
    refreshCounts();
  };
  const addLocation = async () => {
    await api.post('/scm/locations', { warehouseId: Number(warehouseId), code: `BIN-${Date.now()}`, parLevel: Number(parLevel) });
    refreshLoc();
  };
  const logControlled = async () => {
    await api.post('/scm/controlled-substances', { itemId: Number(itemId), txnType: 'issue', quantity: -1, witnessName: 'Pharmacist' });
    refreshControlled();
  };
  const runParReorder = async () => {
    await api.post('/scm/par-reorder/run', { autoCreatePo: false });
  };
  return (
    <Wrap title="Operations Control">
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Cycle Count & PAR</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Warehouse" /></SelectTrigger>
              <SelectContent>{warehouses.map((w) => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" onClick={scheduleCount}>Schedule Cycle Count</Button>
            <Input className="w-20" value={parLevel} onChange={(e) => setParLevel(e.target.value)} placeholder="PAR" />
            <Button variant="outline" onClick={addLocation}>Add PAR Bin</Button>
            <Button variant="outline" onClick={runParReorder}>Run PAR Scan</Button>
            <Input className="w-24" value={itemId} onChange={(e) => setItemId(e.target.value)} />
            <Input className="w-24" value={countedQty} onChange={(e) => setCountedQty(e.target.value)} />
            <Input className="w-24" value={temperature} onChange={(e) => setTemperature(e.target.value)} />
            <Button variant="outline" onClick={logCold}><Thermometer className="h-4 w-4 mr-2" />Cold Chain</Button>
            <Button onClick={logControlled}>Controlled Substance</Button>
          </CardContent>
        </Card>
        <div className="grid md:grid-cols-4 gap-4">
          <Card><CardHeader><CardTitle className="text-sm">Cycle Counts</CardTitle></CardHeader><CardContent>{counts.slice(0, 4).map((c) => (
            <div key={c.id} className="text-sm py-1 flex justify-between">{c.count_number} · {c.status}
              {c.status === 'scheduled' && <Button size="sm" variant="ghost" onClick={() => completeCount(c.id)}>Complete</Button>}
            </div>
          ))}</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">PAR Locations ({locations.length})</CardTitle></CardHeader><CardContent>{locations.slice(0, 4).map((l) => <div key={l.id} className="text-sm py-1">{l.code} · PAR {l.par_level}</div>)}</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">Cold Chain</CardTitle></CardHeader><CardContent>{coldChain.slice(0, 4).map((c) => <div key={c.id} className="text-sm py-1">{c.temperature_c}°C {c.alert_triggered && '⚠'}</div>)}</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">Controlled</CardTitle></CardHeader><CardContent>{controlled.slice(0, 4).map((c) => <div key={c.id} className="text-sm py-1">{c.txn_type} · {c.quantity}</div>)}</CardContent></Card>
        </div>
      </div>
    </Wrap>
  );
};

export const ScmCharges = () => {
  const { rows: items } = useScmList<Item>('/scm/items');
  const [charges, setCharges] = useState<any[]>([]);
  const [patientId, setPatientId] = useState('');
  const [itemId, setItemId] = useState('');
  const [unitPrice, setUnitPrice] = useState('500');
  const refresh = async () => {
    const { data } = await api.get('/scm/charge-captures');
    setCharges(data.data || []);
  };
  useEffect(() => { refresh(); }, []);
  const capture = async () => {
    if (!patientId || !itemId) return;
    await api.post('/scm/charge-captures', { patientId: Number(patientId), itemId: Number(itemId), quantity: 1, unitPrice: Number(unitPrice) });
    refresh();
  };
  const bill = async (id: number) => {
    await api.post(`/scm/charge-captures/${id}/bill`);
    refresh();
  };
  return (
    <Wrap title="Charge Capture">
      <Card>
        <CardHeader><CardTitle className="text-base">Supply Charges → Billing</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Patient ID" value={patientId} onChange={(e) => setPatientId(e.target.value)} />
            <Select value={itemId} onValueChange={setItemId}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Item" /></SelectTrigger>
              <SelectContent>{items.map((i) => <SelectItem key={i.id} value={String(i.id)}>{i.name}</SelectItem>)}</SelectContent>
            </Select>
            <Input className="w-24" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
            <Button onClick={capture}>Capture Charge</Button>
          </div>
          <div className="space-y-2">
            {charges.map((c) => (
              <div key={c.id} className="flex justify-between border rounded p-3 text-sm">
                <span>{c.item_name} · Patient {c.patient_id} · ₹{c.unit_price}</span>
                <div className="flex gap-2">
                  <Badge>{c.billed ? 'billed' : 'pending'}</Badge>
                  {!c.billed && <Button size="sm" onClick={() => bill(c.id)}>Post to Billing</Button>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </Wrap>
  );
};

export const ScmImplants = () => {
  const { rows: items } = useScmList<Item>('/scm/items');
  const [traces, setTraces] = useState<any[]>([]);
  const [patientId, setPatientId] = useState('');
  const [udiDi, setUdiDi] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [itemId, setItemId] = useState('');
  const refresh = async () => {
    const { data } = await api.get('/scm/implant-traces');
    setTraces(data.data || []);
  };
  useEffect(() => { refresh(); }, []);
  const register = async () => {
    if (!patientId) return;
    await api.post('/scm/implant-traces', {
      patientId: Number(patientId), itemId: itemId ? Number(itemId) : null,
      udiDi, serialNumber, implantedBy: 'SCM',
    });
    refresh();
  };
  return (
    <Wrap title="Implant UDI Traceability">
      <Card>
        <CardHeader><CardTitle className="text-base">Register Implant to Patient</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-5 gap-2">
            <Input placeholder="Patient ID" value={patientId} onChange={(e) => setPatientId(e.target.value)} />
            <Select value={itemId} onValueChange={setItemId}>
              <SelectTrigger><SelectValue placeholder="Item" /></SelectTrigger>
              <SelectContent>{items.filter((i) => i.category?.toLowerCase().includes('implant') || true).map((i) => <SelectItem key={i.id} value={String(i.id)}>{i.name}</SelectItem>)}</SelectContent>
            </Select>
            <Input placeholder="UDI-DI" value={udiDi} onChange={(e) => setUdiDi(e.target.value)} />
            <Input placeholder="Serial #" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
            <Button onClick={register}>Trace Implant</Button>
          </div>
          <div className="space-y-2">
            {traces.map((t) => (
              <div key={t.id} className="border rounded p-3 text-sm flex justify-between">
                <span>{t.item_name || 'Implant'} · Patient {t.patient_id} · {t.udi_di || t.serial_number}</span>
                <Badge>{t.status}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </Wrap>
  );
};

export const ScmReports = () => {
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [spend, setSpend] = useState<{ monthly: any[]; byVendor: any[]; byCategory: any[] }>({ monthly: [], byVendor: [], byCategory: [] });
  const [reorder, setReorder] = useState<any[]>([]);
  useEffect(() => {
    api.get('/scm/overview').then((res) => setSummary(res.data.data || {}));
    api.get('/scm/analytics/spend').then((res) => setSpend(res.data.data || { monthly: [], byVendor: [], byCategory: [] })).catch(() => {});
    api.get('/scm/ai/reorder-advisor').then((res) => setReorder(res.data.data || [])).catch(() => {});
  }, []);
  return (
    <Wrap title="SCM Reports">
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" />Command Center</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-3 gap-3">
            {Object.entries(summary).map(([k, v]) => (
              <div key={k} className="border rounded-md p-4">
                <div className="text-xs text-muted-foreground">{k.replace(/_/g, ' ')}</div>
                <div className="text-2xl font-bold">{String(v)}</div>
              </div>
            ))}
          </CardContent>
        </Card>
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Monthly Spend (12mo)</CardTitle></CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={spend.monthly}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="spend" stroke="#0d9488" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Spend by Vendor (6mo)</CardTitle></CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={spend.byVendor}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="vendor_name" tick={{ fontSize: 9 }} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="spend" fill="#6366f1" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
        {reorder.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">AI Reorder Recommendations</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {reorder.map((r) => (
                <div key={r.itemId} className="flex justify-between text-sm border rounded p-2">
                  <span>{r.name} ({r.onHand} on hand)</span>
                  <Badge variant={r.priority === 'critical' ? 'destructive' : 'outline'}>Order {r.suggestedQty}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </Wrap>
  );
};
