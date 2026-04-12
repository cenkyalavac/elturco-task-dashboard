import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, Award, AlertTriangle, FileText, TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, LineChart, Line, Legend,
} from "recharts";

export default function QualityAnalyticsPage() {
  const { t } = useTranslation();
  const [timeRange, setTimeRange] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["/api/analytics/quality", timeRange],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/analytics/quality");
      return r.json();
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const kpis = [
    { label: t("qualityAnalytics.totalReports"), value: data?.totalReports || 0, icon: FileText, color: "text-blue-400", bg: "border-l-blue-500" },
    { label: t("qualityAnalytics.avgQs"), value: (data?.avgQs || 0).toFixed(1), icon: Award, color: "text-emerald-400", bg: "border-l-emerald-500" },
    { label: t("qualityAnalytics.avgLqa"), value: (data?.avgLqa || 0).toFixed(1), icon: BarChart3, color: "text-amber-400", bg: "border-l-amber-500" },
    { label: t("qualityAnalytics.flaggedVendors"), value: data?.flaggedVendors || 0, icon: AlertTriangle, color: "text-red-400", bg: "border-l-red-500" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">{t("qualityAnalytics.title")}</h1>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-32 bg-white/5 border-white/10 text-white text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="1m">Last Month</SelectItem>
            <SelectItem value="3m">Last 3 Months</SelectItem>
            <SelectItem value="6m">Last 6 Months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <div key={i} className={`bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 border-l-4 ${kpi.bg} relative overflow-hidden`}>
            <kpi.icon className={`absolute top-3 right-3 w-8 h-8 ${kpi.color} opacity-20`} />
            <p className="text-xs text-white/50 uppercase tracking-wider">{kpi.label}</p>
            <p className="text-2xl font-bold text-white mt-1 tabular-nums">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quality Trend Chart */}
        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white/70">{t("qualityAnalytics.qualityTrend")}</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.trend?.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={data.trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
                  <RechartsTooltip contentStyle={{ background: "#1a1d27", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
                  <Legend />
                  <Line type="monotone" dataKey="avgLqa" stroke="#f59e0b" name="LQA" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="avgQs" stroke="#10b981" name="QS" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-white/30 text-sm">No trend data available</div>
            )}
          </CardContent>
        </Card>

        {/* Account Breakdown */}
        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white/70">{t("qualityAnalytics.accountBreakdown")}</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.accountBreakdown?.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data.accountBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="account" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
                  <RechartsTooltip contentStyle={{ background: "#1a1d27", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Reports" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-white/30 text-sm">No account data available</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Performers Table */}
      <Card className="bg-white/[0.03] border-white/[0.06]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-white/70">{t("qualityAnalytics.topPerformers")}</CardTitle>
        </CardHeader>
        <CardContent>
          {data?.topPerformers?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-white/40 border-b border-white/[0.06]">
                    <th className="text-left pb-2 pl-2">#</th>
                    <th className="text-left pb-2">Vendor</th>
                    <th className="text-right pb-2">Avg LQA</th>
                    <th className="text-right pb-2">Avg QS</th>
                    <th className="text-right pb-2">Combined</th>
                    <th className="text-right pb-2 pr-2">Reviews</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topPerformers.map((p: any, i: number) => (
                    <tr key={p.vendorId} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                      <td className="py-2 pl-2 text-white/50">{i + 1}</td>
                      <td className="py-2">
                        <a href={`#/vendors/${p.vendorId}`} className="text-blue-400 hover:text-blue-300">{p.vendorName || `Vendor #${p.vendorId}`}</a>
                      </td>
                      <td className="py-2 text-right text-white/70">{p.avgLqa?.toFixed(1) || "-"}</td>
                      <td className="py-2 text-right text-white/70">{p.avgQs?.toFixed(1) || "-"}</td>
                      <td className="py-2 text-right">
                        <Badge variant="outline" className={`text-xs ${p.combined >= 90 ? "text-emerald-400 border-emerald-500/30" : p.combined >= 70 ? "text-amber-400 border-amber-500/30" : "text-red-400 border-red-500/30"}`}>
                          {p.combined?.toFixed(1)}
                        </Badge>
                      </td>
                      <td className="py-2 text-right pr-2 text-white/50">{p.reviewCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center text-white/30 text-sm">No performance data available</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
