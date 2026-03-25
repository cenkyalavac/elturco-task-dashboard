import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { apiRequest, queryClient, getPublicApiBase } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Search, Send, User, GripVertical, X,
  CheckCircle2, Loader2, ArrowUpDown, ChevronUp, ChevronDown,
} from "lucide-react";

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

// Account matching map
const ACCOUNT_MATCH: Record<string, string[]> = {
  Amazon: ["Amazon", "Amazon SeCM", "Amazon PWS"],
  AppleCare: ["Apple"],
  "L-Google": ["Google"],
  WhatsApp: ["Whatsapp"],
  TikTok: ["TikTok"],
  Facebook: ["Facebook"],
  Inditex: ["Across"],
};

const SPECIALIZATION_MATCH: Record<string, string[]> = {
  Games: ["Game", "Gaming", "Game Localization", "Gaming Localization", "Gaming Translation", "Games Localization Specialist", "Video Games", "Video Game Localisation", "Videogame Localization", "Game Industry"],
};

export default function AssignPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const source = params.get("source") || "";
  const sheet = params.get("sheet") || "";
  const projectId = params.get("projectId") || "";
  const { toast } = useToast();

  // Fetch the specific task
  const { data: tasks } = useQuery<any[]>({
    queryKey: ["/api/tasks"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/tasks");
      return res.json();
    },
    staleTime: 60000,
  });

  const task = useMemo(() => {
    if (!tasks) return null;
    return tasks.find(t => t.source === source && t.sheet === sheet && t.projectId === projectId);
  }, [tasks, source, sheet, projectId]);

  // Fetch freelancers
  const { data: freelancers, isLoading: freelancersLoading } = useQuery<Freelancer[]>({
    queryKey: ["/api/freelancers"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/freelancers");
      return res.json();
    },
    staleTime: 300000,
  });

  // State
  const [role, setRole] = useState<"translator" | "reviewer">("translator");
  const [assignmentType, setAssignmentType] = useState<"direct" | "sequence" | "broadcast">("sequence");
  const [autoReviewer, setAutoReviewer] = useState(false);
  const [freelancerSearch, setFreelancerSearch] = useState("");
  const [selectedFreelancers, setSelectedFreelancers] = useState<Freelancer[]>([]);
  const [showAllStatuses, setShowAllStatuses] = useState(true); // Show CY (Red Flag) + CY1 (Approved)

  // Auto-detect role
  useEffect(() => {
    if (task) {
      if (task.translator && !task.reviewer) {
        setRole("reviewer");
      }
    }
  }, [task]);

  // Filter freelancers by account match and status
  const filteredFreelancers = useMemo(() => {
    if (!freelancers) return [];
    const matchAccounts = ACCOUNT_MATCH[source] || [];
    const selectedCodes = new Set(selectedFreelancers.map(f => f.resourceCode));

    return freelancers
      .filter(f => {
        // Exclude already selected
        if (selectedCodes.has(f.resourceCode)) return false;
        // Status filter - show both Approved and Red Flag for testing
        if (!showAllStatuses && f.status !== "Approved") return false;
        // Account filter (bypass when searching by name/code)
        const matchesAccount = matchAccounts.length === 0 || f.accounts?.some((a: string) => matchAccounts.includes(a));
        // Check specialization match (for Games etc.)
        const specMatch = SPECIALIZATION_MATCH[source] || [];
        const matchesSpec = specMatch.length > 0 && f.specializations?.some((s: string) => specMatch.includes(s));
        // Search
        if (freelancerSearch) {
          const q = freelancerSearch.toLowerCase();
          const matchesSearch = [f.fullName, f.resourceCode, f.email, f.nativeLanguage, ...(f.accounts || [])]
            .some(v => v?.toLowerCase().includes(q));
          // If searching, show results even if they don't match account filter
          return matchesSearch;
        }
        // When not searching, apply account/specialization filter
        if (!matchesAccount && !matchesSpec) return false;
        return true;
      })
      .sort((a, b) => {
        // Approved first, then by name
        if (a.status === "Approved" && b.status !== "Approved") return -1;
        if (b.status === "Approved" && a.status !== "Approved") return 1;
        return a.fullName.localeCompare(b.fullName);
      });
  }, [freelancers, source, role, freelancerSearch, selectedFreelancers, showAllStatuses]);

  // Add/remove freelancers
  function addFreelancer(f: Freelancer) {
    if (assignmentType === "direct") {
      setSelectedFreelancers([f]);
    } else {
      setSelectedFreelancers(prev => [...prev, f]);
    }
  }

  function removeFreelancer(code: string) {
    setSelectedFreelancers(prev => prev.filter(f => f.resourceCode !== code));
  }

  function moveFreelancer(index: number, direction: "up" | "down") {
    setSelectedFreelancers(prev => {
      const arr = [...prev];
      const newIndex = direction === "up" ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= arr.length) return prev;
      [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
      return arr;
    });
  }

  // Submit assignment
  const createMutation = useMutation({
    mutationFn: async () => {
      const body = {
        source,
        sheet,
        projectId,
        account: task?.account || "",
        taskDetails: {
          source, sheet, projectId,
          account: task?.account,
          deadline: task?.deadline,
          total: task?.total,
          wwc: task?.wwc,
          revType: task?.revType,
        },
        assignmentType,
        role,
        freelancers: selectedFreelancers.map(f => ({
          resourceCode: f.resourceCode,
          fullName: f.fullName,
          email: f.email,
        })),
        autoAssignReviewer: autoReviewer,
        clientBaseUrl: window.location.href.split("#")[0].replace(/\/$/, ""),
        apiBaseUrl: getPublicApiBase(),
      };
      const res = await apiRequest("POST", "/api/assignments", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      toast({ title: "Task assigned", description: "Emails sent." });
      setLocation("/");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (!task && tasks) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Task not found</p>
          <Button variant="outline" onClick={() => setLocation("/")}>Go back</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-30">
        <div className="max-w-[1200px] mx-auto px-4 h-14 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/")} data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <span className="font-semibold text-sm text-foreground" data-testid="text-assign-title">Assign Task</span>
            {task && (
              <span className="text-xs text-muted-foreground ml-2">
                {task.projectId} — {task.source} / {task.sheet}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Task details + Config */}
          <div className="space-y-4">
            {/* Task Info */}
            <Card className="border border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Task Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {task ? (
                  <>
                    <Row label="Project ID" value={task.projectId} testId="text-task-project-id" />
                    <Row label="Source" value={`${task.source} / ${task.sheet}`} />
                    <Row label="Account" value={task.account} />
                    <Row label="Deadline" value={task.deadline || "—"} />
                    <Row label="Total / WWC" value={`${task.total} / ${task.wwc}`} />
                    <Row label="Translator" value={task.translator || "Unassigned"} />
                    <Row label="Reviewer" value={task.reviewer || "Unassigned"} />
                  </>
                ) : (
                  <Skeleton className="h-32 w-full" />
                )}
              </CardContent>
            </Card>

            {/* Assignment Config */}
            <Card className="border border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Assignment Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Role</label>
                  <Select value={role} onValueChange={(v: any) => setRole(v)}>
                    <SelectTrigger data-testid="select-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="translator">Translator</SelectItem>
                      <SelectItem value="reviewer">Reviewer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Assignment Type</label>
                  <Select value={assignmentType} onValueChange={(v: any) => { setAssignmentType(v); if (v === "direct") setSelectedFreelancers(prev => prev.slice(0, 1)); }}>
                    <SelectTrigger data-testid="select-assignment-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="direct">Direct Assignment</SelectItem>
                      <SelectItem value="sequence">Sequential</SelectItem>
                      <SelectItem value="broadcast">Broadcast</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    {assignmentType === "direct" && "Directly assigned to one person."}
                    {assignmentType === "sequence" && "Asked sequentially until someone accepts."}
                    {assignmentType === "broadcast" && "Sent to everyone at once, first to accept gets it."}
                  </p>
                </div>

                {role === "translator" && (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">Auto-assign Reviewer</p>
                      <p className="text-xs text-muted-foreground">Ask reviewer when translator completes</p>
                    </div>
                    <Switch checked={autoReviewer} onCheckedChange={setAutoReviewer} data-testid="switch-auto-reviewer" />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Selected Freelancers */}
            <Card className="border border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center justify-between">
                  <span>Selected Freelancers ({selectedFreelancers.length})</span>
                  {assignmentType === "sequence" && selectedFreelancers.length > 1 && (
                    <span className="text-xs font-normal text-muted-foreground">Use arrows to reorder</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedFreelancers.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4" data-testid="text-no-selected">
                    Select freelancers from the list
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {selectedFreelancers.map((f, idx) => (
                      <div key={f.resourceCode} className="flex items-center gap-2 bg-muted/50 rounded-md px-2.5 py-2" data-testid={`selected-freelancer-${f.resourceCode}`}>
                        {assignmentType === "sequence" && (
                          <span className="text-xs font-medium text-muted-foreground w-5 text-center">{idx + 1}</span>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{f.fullName}</p>
                          <p className="text-xs text-muted-foreground">{f.resourceCode} · {f.email}</p>
                        </div>
                        {assignmentType === "sequence" && selectedFreelancers.length > 1 && (
                          <div className="flex flex-col">
                            <button onClick={() => moveFreelancer(idx, "up")} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5">
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => moveFreelancer(idx, "down")} disabled={idx === selectedFreelancers.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5">
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                        <button onClick={() => removeFreelancer(f.resourceCode)} className="text-muted-foreground hover:text-destructive p-1" data-testid={`button-remove-${f.resourceCode}`}>
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Submit */}
            <Button
              className="w-full"
              size="lg"
              disabled={selectedFreelancers.length === 0 || createMutation.isPending}
              onClick={() => createMutation.mutate()}
              data-testid="button-submit-assignment"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Assign Task ({selectedFreelancers.length})
                </>
              )}
            </Button>
          </div>

          {/* Right: Freelancer list */}
          <div className="lg:col-span-2">
            <Card className="border border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">
                    Available Freelancers
                    {!freelancersLoading && filteredFreelancers && (
                      <span className="font-normal text-muted-foreground ml-1">({filteredFreelancers.length})</span>
                    )}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground">All statuses</label>
                    <Switch checked={showAllStatuses} onCheckedChange={setShowAllStatuses} data-testid="switch-all-statuses" />
                  </div>
                </div>
                <div className="relative mt-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, code, or email..."
                    value={freelancerSearch}
                    onChange={e => setFreelancerSearch(e.target.value)}
                    className="pl-10"
                    data-testid="input-freelancer-search"
                  />
                </div>
              </CardHeader>
              <CardContent>
                {freelancersLoading ? (
                  <div className="space-y-2">
                    {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
                  </div>
                ) : filteredFreelancers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No matching freelancers found for this source.
                  </p>
                ) : (
                  <div className="space-y-1 max-h-[600px] overflow-y-auto pr-1">
                    {filteredFreelancers.slice(0, 50).map(f => (
                      <div
                        key={f.resourceCode}
                        className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group"
                        onClick={() => addFreelancer(f)}
                        data-testid={`freelancer-row-${f.resourceCode}`}
                      >
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                          {f.fullName?.split(" ").map(n => n[0]).join("").slice(0, 2)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-foreground truncate">{f.fullName}</p>
                            <Badge
                              variant={f.status === "Approved" ? "secondary" : "destructive"}
                              className="text-[10px] px-1.5 py-0"
                            >
                              {f.status === "Approved" ? "Approved" : f.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {f.resourceCode} · {f.email}
                            {f.nativeLanguage ? ` · ${f.nativeLanguage}` : ""}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => { e.stopPropagation(); addFreelancer(f); }}
                          data-testid={`button-add-${f.resourceCode}`}
                        >
                          Select
                        </Button>
                      </div>
                    ))}
                    {filteredFreelancers.length > 50 && (
                      <p className="text-xs text-muted-foreground text-center py-2">
                        Showing first 50 of {filteredFreelancers.length} results
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

function Row({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground" data-testid={testId}>{value}</span>
    </div>
  );
}
