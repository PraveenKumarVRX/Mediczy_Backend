import { format } from "date-fns";
import {
  User, Calendar, Pill, Stethoscope, Download, Eye, Send,
  MessageCircle, MoreVertical, Clock, CheckCircle2, XCircle,
  AlertTriangle, FileText, ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Medication {
  name: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  composition?: string;
}

interface Prescription {
  id: number;
  prescriptionId?: string;
  prescriptionNumber?: string;
  patientName: string;
  patientAge?: number;
  patientGender?: string;
  patientPhone?: string;
  diagnosis?: string;
  chiefComplaints?: string;
  medications?: Medication[];
  status: string;
  createdAt: string;
}

interface Props {
  rx: Prescription;
  onView: (rx: Prescription) => void;
  onIssue: (id: number) => void;
  onDownload: (id: number) => void;
  onWhatsApp?: (rx: Prescription) => void;
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; pill: string; bar: string }> = {
  issued: {
    label: "Issued",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    pill: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800",
    bar: "bg-emerald-500",
  },
  active: {
    label: "Active",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    pill: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800",
    bar: "bg-emerald-500",
  },
  draft: {
    label: "Draft",
    icon: <Clock className="h-3.5 w-3.5" />,
    pill: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
    bar: "bg-amber-400",
  },
  cancelled: {
    label: "Cancelled",
    icon: <XCircle className="h-3.5 w-3.5" />,
    pill: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",
    bar: "bg-red-400",
  },
  expired: {
    label: "Expired",
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    pill: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
    bar: "bg-slate-400",
  },
};

const HEADER_GRADIENT: Record<string, string> = {
  issued: "from-emerald-500 to-teal-600",
  active: "from-emerald-500 to-teal-600",
  draft: "from-amber-400 to-orange-500",
  cancelled: "from-red-400 to-rose-500",
  expired: "from-slate-400 to-slate-500",
};

export function PrescriptionCard({ rx, onView, onIssue, onDownload, onWhatsApp }: Props) {
  const status = STATUS_CONFIG[rx.status] ?? STATUS_CONFIG.draft;
  const gradient = HEADER_GRADIENT[rx.status] ?? HEADER_GRADIENT.draft;
  const rxId = rx.prescriptionId || rx.prescriptionNumber || `RX-${rx.id}`;
  const meds = rx.medications ?? [];
  const isDraft = rx.status === "draft";
  const isIssued = rx.status === "issued" || rx.status === "active";

  return (
    <div className="group relative bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 overflow-hidden flex flex-col">
      {/* Coloured top bar */}
      <div className={`h-1 w-full bg-gradient-to-r ${gradient}`} />

      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-4 pb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`p-2 rounded-xl bg-gradient-to-br ${gradient} shadow-sm shrink-0`}>
            <FileText className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400 tracking-wider">
              {rxId}
            </p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1 mt-0.5">
              <Calendar className="h-3 w-3" />
              {format(new Date(rx.createdAt), "dd MMM yyyy")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 border ${status.pill}`}>
            {status.icon}
            {status.label}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => onView(rx)}>
                <Eye className="mr-2 h-3.5 w-3.5" /> View Details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDownload(rx.id)}>
                <Download className="mr-2 h-3.5 w-3.5" /> Download PDF
              </DropdownMenuItem>
              {isDraft && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onIssue(rx.id)} className="text-emerald-600 focus:text-emerald-600">
                    <Send className="mr-2 h-3.5 w-3.5" /> Issue Prescription
                  </DropdownMenuItem>
                </>
              )}
              {isIssued && onWhatsApp && rx.patientPhone && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onWhatsApp(rx)} className="text-green-600 focus:text-green-600">
                    <MessageCircle className="mr-2 h-3.5 w-3.5" /> Send via WhatsApp
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Patient row */}
      <div className="mx-5 mb-3 flex items-center gap-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl px-3 py-2.5">
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center shrink-0">
          <User className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-white leading-tight truncate">
            {rx.patientName}
          </p>
          {(rx.patientAge || rx.patientGender) && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {[rx.patientAge ? `${rx.patientAge} yrs` : null, rx.patientGender].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </div>

      {/* Diagnosis */}
      {rx.diagnosis && (
        <div className="mx-5 mb-3 flex items-start gap-2">
          <Stethoscope className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
          <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
            {rx.diagnosis}
          </p>
        </div>
      )}

      {/* Medications */}
      {meds.length > 0 && (
        <div className="mx-5 mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Pill className="h-3.5 w-3.5 text-purple-500" />
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Medications ({meds.length})
            </span>
          </div>
          <div className="space-y-1.5">
            {meds.slice(0, 3).map((med, i) => (
              <div key={i} className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/40 rounded-lg px-3 py-1.5">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate max-w-[60%]">
                  {med.name}
                </span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0 ml-2">
                  {[med.dosage, med.frequency].filter(Boolean).join(" · ")}
                </span>
              </div>
            ))}
            {meds.length > 3 && (
              <p className="text-[11px] text-slate-400 dark:text-slate-500 pl-3">
                +{meds.length - 3} more medication{meds.length - 3 > 1 ? "s" : ""}
              </p>
            )}
          </div>
        </div>
      )}

      {meds.length === 0 && (
        <div className="mx-5 mb-4 text-[11px] text-slate-400 dark:text-slate-500 italic">
          No medications recorded
        </div>
      )}

      {/* Footer actions */}
      <div className="mt-auto border-t border-slate-100 dark:border-slate-800 px-5 py-3 flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 h-8 text-xs font-medium gap-1.5"
          onClick={() => onView(rx)}
        >
          <Eye className="h-3.5 w-3.5" /> View
        </Button>

        {isDraft ? (
          <Button
            size="sm"
            className="flex-1 h-8 text-xs font-medium gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white border-0"
            onClick={() => onIssue(rx.id)}
          >
            <Send className="h-3.5 w-3.5" /> Issue
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-8 text-xs font-medium gap-1.5"
            onClick={() => onDownload(rx.id)}
          >
            <Download className="h-3.5 w-3.5" /> PDF
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 shrink-0"
          onClick={() => onView(rx)}
          title="Open full view"
        >
          <ChevronRight className="h-4 w-4 text-slate-400" />
        </Button>
      </div>
    </div>
  );
}
