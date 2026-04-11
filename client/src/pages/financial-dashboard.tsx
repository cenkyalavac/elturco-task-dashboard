import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import {
  TrendingUp, TrendingDown, DollarSign, CreditCard, ArrowUpRight, ArrowDownRight,
  Receipt, ShoppingCart, Wallet, PiggyBank,
} from "lucide-react";
import { Link } from "wouter";

function formatCurrency(amount: number, currency: string = "EUR") {
  if (!amount && amount !== 0) return "—";
  const symbol = currency === "GBP" ? "\u00A3" : currency === "EUR" ? "\u20AC" : "$";
  if (Math.abs(amount) >= 1000) {
    return `${symbol}${(amount / 1000).toFixed(1)}k`;
  }
  return `${symbol}${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatFullCurrency(amount: number, currency: string = "EUR") {
  const symbol = currency === "GBP" ? "\u00A3" : currency === "EUR" ? "\u20AC" : "$";
  return `${symbol}${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try { return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); } catch { return dateStr; }
}

const INVOICE_STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-500/15 text-slate-400 border-slate-500/20" },
  sent: { label: "Sent", className: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  paid: { label: "Paid", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  overdue: { label: "Overdue", className: "bg-red-500/15 text-red-400 border-red-500/20" },
};

const PO_STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-500/15 text-slate-400 border-slate-500/20" },
  sent: { label: "Sent", className: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  accepted: { label: "Accepted", className: "bg-purple-500/15 text-purple-400 border-purple-500/20" },
  paid: { label: "Paid", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
};

export default function FinancialDashboardPage() {
  const now = new Date();
  const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

  const [entityFilter, setEntityFilter] = useState("all");
  const [startDate, setStartDate] = useState(
    `${now.getFullYear()}-01-01`
  );
  const [endDate, setEndDate] = useState(endOfMonth);

  const entityParam = entityFilter !== "all" ? `&entityId=${entityFilter}` : "";

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: [`/api/financial/summary?startDate=${startDate}&endDate=${endDate}${entityParam}`],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/financial/summary?startDate=${startDate}&endDate=${endDate}${entityParam}`);
      return r.json();
    },
  });

  const { data: aging } = useQuery({
    queryKey: [`/api/financial/ar-aging?${entityParam.substring(1)}`],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/financial/ar-aging?${entityParam.substring(1)}`);
      return r.json();
    },
  });

  const { data: revenueByCustomer } = useQuery({
    queryKey: [`/api/financial/revenue-by-customer?limit=10${entityParam}`],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/financial/revenue-by-customer?limit=10${entityParam}`);
      return r.json();
    },
  });

  const { data: costByVendor } = useQuery({
    queryKey: [`/api/financial/cost-by-vendor?limit=10${entityParam}`],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/financial/cost-by-vendor?limit=10${entityParam}`);
      return r.json();
    },
  });

  const { data: monthlyTrend } = useQuery({
    queryKey: [`/api/financial/monthly-trend?months=12${entityParam}`],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/financial/monthly-trend?months=12${entityParam}`);
      return r.json();
    },
  });

  const { data: revenueByEntity } = useQuery({
    queryKey: ["/api/financial/revenue-by-entity"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/financial/revenue-by-entity");
      return r.json();
    },
  });

  const { data: recentInvoices } = useQuery({
    queryKey: [`/api/invoices?limit=5&page=1${entityParam}`],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/invoices?limit=5&page=1${entityParam}`);
      return r.json();
    },
  });

  const { data: outstandingPOs } = useQuery({
    queryKey: [`/api/purchase-orders?status=sent&limit=5&page=1${entityParam}`],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/purchase-orders?status=sent&limit=5&page=1${entityParam}`);
      return r.json();
    },
  });

  const { data: entitiesData } = useQuery({
    queryKey: ["/api/entities"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/entities"); return r.json(); },
  });

  const entityList = Array.isArray(entitiesData) ? entitiesData : [];

  const grossMargin = (summary?.totalRevenue || 0) - (summary?.totalCost || 0);
  const marginPercent = (summary?.totalRevenue || 0) > 0 ? (grossMargin / summary!.totalRevenue) * 100 : 0;

  // Build monthly trend chart data
  const trendData = (() => {
    if (!monthlyTrend) return [];
    const revenueMap = new Map<string, number>((monthlyTrend.revenue || []).map((r: any) => [r.month, parseFloat(r.total)]));
    const costMap = new Map<string, number>((monthlyTrend.cost || []).map((c: any) => [c.month, parseFloat(c.total)]));
    const allMonths = new Set([...revenueMap.keys(), ...costMap.keys()]);
    return Array.from(allMonths).sort().map(month => ({
      month,
      revenue: revenueMap.get(month) || 0,
      cost: costMap.get(month) || 0,
      margin: (revenueMap.get(month) || 0) - (costMap.get(month) || 0),
    }));
  })();

  // AR aging chart data
  const agingData = aging ? [
    { name: "Current", value: aging.current },
    { name: "1-30", value: aging.days30 },
    { name: "31-60", value: aging.days60 },
    { name: "61-90", value: aging.days90 },
    { name: "90+", value: aging.over90 },
  ] : [];

  return (
    <div className="h-full overflow-auto">
      {/* Header */}
      <div className="border-b border-border bg-card px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-sm font-semibold text-foreground mr-2">Financial Dashboard</h1>
          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger className="w-40 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Entities</SelectItem>
              {entityList.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1.5 ml-auto">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-8 text-sm w-36" />
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-8 text-sm w-36" />
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard
            title="Total Revenue"
            value={summaryLoading ? null : summary?.totalRevenue || 0}
            icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}
            color="emerald"
          />
          <KpiCard
            title="Total Cost"
            value={summaryLoading ? null : summary?.totalCost || 0}
            icon={<TrendingDown className="w-4 h-4 text-red-400" />}
            color="red"
          />
          <KpiCard
            title="Gross Margin"
            value={summaryLoading ? null : grossMargin}
            subtitle={summaryLoading ? "" : `${marginPercent.toFixed(1)}%`}
            icon={<PiggyBank className="w-4 h-4 text-blue-400" />}
            color={grossMargin >= 0 ? "emerald" : "red"}
          />
          <KpiCard
            title="Outstanding AR"
            value={summaryLoading ? null : summary?.outstandingAR || 0}
            icon={<Receipt className="w-4 h-4 text-amber-400" />}
            color="amber"
          />
          <KpiCard
            title="Outstanding AP"
            value={summaryLoading ? null : summary?.outstandingAP || 0}
            icon={<ShoppingCart className="w-4 h-4 text-purple-400" />}
            color="purple"
          />
          <KpiCard
            title="Cash Collected"
            value={summaryLoading ? null : summary?.paidRevenue || 0}
            icon={<Wallet className="w-4 h-4 text-teal-400" />}
            color="teal"
          />
        </div>

        {/* Charts Row 1: Revenue vs Cost Trend + Revenue by Entity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="py-2.5 px-4">
              <CardTitle className="text-xs font-semibold">Revenue vs Cost (Monthly)</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
                    <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#1a1d27", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", fontSize: "12px" }}
                      formatter={(value: number) => formatFullCurrency(value)}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Revenue" />
                    <Line type="monotone" dataKey="cost" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} name="Cost" />
                    <Line type="monotone" dataKey="margin" stroke="#3b82f6" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="5 5" name="Margin" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-60 flex items-center justify-center text-sm text-muted-foreground">No data available</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-2.5 px-4">
              <CardTitle className="text-xs font-semibold">Revenue by Entity</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              {(revenueByEntity || []).length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={(revenueByEntity || []).map((e: any) => ({ name: e.entityCode || "N/A", total: parseFloat(e.total) }))} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
                    <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
                    <Tooltip contentStyle={{ backgroundColor: "#1a1d27", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", fontSize: "12px" }} formatter={(value: number) => formatFullCurrency(value)} />
                    <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Revenue" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-60 flex items-center justify-center text-sm text-muted-foreground">No data</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Charts Row 2: Revenue by Customer + Cost by Vendor */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="py-2.5 px-4">
              <CardTitle className="text-xs font-semibold">Top Customers by Revenue</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              {(revenueByCustomer || []).length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={(revenueByCustomer || []).map((c: any) => ({ name: c.customerName?.substring(0, 15) || "N/A", total: parseFloat(c.total) }))} layout="vertical" margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
                    <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
                    <Tooltip contentStyle={{ backgroundColor: "#1a1d27", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", fontSize: "12px" }} formatter={(value: number) => formatFullCurrency(value)} />
                    <Bar dataKey="total" fill="#10b981" radius={[0, 4, 4, 0]} name="Revenue" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-60 flex items-center justify-center text-sm text-muted-foreground">No data</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-2.5 px-4">
              <CardTitle className="text-xs font-semibold">Top Vendors by Cost</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              {(costByVendor || []).length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={(costByVendor || []).map((v: any) => ({ name: v.vendorName?.substring(0, 15) || "N/A", total: parseFloat(v.total) }))} layout="vertical" margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
                    <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
                    <Tooltip contentStyle={{ backgroundColor: "#1a1d27", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", fontSize: "12px" }} formatter={(value: number) => formatFullCurrency(value)} />
                    <Bar dataKey="total" fill="#ef4444" radius={[0, 4, 4, 0]} name="Cost" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-60 flex items-center justify-center text-sm text-muted-foreground">No data</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* AR Aging Chart */}
        <Card>
          <CardHeader className="py-2.5 px-4">
            <CardTitle className="text-xs font-semibold">AR Aging Report</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-2">
            {agingData.some(d => d.value > 0) ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={agingData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
                  <Tooltip contentStyle={{ backgroundColor: "#1a1d27", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", fontSize: "12px" }} formatter={(value: number) => formatFullCurrency(value)} />
                  <Bar dataKey="value" name="Outstanding" radius={[4, 4, 0, 0]}>
                    {agingData.map((_, idx) => {
                      const colors = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#dc2626"];
                      return <rect key={idx} fill={colors[idx] || "#3b82f6"} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No outstanding receivables</div>
            )}
          </CardContent>
        </Card>

        {/* Tables Row: Recent Invoices + Outstanding POs */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="py-2.5 px-4 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-semibold">Recent Invoices</CardTitle>
              <Link href="/invoices" className="text-[10px] text-primary hover:underline">View All</Link>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] px-3 py-1.5">Invoice #</TableHead>
                    <TableHead className="text-[10px] px-3 py-1.5">Date</TableHead>
                    <TableHead className="text-[10px] px-3 py-1.5 text-right">Amount</TableHead>
                    <TableHead className="text-[10px] px-3 py-1.5">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(recentInvoices?.data || []).map((inv: any) => {
                    const st = INVOICE_STATUS[inv.status] || { label: inv.status, className: "" };
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="px-3 py-1.5 text-xs font-medium">{inv.invoiceNumber || `INV-${inv.id}`}</TableCell>
                        <TableCell className="px-3 py-1.5 text-[10px] text-muted-foreground">{formatDate(inv.invoiceDate)}</TableCell>
                        <TableCell className="px-3 py-1.5 text-xs text-right">{formatFullCurrency(parseFloat(inv.total || "0"), inv.currency)}</TableCell>
                        <TableCell className="px-3 py-1.5"><Badge variant="outline" className={`text-[9px] px-1 py-0 border ${st.className}`}>{st.label}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                  {(!recentInvoices?.data || recentInvoices.data.length === 0) && (
                    <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-4">No invoices yet</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-2.5 px-4 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-semibold">Outstanding Purchase Orders</CardTitle>
              <Link href="/purchase-orders" className="text-[10px] text-primary hover:underline">View All</Link>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] px-3 py-1.5">PO #</TableHead>
                    <TableHead className="text-[10px] px-3 py-1.5">Date</TableHead>
                    <TableHead className="text-[10px] px-3 py-1.5 text-right">Amount</TableHead>
                    <TableHead className="text-[10px] px-3 py-1.5">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(outstandingPOs?.data || []).map((po: any) => {
                    const st = PO_STATUS[po.status] || { label: po.status, className: "" };
                    return (
                      <TableRow key={po.id}>
                        <TableCell className="px-3 py-1.5 text-xs font-medium">{po.poNumber || `PO-${po.id}`}</TableCell>
                        <TableCell className="px-3 py-1.5 text-[10px] text-muted-foreground">{formatDate(po.createdAt)}</TableCell>
                        <TableCell className="px-3 py-1.5 text-xs text-right">{formatFullCurrency(parseFloat(po.amount || "0"), po.currency)}</TableCell>
                        <TableCell className="px-3 py-1.5"><Badge variant="outline" className={`text-[9px] px-1 py-0 border ${st.className}`}>{st.label}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                  {(!outstandingPOs?.data || outstandingPOs.data.length === 0) && (
                    <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-4">No outstanding POs</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ title, value, subtitle, icon, color }: {
  title: string;
  value: number | null;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{title}</span>
          {icon}
        </div>
        {value === null ? (
          <Skeleton className="h-6 w-24 mt-1" />
        ) : (
          <>
            <p className="text-lg font-bold text-foreground tabular-nums">
              {formatCurrency(value)}
            </p>
            {subtitle && <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
