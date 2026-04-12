import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Zap, Trash2, Edit2, Save, X } from "lucide-react";

const LANGUAGES = ["EN", "TR", "DE", "FR", "ES", "IT", "PT", "NL", "PL", "RU", "ZH", "JA", "KO", "AR", "SV", "DA", "FI", "NO"];

export default function SettingsAutoDispatchPage() {
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", description: "", sourceLanguage: "", targetLanguage: "", serviceType: "", preferredVendorId: "", minQualityScore: "", maxRate: "", priority: "0" });

  const { data, isLoading } = useQuery({ queryKey: ["/api/auto-dispatch-rules"] });
  const rules = (data as any)?.rules || [];

  const { data: vendorsData } = useQuery({
    queryKey: ["/api/vendors", { limit: 200 }],
    queryFn: async () => { const r = await apiRequest("GET", "/api/vendors?limit=200&status=Approved,Active"); return r.json(); },
    enabled: showCreate || !!editingId,
  });
  const vendorsList = (vendorsData as any)?.data || [];

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auto-dispatch-rules", {
        ...form,
        preferredVendorId: form.preferredVendorId ? +form.preferredVendorId : undefined,
        priority: +form.priority || 0,
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/auto-dispatch-rules"] }); setShowCreate(false); resetForm(); toast({ title: "Rule created" }); },
    onError: () => toast({ title: "Failed to create rule", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingId) return;
      await apiRequest("PATCH", `/api/auto-dispatch-rules/${editingId}`, {
        ...form,
        preferredVendorId: form.preferredVendorId ? +form.preferredVendorId : undefined,
        priority: +form.priority || 0,
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/auto-dispatch-rules"] }); setEditingId(null); resetForm(); toast({ title: "Rule updated" }); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/auto-dispatch-rules/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/auto-dispatch-rules"] }); toast({ title: "Rule deleted" }); },
  });

  function resetForm() { setForm({ name: "", description: "", sourceLanguage: "", targetLanguage: "", serviceType: "", preferredVendorId: "", minQualityScore: "", maxRate: "", priority: "0" }); }

  function startEdit(r: any) {
    setEditingId(r.id);
    setForm({ name: r.name, description: r.description || "", sourceLanguage: r.sourceLanguage || "", targetLanguage: r.targetLanguage || "", serviceType: r.serviceType || "", preferredVendorId: r.preferredVendorId ? String(r.preferredVendorId) : "", minQualityScore: r.minQualityScore || "", maxRate: r.maxRate || "", priority: String(r.priority || 0) });
    setShowCreate(false);
  }

  const formUI = (
    <Card className="bg-[#0f1219] border-white/[0.06]">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-white/70">{editingId ? "Edit Rule" : "Create Auto-Dispatch Rule"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-white/40 block mb-1">Rule Name *</label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" />
          </div>
          <div>
            <label className="text-[11px] text-white/40 block mb-1">Priority (higher = first)</label>
            <Input type="number" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" />
          </div>
        </div>
        <div>
          <label className="text-[11px] text-white/40 block mb-1">Description</label>
          <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] text-white/40 block mb-1">Source Language</label>
            <select value={form.sourceLanguage} onChange={e => setForm(f => ({ ...f, sourceLanguage: e.target.value }))} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-md px-3 py-2 text-sm text-white">
              <option value="">Any</option>
              {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-white/40 block mb-1">Target Language</label>
            <select value={form.targetLanguage} onChange={e => setForm(f => ({ ...f, targetLanguage: e.target.value }))} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-md px-3 py-2 text-sm text-white">
              <option value="">Any</option>
              {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-white/40 block mb-1">Service Type</label>
            <Input value={form.serviceType} onChange={e => setForm(f => ({ ...f, serviceType: e.target.value }))} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" placeholder="translation" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] text-white/40 block mb-1">Preferred Vendor</label>
            <select value={form.preferredVendorId} onChange={e => setForm(f => ({ ...f, preferredVendorId: e.target.value }))} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-md px-3 py-2 text-sm text-white">
              <option value="">Select vendor...</option>
              {vendorsList.map((v: any) => <option key={v.id} value={v.id}>{v.fullName}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-white/40 block mb-1">Min Quality Score</label>
            <Input value={form.minQualityScore} onChange={e => setForm(f => ({ ...f, minQualityScore: e.target.value }))} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" placeholder="e.g., 70" />
          </div>
          <div>
            <label className="text-[11px] text-white/40 block mb-1">Max Rate</label>
            <Input value={form.maxRate} onChange={e => setForm(f => ({ ...f, maxRate: e.target.value }))} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" placeholder="e.g., 0.10" />
          </div>
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
            <Zap className="w-5 h-5 text-yellow-400" /> Auto-Dispatch Rules
          </h1>
          <p className="text-xs text-white/30 mt-1">Configure automatic vendor assignment based on language, service type, and vendor criteria</p>
        </div>
        {!showCreate && !editingId && (
          <Button size="sm" onClick={() => { setShowCreate(true); resetForm(); }}>
            <Plus className="w-3.5 h-3.5 mr-1" /> New Rule
          </Button>
        )}
      </div>

      {(showCreate || editingId) && formUI}

      <div className="space-y-3">
        {isLoading ? (
          [1, 2, 3].map(i => <div key={i} className="h-20 bg-white/[0.06] rounded-xl animate-pulse" />)
        ) : rules.length === 0 ? (
          <Card className="bg-[#0f1219] border-white/[0.06]">
            <CardContent className="text-center py-12">
              <Zap className="w-8 h-8 text-white/10 mx-auto mb-2" />
              <p className="text-sm text-white/20">No auto-dispatch rules configured</p>
            </CardContent>
          </Card>
        ) : rules.map((r: any) => (
          <Card key={r.id} className="bg-[#0f1219] border-white/[0.06]">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Zap className="w-5 h-5 text-yellow-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-white font-medium">{r.name}</p>
                    <Badge variant="outline" className={`text-[10px] ${r.isActive ? "text-emerald-400 border-emerald-400/20" : "text-white/30 border-white/10"}`}>
                      {r.isActive ? "Active" : "Inactive"}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] text-white/30 border-white/10">P:{r.priority}</Badge>
                  </div>
                  {r.description && <p className="text-xs text-white/30 mt-0.5">{r.description}</p>}
                  <div className="flex gap-3 mt-1.5 text-[10px] text-white/20">
                    {r.sourceLanguage && <span>Src: {r.sourceLanguage}</span>}
                    {r.targetLanguage && <span>Tgt: {r.targetLanguage}</span>}
                    {r.serviceType && <span>Service: {r.serviceType}</span>}
                    {r.minQualityScore && <span>Min QS: {r.minQualityScore}</span>}
                    {r.maxRate && <span>Max Rate: {r.maxRate}</span>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => startEdit(r)}><Edit2 className="w-3 h-3" /></Button>
                  <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={() => deleteMutation.mutate(r.id)}><Trash2 className="w-3 h-3" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
