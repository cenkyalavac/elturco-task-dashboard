import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, ChevronLeft, ChevronRight, Loader2, ShoppingCart, Eye, Check, Send, Search,
} from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-500/15 text-slate-400 border-slate-500/20" },
  sent: { label: "Sent", className: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  accepted: { label: "Accepted", className: "bg-purple-500/15 text-purple-400 border-purple-500/20" },
  paid: { label: "Paid", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  cancelled: { label: "Cancelled", className: "bg-red-500/15 text-red-400 border-red-500/20" },
  rejected: { label: "Rejected", className: "bg-orange-500/15 text-orange-400 border-orange-500/20" },
  completed: { label: "Completed", className: "bg-teal-500/15 text-teal-400 border-teal-500/20" },
};

const PAGE_LIMIT = 20;

function formatCurrency(amount: string | number | null, currency: string = "EUR") {
  if (!amount) return "—";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "—";
  const symbol = currency === "GBP" ? "£" : currency === "EUR" ? "€" : "$";
  return `${symbol}${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try { return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); } catch { return dateStr; }
}

export default function PurchaseOrdersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [paymentDialogId, setPaymentDialogId] = useState<number | null>(null);

  const [vendorSearch, setVendorSearch] = useState("");

  const [form, setForm] = useState({
    vendorId: "",
    entityId: "",
    jobId: "",
    projectId: "",
    amount: "",
    currency: "EUR",
    paymentMethod: "wise",
    notes: "",
  });


  const [paymentForm, setPaymentForm] = useState({
    paymentDate: new Date().toISOString().split("T")[0],
    paymentMethod: "wise",
    reference: "",
  });

  const queryParams = new URLSearchParams();
  if (statusFilter !== "all") queryParams.set("status", statusFilter);
  if (entityFilter !== "all") queryParams.set("entityId", entityFilter);
  queryParams.set("page", String(page));
  queryParams.set("limit", String(PAGE_LIMIT));
  const qs = queryParams.toString();

  const { data: posData, isLoading } = useQuery({
    queryKey: [`/api/purchase-orders?${qs}`],
    queryFn: async () => { const r = await apiRequest("GET", `/api/purchase-orders?${qs}`); return r.json(); },
  });

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ["/api/purchase-orders", detailId],
    queryFn: async () => { const r = await apiRequest("GET", `/api/purchase-orders/${detailId}`); return r.json(); },
    enabled: !!detailId,
  });

  const { data: vendorsData } = useQuery({
    queryKey: ["/api/vendors?limit=500"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/vendors?limit=500"); return r.json(); },
  });

  const { data: entitiesData } = useQuery({
    queryKey: ["/api/entities"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/entities"); return r.json(); },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: any) => { const r = await apiRequest("POST", "/api/purchase-orders", payload); return r.json(); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({ title: "Purchase order created" });
      setCreateOpen(false);
      setForm({ vendorId: "", entityId: "", jobId: "", projectId: "", amount: "", currency: "EUR", paymentMethod: "wise", notes: "" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiRequest("POST", `/api/purchase-orders/${id}/send`);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({ title: "PO marked as sent" });
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiRequest("POST", `/api/purchase-orders/${id}/accept`);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({ title: "PO accepted" });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number; paymentDate: string; paymentMethod: string; reference: string }) => {
      const r = await apiRequest("POST", `/api/purchase-orders/${id}/mark-paid`, data);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({ title: "PO marked as paid" });
      setPaymentDialogId(null);
    },
  });

  function handleCreate() {
    if (!form.vendorId || !form.amount) {
      toast({ title: "Vendor and amount are required", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      vendorId: +form.vendorId,
      entityId: form.entityId ? +form.entityId : null,
      jobId: form.jobId ? +form.jobId : null,
      projectId: form.projectId ? +form.projectId : null,
      amount: form.amount,
      currency: form.currency,
      paymentMethod: form.paymentMethod,
      notes: form.notes || null,
    });
  }

  const orders = posData?.data || [];
  const total = posData?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));
  const vendorList = Array.isArray(vendorsData) ? vendorsData : vendorsData?.data || [];
  const entityList = Array.isArray(entitiesData) ? entitiesData : [];

  const filteredVendors = useMemo(() => {
    if (!vendorSearch.trim()) return vendorList;
    const q = vendorSearch.toLowerCase();
    return vendorList.filter((v: any) => v.fullName?.toLowerCase().includes(q));
  }, [vendorList, vendorSearch]);

  const getVendorName = (vendorId: number | null) => {
    if (!vendorId) return "\u2014";
    const v = vendorList.find((v: any) => v.id === vendorId);
    return v ? (v.fullName || v.name || `Vendor #${vendorId}`) : `Vendor #${vendorId}`;
  };

  // Detail view
  if (detailId) {
    const po = detailData;
    return (
      <div className="h-full flex flex-col">
        <div className="border-b border-border bg-card px-4 py-2.5 flex items-center gap-3">
          <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => setDetailId(null)}>
            <ChevronLeft className="w-3.5 h-3.5" /> Back
          </Button>
          <h1 className="text-sm font-semibold text-foreground">
            PO {po?.poNumber || `#${detailId}`}
          </h1>
          {po && (
            <Badge variant="outline" className={`ml-2 text-[10px] px-1.5 py-0 border ${STATUS_CONFIG[po.status]?.className || ""}`}>
              {STATUS_CONFIG[po.status]?.label || po.status}
            </Badge>
          )}
          <div className="ml-auto flex gap-2">
            {po?.status === "draft" && (
              <Button size="sm" className="h-7 text-xs gap-1" onClick={() => sendMutation.mutate(po.id)} disabled={sendMutation.isPending}>
                {sendMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Send PO
              </Button>
            )}
            {po?.status === "sent" && (
              <Button size="sm" className="h-7 text-xs gap-1" onClick={() => acceptMutation.mutate(po.id)} disabled={acceptMutation.isPending}>
                {acceptMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Mark Accepted
              </Button>
            )}
            {(po?.status === "sent" || po?.status === "accepted" || po?.status === "completed") && (
              <Button size="sm" className="h-7 text-xs gap-1" variant="default" onClick={() => setPaymentDialogId(po.id)}>
                <Check className="w-3 h-3" /> Mark Paid
              </Button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {detailLoading ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : po ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card><CardHeader className="py-2 px-3"><CardTitle className="text-xs text-muted-foreground">Vendor</CardTitle></CardHeader><CardContent className="px-3 pb-2 text-sm font-medium">{po.vendor?.fullName || "—"}</CardContent></Card>
                <Card><CardHeader className="py-2 px-3"><CardTitle className="text-xs text-muted-foreground">Entity</CardTitle></CardHeader><CardContent className="px-3 pb-2 text-sm font-medium">{po.entity?.name || "—"}</CardContent></Card>
                <Card><CardHeader className="py-2 px-3"><CardTitle className="text-xs text-muted-foreground">Amount</CardTitle></CardHeader><CardContent className="px-3 pb-2 text-sm font-bold">{formatCurrency(po.amount, po.currency)}</CardContent></Card>
                <Card><CardHeader className="py-2 px-3"><CardTitle className="text-xs text-muted-foreground">Payment Method</CardTitle></CardHeader><CardContent className="px-3 pb-2 text-sm">{po.paymentMethod || "—"}</CardContent></Card>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card><CardHeader className="py-2 px-3"><CardTitle className="text-xs text-muted-foreground">Created</CardTitle></CardHeader><CardContent className="px-3 pb-2 text-sm">{formatDate(po.createdAt)}</CardContent></Card>
                <Card><CardHeader className="py-2 px-3"><CardTitle className="text-xs text-muted-foreground">Payment Date</CardTitle></CardHeader><CardContent className="px-3 pb-2 text-sm">{formatDate(po.paymentDate)}</CardContent></Card>
                {po.projectId && <Card><CardHeader className="py-2 px-3"><CardTitle className="text-xs text-muted-foreground">Project ID</CardTitle></CardHeader><CardContent className="px-3 pb-2 text-sm">{po.projectId}</CardContent></Card>}
                {po.jobId && <Card><CardHeader className="py-2 px-3"><CardTitle className="text-xs text-muted-foreground">Job ID</CardTitle></CardHeader><CardContent className="px-3 pb-2 text-sm">{po.jobId}</CardContent></Card>}
              </div>
              {po.notes && (
                <Card><CardHeader className="py-2 px-3"><CardTitle className="text-xs font-semibold">Notes</CardTitle></CardHeader><CardContent className="px-3 pb-2 text-sm text-muted-foreground">{po.notes}</CardContent></Card>
              )}
            </>
          ) : <p className="text-sm text-muted-foreground">PO not found</p>}
        </div>

        <Dialog open={!!paymentDialogId} onOpenChange={(o) => { if (!o) setPaymentDialogId(null); }}>
          <DialogContent className="sm:max-w-sm bg-card">
            <DialogHeader><DialogTitle className="text-base">Record Payment</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1"><Label className="text-xs">Payment Date</Label><Input type="date" value={paymentForm.paymentDate} onChange={e => setPaymentForm(p => ({ ...p, paymentDate: e.target.value }))} className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label className="text-xs">Payment Method</Label>
                <Select value={paymentForm.paymentMethod} onValueChange={v => setPaymentForm(p => ({ ...p, paymentMethod: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wise">Wise</SelectItem>
                    <SelectItem value="smartcat">Smartcat</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label className="text-xs">Reference</Label><Input value={paymentForm.reference} onChange={e => setPaymentForm(p => ({ ...p, reference: e.target.value }))} className="h-8 text-sm" /></div>
            </div>
            <DialogFooter>
              <Button size="sm" className="h-8 text-xs" onClick={() => { if (paymentDialogId) markPaidMutation.mutate({ id: paymentDialogId, ...paymentForm }); }}>
                {markPaidMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Record Payment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // List view
  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-border bg-card px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-sm font-semibold text-foreground mr-2">Purchase Orders</h1>
          <Select value={statusFilter} onValueChange={v => { setPage(1); setStatusFilter(v); }}>
            <SelectTrigger className="w-32 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={entityFilter} onValueChange={v => { setPage(1); setEntityFilter(v); }}>
            <SelectTrigger className="w-40 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Entities</SelectItem>
              {entityList.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-auto tabular-nums">{total} PO{total !== 1 ? "s" : ""}</span>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="w-3.5 h-3.5" /> New PO
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded" />)}</div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <ShoppingCart className="w-10 h-10 opacity-30" />
            <p className="text-sm">No purchase orders found</p>
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
              <TableRow>
                <TableHead className="text-xs px-3 py-2">PO #</TableHead>
                <TableHead className="text-xs px-3 py-2">Vendor</TableHead>
                <TableHead className="text-xs px-3 py-2 w-28 text-right">Amount</TableHead>
                <TableHead className="text-xs px-3 py-2 w-28">Method</TableHead>
                <TableHead className="text-xs px-3 py-2 w-24">Date</TableHead>
                <TableHead className="text-xs px-3 py-2 w-24">Status</TableHead>
                <TableHead className="text-xs px-3 py-2 w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((po: any) => {
                const st = STATUS_CONFIG[po.status] || { label: po.status, className: "" };
                return (
                  <TableRow key={po.id} className="border-b border-border hover:bg-muted/30">
                    <TableCell className="px-3 py-2">
                      <button onClick={() => setDetailId(po.id)} className="text-sm font-medium text-primary hover:underline">
                        {po.poNumber || `PO-${po.id}`}
                      </button>
                    </TableCell>
                    <TableCell className="px-3 py-2 text-sm">{getVendorName(po.vendorId)}</TableCell>
                    <TableCell className="px-3 py-2 text-sm text-right font-medium">{formatCurrency(po.amount, po.currency)}</TableCell>
                    <TableCell className="px-3 py-2 text-xs text-muted-foreground">{po.paymentMethod || "—"}</TableCell>
                    <TableCell className="px-3 py-2 text-xs text-muted-foreground">{formatDate(po.createdAt)}</TableCell>
                    <TableCell className="px-3 py-2">
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${st.className}`}>{st.label}</Badge>
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      <div className="flex gap-1">
                        <button onClick={() => setDetailId(po.id)} className="p-1 rounded hover:bg-muted"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                        {(po.status === "sent" || po.status === "accepted") && (
                          <button onClick={() => setPaymentDialogId(po.id)} className="p-1 rounded hover:bg-muted"><Check className="w-3.5 h-3.5 text-emerald-400" /></button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {!isLoading && totalPages > 1 && (
        <div className="border-t border-border bg-card px-4 py-2 flex items-center justify-between">
          <span className="text-xs text-muted-foreground tabular-nums">Page {page} of {totalPages}</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}><ChevronLeft className="w-3.5 h-3.5" /></Button>
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}><ChevronRight className="w-3.5 h-3.5" /></Button>
          </div>
        </div>
      )}

      {/* Create PO Dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) setVendorSearch(""); }}>
        <DialogContent className="sm:max-w-lg bg-card">
          <DialogHeader><DialogTitle className="text-base font-semibold">Create Purchase Order</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Vendor <span className="text-destructive">*</span></Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <Input placeholder="Search vendors..." value={vendorSearch} onChange={e => setVendorSearch(e.target.value)} className="h-8 text-sm pl-8 mb-1.5" />
              </div>
              <Select value={form.vendorId || "none"} onValueChange={v => setForm(p => ({ ...p, vendorId: v === "none" ? "" : v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select vendor..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select vendor</SelectItem>
                  {filteredVendors.map((v: any) => <SelectItem key={v.id} value={String(v.id)}>{v.fullName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Entity</Label>
              <Select value={form.entityId || "none"} onValueChange={v => setForm(p => ({ ...p, entityId: v === "none" ? "" : v, currency: entityList.find((e: any) => String(e.id) === v)?.currency || "EUR" }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select entity</SelectItem>
                  {entityList.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.name} ({e.currency})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Job ID</Label>
                <Input value={form.jobId} onChange={e => setForm(p => ({ ...p, jobId: e.target.value }))} className="h-8 text-sm" type="number" placeholder="Link to job..." />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Project ID</Label>
                <Input value={form.projectId} onChange={e => setForm(p => ({ ...p, projectId: e.target.value }))} className="h-8 text-sm" type="number" placeholder="Link to project..." />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Amount <span className="text-destructive">*</span></Label>
                <Input value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} className="h-8 text-sm" type="number" step="0.01" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Currency</Label>
                <Select value={form.currency} onValueChange={v => setForm(p => ({ ...p, currency: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Payment Method</Label>
              <Select value={form.paymentMethod} onValueChange={v => setForm(p => ({ ...p, paymentMethod: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="wise">Wise</SelectItem>
                  <SelectItem value="smartcat">Smartcat</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="text-sm" rows={2} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleCreate} disabled={createMutation.isPending || !form.vendorId || !form.amount}>
              {createMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Create PO
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment dialog for list */}
      <Dialog open={!!paymentDialogId && !detailId} onOpenChange={(o) => { if (!o) setPaymentDialogId(null); }}>
        <DialogContent className="sm:max-w-sm bg-card">
          <DialogHeader><DialogTitle className="text-base">Record Payment</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><Label className="text-xs">Payment Date</Label><Input type="date" value={paymentForm.paymentDate} onChange={e => setPaymentForm(p => ({ ...p, paymentDate: e.target.value }))} className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Payment Method</Label>
              <Select value={paymentForm.paymentMethod} onValueChange={v => setPaymentForm(p => ({ ...p, paymentMethod: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="wise">Wise</SelectItem>
                  <SelectItem value="smartcat">Smartcat</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">Reference</Label><Input value={paymentForm.reference} onChange={e => setPaymentForm(p => ({ ...p, reference: e.target.value }))} className="h-8 text-sm" /></div>
          </div>
          <DialogFooter>
            <Button size="sm" className="h-8 text-xs" onClick={() => { if (paymentDialogId) markPaidMutation.mutate({ id: paymentDialogId, ...paymentForm }); }}>
              {markPaidMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
