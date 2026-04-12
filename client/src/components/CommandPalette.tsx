import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, FolderKanban, Users, Building2, FileText, ArrowRight } from "lucide-react";

const TYPE_CONFIG: Record<string, { icon: typeof FolderKanban; color: string; label: string }> = {
  project: { icon: FolderKanban, color: "text-blue-400", label: "Project" },
  vendor: { icon: Users, color: "text-emerald-400", label: "Vendor" },
  customer: { icon: Building2, color: "text-amber-400", label: "Customer" },
  invoice: { icon: FileText, color: "text-purple-400", label: "Invoice" },
};

export default function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset on open/close
  useEffect(() => {
    if (open) { setSearch(""); setDebouncedSearch(""); setSelectedIndex(0); }
  }, [open]);

  const { data } = useQuery({
    queryKey: ["/api/search", debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch || debouncedSearch.length < 2) return { results: [] };
      const r = await apiRequest("GET", `/api/search?q=${encodeURIComponent(debouncedSearch)}`);
      return r.json();
    },
    enabled: open && debouncedSearch.length >= 2,
  });

  const results = data?.results || [];

  // Group results by type
  const grouped = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const r of results) {
      if (!groups[r.type]) groups[r.type] = [];
      groups[r.type].push(r);
    }
    return groups;
  }, [results]);

  const flatResults = results;

  const handleSelect = useCallback((item: any) => {
    onOpenChange(false);
    navigate(item.href);
  }, [onOpenChange, navigate]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, flatResults.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && flatResults[selectedIndex]) {
        e.preventDefault();
        handleSelect(flatResults[selectedIndex]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, flatResults, selectedIndex, handleSelect]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1d27] border-white/10 text-white max-w-lg p-0 gap-0">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
          <Search className="w-4 h-4 text-white/30 shrink-0" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setSelectedIndex(0); }}
            placeholder="Search projects, vendors, customers, invoices..."
            className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder:text-white/30"
            autoFocus
          />
          <kbd className="hidden sm:inline text-[10px] text-white/20 border border-white/10 rounded px-1.5 py-0.5">ESC</kbd>
        </div>

        <div className="max-h-80 overflow-y-auto py-2">
          {search.length < 2 ? (
            <div className="px-4 py-6 text-center text-white/20 text-sm">
              Type at least 2 characters to search...
            </div>
          ) : flatResults.length === 0 ? (
            <div className="px-4 py-6 text-center text-white/20 text-sm">
              No results found for "{search}"
            </div>
          ) : (
            Object.entries(grouped).map(([type, items]) => {
              const config = TYPE_CONFIG[type] || { icon: Search, color: "text-white/40", label: type };
              return (
                <div key={type}>
                  <p className="px-4 py-1 text-[10px] font-semibold text-white/20 uppercase tracking-wider">{config.label}s</p>
                  {items.map((item: any) => {
                    const idx = flatResults.indexOf(item);
                    const Icon = config.icon;
                    return (
                      <button
                        key={`${item.type}-${item.id}`}
                        onClick={() => handleSelect(item)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                          idx === selectedIndex ? "bg-blue-500/10" : "hover:bg-white/[0.03]"
                        }`}
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
