import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Search, Plus, ChevronLeft, ChevronRight, Loader2, Filter } from "lucide-react";

interface Customer {
  id: number;
  name: string;
  code: string;
  status: string;
  email: string | null;
  currency: string | null;
  primaryPmId: number | null;
  paymentTermsType: string | null;
  paymentTermsDays: number | null;
  clientType: string | null;
}

interface CustomersResponse {
  data: Customer[];
  total: number;
  page: number;
  limit: number;
}

interface NewCustomerForm {
  name: string;
  code: string;
  email: string;
  currency: string;
  status: string;
  paymentTermsType: string;
  paymentTermsDays: string;
}

const CURRENCIES = ["USD", "EUR", "GBP", "TRY", "AED", "JPY", "CAD", "AUD"];

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  ACTIVE: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  inactive: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
  INACTIVE: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
  suspended: "bg-red-500/15 text-red-400 border-red-500/25",
  prospect: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  PROSPECT: "bg-blue-500/15 text-blue-400 border-blue-500/25",
};

const PAGE_LIMIT = 20;

export default function CustomersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  const [form, setForm] = useState<NewCustomerForm>({
    name: "", code: "", email: "", currency: "EUR", status: "active",
    paymentTermsType: "net", paymentTermsDays: "30",
  });

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
    clearTimeout((handleSearchChange as any)._timer);
    (handleSearchChange as any)._timer = setTimeout(() => {
      setDebouncedSearch(value);
    }, 300);
  };

  const queryParams = new URLSearchParams();
  if (debouncedSearch) queryParams.set("search", debouncedSearch);
  queryParams.set("page", String(page));
  queryParams.set("limit", String(PAGE_LIMIT));

  const { data, isLoading } = useQuery<CustomersResponse>({
    queryKey: ["/api/customers", debouncedSearch, page],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/customers?${queryParams.toString()}`);
      return res.json();
    },
  });

  const { data: usersData } = useQuery({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/users");
      return r.json().catch(() => []);
    },
  });

  const allCustomers = data?.data ?? [];
  const total = data?.total ?? 0;
  const users: any[] = usersData || [];

  // Client-side status filter
  const customers = useMemo(() => {
    if (statusFilter === "all") return allCustomers;
    return allCustomers.filter((c) => c.status?.toLowerCase() === statusFilter.toLowerCase());
  }, [allCustomers, statusFilter]);

  const totalPages = Math.ceil(total / PAGE_LIMIT);

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest("POST", "/api/customers", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Customer created successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function resetForm() {
    setForm({ name: "", code: "", email: "", currency: "EUR", status: "active", paymentTermsType: "net", paymentTermsDays: "30" });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.code.trim()) {
      toast({ title: "Name and code are required", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      name: form.name,
      code: form.code,
      email: form.email || null,
      currency: form.currency,
      status: form.status,
      paymentTermsType: form.paymentTermsType,
      paymentTermsDays: form.paymentTermsDays ? parseInt(form.paymentTermsDays) : null,
    });
  }

  const getUserName = (pmId: number | null) => {
    if (!pmId) return "\u2014";
    const u = users.find((u: any) => u.id === pmId);
    return u ? u.name : "\u2014";
  };

  const formatPaymentTerms = (c: Customer) => {
    if (!c.paymentTermsDays) return c.paymentTermsType || "\u2014";
    return `${c.paymentTermsType || "Net"} ${c.paymentTermsDays}d`;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card px-4 py-2.5">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-foreground mr-4">
            Customers
          </h1>

          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, code, email..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10 h-8 text-sm"
            />
          </div>

          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-32 h-8 text-sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="prospect">Prospect</SelectItem>
            </SelectContent>
          </Select>

          <span className="text-xs text-muted-foreground ml-auto tabular-nums">
            {total} customer{total !== 1 ? "s" : ""}
          </span>

          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="w-3.5 h-3.5" />
            Add Customer
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-12 bg-muted/40 rounded animate-pulse" />
            ))}
          </div>
        ) : customers.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            {debouncedSearch ? "No customers match your search" : "No customers yet"}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border">
                <TableHead className="text-xs font-medium text-muted-foreground h-9 px-3">Code</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground h-9 px-3">Name</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground h-9 px-3">Status</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground h-9 px-3">Primary PM</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground h-9 px-3">Currency</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground h-9 px-3">Payment Terms</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground h-9 px-3">Email</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => (
                <TableRow
                  key={customer.id}
                  className="border-border hover:bg-muted/30 transition-colors"
                >
                  <TableCell className="px-3 py-2">
                    <Badge variant="secondary" className="text-[10px] font-normal px-1.5 py-0 font-mono">
                      {customer.code}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-3 py-2 font-medium text-foreground">
                    <Link
                      href={`/customers/${customer.id}`}
                      className="text-primary hover:underline"
                    >
                      {customer.name}
                    </Link>
                  </TableCell>
                  <TableCell className="px-3 py-2">
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 capitalize border ${STATUS_COLORS[customer.status] || ""}`}
                    >
                      {customer.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-3 py-2 text-xs text-muted-foreground">
                    {getUserName(customer.primaryPmId)}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-xs text-muted-foreground">
                    {customer.currency || "\u2014"}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-xs text-muted-foreground">
                    {formatPaymentTerms(customer)}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-xs text-muted-foreground">
                    {customer.email || "\u2014"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="border-t border-border bg-card px-4 py-2 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages} &middot; {total} total
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const pageNum = totalPages <= 7
                ? i + 1
                : page <= 4
                  ? i + 1
                  : page >= totalPages - 3
                    ? totalPages - 6 + i
                    : page - 3 + i;
              return (
                <Button
                  key={pageNum}
                  variant={pageNum === page ? "default" : "ghost"}
                  size="sm"
                  className="h-7 w-7 p-0 text-xs"
                  onClick={() => setPage(pageNum)}
                >
                  {pageNum}
                </Button>
              );
            })}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Add Customer Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Customer</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="customer-name" className="text-xs">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="customer-name"
                placeholder="Acme Corp"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="customer-code" className="text-xs">
                Code <span className="text-destructive">*</span>
              </Label>
              <Input
                id="customer-code"
                placeholder="ACME"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                className="h-8 text-sm font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="customer-email" className="text-xs">Email</Label>
              <Input
                id="customer-email"
                type="email"
                placeholder="contact@acme.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="customer-currency" className="text-xs">Currency</Label>
                <Select
                  value={form.currency}
                  onValueChange={(val) => setForm((f) => ({ ...f, currency: val }))}
                >
                  <SelectTrigger id="customer-currency" className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="customer-status" className="text-xs">Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(val) => setForm((f) => ({ ...f, status: val }))}
                >
                  <SelectTrigger id="customer-status" className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="prospect">Prospect</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Payment Terms</Label>
                <Select value={form.paymentTermsType} onValueChange={(val) => setForm((f) => ({ ...f, paymentTermsType: val }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="net">Net</SelectItem>
                    <SelectItem value="due_on_receipt">Due on Receipt</SelectItem>
                    <SelectItem value="end_of_month">End of Month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Days</Label>
                <Input
                  type="number"
                  value={form.paymentTermsDays}
                  onChange={(e) => setForm((f) => ({ ...f, paymentTermsDays: e.target.value }))}
                  className="h-8 text-sm"
                  placeholder="30"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => { setDialogOpen(false); resetForm(); }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="h-8 text-xs gap-1.5"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                Add Customer
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
