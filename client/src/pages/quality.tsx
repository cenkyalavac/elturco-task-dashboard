import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShieldCheck,
  Plus,
  Loader2,
  Star,
  Trash2,
  Eye,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  FileText,
  ClipboardCheck,
  Filter,
  X,
} from "lucide-react";

// ── Constants ──

const LANGUAGES = [
  "EN", "TR", "DE", "FR", "ES", "IT", "PT", "NL", "PL", "RU",
  "ZH", "JA", "KO", "AR", "SV", "DA", "FI", "NO", "CS", "HU",
  "RO", "BG", "HR", "SK", "SL", "EL", "UK", "TH", "VI", "ID",
  "MS", "HI", "BN", "HE", "FA",
];

const JOB_TYPES = ["Translation", "MTPE", "Review", "LQA", "Proofreading", "TEP"];

const ERROR_CATEGORIES = [
  "Accuracy", "Fluency", "Terminology", "Style",
  "Locale Convention", "Verity", "Design", "Other",
];

const SEVERITIES = ["Critical", "Major", "Minor", "Preferential"];

const SEVERITY_WEIGHTS: Record<string, number> = {
  Critical: 10,
  Major: 5,
  Minor: 2,
  Preferential: 0.5,
};

const REPORT_STATUS_COLORS: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-500/15 text-slate-400 border-slate-500/20" },
  submitted: { label: "Submitted", className: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  pending_translator_review: { label: "Pending Review", className: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
  translator_accepted: { label: "Accepted", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  translator_disputed: { label: "Disputed", className: "bg-red-500/15 text-red-400 border-red-500/20" },
  pending_arbitration: { label: "Arbitration", className: "bg-purple-500/15 text-purple-400 border-purple-500/20" },
  finalized: { label: "Finalized", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
};

const REPORT_TYPE_STYLES: Record<string, string> = {
  QS: "bg-purple-500/15 text-purple-400",
  LQA: "bg-cyan-500/15 text-cyan-400",
  Random_QA: "bg-orange-500/15 text-orange-400",
};

// ── Types ──

interface Vendor {
  id: number;
  name: string;
  companyName?: string;
  status?: string;
}

interface LqaEntry {
  sourceText: string;
  targetText: string;
  revisedTarget: string;
  errorCategory: string;
  severity: string;
  comment: string;
}

interface LqaError {
  category: string;
  severity: string;
  count: number;
}

interface QualityReport {
  id: number;
  vendorId: number;
  vendorName?: string;
  reportType: string;
  qsScore: number | null;
  lqaScore: number | null;
  projectName: string;
  jobType?: string | null;
  clientAccount?: string | null;
  sourceLanguage?: string | null;
  targetLanguage?: string | null;
  wordCount?: number | null;
  lqaWordsReviewed?: number | null;
  lqaEntries?: LqaEntry[] | null;
  lqaErrors?: LqaError[] | null;
  reviewerComments?: string | null;
  vendorFeedback?: string | null;
  contentType?: string | null;
  status: string;
  reportDate?: string | null;
  createdAt: string;
  updatedAt?: string;
}

interface ReportsResponse {
  reports: QualityReport[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ── Helpers ──

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function statusBadge(status: string) {
  const s = REPORT_STATUS_COLORS[status] ?? {
    label: status,
    className: "bg-white/10 text-muted-foreground border-white/10",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${s.className}`}>
      {s.label}
    </span>
  );
}

function typeBadge(reportType: string) {
  const cls = REPORT_TYPE_STYLES[reportType] ?? "bg-gray-500/15 text-gray-400";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${cls}`}>
      {reportType}
    </span>
  );
}

function calcLqaScore(entries: LqaEntry[], wordsReviewed: number): number {
  if (wordsReviewed <= 0) return 0;
  const totalPenalty = entries.reduce((sum, e) => {
    return sum + (SEVERITY_WEIGHTS[e.severity] ?? 0);
  }, 0);
  return Math.max(0, Math.round((100 - (totalPenalty / wordsReviewed) * 1000) * 100) / 100);
}

function getErrorSummary(entries: LqaEntry[]): LqaError[] {
  const map: Record<string, Record<string, number>> = {};
  for (const e of entries) {
    if (!e.errorCategory || !e.severity) continue;
    if (!map[e.errorCategory]) map[e.errorCategory] = {};
    map[e.errorCategory][e.severity] = (map[e.errorCategory][e.severity] || 0) + 1;
  }
  const result: LqaError[] = [];
  for (const category of Object.keys(map)) {
    for (const severity of Object.keys(map[category])) {
      result.push({ category, severity, count: map[category][severity] });
    }
  }
  return result;
}

// ── Star Rating Component ──

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const displayValue = hoverValue ?? value;

  return (
    <div className="flex items-center gap-0.5" onMouseLeave={() => setHoverValue(null)}>
      {[1, 2, 3, 4, 5].map((star) => {
        const leftHalf = star - 0.5;
        const isFull = displayValue >= star;
        const isHalf = !isFull && displayValue >= leftHalf;

        return (
          <div key={star} className="relative w-7 h-7 cursor-pointer">
            {/* Left half */}
            <div
              className="absolute inset-0 w-1/2 z-10"
              onMouseEnter={() => setHoverValue(leftHalf)}
              onClick={() => onChange(leftHalf)}
            />
            {/* Right half */}
            <div
              className="absolute right-0 top-0 w-1/2 h-full z-10"
              onMouseEnter={() => setHoverValue(star)}
              onClick={() => onChange(star)}
            />
            {/* Star icon */}
            <Star
              className={`w-7 h-7 transition-colors ${
                isFull
                  ? "fill-amber-400 text-amber-400"
                  : isHalf
                  ? "fill-amber-400/50 text-amber-400"
                  : "fill-transparent text-muted-foreground/40"
              }`}
            />
            {isHalf && (
              <div className="absolute inset-0 overflow-hidden w-1/2">
                <Star className="w-7 h-7 fill-amber-400 text-amber-400" />
              </div>
            )}
          </div>
        );
      })}
      <span className="ml-2 text-sm font-medium tabular-nums text-foreground">
        {value > 0 ? value.toFixed(1) : "—"}
      </span>
    </div>
  );
}

// ── Main Page ──

export default function QualityPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Top-level tab state
  const [activeTab, setActiveTab] = useState("reports");
  const [selectedReport, setSelectedReport] = useState<QualityReport | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  // ── Filters state ──
  const [filterVendorId, setFilterVendorId] = useState("");
  const [filterReportType, setFilterReportType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDateStart, setFilterDateStart] = useState("");
  const [filterDateEnd, setFilterDateEnd] = useState("");
  const [filterAccount, setFilterAccount] = useState("");
  const [filterScoreMin, setFilterScoreMin] = useState("");
  const [filterScoreMax, setFilterScoreMax] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageLimit = 20;

  // ── QS Form state ──
  const [qsVendorId, setQsVendorId] = useState("");
  const [qsScore, setQsScore] = useState(0);
  const [qsProjectName, setQsProjectName] = useState("");
  const [qsJobType, setQsJobType] = useState("");
  const [qsClientAccount, setQsClientAccount] = useState("");
  const [qsSourceLang, setQsSourceLang] = useState("");
  const [qsTargetLang, setQsTargetLang] = useState("");
  const [qsWordCount, setQsWordCount] = useState("");
  const [qsReviewerComments, setQsReviewerComments] = useState("");
  const [qsVendorFeedback, setQsVendorFeedback] = useState("");

  // ── LQA Form state ──
  const [lqaVendorId, setLqaVendorId] = useState("");
  const [lqaProjectName, setLqaProjectName] = useState("");
  const [lqaClientAccount, setLqaClientAccount] = useState("");
  const [lqaSourceLang, setLqaSourceLang] = useState("");
  const [lqaTargetLang, setLqaTargetLang] = useState("");
  const [lqaContentType, setLqaContentType] = useState("");
  const [lqaJobType, setLqaJobType] = useState("");
  const [lqaWordsReviewed, setLqaWordsReviewed] = useState("");
  const [lqaReviewerComments, setLqaReviewerComments] = useState("");
  const [lqaEntries, setLqaEntries] = useState<LqaEntry[]>([
    { sourceText: "", targetText: "", revisedTarget: "", errorCategory: "", severity: "", comment: "" },
  ]);

  // ── Data queries ──

  const buildQueryParams = useCallback(() => {
    const params = new URLSearchParams();
    if (filterVendorId) params.set("vendorId", filterVendorId);
    if (filterReportType) params.set("reportType", filterReportType);
    if (filterStatus) params.set("status", filterStatus);
    params.set("page", String(currentPage));
    params.set("limit", String(pageLimit));
    return params.toString();
  }, [filterVendorId, filterReportType, filterStatus, currentPage]);

  const { data: reportsData, isLoading: reportsLoading, error: reportsError } = useQuery<ReportsResponse | QualityReport[]>({
    queryKey: ["/api/quality-reports", buildQueryParams()],
    queryFn: async () => {
      const qs = buildQueryParams();
      const res = await apiRequest("GET", `/api/quality-reports?${qs}`);
      return res.json();
    },
  });

  const reports: QualityReport[] = useMemo(() => {
    if (!reportsData) return [];
    if (Array.isArray(reportsData)) return reportsData;
    return reportsData.reports ?? [];
  }, [reportsData]);

  const totalPages = useMemo(() => {
    if (!reportsData) return 1;
    if (Array.isArray(reportsData)) return 1;
    return reportsData.totalPages ?? 1;
  }, [reportsData]);

  // Apply client-side filters for date range, account, and score that the API might not support
  const filteredReports = useMemo(() => {
    let result = reports;
    if (filterDateStart) {
      result = result.filter((r) => (r.reportDate || r.createdAt) >= filterDateStart);
    }
    if (filterDateEnd) {
      result = result.filter((r) => (r.reportDate || r.createdAt) <= filterDateEnd + "T23:59:59");
    }
    if (filterAccount) {
      const lower = filterAccount.toLowerCase();
      result = result.filter((r) => r.clientAccount?.toLowerCase().includes(lower));
    }
    if (filterScoreMin) {
      const min = parseFloat(filterScoreMin);
      result = result.filter((r) => {
        const score = r.reportType === "QS" ? r.qsScore : r.lqaScore;
        return score != null && score >= min;
      });
    }
    if (filterScoreMax) {
      const max = parseFloat(filterScoreMax);
      result = result.filter((r) => {
        const score = r.reportType === "QS" ? r.qsScore : r.lqaScore;
        return score != null && score <= max;
      });
    }
    return result;
  }, [reports, filterDateStart, filterDateEnd, filterAccount, filterScoreMin, filterScoreMax]);

  const { data: vendors } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/vendors?limit=500");
      const json = await res.json();
      return json.data ?? json;
    },
  });

  const { data: approvedVendors } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors", "approved"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/vendors?status=Approved&limit=500");
      const json = await res.json();
      return json.data ?? json;
    },
  });

  const vendorList = vendors ?? [];
  const approvedVendorList = approvedVendors ?? [];

  // ── Mutations ──

  const createReportMutation = useMutation({
    mutationFn: async (payload: object) => {
      const res = await apiRequest("POST", "/api/quality-reports", payload);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/quality-reports"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create report", description: err.message, variant: "destructive" });
    },
  });

  const submitReportMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/quality-reports/${id}/submit`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/quality-reports"] });
      toast({ title: "Report submitted", description: "Report has been submitted for review." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to submit", description: err.message, variant: "destructive" });
    },
  });

  const disputeReportMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/quality-reports/${id}/dispute`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/quality-reports"] });
      toast({ title: "Report disputed", description: "Dispute has been filed." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to dispute", description: err.message, variant: "destructive" });
    },
  });

  // ── QS Submit ──

  function handleQsSubmit() {
    if (!qsVendorId) {
      toast({ title: "Vendor is required", variant: "destructive" });
      return;
    }
    if (qsScore <= 0) {
      toast({ title: "Score is required (click stars to rate)", variant: "destructive" });
      return;
    }
    if (!qsProjectName.trim()) {
      toast({ title: "Project name is required", variant: "destructive" });
      return;
    }

    createReportMutation.mutate(
      {
        vendorId: parseInt(qsVendorId),
        reportType: "QS",
        qsScore,
        projectName: qsProjectName.trim(),
        jobType: qsJobType || null,
        clientAccount: qsClientAccount.trim() || null,
        sourceLanguage: qsSourceLang || null,
        targetLanguage: qsTargetLang || null,
        wordCount: qsWordCount ? parseInt(qsWordCount) : null,
        reviewerComments: qsReviewerComments.trim() || null,
        vendorFeedback: qsVendorFeedback.trim() || null,
        status: "finalized",
        reportDate: todayISO(),
      },
      {
        onSuccess: () => {
          toast({ title: "QS Report created", description: "Quality score has been recorded." });
          resetQsForm();
          setActiveTab("reports");
        },
      }
    );
  }

  function resetQsForm() {
    setQsVendorId("");
    setQsScore(0);
    setQsProjectName("");
    setQsJobType("");
    setQsClientAccount("");
    setQsSourceLang("");
    setQsTargetLang("");
    setQsWordCount("");
    setQsReviewerComments("");
    setQsVendorFeedback("");
  }

  // ── LQA Submit ──

  function handleLqaSubmit(asDraft: boolean) {
    if (!lqaVendorId) {
      toast({ title: "Vendor is required", variant: "destructive" });
      return;
    }
    if (!lqaProjectName.trim()) {
      toast({ title: "Project name is required", variant: "destructive" });
      return;
    }
    const wordsNum = parseInt(lqaWordsReviewed);
    if (!wordsNum || wordsNum <= 0) {
      toast({ title: "Words reviewed must be greater than 0", variant: "destructive" });
      return;
    }

    const validEntries = lqaEntries.filter((e) => e.errorCategory && e.severity);
    const score = calcLqaScore(validEntries, wordsNum);
    const errors = getErrorSummary(validEntries);

    createReportMutation.mutate(
      {
        vendorId: parseInt(lqaVendorId),
        reportType: "LQA",
        lqaScore: score,
        projectName: lqaProjectName.trim(),
        jobType: lqaJobType || null,
        clientAccount: lqaClientAccount.trim() || null,
        sourceLanguage: lqaSourceLang || null,
        targetLanguage: lqaTargetLang || null,
        lqaWordsReviewed: wordsNum,
        lqaEntries: lqaEntries,
        lqaErrors: errors,
        contentType: lqaContentType.trim() || null,
        reviewerComments: lqaReviewerComments.trim() || null,
        status: asDraft ? "draft" : "submitted",
        reportDate: todayISO(),
      },
      {
        onSuccess: () => {
          toast({
            title: asDraft ? "LQA Draft saved" : "LQA Report submitted",
            description: asDraft ? "Report saved as draft." : "LQA report has been submitted.",
          });
          resetLqaForm();
          setActiveTab("reports");
        },
      }
    );
  }

  function resetLqaForm() {
    setLqaVendorId("");
    setLqaProjectName("");
    setLqaClientAccount("");
    setLqaSourceLang("");
    setLqaTargetLang("");
    setLqaContentType("");
    setLqaJobType("");
    setLqaWordsReviewed("");
    setLqaReviewerComments("");
    setLqaEntries([
      { sourceText: "", targetText: "", revisedTarget: "", errorCategory: "", severity: "", comment: "" },
    ]);
  }

  // ── LQA Entry helpers ──

  function addLqaRow() {
    setLqaEntries((prev) => [
      ...prev,
      { sourceText: "", targetText: "", revisedTarget: "", errorCategory: "", severity: "", comment: "" },
    ]);
  }

  function removeLqaRow(index: number) {
    setLqaEntries((prev) => prev.filter((_, i) => i !== index));
  }

  function updateLqaEntry(index: number, field: keyof LqaEntry, value: string) {
    setLqaEntries((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry))
    );
  }

  // ── LQA computed values ──

  const lqaWordsNum = parseInt(lqaWordsReviewed) || 0;
  const lqaValidEntries = lqaEntries.filter((e) => e.errorCategory && e.severity);
  const lqaCalculatedScore = lqaWordsNum > 0 ? calcLqaScore(lqaValidEntries, lqaWordsNum) : null;
  const lqaErrorSummary = getErrorSummary(lqaValidEntries);

  // ── Filter reset ──

  function clearFilters() {
    setFilterVendorId("");
    setFilterReportType("");
    setFilterStatus("");
    setFilterDateStart("");
    setFilterDateEnd("");
    setFilterAccount("");
    setFilterScoreMin("");
    setFilterScoreMax("");
    setCurrentPage(1);
  }

  // ── Detail view helpers ──

  function openReportDetail(report: QualityReport) {
    setSelectedReport(report);
    setDetailDialogOpen(true);
  }

  // ── Analytics computed ──

  const analytics = useMemo(() => {
    const allReports = reports;
    const total = allReports.length;
    const qsReports = allReports.filter((r) => r.reportType === "QS" && r.qsScore != null);
    const lqaReports = allReports.filter((r) => r.reportType === "LQA" && r.lqaScore != null);
    const avgQs = qsReports.length > 0
      ? qsReports.reduce((s, r) => s + (r.qsScore ?? 0), 0) / qsReports.length
      : 0;
    const avgLqa = lqaReports.length > 0
      ? lqaReports.reduce((s, r) => s + (r.lqaScore ?? 0), 0) / lqaReports.length
      : 0;

    const now = new Date();
    const thisMonth = allReports.filter((r) => {
      const d = new Date(r.reportDate || r.createdAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;

    // Top vendors
    const vendorMap: Record<string, { name: string; totalScore: number; count: number }> = {};
    for (const r of allReports) {
      const score = r.reportType === "QS" ? r.qsScore : r.lqaScore;
      if (score == null) continue;
      const name = r.vendorName ?? `Vendor ${r.vendorId}`;
      if (!vendorMap[name]) vendorMap[name] = { name, totalScore: 0, count: 0 };
      vendorMap[name].totalScore += score;
      vendorMap[name].count += 1;
    }
    const topVendors = Object.values(vendorMap)
      .map((v) => ({ ...v, avgScore: v.totalScore / v.count }))
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 10);

    return { total, qsCount: qsReports.length, lqaCount: lqaReports.length, avgQs, avgLqa, thisMonth, topVendors };
  }, [reports]);

  // ── Render ──

  const inputCls = "bg-white/[0.04] border-white/[0.08] text-foreground placeholder:text-muted-foreground focus:border-white/[0.2]";
  const selectTriggerCls = "bg-white/[0.04] border-white/[0.08] text-foreground focus:ring-0";

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto" data-testid="quality-page">
      {/* Header */}
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-emerald-400" />
        <h1 className="text-lg font-semibold text-foreground">Quality Management</h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white/[0.04] border border-white/[0.06]">
          <TabsTrigger value="reports" className="gap-1.5 text-xs">
            <FileText className="w-3.5 h-3.5" />
            Reports
          </TabsTrigger>
          <TabsTrigger value="qs-entry" className="gap-1.5 text-xs">
            <Star className="w-3.5 h-3.5" />
            QS Entry
          </TabsTrigger>
          <TabsTrigger value="lqa-form" className="gap-1.5 text-xs">
            <ClipboardCheck className="w-3.5 h-3.5" />
            LQA Form
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5 text-xs">
            <BarChart3 className="w-3.5 h-3.5" />
            Analytics
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════ */}
        {/* TAB 1: Quality Reports List                    */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="reports" className="space-y-4">
          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              className="gap-1.5 bg-purple-600 hover:bg-purple-700 text-white"
              onClick={() => setActiveTab("qs-entry")}
            >
              <Plus className="w-4 h-4" />
              New QS Report
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-cyan-600 hover:bg-cyan-700 text-white"
              onClick={() => setActiveTab("lqa-form")}
            >
              <Plus className="w-4 h-4" />
              New LQA Report
            </Button>
          </div>

          {/* Filters bar */}
          <div className="rounded-lg border border-white/[0.06] bg-card p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Filter className="w-3.5 h-3.5" />
              Filters
              <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs" onClick={clearFilters}>
                <X className="w-3 h-3 mr-1" />
                Clear
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {/* Vendor */}
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Vendor</Label>
                <Select value={filterVendorId} onValueChange={(v) => { setFilterVendorId(v === "all" ? "" : v); setCurrentPage(1); }}>
                  <SelectTrigger className={`${selectTriggerCls} h-8 text-xs`}>
                    <SelectValue placeholder="All vendors" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-white/[0.08]">
                    <SelectItem value="all">All vendors</SelectItem>
                    {vendorList.map((v) => (
                      <SelectItem key={v.id} value={String(v.id)}>
                        {v.name || v.companyName || `Vendor ${v.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Report Type */}
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Type</Label>
                <Select value={filterReportType} onValueChange={(v) => { setFilterReportType(v === "all" ? "" : v); setCurrentPage(1); }}>
                  <SelectTrigger className={`${selectTriggerCls} h-8 text-xs`}>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-white/[0.08]">
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="QS">QS</SelectItem>
                    <SelectItem value="LQA">LQA</SelectItem>
                    <SelectItem value="Random_QA">Random QA</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Status */}
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Status</Label>
                <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v === "all" ? "" : v); setCurrentPage(1); }}>
                  <SelectTrigger className={`${selectTriggerCls} h-8 text-xs`}>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-white/[0.08]">
                    <SelectItem value="all">All statuses</SelectItem>
                    {Object.entries(REPORT_STATUS_COLORS).map(([key, val]) => (
                      <SelectItem key={key} value={key}>{val.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date range */}
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Date From</Label>
                <Input
                  type="date"
                  value={filterDateStart}
                  onChange={(e) => setFilterDateStart(e.target.value)}
                  className={`${inputCls} h-8 text-xs`}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Date To</Label>
                <Input
                  type="date"
                  value={filterDateEnd}
                  onChange={(e) => setFilterDateEnd(e.target.value)}
                  className={`${inputCls} h-8 text-xs`}
                />
              </div>

              {/* Account */}
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Account</Label>
                <Input
                  placeholder="Search account..."
                  value={filterAccount}
                  onChange={(e) => setFilterAccount(e.target.value)}
                  className={`${inputCls} h-8 text-xs`}
                />
              </div>

              {/* Score range */}
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Score Min</Label>
                <Input
                  type="number"
                  placeholder="Min"
                  value={filterScoreMin}
                  onChange={(e) => setFilterScoreMin(e.target.value)}
                  className={`${inputCls} h-8 text-xs`}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Score Max</Label>
                <Input
                  type="number"
                  placeholder="Max"
                  value={filterScoreMax}
                  onChange={(e) => setFilterScoreMax(e.target.value)}
                  className={`${inputCls} h-8 text-xs`}
                />
              </div>
            </div>
          </div>

          {/* Reports Table */}
          {reportsLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-10 rounded-lg" />
              ))}
            </div>
          ) : reportsError ? (
            <div className="rounded-lg border border-white/[0.06] bg-card p-8 text-center text-muted-foreground">
              Failed to load quality reports.
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="rounded-lg border border-white/[0.06] bg-card p-12 text-center">
              <ShieldCheck className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-muted-foreground text-sm">No quality reports found.</p>
              <p className="text-muted-foreground text-xs mt-1">Adjust filters or create a new report.</p>
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-white/[0.06] bg-card overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/[0.06] hover:bg-transparent">
                      <TableHead className="text-xs text-muted-foreground font-medium">Vendor</TableHead>
                      <TableHead className="text-xs text-muted-foreground font-medium">Type</TableHead>
                      <TableHead className="text-xs text-muted-foreground font-medium">Score</TableHead>
                      <TableHead className="text-xs text-muted-foreground font-medium">Project</TableHead>
                      <TableHead className="text-xs text-muted-foreground font-medium">Account</TableHead>
                      <TableHead className="text-xs text-muted-foreground font-medium">Lang Pair</TableHead>
                      <TableHead className="text-xs text-muted-foreground font-medium">Status</TableHead>
                      <TableHead className="text-xs text-muted-foreground font-medium">Date</TableHead>
                      <TableHead className="text-xs text-muted-foreground font-medium">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReports.map((report) => {
                      const score = report.reportType === "QS" ? report.qsScore : report.lqaScore;
                      const scoreColor =
                        report.reportType === "QS"
                          ? score != null && score >= 4.5
                            ? "text-emerald-400 font-medium"
                            : score != null && score >= 3.5
                            ? "text-blue-400"
                            : "text-amber-400"
                          : score != null && score >= 90
                          ? "text-emerald-400 font-medium"
                          : score != null && score >= 70
                          ? "text-blue-400"
                          : "text-amber-400";

                      return (
                        <TableRow
                          key={report.id}
                          className="border-white/[0.04] hover:bg-white/[0.03] transition-colors cursor-pointer"
                          onClick={() => openReportDetail(report)}
                        >
                          <TableCell className="text-sm font-medium text-foreground">
                            {report.vendorName ?? `Vendor ${report.vendorId}`}
                          </TableCell>
                          <TableCell>{typeBadge(report.reportType)}</TableCell>
                          <TableCell className="text-sm tabular-nums">
                            {score != null ? (
                              <span className={scoreColor}>
                                {report.reportType === "QS" ? score.toFixed(1) : score.toFixed(1)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">--</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-foreground max-w-[160px] truncate">
                            {report.projectName}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">
                            {report.clientAccount || "--"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {report.sourceLanguage && report.targetLanguage
                              ? `${report.sourceLanguage} > ${report.targetLanguage}`
                              : "--"}
                          </TableCell>
                          <TableCell>{statusBadge(report.status)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDate(report.reportDate || report.createdAt)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                openReportDetail(report);
                              }}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-1">
                <p className="text-xs text-muted-foreground">
                  Showing {filteredReports.length} report{filteredReports.length !== 1 ? "s" : ""}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                    Prev
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => p + 1)}
                  >
                    Next
                    <ChevronRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════ */}
        {/* TAB 2: QS Quick Entry                          */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="qs-entry">
          <div className="max-w-2xl mx-auto">
            <Card className="border-white/[0.06] bg-card">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-400" />
                  QS Quick Entry
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Vendor */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Vendor <span className="text-red-400">*</span>
                  </Label>
                  <Select value={qsVendorId} onValueChange={setQsVendorId}>
                    <SelectTrigger className={selectTriggerCls}>
                      <SelectValue placeholder="Select vendor..." />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-white/[0.08] max-h-60">
                      {approvedVendorList.map((v) => (
                        <SelectItem key={v.id} value={String(v.id)}>
                          {v.name || v.companyName || `Vendor ${v.id}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Star Rating */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Score (1-5) <span className="text-red-400">*</span>
                  </Label>
                  <StarRating value={qsScore} onChange={setQsScore} />
                </div>

                {/* Project Name */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Project Name <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    placeholder="e.g. ACME Q1 Localization"
                    value={qsProjectName}
                    onChange={(e) => setQsProjectName(e.target.value)}
                    className={inputCls}
                  />
                </div>

                {/* Job Type */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Job Type</Label>
                  <Select value={qsJobType} onValueChange={setQsJobType}>
                    <SelectTrigger className={selectTriggerCls}>
                      <SelectValue placeholder="Select job type..." />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-white/[0.08]">
                      {JOB_TYPES.map((jt) => (
                        <SelectItem key={jt} value={jt}>{jt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Client Account */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Client Account</Label>
                  <Input
                    placeholder="e.g. ACME Corp"
                    value={qsClientAccount}
                    onChange={(e) => setQsClientAccount(e.target.value)}
                    className={inputCls}
                  />
                </div>

                {/* Language Pair */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Source Language</Label>
                    <Select value={qsSourceLang} onValueChange={setQsSourceLang}>
                      <SelectTrigger className={selectTriggerCls}>
                        <SelectValue placeholder="Source..." />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-white/[0.08] max-h-60">
                        {LANGUAGES.map((l) => (
                          <SelectItem key={l} value={l}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Target Language</Label>
                    <Select value={qsTargetLang} onValueChange={setQsTargetLang}>
                      <SelectTrigger className={selectTriggerCls}>
                        <SelectValue placeholder="Target..." />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-white/[0.08] max-h-60">
                        {LANGUAGES.map((l) => (
                          <SelectItem key={l} value={l}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Word Count */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Word Count</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="e.g. 5000"
                    value={qsWordCount}
                    onChange={(e) => setQsWordCount(e.target.value)}
                    className={inputCls}
                  />
                </div>

                {/* Reviewer Comments */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Reviewer Comments</Label>
                  <Textarea
                    placeholder="Internal comments about this evaluation..."
                    value={qsReviewerComments}
                    onChange={(e) => setQsReviewerComments(e.target.value)}
                    className={inputCls}
                    rows={3}
                  />
                </div>

                {/* Vendor Feedback */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Vendor Feedback (visible to vendor)</Label>
                  <Textarea
                    placeholder="Feedback that will be shared with the vendor..."
                    value={qsVendorFeedback}
                    onChange={(e) => setQsVendorFeedback(e.target.value)}
                    className={inputCls}
                    rows={3}
                  />
                </div>

                {/* Submit */}
                <div className="flex justify-end pt-2">
                  <Button
                    className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={handleQsSubmit}
                    disabled={createReportMutation.isPending}
                  >
                    {createReportMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        Submit QS Report
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════════════════════════════════════════════ */}
        {/* TAB 3: LQA Report Form                         */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="lqa-form">
          <div className="max-w-5xl mx-auto space-y-6">
            <Card className="border-white/[0.06] bg-card">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4 text-cyan-400" />
                  LQA Report Form
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Top fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Vendor */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Vendor <span className="text-red-400">*</span>
                    </Label>
                    <Select value={lqaVendorId} onValueChange={setLqaVendorId}>
                      <SelectTrigger className={selectTriggerCls}>
                        <SelectValue placeholder="Select vendor..." />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-white/[0.08] max-h-60">
                        {approvedVendorList.map((v) => (
                          <SelectItem key={v.id} value={String(v.id)}>
                            {v.name || v.companyName || `Vendor ${v.id}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Project Name */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Project Name <span className="text-red-400">*</span>
                    </Label>
                    <Input
                      placeholder="e.g. ACME Q1 Localization"
                      value={lqaProjectName}
                      onChange={(e) => setLqaProjectName(e.target.value)}
                      className={inputCls}
                    />
                  </div>

                  {/* Client Account */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Client Account</Label>
                    <Input
                      placeholder="e.g. ACME Corp"
                      value={lqaClientAccount}
                      onChange={(e) => setLqaClientAccount(e.target.value)}
                      className={inputCls}
                    />
                  </div>

                  {/* Content Type */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Content Type</Label>
                    <Input
                      placeholder="e.g. Marketing, Legal, Technical..."
                      value={lqaContentType}
                      onChange={(e) => setLqaContentType(e.target.value)}
                      className={inputCls}
                    />
                  </div>

                  {/* Source Language */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Source Language</Label>
                    <Select value={lqaSourceLang} onValueChange={setLqaSourceLang}>
                      <SelectTrigger className={selectTriggerCls}>
                        <SelectValue placeholder="Source..." />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-white/[0.08] max-h-60">
                        {LANGUAGES.map((l) => (
                          <SelectItem key={l} value={l}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Target Language */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Target Language</Label>
                    <Select value={lqaTargetLang} onValueChange={setLqaTargetLang}>
                      <SelectTrigger className={selectTriggerCls}>
                        <SelectValue placeholder="Target..." />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-white/[0.08] max-h-60">
                        {LANGUAGES.map((l) => (
                          <SelectItem key={l} value={l}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Job Type */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Job Type</Label>
                    <Select value={lqaJobType} onValueChange={setLqaJobType}>
                      <SelectTrigger className={selectTriggerCls}>
                        <SelectValue placeholder="Select job type..." />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-white/[0.08]">
                        {JOB_TYPES.map((jt) => (
                          <SelectItem key={jt} value={jt}>{jt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Words Reviewed */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Words Reviewed <span className="text-red-400">*</span>
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      placeholder="e.g. 2000"
                      value={lqaWordsReviewed}
                      onChange={(e) => setLqaWordsReviewed(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                </div>

                {/* LQA Entries Table */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-foreground">LQA Entries</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={addLqaRow}
                    >
                      <Plus className="w-3 h-3" />
                      Add Row
                    </Button>
                  </div>

                  <div className="rounded-lg border border-white/[0.06] overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/[0.06] hover:bg-transparent">
                          <TableHead className="text-[10px] text-muted-foreground font-medium w-8">#</TableHead>
                          <TableHead className="text-[10px] text-muted-foreground font-medium min-w-[140px]">Source Text</TableHead>
                          <TableHead className="text-[10px] text-muted-foreground font-medium min-w-[140px]">Target Text</TableHead>
                          <TableHead className="text-[10px] text-muted-foreground font-medium min-w-[140px]">Revised Target</TableHead>
                          <TableHead className="text-[10px] text-muted-foreground font-medium min-w-[130px]">Error Category</TableHead>
                          <TableHead className="text-[10px] text-muted-foreground font-medium min-w-[110px]">Severity</TableHead>
                          <TableHead className="text-[10px] text-muted-foreground font-medium min-w-[120px]">Comment</TableHead>
                          <TableHead className="text-[10px] text-muted-foreground font-medium w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lqaEntries.map((entry, idx) => (
                          <TableRow key={idx} className="border-white/[0.04]">
                            <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                            <TableCell>
                              <Input
                                value={entry.sourceText}
                                onChange={(e) => updateLqaEntry(idx, "sourceText", e.target.value)}
                                className={`${inputCls} h-8 text-xs`}
                                placeholder="Source..."
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={entry.targetText}
                                onChange={(e) => updateLqaEntry(idx, "targetText", e.target.value)}
                                className={`${inputCls} h-8 text-xs`}
                                placeholder="Target..."
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={entry.revisedTarget}
                                onChange={(e) => updateLqaEntry(idx, "revisedTarget", e.target.value)}
                                className={`${inputCls} h-8 text-xs`}
                                placeholder="Revised..."
                              />
                            </TableCell>
                            <TableCell>
                              <Select
                                value={entry.errorCategory}
                                onValueChange={(v) => updateLqaEntry(idx, "errorCategory", v)}
                              >
                                <SelectTrigger className={`${selectTriggerCls} h-8 text-xs`}>
                                  <SelectValue placeholder="Category..." />
                                </SelectTrigger>
                                <SelectContent className="bg-popover border-white/[0.08]">
                                  {ERROR_CATEGORIES.map((c) => (
                                    <SelectItem key={c} value={c}>{c}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Select
                                value={entry.severity}
                                onValueChange={(v) => updateLqaEntry(idx, "severity", v)}
                              >
                                <SelectTrigger className={`${selectTriggerCls} h-8 text-xs`}>
                                  <SelectValue placeholder="Severity..." />
                                </SelectTrigger>
                                <SelectContent className="bg-popover border-white/[0.08]">
                                  {SEVERITIES.map((s) => (
                                    <SelectItem key={s} value={s}>{s}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Input
                                value={entry.comment}
                                onChange={(e) => updateLqaEntry(idx, "comment", e.target.value)}
                                className={`${inputCls} h-8 text-xs`}
                                placeholder="Comment..."
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-red-400 hover:text-red-300"
                                onClick={() => removeLqaRow(idx)}
                                disabled={lqaEntries.length <= 1}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Error Summary */}
                {lqaErrorSummary.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-foreground">Error Summary</Label>
                    <div className="rounded-lg border border-white/[0.06] overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-white/[0.06] hover:bg-transparent">
                            <TableHead className="text-[10px] text-muted-foreground font-medium">Category</TableHead>
                            <TableHead className="text-[10px] text-muted-foreground font-medium">Severity</TableHead>
                            <TableHead className="text-[10px] text-muted-foreground font-medium">Count</TableHead>
                            <TableHead className="text-[10px] text-muted-foreground font-medium">Penalty</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lqaErrorSummary.map((err, idx) => (
                            <TableRow key={idx} className="border-white/[0.04]">
                              <TableCell className="text-xs">{err.category}</TableCell>
                              <TableCell className="text-xs">
                                <span className={
                                  err.severity === "Critical" ? "text-red-400" :
                                  err.severity === "Major" ? "text-orange-400" :
                                  err.severity === "Minor" ? "text-amber-400" :
                                  "text-slate-400"
                                }>
                                  {err.severity}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs tabular-nums">{err.count}</TableCell>
                              <TableCell className="text-xs tabular-nums">
                                {(err.count * (SEVERITY_WEIGHTS[err.severity] ?? 0)).toFixed(1)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Calculated LQA Score */}
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Calculated LQA Score</p>
                    <p className="text-xs text-muted-foreground">
                      Formula: max(0, 100 - (total_penalty / words_reviewed * 1000))
                    </p>
                  </div>
                  <div className={`text-3xl font-bold tabular-nums ${
                    lqaCalculatedScore == null ? "text-muted-foreground" :
                    lqaCalculatedScore >= 90 ? "text-emerald-400" :
                    lqaCalculatedScore >= 70 ? "text-blue-400" :
                    lqaCalculatedScore >= 50 ? "text-amber-400" :
                    "text-red-400"
                  }`}>
                    {lqaCalculatedScore != null ? lqaCalculatedScore.toFixed(1) : "--"}
                  </div>
                </div>

                {/* Reviewer Comments */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Reviewer Comments</Label>
                  <Textarea
                    placeholder="Internal comments about this LQA review..."
                    value={lqaReviewerComments}
                    onChange={(e) => setLqaReviewerComments(e.target.value)}
                    className={inputCls}
                    rows={3}
                  />
                </div>

                {/* Action buttons */}
                <div className="flex justify-end gap-3 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => handleLqaSubmit(true)}
                    disabled={createReportMutation.isPending}
                  >
                    {createReportMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                    ) : null}
                    Save as Draft
                  </Button>
                  <Button
                    className="gap-1.5 bg-cyan-600 hover:bg-cyan-700 text-white"
                    onClick={() => handleLqaSubmit(false)}
                    disabled={createReportMutation.isPending}
                  >
                    {createReportMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                    ) : null}
                    Submit LQA Report
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════════════════════════════════════════════ */}
        {/* TAB 4: Quality Analytics                        */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="analytics" className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-white/[0.06] bg-card">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground mb-1">Total Reports</p>
                <p className="text-2xl font-bold text-foreground tabular-nums">{analytics.total}</p>
              </CardContent>
            </Card>
            <Card className="border-white/[0.06] bg-card">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground mb-1">Average QS Score</p>
                <p className={`text-2xl font-bold tabular-nums ${
                  analytics.avgQs >= 4.5 ? "text-emerald-400" :
                  analytics.avgQs >= 3.5 ? "text-blue-400" :
                  analytics.avgQs > 0 ? "text-amber-400" :
                  "text-muted-foreground"
                }`}>
                  {analytics.avgQs > 0 ? analytics.avgQs.toFixed(2) : "--"}
                </p>
              </CardContent>
            </Card>
            <Card className="border-white/[0.06] bg-card">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground mb-1">Average LQA Score</p>
                <p className={`text-2xl font-bold tabular-nums ${
                  analytics.avgLqa >= 90 ? "text-emerald-400" :
                  analytics.avgLqa >= 70 ? "text-blue-400" :
                  analytics.avgLqa > 0 ? "text-amber-400" :
                  "text-muted-foreground"
                }`}>
                  {analytics.avgLqa > 0 ? analytics.avgLqa.toFixed(1) : "--"}
                </p>
              </CardContent>
            </Card>
            <Card className="border-white/[0.06] bg-card">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground mb-1">Reports This Month</p>
                <p className="text-2xl font-bold text-foreground tabular-nums">{analytics.thisMonth}</p>
              </CardContent>
            </Card>
          </div>

          {/* Reports by type */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-white/[0.06] bg-card">
              <CardHeader>
                <CardTitle className="text-sm font-medium">Reports by Type</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {typeBadge("QS")}
                      <span className="text-sm text-foreground">Quality Score</span>
                    </div>
                    <span className="text-sm font-medium tabular-nums text-foreground">{analytics.qsCount}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full bg-purple-500 rounded-full transition-all"
                      style={{ width: analytics.total > 0 ? `${(analytics.qsCount / analytics.total) * 100}%` : "0%" }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {typeBadge("LQA")}
                      <span className="text-sm text-foreground">Language Quality Assessment</span>
                    </div>
                    <span className="text-sm font-medium tabular-nums text-foreground">{analytics.lqaCount}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full bg-cyan-500 rounded-full transition-all"
                      style={{ width: analytics.total > 0 ? `${(analytics.lqaCount / analytics.total) * 100}%` : "0%" }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Top vendors */}
            <Card className="border-white/[0.06] bg-card">
              <CardHeader>
                <CardTitle className="text-sm font-medium">Top Vendors by Quality</CardTitle>
              </CardHeader>
              <CardContent>
                {analytics.topVendors.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No data available yet.</p>
                ) : (
                  <div className="rounded-lg border border-white/[0.06] overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/[0.06] hover:bg-transparent">
                          <TableHead className="text-[10px] text-muted-foreground font-medium">Vendor</TableHead>
                          <TableHead className="text-[10px] text-muted-foreground font-medium">Avg Score</TableHead>
                          <TableHead className="text-[10px] text-muted-foreground font-medium">Reports</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analytics.topVendors.map((v, idx) => (
                          <TableRow key={idx} className="border-white/[0.04]">
                            <TableCell className="text-sm font-medium text-foreground">{v.name}</TableCell>
                            <TableCell className="text-sm tabular-nums">
                              <span className={
                                v.avgScore >= 90 || v.avgScore >= 4.5 ? "text-emerald-400" :
                                v.avgScore >= 70 || v.avgScore >= 3.5 ? "text-blue-400" :
                                "text-amber-400"
                              }>
                                {v.avgScore.toFixed(2)}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm tabular-nums text-muted-foreground">{v.count}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ═══════════════════════════════════════════════ */}
      {/* Report Detail Dialog                            */}
      {/* ═══════════════════════════════════════════════ */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="bg-card border border-white/[0.08] text-foreground max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedReport && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base font-semibold flex items-center gap-2">
                  {typeBadge(selectedReport.reportType)}
                  <span>Report #{selectedReport.id}</span>
                  <span className="ml-2">{statusBadge(selectedReport.status)}</span>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-5 mt-3">
                {/* Report Info Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Vendor</p>
                    <p className="text-sm font-medium text-foreground">
                      {selectedReport.vendorName ?? `Vendor ${selectedReport.vendorId}`}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Project</p>
                    <p className="text-sm text-foreground">{selectedReport.projectName}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Account</p>
                    <p className="text-sm text-foreground">{selectedReport.clientAccount || "--"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Language Pair</p>
                    <p className="text-sm text-foreground">
                      {selectedReport.sourceLanguage && selectedReport.targetLanguage
                        ? `${selectedReport.sourceLanguage} > ${selectedReport.targetLanguage}`
                        : "--"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Job Type</p>
                    <p className="text-sm text-foreground">{selectedReport.jobType || "--"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Date</p>
                    <p className="text-sm text-foreground">
                      {formatDate(selectedReport.reportDate || selectedReport.createdAt)}
                    </p>
                  </div>
                  {selectedReport.wordCount != null && (
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Word Count</p>
                      <p className="text-sm text-foreground tabular-nums">
                        {selectedReport.wordCount.toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>

                {/* Score display */}
                {selectedReport.reportType === "QS" && selectedReport.qsScore != null && (
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">QS Score</p>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`w-5 h-5 ${
                              selectedReport.qsScore! >= star
                                ? "fill-amber-400 text-amber-400"
                                : selectedReport.qsScore! >= star - 0.5
                                ? "fill-amber-400/50 text-amber-400"
                                : "fill-transparent text-muted-foreground/30"
                            }`}
                          />
                        ))}
                      </div>
                      <span className={`text-2xl font-bold tabular-nums ${
                        selectedReport.qsScore >= 4.5 ? "text-emerald-400" :
                        selectedReport.qsScore >= 3.5 ? "text-blue-400" :
                        "text-amber-400"
                      }`}>
                        {selectedReport.qsScore.toFixed(1)}
                      </span>
                    </div>
                  </div>
                )}

                {selectedReport.reportType === "LQA" && selectedReport.lqaScore != null && (
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">LQA Score</p>
                      {selectedReport.lqaWordsReviewed && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {selectedReport.lqaWordsReviewed.toLocaleString()} words reviewed
                        </p>
                      )}
                    </div>
                    <span className={`text-3xl font-bold tabular-nums ${
                      selectedReport.lqaScore >= 90 ? "text-emerald-400" :
                      selectedReport.lqaScore >= 70 ? "text-blue-400" :
                      selectedReport.lqaScore >= 50 ? "text-amber-400" :
                      "text-red-400"
                    }`}>
                      {selectedReport.lqaScore.toFixed(1)}
                    </span>
                  </div>
                )}

                {/* LQA Entries Table */}
                {selectedReport.reportType === "LQA" && selectedReport.lqaEntries && selectedReport.lqaEntries.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">LQA Entries</p>
                    <div className="rounded-lg border border-white/[0.06] overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-white/[0.06] hover:bg-transparent">
                            <TableHead className="text-[10px] text-muted-foreground font-medium w-8">#</TableHead>
                            <TableHead className="text-[10px] text-muted-foreground font-medium">Source</TableHead>
                            <TableHead className="text-[10px] text-muted-foreground font-medium">Target</TableHead>
                            <TableHead className="text-[10px] text-muted-foreground font-medium">Revised</TableHead>
                            <TableHead className="text-[10px] text-muted-foreground font-medium">Category</TableHead>
                            <TableHead className="text-[10px] text-muted-foreground font-medium">Severity</TableHead>
                            <TableHead className="text-[10px] text-muted-foreground font-medium">Comment</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedReport.lqaEntries.map((entry, idx) => (
                            <TableRow key={idx} className="border-white/[0.04]">
                              <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                              <TableCell className="text-xs max-w-[150px]">{entry.sourceText || "--"}</TableCell>
                              <TableCell className="text-xs max-w-[150px]">{entry.targetText || "--"}</TableCell>
                              <TableCell className="text-xs max-w-[150px]">{entry.revisedTarget || "--"}</TableCell>
                              <TableCell className="text-xs">{entry.errorCategory || "--"}</TableCell>
                              <TableCell className="text-xs">
                                <span className={
                                  entry.severity === "Critical" ? "text-red-400" :
                                  entry.severity === "Major" ? "text-orange-400" :
                                  entry.severity === "Minor" ? "text-amber-400" :
                                  "text-slate-400"
                                }>
                                  {entry.severity || "--"}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs max-w-[150px]">{entry.comment || "--"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* LQA Error Summary in detail */}
                {selectedReport.reportType === "LQA" && selectedReport.lqaErrors && selectedReport.lqaErrors.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Error Summary</p>
                    <div className="rounded-lg border border-white/[0.06] overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-white/[0.06] hover:bg-transparent">
                            <TableHead className="text-[10px] text-muted-foreground font-medium">Category</TableHead>
                            <TableHead className="text-[10px] text-muted-foreground font-medium">Severity</TableHead>
                            <TableHead className="text-[10px] text-muted-foreground font-medium">Count</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedReport.lqaErrors.map((err, idx) => (
                            <TableRow key={idx} className="border-white/[0.04]">
                              <TableCell className="text-xs">{err.category}</TableCell>
                              <TableCell className="text-xs">
                                <span className={
                                  err.severity === "Critical" ? "text-red-400" :
                                  err.severity === "Major" ? "text-orange-400" :
                                  err.severity === "Minor" ? "text-amber-400" :
                                  "text-slate-400"
                                }>
                                  {err.severity}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs tabular-nums">{err.count}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Reviewer Comments */}
                {selectedReport.reviewerComments && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Reviewer Comments</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap bg-white/[0.02] rounded-lg border border-white/[0.06] p-3">
                      {selectedReport.reviewerComments}
                    </p>
                  </div>
                )}

                {/* Vendor Feedback */}
                {selectedReport.vendorFeedback && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Vendor Feedback</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap bg-white/[0.02] rounded-lg border border-white/[0.06] p-3">
                      {selectedReport.vendorFeedback}
                    </p>
                  </div>
                )}

                {/* Status Workflow Actions */}
                <div className="border-t border-white/[0.06] pt-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">Actions</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {selectedReport.status === "draft" && (
                      <Button
                        size="sm"
                        className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                        disabled={submitReportMutation.isPending}
                        onClick={() => {
                          submitReportMutation.mutate(selectedReport.id, {
                            onSuccess: () => setDetailDialogOpen(false),
                          });
                        }}
                      >
                        {submitReportMutation.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : null}
                        Submit for Review
                      </Button>
                    )}
                    {selectedReport.status === "submitted" && (
                      <Badge variant="outline" className="text-blue-400 border-blue-400/30">
                        Pending Review
                      </Badge>
                    )}
                    {selectedReport.status === "pending_translator_review" && (
                      <>
                        <Badge variant="outline" className="text-amber-400 border-amber-400/30">
                          Awaiting Translator Response
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-red-400 border-red-400/30 hover:bg-red-400/10"
                          disabled={disputeReportMutation.isPending}
                          onClick={() => {
                            disputeReportMutation.mutate(selectedReport.id, {
                              onSuccess: () => setDetailDialogOpen(false),
                            });
                          }}
                        >
                          {disputeReportMutation.isPending ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : null}
                          Dispute
                        </Button>
                      </>
                    )}
                    {selectedReport.status === "translator_accepted" && (
                      <Badge variant="outline" className="text-emerald-400 border-emerald-400/30">
                        Accepted by Translator
                      </Badge>
                    )}
                    {selectedReport.status === "translator_disputed" && (
                      <Badge variant="outline" className="text-red-400 border-red-400/30">
                        Disputed - Pending Arbitration
                      </Badge>
                    )}
                    {selectedReport.status === "pending_arbitration" && (
                      <Badge variant="outline" className="text-purple-400 border-purple-400/30">
                        Under Arbitration
                      </Badge>
                    )}
                    {selectedReport.status === "finalized" && (
                      <Badge variant="outline" className="text-emerald-400 border-emerald-400/30">
                        Finalized
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
