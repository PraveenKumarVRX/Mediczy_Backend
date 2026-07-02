import { useEffect, useState } from 'react';
import {
  Package, ShoppingCart, Warehouse, ClipboardList, FileText, Stethoscope,
  Truck, ShieldCheck, Thermometer, Pill, BarChart3, PlusCircle, Boxes,
} from 'lucide-react';
import DeptStaffLayout from '@/components/hosp-dept/DeptStaffLayout';
import { scmNav } from './DepartmentDashboards';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import api from '@/utils/api';

type Item = { id: number; item_code: string; name: string; category?: string; reorder_level?: number };
type Vendor = { id: number; vendor_code: string; name: string; risk_score?: number; status: string };
type Order = { id: number; po_number: string; vendor_name?: string; total_amount: number; status: string; lines?: any[] };
type Invoice = { id: number; invoice_number: string; vendor_name?: string; amount: number; status: string; match_status: string };

const Wrap = ({ title, children }: { title: string; children: React.ReactNode }) => (
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
  const [vendorId, setVendorId] = useState('');
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState('10');
  const [unitPrice, setUnitPrice] = useState('25');
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
  const receive = async (order: Order) => {
    await api.post(`/scm/orders/${order.id}/grn`, {
      receivedBy: 'Stores',
      lines: (order.lines || []).map((line: any) => ({ lineId: line.id, itemId: line.itemId, receivedQuantity: line.quantity })),
    });
    refresh();
  };
  return (
    <Wrap title="Purchase Orders">
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Create PO</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-5 gap-2">
            <Input placeholder="Vendor ID" value={vendorId} onChange={(e) => setVendorId(e.target.value)} />
            <Input placeholder="Item ID" value={itemId} onChange={(e) => setItemId(e.target.value)} />
            <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            <Input value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
            <Button onClick={create}><PlusCircle className="h-4 w-4 mr-2" />Create</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShoppingCart className="h-4 w-4" />Orders</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {orders.map((order) => (
              <div key={order.id} className="flex items-center justify-between border rounded-md p-3">
                <div>
                  <div className="font-medium">{order.po_number}</div>
                  <div className="text-xs text-muted-foreground">{order.vendor_name || 'Vendor'} · ₹{order.total_amount}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge>{order.status}</Badge>
                  {['approved', 'partial_receipt'].includes(order.status) && (
                    <Button size="sm" onClick={() => receive(order)}>GRN</Button>
                  )}
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
  const { rows, refresh } = useScmList<{ id: number; indent_number: string; department: string; status: string }>('/scm/indents');
  const [department, setDepartment] = useState('OT');
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState('5');
  const create = async () => {
    if (!itemId) return;
    await api.post('/scm/indents', { department, requestedBy: 'Dept', lines: [{ itemId: Number(itemId), quantity: Number(quantity) }] });
    refresh();
  };
  return (
    <Wrap title="Department Indents">
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Raise Indent</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-4 gap-2">
            <Input value={department} onChange={(e) => setDepartment(e.target.value)} />
            <Input placeholder="Item ID" value={itemId} onChange={(e) => setItemId(e.target.value)} />
            <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            <Button onClick={create}><ClipboardList className="h-4 w-4 mr-2" />Submit</Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 pt-6">
            {rows.map((indent) => (
              <div key={indent.id} className="flex justify-between border rounded-md p-3">
                <div>{indent.indent_number} · {indent.department}</div>
                <Badge>{indent.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">Items: {items.slice(0, 5).map((i) => `${i.id}:${i.name}`).join(' · ')}</p>
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
        </Card>
      </div>
    </Wrap>
  );
};

export const ScmSupplierOps = () => {
  const { rows: vendors, refresh: refreshVendors } = useScmList<Vendor>('/scm/vendors');
  const { rows: asn, refresh: refreshAsn } = useScmList<any>('/scm/asn');
  const { rows: blankets, refresh: refreshBlankets } = useScmList<any>('/scm/blanket-orders');
  const [vendorCode, setVendorCode] = useState('');
  const [name, setName] = useState('');
  const createVendor = async () => {
    if (!vendorCode || !name) return;
    await api.post('/scm/vendors', { vendorCode, name, category: 'Medical supplies', riskScore: 40 });
    setVendorCode(''); setName(''); refreshVendors();
  };
  const createAsn = async () => {
    if (!vendors[0]) return;
    await api.post('/scm/asn', { vendorId: vendors[0].id, lines: [] });
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
          <CardHeader><CardTitle className="text-base">Vendor & ASN</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="Code" value={vendorCode} onChange={(e) => setVendorCode(e.target.value)} />
              <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
              <Button onClick={createVendor}><Truck className="h-4 w-4 mr-2" />Add Vendor</Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={createAsn}>Create ASN</Button>
              <Button variant="outline" onClick={createBlanket}>Blanket Order</Button>
            </div>
          </CardContent>
        </Card>
        <div className="grid md:grid-cols-3 gap-4">
          <Card><CardHeader><CardTitle className="text-sm">Vendors ({vendors.length})</CardTitle></CardHeader><CardContent>{vendors.slice(0, 5).map((v) => <div key={v.id} className="text-sm py-1">{v.name} · risk {v.risk_score}</div>)}</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">ASN ({asn.length})</CardTitle></CardHeader><CardContent>{asn.slice(0, 5).map((a) => <div key={a.id} className="text-sm py-1">{a.asn_number}</div>)}</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">Blanket ({blankets.length})</CardTitle></CardHeader><CardContent>{blankets.slice(0, 5).map((b) => <div key={b.id} className="text-sm py-1">{b.blanket_number}</div>)}</CardContent></Card>
        </div>
      </div>
    </Wrap>
  );
};

export const ScmOpsControl = () => {
  const { rows: counts, refresh: refreshCounts } = useScmList<any>('/scm/cycle-counts');
  const { rows: coldChain, refresh: refreshCold } = useScmList<any>('/scm/cold-chain');
  const { rows: controlled, refresh: refreshControlled } = useScmList<any>('/scm/controlled-substances');
  const [temperature, setTemperature] = useState('4.5');
  const [itemId, setItemId] = useState('1');
  const logCold = async () => {
    await api.post('/scm/cold-chain', { itemId: Number(itemId), temperatureC: Number(temperature), recordedBy: 'SCM' });
    refreshCold();
  };
  const scheduleCount = async () => {
    await api.post('/scm/cycle-counts', { warehouseId: 1, lines: [] });
    refreshCounts();
  };
  const logControlled = async () => {
    await api.post('/scm/controlled-substances', { itemId: Number(itemId), txnType: 'issue', quantity: -1, witnessName: 'Pharmacist' });
    refreshControlled();
  };
  return (
    <Wrap title="Operations Control">
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Cycle Count & Compliance</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={scheduleCount}>Schedule Cycle Count</Button>
            <Input className="w-24" value={itemId} onChange={(e) => setItemId(e.target.value)} />
            <Input className="w-24" value={temperature} onChange={(e) => setTemperature(e.target.value)} />
            <Button variant="outline" onClick={logCold}><Thermometer className="h-4 w-4 mr-2" />Log Cold Chain</Button>
            <Button onClick={logControlled}>Log Controlled Substance</Button>
          </CardContent>
        </Card>
        <div className="grid md:grid-cols-3 gap-4">
          <Card><CardHeader><CardTitle className="text-sm">Cycle Counts ({counts.length})</CardTitle></CardHeader><CardContent>{counts.slice(0, 4).map((c) => <div key={c.id} className="text-sm py-1">{c.count_number} · {c.status}</div>)}</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">Cold Chain ({coldChain.length})</CardTitle></CardHeader><CardContent>{coldChain.slice(0, 4).map((c) => <div key={c.id} className="text-sm py-1">{c.temperature_c}°C {c.alert_triggered && '⚠'}</div>)}</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">Controlled ({controlled.length})</CardTitle></CardHeader><CardContent>{controlled.slice(0, 4).map((c) => <div key={c.id} className="text-sm py-1">{c.txn_type} · {c.quantity}</div>)}</CardContent></Card>
        </div>
      </div>
    </Wrap>
  );
};

export const ScmReports = () => {
  const [summary, setSummary] = useState<Record<string, number>>({});
  useEffect(() => {
    api.get('/scm/overview').then((res) => setSummary(res.data.data || {}));
  }, []);
  return (
    <Wrap title="SCM Reports">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" />Command Center</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-3">
          {Object.entries(summary).map(([k, v]) => (
            <div key={k} className="border rounded-md p-4">
              <div className="text-xs text-muted-foreground">{k}</div>
              <div className="text-2xl font-bold">{String(v)}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </Wrap>
  );
};
