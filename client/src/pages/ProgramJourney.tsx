import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import api from "@/utils/api";
import {
  Heart, Activity, Scale, Flower2, Leaf, Briefcase, HeartPulse, Crown,
  CheckCircle2, Circle, ChevronLeft, Trophy, Droplets, Footprints,
  Droplet, Moon, Pill, TrendingUp, Wifi, WifiOff, Target, BookOpen,
  Sparkles, Bluetooth
} from "lucide-react";

// ── Maps ──────────────────────────────────────────────────────────────────────
const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  Heart, Activity, Scale, Flower2, Leaf, Briefcase,
  HeartPulse, Crown, Sparkles, Target,
};
function ProgramIcon({ name, className }: { name: string; className?: string }) {
  const I = ICON_MAP[name] ?? Heart;
  return <I className={className} />;
}

const TASK_ICONS: Record<string, React.FC<{ className?: string }>> = {
  log_sugar: Droplets, walk: Footprints, water: Droplet, sleep: Moon,
  medication: Pill, log_weight: Scale, diet: Leaf, exercise: Activity,
  log_bp: HeartPulse,
};
function TaskIcon({ type, className }: { type: string; className?: string }) {
  const I = TASK_ICONS[type] ?? CheckCircle2;
  return <I className={className} />;
}

const STAGE_META: Record<number, { label: string; desc: string }> = {
  1: { label: "Assessment",        desc: "Understand your baseline" },
  2: { label: "Personalised Plan", desc: "Your daily action plan" },
  3: { label: "Tracking",          desc: "Log your daily metrics" },
  4: { label: "Coaching",          desc: "Connect with your coach" },
  5: { label: "Outcomes",          desc: "Review your progress" },
};

const DEVICE_ICONS: Record<string, React.FC<{ className?: string }>> = {
  cgm: Droplets, bp_monitor: HeartPulse, smart_watch: Activity,
  smart_ring: Bluetooth, weighing_scale: Scale,
};

export default function ProgramJourney() {
  const { enrollmentId } = useParams<{ enrollmentId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc       = useQueryClient();
  const [activeSection, setActiveSection] = useState<"today" | "progress" | "content">("today");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["journey", enrollmentId],
    queryFn: () => api.get(`/programs/enrollment/${enrollmentId}`).then(r => r.data.data),
    refetchOnWindowFocus: true,
  });

  const completeMutation = useMutation({
    mutationFn: ({ taskId, completed, value }: { taskId: number; completed: boolean; value?: number }) =>
      api.patch(`/programs/tasks/${taskId}/complete`, { enrollment_id: Number(enrollmentId), completed, value }),
    onSuccess: () => refetch(),
    onError: () => toast({ title: "Failed to update task", variant: "destructive" }),
  });

  if (isLoading) return <MainLayout><JourneySkeleton /></MainLayout>;
  if (!data)    return <MainLayout><p className="p-4 text-slate-500">Enrollment not found.</p></MainLayout>;

  const {
    enrollment: enr, day, progress_pct, current_stage,
    today_tasks, scores, devices, content
  } = data;

  const color = enr.color_hex ?? "#6366f1";
  const tasksCompleted = today_tasks.filter((t: any) => t.completed).length;
  const tasksPct = today_tasks.length > 0 ? Math.round((tasksCompleted / today_tasks.length) * 100) : 0;
  const latestScore = scores?.[0]?.total_score ?? null;
  const baselineScore = scores?.find((s: any) => s.is_baseline)?.total_score ?? null;
  const improvement = latestScore != null && baselineScore != null
    ? Math.round(latestScore - baselineScore) : null;

  return (
    <MainLayout>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 pb-24">
        {/* Header */}
        <div
          className="relative text-white px-4 pt-5 pb-8"
          style={{ background: `linear-gradient(135deg, ${color}ee, ${color}99)` }}
        >
          <button
            onClick={() => navigate("/my-programs")}
            className="flex items-center gap-1 text-white/80 hover:text-white text-sm mb-3"
          >
            <ChevronLeft className="w-4 h-4" /> My Programs
          </button>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
              <ProgramIcon name={enr.icon_name} className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">{enr.program_name}</h1>
              <p className="text-white/70 text-xs">Day {day} of {enr.duration_days}</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-white/80">
              <span>Program progress</span>
              <span className="font-semibold">{progress_pct}%</span>
            </div>
            <div className="h-2 bg-white/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-700"
                style={{ width: `${progress_pct}%` }}
              />
            </div>
          </div>

          {/* Stage chips */}
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {[1,2,3,4,5].map(s => (
              <span
                key={s}
                className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${
                  s === current_stage
                    ? "bg-white text-slate-700 font-bold shadow"
                    : s < current_stage
                    ? "bg-white/30 text-white"
                    : "bg-white/15 text-white/60"
                }`}
              >
                {STAGE_META[s]?.label}
              </span>
            ))}
          </div>
        </div>

        {/* Score strip */}
        <div className="max-w-2xl mx-auto px-4 -mt-3">
          <div className="bg-white rounded-2xl shadow-md p-4 flex items-center justify-between gap-4">
            <ScoreChip
              label="Health Score"
              value={latestScore != null ? `${Math.round(latestScore)}` : "—"}
              sub="out of 100"
              color={color}
              icon={<Trophy className="w-4 h-4" />}
            />
            <div className="w-px h-10 bg-slate-100" />
            <ScoreChip
              label="Today's Tasks"
              value={`${tasksCompleted}/${today_tasks.length}`}
              sub={tasksPct === 100 ? "All done! 🎉" : `${tasksPct}% complete`}
              color={tasksPct === 100 ? "#22c55e" : color}
              icon={<CheckCircle2 className="w-4 h-4" />}
            />
            {improvement != null && (
              <>
                <div className="w-px h-10 bg-slate-100" />
                <ScoreChip
                  label="Improvement"
                  value={`${improvement > 0 ? "+" : ""}${improvement}`}
                  sub="since baseline"
                  color={improvement >= 0 ? "#22c55e" : "#ef4444"}
                  icon={<TrendingUp className="w-4 h-4" />}
                />
              </>
            )}
          </div>
        </div>

        {/* Section tabs */}
        <div className="max-w-2xl mx-auto px-4 mt-4">
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            {(["today", "progress", "content"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveSection(tab)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeSection === tab
                    ? "bg-white shadow text-slate-800"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {tab === "today" ? "Today" : tab === "progress" ? "Progress" : "Learn"}
              </button>
            ))}
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 mt-4 space-y-4">
          {/* ── TODAY'S TASKS ──────────────────────────────────────────── */}
          <AnimatePresence mode="wait">
            {activeSection === "today" && (
              <motion.div
                key="today"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-3"
              >
                <SectionHeader color={color} title="Today's Tasks" subtitle={new Date().toLocaleDateString("en-IN", { weekday:"long", day:"numeric", month:"long" })} />
                {today_tasks.length === 0 ? (
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-6 text-center text-slate-500 text-sm">
                      No tasks scheduled for today.
                    </CardContent>
                  </Card>
                ) : (
                  today_tasks.map((task: any) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      color={color}
                      onToggle={(completed) =>
                        completeMutation.mutate({ taskId: task.id, completed })
                      }
                    />
                  ))
                )}

                {/* Personalised plan */}
                {enr.personalized_plan?.text && (
                  <Card className="border-0 shadow-sm border-l-4 overflow-hidden" style={{ borderLeftColor: color }}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="w-4 h-4" style={{ color }} />
                        <span className="text-sm font-semibold text-slate-700">Your Personalised Plan</span>
                      </div>
                      <p className="text-sm text-slate-600 leading-relaxed">{enr.personalized_plan.text}</p>
                    </CardContent>
                  </Card>
                )}

                {/* Connected devices */}
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-semibold text-slate-700">Connected Devices</span>
                      <button className="text-xs text-indigo-600 font-medium">+ Add device</button>
                    </div>
                    {devices.length === 0 ? (
                      <div className="text-xs text-slate-400 flex items-center gap-2">
                        <WifiOff className="w-4 h-4" /> No devices connected
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {devices.map((d: any) => {
                          const DI = DEVICE_ICONS[d.device_type] ?? Wifi;
                          return (
                            <div key={d.id} className="flex items-center gap-2 text-sm">
                              <DI className="w-4 h-4 text-emerald-500" />
                              <span className="text-slate-700">{d.device_name ?? d.device_type.replace(/_/g," ")}</span>
                              <Badge className="ml-auto text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                                Connected
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* ── PROGRESS ───────────────────────────────────────────────── */}
            {activeSection === "progress" && (
              <motion.div
                key="progress"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-3"
              >
                <SectionHeader color={color} title="Health Progress" subtitle="Your score over time" />
                {scores.length === 0 ? (
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-6 text-center text-slate-500 text-sm">
                      No scores recorded yet. Complete your tasks to generate your first score.
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    {/* Big score */}
                    <Card className="border-0 shadow-sm overflow-hidden">
                      <div className="h-2" style={{ backgroundColor: color }} />
                      <CardContent className="p-5 text-center">
                        <div
                          className="text-5xl font-black mb-1"
                          style={{ color }}
                        >
                          {Math.round(scores[0].total_score)}
                        </div>
                        <div className="text-slate-500 text-sm">out of 100</div>
                        <div className="mt-3">
                          <Progress value={scores[0].total_score} className="h-3 rounded-full" />
                        </div>
                      </CardContent>
                    </Card>

                    {/* Component breakdown */}
                    {scores[0].component_scores && Object.keys(scores[0].component_scores).length > 0 && (
                      <Card className="border-0 shadow-sm">
                        <CardContent className="p-4">
                          <h3 className="text-sm font-semibold text-slate-700 mb-3">Score breakdown</h3>
                          <div className="space-y-2.5">
                            {Object.entries(scores[0].component_scores).map(([key, val]: [string, any]) => (
                              <div key={key}>
                                <div className="flex justify-between text-xs text-slate-600 mb-1">
                                  <span className="capitalize">{key.replace(/_/g," ")}</span>
                                  <span className="font-semibold">{Math.round(val)}</span>
                                </div>
                                <Progress value={val} className="h-1.5" />
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Score history */}
                    <Card className="border-0 shadow-sm">
                      <CardContent className="p-4">
                        <h3 className="text-sm font-semibold text-slate-700 mb-3">Score history</h3>
                        <div className="space-y-2">
                          {scores.map((s: any) => (
                            <div key={s.id} className="flex items-center justify-between text-sm">
                              <span className="text-slate-500 text-xs">
                                {new Date(s.score_date).toLocaleDateString("en-IN", { day:"numeric", month:"short" })}
                                {s.is_baseline && <span className="ml-1 text-indigo-500 text-[10px]">(baseline)</span>}
                              </span>
                              <div className="flex items-center gap-2">
                                <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${s.total_score}%`, backgroundColor: color }} />
                                </div>
                                <span className="text-xs font-semibold text-slate-700 w-8 text-right">
                                  {Math.round(s.total_score)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </>
                )}
              </motion.div>
            )}

            {/* ── LEARN / CONTENT ────────────────────────────────────────── */}
            {activeSection === "content" && (
              <motion.div
                key="content"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-3"
              >
                <SectionHeader color={color} title="Educational Content" subtitle="Stage-relevant articles & videos" />
                {content.length === 0 ? (
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-6 text-center text-slate-500 text-sm">
                      Content will unlock as you progress through stages.
                    </CardContent>
                  </Card>
                ) : (
                  content.map((c: any) => <ContentCard key={c.id} item={c} color={color} />)
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </MainLayout>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ScoreChip({ label, value, sub, color, icon }: {
  label: string; value: string; sub: string; color: string; icon: React.ReactNode
}) {
  return (
    <div className="flex-1 text-center">
      <div className="flex items-center justify-center gap-1 mb-0.5" style={{ color }}>
        {icon}
        <span className="text-xs font-medium text-slate-500">{label}</span>
      </div>
      <div className="text-xl font-black text-slate-800">{value}</div>
      <div className="text-[10px] text-slate-400">{sub}</div>
    </div>
  );
}

function SectionHeader({ title, subtitle, color }: { title: string; subtitle: string; color: string }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <div className="w-1 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <div>
        <h2 className="text-sm font-bold text-slate-800">{title}</h2>
        <p className="text-xs text-slate-400">{subtitle}</p>
      </div>
    </div>
  );
}

function TaskCard({ task: t, color, onToggle }: { task: any; color: string; onToggle: (c: boolean) => void }) {
  return (
    <motion.div whileTap={{ scale: 0.98 }}>
      <Card
        className={`border-0 shadow-sm cursor-pointer transition-all ${t.completed ? "opacity-80" : ""}`}
        onClick={() => onToggle(!t.completed)}
      >
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
              t.completed ? "bg-emerald-500" : "bg-slate-100"
            }`}>
              {t.completed
                ? <CheckCircle2 className="w-4 h-4 text-white" />
                : <TaskIcon type={t.task_type} className="w-4 h-4 text-slate-400" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium leading-tight ${t.completed ? "line-through text-slate-400" : "text-slate-700"}`}>
                {t.title}
              </p>
              {t.target_value && (
                <p className="text-xs text-slate-400 mt-0.5">
                  Target: {t.target_value} {t.unit}
                </p>
              )}
            </div>
            {t.completed && t.completed_at && (
              <span className="text-[10px] text-emerald-500 font-medium flex-shrink-0">Done</span>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function ContentCard({ item: c, color }: { item: any; color: string }) {
  return (
    <Card className="border-0 shadow-sm overflow-hidden">
      <CardContent className="p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: color + "18" }}>
          <BookOpen className="w-5 h-5" style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-700 leading-tight">{c.title}</span>
            <Badge className="text-[10px] capitalize bg-slate-100 text-slate-600 border-slate-200">
              {c.content_type}
            </Badge>
          </div>
          {c.duration_mins && (
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
              <Clock className="w-3 h-3" /> {c.duration_mins} min read
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function JourneySkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-4">
      <div className="h-44 bg-slate-100 rounded-xl" />
      <div className="h-24 bg-slate-100 rounded-xl" />
      <div className="h-16 bg-slate-100 rounded-xl" />
      <div className="h-16 bg-slate-100 rounded-xl" />
      <div className="h-16 bg-slate-100 rounded-xl" />
    </div>
  );
}
