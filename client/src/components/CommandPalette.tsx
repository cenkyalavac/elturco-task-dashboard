import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Search, FolderKanban, Users, Building2, FileText, ArrowRight,
  Plus, LayoutTemplate, Archive, Zap, Calendar,
} from "lucide-react";

const TYPE_CONFIG: Record<string, { icon: typeof FolderKanban; color: string; label: string }> = {
  project: { icon: FolderKanban, color: "text-blue-400", label: "Project" },
  vendor: { icon: Users, color: "text-emerald-400", label: "Vendor" },
  customer: { icon: Building2, color: "text-amber-400", label: "Customer" },
  invoice: { icon: FileText, color: "text-purple-400", label: "Invoice" },
};

const QUICK_ACTIONS = [
  { id: "new-project", label: "Create New Project", sub: "Quick project creation", icon: Plus, color: "text-blue-400", action: "create-project" },
  { id: "from-template", label: "New Project from Template", sub: "Use a saved template", icon: LayoutTemplate, color: "text-purple-400", action: "from-template" },
  { id: "nav-projects", label: "Go to Projects", sub: "/projects", icon: FolderKanban, color: "text-blue-400", href: "/projects" },
  { id: "nav-vendors", label: "Go to Vendors", sub: "/vendors", icon: Users, color: "text-emerald-400", href: "/vendors" },
  { id: "nav-customers", label: "Go to Customers", sub: "/customers", icon: Building2, color: "text-amber-400", href: "/customers" },
  { id: "nav-archive", label: "Project Archive", sub: "/projects/archive", icon: Archive, color: "text-white/40", href: "/projects/archive" },
  { id: "nav-auto-dispatch", label: "Auto-Dispatch Rules", sub: "/settings/auto-dispatch", icon: Zap, color: "text-yellow-400", href: "/settings/auto-dispatch" },
  { id: "nav-templates", label: "Project Templates", sub: "/settings/project-templates", icon: LayoutTemplate, color: "text-purple-400", href: "/settings/project-templates" },
];

const LANGUAGES = ["EN", "TR", "DE", "FR", "ES", "IT", "PT", "NL", "PL", "RU", "ZH", "JA", "KO", "AR", "SV", "DA", "FI", "NO", "CS", "HU", "RO", "BG", "HR", "SK", "SL", "EL", "UK", "TH", "VI", "ID"];

export default function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState<"search" | "create-project" | "from-template">("search");

  // Quick project form
  const [projectName, setProjectName] = useState("");
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [sourceLang, setSourceLang] = useState("");
  const [targetLangs, setTargetLangs] = useState<string[]>([]);
  const [deadline, setDeadline] = useState("");

  // Debounce
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset
  useEffect(() => {
    if (open) { setSearch(""); setDebouncedSearch(""); setSelectedIndex(0); setMode("search"); resetForm(); }
  }, [open]);

  function resetForm() {
    setProjectName(""); setCustomerId(null); setSourceLang(""); setTargetLangs([]); setDeadline("");
  }

  const { data } = useQuery({
    queryKey: ["/api/search", debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch || debouncedSearch.length < 2) return { results: [] };
      const r = await apiRequest("GET", `/api/search?q=${encodeURIComponent(debouncedSearch)}`);
      return r.json();
    },
    enabled: open && debouncedSearch.length >= 2 && mode === "search",
  });

  const { data: customersData } = useQuery({
    queryKey: ["/api/customers"],
    enabled: open && (mode === "create-project" || mode === "from-template"),
  });

  const { data: templatesData } = useQuery({
    queryKey: ["/api/project-templates"],
    enabled: open && mode === "from-template",
  });

  const createProjectMutation = useMutation({
    mutationFn: async () => {
      if (!customerId || !projectName) return;
      const projRes = await apiRequest("POST", "/api/projects", { projectName, customerId, status: "active", deadline: deadline || undefined });
      const project = await projRes.json();
      // Auto-create jobs for each target language
      if (targetLangs.length > 0 && sourceLang) {
        const jobsData = targetLangs.map(tl => ({
          jobName: `${sourceLang} → ${tl}`,
          sourceLanguage: sourceLang,
          targetLanguage: tl,
          serviceType: "translation",
        }));
        await apiRequest("POST", `/api/projects/${project.id}/jobs/batch`, { jobs: jobsData });
      }
      return project;
    },
    onSuccess: (project) => {
      if (project) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
        onOpenChange(false);
        navigate(`/projects/${project.id}`);
      }
    },
  });

  const applyTemplateMutation = useMutation({
    mutationFn: async (templateId: number) => {
      const res = await apiRequest("POST", `/api/project-templates/${templateId}/apply`, {
        projectName: projectName || undefined,
        customerId: customerId || undefined,
        deadline: deadline || undefined,
      });
      return res.json();
    },
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      onOpenChange(false);
      navigate(`/projects/${project.id}`);
    },
  });

  const results = data?.results || [];
  const grouped = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const r of results) {
      if (!groups[r.type]) groups[r.type] = [];
      groups[r.type].push(r);
    }
    return groups;
  }, [results]);

  // Merge quick actions with search results
  const filteredActions = useMemo(() => {
    if (!search) return QUICK_ACTIONS;
    const q = search.toLowerCase();
    return QUICK_ACTIONS.filter(a => a.label.toLowerCase().includes(q) || a.sub.toLowerCase().includes(q) || (q.includes("yeni") && a.id.includes("new")) || (q.includes("proje") && a.id.includes("project")));
  }, [search]);

  const flatResults = results;
  const totalItems = filteredActions.length + flatResults.length;

  const handleSelect = useCallback((item: any) => {
    onOpenChange(false);
    navigate(item.href);
  }, [onOpenChange, navigate]);

  const handleActionSelect = useCallback((action: typeof QUICK_ACTIONS[0]) => {
    if (action.href) {
      onOpenChange(false);
      navigate(action.href);
    } else if (action.action === "create-project") {
      setMode("create-project");
    } else if (action.action === "from-template") {
      setMode("from-template");
    }
  }, [onOpenChange, navigate]);

  // Keyboard nav
  useEffect(() => {
    if (!open || mode !== "search") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, totalItems - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); }
      else if (e.key === "Enter") {
        e.preventDefault();
        if (selectedIndex < filteredActions.length) {
          handleActionSelect(filteredActions[selectedIndex]);
        } else if (flatResults[selectedIndex - filteredActions.length]) {
          handleSelect(flatResults[selectedIndex - filteredActions.length]);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, mode, flatResults, filteredActions, selectedIndex, handleSelect, handleActionSelect, totalItems]);

  const customersList = (customersData as any)?.data || (customersData as any) || [];
  const templates = (templatesData as any)?.templates || [];

  const toggleTargetLang = (lang: string) => {
    setTargetLangs(prev => prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang]);
  };

  // Create project mode
  if (mode === "create-project") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-[#1a1d27] border-white/10 text-white max-w-lg p-0 gap-0">
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-medium">Quick Project Entry</span>
              <button onClick={() => setMode("search")} className="ml-auto text-xs text-white/30 hover:text-white">Back</button>
            </div>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="text-[11px] text-white/40 block mb-1">Project Name *</label>
              <input value={projectName} onChange={e => setProjectName(e.target.value)} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-md px-3 py-2 text-sm text-white" autoFocus placeholder="e.g., Website Localization — ACME Corp" />
            </div>
            <div>
              <label className="text-[11px] text-white/40 block mb-1">Customer *</label>
              <select value={customerId || ""} onChange={e => setCustomerId(+e.target.value || null)} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-md px-3 py-2 text-sm text-white">
                <option value="">Select customer...</option>
                {(Array.isArray(customersList) ? customersList : []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-white/40 block mb-1">Source Language</label>
                <select value={sourceLang} onChange={e => setSourceLang(e.target.value)} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-md px-3 py-2 text-sm text-white">
                  <option value="">Select...</option>
                  {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-white/40 block mb-1">Deadline</label>
                <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-md px-3 py-2 text-sm text-white" />
              </div>
            </div>
            <div>
              <label className="text-[11px] text-white/40 block mb-1">Target Language(s)</label>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {LANGUAGES.filter(l => l !== sourceLang).map(l => (
                  <button key={l} onClick={() => toggleTargetLang(l)} className={`px-2 py-0.5 rounded text-xs transition-colors ${targetLangs.includes(l) ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "bg-white/[0.04] text-white/40 border border-white/[0.06] hover:bg-white/[0.08]"}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => createProjectMutation.mutate()}
              disabled={!projectName || !customerId || createProjectMutation.isPending}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-md transition-colors"
            >
              {createProjectMutation.isPending ? "Creating..." : `Create Project${targetLangs.length > 0 ? ` + ${targetLangs.length} Job(s)` : ""}`}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Template mode
  if (mode === "from-template") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-[#1a1d27] border-white/10 text-white max-w-lg p-0 gap-0">
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <LayoutTemplate className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium">New Project from Template</span>
              <button onClick={() => setMode("search")} className="ml-auto text-xs text-white/30 hover:text-white">Back</button>
            </div>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="text-[11px] text-white/40 block mb-1">Project Name (optional override)</label>
              <input value={projectName} onChange={e => setProjectName(e.target.value)} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-md px-3 py-2 text-sm text-white" placeholder="Leave blank to use template name" />
            </div>
            <div>
              <label className="text-[11px] text-white/40 block mb-1">Customer (optional override)</label>
              <select value={customerId || ""} onChange={e => setCustomerId(+e.target.value || null)} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-md px-3 py-2 text-sm text-white">
                <option value="">Use template default...</option>
                {(Array.isArray(customersList) ? customersList : []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-white/40 block mb-1">Select Template</label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {templates.length === 0 ? (
                  <p className="text-white/30 text-sm text-center py-4">No templates available</p>
                ) : templates.map((t: any) => (
                  <button
                    key={t.id}
                    onClick={() => applyTemplateMutation.mutate(t.id)}
                    disabled={applyTemplateMutation.isPending}
                    className="w-full text-left p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <LayoutTemplate className="w-4 h-4 text-purple-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-medium truncate">{t.name}</p>
                        {t.description && <p className="text-xs text-white/30 truncate">{t.description}</p>}
                        <div className="flex gap-2 mt-1 text-[10px] text-white/20">
                          {t.sourceLanguage && <span>{t.sourceLanguage}</span>}
                          {t.targetLanguages?.length > 0 && <span>→ {t.targetLanguages.join(", ")}</span>}
                          {t.defaultDeadlineDays && <span>{t.defaultDeadlineDays} days</span>}
                        </div>
                      </div>
                      <ArrowRight className="w-3 h-3 text-white/10 shrink-0" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Default search mode
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1d27] border-white/10 text-white max-w-lg p-0 gap-0">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
          <Search className="w-4 h-4 text-white/30 shrink-0" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setSelectedIndex(0); }}
            placeholder="Search or type 'new project', 'yeni proje'..."
            className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder:text-white/30"
            autoFocus
          />
          <kbd className="hidden sm:inline text-[10px] text-white/20 border border-white/10 rounded px-1.5 py-0.5">ESC</kbd>
        </div>

        <div className="max-h-96 overflow-y-auto py-2">
          {/* Quick Actions */}
          {filteredActions.length > 0 && (
            <div>
              <p className="px-4 py-1 text-[10px] font-semibold text-white/20 uppercase tracking-wider">Actions</p>
              {filteredActions.map((action, i) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    onClick={() => handleActionSelect(action)}
                    onMouseEnter={() => setSelectedIndex(i)}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${i === selectedIndex ? "bg-blue-500/10" : "hover:bg-white/[0.03]"}`}
                  >
                    <Icon className={`w-4 h-4 ${action.color} shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{action.label}</p>
                      <p className="text-xs text-white/30 truncate">{action.sub}</p>
                    </div>
                    <ArrowRight className="w-3 h-3 text-white/10 shrink-0" />
                  </button>
                );
              })}
            </div>
          )}

          {/* Search Results */}
          {search.length >= 2 && flatResults.length > 0 && (
            Object.entries(grouped).map(([type, items]) => {
              const config = TYPE_CONFIG[type] || { icon: Search, color: "text-white/40", label: type };
              return (
                <div key={type}>
                  <p className="px-4 py-1 text-[10px] font-semibold text-white/20 uppercase tracking-wider">{config.label}s</p>
                  {items.map((item: any) => {
                    const idx = filteredActions.length + flatResults.indexOf(item);
                    const Icon = config.icon;
                    return (
                      <button
                        key={`${item.type}-${item.id}`}
                        onClick={() => handleSelect(item)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${idx === selectedIndex ? "bg-blue-500/10" : "hover:bg-white/[0.03]"}`}
                      >
                        <Icon className={`w-4 h-4 ${config.color} shrink-0`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{item.label}</p>
                          {item.sub && <p className="text-xs text-white/30 truncate">{item.sub}</p>}
                        </div>
                        {item.status && (
                          <Badge variant="outline" className="text-[10px] text-white/40 border-white/10 shrink-0">{item.status}</Badge>
                        )}
                        <ArrowRight className="w-3 h-3 text-white/10 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}

          {search.length >= 2 && flatResults.length === 0 && filteredActions.length === 0 && (
            <div className="px-4 py-6 text-center text-white/20 text-sm">
              No results found for "{search}"
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
