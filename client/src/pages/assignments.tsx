import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Search, CheckCircle2, Clock, XCircle, Send, X,
} from "lucide-react";

// ── Types ──

interface Assignment {
  id: number;
  source: string;
  sheet: string;
  projectId: string;
  account: string;
  assignmentType: string;
  role: string;
  status: string;
  acceptedByName: string | null;
  acceptedBy: string | null;
  createdAt: string;
  completedAt: string | null;
  taskDetails: any;
  offers: Offer[];
}

interface Offer {
  id: number;
  freelancerName: string;
  freelancerCode: string;
  freelancerEmail: string;
  status: string;
  sentAt: string;
  respondedAt: string | null;
  sequenceOrder: number | null;
}

// ── Maps ──

const STATUS_MAP: Record<string, { label: string; variant: "secondary" | "default" | "destructive"; icon: any }> = {
  pending: { label: "Pending", variant: "secondary", icon: Clock },
  offered: { label: "Offered", variant: "default", icon: Send },
  accepted: { label: "Accepted", variant: "default", icon: CheckCircle2 },
  completed: { label: "Completed", variant: "secondary", icon: CheckCircle2 },
  expired: { label: "Expired", variant: "destructive", icon: XCircle },
  cancelled: { label: "Cancelled", variant: "destructive", icon: XCircle },
};

const TYPE_MAP: Record<string, string> = {
  direct: "Direct",
  sequence: "Sequential",
  broadcast: "Broadcast",
};

// ── Component ──

export default function AssignmentsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: assignments, isLoading } = useQuery<Assignment[]>({
    queryKey: ["/api/assignments"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/assignments");
      return res.json();
    },
  });

  const filtered = (assignments || []).filter((a) => {
    if (sourceFilter !== "all" && a.source !== sourceFilter) return false;
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return [a.projectId, a.account, a.acceptedByName || "", a.source]
        .some((v) => v.toLowerCase().includes(q));
    }
    return true;
  });

  const selected = selectedId ? filtered.find((a) => a.id === selectedId) || null : null;

  return (
    <div className="h-full flex flex-col">
      {/* Header + Filters */}
      <div className="border-b border-border bg-card px-6 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-foreground mr-4" data-testid="text-assignments-title">Assignment History</h1>
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by project ID, account..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-8 text-sm"
              data-testid="input-assignment-search"
            />
          </div>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-36 h-8 text-sm" data-testid="select-assignment-source">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="Amazon">Amazon</SelectItem>
              <SelectItem value="AppleCare">AppleCare</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-8 text-sm" data-testid="select-assignment-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="offered">Offered</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-auto">{filtered.length} assignments</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Table */}
        <div className="flex-1 overflow-auto" style={{ flex: selected ? "0 0 60%" : "1" }}>
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              No assignments found
            </div>
          ) : (
            <table className="w-full text-sm" data-testid="table-assignments">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                <tr className="border-b border-border">
                  <th className="text-left font-medium text-muted-foreground px-3 py-2 text-xs">Project ID</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-2 text-xs">Source</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-2 text-xs">Role</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-2 text-xs">Type</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-2 text-xs">Status</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-2 text-xs">Accepted By</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-2 text-xs">Offers</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-2 text-xs">Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => {
                  const st = STATUS_MAP[a.status] || STATUS_MAP.pending;
                  const Icon = st.icon;
                  const isSelected = a.id === selectedId;
                  return (
                    <tr
                      key={a.id}
                      className={`border-b border-border cursor-pointer transition-colors ${
                        isSelected ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-muted/30"
                      }`}
                      onClick={() => setSelectedId(isSelected ? null : a.id)}
                      data-testid={`row-assignment-${a.id}`}
                    >
                      <td className="px-3 py-2 font-medium text-foreground">{a.projectId}</td>
                      <td className="px-3 py-2">
                        <Badge variant="secondary" className="text-[10px] font-normal px-1.5 py-0">
                          {a.source}/{a.sheet}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">
                        {a.role === "translator" ? "Translator" : "Reviewer"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">{TYPE_MAP[a.assignmentType] || a.assignmentType}</td>
                      <td className="px-3 py-2">
                        <Badge variant={st.variant} className="text-[10px] gap-1 px-1.5 py-0">
                          <Icon className="w-3 h-3" />
                          {st.label}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-foreground text-xs">{a.acceptedByName || "—"}</td>
                      <td className="px-3 py-2">
                        <OfferSummary offers={a.offers} />
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(a.createdAt).toLocaleDateString("en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-[40%] border-l border-border bg-card overflow-auto">
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm text-foreground">Assignment #{selected.id}</h3>
                <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)} data-testid="button-close-detail" className="h-6 w-6 p-0">
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="space-y-1.5 text-xs">
                <Row label="Project ID" value={selected.projectId} />
                <Row label="Source" value={`${selected.source}/${selected.sheet}`} />
                <Row label="Account" value={selected.account} />
                <Row label="Role" value={selected.role === "translator" ? "Translator" : "Reviewer"} />
                <Row label="Type" value={TYPE_MAP[selected.assignmentType] || selected.assignmentType} />
                <Row label="Status" value={(STATUS_MAP[selected.status] || STATUS_MAP.pending).label} />
                {selected.acceptedByName && <Row label="Accepted By" value={`${selected.acceptedByName} (${selected.acceptedBy})`} />}
                <Row label="Created" value={new Date(selected.createdAt).toLocaleString("en-US")} />
                {selected.completedAt && <Row label="Completed" value={new Date(selected.completedAt).toLocaleString("en-US")} />}
              </div>
            </div>

            {/* Task details */}
            {selected.taskDetails && (
              <div className="p-4 border-b border-border">
                <h4 className="text-xs font-semibold text-muted-foreground mb-2">Task Details</h4>
                <div className="space-y-1 text-xs">
                  {selected.taskDetails.deadline && <Row label="Deadline" value={selected.taskDetails.deadline} />}
                  {selected.taskDetails.total && <Row label="Total" value={selected.taskDetails.total} />}
                  {selected.taskDetails.wwc && <Row label="WWC" value={selected.taskDetails.wwc} />}
                </div>
              </div>
            )}

            {/* Offers */}
            <div className="p-4">
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">
                Offers ({selected.offers?.length || 0})
              </h4>
              {selected.offers && selected.offers.length > 0 ? (
                <div className="space-y-2">
                  {selected.offers.map((o) => (
                    <div key={o.id} className="flex items-center gap-2 p-2 bg-muted/30 rounded-md" data-testid={`offer-${o.id}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground">{o.freelancerName}</p>
                        <p className="text-[10px] text-muted-foreground">{o.freelancerCode} · {o.freelancerEmail}</p>
                      </div>
                      <Badge
                        variant={o.status === "accepted" ? "default" : o.status === "rejected" ? "destructive" : "secondary"}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {o.status === "accepted" ? "Accepted" : o.status === "rejected" ? "Declined" : o.status === "pending" ? "Pending" : o.status === "withdrawn" ? "Withdrawn" : o.status}
                      </Badge>
                      {o.sequenceOrder !== null && o.sequenceOrder !== undefined && (
                        <span className="text-[10px] text-muted-foreground">#{o.sequenceOrder + 1}</span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No offers yet.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──

function OfferSummary({ offers }: { offers: Offer[] }) {
  if (!offers || offers.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
  const accepted = offers.filter((o) => o.status === "accepted").length;
  const pending = offers.filter((o) => o.status === "pending").length;
  const rejected = offers.filter((o) => o.status === "rejected").length;

  return (
    <div className="flex items-center gap-1 text-[10px]">
      <span className="text-muted-foreground">{offers.length}</span>
      {accepted > 0 && <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-green-500/10 text-green-600">{accepted} ok</Badge>}
      {pending > 0 && <Badge variant="secondary" className="text-[9px] px-1 py-0">{pending} wait</Badge>}
      {rejected > 0 && <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-red-500/10 text-red-600">{rejected} no</Badge>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
