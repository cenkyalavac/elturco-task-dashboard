import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, Grid3x3, X } from "lucide-react";

interface CapacityData {
  matrix: { source: string; target: string; supply: number; demand: number; ratio: number }[];
  sourceLanguages: string[];
  targetLanguages: string[];
  dateRange: { from: string; to: string };
}

export default function VMCapacityMapPage() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [drillDown, setDrillDown] = useState<{ source: string; target: string } | null>(null);

  const { data, isLoading } = useQuery<CapacityData>({
    queryKey: ["/api/vm/capacity-map", dateFrom, dateTo],
    queryFn: async ({ queryKey }) => {
      const res = await fetch(`/api/vm/capacity-map?dateFrom=${dateFrom}&dateTo=${dateTo}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("elturco_auth") ? JSON.parse(localStorage.getItem("elturco_auth")!).authToken : sessionStorage.getItem("elturco_auth") ? JSON.parse(sessionStorage.getItem("elturco_auth")!).authToken : ""}` },
      });
      if (!res.ok) throw new Error("Failed to fetch capacity map");
      return res.json();
    },
  });

  // Drill-down vendors query
  const { data: drillDownData, isLoading: isDrillDownLoading } = useQuery<{ vendors: any[] }>({
    queryKey: ["/api/vm/capacity-map/vendors", drillDown?.source, drillDown?.target],
    queryFn: async () => {
      if (!drillDown) return { vendors: [] };
      const res = await fetch(`/api/vm/capacity-map/vendors?source=${drillDown.source}&target=${drillDown.target}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("elturco_auth") ? JSON.parse(localStorage.getItem("elturco_auth")!).authToken : sessionStorage.getItem("elturco_auth") ? JSON.parse(sessionStorage.getItem("elturco_auth")!).authToken : ""}` },
      });
      if (!res.ok) throw new Error("Failed to fetch vendors");
      return res.json();
    },
    enabled: !!drillDown,
  });

  // Build grid matrix
  const grid = useMemo(() => {
    if (!data?.matrix) return { sources: [], targets: [], cells: {} };
    const sources = data.sourceLanguages;
    const targets = data.targetLanguages;
    const cells: Record<string, { supply: number; demand: number; ratio: number }> = {};
    for (const item of data.matrix) {
      cells[`${item.source}|${item.target}`] = { supply: item.supply, demand: item.demand, ratio: item.ratio };
    }
    return { sources, targets, cells };
  }, [data]);

  function getCellColor(ratio: number, demand: number): string {
    if (demand === 0) return "bg-white/[0.03] text-white/20"; // No demand - gray
    if (ratio >= 1.5) return "bg-emerald-500/20 text-emerald-400"; // Well covered
    if (ratio >= 0.8) return "bg-yellow-500/20 text-yellow-400"; // Adequate
    return "bg-red-500/20 text-red-400"; // Under covered
  }

  function exportCSV() {
    if (!data?.matrix) return;
    const headers = ["Source", "Target", "Supply", "Demand", "Ratio"];
    const rows = data.matrix.map(m => [m.source, m.target, m.supply, m.demand, m.ratio].join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `capacity-map-${dateFrom}-${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[400px] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Grid3x3 className="w-6 h-6 text-blue-400" />
            Language Pair Capacity Map
          </h1>
          <p className="text-sm text-white/40 mt-1">Supply (active vendors) vs Demand (jobs) per language pair</p>
        </div>
        <div className="flex items-center gap-3">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-white/[0.03] border-white/[0.08] text-white text-sm w-36"
          />
          <span className="text-white/30">to</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-white/[0.03] border-white/[0.08] text-white text-sm w-36"
          />
          <Button variant="outline" size="sm" onClick={exportCSV} className="border-white/10">
            <Download className="w-4 h-4 mr-1" /> CSV
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[11px]">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-emerald-500/20" />
          <span className="text-white/40">Well Covered ({">"}1.5x)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-yellow-500/20" />
          <span className="text-white/40">Adequate (0.8-1.5x)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-red-500/20" />
          <span className="text-white/40">Under Covered ({"<"}0.8x)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-white/[0.03]" />
          <span className="text-white/40">No Demand</span>
        </div>
      </div>

      {/* Capacity Table */}
      <Card className="bg-[#151922] border-white/[0.06] overflow-hidden">
        <CardContent className="p-0">
          {grid.sources.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-white/40">No language pair data available</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="p-2 text-left text-white/40 font-medium sticky left-0 bg-[#151922] z-10">Source ↓ / Target →</th>
                    {grid.targets.map(t => (
                      <th key={t} className="p-2 text-center text-white/40 font-medium min-w-[60px]">{t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.sources.map(src => (
                    <tr key={src} className="border-b border-white/[0.03]">
                      <td className="p-2 text-white/60 font-medium sticky left-0 bg-[#151922] z-10">{src}</td>
                      {grid.targets.map(tgt => {
                        const cell = grid.cells[`${src}|${tgt}`];
                        if (!cell) {
                          return <td key={tgt} className="p-1"><div className="h-10 rounded bg-white/[0.01]" /></td>;
                        }
                        return (
                          <td key={tgt} className="p-1">
                            <button
                              onClick={() => setDrillDown({ source: src, target: tgt })}
                              className={`w-full h-10 rounded flex flex-col items-center justify-center cursor-pointer hover:ring-1 hover:ring-blue-400/30 transition-all ${getCellColor(cell.ratio, cell.demand)}`}
                            >
                              <span className="font-bold text-[11px]">{cell.supply}/{cell.demand}</span>
                              <span className="text-[9px] opacity-60">{cell.ratio}x</span>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {data?.matrix && data.matrix.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="bg-[#151922] border-white/[0.06]">
            <CardContent className="p-4 text-center">
              <p className="text-xs text-white/40">Total Pairs</p>
              <p className="text-2xl font-bold text-white">{data.matrix.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-[#151922] border-white/[0.06]">
            <CardContent className="p-4 text-center">
              <p className="text-xs text-white/40">Under-Covered</p>
              <p className="text-2xl font-bold text-red-400">
                {data.matrix.filter(m => m.demand > 0 && m.ratio < 0.8).length}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-[#151922] border-white/[0.06]">
            <CardContent className="p-4 text-center">
              <p className="text-xs text-white/40">Well-Covered</p>
              <p className="text-2xl font-bold text-emerald-400">
                {data.matrix.filter(m => m.ratio >= 1.5).length}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Drill-Down Dialog */}
      <Dialog open={!!drillDown} onOpenChange={() => setDrillDown(null)}>
        <DialogContent className="bg-[#1a1d27] border-white/[0.08] text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">
              Vendors: {drillDown?.source} → {drillDown?.target}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-64 overflow-y-auto space-y-2">
            {isDrillDownLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 rounded" />)}
              </div>
            ) : (drillDownData?.vendors || []).length === 0 ? (
              <p className="text-sm text-white/40 text-center py-4">No active vendors for this pair</p>
            ) : (
              (drillDownData?.vendors || []).map((v: any) => (
                <div key={v.id} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03]">
                  <div>
                    <p className="text-sm font-medium text-white">{v.full_name}</p>
                    <p className="text-[11px] text-white/40">{v.email} {v.location ? `• ${v.location}` : ""}</p>
                  </div>
                  <div className="text-right">
                    {v.combined_quality_score && (
                      <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 text-[10px]">
                        QS: {Number(v.combined_quality_score).toFixed(1)}
                      </Badge>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
