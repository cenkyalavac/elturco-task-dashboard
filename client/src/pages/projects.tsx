import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, ChevronLeft, ChevronRight, Loader2, Search, FolderOpen } from "lucide-react";

// ── Types ──

interface Project {
  id: number;
  projectName: string;
  code: string;
  customerId: number | null;
  customerName: string | null;
  status: string;
  pm: string | null;
  deadline: string | null;
  source: string | null;
  notes: string | null;
  createdAt: string;
}

interface ProjectsResponse {
  data: Project[];
  total: number;
  page: number;
  limit: number;
}

interface Customer {
  id: number;
  name: string;
}

interface QuickCreateForm {
  projectName: string;
  customerId: string;
  sourceLanguage: string;
  targetLanguage: string;
  deadline: string;
  source: string;
  notes: string;
}

// ── Status config ──

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  pending: { label: "Pending", className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20" },
  completed: { label: "Completed", className: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  cancelled: { label: "Cancelled", className: "bg-red-500/15 text-red-400 border-red-500/20" },
  on_hold: { label: "On Hold", className: "bg-slate-500/15 text-slate-400 border-slate-500/20" },
};

const STATUSES = ["active", "pending", "completed", "cancelled", "on_hold"];

const COMMON_LANGUAGES = [
  "EN", "TR", "AR", "DE", "FR", "ES", "PT", "IT", "NL", "PL",
  "RU", "JA", "KO", "ZH", "SV", "DA", "FI", "NO", "CS", "HU",
];

const PAGE_LIMIT = 20;

// ── Component ──

export default function ProjectsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState("all");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [form, setForm] = useState<QuickCreateForm>({
    projectName: "",
    customerId: "",
    sourceLanguage: "EN",
    targetLanguage: "TR",
    deadline: "",
    source: "",
    notes: "",
  });

  // Build query params
  const queryParams = new URLSearchParams();
  if (statusFilter !== "all") queryParams.set("status", statusFilter);
  if (customerFilter !== "all") queryParams.set("customerId", customerFilter);
  if (searchQuery.trim()) queryParams.set("search", searchQuery.trim());
  queryParams.set("page", String(page));
  queryParams.set("limit", String(PAGE_LIMIT));

  const queryString = queryParams.toString();

  const { data: projectsData, isLoading: isLoadingProjects } = useQuery<ProjectsResponse>({
    queryKey: [`/api/projects?${queryString}`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects?${queryString}`);
      return res.json();
    },
  });

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/customers?limit=500");
      const json = await res.json();
      return json.data ?? json;
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/projects", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Project created successfully" });
      setDialogOpen(false);
      setForm({
        projectName: "",
        customerId: "",
        sourceLanguage: "EN",
        targetLanguage: "TR",
        deadline: "",
        source: "",
        notes: "",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Error creating project", description: err.message, variant: "destructive" });
    },
  });

  const projects = projectsData?.data || [];
  const total = projectsData?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  function handleFilterChange(type: "status" | "customer", value: string) {
    setPage(1);
    if (type === "status") setStatusFilter(value);
    else setCustomerFilter(value);
  }

  function handleSearchChange(value: string) {
    setPage(1);
    setSearchQuery(value);
  }

  function handleFormChange(field: keyof QuickCreateForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit() {
    if (!form.projectName.trim()) {
      toast({ title: "Project name is required", variant: "destructive" });
      return;
    }
    const payload: Record<string, unknown> = {
      projectName: form.projectName.trim(),
      sourceLanguage: form.sourceLanguage,
      targetLanguage: form.targetLanguage,
    };
    if (form.customerId) payload.customerId = Number(form.customerId);
    if (form.deadline) payload.deadline = form.deadline;
    if (form.source.trim()) payload.source = form.source.trim();
    if (form.notes.trim()) payload.notes = form.notes.trim();
    createProjectMutation.mutate(payload);
  }

  function formatDeadline(dateStr: string | null): string {
    if (!dateStr) return "—";
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-sm font-semibold text-foreground mr-2" data-testid="text-projects-title">
            Projects
          </h1>

          {/* Search */}
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search name or code..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-8 h-8 text-sm"
              data-testid="input-projects-search"
            />
          </div>

          {/* Status filter */}
          <Select value={statusFilter} onValueChange={(v) => handleFilterChange("status", v)}>
            <SelectTrigger className="w-36 h-8 text-sm" data-testid="select-projects-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_CONFIG[s]?.label || s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Customer filter */}
          <Select value={customerFilter} onValueChange={(v) => handleFilterChange("customer", v)}>
            <SelectTrigger className="w-40 h-8 text-sm" data-testid="select-projects-customer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Customers</SelectItem>
              {(customers || []).map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span className="text-xs text-muted-foreground ml-auto tabular-nums">
            {total} project{total !== 1 ? "s" : ""}
          </span>

          {/* Quick Create */}
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setDialogOpen(true)}
            data-testid="button-quick-create"
          >
            <Plus className="w-3.5 h-3.5" />
            Quick Create
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoadingProjects ? (
          <div className="p-4 space-y-2">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <FolderOpen className="w-10 h-10 opacity-30" />
            <p className="text-sm">No projects found</p>
          </div>
        ) : (
          <Table data-testid="table-projects">
            <TableHeader className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
              <TableRow>
                <TableHead className="text-xs font-medium text-muted-foreground px-3 py-2 w-[220px]">
                  Project Name
                </TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground px-3 py-2 w-[110px]">
                  Code
                </TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground px-3 py-2">
                  Customer
                </TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground px-3 py-2 w-[110px]">
                  Status
                </TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground px-3 py-2 w-[120px]">
                  PM
                </TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground px-3 py-2 w-[130px]">
                  Deadline
                </TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground px-3 py-2 w-[100px]">
                  Source
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => {
                const stCfg = STATUS_CONFIG[project.status] || {
                  label: project.status,
                  className: "bg-slate-500/15 text-slate-400 border-slate-500/20",
                };
                return (
                  <TableRow
                    key={project.id}
                    className="border-b border-border hover:bg-muted/30 transition-colors"
                    data-testid={`row-project-${project.id}`}
                  >
                    <TableCell className="px-3 py-2">
                      <Link
                        href={`/projects/${project.id}`}
                        className="font-medium text-foreground hover:text-primary hover:underline text-sm transition-colors"
                        data-testid={`link-project-${project.id}`}
                      >
                        {project.projectName}
                      </Link>
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      <span className="text-xs text-muted-foreground font-mono">
                        {project.code || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="px-3 py-2 text-sm text-foreground">
                      {project.customerName || "—"}
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 border ${stCfg.className}`}
                      >
                        {stCfg.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-3 py-2 text-xs text-muted-foreground">
                      {project.pm || "—"}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDeadline(project.deadline)}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-xs text-muted-foreground">
                      {project.source || "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination */}
      {!isLoadingProjects && totalPages > 1 && (
        <div className="border-t border-border bg-card px-4 py-2 flex items-center justify-between">
          <span className="text-xs text-muted-foreground tabular-nums">
            Page {page} of {totalPages} &mdash; {total} total
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              data-testid="button-prev-page"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            {/* Page numbers — show up to 5 around current */}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(page - 2, totalPages - 4));
              return start + i;
            })
              .filter((p) => p >= 1 && p <= totalPages)
              .map((p) => (
                <Button
                  key={p}
                  variant={p === page ? "default" : "outline"}
                  size="sm"
                  className="h-7 w-7 p-0 text-xs"
                  onClick={() => setPage(p)}
                  data-testid={`button-page-${p}`}
                >
                  {p}
                </Button>
              ))}
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              data-testid="button-next-page"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Quick Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md bg-card border-border" data-testid="dialog-quick-create">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-foreground">
              Quick Create Project
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Project Name */}
            <div className="space-y-1.5">
              <Label htmlFor="qc-project-name" className="text-xs text-muted-foreground">
                Project Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="qc-project-name"
                placeholder="e.g. Website Localization Q2"
                value={form.projectName}
                onChange={(e) => handleFormChange("projectName", e.target.value)}
                className="h-8 text-sm"
                data-testid="input-qc-project-name"
              />
            </div>

            {/* Customer */}
            <div className="space-y-1.5">
              <Label htmlFor="qc-customer" className="text-xs text-muted-foreground">
                Customer
              </Label>
              <Select
                value={form.customerId || "none"}
                onValueChange={(v) => handleFormChange("customerId", v === "none" ? "" : v)}
              >
                <SelectTrigger id="qc-customer" className="h-8 text-sm" data-testid="select-qc-customer">
                  <SelectValue placeholder="Select customer..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No customer</SelectItem>
                  {(customers || []).map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Language Pair */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="qc-source-lang" className="text-xs text-muted-foreground">
                  Source Language
                </Label>
                <Select
                  value={form.sourceLanguage}
                  onValueChange={(v) => handleFormChange("sourceLanguage", v)}
                >
                  <SelectTrigger id="qc-source-lang" className="h-8 text-sm" data-testid="select-qc-source-lang">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_LANGUAGES.map((lang) => (
                      <SelectItem key={lang} value={lang}>
                        {lang}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qc-target-lang" className="text-xs text-muted-foreground">
                  Target Language
                </Label>
                <Select
                  value={form.targetLanguage}
                  onValueChange={(v) => handleFormChange("targetLanguage", v)}
                >
                  <SelectTrigger id="qc-target-lang" className="h-8 text-sm" data-testid="select-qc-target-lang">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_LANGUAGES.map((lang) => (
                      <SelectItem key={lang} value={lang}>
                        {lang}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Deadline */}
            <div className="space-y-1.5">
              <Label htmlFor="qc-deadline" className="text-xs text-muted-foreground">
                Deadline
              </Label>
              <Input
                id="qc-deadline"
                type="date"
                value={form.deadline}
                onChange={(e) => handleFormChange("deadline", e.target.value)}
                className="h-8 text-sm"
                data-testid="input-qc-deadline"
              />
            </div>

            {/* Source */}
            <div className="space-y-1.5">
              <Label htmlFor="qc-source" className="text-xs text-muted-foreground">
                Source
              </Label>
              <Input
                id="qc-source"
                placeholder="e.g. Amazon, AppleCare..."
                value={form.source}
                onChange={(e) => handleFormChange("source", e.target.value)}
                className="h-8 text-sm"
                data-testid="input-qc-source"
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="qc-notes" className="text-xs text-muted-foreground">
                Notes
              </Label>
              <Input
                id="qc-notes"
                placeholder="Optional notes..."
                value={form.notes}
                onChange={(e) => handleFormChange("notes", e.target.value)}
                className="h-8 text-sm"
                data-testid="input-qc-notes"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setDialogOpen(false)}
              disabled={createProjectMutation.isPending}
              data-testid="button-qc-cancel"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={handleSubmit}
              disabled={createProjectMutation.isPending || !form.projectName.trim()}
              data-testid="button-qc-submit"
            >
              {createProjectMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
