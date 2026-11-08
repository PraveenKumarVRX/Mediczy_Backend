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
  ArrowRight, Clock, Trophy, Target, Search, Brain, Wind, Moon
} from "lucide-react";

// ── Icon map ──────────────────────────────────────────────────────────────────
type IconProps = { className?: string; style?: React.CSSProperties };
const ICON_MAP: Record<string, React.FC<IconProps>> = {
  Heart, Activity, Scale, Flower2, Leaf, Briefcase, HeartPulse, Crown, Sparkles, Trophy, Target,
  Brain, Wind, Moon,
};
// `style` is declared here because both call sites pass one to colour the icon;
// without it they were silenced only by an `as any` on the value, which does not
// make the prop exist, so tsc flagged both.
function ProgramIcon({ name, className, style }: IconProps & { name: string }) {
  const I = ICON_MAP[name] ?? Heart;
  return <I className={className} style={style} />;
}

const CATEGORY_LABELS: Record<string, string> = {
  diabetes:          "Diabetes",
  obesity:           "Weight",
  pcos:              "PCOS",
  fatty_liver:       "Liver",
  corporate_wellness:"Corporate",
  hypertension:      "Hypertension",
  executive_health:  "Executive",
  cardiac:           "Cardiac",
  mental_health:     "Mind & Mood",
};

const stagger = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.07 } } };
const fadeUp  = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.35 } } };

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

  const enrolledSlugs: string[] = (myData ?? []).map((e: any) => e.slug);

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
        {/* Page header */}
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Programs</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Health coaching &amp; disease management
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 mb-5">
          {(["my", "browse"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === tab
                  ? "bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              {tab === "my"
                ? `My Programs${(myData ?? []).length > 0 ? ` (${myData.length})` : ""}`
                : "Browse All"}
            </button>
          ))}
        </div>

        {/* ── MY PROGRAMS ────────────────────────────────────────────────── */}
        {activeTab === "my" && (
          <>
            {myLoading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <SkeletonCard key={i} />)}
              </div>
            ) : (myData ?? []).length === 0 ? (
              <EmptyState onBrowse={() => setActiveTab("browse")} />
            ) : (
              <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-3">
                {myData.map((enr: any) => (
                  <motion.div key={enr.enrollment_id} variants={fadeUp}>
                    <EnrolledCard
                      enrollment={enr}
                      onClick={() => navigate(`/programs/journey/${enr.enrollment_id}`)}
                    />
                  </motion.div>
                ))}
              </motion.div>
            )}

            {(myData ?? []).length > 0 && (
              <button
                onClick={() => setActiveTab("browse")}
                className="mt-5 w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-teal-200 dark:border-teal-800 text-teal-600 dark:text-teal-400 text-sm font-medium hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors"
              >
                <Plus className="w-4 h-4" /> Browse more programs
              </button>
            )}
          </>
        )}

        {/* ── BROWSE ─────────────────────────────────────────────────────── */}
        {activeTab === "browse" && (
          <>
            {catalogLoading ? (
              <div className="space-y-3">
                {[1,2,3,4].map(i => <SkeletonCard key={i} />)}
              </div>
            ) : (catalogData ?? []).length === 0 ? (
              <div className="text-center py-16 text-gray-500 dark:text-gray-400">
                <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No programs available</p>
              </div>
            ) : (
              <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-3">
                {(catalogData ?? []).map((prog: any) => (
                  <motion.div key={prog.id} variants={fadeUp}>
                    <CatalogCard
                      program={prog}
                      isEnrolled={enrolledSlugs.includes(prog.slug)}
                      onClick={() => navigate(`/programs/${prog.slug}`)}
                    />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
}

// ── Enrolled program card ──────────────────────────────────────────────────────
function EnrolledCard({ enrollment: e, onClick }: { enrollment: any; onClick: () => void }) {
  const startDate = new Date(e.start_date);
  const dayNum = Math.max(1, Math.floor((Date.now() - startDate.getTime()) / 86400000) + 1);
  const programPct = Math.min(100, Math.round((dayNum / e.duration_days) * 100));
  const taskPct = e.tasks_total_today > 0
    ? Math.round((e.tasks_done_today / e.tasks_total_today) * 100) : 0;
  const allDone = e.tasks_total_today > 0 && taskPct === 100;

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-all dark:border-gray-700"
      onClick={onClick}
    >
      <CardContent className="p-0">
        {/* Colour accent */}
        <div className="h-1.5 rounded-t-xl" style={{ backgroundColor: e.color_hex }} />
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: e.color_hex + "20" }}
            >
              <ProgramIcon name={e.icon_name} className="w-5 h-5" style={{ color: e.color_hex }} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-gray-900 dark:text-white text-sm">{e.name}</span>
                <Badge className="text-[10px] px-1.5 py-0 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800">
                  Active
                </Badge>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Day {dayNum} of {e.duration_days}</p>

              {/* Program progress bar */}
              <div className="mt-2.5">
                <div className="flex justify-between text-[11px] text-gray-500 dark:text-gray-400 mb-1">
                  <span>Program progress</span>
                  <span className="font-semibold text-gray-700 dark:text-gray-300">{programPct}%</span>
                </div>
                <Progress value={programPct} className="h-1.5" />
              </div>

              {/* Today's tasks */}
              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                  {allDone
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    : <Circle className="w-3.5 h-3.5 text-gray-400 dark:text-gray-600" />
                  }
                  <span>{e.tasks_done_today}/{e.tasks_total_today} tasks today</span>
                </div>
                {e.total_score != null && (
                  <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: e.color_hex }}>
                    <Trophy className="w-3 h-3" /> {Math.round(e.total_score)}
                  </span>
                )}
              </div>
            </div>

            <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-600 flex-shrink-0 mt-1" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Catalog program card ──────────────────────────────────────────────────────
function CatalogCard({ program: p, isEnrolled, onClick }: {
  program: any; isEnrolled: boolean; onClick: () => void;
}) {
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-all dark:border-gray-700"
      onClick={onClick}
    >
      <CardContent className="p-0">
        <div className="h-1 rounded-t-xl" style={{ backgroundColor: p.color_hex }} />
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: p.color_hex + "18" }}
            >
              <ProgramIcon name={p.icon_name} className="w-6 h-6" style={{ color: p.color_hex }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-gray-900 dark:text-white">{p.name}</span>
                {isEnrolled && (
                  <Badge className="text-[10px] px-1.5 py-0 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-800">
                    Enrolled
                  </Badge>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                {p.short_tagline}
              </p>
              <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400 flex-wrap">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {p.duration_days} days
                </span>
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" /> {p.enrolled_count ?? 0} enrolled
                </span>
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                  style={{ backgroundColor: p.color_hex + "18", color: p.color_hex }}
                >
                  {CATEGORY_LABELS[p.category] ?? p.category}
                </span>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-400 dark:text-gray-600 flex-shrink-0 mt-1" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ onBrowse }: { onBrowse: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center mb-4">
        <Target className="w-8 h-8 text-teal-500" />
      </div>
      <h3 className="font-semibold text-gray-900 dark:text-white text-lg">No programs yet</h3>
      <p className="text-gray-500 dark:text-gray-400 text-sm mt-1 max-w-xs">
        Join a health coaching program to get daily tasks, tracking, and personalised guidance.
      </p>
      <Button onClick={onBrowse} className="mt-5 bg-teal-600 hover:bg-teal-700 text-white">
        Browse Programs
      </Button>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 animate-pulse border border-gray-100 dark:border-gray-700">
      <div className="flex gap-3">
        <div className="w-11 h-11 bg-gray-100 dark:bg-gray-700 rounded-xl flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-100 dark:bg-gray-700 rounded w-2/3" />
          <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-1/2" />
          <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded w-full mt-3" />
        </div>
      </div>
    </div>
  );
}
