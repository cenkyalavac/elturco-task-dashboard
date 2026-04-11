import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Plus,
  List,
  LayoutGrid,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Users,
} from "lucide-react";

// ── Types ──

interface Vendor {
  id: number;
  fullName: string;
  email: string;
  status: string;
  language?: string | null;
  qualityScore?: number | null;
  resourceCode?: string | null;
}

interface VendorsResponse {
  data: Vendor[];
  total: number;
  page: number;
  limit: number;
}

interface PipelineItem {
  status: string;
  count: number;
}

type ViewMode = "list" | "pipeline";

// ── Status definitions ──

const VENDOR_STATUSES = [
  "New Application",
  "Form Sent",
  "Price Negotiation",
  "Test Sent",
  "Approved",
  "Inactive",
  "Rejected",
  "Red Flag",
] as const;

type VendorStatus = (typeof VENDOR_STATUSES)[number];

const STATUS_COLORS: Record<string, string> = {
  "New Application": "bg-blue-500/15 text-blue-400 border-blue-500/25",
  "Form Sent": "bg-cyan-500/15 text-cyan-400 border-cyan-500/25",
  "Price Negotiation": "bg-amber-500/15 text-amber-400 border-amber-500/25",
  "Test Sent": "bg-purple-500/15 text-purple-400 border-purple-500/25",
  Approved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  Inactive: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
  Rejected: "bg-red-500/15 text-red-400 border-red-500/25",
  "Red Flag": "bg-rose-600/15 text-rose-400 border-rose-600/25",
};

const STATUS_HEADER_COLORS: Record<string, string> = {
  "New Application": "border-blue-500/40 bg-blue-500/5",
  "Form Sent": "border-cyan-500/40 bg-cyan-500/5",
  "Price Negotiation": "border-amber-500/40 bg-amber-500/5",
  "Test Sent": "border-purple-500/40 bg-purple-500/5",
  Approved: "border-emerald-500/40 bg-emerald-500/5",
  Inactive: "border-zinc-500/40 bg-zinc-500/5",
  Rejected: "border-red-500/40 bg-red-500/5",
  "Red Flag": "border-rose-600/40 bg-rose-600/5",
};

const LIMIT = 20;

// ── Status Badge ──

function StatusBadge({ status }: { status: string }) {
  const colorClass = STATUS_COLORS[status] ?? "bg-zinc-500/15 text-zinc-400 border-zinc-500/25";
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${colorClass}`}
    >
      {status}
    </span>
  );
}

// ── Add Vendor Dialog ──

function AddVendorDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string>("New Application");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async (data: { fullName: string; email: string; status: string }) => {
      const res = await apiRequest("POST", "/api/vendors", data);
      return res.json();
    },
    onSuccess: () => {
      setOpen(false);
      setFullName("");
      setEmail("");
      setStatus("New Application");
      setError(null);
      onCreated();
    },
    onError: (err: Error) => {
      setError(err.message || "Failed to create vendor.");
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fullName.trim()) {
      setError("Full name is required.");
      return;
    }
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    createMutation.mutate({ fullName: fullName.trim(), email: email.trim(), status });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" />
          Add Vendor
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Vendor</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Full Name</label>
            <Input
              placeholder="Jane Doe"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={createMutation.isPending}
              data-testid="add-vendor-fullname"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Email</label>
            <Input
              type="email"
              placeholder="jane@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={createMutation.isPending}
              data-testid="add-vendor-email"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Status</label>
            <Select value={status} onValueChange={setStatus} disabled={createMutation.isPending}>
              <SelectTrigger data-testid="add-vendor-status">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {VENDOR_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && (
            <p className="text-sm text-red-400" data-testid="add-vendor-error">
              {error}
            </p>
          )}
          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={createMutation.isPending}
              data-testid="add-vendor-submit"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Creating…
                </>
              ) : (
                "Create Vendor"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── List View ──

function ListView({
  vendors,
  isLoading,
  total,
  page,
  limit,
  onPageChange,
}: {
  vendors: Vendor[];
  isLoading: boolean;
  total: number;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-white/[0.06] overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow className="border-white/[0.06] hover:bg-transparent">
              <TableHead className="text-xs font-semibold text-muted-foreground">Name</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Email</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Status</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Language</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Quality Score</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Resource Code</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i} className="border-white/[0.06]">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full rounded" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : vendors.length === 0 ? (
              <TableRow className="border-white/[0.06]">
                <TableCell colSpan={6} className="text-center text-muted-foreground py-12 text-sm">
                  No vendors found.
                </TableCell>
              </TableRow>
            ) : (
              vendors.map((vendor) => (
                <TableRow
                  key={vendor.id}
                  className="border-white/[0.06] hover:bg-white/[0.02] transition-colors"
                  data-testid={`vendor-row-${vendor.id}`}
                >
                  <TableCell className="font-medium text-sm">
                    <Link
                      href={`/vendors/${vendor.id}`}
                      className="text-foreground hover:text-blue-400 transition-colors underline-offset-4 hover:underline"
                    >
                      {vendor.fullName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {vendor.email}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={vendor.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {vendor.language ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {vendor.qualityScore !== null && vendor.qualityScore !== undefined ? (
                      <span
                        className={
                          vendor.qualityScore >= 4.5
                            ? "text-emerald-400 font-medium"
                            : vendor.qualityScore >= 3.5
                            ? "text-blue-400 font-medium"
                            : "text-amber-400 font-medium"
                        }
                      >
                        {vendor.qualityScore.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm font-mono text-muted-foreground">
                    {vendor.resourceCode ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
        <span>
          {isLoading ? (
            <Skeleton className="h-4 w-28 rounded inline-block" />
          ) : (
            <>
              Showing {total === 0 ? 0 : (page - 1) * limit + 1}–
              {Math.min(page * limit, total)} of {total}
            </>
          )}
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1 || isLoading}
            aria-label="Previous page"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <span className="px-2 text-xs">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages || isLoading}
            aria-label="Next page"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Pipeline View ──

function PipelineView({
  pipeline,
  isPipelineLoading,
}: {
  pipeline: PipelineItem[];
  isPipelineLoading: boolean;
}) {
  // Build a map from status -> count for quick lookup
  const countMap: Record<string, number> = {};
  for (const item of pipeline) {
    countMap[item.status] = item.count;
  }

  if (isPipelineLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="pipeline-loading">
        {VENDOR_STATUSES.map((s) => (
          <Skeleton key={s} className="h-28 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4"
      data-testid="pipeline-view"
    >
      {VENDOR_STATUSES.map((status) => {
        const count = countMap[status] ?? 0;
        const headerClass =
          STATUS_HEADER_COLORS[status] ?? "border-zinc-500/40 bg-zinc-500/5";
        return (
          <Card
            key={status}
            className={`bg-card border border-white/[0.06] overflow-hidden`}
            data-testid={`pipeline-column-${status}`}
          >
            <CardHeader
              className={`py-3 px-4 border-b ${headerClass}`}
            >
              <CardTitle className="text-xs font-semibold text-foreground flex items-center justify-between gap-2">
                <span className="truncate">{status}</span>
                <span className="shrink-0 inline-flex items-center justify-center rounded-full bg-white/[0.08] text-foreground text-xs font-bold w-6 h-6">
                  {count}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {count === 0 ? (
                <p className="text-[11px] text-muted-foreground text-center py-4">No vendors</p>
              ) : (
                <div className="flex flex-col gap-2">
                  <PipelineVendorList status={status} count={count} />
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function PipelineVendorList({ status, count }: { status: string; count: number }) {
  const { data, isLoading } = useQuery<VendorsResponse>({
    queryKey: ["/api/vendors", { status, page: 1, limit: 5 }],
    queryFn: async () => {
      const params = new URLSearchParams({
        status,
        page: "1",
        limit: "5",
      });
      const res = await apiRequest("GET", `/api/vendors?${params.toString()}`);
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <>
        {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full rounded" />
        ))}
      </>
    );
  }

  const vendors = data?.data ?? [];

  return (
    <>
      {vendors.map((vendor) => (
        <Link
          key={vendor.id}
          href={`/vendors/${vendor.id}`}
          className="block rounded-md px-2.5 py-1.5 text-xs font-medium text-foreground bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.07] hover:border-white/[0.10] transition-colors truncate"
          data-testid={`pipeline-vendor-${vendor.id}`}
        >
          {vendor.fullName}
        </Link>
      ))}
      {count > 5 && (
        <p className="text-[10px] text-muted-foreground text-center pt-1">
          +{count - 5} more
        </p>
      )}
    </>
  );
}

// ── Main Page ──

export default function VendorsPage() {
  const qc = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  // Debounce search to avoid hammering the API on every keystroke
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useState<ReturnType<typeof setTimeout> | null>(null);

  function handleSearchChange(val: string) {
    setSearch(val);
    if (debounceRef[0]) clearTimeout(debounceRef[0]);
    debounceRef[1](
      setTimeout(() => {
        setDebouncedSearch(val);
        setPage(1);
      }, 300),
    );
  }

  function handleStatusFilterChange(val: string) {
    setStatusFilter(val);
    setPage(1);
  }

  // Build query params for the list
  const listParams = new URLSearchParams();
  if (debouncedSearch) listParams.set("search", debouncedSearch);
  if (statusFilter && statusFilter !== "all") listParams.set("status", statusFilter);
  listParams.set("page", String(page));
  listParams.set("limit", String(LIMIT));

  const listQueryKey = ["/api/vendors", listParams.toString()];

  const { data: vendorsData, isLoading: isVendorsLoading } = useQuery<VendorsResponse>({
    queryKey: listQueryKey,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/vendors?${listParams.toString()}`);
      return res.json();
    },
  });

  // Pipeline data
  const { data: pipelineData, isLoading: isPipelineLoading } = useQuery<PipelineItem[]>({
    queryKey: ["/api/vendors/pipeline"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/vendors/pipeline");
      return res.json();
    },
    enabled: viewMode === "pipeline",
  });

  function invalidateVendors() {
    qc.invalidateQueries({ queryKey: ["/api/vendors"] });
  }

  const vendors = vendorsData?.data ?? [];
  const total = vendorsData?.total ?? 0;

  return (
    <div className="h-full overflow-auto" data-testid="vendors-page">
      <div className="max-w-[1400px] mx-auto p-6 space-y-5">
        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-muted-foreground" />
            <h1 className="text-lg font-semibold text-foreground">Vendors</h1>
            {!isVendorsLoading && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {total}
              </Badge>
            )}
          </div>
          <AddVendorDialog onCreated={invalidateVendors} />
        </div>

        {/* ── Toolbar ── */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search vendors…"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-8 h-8 text-sm"
              data-testid="vendor-search"
            />
          </div>

          {/* Status filter */}
          <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
            <SelectTrigger className="h-8 w-[180px] text-sm" data-testid="vendor-status-filter">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {VENDOR_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* View toggle */}
          <div className="flex items-center rounded-md border border-white/[0.08] bg-white/[0.03] p-0.5 gap-0.5 ml-auto">
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                viewMode === "list"
                  ? "bg-white/[0.10] text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/[0.05]"
              }`}
              data-testid="view-toggle-list"
              aria-label="List view"
            >
              <List className="w-3.5 h-3.5" />
              List
            </button>
            <button
              onClick={() => setViewMode("pipeline")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                viewMode === "pipeline"
                  ? "bg-white/[0.10] text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/[0.05]"
              }`}
              data-testid="view-toggle-pipeline"
              aria-label="Pipeline view"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Pipeline
            </button>
          </div>
        </div>

        {/* ── Content ── */}
        {viewMode === "list" ? (
          <ListView
            vendors={vendors}
            isLoading={isVendorsLoading}
            total={total}
            page={page}
            limit={LIMIT}
            onPageChange={setPage}
          />
        ) : (
          <PipelineView
            pipeline={pipelineData ?? []}
            isPipelineLoading={isPipelineLoading}
          />
        )}
      </div>
    </div>
  );
}
