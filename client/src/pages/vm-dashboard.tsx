import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import {
  Users, ClipboardList, Clock, TrendingUp,
  ArrowRight, FileWarning, CalendarClock, Activity,
  BarChart3, Globe,
} from "lucide-react";

export default function VMDashboardPage() {
  const [, navigate] = useLocation();

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/vm/dashboard"],
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold text-white">VM Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const stats = data?.applicationStats || {};
  const pipeline = data?.pipeline || [];
  const quickActions = data?.quickActions || [];
  const activityFeed = data?.activityFeed || [];
  const capacitySummary = data?.capacitySummary || [];
  const deadlines = data?.upcomingDeadlines || {};

  const stageColors: Record<string, string> = {
    "New Application": "bg-blue-500/20 text-blue-400",
    "CV Review": "bg-yellow-500/20 text-yellow-400",
    "Quiz Pending": "bg-orange-500/20 text-orange-400",
    "Quiz Passed": "bg-emerald-500/20 text-emerald-400",
    "Test Task": "bg-purple-500/20 text-purple-400",
    "Interview": "bg-pink-500/20 text-pink-400",
    "NDA Pending": "bg-amber-500/20 text-amber-400",
    "Active": "bg-green-500/20 text-green-400",
    "Inactive": "bg-gray-500/20 text-gray-400",
    "Blacklisted": "bg-red-500/20 text-red-400",
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Vendor Manager Dashboard</h1>
          <p className="text-sm text-white/40 mt-1">Overview of vendor pipeline and applications</p>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-[#151922] border-white/[0.06]">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white/40 font-medium">Total Applications</p>
                <p className="text-2xl font-bold text-white mt-1">{stats.total || 0}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <ClipboardList className="w-5 h-5 text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#151922] border-white/[0.06]">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white/40 font-medium">This Week</p>
                <p className="text-2xl font-bold text-white mt-1">{stats.thisWeek || 0}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#151922] border-white/[0.06]">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white/40 font-medium">Pending Review</p>
                <p className="text-2xl font-bold text-white mt-1">{stats.pendingReview || 0}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-amber-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#151922] border-white/[0.06]">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white/40 font-medium">Avg Review Time</p>
                <p className="text-2xl font-bold text-white mt-1">{stats.avgReviewHours ? `${stats.avgReviewHours}h` : "N/A"}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Clock className="w-5 h-5 text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pipeline Overview */}
        <Card className="bg-[#151922] border-white/[0.06] lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-white/60">Pipeline Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {pipeline.map((stage: any) => (
                <div key={stage.status} className={`rounded-lg p-3 text-center ${stageColors[stage.status] || "bg-white/5 text-white/60"}`}>
                  <p className="text-lg font-bold">{stage.count}</p>
                  <p className="text-[10px] font-medium mt-0.5 truncate">{stage.status}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="bg-[#151922] border-white/[0.06]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-white/60">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {quickActions.map((action: any) => (
              <button
                key={action.label}
                onClick={() => navigate(action.href)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] text-white/70 hover:text-white transition-all text-sm"
              >
                <span>{action.label}</span>
                <div className="flex items-center gap-2">
                  {action.count > 0 && (
                    <Badge variant="secondary" className="bg-blue-500/20 text-blue-400 text-[10px]">
                      {action.count}
                    </Badge>
                  )}
                  <ArrowRight className="w-3.5 h-3.5 text-white/30" />
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity Feed */}
        <Card className="bg-[#151922] border-white/[0.06]">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-white/40" />
              <CardTitle className="text-sm font-medium text-white/60">Recent Activity</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {activityFeed.length === 0 ? (
                <p className="text-sm text-white/20 text-center py-4">No recent activity</p>
              ) : (
                activityFeed.map((item: any) => (
                  <div key={item.id} className="flex items-start gap-3 pb-3 border-b border-white/[0.04] last:border-0">
                    <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white/70">
                        <span className="font-medium text-white/90">{item.vendorName}</span>
                        {" "}
                        {item.fromStage ? (
                          <>moved from <Badge variant="outline" className="text-[10px] mx-0.5">{item.fromStage}</Badge> to <Badge variant="outline" className="text-[10px] mx-0.5">{item.toStage}</Badge></>
                        ) : (
                          <>entered <Badge variant="outline" className="text-[10px] mx-0.5">{item.toStage}</Badge></>
                        )}
                      </p>
                      <p className="text-[10px] text-white/30 mt-0.5">
                        {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ""}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Capacity Summary + Deadlines */}
        <div className="space-y-6">
          <Card className="bg-[#151922] border-white/[0.06]">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-white/40" />
                <CardTitle className="text-sm font-medium text-white/60">Top Language Pairs (Active Vendors)</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {capacitySummary.length === 0 ? (
                <p className="text-sm text-white/20 text-center py-4">No data</p>
              ) : (
                <div className="space-y-2">
                  {capacitySummary.map((pair: any, i: number) => (
                    <div key={i} className="flex items-center justify-between py-1.5">
                      <span className="text-xs text-white/70">{pair.source_language} → {pair.target_language}</span>
                      <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-400 text-[10px]">
                        {pair.supply} vendors
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-[#151922] border-white/[0.06]">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-white/40" />
                <CardTitle className="text-sm font-medium text-white/60">Upcoming Deadlines</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {(deadlines.expiringDocuments || []).length === 0 && (deadlines.followUps || []).length === 0 ? (
                  <p className="text-sm text-white/20 text-center py-4">No upcoming deadlines</p>
                ) : (
                  <>
                    {(deadlines.expiringDocuments || []).map((doc: any) => (
                      <div key={doc.id} className="flex items-center justify-between py-1.5">
                        <div className="flex items-center gap-2">
                          <FileWarning className="w-3.5 h-3.5 text-amber-400" />
                          <span className="text-xs text-white/70 truncate max-w-40">{doc.vendor_name} - {doc.doc_type}</span>
                        </div>
                        <span className="text-[10px] text-amber-400/80">{doc.expiry_date}</span>
                      </div>
                    ))}
                    {(deadlines.followUps || []).map((fu: any) => (
                      <div key={fu.id} className="flex items-center justify-between py-1.5">
                        <div className="flex items-center gap-2">
                          <CalendarClock className="w-3.5 h-3.5 text-blue-400" />
                          <span className="text-xs text-white/70 truncate max-w-40">{fu.full_name}</span>
                        </div>
                        <span className="text-[10px] text-blue-400/80">{fu.follow_up_date}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
