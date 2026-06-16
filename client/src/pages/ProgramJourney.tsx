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
  Droplet, Moon, Pill, TrendingUp, WifiOff, Target, BookOpen,
  Sparkles, Bluetooth, Clock
} from "lucide-react";

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  Heart, Activity, Scale, Flower2, Leaf, Briefcase, HeartPulse, Crown, Sparkles, Target,
};
function ProgramIcon({ name, className }: { name: string; className?: string }) {
  const I = ICON_MAP[name] ?? Heart;
  return <I className={className} />;
}

const TASK_ICONS: Record<string, React.FC<{ className?: string }>> = {
  log_sugar: Droplets, walk: Footprints, water: Droplet, sleep: Moon,
  medication: Pill, log_weight: Scale, diet: Leaf, exercise: Activity, log_bp: HeartPulse,
};
function TaskIcon({ type, className }: { type: string; className?: string }) {
  const I = TASK_ICONS[type] ?? CheckCircle2;
  return <I className={className} />;
}

const DEVICE_ICONS: Record<string, React.FC<{ className?: string }>> = {
  cgm: Droplets, bp_monitor: HeartPulse, smart_watch: Activity,
  smart_ring: Bluetooth, weighing_scale: Scale,
};

const STAGE_LABELS: Record<number, string> = {
  1: "Assessment", 2: "Plan", 3: "Tracking", 4: "Coaching", 5: "Outcomes",
};

export default function ProgramJourney() {
  const { enrollmentId } = useParams<{ enrollmentId: string }>();
  const navigate  = useNavigate();
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState<"today" | "progress" | "content">("today");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["journey", enrollmentId],
    queryFn: () => api.get(`/programs/enrollment/${enrollmentId}`).then(r => r.data.data),
    refetchOnWindowFocus: true,
  });

  const completeMutation = useMutation({
    mutationFn: ({ taskId, completed }: { taskId: number; completed: boolean }) =>
      api.patch(`/programs/tasks/${taskId}/complete`, {
        enrollment_id: Number(enrollmentId), completed,
      }),
    onSuccess: () => refetch(),
    onError: () => toast({ title: "Failed to update task", variant: "destructive" }),
  });

  if (isLoading) return <MainLayout><JourneySkeleton /></MainLayout>;
  if (!data) return (
    <MainLayout>
      <div className="p-6 text-gray-500 dark:text-gray-400">Enrollment not found.</div>
    </MainLayout>
  );

  const { enrollment: enr, day, progress_pct, current_stage,
          today_tasks, scores, devices, content } = data;

  const color = enr.color_hex ?? "#0d9488";
  const tasksCompleted = today_tasks.filter((t: any) => t.completed).length;
  const tasksPct = today_tasks.length > 0 ? Math.round((tasksCompleted / today_tasks.length) * 100) : 0;
  const latestScore = scores?.[0]?.total_score ?? null;
  const baselineScore = scores?.find((s: any) => s.is_baseline)?.total_score ?? null;
  const improvement = latestScore != null && baselineScore != null
    ? Math.round(latestScore - baselineScore) : null;

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto pb-24">
        {/* Hero */}
        <div
          className="px-4 pt-5 pb-8"
          style={{ background: `linear-gradient(135deg, ${color}ee, ${color}88)` }}
        >
          <button
            onClick={() => navigate("/my-programs")}
            className="flex items-center gap-1 text-white/80 hover:text-white text-sm mb-3 font-medium"
          >
            <ChevronLeft className="w-4 h-4" /> My Programs
          </button>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
              <ProgramIcon name={enr.icon_name} className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-white leading-tight">{enr.program_name}</h1>
              <p className="text-white/70 text-xs">Day {day} of {enr.duration_days}</p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-white/80">
              <span>Program progress</span>
              <span className="font-semibold">{progress_pct}%</span>
            </div>
            <div className="h-2 bg-white/25 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-700"
                style={{ width: `${progress_pct}%` }}
              />
            </div>
          </div>
          {/* Stage chips */}
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {[1,2,3,4,5].map(s => (
              <span
                key={s}
                className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[10px] font-medium ${
                  s === current_stage
                    ? "bg-white text-gray-800 font-bold shadow"
                    : s < current_stage
                    ? "bg-white/30 text-white"
                    : "bg-white/15 text-white/60"
                }`}
              >
                {STAGE_LABELS[s]}
              </span>
            ))}
          </div>
        </div>

        <div className="px-4 -mt-3 space-y-4">
          {/* Score strip */}
          <Card className="dark:border-gray-700 shadow-md">
            <CardContent className="p-4">
              <div className="flex items-center justify-around">
                <ScoreChip
                  label="Health Score"
                  value={latestScore != null ? `${Math.round(latestScore)}` : "—"}
                  sub="out of 100"
                  color={color}
                  icon={<Trophy className="w-3.5 h-3.5" />}
                />
                <div className="w-px h-10 bg-gray-100 dark:bg-gray-700" />
                <ScoreChip
                  label="Today's Tasks"
                  value={`${tasksCompleted}/${today_tasks.length}`}
                  sub={tasksPct === 100 ? "All done! 🎉" : `${tasksPct}% done`}
                  color={tasksPct === 100 ? "#22c55e" : color}
                  icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                />
                {improvement != null && (
                  <>
                    <div className="w-px h-10 bg-gray-100 dark:bg-gray-700" />
                    <ScoreChip
                      label="Improvement"
                      value={`${improvement >= 0 ? "+" : ""}${improvement}`}
                      sub="vs baseline"
                      color={improvement >= 0 ? "#22c55e" : "#ef4444"}
                      icon={<TrendingUp className="w-3.5 h-3.5" />}
                    />
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Section tabs */}
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
            {(["today", "progress", "content"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveSection(tab)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeSection === tab
                    ? "bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                }`}
              >
                {tab === "today" ? "Today" : tab === "progress" ? "Progress" : "Learn"}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {/* ── TODAY ──────────────────────────────────────────────────── */}
            {activeSection === "today" && (
              <motion.div key="today" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
                <SectionLabel
                  title="Today's Tasks"
                  sub={new Date().toLocaleDateString("en-IN", { weekday:"long", day:"numeric", month:"long" })}
                  color={color}
                />
                {today_tasks.length === 0 ? (
                  <Card className="dark:border-gray-700">
                    <CardContent className="p-6 text-center text-gray-500 dark:text-gray-400 text-sm">
                      No tasks scheduled for today.
                    </CardContent>
                  </Card>
                ) : (
                  today_tasks.map((task: any) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      color={color}
                      onToggle={(c) => completeMutation.mutate({ taskId: task.id, completed: c })}
                    />
                  ))
                )}

                {/* Personalised plan */}
                {enr.personalized_plan?.text && (
                  <Card className="dark:border-gray-700 overflow-hidden border-l-4" style={{ borderLeftColor: color }}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="w-4 h-4" style={{ color }} />
                        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                          Your Personalised Plan
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                        {enr.personalized_plan.text}
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Devices */}
                <Card className="dark:border-gray-700">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                        Connected Devices
                      </span>
                      <button className="text-xs text-teal-600 dark:text-teal-400 font-medium">
                        + Add device
                      </button>
                    </div>
                    {devices.length === 0 ? (
                      <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-600">
                        <WifiOff className="w-4 h-4" /> No devices connected yet
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {devices.map((d: any) => {
                          const DI = DEVICE_ICONS[d.device_type] ?? Activity;
                          return (
                            <div key={d.id} className="flex items-center gap-2 text-sm">
                              <DI className="w-4 h-4 text-emerald-500" />
                              <span className="text-gray-700 dark:text-gray-300">
                                {d.device_name ?? d.device_type.replace(/_/g," ")}
                              </span>
                              <Badge className="ml-auto text-[10px] bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800">
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

            {/* ── PROGRESS ──────────────────────────────────────────────── */}
            {activeSection === "progress" && (
              <motion.div key="progress" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
                <SectionLabel title="Health Progress" sub="Your score over time" color={color} />
                {scores.length === 0 ? (
                  <Card className="dark:border-gray-700">
                    <CardContent className="p-6 text-center text-gray-500 dark:text-gray-400 text-sm">
                      Complete daily tasks to generate your first health score.
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    <Card className="dark:border-gray-700 overflow-hidden">
                      <div className="h-1.5" style={{ backgroundColor: color }} />
                      <CardContent className="p-5 text-center">
                        <div className="text-5xl font-black mb-1" style={{ color }}>
                          {Math.round(scores[0].total_score)}
                        </div>
                        <div className="text-gray-500 dark:text-gray-400 text-sm">out of 100</div>
                        <div className="mt-3">
                          <Progress value={scores[0].total_score} className="h-3 rounded-full" />
                        </div>
                      </CardContent>
                    </Card>

                    {scores[0].component_scores && Object.keys(scores[0].component_scores).length > 0 && (
                      <Card className="dark:border-gray-700">
                        <CardContent className="p-4">
                          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Score breakdown</h3>
                          <div className="space-y-2.5">
                            {Object.entries(scores[0].component_scores).map(([key, val]: [string, any]) => (
                              <div key={key}>
                                <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                                  <span className="capitalize">{key.replace(/_/g," ")}</span>
                                  <span className="font-semibold text-gray-800 dark:text-gray-200">{Math.round(val)}</span>
                                </div>
                                <Progress value={val} className="h-1.5" />
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    <Card className="dark:border-gray-700">
                      <CardContent className="p-4">
                        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Score history</h3>
                        <div className="space-y-2">
                          {scores.map((s: any) => (
                            <div key={s.id} className="flex items-center gap-3 text-sm">
                              <span className="text-gray-500 dark:text-gray-400 text-xs w-20 flex-shrink-0">
                                {new Date(s.score_date).toLocaleDateString("en-IN", { day:"numeric", month:"short" })}
                                {s.is_baseline && <span className="ml-1 text-teal-500 text-[10px]">(base)</span>}
                              </span>
                              <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width:`${s.total_score}%`, backgroundColor:color }} />
                              </div>
                              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 w-8 text-right">
                                {Math.round(s.total_score)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </>
                )}
              </motion.div>
            )}

            {/* ── CONTENT ───────────────────────────────────────────────── */}
            {activeSection === "content" && (
              <motion.div key="content" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
                <SectionLabel title="Educational Content" sub="Stage-relevant articles & videos" color={color} />
                {content.length === 0 ? (
                  <Card className="dark:border-gray-700">
                    <CardContent className="p-6 text-center text-gray-500 dark:text-gray-400 text-sm">
                      Content will unlock as you progress.
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
  label: string; value: string; sub: string; color: string; icon: React.ReactNode;
}) {
  return (
    <div className="text-center flex-1">
      <div className="flex items-center justify-center gap-1 mb-0.5" style={{ color }}>
        {icon}
        <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">{label}</span>
      </div>
      <div className="text-xl font-black text-gray-900 dark:text-white">{value}</div>
      <div className="text-[10px] text-gray-400 dark:text-gray-600">{sub}</div>
    </div>
  );
}

function SectionLabel({ title, sub, color }: { title: string; sub: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-1 h-5 rounded-full" style={{ backgroundColor: color }} />
      <div>
        <h2 className="text-sm font-bold text-gray-900 dark:text-white">{title}</h2>
        <p className="text-xs text-gray-400 dark:text-gray-600">{sub}</p>
      </div>
    </div>
  );
}

function TaskCard({ task: t, color, onToggle }: { task: any; color: string; onToggle: (c: boolean) => void }) {
  return (
    <motion.div whileTap={{ scale: 0.98 }}>
      <Card
        className="cursor-pointer hover:shadow-sm transition-all dark:border-gray-700"
        onClick={() => onToggle(!t.completed)}
      >
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
              t.completed ? "bg-emerald-500" : "bg-gray-100 dark:bg-gray-700"
            }`}>
              {t.completed
                ? <CheckCircle2 className="w-4 h-4 text-white" />
                : <TaskIcon type={t.task_type} className="w-4 h-4 text-gray-400 dark:text-gray-500" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium leading-tight ${
                t.completed
                  ? "line-through text-gray-400 dark:text-gray-600"
                  : "text-gray-800 dark:text-gray-200"
              }`}>
                {t.title}
              </p>
              {t.target_value && !t.completed && (
                <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">
                  Target: {t.target_value} {t.unit}
                </p>
              )}
            </div>
            {t.completed && (
              <span className="text-[10px] text-emerald-500 font-semibold flex-shrink-0">Done ✓</span>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function ContentCard({ item: c, color }: { item: any; color: string }) {
  return (
    <Card className="dark:border-gray-700">
      <CardContent className="p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: color + "18" }}>
          <BookOpen className="w-5 h-5" style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{c.title}</span>
            <Badge className="text-[10px] capitalize bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700">
              {c.content_type}
            </Badge>
          </div>
          {c.duration_mins && (
            <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5 flex items-center gap-1">
              <Clock className="w-3 h-3" /> {c.duration_mins} min
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function JourneySkeleton() {
  return (
    <div className="animate-pulse max-w-2xl mx-auto p-4 space-y-4">
      <div className="h-44 bg-gray-100 dark:bg-gray-800 rounded-xl" />
      <div className="h-24 bg-gray-100 dark:bg-gray-800 rounded-xl" />
      {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-xl" />)}
    </div>
  );
}
