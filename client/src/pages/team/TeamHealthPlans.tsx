import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import api from "@/utils/api";
import {
  FAMILY_COVERAGE_NONE,
  FAMILY_COVERAGE_OPTIONS,
  familyCoverageFromSelect,
  familyCoverageSelectValue,
} from "@/constants/familyCoverage";
import {
  Plus, Edit, Trash2, Shield, Star, Crown, Gem, CheckCircle2,
  Loader2, Users, Search, ToggleLeft, ToggleRight, Video, MapPin,
  FlaskConical, Pill, Home, Ambulance, HeartPulse, Stethoscope, Smile,
  ChevronDown, ChevronUp, AlertCircle
} from "lucide-react";

// ── Tier config ──────────────────────────────────────────────────────────────
const TIER_ICONS: Record<number, React.FC<{ className?: string }>> = {
  1: Shield, 2: Star, 3: Crown, 4: Gem
};
const TIER_COLORS: Record<number, string> = {
  1: "bg-slate-100 text-slate-700 border-slate-300",
  2: "bg-sky-50 text-sky-700 border-sky-300",
  3: "bg-amber-50 text-amber-700 border-amber-300",
  4: "bg-purple-50 text-purple-700 border-purple-300"
};
const PLAN_TYPE_BADGE: Record<string, string> = {
  primary: "bg-emerald-50 text-emerald-700 border-emerald-300",
  addon: "bg-orange-50 text-orange-700 border-orange-300",
  health_checkup: "bg-blue-50 text-blue-700 border-blue-300"
};

// ── Coverage rows config ─────────────────────────────────────────────────────
const COVERAGE_FIELDS = [
  { key: "onlineConsult",    label: "Online Consult",     Icon: Video,       type: "consult"  },
  { key: "physicalConsult",  label: "Physical Consult",   Icon: MapPin,      type: "consult"  },
  { key: "labTests",         label: "Lab Tests",          Icon: FlaskConical,type: "money"    },
  { key: "pharmacy",         label: "Pharmacy",           Icon: Pill,        type: "money"    },
  { key: "homeCare",         label: "Home Care",          Icon: Home,        type: "money"    },
  { key: "ambulance",        label: "Ambulance",          Icon: Ambulance,   type: "money"    },
  { key: "healthCheck",      label: "Health Check",       Icon: HeartPulse,  type: "package"  },
  { key: "emergencyConsult", label: "Emergency Consult",  Icon: Stethoscope, type: "consult"  },
  { key: "dental",           label: "Dental",             Icon: Smile,       type: "money"    },
];

// ── Types ────────────────────────────────────────────────────────────────────
interface CoverageItem { limit?: number; limitINR?: number; unit?: string; package?: string }
interface CoverageDetails {
  onlineConsult?: CoverageItem; physicalConsult?: CoverageItem;
  labTests?: CoverageItem; pharmacy?: CoverageItem;
  homeCare?: CoverageItem; ambulance?: CoverageItem;
  healthCheck?: CoverageItem; emergencyConsult?: CoverageItem; dental?: CoverageItem;
}
interface Plan {
  id: number; name: string; code?: string; description?: string;
  tier: number; tierName?: string; planType: string;
  price: string | number; discountedPrice?: string | number;
  durationMonths: number; isActive: boolean; isFeatured: boolean;
  features?: string[]; benefits?: string[];
  metadata?: { coverageDetails?: CoverageDetails; [k: string]: any };
}

// ── Empty form state ─────────────────────────────────────────────────────────
function emptyForm(): Omit<Plan, "id"> & { id?: number } {
  return {
    name: "", code: "", description: "",
    tier: 1, tierName: "Basic", planType: "primary",
    price: 0, discountedPrice: 0 as any, durationMonths: 1,
    isActive: true, isFeatured: false,
    features: [], benefits: [],
    metadata: {
      coverageDetails: {
        onlineConsult: { limit: 0, unit: "consults/month" },
        physicalConsult: { limit: 0, unit: "consults/month" },
        labTests: { limitINR: 0 }, pharmacy: { limitINR: 0 },
        homeCare: { limitINR: 0 }, ambulance: { limitINR: 0 },
        healthCheck: { package: "None" },
        emergencyConsult: { limit: 0, unit: "consults/month" },
        dental: { limitINR: 0 }
      }
    }
  };
}

const TIER_NAMES: Record<number, string> = { 1: "Basic", 2: "Silver", 3: "Gold", 4: "Platinum" };

// ── Plan form dialog ─────────────────────────────────────────────────────────
function PlanFormDialog({
  open, plan, onClose, onSaved
}: {
  open: boolean; plan: (Plan & { id?: number }) | null; onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useToast();

  // Normalize features/benefits to arrays (they may be objects from JSONB corporate plans)
  function normalizePlan(p: Plan & { id?: number }) {
    return {
      ...p,
      features: Array.isArray(p.features)
        ? p.features
        : typeof p.features === 'object' && p.features !== null
          ? Object.entries(p.features as Record<string, any>)
              .filter(([, v]) => (v as any)?.enabled || v === true)
              .map(([k]) => k)
          : [],
      benefits: Array.isArray(p.benefits)
        ? p.benefits
        : typeof p.benefits === 'object' && p.benefits !== null
          ? Object.values(p.benefits as Record<string, any>)
              .filter((b: any) => b?.isIncluded)
              .map((b: any) => b.name ?? '')
          : [],
    };
  }

  const [form, setForm] = useState<ReturnType<typeof emptyForm>>(plan ? normalizePlan(plan as Plan & { id?: number }) : emptyForm());
  const [saving, setSaving] = useState(false);
  const [showCoverage, setShowCoverage] = useState(true);
  const isEdit = !!form.id;

  // Sync when plan prop changes
  useState(() => { setForm(plan ? normalizePlan(plan as Plan & { id?: number }) : emptyForm()); });

  const set = (key: string, val: any) => setForm(f => ({ ...f, [key]: val }));
  const setMeta = (key: string, val: any) => setForm(f => ({
    ...f, metadata: { ...(f.metadata ?? {}), [key]: val }
  }));
  const setCoverage = (field: string, subKey: string, val: any) => setForm(f => {
    const cd: CoverageDetails = { ...(f.metadata?.coverageDetails ?? {}) };
    (cd as any)[field] = { ...((cd as any)[field] ?? {}), [subKey]: val === "" ? 0 : val };
    return { ...f, metadata: { ...(f.metadata ?? {}), coverageDetails: cd } };
  });

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: "Name required", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        tier: Number(form.tier),
        tierName: TIER_NAMES[Number(form.tier)] ?? form.tierName,
        price: Number(form.price) || 0,
        discountedPrice: form.discountedPrice ? Number(form.discountedPrice) : null,
        durationMonths: Number(form.durationMonths) || 1,
      };
      if (isEdit) {
        await api.put(`/membership/admin/plans/${form.id}`, payload);
        toast({ title: "Plan updated" });
      } else {
        await api.post("/membership/admin/plans", payload);
        toast({ title: "Plan created" });
      }
      onSaved();
      onClose();
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.response?.data?.message ?? e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const cd = form.metadata?.coverageDetails ?? {};

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit: ${form.name}` : "Create New Plan"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Plan Name *</Label>
              <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Gold Plan" />
            </div>
            <div>
              <Label>Code</Label>
              <Input value={form.code ?? ""} onChange={e => set("code", e.target.value.toUpperCase())} placeholder="GOLD" />
            </div>
            <div>
              <Label>Plan Type</Label>
              <Select value={form.planType} onValueChange={v => set("planType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="primary">Primary</SelectItem>
                  <SelectItem value="addon">Addon</SelectItem>
                  <SelectItem value="health_checkup">Health Checkup</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Description</Label>
            <Textarea value={form.description ?? ""} onChange={e => set("description", e.target.value)} rows={2} />
          </div>

          {/* Tier & Pricing */}
          <div className="grid grid-cols-4 gap-3">
            <div>
              <Label>Tier</Label>
              <Select value={String(form.tier)} onValueChange={v => set("tier", Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 – Basic</SelectItem>
                  <SelectItem value="2">2 – Silver</SelectItem>
                  <SelectItem value="3">3 – Gold</SelectItem>
                  <SelectItem value="4">4 – Platinum</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Price (₹)</Label>
              <Input type="number" min={0} value={form.price} onChange={e => set("price", e.target.value)} />
            </div>
            <div>
              <Label>Discounted (₹)</Label>
              <Input type="number" min={0} value={form.discountedPrice ?? ""} onChange={e => set("discountedPrice", e.target.value)} />
            </div>
            <div>
              <Label>Duration (months)</Label>
              <Input type="number" min={1} value={form.durationMonths} onChange={e => set("durationMonths", e.target.value)} />
            </div>
          </div>

          {/* Family coverage tier (metadata.familyCoverage) */}
          <div>
            <Label>Family coverage</Label>
            <Select
              value={familyCoverageSelectValue(form.metadata?.familyCoverage)}
              onValueChange={v => setMeta("familyCoverage", familyCoverageFromSelect(v))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={FAMILY_COVERAGE_NONE}>Not set</SelectItem>
                {FAMILY_COVERAGE_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Who the plan covers besides the member. Corporate plans use this tier; a corporate plan left
              "Not set" covers the employee only. Individual plans without a tier keep their member count.
            </p>
          </div>

          {/* Toggles */}
          <div className="flex gap-6">
            <div className="flex items-center gap-2">
              <Switch checked={form.isActive} onCheckedChange={v => set("isActive", v)} />
              <Label>Active</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.isFeatured} onCheckedChange={v => set("isFeatured", v)} />
              <Label>Featured</Label>
            </div>
          </div>

          {/* Features */}
          <div>
            <Label>Features (one per line)</Label>
            <Textarea
              value={(form.features ?? []).join("\n")}
              onChange={e => set("features", e.target.value ? e.target.value.split("\n").filter(Boolean) : [])}
              rows={3} placeholder="5 Teleconsults/month&#10;₹1000 Pharmacy benefit"
            />
          </div>

          {/* Coverage Details */}
          <div className="border rounded-xl overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 text-sm font-medium"
              onClick={() => setShowCoverage(v => !v)}
            >
              <span>Coverage Details</span>
              {showCoverage ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showCoverage && (
              <div className="p-3 space-y-2">
                {COVERAGE_FIELDS.map(({ key, label, Icon, type }) => {
                  const item = (cd as any)[key] ?? {};
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <Icon className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className="text-sm w-36 shrink-0 text-gray-600 dark:text-gray-300">{label}</span>
                      {type === "package" ? (
                        <Input
                          className="h-8 text-sm"
                          value={item.package ?? "None"}
                          onChange={e => setCoverage(key, "package", e.target.value)}
                          placeholder="None"
                        />
                      ) : type === "consult" ? (
                        <div className="flex items-center gap-2 flex-1">
                          <Input
                            className="h-8 text-sm w-24"
                            type="number" min={0}
                            value={item.limit ?? 0}
                            onChange={e => setCoverage(key, "limit", e.target.value === "" ? 0 : Number(e.target.value))}
                          />
                          <span className="text-xs text-gray-400">consults/mo (999=unlimited)</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-1">
                          <span className="text-sm text-gray-400">₹</span>
                          <Input
                            className="h-8 text-sm w-28"
                            type="number" min={0}
                            value={item.limitINR ?? 0}
                            onChange={e => setCoverage(key, "limitINR", e.target.value === "" ? 0 : Number(e.target.value))}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            {isEdit ? "Save Changes" : "Create Plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete confirmation ───────────────────────────────────────────────────────
function DeleteDialog({ plan, onClose, onDeleted }: { plan: Plan | null; onClose: () => void; onDeleted: () => void }) {
  const { toast } = useToast();
  const [deleting, setDeleting] = useState(false);
  const del = async () => {
    if (!plan) return;
    setDeleting(true);
    try {
      await api.delete(`/membership/admin/plans/${plan.id}`);
      toast({ title: "Plan deleted" });
      onDeleted(); onClose();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e?.response?.data?.message ?? e.message, variant: "destructive" });
    } finally { setDeleting(false); }
  };
  return (
    <Dialog open={!!plan} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="flex items-center gap-2 text-red-600"><AlertCircle className="w-5 h-5" />Delete Plan</DialogTitle></DialogHeader>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Delete <strong>{plan?.name}</strong>? This cannot be undone. Users with this plan will retain their subscription until expiry.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={deleting}>Cancel</Button>
          <Button variant="destructive" onClick={del} disabled={deleting}>
            {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Coverage summary pill ────────────────────────────────────────────────────
function CoveragePill({ plan }: { plan: Plan }) {
  const cd = plan.metadata?.coverageDetails;
  if (!cd) return <span className="text-xs text-gray-400">—</span>;
  const tele = cd.onlineConsult?.limit;
  const pharm = cd.pharmacy?.limitINR;
  return (
    <div className="flex flex-wrap gap-1">
      {tele != null && <span className="text-xs bg-sky-50 text-sky-700 border border-sky-200 px-1.5 py-0.5 rounded-full">{tele === 999 ? "∞" : tele} consults</span>}
      {pharm != null && pharm > 0 && <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full">₹{pharm} pharmacy</span>}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function TeamHealthPlans() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editPlan, setEditPlan] = useState<Plan | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deletePlan, setDeletePlan] = useState<Plan | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["team", "health-plans"],
    queryFn: async () => {
      const { data } = await api.get("/membership/admin/plans");
      return data as { plans: Plan[]; stats: { total: number; masterCount: number; customizedCount: number } };
    }
  });

  const toggleActive = useMutation({
    mutationFn: async (plan: Plan) =>
      api.put(`/membership/admin/plans/${plan.id}`, { isActive: !plan.isActive }),
    onSuccess: (_, plan) => {
      toast({ title: `${plan.name} ${plan.isActive ? "deactivated" : "activated"}` });
      qc.invalidateQueries({ queryKey: ["team", "health-plans"] });
    },
    onError: (e: any) => toast({ title: "Update failed", description: e?.response?.data?.message, variant: "destructive" })
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["team", "health-plans"] });

  const plans = (data?.plans ?? []).filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.code ?? "").toLowerCase().includes(search.toLowerCase())
  );
  const stats = data?.stats;

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto space-y-6 px-4 md:px-6 py-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Team Workspace</p>
            <h1 className="text-2xl font-bold mt-0.5">Health Plan Management</h1>
            <p className="text-sm text-muted-foreground mt-1">Create, configure, and manage all membership plans and their coverage details.</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="shrink-0">
            <Plus className="w-4 h-4 mr-2" />New Plan
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total Plans", value: stats?.total ?? "—" },
            { label: "Master Plans", value: stats?.masterCount ?? "—" },
            { label: "Customized", value: stats?.customizedCount ?? "—" },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-semibold mt-1">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Search + Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3 gap-4">
            <div>
              <CardTitle className="text-base">All Plans</CardTitle>
              <CardDescription>Click a row to edit. Toggle active status inline.</CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9 h-9" placeholder="Search plans..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : plans.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground text-sm">No plans found.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plan</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead>Pricing</TableHead>
                    <TableHead>Coverage</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plans.map(plan => {
                    const TierIcon = TIER_ICONS[plan.tier] ?? Shield;
                    const price = Number(plan.discountedPrice || plan.price || 0);
                    const original = Number(plan.price || 0);
                    return (
                      <TableRow key={plan.id} className="hover:bg-muted/40 cursor-pointer" onClick={() => setEditPlan(plan)}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{plan.name}</p>
                            {plan.code && <p className="text-xs text-muted-foreground font-mono">{plan.code}</p>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${PLAN_TYPE_BADGE[plan.planType] ?? ""}`}>
                            {plan.planType}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs gap-1 ${TIER_COLORS[plan.tier] ?? ""}`}>
                            <TierIcon className="w-3 h-3" />Tier {plan.tier}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {price === 0 ? <span className="font-medium text-emerald-600">Free</span> : (
                              <>
                                <span className="font-medium">₹{price.toLocaleString("en-IN")}</span>
                                {plan.discountedPrice && price !== original && (
                                  <span className="text-xs text-muted-foreground line-through ml-1">₹{original.toLocaleString("en-IN")}</span>
                                )}
                                <span className="text-xs text-muted-foreground block">{plan.durationMonths}mo</span>
                              </>
                            )}
                          </div>
                        </TableCell>
                        <TableCell onClick={e => e.stopPropagation()}>
                          <CoveragePill plan={plan} />
                        </TableCell>
                        <TableCell onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => toggleActive.mutate(plan)}
                            disabled={toggleActive.isPending}
                            className="flex items-center gap-1.5 focus:outline-none"
                            title={plan.isActive ? "Click to deactivate" : "Click to activate"}
                          >
                            {plan.isActive
                              ? <ToggleRight className="w-5 h-5 text-emerald-500" />
                              : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                            <span className={`text-xs font-medium ${plan.isActive ? "text-emerald-600" : "text-gray-400"}`}>
                              {plan.isActive ? "Active" : "Inactive"}
                            </span>
                          </button>
                        </TableCell>
                        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setEditPlan(plan)} title="Edit">
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600 hover:bg-red-50"
                              onClick={() => setDeletePlan(plan)} title="Delete">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Tier guide */}
        <Card className="bg-gradient-to-r from-primary/5 to-purple-500/5">
          <CardHeader><CardTitle className="text-sm">Tier Guide</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-3">
              {[
                { tier: 1, Icon: Shield, name: "Basic", desc: "Free entry-level plan, 2 consults/mo" },
                { tier: 2, Icon: Star,   name: "Silver", desc: "₹249/mo, 5 consults + pharmacy benefit" },
                { tier: 3, Icon: Crown,  name: "Gold",   desc: "₹499/mo, 10 consults + home care" },
                { tier: 4, Icon: Gem,    name: "Platinum",desc: "₹849/mo, unlimited + full coverage" },
              ].map(({ tier, Icon, name, desc }) => (
                <div key={tier} className={`rounded-xl border p-3 ${TIER_COLORS[tier]}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-4 h-4" /><span className="font-semibold text-sm">{name}</span>
                  </div>
                  <p className="text-xs opacity-75">{desc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create dialog */}
      <PlanFormDialog
        open={createOpen}
        plan={null}
        onClose={() => setCreateOpen(false)}
        onSaved={refresh}
      />

      {/* Edit dialog */}
      {editPlan && (
        <PlanFormDialog
          key={editPlan.id}
          open={!!editPlan}
          plan={editPlan}
          onClose={() => setEditPlan(null)}
          onSaved={refresh}
        />
      )}

      {/* Delete dialog */}
      <DeleteDialog
        plan={deletePlan}
        onClose={() => setDeletePlan(null)}
        onDeleted={refresh}
      />
    </MainLayout>
  );
}

export { TeamHealthPlans };
