import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell,
} from "recharts";
import {
  TrendingUp, TrendingDown,
  Receipt, PiggyBank, AlertTriangle, Calendar, Percent,
} from "lucide-react";
import { Link } from "wouter";

function formatCurrency(amount: number | string | null, currency: string = "EUR"): string {
  if (!amount && amount !== 0) return "\u2014";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "\u2014";
  const symbol = currency === "GBP" ? "\u00A3" : currency === "EUR" ? "\u20AC" : "$";
  return `${symbol}${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCompactCurrency(amount: number, currency: string = "EUR"): string {
  if (!amount && amount !== 0) return "\u2014";
  const symbol = currency === "GBP" ? "\u00A3" : currency === "EUR" ? "\u20AC" : "$";
  if (Math.abs(amount) >= 1000000) return `${symbol}${(amount / 1000000).toFixed(1)}M`;
  if (Math.abs(amount) >= 1000) return `${symbol}${(amount / 1000).toFixed(1)}k`;
  return `${symbol}${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: string | null): string {
  if (!d) return "\u2014";
  try {
    return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return d;
  }
}

function getDaysOverdue(dueDate: string): number {
  const due = new Date(dueDate);
  const now = new Date();
  return Math.max(0, Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
}

function getDatePreset(preset: string): { start: string; end: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  switch (preset) {
    case "this_month":
      return { start: `${year}-${String(month + 1).padStart(2, "0")}-01`, end: new Date(year, month + 1, 0).toISOString().split("T")[0] };
    case "last_month": {
      const d = new Date(year, month - 1, 1);
      return { start: d.toISOString().split("T")[0], end: new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split("T")[0] };
    }
    case "this_quarter": {
      const qs = Math.floor(month / 3) * 3;
      return { start: `${year}-${String(qs + 1).padStart(2, "0")}-01`, end: new Date(year, qs + 3, 0).toISOString().split("T")[0] };
    }
    case "ytd":
      return { start: `${year}-01-01`, end: now.toISOString().split("T")[0] };
    default:
      return { start: `${year}-01-01`, end: now.toISOString().split("T")[0] };
  }
}

const AGING_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#dc2626"];
const TOOLTIP_STYLE = { backgroundColor: "#1a1d27", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", fontSize: "12px" };

export default function FinancialDashboardPage() {
  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

  const [entityFilter, setEntityFilter] = useState("all");
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(endOfMonth);

  const entityParam = entityFilter !== "all" ? `&entityId=${entityFilter}` : "";
  const entityOnly = entityFilter !== "all" ? `entityId=${entityFilter}` : "";

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
    queryKey: [`/api/financial/ar-aging?${entityOnly}`],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/financial/ar-aging?${entityOnly}`);
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
    queryKey: [`/api/financial/monthly-trend?${entityOnly}`],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/financial/monthly-trend?${entityOnly}`);
      return r.json();
    },
  });

  const { data: overdueData } = useQuery({
    queryKey: [`/api/invoices?status=overdue${entityParam}`],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/invoices?status=overdue${entityParam}`);
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

  const entityList = Array.isArray(entitiesData) ? entitiesData : [];
  const overdueInvoices = overdueData?.data || [];

  const totalRevenue = parseFloat(summary?.totalRevenue) || 0;
  const totalCost = parseFloat(summary?.totalCost) || 0;
  const grossMargin = totalRevenue - totalCost;
  const marginPercent = totalRevenue > 0 ? (grossMargin / totalRevenue) * 100 : 0;
  const outstandingAR = parseFloat(summary?.outstandingAR) || 0;
  const overdueCount = summary?.invoicesOverdue ?? overdueInvoices.length;

  // Monthly trend chart data
  const trendData = useMemo(() => {
    if (!monthlyTrend) return [];
    if (Array.isArray(monthlyTrend)) {
      return monthlyTrend.map((m: any) => ({
        month: m.month,
        Revenue: parseFloat(m.revenue) || 0,
        Cost: parseFloat(m.cost) || 0,
      }));
    }
    const revenueMap = new Map<string, number>((monthlyTrend.revenue || []).map((r: any) => [r.month, parseFloat(r.total)]));
    const costMap = new Map<string, number>((monthlyTrend.cost || []).map((c: any) => [c.month, parseFloat(c.total)]));
    const allMonths = new Set([...revenueMap.keys(), ...costMap.keys()]);
    return Array.from(allMonths).sort().map(month => ({
      month,
      Revenue: revenueMap.get(month) || 0,
      Cost: costMap.get(month) || 0,
    }));
  }, [monthlyTrend]);

  // AR aging chart data
  const agingData = useMemo(() => {
    if (!aging) return [];
    if (Array.isArray(aging)) {
      return aging.map((b: any, idx: number) => ({
        bucket: b.bucket || b.name,
        amount: parseFloat(b.amount) || 0,
        fill: AGING_COLORS[idx] || AGING_COLORS[4],
      }));
    }
    return [
      { bucket: "Current", amount: parseFloat(String(aging.current)) || 0, fill: AGING_COLORS[0] },
      { bucket: "1-30 Days", amount: parseFloat(String(aging.days30)) || 0, fill: AGING_COLORS[1] },
      { bucket: "31-60 Days", amount: parseFloat(String(aging.days60)) || 0, fill: AGING_COLORS[2] },
      { bucket: "61-90 Days", amount: parseFloat(String(aging.days90)) || 0, fill: AGING_COLORS[3] },
      { bucket: "90+ Days", amount: parseFloat(String(aging.over90)) || 0, fill: AGING_COLORS[4] },
    ];
  }, [aging]);

  // Customer and vendor table data
  const customerTableData = useMemo(() => {
    if (!revenueByCustomer || !Array.isArray(revenueByCustomer)) return [];
    return revenueByCustomer.map((c: any) => ({
      name: c.customerName || `Customer #${c.customerId}`,
      revenue: parseFloat(String(c.totalRevenue || c.total)) || 0,
      invoices: parseInt(String(c.invoiceCount || 0), 10),
    }));
  }, [revenueByCustomer]);

  const vendorTableData = useMemo(() => {
    if (!costByVendor || !Array.isArray(costByVendor)) return [];
    return costByVendor.map((v: any) => ({
      name: v.vendorName || `Vendor #${v.vendorId}`,
      cost: parseFloat(String(v.totalCost || v.total)) || 0,
      pos: parseInt(String(v.poCount || 0), 10),
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
            <Button variant="outline" size="sm" className="h-7 text-[10px] px-2" onClick={() => applyPreset("this_month")}>This Month</Button>
            <Button variant="outline" size="sm" className="h-7 text-[10px] px-2" onClick={() => applyPreset("last_month")}>Last Month</Button>
            <Button variant="outline" size="sm" className="h-7 text-[10px] px-2" onClick={() => applyPreset("this_quarter")}>This Quarter</Button>
            <Button variant="outline" size="sm" className="h-7 text-[10px] px-2" onClick={() => applyPreset("ytd")}>YTD</Button>
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
          <KpiCard
            title="Total Revenue"
            value={summaryLoading ? null : totalRevenue}
            icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}
          />
          <KpiCard
            title="Total Cost"
            value={summaryLoading ? null : totalCost}
            icon={<TrendingDown className="w-4 h-4 text-red-400" />}
          />
          <KpiCard
            title="Gross Margin"
            value={summaryLoading ? null : grossMargin}
            icon={<PiggyBank className="w-4 h-4 text-blue-400" />}
          />
          <KpiCard
            title="Margin %"
            rawDisplay={summaryLoading ? null : `${marginPercent.toFixed(1)}%`}
            icon={<Percent className="w-4 h-4 text-indigo-400" />}
          />
          <KpiCard
            title="Outstanding AR"
            value={summaryLoading ? null : outstandingAR}
            icon={<Receipt className="w-4 h-4 text-amber-400" />}
          />
          <KpiCard
            title="Overdue Invoices"
            rawDisplay={summaryLoading ? null : String(overdueCount)}
            icon={<AlertTriangle className="w-4 h-4 text-red-400" />}
          />
        </div>

        {/* Charts Row: Revenue vs Cost + AR Aging */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="py-2.5 px-4">
              <CardTitle className="text-xs font-semibold">Revenue vs Cost (Monthly)</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
                    <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} tickFormatter={(v: number) => formatCompactCurrency(v)} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value: number, name: string) => [formatCurrency(value), name]} />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Bar dataKey="Revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Cost" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">No data available</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-2.5 px-4">
              <CardTitle className="text-xs font-semibold">AR Aging</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              {agingData.some(d => d.amount > 0) ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={agingData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="bucket" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }} />
                    <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} tickFormatter={(v: number) => formatCompactCurrency(v)} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value: number) => [formatCurrency(value), "Outstanding"]} />
                    <Bar dataKey="amount" name="Outstanding" radius={[4, 4, 0, 0]}>
                      {agingData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">No outstanding receivables</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tables Row: Customers + Vendors */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="py-2.5 px-4">
              <CardTitle className="text-xs font-semibold">Top 10 Customers by Revenue</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {customerTableData.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] px-3 py-1.5">Customer</TableHead>
                      <TableHead className="text-[10px] px-3 py-1.5 text-right">Revenue</TableHead>
                      <TableHead className="text-[10px] px-3 py-1.5 text-right">Invoices</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customerTableData.map((c) => (
                      <TableRow key={c.name}>
                        <TableCell className="px-3 py-1.5 text-xs font-medium truncate max-w-[180px]">{c.name}</TableCell>
                        <TableCell className="px-3 py-1.5 text-xs text-right tabular-nums">{formatCurrency(c.revenue)}</TableCell>
                        <TableCell className="px-3 py-1.5 text-xs text-right text-muted-foreground">{c.invoices}</TableCell>
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
              <CardTitle className="text-xs font-semibold">Top 10 Vendors by Cost</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {vendorTableData.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] px-3 py-1.5">Vendor</TableHead>
                      <TableHead className="text-[10px] px-3 py-1.5 text-right">Cost</TableHead>
                      <TableHead className="text-[10px] px-3 py-1.5 text-right">POs</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendorTableData.map((v) => (
                      <TableRow key={v.name}>
                        <TableCell className="px-3 py-1.5 text-xs font-medium truncate max-w-[180px]">{v.name}</TableCell>
                        <TableCell className="px-3 py-1.5 text-xs text-right tabular-nums">{formatCurrency(v.cost)}</TableCell>
                        <TableCell className="px-3 py-1.5 text-xs text-right text-muted-foreground">{v.pos}</TableCell>
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

        {/* Overdue Invoices Alert */}
        {overdueInvoices.length > 0 && (
          <Card className="border-red-500/30 bg-red-500/5">
            <CardHeader className="py-2.5 px-4 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <CardTitle className="text-xs font-semibold text-red-400">Overdue Invoices ({overdueInvoices.length})</CardTitle>
              </div>
              <Link href="/invoices" className="text-[10px] text-primary hover:underline">View All Invoices</Link>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] px-3 py-1.5">Customer</TableHead>
                    <TableHead className="text-[10px] px-3 py-1.5 text-right">Amount</TableHead>
                    <TableHead className="text-[10px] px-3 py-1.5">Due Date</TableHead>
                    <TableHead className="text-[10px] px-3 py-1.5 text-right">Days Overdue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overdueInvoices.map((inv: any) => (
                    <TableRow key={inv.id}>
                      <TableCell className="px-3 py-1.5 text-xs">{inv.customerName || inv.customer?.name || `Customer #${inv.customerId}`}</TableCell>
                      <TableCell className="px-3 py-1.5 text-xs text-right tabular-nums font-medium text-red-400">{formatCurrency(inv.total, inv.currency)}</TableCell>
                      <TableCell className="px-3 py-1.5 text-[10px] text-muted-foreground">{formatDate(inv.dueDate)}</TableCell>
                      <TableCell className="px-3 py-1.5 text-xs text-right tabular-nums text-red-400">{getDaysOverdue(inv.dueDate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function KpiCard({ title, value, rawDisplay, icon }: {
  title: string;
  value?: number | null;
  rawDisplay?: string | null;
  icon: React.ReactNode;
}) {
  const isLoading = (value === null && rawDisplay === undefined) || rawDisplay === null;
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{title}</span>
          {icon}
        </div>
        {isLoading ? (
          <Skeleton className="h-6 w-24 mt-1" />
        ) : (
          <p className="text-lg font-bold text-foreground tabular-nums">
            {rawDisplay !== undefined ? rawDisplay : formatCompactCurrency(value!)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
