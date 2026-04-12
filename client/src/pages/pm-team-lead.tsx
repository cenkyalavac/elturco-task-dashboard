import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Users, FolderKanban, AlertTriangle, ArrowRightLeft,
  BarChart3, Clock, CheckCircle, TrendingUp,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

export default function PMTeamLeadPage() {
  const { toast } = useToast();
  const [reassignProject, setReassignProject] = useState<number | null>(null);
  const [newPmId, setNewPmId] = useState<string>("");

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["/api/pm-team-lead/dashboard"],
  });

  const { data: performance } = useQuery({
    queryKey: ["/api/pm-team-lead/team-performance"],
  });

  const reassignMutation = useMutation({
    mutationFn: async () => {
      if (!reassignProject || !newPmId) return;
      await apiRequest("POST", "/api/pm-team-lead/reassign", { projectId: reassignProject, newPmId: +newPmId });
    },
    onSuccess: () => {
      toast({ title: "Project reassigned" });
      queryClient.invalidateQueries({ queryKey: ["/api/pm-team-lead/dashboard"] });
      setReassignProject(null);
      setNewPmId("");
    },
    onError: () => toast({ title: "Failed to reassign", variant: "destructive" }),
  });

  const teamWorkload = (dashboard as any)?.teamWorkload || [];
  const escalationQueue = (dashboard as any)?.escalationQueue || [];
  const perfData = (performance as any)?.performance || [];

  const chartData = teamWorkload.map((pm: any) => ({
    name: pm.name?.split(" ")[0] || "PM",
    active: pm.activeProjects,
    jobs: pm.activeJobs,
  }));

  const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-white/[0.06] rounded" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <div key={i} className="h-32 bg-white/[0.06] rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">PM Team Lead Dashboard</h1>
          <p className="text-xs text-white/30 mt-1">Team workload overview, performance, and escalations</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-[#0f1219] border-white/[0.06]">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10"><Users className="w-4 h-4 text-blue-400" /></div>
              <div>
                <p className="text-[11px] text-white/30">Team Size</p>
                <p className="text-xl font-bold text-white">{teamWorkload.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#0f1219] border-white/[0.06]">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10"><FolderKanban className="w-4 h-4 text-emerald-400" /></div>
              <div>
                <p className="text-[11px] text-white/30">Active Projects</p>
                <p className="text-xl font-bold text-white">{teamWorkload.reduce((s: number, p: any) => s + (p.activeProjects || 0), 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#0f1219] border-white/[0.06]">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10"><Clock className="w-4 h-4 text-yellow-400" /></div>
              <div>
                <p className="text-[11px] text-white/30">Active Jobs</p>
                <p className="text-xl font-bold text-white">{teamWorkload.reduce((s: number, p: any) => s + (p.activeJobs || 0), 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#0f1219] border-white/[0.06]">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10"><AlertTriangle className="w-4 h-4 text-red-400" /></div>
              <div>
                <p className="text-[11px] text-white/30">Escalations</p>
                <p className="text-xl font-bold text-white">{escalationQueue.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Team Workload */}
        <Card className="bg-[#0f1219] border-white/[0.06]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-white/70 flex items-center gap-2">
              <Users className="w-4 h-4" /> Team Workload
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 && (
              <div className="h-48 mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} />
                    <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "#1a1d27", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} labelStyle={{ color: "white" }} itemStyle={{ color: "white" }} />
                    <Bar dataKey="active" name="Projects" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="jobs" name="Jobs" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="space-y-2">
              {teamWorkload.map((pm: any) => (
                <div key={pm.id} className="flex items-center gap-3 p-2 bg-white/[0.02] rounded-lg">
                  <div className="w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center text-xs font-medium text-blue-400">
                    {pm.name?.charAt(0) || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white font-medium truncate">{pm.name}</p>
                    <p className="text-[10px] text-white/30">{pm.email}</p>
                  </div>
                  <div className="flex gap-3 text-[10px]">
                    <span className="text-blue-400">{pm.activeProjects} proj</span>
                    <span className="text-emerald-400">{pm.activeJobs} jobs</span>
                    <span className="text-white/20">{pm.completedProjects} done</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Performance */}
        <Card className="bg-[#0f1219] border-white/[0.06]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-white/70 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Performance Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {perfData.map((pm: any) => (
                <div key={pm.pmId} className="p-3 bg-white/[0.02] rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-white font-medium">{pm.pmName}</p>
                    <Badge variant="outline" className={`text-[10px] ${pm.onTimePercent >= 80 ? "text-emerald-400 border-emerald-400/20" : pm.onTimePercent >= 60 ? "text-yellow-400 border-yellow-400/20" : "text-red-400 border-red-400/20"}`}>
                      {pm.onTimePercent}% on time
                    </Badge>
                  </div>
                  <div className="flex gap-4 text-[10px] text-white/30">
                    <span>{pm.totalProjects} total</span>
                    <span>{pm.completedProjects} completed</span>
                  </div>
                  <div className="mt-2 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${pm.onTimePercent >= 80 ? "bg-emerald-500" : pm.onTimePercent >= 60 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${pm.onTimePercent}%` }} />
                  </div>
                </div>
              ))}
              {perfData.length === 0 && <p className="text-center text-white/20 text-sm py-4">No performance data</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Escalation Queue */}
      <Card className="bg-[#0f1219] border-white/[0.06]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-white/70 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" /> Escalation Queue — Overdue Projects
          </CardTitle>
        </CardHeader>
        <CardContent>
          {escalationQueue.length === 0 ? (
            <div className="text-center py-6">
              <CheckCircle className="w-8 h-8 text-emerald-400/30 mx-auto mb-2" />
              <p className="text-sm text-white/20">No overdue projects</p>
            </div>
          ) : (
            <div className="space-y-2">
              {escalationQueue.map((p: any) => (
                <div key={p.id} className="flex items-center gap-3 p-3 bg-red-500/[0.03] border border-red-500/10 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-white font-medium truncate">{p.projectName}</p>
                      <Badge variant="outline" className="text-[9px] text-red-400 border-red-400/20">{p.status}</Badge>
                    </div>
                    <p className="text-[10px] text-white/30 mt-0.5">
                      {p.projectCode} · Deadline: {p.deadline ? new Date(p.deadline).toLocaleDateString() : "N/A"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {reassignProject === p.id ? (
                      <div className="flex items-center gap-1">
                        <Select value={newPmId} onValueChange={setNewPmId}>
                          <SelectTrigger className="h-7 w-32 text-xs">
                            <SelectValue placeholder="Select PM" />
                          </SelectTrigger>
                          <SelectContent>
                            {teamWorkload.map((pm: any) => (
                              <SelectItem key={pm.id} value={String(pm.id)}>{pm.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button size="sm" className="h-7 text-xs" disabled={!newPmId} onClick={() => reassignMutation.mutate()}>Assign</Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setReassignProject(null)}>Cancel</Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setReassignProject(p.id)}>
                        <ArrowRightLeft className="w-3 h-3 mr-1" /> Reassign
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
