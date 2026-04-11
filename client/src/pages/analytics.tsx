import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  BarChart3, Activity, Clock, FileSpreadsheet, TrendingUp, Users,
  Filter, X, ChevronDown, RotateCcw, AlertTriangle,
} from "lucide-react";
import {
  BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#06b6d4", "#84cc16"];

type DatePreset = "30D" | "3M" | "6M" | "1Y" | "All";

function getDateRange(preset: DatePreset): { dateFrom: string; dateTo: string } | null {
  if (preset === "All") return null;
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now);
  if (preset === "30D") from.setDate(from.getDate() - 30);
  else if (preset === "3M") from.setMonth(from.getMonth() - 3);
  else if (preset === "6M") from.setMonth(from.getMonth() - 6);
  else if (preset === "1Y") from.setFullYear(from.getFullYear() - 1);
  return { dateFrom: from.toISOString().slice(0, 10), dateTo: to };
}

function formatNumber(n: number | undefined | null): string {
  if (n === undefined || n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function AnalyticsPage() {
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>("All");
  const [sourcePopoverOpen, setSourcePopoverOpen] = useState(false);
  const [accountPopoverOpen, setAccountPopoverOpen] = useState(false);

  // Fetch filter options
  const { data: filterOptions } = useQuery<{ sources: string[]; accounts: string[] }>({
    queryKey: ["/api/analytics/filters"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/analytics/filters");
      return res.json();
    },
  });

  // Build query params from filter state
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedSources.length > 0) params.set("source", selectedSources.join(","));
    if (selectedAccounts.length > 0) params.set("account", selectedAccounts.join(","));
    if (selectedStatus) params.set("status", selectedStatus);
    const dateRange = getDateRange(datePreset);
    if (dateRange) {
      params.set("dateFrom", dateRange.dateFrom);
      params.set("dateTo", dateRange.dateTo);
    }
    return params.toString();
  }, [selectedSources, selectedAccounts, selectedStatus, datePreset]);

  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["/api/analytics", queryParams],
    queryFn: async () => {
      const url = queryParams ? `/api/analytics?${queryParams}` : "/api/analytics";
      const res = await apiRequest("GET", url);
      return res.json();
    },
  });

  // Filter accounts list by selected sources
  const availableAccounts = useMemo(() => {
    if (!filterOptions?.accounts) return [];
    return filterOptions.accounts;
  }, [filterOptions]);

  const hasFilters = selectedSources.length > 0 || selectedAccounts.length > 0 || selectedStatus !== null || datePreset !== "All";

  const resetFilters = () => {
    setSelectedSources([]);
    setSelectedAccounts([]);
    setSelectedStatus(null);
    setDatePreset("All");
  };

  const toggleSource = (src: string) => {
    setSelectedSources((prev) =>
      prev.includes(src) ? prev.filter((s) => s !== src) : [...prev, src],
    );
  };

  const toggleAccount = (acc: string) => {
    setSelectedAccounts((prev) =>
      prev.includes(acc) ? prev.filter((a) => a !== acc) : [...prev, acc],
    );
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4" data-testid="analytics-loading">
        <h1 className="text-lg font-semibold">Analytics</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-72 rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6" data-testid="analytics-error">
        <h1 className="text-lg font-semibold mb-4">Analytics</h1>
        <p className="text-muted-foreground">No data available yet. Start assigning tasks to see analytics.</p>
      </div>
    );
  }

  // ── Total WWC (server-computed, accurate) ──
  const totalWwc = data.totalWwc || 0;

  // ── Active (ongoing) tasks ──
  const activeTasks = data.byStatus?.Ongoing || data.byStatus?.ongoing || 0;

  // ── Monthly Volume chart data ──
  const monthlyData = (data.byMonth || []).map(([month, info]: [string, any]) => ({
    month,
    count: info.count || 0,
    wwc: info.wwc || 0,
  }));

  // ── Status distribution ──
  const statusData = Object.entries(data.byStatus || {}).map(([name, value]) => ({
    name,
    value: value as number,
  }));

  // ── Top Freelancers by WWC ──
  const topFreelancers = (data.topFreelancersByWwc || []).slice(0, 15);

  // ── Account Distribution (top 10) ──
  const accountData = (data.byAccount || [])
    .slice(0, 10)
    .map(([name, info]: [string, any]) => ({
      name: name.length > 20 ? name.slice(0, 18) + "…" : name,
      fullName: name,
      count: info.count || 0,
      wwc: info.totalWwc || 0,
    }));

  // ── Source Distribution ──
  const sourceData = (data.bySourceSummary || []).map(([name, info]: [string, any]) => ({
    name,
    count: info.count || 0,
    wwc: Math.round(info.totalWwc || 0),
    ongoing: info.ongoing || 0,
  }));

  // ── Dispatch Activity (byDay) ──
  const dayData = (data.byDay || []).map(([date, counts]: [string, any]) => ({
    date: date.slice(5), // "03-24"
    created: counts.created || 0,
    accepted: counts.accepted || 0,
    completed: counts.completed || 0,
  }));

  // ── Assignment Types ──
  const typeData = Object.entries(data.byType || {}).map(([name, value]) => ({
    name: name === "direct" ? "Direct" : name === "sequence" ? "Sequential" : name === "broadcast" ? "Broadcast" : name,
    value: value as number,
  }));

  const STATUS_COLORS: Record<string, string> = {
    Delivered: "#10b981",
    delivered: "#10b981",
    Ongoing: "#3b82f6",
    ongoing: "#3b82f6",
    Cancelled: "#ef4444",
    cancelled: "#ef4444",
    "On Hold": "#f59e0b",
    "on hold": "#f59e0b",
  };

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto" data-testid="analytics-page">
      <h1 className="text-lg font-semibold text-foreground">Analytics</h1>

      {/* ── Filter Bar ── */}
      <div
        className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-card border border-white/[0.06]"
        data-testid="analytics-filter-bar"
      >
        <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />

        {/* Source multi-select */}
        <Popover open={sourcePopoverOpen} onOpenChange={setSourcePopoverOpen}>
          <PopoverTrigger asChild>
            <button
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-white/[0.04] border border-white/[0.08] text-foreground hover:bg-white/[0.08] transition-colors"
              data-testid="filter-source-trigger"
            >
              Source
              {selectedSources.length > 0 && (
                <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-[10px] h-4 min-w-0">
                  {selectedSources.length}
                </Badge>
              )}
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            <div className="max-h-64 overflow-y-auto space-y-0.5">
              {(filterOptions?.sources || []).map((src) => (
                <button
                  key={src}
                  onClick={() => toggleSource(src)}
                  className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                    selectedSources.includes(src)
                      ? "bg-blue-500/15 text-blue-400 font-medium"
                      : "text-foreground hover:bg-white/[0.06]"
                  }`}
                  data-testid={`filter-source-${src}`}
                >
                  {src}
                </button>
              ))}
              {(!filterOptions?.sources || filterOptions.sources.length === 0) && (
                <p className="text-xs text-muted-foreground py-2 text-center">No sources</p>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Active source pills */}
        {selectedSources.map((src) => (
          <span
            key={src}
            className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/15 text-blue-400 border border-blue-500/20"
          >
            {src}
            <button onClick={() => toggleSource(src)} className="hover:text-blue-200 p-0.5">
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}

        {/* Account multi-select */}
        <Popover open={accountPopoverOpen} onOpenChange={setAccountPopoverOpen}>
          <PopoverTrigger asChild>
            <button
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-white/[0.04] border border-white/[0.08] text-foreground hover:bg-white/[0.08] transition-colors"
              data-testid="filter-account-trigger"
            >
              Account
              {selectedAccounts.length > 0 && (
                <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-[10px] h-4 min-w-0">
                  {selectedAccounts.length}
                </Badge>
              )}
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <div className="max-h-64 overflow-y-auto space-y-0.5">
              {availableAccounts.map((acc) => (
                <button
                  key={acc}
                  onClick={() => toggleAccount(acc)}
                  className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                    selectedAccounts.includes(acc)
                      ? "bg-purple-500/15 text-purple-400 font-medium"
                      : "text-foreground hover:bg-white/[0.06]"
                  }`}
                  data-testid={`filter-account-${acc}`}
                >
                  {acc}
                </button>
              ))}
              {availableAccounts.length === 0 && (
                <p className="text-xs text-muted-foreground py-2 text-center">No accounts</p>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Active account pills */}
        {selectedAccounts.map((acc) => (
          <span
            key={acc}
            className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[10px] font-medium bg-purple-500/15 text-purple-400 border border-purple-500/20"
          >
            {acc.length > 18 ? acc.slice(0, 16) + "…" : acc}
            <button onClick={() => toggleAccount(acc)} className="hover:text-purple-200 p-0.5">
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}

        {/* Separator */}
        <div className="w-px h-5 bg-white/[0.08] mx-0.5" />

        {/* Date range presets */}
        {(["30D", "3M", "6M", "1Y", "All"] as DatePreset[]).map((preset) => (
          <button
            key={preset}
            onClick={() => setDatePreset(preset)}
            className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
              datePreset === preset
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                : "text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
            }`}
            data-testid={`filter-date-${preset.toLowerCase()}`}
          >
            {preset}
          </button>
        ))}

        {/* Reset button */}
        {hasFilters && (
          <>
            <div className="w-px h-5 bg-white/[0.08] mx-0.5" />
            <button
              onClick={resetFilters}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-red-400 hover:bg-red-500/10 transition-colors"
              data-testid="filter-reset"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          </>
        )}
      </div>

      {/* Status filter pill */}
      {selectedStatus && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
            Status: {selectedStatus}
            <button onClick={() => setSelectedStatus(null)} className="hover:text-emerald-200 p-0.5 ml-0.5">
              <X className="w-3 h-3" />
            </button>
          </span>
        </div>
      )}

      {/* ── Row 1: KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="kpi-row">
        <KpiCard
          icon={<FileSpreadsheet className="w-4 h-4" />}
          label="Total Tasks (Sheet)"
          value={formatNumber(data.totalSheetTasks)}
          color="text-blue-500"
          testId="kpi-total-tasks"
          onClick={() => setSelectedStatus(null)}
        />
        <KpiCard
          icon={<Activity className="w-4 h-4" />}
          label="Ongoing"
          value={formatNumber(activeTasks)}
          color="text-emerald-500"
          testId="kpi-active-tasks"
          onClick={() => setSelectedStatus(selectedStatus === "Ongoing" ? null : "Ongoing")}
        />
        <KpiCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Delivered"
          value={formatNumber(data.byStatus?.Delivered || data.byStatus?.delivered || 0)}
          color="text-blue-400"
          testId="kpi-delivered"
          onClick={() => setSelectedStatus(selectedStatus === "Delivered" ? null : "Delivered")}
        />
        <KpiCard
          icon={<AlertTriangle className="w-4 h-4" />}
          label="Cancelled"
          value={formatNumber(data.byStatus?.Cancelled || data.byStatus?.cancelled || 0)}
          color="text-red-500"
          testId="kpi-cancelled"
          onClick={() => setSelectedStatus(selectedStatus === "Cancelled" ? null : "Cancelled")}
        />
      </div>

      {/* ── Row 1b: Secondary KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="kpi-row-secondary">
        <KpiCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Total WWC"
          value={formatNumber(totalWwc)}
          color="text-purple-500"
          testId="kpi-total-wwc"
        />
        <KpiCard
          icon={<Users className="w-4 h-4" />}
          label="Sources"
          value={sourceData.length}
          color="text-orange-500"
          testId="kpi-sources"
        />
        <KpiCard
          icon={<Clock className="w-4 h-4" />}
          label="Avg Response"
          value={data.avgResponseTimeMinutes ? `${data.avgResponseTimeMinutes}m` : "—"}
          color="text-cyan-500"
          testId="kpi-avg-response"
        />
        <KpiCard
          icon={<Users className="w-4 h-4" />}
          label="Dispatch Assignments"
          value={formatNumber(data.totalAssignments)}
          color="text-amber-500"
          testId="kpi-total-assignments"
        />
      </div>

      {/* ── Row 2: Monthly Volume + Status Distribution ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Monthly Volume — Dual Axis BarChart */}
        <Card className="bg-card border border-white/[0.06]" data-testid="chart-monthly-volume">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">Monthly Volume</CardTitle>
          </CardHeader>
          <CardContent>
            {monthlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: 12 }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="count" fill="#3b82f6" name="Tasks" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="right" dataKey="wwc" fill="#8b5cf6" name="WWC" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </CardContent>
        </Card>

        {/* Task Status Distribution — PieChart */}
        <Card className="bg-card border border-white/[0.06]" data-testid="chart-status-distribution">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">Task Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {statusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {statusData.map((entry, i) => (
                      <Cell key={i} fill={STATUS_COLORS[entry.name] || COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </CardContent>
        </Card>
      </div>

      {/* ── Row 3: Top 15 Freelancers by WWC + Account Distribution ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top 15 Freelancers by WWC — horizontal BarChart */}
        <Card className="bg-card border border-white/[0.06]" data-testid="chart-top-freelancers">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">Top 15 Freelancers by WWC</CardTitle>
          </CardHeader>
          <CardContent>
            {topFreelancers.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(300, topFreelancers.length * 36)}>
                <BarChart data={topFreelancers} layout="vertical" margin={{ left: 10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    width={100}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: 12 }}
                    formatter={(value: any, name: string, props: any) => {
                      const entry = props.payload;
                      if (name === "wwc") {
                        return [formatNumber(value), "WWC"];
                      }
                      return [value, name];
                    }}
                    labelFormatter={(label: string, payload: any[]) => {
                      if (payload?.[0]?.payload) {
                        const e = payload[0].payload;
                        return `${e.name} (${e.code}) — ${e.tasks} tasks${e.avgQs ? `, QS: ${e.avgQs}` : ""}`;
                      }
                      return label;
                    }}
                  />
                  <Bar dataKey="wwc" fill="#3b82f6" name="wwc" radius={[0, 4, 4, 0]}>
                    {topFreelancers.map((entry: any, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
            {/* Freelancer detail badges below chart */}
            {topFreelancers.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5" data-testid="freelancer-badges">
                {topFreelancers.slice(0, 10).map((f: any, i: number) => (
                  <span
                    key={f.code || i}
                    className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06] text-muted-foreground"
                    data-testid={`badge-freelancer-${f.code}`}
                  >
                    <span className="font-medium text-foreground">{f.code}</span>
                    {f.tasks && <span>{f.tasks}t</span>}
                    {f.avgQs && (
                      <span className={`font-medium ${f.avgQs >= 4.5 ? "text-emerald-400" : f.avgQs >= 3.5 ? "text-blue-400" : "text-amber-400"}`}>
                        QS:{f.avgQs}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Translator Workload Balance — horizontal BarChart */}
        <Card className="bg-card border border-white/[0.06]" data-testid="chart-workload-balance">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              Translator Workload
              {data.avgOngoingPerTranslator > 0 && (
                <span className="text-[10px] font-normal text-muted-foreground">
                  avg: {data.avgOngoingPerTranslator} ongoing
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(data.workloadData || []).length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(300, (data.workloadData || []).length * 28)}>
                <BarChart data={data.workloadData} layout="vertical" margin={{ left: 10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis
                    type="category"
                    dataKey="code"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    width={60}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: 12 }}
                    formatter={(value: any, name: string) => [value, name === "ongoing" ? "Ongoing Tasks" : "Total Tasks"]}
                  />
                  <Bar dataKey="ongoing" name="ongoing" radius={[0, 4, 4, 0]}>
                    {(data.workloadData || []).map((entry: any, i: number) => (
                      <Cell key={i} fill={entry.overloaded ? "#ef4444" : entry.heavy ? "#f59e0b" : "#10b981"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </CardContent>
        </Card>
      </div>

      {/* ── Row 3b: Account Distribution ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Account Distribution — BarChart */}
        <Card className="bg-card border border-white/[0.06]" data-testid="chart-account-distribution">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">Account Distribution (Top 10)</CardTitle>
          </CardHeader>
          <CardContent>
            {accountData.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(300, accountData.length * 36)}>
                <BarChart data={accountData} layout="vertical" margin={{ left: 10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    width={120}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: 12 }}
                    formatter={(value: any, name: string) => [formatNumber(value as number), name === "count" ? "Tasks" : "WWC"]}
                    labelFormatter={(label: string, payload: any[]) => payload?.[0]?.payload?.fullName || label}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="count" fill="#10b981" name="Tasks" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="wwc" fill="#f59e0b" name="WWC" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </CardContent>
        </Card>
      </div>

      {/* ── Row 4: Source Distribution ── */}
      {sourceData.length > 0 && (
        <Card className="bg-card border border-white/[0.06]" data-testid="chart-source-distribution">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">Source Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(260, sourceData.length * 36)}>
              <BarChart data={sourceData} layout="vertical" margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  width={90}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: 12 }}
                  formatter={(value: any, name: string) => [formatNumber(value as number), name === "count" ? "Tasks" : name === "wwc" ? "WWC" : "Ongoing"]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="count" fill="#3b82f6" name="Tasks" radius={[0, 4, 4, 0]} />
                <Bar dataKey="ongoing" fill="#10b981" name="Ongoing" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── Row 5: Dispatch Activity + Assignment Types (only if data exists) ── */}
      {(dayData.length > 0 || typeData.length > 0) && (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Dispatch Activity — AreaChart */}
        <Card className="bg-card border border-white/[0.06] md:col-span-2" data-testid="chart-dispatch-activity">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">Dispatch Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {dayData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={dayData}>
                  <defs>
                    <linearGradient id="gradCreated" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradAccepted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradCompleted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="created" stroke="#3b82f6" fill="url(#gradCreated)" name="Created" strokeWidth={2} />
                  <Area type="monotone" dataKey="accepted" stroke="#10b981" fill="url(#gradAccepted)" name="Accepted" strokeWidth={2} />
                  <Area type="monotone" dataKey="completed" stroke="#f59e0b" fill="url(#gradCompleted)" name="Completed" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </CardContent>
        </Card>

        {/* Assignment Types — PieChart */}
        <Card className="bg-card border border-white/[0.06]" data-testid="chart-assignment-types">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">Assignment Types</CardTitle>
          </CardHeader>
          <CardContent>
            {typeData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={typeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                    labelLine={false}
                  >
                    {typeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </CardContent>
        </Card>
      </div>
      )}
    </div>
  );
}

// ── Sub-components ──

function KpiCard({ icon, label, value, color, testId, onClick }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
  testId: string;
  onClick?: () => void;
}) {
  return (
    <Card
      className={`bg-card border border-white/[0.06] transition-all duration-150 ${onClick ? "cursor-pointer hover:border-white/[0.15] hover:shadow-lg hover:shadow-black/10" : ""}`}
      data-testid={testId}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className={color}>{icon}</span>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function EmptyChart() {
  return (
    <p className="text-center text-muted-foreground py-12 text-sm">No data</p>
  );
}
