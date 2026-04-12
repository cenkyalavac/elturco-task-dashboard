import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, LayoutTemplate, Trash2, Edit2, Save, X } from "lucide-react";

const LANGUAGES = ["EN", "TR", "DE", "FR", "ES", "IT", "PT", "NL", "PL", "RU", "ZH", "JA", "KO", "AR", "SV", "DA", "FI", "NO", "CS", "HU", "RO"];

export default function SettingsProjectTemplatesPage() {
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", description: "", sourceLanguage: "", targetLanguages: [] as string[], serviceTypes: [] as string[], defaultInstructions: "", defaultDeadlineDays: "" });

  const { data, isLoading } = useQuery({ queryKey: ["/api/project-templates"] });
  const templates = (data as any)?.templates || [];

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/project-templates", {
        ...form,
        defaultDeadlineDays: form.defaultDeadlineDays ? +form.defaultDeadlineDays : undefined,
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/project-templates"] }); setShowCreate(false); resetForm(); toast({ title: "Template created" }); },
    onError: () => toast({ title: "Failed to create template", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingId) return;
      await apiRequest("PATCH", `/api/project-templates/${editingId}`, {
        ...form,
        defaultDeadlineDays: form.defaultDeadlineDays ? +form.defaultDeadlineDays : undefined,
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/project-templates"] }); setEditingId(null); resetForm(); toast({ title: "Template updated" }); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/project-templates/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/project-templates"] }); toast({ title: "Template deleted" }); },
  });

  function resetForm() { setForm({ name: "", description: "", sourceLanguage: "", targetLanguages: [], serviceTypes: [], defaultInstructions: "", defaultDeadlineDays: "" }); }

  function startEdit(t: any) {
    setEditingId(t.id);
    setForm({ name: t.name, description: t.description || "", sourceLanguage: t.sourceLanguage || "", targetLanguages: t.targetLanguages || [], serviceTypes: t.serviceTypes || [], defaultInstructions: t.defaultInstructions || "", defaultDeadlineDays: t.defaultDeadlineDays ? String(t.defaultDeadlineDays) : "" });
    setShowCreate(false);
  }

  const toggleLang = (lang: string) => {
    setForm(f => ({ ...f, targetLanguages: f.targetLanguages.includes(lang) ? f.targetLanguages.filter(l => l !== lang) : [...f.targetLanguages, lang] }));
  };

  const formUI = (
    <Card className="bg-[#0f1219] border-white/[0.06]">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-white/70">{editingId ? "Edit Template" : "Create Template"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-white/40 block mb-1">Template Name *</label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" placeholder="e.g., General Translation" />
          </div>
          <div>
            <label className="text-[11px] text-white/40 block mb-1">Default Deadline (days)</label>
            <Input type="number" value={form.defaultDeadlineDays} onChange={e => setForm(f => ({ ...f, defaultDeadlineDays: e.target.value }))} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" placeholder="e.g., 7" />
          </div>
        </div>
        <div>
          <label className="text-[11px] text-white/40 block mb-1">Description</label>
          <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-white/40 block mb-1">Source Language</label>
            <select value={form.sourceLanguage} onChange={e => setForm(f => ({ ...f, sourceLanguage: e.target.value }))} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-md px-3 py-2 text-sm text-white">
              <option value="">Select...</option>
              {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-white/40 block mb-1">Service Types (comma-separated)</label>
            <Input value={form.serviceTypes.join(", ")} onChange={e => setForm(f => ({ ...f, serviceTypes: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }))} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" placeholder="translation, editing" />
          </div>
        </div>
        <div>
          <label className="text-[11px] text-white/40 block mb-1">Target Languages</label>
          <div className="flex flex-wrap gap-1.5">
            {LANGUAGES.filter(l => l !== form.sourceLanguage).map(l => (
              <button key={l} onClick={() => toggleLang(l)} className={`px-2 py-0.5 rounded text-xs transition-colors ${form.targetLanguages.includes(l) ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "bg-white/[0.04] text-white/40 border border-white/[0.06] hover:bg-white/[0.08]"}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-[11px] text-white/40 block mb-1">Default Instructions</label>
          <Textarea value={form.defaultInstructions} onChange={e => setForm(f => ({ ...f, defaultInstructions: e.target.value }))} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" rows={3} />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={() => { setShowCreate(false); setEditingId(null); resetForm(); }}><X className="w-3.5 h-3.5 mr-1" />Cancel</Button>
          <Button size="sm" disabled={!form.name} onClick={() => editingId ? updateMutation.mutate() : createMutation.mutate()}>
            <Save className="w-3.5 h-3.5 mr-1" />{editingId ? "Update" : "Create"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2">
            <LayoutTemplate className="w-5 h-5 text-purple-400" /> Project Templates
          </h1>
          <p className="text-xs text-white/30 mt-1">Create reusable templates for recurring project types</p>
        </div>
        {!showCreate && !editingId && (
          <Button size="sm" onClick={() => { setShowCreate(true); resetForm(); }}>
            <Plus className="w-3.5 h-3.5 mr-1" /> New Template
          </Button>
        )}
      </div>

      {(showCreate || editingId) && formUI}

      {/* Template List */}
      <div className="space-y-3">
        {isLoading ? (
          [1, 2, 3].map(i => <div key={i} className="h-20 bg-white/[0.06] rounded-xl animate-pulse" />)
        ) : templates.length === 0 ? (
          <Card className="bg-[#0f1219] border-white/[0.06]">
            <CardContent className="text-center py-12">
              <LayoutTemplate className="w-8 h-8 text-white/10 mx-auto mb-2" />
              <p className="text-sm text-white/20">No templates yet. Create one to get started.</p>
            </CardContent>
          </Card>
        ) : templates.map((t: any) => (
          <Card key={t.id} className="bg-[#0f1219] border-white/[0.06]">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <LayoutTemplate className="w-5 h-5 text-purple-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-white font-medium">{t.name}</p>
                    {t.defaultDeadlineDays && <Badge variant="outline" className="text-[10px] text-white/30 border-white/10">{t.defaultDeadlineDays}d</Badge>}
                  </div>
                  {t.description && <p className="text-xs text-white/30 mt-0.5">{t.description}</p>}
                  <div className="flex gap-2 mt-1.5 text-[10px] text-white/20">
                    {t.sourceLanguage && <span>Source: {t.sourceLanguage}</span>}
                    {t.targetLanguages?.length > 0 && <span>Targets: {t.targetLanguages.join(", ")}</span>}
                    {t.serviceTypes?.length > 0 && <span>Services: {t.serviceTypes.join(", ")}</span>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => startEdit(t)}>
                    <Edit2 className="w-3 h-3" />
                  </Button>
                  <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={() => deleteMutation.mutate(t.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
