/**
 * Mind & Mood — patient mental-wellness surface (MED-MIND-001 Phase 2).
 *
 * Tier A / NOT SaMD: the screening instruments are scored server-side by a pure
 * deterministic function of the patient's own answers and reported as a raw
 * score plus the instrument's published severity band, always with the
 * non-diagnostic disclaimer the API returns. This page must never present a
 * score as a diagnosis, and must never invent or interpolate one.
 *
 * The daily mood check-in writes through the existing /health-diary endpoint
 * (plan AD-4) rather than a second mood store, with isPrivate: true.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import api from "@/utils/api";
import {
  Brain, Wind, Moon, Phone, Stethoscope, Video, MapPin, ShieldAlert,
  CheckCircle2, ChevronRight, Loader2, Info, Sparkles,
} from "lucide-react";

/* ─── Types mirroring the API ────────────────────────────────────────────── */
type InstrumentItem = { number: number; text: string };
type InstrumentOption = { value: number; label: string };
type Instrument = {
  code: string; version: string; name: string; fullName: string;
  measures: string; recallPeriod: string;
  options: InstrumentOption[]; items: InstrumentItem[];
  minScore: number; maxScore: number; disclaimer: string;
};
type ScoreResult = {
  id: number; instrumentCode: string; rawScore: number; maxScore: number;
  band: string; interpretation: string; flaggedItems: string[]; crisis: boolean;
  administeredAt: string;
};
type HistoryRow = {
  id: number; instrumentCode: string; instrumentName: string;
  rawScore: number | null; maxScore: number | null; band: string | null;
  administeredAt: string;
};
type DoctorRow = {
  id: number; firstName?: string; lastName?: string; specialization?: string;
  feeConfirmed?: boolean; onlineConsultationFee?: number | null; city?: string;
};

/** Which programme each instrument belongs to (seeded by MED-MIND-001). */
const PROGRAM_FOR_INSTRUMENT: Record<string, string> = {
  PHQ9: "mood-care",
  GAD7: "calm-resilience",
};

const BAND_STYLE: Record<string, { label: string; cls: string }> = {
  minimal:           { label: "Minimal",           cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" },
  mild:              { label: "Mild",              cls: "bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-200" },
  moderate:          { label: "Moderate",          cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" },
  moderately_severe: { label: "Moderately severe", cls: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200" },
  severe:            { label: "Severe",            cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" },
};

const MOOD_EMOJIS = ["😢", "😕", "😐", "🙂", "😄"];
const MOOD_LABELS = ["Very low", "Low", "Neutral", "Good", "Great"];

/**
 * National mental-health helplines (India). Shown as selectable text as well as
 * a tel: link, because tel: is unreliable in some embedded views.
 */
const HELPLINES = [
  { name: "Tele-MANAS (Govt. of India)", number: "14416", note: "24x7, 20+ languages" },
  { name: "KIRAN Mental Health Helpline", number: "1800-599-0019", note: "24x7, toll-free" },
];

const fadeUp = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } };

/* ─── Crisis card ────────────────────────────────────────────────────────── */
function CrisisCard({ onDismissToSupport }: { onDismissToSupport: () => void }) {
  return (
    <Card className="border-2 border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-red-900 dark:text-red-100">
          <ShieldAlert className="h-5 w-5 shrink-0" />
          Please talk to someone today
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-red-900 dark:text-red-100">
        <p>
          Your answers mention thoughts of harming yourself. You deserve support right now, and
          help is free and confidential.
        </p>
        <div className="space-y-2">
          {HELPLINES.map((h) => (
            <div key={h.number} className="rounded-lg bg-white/70 p-3 dark:bg-black/20">
              <div className="font-semibold">{h.name}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <a href={`tel:${h.number.replace(/[^0-9]/g, "")}`} className="text-lg font-bold underline">
                  {h.number}
                </a>
                <span className="text-xs opacity-80">{h.note}</span>
              </div>
            </div>
          ))}
        </div>
        <Button variant="outline" className="w-full border-red-300 dark:border-red-800" onClick={onDismissToSupport}>
          <Stethoscope className="mr-2 h-4 w-4" />
          Book a psychiatrist or psychologist
        </Button>
        <p className="text-xs opacity-80">
          If you are in immediate danger, please call your local emergency number or go to the
          nearest emergency department.
        </p>
      </CardContent>
    </Card>
  );
}

/* ─── Questionnaire ──────────────────────────────────────────────────────── */
function Questionnaire({
  instrument, onCancel, onSubmit, submitting,
}: {
  instrument: Instrument;
  onCancel: () => void;
  onSubmit: (answers: number[]) => void;
  submitting: boolean;
}) {
  const [answers, setAnswers] = useState<(number | null)[]>(
    () => Array.from({ length: instrument.items.length }, () => null),
  );
  const answered = answers.filter((a) => a !== null).length;
  const complete = answered === instrument.items.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{instrument.fullName}</CardTitle>
        <p className="text-sm text-gray-500 dark:text-gray-400">{instrument.recallPeriod}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {instrument.items.map((item, idx) => (
          <div key={item.number} className="space-y-2">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
              <span className="mr-1.5 text-gray-400">{item.number}.</span>{item.text}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {instrument.options.map((opt) => {
                const selected = answers[idx] === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setAnswers((prev) => {
                      const next = [...prev];
                      next[idx] = opt.value;
                      return next;
                    })}
                    className={`rounded-lg border px-2 py-2 text-xs transition ${
                      selected
                        ? "border-violet-500 bg-violet-50 font-semibold text-violet-900 dark:bg-violet-900/40 dark:text-violet-100"
                        : "border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          <Info className="mr-1 inline h-3.5 w-3.5" />
          {instrument.disclaimer}
        </div>

        <div className="flex items-center gap-2">
          <Button
            className="flex-1"
            disabled={!complete || submitting}
            onClick={() => onSubmit(answers as number[])}
          >
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {complete ? "See my result" : `${answered} of ${instrument.items.length} answered`}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={submitting}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Breathing exercise ─────────────────────────────────────────────────── */
function BreathingExercise() {
  const [running, setRunning] = useState(false);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wind className="h-4 w-4 text-sky-600" /> Slow breathing
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4 pb-6">
        <div className="relative flex h-40 w-40 items-center justify-center">
          <motion.div
            className="absolute h-40 w-40 rounded-full bg-sky-200/60 dark:bg-sky-500/20"
            animate={running ? { scale: [1, 1.25, 1.25, 1, 1] } : { scale: 1 }}
            transition={running ? { duration: 16, times: [0, 0.25, 0.5, 0.75, 1], repeat: Infinity, ease: "easeInOut" } : undefined}
          />
          <motion.div
            className="absolute h-24 w-24 rounded-full bg-sky-500/80"
            animate={running ? { scale: [1, 1.35, 1.35, 1, 1] } : { scale: 1 }}
            transition={running ? { duration: 16, times: [0, 0.25, 0.5, 0.75, 1], repeat: Infinity, ease: "easeInOut" } : undefined}
          />
          <span className="relative z-10 text-sm font-semibold text-white drop-shadow">
            {running ? "Follow" : "Ready"}
          </span>
        </div>
        <p className="text-center text-xs text-gray-500 dark:text-gray-400">
          Breathe in for 4, hold for 4, out for 4, hold for 4. Four rounds is about a minute.
        </p>
        <Button variant={running ? "outline" : "default"} onClick={() => setRunning((r) => !r)}>
          {running ? "Stop" : "Start"}
        </Button>
      </CardContent>
    </Card>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */
export default function MindWellness() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [activeInstrument, setActiveInstrument] = useState<Instrument | null>(null);
  const [lastResult, setLastResult] = useState<ScoreResult | null>(null);
  const [showCrisis, setShowCrisis] = useState(false);
  const [moodNote, setMoodNote] = useState("");
  const [moodValue, setMoodValue] = useState<number | null>(null);
  const [consultMode, setConsultMode] = useState<"online" | "walkIn">("online");
  const [showSpecialists, setShowSpecialists] = useState(false);

  const { data: instruments = [], isLoading: loadingInstruments } = useQuery<Instrument[]>({
    queryKey: ["mind-instruments"],
    queryFn: () => api.get("/programs/instruments").then((r) => r.data.data),
    staleTime: 60 * 60 * 1000,
  });

  const { data: enrollments = [] } = useQuery<any[]>({
    queryKey: ["my-programs"],
    queryFn: () => api.get("/programs/my").then((r) => r.data.data ?? []),
  });

  const enrollmentBySlug = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of enrollments) if (e.slug) m[e.slug] = e.enrollment_id;
    return m;
  }, [enrollments]);

  /** Enrollment ids for the mental-health programmes, for the history query. */
  const mindEnrollmentIds = useMemo(
    () => Object.values(PROGRAM_FOR_INSTRUMENT)
      .map((slug) => enrollmentBySlug[slug])
      .filter((id): id is number => typeof id === "number"),
    [enrollmentBySlug],
  );

  const { data: history = [] } = useQuery<HistoryRow[]>({
    queryKey: ["mind-history", mindEnrollmentIds],
    enabled: mindEnrollmentIds.length > 0,
    queryFn: async () => {
      const pages = await Promise.all(
        mindEnrollmentIds.map((id) =>
          api.get(`/programs/enrollment/${id}/assessments`)
            .then((r) => r.data.data as HistoryRow[])
            .catch(() => [] as HistoryRow[])),
      );
      return pages.flat().sort(
        (a, b) => new Date(b.administeredAt).getTime() - new Date(a.administeredAt).getTime(),
      );
    },
  });

  /** Ensures an enrollment exists, then submits the answers. */
  const submitAssessment = useMutation({
    mutationFn: async ({ instrument, answers }: { instrument: Instrument; answers: number[] }) => {
      const slug = PROGRAM_FOR_INSTRUMENT[instrument.code];
      let enrollmentId = slug ? enrollmentBySlug[slug] : undefined;
      if (!enrollmentId && slug) {
        // POST /programs/:slug/enroll responds { success, data: <enrollment row> },
        // upserting on (user_id, program_id), so this is safe to call again.
        const enrolled = await api.post(`/programs/${slug}/enroll`, {});
        enrollmentId = enrolled.data?.data?.id;
      }
      if (!enrollmentId) throw new Error("Could not start the programme for this check-in");
      const res = await api.post(`/programs/enrollment/${enrollmentId}/assessments`, {
        instrumentCode: instrument.code,
        answers,
      });
      return res.data.data as ScoreResult;
    },
    onSuccess: (result) => {
      setLastResult(result);
      setActiveInstrument(null);
      if (result.crisis) setShowCrisis(true);
      qc.invalidateQueries({ queryKey: ["my-programs"] });
      qc.invalidateQueries({ queryKey: ["mind-history"] });
    },
    onError: (err: any) => {
      toast({
        title: "Could not save your check-in",
        description: err?.response?.data?.message || err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const logMood = useMutation({
    mutationFn: async () => {
      if (moodValue === null) throw new Error("Pick how you are feeling first");
      return api.post("/health-diary", {
        entryDate: new Date().toISOString(),
        entryType: "mood",
        title: MOOD_LABELS[moodValue - 1],
        description: moodNote || undefined,
        mood: moodValue,                       // populates the column, not only data JSONB
        data: { moodScore: moodValue, mood: MOOD_EMOJIS[moodValue - 1] },
        isPrivate: true,                       // mind entries are private by default
        tags: ["mind-wellness"],
      });
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Your check-in is private to you." });
      setMoodValue(null);
      setMoodNote("");
    },
    onError: (err: any) => toast({
      title: "Could not save",
      description: err?.response?.data?.message || err?.message,
      variant: "destructive",
    }),
  });

  // F-1 + F-2: substring specialization match reaches all 61 specialists, and the
  // capability filter now means capability rather than "logged in right now".
  const { data: specialists = [], isFetching: loadingSpecialists } = useQuery<DoctorRow[]>({
    queryKey: ["mind-specialists", consultMode],
    enabled: showSpecialists,
    queryFn: () => api.get("/doctors/available", {
      params: {
        specializationLike: "psychiatr,psycholog",
        consultationType: consultMode,
        limit: 12,
      },
    }).then((r) => r.data?.data ?? r.data?.doctors ?? []),
  });

  const latestByCode = useMemo(() => {
    const m: Record<string, HistoryRow> = {};
    for (const h of history) if (!m[h.instrumentCode]) m[h.instrumentCode] = h;
    return m;
  }, [history]);

  return (
    <MainLayout>
      <div className="mx-auto max-w-2xl px-4 py-6 pb-24">
        <div className="mb-5">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
            <Brain className="h-6 w-6 text-violet-600" /> Mind &amp; Mood
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Private check-ins, calming exercises, and a professional when you want one.
          </p>
        </div>

        {showCrisis && (
          <motion.div variants={fadeUp} initial="hidden" animate="show" className="mb-5">
            <CrisisCard onDismissToSupport={() => { setShowCrisis(false); setShowSpecialists(true); }} />
          </motion.div>
        )}

        {/* Result of the check-in just taken */}
        {lastResult && !activeInstrument && (
          <motion.div variants={fadeUp} initial="hidden" animate="show" className="mb-5">
            <Card>
              <CardContent className="space-y-3 pt-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {lastResult.instrumentCode === "PHQ9" ? "PHQ-9" : "GAD-7"} result
                    </div>
                    <div className="text-3xl font-bold text-gray-900 dark:text-white">
                      {lastResult.rawScore}
                      <span className="ml-1 text-base font-normal text-gray-400">/ {lastResult.maxScore}</span>
                    </div>
                  </div>
                  <Badge className={BAND_STYLE[lastResult.band]?.cls ?? ""}>
                    {BAND_STYLE[lastResult.band]?.label ?? lastResult.band}
                  </Badge>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300">{lastResult.interpretation}</p>
                <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  <Info className="mr-1 inline h-3.5 w-3.5" />
                  This is a self-report screening score, not a diagnosis. Please discuss the result
                  with a qualified clinician.
                </div>
                <Button variant="outline" className="w-full" onClick={() => setShowSpecialists(true)}>
                  <Stethoscope className="mr-2 h-4 w-4" /> Talk to a professional
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Active questionnaire replaces the rest of the page */}
        {activeInstrument ? (
          <Questionnaire
            instrument={activeInstrument}
            submitting={submitAssessment.isPending}
            onCancel={() => setActiveInstrument(null)}
            onSubmit={(answers) => submitAssessment.mutate({ instrument: activeInstrument, answers })}
          />
        ) : (
          <div className="space-y-5">
            {/* Daily mood check-in */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4 text-violet-600" /> How are you today?
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between gap-1">
                  {MOOD_EMOJIS.map((emoji, i) => {
                    const v = i + 1;
                    const selected = moodValue === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={selected}
                        aria-label={MOOD_LABELS[i]}
                        onClick={() => setMoodValue(v)}
                        className={`flex-1 rounded-xl border py-2 text-2xl transition ${
                          selected
                            ? "border-violet-500 bg-violet-50 dark:bg-violet-900/40"
                            : "border-gray-200 hover:border-gray-300 dark:border-gray-700"
                        }`}
                      >
                        {emoji}
                        <div className="mt-0.5 text-[10px] font-medium text-gray-500 dark:text-gray-400">
                          {MOOD_LABELS[i]}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {moodValue !== null && (
                  <>
                    <Textarea
                      rows={2}
                      value={moodNote}
                      onChange={(e) => setMoodNote(e.target.value)}
                      placeholder="Anything you want to note? (optional, private)"
                    />
                    <Button className="w-full" disabled={logMood.isPending} onClick={() => logMood.mutate()}>
                      {logMood.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Save today&apos;s check-in
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Screening instruments */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Check in on how you&apos;ve been</CardTitle>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Short, validated questionnaires. Private to you and any clinician you consult.
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {loadingInstruments && (
                  <div className="flex items-center gap-2 py-4 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                  </div>
                )}
                {instruments.map((inst) => {
                  const latest = latestByCode[inst.code];
                  return (
                    <button
                      key={inst.code}
                      type="button"
                      onClick={() => { setLastResult(null); setActiveInstrument(inst); }}
                      className="flex w-full items-center justify-between rounded-xl border border-gray-200 p-3 text-left transition hover:border-violet-300 dark:border-gray-700"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 dark:text-white">{inst.name}</div>
                        <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                          {inst.items.length} questions · {inst.measures}
                        </div>
                        {latest && (
                          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Last: {latest.rawScore}/{latest.maxScore}
                            {latest.band ? ` · ${BAND_STYLE[latest.band]?.label ?? latest.band}` : ""}
                            {" · "}
                            {new Date(latest.administeredAt).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            {/* Trend */}
            {history.length > 1 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Your check-ins over time</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {history.slice(0, 8).map((h) => (
                    <div key={h.id} className="flex items-center gap-3 text-sm">
                      <span className="w-20 shrink-0 text-xs text-gray-500 dark:text-gray-400">
                        {new Date(h.administeredAt).toLocaleDateString()}
                      </span>
                      <span className="w-16 shrink-0 text-xs font-medium">{h.instrumentName}</span>
                      <div className="h-1.5 min-w-0 flex-1 rounded-full bg-gray-200 dark:bg-gray-700">
                        <div
                          className="h-full rounded-full bg-violet-500"
                          style={{
                            width: `${h.rawScore !== null && h.maxScore
                              ? Math.min(100, (h.rawScore / h.maxScore) * 100)
                              : 0}%`,
                          }}
                        />
                      </div>
                      <span className="w-12 shrink-0 text-right text-xs font-semibold">
                        {h.rawScore ?? "—"}
                      </span>
                    </div>
                  ))}
                  <p className="pt-1 text-xs text-gray-500 dark:text-gray-400">
                    A lower score means fewer symptoms reported.
                  </p>
                </CardContent>
              </Card>
            )}

            <BreathingExercise />

            {/* Sleep nudge */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Moon className="h-4 w-4 text-indigo-500" /> Sleep &amp; mood travel together
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Logging your sleep alongside your mood makes patterns much easier to see — and
                  gives a clinician something concrete to work from.
                </p>
              </CardContent>
            </Card>

            {/* Specialists */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Stethoscope className="h-4 w-4 text-teal-600" /> Consult a specialist
                </CardTitle>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Psychiatrists and psychologists, online or in person.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {!showSpecialists ? (
                  <Button variant="outline" className="w-full" onClick={() => setShowSpecialists(true)}>
                    Find a specialist
                  </Button>
                ) : (
                  <>
                    <div className="flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
                      {([["online", "Online", Video], ["walkIn", "In person", MapPin]] as const).map(
                        ([mode, label, Icon]) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setConsultMode(mode)}
                            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm transition ${
                              consultMode === mode
                                ? "bg-white font-semibold shadow-sm dark:bg-gray-700"
                                : "text-gray-500 dark:text-gray-400"
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5" /> {label}
                          </button>
                        ),
                      )}
                    </div>

                    {loadingSpecialists && (
                      <div className="flex items-center gap-2 py-3 text-sm text-gray-500">
                        <Loader2 className="h-4 w-4 animate-spin" /> Finding specialists…
                      </div>
                    )}

                    {!loadingSpecialists && specialists.length === 0 && (
                      <p className="py-2 text-sm text-gray-500 dark:text-gray-400">
                        No specialists available for this option right now.
                      </p>
                    )}

                    {specialists.map((d) => (
                      <div
                        key={d.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-700"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium text-gray-900 dark:text-white">
                            Dr. {d.firstName} {d.lastName}
                          </div>
                          <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                            {d.specialization}{d.city ? ` · ${d.city}` : ""}
                          </div>
                          {/* RK-9: a placeholder fee must never be shown as a price. */}
                          <div className="mt-0.5 text-xs">
                            {d.feeConfirmed && typeof d.onlineConsultationFee === "number"
                              ? <span className="font-medium">₹{d.onlineConsultationFee}</span>
                              : <span className="text-gray-400">Fee shown at booking</span>}
                          </div>
                        </div>
                        <Button size="sm" variant="outline" asChild>
                          <a href={`/doctors/${d.id}`}>Book</a>
                        </Button>
                      </div>
                    ))}
                  </>
                )}

                <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  <Phone className="mr-1 inline h-3.5 w-3.5" />
                  Free 24x7 support: <strong>Tele-MANAS 14416</strong> · KIRAN 1800-599-0019
                </div>
              </CardContent>
            </Card>

            <p className="flex items-start gap-1.5 px-1 text-xs text-gray-400">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Your check-ins are private. They are never shared with an employer.
            </p>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
