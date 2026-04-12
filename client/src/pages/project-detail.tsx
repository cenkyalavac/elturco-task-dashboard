import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Save, Calendar, FolderKanban, Plus, Briefcase, DollarSign,
  Building2, Edit2, ChevronDown, ChevronRight, ExternalLink, Check,
  FileText, Upload, TrendingUp, Hash, Clock, User, Tag, Globe, Trash2,
} from "lucide-react";

interface ProjectDetail {
  id: number;
  entityId: number | null;
  customerId: number;
  customerName?: string;
  subAccountId: number | null;
  projectCode: string | null;
  projectName: string;
  source: string | null;
  externalId: string | null;
  externalUrl: string | null;
  pmId: number | null;
  status: string;
  currency: string | null;
  startDate: string | null;
  deadline: string | null;
  completedAt: string | null;
  notes: string | null;
  tags: string[] | null;
  createdAt: string;
  updatedAt: string;
}

interface Job {
  id: number;
  projectId: number;
  jobCode: string | null;
  jobName: string | null;
  sourceLanguage: string | null;
  targetLanguage: string | null;
  serviceType: string | null;
  unitType: string | null;
  unitCount: string | null;
  unitRate: string | null;
  totalRevenue: string | null;
  totalCost: string | null;
  status: string;
  deadline: string | null;
  vendorId: number | null;
  vendorName?: string;
  notes: string | null;
  catAnalysis: any | null;
  createdAt: string;
}

interface Vendor { id: number; name: string; }
interface UserRecord { id: number; name: string; email: string; }
interface Customer { id: number; name: string; }

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  completed: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  invoiced: "bg-purple-500/15 text-purple-400 border-purple-500/25",
  cancelled: "bg-red-500/15 text-red-400 border-red-500/25",
  on_hold: "bg-amber-500/15 text-amber-400 border-amber-500/25",
};

const JOB_STATUS_COLORS: Record<string, string> = {
  pending: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
  in_progress: "bg-cyan-500/15 text-cyan-400 border-cyan-500/25",
  completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  delivered: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  cancelled: "bg-red-500/15 text-red-400 border-red-500/25",
};

const PROJECT_STATUSES = ["active", "completed", "on_hold", "cancelled", "invoiced"];
const SOURCES = ["Manual", "Symfonie", "APS", "Junction", "XTRF", "Plunet"];
const SERVICE_TYPES = ["Translation", "MTPE", "Review", "LQA", "Proofreading", "Subtitling", "DTP", "TEP"];
const UNIT_TYPES = ["words", "hours", "pages", "minutes", "characters", "days"];
const LANGUAGES = [
  "EN", "TR", "DE", "FR", "ES", "IT", "PT", "NL", "PL", "RU",
  "ZH", "JA", "KO", "AR", "SV", "DA", "FI", "NO", "CS", "HU",
  "RO", "BG", "HR", "SK", "SL", "EL", "UK", "TH", "VI", "ID",
  "MS", "HI", "BN", "HE", "FA",
];

const CAT_KEYS = [
  { key: "repetitions", label: "Repetitions" },
  { key: "match100", label: "100% Match" },
  { key: "match9599", label: "95-99%" },
  { key: "match8594", label: "85-94%" },
  { key: "match7584", label: "75-84%" },
  { key: "match5074", label: "50-74%" },
  { key: "noMatch", label: "No Match" },
  { key: "mt", label: "MT" },
];

const EMPTY_CAT: Record<string, number> = {
  repetitions: 0, match100: 0, match9599: 0, match8594: 0,
  match7584: 0, match5074: 0, noMatch: 0, mt: 0,
};

function formatCurrency(amount: string | number | null, currency: string = "EUR"): string {
  if (!amount && amount !== 0) return "\u2014";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "\u2014";
  const symbol = currency === "GBP" ? "\u00a3" : currency === "EUR" ? "\u20ac" : "$";
  return `${symbol}${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: string | null): string {
  if (!d) return "\u2014";
  try { return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); } catch { return d; }
}

interface JobFormState {
  jobName: string;
  sourceLanguage: string;
  targetLanguage: string;
  serviceType: string;
  unitType: string;
  unitCount: string;
  unitRate: string;
  totalRevenue: string;
  vendorId: string;
  deadline: string;
  notes: string;
  catAnalysis: Record<string, number>;
}

const defaultJobForm: JobFormState = {
  jobName: "", sourceLanguage: "", targetLanguage: "", serviceType: "",
  unitType: "words", unitCount: "", unitRate: "", totalRevenue: "",
  vendorId: "", deadline: "", notes: "", catAnalysis: { ...EMPTY_CAT },
};

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id;
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<ProjectDetail>>({});
  const [showAddJob, setShowAddJob] = useState(false);
  const [showEditJob, setShowEditJob] = useState(false);
  const [editingJobId, setEditingJobId] = useState<number | null>(null);
  const [jobForm, setJobForm] = useState<JobFormState>({ ...defaultJobForm });
  const [editJobForm, setEditJobForm] = useState<JobFormState>({ ...defaultJobForm });
  const [showCatAnalysis, setShowCatAnalysis] = useState(false);
  const [showEditCatAnalysis, setShowEditCatAnalysis] = useState(false);
  const [expandedJob, setExpandedJob] = useState<number | null>(null);

  // Queries
  const { data: project, isLoading } = useQuery<ProjectDetail>({
    queryKey: ["/api/projects", projectId],
    queryFn: async () => { const r = await apiRequest("GET", `/api/projects/${projectId}`); return r.json(); },
    enabled: !!projectId,
  });
  const jobsQuery = useQuery<Job[]>({
    queryKey: ["/api/projects", projectId, "jobs"],
    queryFn: async () => { const r = await apiRequest("GET", `/api/projects/${projectId}/jobs`); return r.json().catch(() => []); },
    enabled: !!projectId,
  });
  const vendorsQuery = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/vendors"); const json = await r.json().catch(() => []); return json.data ?? json; },
  });
  const usersQuery = useQuery<UserRecord[]>({
    queryKey: ["/api/users"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/users"); return r.json().catch(() => []); },
  });
  const customersQuery = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/customers");
      const data = await r.json();
      return Array.isArray(data) ? data : data?.data || data?.customers || [];
    },
  });

  // Mutations
  const updateMutation = useMutation({
    mutationFn: async (body: Partial<ProjectDetail>) => { const r = await apiRequest("PATCH", `/api/projects/${projectId}`, body); return r.json(); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setEditing(false);
      toast({ title: "Project updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: async (status: string) => { const r = await apiRequest("PATCH", `/api/projects/${projectId}`, { status }); return r.json(); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Status updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addJobMutation = useMutation({
    mutationFn: async (body: any) => { const r = await apiRequest("POST", `/api/projects/${projectId}/jobs`, body); return r.json(); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "jobs"] });
      setShowAddJob(false);
      setJobForm({ ...defaultJobForm });
      setShowCatAnalysis(false);
      toast({ title: "Job added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteJobMutation = useMutation({
    mutationFn: async (jobId: number) => { const r = await apiRequest("DELETE", `/api/projects/${projectId}/jobs/${jobId}`); return r.json(); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "jobs"] });
      toast({ title: "Job deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const editJobMutation = useMutation({
    mutationFn: async ({ jobId, body }: { jobId: number; body: any }) => { const r = await apiRequest("PATCH", `/api/projects/${projectId}/jobs/${jobId}`, body); return r.json(); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "jobs"] });
      setShowEditJob(false);
      setEditingJobId(null);
      setEditJobForm({ ...defaultJobForm });
      toast({ title: "Job updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Derived data
  const jobs: Job[] = jobsQuery.data || [];
  const vendors: Vendor[] = vendorsQuery.data || [];
  const users: UserRecord[] = usersQuery.data || [];
  const customers: Customer[] = customersQuery.data || [];

  const financials = useMemo(() => {
    const totalRevenue = jobs.reduce((s, j) => s + Number(j.totalRevenue || 0), 0);
    const totalCost = jobs.reduce((s, j) => s + Number(j.totalCost || 0), 0);
    const margin = totalRevenue - totalCost;
    const marginPct = totalRevenue > 0 ? (margin / totalRevenue) * 100 : 0;
    return { totalRevenue, totalCost, margin, marginPct };
  }, [jobs]);

  const jobRevenueCalc = useMemo(() => {
    return (parseFloat(jobForm.unitCount) || 0) * (parseFloat(jobForm.unitRate) || 0);
  }, [jobForm.unitCount, jobForm.unitRate]);

  // Helpers
  const startEdit = () => { setForm({ ...project }); setEditing(true); };
  const saveEdit = () => { updateMutation.mutate(form); };
  const setFormField = (key: keyof ProjectDetail, value: any) => { setForm((prev) => ({ ...prev, [key]: value })); };
  const setJobFormField = (key: keyof JobFormState, value: any) => { setJobForm((prev) => ({ ...prev, [key]: value })); };
  const setCatField = (key: string, value: number) => { setJobForm((prev) => ({ ...prev, catAnalysis: { ...prev.catAnalysis, [key]: value } })); };
  const setEditJobFormField = (key: keyof JobFormState, value: any) => { setEditJobForm((prev) => ({ ...prev, [key]: value })); };
  const setEditCatField = (key: string, value: number) => { setEditJobForm((prev) => ({ ...prev, catAnalysis: { ...prev.catAnalysis, [key]: value } })); };

  const handleAddJob = () => {
    const autoRevenue = jobRevenueCalc > 0 ? jobRevenueCalc.toFixed(2) : null;
    const manualRevenue = jobForm.totalRevenue ? jobForm.totalRevenue : null;
    const payload: any = {
      jobName: jobForm.jobName || null,
      sourceLanguage: jobForm.sourceLanguage || null,
      targetLanguage: jobForm.targetLanguage || null,
      serviceType: jobForm.serviceType || null,
      unitType: jobForm.unitType || null,
      unitCount: jobForm.unitCount || null,
      unitRate: jobForm.unitRate || null,
      totalRevenue: manualRevenue || autoRevenue,
      vendorId: jobForm.vendorId ? parseInt(jobForm.vendorId) : null,
      deadline: jobForm.deadline || null,
      notes: jobForm.notes || null,
    };
    const hasCat = Object.values(jobForm.catAnalysis).some((v) => v > 0);
    if (hasCat) payload.catAnalysis = jobForm.catAnalysis;
    addJobMutation.mutate(payload);
  };

  const startEditJob = (job: Job) => {
    setEditingJobId(job.id);
    setEditJobForm({
      jobName: job.jobName || "",
      sourceLanguage: job.sourceLanguage || "",
      targetLanguage: job.targetLanguage || "",
      serviceType: job.serviceType || "",
      unitType: job.unitType || "words",
      unitCount: job.unitCount || "",
      unitRate: job.unitRate || "",
      totalRevenue: job.totalRevenue || "",
      vendorId: job.vendorId ? String(job.vendorId) : "",
      deadline: job.deadline ? job.deadline.slice(0, 16) : "",
      notes: job.notes || "",
      catAnalysis: job.catAnalysis ? { ...EMPTY_CAT, ...job.catAnalysis } : { ...EMPTY_CAT },
    });
    setShowEditCatAnalysis(job.catAnalysis ? Object.values(job.catAnalysis).some((v: any) => Number(v) > 0) : false);
    setShowEditJob(true);
  };

  const editJobRevenueCalc = useMemo(() => {
    return (parseFloat(editJobForm.unitCount) || 0) * (parseFloat(editJobForm.unitRate) || 0);
  }, [editJobForm.unitCount, editJobForm.unitRate]);

  const handleEditJob = () => {
    if (!editingJobId) return;
    const autoRevenue = editJobRevenueCalc > 0 ? editJobRevenueCalc.toFixed(2) : null;
    const manualRevenue = editJobForm.totalRevenue ? editJobForm.totalRevenue : null;
    const payload: any = {
      jobName: editJobForm.jobName || null,
      sourceLanguage: editJobForm.sourceLanguage || null,
      targetLanguage: editJobForm.targetLanguage || null,
      serviceType: editJobForm.serviceType || null,
      unitType: editJobForm.unitType || null,
      unitCount: editJobForm.unitCount || null,
      unitRate: editJobForm.unitRate || null,
      totalRevenue: manualRevenue || autoRevenue,
      vendorId: editJobForm.vendorId ? parseInt(editJobForm.vendorId) : null,
      deadline: editJobForm.deadline || null,
      notes: editJobForm.notes || null,
    };
    const hasCatEdit = Object.values(editJobForm.catAnalysis).some((v) => v > 0);
    if (hasCatEdit) payload.catAnalysis = editJobForm.catAnalysis;
    editJobMutation.mutate({ jobId: editingJobId, body: payload });
  };

  // Loading / Not found
  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-6xl">
        <Skeleton className="h-12 w-72 bg-white/[0.04] rounded-lg" />
        <Skeleton className="h-64 w-full bg-white/[0.04] rounded-lg" />
      </div>
    );
  }
  if (!project) {
    return (
      <div className="p-6 text-white/30">
        Project not found. <Link href="/projects" className="text-blue-400 underline">Back to projects</Link>
      </div>
    );
  }

  const currency = project.currency || "EUR";
  const pmUser = users.find((u) => u.id === project.pmId);

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-6xl">
      {/* HEADER */}
      <div className="flex items-center gap-3">
        <Link href="/projects">
          <button className="w-8 h-8 rounded-md flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.06] transition">
            <ArrowLeft className="w-4 h-4" />
          </button>
        </Link>
        <div className="w-10 h-10 rounded-full bg-purple-500/15 flex items-center justify-center text-purple-400 shrink-0">
          <FolderKanban className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold text-white truncate">{project.projectName}</h1>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {project.projectCode && <span className="text-[10px] text-white/25 font-mono">{project.projectCode}</span>}
            {project.customerName && (
              <Link href={`/customers/${project.customerId}`}>
                <span className="text-[10px] text-blue-400 hover:text-blue-300 cursor-pointer">{project.customerName}</span>
              </Link>
            )}
            <Badge className={`text-[10px] border ${STATUS_COLORS[project.status] || "bg-zinc-500/15 text-zinc-400 border-zinc-500/25"}`}>
              {project.status.replace(/_/g, " ")}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {project.status === "active" && (
            <Button size="sm" className="text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1" onClick={() => statusMutation.mutate("completed")} disabled={statusMutation.isPending}>
              <Check className="w-3 h-3" /> Mark Complete
            </Button>
          )}
          {project.status === "completed" && (
            <Button size="sm" className="text-xs bg-purple-600 hover:bg-purple-700 text-white gap-1" onClick={() => statusMutation.mutate("invoiced")} disabled={statusMutation.isPending}>
              <FileText className="w-3 h-3" /> Mark Invoiced
            </Button>
          )}
          {(project.status === "on_hold" || project.status === "cancelled") && (
            <Button size="sm" className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1" onClick={() => statusMutation.mutate("active")} disabled={statusMutation.isPending}>
              Reactivate
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="text-xs">Status <ChevronDown className="w-3 h-3 ml-1" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {PROJECT_STATUSES.map((s) => (
                <DropdownMenuItem key={s} onClick={() => statusMutation.mutate(s)} className="text-xs capitalize">{s.replace(/_/g, " ")}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {!editing ? (
            <Button size="sm" variant="outline" onClick={startEdit} className="text-xs"><Edit2 className="w-3 h-3 mr-1" />Edit</Button>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="text-xs text-white/50">Cancel</Button>
              <Button size="sm" onClick={saveEdit} disabled={updateMutation.isPending} className="bg-blue-600 hover:bg-blue-700 text-white text-xs">
                <Save className="w-3 h-3 mr-1" />{updateMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* TABS */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-white/[0.04] border border-white/[0.06]">
          <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
          <TabsTrigger value="jobs" className="text-xs">Jobs ({jobs.length})</TabsTrigger>
          <TabsTrigger value="financials" className="text-xs">Financials</TabsTrigger>
          <TabsTrigger value="files" className="text-xs">Files</TabsTrigger>
        </TabsList>

        {/* TAB: OVERVIEW */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Project Info */}
            <Card className="bg-white/[0.03] border-white/[0.06]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2"><FolderKanban className="w-3.5 h-3.5" /> Project Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
              {editing ? (
                <div className="space-y-2">
                  <FieldEdit label="Project Name" value={form.projectName || ""} onChange={(v) => setFormField("projectName", v)} />
                  <FieldEdit label="Project Code" value={form.projectCode || ""} onChange={(v) => setFormField("projectCode", v)} />
                  <div>
                    <label className="text-[11px] text-white/40 block mb-0.5">Source</label>
                    <Select value={form.source || ""} onValueChange={(v) => setFormField("source", v)}>
                      <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm"><SelectValue placeholder="Select source" /></SelectTrigger>
                      <SelectContent>{SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <FieldEdit label="External ID" value={form.externalId || ""} onChange={(v) => setFormField("externalId", v)} />
                  <FieldEdit label="External URL" value={form.externalUrl || ""} onChange={(v) => setFormField("externalUrl", v)} />
                </div>
              ) : (
                <div className="space-y-2">
                  <InfoRow icon={<FolderKanban className="w-3 h-3" />} label="Name" value={project.projectName} />
                  {project.projectCode && <InfoRow icon={<Hash className="w-3 h-3" />} label="Code" value={project.projectCode} mono />}
                  {project.source && <InfoRow icon={<Globe className="w-3 h-3" />} label="Source" value={project.source} />}
                  {project.externalId && <InfoRow icon={<Hash className="w-3 h-3" />} label="External ID" value={project.externalId} mono />}
                  {project.externalUrl && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-white/20"><ExternalLink className="w-3 h-3" /></span>
                      <span className="text-white/30 w-20">Ext. URL</span>
                      <a href={project.externalUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 truncate">{project.externalUrl}</a>
                    </div>
                  )}
                </div>
              )}
              </CardContent>
            </Card>

            {/* Client Info */}
            <Card className="bg-white/[0.03] border-white/[0.06]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2"><Building2 className="w-3.5 h-3.5" /> Client Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
              {editing ? (
                <div className="space-y-2">
                  <div>
                    <label className="text-[11px] text-white/40 block mb-0.5">Customer</label>
                    <Select value={String(form.customerId || "")} onValueChange={(v) => setFormField("customerId", parseInt(v))}>
                      <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm"><SelectValue placeholder="Select customer" /></SelectTrigger>
                      <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <FieldEdit label="Sub-account ID" value={form.subAccountId != null ? String(form.subAccountId) : ""} onChange={(v) => setFormField("subAccountId", v ? parseInt(v) : null)} />
                  <div>
                    <label className="text-[11px] text-white/40 block mb-0.5">Project Manager</label>
                    <Select value={form.pmId ? String(form.pmId) : "none"} onValueChange={(v) => setFormField("pmId", v === "none" ? null : parseInt(v))}>
                      <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm"><SelectValue placeholder="Select PM" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {project.customerName && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-white/20"><Building2 className="w-3 h-3" /></span>
                      <span className="text-white/30 w-20">Customer</span>
                      <Link href={`/customers/${project.customerId}`}><span className="text-blue-400 hover:text-blue-300 cursor-pointer">{project.customerName}</span></Link>
                    </div>
                  )}
                  {project.subAccountId && <InfoRow icon={<Building2 className="w-3 h-3" />} label="Sub-acct" value={String(project.subAccountId)} />}
                  <InfoRow icon={<User className="w-3 h-3" />} label="PM" value={pmUser ? pmUser.name : (project.pmId ? `User #${project.pmId}` : "Unassigned")} />
                </div>
              )}
              </CardContent>
            </Card>

            {/* Dates */}
            <Card className="bg-white/[0.03] border-white/[0.06]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /> Dates</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
              {editing ? (
                <div className="space-y-2">
                  <div>
                    <label className="text-[11px] text-white/40 block mb-0.5">Start Date</label>
                    <Input type="date" value={form.startDate?.split("T")[0] || ""} onChange={(e) => setFormField("startDate", e.target.value || null)} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" />
                  </div>
                  <div>
                    <label className="text-[11px] text-white/40 block mb-0.5">Deadline</label>
                    <Input type="date" value={form.deadline?.split("T")[0] || ""} onChange={(e) => setFormField("deadline", e.target.value || null)} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" />
                  </div>
                  <div>
                    <label className="text-[11px] text-white/40 block mb-0.5">Completed At</label>
                    <Input type="date" value={form.completedAt?.split("T")[0] || ""} onChange={(e) => setFormField("completedAt", e.target.value || null)} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <InfoRow icon={<Calendar className="w-3 h-3" />} label="Start" value={formatDate(project.startDate)} />
                  <InfoRow icon={<Clock className="w-3 h-3" />} label="Deadline" value={formatDate(project.deadline)} />
                  <InfoRow icon={<Calendar className="w-3 h-3" />} label="Completed" value={formatDate(project.completedAt)} />
                </div>
              )}
              </CardContent>
            </Card>

            {/* Details: Status, Currency, Notes, Tags */}
            <Card className="bg-white/[0.03] border-white/[0.06]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2"><Briefcase className="w-3.5 h-3.5" /> Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
              {editing ? (
                <div className="space-y-2">
                  <div>
                    <label className="text-[11px] text-white/40 block mb-0.5">Status</label>
                    <Select value={form.status || "active"} onValueChange={(v) => setFormField("status", v)}>
                      <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>{PROJECT_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <FieldEdit label="Currency" value={form.currency || ""} onChange={(v) => setFormField("currency", v)} />
                  <div>
                    <label className="text-[11px] text-white/40 block mb-0.5">Notes</label>
                    <Textarea value={form.notes || ""} onChange={(e) => setFormField("notes", e.target.value)} rows={3} className="bg-white/[0.04] border-white/[0.08] text-white text-sm resize-none" />
                  </div>
                  <FieldEdit label="Tags (comma-separated)" value={(form.tags || []).join(", ")} onChange={(v) => setFormField("tags", v.split(",").map((t) => t.trim()).filter(Boolean))} />
                </div>
              ) : (
                <div className="space-y-2">
                  <InfoRow icon={<Briefcase className="w-3 h-3" />} label="Status" value={project.status.replace(/_/g, " ")} />
                  <InfoRow icon={<DollarSign className="w-3 h-3" />} label="Currency" value={currency} />
                  {project.notes && (
                    <div className="mt-2">
                      <p className="text-[11px] text-white/30 mb-1">Notes</p>
                      <p className="text-xs text-white/50 whitespace-pre-wrap">{project.notes}</p>
                    </div>
                  )}
                  {project.tags && project.tags.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap mt-2">
                      <Tag className="w-3 h-3 text-white/20" />
                      {project.tags.map((tag, i) => (
                        <Badge key={i} variant="secondary" className="text-[10px] bg-white/[0.06] text-white/50">{tag}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB: JOBS */}
        <TabsContent value="jobs" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-white/70">Jobs</h3>
            <Button size="sm" onClick={() => setShowAddJob(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-xs">
              <Plus className="w-3 h-3 mr-1" />Add Job
            </Button>
          </div>
          {jobsQuery.isLoading ? (
            <Skeleton className="h-32 bg-white/[0.04] rounded" />
          ) : jobs.length === 0 ? (
            <div className="text-center py-12">
              <Briefcase className="w-8 h-8 text-white/10 mx-auto mb-2" />
              <p className="text-xs text-white/20">No jobs yet. Add a job to get started.</p>
            </div>
          ) : (
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/[0.06] hover:bg-transparent">
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Code</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Name</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Lang Pair</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Service</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Unit Type</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Units</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3 text-right">Rate</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3 text-right">Revenue</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3 text-right">Cost</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Vendor</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Status</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Deadline</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3 w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => {
                    const isExpanded = expandedJob === job.id;
                    const hasCat = job.catAnalysis && Object.values(job.catAnalysis).some((v: any) => Number(v) > 0);
                    return (
                      <JobTableRows
                        key={job.id}
                        job={job}
                        currency={currency}
                        isExpanded={isExpanded}
                        hasCat={!!hasCat}
                        onToggle={() => hasCat && setExpandedJob(isExpanded ? null : job.id)}
                        onEdit={() => startEditJob(job)}
                        onDelete={() => deleteJobMutation.mutate(job.id)}
                      />
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* TAB: FINANCIALS */}
        <TabsContent value="financials" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card className="bg-white/[0.03] border-white/[0.06] border-l-4 border-l-emerald-500">
              <CardContent className="p-4 text-center">
                <p className="text-[10px] text-white/30 mb-1">Total Revenue</p>
                <p className="text-xl font-bold text-emerald-400">{formatCurrency(financials.totalRevenue, currency)}</p>
              </CardContent>
            </Card>
            <Card className="bg-white/[0.03] border-white/[0.06] border-l-4 border-l-red-500">
              <CardContent className="p-4 text-center">
                <p className="text-[10px] text-white/30 mb-1">Total Cost</p>
                <p className="text-xl font-bold text-orange-400">{formatCurrency(financials.totalCost, currency)}</p>
              </CardContent>
            </Card>
            <Card className="bg-white/[0.03] border-white/[0.06] border-l-4 border-l-blue-500">
              <CardContent className="p-4 text-center">
                <p className="text-[10px] text-white/30 mb-1">Margin</p>
                <p className={`text-xl font-bold ${financials.margin >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatCurrency(financials.margin, currency)}</p>
              </CardContent>
            </Card>
            <Card className="bg-white/[0.03] border-white/[0.06] border-l-4 border-l-blue-500">
              <CardContent className="p-4 text-center">
                <p className="text-[10px] text-white/30 mb-1">Margin %</p>
                <p className={`text-xl font-bold ${financials.marginPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>{financials.marginPct.toFixed(1)}%</p>
              </CardContent>
            </Card>
          </div>
          {jobs.length > 0 && (
            <Card className="bg-white/[0.03] border-white/[0.06] overflow-hidden">
              <CardHeader className="pb-0">
                <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2"><TrendingUp className="w-3.5 h-3.5" /> Jobs Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="p-0 pt-3">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/[0.06] hover:bg-transparent">
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Job</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3 text-right">Revenue</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3 text-right">Cost</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3 text-right">Margin</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3 text-right">Margin %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => {
                    const rev = Number(job.totalRevenue || 0);
                    const cost = Number(job.totalCost || 0);
                    const m = rev - cost;
                    const mp = rev > 0 ? (m / rev) * 100 : 0;
                    return (
                      <TableRow key={job.id} className="border-white/[0.06] hover:bg-white/[0.02]">
                        <TableCell className="text-xs text-white font-medium px-3 py-2">{job.jobName || job.jobCode || `Job #${job.id}`}</TableCell>
                        <TableCell className="text-[11px] text-emerald-400 px-3 py-2 text-right">{formatCurrency(rev, currency)}</TableCell>
                        <TableCell className="text-[11px] text-orange-400 px-3 py-2 text-right">{formatCurrency(cost, currency)}</TableCell>
                        <TableCell className={`text-[11px] px-3 py-2 text-right font-medium ${m >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatCurrency(m, currency)}</TableCell>
                        <TableCell className={`text-[11px] px-3 py-2 text-right ${mp >= 0 ? "text-emerald-400/70" : "text-red-400/70"}`}>{mp.toFixed(1)}%</TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="border-white/[0.06] bg-white/[0.02]">
                    <TableCell className="text-xs text-white/70 font-semibold px-3 py-2">Total</TableCell>
                    <TableCell className="text-xs text-emerald-400 font-semibold px-3 py-2 text-right">{formatCurrency(financials.totalRevenue, currency)}</TableCell>
                    <TableCell className="text-xs text-orange-400 font-semibold px-3 py-2 text-right">{formatCurrency(financials.totalCost, currency)}</TableCell>
                    <TableCell className={`text-xs font-semibold px-3 py-2 text-right ${financials.margin >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatCurrency(financials.margin, currency)}</TableCell>
                    <TableCell className={`text-xs px-3 py-2 text-right font-semibold ${financials.marginPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>{financials.marginPct.toFixed(1)}%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* TAB: FILES */}
        <TabsContent value="files" className="space-y-4">
          <Card className="bg-white/[0.03] border-white/[0.06]">
            <CardContent className="p-8 text-center">
              <Upload className="w-10 h-10 text-white/10 mx-auto mb-3" />
              <p className="text-sm text-white/30 mb-1">File management coming soon</p>
              <p className="text-xs text-white/15">Upload and manage project files here.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ADD JOB DIALOG */}
      <Dialog open={showAddJob} onOpenChange={setShowAddJob}>
        <DialogContent className="bg-[#1a1d27] border-white/[0.08] text-white max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base">Add Job</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <FieldEdit label="Job Name" value={jobForm.jobName} onChange={(v) => setJobFormField("jobName", v)} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-white/40 block mb-0.5">Source Language</label>
                <Select value={jobForm.sourceLanguage} onValueChange={(v) => setJobFormField("sourceLanguage", v)}>
                  <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>{LANGUAGES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[11px] text-white/40 block mb-0.5">Target Language</label>
                <Select value={jobForm.targetLanguage} onValueChange={(v) => setJobFormField("targetLanguage", v)}>
                  <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>{LANGUAGES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-white/40 block mb-0.5">Service Type</label>
                <Select value={jobForm.serviceType} onValueChange={(v) => setJobFormField("serviceType", v)}>
                  <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>{SERVICE_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[11px] text-white/40 block mb-0.5">Unit Type</label>
                <Select value={jobForm.unitType} onValueChange={(v) => setJobFormField("unitType", v)}>
                  <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{UNIT_TYPES.map((u) => <SelectItem key={u} value={u} className="capitalize">{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] text-white/40 block mb-0.5">Unit Count</label>
                <Input type="number" step="1" value={jobForm.unitCount} onChange={(e) => setJobFormField("unitCount", e.target.value)} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" placeholder="0" />
              </div>
              <div>
                <label className="text-[11px] text-white/40 block mb-0.5">Unit Rate (4 decimals)</label>
                <Input type="number" step="0.0001" value={jobForm.unitRate} onChange={(e) => setJobFormField("unitRate", e.target.value)} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" placeholder="0.0000" />
              </div>
              <div>
                <label className="text-[11px] text-white/40 block mb-0.5">Total Revenue</label>
                <Input
                  type="number"
                  step="0.01"
                  value={jobForm.totalRevenue || (jobRevenueCalc > 0 ? jobRevenueCalc.toFixed(2) : "")}
                  onChange={(e) => setJobFormField("totalRevenue", e.target.value)}
                  className="bg-white/[0.04] border-white/[0.08] text-white text-sm"
                  placeholder={jobRevenueCalc > 0 ? jobRevenueCalc.toFixed(2) : "Auto-calculated"}
                />
                {jobRevenueCalc > 0 && !jobForm.totalRevenue && (
                  <p className="text-[10px] text-emerald-400/60 mt-0.5">Auto: {formatCurrency(jobRevenueCalc, currency)}</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-white/40 block mb-0.5">Vendor</label>
                <Select value={jobForm.vendorId} onValueChange={(v) => setJobFormField("vendorId", v)}>
                  <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm"><SelectValue placeholder="Select vendor..." /></SelectTrigger>
                  <SelectContent>{vendors.map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[11px] text-white/40 block mb-0.5">Deadline</label>
                <Input type="datetime-local" value={jobForm.deadline} onChange={(e) => setJobFormField("deadline", e.target.value)} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" />
              </div>
            </div>
            <div>
              <label className="text-[11px] text-white/40 block mb-0.5">Notes</label>
              <Textarea value={jobForm.notes} onChange={(e) => setJobFormField("notes", e.target.value)} rows={2} className="bg-white/[0.04] border-white/[0.08] text-white text-sm resize-none" placeholder="Optional notes..." />
            </div>
            <Collapsible open={showCatAnalysis} onOpenChange={setShowCatAnalysis}>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-2 text-xs text-white/40 hover:text-white/60 transition w-full">
                  <ChevronRight className={`w-3 h-3 transition-transform ${showCatAnalysis ? "rotate-90" : ""}`} />
                  CAT Analysis (optional)
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {CAT_KEYS.map(({ key, label }) => (
                    <div key={key}>
                      <label className="text-[10px] text-white/30 block mb-0.5">{label}</label>
                      <Input type="number" step="1" min="0" value={jobForm.catAnalysis[key] || ""} onChange={(e) => setCatField(key, parseInt(e.target.value) || 0)} className="bg-white/[0.04] border-white/[0.08] text-white text-xs h-8" placeholder="0" />
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="ghost" onClick={() => { setShowAddJob(false); setJobForm({ ...defaultJobForm }); setShowCatAnalysis(false); }} className="text-white/50 text-xs">Cancel</Button>
            <Button onClick={handleAddJob} disabled={addJobMutation.isPending} className="bg-blue-600 hover:bg-blue-700 text-white text-xs">
              {addJobMutation.isPending ? "Adding..." : "Add Job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* EDIT JOB DIALOG */}
      <Dialog open={showEditJob} onOpenChange={(open) => { if (!open) { setShowEditJob(false); setEditingJobId(null); } }}>
        <DialogContent className="bg-[#1a1d27] border-white/[0.08] text-white max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base">Edit Job</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-[11px] text-white/40 block mb-0.5">Job Name</label>
              <Input value={editJobForm.jobName} onChange={(e) => setEditJobFormField("jobName", e.target.value)} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-white/40 block mb-0.5">Source Language</label>
                <Select value={editJobForm.sourceLanguage} onValueChange={(v) => setEditJobFormField("sourceLanguage", v)}>
                  <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>{LANGUAGES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[11px] text-white/40 block mb-0.5">Target Language</label>
                <Select value={editJobForm.targetLanguage} onValueChange={(v) => setEditJobFormField("targetLanguage", v)}>
                  <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>{LANGUAGES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-white/40 block mb-0.5">Service Type</label>
                <Select value={editJobForm.serviceType} onValueChange={(v) => setEditJobFormField("serviceType", v)}>
                  <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>{SERVICE_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[11px] text-white/40 block mb-0.5">Unit Type</label>
                <Select value={editJobForm.unitType} onValueChange={(v) => setEditJobFormField("unitType", v)}>
                  <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{UNIT_TYPES.map((u) => <SelectItem key={u} value={u} className="capitalize">{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] text-white/40 block mb-0.5">Unit Count</label>
                <Input type="number" step="1" value={editJobForm.unitCount} onChange={(e) => setEditJobFormField("unitCount", e.target.value)} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" placeholder="0" />
              </div>
              <div>
                <label className="text-[11px] text-white/40 block mb-0.5">Unit Rate</label>
                <Input type="number" step="0.0001" value={editJobForm.unitRate} onChange={(e) => setEditJobFormField("unitRate", e.target.value)} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" placeholder="0.0000" />
              </div>
              <div>
                <label className="text-[11px] text-white/40 block mb-0.5">Total Revenue</label>
                <Input type="number" step="0.01" value={editJobForm.totalRevenue || (editJobRevenueCalc > 0 ? editJobRevenueCalc.toFixed(2) : "")} onChange={(e) => setEditJobFormField("totalRevenue", e.target.value)} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" placeholder={editJobRevenueCalc > 0 ? editJobRevenueCalc.toFixed(2) : "Auto-calculated"} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-white/40 block mb-0.5">Vendor</label>
                <Select value={editJobForm.vendorId} onValueChange={(v) => setEditJobFormField("vendorId", v)}>
                  <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm"><SelectValue placeholder="Select vendor..." /></SelectTrigger>
                  <SelectContent>{vendors.map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[11px] text-white/40 block mb-0.5">Deadline</label>
                <Input type="datetime-local" value={editJobForm.deadline} onChange={(e) => setEditJobFormField("deadline", e.target.value)} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" />
              </div>
            </div>
            <div>
              <label className="text-[11px] text-white/40 block mb-0.5">Notes</label>
              <Textarea value={editJobForm.notes} onChange={(e) => setEditJobFormField("notes", e.target.value)} rows={2} className="bg-white/[0.04] border-white/[0.08] text-white text-sm resize-none" placeholder="Optional notes..." />
            </div>
            <Collapsible open={showEditCatAnalysis} onOpenChange={setShowEditCatAnalysis}>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-2 text-xs text-white/40 hover:text-white/60 transition w-full">
                  <ChevronRight className={`w-3 h-3 transition-transform ${showEditCatAnalysis ? "rotate-90" : ""}`} />
                  CAT Analysis (optional)
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {CAT_KEYS.map(({ key, label }) => (
                    <div key={key}>
                      <label className="text-[10px] text-white/30 block mb-0.5">{label}</label>
                      <Input type="number" step="1" min="0" value={editJobForm.catAnalysis[key] || ""} onChange={(e) => setEditCatField(key, parseInt(e.target.value) || 0)} className="bg-white/[0.04] border-white/[0.08] text-white text-xs h-8" placeholder="0" />
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="ghost" onClick={() => { setShowEditJob(false); setEditingJobId(null); }} className="text-white/50 text-xs">Cancel</Button>
            <Button onClick={handleEditJob} disabled={editJobMutation.isPending} className="bg-blue-600 hover:bg-blue-700 text-white text-xs">
              {editJobMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Extracted to a component to avoid React key issues with fragments in table rows
function JobTableRows({ job, currency, isExpanded, hasCat, onToggle, onEdit, onDelete }: {
  job: Job; currency: string; isExpanded: boolean; hasCat: boolean; onToggle: () => void; onEdit: () => void; onDelete: () => void;
}) {
  return (
    <>
      <TableRow className="border-white/[0.06] hover:bg-white/[0.02] cursor-pointer" onClick={onToggle}>
        <TableCell className="text-[11px] text-white/40 font-mono px-3 py-2">{job.jobCode || "\u2014"}</TableCell>
        <TableCell className="text-xs text-white font-medium px-3 py-2 max-w-[140px] truncate">{job.jobName || `Job #${job.id}`}</TableCell>
        <TableCell className="text-[11px] text-white/50 px-3 py-2">{job.sourceLanguage && job.targetLanguage ? `${job.sourceLanguage} > ${job.targetLanguage}` : "\u2014"}</TableCell>
        <TableCell className="text-[11px] text-white/50 px-3 py-2 capitalize">{job.serviceType || "\u2014"}</TableCell>
        <TableCell className="text-[11px] text-white/50 px-3 py-2 capitalize">{job.unitType || "\u2014"}</TableCell>
        <TableCell className="text-[11px] text-white/50 px-3 py-2">{job.unitCount || "\u2014"}</TableCell>
        <TableCell className="text-[11px] text-white/50 px-3 py-2 text-right">{job.unitRate ? Number(job.unitRate).toFixed(4) : "\u2014"}</TableCell>
        <TableCell className="text-[11px] text-emerald-400 px-3 py-2 text-right font-medium">{job.totalRevenue ? formatCurrency(Number(job.totalRevenue), currency) : "\u2014"}</TableCell>
        <TableCell className="text-[11px] text-orange-400 px-3 py-2 text-right font-medium">{job.totalCost ? formatCurrency(Number(job.totalCost), currency) : "\u2014"}</TableCell>
        <TableCell className="text-[11px] text-white/50 px-3 py-2">{job.vendorName || (job.vendorId ? `Vendor #${job.vendorId}` : "\u2014")}</TableCell>
        <TableCell className="px-3 py-2">
          <Badge className={`text-[10px] border ${JOB_STATUS_COLORS[job.status] || "bg-zinc-500/15 text-zinc-400 border-zinc-500/25"}`}>{job.status.replace(/_/g, " ")}</Badge>
        </TableCell>
        <TableCell className="text-[11px] text-white/40 px-3 py-2">{formatDate(job.deadline)}</TableCell>
        <TableCell className="px-3 py-2">
          <div className="flex items-center gap-1">
            {hasCat && <ChevronRight className={`w-3.5 h-3.5 text-white/20 transition-transform ${isExpanded ? "rotate-90" : ""}`} />}
            <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="p-1 rounded hover:bg-blue-500/10" title="Edit job">
              <Edit2 className="w-3 h-3 text-white/20 hover:text-blue-400" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-1 rounded hover:bg-red-500/10" title="Delete job">
              <Trash2 className="w-3 h-3 text-white/20 hover:text-red-400" />
            </button>
          </div>
        </TableCell>
      </TableRow>
      {isExpanded && hasCat && (
        <TableRow className="border-white/[0.06]">
          <TableCell colSpan={13} className="px-3 py-3 bg-white/[0.01]">
            <p className="text-[11px] text-white/40 mb-2 font-medium">CAT Analysis</p>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {CAT_KEYS.map(({ key, label }) => (
                <div key={key} className="text-center p-2 bg-white/[0.03] rounded">
                  <p className="text-[9px] text-white/30">{label}</p>
                  <p className="text-xs text-white/70 font-medium">{Number(job.catAnalysis?.[key] || 0).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function InfoRow({ icon, label, value, mono = false }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-white/20">{icon}</span>
      <span className="text-white/30 w-20 shrink-0">{label}</span>
      <span className={`text-white/60 truncate ${mono ? "font-mono text-[11px]" : ""}`}>{value}</span>
    </div>
  );
}

function FieldEdit({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[11px] text-white/40 block mb-0.5">{label}</label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" />
    </div>
  );
}
