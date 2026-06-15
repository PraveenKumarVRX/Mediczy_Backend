import { useState } from "react";
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
  Droplet, Moon, Pill, Sparkles, ArrowRight, Shield, Star
} from "lucide-react";

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  Heart, Activity, Scale, Flower2, Leaf, Briefcase,
  HeartPulse, Crown, Sparkles, Shield, Star,
};
function ProgramIcon({ name, className }: { name: string; className?: string }) {
  const I = ICON_MAP[name] ?? Heart;
  return <I className={className} />;
}

const TASK_ICONS: Record<string, React.FC<{ className?: string }>> = {
  log_sugar:  Droplets,
  walk:       Footprints,
  water:      Droplet,
  sleep:      Moon,
  medication: Pill,
  log_weight: Scale,
  diet:       Leaf,
  exercise:   Activity,
  log_bp:     HeartPulse,
};

const STAGE_LABELS = [
  "", "Assessment", "Personalised Plan", "Daily Tracking", "Coaching", "Outcome Review"
];

export default function ProgramDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate  = useNavigate();
  const { toast } = useToast();
  const qc        = useQueryClient();
  const [enrolling, setEnrolling] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["program", slug],
    queryFn: () => api.get(`/programs/${slug}`).then(r => r.data.data),
  });

  // check if already enrolled
  const { data: myData } = useQuery({
    queryKey: ["my-programs"],
    queryFn: () => api.get("/programs/my").then(r => r.data.data),
  });
  const enrollment = (myData ?? []).find((e: any) => e.slug === slug);

  const enrollMutation = useMutation({
    mutationFn: () => api.post(`/programs/${slug}/enroll`, {}),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["my-programs"] });
      const enrollmentId = res.data.data.id;
      toast({ title: "Enrolled!", description: `Welcome to ${data?.name}` });
      navigate(`/programs/journey/${enrollmentId}`);
    },
    onError: () => toast({ title: "Enrollment failed", variant: "destructive" }),
  });

  if (isLoading) return <MainLayout><LoadingSkeleton /></MainLayout>;
  if (!data) return <MainLayout><p className="p-4 text-slate-500">Program not found.</p></MainLayout>;

  const p = data;

  // Group tasks by stage
  const tasksByStage: Record<number, any[]> = {};
  (p.tasks ?? []).forEach((t: any) => {
    if (!tasksByStage[t.stage]) tasksByStage[t.stage] = [];
    tasksByStage[t.stage].push(t);
  });

  return (
    <MainLayout>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 pb-20">
        {/* Hero */}
        <div
          className="relative text-white px-4 pt-6 pb-10"
          style={{ background: `linear-gradient(135deg, ${p.color_hex}dd, ${p.color_hex}99)` }}
        >
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-white/80 hover:text-white text-sm mb-4"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
              <ProgramIcon name={p.icon_name} className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold leading-tight">{p.name}</h1>
              <p className="text-white/80 text-sm mt-0.5">{p.short_tagline}</p>
            </div>
          </div>
          <div className="flex gap-3 flex-wrap text-sm">
            <span className="flex items-center gap-1.5 bg-white/20 backdrop-blur px-3 py-1 rounded-full">
              <Clock className="w-3.5 h-3.5" /> {p.duration_days} days
            </span>
            <span className="flex items-center gap-1.5 bg-white/20 backdrop-blur px-3 py-1 rounded-full">
              <Users className="w-3.5 h-3.5" /> {p.enrolled_count ?? 0} enrolled
            </span>
            <span className="flex items-center gap-1.5 bg-white/20 backdrop-blur px-3 py-1 rounded-full capitalize">
              {p.coach_type} coaching
            </span>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 -mt-4 space-y-4">
          {/* Enroll CTA */}
          <Card className="border-0 shadow-md overflow-hidden">
            <CardContent className="p-4">
              {enrollment ? (
                <Button
                  className="w-full h-11 text-sm font-semibold"
                  style={{ backgroundColor: p.color_hex }}
                  onClick={() => navigate(`/programs/journey/${enrollment.enrollment_id}`)}
                >
                  Continue Program <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <Button
                  className="w-full h-11 text-sm font-semibold"
                  style={{ backgroundColor: p.color_hex }}
                  disabled={enrollMutation.isPending}
                  onClick={() => enrollMutation.mutate()}
                >
                  {enrollMutation.isPending ? "Enrolling…" : `Start ${p.name}`}
                </Button>
              )}
              {!enrollment && (
                <p className="text-center text-xs text-slate-500 mt-2">
                  Free to start · Guided by coaches &amp; AI
                </p>
              )}
            </CardContent>
          </Card>

          {/* About */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <h2 className="font-semibold text-slate-800 mb-2">About this program</h2>
              <p className="text-sm text-slate-600 leading-relaxed">{p.description}</p>
            </CardContent>
          </Card>

          {/* What you'll track */}
          {(p.tracking_params ?? []).length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <h2 className="font-semibold text-slate-800 mb-3">What you'll track</h2>
                <div className="flex flex-wrap gap-2">
                  {p.tracking_params.map((param: any) => (
                    <Badge key={param.id} variant="outline" className="text-xs">
                      {param.param_label}
                      {param.unit ? ` (${param.unit})` : ""}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Program journey stages */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <h2 className="font-semibold text-slate-800 mb-4">Program journey</h2>
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
                        <span className="text-sm font-semibold text-slate-700">
                          Stage {stage} — {STAGE_LABELS[stage] ?? "Activities"}
                        </span>
                      </div>
                      <div className="ml-8 space-y-1.5">
                        {tasks.map((task: any) => {
                          const TIcon = TASK_ICONS[task.task_type] ?? CheckCircle2;
                          return (
                            <div key={task.id} className="flex items-center gap-2 text-sm text-slate-600">
                              <TIcon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                              <span>{task.title}</span>
                              {task.target_value && (
                                <span className="text-xs text-slate-400">
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

          {/* Tags */}
          {(p.tags ?? []).length > 0 && (
            <div className="flex flex-wrap gap-2 pb-2">
              {p.tags.map((tag: string) => (
                <Badge key={tag} className="text-xs bg-slate-100 text-slate-600 border-slate-200">
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
    <div className="animate-pulse space-y-4 p-4">
      <div className="h-40 bg-slate-100 rounded-xl" />
      <div className="h-24 bg-slate-100 rounded-xl" />
      <div className="h-32 bg-slate-100 rounded-xl" />
    </div>
  );
}
