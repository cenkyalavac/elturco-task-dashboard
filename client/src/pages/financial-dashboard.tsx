import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell,
} from "recharts";
import {
  TrendingUp, TrendingDown, DollarSign, ArrowUpRight, ArrowDownRight,
  Receipt, Wallet, PiggyBank, AlertTriangle, Calendar,
} from "lucide-react";
import { Link } from "wouter";

function formatCurrency(amount: number | string | null, currency: string = "EUR"): string {
  if (!amount && amount !== 0) return "—";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "—";
  const symbol = currency === "GBP" ? "\u00A3" : currency === "EUR" ? "\u20AC" : currency === "TRY" ? "\u20BA" : "$";
  return `${symbol}${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCompactCurrency(amount: number, currency: string = "EUR") {
  if (!amount && amount !== 0) return "—";
  const symbol = currency === "GBP" ? "\u00A3" : currency === "EUR" ? "\u20AC" : currency === "TRY" ? "\u20BA" : "$";
  if (Math.abs(amount) >= 1000000) return `${symbol}${(amount / 1000000).toFixed(1)}M`;
  if (Math.abs(amount) >= 1000) return `${symbol}${(amount / 1000).toFixed(1)}k`;
  return `${symbol}${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try { return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); } catch { return dateStr; }
}

function daysBetween(dateStr: string): number {
  return Math.floor((new Date().getTime() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function getDatePreset(preset: string): { start: string; end: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  switch (preset) {
    case "this_month": return { start: `${year}-${String(month + 1).padStart(2, "0")}-01`, end: new Date(year, month + 1, 0).toISOString().split("T")[0] };
    case "last_month": return { start: `${month === 0 ? year - 1 : year}-${String(month === 0 ? 12 : month).padStart(2, "0")}-01`, end: new Date(month === 0 ? year - 1 : year, month === 0 ? 12 : month, 0).toISOString().split("T")[0] };
    case "this_quarter": { const qs = Math.floor(month / 3) * 3; return { start: `${year}-${String(qs + 1).padStart(2, "0")}-01`, end: new Date(year, qs + 3, 0).toISOString().split("T")[0] }; }
    case "this_year": return { start: `${year}-01-01`, end: `${year}-12-31` };
    case "ytd": return { start: `${year}-01-01`, end: now.toISOString().split("T")[0] };
    default: return { start: `${year}-01-01`, end: now.toISOString().split("T")[0] };
  }
}

const INVOICE_STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-500/15 text-slate-400 border-slate-500/20" },
  sent: { label: "Sent", className: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  paid: { label: "Paid", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  overdue: { label: "Overdue", className: "bg-red-500/15 text-red-400 border-red-500/20" },
  cancelled: { label: "Cancelled", className: "bg-orange-500/15 text-orange-400 border-orange-500/20" },
};

const PO_STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-500/15 text-slate-400 border-slate-500/20" },
  sent: { label: "Sent", className: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  accepted: { label: "Accepted", className: "bg-purple-500/15 text-purple-400 border-purple-500/20" },
  paid: { label: "Paid", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
};

const AGING_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#dc2626"];
const TOOLTIP_STYLE = { backgroundColor: "#1a1d27", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", fontSize: "12px" };

export default function FinancialDashboardPage() {
  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

  const [entityFilter, setEntityFilter] = useState("all");
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(endOfMonth);

  const entityParam = entityFilter !== "all" ? `&entityId=${entityFilter}` : "";
  const entityOnlyParam = entityFilter !== "all" ? `entityId=${entityFilter}` : "";

  function applyPreset(preset: string) {
    const { start, end } = getDatePreset(preset);
    setStartDate(start);
    setEndDate(end);
  }

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: [`/api/financial/summary?startDate=${startDate}&endDate=${endDate}${entityParam}`],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/financial/summary?startDate=${startDate}&endDate=${endDate}${entityParam}`);
      return r.json();
    },
  });

  const { data: aging } = useQuery({
    queryKey: [`/api/financial/ar-aging?${entityOnlyParam}`],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/financial/ar-aging?${entityOnlyParam}`);
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

  const { data: overdueInvoicesData } = useQuery({
    queryKey: [`/api/invoices?status=overdue&limit=50&page=1${entityParam}`],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/invoices?status=overdue&limit=50&page=1${entityParam}`);
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
  const overdueInvoices = overdueInvoicesData?.data || [];

  const totalRevenue = summary?.totalRevenue || 0;
  const totalCost = summary?.totalCost || 0;
  const grossMargin = totalRevenue - totalCost;
  const marginPercent = totalRevenue > 0 ? (grossMargin / totalRevenue) * 100 : 0;
  const outstandingAR = summary?.outstandingAR || 0;
  const overdueCount = overdueInvoices.length;

  // Monthly trend chart data
  const trendData = useMemo(() => {
    if (!monthlyTrend) {
      if (summary && (totalRevenue > 0 || totalCost > 0)) {
        return [{ month: "Total", revenue: totalRevenue, cost: totalCost, margin: grossMargin }];
      }
      return [];
    }
    const revenueMap = new Map<string, number>((monthlyTrend.revenue || []).map((r: any) => [r.month, parseFloat(r.total)]));
    const costMap = new Map<string, number>((monthlyTrend.cost || []).map((c: any) => [c.month, parseFloat(c.total)]));
    const allMonths = new Set([...revenueMap.keys(), ...costMap.keys()]);
    return Array.from(allMonths).sort().map(month => ({
      month: month.length > 7 ? month.substring(0, 7) : month,
      revenue: revenueMap.get(month) || 0,
      cost: costMap.get(month) || 0,
      margin: (revenueMap.get(month) || 0) - (costMap.get(month) || 0),
    }));
  }, [monthlyTrend, summary, totalRevenue, totalCost, grossMargin]);

  // AR Aging chart data
  const agingChartData = useMemo(() => {
    if (!aging) return [];
    return [
      { name: "Current", value: parseFloat(String(aging.current)) || 0, fill: AGING_COLORS[0] },
      { name: "1-30 days", value: parseFloat(String(aging.days30)) || 0, fill: AGING_COLORS[1] },
      { name: "31-60 days", value: parseFloat(String(aging.days60)) || 0, fill: AGING_COLORS[2] },
      { name: "61-90 days", value: parseFloat(String(aging.days90)) || 0, fill: AGING_COLORS[3] },
      { name: "90+ days", value: parseFloat(String(aging.over90)) || 0, fill: AGING_COLORS[4] },
    ];
  }, [aging]);

  // Revenue by customer table data
  const customerTableData = useMemo(() => {
    if (!revenueByCustomer || !Array.isArray(revenueByCustomer)) return [];
    const maxRevenue = Math.max(...revenueByCustomer.map((c: any) => parseFloat(String(c.total)) || 0), 1);
    return revenueByCustomer.map((c: any) => ({
      name: c.customerName || `Customer #${c.customerId}`,
      revenue: parseFloat(String(c.total)) || 0,
      invoices: parseInt(String(c.invoiceCount || 0), 10),
      barWidth: ((parseFloat(String(c.total)) || 0) / maxRevenue) * 100,
    }));
  }, [revenueByCustomer]);

  // Cost by vendor table data
  const vendorTableData = useMemo(() => {
    if (!costByVendor || !Array.isArray(costByVendor)) return [];
    const maxCost = Math.max(...costByVendor.map((v: any) => parseFloat(String(v.total)) || 0), 1);
    return costByVendor.map((v: any) => ({
      name: v.vendorName || `Vendor #${v.vendorId}`,
      cost: parseFloat(String(v.total)) || 0,
      pos: parseInt(String(v.poCount || 0), 10),
      barWidth: ((parseFloat(String(v.total)) || 0) / maxCost) * 100,
    }));
  }, [costByVendor]);

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
          <div className="flex items-center gap-1">
            {[
              { label: "MTD", value: "this_month" },
              { label: "Last Mo", value: "last_month" },
              { label: "QTD", value: "this_quarter" },
              { label: "YTD", value: "ytd" },
              { label: "Full Year", value: "this_year" },
            ].map(preset => (
              <Button key={preset.value} variant="outline" size="sm" className="h-7 text-[10px] px-2" onClick={() => applyPreset(preset.value)}>
                {preset.label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-8 text-sm w-36" />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-8 text-sm w-36" />
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard title="Total Revenue" value={summaryLoading ? null : totalRevenue} icon={<TrendingUp className="w-4 h-4 text-emerald-400" />} color="emerald" trend="up" />
          <KpiCard title="Total Cost" value={summaryLoading ? null : totalCost} icon={<TrendingDown className="w-4 h-4 text-red-400" />} color="red" trend="down" />
          <KpiCard title="Gross Margin" value={summaryLoading ? null : grossMargin} subtitle={summaryLoading ? "" : `${marginPercent.toFixed(1)}% margin`} icon={<PiggyBank className="w-4 h-4 text-blue-400" />} color={grossMargin >= 0 ? "emerald" : "red"} trend={grossMargin >= 0 ? "up" : "down"} />
          <KpiCard title="Margin %" value={null} rawDisplay={summaryLoading ? null : `${marginPercent.toFixed(1)}%`} icon={<DollarSign className="w-4 h-4 text-violet-400" />} color={marginPercent >= 0 ? "emerald" : "red"} />
          <KpiCard title="Outstanding AR" value={summaryLoading ? null : outstandingAR} icon={<Receipt className="w-4 h-4 text-amber-400" />} color="amber" />
          <KpiCard title="Overdue Invoices" value={null} rawDisplay={summaryLoading ? null : String(overdueCount)} icon={<AlertTriangle className="w-4 h-4 text-red-400" />} color={overdueCount > 0 ? "red" : "emerald"} />
        </div>

        {/* Charts Row 1: Revenue vs Cost + AR Aging */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="py-2.5 px-4">
              <CardTitle className="text-xs font-semibold">Revenue vs Cost (Monthly)</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
                    <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} tickFormatter={(v: number) => formatCompactCurrency(v)} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value: number, name: string) => [formatCurrency(value), name]} />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} name="Revenue" />
                    <Bar dataKey="cost" fill="#ef4444" radius={[4, 4, 0, 0]} name="Cost" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">No monthly data available</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-2.5 px-4">
              <CardTitle className="text-xs font-semibold">AR Aging</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              {agingChartData.some(d => d.value > 0) ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={agingChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }} />
                    <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} tickFormatter={(v: number) => formatCompactCurrency(v)} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value: number) => [formatCurrency(value), "Outstanding"]} />
                    <Bar dataKey="value" name="Outstanding" radius={[4, 4, 0, 0]}>
                      {agingChartData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">No outstanding receivables</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Cash Flow / Margin Trend chart */}
        {trendData.length > 1 && (
          <Card>
            <CardHeader className="py-2.5 px-4">
              <CardTitle className="text-xs font-semibold">Cash Flow / Margin Trend</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} tickFormatter={(v: number) => formatCompactCurrency(v)} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value: number, name: string) => [formatCurrency(value), name]} />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Invoiced" />
                  <Line type="monotone" dataKey="margin" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Margin" />
                  <Line type="monotone" dataKey="cost" stroke="#ef4444" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="5 5" name="Cost" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Overdue Invoice Alerts */}
        {overdueInvoices.length > 0 && (
          <Card className="border-red-500/20">
            <CardHeader className="py-2.5 px-4 flex flex-row items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <CardTitle className="text-xs font-semibold text-red-400">Overdue Invoices ({overdueInvoices.length})</CardTitle>
              <Link href="/invoices" className="text-[10px] text-primary hover:underline ml-auto">View All</Link>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {overdueInvoices.slice(0, 6).map((inv: any) => {
                  const daysOverdue = inv.dueDate ? daysBetween(inv.dueDate) : 0;
                  const customerName = inv.customerName || inv.customer?.name || `Customer #${inv.customerId}`;
                  return (
                    <div key={inv.id} className="bg-red-500/5 border border-red-500/15 rounded-lg p-3 flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-foreground">{inv.invoiceNumber || `INV-${inv.id}`}</span>
                        <Badge variant="outline" className="text-[9px] px-1 py-0 border bg-red-500/15 text-red-400 border-red-500/20">{daysOverdue}d overdue</Badge>
                      </div>
                      <span className="text-[11px] text-muted-foreground">{customerName}</span>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-sm font-bold text-red-400">{formatCurrency(inv.total, inv.currency)}</span>
                        <span className="text-[10px] text-muted-foreground">Due: {formatDate(inv.dueDate)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {overdueInvoices.length > 6 && (
                <p className="text-[10px] text-muted-foreground mt-2 text-center">+ {overdueInvoices.length - 6} more overdue invoices</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Top Customers & Vendors Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="py-2.5 px-4">
              <CardTitle className="text-xs font-semibold">Top Customers by Revenue</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {customerTableData.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] px-3 py-1.5">Customer</TableHead>
                      <TableHead className="text-[10px] px-3 py-1.5 text-right w-28">Revenue</TableHead>
                      <TableHead className="text-[10px] px-3 py-1.5 text-right w-16">Invoices</TableHead>
                      <TableHead className="text-[10px] px-3 py-1.5 w-28" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customerTableData.map((c, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="px-3 py-1.5 text-xs font-medium truncate max-w-[150px]">{c.name}</TableCell>
                        <TableCell className="px-3 py-1.5 text-xs text-right tabular-nums">{formatCurrency(c.revenue)}</TableCell>
                        <TableCell className="px-3 py-1.5 text-xs text-right text-muted-foreground">{c.invoices}</TableCell>
                        <TableCell className="px-3 py-1.5">
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${c.barWidth}%` }} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="py-8 text-center text-xs text-muted-foreground">No customer data</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-2.5 px-4">
              <CardTitle className="text-xs font-semibold">Top Vendors by Cost</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {vendorTableData.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] px-3 py-1.5">Vendor</TableHead>
                      <TableHead className="text-[10px] px-3 py-1.5 text-right w-28">Cost</TableHead>
                      <TableHead className="text-[10px] px-3 py-1.5 text-right w-16">POs</TableHead>
                      <TableHead className="text-[10px] px-3 py-1.5 w-28" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendorTableData.map((v, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="px-3 py-1.5 text-xs font-medium truncate max-w-[150px]">{v.name}</TableCell>
                        <TableCell className="px-3 py-1.5 text-xs text-right tabular-nums">{formatCurrency(v.cost)}</TableCell>
                        <TableCell className="px-3 py-1.5 text-xs text-right text-muted-foreground">{v.pos}</TableCell>
                        <TableCell className="px-3 py-1.5">
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-red-500 rounded-full" style={{ width: `${v.barWidth}%` }} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="py-8 text-center text-xs text-muted-foreground">No vendor data</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Invoices + Outstanding POs */}
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
                    <TableHead className="text-[10px] px-3 py-1.5">Customer</TableHead>
                    <TableHead className="text-[10px] px-3 py-1.5">Date</TableHead>
                    <TableHead className="text-[10px] px-3 py-1.5 text-right">Amount</TableHead>
                    <TableHead className="text-[10px] px-3 py-1.5">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(recentInvoices?.data || []).map((inv: any) => {
                    const st = INVOICE_STATUS[inv.status] || { label: inv.status, className: "" };
                    const customerName = inv.customerName || inv.customer?.name || `#${inv.customerId}`;
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="px-3 py-1.5 text-xs font-medium">{inv.invoiceNumber || `INV-${inv.id}`}</TableCell>
                        <TableCell className="px-3 py-1.5 text-[10px] text-muted-foreground truncate max-w-[100px]">{customerName}</TableCell>
                        <TableCell className="px-3 py-1.5 text-[10px] text-muted-foreground">{formatDate(inv.invoiceDate)}</TableCell>
                        <TableCell className="px-3 py-1.5 text-xs text-right tabular-nums">{formatCurrency(inv.total, inv.currency)}</TableCell>
                        <TableCell className="px-3 py-1.5"><Badge variant="outline" className={`text-[9px] px-1 py-0 border ${st.className}`}>{st.label}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                  {(!recentInvoices?.data || recentInvoices.data.length === 0) && (
                    <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-4">No invoices yet</TableCell></TableRow>
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
                        <TableCell className="px-3 py-1.5 text-xs text-right tabular-nums">{formatCurrency(po.amount, po.currency)}</TableCell>
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

function KpiCard({ title, value, rawDisplay, subtitle, icon, color, trend }: {
  title: string;
  value: number | null;
  rawDisplay?: string | null;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
  trend?: "up" | "down";
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{title}</span>
          {icon}
        </div>
        {value === null && rawDisplay === undefined ? (
          <Skeleton className="h-6 w-24 mt-1" />
        ) : rawDisplay === null ? (
          <Skeleton className="h-6 w-24 mt-1" />
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <p className="text-lg font-bold text-foreground tabular-nums">
                {rawDisplay !== undefined ? rawDisplay : formatCompactCurrency(value!)}
              </p>
              {trend === "up" && <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />}
              {trend === "down" && <ArrowDownRight className="w-3.5 h-3.5 text-red-400" />}
            </div>
            {subtitle && <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
