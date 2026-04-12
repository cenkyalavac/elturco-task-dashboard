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
  Zap,
  ClipboardList,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

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

const MQM_CATEGORIES = ["Accuracy", "Fluency", "Terminology", "Style", "Locale conventions"];

const MQM_SEVERITY_WEIGHTS: Record<string, number> = {
  minor: 1,
  major: 5,
  critical: 10,
};

function createEmptyMqmRows(): MqmErrorRow[] {
  return MQM_CATEGORIES.map((cat) => ({ category: cat, minor: 0, major: 0, critical: 0 }));
}

function calcMqmLqaScore(rows: MqmErrorRow[]): number {
  let totalPenalty = 0;
  for (const row of rows) {
    totalPenalty += row.minor * MQM_SEVERITY_WEIGHTS.minor
      + row.major * MQM_SEVERITY_WEIGHTS.major
      + row.critical * MQM_SEVERITY_WEIGHTS.critical;
  }
  return Math.max(0, 100 - totalPenalty);
}

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

interface Project {
  id: number;
  projectName: string;
  code?: string;
  status?: string;
}

interface MqmErrorRow {
  category: string;
  minor: number;
  major: number;
  critical: number;
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
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${s.className}`}>
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

// ── Faz 6: LQA (MQM) Tab ──

const MQM_FULL_CATEGORIES = [
  { name: "Accuracy", subcategories: ["Mistranslation", "Omission", "Addition", "Untranslated", "Over-translation"] },
  { name: "Fluency", subcategories: ["Grammar", "Punctuation", "Spelling", "Register", "Coherence"] },
  { name: "Terminology", subcategories: ["Inconsistent", "Wrong term", "Non-standard"] },
  { name: "Style", subcategories: ["Awkward", "Inconsistent style", "Unidiomatic"] },
  { name: "Locale Convention", subcategories: ["Date/time format", "Number format", "Currency", "Measurement"] },
  { name: "Verity", subcategories: ["Culture-specific reference", "Text direction"] },
] as const;

const SEVERITY_OPTIONS = [
  { value: "critical", label: "Critical (5 pts)", color: "text-red-400" },
  { value: "major", label: "Major (3 pts)", color: "text-amber-400" },
  { value: "minor", label: "Minor (1 pt)", color: "text-blue-400" },
  { value: "preferential", label: "Preferential (0 pts)", color: "text-white/40" },
] as const;

function Faz6LqaTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [newError, setNewError] = useState({ category: "", subcategory: "", severity: "minor", segmentText: "", errorDescription: "" });
  const [newReport, setNewReport] = useState({ vendorId: 0, sourceLanguage: "", targetLanguage: "", wordCount: 0, passThreshold: 98, notes: "" });

  const { data: lqaReports = [], isLoading } = useQuery({
    queryKey: ["/api/quality/lqa-reports"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/quality/lqa-reports"); return r.json(); },
  });

  const { data: vendorList = [] } = useQuery({
    queryKey: ["/api/vendors?status=all&limit=500"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/vendors?status=all&limit=500"); const d = await r.json(); return d.vendors || d || []; },
  });

  const { data: reportDetail } = useQuery({
    queryKey: ["/api/quality/lqa-reports", selectedReport?.id],
    queryFn: async () => { const r = await apiRequest("GET", `/api/quality/lqa-reports/${selectedReport.id}`); return r.json(); },
    enabled: !!selectedReport?.id,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => { const r = await apiRequest("POST", "/api/quality/lqa-reports", data); return r.json(); },
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ["/api/quality/lqa-reports"] }); setCreateOpen(false); setSelectedReport(data); toast({ title: "LQA report created" }); },
  });

  const addErrorMutation = useMutation({
    mutationFn: async ({ reportId, data }: { reportId: number; data: any }) => { const r = await apiRequest("POST", `/api/quality/lqa-reports/${reportId}/errors`, data); return r.json(); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/quality/lqa-reports", selectedReport?.id] }); toast({ title: "Error added" }); setNewError({ category: "", subcategory: "", severity: "minor", segmentText: "", errorDescription: "" }); },
  });

  const submitMutation = useMutation({
    mutationFn: async (reportId: number) => { const r = await apiRequest("POST", `/api/quality/lqa-reports/${reportId}/submit`); return r.json(); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/quality/lqa-reports"] }); qc.invalidateQueries({ queryKey: ["/api/quality/lqa-reports", selectedReport?.id] }); toast({ title: "LQA report submitted" }); },
  });

  const removeErrorMutation = useMutation({
    mutationFn: async ({ reportId, errorId }: { reportId: number; errorId: number }) => { await apiRequest("DELETE", `/api/quality/lqa-reports/${reportId}/errors/${errorId}`); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/quality/lqa-reports", selectedReport?.id] }); toast({ title: "Error removed" }); },
  });

  const currentCat = MQM_FULL_CATEGORIES.find(c => c.name === newError.category);

  if (selectedReport) {
    const detail = reportDetail || selectedReport;
    const errors = detail.errors || [];
    const score = detail.total_score != null ? Number(detail.total_score) : null;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setSelectedReport(null)}><ChevronLeft className="w-4 h-4" /> Back</Button>
          <h2 className="text-sm font-semibold text-white">LQA Report #{detail.id}</h2>
          <Badge className={`text-[9px] ${detail.status === "draft" ? "bg-zinc-500/15 text-zinc-400" : detail.status === "submitted" ? "bg-blue-500/15 text-blue-400" : "bg-emerald-500/15 text-emerald-400"}`}>{detail.status}</Badge>
          {score != null && <span className={`text-sm font-mono ${score >= 98 ? "text-emerald-400" : score >= 85 ? "text-amber-400" : "text-red-400"}`}>{score.toFixed(1)}</span>}
          {detail.pass_fail && detail.pass_fail !== "pending" && <Badge className={`text-[9px] ${detail.pass_fail === "pass" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>{detail.pass_fail}</Badge>}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="bg-white/[0.03] rounded-lg p-3"><span className="text-white/40">Language</span><p className="text-white/80 mt-1">{detail.source_language}→{detail.target_language}</p></div>
          <div className="bg-white/[0.03] rounded-lg p-3"><span className="text-white/40">Word Count</span><p className="text-white/80 mt-1">{detail.word_count || "—"}</p></div>
          <div className="bg-white/[0.03] rounded-lg p-3"><span className="text-white/40">Threshold</span><p className="text-white/80 mt-1">{detail.pass_threshold || 98}%</p></div>
          <div className="bg-white/[0.03] rounded-lg p-3"><span className="text-white/40">Errors</span><p className="text-white/80 mt-1">{errors.length}</p></div>
        </div>

        {/* Error list */}
        {errors.length > 0 && (
          <Card className="bg-[#12141c] border-white/[0.06]">
            <CardHeader className="pb-2"><CardTitle className="text-xs text-white/60">Errors Found</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow className="border-white/[0.06]">
                  <TableHead className="text-[10px] text-white/40">Category</TableHead>
                  <TableHead className="text-[10px] text-white/40">Subcategory</TableHead>
                  <TableHead className="text-[10px] text-white/40">Severity</TableHead>
                  <TableHead className="text-[10px] text-white/40">Points</TableHead>
                  <TableHead className="text-[10px] text-white/40">Description</TableHead>
                  {detail.status === "draft" && <TableHead className="text-[10px] text-white/40 w-8"></TableHead>}
                </TableRow></TableHeader>
                <TableBody>
                  {errors.map((e: any) => (
                    <TableRow key={e.id} className="border-white/[0.03]">
                      <TableCell className="text-[11px] text-white/70">{e.category}</TableCell>
                      <TableCell className="text-[11px] text-white/50">{e.subcategory || "—"}</TableCell>
                      <TableCell><Badge className={`text-[9px] ${e.severity === "critical" ? "bg-red-500/15 text-red-400" : e.severity === "major" ? "bg-amber-500/15 text-amber-400" : e.severity === "minor" ? "bg-blue-500/15 text-blue-400" : "bg-zinc-500/15 text-zinc-400"}`}>{e.severity}</Badge></TableCell>
                      <TableCell className="text-[11px] text-white/60 font-mono">{e.penalty_points}</TableCell>
                      <TableCell className="text-[11px] text-white/50 max-w-[200px] truncate">{e.error_description || e.segment_text || "—"}</TableCell>
                      {detail.status === "draft" && <TableCell><Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeErrorMutation.mutate({ reportId: detail.id, errorId: e.id })}><Trash2 className="w-3 h-3 text-red-400" /></Button></TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Add error form (only for drafts) */}
        {detail.status === "draft" && (
          <Card className="bg-[#12141c] border-white/[0.06]">
            <CardHeader className="pb-2"><CardTitle className="text-xs text-white/60">Add Error</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <Label className="text-[10px] text-white/40">Category</Label>
                  <Select value={newError.category} onValueChange={(v) => setNewError({ ...newError, category: v, subcategory: "" })}>
                    <SelectTrigger className="h-8 text-xs bg-white/[0.03] border-white/[0.08]"><SelectValue placeholder="Category" /></SelectTrigger>
                    <SelectContent>{MQM_FULL_CATEGORIES.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] text-white/40">Subcategory</Label>
                  <Select value={newError.subcategory} onValueChange={(v) => setNewError({ ...newError, subcategory: v })}>
                    <SelectTrigger className="h-8 text-xs bg-white/[0.03] border-white/[0.08]"><SelectValue placeholder="Subcategory" /></SelectTrigger>
                    <SelectContent>{(currentCat?.subcategories || []).map((s: string) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] text-white/40">Severity</Label>
                  <Select value={newError.severity} onValueChange={(v) => setNewError({ ...newError, severity: v })}>
                    <SelectTrigger className="h-8 text-xs bg-white/[0.03] border-white/[0.08]"><SelectValue /></SelectTrigger>
                    <SelectContent>{SEVERITY_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] text-white/40">Description</Label>
                  <Input className="h-8 text-xs bg-white/[0.03] border-white/[0.08]" placeholder="Error description" value={newError.errorDescription} onChange={(e) => setNewError({ ...newError, errorDescription: e.target.value })} />
                </div>
              </div>
              <div className="flex justify-end">
                <Button size="sm" className="text-xs" disabled={!newError.category || !newError.severity || addErrorMutation.isPending}
                  onClick={() => addErrorMutation.mutate({ reportId: detail.id, data: newError })}>
                  {addErrorMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />} Add Error
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {detail.status === "draft" && (
          <div className="flex justify-end">
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={submitMutation.isPending}
              onClick={() => submitMutation.mutate(detail.id)}>
              {submitMutation.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />} Submit Report
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-white/60">MQM-based Language Quality Assessment Reports</p>
        <Button size="sm" className="gap-1.5 bg-white text-black hover:bg-white/90 font-medium rounded-lg" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4" /> New LQA Report</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <Table>
          <TableHeader><TableRow className="border-white/[0.06]">
            <TableHead className="text-[10px] text-white/40">ID</TableHead>
            <TableHead className="text-[10px] text-white/40">Vendor</TableHead>
            <TableHead className="text-[10px] text-white/40">Languages</TableHead>
            <TableHead className="text-[10px] text-white/40">Score</TableHead>
            <TableHead className="text-[10px] text-white/40">Pass/Fail</TableHead>
            <TableHead className="text-[10px] text-white/40">Status</TableHead>
            <TableHead className="text-[10px] text-white/40">Created</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {(lqaReports as any[]).map((r: any) => (
              <TableRow key={r.id} className="border-white/[0.03] cursor-pointer hover:bg-white/[0.02]" onClick={() => setSelectedReport(r)}>
                <TableCell className="text-[11px] text-white/50">#{r.id}</TableCell>
                <TableCell className="text-[11px] text-white/70">{(vendorList as any[]).find((v: any) => v.id === r.vendor_id)?.fullName || `Vendor #${r.vendor_id}`}</TableCell>
                <TableCell className="text-[11px] text-white/50">{r.source_language}→{r.target_language}</TableCell>
                <TableCell className={`text-[11px] font-mono ${r.total_score != null ? (Number(r.total_score) >= 98 ? "text-emerald-400" : Number(r.total_score) >= 85 ? "text-amber-400" : "text-red-400") : "text-white/30"}`}>{r.total_score != null ? Number(r.total_score).toFixed(1) : "—"}</TableCell>
                <TableCell><Badge className={`text-[9px] ${r.pass_fail === "pass" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" : r.pass_fail === "fail" ? "bg-red-500/15 text-red-400 border-red-500/25" : "bg-zinc-500/15 text-zinc-400 border-zinc-500/25"}`}>{r.pass_fail || "pending"}</Badge></TableCell>
                <TableCell><Badge className={`text-[9px] ${r.status === "draft" ? "bg-zinc-500/15 text-zinc-400" : r.status === "submitted" ? "bg-blue-500/15 text-blue-400" : "bg-emerald-500/15 text-emerald-400"}`}>{r.status}</Badge></TableCell>
                <TableCell className="text-[10px] text-white/30">{r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Create LQA Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-card border border-white/[0.08] text-foreground max-w-md">
          <DialogHeader><DialogTitle className="text-white">New LQA Report (MQM)</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-[10px] text-white/40">Vendor</Label>
              <Select value={newReport.vendorId ? String(newReport.vendorId) : ""} onValueChange={(v) => setNewReport({ ...newReport, vendorId: +v })}>
                <SelectTrigger className="h-8 text-xs bg-white/[0.03] border-white/[0.08]"><SelectValue placeholder="Select vendor" /></SelectTrigger>
                <SelectContent>{(vendorList as any[]).slice(0, 100).map((v: any) => <SelectItem key={v.id} value={String(v.id)}>{v.fullName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-[10px] text-white/40">Source Lang</Label><Input className="h-8 text-xs bg-white/[0.03] border-white/[0.08]" placeholder="EN" value={newReport.sourceLanguage} onChange={(e) => setNewReport({ ...newReport, sourceLanguage: e.target.value })} /></div>
              <div><Label className="text-[10px] text-white/40">Target Lang</Label><Input className="h-8 text-xs bg-white/[0.03] border-white/[0.08]" placeholder="TR" value={newReport.targetLanguage} onChange={(e) => setNewReport({ ...newReport, targetLanguage: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-[10px] text-white/40">Word Count</Label><Input className="h-8 text-xs bg-white/[0.03] border-white/[0.08]" type="number" value={newReport.wordCount || ""} onChange={(e) => setNewReport({ ...newReport, wordCount: +e.target.value })} /></div>
              <div><Label className="text-[10px] text-white/40">Pass Threshold (%)</Label><Input className="h-8 text-xs bg-white/[0.03] border-white/[0.08]" type="number" value={newReport.passThreshold} onChange={(e) => setNewReport({ ...newReport, passThreshold: +e.target.value })} /></div>
            </div>
            <div><Label className="text-[10px] text-white/40">Notes</Label><Textarea className="text-xs bg-white/[0.03] border-white/[0.08]" rows={2} value={newReport.notes} onChange={(e) => setNewReport({ ...newReport, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={!newReport.vendorId || createMutation.isPending}
              onClick={() => createMutation.mutate(newReport)}>
              {createMutation.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />} Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Faz 6: RCA Tab ──

function Faz6RcaTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [newRca, setNewRca] = useState({ title: "", category: "Translation", rootCause: "", impact: "medium", correctiveAction: "", preventiveAction: "" });

  const { data: rcaReports = [], isLoading } = useQuery({
    queryKey: ["/api/quality/rca"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/quality/rca"); return r.json(); },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => { const r = await apiRequest("POST", "/api/quality/rca", data); return r.json(); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/quality/rca"] }); setCreateOpen(false); toast({ title: "RCA report created" }); },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => { const r = await apiRequest("PATCH", `/api/quality/rca/${id}`, { status }); return r.json(); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/quality/rca"] }); toast({ title: "RCA status updated" }); },
  });

  const RCA_CATEGORIES = ["Translation", "Process", "Technology", "Communication", "Training", "Resource"];
  const RCA_STATUSES = ["open", "in_progress", "implemented", "verified", "closed"];
  const statusColors: Record<string, string> = { open: "bg-red-500/15 text-red-400", in_progress: "bg-amber-500/15 text-amber-400", implemented: "bg-blue-500/15 text-blue-400", verified: "bg-emerald-500/15 text-emerald-400", closed: "bg-zinc-500/15 text-zinc-400" };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-white/60">Root Cause Analysis Reports</p>
        <Button size="sm" className="gap-1.5 bg-white text-black hover:bg-white/90 font-medium rounded-lg" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4" /> New RCA</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <Table>
          <TableHeader><TableRow className="border-white/[0.06]">
            <TableHead className="text-[10px] text-white/40">ID</TableHead>
            <TableHead className="text-[10px] text-white/40">Title</TableHead>
            <TableHead className="text-[10px] text-white/40">Category</TableHead>
            <TableHead className="text-[10px] text-white/40">Impact</TableHead>
            <TableHead className="text-[10px] text-white/40">Status</TableHead>
            <TableHead className="text-[10px] text-white/40">Assigned To</TableHead>
            <TableHead className="text-[10px] text-white/40">Due</TableHead>
            <TableHead className="text-[10px] text-white/40">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {(rcaReports as any[]).map((r: any) => (
              <TableRow key={r.id} className="border-white/[0.03]">
                <TableCell className="text-[11px] text-white/50">#{r.id}</TableCell>
                <TableCell className="text-[11px] text-white/70 max-w-[200px] truncate">{r.title}</TableCell>
                <TableCell className="text-[11px] text-white/50">{r.category}</TableCell>
                <TableCell><Badge className={`text-[9px] ${r.impact === "high" ? "bg-red-500/15 text-red-400" : r.impact === "medium" ? "bg-amber-500/15 text-amber-400" : "bg-blue-500/15 text-blue-400"}`}>{r.impact || "—"}</Badge></TableCell>
                <TableCell>
                  <Select value={r.status} onValueChange={(v) => updateStatusMutation.mutate({ id: r.id, status: v })}>
                    <SelectTrigger className="h-6 text-[10px] bg-transparent border-0 p-0 w-auto"><Badge className={`text-[9px] ${statusColors[r.status] || "bg-zinc-500/15 text-zinc-400"}`}>{r.status}</Badge></SelectTrigger>
                    <SelectContent>{RCA_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-[11px] text-white/50">{r.assigned_to_name || "—"}</TableCell>
                <TableCell className="text-[10px] text-white/30">{r.due_date || "—"}</TableCell>
                <TableCell><Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setSelectedReport && undefined}><Eye className="w-3 h-3 text-white/40" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Create RCA Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-card border border-white/[0.08] text-foreground max-w-lg">
          <DialogHeader><DialogTitle className="text-white">New Root Cause Analysis</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-[10px] text-white/40">Title</Label><Input className="h-8 text-xs bg-white/[0.03] border-white/[0.08]" value={newRca.title} onChange={(e) => setNewRca({ ...newRca, title: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px] text-white/40">Category</Label>
                <Select value={newRca.category} onValueChange={(v) => setNewRca({ ...newRca, category: v })}>
                  <SelectTrigger className="h-8 text-xs bg-white/[0.03] border-white/[0.08]"><SelectValue /></SelectTrigger>
                  <SelectContent>{RCA_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] text-white/40">Impact</Label>
                <Select value={newRca.impact} onValueChange={(v) => setNewRca({ ...newRca, impact: v })}>
                  <SelectTrigger className="h-8 text-xs bg-white/[0.03] border-white/[0.08]"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="high">High</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="low">Low</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div><Label className="text-[10px] text-white/40">Root Cause</Label><Textarea className="text-xs bg-white/[0.03] border-white/[0.08]" rows={2} value={newRca.rootCause} onChange={(e) => setNewRca({ ...newRca, rootCause: e.target.value })} /></div>
            <div><Label className="text-[10px] text-white/40">Corrective Action</Label><Textarea className="text-xs bg-white/[0.03] border-white/[0.08]" rows={2} value={newRca.correctiveAction} onChange={(e) => setNewRca({ ...newRca, correctiveAction: e.target.value })} /></div>
            <div><Label className="text-[10px] text-white/40">Preventive Action</Label><Textarea className="text-xs bg-white/[0.03] border-white/[0.08]" rows={2} value={newRca.preventiveAction} onChange={(e) => setNewRca({ ...newRca, preventiveAction: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={!newRca.title || !newRca.rootCause || createMutation.isPending}
              onClick={() => createMutation.mutate(newRca)}>
              {createMutation.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />} Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Faz 6: Customer Feedback Tab ──

function Faz6FeedbackTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [newFeedback, setNewFeedback] = useState({ overallRating: 5, accuracyRating: 5, timelinessRating: 5, communicationRating: 5, comments: "" });

  const { data: feedbacks = [], isLoading } = useQuery({
    queryKey: ["/api/quality/customer-feedback"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/quality/customer-feedback"); return r.json(); },
  });

  const { data: summary } = useQuery({
    queryKey: ["/api/quality/customer-feedback/summary"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/quality/customer-feedback/summary"); return r.json(); },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => { const r = await apiRequest("POST", "/api/quality/customer-feedback", data); return r.json(); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/quality/customer-feedback"] }); qc.invalidateQueries({ queryKey: ["/api/quality/customer-feedback/summary"] }); setCreateOpen(false); toast({ title: "Feedback submitted" }); },
  });

  const renderStars = (rating: number) => [...Array(5)].map((_, i) => <Star key={i} className={`w-3 h-3 ${i < rating ? "text-amber-400 fill-amber-400" : "text-white/10"}`} />);

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-[#12141c] border-white/[0.06]"><CardContent className="p-3">
            <p className="text-[10px] text-white/40 mb-1">Overall Avg</p>
            <div className="flex items-center gap-1">{renderStars(Math.round(Number(summary.avg_overall || 0)))}<span className="text-xs text-white/70 ml-1">{summary.avg_overall || "—"}</span></div>
          </CardContent></Card>
          <Card className="bg-[#12141c] border-white/[0.06]"><CardContent className="p-3">
            <p className="text-[10px] text-white/40 mb-1">Accuracy</p>
            <p className="text-lg font-bold text-blue-400">{summary.avg_accuracy || "—"}</p>
          </CardContent></Card>
          <Card className="bg-[#12141c] border-white/[0.06]"><CardContent className="p-3">
            <p className="text-[10px] text-white/40 mb-1">Timeliness</p>
            <p className="text-lg font-bold text-emerald-400">{summary.avg_timeliness || "—"}</p>
          </CardContent></Card>
          <Card className="bg-[#12141c] border-white/[0.06]"><CardContent className="p-3">
            <p className="text-[10px] text-white/40 mb-1">Total Feedback</p>
            <p className="text-lg font-bold text-white/70">{summary.total_feedback || 0}</p>
          </CardContent></Card>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-white/60">Customer Satisfaction Feedback</p>
        <Button size="sm" className="gap-1.5 bg-white text-black hover:bg-white/90 font-medium rounded-lg" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4" /> Add Feedback</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <Table>
          <TableHeader><TableRow className="border-white/[0.06]">
            <TableHead className="text-[10px] text-white/40">Customer</TableHead>
            <TableHead className="text-[10px] text-white/40">Project</TableHead>
            <TableHead className="text-[10px] text-white/40">Overall</TableHead>
            <TableHead className="text-[10px] text-white/40">Accuracy</TableHead>
            <TableHead className="text-[10px] text-white/40">Timeliness</TableHead>
            <TableHead className="text-[10px] text-white/40">Communication</TableHead>
            <TableHead className="text-[10px] text-white/40">Comments</TableHead>
            <TableHead className="text-[10px] text-white/40">Date</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {(feedbacks as any[]).map((f: any) => (
              <TableRow key={f.id} className="border-white/[0.03]">
                <TableCell className="text-[11px] text-white/70">{f.customer_name || "—"}</TableCell>
                <TableCell className="text-[11px] text-white/50">{f.project_name || "—"}</TableCell>
                <TableCell><div className="flex gap-0.5">{renderStars(f.overall_rating)}</div></TableCell>
                <TableCell><div className="flex gap-0.5">{renderStars(f.accuracy_rating || 0)}</div></TableCell>
                <TableCell><div className="flex gap-0.5">{renderStars(f.timeliness_rating || 0)}</div></TableCell>
                <TableCell><div className="flex gap-0.5">{renderStars(f.communication_rating || 0)}</div></TableCell>
                <TableCell className="text-[10px] text-white/40 max-w-[150px] truncate">{f.comments || "—"}</TableCell>
                <TableCell className="text-[10px] text-white/30">{f.submitted_at ? new Date(f.submitted_at).toLocaleDateString() : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Create Feedback Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-card border border-white/[0.08] text-foreground max-w-md">
          <DialogHeader><DialogTitle className="text-white">Submit Customer Feedback</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {[{ key: "overallRating", label: "Overall Rating" }, { key: "accuracyRating", label: "Accuracy" }, { key: "timelinessRating", label: "Timeliness" }, { key: "communicationRating", label: "Communication" }].map(({ key, label }) => (
              <div key={key}>
                <Label className="text-[10px] text-white/40">{label}</Label>
                <div className="flex gap-1 mt-1">
                  {[1, 2, 3, 4, 5].map(v => (
                    <button key={v} onClick={() => setNewFeedback({ ...newFeedback, [key]: v })}
                      className="p-0.5"><Star className={`w-5 h-5 ${v <= (newFeedback as any)[key] ? "text-amber-400 fill-amber-400" : "text-white/10"}`} /></button>
                  ))}
                </div>
              </div>
            ))}
            <div><Label className="text-[10px] text-white/40">Comments</Label><Textarea className="text-xs bg-white/[0.03] border-white/[0.08]" rows={3} value={newFeedback.comments} onChange={(e) => setNewFeedback({ ...newFeedback, comments: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={createMutation.isPending} onClick={() => createMutation.mutate(newFeedback)}>
              {createMutation.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />} Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

  // ── Quick Score dialog state ──
  const [qsDialogOpen, setQsDialogOpen] = useState(false);
  const [qsDialogVendorId, setQsDialogVendorId] = useState("");
  const [qsDialogProjectId, setQsDialogProjectId] = useState("");
  const [qsDialogScore, setQsDialogScore] = useState(0);
  const [qsDialogNotes, setQsDialogNotes] = useState("");

  // ── LQA Form dialog state ──
  const [lqaDialogOpen, setLqaDialogOpen] = useState(false);
  const [lqaDialogVendorId, setLqaDialogVendorId] = useState("");
  const [lqaDialogProjectId, setLqaDialogProjectId] = useState("");
  const [lqaDialogWordCount, setLqaDialogWordCount] = useState("");
  const [lqaDialogMqmRows, setLqaDialogMqmRows] = useState<MqmErrorRow[]>(createEmptyMqmRows);
  const [lqaDialogComments, setLqaDialogComments] = useState("");

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

  const { data: vendors, isLoading: vendorsLoading } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/vendors?limit=500");
        const json = await res.json();
        return json.data ?? json ?? [];
      } catch {
        return [];
      }
    },
  });

  const { data: approvedVendors } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors", "approved"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/vendors?status=Approved&limit=500");
        const json = await res.json();
        return json.data ?? json ?? [];
      } catch {
        return [];
      }
    },
  });

  const { data: projects, isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects", "all"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/projects?limit=500");
        const json = await res.json();
        return json.data ?? json ?? [];
      } catch {
        return [];
      }
    },
  });

  const vendorList = vendors ?? [];
  const approvedVendorList = approvedVendors ?? [];
  const projectList = projects ?? [];

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

  // ── QS Quick Entry Dialog submit ──

  function handleQsDialogSubmit() {
    if (!qsDialogVendorId) {
      toast({ title: "Vendor is required", variant: "destructive" });
      return;
    }
    if (!qsDialogProjectId) {
      toast({ title: "Project is required", variant: "destructive" });
      return;
    }
    if (qsDialogScore <= 0) {
      toast({ title: "Score is required (click stars to rate)", variant: "destructive" });
      return;
    }

    const project = projectList.find((p) => String(p.id) === qsDialogProjectId);

    createReportMutation.mutate(
      {
        vendorId: parseInt(qsDialogVendorId),
        reportType: "QS",
        qsScore: qsDialogScore,
        projectName: project?.projectName ?? `Project ${qsDialogProjectId}`,
        reviewerComments: qsDialogNotes.trim() || null,
        status: "finalized",
        reportDate: todayISO(),
      },
      {
        onSuccess: () => {
          toast({ title: "QS Report created", description: "Quick score has been recorded." });
          resetQsDialog();
        },
      }
    );
  }

  function resetQsDialog() {
    setQsDialogOpen(false);
    setQsDialogVendorId("");
    setQsDialogProjectId("");
    setQsDialogScore(0);
    setQsDialogNotes("");
  }

  // ── LQA Form Dialog submit ──

  function handleLqaDialogSubmit() {
    if (!lqaDialogVendorId) {
      toast({ title: "Vendor is required", variant: "destructive" });
      return;
    }
    if (!lqaDialogProjectId) {
      toast({ title: "Project is required", variant: "destructive" });
      return;
    }
    const wordCountNum = parseInt(lqaDialogWordCount);
    if (!wordCountNum || wordCountNum <= 0) {
      toast({ title: "Word count must be greater than 0", variant: "destructive" });
      return;
    }

    const project = projectList.find((p) => String(p.id) === lqaDialogProjectId);
    const lqaScore = calcMqmLqaScore(lqaDialogMqmRows);
    const lqaErrors: LqaError[] = [];
    for (const row of lqaDialogMqmRows) {
      if (row.minor > 0) lqaErrors.push({ category: row.category, severity: "Minor", count: row.minor });
      if (row.major > 0) lqaErrors.push({ category: row.category, severity: "Major", count: row.major });
      if (row.critical > 0) lqaErrors.push({ category: row.category, severity: "Critical", count: row.critical });
    }

    createReportMutation.mutate(
      {
        vendorId: parseInt(lqaDialogVendorId),
        reportType: "LQA",
        lqaScore,
        wordCount: wordCountNum,
        projectName: project?.projectName ?? `Project ${lqaDialogProjectId}`,
        lqaErrors,
        reviewerComments: lqaDialogComments.trim() || null,
        status: "submitted",
        reportDate: todayISO(),
      },
      {
        onSuccess: () => {
          toast({ title: "LQA Report submitted", description: `LQA score: ${lqaScore}` });
          resetLqaDialog();
        },
      }
    );
  }

  function resetLqaDialog() {
    setLqaDialogOpen(false);
    setLqaDialogVendorId("");
    setLqaDialogProjectId("");
    setLqaDialogWordCount("");
    setLqaDialogMqmRows(createEmptyMqmRows());
    setLqaDialogComments("");
  }

  function updateMqmRow(index: number, field: "minor" | "major" | "critical", value: number) {
    setLqaDialogMqmRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: Math.max(0, value) } : row))
    );
  }

  const lqaDialogCalculatedScore = useMemo(() => calcMqmLqaScore(lqaDialogMqmRows), [lqaDialogMqmRows]);

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

    // Monthly trend data for chart
    const monthMap: Record<string, { month: string; qsTotal: number; qsCount: number; lqaTotal: number; lqaCount: number }> = {};
    for (const r of allReports) {
      const d = new Date(r.reportDate || r.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!monthMap[key]) monthMap[key] = { month: key, qsTotal: 0, qsCount: 0, lqaTotal: 0, lqaCount: 0 };
      if (r.reportType === "QS" && r.qsScore != null) {
        monthMap[key].qsTotal += r.qsScore;
        monthMap[key].qsCount += 1;
      }
      if (r.reportType === "LQA" && r.lqaScore != null) {
        monthMap[key].lqaTotal += r.lqaScore;
        monthMap[key].lqaCount += 1;
      }
    }
    const monthlyTrend = Object.values(monthMap)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((m) => ({
        month: m.month,
        avgQs: m.qsCount > 0 ? +(m.qsTotal / m.qsCount).toFixed(2) : null,
        avgLqa: m.lqaCount > 0 ? +(m.lqaTotal / m.lqaCount).toFixed(1) : null,
      }));

    // Per-account breakdown
    const accountMap: Record<string, { account: string; qsTotal: number; qsCount: number; lqaTotal: number; lqaCount: number; totalReports: number }> = {};
    for (const r of allReports) {
      const acct = r.clientAccount || "Unassigned";
      if (!accountMap[acct]) accountMap[acct] = { account: acct, qsTotal: 0, qsCount: 0, lqaTotal: 0, lqaCount: 0, totalReports: 0 };
      accountMap[acct].totalReports += 1;
      if (r.reportType === "QS" && r.qsScore != null) {
        accountMap[acct].qsTotal += r.qsScore;
        accountMap[acct].qsCount += 1;
      }
      if (r.reportType === "LQA" && r.lqaScore != null) {
        accountMap[acct].lqaTotal += r.lqaScore;
        accountMap[acct].lqaCount += 1;
      }
    }
    const accountBreakdown = Object.values(accountMap)
      .map((a) => ({
        account: a.account,
        avgQs: a.qsCount > 0 ? +(a.qsTotal / a.qsCount).toFixed(2) : null,
        avgLqa: a.lqaCount > 0 ? +(a.lqaTotal / a.lqaCount).toFixed(1) : null,
        reportCount: a.totalReports,
      }))
      .sort((a, b) => b.reportCount - a.reportCount);

    return { total, qsCount: qsReports.length, lqaCount: lqaReports.length, avgQs, avgLqa, thisMonth, topVendors, monthlyTrend, accountBreakdown };
  }, [reports]);

  // ── Render ──

  const inputCls = "bg-white/[0.04] border-white/[0.08] text-foreground placeholder:text-muted-foreground focus:border-white/[0.2]";
  const selectTriggerCls = "bg-white/[0.04] border-white/[0.08] text-foreground focus:ring-0";

  // Top-level loading state: show skeleton UI while initial data loads
  const isInitialLoad = reportsLoading && vendorsLoading && projectsLoading;

  if (isInitialLoad) {
    return (
      <div className="p-6 space-y-6 max-w-[1400px] mx-auto" data-testid="quality-page-loading">
        <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.02] -mx-6 px-6 -mt-6 pt-6 pb-4 mb-2">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <h1 className="text-lg font-semibold text-white">Quality Management</h1>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-10 w-64 rounded-lg bg-white/[0.03]" />
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-xl bg-white/[0.03]" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Top-level error state: if the main reports query failed
  if (reportsError && !reportsData) {
    return (
      <div className="p-6 space-y-6 max-w-[1400px] mx-auto" data-testid="quality-page-error">
        <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.02] -mx-6 px-6 -mt-6 pt-6 pb-4 mb-2">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <h1 className="text-lg font-semibold text-white">Quality Management</h1>
        </div>
        <div className="bg-white/[0.03] border border-red-500/20 rounded-xl shadow-lg p-8 text-center">
          <p className="text-sm text-red-400 mb-4">Failed to load quality data. Please try again.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ["/api/quality-reports"] })}
            className="gap-1.5"
          >
            <Loader2 className="w-3.5 h-3.5" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto" data-testid="quality-page">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] -mx-6 px-6 -mt-6 pt-6 pb-4 mb-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <h1 className="text-lg font-semibold text-white">Quality Management</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="gap-1.5 bg-white text-black hover:bg-white/90 font-medium rounded-lg"
            onClick={() => setQsDialogOpen(true)}
          >
            <Zap className="w-4 h-4" />
            Quick Score
          </Button>
          <Button
            size="sm"
            className="gap-1.5 bg-white text-black hover:bg-white/90 font-medium rounded-lg"
            onClick={() => setLqaDialogOpen(true)}
          >
            <ClipboardList className="w-4 h-4" />
            LQA Report
          </Button>
        </div>
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
          <TabsTrigger value="lqa-v2" className="gap-1.5 text-xs">
            <ClipboardCheck className="w-3.5 h-3.5" />
            LQA (MQM)
          </TabsTrigger>
          <TabsTrigger value="rca" className="gap-1.5 text-xs">
            <Filter className="w-3.5 h-3.5" />
            RCA
          </TabsTrigger>
          <TabsTrigger value="feedback" className="gap-1.5 text-xs">
            <Star className="w-3.5 h-3.5" />
            Feedback
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
              className="gap-1.5 bg-white text-black hover:bg-white/90 font-medium rounded-lg"
              onClick={() => setActiveTab("qs-entry")}
            >
              <Plus className="w-4 h-4" />
              New QS Report
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-white text-black hover:bg-white/90 font-medium rounded-lg"
              onClick={() => setActiveTab("lqa-form")}
            >
              <Plus className="w-4 h-4" />
              New LQA Report
            </Button>
          </div>

          {/* Filters bar */}
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl shadow-lg p-4 space-y-3">
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
                <Skeleton key={i} className="h-10 rounded-xl bg-white/[0.03]" />
              ))}
            </div>
          ) : reportsError ? (
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl shadow-lg p-8 text-center text-white/40">
              Failed to load quality reports.
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl shadow-lg p-12 text-center">
              <ShieldCheck className="w-10 h-10 text-white/20 mx-auto mb-3" />
              <p className="text-white/60 text-sm">No quality reports found.</p>
              <p className="text-white/40 text-xs mt-1 mb-4">Adjust filters or create a new report.</p>
              <Button
                size="sm"
                className="bg-white text-black hover:bg-white/90 font-medium rounded-lg"
                onClick={() => setActiveTab("qs-entry")}
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Create Report
              </Button>
            </div>
          ) : (
            <>
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl shadow-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/[0.06] hover:bg-transparent">
                      <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3">Vendor</TableHead>
                      <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3">Type</TableHead>
                      <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3">Score</TableHead>
                      <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3">Project</TableHead>
                      <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3">Account</TableHead>
                      <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3">Lang Pair</TableHead>
                      <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3">Status</TableHead>
                      <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3">Date</TableHead>
                      <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3">Actions</TableHead>
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
                          className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors cursor-pointer"
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
            <Card className="bg-white/[0.03] border border-white/[0.06] rounded-xl shadow-lg">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2 text-white">
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
            <Card className="bg-white/[0.03] border border-white/[0.06] rounded-xl shadow-lg">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2 text-white">
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

                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl shadow-lg overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/[0.06] hover:bg-transparent">
                          <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3 w-8">#</TableHead>
                          <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3 min-w-[140px]">Source Text</TableHead>
                          <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3 min-w-[140px]">Target Text</TableHead>
                          <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3 min-w-[140px]">Revised Target</TableHead>
                          <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3 min-w-[130px]">Error Category</TableHead>
                          <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3 min-w-[110px]">Severity</TableHead>
                          <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3 min-w-[120px]">Comment</TableHead>
                          <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3 w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lqaEntries.map((entry, idx) => (
                          <TableRow key={idx} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
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
                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl shadow-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-white/[0.06] hover:bg-transparent">
                            <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3">Category</TableHead>
                            <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3">Severity</TableHead>
                            <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3">Count</TableHead>
                            <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3">Penalty</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lqaErrorSummary.map((err, idx) => (
                            <TableRow key={idx} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
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
            <Card className="bg-white/[0.03] border border-white/[0.06] rounded-xl shadow-lg">
              <CardContent className="p-5">
                <p className="text-xs text-white/40 mb-1">Total Reports</p>
                <p className="text-2xl font-bold text-white tabular-nums">{analytics.total}</p>
              </CardContent>
            </Card>
            <Card className="bg-white/[0.03] border border-white/[0.06] rounded-xl shadow-lg">
              <CardContent className="p-5">
                <p className="text-xs text-white/40 mb-1">Average QS Score</p>
                <p className={`text-2xl font-bold tabular-nums ${
                  analytics.avgQs >= 4.5 ? "text-emerald-400" :
                  analytics.avgQs >= 3.5 ? "text-blue-400" :
                  analytics.avgQs > 0 ? "text-amber-400" :
                  "text-white/20"
                }`}>
                  {analytics.avgQs > 0 ? analytics.avgQs.toFixed(2) : "--"}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-white/[0.03] border border-white/[0.06] rounded-xl shadow-lg">
              <CardContent className="p-5">
                <p className="text-xs text-white/40 mb-1">Average LQA Score</p>
                <p className={`text-2xl font-bold tabular-nums ${
                  analytics.avgLqa >= 90 ? "text-emerald-400" :
                  analytics.avgLqa >= 70 ? "text-blue-400" :
                  analytics.avgLqa > 0 ? "text-amber-400" :
                  "text-white/20"
                }`}>
                  {analytics.avgLqa > 0 ? analytics.avgLqa.toFixed(1) : "--"}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-white/[0.03] border border-white/[0.06] rounded-xl shadow-lg">
              <CardContent className="p-5">
                <p className="text-xs text-white/40 mb-1">Reports This Month</p>
                <p className="text-2xl font-bold text-white tabular-nums">{analytics.thisMonth}</p>
              </CardContent>
            </Card>
          </div>

          {/* QS & LQA Score Trend Chart */}
          <Card className="bg-white/[0.03] border border-white/[0.06] rounded-xl shadow-lg">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-white">QS &amp; LQA Score Trends</CardTitle>
            </CardHeader>
            <CardContent>
              {analytics.monthlyTrend.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No trend data available yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={analytics.monthlyTrend} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis
                      dataKey="month"
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                      axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="qs"
                      orientation="left"
                      domain={[0, 5]}
                      tick={{ fill: "#a78bfa", fontSize: 11 }}
                      axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                      tickLine={false}
                      label={{ value: "QS", angle: -90, position: "insideLeft", fill: "#a78bfa", fontSize: 11 }}
                    />
                    <YAxis
                      yAxisId="lqa"
                      orientation="right"
                      domain={[0, 100]}
                      tick={{ fill: "#22d3ee", fontSize: 11 }}
                      axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                      tickLine={false}
                      label={{ value: "LQA", angle: 90, position: "insideRight", fill: "#22d3ee", fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "8px",
                        color: "hsl(var(--foreground))",
                        fontSize: 12,
                      }}
                      formatter={(value: unknown, name: string) => {
                        const v = value as number | null;
                        if (v == null) return ["--", name];
                        return [name === "avgQs" ? v.toFixed(2) : v.toFixed(1), name === "avgQs" ? "Avg QS" : "Avg LQA"];
                      }}
                      labelFormatter={(label: string) => `Month: ${label}`}
                    />
                    <Legend
                      formatter={(value: string) => (value === "avgQs" ? "Avg QS Score" : "Avg LQA Score")}
                      wrapperStyle={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}
                    />
                    <Line
                      yAxisId="qs"
                      type="monotone"
                      dataKey="avgQs"
                      stroke="#a78bfa"
                      strokeWidth={2}
                      dot={{ r: 4, fill: "#a78bfa" }}
                      activeDot={{ r: 6 }}
                      connectNulls
                    />
                    <Line
                      yAxisId="lqa"
                      type="monotone"
                      dataKey="avgLqa"
                      stroke="#22d3ee"
                      strokeWidth={2}
                      dot={{ r: 4, fill: "#22d3ee" }}
                      activeDot={{ r: 6 }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Reports by type */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-white/[0.03] border border-white/[0.06] rounded-xl shadow-lg">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-white">Reports by Type</CardTitle>
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
            <Card className="bg-white/[0.03] border border-white/[0.06] rounded-xl shadow-lg">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-white">Top Vendors by Quality</CardTitle>
              </CardHeader>
              <CardContent>
                {analytics.topVendors.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No data available yet.</p>
                ) : (
                  <div className="rounded-lg border border-white/[0.06] overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/[0.06] hover:bg-transparent">
                          <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3">Vendor</TableHead>
                          <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3">Avg Score</TableHead>
                          <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3">Reports</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analytics.topVendors.map((v, idx) => (
                          <TableRow key={idx} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
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

          {/* Per-Account Quality Breakdown */}
          <Card className="bg-white/[0.03] border border-white/[0.06] rounded-xl shadow-lg">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-white">Quality by Account</CardTitle>
            </CardHeader>
            <CardContent>
              {analytics.accountBreakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No account data available yet.</p>
              ) : (
                <div className="rounded-lg border border-white/[0.06] overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/[0.06] hover:bg-transparent">
                        <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3">Account</TableHead>
                        <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3">Avg QS</TableHead>
                        <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3">Avg LQA</TableHead>
                        <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3">Reports</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analytics.accountBreakdown.map((a, idx) => (
                        <TableRow key={idx} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                          <TableCell className="text-sm font-medium text-foreground">{a.account}</TableCell>
                          <TableCell className="text-sm tabular-nums">
                            {a.avgQs != null ? (
                              <span className={
                                a.avgQs >= 4.5 ? "text-emerald-400" :
                                a.avgQs >= 3.5 ? "text-blue-400" :
                                "text-amber-400"
                              }>
                                {a.avgQs.toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">--</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm tabular-nums">
                            {a.avgLqa != null ? (
                              <span className={
                                a.avgLqa >= 90 ? "text-emerald-400" :
                                a.avgLqa >= 70 ? "text-blue-400" :
                                "text-amber-400"
                              }>
                                {a.avgLqa.toFixed(1)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">--</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm tabular-nums text-muted-foreground">{a.reportCount}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════ */}
        {/* TAB: LQA (MQM) Faz 6 Reports                   */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="lqa-v2" className="space-y-4">
          <Faz6LqaTab />
        </TabsContent>

        {/* ═══════════════════════════════════════════════ */}
        {/* TAB: RCA (Root Cause Analysis)                  */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="rca" className="space-y-4">
          <Faz6RcaTab />
        </TabsContent>

        {/* ═══════════════════════════════════════════════ */}
        {/* TAB: Customer Feedback                          */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="feedback" className="space-y-4">
          <Faz6FeedbackTab />
        </TabsContent>
      </Tabs>

      {/* ═══════════════════════════════════════════════ */}
      {/* QS Quick Entry Dialog                            */}
      {/* ═══════════════════════════════════════════════ */}
      <Dialog open={qsDialogOpen} onOpenChange={(open) => { if (!open) resetQsDialog(); else setQsDialogOpen(true); }}>
        <DialogContent className="bg-card border border-white/[0.08] text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <Zap className="w-4 h-4 text-purple-400" />
              Quick Score Entry
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {/* Vendor */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Vendor <span className="text-red-400">*</span>
              </Label>
              <Select value={qsDialogVendorId} onValueChange={setQsDialogVendorId}>
                <SelectTrigger className={selectTriggerCls}>
                  <SelectValue placeholder="Select vendor..." />
                </SelectTrigger>
                <SelectContent className="bg-popover border-white/[0.08] max-h-60">
                  {vendorList.map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>
                      {v.name || v.companyName || `Vendor ${v.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Project */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Project <span className="text-red-400">*</span>
              </Label>
              <Select value={qsDialogProjectId} onValueChange={setQsDialogProjectId}>
                <SelectTrigger className={selectTriggerCls}>
                  <SelectValue placeholder="Select project..." />
                </SelectTrigger>
                <SelectContent className="bg-popover border-white/[0.08] max-h-60">
                  {projectList.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.projectName || `Project ${p.id}`}
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
              <StarRating value={qsDialogScore} onChange={setQsDialogScore} />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Notes</Label>
              <Textarea
                placeholder="Optional notes about this score..."
                value={qsDialogNotes}
                onChange={(e) => setQsDialogNotes(e.target.value)}
                className={inputCls}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={resetQsDialog}>
              Cancel
            </Button>
            <Button
              className="gap-1.5 bg-purple-600 hover:bg-purple-700 text-white"
              onClick={handleQsDialogSubmit}
              disabled={createReportMutation.isPending}
            >
              {createReportMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              Submit Score
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════ */}
      {/* LQA Report Dialog                                */}
      {/* ═══════════════════════════════════════════════ */}
      <Dialog open={lqaDialogOpen} onOpenChange={(open) => { if (!open) resetLqaDialog(); else setLqaDialogOpen(true); }}>
        <DialogContent className="bg-card border border-white/[0.08] text-foreground max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-cyan-400" />
              LQA Report
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 mt-2">
            {/* Top fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Vendor */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Vendor <span className="text-red-400">*</span>
                </Label>
                <Select value={lqaDialogVendorId} onValueChange={setLqaDialogVendorId}>
                  <SelectTrigger className={selectTriggerCls}>
                    <SelectValue placeholder="Select vendor..." />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-white/[0.08] max-h-60">
                    {vendorList.map((v) => (
                      <SelectItem key={v.id} value={String(v.id)}>
                        {v.name || v.companyName || `Vendor ${v.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Project */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Project <span className="text-red-400">*</span>
                </Label>
                <Select value={lqaDialogProjectId} onValueChange={setLqaDialogProjectId}>
                  <SelectTrigger className={selectTriggerCls}>
                    <SelectValue placeholder="Select project..." />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-white/[0.08] max-h-60">
                    {projectList.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.projectName || `Project ${p.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Word Count */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Word Count <span className="text-red-400">*</span>
              </Label>
              <Input
                type="number"
                min="1"
                placeholder="e.g. 2000"
                value={lqaDialogWordCount}
                onChange={(e) => setLqaDialogWordCount(e.target.value)}
                className={inputCls}
              />
            </div>

            {/* MQM Error Category Table */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">MQM Error Categories</Label>
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl shadow-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/[0.06] hover:bg-transparent">
                      <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3">Category</TableHead>
                      <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3 text-center">Minor (x1)</TableHead>
                      <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3 text-center">Major (x5)</TableHead>
                      <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3 text-center">Critical (x10)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lqaDialogMqmRows.map((row, idx) => (
                      <TableRow key={row.category} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                        <TableCell className="text-xs font-medium text-foreground">{row.category}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            value={row.minor}
                            onChange={(e) => updateMqmRow(idx, "minor", parseInt(e.target.value) || 0)}
                            className={`${inputCls} h-8 text-xs text-center w-20 mx-auto`}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            value={row.major}
                            onChange={(e) => updateMqmRow(idx, "major", parseInt(e.target.value) || 0)}
                            className={`${inputCls} h-8 text-xs text-center w-20 mx-auto`}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            value={row.critical}
                            onChange={(e) => updateMqmRow(idx, "critical", parseInt(e.target.value) || 0)}
                            className={`${inputCls} h-8 text-xs text-center w-20 mx-auto`}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Calculated LQA Score */}
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Auto-calculated LQA Score</p>
                <p className="text-xs text-muted-foreground">
                  Formula: max(0, 100 - (minor*1 + major*5 + critical*10))
                </p>
              </div>
              <div className={`text-3xl font-bold tabular-nums ${
                lqaDialogCalculatedScore >= 90 ? "text-emerald-400" :
                lqaDialogCalculatedScore >= 70 ? "text-blue-400" :
                lqaDialogCalculatedScore >= 50 ? "text-amber-400" :
                "text-red-400"
              }`}>
                {lqaDialogCalculatedScore}
              </div>
            </div>

            {/* Comments */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Comments</Label>
              <Textarea
                placeholder="Additional comments about this LQA report..."
                value={lqaDialogComments}
                onChange={(e) => setLqaDialogComments(e.target.value)}
                className={inputCls}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={resetLqaDialog}>
              Cancel
            </Button>
            <Button
              className="gap-1.5 bg-cyan-600 hover:bg-cyan-700 text-white"
              onClick={handleLqaDialogSubmit}
              disabled={createReportMutation.isPending}
            >
              {createReportMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ClipboardList className="w-4 h-4" />
              )}
              Submit LQA Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl shadow-lg overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-white/[0.06] hover:bg-transparent">
                            <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3 w-8">#</TableHead>
                            <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3">Source</TableHead>
                            <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3">Target</TableHead>
                            <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3">Revised</TableHead>
                            <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3">Category</TableHead>
                            <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3">Severity</TableHead>
                            <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3">Comment</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedReport.lqaEntries.map((entry, idx) => (
                            <TableRow key={idx} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
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
                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl shadow-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-white/[0.06] hover:bg-transparent">
                            <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3">Category</TableHead>
                            <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3">Severity</TableHead>
                            <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3">Count</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedReport.lqaErrors.map((err, idx) => (
                            <TableRow key={idx} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
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
