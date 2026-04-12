import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, Archive, Calendar, Building2, ChevronLeft, ChevronRight,
  ExternalLink, FolderKanban,
} from "lucide-react";

const STATUS_OPTIONS = ["all", "active", "confirmed", "in_progress", "delivered", "completed", "invoiced", "closed", "cancelled"];
const QUICK_FILTERS = [
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "This year", days: 365 },
  { label: "All time", days: 0 },
];

const STATUS_COLORS: Record<string, string> = {
  active: "text-yellow-400 border-yellow-400/20",
  confirmed: "text-blue-400 border-blue-400/20",
  in_progress: "text-yellow-400 border-yellow-400/20",
  delivered: "text-cyan-400 border-cyan-400/20",
  completed: "text-emerald-400 border-emerald-400/20",
  invoiced: "text-indigo-400 border-indigo-400/20",
  closed: "text-white/40 border-white/10",
  cancelled: "text-red-400 border-red-400/20",
  draft: "text-white/40 border-white/10",
};

export default function ProjectArchivePage() {
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);

  const buildQuery = () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (status && status !== "all") params.set("status", status);
    params.set("page", String(page));
    params.set("limit", "25");
    return params.toString();
  };

  const { data, isLoading } = useQuery({
    queryKey: ["/api/projects/archive", search, dateFrom, dateTo, status, page],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects/archive?${buildQuery()}`);
      return res.json();
    },
  });

  const projects = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 25);

  const applyQuickFilter = (days: number) => {
    if (days === 0) {
      setDateFrom("");
      setDateTo("");
    } else {
      const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      setDateFrom(from.toISOString().slice(0, 10));
      setDateTo(new Date().toISOString().slice(0, 10));
    }
    setPage(1);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2">
            <Archive className="w-5 h-5 text-white/40" /> Project Archive
          </h1>
          <p className="text-xs text-white/30 mt-1">Search and filter historical projects</p>
        </div>
        <div className="text-xs text-white/20">{total} project{total !== 1 ? "s" : ""} found</div>
      </div>

      {/* Filters */}
      <Card className="bg-[#0f1219] border-white/[0.06]">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-white/20" />
                <Input
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Search by name, code, or notes..."
                  className="pl-9 bg-white/[0.04] border-white/[0.08] text-white text-sm h-9"
                />
              </div>
            </div>
            <Select value={status} onValueChange={v => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="w-[140px] h-9 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s === "all" ? "All Statuses" : s.replace("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className="w-[140px] bg-white/[0.04] border-white/[0.08] text-white text-xs h-9" />
            <span className="text-white/20 text-xs">to</span>
            <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} className="w-[140px] bg-white/[0.04] border-white/[0.08] text-white text-xs h-9" />
          </div>
          <div className="flex gap-2">
            {QUICK_FILTERS.map(f => (
              <Button key={f.label} variant="outline" size="sm" className="text-xs h-7 border-white/10" onClick={() => applyQuickFilter(f.days)}>
                {f.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card className="bg-[#0f1219] border-white/[0.06]">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full bg-white/[0.06]" />)}
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-12">
              <FolderKanban className="w-8 h-8 text-white/10 mx-auto mb-2" />
              <p className="text-sm text-white/20">No projects found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-white/[0.06]">
                  <TableHead className="text-white/30 text-xs">Code</TableHead>
                  <TableHead className="text-white/30 text-xs">Project Name</TableHead>
                  <TableHead className="text-white/30 text-xs">Customer</TableHead>
                  <TableHead className="text-white/30 text-xs">Status</TableHead>
                  <TableHead className="text-white/30 text-xs">Deadline</TableHead>
                  <TableHead className="text-white/30 text-xs">Created</TableHead>
                  <TableHead className="text-white/30 text-xs w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((p: any) => (
                  <TableRow key={p.id} className="border-white/[0.04] hover:bg-white/[0.02]">
                    <TableCell className="text-xs text-white/40 font-mono">{p.projectCode || "—"}</TableCell>
                    <TableCell className="text-xs text-white">{p.projectName}</TableCell>
                    <TableCell className="text-xs text-white/40">{p.customerName || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[p.status] || "text-white/40 border-white/10"}`}>
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-white/40">{p.deadline ? new Date(p.deadline).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="text-xs text-white/20">{new Date(p.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Link href={`/projects/${p.id}`}>
                        <a className="text-blue-400 hover:text-blue-300"><ExternalLink className="w-3.5 h-3.5" /></a>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft className="w-3 h-3 mr-1" /> Prev
          </Button>
          <span className="text-xs text-white/30">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            Next <ChevronRight className="w-3 h-3 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
