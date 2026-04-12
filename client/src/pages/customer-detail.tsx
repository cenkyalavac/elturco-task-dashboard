import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Save, Mail, Phone, Building2, Users, FolderKanban, Plus,
  DollarSign, Check, FileText, TrendingUp, Edit2, Tag, MapPin, Receipt,
  Trash2, UserCheck, CreditCard,
} from "lucide-react";

const LANGUAGES = ["EN","TR","DE","FR","ES","IT","PT","NL","PL","RU","ZH","JA","KO","AR","SV","DA","FI","NO","CS","HU","RO","BG","HR","SK","SL","EL","UK","TH","VI","ID","MS","HI","BN","HE","FA"];
const SERVICE_TYPES = ["Translation", "MTPE", "Review", "LQA", "Proofreading", "Subtitling", "DTP", "TEP", "Copywriting", "Transcreation"];

function formatCurrency(amount: string | number | null, currency: string = "EUR"): string {
  if (!amount && amount !== 0) return "\u2014";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "\u2014";
  const symbol = currency === "GBP" ? "\u00a3" : currency === "EUR" ? "\u20ac" : "$";
  return `${symbol}${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: string | null): string {
  if (!d) return "\u2014";
  try { return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); } catch { return d; }
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-500/20 text-green-400 border-green-500/25",
  active: "bg-green-500/20 text-green-400 border-green-500/25",
  INACTIVE: "bg-zinc-500/20 text-zinc-400 border-zinc-500/25",
  inactive: "bg-zinc-500/20 text-zinc-400 border-zinc-500/25",
  PROSPECT: "bg-blue-500/20 text-blue-400 border-blue-500/25",
  prospect: "bg-blue-500/20 text-blue-400 border-blue-500/25",
};

const PROJECT_STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/15 text-green-400 border-green-500/25",
  completed: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  cancelled: "bg-red-500/15 text-red-400 border-red-500/25",
  on_hold: "bg-amber-500/15 text-amber-400 border-amber-500/25",
};

const INV_STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-500/15 text-slate-400 border-slate-500/20",
  sent: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  paid: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  overdue: "bg-red-500/15 text-red-400 border-red-500/20",
  cancelled: "bg-orange-500/15 text-orange-400 border-orange-500/20",
};

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const customerId = params?.id;
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [showAddContact, setShowAddContact] = useState(false);
  const [showAddSubAccount, setShowAddSubAccount] = useState(false);
  const [showAddPmAssignment, setShowAddPmAssignment] = useState(false);
  const [showAddRate, setShowAddRate] = useState(false);
  const [contactForm, setContactForm] = useState({ name: "", email: "", phone: "", role: "", isPrimary: false });
  const [subAccountForm, setSubAccountForm] = useState({ name: "", code: "", notes: "" });
  const [pmAssignForm, setPmAssignForm] = useState({ userId: "", role: "primary" });
  const [rateCardForm, setRateCardForm] = useState({ sourceLanguage: "", targetLanguage: "", serviceType: "", rateType: "per_word", rateValue: "", currency: "EUR" });

  // Queries
  const { data: customer, isLoading } = useQuery({
    queryKey: ["/api/customers", customerId],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/customers/${customerId}`);
      return r.json();
    },
    enabled: !!customerId,
  });

  const contactsQuery = useQuery({
    queryKey: ["/api/customers", customerId, "contacts"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/customers/${customerId}/contacts`);
      return r.json().catch(() => []);
    },
    enabled: !!customerId,
  });

  const subAccountsQuery = useQuery({
    queryKey: ["/api/customers", customerId, "sub-accounts"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/customers/${customerId}/sub-accounts`);
      return r.json().catch(() => []);
    },
    enabled: !!customerId,
  });

  const pmAssignmentsQuery = useQuery({
    queryKey: ["/api/customers", customerId, "pm-assignments"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/customers/${customerId}/pm-assignments`);
      return r.json().catch(() => []);
    },
    enabled: !!customerId,
  });

  const projectsQuery = useQuery({
    queryKey: ["/api/projects", "customer", customerId],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/projects?customerId=${customerId}`);
      const json = await r.json();
      return json.data ?? json;
    },
    enabled: !!customerId,
  });

  const invoicesQuery = useQuery({
    queryKey: ["/api/invoices", "customer", customerId],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/invoices?customerId=${customerId}`);
      const json = await r.json();
      return json.data ?? json;
    },
    enabled: !!customerId,
  });

  const usersQuery = useQuery({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/users");
      return r.json().catch(() => []);
    },
  });

  const rateCardQuery = useQuery({
    queryKey: ["/api/customers", customerId, "rate-card"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/customers/${customerId}/rate-card`);
      return r.json().catch(() => []);
    },
    enabled: !!customerId,
  });

  // Mutations
  const updateMutation = useMutation({
    mutationFn: async (body: any) => {
      const r = await apiRequest("PATCH", `/api/customers/${customerId}`, body);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setEditing(false);
      toast({ title: "Customer updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addContactMutation = useMutation({
    mutationFn: async (body: any) => {
      const r = await apiRequest("POST", `/api/customers/${customerId}/contacts`, body);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "contacts"] });
      setShowAddContact(false);
      setContactForm({ name: "", email: "", phone: "", role: "", isPrimary: false });
      toast({ title: "Contact added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (contactId: number) => {
      const r = await apiRequest("DELETE", `/api/customers/${customerId}/contacts/${contactId}`);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "contacts"] });
      toast({ title: "Contact removed" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addSubAccountMutation = useMutation({
    mutationFn: async (body: any) => {
      const r = await apiRequest("POST", `/api/customers/${customerId}/sub-accounts`, body);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "sub-accounts"] });
      setShowAddSubAccount(false);
      setSubAccountForm({ name: "", code: "", notes: "" });
      toast({ title: "Sub-account added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteSubAccountMutation = useMutation({
    mutationFn: async (subId: number) => {
      const r = await apiRequest("DELETE", `/api/customers/${customerId}/sub-accounts/${subId}`);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "sub-accounts"] });
      toast({ title: "Sub-account removed" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addPmAssignmentMutation = useMutation({
    mutationFn: async (body: any) => {
      const r = await apiRequest("POST", `/api/customers/${customerId}/pm-assignments`, body);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "pm-assignments"] });
      setShowAddPmAssignment(false);
      setPmAssignForm({ userId: "", role: "primary" });
      toast({ title: "PM assignment added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deletePmAssignmentMutation = useMutation({
    mutationFn: async (assignId: number) => {
      const r = await apiRequest("DELETE", `/api/customers/${customerId}/pm-assignments/${assignId}`);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "pm-assignments"] });
      toast({ title: "PM assignment removed" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addRateCardMutation = useMutation({
    mutationFn: async (body: any) => {
      const r = await apiRequest("POST", `/api/customers/${customerId}/rate-card`, body);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "rate-card"] });
      setShowAddRate(false);
      setRateCardForm({ sourceLanguage: "", targetLanguage: "", serviceType: "", rateType: "per_word", rateValue: "", currency: "EUR" });
      toast({ title: "Rate card entry added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteRateCardMutation = useMutation({
    mutationFn: async (rateId: number) => {
      const r = await apiRequest("DELETE", `/api/customers/${customerId}/rate-card/${rateId}`);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "rate-card"] });
      toast({ title: "Rate card entry removed" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Derive data from queries (must be before any conditional returns to satisfy React hooks rules)
  const users: any[] = usersQuery.data || [];
  const contacts: any[] = contactsQuery.data || [];
  const subAccounts: any[] = subAccountsQuery.data || [];
  const pmAssignments: any[] = pmAssignmentsQuery.data || [];
  const projects: any[] = Array.isArray(projectsQuery.data) ? projectsQuery.data : [];
  const invoices: any[] = Array.isArray(invoicesQuery.data) ? invoicesQuery.data : [];
  const rateCards: any[] = Array.isArray(rateCardQuery.data) ? rateCardQuery.data : [];
  const primaryPmUser = customer ? users.find((u: any) => u.id === customer.primaryPmId) : null;

  // Financial summary from invoices
  const financialSummary = useMemo(() => {
    const totalRevenue = invoices.reduce((s: number, inv: any) => s + (parseFloat(inv.total) || 0), 0);
    const outstanding = invoices.filter((inv: any) => inv.status === "sent" || inv.status === "overdue")
      .reduce((s: number, inv: any) => s + (parseFloat(inv.total) || 0), 0);
    const paid = invoices.filter((inv: any) => inv.status === "paid")
      .reduce((s: number, inv: any) => s + (parseFloat(inv.total) || 0), 0);
    const overdue = invoices.filter((inv: any) => inv.status === "overdue").length;
    return { totalRevenue, outstanding, paid, overdue };
  }, [invoices]);

  const startEdit = () => { setForm({ ...customer }); setEditing(true); };
  const setFormField = (key: string, value: any) => setForm((p: any) => ({ ...p, [key]: value }));

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-5xl">
        <Skeleton className="h-12 w-72 bg-white/[0.04] rounded-lg" />
        <Skeleton className="h-64 w-full bg-white/[0.04] rounded-lg" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Link href="/customers">
          <button className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white hover:bg-white/[0.06] px-3 py-1.5 rounded-md transition mb-4">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Customers
          </button>
        </Link>
        <div className="text-center py-16 text-white/40">
          <Building2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">Customer not found</p>
        </div>
      </div>
    );
  }

  const formatAddress = (address: any) => {
    if (!address) return null;
    const parts = [address.street, address.city, address.state, address.zip, address.country].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : null;
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/customers">
          <button className="w-8 h-8 rounded-md flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.06] transition">
            <ArrowLeft className="w-4 h-4" />
          </button>
        </Link>
        <div className="w-10 h-10 rounded-full bg-emerald-500/15 flex items-center justify-center text-emerald-400 shrink-0">
          <Building2 className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold text-white truncate">{customer.name}</h1>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {customer.code && <span className="text-[10px] text-white/25 font-mono">{customer.code}</span>}
            <Badge className={`text-[10px] border ${STATUS_COLORS[customer.status] || "bg-zinc-500/20 text-zinc-400 border-zinc-500/25"}`}>
              {customer.status}
            </Badge>
            {customer.currency && <span className="text-[10px] text-white/25">{customer.currency}</span>}
            {primaryPmUser && <span className="text-[10px] text-white/30">PM: {primaryPmUser.name}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!editing ? (
            <Button size="sm" variant="outline" onClick={startEdit} className="text-xs">
              <Edit2 className="w-3 h-3 mr-1" />Edit
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="text-xs text-white/50">Cancel</Button>
              <Button size="sm" onClick={() => updateMutation.mutate(form)} disabled={updateMutation.isPending} className="bg-blue-600 hover:bg-blue-700 text-white text-xs">
                <Save className="w-3 h-3 mr-1" />{updateMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-white/[0.04] border border-white/[0.06] flex-wrap">
          <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
          <TabsTrigger value="contacts" className="text-xs">Contacts ({contacts.length})</TabsTrigger>
          <TabsTrigger value="sub-accounts" className="text-xs">Sub-Accounts ({subAccounts.length})</TabsTrigger>
          <TabsTrigger value="pm-assignments" className="text-xs">PM Assignments ({pmAssignments.length})</TabsTrigger>
          <TabsTrigger value="rate-card" className="text-xs">Rate Card ({rateCards.length})</TabsTrigger>
          <TabsTrigger value="projects" className="text-xs">Projects ({projects.length})</TabsTrigger>
          <TabsTrigger value="invoices" className="text-xs">Invoices ({invoices.length})</TabsTrigger>
          <TabsTrigger value="financial" className="text-xs">Financial</TabsTrigger>
        </TabsList>

        {/* TAB: Overview */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Info Card */}
            <Card className="bg-white/[0.03] border-white/[0.06]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5" /> Info
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
              {editing ? (
                <div className="space-y-2">
                  <FieldEdit label="Name" value={form.name || ""} onChange={(v) => setFormField("name", v)} />
                  <FieldEdit label="Code" value={form.code || ""} onChange={(v) => setFormField("code", v)} />
                  <div>
                    <label className="text-[11px] text-white/40 block mb-0.5">Client Type</label>
                    <Select value={form.clientType || "CLIENT"} onValueChange={(v) => setFormField("clientType", v)}>
                      <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CLIENT">Client</SelectItem>
                        <SelectItem value="AGENCY">Agency</SelectItem>
                        <SelectItem value="DIRECT">Direct</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[11px] text-white/40 block mb-0.5">Status</label>
                    <Select value={form.status || "ACTIVE"} onValueChange={(v) => setFormField("status", v)}>
                      <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ACTIVE">Active</SelectItem>
                        <SelectItem value="INACTIVE">Inactive</SelectItem>
                        <SelectItem value="PROSPECT">Prospect</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[11px] text-white/40 block mb-0.5">Primary PM</label>
                    <Select value={form.primaryPmId ? String(form.primaryPmId) : "none"} onValueChange={(v) => setFormField("primaryPmId", v === "none" ? null : parseInt(v))}>
                      <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm"><SelectValue placeholder="Select PM" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {users.map((u: any) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <InfoRow icon={<Building2 className="w-3 h-3" />} label="Name" value={customer.name} />
                  {customer.code && <InfoRow icon={<Building2 className="w-3 h-3" />} label="Code" value={customer.code} mono />}
                  <InfoRow icon={<Building2 className="w-3 h-3" />} label="Client Type" value={customer.clientType || "CLIENT"} />
                  <InfoRow icon={<Building2 className="w-3 h-3" />} label="Status" value={customer.status || "ACTIVE"} />
                  {primaryPmUser && <InfoRow icon={<Users className="w-3 h-3" />} label="Primary PM" value={primaryPmUser.name} />}
                </div>
              )}
              </CardContent>
            </Card>

            {/* Contact Card */}
            <Card className="bg-white/[0.03] border-white/[0.06]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5" /> Contact
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
              {editing ? (
                <div className="space-y-2">
                  <FieldEdit label="Email" value={form.email || ""} onChange={(v) => setFormField("email", v)} />
                  <FieldEdit label="Phone" value={form.phone || ""} onChange={(v) => setFormField("phone", v)} />
                  <FieldEdit label="Street" value={form.address?.street || ""} onChange={(v) => setFormField("address", { ...form.address, street: v })} />
                  <FieldEdit label="City" value={form.address?.city || ""} onChange={(v) => setFormField("address", { ...form.address, city: v })} />
                  <FieldEdit label="State" value={form.address?.state || ""} onChange={(v) => setFormField("address", { ...form.address, state: v })} />
                  <FieldEdit label="ZIP" value={form.address?.zip || ""} onChange={(v) => setFormField("address", { ...form.address, zip: v })} />
                  <FieldEdit label="Country" value={form.address?.country || ""} onChange={(v) => setFormField("address", { ...form.address, country: v })} />
                </div>
              ) : (
                <div className="space-y-2">
                  {customer.email && <InfoRow icon={<Mail className="w-3 h-3" />} label="Email" value={customer.email} />}
                  {customer.phone && <InfoRow icon={<Phone className="w-3 h-3" />} label="Phone" value={customer.phone} />}
                  {formatAddress(customer.address) && (
                    <InfoRow icon={<MapPin className="w-3 h-3" />} label="Address" value={formatAddress(customer.address)!} />
                  )}
                </div>
              )}
              </CardContent>
            </Card>

            {/* Financial Card */}
            <Card className="bg-white/[0.03] border-white/[0.06]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
                  <DollarSign className="w-3.5 h-3.5" /> Financial
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
              {editing ? (
                <div className="space-y-2">
                  <FieldEdit label="Currency" value={form.currency || ""} onChange={(v) => setFormField("currency", v)} />
                  <div>
                    <label className="text-[11px] text-white/40 block mb-0.5">Payment Terms Type</label>
                    <Select value={form.paymentTermsType || "net"} onValueChange={(v) => setFormField("paymentTermsType", v)}>
                      <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="net">Net</SelectItem>
                        <SelectItem value="due_on_receipt">Due on Receipt</SelectItem>
                        <SelectItem value="end_of_month">End of Month</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <FieldEdit label="Payment Terms Days" value={form.paymentTermsDays != null ? String(form.paymentTermsDays) : ""} onChange={(v) => setFormField("paymentTermsDays", v ? parseInt(v) : null)} />
                  <FieldEdit label="VAT Number" value={form.vatNumber || ""} onChange={(v) => setFormField("vatNumber", v)} />
                  <FieldEdit label="Tax ID" value={form.taxId || ""} onChange={(v) => setFormField("taxId", v)} />
                  <FieldEdit label="Minimum Fee" value={form.minimumFee != null ? String(form.minimumFee) : ""} onChange={(v) => setFormField("minimumFee", v || null)} />
                </div>
              ) : (
                <div className="space-y-2">
                  <InfoRow icon={<DollarSign className="w-3 h-3" />} label="Currency" value={customer.currency || "EUR"} />
                  <InfoRow icon={<DollarSign className="w-3 h-3" />} label="Payment Terms" value={
                    customer.paymentTermsDays
                      ? `${customer.paymentTermsType || "Net"} ${customer.paymentTermsDays} days`
                      : customer.paymentTermsType || "\u2014"
                  } />
                  {customer.vatNumber && <InfoRow icon={<Receipt className="w-3 h-3" />} label="VAT Number" value={customer.vatNumber} />}
                  {customer.taxId && <InfoRow icon={<Receipt className="w-3 h-3" />} label="Tax ID" value={customer.taxId} />}
                  {customer.minimumFee && <InfoRow icon={<DollarSign className="w-3 h-3" />} label="Minimum Fee" value={formatCurrency(customer.minimumFee, customer.currency || "EUR")} />}
                </div>
              )}
              </CardContent>
            </Card>

            {/* Notes & Tags */}
            <Card className="bg-white/[0.03] border-white/[0.06]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5" /> Notes & Tags
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
              {editing ? (
                <div className="space-y-2">
                  <div>
                    <label className="text-[11px] text-white/40 block mb-0.5">Notes</label>
                    <Textarea
                      value={form.notes || ""}
                      onChange={(e) => setFormField("notes", e.target.value)}
                      rows={4}
                      className="bg-white/[0.04] border-white/[0.08] text-white text-sm resize-none"
                    />
                  </div>
                  <FieldEdit
                    label="Tags (comma-separated)"
                    value={(form.tags || []).join(", ")}
                    onChange={(v) => setFormField("tags", v.split(",").map((t: string) => t.trim()).filter(Boolean))}
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  {customer.notes ? (
                    <p className="text-xs text-white/50 whitespace-pre-wrap">{customer.notes}</p>
                  ) : (
                    <p className="text-xs text-white/20">No notes</p>
                  )}
                  {customer.tags && customer.tags.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Tag className="w-3 h-3 text-white/20" />
                      {customer.tags.map((tag: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-[10px] bg-white/[0.06] text-white/50">{tag}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB: Contacts */}
        <TabsContent value="contacts" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-white/70">Contacts</h3>
            <Button size="sm" onClick={() => setShowAddContact(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-xs">
              <Plus className="w-3 h-3 mr-1" />Add Contact
            </Button>
          </div>
          {contactsQuery.isLoading ? (
            <Skeleton className="h-32 bg-white/[0.04] rounded" />
          ) : contacts.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-8 h-8 text-white/10 mx-auto mb-2" />
              <p className="text-xs text-white/20">No contacts yet</p>
            </div>
          ) : (
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/[0.06] hover:bg-transparent">
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Name</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Email</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Phone</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Role</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Primary</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3 w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.map((c: any) => (
                    <TableRow key={c.id} className="border-white/[0.06] hover:bg-white/[0.02]">
                      <TableCell className="text-xs text-white font-medium px-3 py-2">{c.name}</TableCell>
                      <TableCell className="text-[11px] text-white/50 px-3 py-2">{c.email || "\u2014"}</TableCell>
                      <TableCell className="text-[11px] text-white/50 px-3 py-2">{c.phone || "\u2014"}</TableCell>
                      <TableCell className="text-[11px] text-white/50 px-3 py-2">{c.role || "\u2014"}</TableCell>
                      <TableCell className="px-3 py-2">
                        {c.isPrimary && <Check className="w-4 h-4 text-green-400" />}
                      </TableCell>
                      <TableCell className="px-3 py-2">
                        <button onClick={() => deleteContactMutation.mutate(c.id)} className="p-1 rounded hover:bg-red-500/10">
                          <Trash2 className="w-3.5 h-3.5 text-white/20 hover:text-red-400" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* TAB: Sub-Accounts */}
        <TabsContent value="sub-accounts" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-white/70">Sub-Accounts</h3>
            <Button size="sm" onClick={() => setShowAddSubAccount(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-xs">
              <Plus className="w-3 h-3 mr-1" />Add Sub-Account
            </Button>
          </div>
          {subAccountsQuery.isLoading ? (
            <Skeleton className="h-32 bg-white/[0.04] rounded" />
          ) : subAccounts.length === 0 ? (
            <div className="text-center py-12">
              <FolderKanban className="w-8 h-8 text-white/10 mx-auto mb-2" />
              <p className="text-xs text-white/20">No sub-accounts yet</p>
            </div>
          ) : (
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/[0.06] hover:bg-transparent">
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Name</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Code</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Assigned PM</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Notes</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3 w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subAccounts.map((sa: any) => {
                    const pmUser = users.find((u: any) => u.id === sa.assignedPmId);
                    return (
                      <TableRow key={sa.id} className="border-white/[0.06] hover:bg-white/[0.02]">
                        <TableCell className="text-xs text-white font-medium px-3 py-2">{sa.name}</TableCell>
                        <TableCell className="text-[11px] text-white/40 font-mono px-3 py-2">{sa.code || "\u2014"}</TableCell>
                        <TableCell className="text-[11px] text-white/50 px-3 py-2">{pmUser ? pmUser.name : (sa.assignedPmId ? `User #${sa.assignedPmId}` : "\u2014")}</TableCell>
                        <TableCell className="text-[11px] text-white/40 px-3 py-2 max-w-[200px] truncate">{sa.notes || "\u2014"}</TableCell>
                        <TableCell className="px-3 py-2">
                          <button onClick={() => deleteSubAccountMutation.mutate(sa.id)} className="p-1 rounded hover:bg-red-500/10">
                            <Trash2 className="w-3.5 h-3.5 text-white/20 hover:text-red-400" />
                          </button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* TAB: PM Assignments */}
        <TabsContent value="pm-assignments" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-white/70">PM Assignments</h3>
            <Button size="sm" onClick={() => setShowAddPmAssignment(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-xs">
              <Plus className="w-3 h-3 mr-1" />Assign PM
            </Button>
          </div>
          {pmAssignmentsQuery.isLoading ? (
            <Skeleton className="h-32 bg-white/[0.04] rounded" />
          ) : pmAssignments.length === 0 ? (
            <div className="text-center py-12">
              <UserCheck className="w-8 h-8 text-white/10 mx-auto mb-2" />
              <p className="text-xs text-white/20">No PM assignments yet</p>
            </div>
          ) : (
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/[0.06] hover:bg-transparent">
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">PM</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Role</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Assigned</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3 w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pmAssignments.map((pa: any) => {
                    const pmUser = users.find((u: any) => u.id === pa.userId);
                    return (
                      <TableRow key={pa.id} className="border-white/[0.06] hover:bg-white/[0.02]">
                        <TableCell className="text-xs text-white font-medium px-3 py-2">{pmUser ? pmUser.name : `User #${pa.userId}`}</TableCell>
                        <TableCell className="px-3 py-2">
                          <Badge className={`text-[10px] border ${pa.role === "primary" ? "bg-blue-500/15 text-blue-400 border-blue-500/25" : "bg-zinc-500/15 text-zinc-400 border-zinc-500/25"}`}>
                            {pa.role || "primary"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[11px] text-white/40 px-3 py-2">{formatDate(pa.createdAt)}</TableCell>
                        <TableCell className="px-3 py-2">
                          <button onClick={() => deletePmAssignmentMutation.mutate(pa.id)} className="p-1 rounded hover:bg-red-500/10">
                            <Trash2 className="w-3.5 h-3.5 text-white/20 hover:text-red-400" />
                          </button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* TAB: Rate Card */}
        <TabsContent value="rate-card" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-white/70">Rate Card</h3>
            <Button size="sm" onClick={() => setShowAddRate(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-xs">
              <Plus className="w-3 h-3 mr-1" />Add Rate
            </Button>
          </div>
          {rateCardQuery.isLoading ? (
            <Skeleton className="h-32 bg-white/[0.04] rounded" />
          ) : rateCards.length === 0 ? (
            <div className="text-center py-12">
              <CreditCard className="w-8 h-8 text-white/10 mx-auto mb-2" />
              <p className="text-xs text-white/20">No rate card entries yet</p>
            </div>
          ) : (
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/[0.06] hover:bg-transparent">
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Source Lang</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Target Lang</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Service Type</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Rate Type</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3 text-right">Rate Value</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Currency</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3 w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rateCards.map((rc: any) => (
                    <TableRow key={rc.id} className="border-white/[0.06] hover:bg-white/[0.02]">
                      <TableCell className="text-xs text-white font-medium px-3 py-2">{rc.sourceLanguage || "\u2014"}</TableCell>
                      <TableCell className="text-xs text-white font-medium px-3 py-2">{rc.targetLanguage || "\u2014"}</TableCell>
                      <TableCell className="text-[11px] text-white/50 px-3 py-2">{rc.serviceType || "\u2014"}</TableCell>
                      <TableCell className="px-3 py-2">
                        <Badge className="text-[10px] border bg-zinc-500/15 text-zinc-400 border-zinc-500/25">
                          {(rc.rateType || "per_word").replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[11px] text-emerald-400 px-3 py-2 text-right font-medium">
                        {rc.rateValue != null ? parseFloat(rc.rateValue).toFixed(4) : "\u2014"}
                      </TableCell>
                      <TableCell className="text-[11px] text-white/40 px-3 py-2">{rc.currency || "EUR"}</TableCell>
                      <TableCell className="px-3 py-2">
                        <button onClick={() => deleteRateCardMutation.mutate(rc.id)} className="p-1 rounded hover:bg-red-500/10">
                          <Trash2 className="w-3.5 h-3.5 text-white/20 hover:text-red-400" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* TAB: Projects */}
        <TabsContent value="projects" className="space-y-4">
          <h3 className="text-sm font-medium text-white/70">Projects</h3>
          {projectsQuery.isLoading ? (
            <Skeleton className="h-32 bg-white/[0.04] rounded" />
          ) : projects.length === 0 ? (
            <div className="text-center py-12">
              <FolderKanban className="w-8 h-8 text-white/10 mx-auto mb-2" />
              <p className="text-xs text-white/20">No projects yet</p>
            </div>
          ) : (
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/[0.06] hover:bg-transparent">
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Code</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Name</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Status</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">PM</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Deadline</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3 text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.map((p: any) => {
                    const pmUser = users.find((u: any) => u.id === p.pmId);
                    return (
                      <TableRow key={p.id} className="border-white/[0.06] hover:bg-white/[0.02]">
                        <TableCell className="text-[11px] text-white/40 font-mono px-3 py-2">{p.projectCode || "\u2014"}</TableCell>
                        <TableCell className="text-xs text-white font-medium px-3 py-2">
                          <Link href={`/projects/${p.id}`}>
                            <span className="text-blue-400 hover:text-blue-300 cursor-pointer">{p.projectName}</span>
                          </Link>
                        </TableCell>
                        <TableCell className="px-3 py-2">
                          <Badge className={`text-[10px] border ${PROJECT_STATUS_COLORS[p.status] || "bg-zinc-500/15 text-zinc-400 border-zinc-500/25"}`}>
                            {(p.status || "").replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[11px] text-white/50 px-3 py-2">{pmUser ? pmUser.name : "\u2014"}</TableCell>
                        <TableCell className="text-[11px] text-white/40 px-3 py-2">{formatDate(p.deadline)}</TableCell>
                        <TableCell className="text-[11px] text-emerald-400 px-3 py-2 text-right font-medium">{formatCurrency(p.totalRevenue, customer.currency || "EUR")}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* TAB: Invoices */}
        <TabsContent value="invoices" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-white/70">Invoices</h3>
            <Link href="/invoices">
              <Button size="sm" variant="outline" className="text-xs">View All Invoices</Button>
            </Link>
          </div>
          {invoicesQuery.isLoading ? (
            <Skeleton className="h-32 bg-white/[0.04] rounded" />
          ) : invoices.length === 0 ? (
            <div className="text-center py-12">
              <Receipt className="w-8 h-8 text-white/10 mx-auto mb-2" />
              <p className="text-xs text-white/20">No invoices for this customer</p>
            </div>
          ) : (
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/[0.06] hover:bg-transparent">
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Invoice #</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Date</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Due Date</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3">Status</TableHead>
                    <TableHead className="text-[11px] text-white/30 font-medium h-9 px-3 text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv: any) => (
                    <TableRow key={inv.id} className="border-white/[0.06] hover:bg-white/[0.02]">
                      <TableCell className="text-xs text-white font-medium px-3 py-2">{inv.invoiceNumber || `INV-${inv.id}`}</TableCell>
                      <TableCell className="text-[11px] text-white/40 px-3 py-2">{formatDate(inv.invoiceDate)}</TableCell>
                      <TableCell className="text-[11px] text-white/40 px-3 py-2">{formatDate(inv.dueDate)}</TableCell>
                      <TableCell className="px-3 py-2">
                        <Badge className={`text-[10px] border ${INV_STATUS_COLORS[inv.status] || "bg-zinc-500/15 text-zinc-400 border-zinc-500/25"}`}>
                          {inv.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[11px] text-emerald-400 px-3 py-2 text-right font-medium">{formatCurrency(inv.total, inv.currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* TAB: Financial Summary */}
        <TabsContent value="financial" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-4 text-center">
              <p className="text-[10px] text-white/30 mb-1">Total Invoiced</p>
              <p className="text-xl font-bold text-emerald-400">{formatCurrency(financialSummary.totalRevenue, customer.currency || "EUR")}</p>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-4 text-center">
              <p className="text-[10px] text-white/30 mb-1">Outstanding</p>
              <p className="text-xl font-bold text-amber-400">{formatCurrency(financialSummary.outstanding, customer.currency || "EUR")}</p>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-4 text-center">
              <p className="text-[10px] text-white/30 mb-1">Paid</p>
              <p className="text-xl font-bold text-blue-400">{formatCurrency(financialSummary.paid, customer.currency || "EUR")}</p>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-4 text-center">
              <p className="text-[10px] text-white/30 mb-1">Overdue</p>
              <p className="text-xl font-bold text-red-400">{financialSummary.overdue}</p>
              <p className="text-[10px] text-white/20 mt-1">invoices</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-4">
              <h4 className="text-xs font-medium text-white/50 mb-3 flex items-center gap-2"><TrendingUp className="w-3 h-3" /> Projects Summary</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-white/40">Total Projects</span>
                  <span className="text-white/70 font-medium">{projects.length}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-white/40">Active</span>
                  <span className="text-emerald-400 font-medium">{projects.filter((p: any) => p.status === "active").length}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-white/40">Completed</span>
                  <span className="text-blue-400 font-medium">{projects.filter((p: any) => p.status === "completed").length}</span>
                </div>
              </div>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-4">
              <h4 className="text-xs font-medium text-white/50 mb-3 flex items-center gap-2"><CreditCard className="w-3 h-3" /> Payment Terms</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-white/40">Terms</span>
                  <span className="text-white/70 font-medium">
                    {customer.paymentTermsDays ? `${customer.paymentTermsType || "Net"} ${customer.paymentTermsDays} days` : "\u2014"}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-white/40">Currency</span>
                  <span className="text-white/70 font-medium">{customer.currency || "EUR"}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-white/40">Invoice Count</span>
                  <span className="text-white/70 font-medium">{invoices.length}</span>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Add Contact Dialog */}
      <Dialog open={showAddContact} onOpenChange={setShowAddContact}>
        <DialogContent className="bg-[#1a1d27] border-white/[0.08] text-white">
          <DialogHeader><DialogTitle>Add Contact</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <FieldEdit label="Name *" value={contactForm.name} onChange={(v) => setContactForm((p) => ({ ...p, name: v }))} />
            <FieldEdit label="Email" value={contactForm.email} onChange={(v) => setContactForm((p) => ({ ...p, email: v }))} />
            <FieldEdit label="Phone" value={contactForm.phone} onChange={(v) => setContactForm((p) => ({ ...p, phone: v }))} />
            <FieldEdit label="Role" value={contactForm.role} onChange={(v) => setContactForm((p) => ({ ...p, role: v }))} />
            <div className="flex items-center gap-2">
              <Checkbox
                id="isPrimary"
                checked={contactForm.isPrimary}
                onCheckedChange={(checked) => setContactForm((p) => ({ ...p, isPrimary: !!checked }))}
              />
              <label htmlFor="isPrimary" className="text-xs text-white/60 cursor-pointer">Primary Contact</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddContact(false)} className="text-white/50 text-xs">Cancel</Button>
            <Button
              onClick={() => addContactMutation.mutate(contactForm)}
              disabled={!contactForm.name || addContactMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
            >
              {addContactMutation.isPending ? "Adding..." : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Sub-Account Dialog */}
      <Dialog open={showAddSubAccount} onOpenChange={setShowAddSubAccount}>
        <DialogContent className="bg-[#1a1d27] border-white/[0.08] text-white">
          <DialogHeader><DialogTitle>Add Sub-Account</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <FieldEdit label="Name *" value={subAccountForm.name} onChange={(v) => setSubAccountForm((p) => ({ ...p, name: v }))} />
            <FieldEdit label="Code" value={subAccountForm.code} onChange={(v) => setSubAccountForm((p) => ({ ...p, code: v }))} />
            <div>
              <label className="text-[11px] text-white/40 block mb-0.5">Notes</label>
              <Textarea
                value={subAccountForm.notes}
                onChange={(e) => setSubAccountForm((p) => ({ ...p, notes: e.target.value }))}
                rows={3}
                className="bg-white/[0.04] border-white/[0.08] text-white text-sm resize-none"
                placeholder="Optional notes..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddSubAccount(false)} className="text-white/50 text-xs">Cancel</Button>
            <Button
              onClick={() => addSubAccountMutation.mutate(subAccountForm)}
              disabled={!subAccountForm.name || addSubAccountMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
            >
              {addSubAccountMutation.isPending ? "Adding..." : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add PM Assignment Dialog */}
      <Dialog open={showAddPmAssignment} onOpenChange={setShowAddPmAssignment}>
        <DialogContent className="bg-[#1a1d27] border-white/[0.08] text-white">
          <DialogHeader><DialogTitle>Assign PM</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] text-white/40 block mb-0.5">Project Manager *</label>
              <Select value={pmAssignForm.userId} onValueChange={(v) => setPmAssignForm((p) => ({ ...p, userId: v }))}>
                <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm"><SelectValue placeholder="Select PM..." /></SelectTrigger>
                <SelectContent>
                  {users.map((u: any) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] text-white/40 block mb-0.5">Role</label>
              <Select value={pmAssignForm.role} onValueChange={(v) => setPmAssignForm((p) => ({ ...p, role: v }))}>
                <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="primary">Primary</SelectItem>
                  <SelectItem value="backup">Backup</SelectItem>
                  <SelectItem value="secondary">Secondary</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddPmAssignment(false)} className="text-white/50 text-xs">Cancel</Button>
            <Button
              onClick={() => addPmAssignmentMutation.mutate({ userId: parseInt(pmAssignForm.userId), role: pmAssignForm.role })}
              disabled={!pmAssignForm.userId || addPmAssignmentMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
            >
              {addPmAssignmentMutation.isPending ? "Assigning..." : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Rate Card Dialog */}
      <Dialog open={showAddRate} onOpenChange={setShowAddRate}>
        <DialogContent className="bg-[#1a1d27] border-white/[0.08] text-white">
          <DialogHeader><DialogTitle>Add Rate Card Entry</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] text-white/40 block mb-0.5">Source Language *</label>
              <Select value={rateCardForm.sourceLanguage} onValueChange={(v) => setRateCardForm((p) => ({ ...p, sourceLanguage: v }))}>
                <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm"><SelectValue placeholder="Select source language..." /></SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((lang) => <SelectItem key={lang} value={lang}>{lang}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] text-white/40 block mb-0.5">Target Language *</label>
              <Select value={rateCardForm.targetLanguage} onValueChange={(v) => setRateCardForm((p) => ({ ...p, targetLanguage: v }))}>
                <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm"><SelectValue placeholder="Select target language..." /></SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((lang) => <SelectItem key={lang} value={lang}>{lang}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] text-white/40 block mb-0.5">Service Type *</label>
              <Select value={rateCardForm.serviceType} onValueChange={(v) => setRateCardForm((p) => ({ ...p, serviceType: v }))}>
                <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm"><SelectValue placeholder="Select service type..." /></SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map((st) => <SelectItem key={st} value={st}>{st}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] text-white/40 block mb-0.5">Rate Type</label>
              <Select value={rateCardForm.rateType} onValueChange={(v) => setRateCardForm((p) => ({ ...p, rateType: v }))}>
                <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_word">Per Word</SelectItem>
                  <SelectItem value="per_hour">Per Hour</SelectItem>
                  <SelectItem value="per_page">Per Page</SelectItem>
                  <SelectItem value="flat_rate">Flat Rate</SelectItem>
                  <SelectItem value="per_minute">Per Minute</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <FieldEdit label="Rate Value *" value={rateCardForm.rateValue} onChange={(v) => setRateCardForm((p) => ({ ...p, rateValue: v }))} />
            <div>
              <label className="text-[11px] text-white/40 block mb-0.5">Currency</label>
              <Select value={rateCardForm.currency} onValueChange={(v) => setRateCardForm((p) => ({ ...p, currency: v }))}>
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
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddRate(false)} className="text-white/50 text-xs">Cancel</Button>
            <Button
              onClick={() => addRateCardMutation.mutate({
                sourceLanguage: rateCardForm.sourceLanguage,
                targetLanguage: rateCardForm.targetLanguage,
                serviceType: rateCardForm.serviceType,
                rateType: rateCardForm.rateType,
                rateValue: rateCardForm.rateValue,
                currency: rateCardForm.currency,
              })}
              disabled={!rateCardForm.sourceLanguage || !rateCardForm.targetLanguage || !rateCardForm.serviceType || !rateCardForm.rateValue || addRateCardMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
            >
              {addRateCardMutation.isPending ? "Adding..." : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoRow({ icon, label, value, mono = false }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-white/20">{icon}</span>
      <span className="text-white/30 w-24 shrink-0">{label}</span>
      <span className={`text-white/60 truncate ${mono ? "font-mono text-[11px]" : ""}`}>{value}</span>
    </div>
  );
}

function FieldEdit({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[11px] text-white/40 block mb-0.5">{label}</label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" />
    </div>
  );
}
