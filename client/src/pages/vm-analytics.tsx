import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";
import {
  BarChart3, TrendingUp, Clock, Users, Percent,
} from "lucide-react";

const CHART_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

export default function VMAnalyticsPage() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 84); // 12 weeks
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/vm/analytics", dateFrom, dateTo],
    queryFn: async () => {
      const res = await fetch(`/api/vm/analytics?dateFrom=${dateFrom}&dateTo=${dateTo}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("elturco_auth") ? JSON.parse(localStorage.getItem("elturco_auth")!).authToken : sessionStorage.getItem("elturco_auth") ? JSON.parse(sessionStorage.getItem("elturco_auth")!).authToken : ""}` },
      });
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-2 gap-6">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const kpis = data?.kpis || {};
  const weeklyApps = (data?.weeklyApplications || []).map((w: any) => ({
    ...w,
    week: w.week ? new Date(w.week).toLocaleDateString("en", { month: "short", day: "numeric" }) : "",
  }));
  const pipelineDistribution = data?.pipelineDistribution || [];
  const topLangPairs = data?.topLanguagePairs || [];
  const churnData = (data?.churnData || []).map((c: any) => ({
    ...c,
    month: c.month ? new Date(c.month).toLocaleDateString("en", { month: "short", year: "2-digit" }) : "",
  }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-blue-400" />
            VM Analytics
          </h1>
          <p className="text-sm text-white/40 mt-1">Vendor management performance metrics</p>
        </div>
        <div className="flex items-center gap-3">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-white/[0.03] border-white/[0.08] text-white text-sm w-36"
          />
          <span className="text-white/30">to</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-white/[0.03] border-white/[0.08] text-white text-sm w-36"
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-[#151922] border-white/[0.06]">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white/40 font-medium">Total Applications</p>
                <p className="text-2xl font-bold text-white mt-1">{kpis.totalApplications || 0}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#151922] border-white/[0.06]">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white/40 font-medium">Approval Rate</p>
                <p className="text-2xl font-bold text-white mt-1">{kpis.approvalRate || 0}%</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Percent className="w-5 h-5 text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#151922] border-white/[0.06]">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white/40 font-medium">Avg Review Time</p>
                <p className="text-2xl font-bold text-white mt-1">{kpis.avgReviewHours ? `${kpis.avgReviewHours}h` : "N/A"}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Clock className="w-5 h-5 text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#151922] border-white/[0.06]">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white/40 font-medium">Active Vendors</p>
                <p className="text-2xl font-bold text-white mt-1">{kpis.activeVendorCount || 0}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-amber-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Applications Bar Chart */}
        <Card className="bg-[#151922] border-white/[0.06]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/60">Applications Per Week</CardTitle>
          </CardHeader>
          <CardContent>
            {weeklyApps.length === 0 ? (
              <p className="text-sm text-white/20 text-center py-8">No data in selected range</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={weeklyApps}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="week" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "#1a1d27", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12, color: "white" }}
                  />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Pipeline Distribution Donut */}
        <Card className="bg-[#151922] border-white/[0.06]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/60">Pipeline Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {pipelineDistribution.length === 0 ? (
              <p className="text-sm text-white/20 text-center py-8">No vendors in pipeline</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={pipelineDistribution}
                    dataKey="count"
                    nameKey="status"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {pipelineDistribution.map((_: any, index: number) => (
                      <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#1a1d27", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12, color: "white" }}
                  />
                  <Legend
                    formatter={(value) => <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 10 }}>{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Language Pairs */}
        <Card className="bg-[#151922] border-white/[0.06]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/60">Top 10 Language Pairs (by Applications)</CardTitle>
          </CardHeader>
          <CardContent>
            {topLangPairs.length === 0 ? (
              <p className="text-sm text-white/20 text-center py-8">No data</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={topLangPairs} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis type="number" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} allowDecimals={false} />
                  <YAxis
                    dataKey={(row: any) => `${row.source}→${row.target}`}
                    type="category"
                    tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
                    width={80}
                  />
                  <Tooltip
                    contentStyle={{ background: "#1a1d27", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12, color: "white" }}
                  />
                  <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Vendor Churn */}
        <Card className="bg-[#151922] border-white/[0.06]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/60">Vendor Churn (Active → Inactive/Blacklisted)</CardTitle>
          </CardHeader>
          <CardContent>
            {churnData.length === 0 ? (
              <p className="text-sm text-white/20 text-center py-8">No churn data in selected range</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={churnData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "#1a1d27", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12, color: "white" }}
                  />
                  <Line type="monotone" dataKey="count" stroke="#ef4444" strokeWidth={2} dot={{ fill: "#ef4444", r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
