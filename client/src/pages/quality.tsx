import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Plus, ShieldCheck, Loader2 } from "lucide-react";

// ── Types ──

type ReportStatus = "draft" | "submitted" | "finalized";
type ReportType = "QS" | "LQA";

interface QualityReport {
  id: number;
  vendorId: string;
  vendorName?: string;
  reportType: ReportType;
  qsScore: number | null;
  lqaScore: number | null;
  projectName: string;
  jobId?: string | null;
  wordCount?: number | null;
  clientAccount?: string | null;
  sourceLanguage?: string | null;
  targetLanguage?: string | null;
  status: ReportStatus;
  createdAt: string;
}

interface NewReportForm {
  vendorId: string;
  reportType: ReportType | "";
  qsScore: string;
  lqaScore: string;
  projectName: string;
  jobId: string;
  wordCount: string;
  clientAccount: string;
  sourceLanguage: string;
  targetLanguage: string;
}

// ── Helpers ──

const EMPTY_FORM: NewReportForm = {
  vendorId: "",
  reportType: "",
  qsScore: "",
  lqaScore: "",
  projectName: "",
  jobId: "",
  wordCount: "",
  clientAccount: "",
  sourceLanguage: "",
  targetLanguage: "",
};

function statusBadge(status: ReportStatus) {
  const variants: Record<ReportStatus, { label: string; className: string }> = {
    draft: {
      label: "Draft",
      className: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/25",
    },
    submitted: {
      label: "Submitted",
      className: "bg-blue-500/15 text-blue-400 border border-blue-500/25",
    },
    finalized: {
      label: "Finalized",
      className: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25",
    },
  };
  const v = variants[status] ?? {
    label: status,
    className: "bg-white/10 text-muted-foreground border border-white/10",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${v.className}`}>
      {v.label}
    </span>
  );
}

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

// ── Main Page ──

export default function QualityPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<NewReportForm>(EMPTY_FORM);

  // Fetch quality reports
  const { data: reports, isLoading, error } = useQuery<QualityReport[]>({
    queryKey: ["/api/quality-reports"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/quality-reports");
      return res.json();
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (payload: object) => {
      const res = await apiRequest("POST", "/api/quality-reports", payload);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/quality-reports"] });
      toast({ title: "Report created", description: "Quality report has been saved." });
      setDialogOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to create report",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.vendorId.trim()) {
      toast({ title: "Vendor ID is required", variant: "destructive" });
      return;
    }
    if (!form.reportType) {
      toast({ title: "Report type is required", variant: "destructive" });
      return;
    }
    if (!form.projectName.trim()) {
      toast({ title: "Project name is required", variant: "destructive" });
      return;
    }

    const qsScore = form.qsScore !== "" ? parseFloat(form.qsScore) : null;
    const lqaScore = form.lqaScore !== "" ? parseFloat(form.lqaScore) : null;
    const wordCount = form.wordCount !== "" ? parseInt(form.wordCount, 10) : null;

    if (qsScore !== null && (isNaN(qsScore) || qsScore < 1 || qsScore > 5)) {
      toast({ title: "QS Score must be between 1 and 5", variant: "destructive" });
      return;
    }
    if (lqaScore !== null && (isNaN(lqaScore) || lqaScore < 0 || lqaScore > 100)) {
      toast({ title: "LQA Score must be between 0 and 100", variant: "destructive" });
      return;
    }

    createMutation.mutate({
      vendorId: form.vendorId.trim(),
      reportType: form.reportType,
      qsScore,
      lqaScore,
      projectName: form.projectName.trim(),
      jobId: form.jobId.trim() || null,
      wordCount,
      clientAccount: form.clientAccount.trim() || null,
      sourceLanguage: form.sourceLanguage.trim() || null,
      targetLanguage: form.targetLanguage.trim() || null,
    });
  }

  function handleOpenChange(open: boolean) {
    setDialogOpen(open);
    if (!open) setForm(EMPTY_FORM);
  }

  function setField(field: keyof NewReportForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  // ── Render ──

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto" data-testid="quality-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <h1 className="text-lg font-semibold text-foreground">Quality Management</h1>
        </div>
        <Button
          size="sm"
          className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={() => setDialogOpen(true)}
          data-testid="btn-new-report"
        >
          <Plus className="w-4 h-4" />
          New Report
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2" data-testid="quality-loading">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-10 rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <div
          className="rounded-lg border border-white/[0.06] bg-card p-8 text-center text-muted-foreground"
          data-testid="quality-error"
        >
          Failed to load quality reports.
        </div>
      ) : !reports || reports.length === 0 ? (
        <div
          className="rounded-lg border border-white/[0.06] bg-card p-12 text-center"
          data-testid="quality-empty"
        >
          <ShieldCheck className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-muted-foreground text-sm">No quality reports yet.</p>
          <p className="text-muted-foreground text-xs mt-1">Click "New Report" to create the first one.</p>
        </div>
      ) : (
        <div
          className="rounded-lg border border-white/[0.06] bg-card overflow-hidden"
          data-testid="quality-table"
        >
          <Table>
            <TableHeader>
              <TableRow className="border-white/[0.06] hover:bg-transparent">
                <TableHead className="text-xs text-muted-foreground font-medium">Vendor</TableHead>
                <TableHead className="text-xs text-muted-foreground font-medium">Type</TableHead>
                <TableHead className="text-xs text-muted-foreground font-medium">QS Score</TableHead>
                <TableHead className="text-xs text-muted-foreground font-medium">LQA Score</TableHead>
                <TableHead className="text-xs text-muted-foreground font-medium">Project</TableHead>
                <TableHead className="text-xs text-muted-foreground font-medium">Date</TableHead>
                <TableHead className="text-xs text-muted-foreground font-medium">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((report) => (
                <TableRow
                  key={report.id}
                  className="border-white/[0.04] hover:bg-white/[0.03] transition-colors"
                  data-testid={`quality-row-${report.id}`}
                >
                  <TableCell className="text-sm font-medium text-foreground">
                    {report.vendorName ?? report.vendorId}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                        report.reportType === "QS"
                          ? "bg-purple-500/15 text-purple-400"
                          : "bg-cyan-500/15 text-cyan-400"
                      }`}
                    >
                      {report.reportType}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {report.qsScore != null ? (
                      <span
                        className={
                          report.qsScore >= 4.5
                            ? "text-emerald-400 font-medium"
                            : report.qsScore >= 3.5
                            ? "text-blue-400"
                            : "text-amber-400"
                        }
                      >
                        {report.qsScore.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {report.lqaScore != null ? (
                      <span
                        className={
                          report.lqaScore >= 90
                            ? "text-emerald-400 font-medium"
                            : report.lqaScore >= 70
                            ? "text-blue-400"
                            : "text-amber-400"
                        }
                      >
                        {report.lqaScore}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-foreground max-w-[200px] truncate">
                    {report.projectName}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(report.createdAt)}
                  </TableCell>
                  <TableCell>{statusBadge(report.status)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* New Report Dialog */}
      <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
        <DialogContent
          className="bg-card border border-white/[0.08] text-foreground max-w-lg max-h-[90vh] overflow-y-auto"
          data-testid="dialog-new-report"
        >
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">New Quality Report</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            {/* Vendor ID */}
            <div className="space-y-1.5">
              <Label htmlFor="vendorId" className="text-xs text-muted-foreground">
                Vendor ID <span className="text-red-400">*</span>
              </Label>
              <Input
                id="vendorId"
                placeholder="e.g. FRL-001"
                value={form.vendorId}
                onChange={(e) => setField("vendorId", e.target.value)}
                className="bg-white/[0.04] border-white/[0.08] text-foreground placeholder:text-muted-foreground focus:border-white/[0.2]"
                data-testid="input-vendorId"
              />
            </div>

            {/* Report Type */}
            <div className="space-y-1.5">
              <Label htmlFor="reportType" className="text-xs text-muted-foreground">
                Report Type <span className="text-red-400">*</span>
              </Label>
              <Select
                value={form.reportType}
                onValueChange={(v) => setField("reportType", v)}
              >
                <SelectTrigger
                  id="reportType"
                  className="bg-white/[0.04] border-white/[0.08] text-foreground focus:ring-0"
                  data-testid="select-reportType"
                >
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent className="bg-popover border-white/[0.08]">
                  <SelectItem value="QS">QS (Quality Score)</SelectItem>
                  <SelectItem value="LQA">LQA (Language Quality Assessment)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Scores row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="qsScore" className="text-xs text-muted-foreground">
                  QS Score (1–5)
                </Label>
                <Input
                  id="qsScore"
                  type="number"
                  min="1"
                  max="5"
                  step="0.1"
                  placeholder="e.g. 4.5"
                  value={form.qsScore}
                  onChange={(e) => setField("qsScore", e.target.value)}
                  className="bg-white/[0.04] border-white/[0.08] text-foreground placeholder:text-muted-foreground focus:border-white/[0.2]"
                  data-testid="input-qsScore"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lqaScore" className="text-xs text-muted-foreground">
                  LQA Score (0–100)
                </Label>
                <Input
                  id="lqaScore"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  placeholder="e.g. 85"
                  value={form.lqaScore}
                  onChange={(e) => setField("lqaScore", e.target.value)}
                  className="bg-white/[0.04] border-white/[0.08] text-foreground placeholder:text-muted-foreground focus:border-white/[0.2]"
                  data-testid="input-lqaScore"
                />
              </div>
            </div>

            {/* Project Name */}
            <div className="space-y-1.5">
              <Label htmlFor="projectName" className="text-xs text-muted-foreground">
                Project Name <span className="text-red-400">*</span>
              </Label>
              <Input
                id="projectName"
                placeholder="e.g. ACME Q1 Localization"
                value={form.projectName}
                onChange={(e) => setField("projectName", e.target.value)}
                className="bg-white/[0.04] border-white/[0.08] text-foreground placeholder:text-muted-foreground focus:border-white/[0.2]"
                data-testid="input-projectName"
              />
            </div>

            {/* Job ID + Word Count */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="jobId" className="text-xs text-muted-foreground">
                  Job ID
                </Label>
                <Input
                  id="jobId"
                  placeholder="e.g. JOB-2024-001"
                  value={form.jobId}
                  onChange={(e) => setField("jobId", e.target.value)}
                  className="bg-white/[0.04] border-white/[0.08] text-foreground placeholder:text-muted-foreground focus:border-white/[0.2]"
                  data-testid="input-jobId"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wordCount" className="text-xs text-muted-foreground">
                  Word Count
                </Label>
                <Input
                  id="wordCount"
                  type="number"
                  min="0"
                  placeholder="e.g. 5000"
                  value={form.wordCount}
                  onChange={(e) => setField("wordCount", e.target.value)}
                  className="bg-white/[0.04] border-white/[0.08] text-foreground placeholder:text-muted-foreground focus:border-white/[0.2]"
                  data-testid="input-wordCount"
                />
              </div>
            </div>

            {/* Client Account */}
            <div className="space-y-1.5">
              <Label htmlFor="clientAccount" className="text-xs text-muted-foreground">
                Client Account
              </Label>
              <Input
                id="clientAccount"
                placeholder="e.g. ACME Corp"
                value={form.clientAccount}
                onChange={(e) => setField("clientAccount", e.target.value)}
                className="bg-white/[0.04] border-white/[0.08] text-foreground placeholder:text-muted-foreground focus:border-white/[0.2]"
                data-testid="input-clientAccount"
              />
            </div>

            {/* Source + Target Language */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sourceLanguage" className="text-xs text-muted-foreground">
                  Source Language
                </Label>
                <Input
                  id="sourceLanguage"
                  placeholder="e.g. EN"
                  value={form.sourceLanguage}
                  onChange={(e) => setField("sourceLanguage", e.target.value)}
                  className="bg-white/[0.04] border-white/[0.08] text-foreground placeholder:text-muted-foreground focus:border-white/[0.2]"
                  data-testid="input-sourceLanguage"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="targetLanguage" className="text-xs text-muted-foreground">
                  Target Language
                </Label>
                <Input
                  id="targetLanguage"
                  placeholder="e.g. TR"
                  value={form.targetLanguage}
                  onChange={(e) => setField("targetLanguage", e.target.value)}
                  className="bg-white/[0.04] border-white/[0.08] text-foreground placeholder:text-muted-foreground focus:border-white/[0.2]"
                  data-testid="input-targetLanguage"
                />
              </div>
            </div>

            <DialogFooter className="mt-6 gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleOpenChange(false)}
                className="text-muted-foreground hover:text-foreground"
                data-testid="btn-cancel-report"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={createMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                data-testid="btn-submit-report"
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    Create Report
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
