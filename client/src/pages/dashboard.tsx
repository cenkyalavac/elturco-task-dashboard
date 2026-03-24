import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getPublicApiBase } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
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
  CheckCircle2, Pencil, Save, Eye, Code, ListOrdered, Trash2,
  Ban, Clock, XCircle, UserCheck, CheckSquare,
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
  qs: string;
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

interface Offer {
  id: number;
  assignmentId: number;
  freelancerCode: string;
  freelancerName: string;
  freelancerEmail: string;
  status: string;
  sequenceOrder: number | null;
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
  offers: Offer[];
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

interface SequencePreset {
  id: number;
  name: string;
  pmEmail: string;
  role: string;
  freelancerCodes: string;
  assignmentType: string;
}

interface FreelancerStats {
  taskCount: number;
  avgQs: number | null;
}

// ── Constants ──

const ACCOUNT_MATCH: Record<string, string[]> = {
  Amazon: ["Amazon", "Amazon SeCM", "Amazon PWS"],
  AppleCare: ["Apple"],
};

// Test freelancer codes that bypass account/language filters
const BYPASS_FILTER_CODES = ["CY", "CY1"];

// ── Helpers ──

function isXX(v: string): boolean {
  return v.trim().toUpperCase() === "XX";
}

function isRevCompleted(t: Task): boolean {
  const v = (t.revComplete || "").trim().toLowerCase();
  if (!v) return false;
  if (v === "yes" || v === "y") return true;
  if (/^\d+/.test(v)) return true;
  return false;
}

function isTrDone(t: Task): boolean {
  const v = (t.trDone || "").trim().toLowerCase();
  if (!v) return false;
  if (v === "yes" || v === "y") return true;
  return false;
}

function needsTranslator(t: Task): boolean {
  if (isRevCompleted(t)) return false;
  if (isTrDone(t)) return false;
  return !t.translator || t.translator.trim() === "" || isXX(t.translator);
}

function needsReviewer(t: Task): boolean {
  if (isRevCompleted(t)) return false;
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
  const { user } = useAuth();

  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [langFilter, setLangFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("ongoing");
  const [myProjectsOnly, setMyProjectsOnly] = useState(false);
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
  const [emailPreviewMode, setEmailPreviewMode] = useState(false);
  const [customSubject, setCustomSubject] = useState("");
  const [customBody, setCustomBody] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);

  // Preset state
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [presetName, setPresetName] = useState("");

  // Project Complete state
  const [showComplete, setShowComplete] = useState(false);
  const [completeMode, setCompleteMode] = useState<"yes" | "minutes">("yes");
  const [completeMinutes, setCompleteMinutes] = useState("");

  // Skip email (confirmed assign)
  const [skipEmail, setSkipEmail] = useState(false);

  // Review type for reviewer assignments
  const [reviewType, setReviewType] = useState("Full Review");

  // Bulk complete state
  const [showBulkComplete, setShowBulkComplete] = useState(false);
  const [bulkCompleteMode, setBulkCompleteMode] = useState<"yes" | "minutes">("yes");
  const [bulkCompleteMinutes, setBulkCompleteMinutes] = useState("");

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

  const { data: presets } = useQuery<SequencePreset[]>({
    queryKey: ["/api/presets"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/presets");
      return res.json();
    },
    staleTime: 60000,
  });

  const { data: freelancerStats } = useQuery<Record<string, FreelancerStats>>({
    queryKey: ["/api/freelancer-stats"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/freelancer-stats");
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

  // Unique language pairs for filter dropdown
  const uniqueLangPairs = useMemo(() => {
    if (!sheetConfigs) return [];
    return [...new Set((sheetConfigs as SheetConfig[]).map(c => c.languagePair))].sort();
  }, [sheetConfigs]);

  // Filter + sort tasks
  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    const filtered = tasks.filter((t) => {
      if (sourceFilter !== "all" && t.source !== sourceFilter) return false;
      if (accountFilter !== "all" && t.account !== accountFilter) return false;
      // My Projects filter: only show tasks from sheets assigned to this PM
      if (myProjectsOnly && sheetConfigs && user) {
        const config = (sheetConfigs as SheetConfig[]).find(c => c.source === t.source && c.sheet === t.sheet);
        if (config?.assignedPms) {
          try {
            const pms = JSON.parse(config.assignedPms) as string[];
            if (!pms.includes(user.email)) return false;
          } catch {}
        }
      }

      // Language pair filter - match task's source+sheet against sheetConfigs
      if (langFilter !== "all" && sheetConfigs) {
        const config = (sheetConfigs as SheetConfig[]).find(c => c.source === t.source && c.sheet === t.sheet);
        if (!config || config.languagePair !== langFilter) return false;
      }

      const nTR = needsTranslator(t);
      const nREV = needsReviewer(t);
      const isUnassigned = nTR || nREV;

      const revDone = isRevCompleted(t);

      if (statusFilter === "ongoing" && (revDone || t.delivered === "Delivered")) return false;
      if (statusFilter === "needs_tr" && !nTR) return false;
      if (statusFilter === "needs_rev" && !nREV) return false;
      if (statusFilter === "unassigned" && !isUnassigned) return false;
      if (statusFilter === "assigned" && (isUnassigned || t.delivered === "Delivered")) return false;
      if (statusFilter === "delivered" && t.delivered !== "Delivered") return false;
      if (["delivered", "all", "ongoing", "needs_tr", "needs_rev", "unassigned", "assigned"].indexOf(statusFilter) === -1 && t.delivered === "Delivered") return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return [t.projectId, t.account, t.translator, t.reviewer, t.sheet, t.source, t.projectTitle]
          .some((v) => v?.toLowerCase().includes(q));
      }
      return true;
    });

    return filtered.sort((a, b) => {
      const da = parseDeadline(a.deadline);
      const db = parseDeadline(b.deadline);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da.getTime() - db.getTime();
    });
  }, [tasks, sourceFilter, accountFilter, langFilter, statusFilter, searchQuery, sheetConfigs, myProjectsOnly, user]);

  // Stats
  const stats = useMemo(() => {
    if (!tasks) return { total: 0, ongoing: 0, needsTR: 0, needsREV: 0, assigned: 0, completed: 0 };
    const nonDelivered = tasks.filter((t) => t.delivered !== "Delivered");
    const ongoing = nonDelivered.filter(t => !isRevCompleted(t)).length;
    const nTR = nonDelivered.filter(needsTranslator).length;
    const nREV = nonDelivered.filter(needsReviewer).length;
    const completedCount = nonDelivered.filter(t => isRevCompleted(t)).length;
    return {
      total: nonDelivered.length,
      ongoing,
      needsTR: nTR,
      needsREV: nREV,
      assigned: ongoing - nTR - nREV,
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

  // Bulk sources for cross-account matching
  const bulkSources = useMemo(() => {
    if (!bulkMode || !tasks) return [];
    const checkedTasks = tasks.filter(t => checkedKeys.has(taskKey(t)));
    const sources: string[] = [];
    checkedTasks.forEach(t => {
      if (!sources.includes(t.source)) sources.push(t.source);
    });
    return sources;
  }, [bulkMode, tasks, checkedKeys]);

  // Bulk filtered freelancers: must match ALL sources
  const bulkFilteredFreelancers = useMemo(() => {
    if (!freelancers || !bulkMode) return [];
    const selectedIds = new Set(selectedFreelancers.map((f) => f.id));
    return freelancers.filter(f => {
      if (selectedIds.has(f.id)) return false;
      return bulkSources.every(source => {
        const matchAccts = ACCOUNT_MATCH[source] || [];
        if (matchAccts.length === 0) return true;
        return f.accounts?.some(a => matchAccts.includes(a));
      });
    }).sort((a, b) => {
      const sa = freelancerStats?.[a.resourceCode]?.taskCount || 0;
      const sb = freelancerStats?.[b.resourceCode]?.taskCount || 0;
      if (sb !== sa) return sb - sa;
      return a.fullName.localeCompare(b.fullName);
    });
  }, [freelancers, bulkMode, bulkSources, selectedFreelancers, freelancerStats]);

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
    setEmailPreviewMode(false);
    setCustomSubject("");
    setCustomBody("");
    setShowInstructions(false);
    setShowComplete(false);
    setShowSavePreset(false);
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
        setBulkMode(null);
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

  // Freelancer filtering (single task mode)
  const filteredFreelancers = useMemo(() => {
    if (!freelancers || !selectedTask) return [];
    const matchAccounts = ACCOUNT_MATCH[selectedTask.source] || [];
    const selectedIds = new Set(selectedFreelancers.map((f) => f.id));

    return freelancers
      .filter((f) => {
        if (selectedIds.has(f.id)) return false;
        // Bypass account/language filters for test freelancers
        if (!BYPASS_FILTER_CODES.includes(f.resourceCode)) {
          const matchesAccount = matchAccounts.length === 0 || f.accounts?.some((a) => matchAccounts.includes(a));
          if (!matchesAccount) return false;
          if (taskLangPair && taskLangPair !== "Multi" && f.languagePairs?.length > 0) {
            if (!f.languagePairs.includes(taskLangPair)) return false;
          }
        }
        if (freelancerSearch) {
          const q = freelancerSearch.toLowerCase();
          return [f.fullName, f.resourceCode, f.email]
            .some((v) => v?.toLowerCase().includes(q));
        }
        return true;
      })
      .sort((a, b) => {
        // Sort by task count desc (most used first), then alphabetical
        const sa = freelancerStats?.[a.resourceCode]?.taskCount || 0;
        const sb = freelancerStats?.[b.resourceCode]?.taskCount || 0;
        if (sb !== sa) return sb - sa;
        return a.fullName.localeCompare(b.fullName);
      });
  }, [freelancers, selectedTask, freelancerSearch, selectedFreelancers, taskLangPair, freelancerStats]);

  // Use bulkFilteredFreelancers in bulk mode, filteredFreelancers otherwise
  const displayFreelancers = bulkMode ? bulkFilteredFreelancers : filteredFreelancers;

  function addFreelancer(f: Freelancer) {
    if (assignmentType === "direct") {
      setSelectedFreelancers([f]);
    } else {
      setSelectedFreelancers((prev) => [...prev, f]);
    }
  }

  function removeFreelancer(id: string) {
    setSelectedFreelancers((prev) => prev.filter((f) => f.id !== id));
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

  // Load preset
  function loadPreset(preset: SequencePreset) {
    if (!freelancers) return;
    try {
      const codes = JSON.parse(preset.freelancerCodes) as string[];
      const matched = codes.map(code => freelancers.find(f => f.resourceCode === code)).filter(Boolean) as Freelancer[];
      setSelectedFreelancers(matched);
      setAssignmentType(preset.assignmentType as any || "sequence");
      if (!bulkMode) setRole(preset.role as any || "translator");
    } catch {}
  }

  // Save preset mutation
  const savePresetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/presets", {
        name: presetName,
        role: bulkMode || role,
        freelancerCodes: JSON.stringify(selectedFreelancers.map(f => f.resourceCode)),
        assignmentType,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/presets"] });
      toast({ title: "Preset saved" });
      setShowSavePreset(false);
      setPresetName("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Delete preset mutation
  const deletePresetMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/presets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/presets"] });
      toast({ title: "Preset deleted" });
    },
  });

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
        reviewType: role === "reviewer" ? reviewType : undefined,
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
          reviewType: bulkMode === "reviewer" ? reviewType : undefined,
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

  // Project complete mutation
  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTask) throw new Error("No task");
      const revCompleteValue = completeMode === "yes" ? "Yes" : completeMinutes;
      const res = await apiRequest("POST", "/api/tasks/complete", {
        source: selectedTask.source,
        sheet: selectedTask.sheet,
        projectId: selectedTask.projectId,
        revCompleteValue,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      toast({ title: "Task marked as complete" });
      setShowComplete(false);
      setCompleteMode("yes");
      setCompleteMinutes("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Cancel assignment mutation
  const cancelAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: number) => {
      await apiRequest("POST", `/api/assignments/${assignmentId}/cancel`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      toast({ title: "Assignment cancelled" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Withdraw offer mutation
  const withdrawOfferMutation = useMutation({
    mutationFn: async (offerId: number) => {
      await apiRequest("POST", `/api/offers/${offerId}/withdraw`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      toast({ title: "Offer withdrawn" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Self-assign mutation (Assign to Me)
  const selfAssignMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTask || !user) throw new Error("No task or user");
      const res = await apiRequest("POST", "/api/assignments/self-assign", {
        source: selectedTask.source,
        sheet: selectedTask.sheet,
        projectId: selectedTask.projectId,
        account: selectedTask.account,
        taskDetails: {
          source: selectedTask.source, sheet: selectedTask.sheet,
          projectId: selectedTask.projectId, account: selectedTask.account,
          deadline: selectedTask.deadline, total: selectedTask.total,
          wwc: selectedTask.wwc, revType: selectedTask.revType,
          projectTitle: selectedTask.projectTitle,
        },
        role,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Assigned to you" });
      setSelectedTaskKey(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Confirmed assign mutation (skip email)
  const confirmedAssignMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTask || selectedFreelancers.length === 0) throw new Error("No task or freelancer");
      const f = selectedFreelancers[0];
      const res = await apiRequest("POST", "/api/assignments/confirmed", {
        source: selectedTask.source,
        sheet: selectedTask.sheet,
        projectId: selectedTask.projectId,
        account: selectedTask.account,
        taskDetails: {
          source: selectedTask.source, sheet: selectedTask.sheet,
          projectId: selectedTask.projectId, account: selectedTask.account,
          deadline: selectedTask.deadline, total: selectedTask.total,
          wwc: selectedTask.wwc, revType: selectedTask.revType,
          projectTitle: selectedTask.projectTitle,
        },
        role,
        freelancerCode: f.resourceCode,
        freelancerName: f.fullName,
        freelancerEmail: f.email,
        reviewType: role === "reviewer" ? reviewType : undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task assigned (confirmed)", description: "No email sent." });
      setSelectedTaskKey(null);
      setSelectedFreelancers([]);
      setSkipEmail(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Bulk complete mutation
  const bulkCompleteMutation = useMutation({
    mutationFn: async () => {
      if (!tasks) throw new Error("No tasks");
      const checkedTasks = tasks.filter(t => checkedKeys.has(taskKey(t)));
      const taskIds = checkedTasks.map(t => ({
        source: t.source,
        sheet: t.sheet,
        projectId: t.projectId,
      }));
      const res = await apiRequest("POST", "/api/tasks/bulk-complete", {
        tasks: taskIds,
        mode: bulkCompleteMode,
        totalMinutes: bulkCompleteMode === "minutes" ? parseInt(bulkCompleteMinutes) || 0 : undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      toast({ title: "Tasks marked complete", description: `${checkedKeys.size} tasks completed.` });
      setCheckedKeys(new Set());
      setShowBulkComplete(false);
      setBulkCompleteMode("yes");
      setBulkCompleteMinutes("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Assignments for the selected task
  const taskAssignments = useMemo(() => {
    if (!selectedTask || !assignments) return [];
    return (assignments as Assignment[]).filter(a =>
      a.source === selectedTask.source && a.projectId === selectedTask.projectId &&
      a.status !== "cancelled"
    );
  }, [selectedTask, assignments]);

  // Whether selected task is fully assigned (no needs)
  const isFullyAssigned = selectedTask ? !needsTranslator(selectedTask) && !needsReviewer(selectedTask) : false;

  // CAT counts sum
  const catSum = useCallback((cc: CatCounts) => {
    return [cc.ice, cc.rep, cc.match100, cc.fuzzy95, cc.fuzzy85, cc.fuzzy75, cc.noMatch, cc.mt]
      .reduce((s, v) => s + (parseInt(v) || 0), 0);
  }, []);

  // Sample vars for email preview
  const sampleVars: Record<string, string> = selectedTask ? {
    freelancerName: selectedFreelancers[0]?.fullName || "Freelancer Name",
    account: selectedTask.account || "Account",
    source: selectedTask.source || "Source",
    sheet: selectedTask.sheet || "Sheet",
    projectId: selectedTask.projectId || "PRJ-123",
    deadline: selectedTask.deadline || "2026-04-01",
    total: selectedTask.total || "1000",
    wwc: selectedTask.wwc || "500",
    role: role === "translator" ? "Translation" : "Review",
    acceptUrl: "#",
  } : {};

  function replacePreviewVars(template: string): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => sampleVars[key] ?? `{{${key}}}`);
  }

  // Can show complete button: has TR and REV assigned, rev not done
  const canComplete = selectedTask &&
    selectedTask.translator && !isXX(selectedTask.translator) &&
    selectedTask.reviewer && !isXX(selectedTask.reviewer) &&
    !isRevCompleted(selectedTask);

  const hasChecked = checkedKeys.size > 0;

  // Presets for current role
  const rolePresets = useMemo(() => {
    if (!presets) return [];
    const r = bulkMode || role;
    return presets.filter(p => p.role === r);
  }, [presets, role, bulkMode]);

  return (
    <div className="h-full flex flex-col">
      {/* Stats bar */}
      <div className="border-b border-border bg-card px-4 py-2">
        <div className="flex items-center gap-6 text-xs">
          <StatPill label="Total" value={stats.total} loading={tasksLoading} />
          <StatPill label="Ongoing" value={stats.ongoing} loading={tasksLoading} color="text-primary" />
          <StatPill label="Needs TR" value={stats.needsTR} loading={tasksLoading} color="text-orange-500" />
          <StatPill label="Needs REV" value={stats.needsREV} loading={tasksLoading} color="text-blue-500" />
          <StatPill label="Assigned" value={stats.assigned} loading={tasksLoading} color="text-emerald-500" />
          <StatPill label="Rev Done" value={stats.completed} loading={tasksLoading} color="text-green-600" />
        </div>
      </div>

      {/* Filters + bulk actions */}
      <div className="border-b border-border bg-card px-4 py-2 flex items-center gap-3 relative">
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
              variant="default"
              size="sm"
              className="h-7 text-xs bg-green-600 hover:bg-green-700"
              onClick={() => setShowBulkComplete(true)}
              data-testid="button-bulk-complete"
            >
              <CheckSquare className="w-3 h-3 mr-1" />
              Bulk Complete
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => { setCheckedKeys(new Set()); setBulkMode(null); setShowBulkComplete(false); }}
            >
              Clear
            </Button>
            {showBulkComplete && (
              <div className="absolute top-full left-0 mt-1 z-20 bg-card border border-border rounded-lg shadow-lg p-3 w-72">
                <p className="text-xs font-semibold mb-2">Bulk Complete {checkedKeys.size} tasks</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input type="radio" name="bulkCompleteMode" checked={bulkCompleteMode === "yes"} onChange={() => setBulkCompleteMode("yes")} />
                      Mark as Yes
                    </label>
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input type="radio" name="bulkCompleteMode" checked={bulkCompleteMode === "minutes"} onChange={() => setBulkCompleteMode("minutes")} />
                      Distribute minutes
                    </label>
                  </div>
                  {bulkCompleteMode === "minutes" && (
                    <Input
                      type="number"
                      value={bulkCompleteMinutes}
                      onChange={(e) => setBulkCompleteMinutes(e.target.value)}
                      placeholder="Total minutes to split evenly..."
                      className="h-7 text-xs"
                    />
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="h-7 text-xs bg-green-600 hover:bg-green-700"
                      disabled={bulkCompleteMode === "minutes" && !bulkCompleteMinutes || bulkCompleteMutation.isPending}
                      onClick={() => bulkCompleteMutation.mutate()}
                    >
                      {bulkCompleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                      Confirm
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowBulkComplete(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            )}
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
            <Select value={langFilter} onValueChange={setLangFilter}>
              <SelectTrigger className="w-28 h-8 text-sm" data-testid="select-lang">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Langs</SelectItem>
                {uniqueLangPairs.map(lp => (
                  <SelectItem key={lp} value={lp}>{lp}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32 h-8 text-sm" data-testid="select-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ongoing">Ongoing</SelectItem>
                <SelectItem value="needs_tr">Needs TR</SelectItem>
                <SelectItem value="needs_rev">Needs REV</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                <SelectItem value="assigned">Assigned</SelectItem>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
              </SelectContent>
            </Select>
            <button
              onClick={() => setMyProjectsOnly(!myProjectsOnly)}
              className={`h-8 px-3 text-xs rounded-md border transition-colors ${
                myProjectsOnly
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-muted/50"
              }`}
              data-testid="toggle-my-projects"
            >
              My Projects
            </button>
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
                    {bulkSources.length > 1 && (
                      <span className="block mt-1 text-yellow-600">
                        Multiple sources selected ({bulkSources.join(", ")}). Showing freelancers matching all sources.
                      </span>
                    )}
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

                    {/* Project Complete button */}
                    {canComplete && (
                      <div className="mt-3">
                        {!showComplete ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs text-green-600 border-green-500/30 hover:bg-green-500/10"
                            onClick={() => setShowComplete(true)}
                          >
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Mark Complete
                          </Button>
                        ) : (
                          <div className="p-2 rounded bg-green-500/5 border border-green-500/20 space-y-2">
                            <div className="flex items-center gap-3">
                              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                                <input type="radio" name="completeMode" checked={completeMode === "yes"} onChange={() => setCompleteMode("yes")} />
                                Mark as Yes
                              </label>
                              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                                <input type="radio" name="completeMode" checked={completeMode === "minutes"} onChange={() => setCompleteMode("minutes")} />
                                Enter time (minutes)
                              </label>
                            </div>
                            {completeMode === "minutes" && (
                              <Input
                                type="number"
                                value={completeMinutes}
                                onChange={(e) => setCompleteMinutes(e.target.value)}
                                placeholder="Minutes..."
                                className="h-7 text-xs w-32"
                              />
                            )}
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                className="h-7 text-xs bg-green-600 hover:bg-green-700"
                                disabled={completeMode === "minutes" && !completeMinutes || completeMutation.isPending}
                                onClick={() => completeMutation.mutate()}
                              >
                                {completeMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                                Confirm
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowComplete(false)}>
                                Cancel
                              </Button>
                            </div>
                          </div>
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

            {/* Scrollable bottom: status view OR assignment controls */}
            {isFullyAssigned && selectedTask && !bulkMode ? (
              /* ── Status View for fully assigned tasks ── */
              <div className="flex-1 overflow-y-auto min-h-0">
                <div className="p-4 space-y-3">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Active Assignments</p>

                  {taskAssignments.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">No assignments found for this task.</p>
                  ) : (
                    <div className="space-y-3">
                      {taskAssignments.map((asgn) => (
                        <div key={asgn.id} className="border border-border rounded-lg p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <Badge className={`text-[10px] px-1.5 py-0 ${asgn.role === "translator" ? "bg-orange-500/10 text-orange-600 border-orange-500/20" : "bg-blue-500/10 text-blue-600 border-blue-500/20"}`}>
                              {asgn.role === "translator" ? "Translator" : "Reviewer"}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              {asgn.assignmentType === "direct" ? "Direct" : asgn.assignmentType === "sequence" ? "Sequential" : "Broadcast"}
                            </span>
                            <OfferStatusBadge status={asgn.status} />
                          </div>

                          {/* Offers list */}
                          <div className="space-y-1 pl-1">
                            {(asgn.offers || [])
                              .sort((a, b) => (a.sequenceOrder ?? 999) - (b.sequenceOrder ?? 999))
                              .map((offer, oi) => (
                              <div key={offer.id} className="flex items-center gap-2 text-xs">
                                <span className="text-muted-foreground w-4 text-right shrink-0">{oi + 1}.</span>
                                <span className="font-medium text-foreground">{offer.freelancerName}</span>
                                <span className="text-muted-foreground">({offer.freelancerCode})</span>
                                <OfferStatusBadge status={offer.status} />
                                {offer.status === "pending" && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 text-[10px] px-1.5 text-muted-foreground hover:text-destructive ml-auto"
                                    disabled={withdrawOfferMutation.isPending}
                                    onClick={() => withdrawOfferMutation.mutate(offer.id)}
                                  >
                                    <XCircle className="w-3 h-3 mr-0.5" />
                                    Withdraw
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* Cancel assignment button */}
                          {asgn.status !== "completed" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-[10px] text-destructive border-destructive/30 hover:bg-destructive/10"
                              disabled={cancelAssignmentMutation.isPending}
                              onClick={() => cancelAssignmentMutation.mutate(asgn.id)}
                            >
                              {cancelAssignmentMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Ban className="w-3 h-3 mr-1" />}
                              Cancel Assignment
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* ── Assignment Form ── */
              <div className="flex-1 flex flex-col min-h-0">
              {/* Assignment config */}
              <div className="p-4 border-b border-border space-y-3 shrink-0">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Assignment</p>

                {/* Assign to Me button (single task only) */}
                {selectedTask && !bulkMode && (needsTranslator(selectedTask) || needsReviewer(selectedTask)) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs w-full border-primary/30 text-primary hover:bg-primary/10"
                    disabled={selfAssignMutation.isPending}
                    onClick={() => selfAssignMutation.mutate()}
                    data-testid="button-assign-to-me"
                  >
                    {selfAssignMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <UserCheck className="w-3 h-3 mr-1" />}
                    Assign to Me ({role === "translator" ? "TR" : "REV"})
                  </Button>
                )}

                {/* Skip email toggle (confirmed assign) */}
                {selectedTask && !bulkMode && (
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={skipEmail}
                      onChange={(e) => setSkipEmail(e.target.checked)}
                      className="rounded border-border"
                    />
                    <span className="text-muted-foreground">Already confirmed (skip email)</span>
                  </label>
                )}

                {/* Presets */}
                {rolePresets.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <ListOrdered className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-[10px] text-muted-foreground shrink-0">Presets:</span>
                    {rolePresets.map(p => (
                      <div key={p.id} className="flex items-center gap-0.5">
                        <button
                          onClick={() => loadPreset(p)}
                          className="px-2 py-0.5 rounded bg-muted text-xs text-foreground hover:bg-muted/80 transition-colors"
                        >
                          {p.name}
                        </button>
                        <button
                          onClick={() => deletePresetMutation.mutate(p.id)}
                          className="text-muted-foreground hover:text-destructive p-0"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

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

                {/* Review Type selector (only when role is reviewer) */}
                {(bulkMode === "reviewer" || (!bulkMode && role === "reviewer")) && (
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-medium text-muted-foreground w-10">Rev</label>
                    <div className="flex gap-1">
                      {(["Full Review", "Self-Edit", "LQA", "QA"] as const).map((rt) => (
                        <button
                          key={rt}
                          onClick={() => setReviewType(rt)}
                          data-testid={`button-revtype-${rt.toLowerCase().replace(" ", "-")}`}
                          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                            reviewType === rt ? "bg-purple-500/10 text-purple-600 border border-purple-500/30" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {rt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Selected freelancers chips */}
              {selectedFreelancers.length > 0 && (
                <div className="px-4 py-2 border-b border-border shrink-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-[10px] font-medium text-muted-foreground">
                      Selected ({selectedFreelancers.length})
                    </div>
                    <button
                      onClick={() => { setShowSavePreset(!showSavePreset); }}
                      className="flex items-center gap-1 text-[10px] text-primary hover:underline"
                    >
                      <Save className="w-3 h-3" />
                      Save as preset
                    </button>
                  </div>
                  {showSavePreset && (
                    <div className="flex items-center gap-1.5 mb-2">
                      <Input
                        value={presetName}
                        onChange={(e) => setPresetName(e.target.value)}
                        placeholder="Preset name..."
                        className="h-6 text-xs flex-1"
                      />
                      <Button
                        size="sm"
                        className="h-6 text-[10px] px-2"
                        disabled={!presetName || savePresetMutation.isPending}
                        onClick={() => savePresetMutation.mutate()}
                      >
                        {savePresetMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                      </Button>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {selectedFreelancers.map((f, idx) => (
                      <div key={f.id} className="flex items-center gap-1 bg-muted rounded px-2 py-0.5 text-xs" data-testid={`chip-${f.resourceCode}`}>
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
                        <button onClick={() => removeFreelancer(f.id)} className="text-muted-foreground hover:text-destructive p-0" data-testid={`remove-${f.resourceCode}`}>
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
                  <div className="flex items-center gap-2">
                    {editingEmail && (
                      <button
                        onClick={() => setEmailPreviewMode(!emailPreviewMode)}
                        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        {emailPreviewMode ? <Code className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        {emailPreviewMode ? "Source" : "Preview"}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (!editingEmail && currentTemplate) {
                          setCustomSubject(currentTemplate.subject);
                          setCustomBody(currentTemplate.body);
                        }
                        setEditingEmail(!editingEmail);
                        setEmailPreviewMode(false);
                      }}
                      className="flex items-center gap-1 text-[10px] text-primary hover:underline"
                    >
                      <Pencil className="w-3 h-3" />
                      {editingEmail ? "Cancel" : "Edit email"}
                    </button>
                  </div>
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
                    {emailPreviewMode ? (
                      <div className="border border-border rounded p-2 bg-white text-xs max-h-[200px] overflow-y-auto">
                        <p className="text-xs font-medium mb-1 text-gray-800">{replacePreviewVars(customSubject)}</p>
                        <div dangerouslySetInnerHTML={{ __html: replacePreviewVars(customBody) }} />
                      </div>
                    ) : (
                      <Textarea
                        value={customBody}
                        onChange={(e) => setCustomBody(e.target.value)}
                        placeholder="Body HTML..."
                        className="text-xs font-mono min-h-[200px]"
                        data-testid="input-email-body"
                      />
                    )}
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
                      Filtering: {taskLangPair} {matchAccountsHelper(selectedTask) && `· ${ACCOUNT_MATCH[selectedTask.source]?.join(", ")}`}
                    </p>
                  )}
                </div>

                {freelancersLoading ? (
                  <div className="p-3 space-y-2">
                    {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded" />)}
                  </div>
                ) : displayFreelancers.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">
                    No matching freelancers found.
                  </p>
                ) : (
                  <div className="divide-y divide-border">
                    {displayFreelancers.slice(0, 50).map((f) => {
                      const fStats = freelancerStats?.[f.resourceCode];
                      return (
                        <div
                          key={f.id}
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
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                              <span>{f.languagePairs?.slice(0, 3).map((lp: any) => typeof lp === "string" ? lp : `${lp.source_language}>${lp.target_language}`).join(", ")}</span>
                              {fStats && (
                                <>
                                  <span className="text-muted-foreground/50">·</span>
                                  <span className="tabular-nums">{fStats.taskCount} tasks</span>
                                  {fStats.avgQs !== null && (
                                    <>
                                      <span className="text-muted-foreground/50">·</span>
                                      <span className="tabular-nums">QS: {fStats.avgQs}</span>
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {displayFreelancers.length > 50 && (
                      <p className="text-[10px] text-muted-foreground text-center py-2">
                        Showing first 50 of {displayFreelancers.length}
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
                ) : skipEmail ? (
                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                    size="sm"
                    disabled={selectedFreelancers.length === 0 || confirmedAssignMutation.isPending}
                    onClick={() => confirmedAssignMutation.mutate()}
                    data-testid="button-assign-confirmed"
                  >
                    {confirmedAssignMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Assigning...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Assign Confirmed ({selectedFreelancers.length}) — No email
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
            )}
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

function OfferStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    accepted: "bg-green-500/10 text-green-600 border-green-500/20",
    rejected: "bg-red-500/10 text-red-600 border-red-500/20",
    withdrawn: "bg-gray-500/10 text-gray-500 border-gray-500/20",
    completed: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    offered: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    expired: "bg-gray-500/10 text-gray-500 border-gray-500/20",
    cancelled: "bg-gray-500/10 text-gray-500 border-gray-500/20",
  };
  const icons: Record<string, React.ReactNode> = {
    pending: <Clock className="w-2.5 h-2.5 mr-0.5" />,
    accepted: <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />,
    rejected: <XCircle className="w-2.5 h-2.5 mr-0.5" />,
    withdrawn: <Ban className="w-2.5 h-2.5 mr-0.5" />,
  };
  return (
    <Badge className={`text-[10px] px-1.5 py-0 ${styles[status] || "bg-muted text-muted-foreground"}`}>
      {icons[status] || null}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function matchAccountsHelper(task: Task | null): boolean {
  if (!task) return false;
  return !!ACCOUNT_MATCH[task.source];
}
