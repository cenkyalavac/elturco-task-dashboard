import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Users, LayoutGrid, List, GripVertical, ChevronRight, Clock } from "lucide-react";

const STAGES = [
  { key: "New Application", label: "New Application", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  { key: "CV Review", label: "CV Review", color: "bg-sky-500/20 text-sky-400 border-sky-500/30" },
  { key: "Quiz Pending", label: "Quiz Pending", color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
  { key: "Quiz Passed", label: "Quiz Passed", color: "bg-teal-500/20 text-teal-400 border-teal-500/30" },
  { key: "Test Task", label: "Test Task", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  { key: "Interview", label: "Interview", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  { key: "NDA Pending", label: "NDA Pending", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  { key: "Active", label: "Active", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  { key: "Inactive", label: "Inactive", color: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
  { key: "Blacklisted", label: "Blacklisted", color: "bg-red-700/20 text-red-300 border-red-700/30" },
  // Legacy stages for backwards compat
  { key: "Form Sent", label: "Form Sent", color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
  { key: "Price Negotiation", label: "Price Negotiation", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  { key: "Test Sent", label: "Test Sent", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  { key: "Approved", label: "Approved", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  { key: "Rejected", label: "Rejected", color: "bg-red-500/20 text-red-400 border-red-500/30" },
  { key: "Red Flag", label: "Red Flag", color: "bg-red-700/20 text-red-300 border-red-700/30" },
];

function getDaysInStage(stageChangedDate: string | null) {
  if (!stageChangedDate) return null;
  const days = Math.floor((Date.now() - new Date(stageChangedDate).getTime()) / (1000 * 60 * 60 * 24));
  return days;
}

export default function VendorPipelinePage() {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");

  const { data: vendorsData, isLoading } = useQuery({
    queryKey: ["/api/vendors"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/vendors"); return r.json(); },
  });

  const updateStage = useMutation({
    mutationFn: async ({ vendorId, status }: { vendorId: number; status: string }) => {
      await apiRequest("PATCH", `/api/vendors/${vendorId}/stage`, { status });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/vendors"] }),
  });

  const vendors = vendorsData?.data || vendorsData || [];
  const filtered = useMemo(() => {
    if (!searchTerm) return vendors;
    const q = searchTerm.toLowerCase();
    return vendors.filter((v: any) => v.fullName?.toLowerCase().includes(q) || v.email?.toLowerCase().includes(q));
  }, [vendors, searchTerm]);

  const vendorsByStage = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const s of STAGES) map.set(s.key, []);
    for (const v of filtered) {
      const stage = v.status || "New Application";
      const bucket = map.get(stage) || map.get("New Application")!;
      bucket.push(v);
    }
    return map;
  }, [filtered]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-64" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-400" /> {t("pipeline.title")}
        </h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
            <Input
              placeholder="Search vendors..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-8 w-52 bg-white/5 border-white/10 text-white text-xs h-8"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => setViewMode(viewMode === "kanban" ? "table" : "kanban")} className="bg-white/5 border-white/10 text-white/60 text-xs h-8">
            {viewMode === "kanban" ? <List className="w-3.5 h-3.5 mr-1" /> : <LayoutGrid className="w-3.5 h-3.5 mr-1" />}
            {viewMode === "kanban" ? t("pipeline.tableView") : t("pipeline.cardView")}
          </Button>
        </div>
      </div>

      {viewMode === "kanban" ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {STAGES.map(stage => {
            const stageVendors = vendorsByStage.get(stage.key) || [];
            return (
              <div key={stage.key} className="flex-shrink-0 w-[260px]">
                <div className="flex items-center gap-2 mb-2 px-1">
                  <Badge variant="outline" className={`text-xs ${stage.color}`}>{stage.label}</Badge>
                  <span className="text-xs text-white/30">{stageVendors.length}</span>
                </div>
                <div className="space-y-2 min-h-[200px] bg-white/[0.02] rounded-lg p-2 border border-white/[0.04]">
                  {stageVendors.map((v: any) => (
                    <Card key={v.id} className="bg-white/[0.04] border-white/[0.06] hover:bg-white/[0.06] transition-colors cursor-pointer">
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between">
                          <div className="min-w-0 flex-1">
                            <a href={`#/vendors/${v.id}`} className="text-sm font-medium text-white hover:text-blue-400 truncate block">{v.fullName}</a>
                            <p className="text-xs text-white/40 truncate mt-0.5">{v.email}</p>
                          </div>
                          <GripVertical className="w-3.5 h-3.5 text-white/20 shrink-0 mt-0.5" />
                        </div>
                        {v.nativeLanguage && <p className="text-xs text-white/30 mt-1">{v.nativeLanguage}</p>}
                        <div className="flex items-center justify-between mt-2">
                          {v.tier && <Badge variant="outline" className="text-[10px] text-white/40 border-white/10">{v.tier}</Badge>}
                          {v.stageChangedDate && (
                            <span className="text-[10px] text-white/20 flex items-center gap-0.5">
                              <Clock className="w-2.5 h-2.5" />
                              {getDaysInStage(v.stageChangedDate)}d
                            </span>
                          )}
                        </div>
                        <Select onValueChange={(val) => updateStage.mutate({ vendorId: v.id, status: val })}>
                          <SelectTrigger className="mt-2 h-6 text-[10px] bg-white/5 border-white/10 text-white/50">
                            <SelectValue placeholder="Move to..." />
                          </SelectTrigger>
                          <SelectContent>
                            {STAGES.filter(s => s.key !== stage.key).map(s => (
                              <SelectItem key={s.key} value={s.key} className="text-xs">{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </CardContent>
                    </Card>
                  ))}
                  {stageVendors.length === 0 && (
                    <div className="py-8 text-center text-white/15 text-xs">Empty</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/40 border-b border-white/[0.06] text-xs">
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Email</th>
                <th className="text-left p-3">Stage</th>
                <th className="text-left p-3">Tier</th>
                <th className="text-left p-3">Language</th>
                <th className="text-left p-3">Days in Stage</th>
                <th className="text-left p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v: any) => {
                const stage = STAGES.find(s => s.key === v.status) || STAGES[0];
                return (
                  <tr key={v.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                    <td className="p-3">
                      <a href={`#/vendors/${v.id}`} className="text-white hover:text-blue-400 font-medium">{v.fullName}</a>
                    </td>
                    <td className="p-3 text-white/50">{v.email}</td>
                    <td className="p-3"><Badge variant="outline" className={`text-xs ${stage.color}`}>{stage.label}</Badge></td>
                    <td className="p-3 text-white/50">{v.tier || "-"}</td>
                    <td className="p-3 text-white/50">{v.nativeLanguage || "-"}</td>
                    <td className="p-3 text-white/40">{getDaysInStage(v.stageChangedDate) ?? "-"}</td>
                    <td className="p-3">
                      <Select onValueChange={(val) => updateStage.mutate({ vendorId: v.id, status: val })}>
                        <SelectTrigger className="h-7 text-xs bg-white/5 border-white/10 text-white/50 w-36">
                          <SelectValue placeholder="Move to..." />
                        </SelectTrigger>
                        <SelectContent>
                          {STAGES.filter(s => s.key !== v.status).map(s => (
                            <SelectItem key={s.key} value={s.key} className="text-xs">{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-12 text-center text-white/30 text-sm">No vendors found</div>
          )}
        </div>
      )}
    </div>
  );
}
