/**
 * DietaryModulePages — full-featured sub-pages for the Dietary department portal.
 * Diet Orders, Meal Plans, Patient Profiles, Reports — all with rich functional UI.
 */
import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DeptStaffLayout from "@/components/hosp-dept/DeptStaffLayout";
import { dietaryNav } from "./DepartmentDashboards";
import { DietaryAIAssistant } from "@/components/dietary/DietaryAIAssistant";
import api from "@/utils/api";
import {
  Utensils, Users, AlertTriangle, CalendarDays, ClipboardList,
  CheckCircle2, Clock, Search, Plus, Filter, Download, ArrowRight,
  Zap, BarChart3, TrendingUp, Leaf, Apple, Droplets,
  ChevronRight, ChevronLeft, Eye, Edit2, Trash2, X, Bell, Info,
  Salad, Heart, ShieldCheck, RefreshCw, Star, FileText, Soup, Flame,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";

// ─── Shared nav config ─────────────────────────────────────────────────────────

const dietLayout = (title: string, subtitle: string, children: React.ReactNode) => (
  <DeptStaffLayout
    deptKey="dietary"
    deptName="Dietary Services"
    badgeLabel="DIETARY"
    loginPath="/dietary/login"
    DeptIcon={Utensils}
    navSections={dietaryNav}
    title={title}
    subtitle={subtitle}
    copilotModule="dietary"
  >
    {children}
  </DeptStaffLayout>
);

// ─── DIET ORDERS DATA ──────────────────────────────────────────────────────────

// Orders start empty and fill from GET /dietary/orders (WP-0.3d — no seed data).

const statusConfig: Record<string, { label: string; cls: string }> = {
  delivered: { label: "Delivered",  cls: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" },
  pending:   { label: "Pending",    cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" },
  preparing: { label: "Preparing",  cls: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400" },
  cancelled: { label: "Cancelled",  cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
};

// ─── PATIENTS DATA ─────────────────────────────────────────────────────────────

// Patient profiles are derived from GET /dietary/stats (latest diet order per
// patient). Fields with no recorded source (age, BMI, conditions, compliance)
// are intentionally absent — WP-0.3d.
interface PatientProfile {
  id: string;
  name: string;
  ward: string;
  bed: string;
  dietType: string;
  allergies: string[];
  physician: string;
  calories: number | null;
  restrictions: string | null;
  status: string;
  priority: string;
  updatedAt: string;
}

// ─── MEAL PLAN DATA ────────────────────────────────────────────────────────────

const weekDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const mealSlots = ["Breakfast", "Mid-Morning", "Lunch", "Evening Snack", "Dinner"];

const mealPlanData: Record<string, Record<string, { items: string; calories: number; dietType: string }>> = {
  Monday: {
    Breakfast: { items: "Vegetable upma, coconut chutney, buttermilk", calories: 320, dietType: "Regular" },
    "Mid-Morning": { items: "Fresh fruit (papaya/apple), mixed nuts", calories: 180, dietType: "Regular" },
    Lunch: { items: "Rice, dal, mixed sabzi, salad, curd", calories: 520, dietType: "Regular" },
    "Evening Snack": { items: "Roasted chana, masala chai", calories: 160, dietType: "Regular" },
    Dinner: { items: "2 chapatis, paneer sabzi, dal, raita", calories: 580, dietType: "Regular" },
  },
  Tuesday: {
    Breakfast: { items: "2 idlis, sambar, coconut chutney", calories: 280, dietType: "Regular" },
    "Mid-Morning": { items: "Banana, almonds", calories: 195, dietType: "Regular" },
    Lunch: { items: "Rajma chawal, salad, pickle, curd", calories: 540, dietType: "Regular" },
    "Evening Snack": { items: "Makhana, green tea", calories: 100, dietType: "Regular" },
    Dinner: { items: "Palak paneer, chapati, dal, kheer", calories: 620, dietType: "Regular" },
  },
  Wednesday: {
    Breakfast: { items: "Poha with peanuts, nimbu pani", calories: 310, dietType: "Regular" },
    "Mid-Morning": { items: "Guava, walnuts", calories: 160, dietType: "Regular" },
    Lunch: { items: "Chole puri (diabetic: no puri), salad", calories: 490, dietType: "Regular" },
    "Evening Snack": { items: "Sprouts chaat, coconut water", calories: 150, dietType: "Regular" },
    Dinner: { items: "Fish curry, rice, dal, sabzi, raita", calories: 600, dietType: "Regular" },
  },
  Thursday: {
    Breakfast: { items: "Moong dal cheela, mint chutney, lassi", calories: 340, dietType: "Regular" },
    "Mid-Morning": { items: "Seasonal fruit, dates", calories: 185, dietType: "Regular" },
    Lunch: { items: "Brown rice, chicken curry, salad, curd", calories: 560, dietType: "Regular" },
    "Evening Snack": { items: "Dhokla, herbal tea", calories: 140, dietType: "Regular" },
    Dinner: { items: "Chapati, aloo gobi, dal, salad", calories: 510, dietType: "Regular" },
  },
  Friday: {
    Breakfast: { items: "Besan cheela, tomato chutney, milk", calories: 350, dietType: "Regular" },
    "Mid-Morning": { items: "Mango/papaya, cashews", calories: 200, dietType: "Regular" },
    Lunch: { items: "Veg biryani, raita, papad, salad", calories: 580, dietType: "Regular" },
    "Evening Snack": { items: "Samosa (1), chai", calories: 280, dietType: "Regular" },
    Dinner: { items: "Chapati, egg curry, dal, salad", calories: 560, dietType: "Regular" },
  },
  Saturday: {
    Breakfast: { items: "Uttapam, sambar, juice", calories: 295, dietType: "Regular" },
    "Mid-Morning": { items: "Fruit bowl, peanut butter", calories: 210, dietType: "Regular" },
    Lunch: { items: "Kadhi chawal, papad, pickle, salad", calories: 500, dietType: "Regular" },
    "Evening Snack": { items: "Pani puri (4 pieces), lassi", calories: 220, dietType: "Regular" },
    Dinner: { items: "2 parathas, chole, curd, salad", calories: 600, dietType: "Regular" },
  },
  Sunday: {
    Breakfast: { items: "Paratha with curd and pickle, banana shake", calories: 450, dietType: "Regular" },
    "Mid-Morning": { items: "Fruit chaat, coconut water", calories: 175, dietType: "Regular" },
    Lunch: { items: "Sunday special thali — rice, 3 sabzis, dal, dessert", calories: 700, dietType: "Regular" },
    "Evening Snack": { items: "Bhel puri, masala chai", calories: 250, dietType: "Regular" },
    Dinner: { items: "Chapati, paneer butter masala, dal, salad", calories: 580, dietType: "Regular" },
  },
};

// ─── REPORTS DATA ──────────────────────────────────────────────────────────────

// Historical trend/waste series have no recorded source — the Reports page
// renders explicit unavailable states instead of fabricated numbers (WP-0.3d).

// (diet-pie palette removed — charts use server-provided colors / defaults, WP-0.3d)

// ─── DIET ORDERS PAGE ──────────────────────────────────────────────────────────

const DietaryOrdersContent = () => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [ordersError, setOrdersError] = useState(false);
  const [aiKey, setAiKey] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [newOrder, setNewOrder] = useState({ patientName: '', patientId: '', ward: '', bed: '', dietType: 'Regular', allergies: '', restrictions: '', calories: '1800', physician: '' });
  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('dietaryToken') || ''}` });

  useEffect(() => {
    api.get('/dietary/orders', { headers: headers() }).then(({ data }) => {
      setOrders((data.data || []).map((o: any) => ({
        id: o.order_number, patient: o.patient_name, ward: o.ward, bed: o.bed,
        dietType: o.diet_type, status: o.status, priority: o.priority, allergy: o.allergies?.join(', ') || null,
        calories: o.calories, time: String(o.created_at || '').slice(11, 16), physician: o.physician, restrictions: o.restrictions,
      })));
      setOrdersError(false);
    }).catch((err) => {
      console.error('[Dietary] failed to load orders:', err?.message);
      setOrdersError(true);
    });
  }, []);

  const createAdmissionOrder = async () => {
    const response = await api.post('/dietary/orders/from-admission', {
      patientName: newOrder.patientName,
      patientId: newOrder.patientId || undefined,
      ward: newOrder.ward,
      bed: newOrder.bed,
      dietType: newOrder.dietType,
      allergies: newOrder.allergies.split(',').map((item) => item.trim()).filter(Boolean),
      restrictions: newOrder.restrictions,
      calories: Number(newOrder.calories),
      physician: newOrder.physician,
    }, { headers: headers() });
    const o = response.data.data;
    setOrders((prev) => [{
      id: o.order_number, patient: o.patient_name, ward: o.ward, bed: o.bed, age: 0,
      dietType: o.diet_type, status: o.status, priority: o.priority, allergy: o.allergies?.join(', ') || null,
      calories: o.calories, time: String(o.created_at || '').slice(11, 16), physician: o.physician, restrictions: o.restrictions,
    }, ...prev]);
    setShowCreate(false);
    setNewOrder({ patientName: '', patientId: '', ward: '', bed: '', dietType: 'Regular', allergies: '', restrictions: '', calories: '1800', physician: '' });
  };

  const filtered = useMemo(() =>
    orders.filter((o) => {
      const matchSearch = o.patient.toLowerCase().includes(search.toLowerCase()) ||
        o.id.toLowerCase().includes(search.toLowerCase()) ||
        o.ward.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || o.status === statusFilter;
      return matchSearch && matchStatus;
    }), [orders, search, statusFilter]);

  return (
    <>
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Diet Orders</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{filtered.length} orders • Today's active orders</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-2 border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-950"
            onClick={() => setAiKey(k => k + 1)}
          >
            <Zap className="h-4 w-4" /> AI Smart Order
          </Button>
          <Button size="sm" className="gap-2 bg-green-600 hover:bg-green-700 text-white" onClick={() => setShowCreate((value) => !value)}>
            <Plus className="h-4 w-4" /> New Order
          </Button>
          <Button size="sm" variant="outline" className="gap-2">
            <Download className="h-4 w-4" /> Export
          </Button>
        </div>
      </div>

      {showCreate && (
        <Card>
          <CardHeader><CardTitle className="text-base">Create Diet Order From Admission</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <Input placeholder="Patient name" value={newOrder.patientName} onChange={(e) => setNewOrder({ ...newOrder, patientName: e.target.value })} />
            <Input placeholder="Patient ID" value={newOrder.patientId} onChange={(e) => setNewOrder({ ...newOrder, patientId: e.target.value })} />
            <Input placeholder="Ward" value={newOrder.ward} onChange={(e) => setNewOrder({ ...newOrder, ward: e.target.value })} />
            <Input placeholder="Bed" value={newOrder.bed} onChange={(e) => setNewOrder({ ...newOrder, bed: e.target.value })} />
            <Input placeholder="Diet type" value={newOrder.dietType} onChange={(e) => setNewOrder({ ...newOrder, dietType: e.target.value })} />
            <Input placeholder="Allergies, comma separated" value={newOrder.allergies} onChange={(e) => setNewOrder({ ...newOrder, allergies: e.target.value })} />
            <Input placeholder="Restrictions" value={newOrder.restrictions} onChange={(e) => setNewOrder({ ...newOrder, restrictions: e.target.value })} />
            <Input placeholder="Calories" value={newOrder.calories} onChange={(e) => setNewOrder({ ...newOrder, calories: e.target.value })} />
            <Input placeholder="Physician" value={newOrder.physician} onChange={(e) => setNewOrder({ ...newOrder, physician: e.target.value })} />
            <div className="md:col-span-3 flex justify-end gap-2"><Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button><Button onClick={createAdmissionOrder}>Create Order</Button></div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search patient, order ID, ward..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {["all", "pending", "preparing", "delivered", "cancelled"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === s ? "bg-green-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"}`}
            >
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              {s !== "all" && ` (${orders.filter(o => o.status === s).length})`}
            </button>
          ))}
        </div>
      </div>

      <Card className="border-green-200 bg-green-50/60">
        <CardContent className="grid gap-3 p-4 md:grid-cols-3">
          <div><p className="text-xs text-muted-foreground">Inpatient intake</p><p className="font-semibold">Admission-linked orders</p></div>
          <div><p className="text-xs text-muted-foreground">Allergen safety</p><p className="font-semibold">Allergy flags before meal release</p></div>
          <div><p className="text-xs text-muted-foreground">Discharge counselling</p><p className="font-semibold">Dietitian handoff output</p></div>
        </CardContent>
      </Card>

      {/* Stats strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total",     value: orders.length,                        color: "text-slate-700 dark:text-slate-200" },
          { label: "Pending",   value: orders.filter(o => o.status === "pending").length,   color: "text-amber-600" },
          { label: "Preparing", value: orders.filter(o => o.status === "preparing").length, color: "text-blue-600" },
          { label: "Delivered", value: orders.filter(o => o.status === "delivered").length, color: "text-green-600" },
        ].map(({ label, value, color }) => (
          <Card key={label} className="py-3 px-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">Patient</th>
                <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Ward / Bed</th>
                <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Diet Type</th>
                <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Calories</th>
                <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Status</th>
                <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Physician</th>
                <th className="text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {filtered.map((order, i) => (
                  <motion.tr
                    key={order.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {order.patient.split(" ").map(n => n[0]).join("").slice(0, 2)}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium text-slate-800 dark:text-white text-xs">{order.patient}</p>
                            {order.priority === "high" && <Zap className="h-3 w-3 text-amber-500" />}
                          </div>
                          <p className="text-[10px] text-slate-400">{order.id} • Age {order.age}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-slate-700 dark:text-slate-300">{order.ward}</p>
                      <p className="text-[10px] text-slate-400">Bed {order.bed}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{order.dietType}</p>
                        {order.allergy && (
                          <Badge className="text-[9px] bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400 border-0 px-1.5 py-0 gap-1">
                            <AlertTriangle className="h-2.5 w-2.5" /> {order.allergy}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{order.calories} kcal</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`text-[10px] border-0 font-medium ${statusConfig[order.status].cls}`}>
                        {statusConfig[order.status].label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-slate-600 dark:text-slate-400">{order.physician}</p>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setSelectedOrder(order)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-950 transition-colors"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors">
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-16 flex flex-col items-center gap-3 text-slate-400">
              <Search className="h-10 w-10 opacity-30" />
              <p className="text-sm font-medium">No orders match your filters</p>
            </div>
          )}
        </div>
      </Card>

      {/* Detail Drawer */}
      <AnimatePresence>
        {selectedOrder && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 z-40" onClick={() => setSelectedOrder(null)} />
            <motion.div
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 35 }}
              className="fixed right-0 top-0 h-full w-full max-w-md bg-white dark:bg-slate-900 z-50 shadow-2xl flex flex-col overflow-y-auto"
            >
              <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">{selectedOrder.patient}</h3>
                  <p className="text-xs text-slate-500">{selectedOrder.id}</p>
                </div>
                <button onClick={() => setSelectedOrder(null)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">
                  <X className="h-5 w-5 text-slate-500" />
                </button>
              </div>
              <div className="p-5 space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Ward", value: selectedOrder.ward },
                    { label: "Bed", value: selectedOrder.bed },
                    { label: "Age", value: `${selectedOrder.age} years` },
                    { label: "Diet Type", value: selectedOrder.dietType },
                    { label: "Calories", value: `${selectedOrder.calories} kcal` },
                    { label: "Physician", value: selectedOrder.physician },
                  ].map(({ label, value }) => (
                    <div key={label} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-white mt-0.5">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="p-4 bg-green-50 dark:bg-green-950/40 rounded-xl border border-green-100 dark:border-green-800">
                  <p className="text-xs font-semibold text-green-700 dark:text-green-300 mb-1">Dietary Restrictions</p>
                  <p className="text-sm text-green-800 dark:text-green-200">{selectedOrder.restrictions}</p>
                </div>
                {selectedOrder.allergy && (
                  <div className="p-4 bg-red-50 dark:bg-red-950/40 rounded-xl border border-red-200 dark:border-red-800 flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-red-700 dark:text-red-300">ALLERGY ALERT</p>
                      <p className="text-sm text-red-800 dark:text-red-200 mt-0.5">Patient is allergic to <strong>{selectedOrder.allergy}</strong>. Ensure all meals are free from this allergen.</p>
                    </div>
                  </div>
                )}
                <Badge className={`text-sm px-4 py-2 border-0 font-semibold ${statusConfig[selectedOrder.status].cls}`}>
                  Status: {statusConfig[selectedOrder.status].label}
                </Badge>
                <div className="flex gap-2 pt-2">
                  <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white">Update Status</Button>
                  <Button variant="outline" className="flex-1">Print Order</Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
    <DietaryAIAssistant key={aiKey} defaultOpen={aiKey > 0} initialTool="smart-order" />
    </>
  );
};

// ─── MEAL PLANS PAGE ───────────────────────────────────────────────────────────

const DietaryPlansContent = () => {
  const [activeDay, setActiveDay] = useState(0);
  const today = new Date();
  const dayIdx = (today.getDay() + 6) % 7; // Mon=0

  const day = weekDays[activeDay];
  const dayPlan = mealPlanData[day];
  const totalCals = Object.values(dayPlan).reduce((s, m) => s + m.calories, 0);

  const mealIcons: Record<string, React.ElementType> = {
    "Breakfast": Soup,
    "Mid-Morning": Apple,
    "Lunch": Utensils,
    "Evening Snack": Leaf,
    "Dinner": Salad,
  };

  const mealColors: Record<string, string> = {
    "Breakfast": "from-amber-500 to-orange-500",
    "Mid-Morning": "from-green-500 to-emerald-500",
    "Lunch": "from-blue-500 to-indigo-500",
    "Evening Snack": "from-purple-500 to-violet-500",
    "Dinner": "from-teal-500 to-cyan-500",
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Weekly Meal Plans</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Standard therapeutic meal schedule — May 2026</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="gap-2 bg-green-600 hover:bg-green-700 text-white">
            <Plus className="h-4 w-4" /> New Plan
          </Button>
          <Button size="sm" variant="outline" className="gap-2">
            <Download className="h-4 w-4" /> Export PDF
          </Button>
        </div>
      </div>

      {/* Day tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {weekDays.map((d, i) => (
          <button
            key={d}
            onClick={() => setActiveDay(i)}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              activeDay === i
                ? "bg-green-600 text-white shadow-md shadow-green-500/20"
                : i === dayIdx
                ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300 ring-1 ring-green-300 dark:ring-green-700"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            {d.slice(0, 3)}
            {i === dayIdx && <span className="ml-1.5 text-[9px] uppercase tracking-wide opacity-70">Today</span>}
          </button>
        ))}
      </div>

      {/* Daily calorie summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {Object.entries(dayPlan).map(([mealName, meal]) => {
          const Icon = mealIcons[mealName] || Utensils;
          const grad = mealColors[mealName] || "from-slate-500 to-slate-600";
          return (
            <Card key={mealName} className="overflow-hidden">
              <CardContent className="p-4">
                <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${grad} flex items-center justify-center mb-2`}>
                  <Icon className="h-4.5 w-4.5 text-white" />
                </div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{mealName}</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">{meal.calories}</p>
                <p className="text-[10px] text-slate-400">kcal</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Total bar */}
      <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 rounded-xl border border-green-100 dark:border-green-900">
        <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center">
          <Flame className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-sm text-slate-600 dark:text-slate-400">Total Daily Calories ({day})</p>
          <p className="text-2xl font-bold text-green-700 dark:text-green-400">{totalCals} <span className="text-sm font-normal text-slate-500">kcal</span></p>
        </div>
        <div className="ml-auto text-right hidden sm:block">
          <p className="text-xs text-slate-500">Standard target: 2000 kcal</p>
          <p className={`text-sm font-bold mt-0.5 ${totalCals <= 2000 ? "text-green-600" : "text-amber-600"}`}>
            {totalCals <= 2000 ? `${2000 - totalCals} kcal under target` : `${totalCals - 2000} kcal over target`}
          </p>
        </div>
      </div>

      {/* Meal cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Object.entries(dayPlan).map(([mealName, meal]) => {
          const Icon = mealIcons[mealName] || Utensils;
          const grad = mealColors[mealName] || "from-slate-500 to-slate-600";
          return (
            <motion.div key={mealName} whileHover={{ y: -2 }} transition={{ duration: 0.2 }}>
              <Card className="overflow-hidden h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${grad} flex items-center justify-center shadow-sm`}>
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-sm">{mealName}</CardTitle>
                        <p className="text-xs text-slate-400 dark:text-slate-500">{meal.dietType}</p>
                      </div>
                    </div>
                    <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-0 font-bold">
                      {meal.calories} kcal
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{meal.items}</p>
                  <div className="mt-3 flex gap-2">
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-950">
                      <Edit2 className="h-3 w-3" /> Edit
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950">
                      <Info className="h-3 w-3" /> Nutrition
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Calorie bar chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-green-600" />
            Calorie Distribution — {day}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={Object.entries(dayPlan).map(([name, m]) => ({ name: name.replace("Mid-Morning", "Mid-Morn").replace("Evening Snack", "Eve Snack"), calories: m.calories }))} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: "10px", border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", fontSize: 12 }} />
              <Bar dataKey="calories" name="Calories (kcal)" fill="#22c55e" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};

// ─── PATIENTS PAGE ─────────────────────────────────────────────────────────────

const DietaryPatientsContent = () => {
  const [search, setSearch] = useState("");
  const [patients, setPatients] = useState<PatientProfile[]>([]);
  const [patientsLoaded, setPatientsLoaded] = useState(false);
  const [selected, setSelected] = useState<PatientProfile | null>(null);

  useEffect(() => {
    api.get('/dietary/stats', {
      headers: { Authorization: `Bearer ${localStorage.getItem('dietaryToken') || ''}` },
    }).then(({ data }) => {
      setPatients(((data.data?.patients || []) as any[]).map((p) => ({
        id: p.patient_id || p.order_number,
        name: p.patient_name,
        ward: p.ward || '—',
        bed: p.bed || '—',
        dietType: p.diet_type,
        allergies: p.allergies || [],
        physician: p.physician || '—',
        calories: p.calories ?? null,
        restrictions: p.restrictions ?? null,
        status: p.status,
        priority: p.priority,
        updatedAt: String(p.updated_at || '').slice(0, 10),
      })));
      setPatientsLoaded(true);
    }).catch((err) => {
      console.error('[Dietary] failed to load patient profiles:', err?.message);
      setPatientsLoaded(true);
    });
  }, []);

  const filtered = patients.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.ward.toLowerCase().includes(search.toLowerCase()) ||
    p.dietType.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Patient Dietary Profiles</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{filtered.length} patients with current diet orders</p>
        </div>
        <Button size="sm" variant="outline" className="gap-2"><Download className="h-4 w-4" /> Export Profiles</Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input placeholder="Search patient, ward, diet type..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
        {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>}
      </div>

      {/* Allergy summary */}
      <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-100 dark:border-red-900">
        <Bell className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
        <p className="text-sm text-red-700 dark:text-red-300">
          {patientsLoaded ? (
            <>
              <strong>{patients.filter(p => p.allergies.length > 0).length} patients</strong> have active allergy flags.
              Always verify meal contents before delivery.
            </>
          ) : "Loading allergy flags…"}
        </p>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((p) => (
          <motion.div key={p.id} whileHover={{ y: -2 }} transition={{ duration: 0.2 }}>
            <Card
              className={`cursor-pointer transition-all hover:shadow-md ${p.allergies.length > 0 ? "border-red-200 dark:border-red-900" : ""}`}
              onClick={() => setSelected(p)}
            >
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white font-bold shrink-0">
                    {p.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <div>
                        <p className="font-semibold text-slate-800 dark:text-white text-sm truncate">{p.name}</p>
                        <p className="text-xs text-slate-500">{p.id} · {p.ward}</p>
                      </div>
                      {p.allergies.length > 0 && (
                        <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge className="text-[10px] bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400 border-0">{p.dietType}</Badge>
                      <Badge className="text-[10px] bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-0">{p.ward} · {p.bed}</Badge>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                        <p className="text-[10px] text-slate-500">Target kcal</p>
                        <p className="text-sm font-bold mt-0.5 text-slate-700 dark:text-slate-300">{p.calories ?? "—"}</p>
                      </div>
                      <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                        <p className="text-[10px] text-slate-500">Status</p>
                        <p className="text-sm font-bold mt-0.5 text-slate-700 dark:text-slate-300">{(statusConfig[p.status] || statusConfig.pending).label}</p>
                      </div>
                      <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg col-span-1">
                        <p className="text-[10px] text-slate-500">Priority</p>
                        <p className="text-sm font-bold mt-0.5 text-slate-700 dark:text-slate-300">{p.priority}</p>
                      </div>
                    </div>

                    {p.allergies.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1">
                        {p.allergies.map(a => (
                          <span key={a} className="text-[9px] px-2 py-0.5 bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 rounded-full font-semibold">⚠ {a}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
        {!patientsLoaded && (
          <p className="col-span-full text-sm text-slate-400">Loading patient profiles…</p>
        )}
        {patientsLoaded && filtered.length === 0 && (
          <p className="col-span-full text-sm text-slate-400">No patients with diet orders yet.</p>
        )}
      </div>

      {/* Detail panel */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 z-40" onClick={() => setSelected(null)} />
            <motion.div
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 35 }}
              className="fixed right-0 top-0 h-full w-full max-w-md bg-white dark:bg-slate-900 z-50 shadow-2xl flex flex-col overflow-y-auto"
            >
              <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white font-bold">
                    {selected.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">{selected.name}</h3>
                    <p className="text-xs text-slate-500">{selected.id} · {selected.ward} · Bed {selected.bed}</p>
                  </div>
                </div>
                <button onClick={() => setSelected(null)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">
                  <X className="h-5 w-5 text-slate-500" />
                </button>
              </div>
              <div className="p-5 space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Ward", value: selected.ward },
                    { label: "Bed", value: selected.bed },
                    { label: "Diet Type", value: selected.dietType },
                    { label: "Physician", value: selected.physician },
                    { label: "Target kcal", value: selected.calories ? `${selected.calories} kcal` : "—" },
                    { label: "Last Updated", value: selected.updatedAt || "—" },
                  ].map(({ label, value }) => (
                    <div key={label} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-white mt-0.5">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Current diet order snapshot */}
                <div className="p-4 bg-green-50 dark:bg-green-950/40 rounded-xl border border-green-100 dark:border-green-800">
                  <p className="text-xs font-semibold text-green-700 dark:text-green-300 mb-2">Current Diet Order</p>
                  <div className="flex items-center gap-6">
                    <div>
                      <p className="text-[10px] text-slate-500">Status</p>
                      <p className="text-2xl font-bold text-slate-800 dark:text-white">{(statusConfig[selected.status] || statusConfig.pending).label}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500">Priority</p>
                      <p className="text-2xl font-bold text-slate-800 dark:text-white">{selected.priority}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500">Target</p>
                      <p className="text-2xl font-bold text-slate-800 dark:text-white">{selected.calories ? `${selected.calories} kcal` : "—"}</p>
                    </div>
                  </div>
                </div>

                {/* Restrictions */}
                <div>
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Dietary Restrictions</p>
                  {selected.restrictions ? (
                    <p className="text-sm text-slate-600 dark:text-slate-400">{selected.restrictions}</p>
                  ) : (
                    <p className="text-sm text-slate-400">No restrictions recorded on the current order.</p>
                  )}
                </div>

                <Card className="border-green-200 bg-green-50/70">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold text-green-700">Discharge counselling</p>
                    <p className="mt-1 text-sm text-slate-600">Record dietitian advice and handoff output before discharge.</p>
                    <Button className="mt-3" size="sm" onClick={async () => {
                      try {
                        await api.post('/dietary/counselling', {
                          patientId: selected.id,
                          summary: `${selected.dietType} diet counselling completed`,
                          instructions: selected.restrictions || selected.dietType,
                        }, { headers: { Authorization: `Bearer ${localStorage.getItem('dietaryToken') || ''}` } });
                      } catch (err: any) {
                        console.error('[Dietary] failed to save counselling note:', err?.message);
                      }
                    }}>Save counselling output</Button>
                  </CardContent>
                </Card>

                {/* Allergies */}
                {selected.allergies.length > 0 && (
                  <div className="p-4 bg-red-50 dark:bg-red-950/40 rounded-xl border border-red-200 dark:border-red-800">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                      <p className="text-xs font-bold text-red-700 dark:text-red-300">ALLERGEN ALERT</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selected.allergies.map(a => (
                        <Badge key={a} className="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 border-0 font-semibold">{a}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white">View Diet Order</Button>
                  <Button variant="outline" className="flex-1">Edit Profile</Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── REPORTS PAGE ──────────────────────────────────────────────────────────────

const DietaryReportsContent = () => {
  const [stats, setStats] = useState<{
    totals: { total: number; active: number; delivered: number; npo: number; special: number; wards: number };
    dietTypes: { name: string; value: number }[];
    allergyAlerts: unknown[];
  } | null>(null);

  useEffect(() => {
    api.get('/dietary/stats', {
      headers: { Authorization: `Bearer ${localStorage.getItem('dietaryToken') || ''}` },
    }).then(({ data }) => setStats(data.data)).catch((err) => {
      console.error('[Dietary] failed to load report stats:', err?.message);
    });
  }, []);

  const totals = stats?.totals;
  const deliveryPct = totals && totals.total > 0 ? Math.round((totals.delivered / totals.total) * 100) : null;
  const reportStats = [
    { label: "Delivery Rate",         value: deliveryPct !== null ? `${deliveryPct}%` : "—",  icon: ShieldCheck, color: "text-green-600", bg: "bg-green-100 dark:bg-green-950" },
    { label: "Total Diet Orders",     value: totals ? totals.total.toLocaleString() : "—",    icon: Utensils,    color: "text-blue-600",  bg: "bg-blue-100 dark:bg-blue-950" },
    { label: "Active Allergy Alerts", value: stats ? String(stats.allergyAlerts.length) : "—", icon: AlertTriangle, color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-950" },
    { label: "Special Diets",         value: totals ? String(totals.special) : "—",           icon: Leaf,        color: "text-amber-600", bg: "bg-amber-100 dark:bg-amber-950" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Dietary Reports & Analytics</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Live aggregates from current dietary orders</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-2"><RefreshCw className="h-4 w-4" /> Refresh</Button>
          <Button size="sm" variant="outline" className="gap-2"><Download className="h-4 w-4" /> Export</Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {reportStats.map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{label}</p>
                  <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{value}</p>
                </div>
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${bg}`}>
                  <Icon className={`h-5 w-5 ${color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Compliance trend — no historical source yet */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              Diet Compliance Trend (6 Months)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Not available yet — compliance isn’t recorded over time, so no trend can be shown (dataAvailable: false).
            </p>
          </CardContent>
        </Card>

        {/* Food waste — no measurement source yet */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Leaf className="h-4 w-4 text-green-600" />
              Food Waste Reduction (8 Weeks)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Not available yet — food waste isn’t measured in any connected system (dataAvailable: false).
            </p>
          </CardContent>
        </Card>

        {/* Current diet distribution (real, from /dietary/stats) */}
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-green-600" />
              Current Diet Type Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!stats && <p className="text-sm text-slate-400">Loading diet distribution…</p>}
            {stats && (stats.dietTypes || []).length === 0 && (
              <p className="text-sm text-slate-400">No diet orders recorded yet.</p>
            )}
            {stats && (stats.dietTypes || []).length > 0 && (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={(stats.dietTypes || []).map((d) => ({ diet: d.name, count: d.value }))} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                  <XAxis dataKey="diet" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: "10px", border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", fontSize: 12 }} />
                  <Bar dataKey="count" name="Orders" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Summary table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-green-600" />
            Monthly Performance Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  {["Month", "Meals Served", "Compliance %", "Special Diets", "Allergy Incidents", "Waste (portions)"].map(h => (
                    <th key={h} className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={6} className="px-5 py-6 text-center text-xs text-slate-400">
                    Monthly history isn’t recorded yet — no trend source connected (dataAvailable: false).
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ─── Exported page components ─────────────────────────────────────────────────

export const DietaryOrders   = () => dietLayout("Diet Orders",   "Manage patient diet orders & restrictions",  <DietaryOrdersContent />);
export const DietaryPlans    = () => <>{dietLayout("Meal Plans",    "Weekly meal schedule & calorie planning",    <DietaryPlansContent />)}<DietaryAIAssistant /></>;
export const DietaryPatients = () => <>{dietLayout("Patient Profiles", "Dietary profiles, allergies & compliance", <DietaryPatientsContent />)}<DietaryAIAssistant /></>;
export const DietaryReports  = () => <>{dietLayout("Reports",       "Nutrition analytics & performance metrics",  <DietaryReportsContent />)}<DietaryAIAssistant /></>;
