import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3, Activity, Clock, FileSpreadsheet, TrendingUp, Users,
} from "lucide-react";
import {
  BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#06b6d4", "#84cc16"];

function formatNumber(n: number | undefined | null): string {
  if (n === undefined || n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function AnalyticsPage() {
  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["/api/analytics"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/analytics");
      return res.json();
    },
  });

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

  // ── Compute total WWC from byMonth ──
  const totalWwc = (data.byMonth || []).reduce((sum: number, [, m]: [string, any]) => sum + (m.wwc || 0), 0);

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

      {/* ── Row 1: KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="kpi-row">
        <KpiCard
          icon={<FileSpreadsheet className="w-4 h-4" />}
          label="Total Tasks (Sheet)"
          value={formatNumber(data.totalSheetTasks)}
          color="text-blue-500"
          testId="kpi-total-tasks"
        />
        <KpiCard
          icon={<Activity className="w-4 h-4" />}
          label="Active Tasks"
          value={formatNumber(activeTasks)}
          color="text-emerald-500"
          testId="kpi-active-tasks"
        />
        <KpiCard
          icon={<Clock className="w-4 h-4" />}
          label="Avg Response Time"
          value={data.avgResponseTimeMinutes ? `${data.avgResponseTimeMinutes}m` : "—"}
          color="text-orange-500"
          testId="kpi-avg-response"
        />
        <KpiCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Total WWC"
          value={formatNumber(totalWwc)}
          color="text-purple-500"
          testId="kpi-total-wwc"
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

      {/* ── Row 4: Dispatch Activity + Assignment Types ── */}
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
    </div>
  );
}

// ── Sub-components ──

function KpiCard({ icon, label, value, color, testId }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
  testId: string;
}) {
  return (
    <Card className="bg-card border border-white/[0.06]" data-testid={testId}>
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
