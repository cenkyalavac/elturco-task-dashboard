import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Save, Calendar, FolderKanban, Plus, Briefcase, DollarSign, Languages, Building2,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/20 text-green-400",
  completed: "bg-blue-500/20 text-blue-400",
  cancelled: "bg-red-500/20 text-red-400",
  on_hold: "bg-amber-500/20 text-amber-400",
  pending: "bg-zinc-500/20 text-zinc-400",
  in_progress: "bg-cyan-500/20 text-cyan-400",
  delivered: "bg-emerald-500/20 text-emerald-400",
};

export default function ProjectDetailPage() {
  const [, params] = useRoute("/projects/:id");
  const projectId = params?.id;
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [showAddJob, setShowAddJob] = useState(false);
  const [jobForm, setJobForm] = useState({ jobName: "", sourceLanguage: "", targetLanguage: "", serviceType: "translation" });

  const { data: project, isLoading } = useQuery({
    queryKey: ["/api/projects", projectId],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/projects/${projectId}`);
      return r.json();
    },
    enabled: !!projectId,
  });

  const jobsQuery = useQuery({
    queryKey: ["/api/projects", projectId, "jobs"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/projects/${projectId}/jobs`);
      return r.json().catch(() => []);
    },
    enabled: !!projectId,
  });

  const updateMutation = useMutation({
    mutationFn: async (body: any) => {
      const r = await apiRequest("PATCH", `/api/projects/${projectId}`, body);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      setEditing(false);
      toast({ title: "Project updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addJobMutation = useMutation({
    mutationFn: async (body: any) => {
      const r = await apiRequest("POST", `/api/projects/${projectId}/jobs`, body);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "jobs"] });
      setShowAddJob(false);
      setJobForm({ jobName: "", sourceLanguage: "", targetLanguage: "", serviceType: "translation" });
      toast({ title: "Job added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="p-6"><Skeleton className="h-64 w-full bg-white/[0.04] rounded-lg" /></div>;
  if (!project) return <div className="p-6 text-white/30">Project not found</div>;

  const startEdit = () => { setForm({ ...project }); setEditing(true); };
  const jobs = jobsQuery.data || [];

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/projects">
          <button className="w-8 h-8 rounded-md flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.06]">
            <ArrowLeft className="w-4 h-4" />
          </button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-500/15 flex items-center justify-center text-purple-400 text-sm font-bold">
              <FolderKanban className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">{project.projectName}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                {project.projectCode && <span className="text-[10px] text-white/25 font-mono">{project.projectCode}</span>}
                <Badge className={`text-[10px] ${STATUS_COLORS[project.status] || "bg-zinc-500/20 text-zinc-400"}`}>{project.status}</Badge>
                {project.source && <span className="text-[10px] text-white/25">{project.source}</span>}
              </div>
            </div>
          </div>
        </div>
        {!editing ? (
          <Button size="sm" variant="outline" onClick={startEdit} className="text-xs">Edit</Button>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="text-xs text-white/50">Cancel</Button>
            <Button size="sm" onClick={() => updateMutation.mutate(form)} disabled={updateMutation.isPending} className="bg-blue-600 hover:bg-blue-700 text-white text-xs">
              <Save className="w-3 h-3 mr-1" />Save
            </Button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Jobs" value={jobs.length} />
        <StatCard label="Revenue" value={jobs.reduce((s: number, j: any) => s + Number(j.totalRevenue || 0), 0).toLocaleString("en", { style: "currency", currency: project.currency || "EUR" })} />
        <StatCard label="Cost" value={jobs.reduce((s: number, j: any) => s + Number(j.totalCost || 0), 0).toLocaleString("en", { style: "currency", currency: project.currency || "EUR" })} />
        <StatCard label="Deadline" value={project.deadline ? new Date(project.deadline).toLocaleDateString() : "N/A"} />
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-white/[0.04] border border-white/[0.06]">
          <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
          <TabsTrigger value="jobs" className="text-xs">Jobs ({jobs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-medium text-white/70">Details</h3>
              {editing ? (
                <div className="space-y-2">
                  <FieldEdit label="Project Name" value={form.projectName} onChange={v => setForm((p: any) => ({ ...p, projectName: v }))} />
                  <div>
                    <label className="text-[11px] text-white/40 block mb-0.5">Status</label>
                    <Select value={form.status} onValueChange={v => setForm((p: any) => ({ ...p, status: v }))}>
                      <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["active", "completed", "on_hold", "cancelled"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <FieldEdit label="Source" value={form.source || ""} onChange={v => setForm((p: any) => ({ ...p, source: v }))} />
                </div>
              ) : (
                <div className="space-y-2">
                  {project.customerName && <InfoRow icon={<Building2 className="w-3 h-3" />} label="Customer" value={project.customerName} />}
                  <InfoRow icon={<FolderKanban className="w-3 h-3" />} label="Status" value={project.status} />
                  {project.source && <InfoRow icon={<Briefcase className="w-3 h-3" />} label="Source" value={project.source} />}
                  {project.currency && <InfoRow icon={<DollarSign className="w-3 h-3" />} label="Currency" value={project.currency} />}
                  {project.deadline && <InfoRow icon={<Calendar className="w-3 h-3" />} label="Deadline" value={new Date(project.deadline).toLocaleDateString()} />}
                  {project.notes && <div className="text-xs text-white/30 mt-2 whitespace-pre-wrap">{project.notes}</div>}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="jobs" className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-white/70">Jobs</h3>
            <Button size="sm" onClick={() => setShowAddJob(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-xs">
              <Plus className="w-3 h-3 mr-1" />Add Job
            </Button>
          </div>
          {jobsQuery.isLoading ? (
            <Skeleton className="h-20 bg-white/[0.04] rounded" />
          ) : jobs.length === 0 ? (
            <p className="text-xs text-white/20 text-center py-8">No jobs yet</p>
          ) : (
            <div className="space-y-1.5">
              {jobs.map((j: any) => (
                <div key={j.id} className="flex items-center gap-3 px-4 py-3 bg-white/[0.02] border border-white/[0.06] rounded-lg">
                  <Briefcase className="w-4 h-4 text-white/20 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{j.jobName || `Job #${j.id}`}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-white/30">
                      {j.sourceLanguage && j.targetLanguage && (
                        <span className="flex items-center gap-1"><Languages className="w-3 h-3" />{j.sourceLanguage} → {j.targetLanguage}</span>
                      )}
                      {j.serviceType && <span>{j.serviceType}</span>}
                      {j.unitCount && <span>{j.unitCount} {j.unitType || "words"}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {j.totalRevenue && <span className="text-[11px] text-emerald-400">{Number(j.totalRevenue).toFixed(2)}</span>}
                    <Badge className={`text-[10px] ${STATUS_COLORS[j.status] || "bg-zinc-500/20 text-zinc-400"}`}>{j.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Add Job Dialog */}
      <Dialog open={showAddJob} onOpenChange={setShowAddJob}>
        <DialogContent className="bg-[#1a1d27] border-white/[0.08] text-white">
          <DialogHeader><DialogTitle>Add Job</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <FieldEdit label="Job Name" value={jobForm.jobName} onChange={v => setJobForm(p => ({ ...p, jobName: v }))} />
            <div className="grid grid-cols-2 gap-3">
              <FieldEdit label="Source Language" value={jobForm.sourceLanguage} onChange={v => setJobForm(p => ({ ...p, sourceLanguage: v }))} />
              <FieldEdit label="Target Language" value={jobForm.targetLanguage} onChange={v => setJobForm(p => ({ ...p, targetLanguage: v }))} />
            </div>
            <div>
              <label className="text-[11px] text-white/40 block mb-0.5">Service Type</label>
              <Select value={jobForm.serviceType} onValueChange={v => setJobForm(p => ({ ...p, serviceType: v }))}>
                <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="translation">Translation</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                  <SelectItem value="proofreading">Proofreading</SelectItem>
                  <SelectItem value="mtpe">MTPE</SelectItem>
                  <SelectItem value="lqa">LQA</SelectItem>
                  <SelectItem value="transcreation">Transcreation</SelectItem>
                  <SelectItem value="dtp">DTP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddJob(false)} className="text-white/50 text-xs">Cancel</Button>
            <Button onClick={() => addJobMutation.mutate(jobForm)} disabled={addJobMutation.isPending} className="bg-blue-600 hover:bg-blue-700 text-white text-xs">
              {addJobMutation.isPending ? "Adding..." : "Add Job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-white/20">{icon}</span>
      <span className="text-white/30 w-16">{label}</span>
      <span className="text-white/60">{value}</span>
    </div>
  );
}

function FieldEdit({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[11px] text-white/40 block mb-0.5">{label}</label>
      <Input value={value} onChange={e => onChange(e.target.value)} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3 text-center">
      <p className="text-[10px] text-white/30 mb-1">{label}</p>
      <p className="text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
