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
  DollarSign, FileText, Trash2, Package,
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
  if (!amount) return "\u2014";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "\u2014";
  const symbol = currency === "GBP" ? "\u00a3" : currency === "EUR" ? "\u20ac" : "$";
  return `${symbol}${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "\u2014";
  try { return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); } catch { return dateStr; }
}

export default function PurchaseOrdersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
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

  // Line item state
  const [showAddLine, setShowAddLine] = useState(false);
  const [lineForm, setLineForm] = useState({
    description: "",
    quantity: "1",
    unit: "hour",
    unitPrice: "",
  });

  const queryParams = new URLSearchParams();
  if (statusFilter !== "all") queryParams.set("status", statusFilter);
  if (entityFilter !== "all") queryParams.set("entityId", entityFilter);
  if (vendorFilter !== "all") queryParams.set("vendorId", vendorFilter);
  if (searchQuery.trim()) queryParams.set("search", searchQuery.trim());
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
      if (detailId) queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders", detailId] });
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
      if (detailId) queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders", detailId] });
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
      if (detailId) queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders", detailId] });
      toast({ title: "PO marked as paid" });
      setPaymentDialogId(null);
    },
  });

  const addLineMutation = useMutation({
    mutationFn: async ({ poId, ...data }: { poId: number; description: string; quantity: number; unitPrice: number; unit: string }) => {
      const r = await apiRequest("POST", `/api/purchase-orders/${poId}/line-items`, data);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders", detailId] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({ title: "Line item added" });
      setShowAddLine(false);
      setLineForm({ description: "", quantity: "1", unit: "hour", unitPrice: "" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteLineMutation = useMutation({
    mutationFn: async ({ poId, lineId }: { poId: number; lineId: number }) => {
      const r = await apiRequest("DELETE", `/api/purchase-orders/${poId}/line-items/${lineId}`);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders", detailId] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({ title: "Line item removed" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
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

  function handleAddLine() {
    if (!lineForm.description || !lineForm.unitPrice || !detailId) {
      toast({ title: "Description and unit price are required", variant: "destructive" });
      return;
    }
    addLineMutation.mutate({
      poId: detailId,
      description: lineForm.description,
      quantity: parseFloat(lineForm.quantity) || 1,
      unitPrice: parseFloat(lineForm.unitPrice),
      unit: lineForm.unit,
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
    const lines: any[] = po?.lines || [];
    const subtotal = lines.reduce((sum: number, l: any) => sum + (parseFloat(l.amount || l.lineTotal || "0") || ((parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0))), 0);
    const taxRate = po?.taxRate ? parseFloat(po.taxRate) : 0;
    const taxAmount = subtotal * (taxRate / 100);
    const lineTotal = subtotal + taxAmount;
    const currency = po?.currency || "EUR";

    return (
      <div className="h-full flex flex-col bg-[#0a0a0f]">
        {/* Header bar */}
        <div className="border-b border-white/[0.06] bg-white/[0.02] px-5 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-white/60 hover:text-white hover:bg-white/[0.06]" onClick={() => setDetailId(null)}>
            <ChevronLeft className="w-3.5 h-3.5" /> Back
          </Button>
          <div className="h-4 w-px bg-white/[0.08]" />
          {detailLoading ? (
            <Skeleton className="h-5 w-48" />
          ) : po ? (
            <>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-400" />
                  <h1 className="text-base font-bold text-white tracking-tight">
                    {po.poNumber || `PO-${detailId}`}
                  </h1>
                </div>
                <Badge variant="outline" className={`rounded-full px-2.5 py-0.5 text-xs font-medium border ${STATUS_CONFIG[po.status]?.className || ""}`}>
                  {STATUS_CONFIG[po.status]?.label || po.status}
                </Badge>
              </div>
            </>
          ) : null}
          <div className="ml-auto flex gap-2">
            {po?.status === "draft" && (
              <Button size="sm" className="h-8 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => sendMutation.mutate(po.id)} disabled={sendMutation.isPending}>
                {sendMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Send PO
              </Button>
            )}
            {po?.status === "sent" && (
              <Button size="sm" className="h-8 text-xs gap-1.5 bg-purple-600 hover:bg-purple-700 text-white" onClick={() => acceptMutation.mutate(po.id)} disabled={acceptMutation.isPending}>
                {acceptMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Mark Accepted
              </Button>
            )}
            {po?.status === "accepted" && (
              <Button size="sm" className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setPaymentDialogId(po.id)}>
                <DollarSign className="w-3.5 h-3.5" /> Record Payment
              </Button>
            )}
            {(po?.status === "sent" || po?.status === "completed") && (
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 border-white/[0.1] hover:bg-white/[0.06]" onClick={() => setPaymentDialogId(po.id)}>
                <DollarSign className="w-3.5 h-3.5" /> Mark Paid
              </Button>
            )}
          </div>
        </div>

        {/* Detail content */}
        <div className="flex-1 overflow-auto p-5 space-y-5">
          {detailLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
            </div>
          ) : po ? (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3.5 shadow-lg">
                  <p className="text-[10px] uppercase tracking-wider text-white/40 font-medium mb-1">Vendor</p>
                  <p className="text-sm font-semibold text-white">{po.vendor?.fullName || "\u2014"}</p>
                </div>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3.5 shadow-lg">
                  <p className="text-[10px] uppercase tracking-wider text-white/40 font-medium mb-1">Entity</p>
                  <p className="text-sm font-semibold text-white">{po.entity?.name || "\u2014"}</p>
                </div>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3.5 shadow-lg">
                  <p className="text-[10px] uppercase tracking-wider text-white/40 font-medium mb-1">Total Amount</p>
                  <p className="text-sm font-bold text-emerald-400">{formatCurrency(po.amount, po.currency)}</p>
                </div>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3.5 shadow-lg">
                  <p className="text-[10px] uppercase tracking-wider text-white/40 font-medium mb-1">Payment Method</p>
                  <p className="text-sm font-semibold text-white capitalize">{po.paymentMethod || "\u2014"}</p>
                </div>
              </div>

              {/* Secondary info row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3.5 shadow-lg">
                  <p className="text-[10px] uppercase tracking-wider text-white/40 font-medium mb-1">Created</p>
                  <p className="text-sm text-white/80">{formatDate(po.createdAt)}</p>
                </div>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3.5 shadow-lg">
                  <p className="text-[10px] uppercase tracking-wider text-white/40 font-medium mb-1">Payment Date</p>
                  <p className="text-sm text-white/80">{formatDate(po.paymentDate)}</p>
                </div>
                {po.projectId && (
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3.5 shadow-lg">
                    <p className="text-[10px] uppercase tracking-wider text-white/40 font-medium mb-1">Project ID</p>
                    <p className="text-sm text-white/80">{po.projectId}</p>
                  </div>
                )}
                {po.jobId && (
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3.5 shadow-lg">
                    <p className="text-[10px] uppercase tracking-wider text-white/40 font-medium mb-1">Job ID</p>
                    <p className="text-sm text-white/80">{po.jobId}</p>
                  </div>
                )}
              </div>

              {/* Notes */}
              {po.notes && (
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 shadow-lg">
                  <p className="text-[10px] uppercase tracking-wider text-white/40 font-medium mb-2">Notes</p>
                  <p className="text-sm text-white/70 leading-relaxed">{po.notes}</p>
                </div>
              )}

              {/* Line Items Section */}
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl shadow-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-blue-400" />
                    <h2 className="text-sm font-semibold text-white">Line Items</h2>
                    {lines.length > 0 && (
                      <span className="text-[10px] text-white/40 bg-white/[0.06] rounded-full px-2 py-0.5 font-medium">{lines.length}</span>
                    )}
                  </div>
                  {po.status === "draft" && (
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/20"
                      variant="outline"
                      onClick={() => setShowAddLine(true)}
                    >
                      <Plus className="w-3 h-3" /> Add Line Item
                    </Button>
                  )}
                </div>

                {lines.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2 text-white/30">
                    <Package className="w-8 h-8 opacity-40" />
                    <p className="text-sm">No line items yet</p>
                    {po.status === "draft" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-600/10 mt-1"
                        onClick={() => setShowAddLine(true)}
                      >
                        <Plus className="w-3 h-3 mr-1" /> Add your first line item
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-white/[0.06] hover:bg-transparent">
                            <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3 px-4">Description</TableHead>
                            <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3 px-4 text-right w-20">Qty</TableHead>
                            <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3 px-4 w-24">Unit</TableHead>
                            <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3 px-4 text-right w-28">Unit Price</TableHead>
                            <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3 px-4 text-right w-28">Amount</TableHead>
                            {po.status === "draft" && (
                              <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3 px-4 w-12"></TableHead>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lines.map((line: any) => {
                            const qty = parseFloat(line.quantity) || 0;
                            const price = parseFloat(line.unitPrice) || 0;
                            const lineAmt = parseFloat(line.amount || line.lineTotal || "0") || (qty * price);
                            return (
                              <TableRow key={line.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                                <TableCell className="px-4 py-2.5 text-sm text-white/80">{line.description}</TableCell>
                                <TableCell className="px-4 py-2.5 text-sm text-white/60 text-right tabular-nums">{qty}</TableCell>
                                <TableCell className="px-4 py-2.5 text-xs text-white/40 capitalize">{line.unit || "\u2014"}</TableCell>
                                <TableCell className="px-4 py-2.5 text-sm text-white/60 text-right tabular-nums">{formatCurrency(price, currency)}</TableCell>
                                <TableCell className="px-4 py-2.5 text-sm font-medium text-white text-right tabular-nums">{formatCurrency(lineAmt, currency)}</TableCell>
                                {po.status === "draft" && (
                                  <TableCell className="px-4 py-2.5">
                                    <button
                                      onClick={() => deleteLineMutation.mutate({ poId: po.id, lineId: line.id })}
                                      className="p-1 rounded hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-colors"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </TableCell>
                                )}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Totals */}
                    <div className="border-t border-white/[0.06] px-4 py-3">
                      <div className="flex flex-col items-end gap-1.5">
                        <div className="flex items-center gap-6 text-sm">
                          <span className="text-white/40">Subtotal</span>
                          <span className="text-white/80 tabular-nums w-28 text-right">{formatCurrency(subtotal, currency)}</span>
                        </div>
                        {taxRate > 0 && (
                          <div className="flex items-center gap-6 text-sm">
                            <span className="text-white/40">Tax ({taxRate}%)</span>
                            <span className="text-white/80 tabular-nums w-28 text-right">{formatCurrency(taxAmount, currency)}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-6 text-sm pt-1.5 border-t border-white/[0.06] mt-1">
                          <span className="text-white/60 font-medium">Total</span>
                          <span className="text-white font-bold tabular-nums w-28 text-right">{formatCurrency(lineTotal > 0 ? lineTotal : po.amount, currency)}</span>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-white/30">
              <FileText className="w-10 h-10 opacity-30" />
              <p className="text-sm">Purchase order not found</p>
              <Button variant="ghost" size="sm" className="text-xs text-blue-400 hover:text-blue-300" onClick={() => setDetailId(null)}>
                Return to list
              </Button>
            </div>
          )}
        </div>

        {/* Add Line Item Dialog */}
        <Dialog open={showAddLine} onOpenChange={setShowAddLine}>
          <DialogContent className="sm:max-w-md bg-[#12121a] border-white/[0.08]">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold text-white">Add Line Item</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-white/60">Description <span className="text-red-400">*</span></Label>
                <Input
                  value={lineForm.description}
                  onChange={e => setLineForm(p => ({ ...p, description: e.target.value }))}
                  className="h-9 text-sm bg-white/[0.04] border-white/[0.08] focus:border-blue-500/50"
                  placeholder="e.g. Translation EN > DE, 5000 words"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-white/60">Quantity</Label>
                  <Input
                    value={lineForm.quantity}
                    onChange={e => setLineForm(p => ({ ...p, quantity: e.target.value }))}
                    className="h-9 text-sm bg-white/[0.04] border-white/[0.08] focus:border-blue-500/50"
                    type="number"
                    step="0.01"
                    min="0"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-white/60">Unit</Label>
                  <Select value={lineForm.unit} onValueChange={v => setLineForm(p => ({ ...p, unit: v }))}>
                    <SelectTrigger className="h-9 text-sm bg-white/[0.04] border-white/[0.08]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hour">Hour</SelectItem>
                      <SelectItem value="word">Word</SelectItem>
                      <SelectItem value="page">Page</SelectItem>
                      <SelectItem value="file">File</SelectItem>
                      <SelectItem value="unit">Unit</SelectItem>
                      <SelectItem value="fixed">Fixed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-white/60">Unit Price <span className="text-red-400">*</span></Label>
                  <Input
                    value={lineForm.unitPrice}
                    onChange={e => setLineForm(p => ({ ...p, unitPrice: e.target.value }))}
                    className="h-9 text-sm bg-white/[0.04] border-white/[0.08] focus:border-blue-500/50"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                  />
                </div>
              </div>
              {lineForm.quantity && lineForm.unitPrice && (
                <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 flex items-center justify-between">
                  <span className="text-xs text-white/40">Line Amount</span>
                  <span className="text-sm font-semibold text-white tabular-nums">
                    {formatCurrency((parseFloat(lineForm.quantity) || 0) * (parseFloat(lineForm.unitPrice) || 0), currency)}
                  </span>
                </div>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" className="h-8 text-xs border-white/[0.1] hover:bg-white/[0.06]" onClick={() => setShowAddLine(false)}>Cancel</Button>
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleAddLine}
                disabled={addLineMutation.isPending || !lineForm.description || !lineForm.unitPrice}
              >
                {addLineMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Add Line Item
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Payment Dialog for detail */}
        <Dialog open={!!paymentDialogId} onOpenChange={(o) => { if (!o) setPaymentDialogId(null); }}>
          <DialogContent className="sm:max-w-sm bg-[#12121a] border-white/[0.08]">
            <DialogHeader><DialogTitle className="text-base font-semibold text-white">Record Payment</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-white/60">Payment Date</Label>
                <Input type="date" value={paymentForm.paymentDate} onChange={e => setPaymentForm(p => ({ ...p, paymentDate: e.target.value }))} className="h-9 text-sm bg-white/[0.04] border-white/[0.08]" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-white/60">Payment Method</Label>
                <Select value={paymentForm.paymentMethod} onValueChange={v => setPaymentForm(p => ({ ...p, paymentMethod: v }))}>
                  <SelectTrigger className="h-9 text-sm bg-white/[0.04] border-white/[0.08]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wise">Wise</SelectItem>
                    <SelectItem value="smartcat">Smartcat</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-white/60">Reference</Label>
                <Input value={paymentForm.reference} onChange={e => setPaymentForm(p => ({ ...p, reference: e.target.value }))} className="h-9 text-sm bg-white/[0.04] border-white/[0.08]" />
              </div>
            </div>
            <DialogFooter>
              <Button size="sm" className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => { if (paymentDialogId) markPaidMutation.mutate({ id: paymentDialogId, ...paymentForm }); }}>
                {markPaidMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DollarSign className="w-3.5 h-3.5" />}
                Record Payment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // List view
  return (
    <div className="h-full flex flex-col bg-[#0a0a0f]">
      {/* Header / Filters */}
      <div className="border-b border-white/[0.06] bg-white/[0.02] px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 mr-3">
            <ShoppingCart className="w-4 h-4 text-blue-400" />
            <h1 className="text-sm font-semibold text-white">Purchase Orders</h1>
          </div>
          <Select value={statusFilter} onValueChange={v => { setPage(1); setStatusFilter(v); }}>
            <SelectTrigger className="w-32 h-8 text-xs bg-white/[0.04] border-white/[0.08]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={entityFilter} onValueChange={v => { setPage(1); setEntityFilter(v); }}>
            <SelectTrigger className="w-40 h-8 text-xs bg-white/[0.04] border-white/[0.08]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Entities</SelectItem>
              {entityList.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={vendorFilter} onValueChange={v => { setPage(1); setVendorFilter(v); }}>
            <SelectTrigger className="w-40 h-8 text-xs bg-white/[0.04] border-white/[0.08]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vendors</SelectItem>
              {vendorList.slice(0, 50).map((v: any) => <SelectItem key={v.id} value={String(v.id)}>{v.fullName}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
            <Input
              placeholder="Search POs..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
              className="h-8 text-xs pl-8 w-44 bg-white/[0.04] border-white/[0.08] placeholder:text-white/25"
            />
          </div>
          <span className="text-xs text-white/40 ml-auto tabular-nums font-medium">{total} PO{total !== 1 ? "s" : ""}</span>
          <Button size="sm" className="h-8 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setCreateOpen(true)}>
            <Plus className="w-3.5 h-3.5" /> New PO
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-5 space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-11 w-full rounded-lg" />)}</div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-white/30 p-12">
            <ShoppingCart className="w-12 h-12 opacity-30" />
            <p className="text-sm font-medium">No purchase orders found</p>
            <p className="text-xs text-white/20">Adjust filters or create a new purchase order.</p>
            <Button size="sm" className="h-8 text-xs gap-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/20 mt-2" variant="outline" onClick={() => setCreateOpen(true)}>
              <Plus className="w-3.5 h-3.5" /> Create PO
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border border-white/[0.06] m-4 overflow-hidden bg-white/[0.01]">
            <Table>
              <TableHeader>
                <TableRow className="border-white/[0.06] hover:bg-transparent">
                  <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3 px-4">PO #</TableHead>
                  <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3 px-4">Vendor</TableHead>
                  <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3 px-4 w-28 text-right">Amount</TableHead>
                  <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3 px-4 w-28">Method</TableHead>
                  <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3 px-4 w-24">Date</TableHead>
                  <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3 px-4 w-24">Status</TableHead>
                  <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3 px-4 w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((po: any) => {
                  const st = STATUS_CONFIG[po.status] || { label: po.status, className: "" };
                  return (
                    <TableRow key={po.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                      <TableCell className="px-4 py-2.5">
                        <button onClick={() => setDetailId(po.id)} className="text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors">
                          {po.poNumber || `PO-${po.id}`}
                        </button>
                      </TableCell>
                      <TableCell className="px-4 py-2.5 text-sm text-white/70">{getVendorName(po.vendorId)}</TableCell>
                      <TableCell className="px-4 py-2.5 text-sm text-right font-semibold text-white tabular-nums">{formatCurrency(po.amount, po.currency)}</TableCell>
                      <TableCell className="px-4 py-2.5 text-xs text-white/40 capitalize">{po.paymentMethod || "\u2014"}</TableCell>
                      <TableCell className="px-4 py-2.5 text-xs text-white/40">{formatDate(po.createdAt)}</TableCell>
                      <TableCell className="px-4 py-2.5">
                        <Badge variant="outline" className={`rounded-full px-2.5 py-0.5 text-xs font-medium border ${st.className}`}>{st.label}</Badge>
                      </TableCell>
                      <TableCell className="px-4 py-2.5">
                        <div className="flex gap-1">
                          <button onClick={() => setDetailId(po.id)} className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors" title="View details">
                            <Eye className="w-3.5 h-3.5 text-white/40 hover:text-white/70" />
                          </button>
                          {(po.status === "sent" || po.status === "accepted") && (
                            <button onClick={() => setPaymentDialogId(po.id)} className="p-1.5 rounded-lg hover:bg-emerald-500/10 transition-colors" title="Record payment">
                              <DollarSign className="w-3.5 h-3.5 text-emerald-400/60 hover:text-emerald-400" />
                            </button>
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
      </div>

      {/* Pagination */}
      {!isLoading && totalPages > 1 && (
        <div className="border-t border-white/[0.06] bg-white/[0.02] px-5 py-2.5 flex items-center justify-between">
          <span className="text-xs text-white/40 tabular-nums font-medium">Page {page} of {totalPages}</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 w-7 p-0 border-white/[0.08] hover:bg-white/[0.06]" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <Button variant="outline" size="sm" className="h-7 w-7 p-0 border-white/[0.08] hover:bg-white/[0.06]" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Create PO Dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) setVendorSearch(""); }}>
        <DialogContent className="sm:max-w-lg bg-[#12121a] border-white/[0.08]">
          <DialogHeader><DialogTitle className="text-base font-semibold text-white">Create Purchase Order</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Vendor <span className="text-red-400">*</span></Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
                <Input placeholder="Search vendors..." value={vendorSearch} onChange={e => setVendorSearch(e.target.value)} className="h-9 text-sm pl-8 mb-1.5 bg-white/[0.04] border-white/[0.08]" />
              </div>
              <Select value={form.vendorId || "none"} onValueChange={v => setForm(p => ({ ...p, vendorId: v === "none" ? "" : v }))}>
                <SelectTrigger className="h-9 text-sm bg-white/[0.04] border-white/[0.08]"><SelectValue placeholder="Select vendor..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select vendor</SelectItem>
                  {filteredVendors.map((v: any) => <SelectItem key={v.id} value={String(v.id)}>{v.fullName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Entity</Label>
              <Select value={form.entityId || "none"} onValueChange={v => { const ent = entityList.find((e: any) => String(e.id) === v); setForm(p => ({ ...p, entityId: v === "none" ? "" : v, currency: ent?.defaultCurrency || ent?.currency || "EUR" })); }}>
                <SelectTrigger className="h-9 text-sm bg-white/[0.04] border-white/[0.08]"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select entity</SelectItem>
                  {entityList.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.name} ({e.defaultCurrency || e.currency})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-white/60">Job ID</Label>
                <Input value={form.jobId} onChange={e => setForm(p => ({ ...p, jobId: e.target.value }))} className="h-9 text-sm bg-white/[0.04] border-white/[0.08]" type="number" placeholder="Link to job..." />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-white/60">Project ID</Label>
                <Input value={form.projectId} onChange={e => setForm(p => ({ ...p, projectId: e.target.value }))} className="h-9 text-sm bg-white/[0.04] border-white/[0.08]" type="number" placeholder="Link to project..." />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-white/60">Amount <span className="text-red-400">*</span></Label>
                <Input value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} className="h-9 text-sm bg-white/[0.04] border-white/[0.08]" type="number" step="0.01" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-white/60">Currency</Label>
                <Select value={form.currency} onValueChange={v => setForm(p => ({ ...p, currency: v }))}>
                  <SelectTrigger className="h-9 text-sm bg-white/[0.04] border-white/[0.08]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Payment Method</Label>
              <Select value={form.paymentMethod} onValueChange={v => setForm(p => ({ ...p, paymentMethod: v }))}>
                <SelectTrigger className="h-9 text-sm bg-white/[0.04] border-white/[0.08]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="wise">Wise</SelectItem>
                  <SelectItem value="smartcat">Smartcat</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="text-sm bg-white/[0.04] border-white/[0.08]" rows={2} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs border-white/[0.1] hover:bg-white/[0.06]" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button size="sm" className="h-8 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white" onClick={handleCreate} disabled={createMutation.isPending || !form.vendorId || !form.amount}>
              {createMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Create PO
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment dialog for list */}
      <Dialog open={!!paymentDialogId && !detailId} onOpenChange={(o) => { if (!o) setPaymentDialogId(null); }}>
        <DialogContent className="sm:max-w-sm bg-[#12121a] border-white/[0.08]">
          <DialogHeader><DialogTitle className="text-base font-semibold text-white">Record Payment</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Payment Date</Label>
              <Input type="date" value={paymentForm.paymentDate} onChange={e => setPaymentForm(p => ({ ...p, paymentDate: e.target.value }))} className="h-9 text-sm bg-white/[0.04] border-white/[0.08]" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Payment Method</Label>
              <Select value={paymentForm.paymentMethod} onValueChange={v => setPaymentForm(p => ({ ...p, paymentMethod: v }))}>
                <SelectTrigger className="h-9 text-sm bg-white/[0.04] border-white/[0.08]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="wise">Wise</SelectItem>
                  <SelectItem value="smartcat">Smartcat</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Reference</Label>
              <Input value={paymentForm.reference} onChange={e => setPaymentForm(p => ({ ...p, reference: e.target.value }))} className="h-9 text-sm bg-white/[0.04] border-white/[0.08]" />
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => { if (paymentDialogId) markPaidMutation.mutate({ id: paymentDialogId, ...paymentForm }); }}>
              {markPaidMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DollarSign className="w-3.5 h-3.5" />}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
