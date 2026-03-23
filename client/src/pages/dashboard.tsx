import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getPublicApiBase } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Search, Send, Loader2, X, ChevronUp, ChevronDown, ChevronRight,
  CheckCircle2, Pencil,
} from "lucide-react";

// ── Types ──

interface CatCounts {
  ice: string;
  rep: string;
  match100: string;
  fuzzy95: string;
  fuzzy85: string;
  fuzzy75: string;
  noMatch: string;
  mt: string;
}

interface Task {
  source: string;
  sheet: string;
  projectId: string;
  account: string;
  translator: string;
  reviewer: string;
  trDone: string;
  revComplete: string;
  delivered: string;
  deadline: string;
  total: string;
  wwc: string;
  revType: string;
  catCounts: CatCounts;
  hoNote: string;
  trHbNote: string;
  revHbNote: string;
  instructions: string;
  lqi: string;
  projectTitle: string;
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

interface SheetConfig {
  id: number;
  source: string;
  sheet: string;
  languagePair: string;
}

interface EmailTemplate {
  id: number;
  key: string;
  subject: string;
  body: string;
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

// A rev complete value means the project is done ("Yes", a number like "10", etc.)
function isRevCompleted(t: Task): boolean {
  const v = (t.revComplete || "").trim().toLowerCase();
  if (!v) return false;
  if (v === "yes" || v === "y") return true;
  // Any number (reviewers report time in minutes)
  if (/^\d+/.test(v)) return true;
  return false;
}

// A tr done value means translation is complete
function isTrDone(t: Task): boolean {
  const v = (t.trDone || "").trim().toLowerCase();
  if (!v) return false;
  if (v === "yes" || v === "y") return true;
  return false;
}

function needsTranslator(t: Task): boolean {
  // If rev is completed, the whole project is done — no assignment needed
  if (isRevCompleted(t)) return false;
  // If TR done, translator doesn't need assignment
  if (isTrDone(t)) return false;
  return !t.translator || t.translator.trim() === "" || isXX(t.translator);
}

function needsReviewer(t: Task): boolean {
  // If rev is completed, no reviewer needed
  if (isRevCompleted(t)) return false;
  // Reviewer only needed if translator is assigned (not empty/XX)
  if (!t.translator || t.translator.trim() === "" || isXX(t.translator)) return false;
  return !t.reviewer || t.reviewer.trim() === "" || isXX(t.reviewer);
}

function taskKey(t: Task): string {
  return `${t.source}|${t.sheet}|${t.projectId}`;
}

function parseDeadline(d: string): Date | null {
  if (!d) return null;
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function deadlineClass(d: string): string {
  const date = parseDeadline(d);
  if (!date) return "text-muted-foreground";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const deadlineDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (deadlineDay < today) return "text-red-600 font-semibold";
  if (deadlineDay.getTime() === today.getTime()) return "text-orange-600 font-semibold";
  return "text-muted-foreground";
}

// ── Component ──

export default function DashboardPage() {
  const { toast } = useToast();

  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("unassigned");
  const [selectedTaskKey, setSelectedTaskKey] = useState<string | null>(null);
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());

  // Bulk mode
  const [bulkMode, setBulkMode] = useState<"translator" | "reviewer" | null>(null);

  // Assignment form state
  const [role, setRole] = useState<"translator" | "reviewer">("translator");
  const [assignmentType, setAssignmentType] = useState<"direct" | "sequence" | "broadcast">("sequence");
  const [selectedFreelancers, setSelectedFreelancers] = useState<Freelancer[]>([]);
  const [freelancerSearch, setFreelancerSearch] = useState("");
  const [editingEmail, setEditingEmail] = useState(false);
  const [customSubject, setCustomSubject] = useState("");
  const [customBody, setCustomBody] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);

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

  const { data: sheetConfigs } = useQuery<SheetConfig[]>({
    queryKey: ["/api/sheet-configs"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/sheet-configs");
      return res.json();
    },
    staleTime: 300000,
  });

  const { data: emailTemplates } = useQuery<EmailTemplate[]>({
    queryKey: ["/api/email-templates"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/email-templates");
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

  // Unique accounts for filter dropdown
  const uniqueAccounts = useMemo(() => {
    if (!tasks) return [];
    return [...new Set(tasks.map(t => t.account))].filter(Boolean).sort();
  }, [tasks]);

  // Filter + sort tasks
  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    const filtered = tasks.filter((t) => {
      if (sourceFilter !== "all" && t.source !== sourceFilter) return false;
      if (accountFilter !== "all" && t.account !== accountFilter) return false;

      const nTR = needsTranslator(t);
      const nREV = needsReviewer(t);
      const isUnassigned = nTR || nREV;

      if (statusFilter === "needs_tr" && !nTR) return false;
      if (statusFilter === "needs_rev" && !nREV) return false;
      if (statusFilter === "unassigned" && !isUnassigned) return false;
      if (statusFilter === "assigned" && (isUnassigned || t.delivered === "Delivered")) return false;
      if (statusFilter === "delivered" && t.delivered !== "Delivered") return false;
      if (statusFilter !== "delivered" && statusFilter !== "all" && statusFilter !== "needs_tr" && statusFilter !== "needs_rev" && statusFilter !== "unassigned" && statusFilter !== "assigned" && t.delivered === "Delivered") return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return [t.projectId, t.account, t.translator, t.reviewer, t.sheet, t.source, t.projectTitle]
          .some((v) => v?.toLowerCase().includes(q));
      }
      return true;
    });

    // Sort by deadline ascending (soonest first)
    return filtered.sort((a, b) => {
      const da = parseDeadline(a.deadline);
      const db = parseDeadline(b.deadline);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da.getTime() - db.getTime();
    });
  }, [tasks, sourceFilter, accountFilter, statusFilter, searchQuery]);

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
    return tasks.find((t) => taskKey(t) === selectedTaskKey) || null;
  }, [selectedTaskKey, tasks]);

  // Get language pair for the selected task from sheet configs
  const taskLangPair = useMemo(() => {
    if (!selectedTask || !sheetConfigs) return null;
    const config = sheetConfigs.find(
      (c) => c.source === selectedTask.source && c.sheet === selectedTask.sheet
    );
    return config?.languagePair || null;
  }, [selectedTask, sheetConfigs]);

  // Get email template for current role
  const currentTemplate = useMemo(() => {
    if (!emailTemplates) return null;
    const key = role === "translator" ? "offer_translator" : "offer_reviewer";
    return emailTemplates.find((t) => t.key === key) || null;
  }, [emailTemplates, role]);

  // Task select handler
  function selectTask(t: Task) {
    const key = taskKey(t);
    if (selectedTaskKey === key) {
      setSelectedTaskKey(null);
      return;
    }
    setSelectedTaskKey(key);
    setSelectedFreelancers([]);
    setFreelancerSearch("");
    setEditingEmail(false);
    setCustomSubject("");
    setCustomBody("");
    setShowInstructions(false);
    const newRole = needsTranslator(t) ? "translator" : "reviewer";
    setRole(newRole);
    setAssignmentType("sequence");
  }

  // Checkbox handling
  function toggleCheck(key: string) {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAllVisible() {
    if (checkedKeys.size === filteredTasks.length) {
      setCheckedKeys(new Set());
    } else {
      setCheckedKeys(new Set(filteredTasks.map(taskKey)));
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSelectedTaskKey(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "a" && !e.shiftKey) {
        const active = document.activeElement;
        if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
        e.preventDefault();
        setCheckedKeys(new Set(filteredTasks.map(taskKey)));
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [filteredTasks]);

  // Freelancer filtering
  const filteredFreelancers = useMemo(() => {
    if (!freelancers || !selectedTask) return [];
    const matchAccounts = ACCOUNT_MATCH[selectedTask.source] || [];
    const selectedCodes = new Set(selectedFreelancers.map((f) => f.resourceCode));

    return freelancers
      .filter((f) => {
        if (selectedCodes.has(f.resourceCode)) return false;
        // Always apply account match
        const matchesAccount = matchAccounts.length === 0 || f.accounts?.some((a) => matchAccounts.includes(a));
        if (!matchesAccount) return false;
        // Always apply language pair match
        if (taskLangPair && taskLangPair !== "Multi" && f.languagePairs?.length > 0) {
          if (!f.languagePairs.includes(taskLangPair)) return false;
        }
        // Apply name/code search as additional filter
        if (freelancerSearch) {
          const q = freelancerSearch.toLowerCase();
          return [f.fullName, f.resourceCode, f.email]
            .some((v) => v?.toLowerCase().includes(q));
        }
        return true;
      })
      .sort((a, b) => {
        if (a.status === "Approved" && b.status !== "Approved") return -1;
        if (b.status === "Approved" && a.status !== "Approved") return 1;
        return a.fullName.localeCompare(b.fullName);
      });
  }, [freelancers, selectedTask, freelancerSearch, selectedFreelancers, taskLangPair]);

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
      const body: any = {
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
          projectTitle: selectedTask.projectTitle,
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
      if (customSubject) body.emailSubject = customSubject;
      if (customBody) body.emailBody = customBody;
      const res = await apiRequest("POST", "/api/assignments", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      toast({ title: "Task assigned", description: "Emails sent successfully." });
      setSelectedTaskKey(null);
      setSelectedFreelancers([]);
      setEditingEmail(false);
      setCustomSubject("");
      setCustomBody("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Bulk assign mutation
  const bulkAssignMutation = useMutation({
    mutationFn: async () => {
      if (!bulkMode || !tasks) throw new Error("No bulk mode");
      const checkedTasks = tasks.filter(t => checkedKeys.has(taskKey(t)));
      for (const task of checkedTasks) {
        await apiRequest("POST", "/api/assignments", {
          source: task.source,
          sheet: task.sheet,
          projectId: task.projectId,
          account: task.account,
          taskDetails: {
            source: task.source, sheet: task.sheet, projectId: task.projectId,
            account: task.account, deadline: task.deadline, total: task.total,
            wwc: task.wwc, revType: task.revType, projectTitle: task.projectTitle,
          },
          assignmentType,
          role: bulkMode,
          freelancers: selectedFreelancers.map(f => ({
            resourceCode: f.resourceCode, fullName: f.fullName, email: f.email,
          })),
          autoAssignReviewer: false,
          clientBaseUrl: window.location.href.split("#")[0].replace(/\/$/, ""),
          apiBaseUrl: getPublicApiBase(),
          ...(customSubject ? { emailSubject: customSubject } : {}),
          ...(customBody ? { emailBody: customBody } : {}),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      toast({ title: "Bulk assignment complete", description: `${checkedKeys.size} tasks assigned.` });
      setCheckedKeys(new Set());
      setBulkMode(null);
      setSelectedFreelancers([]);
      setEditingEmail(false);
      setCustomSubject("");
      setCustomBody("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // CAT counts sum
  const catSum = useCallback((cc: CatCounts) => {
    return [cc.ice, cc.rep, cc.match100, cc.fuzzy95, cc.fuzzy85, cc.fuzzy75, cc.noMatch, cc.mt]
      .reduce((s, v) => s + (parseInt(v) || 0), 0);
  }, []);

  const hasChecked = checkedKeys.size > 0;

  return (
    <div className="h-full flex flex-col">
      {/* Stats bar */}
      <div className="border-b border-border bg-card px-4 py-2">
        <div className="flex items-center gap-6 text-xs">
          <StatPill label="Total" value={stats.total} loading={tasksLoading} />
          <StatPill label="Needs TR" value={stats.needsTR} loading={tasksLoading} color="text-orange-500" />
          <StatPill label="Needs REV" value={stats.needsREV} loading={tasksLoading} color="text-blue-500" />
          <StatPill label="Assigned" value={stats.assigned} loading={tasksLoading} color="text-emerald-500" />
          <StatPill label="Completed" value={stats.completed} loading={tasksLoading} color="text-green-600" />
        </div>
      </div>

      {/* Filters + bulk actions */}
      <div className="border-b border-border bg-card px-4 py-2 flex items-center gap-3">
        {hasChecked ? (
          <>
            <Badge variant="secondary" className="text-xs gap-1">
              <CheckCircle2 className="w-3 h-3" />
              {checkedKeys.size} selected
            </Badge>
            <Button
              variant="default"
              size="sm"
              className="h-7 text-xs bg-orange-600 hover:bg-orange-700"
              onClick={() => {
                setBulkMode("translator");
                setSelectedTaskKey(null);
                setSelectedFreelancers([]);
                setAssignmentType("sequence");
              }}
              data-testid="button-bulk-tr"
            >
              Bulk Assign TR
              <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
            <Button
              variant="default"
              size="sm"
              className="h-7 text-xs bg-blue-600 hover:bg-blue-700"
              onClick={() => {
                setBulkMode("reviewer");
                setSelectedTaskKey(null);
                setSelectedFreelancers([]);
                setAssignmentType("sequence");
              }}
              data-testid="button-bulk-rev"
            >
              Bulk Assign REV
              <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => { setCheckedKeys(new Set()); setBulkMode(null); }}
            >
              Clear
            </Button>
          </>
        ) : (
          <>
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
              <SelectTrigger className="w-32 h-8 text-sm" data-testid="select-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="Amazon">Amazon</SelectItem>
                <SelectItem value="AppleCare">AppleCare</SelectItem>
              </SelectContent>
            </Select>
            <Select value={accountFilter} onValueChange={setAccountFilter}>
              <SelectTrigger className="w-40 h-8 text-sm" data-testid="select-account">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                {uniqueAccounts.map((acct) => (
                  <SelectItem key={acct} value={acct}>{acct}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32 h-8 text-sm" data-testid="select-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="needs_tr">Needs TR</SelectItem>
                <SelectItem value="needs_rev">Needs REV</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                <SelectItem value="assigned">Assigned</SelectItem>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground ml-auto tabular-nums">
              {filteredTasks.length} tasks
            </span>
          </>
        )}
      </div>

      {/* Split panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Task table */}
        <div className="flex-1 min-w-0 overflow-auto">
          {tasksLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(12)].map((_, i) => <Skeleton key={i} className="h-9 w-full rounded" />)}
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm" data-testid="text-no-tasks">
              No tasks found
            </div>
          ) : (
            <table className="w-full text-sm" data-testid="table-tasks">
              <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
                <tr className="border-b border-border">
                  <th className="w-10 px-2 py-2">
                    <Checkbox
                      checked={filteredTasks.length > 0 && checkedKeys.size === filteredTasks.length}
                      onCheckedChange={toggleAllVisible}
                      data-testid="checkbox-all"
                    />
                  </th>
                  <th className="text-left font-medium text-muted-foreground px-2 py-2 text-xs">Project ID</th>
                  <th className="text-left font-medium text-muted-foreground px-2 py-2 text-xs">Source</th>
                  <th className="text-left font-medium text-muted-foreground px-2 py-2 text-xs">Account</th>
                  <th className="text-left font-medium text-muted-foreground px-2 py-2 text-xs">TR</th>
                  <th className="text-left font-medium text-muted-foreground px-2 py-2 text-xs">REV</th>
                  <th className="text-left font-medium text-muted-foreground px-2 py-2 text-xs">Deadline</th>
                  <th className="text-right font-medium text-muted-foreground px-2 py-2 text-xs">Total</th>
                  <th className="text-right font-medium text-muted-foreground px-2 py-2 text-xs">WWC</th>
                  <th className="text-left font-medium text-muted-foreground px-2 py-2 text-xs">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.slice(0, 300).map((task, idx) => {
                  const key = taskKey(task);
                  const isSelected = key === selectedTaskKey;
                  const isChecked = checkedKeys.has(key);
                  const nTR = needsTranslator(task);
                  const nREV = needsReviewer(task);
                  return (
                    <tr
                      key={`${key}-${idx}`}
                      className={`border-b border-border cursor-pointer transition-colors ${
                        isSelected ? "bg-primary/5 border-l-2 border-l-primary" : isChecked ? "bg-blue-500/5" : "hover:bg-muted/30"
                      }`}
                      onClick={() => selectTask(task)}
                      data-testid={`row-task-${idx}`}
                    >
                      <td className="w-10 px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => toggleCheck(key)}
                        />
                      </td>
                      <td className="px-2 py-1.5 font-medium text-foreground whitespace-nowrap text-xs">{task.projectId}</td>
                      <td className="px-2 py-1.5">
                        <Badge variant="secondary" className="text-[10px] font-normal px-1.5 py-0">
                          {task.source}/{task.sheet}
                        </Badge>
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground text-xs truncate max-w-[120px]">{task.account}</td>
                      <td className="px-2 py-1.5 text-xs">
                        {nTR ? <span className="text-muted-foreground/40">—</span> : <span className="text-foreground">{task.translator}</span>}
                      </td>
                      <td className="px-2 py-1.5 text-xs">
                        {task.translator && !isXX(task.translator)
                          ? (nREV ? <span className="text-muted-foreground/40">—</span> : <span className="text-foreground">{task.reviewer}</span>)
                          : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className={`px-2 py-1.5 text-xs whitespace-nowrap ${deadlineClass(task.deadline)}`}>
                        {task.deadline || "—"}
                      </td>
                      <td className="px-2 py-1.5 text-xs tabular-nums text-right text-muted-foreground">{task.total}</td>
                      <td className="px-2 py-1.5 text-xs tabular-nums text-right text-muted-foreground">{task.wwc}</td>
                      <td className="px-2 py-1.5">
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
          {filteredTasks.length > 300 && (
            <div className="text-center py-2 text-xs text-muted-foreground border-t border-border">
              Showing first 300 of {filteredTasks.length} results
            </div>
          )}
        </div>

        {/* Right: Slide-over detail + assign panel */}
        {(selectedTask || bulkMode) && (
          <div className="w-[480px] shrink-0 border-l border-border bg-card flex flex-col h-full">
            {/* Fixed top: header + task details (scrollable if tall) */}
            <div className="overflow-y-auto max-h-[40%] shrink-0">
              {bulkMode && !selectedTask ? (
                /* Bulk mode header */
                <div className="p-4 border-b border-border">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm text-foreground">Bulk Assign</h3>
                      <Badge className={`text-[10px] ${bulkMode === "translator" ? "bg-orange-500/10 text-orange-600 border-orange-500/20" : "bg-blue-500/10 text-blue-600 border-blue-500/20"}`}>
                        {checkedKeys.size} tasks · {bulkMode === "translator" ? "Translator" : "Reviewer"}
                      </Badge>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setBulkMode(null)} data-testid="button-close-bulk" className="h-6 w-6 p-0">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Assigning {bulkMode === "translator" ? "translator" : "reviewer"} to {checkedKeys.size} selected tasks.
                    Each task will get its own assignment with the same freelancer(s).
                  </p>
                </div>
              ) : selectedTask ? (
                /* Single task header */
                <>
                  <div className="p-4 border-b border-border">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-sm text-foreground">{selectedTask.projectId}</h3>
                        <Badge variant="secondary" className="text-[10px]">{selectedTask.source}/{selectedTask.sheet}</Badge>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedTaskKey(null)} data-testid="button-close-panel" className="h-6 w-6 p-0">
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    {selectedTask.projectTitle && (
                      <p className="text-xs text-muted-foreground mb-2">{selectedTask.projectTitle}</p>
                    )}

                    {/* Task details grid */}
                    <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs mt-2">
                      <DetailItem label="Account" value={selectedTask.account} />
                      <DetailItem label="Deadline" value={selectedTask.deadline || "—"} />
                      <DetailItem label="Rev Type" value={selectedTask.revType || "—"} />
                      <DetailItem label="TR" value={selectedTask.translator || "—"} />
                      <DetailItem label="REV" value={selectedTask.reviewer || "—"} />
                      <DetailItem label="TR Done" value={selectedTask.trDone || "—"} />
                    </div>

                    {/* HO Note - yellow highlight */}
                    {selectedTask.hoNote && (
                      <div className="mt-2 p-2 rounded bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-800 dark:text-yellow-300">
                        <span className="font-semibold">HO Note: </span>{selectedTask.hoNote}
                      </div>
                    )}

                    {/* Instructions (collapsible) */}
                    {selectedTask.instructions && (
                      <div className="mt-2">
                        <button
                          onClick={() => setShowInstructions(!showInstructions)}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <ChevronRight className={`w-3 h-3 transition-transform ${showInstructions ? "rotate-90" : ""}`} />
                          Instructions
                        </button>
                        {showInstructions && (
                          <p className="mt-1 text-xs text-muted-foreground pl-4">{selectedTask.instructions}</p>
                        )}
                      </div>
                    )}

                    {/* Notes */}
                    {(selectedTask.trHbNote || selectedTask.revHbNote || selectedTask.lqi) && (
                      <div className="mt-2 pt-2 border-t border-border">
                        {selectedTask.trHbNote && (
                          <p className="text-[10px] text-muted-foreground"><span className="font-medium">TR HB:</span> {selectedTask.trHbNote}</p>
                        )}
                        {selectedTask.revHbNote && (
                          <p className="text-[10px] text-muted-foreground"><span className="font-medium">Rev HB:</span> {selectedTask.revHbNote}</p>
                        )}
                        {selectedTask.lqi && (
                          <p className="text-[10px] text-muted-foreground"><span className="font-medium">LQI:</span> {selectedTask.lqi}</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* CAT Analysis */}
                  {selectedTask.catCounts && catSum(selectedTask.catCounts) > 0 && (
                    <div className="px-4 py-2 border-b border-border">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">CAT Analysis</p>
                      <div className="flex flex-wrap gap-1">
                        {([
                          ["ICE", selectedTask.catCounts.ice],
                          ["Rep", selectedTask.catCounts.rep],
                          ["100%", selectedTask.catCounts.match100],
                          ["95-99", selectedTask.catCounts.fuzzy95],
                          ["85-94", selectedTask.catCounts.fuzzy85],
                          ["75-84", selectedTask.catCounts.fuzzy75],
                          ["NM", selectedTask.catCounts.noMatch],
                          ["MT", selectedTask.catCounts.mt],
                        ] as [string, string][]).filter(([, v]) => parseInt(v) > 0).map(([label, value]) => (
                          <span key={label} className="inline-flex items-center gap-1 bg-muted rounded px-1.5 py-0.5 text-[10px]">
                            <span className="text-muted-foreground">{label}:</span>
                            <span className="font-medium text-foreground tabular-nums">{value}</span>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-3 mt-1 text-[10px]">
                        <span className="text-muted-foreground">Total: <span className="font-semibold text-foreground">{selectedTask.total}</span></span>
                        <span className="text-muted-foreground">WWC: <span className="font-semibold text-foreground">{selectedTask.wwc}</span></span>
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>

            {/* Scrollable bottom: assignment controls + freelancer list */}
            <div className="flex-1 flex flex-col min-h-0">
              {/* Assignment config */}
              <div className="p-4 border-b border-border space-y-3 shrink-0">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Assignment</p>

                {/* Current TR/REV (single task only) */}
                {selectedTask && !bulkMode && (
                  <div className="flex gap-4 text-xs">
                    <span className="text-muted-foreground">
                      Current TR: <span className="font-medium text-foreground">{selectedTask.translator || "—"}</span>
                    </span>
                    <span className="text-muted-foreground">
                      Current REV: <span className="font-medium text-foreground">{selectedTask.reviewer || "—"}</span>
                    </span>
                  </div>
                )}

                {/* Role toggle (hidden in bulk mode since role is pre-set) */}
                {!bulkMode && (
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-medium text-muted-foreground w-10">Role</label>
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
                )}

                {/* Type toggle */}
                <div className="flex items-center gap-3">
                  <label className="text-xs font-medium text-muted-foreground w-10">Type</label>
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
                <div className="px-4 py-2 border-b border-border shrink-0">
                  <div className="text-[10px] font-medium text-muted-foreground mb-1.5">
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

              {/* Email preview/edit */}
              <div className="px-4 py-2 border-b border-border shrink-0">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Email Template</p>
                  <button
                    onClick={() => {
                      if (!editingEmail && currentTemplate) {
                        setCustomSubject(currentTemplate.subject);
                        setCustomBody(currentTemplate.body);
                      }
                      setEditingEmail(!editingEmail);
                    }}
                    className="flex items-center gap-1 text-[10px] text-primary hover:underline"
                  >
                    <Pencil className="w-3 h-3" />
                    {editingEmail ? "Cancel" : "Edit email"}
                  </button>
                </div>
                {editingEmail ? (
                  <div className="space-y-2">
                    <Input
                      value={customSubject}
                      onChange={(e) => setCustomSubject(e.target.value)}
                      placeholder="Subject..."
                      className="h-7 text-xs"
                      data-testid="input-email-subject"
                    />
                    <Textarea
                      value={customBody}
                      onChange={(e) => setCustomBody(e.target.value)}
                      placeholder="Body HTML..."
                      className="text-xs font-mono min-h-[100px]"
                      data-testid="input-email-body"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Placeholders: {"{{freelancerName}}"}, {"{{account}}"}, {"{{projectId}}"}, {"{{deadline}}"}, {"{{total}}"}, {"{{wwc}}"}, {"{{source}}"}, {"{{sheet}}"}
                    </p>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    {currentTemplate ? (
                      <>
                        <p className="font-medium text-foreground text-[11px]">{currentTemplate.subject}</p>
                        <p className="mt-0.5 truncate">{currentTemplate.body.replace(/<[^>]*>/g, "").slice(0, 80)}...</p>
                      </>
                    ) : (
                      <p>Default template will be used.</p>
                    )}
                  </div>
                )}
              </div>

              {/* Freelancer search + list (scrollable) */}
              <div className="flex-1 overflow-y-auto min-h-0">
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
                  {selectedTask && taskLangPair && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Filtering: {taskLangPair} {matchAccounts(selectedTask) && `· ${ACCOUNT_MATCH[selectedTask.source]?.join(", ")}`}
                    </p>
                  )}
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
                            <span className="text-[10px] text-muted-foreground">{f.resourceCode}</span>
                            {f.status === "Approved" && (
                              <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-green-500/10 text-green-600">Approved</Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {f.languagePairs?.slice(0, 3).map((lp: any) => typeof lp === "string" ? lp : `${lp.source_language}>${lp.target_language}`).join(", ")}
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
              <div className="p-3 border-t border-border bg-card shrink-0">
                {bulkMode ? (
                  <Button
                    className="w-full"
                    size="sm"
                    disabled={selectedFreelancers.length === 0 || bulkAssignMutation.isPending}
                    onClick={() => bulkAssignMutation.mutate()}
                    data-testid="button-bulk-assign"
                  >
                    {bulkAssignMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Assigning {checkedKeys.size} tasks...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Assign {bulkMode === "translator" ? "TR" : "REV"} to {checkedKeys.size} tasks ({selectedFreelancers.length})
                      </>
                    )}
                  </Button>
                ) : (
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
                        Assign {role === "translator" ? "TR" : "REV"} ({selectedFreelancers.length})
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──

function StatPill({ label, value, loading, color }: { label: string; value: number; loading: boolean; color?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`text-xs ${color || "text-muted-foreground"}`}>{label}:</span>
      {loading ? <Skeleton className="h-4 w-6" /> : <span className={`text-sm font-bold tabular-nums ${color || "text-foreground"}`}>{value}</span>}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="text-muted-foreground">{label}</span>
      <p className="font-medium text-foreground truncate">{value}</p>
    </div>
  );
}

function matchAccounts(task: Task | null): boolean {
  if (!task) return false;
  return !!ACCOUNT_MATCH[task.source];
}
