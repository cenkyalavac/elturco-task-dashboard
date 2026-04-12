import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, FileText, Check, X, DollarSign, Filter } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  under_review: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  approved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  rejected: "bg-red-500/15 text-red-400 border-red-500/25",
  paid: "bg-indigo-500/15 text-indigo-400 border-indigo-500/25",
};

function formatCurrency(amount: string | number | null, currency: string = "EUR"): string {
  if (!amount && amount !== 0) return "—";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "—";
  const symbol = currency === "GBP" ? "£" : currency === "EUR" ? "€" : "$";
  return `${symbol}${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function VendorInvoicesPage() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    vendorId: "", invoiceNumber: "", invoiceDate: "", dueDate: "", amount: "", taxAmount: "0", totalAmount: "", currency: "EUR", notes: "", entityId: "",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["/api/vendor-invoices", statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      const r = await apiRequest("GET", `/api/vendor-invoices?${params}`);
      return r.json();
    },
  });

  const vendorsQuery = useQuery({
    queryKey: ["/api/vendors"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/vendors"); const json = await r.json().catch(() => []); return json.data ?? json; },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/vendor-invoices", {
        ...form,
        vendorId: +form.vendorId,
        amount: +form.amount,
        taxAmount: +form.taxAmount,
        totalAmount: +form.totalAmount,
        entityId: form.entityId ? +form.entityId : undefined,
      });
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/vendor-invoices"] }); setShowCreate(false); toast({ title: "Vendor invoice created" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => { const r = await apiRequest("POST", `/api/vendor-invoices/${id}/approve`); return r.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/vendor-invoices"] }); queryClient.invalidateQueries({ queryKey: ["/api/payment-queue"] }); toast({ title: "Vendor invoice approved and added to payment queue" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: number) => { const r = await apiRequest("POST", `/api/vendor-invoices/${id}/reject`); return r.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/vendor-invoices"] }); toast({ title: "Vendor invoice rejected" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const invoices = data?.vendorInvoices || [];
  const vendors = vendorsQuery.data || [];

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white flex items-center gap-2"><FileText className="w-5 h-5 text-blue-400" /> Vendor Invoices</h1>
          <p className="text-xs text-white/30 mt-0.5">Manage vendor invoice submissions and approvals</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-xs">
          <Plus className="w-3 h-3 mr-1" />New Vendor Invoice
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Filter className="w-3.5 h-3.5 text-white/30" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48 h-8 text-xs"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="under_review">Under Review</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 bg-white/[0.04] rounded-lg" />
      ) : invoices.length === 0 ? (
        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardContent className="p-8 text-center">
            <DollarSign className="w-10 h-10 text-white/10 mx-auto mb-3" />
            <p className="text-sm text-white/30">No vendor invoices found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-white/[0.06] hover:bg-transparent">
                <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Invoice #</TableHead>
                <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Vendor</TableHead>
                <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Date</TableHead>
                <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Due Date</TableHead>
                <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3 text-right">Amount</TableHead>
                <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3 text-right">Total</TableHead>
                <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Status</TableHead>
                <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((row: any) => {
                const vi = row.vendorInvoice;
                return (
                  <TableRow key={vi.id} className="border-white/[0.06] hover:bg-white/[0.02]">
                    <TableCell className="text-xs text-white font-mono px-3 py-2">{vi.invoiceNumber}</TableCell>
                    <TableCell className="text-xs text-white/60 px-3 py-2">{row.vendorName || `Vendor #${vi.vendorId}`}</TableCell>
                    <TableCell className="text-xs text-white/40 px-3 py-2">{vi.invoiceDate}</TableCell>
                    <TableCell className="text-xs text-white/40 px-3 py-2">{vi.dueDate || "—"}</TableCell>
                    <TableCell className="text-xs text-white/60 px-3 py-2 text-right">{formatCurrency(vi.amount, vi.currency)}</TableCell>
                    <TableCell className="text-xs text-emerald-400 px-3 py-2 text-right font-medium">{formatCurrency(vi.totalAmount, vi.currency)}</TableCell>
                    <TableCell className="px-3 py-2">
                      <Badge className={`text-[10px] border ${STATUS_COLORS[vi.status] || "bg-zinc-500/15 text-zinc-400 border-zinc-500/25"}`}>
                        {vi.status?.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        {(vi.status === "submitted" || vi.status === "under_review") && (
                          <>
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-emerald-400 hover:bg-emerald-500/10"
                              onClick={() => approveMutation.mutate(vi.id)}>
                              <Check className="w-3 h-3 mr-0.5" />Approve
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-red-400 hover:bg-red-500/10"
                              onClick={() => rejectMutation.mutate(vi.id)}>
                              <X className="w-3 h-3 mr-0.5" />Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-[#1a1d27] border-white/[0.08] text-white max-w-lg">
          <DialogHeader><DialogTitle className="text-sm">New Vendor Invoice</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] text-white/40 block mb-0.5">Vendor</label>
              <Select value={form.vendorId} onValueChange={(v) => setForm(f => ({ ...f, vendorId: v }))}>
                <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm"><SelectValue placeholder="Select vendor..." /></SelectTrigger>
                <SelectContent>
                  {vendors.map((v: any) => <SelectItem key={v.id} value={String(v.id)}>{v.fullName || v.name || `Vendor #${v.id}`}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-white/40 block mb-0.5">Invoice Number</label>
                <Input value={form.invoiceNumber} onChange={e => setForm(f => ({ ...f, invoiceNumber: e.target.value }))} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" />
              </div>
              <div>
                <label className="text-[11px] text-white/40 block mb-0.5">Currency</label>
                <Select value={form.currency} onValueChange={(v) => setForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="TRY">TRY</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-white/40 block mb-0.5">Invoice Date</label>
                <Input type="date" value={form.invoiceDate} onChange={e => setForm(f => ({ ...f, invoiceDate: e.target.value }))} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" />
              </div>
              <div>
                <label className="text-[11px] text-white/40 block mb-0.5">Due Date</label>
                <Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] text-white/40 block mb-0.5">Amount</label>
                <Input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value, totalAmount: String(parseFloat(e.target.value || "0") + parseFloat(f.taxAmount || "0")) }))} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" />
              </div>
              <div>
                <label className="text-[11px] text-white/40 block mb-0.5">Tax</label>
                <Input type="number" step="0.01" value={form.taxAmount} onChange={e => setForm(f => ({ ...f, taxAmount: e.target.value, totalAmount: String(parseFloat(f.amount || "0") + parseFloat(e.target.value || "0")) }))} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" />
              </div>
              <div>
                <label className="text-[11px] text-white/40 block mb-0.5">Total</label>
                <Input type="number" step="0.01" value={form.totalAmount} onChange={e => setForm(f => ({ ...f, totalAmount: e.target.value }))} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" />
              </div>
            </div>
            <div>
              <label className="text-[11px] text-white/40 block mb-0.5">Notes</label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="bg-white/[0.04] border-white/[0.08] text-white text-sm resize-none" />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="ghost" onClick={() => setShowCreate(false)} className="text-white/50 text-xs">Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!form.vendorId || !form.invoiceNumber || !form.invoiceDate || !form.totalAmount || createMutation.isPending} className="bg-blue-600 hover:bg-blue-700 text-white text-xs">
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
