import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Filter, DollarSign, CheckCircle2 } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  processing: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  failed: "bg-red-500/15 text-red-400 border-red-500/25",
};

function formatCurrency(amount: string | number | null, currency: string = "EUR"): string {
  if (!amount && amount !== 0) return "—";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "—";
  const symbol = currency === "GBP" ? "£" : currency === "EUR" ? "€" : "$";
  return `${symbol}${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PaymentQueuePage() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["/api/payment-queue", statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      const r = await apiRequest("GET", `/api/payment-queue?${params}`);
      return r.json();
    },
  });

  const processMutation = useMutation({
    mutationFn: async ({ id, paymentMethod }: { id: number; paymentMethod: string }) => {
      const r = await apiRequest("POST", `/api/payment-queue/${id}/process`, { paymentMethod });
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/payment-queue"] }); queryClient.invalidateQueries({ queryKey: ["/api/vendor-invoices"] }); toast({ title: "Payment processed" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const batchProcessMutation = useMutation({
    mutationFn: async (paymentMethod: string) => {
      const r = await apiRequest("POST", "/api/payment-queue/batch-process", { ids: Array.from(selectedIds), paymentMethod });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-invoices"] });
      setSelectedIds(new Set());
      toast({ title: "Batch payment processed" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const queue = data?.queue || [];
  const pendingTotal = queue.filter((q: any) => q.queue.status === "pending").reduce((s: number, q: any) => s + parseFloat(q.queue.amount || "0"), 0);

  const toggleSelect = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white flex items-center gap-2"><CreditCard className="w-5 h-5 text-emerald-400" /> Payment Queue</h1>
          <p className="text-xs text-white/30 mt-0.5">Process vendor payments</p>
        </div>
        <div className="flex items-center gap-3">
          <Card className="bg-white/[0.03] border-white/[0.06] px-4 py-2">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <div>
                <p className="text-[10px] text-white/30">Pending Total</p>
                <p className="text-sm font-bold text-emerald-400">{formatCurrency(pendingTotal)}</p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Filter className="w-3.5 h-3.5 text-white/30" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48 h-8 text-xs"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-blue-400">{selectedIds.size} selected</span>
            <Button size="sm" onClick={() => batchProcessMutation.mutate("bank_transfer")} className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white">
              <CheckCircle2 className="w-3 h-3 mr-1" />Process (Bank)
            </Button>
            <Button size="sm" variant="outline" onClick={() => batchProcessMutation.mutate("wise")} className="h-7 text-xs border-blue-500/30 text-blue-400 hover:bg-blue-500/10">
              Process (Wise)
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-64 bg-white/[0.04] rounded-lg" />
      ) : queue.length === 0 ? (
        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardContent className="p-8 text-center">
            <CreditCard className="w-10 h-10 text-white/10 mx-auto mb-3" />
            <p className="text-sm text-white/30">Payment queue is empty</p>
          </CardContent>
        </Card>
      ) : (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-white/[0.06] hover:bg-transparent">
                <TableHead className="w-8 px-3"><Checkbox checked={selectedIds.size === queue.filter((q: any) => q.queue.status === "pending").length && selectedIds.size > 0} onCheckedChange={(checked) => { if (checked) { setSelectedIds(new Set(queue.filter((q: any) => q.queue.status === "pending").map((q: any) => q.queue.id))); } else { setSelectedIds(new Set()); } }} /></TableHead>
                <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Vendor</TableHead>
                <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3 text-right">Amount</TableHead>
                <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Currency</TableHead>
                <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Method</TableHead>
                <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Scheduled</TableHead>
                <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Status</TableHead>
                <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.map((row: any) => {
                const q = row.queue;
                return (
                  <TableRow key={q.id} className="border-white/[0.06] hover:bg-white/[0.02]">
                    <TableCell className="px-3 py-2"><Checkbox checked={selectedIds.has(q.id)} onCheckedChange={() => toggleSelect(q.id)} disabled={q.status !== "pending"} /></TableCell>
                    <TableCell className="text-xs text-white/60 px-3 py-2">{row.vendorName || `Vendor #${q.vendorId}`}</TableCell>
                    <TableCell className="text-xs text-emerald-400 px-3 py-2 text-right font-medium">{formatCurrency(q.amount, q.currency)}</TableCell>
                    <TableCell className="text-xs text-white/40 px-3 py-2">{q.currency}</TableCell>
                    <TableCell className="text-xs text-white/40 px-3 py-2 capitalize">{q.paymentMethod?.replace(/_/g, " ") || "—"}</TableCell>
                    <TableCell className="text-xs text-white/40 px-3 py-2">{q.scheduledDate || "—"}</TableCell>
                    <TableCell className="px-3 py-2">
                      <Badge className={`text-[10px] border ${STATUS_COLORS[q.status] || "bg-zinc-500/15 text-zinc-400 border-zinc-500/25"}`}>{q.status}</Badge>
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      {q.status === "pending" && (
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-emerald-400 hover:bg-emerald-500/10"
                            onClick={() => processMutation.mutate({ id: q.id, paymentMethod: "bank_transfer" })}>
                            Process
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
