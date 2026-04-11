import { useState } from "react";
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
import { Search, Plus, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

// ── Types ──

interface Customer {
  id: number;
  name: string;
  code: string;
  status: string;
  email: string | null;
  currency: string | null;
  primaryPm: string | null;
  primaryPmName: string | null;
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
}

const CURRENCIES = ["USD", "EUR", "GBP", "TRY", "AED", "JPY", "CAD", "AUD"];

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive"> = {
  active: "default",
  inactive: "secondary",
  suspended: "destructive",
};

const PAGE_LIMIT = 20;

// ── Component ──

export default function CustomersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form state
  const [form, setForm] = useState<NewCustomerForm>({
    name: "",
    code: "",
    email: "",
    currency: "USD",
    status: "active",
  });

  // Debounce search
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
    clearTimeout((handleSearchChange as any)._timer);
    (handleSearchChange as any)._timer = setTimeout(() => {
      setDebouncedSearch(value);
    }, 300);
  };

  // Query
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

  const customers = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_LIMIT);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (payload: NewCustomerForm) => {
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
    setForm({ name: "", code: "", email: "", currency: "USD", status: "active" });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.code.trim()) {
      toast({ title: "Name and code are required", variant: "destructive" });
      return;
    }
    createMutation.mutate(form);
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card px-4 py-2.5">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-foreground mr-4" data-testid="text-customers-title">
            Customers
          </h1>

          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, code, email..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10 h-8 text-sm"
              data-testid="input-customer-search"
            />
          </div>

          <span className="text-xs text-muted-foreground ml-auto tabular-nums">
            {total} customer{total !== 1 ? "s" : ""}
          </span>

          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setDialogOpen(true)}
            data-testid="button-add-customer"
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
          <Table data-testid="table-customers">
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border">
                <TableHead className="text-xs font-medium text-muted-foreground h-9 px-3">Name</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground h-9 px-3">Code</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground h-9 px-3">Status</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground h-9 px-3">Email</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground h-9 px-3">Currency</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground h-9 px-3">Primary PM</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => (
                <TableRow
                  key={customer.id}
                  className="border-border hover:bg-muted/30 transition-colors"
                  data-testid={`row-customer-${customer.id}`}
                >
                  <TableCell className="px-3 py-2 font-medium text-foreground">
                    <Link
                      href={`/customers/${customer.id}`}
                      className="text-primary hover:underline"
                      data-testid={`link-customer-${customer.id}`}
                    >
                      {customer.name}
                    </Link>
                  </TableCell>
                  <TableCell className="px-3 py-2">
                    <Badge variant="secondary" className="text-[10px] font-normal px-1.5 py-0 font-mono">
                      {customer.code}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-3 py-2">
                    <Badge
                      variant={STATUS_VARIANTS[customer.status] ?? "secondary"}
                      className="text-[10px] px-1.5 py-0 capitalize"
                    >
                      {customer.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-3 py-2 text-xs text-muted-foreground">
                    {customer.email || "—"}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-xs text-muted-foreground">
                    {customer.currency || "—"}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-xs text-muted-foreground">
                    {customer.primaryPmName || customer.primaryPm || "—"}
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
              data-testid="button-prev-page"
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
                  data-testid={`button-page-${pageNum}`}
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
              data-testid="button-next-page"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Add Customer Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-add-customer">
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
                data-testid="input-customer-name"
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
                data-testid="input-customer-code"
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
                data-testid="input-customer-email"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="customer-currency" className="text-xs">Currency</Label>
                <Select
                  value={form.currency}
                  onValueChange={(val) => setForm((f) => ({ ...f, currency: val }))}
                >
                  <SelectTrigger id="customer-currency" className="h-8 text-sm" data-testid="select-customer-currency">
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
                  <SelectTrigger id="customer-status" className="h-8 text-sm" data-testid="select-customer-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => { setDialogOpen(false); resetForm(); }}
                data-testid="button-cancel-customer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="h-8 text-xs gap-1.5"
                disabled={createMutation.isPending}
                data-testid="button-submit-customer"
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
