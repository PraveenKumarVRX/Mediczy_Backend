import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import api from "@/utils/api";
import {
  Heart, Activity, Scale, Flower2, Leaf, Briefcase, HeartPulse, Crown,
  ChevronRight, Plus, CheckCircle2, Circle, Sparkles, Users,
  ArrowRight, Clock, Trophy
} from "lucide-react";

// ── Icon map (matches DB icon_name values) ───────────────────────────────────
const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  Heart, Activity, Scale, Flower2, Leaf, Briefcase,
  HeartPulse, Crown, Sparkles, Trophy,
};
function ProgramIcon({ name, className }: { name: string; className?: string }) {
  const I = ICON_MAP[name] ?? Heart;
  return <I className={className} />;
}

// ── Category badge colour ─────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  diabetes:          "bg-red-100 text-red-700",
  obesity:           "bg-orange-100 text-orange-700",
  pcos:              "bg-purple-100 text-purple-700",
  fatty_liver:       "bg-green-100 text-green-700",
  corporate_wellness:"bg-blue-100 text-blue-700",
  hypertension:      "bg-indigo-100 text-indigo-700",
  executive_health:  "bg-amber-100 text-amber-700",
  cardiac:           "bg-rose-100 text-rose-700",
};

// ── Stagger animation ─────────────────────────────────────────────────────────
const stagger  = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.07 } } };
const fadeUp   = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

export default function MyPrograms() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"my" | "browse">("my");

  const { data: myData, isLoading: myLoading } = useQuery({
    queryKey: ["my-programs"],
    queryFn: () => api.get("/programs/my").then(r => r.data.data),
  });

  const { data: catalogData, isLoading: catalogLoading } = useQuery({
    queryKey: ["program-catalog"],
    queryFn: () => api.get("/programs").then(r => r.data.data),
    enabled: activeTab === "browse",
  });

  const enrolled: string[] = (myData ?? []).map((e: any) => e.slug);

  return (
    <MainLayout>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 pb-20">
        {/* Header */}
        <div className="bg-white border-b sticky top-0 z-10 shadow-sm">
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-800">My Programs</h1>
              <p className="text-xs text-slate-500 mt-0.5">Health coaching & disease management</p>
            </div>
            <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 text-xs">
              {(myData ?? []).length} active
            </Badge>
          </div>
          {/* Tabs */}
          <div className="max-w-2xl mx-auto px-4 pb-0 flex gap-4">
            {(["my", "browse"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
                  activeTab === tab
                    ? "border-indigo-600 text-indigo-700"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {tab === "my" ? "My Programs" : "Browse All"}
              </button>
            ))}
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 pt-5">
          {/* ── MY PROGRAMS TAB ─────────────────────────────────────────── */}
          {activeTab === "my" && (
            <>
              {myLoading ? (
                <div className="space-y-3 mt-2">
                  {[1,2,3].map(i => <SkeletonCard key={i} />)}
                </div>
              ) : (myData ?? []).length === 0 ? (
                <EmptyState onBrowse={() => setActiveTab("browse")} />
              ) : (
                <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-4">
                  {myData.map((enr: any) => (
                    <motion.div key={enr.enrollment_id} variants={fadeUp}>
                      <EnrolledProgramCard
                        enrollment={enr}
                        onClick={() => navigate(`/programs/journey/${enr.enrollment_id}`)}
                      />
                    </motion.div>
                  ))}
                </motion.div>
              )}

              {/* Browse more CTA */}
              {(myData ?? []).length > 0 && (
                <button
                  onClick={() => setActiveTab("browse")}
                  className="mt-6 w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-indigo-200 text-indigo-600 text-sm font-medium hover:bg-indigo-50 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Browse more programs
                </button>
              )}
            </>
          )}

          {/* ── BROWSE TAB ──────────────────────────────────────────────── */}
          {activeTab === "browse" && (
            <>
              {catalogLoading ? (
                <div className="space-y-3 mt-2">
                  {[1,2,3,4].map(i => <SkeletonCard key={i} />)}
                </div>
              ) : (
                <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-4">
                  {(catalogData ?? []).map((prog: any) => (
                    <motion.div key={prog.id} variants={fadeUp}>
                      <CatalogProgramCard
                        program={prog}
                        isEnrolled={enrolled.includes(prog.slug)}
                        onClick={() => navigate(`/programs/${prog.slug}`)}
                      />
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </>
          )}
        </div>
      </div>
    </MainLayout>
  );
}

// ── Enrolled program card ──────────────────────────────────────────────────────
function EnrolledProgramCard({ enrollment: e, onClick }: { enrollment: any; onClick: () => void }) {
  const pct = e.tasks_total_today > 0
    ? Math.round((e.tasks_done_today / e.tasks_total_today) * 100)
    : 0;
  const startDate = new Date(e.start_date);
  const dayNum = Math.max(1, Math.floor((Date.now() - startDate.getTime()) / 86400000) + 1);
  const programPct = Math.min(100, Math.round((dayNum / e.duration_days) * 100));

  return (
    <Card
      className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow border-0 shadow-sm"
      onClick={onClick}
    >
      {/* Color accent bar */}
      <div className="h-1.5" style={{ backgroundColor: e.color_hex }} />
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: e.color_hex + "22" }}
          >
            <ProgramIcon name={e.icon_name} className="w-5 h-5" style={{ color: e.color_hex } as any} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-800 text-sm leading-tight">{e.name}</span>
              <Badge className="text-[10px] px-1.5 py-0 bg-emerald-50 text-emerald-700 border-emerald-200">
                Active
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">Day {dayNum} of {e.duration_days}</p>

            {/* Program progress */}
            <div className="mt-2.5">
              <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                <span>Program progress</span>
                <span className="font-medium text-slate-700">{programPct}%</span>
              </div>
              <Progress value={programPct} className="h-1.5" />
            </div>

            {/* Today's tasks */}
            <div className="mt-2.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                {pct === 100 ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Circle className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span>
                  {e.tasks_done_today}/{e.tasks_total_today} tasks today
                </span>
              </div>
              {e.total_score != null && (
                <div className="flex items-center gap-1 text-xs font-medium" style={{ color: e.color_hex }}>
                  <Trophy className="w-3 h-3" />
                  <span>Score {Math.round(e.total_score)}</span>
                </div>
              )}
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0 mt-1" />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Catalog program card ──────────────────────────────────────────────────────
function CatalogProgramCard({
  program: p, isEnrolled, onClick
}: { program: any; isEnrolled: boolean; onClick: () => void }) {
  return (
    <Card
      className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow border-0 shadow-sm"
      onClick={onClick}
    >
      <div className="h-1" style={{ backgroundColor: p.color_hex }} />
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: p.color_hex + "18" }}
          >
            <ProgramIcon name={p.icon_name} className="w-6 h-6" style={{ color: p.color_hex } as any} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-800">{p.name}</span>
              {isEnrolled && (
                <Badge className="text-[10px] px-1.5 py-0 bg-emerald-50 text-emerald-700 border-emerald-200">
                  Enrolled
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{p.short_tagline}</p>
            <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" /> {p.duration_days} days
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" /> {p.enrolled_count ?? 0} enrolled
              </span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${CATEGORY_COLORS[p.category] ?? "bg-slate-100 text-slate-600"}`}>
                {p.category.replace(/_/g, " ")}
              </span>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 flex-shrink-0 mt-1" />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ onBrowse }: { onBrowse: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
        <Heart className="w-8 h-8 text-indigo-400" />
      </div>
      <h3 className="font-semibold text-slate-700 text-lg">No programs yet</h3>
      <p className="text-slate-500 text-sm mt-1 max-w-xs">
        Join a health coaching program to get daily tasks, tracking, and personalised guidance.
      </p>
      <Button onClick={onBrowse} className="mt-5 bg-indigo-600 hover:bg-indigo-700">
        Browse Programs
      </Button>
    </div>
  );
}

// ── Skeleton card ─────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl p-4 animate-pulse shadow-sm">
      <div className="flex gap-3">
        <div className="w-11 h-11 bg-slate-100 rounded-xl flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-slate-100 rounded w-2/3" />
          <div className="h-3 bg-slate-100 rounded w-1/2" />
          <div className="h-2 bg-slate-100 rounded w-full mt-3" />
        </div>
      </div>
    </div>
  );
}
