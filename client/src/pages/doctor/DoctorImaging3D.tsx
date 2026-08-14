import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BrainCircuit,
  CheckCircle2,
  Cuboid,
  ExternalLink,
  FileText,
  Layers3,
  Loader2,
  Maximize2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import MainLayout from "@/components/layout/MainLayoutdoctor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import api from "@/utils/api";
import { buildOhifViewerUrl, openOhifViewer } from "@/utils/imagingViewer";
import ImagingPlatformPanels from "@/components/imaging/ImagingPlatformPanels";

type RisStudy = {
  id: number;
  patient_name: string;
  modality: string;
  body_part?: string | null;
  study_date?: string | null;
  study_description?: string | null;
  study_instance_uid: string;
  report_status?: string | null;
  report_text?: string | null;
  image_count?: number | null;
  series_count?: number | null;
};

type AiReadinessSeries = {
  seriesInstanceUID: string;
  modality: string;
  instanceCount: number;
  imageInstances: number;
  sampledImageInstances: number;
  transferSyntaxUID: string | null;
  geometry: {
    rows: number | null;
    columns: number | null;
    pixelSpacing: string | null;
    hasImagePosition: boolean;
    hasImageOrientation: boolean;
    sliceThickness: string | null;
  };
  gpuReady: boolean;
  warnings: string[];
};

type AiReadiness = {
  success: boolean;
  studyInstanceUID: string;
  modality: string;
  summary: {
    seriesCount: number;
    readySeriesCount: number;
    volumetricSeriesCount: number;
    gpuReady: boolean;
  };
  series: AiReadinessSeries[];
};

function cleanUid(value: string | undefined) {
  return String(value || "").trim().replace(/,+$/g, "").trim();
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function warningLabel(value: string) {
  return value.replace(/_/g, " ");
}

function readinessScore(readiness: AiReadiness | null) {
  if (!readiness?.summary.seriesCount) return 0;
  return Math.round((readiness.summary.readySeriesCount / readiness.summary.seriesCount) * 100);
}

function segmentationProfile(study: RisStudy | null, readiness: AiReadiness | null) {
  const modality = String(study?.modality || readiness?.modality || "").toUpperCase();
  const body = String(study?.body_part || study?.study_description || "").toLowerCase();
  const ready = Boolean(readiness?.summary.gpuReady);
  const volumetric = readiness?.summary.volumetricSeriesCount || 0;

  if (!ready || volumetric === 0) {
    return {
      status: "Blocked",
      model: "MONAI / TotalSegmentator",
      detail: "Needs at least one geometry-complete volumetric CT/MRI series.",
      runnable: false,
    };
  }

  if (modality === "CT") {
    return {
      status: "Ready",
      model: body.includes("head") || body.includes("brain")
        ? "MONAI CT head + TotalSegmentator tissue pipeline"
        : "TotalSegmentator CT multi-organ pipeline",
      detail: "GPU volume preprocessing is ready for segmentation queueing.",
      runnable: true,
    };
  }

  if (modality === "MR" || modality === "MRI") {
    return {
      status: "Ready",
      model: body.includes("brain")
        ? "MONAI MRI brain workflow"
        : "MONAI MRI volume workflow",
      detail: "MRI volume is suitable for organ/region-specific segmentation once the worker is connected.",
      runnable: true,
    };
  }

  return {
    status: "Review",
    model: "MONAI custom pipeline",
    detail: "Volumetric data is present, but modality-specific model selection requires review.",
    runnable: false,
  };
}

function SeriesReadinessList({ readiness }: { readiness: AiReadiness | null }) {
  const rows = useMemo(
    () => [...(readiness?.series || [])]
      .sort((a, b) => Number(b.gpuReady) - Number(a.gpuReady) || b.imageInstances - a.imageInstances)
      .slice(0, 8),
    [readiness],
  );

  if (!rows.length) {
    return <p className="text-xs text-slate-500">No series readiness data loaded.</p>;
  }

  return (
    <div className="space-y-2">
      {rows.map((series) => (
        <div key={series.seriesInstanceUID} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Badge className={series.gpuReady ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}>
                  {series.gpuReady ? "GPU-ready" : "Review"}
                </Badge>
                <span className="text-xs text-slate-300">{series.modality}</span>
              </div>
              <p className="mt-1 truncate font-mono text-[10px] text-slate-500">{series.seriesInstanceUID}</p>
            </div>
            <div className="text-right text-[11px] text-slate-400">
              <div>{series.imageInstances} images</div>
              <div>{series.geometry.rows || "-"} x {series.geometry.columns || "-"}</div>
            </div>
          </div>
          {series.warnings.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {series.warnings.slice(0, 3).map((warning) => (
                <span key={warning} className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">
                  {warningLabel(warning)}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function DoctorImaging3D() {
  const navigate = useNavigate();
  const { studyUID: rawStudyUID } = useParams();
  const studyUID = cleanUid(rawStudyUID);
  const token = useMemo(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("doctorToken") || localStorage.getItem("token") || "";
  }, []);
  const [study, setStudy] = useState<RisStudy | null>(null);
  const [readiness, setReadiness] = useState<AiReadiness | null>(null);
  const [viewerUrl, setViewerUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftText, setDraftText] = useState("");

  const score = readinessScore(readiness);
  const segmentation = segmentationProfile(study, readiness);

  const load = useCallback(async () => {
    if (!studyUID) {
      setError("Missing study UID");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const studyRes = await api.get(`/doctors/ris-referred/by-study/${encodeURIComponent(studyUID)}`);
      const nextStudy = studyRes.data.study as RisStudy;
      setStudy(nextStudy);
      await api.post("/imaging/session", { studyInstanceUID: studyUID });
      const readinessRes = await fetch(`/api/hypergrid/dicom/studies/${encodeURIComponent(studyUID)}/ai-readiness`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!readinessRes.ok) throw new Error(`AI readiness failed (${readinessRes.status})`);
      setReadiness(await readinessRes.json() as AiReadiness);
      setViewerUrl(buildOhifViewerUrl(studyUID, { mode: "diagnostic", viewport: "workspace" }));
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || "Unable to load 3D workspace");
    } finally {
      setLoading(false);
    }
  }, [studyUID]);

  useEffect(() => { load(); }, [load]);

  const generateDraft = async () => {
    if (!study?.id || !readiness) return;
    setDrafting(true);
    try {
      const bestSeries = [...readiness.series].sort((a, b) => b.imageInstances - a.imageInstances)[0];
      const { data } = await api.post("/imaging/platform/reports/draft", {
        studyId: study.id,
        structuredFindings: {
          modality: study.modality,
          bodyPart: study.body_part,
          aiReadiness: readiness.summary,
          preferredSeries: bestSeries ? {
            seriesInstanceUID: bestSeries.seriesInstanceUID,
            imageInstances: bestSeries.imageInstances,
            geometry: bestSeries.geometry,
            transferSyntaxUID: bestSeries.transferSyntaxUID,
          } : null,
          segmentationPlan: segmentation,
        },
        includePriorComparison: true,
      });
      const text = data?.draft?.draft_text || data?.draft?.report_text || data?.report || "";
      setDraftText(String(text || "Draft generated. Open the AI Report editor from Medical Imaging to review and finalize."));
    } catch (err: any) {
      setDraftText(err.response?.data?.message || err.message || "Draft generation failed.");
    } finally {
      setDrafting(false);
    }
  };

  return (
    <MainLayout>
      <div className="min-h-[calc(100vh-4rem)] bg-slate-950 px-3 py-4 text-white sm:px-4 lg:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 text-slate-300 hover:bg-slate-800 hover:text-white"
              onClick={() => navigate("/doctor/imaging")}
              title="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-lg font-semibold sm:text-xl">3D Imaging CDSS</h1>
                <Badge className="bg-cyan-500/15 text-cyan-200">OHIF / Cornerstone3D</Badge>
                <Badge className={readiness?.summary.gpuReady ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}>
                  {readiness?.summary.gpuReady ? "AI-ready" : "AI review"}
                </Badge>
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-400">
                {study?.patient_name || "Loading study"} . {study?.modality || "-"} . {formatDate(study?.study_date)} . {studyUID}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-9 border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
              onClick={load}
            >
              <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} /> Refresh
            </Button>
            <Button
              type="button"
              className="h-9 bg-teal-600 text-white hover:bg-teal-700"
              onClick={() => openOhifViewer(studyUID, undefined, { mode: "diagnostic", target: "_blank" })}
              disabled={!studyUID}
            >
              <ExternalLink className="mr-2 h-4 w-4" /> Full Viewer
            </Button>
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
            <div className="flex items-center gap-2 font-semibold"><TriangleAlert className="h-4 w-4" /> Unable to open 3D/CDSS workspace</div>
            <p className="mt-1 text-red-200/80">{error}</p>
            <Link to="/doctor/imaging" className="mt-3 inline-flex text-red-100 underline">Return to imaging list</Link>
          </div>
        ) : (
          <div className="grid min-h-[calc(100vh-9rem)] grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
            <section className="overflow-hidden rounded-lg border border-slate-800 bg-black">
              <div className="flex h-10 items-center justify-between border-b border-slate-800 bg-slate-950 px-3">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <Layers3 className="h-4 w-4 text-cyan-300" />
                  <span>Diagnostic MPR / Volume Workspace</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span>Use OHIF tools for 3D, MPR, windowing, pan, zoom, and measurements</span>
                </div>
              </div>
              <div className="relative h-[68vh] min-h-[520px] xl:h-[calc(100vh-11.5rem)]">
                {loading || !viewerUrl ? (
                  <div className="flex h-full items-center justify-center text-slate-400">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Preparing secure PACS session
                  </div>
                ) : (
                  <iframe
                    title="OHIF 3D DICOM viewer"
                    src={viewerUrl}
                    className="h-full w-full border-0"
                    allow="fullscreen; xr-spatial-tracking"
                  />
                )}
              </div>
            </section>

            <aside className="rounded-lg border border-slate-800 bg-slate-900">
              <div className="border-b border-slate-800 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-2 text-sm font-semibold">
                      <BrainCircuit className="h-4 w-4 text-teal-300" /> Clinical Decision Support
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">Advisory output for licensed clinician review.</p>
                  </div>
                  <ShieldCheck className="h-5 w-5 text-emerald-300" />
                </div>
              </div>

              <ScrollArea className="h-[70vh] xl:h-[calc(100vh-14.5rem)]">
                <div className="space-y-4 p-4">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-300">GPU / AI Readiness</span>
                      <span className="text-xs text-slate-400">{score}%</span>
                    </div>
                    <Progress value={score} className="h-2" />
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-md bg-slate-900 p-2">
                        <div className="text-base font-semibold">{readiness?.summary.seriesCount ?? "-"}</div>
                        <div className="text-[10px] text-slate-500">Series</div>
                      </div>
                      <div className="rounded-md bg-slate-900 p-2">
                        <div className="text-base font-semibold">{readiness?.summary.volumetricSeriesCount ?? "-"}</div>
                        <div className="text-[10px] text-slate-500">Volumes</div>
                      </div>
                      <div className="rounded-md bg-slate-900 p-2">
                        <div className="text-base font-semibold">{readiness?.summary.readySeriesCount ?? "-"}</div>
                        <div className="text-[10px] text-slate-500">Ready</div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                    <div className="flex items-start gap-3">
                      <div className={cn("rounded-md p-2", segmentation.runnable ? "bg-emerald-500/10" : "bg-amber-500/10")}>
                        <Cuboid className={cn("h-4 w-4", segmentation.runnable ? "text-emerald-300" : "text-amber-300")} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-slate-300">MONAI / TotalSegmentator</span>
                          <Badge className={segmentation.runnable ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}>
                            {segmentation.status}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-slate-400">{segmentation.model}</p>
                        <p className="mt-1 text-[11px] text-slate-500">{segmentation.detail}</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                          <Sparkles className="h-4 w-4 text-teal-300" /> AI Report Context
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">Uses readiness, geometry, and preferred volume context.</p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 bg-teal-600 text-white hover:bg-teal-700"
                        disabled={!study || !readiness || drafting}
                        onClick={generateDraft}
                      >
                        {drafting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1 h-3.5 w-3.5" />}
                        Draft
                      </Button>
                    </div>
                    {draftText ? (
                      <p className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-slate-900 p-2 text-xs text-slate-300">
                        {draftText}
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-500">Generate a structured draft after reviewing the volume and clinical context.</p>
                    )}
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-300">
                      <Activity className="h-4 w-4 text-cyan-300" /> Series Quality
                    </div>
                    <SeriesReadinessList readiness={readiness} />
                  </div>

                  {study && token ? (
                    <ImagingPlatformPanels
                      token={token}
                      studyId={study.id}
                      studyInstanceUID={study.study_instance_uid}
                      patientName={study.patient_name}
                    />
                  ) : null}

                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                    <div className="flex items-center gap-2 font-semibold">
                      <AlertTriangle className="h-4 w-4" /> Clinical review required
                    </div>
                    <p className="mt-1 text-amber-100/80">
                      AI findings, segmentation readiness, and draft text are decision support only. Final interpretation must be confirmed by the treating radiologist/doctor.
                    </p>
                  </div>
                </div>
              </ScrollArea>
            </aside>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
