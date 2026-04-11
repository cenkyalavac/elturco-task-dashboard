import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Save, Mail, Phone, Building2, Users, FolderKanban, Plus, Trash2, DollarSign,
} from "lucide-react";

export default function CustomerDetailPage() {
  const [, params] = useRoute("/customers/:id");
  const customerId = params?.id;
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [showAddContact, setShowAddContact] = useState(false);
  const [showAddSubAccount, setShowAddSubAccount] = useState(false);
  const [contactForm, setContactForm] = useState({ name: "", email: "", phone: "", role: "" });
  const [subAccountForm, setSubAccountForm] = useState({ name: "", code: "" });

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

  const projectsQuery = useQuery({
    queryKey: ["/api/projects", "customer", customerId],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/projects?customerId=${customerId}`);
      return r.json();
    },
    enabled: !!customerId,
  });

  const updateMutation = useMutation({
    mutationFn: async (body: any) => {
      const r = await apiRequest("PATCH", `/api/customers/${customerId}`, body);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId] });
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
      setContactForm({ name: "", email: "", phone: "", role: "" });
      toast({ title: "Contact added" });
    },
  });

  const addSubAccountMutation = useMutation({
    mutationFn: async (body: any) => {
      const r = await apiRequest("POST", `/api/customers/${customerId}/sub-accounts`, body);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "sub-accounts"] });
      setShowAddSubAccount(false);
      setSubAccountForm({ name: "", code: "" });
      toast({ title: "Sub-account added" });
    },
  });

  if (isLoading) return <div className="p-6"><Skeleton className="h-64 w-full bg-white/[0.04] rounded-lg" /></div>;
  if (!customer) return <div className="p-6 text-white/30">Customer not found</div>;

  const startEdit = () => { setForm({ ...customer }); setEditing(true); };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/customers">
          <button className="w-8 h-8 rounded-md flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.06]">
            <ArrowLeft className="w-4 h-4" />
          </button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/15 flex items-center justify-center text-emerald-400 text-sm font-bold">
              {customer.name?.[0]?.toUpperCase() || "?"}
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">{customer.name}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                {customer.code && <span className="text-[10px] text-white/25 font-mono">{customer.code}</span>}
                <Badge className={`text-[10px] ${customer.status === "ACTIVE" || customer.status === "active" ? "bg-green-500/20 text-green-400" : "bg-zinc-500/20 text-zinc-400"}`}>{customer.status}</Badge>
              </div>
            </div>
          </div>
        </div>
        {!editing ? (
          <Button size="sm" variant="outline" onClick={startEdit} className="text-xs">Edit</Button>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="text-xs text-white/50">Cancel</Button>
            <Button size="sm" onClick={() => updateMutation.mutate(form)} disabled={updateMutation.isPending} className="bg-blue-600 hover:bg-blue-700 text-white text-xs">
              <Save className="w-3 h-3 mr-1" />Save
            </Button>
          </div>
        )}
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-white/[0.04] border border-white/[0.06]">
          <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
          <TabsTrigger value="contacts" className="text-xs">Contacts</TabsTrigger>
          <TabsTrigger value="sub-accounts" className="text-xs">Sub-Accounts</TabsTrigger>
          <TabsTrigger value="projects" className="text-xs">Projects</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-medium text-white/70">Details</h3>
              {editing ? (
                <div className="space-y-2">
                  <FieldEdit label="Name" value={form.name} onChange={v => setForm((p: any) => ({ ...p, name: v }))} />
                  <FieldEdit label="Email" value={form.email || ""} onChange={v => setForm((p: any) => ({ ...p, email: v }))} />
                  <FieldEdit label="Phone" value={form.phone || ""} onChange={v => setForm((p: any) => ({ ...p, phone: v }))} />
                  <FieldEdit label="Code" value={form.code || ""} onChange={v => setForm((p: any) => ({ ...p, code: v }))} />
                </div>
              ) : (
                <div className="space-y-2">
                  {customer.email && <InfoRow icon={<Mail className="w-3 h-3" />} label="Email" value={customer.email} />}
                  {customer.phone && <InfoRow icon={<Phone className="w-3 h-3" />} label="Phone" value={customer.phone} />}
                  <InfoRow icon={<Building2 className="w-3 h-3" />} label="Type" value={customer.clientType || "CLIENT"} />
                  <InfoRow icon={<DollarSign className="w-3 h-3" />} label="Currency" value={customer.currency || "EUR"} />
                  {customer.vatNumber && <InfoRow icon={<Building2 className="w-3 h-3" />} label="VAT" value={customer.vatNumber} />}
                  {customer.paymentTermsDays && <InfoRow icon={<DollarSign className="w-3 h-3" />} label="Payment Terms" value={`${customer.paymentTermsDays} days`} />}
                </div>
              )}
            </div>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-medium text-white/70">Summary</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center p-3 bg-white/[0.02] rounded-lg">
                  <p className="text-[10px] text-white/30">Sub-Accounts</p>
                  <p className="text-lg font-semibold text-white">{(subAccountsQuery.data || []).length}</p>
                </div>
                <div className="text-center p-3 bg-white/[0.02] rounded-lg">
                  <p className="text-[10px] text-white/30">Contacts</p>
                  <p className="text-lg font-semibold text-white">{(contactsQuery.data || []).length}</p>
                </div>
                <div className="text-center p-3 bg-white/[0.02] rounded-lg col-span-2">
                  <p className="text-[10px] text-white/30">Projects</p>
                  <p className="text-lg font-semibold text-white">{(projectsQuery.data?.data || projectsQuery.data?.projects || []).length}</p>
                </div>
              </div>
              {customer.notes && <div className="text-xs text-white/30 mt-2 whitespace-pre-wrap">{customer.notes}</div>}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="contacts" className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-white/70">Contacts</h3>
            <Button size="sm" onClick={() => setShowAddContact(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-xs">
              <Plus className="w-3 h-3 mr-1" />Add Contact
            </Button>
          </div>
          {contactsQuery.isLoading ? (
            <Skeleton className="h-20 bg-white/[0.04] rounded" />
          ) : (contactsQuery.data || []).length === 0 ? (
            <p className="text-xs text-white/20 text-center py-8">No contacts yet</p>
          ) : (
            (contactsQuery.data || []).map((c: any) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3 bg-white/[0.02] border border-white/[0.06] rounded-lg">
                <div className="w-8 h-8 rounded-full bg-blue-500/15 flex items-center justify-center text-blue-400 text-xs font-bold">{c.name[0]?.toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium">{c.name}</p>
                  <div className="flex items-center gap-2 text-[11px] text-white/30">
                    {c.email && <span>{c.email}</span>}
                    {c.role && <Badge variant="secondary" className="text-[9px]">{c.role}</Badge>}
                    {c.isPrimary && <Badge className="text-[9px] bg-green-500/15 text-green-400">Primary</Badge>}
                  </div>
                </div>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="sub-accounts" className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-white/70">Sub-Accounts</h3>
            <Button size="sm" onClick={() => setShowAddSubAccount(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-xs">
              <Plus className="w-3 h-3 mr-1" />Add Sub-Account
            </Button>
          </div>
          {subAccountsQuery.isLoading ? (
            <Skeleton className="h-20 bg-white/[0.04] rounded" />
          ) : (subAccountsQuery.data || []).length === 0 ? (
            <p className="text-xs text-white/20 text-center py-8">No sub-accounts yet</p>
          ) : (
            (subAccountsQuery.data || []).map((sa: any) => (
              <div key={sa.id} className="flex items-center gap-3 px-4 py-3 bg-white/[0.02] border border-white/[0.06] rounded-lg">
                <FolderKanban className="w-4 h-4 text-white/20" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium">{sa.name}</p>
                  {sa.code && <p className="text-[10px] text-white/25 font-mono">{sa.code}</p>}
                </div>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="projects" className="space-y-3">
          <h3 className="text-sm font-medium text-white/70">Projects</h3>
          {projectsQuery.isLoading ? (
            <Skeleton className="h-20 bg-white/[0.04] rounded" />
          ) : (projectsQuery.data?.data || projectsQuery.data?.projects || []).length === 0 ? (
            <p className="text-xs text-white/20 text-center py-8">No projects yet</p>
          ) : (
            (projectsQuery.data?.data || projectsQuery.data?.projects || []).map((p: any) => (
              <Link key={p.id} href={`/projects/${p.id}`}>
                <div className="flex items-center gap-3 px-4 py-3 bg-white/[0.02] border border-white/[0.06] rounded-lg hover:bg-white/[0.04] cursor-pointer transition">
                  <FolderKanban className="w-4 h-4 text-white/20" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{p.projectName}</p>
                    {p.projectCode && <p className="text-[10px] text-white/25 font-mono">{p.projectCode}</p>}
                  </div>
                  <Badge className={`text-[10px] ${p.status === "active" ? "bg-green-500/20 text-green-400" : "bg-zinc-500/20 text-zinc-400"}`}>{p.status}</Badge>
                </div>
              </Link>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Add Contact Dialog */}
      <Dialog open={showAddContact} onOpenChange={setShowAddContact}>
        <DialogContent className="bg-[#1a1d27] border-white/[0.08] text-white">
          <DialogHeader><DialogTitle>Add Contact</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <FieldEdit label="Name *" value={contactForm.name} onChange={v => setContactForm(p => ({ ...p, name: v }))} />
            <FieldEdit label="Email" value={contactForm.email} onChange={v => setContactForm(p => ({ ...p, email: v }))} />
            <FieldEdit label="Phone" value={contactForm.phone} onChange={v => setContactForm(p => ({ ...p, phone: v }))} />
            <FieldEdit label="Role" value={contactForm.role} onChange={v => setContactForm(p => ({ ...p, role: v }))} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddContact(false)} className="text-white/50 text-xs">Cancel</Button>
            <Button onClick={() => addContactMutation.mutate(contactForm)} disabled={!contactForm.name || addContactMutation.isPending} className="bg-blue-600 hover:bg-blue-700 text-white text-xs">Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Sub-Account Dialog */}
      <Dialog open={showAddSubAccount} onOpenChange={setShowAddSubAccount}>
        <DialogContent className="bg-[#1a1d27] border-white/[0.08] text-white">
          <DialogHeader><DialogTitle>Add Sub-Account</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <FieldEdit label="Name *" value={subAccountForm.name} onChange={v => setSubAccountForm(p => ({ ...p, name: v }))} />
            <FieldEdit label="Code" value={subAccountForm.code} onChange={v => setSubAccountForm(p => ({ ...p, code: v }))} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddSubAccount(false)} className="text-white/50 text-xs">Cancel</Button>
            <Button onClick={() => addSubAccountMutation.mutate(subAccountForm)} disabled={!subAccountForm.name || addSubAccountMutation.isPending} className="bg-blue-600 hover:bg-blue-700 text-white text-xs">Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-white/20">{icon}</span>
      <span className="text-white/30 w-20">{label}</span>
      <span className="text-white/60">{value}</span>
    </div>
  );
}

function FieldEdit({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[11px] text-white/40 block mb-0.5">{label}</label>
      <Input value={value} onChange={e => onChange(e.target.value)} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" />
    </div>
  );
}
