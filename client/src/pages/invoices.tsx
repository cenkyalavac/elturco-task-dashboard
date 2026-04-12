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
  Plus, ChevronLeft, ChevronRight, Loader2, FileText, Send, Check,
  Ban, Eye, Trash2, AlertCircle, Search, Download, CreditCard,
} from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-500/15 text-slate-400 border-slate-500/20" },
  sent: { label: "Sent", className: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  paid: { label: "Paid", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  overdue: { label: "Overdue", className: "bg-red-500/15 text-red-400 border-red-500/20" },
  cancelled: { label: "Cancelled", className: "bg-orange-500/15 text-orange-400 border-orange-500/20" },
};

interface InvoiceLine {
  id?: number;
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
}

const PAGE_LIMIT = 20;

function formatCurrency(amount: string | number | null, currency: string = "EUR"): string {
  if (!amount && amount !== 0) return "\u2014";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "\u2014";
  const symbol = currency === "GBP" ? "\u00A3" : currency === "EUR" ? "\u20AC" : currency === "TRY" ? "\u20BA" : "$";
  return `${symbol}${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "\u2014";
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function getCustomerName(inv: any, customerMap: Map<number, string>): string {
  if (inv.customerName) return inv.customerName;
  if (inv.customer?.name) return inv.customer.name;
  return customerMap.get(inv.customerId) || `Customer #${inv.customerId}`;
}

export default function InvoicesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [paymentDialogId, setPaymentDialogId] = useState<number | null>(null);
  const [showAddLineDialog, setShowAddLineDialog] = useState(false);
  const [detailLineForm, setDetailLineForm] = useState({ description: "", quantity: "1", unitPrice: "0" });

  // Create form state
  const [form, setForm] = useState({
    customerId: "",
    entityId: "",
    invoiceDate: new Date().toISOString().split("T")[0],
    dueDate: "",
    currency: "EUR",
    taxAmount: "0",
    notes: "",
  });
  const [lines, setLines] = useState<InvoiceLine[]>([
    { description: "", quantity: "1", unitPrice: "0", amount: "0" },
  ]);

  // Payment form
  const [paymentForm, setPaymentForm] = useState({
    paymentDate: new Date().toISOString().split("T")[0],
    paymentMethod: "",
    reference: "",
  });

  // Build query params
  const queryParams = new URLSearchParams();
  if (statusFilter !== "all") queryParams.set("status", statusFilter);
  if (entityFilter !== "all") queryParams.set("entityId", entityFilter);
  if (customerFilter !== "all") queryParams.set("customerId", customerFilter);
  if (searchQuery.trim()) queryParams.set("search", searchQuery.trim());
  queryParams.set("page", String(page));
  queryParams.set("limit", String(PAGE_LIMIT));
  const qs = queryParams.toString();

  const { data: invoicesData, isLoading } = useQuery({
    queryKey: [`/api/invoices?${qs}`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/invoices?${qs}`);
      return res.json();
    },
  });

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ["/api/invoices", detailId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/invoices/${detailId}`);
      return res.json();
    },
    enabled: !!detailId,
  });

  const { data: customers } = useQuery({
    queryKey: ["/api/customers"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/customers");
      return r.json();
    },
  });

  const { data: entitiesData } = useQuery({
    queryKey: ["/api/entities"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/entities");
      return r.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest("POST", "/api/invoices", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Invoice created" });
      setCreateOpen(false);
      resetForm();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (id: number) => {
      try {
        const res = await apiRequest("POST", `/api/invoices/${id}/send`);
        return res.json();
      } catch {
        const res = await apiRequest("PATCH", `/api/invoices/${id}`, { status: "sent" });
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      if (detailId) queryClient.invalidateQueries({ queryKey: ["/api/invoices", detailId] });
      toast({ title: "Invoice marked as sent" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number; paymentDate: string; paymentMethod: string; reference: string }) => {
      try {
        const res = await apiRequest("POST", `/api/invoices/${id}/mark-paid`, data);
        return res.json();
      } catch {
        const res = await apiRequest("PATCH", `/api/invoices/${id}`, {
          status: "paid",
          paymentDate: data.paymentDate,
          paymentMethod: data.paymentMethod,
          paymentReference: data.reference,
        });
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      if (detailId) queryClient.invalidateQueries({ queryKey: ["/api/invoices", detailId] });
      toast({ title: "Invoice marked as paid" });
      setPaymentDialogId(null);
      setPaymentForm({ paymentDate: new Date().toISOString().split("T")[0], paymentMethod: "", reference: "" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("PATCH", `/api/invoices/${id}`, { status: "cancelled" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Invoice cancelled" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const addLineToInvoiceMutation = useMutation({
    mutationFn: async ({ invoiceId, ...lineData }: { invoiceId: number; description: string; quantity: number; unitPrice: number }) => {
      const res = await apiRequest("POST", `/api/invoices/${invoiceId}/lines`, lineData);
      return res.json();
    },
    onSuccess: () => {
      if (detailId) queryClient.invalidateQueries({ queryKey: ["/api/invoices", detailId] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Line item added" });
      setShowAddLineDialog(false);
      setDetailLineForm({ description: "", quantity: "1", unitPrice: "0" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const voidMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("PATCH", `/api/invoices/${id}`, { status: "cancelled" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      if (detailId) queryClient.invalidateQueries({ queryKey: ["/api/invoices", detailId] });
      toast({ title: "Invoice voided" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const { data: invoicePayments } = useQuery({
    queryKey: ["/api/invoices", detailId, "payments"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/payments?invoiceId=${detailId}`);
      return r.json().catch(() => []);
    },
    enabled: !!detailId,
  });

  function resetForm() {
    setForm({
      customerId: "", entityId: "",
      invoiceDate: new Date().toISOString().split("T")[0],
      dueDate: "", currency: "EUR", taxAmount: "0", notes: "",
    });
    setLines([{ description: "", quantity: "1", unitPrice: "0", amount: "0" }]);
  }

  function updateLine(idx: number, field: keyof InvoiceLine, value: string) {
    setLines(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      if (field === "quantity" || field === "unitPrice") {
        const qty = parseFloat(updated[idx].quantity) || 0;
        const price = parseFloat(updated[idx].unitPrice) || 0;
        updated[idx].amount = (qty * price).toFixed(2);
      }
      return updated;
    });
  }

  function addLine() {
    setLines(prev => [...prev, { description: "", quantity: "1", unitPrice: "0", amount: "0" }]);
  }

  function removeLine(idx: number) {
    if (lines.length <= 1) return;
    setLines(prev => prev.filter((_, i) => i !== idx));
  }

  function handleCreate() {
    if (!form.customerId) {
      toast({ title: "Customer is required", variant: "destructive" });
      return;
    }
    const validLines = lines.filter(l => l.description.trim());
    if (validLines.length === 0) {
      toast({ title: "At least one line item is required", variant: "destructive" });
      return;
    }
    const sub = validLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
    const t = parseFloat(form.taxAmount) || 0;
    createMutation.mutate({
      customerId: +form.customerId,
      entityId: form.entityId ? +form.entityId : null,
      invoiceDate: form.invoiceDate,
      dueDate: form.dueDate || null,
      currency: form.currency,
      subtotal: sub.toFixed(2),
      taxAmount: form.taxAmount,
      total: (sub + t).toFixed(2),
      notes: form.notes || null,
      lines: validLines.map(l => ({
        description: l.description,
        quantity: parseFloat(l.quantity) || 0,
        unitPrice: parseFloat(l.unitPrice) || 0,
        amount: parseFloat(l.amount) || 0,
      })),
    });
  }

  const invoices = invoicesData?.data || [];
  const total = invoicesData?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));
  const customerList = Array.isArray(customers) ? customers : customers?.data || [];
  const entityList = Array.isArray(entitiesData) ? entitiesData : [];

  const customerMap = useMemo(() => {
    const map = new Map<number, string>();
    customerList.forEach((c: any) => map.set(c.id, c.name));
    return map;
  }, [customerList]);

  // Client-side search filter
  const filteredInvoices = useMemo(() => {
    if (!searchQuery.trim()) return invoices;
    const q = searchQuery.toLowerCase();
    return invoices.filter((inv: any) => {
      const name = getCustomerName(inv, customerMap).toLowerCase();
      const num = (inv.invoiceNumber || `INV-${inv.id}`).toLowerCase();
      return name.includes(q) || num.includes(q);
    });
  }, [invoices, searchQuery, customerMap]);

  const subtotal = lines.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);
  const tax = parseFloat(form.taxAmount) || 0;
  const grandTotal = subtotal + tax;

  // Detail view
  if (detailId) {
    const inv = detailData;
    const payments = Array.isArray(invoicePayments) ? invoicePayments : [];
    return (
      <div className="h-full flex flex-col">
        <div className="border-b border-white/[0.06] bg-white/[0.02] px-4 py-2.5 flex items-center gap-3">
          <Button variant="ghost" size="sm" className="h-8 gap-1 text-white/60 hover:text-white hover:bg-white/[0.06]" onClick={() => setDetailId(null)}>
            <ChevronLeft className="w-3.5 h-3.5" /> Back
          </Button>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-white tracking-tight">
              {inv?.invoiceNumber || `INV-${detailId}`}
            </h1>
            {inv && (
              <Badge className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CONFIG[inv.status]?.className || "bg-white/10 text-white/60"}`}>
                {STATUS_CONFIG[inv.status]?.label || inv.status}
              </Badge>
            )}
          </div>
          <div className="ml-auto flex gap-2">
            {inv?.status === "draft" && (
              <Button size="sm" className="h-7 text-xs gap-1 bg-white text-black hover:bg-white/90 font-medium rounded-lg" onClick={() => sendMutation.mutate(inv.id)} disabled={sendMutation.isPending}>
                {sendMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                Send Invoice
              </Button>
            )}
            {(inv?.status === "sent" || inv?.status === "overdue") && (
              <Button size="sm" className="h-7 text-xs gap-1 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded-lg" onClick={() => setPaymentDialogId(inv.id)}>
                <CreditCard className="w-3 h-3" /> Record Payment
              </Button>
            )}
            {(inv?.status === "draft" || inv?.status === "sent") && (
              <Button size="sm" className="h-7 text-xs gap-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg" onClick={() => voidMutation.mutate(inv.id)} disabled={voidMutation.isPending}>
                <Ban className="w-3 h-3" /> Void
              </Button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {detailLoading ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : inv ? (
            <>
              {/* Info Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="bg-white/[0.03] border-white/[0.06] rounded-xl"><CardHeader className="py-2 px-3"><CardTitle className="text-[10px] text-white/40 uppercase tracking-wider">Customer</CardTitle></CardHeader><CardContent className="px-3 pb-2 text-sm font-medium text-white">{getCustomerName(inv, customerMap)}</CardContent></Card>
                <Card className="bg-white/[0.03] border-white/[0.06] rounded-xl"><CardHeader className="py-2 px-3"><CardTitle className="text-[10px] text-white/40 uppercase tracking-wider">Entity</CardTitle></CardHeader><CardContent className="px-3 pb-2 text-sm font-medium text-white">{inv.entity?.name || "\u2014"}</CardContent></Card>
                <Card className="bg-white/[0.03] border-white/[0.06] rounded-xl"><CardHeader className="py-2 px-3"><CardTitle className="text-[10px] text-white/40 uppercase tracking-wider">Invoice Date</CardTitle></CardHeader><CardContent className="px-3 pb-2 text-sm text-white/80">{formatDate(inv.invoiceDate)}</CardContent></Card>
                <Card className="bg-white/[0.03] border-white/[0.06] rounded-xl"><CardHeader className="py-2 px-3"><CardTitle className="text-[10px] text-white/40 uppercase tracking-wider">Due Date</CardTitle></CardHeader><CardContent className="px-3 pb-2 text-sm text-white/80">{formatDate(inv.dueDate)}</CardContent></Card>
              </div>

              {/* Line Items */}
              <Card className="bg-white/[0.03] border-white/[0.06] rounded-xl shadow-lg">
                <CardHeader className="py-2.5 px-3 flex flex-row items-center justify-between">
                  <CardTitle className="text-xs font-semibold text-white/80">Line Items</CardTitle>
                  {inv.status === "draft" && (
                    <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 bg-white/[0.06] border-white/[0.1] text-white/70 hover:bg-white/[0.1]" onClick={() => setShowAddLineDialog(true)}>
                      <Plus className="w-3 h-3" /> Add Line
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-white/[0.04]">
                        <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3 px-3">Description</TableHead>
                        <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3 px-3 w-24 text-right">Qty</TableHead>
                        <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3 px-3 w-28 text-right">Unit Price</TableHead>
                        <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3 px-3 w-28 text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(inv.lines || []).map((line: any, idx: number) => (
                        <TableRow key={line.id || idx} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                          <TableCell className="px-3 py-2 text-sm text-white/80">{line.description}</TableCell>
                          <TableCell className="px-3 py-2 text-sm text-right text-white/60 tabular-nums">{line.quantity}</TableCell>
                          <TableCell className="px-3 py-2 text-sm text-right text-white/60 tabular-nums">{formatCurrency(line.unitPrice, inv.currency)}</TableCell>
                          <TableCell className="px-3 py-2 text-sm text-right font-medium text-white tabular-nums">{formatCurrency(line.amount, inv.currency)}</TableCell>
                        </TableRow>
                      ))}
                      {(!inv.lines || inv.lines.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8">
                            <FileText className="w-6 h-6 text-white/20 mx-auto mb-2" />
                            <p className="text-xs text-white/40">No line items</p>
                            {inv.status === "draft" && (
                              <Button size="sm" variant="outline" className="mt-2 h-6 text-[10px] bg-white/[0.06] border-white/[0.1]" onClick={() => setShowAddLineDialog(true)}>
                                <Plus className="w-3 h-3 mr-1" /> Add first line item
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                  <div className="border-t border-white/[0.06] px-4 py-3 flex flex-col items-end gap-1.5">
                    <div className="flex gap-8 text-sm"><span className="text-white/40">Subtotal</span><span className="text-white/70 tabular-nums w-28 text-right">{formatCurrency(inv.subtotal, inv.currency)}</span></div>
                    <div className="flex gap-8 text-sm"><span className="text-white/40">Tax</span><span className="text-white/70 tabular-nums w-28 text-right">{formatCurrency(inv.taxAmount, inv.currency)}</span></div>
                    <div className="flex gap-8 text-sm font-bold border-t border-white/[0.06] pt-1.5 mt-1"><span className="text-white">Total</span><span className="text-white tabular-nums w-28 text-right">{formatCurrency(inv.total, inv.currency)}</span></div>
                  </div>
                </CardContent>
              </Card>

              {/* Payment History */}
              {(inv.status === "paid" || payments.length > 0) && (
                <Card className="bg-white/[0.03] border-white/[0.06] rounded-xl shadow-lg">
                  <CardHeader className="py-2.5 px-3">
                    <CardTitle className="text-xs font-semibold text-white/80 flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-emerald-400" /> Payment History
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    {payments.length > 0 ? (
                      <div className="space-y-2">
                        {payments.map((p: any) => (
                          <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
                            <div>
                              <span className="text-sm text-white/80">{formatCurrency(p.amount, inv.currency)}</span>
                              <span className="text-xs text-white/40 ml-2">{p.paymentMethod || "Payment"}</span>
                            </div>
                            <div className="text-xs text-white/40">{formatDate(p.paymentDate)}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div><span className="text-white/40 text-xs block">Payment Date</span><span className="text-white/80">{formatDate(inv.paymentDate || null)}</span></div>
                        <div><span className="text-white/40 text-xs block">Method</span><span className="text-white/80">{inv.paymentMethod || "\u2014"}</span></div>
                        <div><span className="text-white/40 text-xs block">Reference</span><span className="text-white/80">{inv.paymentReference || "\u2014"}</span></div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {inv.notes && (
                <Card className="bg-white/[0.03] border-white/[0.06] rounded-xl">
                  <CardHeader className="py-2 px-3"><CardTitle className="text-xs font-semibold text-white/80">Notes</CardTitle></CardHeader>
                  <CardContent className="px-3 pb-2 text-sm text-white/50 whitespace-pre-wrap">{inv.notes}</CardContent>
                </Card>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <AlertCircle className="w-8 h-8 text-white/20" />
              <p className="text-sm text-white/40">Invoice not found</p>
            </div>
          )}
        </div>

        {/* Add Line Item Dialog */}
        <Dialog open={showAddLineDialog} onOpenChange={setShowAddLineDialog}>
          <DialogContent className="sm:max-w-md bg-card">
            <DialogHeader><DialogTitle className="text-base">Add Line Item</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label className="text-xs">Description</Label>
                <Input value={detailLineForm.description} onChange={e => setDetailLineForm(p => ({ ...p, description: e.target.value }))} className="h-8 text-sm" placeholder="Line item description..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Quantity</Label>
                  <Input type="number" value={detailLineForm.quantity} onChange={e => setDetailLineForm(p => ({ ...p, quantity: e.target.value }))} className="h-8 text-sm" min="0" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Unit Price</Label>
                  <Input type="number" value={detailLineForm.unitPrice} onChange={e => setDetailLineForm(p => ({ ...p, unitPrice: e.target.value }))} className="h-8 text-sm" step="0.01" min="0" />
                </div>
              </div>
              <div className="text-sm text-right text-white/60">
                Amount: {formatCurrency((parseFloat(detailLineForm.quantity) || 0) * (parseFloat(detailLineForm.unitPrice) || 0), inv?.currency)}
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setShowAddLineDialog(false)}>Cancel</Button>
              <Button size="sm" className="h-8 text-xs bg-white text-black hover:bg-white/90" onClick={() => {
                if (!detailLineForm.description.trim()) { toast({ title: "Description required", variant: "destructive" }); return; }
                addLineToInvoiceMutation.mutate({ invoiceId: detailId!, description: detailLineForm.description, quantity: parseFloat(detailLineForm.quantity) || 1, unitPrice: parseFloat(detailLineForm.unitPrice) || 0 });
              }} disabled={addLineToInvoiceMutation.isPending}>
                {addLineToInvoiceMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Add Line"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Mark Paid Dialog */}
        <Dialog open={!!paymentDialogId} onOpenChange={(o) => { if (!o) setPaymentDialogId(null); }}>
          <DialogContent className="sm:max-w-sm bg-card">
            <DialogHeader><DialogTitle className="text-base">Record Payment</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label className="text-xs">Payment Date</Label>
                <Input type="date" value={paymentForm.paymentDate} onChange={e => setPaymentForm(p => ({ ...p, paymentDate: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Payment Method</Label>
                <Select value={paymentForm.paymentMethod} onValueChange={v => setPaymentForm(p => ({ ...p, paymentMethod: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="wise">Wise</SelectItem>
                    <SelectItem value="credit_card">Credit Card</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Reference</Label>
                <Input value={paymentForm.reference} onChange={e => setPaymentForm(p => ({ ...p, reference: e.target.value }))} className="h-8 text-sm" placeholder="Payment ref..." />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setPaymentDialogId(null)}>Cancel</Button>
              <Button size="sm" className="h-8 text-xs" onClick={() => { if (paymentDialogId) markPaidMutation.mutate({ id: paymentDialogId, ...paymentForm }); }} disabled={markPaidMutation.isPending}>
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
      <div className="border-b border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-sm font-semibold text-white mr-2">Invoices</h1>
          <Select value={statusFilter} onValueChange={v => { setPage(1); setStatusFilter(v); }}>
            <SelectTrigger className="w-32 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={entityFilter} onValueChange={v => { setPage(1); setEntityFilter(v); }}>
            <SelectTrigger className="w-40 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Entities</SelectItem>
              {entityList.map((e: any) => (
                <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={customerFilter} onValueChange={v => { setPage(1); setCustomerFilter(v); }}>
            <SelectTrigger className="w-40 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Customers</SelectItem>
              {customerList.map((c: any) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
              className="h-8 text-sm pl-7 w-44"
            />
          </div>
          <span className="text-xs text-muted-foreground ml-auto tabular-nums">{total} invoice{total !== 1 ? "s" : ""}</span>
          <Button size="sm" className="h-8 text-xs gap-1.5 bg-white text-black hover:bg-white/90 font-medium rounded-lg" onClick={() => setCreateOpen(true)}>
            <Plus className="w-3.5 h-3.5" /> New Invoice
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded" />)}</div>
        ) : filteredInvoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground p-12">
            <FileText className="w-10 h-10 opacity-40" />
            <p className="text-sm">No invoices found</p>
            <p className="text-xs opacity-70">Adjust filters or create a new invoice.</p>
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 bg-card/95 backdrop-blur-sm z-10">
              <TableRow className="border-b border-white/[0.06]">
                <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3 px-3">Invoice #</TableHead>
                <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3 px-3">Customer</TableHead>
                <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3 px-3 w-24">Date</TableHead>
                <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3 px-3 w-24">Due</TableHead>
                <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3 px-3 w-28 text-right">Total</TableHead>
                <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3 px-3 w-24">Status</TableHead>
                <TableHead className="text-xs text-white/40 uppercase tracking-wider font-medium py-3 px-3 w-28">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvoices.map((inv: any) => {
                const st = STATUS_CONFIG[inv.status] || { label: inv.status, className: "" };
                return (
                  <TableRow key={inv.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={() => setDetailId(inv.id)}>
                    <TableCell className="px-3 py-2">
                      <span className="text-sm font-medium text-primary">{inv.invoiceNumber || `INV-${inv.id}`}</span>
                    </TableCell>
                    <TableCell className="px-3 py-2 text-sm">{getCustomerName(inv, customerMap)}</TableCell>
                    <TableCell className="px-3 py-2 text-xs text-muted-foreground">{formatDate(inv.invoiceDate)}</TableCell>
                    <TableCell className="px-3 py-2 text-xs text-muted-foreground">{formatDate(inv.dueDate)}</TableCell>
                    <TableCell className="px-3 py-2 text-sm text-right font-medium tabular-nums">{formatCurrency(inv.total, inv.currency)}</TableCell>
                    <TableCell className="px-3 py-2">
                      <Badge className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${st.className}`}>{st.label}</Badge>
                    </TableCell>
                    <TableCell className="px-3 py-2" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <button onClick={() => setDetailId(inv.id)} className="p-1 rounded hover:bg-muted" title="View"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                        {inv.status === "draft" && <button onClick={() => sendMutation.mutate(inv.id)} className="p-1 rounded hover:bg-muted" title="Mark as Sent"><Send className="w-3.5 h-3.5 text-blue-400" /></button>}
                        {(inv.status === "sent" || inv.status === "overdue") && <button onClick={() => setPaymentDialogId(inv.id)} className="p-1 rounded hover:bg-muted" title="Mark as Paid"><Check className="w-3.5 h-3.5 text-emerald-400" /></button>}
                        {inv.status === "draft" && <button onClick={() => cancelMutation.mutate(inv.id)} className="p-1 rounded hover:bg-muted" title="Cancel"><Ban className="w-3.5 h-3.5 text-orange-400" /></button>}
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
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Create Invoice Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-3xl bg-card max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base font-semibold">Create Invoice</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Customer <span className="text-destructive">*</span></Label>
                <Select value={form.customerId || "none"} onValueChange={v => setForm(p => ({ ...p, customerId: v === "none" ? "" : v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select customer..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select customer</SelectItem>
                    {customerList.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Entity</Label>
                <Select value={form.entityId || "none"} onValueChange={v => setForm(p => ({ ...p, entityId: v === "none" ? "" : v, currency: entityList.find((e: any) => String(e.id) === v)?.currency || p.currency }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select entity..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select entity</SelectItem>
                    {entityList.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.name} {e.currency ? `(${e.currency})` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Invoice Date</Label>
                <Input type="date" value={form.invoiceDate} onChange={e => setForm(p => ({ ...p, invoiceDate: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Due Date</Label>
                <Input type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Currency</Label>
                <Select value={form.currency} onValueChange={v => setForm(p => ({ ...p, currency: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="TRY">TRY</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Line items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-semibold">Line Items</Label>
                <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={addLine}>
                  <Plus className="w-3 h-3" /> Add Line
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] px-1 py-1">Description</TableHead>
                    <TableHead className="text-[10px] px-1 py-1 w-20 text-right">Qty</TableHead>
                    <TableHead className="text-[10px] px-1 py-1 w-24 text-right">Unit Price</TableHead>
                    <TableHead className="text-[10px] px-1 py-1 w-24 text-right">Amount</TableHead>
                    <TableHead className="text-[10px] px-1 py-1 w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="px-1 py-1">
                        <Input placeholder="Description" value={line.description} onChange={e => updateLine(idx, "description", e.target.value)} className="h-8 text-sm" />
                      </TableCell>
                      <TableCell className="px-1 py-1">
                        <Input placeholder="Qty" value={line.quantity} onChange={e => updateLine(idx, "quantity", e.target.value)} className="h-8 text-sm text-right" type="number" min="0" />
                      </TableCell>
                      <TableCell className="px-1 py-1">
                        <Input placeholder="Price" value={line.unitPrice} onChange={e => updateLine(idx, "unitPrice", e.target.value)} className="h-8 text-sm text-right" type="number" step="0.01" min="0" />
                      </TableCell>
                      <TableCell className="px-1 py-1">
                        <Input value={line.amount} readOnly className="h-8 text-sm text-right bg-muted tabular-nums" />
                      </TableCell>
                      <TableCell className="px-1 py-1">
                        <button onClick={() => removeLine(idx)} className="p-1 rounded hover:bg-destructive/10" disabled={lines.length <= 1}>
                          <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-3 flex flex-col items-end gap-1 text-sm">
                <div className="flex gap-6"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums w-28 text-right">{formatCurrency(subtotal, form.currency)}</span></div>
                <div className="flex gap-6 items-center">
                  <span className="text-muted-foreground">Tax</span>
                  <Input value={form.taxAmount} onChange={e => setForm(p => ({ ...p, taxAmount: e.target.value }))} className="h-7 w-28 text-sm text-right" type="number" step="0.01" min="0" />
                </div>
                <div className="flex gap-6 font-bold"><span>Total</span><span className="tabular-nums w-28 text-right">{formatCurrency(grandTotal, form.currency)}</span></div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="text-sm" rows={2} placeholder="Additional notes..." />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleCreate} disabled={createMutation.isPending || !form.customerId}>
              {createMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Create Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment dialog for list view */}
      <Dialog open={!!paymentDialogId && !detailId} onOpenChange={(o) => { if (!o) setPaymentDialogId(null); }}>
        <DialogContent className="sm:max-w-sm bg-card">
          <DialogHeader><DialogTitle className="text-base">Record Payment</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Payment Date</Label>
              <Input type="date" value={paymentForm.paymentDate} onChange={e => setPaymentForm(p => ({ ...p, paymentDate: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Payment Method</Label>
              <Select value={paymentForm.paymentMethod} onValueChange={v => setPaymentForm(p => ({ ...p, paymentMethod: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="wise">Wise</SelectItem>
                  <SelectItem value="credit_card">Credit Card</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Reference</Label>
              <Input value={paymentForm.reference} onChange={e => setPaymentForm(p => ({ ...p, reference: e.target.value }))} className="h-8 text-sm" placeholder="Payment ref..." />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setPaymentDialogId(null)}>Cancel</Button>
            <Button size="sm" className="h-8 text-xs" onClick={() => { if (paymentDialogId) markPaidMutation.mutate({ id: paymentDialogId, ...paymentForm }); }} disabled={markPaidMutation.isPending}>
              {markPaidMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
