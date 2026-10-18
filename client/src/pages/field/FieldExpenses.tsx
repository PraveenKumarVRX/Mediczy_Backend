import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Receipt, Trash2, Send, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  getExpenseClaims, createExpenseClaim, getExpenseClaim,
  addExpenseItem, deleteExpenseItem, submitExpenseClaim,
} from './fieldClient';

const CATEGORIES = [
  { value: 'travel_km', label: 'Travel (per km)' },
  { value: 'fuel', label: 'Fuel' },
  { value: 'train', label: 'Train' },
  { value: 'bus', label: 'Bus' },
  { value: 'flight', label: 'Flight' },
  { value: 'cab', label: 'Cab / Auto' },
  { value: 'accommodation', label: 'Accommodation' },
  { value: 'meals', label: 'Meals' },
  { value: 'client_entertainment', label: 'Client Entertainment' },
  { value: 'stationery', label: 'Stationery' },
  { value: 'courier', label: 'Courier' },
  { value: 'other', label: 'Other' },
];

function statusColor(s: string) {
  return { draft: 'bg-slate-100 text-slate-500', submitted: 'bg-blue-50 text-blue-700',
    under_review: 'bg-amber-50 text-amber-700', approved: 'bg-green-50 text-green-700',
    rejected: 'bg-red-50 text-red-600', paid: 'bg-emerald-50 text-emerald-700' }[s] ?? 'bg-gray-100 text-gray-500';
}

function fmt(n: number | string | null) {
  if (n == null) return '—';
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function currentMonth() { return new Date().toISOString().slice(0, 7); }

type Claim = { id: number; title: string; claim_month: string; status: string; total_amount: string; item_total?: string; item_count?: string };
type Item  = { id: number; expense_date: string; category: string; description?: string; amount: string; km_travelled?: string };

export default function FieldExpenses() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);

  // detail panel state
  const [selected, setSelected] = useState<(Claim & { items?: Item[] }) | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // new claim form
  const [showCreate, setShowCreate] = useState(false);
  const [newClaim, setNewClaim] = useState({ title: '', notes: '' });

  // add item form
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({ expense_date: new Date().toISOString().slice(0, 10), category: 'travel_km', description: '', amount: '', km_travelled: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try { setClaims(await getExpenseClaims({ month })); }
    finally { setLoading(false); }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (c: Claim) => {
    setDetailLoading(true);
    setSelected(c);
    try {
      const full = await getExpenseClaim(c.id);
      setSelected(full);
    } finally { setDetailLoading(false); }
  };

  const handleCreate = async () => {
    if (!newClaim.title.trim()) { toast({ title: 'Title is required', variant: 'destructive' }); return; }
    try {
      await createExpenseClaim({ claim_month: month, title: newClaim.title, notes: newClaim.notes || undefined });
      toast({ title: 'Claim created ✓' });
      setShowCreate(false);
      setNewClaim({ title: '', notes: '' });
      load();
    } catch (e: any) {
      toast({ title: 'Failed', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    }
  };

  const handleAddItem = async () => {
    if (!selected || !newItem.amount) { toast({ title: 'Amount is required', variant: 'destructive' }); return; }
    try {
      await addExpenseItem(selected.id, {
        expense_date: newItem.expense_date,
        category: newItem.category,
        amount: parseFloat(newItem.amount),
        description: newItem.description || undefined,
        km_travelled: newItem.km_travelled ? parseFloat(newItem.km_travelled) : undefined,
      });
      toast({ title: 'Item added ✓' });
      setShowAddItem(false);
      setNewItem({ expense_date: new Date().toISOString().slice(0, 10), category: 'travel_km', description: '', amount: '', km_travelled: '' });
      const full = await getExpenseClaim(selected.id);
      setSelected(full);
      load();
    } catch (e: any) {
      toast({ title: 'Failed', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    if (!selected) return;
    try {
      await deleteExpenseItem(selected.id, itemId);
      const full = await getExpenseClaim(selected.id);
      setSelected(full);
      load();
    } catch (e: any) {
      toast({ title: 'Failed', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    }
  };

  const handleSubmit = async () => {
    if (!selected) return;
    try {
      await submitExpenseClaim(selected.id);
      toast({ title: 'Claim submitted for review ✓' });
      const full = await getExpenseClaim(selected.id);
      setSelected(full);
      load();
    } catch (e: any) {
      toast({ title: 'Failed', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <div className="bg-[#17365D] text-white px-4 pt-10 pb-6">
        <button onClick={() => navigate('/team/field')} className="flex items-center gap-2 text-blue-200 text-sm mb-3 hover:text-white">
          <ArrowLeft size={15} /> Dashboard
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Expenses</h1>
            <p className="text-blue-200 text-sm mt-0.5">Travel & expense claims</p>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)} className="bg-white/15 hover:bg-white/25 text-white border-0">
            <Plus size={15} className="mr-1" /> New Claim
          </Button>
        </div>
      </div>

      <div className="px-4 py-3 bg-white border-b border-slate-100">
        <input type="month" value={month} max={currentMonth()} onChange={e => setMonth(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
      </div>

      <div className="px-4 pt-4 space-y-3">
        {loading ? (
          [1,2,3].map(i => <div key={i} className="h-20 bg-white animate-pulse rounded-xl" />)
        ) : claims.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Receipt size={36} className="mx-auto mb-3 opacity-25" />
            <p className="font-medium">No claims for {month}</p>
            <Button onClick={() => setShowCreate(true)} className="mt-4 bg-[#17365D] text-white"><Plus size={14} className="mr-1" />New Claim</Button>
          </div>
        ) : claims.map(c => (
          <Card key={c.id} className="shadow-sm border border-slate-100 cursor-pointer" onClick={() => openDetail(c)}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Receipt size={16} className="text-slate-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-slate-800">{c.title}</p>
                  <p className="text-xs text-slate-400">{c.claim_month} · {c.item_count ?? 0} items</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-semibold text-sm text-[#17365D]">{fmt(c.item_total ?? c.total_amount)}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(c.status)}`}>{c.status}</span>
                </div>
                <ChevronRight size={14} className="text-slate-300 mt-1 flex-shrink-0" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create claim sheet */}
      {showCreate && (
        <BottomSheet title="New Expense Claim" onClose={() => setShowCreate(false)}>
          <div className="space-y-3 pt-1">
            <LF label="Claim title">
              <input value={newClaim.title} onChange={e => setNewClaim(f => ({ ...f, title: e.target.value }))}
                placeholder={`Field expenses – ${month}`}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
            </LF>
            <LF label="Notes (optional)">
              <textarea rows={2} value={newClaim.notes} onChange={e => setNewClaim(f => ({ ...f, notes: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
            </LF>
            <Button onClick={handleCreate} className="w-full bg-[#17365D] text-white">Create Claim</Button>
          </div>
        </BottomSheet>
      )}

      {/* Detail panel */}
      {selected && (
        <BottomSheet title={selected.title} onClose={() => setSelected(null)}>
          {detailLoading ? (
            <div className="py-8 text-center text-slate-400 text-sm">Loading…</div>
          ) : (
            <div className="space-y-4 pt-1">
              <div className="flex items-center justify-between">
                <div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(selected.status)}`}>{selected.status}</span>
                  <p className="text-xs text-slate-400 mt-1">{selected.claim_month}</p>
                </div>
                <p className="text-lg font-bold text-[#17365D]">{fmt(selected.item_total ?? selected.total_amount)}</p>
              </div>

              <div className="space-y-1">
                {(selected.items || []).map((item: Item) => (
                  <div key={item.id} className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700">{CATEGORIES.find(c => c.value === item.category)?.label ?? item.category}</p>
                      {item.description && <p className="text-xs text-slate-400 truncate">{item.description}</p>}
                      <p className="text-xs text-slate-400">{item.expense_date}</p>
                    </div>
                    <p className="text-sm font-semibold text-slate-800 flex-shrink-0">{fmt(item.amount)}</p>
                    {selected.status === 'draft' && (
                      <button onClick={() => handleDeleteItem(item.id)} className="text-red-400 hover:text-red-600 flex-shrink-0">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
                {(selected.items || []).length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-4">No items yet</p>
                )}
              </div>

              {selected.status === 'draft' && (
                <div className="space-y-2">
                  <Button onClick={() => setShowAddItem(true)} variant="outline" className="w-full border-[#17365D] text-[#17365D]">
                    <Plus size={14} className="mr-1" /> Add Item
                  </Button>
                  {(selected.items || []).length > 0 && (
                    <Button onClick={handleSubmit} className="w-full bg-[#0D9488] hover:bg-[#0B7A70] text-white">
                      <Send size={14} className="mr-1" /> Submit for Review
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </BottomSheet>
      )}

      {/* Add item sheet */}
      {showAddItem && selected && (
        <BottomSheet title="Add Expense Item" onClose={() => setShowAddItem(false)}>
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <LF label="Date">
                <input type="date" value={newItem.expense_date} max={new Date().toISOString().slice(0,10)} onChange={e => setNewItem(f => ({ ...f, expense_date: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
              </LF>
              <LF label="Amount (₹)">
                <input type="number" min="0" step="0.01" value={newItem.amount} onChange={e => setNewItem(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
              </LF>
            </div>
            <LF label="Category">
              <select value={newItem.category} onChange={e => setNewItem(f => ({ ...f, category: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]">
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </LF>
            {(newItem.category === 'travel_km' || newItem.category === 'fuel') && (
              <LF label="Km travelled">
                <input type="number" min="0" step="0.1" value={newItem.km_travelled} onChange={e => setNewItem(f => ({ ...f, km_travelled: e.target.value }))}
                  placeholder="0"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
              </LF>
            )}
            <LF label="Description (optional)">
              <input value={newItem.description} onChange={e => setNewItem(f => ({ ...f, description: e.target.value }))}
                placeholder="Route, vendor, occasion…"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#17365D]" />
            </LF>
            <Button onClick={handleAddItem} className="w-full bg-[#17365D] text-white">Add Item</Button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="bg-black/40 absolute inset-0" />
      <div className="relative bg-white rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="font-semibold text-slate-800 truncate pr-4">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-4 pb-6">{children}</div>
      </div>
    </div>
  );
}

function LF({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-slate-500 block mb-1">{label}</label>
      {children}
    </div>
  );
}
