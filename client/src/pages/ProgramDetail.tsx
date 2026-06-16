import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import api from "@/utils/api";
import {
  Heart, Activity, Scale, Flower2, Leaf, Briefcase, HeartPulse, Crown,
  CheckCircle2, Clock, Users, ChevronLeft, Droplets, Footprints,
  Droplet, Moon, Pill, Sparkles, ArrowRight, Target
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

const STAGE_LABELS: Record<number, string> = {
  1: "Assessment", 2: "Personalised Plan", 3: "Daily Tracking", 4: "Coaching", 5: "Outcome Review",
};

export default function ProgramDetail() {
  const { slug }  = useParams<{ slug: string }>();
  const navigate  = useNavigate();
  const { toast } = useToast();
  const qc        = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["program", slug],
    queryFn: () => api.get(`/programs/${slug}`).then(r => r.data.data),
  });

  const { data: myData } = useQuery({
    queryKey: ["my-programs"],
    queryFn: () => api.get("/programs/my").then(r => r.data.data),
  });
  const enrollment = (myData ?? []).find((e: any) => e.slug === slug);

  const enrollMutation = useMutation({
    mutationFn: () => api.post(`/programs/${slug}/enroll`, {}),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["my-programs"] });
      navigate(`/programs/journey/${res.data.data.id}`);
      toast({ title: "Enrolled!", description: `Welcome to ${data?.name}` });
    },
    onError: () => toast({ title: "Enrollment failed", variant: "destructive" }),
  });

  if (isLoading) return <MainLayout><LoadingSkeleton /></MainLayout>;
  if (!data) return (
    <MainLayout>
      <div className="p-6 text-gray-500 dark:text-gray-400">Program not found.</div>
    </MainLayout>
  );

  const p = data;
  const tasksByStage: Record<number, any[]> = {};
  (p.tasks ?? []).forEach((t: any) => {
    if (!tasksByStage[t.stage]) tasksByStage[t.stage] = [];
    tasksByStage[t.stage].push(t);
  });

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto pb-24">
        {/* Hero banner */}
        <div
          className="relative px-4 pt-5 pb-10"
          style={{ background: `linear-gradient(135deg, ${p.color_hex}ee, ${p.color_hex}88)` }}
        >
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-white/80 hover:text-white text-sm mb-4 font-medium"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center flex-shrink-0">
              <ProgramIcon name={p.icon_name} className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white leading-tight">{p.name}</h1>
              <p className="text-white/80 text-sm mt-0.5">{p.short_tagline}</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <span className="flex items-center gap-1.5 bg-white/20 backdrop-blur text-white text-xs px-3 py-1 rounded-full">
              <Clock className="w-3.5 h-3.5" /> {p.duration_days} days
            </span>
            <span className="flex items-center gap-1.5 bg-white/20 backdrop-blur text-white text-xs px-3 py-1 rounded-full">
              <Users className="w-3.5 h-3.5" /> {p.enrolled_count ?? 0} enrolled
            </span>
            <span className="bg-white/20 backdrop-blur text-white text-xs px-3 py-1 rounded-full capitalize">
              {p.coach_type} coaching
            </span>
          </div>
        </div>

        <div className="px-4 -mt-4 space-y-4">
          {/* CTA card */}
          <Card className="dark:border-gray-700 shadow-md">
            <CardContent className="p-4">
              {enrollment ? (
                <Button
                  className="w-full h-11 text-sm font-semibold text-white"
                  style={{ backgroundColor: p.color_hex }}
                  onClick={() => navigate(`/programs/journey/${enrollment.enrollment_id}`)}
                >
                  Continue Program <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <Button
                  className="w-full h-11 text-sm font-semibold text-white"
                  style={{ backgroundColor: p.color_hex }}
                  disabled={enrollMutation.isPending}
                  onClick={() => enrollMutation.mutate()}
                >
                  {enrollMutation.isPending ? "Enrolling…" : `Start ${p.name}`}
                </Button>
              )}
              {!enrollment && (
                <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Free to start · Guided by coaches &amp; AI
                </p>
              )}
            </CardContent>
          </Card>

          {/* About */}
          <Card className="dark:border-gray-700">
            <CardContent className="p-4">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-2">About this program</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{p.description}</p>
            </CardContent>
          </Card>

          {/* Tracking params */}
          {(p.tracking_params ?? []).length > 0 && (
            <Card className="dark:border-gray-700">
              <CardContent className="p-4">
                <h2 className="font-semibold text-gray-900 dark:text-white mb-3">What you'll track</h2>
                <div className="flex flex-wrap gap-2">
                  {p.tracking_params.map((param: any) => (
                    <Badge
                      key={param.id}
                      variant="outline"
                      className="text-xs border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                    >
                      {param.param_label}{param.unit ? ` (${param.unit})` : ""}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Journey stages */}
          {Object.keys(tasksByStage).length > 0 && (
            <Card className="dark:border-gray-700">
              <CardContent className="p-4">
                <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Program journey</h2>
                <div className="space-y-4">
                  {Object.entries(tasksByStage).map(([stageStr, tasks]) => {
                    const stage = parseInt(stageStr);
                    return (
                      <div key={stage}>
                        <div className="flex items-center gap-2 mb-2">
                          <div
                            className="w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: p.color_hex }}
                          >
                            {stage}
                          </div>
                          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                            Stage {stage} — {STAGE_LABELS[stage] ?? "Activities"}
                          </span>
                        </div>
                        <div className="ml-8 space-y-1.5">
                          {tasks.map((task: any) => {
                            const TIcon = TASK_ICONS[task.task_type] ?? CheckCircle2;
                            return (
                              <div key={task.id} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                <TIcon className="w-3.5 h-3.5 text-gray-400 dark:text-gray-600 flex-shrink-0" />
                                <span>{task.title}</span>
                                {task.target_value && (
                                  <span className="text-xs text-gray-400 dark:text-gray-600">
                                    · {task.target_value} {task.unit}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tags */}
          {(p.tags ?? []).length > 0 && (
            <div className="flex flex-wrap gap-2 pb-2">
              {p.tags.map((tag: string) => (
                <Badge key={tag} className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700">
                  #{tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-4 max-w-2xl mx-auto">
      <div className="h-44 bg-gray-100 dark:bg-gray-800 rounded-xl" />
      <div className="h-20 bg-gray-100 dark:bg-gray-800 rounded-xl" />
      <div className="h-32 bg-gray-100 dark:bg-gray-800 rounded-xl" />
    </div>
  );
}
