import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck, AlertTriangle, Clock, FileText, TrendingUp, TrendingDown,
  CheckCircle, XCircle, Bell, Users, BarChart3, Star, MessageSquare,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";

const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

export default function QualityDashboardPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["/api/quality/dashboard"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/quality/dashboard");
      return r.json();
    },
  });

  const { data: trends } = useQuery({
    queryKey: ["/api/quality/trends"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/quality/trends");
      return r.json();
    },
  });

  const { data: feedbackSummary } = useQuery({
    queryKey: ["/api/quality/customer-feedback/summary"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/quality/customer-feedback/summary");
      return r.json();
    },
  });

  const acknowledgeAlert = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/quality/alerts/${id}/acknowledge`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quality/dashboard"] });
      toast({ title: "Alert acknowledged" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const kpi = dashboard?.kpi || {};
  const kpis = [
    { label: "Avg LQA Score", value: Number(kpi.avgLqaScore || 0).toFixed(1), icon: BarChart3, color: "text-blue-400", border: "border-l-blue-500", sub: "This month" },
    { label: "Reports This Month", value: kpi.totalReportsThisMonth || 0, icon: FileText, color: "text-emerald-400", border: "border-l-emerald-500", sub: "LQA evaluations" },
    { label: "Open Disputes", value: kpi.openDisputes || 0, icon: AlertTriangle, color: "text-amber-400", border: "border-l-amber-500", sub: "Awaiting resolution" },
    { label: "Avg Resolution", value: `${Number(kpi.avgResolutionDays || 0).toFixed(1)}d`, icon: Clock, color: "text-purple-400", border: "border-l-purple-500", sub: "Days to resolve" },
  ];

  return (
    <div className="p-6 space-y-6" data-testid="quality-dashboard">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ShieldCheck className="w-6 h-6 text-blue-400" />
        <h1 className="text-xl font-bold text-white">Quality Lead Dashboard</h1>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className={`bg-[#12141c] border-white/[0.06] border-l-2 ${k.border}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-white/40">{k.label}</span>
                <k.icon className={`w-4 h-4 ${k.color}`} />
              </div>
              <p className="text-2xl font-bold text-white">{k.value}</p>
              <p className="text-[10px] text-white/30 mt-1">{k.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-[#12141c] border border-white/[0.06]">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="disputes">Disputes</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="vendors">Vendors</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Reports */}
            <Card className="bg-[#12141c] border-white/[0.06]">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-white/70 flex items-center gap-2">
                  <FileText className="w-4 h-4" /> Recent Quality Reports
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(dashboard?.recentReports || []).slice(0, 8).map((r: any) => (
                    <div key={r.id} className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
                      <div>
                        <p className="text-xs text-white/70">{r.vendor_name || `Vendor #${r.vendor_id}`}</p>
                        <p className="text-[10px] text-white/30">{r.source_language}→{r.target_language}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-mono ${Number(r.total_score) >= 98 ? "text-emerald-400" : Number(r.total_score) >= 85 ? "text-amber-400" : "text-red-400"}`}>
                          {r.total_score != null ? Number(r.total_score).toFixed(1) : "—"}
                        </span>
                        <Badge className={`text-[9px] ${r.pass_fail === "pass" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" : r.pass_fail === "fail" ? "bg-red-500/15 text-red-400 border-red-500/25" : "bg-zinc-500/15 text-zinc-400 border-zinc-500/25"}`}>
                          {r.pass_fail || r.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                  {(!dashboard?.recentReports || dashboard.recentReports.length === 0) && (
                    <p className="text-xs text-white/30 text-center py-4">No reports yet</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* RCA Status */}
            <Card className="bg-[#12141c] border-white/[0.06]">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-white/70 flex items-center gap-2">
                  <Star className="w-4 h-4" /> RCA Status & Customer Feedback
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/[0.03] rounded-lg p-3">
                    <p className="text-[10px] text-white/40 mb-1">Open RCAs</p>
                    <p className="text-lg font-bold text-amber-400">{dashboard?.rca?.open_count || 0}</p>
                  </div>
                  <div className="bg-white/[0.03] rounded-lg p-3">
                    <p className="text-[10px] text-white/40 mb-1">Closed RCAs</p>
                    <p className="text-lg font-bold text-emerald-400">{dashboard?.rca?.closed_count || 0}</p>
                  </div>
                </div>
                {dashboard?.rca?.oldest_open && (
                  <p className="text-[10px] text-white/30">Oldest open RCA: {new Date(dashboard.rca.oldest_open).toLocaleDateString()}</p>
                )}

                <div className="border-t border-white/[0.06] pt-3">
                  <p className="text-xs text-white/50 mb-2 flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Customer Satisfaction</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/[0.03] rounded-lg p-3">
                      <p className="text-[10px] text-white/40 mb-1">Avg Rating</p>
                      <p className="text-lg font-bold text-blue-400">{feedbackSummary?.avg_overall || "—"}</p>
                    </div>
                    <div className="bg-white/[0.03] rounded-lg p-3">
                      <p className="text-[10px] text-white/40 mb-1">Total Feedback</p>
                      <p className="text-lg font-bold text-white/70">{feedbackSummary?.total_feedback || 0}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Disputes Tab */}
        <TabsContent value="disputes">
          <Card className="bg-[#12141c] border-white/[0.06]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-white/70 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Open Disputes ({dashboard?.openDisputes?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="text-left py-2 px-3 text-white/40 font-medium">Vendor</th>
                      <th className="text-left py-2 px-3 text-white/40 font-medium">Report Score</th>
                      <th className="text-left py-2 px-3 text-white/40 font-medium">Reason</th>
                      <th className="text-left py-2 px-3 text-white/40 font-medium">Days Open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(dashboard?.openDisputes || []).map((d: any) => (
                      <tr key={d.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                        <td className="py-2 px-3 text-white/70">{d.vendor_name || `Vendor #${d.vendor_id}`}</td>
                        <td className="py-2 px-3">
                          <span className={`font-mono ${Number(d.report_score) >= 98 ? "text-emerald-400" : "text-amber-400"}`}>
                            {d.report_score != null ? Number(d.report_score).toFixed(1) : "—"}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-white/50 max-w-[200px] truncate">{d.dispute_reason}</td>
                        <td className="py-2 px-3 text-white/50">
                          {Math.floor((Date.now() - new Date(d.created_at).getTime()) / (1000 * 60 * 60 * 24))}d
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(!dashboard?.openDisputes || dashboard.openDisputes.length === 0) && (
                  <p className="text-xs text-white/30 text-center py-8">No open disputes</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts">
          <Card className="bg-[#12141c] border-white/[0.06]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-white/70 flex items-center gap-2">
                <Bell className="w-4 h-4" /> Quality Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(dashboard?.alerts || []).map((a: any) => (
                  <div key={a.id} className={`flex items-center justify-between p-3 rounded-lg border ${a.severity === "critical" ? "border-red-500/20 bg-red-500/5" : "border-amber-500/20 bg-amber-500/5"}`}>
                    <div className="flex items-center gap-3">
                      {a.severity === "critical" ? <XCircle className="w-4 h-4 text-red-400" /> : <AlertTriangle className="w-4 h-4 text-amber-400" />}
                      <div>
                        <p className="text-xs text-white/70">{a.vendor_name || `Vendor #${a.vendor_id}`}</p>
                        <p className="text-[10px] text-white/40">{a.message}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`text-[9px] ${a.severity === "critical" ? "bg-red-500/15 text-red-400 border-red-500/25" : "bg-amber-500/15 text-amber-400 border-amber-500/25"}`}>
                        {a.severity}
                      </Badge>
                      <Button variant="ghost" size="sm" className="text-[10px] h-6 px-2" onClick={() => acknowledgeAlert.mutate(a.id)}>
                        <CheckCircle className="w-3 h-3 mr-1" /> Ack
                      </Button>
                    </div>
                  </div>
                ))}
                {(!dashboard?.alerts || dashboard.alerts.length === 0) && (
                  <p className="text-xs text-white/30 text-center py-8">No unacknowledged alerts</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trends Tab */}
        <TabsContent value="trends" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Monthly LQA Trend */}
            <Card className="bg-[#12141c] border-white/[0.06]">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-white/70">Monthly LQA Score Trend</CardTitle>
              </CardHeader>
              <CardContent>
                {(trends?.monthlyTrend || []).length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={trends.monthlyTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="month" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 10 }} />
                      <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 10 }} domain={[0, 100]} />
                      <RechartsTooltip contentStyle={{ background: "#1a1d27", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }} />
                      <Line type="monotone" dataKey="avg_score" name="Avg Score" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-xs text-white/30 text-center py-12">No trend data yet</p>
                )}
              </CardContent>
            </Card>

            {/* Error Category Distribution */}
            <Card className="bg-[#12141c] border-white/[0.06]">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-white/70">Error Category Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {(trends?.categoryDistribution || []).length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={trends.categoryDistribution} dataKey="count" nameKey="category" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {(trends.categoryDistribution || []).map((_: any, i: number) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip contentStyle={{ background: "#1a1d27", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-xs text-white/30 text-center py-12">No error data yet</p>
                )}
              </CardContent>
            </Card>

            {/* Severity Distribution */}
            <Card className="bg-[#12141c] border-white/[0.06]">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-white/70">Severity Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {(trends?.severityDistribution || []).length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={trends.severityDistribution}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="severity" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 10 }} />
                      <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 10 }} />
                      <RechartsTooltip contentStyle={{ background: "#1a1d27", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }} />
                      <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-xs text-white/30 text-center py-12">No severity data yet</p>
                )}
              </CardContent>
            </Card>

            {/* Dispute Resolution */}
            <Card className="bg-[#12141c] border-white/[0.06]">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-white/70">Dispute Resolution Rate</CardTitle>
              </CardHeader>
              <CardContent>
                {(trends?.disputeResolution || []).length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={trends.disputeResolution}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="month" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 10 }} />
                      <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 10 }} />
                      <RechartsTooltip contentStyle={{ background: "#1a1d27", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Line type="monotone" dataKey="total_disputes" name="Total" stroke="#ef4444" strokeWidth={2} />
                      <Line type="monotone" dataKey="resolved" name="Resolved" stroke="#10b981" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-xs text-white/30 text-center py-12">No dispute data yet</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Vendors Tab */}
        <TabsContent value="vendors" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Vendors */}
            <Card className="bg-[#12141c] border-white/[0.06]">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-white/70 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" /> Top 5 Vendors
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(dashboard?.topVendors || []).map((v: any, i: number) => (
                    <div key={v.vendor_id} className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-white/30 w-4">{i + 1}.</span>
                        <p className="text-xs text-white/70">{v.vendor_name}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-emerald-400">{Number(v.avg_score).toFixed(1)}</span>
                        <span className="text-[10px] text-white/30">({v.report_count} reports)</span>
                      </div>
                    </div>
                  ))}
                  {(!dashboard?.topVendors || dashboard.topVendors.length === 0) && (
                    <p className="text-xs text-white/30 text-center py-4">No vendor data</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Bottom Vendors */}
            <Card className="bg-[#12141c] border-white/[0.06]">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-white/70 flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-red-400" /> Bottom 5 Vendors
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(dashboard?.bottomVendors || []).map((v: any, i: number) => (
                    <div key={v.vendor_id} className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-white/30 w-4">{i + 1}.</span>
                        <p className="text-xs text-white/70">{v.vendor_name}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-red-400">{Number(v.avg_score).toFixed(1)}</span>
                        <span className="text-[10px] text-white/30">({v.report_count} reports)</span>
                      </div>
                    </div>
                  ))}
                  {(!dashboard?.bottomVendors || dashboard.bottomVendors.length === 0) && (
                    <p className="text-xs text-white/30 text-center py-4">No vendor data</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
