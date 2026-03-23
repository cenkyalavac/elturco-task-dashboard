import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getPublicApiBase } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, Send, Loader2, X, ChevronUp, ChevronDown,
  LayoutDashboard, AlertCircle, CheckCircle2, Users,
} from "lucide-react";

// ── Types ──

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

interface Freelancer {
  id: string;
  fullName: string;
  resourceCode: string;
  email: string;
  status: string;
  accounts: string[];
  languagePairs: string[];
  serviceTypes: string[];
  availability: string;
  resourceRating: string;
  nativeLanguage: string;
  canDoLqa: boolean;
  specializations: string[];
}

interface Assignment {
  id: number;
  source: string;
  sheet: string;
  projectId: string;
  status: string;
}

// ── Constants ──

const ACCOUNT_MATCH: Record<string, string[]> = {
  Amazon: ["Amazon", "Amazon SeCM", "Amazon PWS"],
  AppleCare: ["Apple"],
};

// ── Helpers ──

function isXX(v: string): boolean {
  return v.trim().toUpperCase() === "XX";
}

function needsTranslator(t: Task): boolean {
  return !t.translator || t.translator.trim() === "" || isXX(t.translator);
}

function needsReviewer(t: Task): boolean {
  if (!t.translator || t.translator.trim() === "" || isXX(t.translator)) return false;
  return !t.reviewer || t.reviewer.trim() === "" || isXX(t.reviewer);
}

// ── Component ──

export default function DashboardPage() {
  const { toast } = useToast();

  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("unassigned");
  const [selectedTaskKey, setSelectedTaskKey] = useState<string | null>(null);

  // Assignment form state
  const [role, setRole] = useState<"translator" | "reviewer">("translator");
  const [assignmentType, setAssignmentType] = useState<"direct" | "sequence" | "broadcast">("sequence");
  const [selectedFreelancers, setSelectedFreelancers] = useState<Freelancer[]>([]);
  const [freelancerSearch, setFreelancerSearch] = useState("");

  // Queries
  const { data: tasks, isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/tasks");
      return res.json();
    },
    staleTime: 60000,
  });

  const { data: assignments } = useQuery<Assignment[]>({
    queryKey: ["/api/assignments"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/assignments");
      return res.json();
    },
    staleTime: 30000,
  });

  const { data: freelancers, isLoading: freelancersLoading } = useQuery<Freelancer[]>({
    queryKey: ["/api/freelancers"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/freelancers");
      return res.json();
    },
    staleTime: 300000,
  });

  // Assigned project IDs set
  const assignedProjectIds = useMemo(() => {
    if (!assignments) return new Set<string>();
    return new Set(
      (assignments as Assignment[])
        .filter((a) => a.status !== "cancelled" && a.status !== "expired")
        .map((a) => `${a.source}|${a.sheet}|${a.projectId}`)
    );
  }, [assignments]);

  // Filter tasks
  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    return tasks.filter((t) => {
      if (sourceFilter !== "all" && t.source !== sourceFilter) return false;

      const key = `${t.source}|${t.sheet}|${t.projectId}`;
      const isAssigned = assignedProjectIds.has(key);
      const needsTR = needsTranslator(t);
      const needsREV = needsReviewer(t);
      const isUnassigned = needsTR || needsREV;

      if (statusFilter === "unassigned" && !isUnassigned) return false;
      if (statusFilter === "assigned" && (isUnassigned || t.delivered === "Delivered")) return false;
      if (statusFilter === "delivered" && t.delivered !== "Delivered") return false;
      if (statusFilter !== "delivered" && statusFilter !== "all" && t.delivered === "Delivered") return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return [t.projectId, t.account, t.translator, t.reviewer, t.sheet, t.source]
          .some((v) => v?.toLowerCase().includes(q));
      }
      return true;
    });
  }, [tasks, sourceFilter, statusFilter, searchQuery, assignedProjectIds]);

  // Stats
  const stats = useMemo(() => {
    if (!tasks) return { total: 0, needsTR: 0, needsREV: 0, assigned: 0, completed: 0 };
    const nonDelivered = tasks.filter((t) => t.delivered !== "Delivered");
    const nTR = nonDelivered.filter(needsTranslator).length;
    const nREV = nonDelivered.filter(needsReviewer).length;
    const completedCount = assignments ? (assignments as Assignment[]).filter((a) => a.status === "completed").length : 0;
    return {
      total: nonDelivered.length,
      needsTR: nTR,
      needsREV: nREV,
      assigned: nonDelivered.length - nTR - nREV,
      completed: completedCount,
    };
  }, [tasks, assignments]);

  // Selected task
  const selectedTask = useMemo(() => {
    if (!selectedTaskKey || !tasks) return null;
    return tasks.find((t) => `${t.source}|${t.sheet}|${t.projectId}` === selectedTaskKey) || null;
  }, [selectedTaskKey, tasks]);

  // Auto-detect role when task changes
  const autoRole = useMemo(() => {
    if (!selectedTask) return "translator";
    if (needsTranslator(selectedTask)) return "translator";
    if (needsReviewer(selectedTask)) return "reviewer";
    return "translator";
  }, [selectedTask]);

  function selectTask(t: Task) {
    const key = `${t.source}|${t.sheet}|${t.projectId}`;
    if (selectedTaskKey === key) {
      setSelectedTaskKey(null);
      return;
    }
    setSelectedTaskKey(key);
    setSelectedFreelancers([]);
    setFreelancerSearch("");
    const newRole = needsTranslator(t) ? "translator" : "reviewer";
    setRole(newRole as "translator" | "reviewer");
    setAssignmentType("sequence");
  }

  // Freelancer filtering
  const filteredFreelancers = useMemo(() => {
    if (!freelancers || !selectedTask) return [];
    const matchAccounts = ACCOUNT_MATCH[selectedTask.source] || [];
    const selectedCodes = new Set(selectedFreelancers.map((f) => f.resourceCode));

    return freelancers
      .filter((f) => {
        if (selectedCodes.has(f.resourceCode)) return false;
        if (freelancerSearch) {
          const q = freelancerSearch.toLowerCase();
          return [f.fullName, f.resourceCode, f.email, ...(f.accounts || []), ...(f.languagePairs || [])]
            .some((v) => v?.toLowerCase().includes(q));
        }
        const matchesAccount = matchAccounts.length === 0 || f.accounts?.some((a) => matchAccounts.includes(a));
        if (!matchesAccount) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.status === "Approved" && b.status !== "Approved") return -1;
        if (b.status === "Approved" && a.status !== "Approved") return 1;
        return a.fullName.localeCompare(b.fullName);
      });
  }, [freelancers, selectedTask, freelancerSearch, selectedFreelancers]);

  function addFreelancer(f: Freelancer) {
    if (assignmentType === "direct") {
      setSelectedFreelancers([f]);
    } else {
      setSelectedFreelancers((prev) => [...prev, f]);
    }
  }

  function removeFreelancer(code: string) {
    setSelectedFreelancers((prev) => prev.filter((f) => f.resourceCode !== code));
  }

  function moveFreelancer(index: number, dir: "up" | "down") {
    setSelectedFreelancers((prev) => {
      const arr = [...prev];
      const ni = dir === "up" ? index - 1 : index + 1;
      if (ni < 0 || ni >= arr.length) return prev;
      [arr[index], arr[ni]] = [arr[ni], arr[index]];
      return arr;
    });
  }

  // Submit assignment
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTask) throw new Error("No task selected");
      const body = {
        source: selectedTask.source,
        sheet: selectedTask.sheet,
        projectId: selectedTask.projectId,
        account: selectedTask.account,
        taskDetails: {
          source: selectedTask.source,
          sheet: selectedTask.sheet,
          projectId: selectedTask.projectId,
          account: selectedTask.account,
          deadline: selectedTask.deadline,
          total: selectedTask.total,
          wwc: selectedTask.wwc,
          revType: selectedTask.revType,
        },
        assignmentType,
        role,
        freelancers: selectedFreelancers.map((f) => ({
          resourceCode: f.resourceCode,
          fullName: f.fullName,
          email: f.email,
        })),
        autoAssignReviewer: false,
        clientBaseUrl: window.location.href.split("#")[0].replace(/\/$/, ""),
        apiBaseUrl: getPublicApiBase(),
      };
      const res = await apiRequest("POST", "/api/assignments", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      toast({ title: "Task assigned", description: "Emails sent successfully." });
      setSelectedTaskKey(null);
      setSelectedFreelancers([]);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="h-full flex flex-col">
      {/* Stats bar */}
      <div className="border-b border-border bg-card px-6 py-3">
        <div className="flex items-center gap-6">
          <StatPill icon={<LayoutDashboard className="w-3.5 h-3.5" />} label="Total" value={stats.total} loading={tasksLoading} />
          <StatPill icon={<AlertCircle className="w-3.5 h-3.5" />} label="Needs TR" value={stats.needsTR} loading={tasksLoading} color="text-orange-500" />
          <StatPill icon={<Users className="w-3.5 h-3.5" />} label="Needs REV" value={stats.needsREV} loading={tasksLoading} color="text-blue-500" />
          <StatPill icon={<Send className="w-3.5 h-3.5" />} label="Assigned" value={stats.assigned} loading={tasksLoading} color="text-emerald-500" />
          <StatPill icon={<CheckCircle2 className="w-3.5 h-3.5" />} label="Completed" value={stats.completed} loading={tasksLoading} color="text-green-600" />
        </div>
      </div>

      {/* Filters */}
      <div className="border-b border-border bg-card px-6 py-2.5 flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by project ID, account, translator..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-8 text-sm"
            data-testid="input-search"
          />
        </div>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-36 h-8 text-sm" data-testid="select-source">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="Amazon">Amazon</SelectItem>
            <SelectItem value="AppleCare">AppleCare</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-8 text-sm" data-testid="select-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">
          {filteredTasks.length} tasks
        </span>
      </div>

      {/* Split panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Task list */}
        <div className="flex-1 min-w-0 overflow-auto" style={{ flex: selectedTask ? "0 0 60%" : "1" }}>
          {tasksLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded" />)}
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm" data-testid="text-no-tasks">
              No tasks found
            </div>
          ) : (
            <table className="w-full text-sm" data-testid="table-tasks">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                <tr className="border-b border-border">
                  <th className="text-left font-medium text-muted-foreground px-3 py-2 text-xs">Project ID</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-2 text-xs">Source</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-2 text-xs">Account</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-2 text-xs">TR</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-2 text-xs">REV</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-2 text-xs">Deadline</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-2 text-xs">Total</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-2 text-xs">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.slice(0, 200).map((task, idx) => {
                  const key = `${task.source}|${task.sheet}|${task.projectId}`;
                  const isSelected = key === selectedTaskKey;
                  const nTR = needsTranslator(task);
                  const nREV = needsReviewer(task);
                  return (
                    <tr
                      key={`${key}-${idx}`}
                      className={`border-b border-border cursor-pointer transition-colors ${
                        isSelected ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-muted/30"
                      }`}
                      onClick={() => selectTask(task)}
                      data-testid={`row-task-${idx}`}
                    >
                      <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">{task.projectId}</td>
                      <td className="px-3 py-2">
                        <Badge variant="secondary" className="text-[10px] font-normal px-1.5 py-0">
                          {task.source}/{task.sheet}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">{task.account}</td>
                      <td className="px-3 py-2 text-xs">
                        {nTR ? <span className="text-muted-foreground">—</span> : <span className="text-foreground">{task.translator}</span>}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {task.translator && !isXX(task.translator)
                          ? (nREV ? <span className="text-muted-foreground">—</span> : <span className="text-foreground">{task.reviewer}</span>)
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground text-xs whitespace-nowrap">{task.deadline || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground text-xs tabular-nums">{task.total}</td>
                      <td className="px-3 py-2">
                        {nTR && <Badge className="text-[10px] px-1.5 py-0 bg-orange-500/10 text-orange-600 border-orange-500/20">Needs TR</Badge>}
                        {nREV && <Badge className="text-[10px] px-1.5 py-0 bg-blue-500/10 text-blue-600 border-blue-500/20">Needs REV</Badge>}
                        {!nTR && !nREV && task.delivered === "Delivered" && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Delivered</Badge>
                        )}
                        {!nTR && !nREV && task.delivered !== "Delivered" && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-green-500/10 text-green-600">Assigned</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {filteredTasks.length > 200 && (
            <div className="text-center py-2 text-xs text-muted-foreground border-t border-border">
              Showing first 200 of {filteredTasks.length} results
            </div>
          )}
        </div>

        {/* Right: Assignment panel */}
        {selectedTask && (
          <div className="w-[40%] border-l border-border bg-card overflow-auto flex flex-col">
            {/* Task details */}
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm text-foreground">Assign Task</h3>
                <Button variant="ghost" size="sm" onClick={() => setSelectedTaskKey(null)} data-testid="button-close-panel" className="h-6 w-6 p-0">
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <DetailItem label="Project ID" value={selectedTask.projectId} />
                <DetailItem label="Source" value={`${selectedTask.source}/${selectedTask.sheet}`} />
                <DetailItem label="Account" value={selectedTask.account} />
                <DetailItem label="Deadline" value={selectedTask.deadline || "—"} />
                <DetailItem label="Total/WWC" value={`${selectedTask.total}/${selectedTask.wwc}`} />
                <DetailItem label="TR" value={selectedTask.translator || "—"} />
              </div>
            </div>

            {/* Assignment config */}
            <div className="p-4 border-b border-border space-y-3">
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium text-muted-foreground w-12">Role</label>
                <div className="flex gap-1">
                  <button
                    onClick={() => setRole("translator")}
                    data-testid="button-role-translator"
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      role === "translator" ? "bg-orange-500/10 text-orange-600 border border-orange-500/30" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    Translator
                  </button>
                  <button
                    onClick={() => setRole("reviewer")}
                    data-testid="button-role-reviewer"
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      role === "reviewer" ? "bg-blue-500/10 text-blue-600 border border-blue-500/30" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    Reviewer
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium text-muted-foreground w-12">Type</label>
                <div className="flex gap-1">
                  {(["direct", "sequence", "broadcast"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        setAssignmentType(t);
                        if (t === "direct") setSelectedFreelancers((prev) => prev.slice(0, 1));
                      }}
                      data-testid={`button-type-${t}`}
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                        assignmentType === t ? "bg-primary/10 text-primary border border-primary/30" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {t === "direct" ? "Direct" : t === "sequence" ? "Sequential" : "Broadcast"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Selected freelancers chips */}
            {selectedFreelancers.length > 0 && (
              <div className="px-4 py-2 border-b border-border">
                <div className="text-xs font-medium text-muted-foreground mb-1.5">
                  Selected ({selectedFreelancers.length})
                </div>
                <div className="flex flex-wrap gap-1">
                  {selectedFreelancers.map((f, idx) => (
                    <div key={f.resourceCode} className="flex items-center gap-1 bg-muted rounded px-2 py-0.5 text-xs" data-testid={`chip-${f.resourceCode}`}>
                      {assignmentType === "sequence" && (
                        <span className="text-muted-foreground font-medium">{idx + 1}.</span>
                      )}
                      <span className="font-medium text-foreground">{f.fullName.split(" ")[0]}</span>
                      <span className="text-muted-foreground">{f.resourceCode}</span>
                      {assignmentType === "sequence" && selectedFreelancers.length > 1 && (
                        <>
                          <button onClick={() => moveFreelancer(idx, "up")} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0">
                            <ChevronUp className="w-3 h-3" />
                          </button>
                          <button onClick={() => moveFreelancer(idx, "down")} disabled={idx === selectedFreelancers.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0">
                            <ChevronDown className="w-3 h-3" />
                          </button>
                        </>
                      )}
                      <button onClick={() => removeFreelancer(f.resourceCode)} className="text-muted-foreground hover:text-destructive p-0" data-testid={`remove-${f.resourceCode}`}>
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Freelancer search + list */}
            <div className="flex-1 overflow-auto">
              <div className="p-3 sticky top-0 bg-card z-10 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search freelancers..."
                    value={freelancerSearch}
                    onChange={(e) => setFreelancerSearch(e.target.value)}
                    className="pl-8 h-7 text-xs"
                    data-testid="input-freelancer-search"
                  />
                </div>
              </div>

              {freelancersLoading ? (
                <div className="p-3 space-y-2">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded" />)}
                </div>
              ) : filteredFreelancers.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">
                  No matching freelancers found.
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {filteredFreelancers.slice(0, 50).map((f) => (
                    <div
                      key={f.resourceCode}
                      className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => addFreelancer(f)}
                      data-testid={`freelancer-${f.resourceCode}`}
                    >
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground shrink-0">
                        {f.fullName?.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-foreground truncate">{f.fullName}</span>
                          {f.status === "Approved" && (
                            <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-green-500/10 text-green-600">Approved</Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {f.resourceCode} · {f.email}
                          {f.languagePairs?.length > 0 && ` · ${f.languagePairs.slice(0, 2).map((lp: any) => typeof lp === "string" ? lp : `${lp.source_language}>${lp.target_language}`).join(", ")}`}
                        </p>
                      </div>
                    </div>
                  ))}
                  {filteredFreelancers.length > 50 && (
                    <p className="text-[10px] text-muted-foreground text-center py-2">
                      Showing first 50 of {filteredFreelancers.length}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Assign button */}
            <div className="p-3 border-t border-border bg-card">
              <Button
                className="w-full"
                size="sm"
                disabled={selectedFreelancers.length === 0 || createMutation.isPending}
                onClick={() => createMutation.mutate()}
                data-testid="button-assign"
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Assign ({selectedFreelancers.length})
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──

function StatPill({ icon, label, value, loading, color }: { icon: React.ReactNode; label: string; value: number; loading: boolean; color?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={color || "text-muted-foreground"}>{icon}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
      {loading ? <Skeleton className="h-4 w-8" /> : <span className="text-sm font-semibold text-foreground tabular-nums">{value}</span>}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
