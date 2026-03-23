import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, Filter, Send, Clock, CheckCircle2, XCircle,
  AlertCircle, FileText, Users, LayoutDashboard, LogOut, ChevronRight,
} from "lucide-react";

interface Task {
  source: string;
  sheet: string;
  projectId: string;
  account: string;
  translator: string;
  reviewer: string;
  trDone: string;
  delivered: string;
  deadline: string;
  total: string;
  wwc: string;
  revType: string;
  raw: any;
}

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
  taskDetails: any;
  offers: any[];
}

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("unassigned");

  const { data: tasks, isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/tasks");
      return res.json();
    },
    staleTime: 60000,
  });

  const { data: assignments, isLoading: assignmentsLoading } = useQuery<Assignment[]>({
    queryKey: ["/api/assignments"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/assignments");
      return res.json();
    },
    staleTime: 30000,
  });

  // Create a set of assigned project IDs for quick lookup
  const assignedProjectIds = useMemo(() => {
    if (!assignments) return new Set<string>();
    return new Set(
      assignments
        .filter(a => a.status !== "cancelled" && a.status !== "expired")
        .map(a => `${a.source}|${a.sheet}|${a.projectId}`)
    );
  }, [assignments]);

  // Filter tasks
  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    return tasks.filter(t => {
      // Source filter
      if (sourceFilter !== "all" && t.source !== sourceFilter) return false;
      // Status filter
      const key = `${t.source}|${t.sheet}|${t.projectId}`;
      const isAssigned = assignedProjectIds.has(key);
      if (statusFilter === "unassigned" && isAssigned) return false;
      if (statusFilter === "assigned" && !isAssigned) return false;
      // Delivered filter
      if (statusFilter === "delivered" && t.delivered !== "Delivered") return false;
      if (statusFilter !== "delivered" && t.delivered === "Delivered") return false;
      // Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match = [t.projectId, t.account, t.translator, t.reviewer, t.sheet]
          .some(v => v?.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [tasks, sourceFilter, statusFilter, searchQuery, assignedProjectIds]);

  // Stats
  const stats = useMemo(() => {
    if (!tasks || !assignments) return { total: 0, unassigned: 0, assigned: 0, completed: 0 };
    const nonDelivered = tasks.filter(t => t.delivered !== "Delivered");
    const assignedCount = nonDelivered.filter(t => assignedProjectIds.has(`${t.source}|${t.sheet}|${t.projectId}`)).length;
    return {
      total: nonDelivered.length,
      unassigned: nonDelivered.length - assignedCount,
      assigned: assignedCount,
      completed: assignments.filter(a => a.status === "completed").length,
    };
  }, [tasks, assignments, assignedProjectIds]);

  function needsTranslator(task: Task) {
    return !task.translator || task.translator.trim() === "";
  }

  function needsReviewer(task: Task) {
    return task.translator && task.translator.trim() !== "" && (!task.reviewer || task.reviewer.trim() === "");
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 32 32" fill="none">
                <path d="M6 8h20M6 14h14M6 20h8M22 18l4 4-4 4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="font-semibold text-foreground text-sm" data-testid="text-header-title">ElTurco Dispatch</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline" data-testid="text-user-email">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/assignments")} data-testid="button-nav-assignments">
              <FileText className="w-4 h-4 mr-1.5" />
              Assignments
            </Button>
            <Button variant="ghost" size="sm" onClick={logout} data-testid="button-logout">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard icon={<LayoutDashboard className="w-4 h-4" />} label="Total Tasks" value={stats.total} loading={tasksLoading} />
          <StatCard icon={<AlertCircle className="w-4 h-4" />} label="Unassigned" value={stats.unassigned} loading={tasksLoading} accent="orange" />
          <StatCard icon={<Send className="w-4 h-4" />} label="Assigned" value={stats.assigned} loading={tasksLoading} accent="blue" />
          <StatCard icon={<CheckCircle2 className="w-4 h-4" />} label="Completed" value={stats.completed} loading={assignmentsLoading} accent="green" />
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by project ID, account, or translator..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search"
            />
          </div>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-full sm:w-40" data-testid="select-source">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="Amazon">Amazon</SelectItem>
              <SelectItem value="AppleCare">AppleCare</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-44" data-testid="select-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              <SelectItem value="assigned">Assigned</SelectItem>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Task Table */}
        {tasksLoading ? (
          <div className="space-y-2">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-16" data-testid="text-no-tasks">
            <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No tasks found</p>
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-tasks">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left font-medium text-muted-foreground px-3 py-2.5">Project ID</th>
                    <th className="text-left font-medium text-muted-foreground px-3 py-2.5">Source</th>
                    <th className="text-left font-medium text-muted-foreground px-3 py-2.5">Account</th>
                    <th className="text-left font-medium text-muted-foreground px-3 py-2.5">Translator</th>
                    <th className="text-left font-medium text-muted-foreground px-3 py-2.5">Reviewer</th>
                    <th className="text-left font-medium text-muted-foreground px-3 py-2.5">Deadline</th>
                    <th className="text-left font-medium text-muted-foreground px-3 py-2.5">Total</th>
                    <th className="text-left font-medium text-muted-foreground px-3 py-2.5 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTasks.slice(0, 100).map((task, idx) => {
                    const key = `${task.source}|${task.sheet}|${task.projectId}`;
                    const isAssigned = assignedProjectIds.has(key);
                    return (
                      <tr
                        key={`${key}-${idx}`}
                        className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => setLocation(`/assign?source=${encodeURIComponent(task.source)}&sheet=${encodeURIComponent(task.sheet)}&projectId=${encodeURIComponent(task.projectId)}`)}
                        data-testid={`row-task-${idx}`}
                      >
                        <td className="px-3 py-2.5 font-medium text-foreground">{task.projectId}</td>
                        <td className="px-3 py-2.5">
                          <Badge variant="secondary" className="text-xs font-normal">
                            {task.source} / {task.sheet}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{task.account}</td>
                        <td className="px-3 py-2.5">
                          {task.translator ? (
                            <span className="text-foreground">{task.translator}</span>
                          ) : (
                            <span className="text-orange-500 text-xs">Unassigned</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {task.reviewer ? (
                            <span className="text-foreground">{task.reviewer}</span>
                          ) : task.translator ? (
                            <span className="text-orange-500 text-xs">Unassigned</span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground text-xs">{task.deadline || "—"}</td>
                        <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{task.total}</td>
                        <td className="px-3 py-2.5">
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredTasks.length > 100 && (
              <div className="bg-muted/30 px-3 py-2 text-xs text-muted-foreground text-center border-t border-border">
                Showing first 100 of {filteredTasks.length} results
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ icon, label, value, loading, accent }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  loading: boolean;
  accent?: "orange" | "blue" | "green";
}) {
  const accentColors = {
    orange: "text-orange-500",
    blue: "text-blue-500",
    green: "text-green-500",
  };
  return (
    <Card className="border border-border">
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className={accent ? accentColors[accent] : "text-muted-foreground"}>{icon}</span>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        {loading ? (
          <Skeleton className="h-7 w-16" />
        ) : (
          <p className="text-xl font-semibold text-foreground tabular-nums">{value.toLocaleString()}</p>
        )}
      </CardContent>
    </Card>
  );
}
